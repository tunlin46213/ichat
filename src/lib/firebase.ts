import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

// Web app config from the Firebase console. These values are public by design;
// access is controlled by Firestore Security Rules (see firestore.rules).
const firebaseConfig = {
  apiKey: 'AIzaSyDgfPZ7Ll-LGB9cTmZ09J1J6_oR6FunvQo',
  authDomain: 'ichat-2a37f.firebaseapp.com',
  projectId: 'ichat-2a37f',
  storageBucket: 'ichat-2a37f.firebasestorage.app',
  messagingSenderId: '320528648839',
  appId: '1:320528648839:web:f1e2a060451808d96b8622',
};

const isFirstInit = getApps().length === 0;
export const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();

function createAuth(): firebaseAuth.Auth {
  // Fast Refresh re-runs this module; initializeAuth throws if called twice.
  if (!isFirstInit || Platform.OS === 'web') {
    return firebaseAuth.getAuth(app);
  }
  // getReactNativePersistence only exists in Firebase's React Native build,
  // which Metro picks on iOS/Android. It keeps the user logged in across app restarts.
  const { getReactNativePersistence } = firebaseAuth as unknown as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => firebaseAuth.Persistence;
  };
  return firebaseAuth.initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export const auth = createAuth();
export const db = getFirestore(app);
