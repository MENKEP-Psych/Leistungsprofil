import React, { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, HelpCircle, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import {
  lookupMosaik,
  lookupZahlenspanne,
  lookupLGWP,
  lookupLGWiedererkennung,
  wpToPR,
} from '../lib/normUtils';
import { lookupVLMTColPR, vlmtAgeGroups } from '../lib/vlmt';
import tmtNorms from '../data/tmt-norms.json';
import tolAlterNorms from '../data/tol_normen_alter.json';
import tolBildungNorms from '../data/tol_normen_bildung.json';
import zahlenspanneNormen from '../data/zahlenspanne_normen.json';
import zztNormen from '../data/zzt_normen.json';
import rocftNormen from '../data/rocft_normen.json';
import wmsIVNormen from '../data/wms_iv_visuelle_wiedergabe_normen.json';
import testnormenTransform from '../data/testnormen_transformation.json';

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'normen_verifikation_v1';
type VerificationStatus = 'unverified' | 'verified' | 'incorrect';
interface VerificationEntry {
  status: VerificationStatus;
  date: string;
  verifiedBy?: string;
}
type VerificationStore = Record<string, VerificationEntry>;

function loadStore(): VerificationStore {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}
function persistStore(s: VerificationStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// ── Test list ─────────────────────────────────────────────────────────────────

const TESTS = [
  { id: 'tmt',          label: 'TMT',             subtitle: 'Trail Making Test' },
  { id: 'vlmt',         label: 'VLMT',            subtitle: 'Verb. Lern- und Merkfähigkeitstest' },
  { id: 'zzt',          label: 'ZZT',             subtitle: 'Zahlen-Zeige-Test' },
  { id: 'zahlenspanne', label: 'Zahlenspanne',     subtitle: 'WMS-R Zahlenspanne' },
  { id: 'blockspanne',  label: 'Blockspanne',      subtitle: 'WMS-R Zahlenspanne (Normen)' },
  { id: 'mosaik',       label: 'Mosaik',           subtitle: 'Mosaik-Test' },
  { id: 'lg',           label: 'Log. Gedächtnis',  subtitle: 'WMS-R Logisches Gedächtnis' },
  { id: 'tol',          label: 'TOL',              subtitle: 'Tower of London' },
  { id: 'rocft',        label: 'ROCFT',            subtitle: 'Rey Complex Figure Test' },
  { id: 'wms_vw',       label: 'WMS-IV VW',        subtitle: 'Visuelle Wiedergabe (WMS-IV)' },
  { id: 'transform',    label: 'Normtransform.',    subtitle: 'Testnormen-Transformation' },
] as const;
type TestId = typeof TESTS[number]['id'];

// ── PR cell colour ────────────────────────────────────────────────────────────

function prCls(pr: string | number | null | undefined): string {
  if (pr === null || pr === undefined || pr === 'n/a') {
    return 'text-slate-300 dark:text-slate-600';
  }
  const s = String(pr).trim();
  if (s === '<5' || s.startsWith('< ') || (s.startsWith('<') && !s.startsWith('<='))) {
    return 'text-rose-500 dark:text-rose-400 font-semibold';
  }
  if (s === '>95' || s.startsWith('> ') || (s.startsWith('>') && !s.startsWith('>='))) {
    return 'text-emerald-600 dark:text-emerald-400 font-semibold';
  }
  const lo = parseFloat(s);
  if (!isNaN(lo)) {
    if (lo <= 15) return 'text-rose-500 dark:text-rose-400';
    if (lo <= 25) return 'text-orange-500 dark:text-orange-400';
    if (lo >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (lo >= 75) return 'text-blue-500 dark:text-blue-400';
  }
  return 'text-slate-700 dark:text-slate-300';
}

// ── Range parsing helper (mirrors normUtils.parseRohwertRange) ────────────────

function parseRohwertRange(val: string | null): [number, number] | null {
  if (!val) return null;
  const s = val.trim();
  let dashIdx = s.indexOf('–');
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

// ── Calculation helpers (mirrors of respective Tab components) ────────────────

// Mirrors TMTTab.calculatePR — must stay logically identical
function tmtCalcPR(
  time: number,
  normen: { pr: number | string; A: number | null; B: number | null }[],
  part: 'A' | 'B',
): string | number {
  let highPR: number | null = null;
  let highThresh: number | null = null;
  for (const n of normen) {
    const v = part === 'A' ? n.A : n.B;
    if (v !== null) { highPR = n.pr as number; highThresh = v; break; }
  }
  if (highThresh !== null && time <= highThresh) return `>${highPR}`;
  let prevPR: number | null = null;
  for (const n of normen) {
    const v = part === 'A' ? n.A : n.B;
    if (v === null) continue;
    if (time <= v) return prevPR !== null ? `${n.pr}–${prevPR}` : n.pr;
    prevPR = n.pr as number;
  }
  let lowest = 10;
  for (let i = normen.length - 1; i >= 0; i--) {
    const v = part === 'A' ? normen[i].A : normen[i].B;
    if (v !== null) { lowest = normen[i].pr as number; break; }
  }
  return `< ${lowest}`;
}

// Mirrors TOLTab.lookupPR — must stay logically identical
function tolCalcPR(rohwert: number, normen: { rohwert: number; pr: number }[]): string | number {
  let idx = -1;
  for (let i = 0; i < normen.length; i++) {
    if (rohwert >= normen[i].rohwert) idx = i;
  }
  if (idx === -1) return `< ${normen[0]?.pr ?? 1}`;
  const lo = normen[idx].pr;
  const next = normen[idx + 1];
  if (next && next.pr - 1 > lo) return `${lo}–${next.pr - 1}`;
  return lo;
}

// ROCFT: find highest T-row where rohwert >= threshold → return PR
function lookupROCFTPR(rohwert: number, scale: 'CFT' | 'CFM' | 'CQM', ageGroup: string): number | null {
  const tValues =
    scale === 'CFT' ? rocftNormen.normen.CFT.t_werte :
    scale === 'CFM' ? rocftNormen.normen.CFM.t_werte :
                      rocftNormen.normen.CQM.t_werte;
  for (const row of tValues) {
    const threshold = (row.rohwerte as Record<string, number | null>)[ageGroup];
    if (threshold !== null && threshold !== undefined && rohwert >= threshold) {
      return row.pr;
    }
  }
  return null;
}

// WMS-IV VW: Rohwert → WP lookup (uses parseRohwertRange)
function lookupWMSVWWP(rohwert: number, ageGroupLabel: string, subtest: 'VW_I' | 'VW_verzoegert'): number | null {
  const normen =
    subtest === 'VW_I'
      ? wmsIVNormen.normen.VW_I.altersgruppen
      : wmsIVNormen.normen.VW_verzoegert.altersgruppen;
  const ag = normen.find(a => a.label === ageGroupLabel);
  if (!ag) return null;
  for (const row of ag.wp_normen) {
    const range = parseRohwertRange(row.rohwert);
    if (range && rohwert >= range[0] && rohwert <= range[1]) return row.wp;
  }
  return null;
}

// WMS-IV Wiedererkennen: Rohwert → PR-Bereich
function lookupWMSWiedererkennen(rohwert: number, ageGroupLabel: string): string | null {
  const ag = wmsIVNormen.normen.Wiedererkennen.altersgruppen.find(a => a.label === ageGroupLabel);
  if (!ag) return null;
  for (const row of ag.pr_normen) {
    const range = parseRohwertRange(row.rohwert);
    if (range && rohwert >= range[0] && rohwert <= range[1]) return row.pr_bereich;
  }
  return null;
}

// ── Age group constants ───────────────────────────────────────────────────────

const ROCFT_AGE_GROUPS = rocftNormen.meta.altersgruppen as string[];
const WMS_VW_AGE_GROUPS = wmsIVNormen.normen.VW_I.altersgruppen.map(ag => ag.label);

// ── Shared table component ────────────────────────────────────────────────────

interface TableRow { raw: string | number; cells: (string | number | null)[]; }

function VerifTable({
  columns, rows, rawLabel = 'Rohwert',
}: {
  columns: string[];
  rows: TableRow[];
  rawLabel?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 px-3 py-2 bg-slate-100 dark:bg-slate-700/80 text-center font-black text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 border-b border-r border-slate-200 dark:border-slate-600 min-w-[52px]">
              {rawLabel}
            </th>
            {columns.map((col, i) => (
              <th key={i} className="px-2.5 py-2 bg-slate-100 dark:bg-slate-700/80 text-center font-black text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 whitespace-nowrap min-w-[80px]">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ raw, cells }, ri) => (
            <tr
              key={ri}
              className={cn(
                'hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors',
                ri % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/30' : '',
              )}
            >
              <td className="sticky left-0 z-10 px-3 py-[5px] bg-white dark:bg-slate-900 font-mono font-black text-[11px] text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 text-center">
                {raw}
              </td>
              {cells.map((pr, ci) => (
                <td key={ci} className={cn('px-2.5 py-[5px] text-center font-mono text-[11px]', prCls(pr))}>
                  {pr === null || pr === undefined ? '–' : String(pr)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MeasurePills({
  options, value, onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {options.map(opt => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-[11px] font-black transition-all',
            value === opt.key
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── TMT ───────────────────────────────────────────────────────────────────────

function TMTView() {
  const [part, setPart] = useState<'A' | 'B'>('A');
  const ageGroups = tmtNorms.altersgruppen;

  const tableData = useMemo(() => {
    // Derive min/max from the actual norm data for the selected part
    let minVal = Infinity, maxVal = -Infinity;
    ageGroups.forEach(ag =>
      ag.normen.forEach(n => {
        const v = part === 'A' ? n.A : n.B;
        if (v !== null) {
          minVal = Math.min(minVal, v);
          maxVal = Math.max(maxVal, v);
        }
      }),
    );
    if (!isFinite(minVal)) return { columns: [], rows: [] };
    const columns = ageGroups.map(ag => ag.label);
    const rows: TableRow[] = [];
    for (let t = minVal; t <= maxVal; t++) {
      rows.push({
        raw: t,
        cells: ageGroups.map(ag => tmtCalcPR(t, ag.normen as Parameters<typeof tmtCalcPR>[1], part)),
      });
    }
    return { columns, rows };
  }, [part, ageGroups]);

  return (
    <>
      <MeasurePills
        options={[{ key: 'A', label: 'Teil A' }, { key: 'B', label: 'Teil B' }]}
        value={part}
        onChange={v => setPart(v as 'A' | 'B')}
      />
      <VerifTable rawLabel="Zeit (s)" columns={tableData.columns} rows={tableData.rows} />
    </>
  );
}

// ── VLMT ──────────────────────────────────────────────────────────────────────

const VLMT_MEASURES = [
  { key: 'Dg1',      label: 'Dg1',      min: 0,  max: 16 },
  { key: 'Dg5',      label: 'Dg5',      min: 0,  max: 16 },
  { key: 'sumDg1_5', label: 'Σ Dg1–5',  min: 0,  max: 80 },
  { key: 'Dg6',      label: 'Dg6',      min: 0,  max: 16 },
  { key: 'Dg7',      label: 'Dg7',      min: 0,  max: 16 },
  { key: 'I',        label: 'I',         min: 0,  max: 16 },
  { key: 'W',        label: 'W',         min: 0,  max: 16 },
  { key: 'W_F',      label: 'W–FP',      min: -8, max: 16 },
  { key: 'Dg5_Dg6',  label: 'Dg5–Dg6',  min: -5, max: 10 },
  { key: 'Dg5_Dg7',  label: 'Dg5–Dg7',  min: -5, max: 10 },
];

function VLMTView() {
  const [measure, setMeasure] = useState('Dg1');
  const m = VLMT_MEASURES.find(x => x.key === measure) ?? VLMT_MEASURES[0];

  const tableData = useMemo(() => {
    const columns = vlmtAgeGroups.map(ag => ag.label);
    const rows: TableRow[] = [];
    for (let v = m.min; v <= m.max; v++) {
      rows.push({ raw: v, cells: vlmtAgeGroups.map(ag => lookupVLMTColPR(v, m.key, ag.label)) });
    }
    return { columns, rows };
  }, [m]);

  return (
    <>
      <MeasurePills
        options={VLMT_MEASURES.map(x => ({ key: x.key, label: x.label }))}
        value={measure}
        onChange={setMeasure}
      />
      <VerifTable columns={tableData.columns} rows={tableData.rows} />
    </>
  );
}

// ── ZZT ───────────────────────────────────────────────────────────────────────

function ZZTView() {
  const tableData = useMemo(() => {
    const wpRows = zztNormen.normen_wertpunkte.wertpunkte;
    const rounds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const columns = ['PR', ...rounds.map(r => `R${r}`)];
    const rows: TableRow[] = wpRows.map(row => ({
      raw: row.wp,
      cells: [
        row.pr,
        ...rounds.map(r => (row.zeiten as Record<string, number>)[String(r)] ?? null),
      ],
    }));
    return { columns, rows };
  }, []);

  return (
    <>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
        Wertpunkt (WP) → PR sowie Maximalzeit je Runde (R1–R10) für diesen WP.
        Niedrigere Zeiten = bessere Leistung. Durchschnitt der Runden-WPs ergibt den Gesamt-WP.
      </p>
      <VerifTable rawLabel="WP" columns={tableData.columns} rows={tableData.rows} />
    </>
  );
}

// ── Zahlenspanne ──────────────────────────────────────────────────────────────

function ZahlenspanneView() {
  const [dir, setDir] = useState<'vorwaerts' | 'rueckwaerts'>('vorwaerts');
  const ags = zahlenspanneNormen.altersgruppen;

  const tableData = useMemo(() => {
    const columns = ags.map(ag => ag.label);
    const rows: TableRow[] = [];
    for (let v = 0; v <= 12; v++) {
      rows.push({
        raw: v,
        cells: ags.map(ag => lookupZahlenspanne(v, ag.von, dir) ?? null),
      });
    }
    return { columns, rows };
  }, [dir, ags]);

  return (
    <>
      <MeasurePills
        options={[
          { key: 'vorwaerts',   label: 'Vorwärts' },
          { key: 'rueckwaerts', label: 'Rückwärts' },
        ]}
        value={dir}
        onChange={v => setDir(v as 'vorwaerts' | 'rueckwaerts')}
      />
      <VerifTable columns={tableData.columns} rows={tableData.rows} />
    </>
  );
}

// ── Mosaik ────────────────────────────────────────────────────────────────────

const MOSAIK_AGE_GROUPS = [
  { label: '16–17 Jahre', von: 16 },
  { label: '18–19 Jahre', von: 18 },
  { label: '20–24 Jahre', von: 20 },
  { label: '25–29 Jahre', von: 25 },
  { label: '30–34 Jahre', von: 30 },
  { label: '35–44 Jahre', von: 35 },
  { label: '45–54 Jahre', von: 45 },
  { label: '55–64 Jahre', von: 55 },
  { label: '65–69 Jahre', von: 65 },
  { label: '70–74 Jahre', von: 70 },
  { label: '75–79 Jahre', von: 75 },
  { label: '80–84 Jahre', von: 80 },
  { label: '85–89 Jahre', von: 85 },
];

function MosaikView() {
  const tableData = useMemo(() => {
    const columns = MOSAIK_AGE_GROUPS.map(ag => ag.label);
    const rows: TableRow[] = [];
    for (let v = 0; v <= 68; v++) {
      rows.push({
        raw: v,
        cells: MOSAIK_AGE_GROUPS.map(ag => lookupMosaik(v, ag.von)?.pr ?? null),
      });
    }
    return { columns, rows };
  }, []);

  return <VerifTable columns={tableData.columns} rows={tableData.rows} />;
}

// ── Logisches Gedächtnis ──────────────────────────────────────────────────────

const LG_AGE_GROUPS = [
  { label: '16;00–17;11', von: 16 },
  { label: '18;00–19;11', von: 18 },
  { label: '20;00–24;11', von: 20 },
  { label: '25;00–29;11', von: 25 },
  { label: '30;00–34;11', von: 30 },
  { label: '35;00–44;11', von: 35 },
  { label: '45;00–54;11', von: 45 },
  { label: '55;00–64;11', von: 55 },
  { label: '65;00–69;11', von: 65 },
];

function LGView() {
  const [sub, setSub] = useState<'lgI' | 'lgII' | 'wiedererk'>('lgI');

  const tableData = useMemo(() => {
    const columns = LG_AGE_GROUPS.map(ag => ag.label);

    if (sub === 'wiedererk') {
      const rows: TableRow[] = [];
      for (let v = 0; v <= 30; v++) {
        rows.push({ raw: v, cells: LG_AGE_GROUPS.map(ag => lookupLGWiedererkennung(v, ag.von)) });
      }
      return { columns, rows };
    }

    const rows: TableRow[] = [];
    for (let v = 0; v <= 50; v++) {
      rows.push({
        raw: v,
        cells: LG_AGE_GROUPS.map(ag => {
          const wp = lookupLGWP(v, ag.von, sub);
          if (wp === null) return null;
          return wpToPR(wp) ?? null;
        }),
      });
    }
    return { columns, rows };
  }, [sub]);

  return (
    <>
      <MeasurePills
        options={[
          { key: 'lgI',       label: 'LG I (unmittelbar)' },
          { key: 'lgII',      label: 'LG II (verzögert)' },
          { key: 'wiedererk', label: 'Wiedererkennung' },
        ]}
        value={sub}
        onChange={v => setSub(v as 'lgI' | 'lgII' | 'wiedererk')}
      />
      {sub !== 'wiedererk' && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
          Rohwert → Wertpunkt (WP) → PR (via WMS-R WP→PR-Tabelle).
        </p>
      )}
      <VerifTable columns={tableData.columns} rows={tableData.rows} />
    </>
  );
}

// ── TOL ───────────────────────────────────────────────────────────────────────

function TOLView() {
  const [normType, setNormType] = useState<'alter' | 'bildung'>('alter');
  const bildungsgruppen = tolBildungNorms.bildungsgruppen;
  const [bildungsIdx, setBildungsIdx] = useState(0);

  const tableData = useMemo(() => {
    if (normType === 'alter') {
      const ags = tolAlterNorms.altersgruppen.filter(ag => ag.label !== 'Gesamt');
      const columns = ags.map(ag => ag.label);
      const rows: TableRow[] = [];
      for (let v = 0; v <= 20; v++) {
        rows.push({ raw: v, cells: ags.map(ag => tolCalcPR(v, ag.normen)) });
      }
      return { columns, rows };
    }

    const bg = bildungsgruppen[bildungsIdx];
    if (!bg) return { columns: [], rows: [] };
    const ags = (bg.altersgruppen as typeof tolAlterNorms.altersgruppen).filter(ag => ag.label !== 'Gesamt');
    const columns = ags.map(ag => ag.label);
    const rows: TableRow[] = [];
    for (let v = 0; v <= 20; v++) {
      rows.push({ raw: v, cells: ags.map(ag => tolCalcPR(v, ag.normen)) });
    }
    return { columns, rows };
  }, [normType, bildungsIdx, bildungsgruppen]);

  return (
    <>
      <MeasurePills
        options={[
          { key: 'alter',   label: 'Alterskorrigiert' },
          { key: 'bildung', label: 'Alter + Bildung' },
        ]}
        value={normType}
        onChange={v => setNormType(v as 'alter' | 'bildung')}
      />
      {normType === 'bildung' && (
        <MeasurePills
          options={bildungsgruppen.map((bg, i) => ({ key: String(i), label: bg.label }))}
          value={String(bildungsIdx)}
          onChange={v => setBildungsIdx(Number(v))}
        />
      )}
      <VerifTable columns={tableData.columns} rows={tableData.rows} />
    </>
  );
}

// ── ROCFT ─────────────────────────────────────────────────────────────────────

const ROCFT_SCALES = [
  { key: 'CFT', label: 'CFT (Abzeichnen)', min: 0, max: 36 },
  { key: 'CFM', label: 'CFM (Gedächtnis)',  min: 0, max: 72 },
  { key: 'CQM', label: 'CQM (Quotient)',    min: 0, max: 250 },
];

function ROCFTView() {
  const [scale, setScale] = useState('CFT');
  const s = ROCFT_SCALES.find(x => x.key === scale) ?? ROCFT_SCALES[0];

  const tableData = useMemo(() => {
    const columns = ROCFT_AGE_GROUPS;
    const rows: TableRow[] = [];
    for (let v = s.min; v <= s.max; v++) {
      rows.push({
        raw: v,
        cells: ROCFT_AGE_GROUPS.map(ag =>
          lookupROCFTPR(v, scale as 'CFT' | 'CFM' | 'CQM', ag) ?? null,
        ),
      });
    }
    return { columns, rows };
  }, [scale, s]);

  return (
    <>
      <MeasurePills
        options={ROCFT_SCALES.map(x => ({ key: x.key, label: x.label }))}
        value={scale}
        onChange={setScale}
      />
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
        Rohwert → PR über T-Wert-Tabelle (höchster T, bei dem Rohwert ≥ Schwellwert). Null = unter allen Normen.
      </p>
      <VerifTable columns={tableData.columns} rows={tableData.rows} />
    </>
  );
}

// ── WMS-IV Visuelle Wiedergabe ────────────────────────────────────────────────

function WMSVWView() {
  const [subtest, setSubtest] = useState<'VW_I' | 'VW_verzoegert' | 'Wiedererkennen'>('VW_I');

  const tableData = useMemo(() => {
    const columns = WMS_VW_AGE_GROUPS;

    if (subtest === 'Wiedererkennen') {
      const rows: TableRow[] = [];
      for (let v = 0; v <= 7; v++) {
        rows.push({ raw: v, cells: WMS_VW_AGE_GROUPS.map(lbl => lookupWMSWiedererkennen(v, lbl)) });
      }
      return { columns, rows };
    }

    const rows: TableRow[] = [];
    for (let v = 0; v <= 43; v++) {
      rows.push({
        raw: v,
        cells: WMS_VW_AGE_GROUPS.map(lbl => {
          const wp = lookupWMSVWWP(v, lbl, subtest);
          if (wp === null) return null;
          return wpToPR(wp) ?? null;
        }),
      });
    }
    return { columns, rows };
  }, [subtest]);

  return (
    <>
      <MeasurePills
        options={[
          { key: 'VW_I',          label: 'VW I (unmittelbar)' },
          { key: 'VW_verzoegert', label: 'VW II (verzögert)' },
          { key: 'Wiedererkennen', label: 'Wiedererkennen' },
        ]}
        value={subtest}
        onChange={v => setSubtest(v as typeof subtest)}
      />
      {subtest !== 'Wiedererkennen' && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
          Rohwert → Wertpunkt (WP) → PR (WMS-IV WP→PR-Tabelle).
        </p>
      )}
      <VerifTable columns={tableData.columns} rows={tableData.rows} />
    </>
  );
}

// ── Testnormen Transformation ─────────────────────────────────────────────────

function TransformView() {
  const rows: TableRow[] = testnormenTransform.normen.map(row => ({
    raw: row.T,
    cells: [
      row.AWP ?? null,
      row.PR ?? null,
      row.z ?? null,
      row.Z ?? null,
      row.IQ ?? null,
      row.C ?? null,
      (row.Schulnoten as number | null | undefined) ?? null,
    ],
  }));

  return (
    <>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
        Referenztabelle für Normwert-Transformationen nach Lienert (1969). Eingangsgröße: T-Wert (linke Spalte).
      </p>
      <VerifTable rawLabel="T" columns={['AWP', 'PR', 'z', 'Z', 'IQ', 'C', 'Note']} rows={rows} />
    </>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

function TestView({ testId }: { testId: TestId }) {
  switch (testId) {
    case 'tmt':          return <TMTView />;
    case 'vlmt':         return <VLMTView />;
    case 'zzt':          return <ZZTView />;
    case 'zahlenspanne': return <ZahlenspanneView />;
    case 'blockspanne':  return <ZahlenspanneView />;
    case 'mosaik':       return <MosaikView />;
    case 'lg':           return <LGView />;
    case 'tol':          return <TOLView />;
    case 'rocft':        return <ROCFTView />;
    case 'wms_vw':       return <WMSVWView />;
    case 'transform':    return <TransformView />;
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusCfg(s: VerificationStatus) {
  if (s === 'verified')  return { Icon: CheckCircle2, color: 'text-emerald-500 dark:text-emerald-400', bannerBg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', label: 'Verifiziert' };
  if (s === 'incorrect') return { Icon: XCircle,      color: 'text-rose-500 dark:text-rose-400',       bannerBg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',           label: 'Vorerst falsch' };
  return                        { Icon: HelpCircle,   color: 'text-slate-400 dark:text-slate-500',     bannerBg: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',           label: 'Nicht geprüft' };
}

// ── Main component ────────────────────────────────────────────────────────────

export const NormenVerifizierenTab: React.FC = () => {
  const { currentUser } = useAuth();
  const [store, setStore] = useState<VerificationStore>(loadStore);
  const [selectedTest, setSelectedTest] = useState<TestId | null>(null);

  const setStatus = (testId: TestId, status: VerificationStatus) => {
    const next: VerificationStore = {
      ...store,
      [testId]: {
        status,
        date: new Date().toISOString(),
        verifiedBy: currentUser ?? undefined,
      },
    };
    setStore(next);
    persistStore(next);
  };

  const resetStatus = (testId: TestId) => {
    const next = { ...store };
    delete next[testId];
    setStore(next);
    persistStore(next);
  };

  const currentStatus: VerificationStatus = selectedTest
    ? (store[selectedTest]?.status ?? 'unverified')
    : 'unverified';
  const cfg = statusCfg(currentStatus);

  return (
    <div className="space-y-5 pb-10">
      {/* ── Overview grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {TESTS.map(test => {
          const s = store[test.id]?.status ?? 'unverified';
          const c = statusCfg(s);
          const isSelected = selectedTest === test.id;
          return (
            <button
              key={test.id}
              onClick={() => setSelectedTest(test.id as TestId)}
              className={cn(
                'flex flex-col gap-1.5 p-3.5 rounded-2xl border text-left transition-all',
                isSelected
                  ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-400 dark:ring-indigo-500'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-black text-slate-800 dark:text-slate-100">{test.label}</span>
                <c.Icon size={15} className={c.color} />
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{test.subtitle}</span>
              <span className={cn('text-[10px] font-bold mt-0.5', c.color)}>{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Selected test panel ── */}
      {selectedTest && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Header row */}
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 dark:border-slate-700">
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                {TESTS.find(t => t.id === selectedTest)?.label}
                <span className="text-slate-400 dark:text-slate-500 font-normal"> – </span>
                {TESTS.find(t => t.id === selectedTest)?.subtitle}
              </h3>

              {/* Status banner */}
              <div className={cn(
                'inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-xl border text-[10px] font-bold',
                cfg.bannerBg, cfg.color,
              )}>
                <cfg.Icon size={11} />
                {cfg.label}
                {store[selectedTest]?.date && (
                  <span className="font-normal opacity-70 ml-1">
                    · {new Date(store[selectedTest].date).toLocaleDateString('de-DE')}
                    {store[selectedTest]?.verifiedBy && (
                      <> · {store[selectedTest].verifiedBy}</>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {currentStatus !== 'unverified' && (
                <button
                  onClick={() => resetStatus(selectedTest)}
                  title="Markierung zurücksetzen"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                >
                  <RotateCcw size={12} />
                  Zurücksetzen
                </button>
              )}
              <button
                onClick={() => setStatus(selectedTest, 'incorrect')}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black transition-all',
                  currentStatus === 'incorrect'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40',
                )}
              >
                <XCircle size={13} />
                Vorerst falsch
              </button>
              <button
                onClick={() => setStatus(selectedTest, 'verified')}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black transition-all',
                  currentStatus === 'verified'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
                )}
              >
                <CheckCircle2 size={13} />
                Verifiziert
              </button>
            </div>
          </div>

          {/* Table area */}
          <div className="p-6">
            <TestView testId={selectedTest} />
          </div>
        </div>
      )}

      {!selectedTest && (
        <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">
          Einen Test auswählen, um die Normtabelle und berechneten Prozentränge zu sehen.
        </p>
      )}
    </div>
  );
};
