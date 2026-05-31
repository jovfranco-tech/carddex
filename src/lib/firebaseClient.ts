import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = () => Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

// Safe mock for local demo if Firebase is not fully configured yet
const safeMock = {
  auth: {
    currentUser: null,
    onAuthStateChanged: (callback: any) => {
      // Simulate no authenticated user in local demo mode
      callback(null);
      return () => {};
    },
    signInWithEmailAndPassword: async () => {
      throw new Error('Firebase no está configurado. Completa tus variables VITE_FIREBASE_* en .env.local para usar autenticación real.');
    },
    createUserWithEmailAndPassword: async () => {
      throw new Error('Firebase no está configurado. Completa tus variables VITE_FIREBASE_* en .env.local para usar autenticación real.');
    },
    signOut: async () => {},
    updateProfile: async () => {},
  },
  db: {} as any
};

const app = isFirebaseConfigured() ? initializeApp(firebaseConfig) : null;
export const auth = (app ? getAuth(app) : safeMock.auth) as any;
export const db = (app ? getFirestore(app) : safeMock.db) as any;
