import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useFirebase } from '../context/FirebaseContext';
import {
  Textbaustein,
  loadLibrary, saveLibrary, getKnownUsers,
} from '../lib/textbaustein';

const LIBRARY_COLLECTION = 'textbausteineLibrary';
const WRITE_DEBOUNCE_MS = 2000;

/**
 * Syncs the current user's block library between localStorage and Firestore.
 * Also listens to all other users' libraries so the user-selector in BefundTab
 * can show colleagues' blocks without needing the Electron shared-file store.
 *
 * Falls back to localStorage-only when Firebase is disabled.
 */
export function useLibrarySync(username: string) {
  const { db, isFirebaseEnabled } = useFirebase();

  const [library, setLibraryState] = useState<Textbaustein[]>(() => loadLibrary(username));
  const [knownUsers, setKnownUsers] = useState<string[]>(() => getKnownUsers());

  const libraryRef = useRef(library);
  libraryRef.current = library;

  const hasPendingWriteRef = useRef(false);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Push own library to Firestore
  const pushToFirestore = useCallback(async () => {
    if (!isFirebaseEnabled || !db) return;
    await setDoc(doc(db, LIBRARY_COLLECTION, username), {
      blocks: libraryRef.current,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    hasPendingWriteRef.current = false;
  }, [username, isFirebaseEnabled, db]);

  const schedulePush = useCallback(() => {
    hasPendingWriteRef.current = true;
    clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(pushToFirestore, WRITE_DEBOUNCE_MS);
  }, [pushToFirestore]);

  // Listen to all users' libraries in real time
  useEffect(() => {
    if (!isFirebaseEnabled || !db) return;

    const unsub = onSnapshot(
      collection(db, LIBRARY_COLLECTION),
      snapshot => {
        const users: string[] = [];
        snapshot.forEach(docSnap => {
          const user = docSnap.id;
          users.push(user);
          const data = docSnap.data() as { blocks?: Textbaustein[] };
          if (Array.isArray(data.blocks) && data.blocks.length > 0) {
            saveLibrary(user, data.blocks);
            if (user === username && !hasPendingWriteRef.current) {
              // Remote update for own library (e.g. from another device/tab)
              setLibraryState(data.blocks);
            }
          }
        });
        if (users.length > 0) setKnownUsers(prev => {
          const merged = [...new Set([...prev, ...users])];
          return merged.length === prev.length && merged.every((u, i) => u === prev[i])
            ? prev
            : merged;
        });
      },
      () => { /* ignore permission/network errors */ },
    );

    return () => {
      clearTimeout(writeTimerRef.current);
      unsub();
    };
  }, [username, isFirebaseEnabled, db]);

  // Ensure own entry exists in Firestore on mount
  useEffect(() => {
    if (!isFirebaseEnabled || !db) return;
    setDoc(doc(db, LIBRARY_COLLECTION, username), {
      blocks: libraryRef.current,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirebaseEnabled, db, username]);

  const setLibrary = useCallback((updater: Textbaustein[] | ((prev: Textbaustein[]) => Textbaustein[])) => {
    const next = typeof updater === 'function' ? updater(libraryRef.current) : updater;
    libraryRef.current = next;
    setLibraryState(next);
    saveLibrary(username, next);
    schedulePush();
  }, [username, schedulePush]);

  return { library, setLibrary, knownUsers, setKnownUsers };
}
