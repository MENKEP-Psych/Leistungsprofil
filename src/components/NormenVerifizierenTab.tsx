import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  CheckCircle2, XCircle, HelpCircle, RotateCcw, DatabaseZap, Trash2,
  ChevronDown, Lock, Unlock, Pencil, UserCheck, RotateCcwSquare,
} from 'lucide-react';
import { getTapNormData, aggregateNormData, aggregateByExactAge, clearTapNormData } from '../lib/tapNormDb';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useNormOverrides } from '../context/NormOverridesContext';
import {
  NormOverrides,
  makeNormKey,
} from '../lib/normOverrides';
import {
  lookupMosaik,
  lookupZahlenspanne,
  lookupBlockspanne,
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
import { ZZT_ENABLED } from '../lib/featureFlags';

// ── Types ─────────────────────────────────────────────────────────────────────

type VerificationStatus = 'unverified' | 'verified' | 'incorrect';

// ── Test list ─────────────────────────────────────────────────────────────────

const TESTS = [
  { id: 'tmt',          label: 'TMT',             subtitle: 'Trail Making Test' },
  { id: 'vlmt',         label: 'VLMT',            subtitle: 'Verb. Lern- und Merkfähigkeitstest' },
  { id: 'zzt',          label: 'ZZT',             subtitle: 'Zahlen-Zeige-Test' },
  { id: 'zahlenspanne', label: 'Zahlenspanne',     subtitle: 'WMS-R Zahlenspanne' },
  { id: 'blockspanne',  label: 'Blockspanne',      subtitle: 'WMS-R Blockspanne (VM 3)' },
  { id: 'mosaik',       label: 'Mosaik',           subtitle: 'Mosaik-Test' },
  { id: 'lg',           label: 'Log. Gedächtnis',  subtitle: 'WMS-IV Logisches Gedächtnis' },
  { id: 'tol',          label: 'TOL',              subtitle: 'Tower of London' },
  { id: 'rocft',        label: 'ROCFT',            subtitle: 'Rey Complex Figure Test' },
  { id: 'wms_vw',       label: 'WMS-IV VW',        subtitle: 'Visuelle Wiedergabe (WMS-IV)' },
  { id: 'transform',    label: 'Normtransform.',    subtitle: 'Testnormen-Transformation' },
] as const;
type TestId = typeof TESTS[number]['id'];

// ── PR colour ─────────────────────────────────────────────────────────────────

function prCls(pr: string | number | null | undefined): string {
  if (pr === null || pr === undefined || pr === 'n/a') return 'text-slate-300 dark:text-slate-600';
  const s = String(pr).trim();
  if (s === '<5' || (s.startsWith('<') && !s.startsWith('<='))) return 'text-rose-500 dark:text-rose-400 font-semibold';
  if (s === '>95' || (s.startsWith('>') && !s.startsWith('>='))) return 'text-emerald-600 dark:text-emerald-400 font-semibold';
  const lo = parseFloat(s);
  if (!isNaN(lo)) {
    if (lo <= 15) return 'text-rose-500 dark:text-rose-400';
    if (lo <= 25) return 'text-orange-500 dark:text-orange-400';
    if (lo >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (lo >= 75) return 'text-blue-500 dark:text-blue-400';
  }
  return 'text-slate-700 dark:text-slate-300';
}

// ── Range helper ──────────────────────────────────────────────────────────────

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

// ── Calculation helpers ───────────────────────────────────────────────────────

function tmtCalcPR(time: number, normen: { pr: number | string; A: number | null; B: number | null }[], part: 'A' | 'B'): string | number {
  let highPR: number | null = null, highThresh: number | null = null;
  for (const n of normen) { const v = part === 'A' ? n.A : n.B; if (v !== null) { highPR = n.pr as number; highThresh = v; break; } }
  if (highThresh !== null && time <= highThresh) return `>${highPR}`;
  let prevPR: number | null = null;
  for (const n of normen) {
    const v = part === 'A' ? n.A : n.B;
    if (v === null) continue;
    if (time <= v) return prevPR !== null ? `${n.pr}–${prevPR}` : n.pr;
    prevPR = n.pr as number;
  }
  let lowest = 10;
  for (let i = normen.length - 1; i >= 0; i--) { const v = part === 'A' ? normen[i].A : normen[i].B; if (v !== null) { lowest = normen[i].pr as number; break; } }
  return `< ${lowest}`;
}

function tolCalcPR(rohwert: number, normen: { rohwert: number; pr: number }[]): string | number {
  let idx = -1;
  for (let i = 0; i < normen.length; i++) { if (rohwert >= normen[i].rohwert) idx = i; }
  if (idx === -1) return `< ${normen[0]?.pr ?? 1}`;
  const lo = normen[idx].pr;
  const next = normen[idx + 1];
  if (next && next.pr - 1 > lo) return `${lo}–${next.pr - 1}`;
  return lo;
}

function lookupROCFTPR(rohwert: number, scale: 'CFT' | 'CFM' | 'CQM', ageGroup: string): number | null {
  const tValues =
    scale === 'CFT' ? rocftNormen.normen.CFT.t_werte :
    scale === 'CFM' ? rocftNormen.normen.CFM.t_werte :
                      rocftNormen.normen.CQM.t_werte;
  for (const row of tValues) {
    const threshold = (row.rohwerte as Record<string, number | null>)[ageGroup];
    if (threshold !== null && threshold !== undefined && rohwert >= threshold) return row.pr;
  }
  return null;
}

function lookupWMSVWWP(rohwert: number, ageGroupLabel: string, subtest: 'VW_I' | 'VW_verzoegert'): number | null {
  const normen = subtest === 'VW_I' ? wmsIVNormen.normen.VW_I.altersgruppen : wmsIVNormen.normen.VW_verzoegert.altersgruppen;
  const ag = normen.find(a => a.label === ageGroupLabel);
  if (!ag) return null;
  for (const row of ag.wp_normen) {
    const range = parseRohwertRange(row.rohwert);
    if (range && rohwert >= range[0] && rohwert <= range[1]) return row.wp;
  }
  return null;
}

function lookupWMSWiedererkennen(rohwert: number, ageGroupLabel: string): string | null {
  const ag = wmsIVNormen.normen.Wiedererkennen.altersgruppen.find(a => a.label === ageGroupLabel);
  if (!ag) return null;
  for (const row of ag.pr_normen) {
    const range = parseRohwertRange(row.rohwert);
    if (range && rohwert >= range[0] && rohwert <= range[1]) return row.pr_bereich;
  }
  return null;
}

const ROCFT_AGE_GROUPS = rocftNormen.meta.altersgruppen as string[];
const WMS_VW_AGE_GROUPS = wmsIVNormen.normen.VW_I.altersgruppen.map(ag => ag.label);

// ── Status config ─────────────────────────────────────────────────────────────

function statusCfg(s: VerificationStatus) {
  if (s === 'verified')  return { Icon: CheckCircle2, color: 'text-emerald-500 dark:text-emerald-400', bannerBg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', label: 'Verifiziert' };
  if (s === 'incorrect') return { Icon: XCircle,      color: 'text-rose-500 dark:text-rose-400',       bannerBg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',           label: 'Vorerst falsch' };
  return                        { Icon: HelpCircle,   color: 'text-slate-400 dark:text-slate-500',     bannerBg: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',           label: 'Nicht geprüft' };
}

// ── View props ────────────────────────────────────────────────────────────────

interface ViewProps {
  testId: string;
  editMode: boolean;
  overrides: NormOverrides;
  editingKey: string | null;
  editDraft: string;
  onEditStart: (key: string, currentVal: string | number | null) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onDraftChange: (v: string) => void;
  onRemoveOverride: (key: string) => void;
}

// ── Shared table ──────────────────────────────────────────────────────────────

interface TableRow { raw: string | number; cells: (string | number | null)[]; }

function VerifTable({
  columns, rows, rawLabel = 'Rohwert',
  testId, subtypeKey, viewProps,
}: {
  columns: string[];
  rows: TableRow[];
  rawLabel?: string;
  testId?: string;
  subtypeKey?: string;
  viewProps?: ViewProps;
}) {
  const editMode = viewProps?.editMode ?? false;
  const overrides = viewProps?.overrides ?? {};
  const editingKey = viewProps?.editingKey ?? null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 px-3 py-2 bg-slate-50 dark:bg-slate-700/80 text-center font-semibold text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 border-b border-r border-slate-200 dark:border-slate-600 min-w-[52px]">
              {rawLabel}
            </th>
            {columns.map((col, i) => (
              <th key={i} className="px-2.5 py-2 bg-slate-50 dark:bg-slate-700/80 text-center font-semibold text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 whitespace-nowrap min-w-[80px]">
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
                'transition-colors',
                ri % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/30' : '',
              )}
            >
              <td className="sticky left-0 z-10 px-3 py-[5px] bg-white dark:bg-slate-900 font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 text-center">
                {raw}
              </td>
              {cells.map((baseVal, ci) => {
                const colLabel = columns[ci];
                const key = testId && subtypeKey && colLabel
                  ? makeNormKey(testId, subtypeKey, raw, colLabel)
                  : null;
                const override = key ? overrides[key] : undefined;
                const displayVal = override !== undefined ? override.value : baseVal;

                if (editMode && key) {
                  if (editingKey === key) {
                    return (
                      <td key={ci} className="px-1 py-[3px] text-center">
                        <input
                          autoFocus
                          value={viewProps!.editDraft}
                          onChange={e => viewProps!.onDraftChange(e.target.value)}
                          onBlur={viewProps!.onEditCommit}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); viewProps!.onEditCommit(); }
                            if (e.key === 'Escape') viewProps!.onEditCancel();
                          }}
                          className="w-16 text-center font-mono text-[11px] bg-amber-100 border border-amber-400 rounded-lg px-1 py-[2px] outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </td>
                    );
                  }
                  return (
                    <td
                      key={ci}
                      title={override ? `Ursprungswert: ${String(override.oldValue)} · geändert von ${override.changedBy}` : 'Klicken zum Bearbeiten'}
                      onClick={() => viewProps!.onEditStart(key, baseVal)}
                      onContextMenu={e => { e.preventDefault(); if (override) viewProps!.onRemoveOverride(key); }}
                      className={cn(
                        'px-2.5 py-[5px] text-center font-mono text-[11px] cursor-pointer transition-colors',
                        override
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50'
                          : cn('hover:bg-slate-50 dark:hover:bg-slate-700/40', prCls(displayVal)),
                      )}
                    >
                      {displayVal === null || displayVal === undefined ? '–' : String(displayVal)}
                    </td>
                  );
                }

                // Read-only cell
                return (
                  <td
                    key={ci}
                    className={cn(
                      'px-2.5 py-[5px] text-center font-mono text-[11px] relative group',
                      override
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 font-semibold'
                        : prCls(displayVal),
                    )}
                  >
                    {displayVal === null || displayVal === undefined ? '–' : String(displayVal)}
                    {override && (
                      <div className="pointer-events-none absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-max max-w-[200px] bg-slate-800 text-white text-[10px] font-normal px-2.5 py-1.5 rounded-lg shadow-lg leading-relaxed whitespace-normal">
                        <span className="font-semibold">Ursprung:</span> {String(override.oldValue)}<br />
                        <span className="opacity-70">{override.changedBy} · {new Date(override.changedAt).toLocaleDateString('de-DE')}</span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── MeasurePills ──────────────────────────────────────────────────────────────

function MeasurePills({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {options.map(opt => (
        <button key={opt.key} onClick={() => onChange(opt.key)}
          className={cn('px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all',
            value === opt.key
              ? 'bg-slate-800 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
          )}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── TMT ───────────────────────────────────────────────────────────────────────

function TMTView({ viewProps }: { viewProps: ViewProps }) {
  const [part, setPart] = useState<'A' | 'B'>('A');
  const ageGroups = tmtNorms.altersgruppen;
  const tableData = useMemo(() => {
    let minVal = Infinity, maxVal = -Infinity;
    ageGroups.forEach(ag => ag.normen.forEach(n => { const v = part === 'A' ? n.A : n.B; if (v !== null) { minVal = Math.min(minVal, v); maxVal = Math.max(maxVal, v); } }));
    if (!isFinite(minVal)) return { columns: [], rows: [] };
    const columns = ageGroups.map(ag => ag.label);
    const rows: TableRow[] = [];
    for (let t = minVal; t <= maxVal; t++) {
      rows.push({ raw: t, cells: ageGroups.map(ag => tmtCalcPR(t, ag.normen as Parameters<typeof tmtCalcPR>[1], part)) });
    }
    return { columns, rows };
  }, [part, ageGroups]);
  return (
    <>
      <MeasurePills options={[{ key: 'A', label: 'Teil A' }, { key: 'B', label: 'Teil B' }]} value={part} onChange={v => setPart(v as 'A' | 'B')} />
      <VerifTable rawLabel="Zeit (s)" columns={tableData.columns} rows={tableData.rows} testId="tmt" subtypeKey={part} viewProps={viewProps} />
    </>
  );
}

// ── VLMT ──────────────────────────────────────────────────────────────────────

const VLMT_MEASURES = [
  { key: 'Dg1', label: 'Dg1', min: 0, max: 16 },
  { key: 'Dg5', label: 'Dg5', min: 0, max: 16 },
  { key: 'sumDg1_5', label: 'Σ Dg1–5', min: 0, max: 80 },
  { key: 'Dg6', label: 'Dg6', min: 0, max: 16 },
  { key: 'Dg7', label: 'Dg7', min: 0, max: 16 },
  { key: 'I', label: 'I', min: 0, max: 16 },
  { key: 'W', label: 'W', min: 0, max: 16 },
  { key: 'W_F', label: 'W–FP', min: -8, max: 16 },
  { key: 'Dg5_Dg6', label: 'Dg5–Dg6', min: -5, max: 10 },
  { key: 'Dg5_Dg7', label: 'Dg5–Dg7', min: -5, max: 10 },
];

function VLMTView({ viewProps }: { viewProps: ViewProps }) {
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
      <MeasurePills options={VLMT_MEASURES.map(x => ({ key: x.key, label: x.label }))} value={measure} onChange={setMeasure} />
      <VerifTable columns={tableData.columns} rows={tableData.rows} testId="vlmt" subtypeKey={measure} viewProps={viewProps} />
    </>
  );
}

// ── ZZT ───────────────────────────────────────────────────────────────────────

function ZZTView({ viewProps }: { viewProps: ViewProps }) {
  const tableData = useMemo(() => {
    const wpRows = zztNormen.normen_wertpunkte.wertpunkte;
    const rounds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const columns = ['PR', ...rounds.map(r => `R${r}`)];
    const rows: TableRow[] = wpRows.map(row => ({
      raw: row.wp,
      cells: [row.pr, ...rounds.map(r => (row.zeiten as Record<string, number>)[String(r)] ?? null)],
    }));
    return { columns, rows };
  }, []);
  return (
    <>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
        Wertpunkt (WP) → PR sowie Maximalzeit je Runde (R1–R10). Niedrigere Zeiten = bessere Leistung.
      </p>
      <VerifTable rawLabel="WP" columns={tableData.columns} rows={tableData.rows} testId="zzt" subtypeKey="WP" viewProps={viewProps} />
    </>
  );
}

// ── Zahlenspanne ──────────────────────────────────────────────────────────────

function ZahlenspanneView({ viewProps }: { viewProps: ViewProps }) {
  const [dir, setDir] = useState<'vorwaerts' | 'rueckwaerts'>('vorwaerts');
  const ags = zahlenspanneNormen.altersgruppen;
  const tableData = useMemo(() => ({
    columns: ags.map(ag => ag.label),
    rows: Array.from({ length: 13 }, (_, i) => i).map(v => ({
      raw: v,
      cells: ags.map(ag => lookupZahlenspanne(v, ag.von, dir) ?? null),
    })),
  }), [dir, ags]);
  return (
    <>
      <MeasurePills options={[{ key: 'vorwaerts', label: 'Vorwärts' }, { key: 'rueckwaerts', label: 'Rückwärts' }]} value={dir} onChange={v => setDir(v as 'vorwaerts' | 'rueckwaerts')} />
      <VerifTable columns={tableData.columns} rows={tableData.rows} testId="zahlenspanne" subtypeKey={dir} viewProps={viewProps} />
    </>
  );
}

// ── Blockspanne ───────────────────────────────────────────────────────────────

const BLOCKSPANNE_AGE_GROUPS = [
  { label: '15–19 Jahre', von: 15 }, { label: '20–25 Jahre', von: 20 },
  { label: '26–34 Jahre', von: 26 }, { label: '35–44 Jahre', von: 35 },
  { label: '45–54 Jahre', von: 45 }, { label: '55–64 Jahre', von: 55 },
  { label: '65–74 Jahre', von: 65 },
];

function BlockspanneView({ viewProps }: { viewProps: ViewProps }) {
  const [dir, setDir] = useState<'vorwaerts' | 'rueckwaerts'>('vorwaerts');
  const tableData = useMemo(() => ({
    columns: BLOCKSPANNE_AGE_GROUPS.map(ag => ag.label),
    rows: Array.from({ length: 14 }, (_, i) => i).map(v => ({
      raw: v,
      cells: BLOCKSPANNE_AGE_GROUPS.map(ag => lookupBlockspanne(v, ag.von, dir) ?? null),
    })),
  }), [dir]);
  return (
    <>
      <MeasurePills options={[{ key: 'vorwaerts', label: 'Vorwärts' }, { key: 'rueckwaerts', label: 'Rückwärts' }]} value={dir} onChange={v => setDir(v as 'vorwaerts' | 'rueckwaerts')} />
      <VerifTable columns={tableData.columns} rows={tableData.rows} testId="blockspanne" subtypeKey={dir} viewProps={viewProps} />
    </>
  );
}

// ── Mosaik ────────────────────────────────────────────────────────────────────

const MOSAIK_AGE_GROUPS = [
  { label: '16–17 Jahre', von: 16 }, { label: '18–19 Jahre', von: 18 },
  { label: '20–24 Jahre', von: 20 }, { label: '25–29 Jahre', von: 25 },
  { label: '30–34 Jahre', von: 30 }, { label: '35–44 Jahre', von: 35 },
  { label: '45–54 Jahre', von: 45 }, { label: '55–64 Jahre', von: 55 },
  { label: '65–69 Jahre', von: 65 }, { label: '70–74 Jahre', von: 70 },
  { label: '75–79 Jahre', von: 75 }, { label: '80–84 Jahre', von: 80 },
  { label: '85–89 Jahre', von: 85 },
];

function MosaikView({ viewProps }: { viewProps: ViewProps }) {
  const tableData = useMemo(() => ({
    columns: MOSAIK_AGE_GROUPS.map(ag => ag.label),
    rows: Array.from({ length: 69 }, (_, i) => i).map(v => ({
      raw: v,
      cells: MOSAIK_AGE_GROUPS.map(ag => lookupMosaik(v, ag.von)?.pr ?? null),
    })),
  }), []);
  return <VerifTable columns={tableData.columns} rows={tableData.rows} testId="mosaik" subtypeKey="default" viewProps={viewProps} />;
}

// ── Logisches Gedächtnis ──────────────────────────────────────────────────────

const LG_AGE_GROUPS = [
  { label: '16;00–17;11', von: 16 }, { label: '18;00–19;11', von: 18 },
  { label: '20;00–24;11', von: 20 }, { label: '25;00–29;11', von: 25 },
  { label: '30;00–34;11', von: 30 }, { label: '35;00–44;11', von: 35 },
  { label: '45;00–54;11', von: 45 }, { label: '55;00–64;11', von: 55 },
  { label: '65;00–69;11', von: 65 },
];

function LGView({ viewProps }: { viewProps: ViewProps }) {
  const [sub, setSub] = useState<'lgI' | 'lgII' | 'wiedererk'>('lgI');
  const tableData = useMemo(() => {
    const columns = LG_AGE_GROUPS.map(ag => ag.label);
    if (sub === 'wiedererk') {
      return {
        columns,
        rows: Array.from({ length: 31 }, (_, i) => i).map(v => ({
          raw: v, cells: LG_AGE_GROUPS.map(ag => lookupLGWiedererkennung(v, ag.von)),
        })),
      };
    }
    return {
      columns,
      rows: Array.from({ length: 51 }, (_, i) => i).map(v => ({
        raw: v,
        cells: LG_AGE_GROUPS.map(ag => { const wp = lookupLGWP(v, ag.von, sub); return wp === null ? null : wpToPR(wp) ?? null; }),
      })),
    };
  }, [sub]);
  return (
    <>
      <MeasurePills
        options={[{ key: 'lgI', label: 'LG I (unmittelbar)' }, { key: 'lgII', label: 'LG II (verzögert)' }, { key: 'wiedererk', label: 'Wiedererkennung' }]}
        value={sub} onChange={v => setSub(v as 'lgI' | 'lgII' | 'wiedererk')}
      />
      {sub !== 'wiedererk' && <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">Rohwert → Wertpunkt (WP) → PR (WMS-IV WP→PR-Tabelle).</p>}
      <VerifTable columns={tableData.columns} rows={tableData.rows} testId="lg" subtypeKey={sub} viewProps={viewProps} />
    </>
  );
}

// ── TOL ───────────────────────────────────────────────────────────────────────

function TOLView({ viewProps }: { viewProps: ViewProps }) {
  const [normType, setNormType] = useState<'alter' | 'bildung'>('alter');
  const bildungsgruppen = tolBildungNorms.bildungsgruppen;
  const [bildungsIdx, setBildungsIdx] = useState(0);
  const tableData = useMemo(() => {
    if (normType === 'alter') {
      const ags = tolAlterNorms.altersgruppen.filter(ag => ag.label !== 'Gesamt');
      const columns = ags.map(ag => ag.label);
      const rows: TableRow[] = Array.from({ length: 21 }, (_, i) => i).map(v => ({ raw: v, cells: ags.map(ag => tolCalcPR(v, ag.normen)) }));
      return { columns, rows };
    }
    const bg = bildungsgruppen[bildungsIdx];
    if (!bg) return { columns: [], rows: [] };
    const ags = (bg.altersgruppen as typeof tolAlterNorms.altersgruppen).filter(ag => ag.label !== 'Gesamt');
    const columns = ags.map(ag => ag.label);
    const rows: TableRow[] = Array.from({ length: 21 }, (_, i) => i).map(v => ({ raw: v, cells: ags.map(ag => tolCalcPR(v, ag.normen)) }));
    return { columns, rows };
  }, [normType, bildungsIdx, bildungsgruppen]);
  const subtypeKey = normType === 'alter' ? 'alter' : `bildung:${bildungsIdx}`;
  return (
    <>
      <MeasurePills options={[{ key: 'alter', label: 'Alterskorrigiert' }, { key: 'bildung', label: 'Alter + Bildung' }]} value={normType} onChange={v => setNormType(v as 'alter' | 'bildung')} />
      {normType === 'bildung' && <MeasurePills options={bildungsgruppen.map((bg, i) => ({ key: String(i), label: bg.label }))} value={String(bildungsIdx)} onChange={v => setBildungsIdx(Number(v))} />}
      <VerifTable columns={tableData.columns} rows={tableData.rows} testId="tol" subtypeKey={subtypeKey} viewProps={viewProps} />
    </>
  );
}

// ── ROCFT ─────────────────────────────────────────────────────────────────────

const ROCFT_SCALES = [
  { key: 'CFT', label: 'CFT – Abzeichnen', min: 0, max: 36 },
  { key: 'CFM', label: 'CFM – Gedächtnis', min: 0, max: 72 },
  { key: 'CQM', label: 'CQM – Quotient', min: 0, max: 300 },
];

function ROCFTView({ viewProps }: { viewProps: ViewProps }) {
  const [scale, setScale] = useState('CFT');
  const s = ROCFT_SCALES.find(x => x.key === scale) ?? ROCFT_SCALES[0];
  const tableData = useMemo(() => ({
    columns: ROCFT_AGE_GROUPS,
    rows: Array.from({ length: s.max - s.min + 1 }, (_, i) => s.min + i).map(v => ({
      raw: v,
      cells: ROCFT_AGE_GROUPS.map(ag => lookupROCFTPR(v, scale as 'CFT' | 'CFM' | 'CQM', ag) ?? null),
    })),
  }), [scale, s]);
  const currentNormen = rocftNormen.normen[scale as 'CFT' | 'CFM' | 'CQM'];
  return (
    <>
      <MeasurePills options={ROCFT_SCALES.map(x => ({ key: x.key, label: x.label }))} value={scale} onChange={setScale} />
      <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2 text-left text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest w-10" />
              {ROCFT_AGE_GROUPS.map(ag => <th key={ag} className="px-2.5 py-2 text-center text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">{ag}</th>)}
            </tr>
          </thead>
          <tbody>
            {(['M', 'SD', 'n'] as const).map((stat, si) => (
              <tr key={stat} className={si < 2 ? 'border-b border-slate-100 dark:border-slate-700/60' : ''}>
                <td className="px-3 py-1.5 text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{stat}</td>
                {(stat === 'M' ? currentNormen.stichprobe.M_pro_gruppe : stat === 'SD' ? currentNormen.stichprobe.SD_pro_gruppe : currentNormen.stichprobe.n_pro_gruppe).map((v, i) => (
                  <td key={i} className="px-2.5 py-1.5 text-center font-mono text-[11px] text-slate-600 dark:text-slate-300">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">Rohwert → PR aus Normtabelle (höchster T, bei dem Rohwert ≥ Schwellwert).</p>
      <VerifTable columns={tableData.columns} rows={tableData.rows} testId="rocft" subtypeKey={scale} viewProps={viewProps} />
    </>
  );
}

// ── WMS-IV VW ─────────────────────────────────────────────────────────────────

function WMSVWView({ viewProps }: { viewProps: ViewProps }) {
  const [subtest, setSubtest] = useState<'VW_I' | 'VW_verzoegert' | 'Wiedererkennen'>('VW_I');
  const tableData = useMemo(() => {
    const columns = WMS_VW_AGE_GROUPS;
    if (subtest === 'Wiedererkennen') {
      return { columns, rows: Array.from({ length: 8 }, (_, i) => i).map(v => ({ raw: v, cells: WMS_VW_AGE_GROUPS.map(lbl => lookupWMSWiedererkennen(v, lbl)) })) };
    }
    return {
      columns,
      rows: Array.from({ length: 44 }, (_, i) => i).map(v => ({
        raw: v,
        cells: WMS_VW_AGE_GROUPS.map(lbl => { const wp = lookupWMSVWWP(v, lbl, subtest); return wp === null ? null : wpToPR(wp) ?? null; }),
      })),
    };
  }, [subtest]);
  return (
    <>
      <MeasurePills
        options={[{ key: 'VW_I', label: 'VW I (unmittelbar)' }, { key: 'VW_verzoegert', label: 'VW II (verzögert)' }, { key: 'Wiedererkennen', label: 'Wiedererkennen' }]}
        value={subtest} onChange={v => setSubtest(v as typeof subtest)}
      />
      {subtest !== 'Wiedererkennen' && <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">Rohwert → Wertpunkt (WP) → PR (WMS-IV WP→PR-Tabelle).</p>}
      <VerifTable columns={tableData.columns} rows={tableData.rows} testId="wms_vw" subtypeKey={subtest} viewProps={viewProps} />
    </>
  );
}

// ── Transform ─────────────────────────────────────────────────────────────────

function TransformView({ viewProps }: { viewProps: ViewProps }) {
  const rows: TableRow[] = testnormenTransform.normen.map(row => ({
    raw: row.T,
    cells: [row.AWP ?? null, row.PR ?? null, row.z ?? null, row.Z ?? null, row.IQ ?? null, row.C ?? null, (row.Schulnoten as number | null | undefined) ?? null],
  }));
  return (
    <>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
        Referenztabelle für Normwert-Transformationen nach Lienert (1969).
      </p>
      <VerifTable rawLabel="T" columns={['AWP', 'PR', 'z', 'Z', 'IQ', 'C', 'Note']} rows={rows} testId="transform" subtypeKey="T" viewProps={viewProps} />
    </>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

function TestView({ testId, viewProps }: { testId: TestId; viewProps: ViewProps }) {
  switch (testId) {
    case 'tmt':          return <TMTView viewProps={viewProps} />;
    case 'vlmt':         return <VLMTView viewProps={viewProps} />;
    case 'zzt':          return <ZZTView viewProps={viewProps} />;
    case 'zahlenspanne': return <ZahlenspanneView viewProps={viewProps} />;
    case 'blockspanne':  return <BlockspanneView viewProps={viewProps} />;
    case 'mosaik':       return <MosaikView viewProps={viewProps} />;
    case 'lg':           return <LGView viewProps={viewProps} />;
    case 'tol':          return <TOLView viewProps={viewProps} />;
    case 'rocft':        return <ROCFTView viewProps={viewProps} />;
    case 'wms_vw':       return <WMSVWView viewProps={viewProps} />;
    case 'transform':    return <TransformView viewProps={viewProps} />;
  }
}

// ── Password modal ────────────────────────────────────────────────────────────

const EDIT_PASSWORD = 'oliversacks';

function PasswordModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === EDIT_PASSWORD) { onSuccess(); }
    else { setError('Falsches Passwort'); setPw(''); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-xs mx-4 overflow-hidden">
        <div className="px-5 py-2.5 bg-slate-800 flex items-center gap-2">
          <Lock size={13} className="text-slate-300" />
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Normen bearbeiten – Passwort</span>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Normänderungen wirken sich auf alle Benutzer und alle zukünftigen Berechnungen aus.
            Bitte Passwort eingeben.
          </p>
          <input
            ref={inputRef}
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setError(''); }}
            placeholder="Passwort…"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
          />
          {error && <p className="text-xs text-rose-500 font-medium bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 px-3 py-2 rounded-xl">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all">
              Abbrechen
            </button>
            <button type="submit"
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-all">
              Entsperren
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assignment field ──────────────────────────────────────────────────────────

function AssignmentField({ testId, value, onSave }: { testId: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };
  if (editing) return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value); } }}
      placeholder="Zuständig: Name…"
      className="text-[11px] font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1 outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 shadow-sm w-full transition-all"
    />
  );
  return (
    <button onClick={() => { setDraft(value); setEditing(true); }}
      className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors text-left w-full truncate">
      <UserCheck size={12} className="shrink-0" />
      <span className="truncate">{value || 'Zuständig: –'}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const NormenVerifizierenTab: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    overrides, assignments, verificationStore,
    saveOverride, removeOverride, setAssignment,
    saveVerification, resetVerification,
  } = useNormOverrides();

  const [selectedTest, setSelectedTest] = useState<TestId | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editBaseValRef = useRef<string | number | null>(null);

  const overrideCount = Object.keys(overrides).length;

  const handleEditStart = (key: string, currentBaseVal: string | number | null) => {
    const override = overrides[key];
    setEditingKey(key);
    setEditDraft(String(override !== undefined ? override.value : (currentBaseVal ?? '')));
    editBaseValRef.current = currentBaseVal;
  };

  const handleEditCommit = async () => {
    if (!editingKey || !currentUser) return;
    const raw = editDraft.trim();
    if (raw === '') { setEditingKey(null); return; }
    const newVal: string | number = isNaN(Number(raw)) ? raw : Number(raw);
    const originalVal = editBaseValRef.current;
    await saveOverride(editingKey, newVal, originalVal, currentUser);
    setEditingKey(null);
  };

  const handleEditCancel = () => { setEditingKey(null); };

  const handleRemoveOverride = async (key: string) => {
    await removeOverride(key);
    if (editingKey === key) setEditingKey(null);
  };

  const viewProps: ViewProps = {
    testId: selectedTest ?? '',
    editMode,
    overrides,
    editingKey,
    editDraft,
    onEditStart: handleEditStart,
    onEditCommit: handleEditCommit,
    onEditCancel: handleEditCancel,
    onDraftChange: setEditDraft,
    onRemoveOverride: handleRemoveOverride,
  };

  const currentStatus = selectedTest ? ((verificationStore[selectedTest]?.status as VerificationStatus) ?? 'unverified') : 'unverified';
  const cfg = statusCfg(currentStatus);

  return (
    <div className="space-y-4 pb-10">

      {showPasswordModal && (
        <PasswordModal
          onSuccess={() => { setEditMode(true); setShowPasswordModal(false); }}
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {/* ── Header bar ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md shadow-slate-200/60 dark:shadow-none overflow-hidden">
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-800">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Normen verwalten</span>
          {overrideCount > 0 && (
            <span className="text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
              {overrideCount} überschriebene Werte
            </span>
          )}
        </div>
        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            Prozentrangberechnung für jeden Test prüfen, Mitarbeiter zuweisen und bei Bedarf Normwerte anpassen.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {editMode ? (
              <>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-2.5 py-1.5 rounded-xl">
                  <Pencil size={11} /> Editiermodus aktiv
                </span>
                {overrideCount > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Alle ${overrideCount} Normwert-Änderungen zurücksetzen?`)) {
                        Object.keys(overrides).forEach(k => removeOverride(k));
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 rounded-xl text-[10px] font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                  >
                    <RotateCcwSquare size={11} /> Alle zurücksetzen
                  </button>
                )}
                <button
                  onClick={() => { setEditMode(false); setEditingKey(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-600 transition-all"
                >
                  <Lock size={11} /> Sperren
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-600 transition-all"
              >
                <Unlock size={11} /> Normen bearbeiten
              </button>
            )}
          </div>
        </div>

        {/* Edit mode hint */}
        {editMode && (
          <div className="mx-5 mb-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
            <Pencil size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
              Auf eine Zelle klicken zum Bearbeiten. Rechtsklick auf eine geänderte Zelle setzt den Wert zurück.
              Änderungen sind sofort für alle Benutzer sichtbar.
            </p>
          </div>
        )}
      </div>

      {/* ── Overview grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {TESTS.filter(t => ZZT_ENABLED || t.id !== 'zzt').map(test => {
          const s = (verificationStore[test.id]?.status as VerificationStatus) ?? 'unverified';
          const c = statusCfg(s);
          const isSelected = selectedTest === test.id;
          const hasOverrides = Object.keys(overrides).some(k => k.startsWith(`${test.id}|`));
          const assignedTo = assignments[test.id] ?? '';
          return (
            <button
              key={test.id}
              onClick={() => setSelectedTest(test.id as TestId)}
              className={cn(
                'flex flex-col gap-1.5 p-3.5 rounded-2xl border text-left transition-all',
                isSelected
                  ? 'border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-700/60 shadow-md shadow-slate-200/60 dark:shadow-none'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{test.label}</span>
                <div className="flex items-center gap-1">
                  {hasOverrides && <span title="Normwerte geändert" className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                  <c.Icon size={14} className={c.color} />
                </div>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{test.subtitle}</span>
              <span className={cn('text-[10px] font-semibold mt-0.5', c.color)}>{c.label}</span>
              {assignedTo && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 truncate">
                  <UserCheck size={10} className="shrink-0" />
                  <span className="truncate">{assignedTo}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Selected test panel ── */}
      {selectedTest && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md shadow-slate-200/60 dark:shadow-none overflow-hidden">

          {/* Dark section header */}
          <div className="flex items-center justify-between px-5 py-2.5 bg-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold text-white uppercase tracking-widest shrink-0">
                {TESTS.find(t => t.id === selectedTest)?.label}
              </span>
              <span className="text-[10px] text-slate-400 truncate hidden sm:block">
                {TESTS.find(t => t.id === selectedTest)?.subtitle}
              </span>
            </div>
            <button
              onClick={() => setSelectedTest(null)}
              className="text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition-colors shrink-0 ml-3"
            >
              ✕
            </button>
          </div>

          {/* Status + assignment + actions */}
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="min-w-0 flex-1 space-y-2">
              {/* Status badge */}
              <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-semibold', cfg.bannerBg, cfg.color)}>
                <cfg.Icon size={11} />
                {cfg.label}
                {verificationStore[selectedTest]?.date && (
                  <span className="font-normal opacity-70 ml-1">
                    · {new Date(verificationStore[selectedTest].date).toLocaleDateString('de-DE')}
                    {verificationStore[selectedTest]?.verifiedBy && <> · {verificationStore[selectedTest].verifiedBy}</>}
                  </span>
                )}
              </div>
              {/* Assignment */}
              <div className="max-w-[220px]">
                <AssignmentField
                  testId={selectedTest}
                  value={assignments[selectedTest] ?? ''}
                  onSave={v => setAssignment(selectedTest, v)}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {currentStatus !== 'unverified' && (
                <button
                  onClick={() => resetVerification(selectedTest)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all"
                >
                  <RotateCcw size={12} /> Zurücksetzen
                </button>
              )}
              <button
                onClick={() => saveVerification(selectedTest, 'incorrect', currentUser ?? '')}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-semibold transition-all',
                  currentStatus === 'incorrect'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40',
                )}
              >
                <XCircle size={13} /> Vorerst falsch
              </button>
              <button
                onClick={() => saveVerification(selectedTest, 'verified', currentUser ?? '')}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-semibold transition-all',
                  currentStatus === 'verified'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
                )}
              >
                <CheckCircle2 size={13} /> Verifiziert
              </button>
            </div>
          </div>

          {/* Table area */}
          <div className="p-5">
            <TestView testId={selectedTest} viewProps={viewProps} />
          </div>
        </div>
      )}

      {!selectedTest && (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Test auswählen um die Normtabelle anzuzeigen.
          </p>
        </div>
      )}

      {/* ── TAP Normen-DB ── */}
      <TapNormDbSection />
    </div>
  );
};

// ── TAP Norm DB section ────────────────────────────────────────────────────────

const TEST_LABELS: Record<string, string> = {
  alertnessM_rt: 'Alertness [M] – RT', alertnessM_sd: 'Alertness [M] – SD',
  alertness23_ohne_rt: 'Alertness 2.3 ohne – RT', alertness23_ohne_sd: 'Alertness 2.3 ohne – SD',
  alertness23_mit_rt: 'Alertness 2.3 mit – RT', alertness23_mit_sd: 'Alertness 2.3 mit – SD',
  gonogo1_rt: 'Go/Nogo 1 – RT', gonogo1_fehler: 'Go/Nogo 1 – Fehler',
  gonogo2_rt: 'Go/Nogo 2 – RT', gonogo2_fehler: 'Go/Nogo 2 – Fehler',
  flexibilitaet_rt: 'Flexibilität – RT', flexibilitaet_fehler: 'Flexibilität – Fehler',
  geteilte_aud_rt: 'Get. Aufm. auditiv – RT', geteilte_vis_rt: 'Get. Aufm. visuell – RT',
  vigilanz_rt: 'Vigilanz – RT', arbeitsgedaechtnis_rt: 'Arbeitsgedächtnis – RT',
  scanning_rt_krit: 'Vis. Scanning – RT krit.', scanning_rt_nkrit: 'Vis. Scanning – RT n-krit.',
};

function TapNormDbSection() {
  const [stats, setStats] = useState(() => aggregateNormData());
  const [byAgeData, setByAgeData] = useState(() => aggregateByExactAge());
  const total = getTapNormData().length;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const handleClear = () => {
    if (!window.confirm('Alle gesammelten TAP-Normdaten löschen?')) return;
    clearTapNormData();
    setStats([]);
    setByAgeData([]);
  };

  const toggleExpand = (test: string) => {
    setExpanded(prev => { const s = new Set(prev); s.has(test) ? s.delete(test) : s.add(test); return s; });
  };

  if (stats.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md shadow-slate-200/60 dark:shadow-none overflow-hidden">
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-800">
          <div className="flex items-center gap-2">
            <DatabaseZap size={13} className="text-slate-400" />
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">TAP eigene Normdaten</span>
          </div>
        </div>
        <p className="px-5 py-4 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
          Noch keine Daten gesammelt. TAP-Ergebnisse werden beim Speichern anonym hinterlegt und nach und nach als lokale Referenz aufgebaut.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md shadow-slate-200/60 dark:shadow-none overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2.5 bg-slate-800">
        <div className="flex items-center gap-2">
          <DatabaseZap size={13} className="text-slate-400" />
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">TAP eigene Normdaten</span>
          <span className="text-[9px] font-semibold bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md">{total} Einträge</span>
        </div>
        <button onClick={handleClear} title="Alle TAP-Normdaten löschen"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-rose-500 hover:bg-rose-50/10 transition-colors">
          <Trash2 size={11} /> Löschen
        </button>
      </div>
      <div className="px-5 py-3">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
          Anonyme Sammlung aus eigenen Messungen. Werte unter n=3 grau. Zeile aufklappen für Altersdetails.
        </p>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full border-collapse text-left text-[10px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 text-left w-8" />
                <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 text-left">Test</th>
                <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 text-center">n ges.</th>
                <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 text-center">Median-PR</th>
                <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 text-center">18–39</th>
                <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 text-center">40–59</th>
                <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 text-center">60–79</th>
                <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 text-center">80+</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
              {stats.map(stat => {
                const isOpen = expanded.has(stat.test);
                const ageDetail = byAgeData.find(b => b.test === stat.test);
                const getAge = (label: string) => stat.ageGroups.find(g => g.label === label);
                const cell = (label: string) => {
                  const g = getAge(label);
                  if (!g) return <td key={label} className="px-3 py-2 text-center text-slate-200 dark:text-slate-700">–</td>;
                  return (
                    <td key={label} className={cn('px-3 py-2 text-center font-mono', g.count < 3 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200')}>
                      {g.medianPr.toFixed(0)}<span className="text-[8px] text-slate-400 ml-0.5">n={g.count}</span>
                    </td>
                  );
                };
                return (
                  <React.Fragment key={stat.test}>
                    <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => toggleExpand(stat.test)}>
                      <td className="px-3 py-2 text-center"><ChevronDown size={12} className={cn('text-slate-400 transition-transform duration-150 mx-auto', isOpen && 'rotate-180')} /></td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-medium">{TEST_LABELS[stat.test] ?? stat.test}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600 dark:text-slate-300">{stat.count}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600 dark:text-slate-300">{stat.medianPr.toFixed(0)}</td>
                      {cell('18–39')}{cell('40–59')}{cell('60–79')}{cell('80+')}
                    </tr>
                    {isOpen && ageDetail && (
                      <tr>
                        <td colSpan={8} className="px-0 py-0 bg-slate-50/60 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-700/40">
                          <div className="px-4 py-2">
                            <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Einzelalter — {TEST_LABELS[stat.test] ?? stat.test}</p>
                            <div className="overflow-x-auto">
                              <table className="text-[10px] border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-slate-600">
                                    <th className="px-2 py-1 font-semibold text-slate-400 text-left w-16">Alter</th>
                                    <th className="px-2 py-1 font-semibold text-slate-400 text-center w-10">n</th>
                                    <th className="px-2 py-1 font-semibold text-slate-400 text-center w-24">Median Rohwert</th>
                                    <th className="px-2 py-1 font-semibold text-slate-400 text-center w-20">Median PR</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/30">
                                  {ageDetail.byAge.map(row => (
                                    <tr key={row.age} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30">
                                      <td className="px-2 py-1 font-mono text-slate-700 dark:text-slate-200">{row.age} J.</td>
                                      <td className={cn('px-2 py-1 text-center font-mono', row.n < 3 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300')}>{row.n}</td>
                                      <td className={cn('px-2 py-1 text-center font-mono', row.n < 3 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200')}>{row.medianRaw.toFixed(1)}</td>
                                      <td className={cn('px-2 py-1 text-center font-mono font-semibold', row.n < 3 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200')}>{row.medianPr.toFixed(0)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
