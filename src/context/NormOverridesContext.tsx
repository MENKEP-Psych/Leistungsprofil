import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, type Firestore } from 'firebase/firestore';
import { useFirebase } from './FirebaseContext';
import { isElectron, dbSyncGetNormsStore, dbSyncSetNormsStore } from '../lib/db-api';
import {
  NormOverrides,
  NormAssignments,
  NormsConfigData,
  setNormOverrideRegistry,
} from '../lib/normOverrides';

type VerificationStatus = 'unverified' | 'verified' | 'incorrect';
type VerificationEntry = { status: VerificationStatus; date: string; verifiedBy?: string };
type VerificationStore = Record<string, VerificationEntry>;

const FIRESTORE_COLLECTION = 'normsConfig';
const FIRESTORE_DOC = 'main';
const LS_KEY = 'normen_config_v2';
const LS_KEY_V1 = 'normen_verifikation_v1';

function emptyConfig(): NormsConfigData {
  return { version: 2, verification: {}, overrides: {}, assignments: {} };
}

function migrateFromRaw(raw: string): NormsConfigData {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 2) return parsed as NormsConfigData;
    // Old format: direct VerificationStore
    return { version: 2, verification: parsed as VerificationStore, overrides: {}, assignments: {} };
  } catch {
    return emptyConfig();
  }
}

// ── Context type ──────────────────────────────────────────────────────────────

