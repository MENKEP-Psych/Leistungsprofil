import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useFirebase } from '../context/FirebaseContext';
import {
  BefundReport, VerlaufsEintrag,
  loadReport, saveReport, loadVerlauf, saveVerlauf,
} from '../lib/textbaustein';

const BEFUND_COLLECTION = 'befundData';
const WRITE_DEBOUNCE_MS = 1500;

/**
 * Syncs a patient's Befundbericht and Verlaufseinträge between
 * localStorage (immediate) and Firestore (debounced, when Firebase is enabled).
 *
 * Backward-compatible: if the Firestore doc doesn't exist yet, local data is
 * migrated on first access. If Firebase is disabled, falls back to localStorage only.
 */
export function useBefundSync(
  patientId: string,
  onLocalReportSave?: () => void,
  onLocalVerlaufSave?: () => void,
) {
  const { db, isFirebaseEnabled } = useFirebase();

  const [report, setReportState] = useState<BefundReport>(() => loadReport(patientId));
  const [verlaufEntries, setVerlaufState] = useState<VerlaufsEintrag[]>(() => loadVerlauf(patientId));

  // Always-current refs so async callbacks don't close over stale state
  const reportRef = useRef(report);
  reportRef.current = report;
  const verlaufRef = useRef(verlaufEntries);
  verlaufRef.current = verlaufEntries;

  // Debounce: skip incoming Firestore snapshots while a local write is in flight
  const hasPendingWriteRef = useRef(false);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset local state when patient changes (e.g. navigating between patients)
  useEffect(() => {
    hasPendingWriteRef.current = false;
    clearTimeout(writeTimerRef.current);
    setReportState(loadReport(patientId));
    setVerlaufState(loadVerlauf(patientId));
  }, [patientId]);

  // Push both report and verlauf to Firestore in one document write
  const pushToFirestore = useCallback(async () => {
    if (!isFirebaseEnabled || !db) return;
    await setDoc(doc(db, BEFUND_COLLECTION, patientId), {
      report: reportRef.current,
      verlauf: verlaufRef.current,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    hasPendingWriteRef.current = false;
  }, [patientId, isFirebaseEnabled, db]);

  const schedulePush = useCallback(() => {
    hasPendingWriteRef.current = true;
    clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(pushToFirestore, WRITE_DEBOUNCE_MS);
  }, [pushToFirestore]);

  // Firestore real-time subscription
  useEffect(() => {
    if (!isFirebaseEnabled || !db) return;

    const ref = doc(db, BEFUND_COLLECTION, patientId);
    const unsub = onSnapshot(
      ref,
      snap => {
        // Local write in flight — we have newer data, ignore this snapshot
        if (hasPendingWriteRef.current) return;

        if (!snap.exists()) {
          // Doc doesn't exist yet — push local data to bootstrap the new record
          const localReport = loadReport(patientId);
          const localVerlauf = loadVerlauf(patientId);
          const hasData =
            localReport.finalText ||
            localReport.items.length > 0 ||
            localVerlauf.length > 0;
          if (hasData) {
            setDoc(ref, {
              report: localReport,
              verlauf: localVerlauf,
              updatedAt: new Date().toISOString(),
            }).catch(() => {});
          }
          return;
        }

        const data = snap.data() as { report?: Partial<BefundReport>; verlauf?: Partial<VerlaufsEintrag>[] };
        // Normalize incoming Firestore data the same way loadReport() does for
        // localStorage. Firestore strips `undefined` fields on write, so a doc
        // saved by an older version may be missing `finalText`/`items`. Without
        // this guard the BefundTab render crashes (report.finalText.trim()) and
        // white-screens for that patient.
        if (data.report) {
          const r: BefundReport = {
            items:     Array.isArray(data.report.items) ? data.report.items : [],
            sections:  Array.isArray(data.report.sections) ? data.report.sections : [],
            finalText: typeof data.report.finalText === 'string' ? data.report.finalText : '',
          };
          setReportState(r);
          saveReport(patientId, r);
        }
        if (data.verlauf) {
          const v: VerlaufsEintrag[] = (Array.isArray(data.verlauf) ? data.verlauf : []).map(e => ({
            id:        e?.id ?? crypto.randomUUID(),
            date:      typeof e?.date === 'string' ? e.date : '',
            items:     Array.isArray(e?.items) ? e.items : [],
            finalText: typeof e?.finalText === 'string' ? e.finalText : '',
            createdAt: typeof e?.createdAt === 'number' ? e.createdAt : 0,
          }));
          setVerlaufState(v);
          saveVerlauf(patientId, v);
        }
      },
      () => {
        // Ignore permission / network errors — UI already shows localStorage data
      },
    );

    return () => {
      clearTimeout(writeTimerRef.current);
      unsub();
    };
  }, [patientId, isFirebaseEnabled, db]);

  const setReport = useCallback(
    (updater: BefundReport | ((prev: BefundReport) => BefundReport)) => {
      const next = typeof updater === 'function' ? updater(reportRef.current) : updater;
      reportRef.current = next;
      setReportState(next);
      saveReport(patientId, next);
      schedulePush();
      onLocalReportSave?.();
    },
    [patientId, schedulePush, onLocalReportSave],
  );

  const setVerlaufEntries = useCallback(
    (updater: VerlaufsEintrag[] | ((prev: VerlaufsEintrag[]) => VerlaufsEintrag[])) => {
      const next = typeof updater === 'function' ? updater(verlaufRef.current) : updater;
      verlaufRef.current = next;
      setVerlaufState(next);
      saveVerlauf(patientId, next);
      schedulePush();
      onLocalVerlaufSave?.();
    },
    [patientId, schedulePush, onLocalVerlaufSave],
  );

  return { report, setReport, verlaufEntries, setVerlaufEntries };
}
