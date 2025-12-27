# Firestore rules

The UI shows "profile storage is blocked by Firestore rules" when the
Firestore security rules do not allow the authenticated user to create their
profile document. The rules below match the current app behavior:

- Public read of approved reviews.
- Authenticated users can create their own profile and submit reviews (pending).
- Admin can read pending reviews and approve/reject them.

## Use these rules

Copy `firestore.rules` into the Firebase Console (Firestore Database → Rules),
or deploy it with the Firebase CLI (`firebase deploy --only firestore:rules`).

If you change the admin email in the app, update it in `firestore.rules` too.
