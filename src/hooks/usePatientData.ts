import { useState, useEffect, useRef, useCallback } from 'react';
import { Patient, TestResult } from '../types';
import { calculateAge } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useAuditLog } from './useAuditLog';
import {
  fetchPatient,
  dbCreatePatient,
  dbUpdatePatient,
  dbDischargePatient,
  dbUndoDischarge,
  dbSaveResult,
  dbUpdateResult,
  dbDeleteResult,
  dbSaveNote,
  isElectron,
} from '../lib/db-api';

const TEST_NAMES: Record<string, string> = {
  tmt:         'Trail Making Test (TMT)',
  vlmt:        'VLMT',
  tol:         'Turm von London (TOL)',
  tap:         'TAP',
  neglect_gf:  'Neglect / Gesichtsfeld',
  wms_vw:      'WMS-IV Vis. Wiedergabe',
  custom:      'Eigener Test',
  zzt:         'Zahlen-Zeige-Test (ZZT)',
  mosaik:      'Mosaik-Test',
  rey:         'Rey-Osterrieth-Figur',
  zahlenspanne:'Zahlenspanne',
  lg:          'Logisches Gedächtnis',
};

const FIELD_LABELS: Record<string, string> = {
  name:             'Name',
  geburtsdatum:     'Geburtsdatum',
  geschlecht:       'Geschlecht',
  bildungsjahre:    'Bildungsjahre',
  neuropsychologin: 'Neuropsychologin',
  aufnahmedatum:    'Aufnahmedatum',
  entlassdatum:     'Entlassdatum',
  nextSessionNote:    'Notiz nächste Sitzung',
  nextSessionTestIds: 'Geplante Tests',
};

