import { fetchAllPatientsForExport, dbUpdateResult } from './db-api';
import { calculateVLMTPR } from './vlmt';
import { calculateROCFTPR } from './rocft';
import { computeWMSAll } from './wmsUtils';
import { lookupTMTPR } from './tmtUtils';
import {
  lookupMosaik,
  lookupZahlenspanne,
  lookupBlockspanne,
  lookupLGPR,
  lookupLGWiedererkennung,
  lookupZZT,
} from './normUtils';
import { lookupTolAlterPR, lookupTolAlterBildungPR } from './tolUtils';
import type { TestResult } from '../types';

function ageAtDate(geburtsdatum: string, testDate: string): number | null {
  if (!geburtsdatum || !testDate) return null;
  const birth = new Date(geburtsdatum);
  const test  = new Date(testDate);
  if (isNaN(birth.getTime()) || isNaN(test.getTime())) return null;
  let age = test.getFullYear() - birth.getFullYear();
  const m = test.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && test.getDate() < birth.getDate())) age--;
  return age;
}

export type RecalcProgress = { total: number; done: number; currentPatient: string };
export type RecalcResult   = { updated: number; skipped: number; errors: string[] };

// ── Per-test recalculation helpers ───────────────────────────────────────────

function recalcVLMT(result: TestResult, age: number): Partial<TestResult> | null {
  const r = result.rawValues;
  if ([r.Dg1, r.Dg2, r.Dg3, r.Dg4, r.Dg5, r.Dg6, r.Dg7, r.I, r.W, r.W_F].some(v => v == null)) return null;
  const { prs, calculated, normInfo } = calculateVLMTPR(age, {
    Dg1: Number(r.Dg1), Dg2: Number(r.Dg2), Dg3: Number(r.Dg3),
    Dg4: Number(r.Dg4), Dg5: Number(r.Dg5), Dg6: Number(r.Dg6),
    Dg7: Number(r.Dg7), I: Number(r.I), W: Number(r.W), W_F: Number(r.W_F),
  });
  return { percentileRanks: prs, calculatedValues: calculated, normInfo };
}

function recalcTMT(result: TestResult, age: number): Partial<TestResult> | null {
  const r = result.rawValues;
  const prs: Record<string, number | string> = {};
  if (r.A != null) prs.A = lookupTMTPR(age, Number(r.A), 'A');
  if (r.B != null) prs.B = lookupTMTPR(age, Number(r.B), 'B');
  if (Object.keys(prs).length === 0) return null;
  const calc = { ...result.calculatedValues };
  if (r.A != null && r.B != null) calc.BminusA = Number(r.B) - Number(r.A);
  return { percentileRanks: prs, calculatedValues: calc };
}

function recalcMosaik(result: TestResult, age: number): Partial<TestResult> | null {
  const rohwert = result.rawValues.rohwert;
  if (rohwert == null) return null;
  const norm = lookupMosaik(Number(rohwert), age);
  if (!norm) return null;
  return { percentileRanks: { mosaik: norm.pr }, calculatedValues: { awp: norm.awp } };
}

function recalcZahlenspanne(result: TestResult, age: number): Partial<TestResult> | null {
  const r = result.rawValues;
  const prs: Record<string, number | string> = {};
  if (r.vorwaerts != null) {
    const pr = lookupZahlenspanne(Number(r.vorwaerts), age, 'vorwaerts');
    if (pr != null) prs.vorwaerts = pr;
  }
  if (r.rueckwaerts != null) {
    const pr = lookupZahlenspanne(Number(r.rueckwaerts), age, 'rueckwaerts');
    if (pr != null) prs.rueckwaerts = pr;
  }
  if (Object.keys(prs).length === 0) return null;
  return { percentileRanks: prs };
}

function recalcBlockspanne(result: TestResult, age: number): Partial<TestResult> | null {
  const r = result.rawValues;
  const prs: Record<string, number | string> = {};
  if (r.vorwaerts != null) {
    const pr = lookupBlockspanne(Number(r.vorwaerts), age, 'vorwaerts');
    if (pr != null) prs.vorwaerts = pr;
  }
  if (r.rueckwaerts != null) {
    const pr = lookupBlockspanne(Number(r.rueckwaerts), age, 'rueckwaerts');
    if (pr != null) prs.rueckwaerts = pr;
  }
  if (Object.keys(prs).length === 0) return null;
  return { percentileRanks: prs };
}

function recalcLG(result: TestResult, age: number): Partial<TestResult> | null {
  const r = result.rawValues;
  const prs: Record<string, number | string> = {};
  if (r.lgI != null) {
    const pr = lookupLGPR(Number(r.lgI), age, 'lgI');
    if (pr != null) prs.lgI = pr;
  }
  if (r.lgII != null) {
    const pr = lookupLGPR(Number(r.lgII), age, 'lgII');
    if (pr != null) prs.lgII = pr;
  }
  if (r.wiedererk != null) {
    const pr = lookupLGWiedererkennung(Number(r.wiedererk), age);
    if (pr != null) prs.wiedererk = pr;
  }
  if (Object.keys(prs).length === 0) return null;
  return { percentileRanks: prs };
}

