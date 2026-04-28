import zztNormen from '../data/zzt_normen.json';
import mosaikNormen from '../data/mosaik_normen.json';
import zahlenspanneNormen from '../data/zahlenspanne_normen.json';
import lgNormen from '../data/logisches_gedaechtnis_normen.json';

// ── WP → PR standard mapping (M=10, SD=3, Wechsler scale) ────────────────────

const WP_TO_PR: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 2, 5: 5, 6: 9, 7: 16, 8: 25,
  9: 37, 10: 50, 11: 63, 12: 75, 13: 84, 14: 91,
  15: 95, 16: 98, 17: 99, 18: 99, 19: 99,
};

export function wpToPR(wp: number): number {
  const clamped = Math.max(1, Math.min(19, Math.round(wp)));
  return WP_TO_PR[clamped] ?? 50;
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
  const wpRow = rows.find(r => r.wp === roundedWP) ?? rows.find(r => r.wp === Math.min(...rows.map(r2 => Math.abs(r2.wp - roundedWP))));
  const pr = wpRow?.pr ?? 50;

  return { wp: roundedWP, pr };
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
  const dashIdx = s.indexOf('\u2013'); // en-dash
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
  // Iterate from best (AWP 19) downward
  for (const row of mosaikNormen.normen) {
    const cellVal = (row.rohwerte as Record<string, string | null>)[ageCol];
    const range = parseRohwertRange(cellVal);
    if (range && rohwert >= range[0] && rohwert <= range[1]) {
      return { awp: row.awp, pr: row.pr };
    }
  }
  // Below lowest norm
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
): number | null {
  const group = getZahlenspanneAgeGroup(age);
  const prKey = direction === 'vorwaerts' ? 'pr_vorwaerts' : 'pr_rueckwaerts';

  // Find exact rohwert match first
  const exact = group.normen.find(n => n.rohwert === rohwert);
  if (exact) {
    const v = (exact as Record<string, number | null>)[prKey];
    return typeof v === 'number' ? v : null;
  }

  // If no exact match, find nearest lower rohwert (higher=better, so look down)
  const lower = group.normen
    .filter(n => n.rohwert <= rohwert)
    .sort((a, b) => b.rohwert - a.rohwert)[0];
  if (lower) {
    const v = (lower as Record<string, number | null>)[prKey];
    return typeof v === 'number' ? v : null;
  }

  return null;
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
      return row.pr_bereich;
    }
  }
  return null;
}

// Suppress unused import warning for MOSAIK_AGE_COLS and LG_AGE_COLS
void MOSAIK_AGE_COLS;
void LG_AGE_COLS;
