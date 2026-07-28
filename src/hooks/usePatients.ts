import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchPatients, isElectron } from '../lib/db-api';

export interface PatientListItem {
  id: string;
  name: string;
  geburtsdatum: string;
  geschlecht: 'm' | 'w' | 'd';
  status: 'aktiv' | 'entlassen';
  mitarbeiter: string[];
  neuropsychologin?: string;
  entlassdatum?: string;
  updatedAt: { seconds: number } | null;
}

export function usePatients() {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { encryptionKey } = useAuth();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    if (!encryptionKey) return;
    const list = await fetchPatients(encryptionKey);
    setPatients(list);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!encryptionKey) return;
    load();

    // Always listen for in-process updates (e.g. patient edit)
    window.addEventListener('patients_updated', load);
    if (isElectron()) {
      // Also poll every 30s to pick up changes from other users on the same DB
      pollRef.current = setInterval(load, 30_000);
      return () => {
        window.removeEventListener('patients_updated', load);
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    return () => window.removeEventListener('patients_updated', load);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encryptionKey]);

  return { patients, isLoading, reload: load };
}
