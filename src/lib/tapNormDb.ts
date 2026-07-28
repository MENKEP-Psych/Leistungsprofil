// Anonymous norm data collected from TAP entries.
// No patient identifiers are stored — only age + raw value + PR.

export interface TapNormEntry {
  ts: number;
  age: number;
  test: string;
  raw: number;
  pr: number;
}

const STORAGE_KEY = 'tap_norm_db_v1';

export function getTapNormData(): TapNormEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function persist(data: TapNormEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addTapNormEntries(entries: TapNormEntry[]) {
  if (!entries.length) return;
  persist([...getTapNormData(), ...entries]);
}

export function clearTapNormData() {
  localStorage.removeItem(STORAGE_KEY);
}

// Keys: [rawFieldName, prFieldName, testId, unit]
const ENTRY_DEFS: [string, string, string, string][] = [
  ['alM_rt',      'alM_pr',         'alertnessM_rt',         'ms'],
  ['alM_sd',      'alM_sd_pr',      'alertnessM_sd',         'ms'],
  ['al23_ohne_rt','al23_ohne_pr',   'alertness23_ohne_rt',   'ms'],
  ['al23_ohne_sd','al23_ohne_sd_pr','alertness23_ohne_sd',   'ms'],
  ['al23_mit_rt', 'al23_mit_pr',    'alertness23_mit_rt',    'ms'],
  ['al23_mit_sd', 'al23_mit_sd_pr', 'alertness23_mit_sd',    'ms'],
  ['gn_rt',       'gn_pr',          'gonogo1_rt',            'ms'],
  ['gn_fehler',   'gn_fehler_pr',   'gonogo1_fehler',        'n'],
  ['gn2_rt',      'gn2_pr',         'gonogo2_rt',            'ms'],
  ['gn2_fehler',  'gn2_fehler_pr',  'gonogo2_fehler',        'n'],
  ['fl_rt',       'fl_pr',          'flexibilitaet_rt',      'ms'],
  ['fl_fehler',   'fl_fehler_pr',   'flexibilitaet_fehler',  'n'],
  ['ga_rt',       'ga_pr',          'geteilte_aud_rt',       'ms'],
  ['gv_rt',       'gv_pr',          'geteilte_vis_rt',       'ms'],
  ['vig_rt',      'vig_pr',         'vigilanz_rt',           'ms'],
  ['ag_rt',       'ag_pr',          'arbeitsgedaechtnis_rt', 'ms'],
  ['ve_rt_krit',  've_pr_krit',     'scanning_rt_krit',      'ms'],
  ['ve_rt_nkrit', 've_pr_nkrit',    'scanning_rt_nkrit',     'ms'],
];

type SF = Record<string, string>;

export function buildNormEntriesFromSF(age: number, sf: SF): TapNormEntry[] {
  if (!age || age <= 0 || age > 110) return [];
  const ts = Date.now();
  const entries: TapNormEntry[] = [];

  for (const [rawKey, prKey, testId] of ENTRY_DEFS) {
    const raw = parseFloat(String(sf[rawKey] ?? '').replace(',', '.'));
    const pr  = parseFloat(String(sf[prKey]  ?? '').replace(',', '.'));
    if (!isNaN(raw) && !isNaN(pr) && raw > 0 && pr >= 0 && pr <= 100) {
      entries.push({ ts, age, test: testId, raw, pr });
    }
  }
  return entries;
}

// Aggregate stats per test for display
export interface NormStat {
  test: string;
  count: number;
  medianPr: number;
  ageGroups: { label: string; count: number; medianPr: number }[];
}

export function aggregateNormData(): NormStat[] {
  const data = getTapNormData();
  const byTest = new Map<string, TapNormEntry[]>();
  for (const e of data) {
    const arr = byTest.get(e.test) ?? [];
    arr.push(e);
    byTest.set(e.test, arr);
  }

  const median = (vals: number[]) => {
    const s = [...vals].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const AGE_BUCKETS = [
    { label: '18–39', min: 18, max: 39 },
    { label: '40–59', min: 40, max: 59 },
    { label: '60–79', min: 60, max: 79 },
    { label: '80+',   min: 80, max: 120 },
  ];

  const stats: NormStat[] = [];
  for (const [test, entries] of byTest.entries()) {
    const prs = entries.map(e => e.pr);
    const ageGroups = AGE_BUCKETS.map(b => {
      const grp = entries.filter(e => e.age >= b.min && e.age <= b.max);
      return {
        label: b.label,
        count: grp.length,
        medianPr: grp.length ? median(grp.map(e => e.pr)) : -1,
      };
    }).filter(g => g.count > 0);

    stats.push({ test, count: entries.length, medianPr: median(prs), ageGroups });
  }

  return stats.sort((a, b) => a.test.localeCompare(b.test));
}

// Per-exact-age breakdown for detailed norm tables
export interface NormByAge {
  test: string;
  byAge: { age: number; n: number; medianRaw: number; medianPr: number }[];
}

export function aggregateByExactAge(): NormByAge[] {
  const data = getTapNormData();
  const byTest = new Map<string, Map<number, TapNormEntry[]>>();

  for (const e of data) {
    if (!byTest.has(e.test)) byTest.set(e.test, new Map());
    const byAge = byTest.get(e.test)!;
    if (!byAge.has(e.age)) byAge.set(e.age, []);
    byAge.get(e.age)!.push(e);
  }

  const median = (vals: number[]) => {
    const s = [...vals].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const result: NormByAge[] = [];
  for (const [test, byAge] of byTest.entries()) {
    const byAgeArr = [...byAge.entries()]
      .map(([age, es]) => ({
        age,
        n: es.length,
        medianRaw: median(es.map(e => e.raw)),
        medianPr: median(es.map(e => e.pr)),
      }))
      .sort((a, b) => a.age - b.age);
    result.push({ test, byAge: byAgeArr });
  }

  return result.sort((a, b) => a.test.localeCompare(b.test));
}
