import zztNormen from '../data/zzt_normen.json';
import mosaikNormen from '../data/mosaik_normen.json';
import zahlenspanneNormen from '../data/zahlenspanne_normen.json';
import lgNormen from '../data/logisches_gedaechtnis_normen.json';
import transformNormen from '../data/testnormen_transformation.json';
import blockspanneNormen from '../data/blockspanne-norms.json';
import { makeNormKey, getOverriddenPR } from './normOverrides';

// ── WP → PR standard mapping (M=10, SD=3, Wechsler scale) ────────────────────
// WP 1 and 2 → '<1' (below floor); WP 18 and 19 → '>99' (above ceiling)

const WP_TO_PR: Record<number, number | string> = {
  1: '<1', 2: '<1', 3: 1, 4: 2, 5: 5, 6: 9, 7: 16, 8: 25,
  9: 37, 10: 50, 11: 63, 12: 75, 13: 84, 14: 91,
  15: 95, 16: 98, 17: 99, 18: '>99', 19: '>99',
};

export function wpToPR(wp: number): number | string | null {
  if (wp === null || wp === undefined || isNaN(wp)) {
    console.warn('wpToPR: ungültiger Eingabewert', wp);
    return null;
  }
  const rounded = Math.round(wp);
  if (rounded < 1 || rounded > 19) {
    console.warn(`wpToPR: WP=${rounded} außerhalb gültigem Bereich 1–19`);
    return null;
  }
  return WP_TO_PR[rounded] ?? null;
}

// ── ZZT – Zahlen-Zeige-Test ───────────────────────────────────────────────────

/**
 * For each round (index 0–9), find the highest WP where the norm threshold >= time.
 * Lower times = better performance.
 * Returns the average WP across completed rounds and its PR.
 */
export function lookupZZT(times: (number | null)[]): { wp: number; pr: number } | null {
  const rows = zztNormen.normen_wertpunkte.wertpunkte;
  // Sort descending by WP so we iterate best→worst
  const sorted = [...rows].sort((a, b) => b.wp - a.wp);

  const wps: number[] = [];
  times.forEach((t, i) => {
    if (t === null || t === undefined || isNaN(t)) return;
    const roundKey = String(i + 1);
    // Find highest WP where threshold >= patient's time
    const match = sorted.find(row => {
      const threshold = (row.zeiten as Record<string, number>)[roundKey];
      return threshold !== undefined && threshold >= t;
    });
    if (match) wps.push(match.wp);
  });

  if (wps.length === 0) return null;

  const avgWP = wps.reduce((a, b) => a + b, 0) / wps.length;
  const roundedWP = Math.round(avgWP);

  // Find PR for the rounded WP
  const wpRow = rows.find(r => r.wp === roundedWP);
  if (!wpRow) return null;

  const key = makeNormKey('zzt', 'WP', roundedWP, 'PR');
  const ov = getOverriddenPR(key, wpRow.pr);
  return { wp: roundedWP, pr: ov !== undefined ? (ov as number) : wpRow.pr };
}

// ── Mosaik Test ───────────────────────────────────────────────────────────────

const MOSAIK_AGE_COLS = mosaikNormen.altersgruppen_spalten;

function getMosaikAgeCol(age: number): string {
  // Age group boundaries derived from labels
  const boundaries: { label: string; von: number; bis: number }[] = [
    { label: '16–17 Jahre', von: 16, bis: 17 },
    { label: '18–19 Jahre', von: 18, bis: 19 },
    { label: '20–24 Jahre', von: 20, bis: 24 },
    { label: '25–29 Jahre', von: 25, bis: 29 },
    { label: '30–34 Jahre', von: 30, bis: 34 },
    { label: '35–44 Jahre', von: 35, bis: 44 },
    { label: '45–54 Jahre', von: 45, bis: 54 },
    { label: '55–64 Jahre', von: 55, bis: 64 },
    { label: '65–69 Jahre', von: 65, bis: 69 },
    { label: '70–74 Jahre', von: 70, bis: 74 },
    { label: '75–79 Jahre', von: 75, bis: 79 },
    { label: '80–84 Jahre', von: 80, bis: 84 },
    { label: '85–89 Jahre', von: 85, bis: 89 },
  ];

  // Find matching group; if age exceeds max, use last group
  for (const b of boundaries) {
    if (age >= b.von && age <= b.bis) return b.label;
  }
  if (age < boundaries[0].von) return boundaries[0].label;
  return boundaries[boundaries.length - 1].label;
}

