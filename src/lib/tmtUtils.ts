import tmtNorms from '../data/tmt-norms.json';
import { makeNormKey, getOverriddenPR } from './normOverrides';

export function lookupTMTPR(age: number, value: number, part: 'A' | 'B'): number | string {
  const group = tmtNorms.altersgruppen.find(g => age >= g.von && age <= g.bis);
  if (!group) return 'N/A';
  const normen = group.normen;

  // Find the first (highest-PR) row with a valid norm value — used to detect "above ceiling"
  let highestPR: number | null = null;
  let highestThreshold: number | null = null;
  for (const norm of normen) {
    const v = part === 'A' ? norm.A : norm.B;
    if (v !== null) { highestPR = norm.pr as number; highestThreshold = v; break; }
  }

  let computed: number | string;
  if (highestThreshold !== null && value <= highestThreshold) {
    computed = `>${highestPR}`;
  } else {
    let prevPR: number | null = null;
    let found = false;
    for (const norm of normen) {
      const normVal = part === 'A' ? norm.A : norm.B;
      if (normVal === null) continue;
      if (value <= normVal) {
        computed = prevPR !== null ? `${norm.pr}–${prevPR}` : (norm.pr as number | string);
        found = true;
        break;
      }
      prevPR = norm.pr as number;
    }
    if (!found) {
      let lowestValidPR = 10;
      for (let i = normen.length - 1; i >= 0; i--) {
        const v = part === 'A' ? normen[i].A : normen[i].B;
        if (v !== null) { lowestValidPR = normen[i].pr as number; break; }
      }
      computed = `< ${lowestValidPR}`;
    }
  }

  const key = makeNormKey('tmt', part, Math.round(value), group.label);
  const ov = getOverriddenPR(key, computed!);
  return ov !== undefined ? (ov as number | string) : computed!;
}
