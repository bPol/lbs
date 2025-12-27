# GCP Deploy (GitHub Actions + GCS)

This app builds to static assets in `dist/`, so the cheapest simple hosting is a
Google Cloud Storage bucket with static website hosting.

## 1) Create a bucket

- Choose a globally unique bucket name (e.g. `your-app-prod`).
- Enable static website hosting (`index.html` for both index and 404).
- Make the bucket public or front it with Cloud CDN + HTTPS LB.

Minimum required API: `storage.googleapis.com`.

## 2) Create a deploy service account

Create a service account and grant it access to the bucket:

- Role: `Storage Admin` (bucket-level is fine), or a tighter custom role with
  `storage.objects.*` + `storage.buckets.update`.

## 3) Configure GitHub OIDC (recommended, no keys)

Create a Workload Identity Pool + Provider and bind it to the service account.
You can follow the official guide or use the example below (replace values):

```bash
PROJECT_ID="ledbysw"
PROJECT_NUMBER="355786818846"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
REPO="bPol/lbs"
SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
BUCKET="ledbysw-lbs-prod-355786818846"

gcloud auth login
gcloud config set project "${PROJECT_ID}"

gcloud storage buckets create "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --location="europe-west1" \
  --uniform-bucket-level-access

gcloud storage buckets update "gs://${BUCKET}" \
  --web-main-page-suffix="index.html" \
  --web-error-page="index.html"

gcloud iam workload-identity-pools create "${POOL_ID}" \
  --project="${PROJECT_ID}" --location="global"

gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" --location="global" \
  --workload-identity-pool="${POOL_ID}" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="attribute.repository=='${REPO}'"

gcloud iam service-accounts create "github-deployer" \
  --project="${PROJECT_ID}" \
  --display-name="GitHub Actions deployer"

gcloud iam service-accounts add-iam-policy-binding "${SA}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}"

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.admin"
```

Note: If you need to look up `PROJECT_NUMBER` later:

```bash
gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)"
```

## 4) Add GitHub repo secrets

Add these to your repo settings → Secrets and variables → Actions:

- `GCP_BUCKET` (bucket name only)
- `GCP_SERVICE_ACCOUNT` (service account email)
- `GCP_WORKLOAD_ID_PROVIDER` (full provider resource name)

Provider format:

```
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID
```

## 5) Deploy

Push to `main` to trigger `.github/workflows/gcp-deploy.yml`.

If you use a different default branch, update the workflow trigger.
