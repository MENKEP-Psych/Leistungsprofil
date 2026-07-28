import { TestResult } from '../types';

export interface SymbolCount {
  above: number;   // PR > 84.13
  average: number; // PR 15.87–84.13
  below: number;   // PR < 15.87
}

// Parse a PR value (number or string like "<5", ">95", "15-35") to a number for classification
function prToNumber(pr: number | string): number | null {
  if (typeof pr === 'number') return pr;
  const s = String(pr).trim();
  if (!s || s === 'n/a') return null;

  // ">N" boundary
  const gtMatch = s.match(/^>\s*(\d+(?:\.\d+)?)/);
  if (gtMatch) return parseFloat(gtMatch[1]);

  // "<N" boundary
  const ltMatch = s.match(/^<\s*(\d+(?:\.\d+)?)/);
  if (ltMatch) return parseFloat(ltMatch[1]);

  // "A-B" or "A–B" range → midpoint
  const rangeMatch = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const a = parseFloat(rangeMatch[1]);
    const b = parseFloat(rangeMatch[2]);
    return (a + b) / 2;
  }

  // "A->B" range (VLMT flat-zone)
  const arrowMatch = s.match(/^(\d+(?:\.\d+)?)->\d+/);
  if (arrowMatch) return parseFloat(arrowMatch[1]);

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function classify(pr: number): 'above' | 'average' | 'below' {
  if (pr > 84.13) return 'above';
  if (pr < 15.87) return 'below';
  return 'average';
}

// Extract all PR values from a test result (all keys in percentileRanks)
function getPRValues(result: TestResult): (number | string)[] {
  return Object.values(result.percentileRanks).filter(
    v => v !== undefined && v !== null && v !== '' && v !== 'n/a'
  ) as (number | string)[];
}

// Maps testId → which percentileRanks keys to use (undefined = use all keys)
const PR_KEY_MAP: Record<string, string[] | undefined> = {
  tmt:         ['A', 'B'],
  vlmt:        undefined, // all keys
  tap:         undefined,
  zzt:         ['zzt'],
  wms_vw:      ['sofortiger_abruf', 'verzoegerter_abruf', 'wiedererkennen'],
  zahlenspanne:['vorwaerts', 'rueckwaerts'],
  blockspanne: ['vorwaerts', 'rueckwaerts'],
  lg:          ['lgI', 'lgII'],
  mosaik:      ['mosaik'],
  rey:         ['cft', 'cfm', 'cqm'],
  lps:         ['s1_2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14'],
  tol:         ['alterkorrigiert', 'alter_bildung'],
};

// TAP-M uses PR < 31 as "below" threshold (vs standard PR < 15.87)
const TAP_M_ALWAYS_KEYS = new Set(['alertnessM', 'alM_sd_pr']);
const TAP_M_VERSION_GROUPS: { verField: string; keys: Set<string> }[] = [
  { verField: 'gn_ver',  keys: new Set(['gonogo', 'gn_sd_pr', 'gn_fehler_pr', 'gn_ausl_pr']) },
  { verField: 'fl_ver',  keys: new Set(['flexibilitaet', 'fl_sd_pr', 'fl_fehler_pr']) },
  { verField: 'ga_ver',  keys: new Set(['geteilte', 'geteilteVisuell', 'ga_sd_pr', 'gv_sd_pr', 'g_fehler_pr', 'g_ausl_ges_pr']) },
  { verField: 've_ver',  keys: new Set(['ve_rt_krit_pr', 've_sd_krit_pr', 've_rt_nkrit_pr', 've_sd_nkrit_pr', 've_fehler_pr', 've_ausl_krit_pr', 've_zeilen_r_pr', 've_spalten_r_pr']) },
];

function buildTapMKeys(rawValues: Record<string, unknown>): Set<string> {
  const keys = new Set(TAP_M_ALWAYS_KEYS);
  for (const { verField, keys: vKeys } of TAP_M_VERSION_GROUPS) {
    if (rawValues[verField] === 'M') {
      for (const k of vKeys) keys.add(k);
    }
  }
  return keys;
}

/**
 * For a given testId and all patient results, return counts of
 * above-average / average / below-average PR values from the latest result.
 * Returns null if no results exist for this test.
 */
export function getTestSymbolCounts(testId: string, results: TestResult[]): SymbolCount | null {
  const testResults = results
    .filter(r => r.testId === testId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (testResults.length === 0) return null;

  const latest = testResults[0];
  const allowedKeys = PR_KEY_MAP[testId];

  const counts: SymbolCount = { above: 0, average: 0, below: 0 };

  if (testId === 'tap') {
    const tapMKeys = buildTapMKeys((latest.rawValues ?? {}) as Record<string, unknown>);
    for (const [k, v] of Object.entries(latest.percentileRanks)) {
      if (v === undefined || v === null || v === '' || v === 'n/a') continue;
      const n = prToNumber(v as number | string);
      if (n === null) continue;
      const threshold = tapMKeys.has(k) ? 31 : 15.87;
      if (n > 84.13) counts.above++;
      else if (n < threshold) counts.below++;
      else counts.average++;
    }
  } else {
    let prValues: (number | string)[];
    if (allowedKeys) {
      prValues = allowedKeys
        .map(k => latest.percentileRanks[k])
        .filter((v): v is number | string => v !== undefined && v !== null && v !== '' && v !== 'n/a');
    } else {
      prValues = getPRValues(latest);
    }
    for (const prVal of prValues) {
      const n = prToNumber(prVal);
      if (n === null) continue;
      counts[classify(n)]++;
    }
  }

  const total = counts.above + counts.average + counts.below;
  if (total === 0) return null;

  return counts;
}
