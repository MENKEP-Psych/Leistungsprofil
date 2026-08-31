import { Patient, TestResult } from '../types';
import { anonymizePatient, anonymizeResult } from './anonymize';
import { getAppInfo, AppInfo } from './appInfo';
import { normFileFingerprints } from './normFingerprint';
import { ageAtDate, recomputeResultPRs, isRecalcSupported } from './recalculateNorms';
import { aggregateNormData, aggregateByExactAge, getTapNormData, NormStat, NormByAge } from './tapNormDb';
import type { NormOverrides, NormAssignments } from './normOverrides';

// ── Fehlerbericht-Bundle ─────────────────────────────────────────────────────
//
// Baut aus einem ECHTEN Patienten + seinen ECHTEN Testergebnissen die per Mail
// verschickbare Fehlerbericht-Datei. Alles Identifizierende wird über
// lib/anonymize.ts entfernt; die Diagnostik-Blöcke (PR-Nachrechnung) werden
// VOR der Anonymisierung aus den echten Daten abgeleitet, sodass nur bereits
// aggregierte/abgeleitete Werte (Alter zum Testzeitpunkt, Prozentränge) in die
// Ausgabe wandern — nie das Geburtsdatum selbst.

export interface NormsConfigSnapshot {
  overrides: NormOverrides;
  assignments: NormAssignments;
  verification: Record<string, unknown>;
}

export interface Fehlerbeschreibung {
  erwartetesVerhalten: string;
  tatsaechlichesVerhalten: string;
  ort: string;
  patientAngelegt: string;
}

export interface PrKennwertDiff {
  gespeichert: number | string | null;
  neuBerechnet: number | string | null;
  stimmtUeberein: boolean;
}

export interface PrNachrechnung {
  resultId: string;
  testId: string;
  date: string;
  ageAtTest: number | null;
  normInfo?: string;
  abweichung: boolean;
  werte: Record<string, PrKennwertDiff>;
}

export interface BugReportBundle {
  hinweis: string;
  erstelltAm: string;
  app: AppInfo;
  fehlerbeschreibung: Fehlerbeschreibung;
  patient: Patient;
  results: TestResult[];
  prNachrechnung: PrNachrechnung[];
  normDaten: {
    dateiFingerprints: Record<string, string>;
    overrides: NormOverrides;
    verifizierung: Record<string, unknown>;
    zustaendigkeiten: NormAssignments;
  };
  tapNormSammlung: {
    eintraege: number;
    proTest: NormStat[];
    proTestUndAlter: NormByAge[];
  };
}

const HINWEIS =
  'Diese Datei wurde automatisch anonymisiert (Name, Geburtsdatum, Diagnose, '
  + 'Mitarbeiter, Lokalisation sowie alle Freitext-Notizen der Tests wurden entfernt bzw. '
  + 'durch Platzhalter ersetzt) und kann gefahrlos per E-Mail verschickt werden. '
  + 'Ausnahmen: In „normDaten.overrides" / „normDaten.verifizierung" bleiben die '
  + 'Kürzel der Mitarbeiter:innen erhalten, die eine Norm-Korrektur bzw. -Prüfung '
  + 'vorgenommen haben (kein Patientendatum, nötig für Rückfragen). Der Block '
  + '„prNachrechnung" enthält nur das aus dem echten Geburtsdatum abgeleitete Alter '
  + 'zum Testzeitpunkt, nicht das Geburtsdatum selbst.';

/** Vergleicht die gespeicherten Prozentränge eines Ergebnisses mit einer frischen
 *  Neuberechnung aus den Rohwerten. */
function prDiffForResult(result: TestResult, patient: Patient): PrNachrechnung | null {
  if (result.aborted || !isRecalcSupported(result.testId)) return null;

  const age = ageAtDate(patient.geburtsdatum, result.date);
  const patch = recomputeResultPRs(result, age, patient.bildungsjahre);
  const stored = (result.percentileRanks ?? {}) as Record<string, number | string>;
  const recomputed = (patch?.percentileRanks ?? {}) as Record<string, number | string>;

  const keys = Array.from(new Set([...Object.keys(stored), ...Object.keys(recomputed)]));
  if (keys.length === 0) return null;

  const werte: Record<string, PrKennwertDiff> = {};
  let abweichung = false;
  for (const k of keys) {
    const g = stored[k] ?? null;
    const n = recomputed[k] ?? null;
    const stimmtUeberein = String(g ?? '') === String(n ?? '');
    if (!stimmtUeberein) abweichung = true;
    werte[k] = { gespeichert: g, neuBerechnet: n, stimmtUeberein };
  }

  return {
    resultId: result.id,
    testId: result.testId,
    date: result.date,
    ageAtTest: age,
    normInfo: result.normInfo || undefined,
    abweichung,
    werte,
  };
}

export function buildBugReportBundle(
  patient: Patient,
  results: TestResult[],
  fehlerbeschreibung: Fehlerbeschreibung,
  normsConfig: NormsConfigSnapshot,
): BugReportBundle {
  // Diagnostik aus den ECHTEN Daten ableiten, bevor anonymisiert wird.
  const prNachrechnung = results
    .map(r => prDiffForResult(r, patient))
    .filter((x): x is PrNachrechnung => x !== null);

  return {
    hinweis: HINWEIS,
    erstelltAm: new Date().toISOString(),
    app: getAppInfo(),
    fehlerbeschreibung,
    patient: anonymizePatient(patient),
    results: results.map(anonymizeResult),
    prNachrechnung,
    normDaten: {
      dateiFingerprints: normFileFingerprints(),
      overrides: normsConfig.overrides,
      verifizierung: normsConfig.verification,
      zustaendigkeiten: normsConfig.assignments,
    },
    tapNormSammlung: {
      eintraege: getTapNormData().length,
      proTest: aggregateNormData(),
      proTestUndAlter: aggregateByExactAge(),
    },
  };
}