/** Parse a rohwert cell value like "55–57", "68", or null. Returns [min, max]. */
function parseRohwertRange(val: string | null): [number, number] | null {
  if (!val) return null;
  const s = val.trim();
  let dashIdx = s.indexOf('\u2013'); // en-dash
  if (dashIdx < 0) dashIdx = s.indexOf('-', s.startsWith('-') ? 1 : 0);
  if (dashIdx > 0) {
    const a = parseInt(s.slice(0, dashIdx), 10);
    const b = parseInt(s.slice(dashIdx + 1), 10);
    if (!isNaN(a) && !isNaN(b)) return [Math.min(a, b), Math.max(a, b)];
  }
  const n = parseInt(s, 10);
  if (!isNaN(n)) return [n, n];
  return null;
}

export function lookupMosaik(rohwert: number, age: number): { awp: number; pr: number } | null {
  const ageCol = getMosaikAgeCol(age);
  for (const row of mosaikNormen.normen) {
    const cellVal = (row.rohwerte as Record<string, string | null>)[ageCol];
    const range = parseRohwertRange(cellVal);
    if (range && rohwert >= range[0] && rohwert <= range[1]) {
      const key = makeNormKey('mosaik', 'default', rohwert, ageCol);
      const pr = getOverriddenPR(key, row.pr);
      return { awp: row.awp, pr: typeof pr === 'number' ? pr : row.pr };
    }
  }
  return null;
}

// ── Zahlenspanne ──────────────────────────────────────────────────────────────

function getZahlenspanneAgeGroup(age: number) {
  return zahlenspanneNormen.altersgruppen.find(g => age >= g.von && age <= g.bis)
    ?? (age < zahlenspanneNormen.altersgruppen[0].von
      ? zahlenspanneNormen.altersgruppen[0]
      : zahlenspanneNormen.altersgruppen[zahlenspanneNormen.altersgruppen.length - 1]);
}

export function lookupZahlenspanne(
  rohwert: number,
  age: number,
  direction: 'vorwaerts' | 'rueckwaerts'
): number | string | null {
  const group = getZahlenspanneAgeGroup(age);
  const prKey = direction === 'vorwaerts' ? 'pr_vorwaerts' : 'pr_rueckwaerts';

  const sortedAsc = [...group.normen].sort((a, b) => a.rohwert - b.rohwert);

  let computed: number | string | null = null;

  const exact = sortedAsc.find(n => n.rohwert === rohwert);
  if (exact) {
    const v = (exact as Record<string, number | null>)[prKey];
    if (typeof v === 'number') { computed = v; }
  }

  if (computed === null) {
    const below = sortedAsc.filter(n => n.rohwert < rohwert).reverse();
    let lowerPR: number | null = null;
    for (const n of below) { const v = (n as Record<string, number | null>)[prKey]; if (typeof v === 'number') { lowerPR = v; break; } }
    computed = lowerPR !== null ? lowerPR : '< 2';
  }

  const key = makeNormKey('zahlenspanne', direction, rohwert, group.label);
  const result = getOverriddenPR(key, computed);
  return result !== undefined ? result as number | string | null : computed;
}

// ── Blockspanne ───────────────────────────────────────────────────────────────

const BLOCKSPANNE_AGE_GROUPS = [
  { label: '15–19 Jahre', von: 15, bis: 19 },
  { label: '20–25 Jahre', von: 20, bis: 25 },
  { label: '26–34 Jahre', von: 26, bis: 34 },
  { label: '35–44 Jahre', von: 35, bis: 44 },
  { label: '45–54 Jahre', von: 45, bis: 54 },
  { label: '55–64 Jahre', von: 55, bis: 64 },
  { label: '65–74 Jahre', von: 65, bis: 74 },
];

