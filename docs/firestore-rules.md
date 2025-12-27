# Firestore rules

The UI shows "profile storage is blocked by Firestore rules" when the
Firestore security rules do not allow the authenticated user to create their
profile document. The rules below match the current app behavior:

- Public read of approved reviews from `reviews_submitted`.
- Authenticated users can create their own profile, submit reviews, and submit clubs.
- Relationship link requests are readable and updatable only by the linked users.
- Event RSVPs are readable by the RSVP guest and the host email tied to the RSVP.
- Verification requests are readable by the user and admin; only admin can approve/reject.
- Admin can read pending reviews and club submissions, and approve/reject them.

## Use these rules

Copy `firestore.rules` into the Firebase Console (Firestore Database → Rules),
or deploy it with the Firebase CLI (`firebase deploy --only firestore:rules`).

If you change the admin email in the app, update it in `firestore.rules` too.

## Indexes

Deploy `firestore.indexes.json` to support composite queries used by relationship
links and event RSVPs:

```bash
firebase deploy --only firestore:indexes
```
