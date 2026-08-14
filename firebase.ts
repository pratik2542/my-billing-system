import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } from "firebase/app-check";

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

// --- Firebase App Check Setup ---
const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if (typeof window !== 'undefined') {
  const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || 'FD76B0B8-22B2-4E57-9A1D-6F47970C8888';
  if (isLocalhost) {
    // @ts-ignore
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  try {
    if (isLocalhost) {
      initializeAppCheck(app, {
        provider: new CustomProvider({
          getToken: () => Promise.resolve({
            token: debugToken,
            expireTimeMillis: Date.now() + 24 * 3600 * 1000
          })
        }),
        isTokenAutoRefreshEnabled: true
      });
      console.log('App Check initialized on localhost with debug token:', debugToken);
    } else if (recaptchaSiteKey) {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true
      });
      console.log('App Check initialized with reCAPTCHA Enterprise');
    }
  } catch (e) {
    console.warn('App Check initialization warning:', e);
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