function getBlockspanneAgeLabel(age: number): string {
  for (const g of BLOCKSPANNE_AGE_GROUPS) {
    if (age >= g.von && age <= g.bis) return g.label;
  }
  if (age < BLOCKSPANNE_AGE_GROUPS[0].von) return BLOCKSPANNE_AGE_GROUPS[0].label;
  return BLOCKSPANNE_AGE_GROUPS[BLOCKSPANNE_AGE_GROUPS.length - 1].label;
}

function parseBlockspanneRohwert(r: number | string): number {
  if (typeof r === 'number') return r;
  return parseFloat(r.toString().replace('≤', ''));
}

function getBlockspannePR(row: typeof blockspanneNormen.normen[0], ageLabel: string, dirKey: string): number | null {
  const ageData = (row.pr as Record<string, Record<string, number | null>>)[ageLabel];
  if (!ageData) return null;
  const v = (ageData as Record<string, number | null>)[dirKey];
  return typeof v === 'number' ? v : null;
}

export function lookupBlockspanne(
  rohwert: number,
  age: number,
  direction: 'vorwaerts' | 'rueckwaerts'
): number | string | null {
  const ageLabel = getBlockspanneAgeLabel(age);
  const dirKey = direction === 'vorwaerts' ? 'vorwärts' : 'rückwärts';

  const sortedAsc = [...blockspanneNormen.normen]
    .sort((a, b) => parseBlockspanneRohwert(a.rohwert) - parseBlockspanneRohwert(b.rohwert));

  // Find matching row (handle "≤2" entry)
  let exactIdx = -1;
  for (let i = 0; i < sortedAsc.length; i++) {
    const rw = sortedAsc[i].rohwert;
    if (typeof rw === 'number' && rw === rohwert) { exactIdx = i; break; }
    if (typeof rw === 'string' && rw.startsWith('≤')) {
      const bound = parseFloat(rw.slice(1));
      if (rohwert <= bound) { exactIdx = i; break; }
    }
  }

  const buildRange = (idx: number) => {
    const above = sortedAsc.slice(idx + 1);
    const below = sortedAsc.slice(0, idx).reverse();
    let upperPR: number | null = null;
    for (const n of above) { const v = getBlockspannePR(n, ageLabel, dirKey); if (v !== null) { upperPR = v; break; } }
    let lowerPR: number | null = null;
    for (const n of below) { const v = getBlockspannePR(n, ageLabel, dirKey); if (v !== null) { lowerPR = v; break; } }
    if (upperPR !== null && lowerPR !== null) return `${lowerPR}-${upperPR}`;
    if (upperPR !== null) return `<${upperPR}`;
    if (lowerPR !== null) return `>${lowerPR}`;
    return null;
  };

  let computed: number | string | null = null;
  if (exactIdx >= 0) {
    const pr = getBlockspannePR(sortedAsc[exactIdx], ageLabel, dirKey);
    computed = pr !== null ? pr : buildRange(exactIdx);
  } else {
    const above = sortedAsc.filter(n => parseBlockspanneRohwert(n.rohwert) > rohwert);
    const below = sortedAsc.filter(n => parseBlockspanneRohwert(n.rohwert) < rohwert).reverse();
    let upperPR: number | null = null;
    for (const n of above) { const v = getBlockspannePR(n, ageLabel, dirKey); if (v !== null) { upperPR = v; break; } }
    let lowerPR: number | null = null;
    for (const n of below) { const v = getBlockspannePR(n, ageLabel, dirKey); if (v !== null) { lowerPR = v; break; } }
    if (upperPR !== null && lowerPR !== null) computed = `${lowerPR}-${upperPR}`;
    else if (upperPR !== null) computed = `<${upperPR}`;
    else if (lowerPR !== null) computed = `>${lowerPR}`;
  }

  const key = makeNormKey('blockspanne', direction, rohwert, ageLabel);
  const result = getOverriddenPR(key, computed);
  return result !== undefined ? result as number | string | null : computed;
}

