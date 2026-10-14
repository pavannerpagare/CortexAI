 // Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "cortexai-eb1a0.firebaseapp.com",
  projectId: "cortexai-eb1a0",
  storageBucket: "cortexai-eb1a0.firebasestorage.app",
  messagingSenderId: "9469848786",
  appId: "1:9469848786:web:3805c4f8e89cb2d729d10b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()