interface NormOverridesContextType {
  overrides: NormOverrides;
  assignments: NormAssignments;
  verificationStore: VerificationStore;
  saveOverride: (key: string, newValue: string | number, originalValue: string | number | null, changedBy: string) => Promise<void>;
  removeOverride: (key: string) => Promise<void>;
  setAssignment: (testId: string, employee: string) => Promise<void>;
  saveVerification: (testId: string, status: VerificationStatus, verifiedBy: string) => Promise<void>;
  resetVerification: (testId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const NormOverridesContext = createContext<NormOverridesContextType>({
  overrides: {},
  assignments: {},
  verificationStore: {},
  saveOverride: async () => {},
  removeOverride: async () => {},
  setAssignment: async () => {},
  saveVerification: async () => {},
  resetVerification: async () => {},
  reload: async () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export const NormOverridesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { db, isFirebaseEnabled } = useFirebase();
  const [data, setData] = useState<NormsConfigData>(emptyConfig);
  const dbRef = useRef<Firestore | null>(null);
  dbRef.current = db;

  // Keep singleton registry in sync with context data
  useEffect(() => {
    setNormOverrideRegistry(data.overrides);
  }, [data.overrides]);

  // ── Persist helper ─────────────────────────────────────────────────────────

  const persist = useCallback(async (updated: NormsConfigData) => {
    // Optimistic local update
    setData(updated);
    setNormOverrideRegistry(updated.overrides);

    const json = JSON.stringify(updated);
    // Wird die dauerhafte Speicherung nicht bestätigt, ist die Änderung nur in
    // dieser Sitzung sichtbar und geht beim nächsten Start verloren. Früher wurde
    // ein Fehler stillschweigend verschluckt (Korrekturen „verschwanden" am
    // Folgetag); jetzt wird der/die Nutzer:in gewarnt.
    const warnNotSaved = (detail?: string) => {
      alert(
        'Die Norm-Korrektur konnte nicht dauerhaft gespeichert werden' +
        (detail ? `:\n${detail}` : '.') +
        '\n\nDie Änderung ist nur in dieser Sitzung sichtbar und geht beim nächsten ' +
        'Start verloren. Bitte die Server-Verbindung prüfen und erneut speichern.',
      );
    };

    if (isElectron()) {
      const res = await dbSyncSetNormsStore(json).catch(
        (e): { success: boolean; error?: string } => ({ success: false, error: e instanceof Error ? e.message : String(e) }),
      );
      if (!res || !res.success) warnNotSaved(res?.error);
    } else if (isFirebaseEnabled && dbRef.current) {
      try {
        await setDoc(doc(dbRef.current, FIRESTORE_COLLECTION, FIRESTORE_DOC), updated);
      } catch (e) {
        warnNotSaved(e instanceof Error ? e.message : String(e));
      }
    } else {
      localStorage.setItem(LS_KEY, json);
    }
  }, [isFirebaseEnabled]);

  // ── Load + real-time subscription ──────────────────────────────────────────

  useEffect(() => {
    if (isFirebaseEnabled && db) {
      // Firestore: real-time onSnapshot — all users see changes immediately
      const ref = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC);
      const unsub = onSnapshot(ref, snap => {
        if (snap.exists()) {
          const raw = snap.data() as NormsConfigData;
          const migrated: NormsConfigData = raw.version === 2
            ? raw
            : { version: 2, verification: raw as unknown as VerificationStore, overrides: {}, assignments: {} };
          setData(migrated);
          setNormOverrideRegistry(migrated.overrides);
        }
      }, () => { /* ignore permission errors — fall back to cached state */ });
      return unsub;
    } else if (isElectron()) {
      dbSyncGetNormsStore().then(raw => {
        if (!raw) return;
        const migrated = migrateFromRaw(raw);
        setData(migrated);
        setNormOverrideRegistry(migrated.overrides);
      }).catch(() => {});
    } else {
      const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LS_KEY_V1) ?? '';
      if (raw) {
        const migrated = migrateFromRaw(raw);
        setData(migrated);
        setNormOverrideRegistry(migrated.overrides);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirebaseEnabled, db]);

  // ── Mutators ───────────────────────────────────────────────────────────────

  const saveOverride = useCallback(async (
    key: string,
    newValue: string | number,
    originalValue: string | number | null,
    changedBy: string,
  ) => {
    // Preserve the original old-value across subsequent edits
    const existingOldValue = data.overrides[key]?.oldValue ?? originalValue ?? '';
    await persist({
      ...data,
      overrides: {
        ...data.overrides,
        [key]: { value: newValue, oldValue: existingOldValue, changedBy, changedAt: new Date().toISOString() },
      },
    });
  }, [data, persist]);

  const removeOverride = useCallback(async (key: string) => {
    const next = { ...data.overrides };
    delete next[key];
    await persist({ ...data, overrides: next });
  }, [data, persist]);

  const setAssignment = useCallback(async (testId: string, employee: string) => {
    const next = { ...data.assignments };
    if (employee.trim()) next[testId] = employee.trim();
    else delete next[testId];
    await persist({ ...data, assignments: next });
  }, [data, persist]);

  const saveVerification = useCallback(async (testId: string, status: VerificationStatus, verifiedBy: string) => {
    await persist({
      ...data,
      verification: {
        ...data.verification,
        [testId]: { status, date: new Date().toISOString(), verifiedBy },
      },
    });
  }, [data, persist]);

  const resetVerification = useCallback(async (testId: string) => {
    const next = { ...data.verification };
    delete next[testId];
    await persist({ ...data, verification: next });
  }, [data, persist]);

  const reload = useCallback(async () => {
    if (isElectron()) {
      const raw = await dbSyncGetNormsStore().catch(() => null);
      if (!raw) return;
      const migrated = migrateFromRaw(raw);
      setData(migrated);
      setNormOverrideRegistry(migrated.overrides);
    }
    // Firestore: onSnapshot is always live — no manual reload needed
    // localStorage: no server to reload from
  }, []);

  return (
    <NormOverridesContext.Provider value={{
      overrides: data.overrides,
      assignments: data.assignments,
      verificationStore: data.verification,
      saveOverride,
      removeOverride,
      setAssignment,
      saveVerification,
      resetVerification,
      reload,
    }}>
      {children}
    </NormOverridesContext.Provider>
  );
};

export const useNormOverrides = () => useContext(NormOverridesContext);
