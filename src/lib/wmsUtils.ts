import wmsNormen from '../data/wms_iv_visuelle_wiedergabe_normen.json';
import transformationNormen from '../data/testnormen_transformation.json';
import { makeNormKey, getOverriddenPR } from './normOverrides';

function parseRohwertStr(val: string | null): [number, number] | null {
  if (!val) return null;
  const s = val.trim();
  const dashIdx = s.indexOf('–') > -1 ? s.indexOf('–') : s.indexOf('-');
  if (dashIdx > 0) {
    const a = parseInt(s.slice(0, dashIdx), 10);
    const b = parseInt(s.slice(dashIdx + 1), 10);
    if (!isNaN(a) && !isNaN(b)) return [Math.min(a, b), Math.max(a, b)];
  }
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? null : [n, n];
}

function findAgeGroupIdx(age: number, groups: Array<{ von_jahre: number; bis_jahre: number }>): number {
  return groups.findIndex(g => age >= g.von_jahre && age <= g.bis_jahre);
}

function lookupWP(rohwert: number, wpNormen: Array<{ wp: number; rohwert: string | null }>): number | null {
  for (const e of wpNormen) {
    const r = parseRohwertStr(e.rohwert);
    if (r && rohwert >= r[0] && rohwert <= r[1]) return e.wp;
  }
  return null;
}

function wpToWmsPR(wp: number): number | null {
  const normen = transformationNormen.normen as Array<{ T: number; AWP: number | null; PR: number }>;
  const e = normen.find(e => e.AWP === wp);
  if (e == null) return null;
  // Korrekturen aus der Normtransformationstabelle (Verifizieren-Tab) berücksichtigen.
  const key = makeNormKey('transform', 'T', e.T, 'PR');
  const ov = getOverriddenPR(key, e.PR);
  return ov !== undefined && ov !== null ? Number(ov) : e.PR;
}

function lookupWiedererkennenPR(
  rohwert: number,
  prNormen: Array<{ pr_bereich: string; rohwert: string | null }>,
): string | null {
  for (const e of prNormen) {
    const r = parseRohwertStr(e.rohwert);
    if (r && rohwert >= r[0] && rohwert <= r[1]) return e.pr_bereich;
  }
  return null;
}

export interface WMSComputed {
  sofortig_wp: number | null;
  sofortig_pr: number | null;
  verzoegert_wp: number | null;
  verzoegert_pr: number | null;
  wiedererkennen_pr: string | null;
  ageGroupLabel: string | null;
  ageOutOfRange: boolean;
}

export function computeWMSAll(
  sofortig: string,
  verzoegert: string,
  wiedererkennen: string,
  age: number,
): WMSComputed {
  const vwI = wmsNormen.normen.VW_I;
  const vwV = wmsNormen.normen.VW_verzoegert;
  const wie = wmsNormen.normen.Wiedererkennen;
  const idxI = findAgeGroupIdx(age, vwI.altersgruppen);
  const idxV = findAgeGroupIdx(age, vwV.altersgruppen);
  const idxW = findAgeGroupIdx(age, wie.altersgruppen);
  const ageOutOfRange = idxI === -1;

  let sofortig_wp = null, sofortig_pr = null;
  let verzoegert_wp = null, verzoegert_pr = null;
  let wiedererkennen_pr = null;

  if (sofortig !== '' && !isNaN(Number(sofortig)) && idxI >= 0) {
    sofortig_wp = lookupWP(Number(sofortig), vwI.altersgruppen[idxI].wp_normen);
    if (sofortig_wp !== null) {
      const basePR = wpToWmsPR(sofortig_wp);
      const key = makeNormKey('wms_vw', 'VW_I', Number(sofortig), vwI.altersgruppen[idxI].label);
      const ov = getOverriddenPR(key, basePR);
      sofortig_pr = ov !== undefined ? (ov as number | null) : basePR;
    }
  }
  if (verzoegert !== '' && !isNaN(Number(verzoegert)) && idxV >= 0) {
    verzoegert_wp = lookupWP(Number(verzoegert), vwV.altersgruppen[idxV].wp_normen);
    if (verzoegert_wp !== null) {
      const basePR = wpToWmsPR(verzoegert_wp);
      const key = makeNormKey('wms_vw', 'VW_verzoegert', Number(verzoegert), vwV.altersgruppen[idxV].label);
      const ov = getOverriddenPR(key, basePR);
      verzoegert_pr = ov !== undefined ? (ov as number | null) : basePR;
    }
  }
  if (wiedererkennen !== '' && !isNaN(Number(wiedererkennen)) && idxW >= 0) {
    const basePR = lookupWiedererkennenPR(Number(wiedererkennen), wie.altersgruppen[idxW].pr_normen);
    const key = makeNormKey('wms_vw', 'Wiedererkennen', Number(wiedererkennen), wie.altersgruppen[idxW].label);
    const ov = getOverriddenPR(key, basePR);
    wiedererkennen_pr = ov !== undefined ? String(ov) : basePR;
  }

  return {
    sofortig_wp, sofortig_pr,
    verzoegert_wp, verzoegert_pr,
    wiedererkennen_pr,
    ageGroupLabel: idxI >= 0 ? vwI.altersgruppen[idxI].label : null,
    ageOutOfRange,
  };
}
