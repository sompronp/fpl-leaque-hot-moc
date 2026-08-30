import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAUx6io81JRSITEpHGE4kzIZG8YnHg0oWE",
  authDomain: "fpl-leaque.firebaseapp.com",
  projectId: "fpl-leaque",
  storageBucket: "fpl-leaque.firebasestorage.app",
  messagingSenderId: "613687050715",
  appId: "1:613687050715:web:bd0e85472af9285ef727fe",
  measurementId: "G-FJJS24C9N9",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ต้องตรงกับ Region ที่ Deploy Function
export const functions = getFunctions(app, "asia-southeast1");