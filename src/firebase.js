import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
 apiKey: "AIzaSyABhNGhWPbB5GBhMgz0Ji4BAGjjaGAc49o",
 authDomain: "days-winter-challenge.firebaseapp.com",
 projectId: "days-winter-challenge",
 storageBucket: "days-winter-challenge.firebasestorage.app",
 messagingSenderId: "45272553531",
 appId: "1:45272553531:web:ca1872efb03b7506ab241e"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);