function recalcROCFT(result: TestResult, age: number): Partial<TestResult> | null {
  const r = result.rawValues;
  if (r.cft == null && r.cfm == null && r.cqm == null) return null;
  const { prs, normInfo } = calculateROCFTPR(age, {
    cft: r.cft != null ? Number(r.cft) : null,
    cfm: r.cfm != null ? Number(r.cfm) : null,
    cqm: r.cqm != null ? Number(r.cqm) : null,
  });
  if (Object.keys(prs).length === 0) return null;
  return { percentileRanks: prs as Record<string, number | string>, normInfo };
}

function recalcWMS(result: TestResult, age: number): Partial<TestResult> | null {
  const r = result.rawValues;
  if (r.sofortig == null && r.verzoegert == null && r.wiedererkennen == null) return null;
  const c = computeWMSAll(
    r.sofortig != null ? String(r.sofortig) : '',
    r.verzoegert != null ? String(r.verzoegert) : '',
    r.wiedererkennen != null ? String(r.wiedererkennen) : '',
    age,
  );
  const prs: Record<string, number | string> = {};
  const calc: Record<string, number> = {};
  if (r.sofortig != null && c.sofortig_pr !== null) {
    if (c.sofortig_wp !== null) calc.sofortig_wp = c.sofortig_wp;
    prs.sofortiger_abruf = c.sofortig_pr;
  }
  if (r.verzoegert != null && c.verzoegert_pr !== null) {
    if (c.verzoegert_wp !== null) calc.verzoegert_wp = c.verzoegert_wp;
    prs.verzoegerter_abruf = c.verzoegert_pr;
  }
  if (r.wiedererkennen != null && c.wiedererkennen_pr !== null) {
    prs.wiedererkennen = c.wiedererkennen_pr;
  }
  if (Object.keys(prs).length === 0) return null;
  return { percentileRanks: prs, calculatedValues: calc };
}

function recalcZZT(result: TestResult): Partial<TestResult> | null {
  const times = Array.from({ length: 10 }, (_, i) => {
    const v = result.rawValues[`d${i + 1}`];
    return v != null ? Number(v) : null;
  });
  if (times.every(t => t === null)) return null;
  const norm = lookupZZT(times);
  if (!norm) return null;
  return { percentileRanks: { zzt: norm.pr }, calculatedValues: { wp: norm.wp } };
}

function recalcTOL(result: TestResult, age: number, bildungsjahre?: number): Partial<TestResult> | null {
  const rohwert = result.rawValues.rohwert;
  if (rohwert == null) return null;
  const rw = Number(rohwert);
  const prs: Record<string, number | string> = {};
  prs.alterkorrigiert = lookupTolAlterPR(rw, age);
  if (bildungsjahre != null) prs.alter_bildung = lookupTolAlterBildungPR(rw, age, bildungsjahre);
  return { percentileRanks: prs };
}

const RECALC_SUPPORTED = new Set(['vlmt', 'tmt', 'mosaik', 'zahlenspanne', 'blockspanne', 'lg', 'tol', 'rey', 'wms_vw', 'zzt']);

// ── Main export ───────────────────────────────────────────────────────────────

export async function recalculateAllResults(
  encryptionKey: string,
  onProgress?: (p: RecalcProgress) => void,
): Promise<RecalcResult> {
  const allPatients = await fetchAllPatientsForExport(encryptionKey);
  const totalResults = allPatients.reduce((sum, p) => sum + p.results.length, 0);

  let done = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { patient, results } of allPatients) {
    for (const result of results) {
      onProgress?.({ total: totalResults, done, currentPatient: patient.name });
      done++;

      if (result.aborted || !RECALC_SUPPORTED.has(result.testId)) {
        skipped++;
        continue;
      }

      const age = ageAtDate(patient.geburtsdatum, result.date);
      if (age === null) { skipped++; continue; }

      let patch: Partial<TestResult> | null = null;
      try {
        switch (result.testId) {
          case 'vlmt':         patch = recalcVLMT(result, age); break;
          case 'tmt':          patch = recalcTMT(result, age); break;
          case 'mosaik':       patch = recalcMosaik(result, age); break;
          case 'zahlenspanne': patch = recalcZahlenspanne(result, age); break;
          case 'blockspanne':  patch = recalcBlockspanne(result, age); break;
          case 'lg':           patch = recalcLG(result, age); break;
          case 'tol':          patch = recalcTOL(result, age, patient.bildungsjahre); break;
          case 'rey':          patch = recalcROCFT(result, age); break;
          case 'wms_vw':       patch = recalcWMS(result, age); break;
          case 'zzt':          patch = recalcZZT(result); break;
        }
      } catch (err) {
        errors.push(`${patient.name} / ${result.testId} / ${result.date}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      if (!patch) { skipped++; continue; }

      try {
        await dbUpdateResult(patient.id, { ...result, ...patch }, encryptionKey);
        updated++;
      } catch (err) {
        errors.push(`DB-Fehler: ${patient.name} / ${result.testId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { updated, skipped, errors };
}
