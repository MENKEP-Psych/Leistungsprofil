import { TestResult } from '../types';

export interface SymbolCount {
  above: number;   // PR > 71.4
  average: number; // PR 28.6–71.4
  below: number;   // PR < 28.6
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
  if (pr > 71.4) return 'above';
  if (pr < 28.6) return 'below';
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
  lg:          ['lgI', 'lgII'],
  mosaik:      ['mosaik'],
  rey:         ['cft', 'cfm', 'cqm'],
  tol:         ['alterkorrigiert', 'alter_bildung'],
};

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

  let prValues: (number | string)[];
  if (allowedKeys) {
    prValues = allowedKeys
      .map(k => latest.percentileRanks[k])
      .filter((v): v is number | string => v !== undefined && v !== null && v !== '' && v !== 'n/a');
  } else {
    prValues = getPRValues(latest);
  }

  if (prValues.length === 0) return null;

  const counts: SymbolCount = { above: 0, average: 0, below: 0 };
  for (const prVal of prValues) {
    const n = prToNumber(prVal);
    if (n === null) continue;
    counts[classify(n)]++;
  }

  const total = counts.above + counts.average + counts.below;
  if (total === 0) return null;

  return counts;
}
