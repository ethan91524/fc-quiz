// Firebase Console > Project settings > Your apps > Web app.
// Keep all Firebase-specific values here; the quiz works locally while placeholders remain.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const firebaseEnabled = !Object.values(firebaseConfig).some(value => value.startsWith("YOUR_"));
