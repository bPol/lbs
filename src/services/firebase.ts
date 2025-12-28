import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, type Auth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCCIsslSCpOwkHhvFfK41noNkplEcw0pfk',
  authDomain: 'ledbyswing.firebaseapp.com',
  projectId: 'ledbyswing',
  storageBucket: 'ledbyswing.firebasestorage.app',
  messagingSenderId: '68542676788',
  appId: '1:68542676788:web:a3f793148639c8f006ef61',
}

const isFirebaseConfigured = () =>
  !Object.values(firebaseConfig).some((value) => value.startsWith('YOUR_'))

const initFirebase = (): {
  app: FirebaseApp
  auth: Auth
  provider: GoogleAuthProvider
  firestore: ReturnType<typeof getFirestore>
} => {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const provider = new GoogleAuthProvider()
  const firestore = getFirestore(app)
  return { app, auth, provider, firestore }
}

export { firebaseConfig, initFirebase, isFirebaseConfigured }
