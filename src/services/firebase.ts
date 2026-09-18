import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseConfig = {
  projectId: firebaseConfigJson.projectId,
  appId: firebaseConfigJson.appId,
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp, (firebaseConfigJson as any).firestoreDatabaseId || '(default)');
export const googleProvider = new GoogleAuthProvider();

// Request Google Spreadsheets & Drive scopes for seamless sheet and drive folder access
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/**
 * Creates a configured GoogleAuthProvider.
 * If loginHint is provided, uses login_hint and avoids repetitive prompt/consent screens.
 */
export function createGoogleProvider(loginHint?: string): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  provider.addScope('https://www.googleapis.com/auth/drive.readonly');
  
  if (loginHint) {
    // Smart login_hint: bypass account picker and avoid repeated consent screens
    provider.setCustomParameters({
      login_hint: loginHint
    });
  } else {
    provider.setCustomParameters({
      prompt: 'select_account'
    });
  }
  return provider;
}

export { signInWithPopup, signOut, onAuthStateChanged };
export type { User };