function fmtDate(iso: string): string {
  if (!iso) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function usePatientData(id: string | null) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [previousResults, setPreviousResults] = useState<TestResult[]>([]);
  const [generalNote, setGeneralNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const { encryptionKey, currentUser } = useAuth();
  const { addEntry } = useAuditLog();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!id || !encryptionKey) return;
    const data = await fetchPatient(id, encryptionKey);
    if (data) {
      const sorted = [...data.results].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setPatient({
        ...data.patient,
        age: calculateAge(data.patient.geburtsdatum, sorted[0]?.date),
      });
      setPreviousResults(data.results);
      setGeneralNote(data.note);
    }
    setIsLoading(false);
  }, [id, encryptionKey]);

  useEffect(() => {
    if (!id || !encryptionKey) {
      if (!id) {
        setPatient(null);
        setPreviousResults([]);
        setGeneralNote('');
        setIsLoading(false);
      }
      return;
    }

    load();

    if (isElectron()) {
      pollRef.current = setInterval(load, 30_000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [id, encryptionKey, load]);

  function buildResultDetails(result: TestResult): string {
    let testName = TEST_NAMES[result.testId] ?? result.testId;
    if (result.testId === 'custom' && result.rawValues.testName) {
      testName = `Eigener Test: ${result.rawValues.testName}`;
    }

    const lines: string[] = [];

    // Header line: test name · date · examiner
    const headerParts = [testName, fmtDate(result.date)];
    if (result.examiner) headerParts.push(`Untersucher: ${result.examiner}`);
    lines.push(headerParts.join(' · '));

    // Raw values (skip internal encoding fields)
    const skipKeys = new Set(['rows', 'testName']);
    const rvEntries = Object.entries(result.rawValues)
      .filter(([k, v]) => !skipKeys.has(k) && v !== '' && v !== null && v !== undefined);
    if (rvEntries.length > 0) {
      lines.push('Rohwerte: ' + rvEntries.map(([k, v]) => `${k} = ${v}`).join(', '));
    }

    // Custom test rows
    if (result.testId === 'custom' && result.rawValues.rows) {
      try {
        const rows = JSON.parse(String(result.rawValues.rows)) as Array<{label: string; value: string; pr: string}>;
        const rowStrs = rows
          .filter(r => r.label || r.value)
          .map(r => {
            const parts = [r.label];
            if (r.value) parts.push(`Wert: ${r.value}`);
            if (r.pr) parts.push(`PR: ${r.pr}`);
            return parts.join(' → ');
          });
        if (rowStrs.length > 0) lines.push('Ergebnisse: ' + rowStrs.join(' | '));
      } catch { /* ignore */ }
    }

    // Percentile ranks
    const prEntries = Object.entries(result.percentileRanks)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (prEntries.length > 0) {
      lines.push('Prozentränge: ' + prEntries.map(([k, v]) => `PR(${k}) = ${v}`).join(', '));
    }

    if (result.note) lines.push(`Notiz: ${result.note}`);

    return lines.join('\n');
  }

  // Wird ein Test gespeichert, der für die nächste Sitzung markiert war, gilt er
  // jetzt als erledigt — die Markierung soll dann standardmäßig wieder verschwinden.
  const unmarkNextSessionTest = async (testId: string) => {
    if (patient?.nextSessionTestIds?.includes(testId)) {
      await updatePatient({ nextSessionTestIds: patient.nextSessionTestIds.filter(t => t !== testId) });
    }
  };

  const saveScore = async (result: TestResult): Promise<boolean> => {
    if (!patient || !id || !encryptionKey) return false;

    const ok = await dbSaveResult(id, result, encryptionKey, currentUser ?? null);
    if (ok) {
      setPreviousResults(prev => [result, ...prev]);
      await addEntry('TEST_SAVED', patient.name, buildResultDetails(result));
      await unmarkNextSessionTest(result.testId);
    }
    return ok;
  };

  const saveGeneralNote = async (note: string): Promise<boolean> => {
    if (!patient || !id || !encryptionKey) return false;
    setGeneralNote(note);
    const ok = await dbSaveNote(id, note, encryptionKey);
    return ok;
  };

  const createPatient = async (newPatient: Patient): Promise<boolean> => {
    if (!encryptionKey) return false;

    const ok = await dbCreatePatient(newPatient, encryptionKey, currentUser ?? null);
    if (ok) {
      await addEntry('PATIENT_CREATED', newPatient.name);
    }
    return ok;
  };

  const updatePatient = async (
    updates: Partial<Pick<Patient, 'name' | 'geburtsdatum' | 'geschlecht' | 'bildungsjahre' | 'neuropsychologin' | 'aufnahmedatum' | 'entlassdatum' | 'diagnose' | 'lokalisation' | 'nextSessionNote' | 'nextSessionTestIds'>>
  ): Promise<boolean> => {
    if (!patient || !id || !encryptionKey) return false;

    const ok = await dbUpdatePatient(id, updates, encryptionKey);
    if (ok) {
      const base = { ...patient, ...updates };
      // Recalculate age when geburtsdatum changes
      const updatedPatient: Patient = {
        ...base,
        age: calculateAge(base.geburtsdatum, previousResults[0]?.date),
      };
      setPatient(updatedPatient);
      // Notify PatientList to refresh its data (for filter/neuropsychologin updates)
      window.dispatchEvent(new Event('patients_updated'));
      const fmtValue = (v: unknown): string => {
        if (Array.isArray(v)) return v.join(', ');
        if (v && typeof v === 'object') {
          return Object.entries(v as Record<string, string>).map(([dk, dv]) => `${dk}: ${dv}`).join(' | ');
        }
        return String(v);
      };
      const fieldDetails = Object.entries(updates)
        .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${fmtValue(v)}`)
        .join(', ');
      await addEntry('PATIENT_UPDATED', updatedPatient.name, fieldDetails);
    }
    return ok;
  };

  const dischargePatient = async (): Promise<boolean> => {
    if (!patient || !id || !encryptionKey) return false;

    const ok = await dbDischargePatient(id);
    if (ok) {
      setPatient(prev => (prev ? { ...prev, status: 'entlassen' } : null));
      await addEntry('PATIENT_DISCHARGED', patient.name);
    }
    return ok;
  };

  const undoDischarge = async (): Promise<boolean> => {
    if (!patient || !id || !encryptionKey) return false;

    const ok = await dbUndoDischarge(id);
    if (ok) {
      setPatient(prev => (prev ? { ...prev, status: 'aktiv' } : null));
      await addEntry('PATIENT_UPDATED', patient.name, 'Entlassung rückgängig gemacht → aktiv');
    }
    return ok;
  };

  const updateResult = async (result: TestResult): Promise<boolean> => {
    if (!patient || !id || !encryptionKey) return false;

    const ok = await dbUpdateResult(id, result, encryptionKey);
    if (ok) {
      setPreviousResults(prev => prev.map(r => r.id === result.id ? result : r));
      await addEntry('TEST_UPDATED', patient.name, buildResultDetails(result));
      await unmarkNextSessionTest(result.testId);
    }
    return ok;
  };

  const deleteResult = async (resultId: string): Promise<boolean> => {
    if (!patient || !id || !encryptionKey) return false;

    const target = previousResults.find(r => r.id === resultId);
    const ok = await dbDeleteResult(id, resultId);
    if (ok) {
      setPreviousResults(prev => prev.filter(r => r.id !== resultId));
      await addEntry(
        'RESULT_DELETED',
        patient.name,
        target ? buildResultDetails(target) : `ID: ${resultId}`
      );
    }
    return ok;
  };

  return {
    patient,
    previousResults,
    generalNote,
    isLoading,
    reload: load,
    saveScore,
    saveGeneralNote,
    createPatient,
    updatePatient,
    updateResult,
    deleteResult,
    dischargePatient,
    undoDischarge,
  };
}
