import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithPopup as firebaseSignInWithPopup,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
} from "firebase/auth";

/*
 * Lurnova uses Firebase Authentication only.
 * Application data stays in the PostgreSQL backend.
 *
 * Firebase Web API keys are public identifiers. Authorization for application
 * data is enforced by the backend after it verifies the Firebase ID token.
 */
const firebaseConfig = {
  apiKey: "AIzaSyAUAl8zBcZTi_hC3JeGXcMoWXc3ew0A6Mc",
  authDomain: "lurnova-bd661.firebaseapp.com",
  projectId: "lurnova-bd661",
  storageBucket: "lurnova-bd661.firebasestorage.app",
  messagingSenderId: "952868719393",
  appId: "1:952868719393:web:5e329dbf2727e0aed94c60",
  measurementId: "G-779138ZCW5",
};

const app = initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);

setPersistence(firebaseAuth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase auth persistence setup failed:", error?.message || error);
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const onAuthStateChanged = firebaseOnAuthStateChanged;

export async function signInWithPopup(auth, provider) {
  return firebaseSignInWithPopup(auth, provider);
}

export async function signInWithEmailAndPassword(auth, email, password) {
  return firebaseSignInWithEmailAndPassword(auth, email, password);
}

export async function createUserWithEmailAndPassword(auth, email, password) {
  return firebaseCreateUserWithEmailAndPassword(auth, email, password);
}

export async function signOut(auth) {
  return firebaseSignOut(auth);
}

export async function updateProfile(user, data) {
  return firebaseUpdateProfile(user, data);
}

export async function sendPasswordResetEmail(auth, email) {
  return firebaseSendPasswordResetEmail(auth, email);
}

export { GoogleAuthProvider };
