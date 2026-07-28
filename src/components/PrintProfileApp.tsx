import React, { useEffect, useState } from 'react';
import { Patient, TestResult } from '../types';
import { fetchPatient, dbGetEncryptionKey, printReady } from '../lib/db-api';
import { useProfileData } from '../hooks/useProfileData';
import { PrintProfile } from './PrintProfile';

// Inner component: only mounts once data is loaded, so useProfileData (a hook)
// is always called unconditionally. Signals the main process once layout +
// fonts have settled, which is the cue to run webContents.printToPDF.
const PrintReady: React.FC<{ patient: Patient; results: TestResult[] }> = ({ patient, results }) => {
  const { profileData, textResults, extraBottomContent } = useProfileData(patient, results);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await document.fonts.ready; } catch { /* ignore */ }
      // Two animation frames let the chart layout settle before capture.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!cancelled) printReady();
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <PrintProfile
      patient={patient}
      profileData={profileData}
      textResults={textResults}
      extraBottomContent={extraBottomContent}
    />
  );
};

/**
 * Standalone root rendered in the hidden print BrowserWindow (URL `?print=1`).
 * Bypasses login and app chrome: it fetches the patient directly via the
 * unconditional db IPC, forces the light theme, and renders the print layout.
 */
export const PrintProfileApp: React.FC<{ patientId: string }> = ({ patientId }) => {
  const [data, setData] = useState<{ patient: Patient; results: TestResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Force the light theme for the PDF regardless of the app's current theme.
    document.documentElement.classList.remove('dark');
    let cancelled = false;
    (async () => {
      try {
        const key = await dbGetEncryptionKey();
        const res = await fetchPatient(patientId, key);
        if (!res) throw new Error('Patient nicht gefunden');
        if (!cancelled) setData({ patient: res.patient, results: res.results });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        // Unblock the waiting main process even when loading fails.
        printReady();
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  if (error) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#b91c1c' }}>PDF-Export fehlgeschlagen: {error}</div>;
  }
  if (!data) return null;

  return <PrintReady patient={data.patient} results={data.results} />;
};