// ── Logisches Gedächtnis ──────────────────────────────────────────────────────

const LG_AGE_COLS = lgNormen.altersgruppen_spalten;

function getLGAgeCol(age: number): string {
  const boundaries: { label: string; von: number; bis: number }[] = [
    { label: '16;00–17;11', von: 16, bis: 17 },
    { label: '18;00–19;11', von: 18, bis: 19 },
    { label: '20;00–24;11', von: 20, bis: 24 },
    { label: '25;00–29;11', von: 25, bis: 29 },
    { label: '30;00–34;11', von: 30, bis: 34 },
    { label: '35;00–44;11', von: 35, bis: 44 },
    { label: '45;00–54;11', von: 45, bis: 54 },
    { label: '55;00–64;11', von: 55, bis: 64 },
    { label: '65;00–69;11', von: 65, bis: 69 },
  ];
  for (const b of boundaries) {
    if (age >= b.von && age <= b.bis) return b.label;
  }
  if (age < boundaries[0].von) return boundaries[0].label;
  return boundaries[boundaries.length - 1].label;
}

/**
 * Find WP for a given rohwert and age group in LG I or LG II.
 * Returns the WP (1–19) or null if out of range.
 */
export function lookupLGWP(
  rohwert: number,
  age: number,
  test: 'lgI' | 'lgII'
): number | null {
  const ageCol = getLGAgeCol(age);
  const normen = test === 'lgI'
    ? lgNormen.lg_I_unmittelbare_wiedergabe.normen
    : lgNormen.lg_II_abruf_nach_verzoegerung.normen;

  for (const row of normen) {
    const cellVal = (row.rohwerte as Record<string, string>)[ageCol];
    const range = parseRohwertRange(cellVal);
    if (range && rohwert >= range[0] && rohwert <= range[1]) {
      return row.wp;
    }
  }
  return null;
}

/**
 * Find PR range string for Wiedererkennung given rohwert and age.
 */
export function lookupLGWiedererkennung(rohwert: number, age: number): string | null {
  const ageCol = getLGAgeCol(age);
  for (const row of lgNormen.wiedererkennung.normen) {
    const cellVal = (row.rohwerte as Record<string, string>)[ageCol];
    const range = parseRohwertRange(cellVal);
    if (range && rohwert >= range[0] && rohwert <= range[1]) {
      const key = makeNormKey('lg', 'wiedererk', rohwert, ageCol);
      const result = getOverriddenPR(key, row.pr_bereich);
      return result !== undefined ? String(result) : row.pr_bereich;
    }
  }
  return null;
}

/** Convenience: rohwert → final PR (WP→PR via wpToPR), with override check at PR level. */
export function lookupLGPR(rohwert: number, age: number, test: 'lgI' | 'lgII'): number | string | null {
  const ageCol = getLGAgeCol(age);
  const wp = lookupLGWP(rohwert, age, test);
  if (wp === null) return null;
  const basePr = wpToPR(wp);
  if (basePr === null) return null;
  const key = makeNormKey('lg', test, rohwert, ageCol);
  const result = getOverriddenPR(key, basePr);
  return result !== undefined ? result as number | string : basePr;
}

// ── T-Wert → PR (Lienert-Transformationstabelle) ─────────────────────────────

export function tWertToPR(tWert: number): number | null {
  const rounded = Math.round(tWert);
  const row = (transformNormen.normen as { T: number; PR: number }[]).find(r => r.T === rounded);
  if (row) {
    // Korrekturen aus der Normtransformationstabelle (Verifizieren-Tab) berücksichtigen.
    const key = makeNormKey('transform', 'T', rounded, 'PR');
    const ov = getOverriddenPR(key, row.PR);
    return ov !== undefined && ov !== null ? Number(ov) : row.PR;
  }
  if (rounded < 20) return 0;
  if (rounded > 80) return 100;
  return null;
}

// Suppress unused import warning for MOSAIK_AGE_COLS and LG_AGE_COLS
void MOSAIK_AGE_COLS;
void LG_AGE_COLS;
