importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
)

firebase.initializeApp({
  apiKey: 'AIzaSyCCIsslSCpOwkHhvFfK41noNkplEcw0pfk',
  authDomain: 'ledbyswing.firebaseapp.com',
  projectId: 'ledbyswing',
  storageBucket: 'ledbyswing.firebasestorage.app',
  messagingSenderId: '68542676788',
  appId: '1:68542676788:web:a3f793148639c8f006ef61',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'LedBySwing'
  const options = {
    body: payload?.notification?.body || 'New update available.',
    icon: '/favicon.svg',
  }
  self.registration.showNotification(title, options)
})
