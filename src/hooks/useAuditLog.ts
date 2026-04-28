import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuditEntry } from '../types';
import { dbAddAuditEntry, dbGetAuditLog } from '../lib/db-api';

export function useAuditLog() {
  const { currentUser } = useAuth();

  const addEntry = useCallback(async (
    action: AuditEntry['action'],
    patientName?: string,
    details?: string
  ): Promise<void> => {
    if (!currentUser) return;
    await dbAddAuditEntry(action, currentUser, patientName, details);
  }, [currentUser]);

  const getEntries = useCallback(async (): Promise<AuditEntry[]> => {
    return dbGetAuditLog();
  }, []);

  return { addEntry, getEntries };
}
