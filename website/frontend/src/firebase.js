import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Prefer env-based configuration so deployments don't require code edits.
// For Create React App, define these in website/frontend/.env as REACT_APP_*
// Example keys to add in .env:
// REACT_APP_FIREBASE_API_KEY=...
// REACT_APP_FIREBASE_AUTH_DOMAIN=...
// REACT_APP_FIREBASE_PROJECT_ID=...
// REACT_APP_FIREBASE_STORAGE_BUCKET=...
// REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
// REACT_APP_FIREBASE_APP_ID=...

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyCiDlWkYlCgfYJYsQVMNPrLwLmFUaUUaf0",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "ewde-23aa4.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "ewde-23aa4",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "ewde-23aa4.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "453306204148",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:453306204148:web:3e5c9069ab3d31fdbcc3a1",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
