import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

// Firebase project configuration
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// --- Firebase App Check with reCAPTCHA Enterprise ---
// On localhost, enable debug mode so local dev doesn't need a real reCAPTCHA challenge.
// IMPORTANT: The debug token printed in the browser console must be registered in:
//   Firebase Console > App Check > Apps > ⋮ > Manage debug tokens
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // @ts-ignore — self.FIREBASE_APPCHECK_DEBUG_TOKEN enables debug mode on localhost
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true
    });
    console.log('App Check initialized with reCAPTCHA Enterprise');
  } catch (e) {
    console.warn('App Check initialization failed:', e);
  }
}

// Initialize Firestore with IndexedDB Persistent Local Cache & Multi-Tab Sync.
// This prevents expensive server read overloads on back-to-back page refreshes.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const auth = getAuth(app);