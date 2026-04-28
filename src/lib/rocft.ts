import rocftNormen from '../data/rocft_normen.json';

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

function getAgeGroup(age: number): AgeGroup | null {
  const found = AGE_GROUPS.find(g => age >= g.range[0] && age <= g.range[1]);
  return found ? found.key : null;
}

const AGE_GROUP_INDEX: Record<AgeGroup, number> = {
  '15-25': 0, '26-35': 1, '36-45': 2, '46-55': 3, '56-65': 4, '66-75': 5, '76-85': 6,
};

/** Convert raw score → T-value → PR using M/SD for the age group */
function rawToPR(
  raw: number,
  scale: 'CFT' | 'CFM' | 'CQM',
  ageGroup: AgeGroup,
): number | string {
  const normen = rocftNormen.normen[scale] as {
    stichprobe: { M_pro_gruppe: number[]; SD_pro_gruppe: number[] };
  };

  const idx = AGE_GROUP_INDEX[ageGroup];
  const M  = normen.stichprobe.M_pro_gruppe[idx];
  const SD = normen.stichprobe.SD_pro_gruppe[idx];

  if (SD === 0) return 'n/a';

  const tRaw = 50 + 10 * (raw - M) / SD;

  // Interpolate in the t_zu_pr table
  const tPrTable = rocftNormen.meta.t_zu_pr as Record<string, number>;
  const entries = Object.entries(tPrTable)
    .map(([k, v]) => ({ t: Number(k), pr: v }))
    .sort((a, b) => a.t - b.t);

  // Clamp
  if (tRaw <= entries[0].t) return `<${entries[0].pr}`;
  if (tRaw >= entries[entries.length - 1].t) return `>${entries[entries.length - 1].pr}`;

  // Find surrounding entries and linearly interpolate
  for (let i = 0; i < entries.length - 1; i++) {
    const lo = entries[i];
    const hi = entries[i + 1];
    if (tRaw >= lo.t && tRaw <= hi.t) {
      const frac = (tRaw - lo.t) / (hi.t - lo.t);
      const pr = lo.pr + frac * (hi.pr - lo.pr);
      const rounded = Math.round(pr);
      return Math.max(0, Math.min(100, rounded));
    }
  }

  return 'n/a';
}

export interface ROCFTPRResult {
  prs: {
    cft?: number | string;
    cfm?: number | string;
    cqm?: number | string;
  };
  normInfo: string;
  ageGroup: AgeGroup | null;
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
    };
  }

  const prs: ROCFTPRResult['prs'] = {};
  if (raw.cft !== null && raw.cft !== undefined) prs.cft = rawToPR(raw.cft, 'CFT', ageGroup);
  if (raw.cfm !== null && raw.cfm !== undefined) prs.cfm = rawToPR(raw.cfm, 'CFM', ageGroup);
  if (raw.cqm !== null && raw.cqm !== undefined) prs.cqm = rawToPR(raw.cqm, 'CQM', ageGroup);

  return {
    prs,
    normInfo: `Altersgruppe ${ageGroup} J. · ROCFT-Manual (Tabellen B8/B9a/B9b)`,
    ageGroup,
  };
}
