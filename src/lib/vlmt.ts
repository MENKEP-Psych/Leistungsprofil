import vlmtNormen from '../data/vlmt_normen.json';
import { makeNormKey, getOverriddenPR } from './normOverrides';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NormRow = Record<string, any>;
type NormCell = string | number | null;
type Direction = 'high' | 'low';

/**
 * Parse a norm cell value to a numeric threshold for comparison.
 *
 * dir='high': use the lower bound of ranges
 *   → find the highest PR row where norm_value ≤ raw_score
 * dir='low':  use the upper bound of ranges
 *   → find the highest PR row where norm_value ≥ raw_score
 */
function cellToNum(cell: NormCell, dir: Direction): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return cell;
  const s = cell.trim();

  // Range: "X–Y" with en-dash (U+2013); also handles negative ranges like "-3–-4"
  let dashIdx = s.indexOf('\u2013');
  if (dashIdx < 0) dashIdx = s.indexOf('-', s.startsWith('-') ? 1 : 0);
  if (dashIdx > 0) {
    const a = parseFloat(s.slice(0, dashIdx));
    const b = parseFloat(s.slice(dashIdx + 1));
    if (!isNaN(a) && !isNaN(b)) {
      return dir === 'high' ? Math.min(a, b) : Math.max(a, b);
    }
  }

  // Prefix ">X" or "<X" – strip prefix, return the numeric boundary
  if (s.startsWith('>') || s.startsWith('<')) {
    const v = parseFloat(s.slice(1));
    return isNaN(v) ? null : v;
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Look up the PR for a given raw score in the norm table for one column.
 *
 * Returns a numeric PR, a range string like "15-35" or "80->95",
 * '<5', '>95', or 'n/a' (no norms).
 *
 * A range is returned when the raw score sits at a "flat zone" in the norm
 * table — i.e. multiple consecutive PR rows share the same threshold value.
 * The range spans from the lowest to the highest such PR.
 */
function lookupPR(
  rawScore: number,
  column: string,
  normen: NormRow[],
  dir: Direction
): number | string {
  // Check if any valid (non-boundary) norms exist for this column
  const hasValidNorms = normen.some(
    r =>
      r.pr !== '<5' &&
      r.pr !== '>95' &&
      r[column] !== null &&
      r[column] !== undefined
  );
  if (!hasValidNorms) return 'n/a';

  const regular = normen
    .filter(r => typeof r.pr === 'number')
    .sort((a, b) => (b.pr as number) - (a.pr as number)); // descending

  let resultPR: number | '>95' | null = null;
  let resultThreshold: number | null = null;
  let topRowIsPlainNumber = false; // true when >95 cell is a plain number, not ">X"

  // ── Check ">95" boundary row first ──────────────────────────────────────
  const topRow = normen.find(r => r.pr === '>95');
  if (topRow) {
    const cell: NormCell = topRow[column];
    if (cell !== null && cell !== undefined) {
      const s = typeof cell === 'number' ? String(cell) : String(cell).trim();
      if (dir === 'high') {
        if (s.startsWith('>')) {
          const v = parseFloat(s.slice(1));
          if (!isNaN(v) && rawScore > v) {
            resultPR = '>95';
            resultThreshold = v;
          }
        } else {
          const v = cellToNum(cell, 'high');
          if (v !== null && rawScore >= v) {
            resultPR = '>95';
            resultThreshold = v;
            topRowIsPlainNumber = true;
          }
        }
      } else {
        if (s.startsWith('<')) {
          const v = parseFloat(s.slice(1));
          if (!isNaN(v) && rawScore < v) {
            resultPR = '>95';
            resultThreshold = v;
          }
        } else {
          const v = cellToNum(cell, 'low');
          if (v !== null && rawScore <= v) {
            resultPR = '>95';
            resultThreshold = v;
            topRowIsPlainNumber = true;
          }
        }
      }
    }
  }

  // ── Regular rows: highest PR first ──────────────────────────────────────
  if (resultPR === null) {
    for (const row of regular) {
      const cell: NormCell = row[column];
      if (cell === null || cell === undefined) continue;
      const threshold = cellToNum(cell, dir);
      if (threshold === null) continue;
      if (dir === 'high' && rawScore >= threshold) {
        resultPR = row.pr as number;
        resultThreshold = threshold;
        break;
      }
      if (dir === 'low' && rawScore <= threshold) {
        resultPR = row.pr as number;
        resultThreshold = threshold;
        break;
      }
    }
  }

  // ── Fallback: below the 5th percentile ───────────────────────────────────
  if (resultPR === null) return '<5';
  if (resultThreshold === null) return resultPR;

  // ── Find the flat zone: lowest regular PR sharing the same threshold ─────
  // This reveals the full "Spanne" when multiple PR rows have equal norm values.
  const regularAsc = [...regular].sort((a, b) => (a.pr as number) - (b.pr as number));
  let minPR: number | null = null;
  for (const row of regularAsc) {
    const cell: NormCell = row[column];
    if (cell === null || cell === undefined) continue;
    const threshold = cellToNum(cell, dir);
    if (threshold === resultThreshold) {
      minPR = row.pr as number;
      break;
    }
  }

  if (resultPR === '>95') {
    // Only produce a range when the >95 cell was a plain number (e.g. Dg5=15),
    // meaning regular rows can share that exact threshold value.
    // When it is ">X" (e.g. Dg1=">11"), the score genuinely exceeds all norms
    // and ">95" is unambiguous — no range needed.
    if (topRowIsPlainNumber && minPR !== null) {
      return `${minPR}->95`;
    }
    return '>95';
  }

  if (minPR !== null && minPR !== resultPR) {
    return `${minPR}-${resultPR}`;
  }
  return resultPR;
}

// Columns by direction
const HIGHER_COLS = ['Dg1', 'Dg5', 'sumDg1_5', 'Dg6', 'Dg7', 'I', 'W', 'W_F'] as const;
const LOWER_COLS  = ['Dg5_Dg6', 'Dg5_Dg7'] as const;

// ── Exports for norm verification ─────────────────────────────────────────────

/** All VLMT age groups with metadata, for use in the verification tab. */
export const vlmtAgeGroups = vlmtNormen.altersgruppen.map(g => ({
  label: g.label,
  von: g.von,
  bis: g.bis as number | null,
}));

/**
 * Look up the PR for a single VLMT column + age group.
 * Direction is inferred from the column name (same as calculateVLMTPR).
 */
export function lookupVLMTColPR(
  rawScore: number,
  column: string,
  ageGroupLabel: string,
): number | string {
  const ag = vlmtNormen.altersgruppen.find(g => g.label === ageGroupLabel);
  if (!ag) return 'n/a';
  const dir: Direction = (LOWER_COLS as readonly string[]).includes(column) ? 'low' : 'high';
  return lookupPR(rawScore, column, ag.normen as NormRow[], dir);
}

export interface VLMTInputs {
  Dg1: number;
  Dg2: number;
  Dg3: number;
  Dg4: number;
  Dg5: number;
  Dg6: number;
  Dg7: number;
  I: number;
  W: number;
  W_F: number | null; // null when not entered or not applicable
}

export interface VLMTPRResult {
  prs: Record<string, number | string>;
  calculated: { sumDg1_5: number; Dg5_Dg6: number; Dg5_Dg7: number };
  normInfo: string;
}

function getAgeGroup(age: number) {
  return vlmtNormen.altersgruppen.find(g => {
    if (g.bis === null) return age >= g.von;
    return age >= g.von && age <= (g.bis as number);
  });
}

export interface VLMTPartialInputs {
  Dg1?: number | null; Dg2?: number | null; Dg3?: number | null;
  Dg4?: number | null; Dg5?: number | null; Dg6?: number | null;
  Dg7?: number | null; I?: number | null; W?: number | null; W_F?: number | null;
}

/** Like calculateVLMTPR but accepts partial inputs — only computes PRs for values that are present. */
export function calculateVLMTPRPartial(age: number, inputs: VLMTPartialInputs): {
  prs: Record<string, number | string>;
  calculated: Record<string, number>;
  normInfo: string;
} {
  const ageGroup = getAgeGroup(age);
  if (!ageGroup) return { prs: {}, calculated: {}, normInfo: 'Keine Normen für diese Altersgruppe.' };

  const normen = ageGroup.normen as NormRow[];
  const { Dg1, Dg2, Dg3, Dg4, Dg5, Dg6, Dg7, I, W, W_F } = inputs;
  const calculated: Record<string, number> = {};

  let sumDg1_5: number | null = null;
  if (Dg1 != null && Dg2 != null && Dg3 != null && Dg4 != null && Dg5 != null) {
    sumDg1_5 = Dg1 + Dg2 + Dg3 + Dg4 + Dg5;
    calculated.sumDg1_5 = sumDg1_5;
  }
  let Dg5_Dg6: number | null = null;
  if (Dg5 != null && Dg6 != null) { Dg5_Dg6 = Dg5 - Dg6; calculated.Dg5_Dg6 = Dg5_Dg6; }
  let Dg5_Dg7: number | null = null;
  if (Dg5 != null && Dg7 != null) { Dg5_Dg7 = Dg5 - Dg7; calculated.Dg5_Dg7 = Dg5_Dg7; }

  const rawMap: Record<string, number | null> = {
    Dg1: Dg1 ?? null, Dg5: Dg5 ?? null, sumDg1_5,
    Dg6: Dg6 ?? null, Dg7: Dg7 ?? null, Dg5_Dg6, Dg5_Dg7,
    I: I ?? null, W: W ?? null, W_F: W_F ?? null,
  };

  const prs: Record<string, number | string> = {};
  for (const col of HIGHER_COLS) {
    const raw = rawMap[col];
    if (raw != null) {
      const base = lookupPR(raw, col, normen, 'high');
      const key = makeNormKey('vlmt', col, raw, ageGroup.label);
      const ov = getOverriddenPR(key, base);
      prs[col] = ov !== undefined ? (ov as number | string) : base;
    }
  }
  for (const col of LOWER_COLS) {
    const raw = rawMap[col];
    if (raw != null) {
      const base = lookupPR(raw, col, normen, 'low');
      const key = makeNormKey('vlmt', col, raw, ageGroup.label);
      const ov = getOverriddenPR(key, base);
      prs[col] = ov !== undefined ? (ov as number | string) : base;
    }
  }

  const nRef = ageGroup.n as Record<string, number>;
  return { prs, calculated, normInfo: `Norm: ${ageGroup.label} (n=${nRef.Dg1 ?? '?'}), VLMT (Helmstaedter et al., 2001)` };
}

export function calculateVLMTPR(age: number, inputs: VLMTInputs): VLMTPRResult {
  const sumDg1_5 = inputs.Dg1 + inputs.Dg2 + inputs.Dg3 + inputs.Dg4 + inputs.Dg5;
  const Dg5_Dg6  = inputs.Dg5 - inputs.Dg6;
  const Dg5_Dg7  = inputs.Dg5 - inputs.Dg7;
  const calculated = { sumDg1_5, Dg5_Dg6, Dg5_Dg7 };

  const ageGroup = getAgeGroup(age);
  if (!ageGroup) {
    const prs = Object.fromEntries(
      ([...HIGHER_COLS, ...LOWER_COLS] as string[]).map(k => [k, 'n/a'])
    );
    return { prs, calculated, normInfo: 'Keine Normen für diese Altersgruppe.' };
  }

  const normen = ageGroup.normen as NormRow[];
  const rawMap: Record<string, number | null> = {
    Dg1: inputs.Dg1,
    Dg5: inputs.Dg5,
    sumDg1_5,
    Dg6: inputs.Dg6,
    Dg7: inputs.Dg7,
    Dg5_Dg6,
    Dg5_Dg7,
    I: inputs.I,
    W: inputs.W,
    W_F: inputs.W_F,
  };

  const prs: Record<string, number | string> = {};
  for (const col of HIGHER_COLS) {
    const raw = rawMap[col];
    if (raw === null) { prs[col] = 'n/a'; continue; }
    const base = lookupPR(raw, col, normen, 'high');
    const key = makeNormKey('vlmt', col, raw, ageGroup.label);
    const ov = getOverriddenPR(key, base);
    prs[col] = ov !== undefined ? (ov as number | string) : base;
  }
  for (const col of LOWER_COLS) {
    const raw = rawMap[col];
    if (raw === null) { prs[col] = 'n/a'; continue; }
    const base = lookupPR(raw, col, normen, 'low');
    const key = makeNormKey('vlmt', col, raw, ageGroup.label);
    const ov = getOverriddenPR(key, base);
    prs[col] = ov !== undefined ? (ov as number | string) : base;
  }

  const nRef = ageGroup.n as Record<string, number>;
  return {
    prs,
    calculated,
    normInfo: `Norm: ${ageGroup.label} (n=${nRef.Dg1 ?? '?'}), VLMT (Helmstaedter et al., 2001)`,
  };
}
