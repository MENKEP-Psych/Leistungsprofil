import tolAlterNorms from '../data/tol_normen_alter.json';
import tolBildungNorms from '../data/tol_normen_bildung.json';
import { makeNormKey, getOverriddenPR } from './normOverrides';

type NormEntry = { rohwert: number; pr: number };

function lookupPR(rohwert: number, normen: NormEntry[]): number | string {
  const sorted = [...normen].sort((a, b) => a.rohwert - b.rohwert);
  if (rohwert < sorted[0].rohwert) return `<${sorted[0].pr}`;
  let resultIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (rohwert >= sorted[i].rohwert) resultIdx = i;
  }
  if (resultIdx === -1) return `<${sorted[0].pr}`;
  return sorted[resultIdx].pr;
}

function findAltergruppe(age: number, altersgruppen: typeof tolAlterNorms.altersgruppen) {
  return (
    altersgruppen.find(g => g.label !== 'Gesamt' && g.bis !== null && age >= g.von && age <= (g.bis as number)) ??
    altersgruppen.find(g => g.label !== 'Gesamt' && g.bis === null && age >= g.von)
  );
}

export function lookupTolAlterPR(rohwert: number, age: number): number | string {
  const group = findAltergruppe(age, tolAlterNorms.altersgruppen);
  if (!group) return 'N/A';
  const base = lookupPR(rohwert, group.normen);
  const key = makeNormKey('tol', 'alter', rohwert, group.label);
  const ov = getOverriddenPR(key, base);
  return ov !== undefined ? (ov as number | string) : base;
}

export function lookupTolAlterBildungPR(rohwert: number, age: number, bildungsjahre: number): number | string {
  const bg = tolBildungNorms.bildungsgruppen.find(b =>
    b.bildungsjahre_bis !== null
      ? bildungsjahre >= b.bildungsjahre_von && bildungsjahre <= (b.bildungsjahre_bis as number)
      : bildungsjahre >= b.bildungsjahre_von,
  );
  if (!bg) return 'N/A';
  const group = findAltergruppe(age, bg.altersgruppen as typeof tolAlterNorms.altersgruppen);
  if (!group) return 'N/A';
  const base = lookupPR(rohwert, group.normen);
  const bgIdx = tolBildungNorms.bildungsgruppen.indexOf(bg);
  const key = makeNormKey('tol', `bildung:${bgIdx}`, rohwert, group.label);
  const ov = getOverriddenPR(key, base);
  return ov !== undefined ? (ov as number | string) : base;
}

export function findTolAltergruppe(age: number) {
  return findAltergruppe(age, tolAlterNorms.altersgruppen);
}
