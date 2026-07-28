import rocftNormen from '../data/rocft_normen.json';
import { makeNormKey, getOverriddenPR } from './normOverrides';

type AgeGroup = '15-25' | '26-35' | '36-45' | '46-55' | '56-65' | '66-75' | '76-85';

const AGE_GROUPS: { range: [number, number]; key: AgeGroup }[] = [
  { range: [15, 25], key: '15-25' },
  { range: [26, 35], key: '26-35' },
  { range: [36, 45], key: '36-45' },
  { range: [46, 55], key: '46-55' },
  { range: [56, 65], key: '56-65' },
  { range: [66, 75], key: '66-75' },
  { range: [76, 85], key: '76-85' },
];

const AGE_GROUP_INDEX: Record<AgeGroup, number> = {
  '15-25': 0, '26-35': 1, '36-45': 2, '46-55': 3, '56-65': 4, '66-75': 5, '76-85': 6,
};

function getAgeGroup(age: number): AgeGroup | null {
  const found = AGE_GROUPS.find(g => age >= g.range[0] && age <= g.range[1]);
  return found ? found.key : null;
}

/**
 * Direct table lookup: iterate rows highest T → lowest T (highest PR first).
 * Return the PR of the first row where the age-group threshold is not null
 * and patient_raw >= threshold — this is always the highest applicable PR.
 */
function rawToPR(
  raw: number,
  scale: 'CFT' | 'CFM' | 'CQM',
  ageGroup: AgeGroup,
): number | null {
  const tValues = rocftNormen.normen[scale].t_werte;
  for (const row of tValues) {
    const threshold = (row.rohwerte as Record<string, number | null>)[ageGroup];
    if (threshold !== null && threshold !== undefined && raw >= threshold) {
      const key = makeNormKey('rocft', scale, raw, ageGroup);
      const ov = getOverriddenPR(key, row.pr);
      return ov !== undefined ? (ov as number) : row.pr;
    }
  }
  return null;
}

export interface NormStats {
  M: number;
  SD: number;
  n: number;
}

export interface ROCFTPRResult {
  prs: {
    cft?: number | string;
    cfm?: number | string;
    cqm?: number | string;
  };
  normInfo: string;
  ageGroup: AgeGroup | null;
  normStats: { CFT: NormStats; CFM: NormStats; CQM: NormStats } | null;
}

export function calculateROCFTPR(
  age: number,
  raw: { cft?: number | null; cfm?: number | null; cqm?: number | null },
): ROCFTPRResult {
  const ageGroup = getAgeGroup(age);
  if (!ageGroup) {
    return {
      prs: {},
      normInfo: `Keine Normen für Alter ${age} Jahre (Bereich: 15–85 J.)`,
      ageGroup: null,
      normStats: null,
    };
  }

  const idx = AGE_GROUP_INDEX[ageGroup];
  const getStats = (scale: 'CFT' | 'CFM' | 'CQM'): NormStats => ({
    M: rocftNormen.normen[scale].stichprobe.M_pro_gruppe[idx],
    SD: rocftNormen.normen[scale].stichprobe.SD_pro_gruppe[idx],
    n: rocftNormen.normen[scale].stichprobe.n_pro_gruppe[idx],
  });

  const prs: ROCFTPRResult['prs'] = {};
  if (raw.cft !== null && raw.cft !== undefined) {
    const pr = rawToPR(raw.cft, 'CFT', ageGroup);
    prs.cft = pr !== null ? pr : 'n/a';
  }
  if (raw.cfm !== null && raw.cfm !== undefined) {
    const pr = rawToPR(raw.cfm, 'CFM', ageGroup);
    prs.cfm = pr !== null ? pr : 'n/a';
  }
  if (raw.cqm !== null && raw.cqm !== undefined) {
    const pr = rawToPR(raw.cqm, 'CQM', ageGroup);
    prs.cqm = pr !== null ? pr : 'n/a';
  }

  return {
    prs,
    normInfo: `Altersgruppe ${ageGroup} J. · ROCFT-Manual (Tabellen B8/B9a/B9b)`,
    ageGroup,
    normStats: {
      CFT: getStats('CFT'),
      CFM: getStats('CFM'),
      CQM: getStats('CQM'),
    },
  };
}
