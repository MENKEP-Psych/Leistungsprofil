import React, { createContext, useContext, useState, useEffect } from 'react';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

interface FirebaseContextType {
  db: Firestore | null;
  auth: Auth | null;
  isFirebaseEnabled: boolean;
  isLoading: boolean;
}

const FirebaseContext = createContext<FirebaseContextType>({
  db: null,
  auth: null,
  isFirebaseEnabled: false,
  isLoading: true
});

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<FirebaseContextType>({
    db: null,
    auth: null,
    isFirebaseEnabled: false,
    isLoading: true
  });

  useEffect(() => {
    const initFirebase = async () => {
      try {
        const configPath = '../firebase-applet-config.json';
        // @ts-ignore
        const config = await import(/* @vite-ignore */ configPath);
        const firebaseConfig = config.default || config;

        if (firebaseConfig) {
          const app = initializeApp(firebaseConfig);
          const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
          const auth = getAuth(app);
          setState({ db, auth, isFirebaseEnabled: true, isLoading: false });
        } else {
          setState({ db: null, auth: null, isFirebaseEnabled: false, isLoading: false });
        }
      } catch (e) {
        console.warn('Firebase configuration not found. Using local mode.');
        setState({ db: null, auth: null, isFirebaseEnabled: false, isLoading: false });
      }
    };

    initFirebase();
  }, []);

  return (
    <FirebaseContext.Provider value={state}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext);
