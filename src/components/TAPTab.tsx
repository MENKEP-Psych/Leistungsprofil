import React, { useState } from 'react';
import {
  Bell, BellOff, Save, CheckCircle2,
  History, ChevronDown, ChevronUp, Trash2, Check, Zap,
} from 'lucide-react';
import { Patient, TestResult } from '../types';
import { cn, formatDate } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { addNotification } from '../lib/notifications';
import { QuadValues, QuadGrid, decodeQuad, encodeQuad } from './NeglectShared';

// ── Types ────────────────────────────────────────────────────────────────────

interface SF {
  gn_ver: '2.3' | 'M';
  fl_ver: '2.3' | 'M';
  ga_ver: '2.3' | 'M';
  ve_ver: '2.3' | 'M';
  gf_eye: 'LA' | 'RA' | 'BA';

  flag_alM: boolean; flag_al23: boolean; flag_gn: boolean; flag_gn2: boolean;
  flag_fl: boolean;  flag_ga: boolean;   flag_vig: boolean; flag_ag: boolean;
  flag_ve: boolean;  flag_gf: boolean;   flag_neg: boolean;

  note_alM: string; note_al23: string; note_gn: string; note_gn2: string;
  note_fl: string;  note_ga: string;   note_vig: string; note_ag: string;
  note_ve: string;  note_gf: string;   note_neg: string;

  alM_rt: string; alM_sd: string; alM_pr: string; alM_sd_pr: string;

  al23_ohne_rt: string; al23_ohne_sd: string; al23_ohne_pr: string; al23_ohne_sd_pr: string;
  al23_mit_rt:  string; al23_mit_sd:  string; al23_mit_pr:  string; al23_mit_sd_pr:  string;
  al23_phasisch: string; al23_pr: string;

  gn_rt: string;  gn_sd: string;  gn_fehler: string;  gn_ausl: string;  gn_pr: string;  gn_sd_pr: string;
  gn2_rt: string; gn2_sd: string; gn2_fehler: string; gn2_ausl: string; gn2_pr: string; gn2_sd_pr: string;

  fl_rt: string; fl_sd: string; fl_fehler: string; fl_pr: string; fl_sd_pr: string;

  ga_rt: string; ga_sd: string; gv_rt: string; gv_sd: string;
  g_fehler: string; g_ausl_tone: string; g_ausl_quad: string; ga_pr: string;
  ga_sd_pr: string; gv_sd_pr: string;

  vig_rt: string; vig_sd: string; vig_fehler: string; vig_ausl: string; vig_pr: string; vig_sd_pr: string;
  ag_rt: string;  ag_sd: string;  ag_fehler: string;  ag_ausl: string;  ag_pr: string;  ag_sd_pr: string;

  ve_rt_krit:   string; ve_sd_krit:   string; ve_pr_krit:    string; ve_sd_pr_krit:   string;
  ve_rt_nkrit:  string; ve_sd_nkrit:  string; ve_pr_nkrit:   string; ve_sd_pr_nkrit:  string;
  ve_fehler: string; ve_pr_fehler: string;
  ve_ausl_krit: string; ve_pr_ausl: string;
  ve_zeilen_r:  string; ve_pr_zeilen: string;
  ve_spalten_r: string; ve_pr_spalten: string;

  gf_rt_l: string; gf_rt_r: string; gf_mq: string; gf_aq: string; gf_ausl: string; gf_pr: string;
  neg_rt_l: string; neg_rt_r: string; neg_mq: string; neg_aq: string; neg_ausl: string; neg_pr: string;
}

interface ColData {
  id: string | null;
  date: string;
  examiner: string;
  f: SF;
}

// ── PR Map exports (used by ProfileTab + exportPDF) ──────────────────────────

export const TAP_PR_MAP = [
  { key: 'alertnessM',         label: 'Alertness (TAP-M)',               domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'alertness23',        label: 'Alertness (TAP 2.3)',              domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'alertness23_ohne',   label: 'Alertness 2.3 – ohne Warnsignal', domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'alertness23_mit',    label: 'Alertness 2.3 – mit Warnsignal',  domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'gonogo',             label: 'Go/Nogo 1',                        domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'gonogo2',            label: 'Go/Nogo 2',                        domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'flexibilitaet',      label: 'Flexibilität',                     domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'geteilte',           label: 'Geteilte Aufmerksamkeit',          domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'vigilanz',           label: 'Vigilanz',                         domain: '1. Aufmerksamkeit (Vigilanz)' },
  { key: 'arbeitsgedaechtnis', label: 'Arbeitsgedächtnis (TAP)',          domain: '2. Gedächtnis (Arbeitsgedächtnis)' },
  { key: 'gf_pr',              label: 'Gesichtsfeld (TAP)',               domain: '6. Exploration' },
  { key: 'neg_pr',             label: 'Neglect (TAP)',                    domain: '6. Exploration' },
] as const;

export const TAP_SD_PR_MAP = [
  { key: 'alM_sd_pr',       rawKey: 'alM_sd',       label: 'Alertness [M] – SD',              unit: 'ms', domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'al23_ohne_sd_pr', rawKey: 'al23_ohne_sd', label: 'Alertness 2.3 ohne – SD',         unit: 'ms', domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'al23_mit_sd_pr',  rawKey: 'al23_mit_sd',  label: 'Alertness 2.3 mit – SD',          unit: 'ms', domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'gn_sd_pr',        rawKey: 'gn_sd',        label: 'Go/Nogo 1 – SD',                  unit: 'ms', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'gn2_sd_pr',       rawKey: 'gn2_sd',       label: 'Go/Nogo 2 – SD',                  unit: 'ms', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'fl_sd_pr',        rawKey: 'fl_sd',        label: 'Flexibilität – SD',                unit: 'ms', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'ga_sd_pr',        rawKey: 'ga_sd',        label: 'Get. Aufmerksamkeit aud. – SD',    unit: 'ms', domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'gv_sd_pr',        rawKey: 'gv_sd',        label: 'Get. Aufmerksamkeit vis. – SD',    unit: 'ms', domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'vig_sd_pr',       rawKey: 'vig_sd',       label: 'Vigilanz – SD',                   unit: 'ms', domain: '1. Aufmerksamkeit (Vigilanz)' },
  { key: 'ag_sd_pr',        rawKey: 'ag_sd',        label: 'Arbeitsgedächtnis – SD',           unit: 'ms', domain: '2. Gedächtnis (Arbeitsgedächtnis)' },
] as const;

export const TAP_VE_PR_MAP = [
  { key: 've_rt_krit_pr',   label: 'Vis. Scanning – RT (krit.)',    rawKey: 've_rt_krit',   unit: 'ms', domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_sd_krit_pr',   label: 'Vis. Scanning – SD (krit.)',    rawKey: 've_sd_krit',   unit: 'ms', domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_rt_nkrit_pr',  label: 'Vis. Scanning – RT (n-krit.)', rawKey: 've_rt_nkrit',  unit: 'ms', domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_sd_nkrit_pr',  label: 'Vis. Scanning – SD (n-krit.)', rawKey: 've_sd_nkrit',  unit: 'ms', domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_fehler_pr',    label: 'Vis. Scanning – Fehlreak.',     rawKey: 've_fehler',    unit: '',   domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_ausl_krit_pr', label: 'Vis. Scanning – Auslassungen',  rawKey: 've_ausl_krit', unit: '',   domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_zeilen_r_pr',  label: 'Vis. Scanning – Zeilen r',      rawKey: 've_zeilen_r',  unit: '',   domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_spalten_r_pr', label: 'Vis. Scanning – Spalten r',     rawKey: 've_spalten_r', unit: '',   domain: '1. Aufmerksamkeit (Visuell)' },
] as const;

// ── Empty state ───────────────────────────────────────────────────────────────

const emptyF = (): SF => ({
  gn_ver: '2.3', fl_ver: '2.3', ga_ver: '2.3', ve_ver: '2.3', gf_eye: 'BA',
  flag_alM: false, flag_al23: false, flag_gn: false, flag_gn2: false,
  flag_fl: false, flag_ga: false, flag_vig: false, flag_ag: false,
  flag_ve: false, flag_gf: false, flag_neg: false,
  note_alM: '', note_al23: '', note_gn: '', note_gn2: '',
  note_fl: '', note_ga: '', note_vig: '', note_ag: '',
  note_ve: '', note_gf: '', note_neg: '',
  alM_rt: '', alM_sd: '', alM_pr: '', alM_sd_pr: '',
  al23_ohne_rt: '', al23_ohne_sd: '', al23_ohne_pr: '', al23_ohne_sd_pr: '',
  al23_mit_rt:  '', al23_mit_sd:  '', al23_mit_pr:  '', al23_mit_sd_pr:  '',
  al23_phasisch: '', al23_pr: '',
  gn_rt:  '', gn_sd:  '', gn_fehler:  '', gn_ausl:  '', gn_pr:  '', gn_sd_pr:  '',
  gn2_rt: '', gn2_sd: '', gn2_fehler: '', gn2_ausl: '', gn2_pr: '', gn2_sd_pr: '',
  fl_rt: '', fl_sd: '', fl_fehler: '', fl_pr: '', fl_sd_pr: '',
  ga_rt: '', ga_sd: '', gv_rt: '', gv_sd: '',
  g_fehler: '', g_ausl_tone: '', g_ausl_quad: '', ga_pr: '',
  ga_sd_pr: '', gv_sd_pr: '',
  vig_rt: '', vig_sd: '', vig_fehler: '', vig_ausl: '', vig_pr: '', vig_sd_pr: '',
  ag_rt:  '', ag_sd:  '', ag_fehler:  '', ag_ausl:  '', ag_pr:  '', ag_sd_pr:  '',
  ve_rt_krit:  '', ve_sd_krit:  '', ve_pr_krit:   '', ve_sd_pr_krit:  '',
  ve_rt_nkrit: '', ve_sd_nkrit: '', ve_pr_nkrit:  '', ve_sd_pr_nkrit: '',
  ve_fehler: '', ve_pr_fehler: '',
  ve_ausl_krit: '', ve_pr_ausl: '',
  ve_zeilen_r:  '', ve_pr_zeilen: '',
  ve_spalten_r: '', ve_pr_spalten: '',
  gf_rt_l: '', gf_rt_r: '', gf_mq: '', gf_aq: '', gf_ausl: '', gf_pr: '',
  neg_rt_l: '', neg_rt_r: '', neg_mq: '', neg_aq: '', neg_ausl: '', neg_pr: '',
});

const emptyCol = (user: string): ColData => ({
  id: null,
  date: new Date().toISOString().split('T')[0],
  examiner: user,
  f: emptyF(),
});

// ── Encode ────────────────────────────────────────────────────────────────────

const encodeCol = (col: ColData): TestResult => {
  const f = col.f;
  return {
    id: col.id ?? Date.now().toString(),
    testId: 'tap',
    date: col.date,
    examiner: col.examiner,
    note: '',
    rawValues: {
      gn_ver: f.gn_ver, fl_ver: f.fl_ver, ga_ver: f.ga_ver, ve_ver: f.ve_ver, gf_eye: f.gf_eye,
      flag_alM: f.flag_alM ? 1 : 0, flag_al23: f.flag_al23 ? 1 : 0,
      flag_gn: f.flag_gn ? 1 : 0, flag_gn2: f.flag_gn2 ? 1 : 0,
      flag_fl: f.flag_fl ? 1 : 0, flag_ga: f.flag_ga ? 1 : 0,
      flag_vig: f.flag_vig ? 1 : 0, flag_ag: f.flag_ag ? 1 : 0,
      flag_ve: f.flag_ve ? 1 : 0, flag_gf: f.flag_gf ? 1 : 0, flag_neg: f.flag_neg ? 1 : 0,
      note_alM: f.note_alM, note_al23: f.note_al23, note_gn: f.note_gn, note_gn2: f.note_gn2,
      note_fl: f.note_fl, note_ga: f.note_ga, note_vig: f.note_vig, note_ag: f.note_ag,
      note_ve: f.note_ve, note_gf: f.note_gf, note_neg: f.note_neg,
      alM_rt: f.alM_rt, alM_sd: f.alM_sd, alM_sd_pr: f.alM_sd_pr,
      al23_ohne_rt: f.al23_ohne_rt, al23_ohne_sd: f.al23_ohne_sd, al23_ohne_sd_pr: f.al23_ohne_sd_pr,
      al23_mit_rt:  f.al23_mit_rt,  al23_mit_sd:  f.al23_mit_sd,  al23_mit_sd_pr:  f.al23_mit_sd_pr,
      al23_phasisch: f.al23_phasisch,
      gn_rt:  f.gn_rt,  gn_sd:  f.gn_sd,  gn_fehler:  f.gn_fehler,  gn_ausl:  f.gn_ausl,  gn_sd_pr:  f.gn_sd_pr,
      gn2_rt: f.gn2_rt, gn2_sd: f.gn2_sd, gn2_fehler: f.gn2_fehler, gn2_ausl: f.gn2_ausl, gn2_sd_pr: f.gn2_sd_pr,
      fl_rt: f.fl_rt, fl_sd: f.fl_sd, fl_fehler: f.fl_fehler, fl_sd_pr: f.fl_sd_pr,
      ga_rt: f.ga_rt, ga_sd: f.ga_sd, gv_rt: f.gv_rt, gv_sd: f.gv_sd,
      g_fehler: f.g_fehler, g_ausl_tone: f.g_ausl_tone, g_ausl_quad: f.g_ausl_quad,
      ga_sd_pr: f.ga_sd_pr, gv_sd_pr: f.gv_sd_pr,
      vig_rt: f.vig_rt, vig_sd: f.vig_sd, vig_fehler: f.vig_fehler, vig_ausl: f.vig_ausl, vig_sd_pr: f.vig_sd_pr,
      ag_rt:  f.ag_rt,  ag_sd:  f.ag_sd,  ag_fehler:  f.ag_fehler,  ag_ausl:  f.ag_ausl,  ag_sd_pr:  f.ag_sd_pr,
      ve_rt_krit: f.ve_rt_krit, ve_sd_krit: f.ve_sd_krit,
      ve_rt_nkrit: f.ve_rt_nkrit, ve_sd_nkrit: f.ve_sd_nkrit,
      ve_fehler: f.ve_fehler, ve_ausl_krit: f.ve_ausl_krit,
      ve_zeilen_r: f.ve_zeilen_r, ve_spalten_r: f.ve_spalten_r,
      gf_rt_l: f.gf_rt_l, gf_rt_r: f.gf_rt_r, gf_mq: f.gf_mq, gf_aq: f.gf_aq, gf_ausl: f.gf_ausl,
      neg_rt_l: f.neg_rt_l, neg_rt_r: f.neg_rt_r, neg_mq: f.neg_mq, neg_aq: f.neg_aq, neg_ausl: f.neg_ausl,
    },
    calculatedValues: {},
    percentileRanks: {
      alertnessM: f.alM_pr,
      alertness23: f.al23_pr,
      alertness23_ohne: f.al23_ohne_pr,
      alertness23_mit: f.al23_mit_pr,
      gonogo: f.gn_pr,
      gonogo2: f.gn2_pr,
      flexibilitaet: f.fl_pr,
      geteilte: f.ga_pr,
      vigilanz: f.vig_pr,
      arbeitsgedaechtnis: f.ag_pr,
      ve_rt_krit_pr:   f.ve_pr_krit,
      ve_sd_krit_pr:   f.ve_sd_pr_krit,
      ve_rt_nkrit_pr:  f.ve_pr_nkrit,
      ve_sd_nkrit_pr:  f.ve_sd_pr_nkrit,
      ve_fehler_pr:    f.ve_pr_fehler,
      ve_ausl_krit_pr: f.ve_pr_ausl,
      ve_zeilen_r_pr:  f.ve_pr_zeilen,
      ve_spalten_r_pr: f.ve_pr_spalten,
      gf_pr:  f.gf_pr,
      neg_pr: f.neg_pr,
    },
    normInfo: '',
  };
};

// ── Layout constants ──────────────────────────────────────────────────────────

const LW = 'w-36';   // 144px label column
const NW = 'w-44';   // 176px notes column

// ── Sub-components ────────────────────────────────────────────────────────────

const VerToggle: React.FC<{ value: '2.3' | 'M'; onChange: (v: '2.3' | 'M') => void }> = ({ value, onChange }) => (
  <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600 text-[9px] font-black shrink-0">
    {(['2.3', 'M'] as const).map(v => (
      <button key={v} type="button" onClick={() => onChange(v)} className={cn(
        'px-1.5 py-0.5 transition-colors',
        value === v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-500 hover:bg-slate-50',
      )}>{v}</button>
    ))}
  </div>
);

const EyeToggle: React.FC<{ value: 'LA' | 'RA' | 'BA'; onChange: (v: 'LA' | 'RA' | 'BA') => void }> = ({ value, onChange }) => (
  <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600 text-[9px] font-black shrink-0">
    {(['LA', 'RA', 'BA'] as const).map(v => (
      <button key={v} type="button" onClick={() => onChange(v)} className={cn(
        'px-1.5 py-0.5 transition-colors',
        value === v ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-500 hover:bg-slate-50',
      )}>{v}</button>
    ))}
  </div>
);

const FlagBtn: React.FC<{ flagged: boolean; onClick: () => void }> = ({ flagged, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={flagged ? 'Markierung aufheben' : 'Vor Entlassung wiederholen'}
    className={cn(
      'p-1.5 rounded transition-colors shrink-0',
      flagged
        ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-500'
        : 'text-slate-300 dark:text-slate-600 hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20',
    )}
  >
    {flagged ? <Bell size={17} /> : <BellOff size={17} />}
  </button>
);

const ValInput: React.FC<{
  prefix?: string; value: string; onChange: (v: string) => void;
  unit?: string; numeric?: boolean; placeholder?: string; wide?: boolean;
}> = ({ prefix, value, onChange, unit, numeric = true, placeholder = '—', wide }) => (
  <div className="flex items-center gap-0.5">
    {prefix && <span className="text-[9px] font-bold text-slate-400 w-5 text-right shrink-0">{prefix}</span>}
    <input
      type="text"
      inputMode={numeric ? 'numeric' : 'text'}
      value={value}
      onChange={e => onChange(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
      placeholder={placeholder}
      className={cn(
        'text-[11px] text-center font-mono text-slate-700 dark:text-slate-200',
        'bg-white dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600',
        'rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400',
        wide ? 'w-20' : 'w-14',
      )}
    />
    {unit && <span className="text-[9px] text-slate-400 shrink-0 ml-0.5">{unit}</span>}
  </div>
);

const PrInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  value, onChange, placeholder = 'PR',
}) => (
  <input
    type="text"
    inputMode="text"
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-12 text-[11px] text-center font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400"
  />
);

/** A data row inside a TestBlock */
const Row: React.FC<{ label: string; sub?: boolean; children: React.ReactNode }> = ({ label, sub, children }) => (
  <div className="flex items-center border-t border-slate-200 dark:border-slate-700 min-h-[2.1rem]">
    <div className={cn(
      LW, 'shrink-0 px-3 py-1.5 flex items-center',
      sub
        ? 'text-[10px] text-slate-400 dark:text-slate-500 italic'
        : 'text-[11px] font-bold text-slate-600 dark:text-slate-300',
    )}>
      {label}
    </div>
    <div className="flex-1 border-l border-slate-200 dark:border-slate-700 px-2.5 py-1.5 flex flex-wrap items-center gap-1.5">
      {children}
    </div>
  </div>
);

/** Sub-section label (e.g. "ohne Warnton") */
const SubHeader: React.FC<{ label: string }> = ({ label }) => (
  <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-1 bg-slate-50 dark:bg-slate-800/40">
    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 italic">{label}</span>
  </div>
);

/** Two-column value grid: left = M/s/F/A inputs, right = PR inputs */
const TGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2">
    {children}
  </div>
);

/** Full-width section divider between test groups */
const SectionDivider: React.FC<{ label: string }> = ({ label }) => (
  <div className="border-t-2 border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-700 px-3 py-1.5">
    <span className="text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{label}</span>
  </div>
);

/** TestBlock: block header + data rows (left) + notes textarea (right) */
const TestBlock: React.FC<{
  label: string; badge?: string; testKey: string;
  verKey?: 'gn_ver' | 'fl_ver' | 'ga_ver' | 've_ver';
  eyeKey?: boolean;
  col: ColData; upd: (f: Partial<SF>) => void;
  children: React.ReactNode;
}> = ({ label, badge, testKey, verKey, eyeKey, col, upd, children }) => {
  const flagKey = `flag_${testKey}` as keyof SF;
  const noteKey = `note_${testKey}` as keyof SF;
  return (
    <div className="flex border-t-2 border-slate-300 dark:border-slate-600">
      {/* Left: block header + rows */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60">
          <span className="text-[12px] font-black text-slate-700 dark:text-slate-200">{label}</span>
          {badge && (
            <span className="text-[9px] font-bold px-1.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{badge}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {verKey && <VerToggle value={col.f[verKey] as '2.3' | 'M'} onChange={v => upd({ [verKey]: v })} />}
            {eyeKey && <EyeToggle value={col.f.gf_eye} onChange={v => upd({ gf_eye: v })} />}
            <FlagBtn flagged={col.f[flagKey] as boolean} onClick={() => upd({ [flagKey]: !(col.f[flagKey] as boolean) })} />
          </div>
        </div>
        {children}
      </div>
      {/* Right: notes */}
      <div className={cn(NW, 'shrink-0 border-l-2 border-slate-300 dark:border-slate-600 p-2 bg-sky-50/20 dark:bg-sky-950/10')}>
        <textarea
          value={col.f[noteKey] as string}
          onChange={e => upd({ [noteKey]: e.target.value })}
          placeholder="Anmerkung…"
          className="w-full h-full min-h-[5rem] resize-none text-[11px] text-slate-700 dark:text-slate-200 bg-transparent outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed"
        />
      </div>
    </div>
  );
};

/** Quad grid row (single column) inside a TestBlock */
const QuadRow: React.FC<{
  label: string;
  mq: QuadValues; aq: QuadValues;
  onMq: (q: QuadValues) => void; onAq: (q: QuadValues) => void;
}> = ({ label, mq, aq, onMq, onAq }) => (
  <div className="flex items-start border-t border-slate-200 dark:border-slate-700">
    <div className={cn(LW, 'shrink-0 px-3 py-2 text-[10px] text-slate-400 dark:text-slate-500 italic flex items-start')}>
      {label}
    </div>
    <div className="flex-1 border-l border-slate-200 dark:border-slate-700 px-2.5 py-2 flex items-start gap-4">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-slate-400">M</span>
        <QuadGrid value={mq} onChange={onMq} shape="cross" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-slate-400">A</span>
        <QuadGrid value={aq} onChange={onAq} shape="circle" />
      </div>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

interface TAPTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (r: TestResult) => void;
  onUpdate: (r: TestResult) => void;
  onDelete: (id: string) => void;
}

export const TAPTab: React.FC<TAPTabProps> = ({
  patient, previousResults, onSave, onUpdate, onDelete,
}) => {
  const { currentUser } = useAuth();
  const [col, setCol] = useState<ColData>(() => emptyCol(currentUser ?? ''));
  const [saved, setSaved] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [nichtErschienen, setNichtErschienen] = useState(false);
  const [nichtErschienienTest, setNichtErschienienTest] = useState('');

  const upd = (f: Partial<SF>) => setCol(prev => ({ ...prev, f: { ...prev.f, ...f } }));

  const handleSave = () => {
    const id = col.id ?? Date.now().toString();
    const saveDate = col.date || new Date().toISOString().split('T')[0];
    const result = encodeCol({ ...col, id, date: saveDate });
    onSave(result);

    // Auto-notification when patient did not appear
    if (nichtErschienen && patient.neuropsychologin && currentUser && patient.neuropsychologin !== currentUser) {
      const gebDatum = patient.geburtsdatum
        ? new Date(patient.geburtsdatum).toLocaleDateString('de-DE')
        : '?';
      const messDatum = col.date
        ? new Date(col.date).toLocaleDateString('de-DE')
        : new Date().toLocaleDateString('de-DE');
      const testPart = nichtErschienienTest ? ` (${nichtErschienienTest})` : '';
      const msg = `Patient „${patient.name} – Geb.-Datum: ${gebDatum}" ist nicht erschienen zur Messung am ${messDatum}${testPart}. (Automatisch gesendet durch ${currentUser})`;
      addNotification(currentUser, patient.neuropsychologin, msg, patient.name, true);
    }

    setCol(emptyCol(currentUser ?? ''));
    setNichtErschienen(false);
    setNichtErschienienTest('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tapResults = previousResults
    .filter(r => r.testId === 'tap')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none shrink-0">
          <Zap size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">TAP</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
            Testbatterie zur Aufmerksamkeitsprüfung · 2.3 &amp; TAP-M
            {tapResults.length > 0 && ` · ${tapResults.length} Messung${tapResults.length !== 1 ? 'en' : ''}`}
          </p>
        </div>
      </div>

      {/* ── MAIN FORM ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-300 dark:border-slate-600 shadow-sm overflow-x-auto">

        {/* Column header row */}
        <div className="flex bg-indigo-600 text-white">
          <div className={cn(LW, 'shrink-0 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest')}>Testverfahren</div>
          <div className="flex-1 border-l border-indigo-500 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">Werte</div>
          <div className={cn(NW, 'shrink-0 border-l border-indigo-500 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest')}>Anmerkungen</div>
        </div>

        {/* Date / Examiner / Save row */}
        <div className="flex border-b-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60">
          <div className={cn(LW, 'shrink-0 flex items-center px-3 py-2 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest')}>
            Datum · Untersucher
          </div>
          <div className="flex-1 border-l border-slate-300 dark:border-slate-600 px-2 py-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={col.date}
              onChange={e => setCol({ ...col, date: e.target.value })}
              className="text-[11px] px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-200"
            />
            <input
              type="text"
              value={col.examiner}
              onChange={e => setCol({ ...col, examiner: e.target.value })}
              placeholder="Untersucher"
              className="text-[11px] px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-200 w-28"
            />
            <label className="flex items-center gap-1.5 cursor-pointer select-none ml-1">
              <input
                type="checkbox"
                checked={nichtErschienen}
                onChange={e => { setNichtErschienen(e.target.checked); if (!e.target.checked) setNichtErschienienTest(''); }}
                className="w-3.5 h-3.5 rounded accent-rose-500 cursor-pointer"
              />
              <span className="text-[10px] font-bold text-rose-500">Nicht erschienen</span>
            </label>
            {nichtErschienen && (
              <select
                value={nichtErschienienTest}
                onChange={e => setNichtErschienienTest(e.target.value)}
                className="text-[10px] px-1.5 py-1 bg-white dark:bg-slate-700 border border-rose-300 dark:border-rose-700 rounded-lg outline-none focus:ring-1 focus:ring-rose-400 text-slate-700 dark:text-slate-200"
              >
                <option value="">— Test (optional) —</option>
                <option value="Alertness (TAP-M)">Alertness (TAP-M)</option>
                <option value="Alertness (TAP 2.3)">Alertness (TAP 2.3)</option>
                <option value="Go/Nogo 1">Go/Nogo 1</option>
                <option value="Go/Nogo 2">Go/Nogo 2</option>
                <option value="Flexibilität">Flexibilität</option>
                <option value="Geteilte Aufmerksamkeit">Geteilte Aufmerksamkeit</option>
                <option value="Vigilanz">Vigilanz</option>
                <option value="Arbeitsgedächtnis">Arbeitsgedächtnis</option>
                <option value="Visuelles Scanning">Visuelles Scanning</option>
                <option value="Gesichtsfeld">Gesichtsfeld</option>
                <option value="Neglect">Neglect</option>
              </select>
            )}
            <button
              onClick={handleSave}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ml-auto',
                saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700',
              )}
            >
              {saved ? <><CheckCircle2 size={12} /> Gespeichert</> : <><Save size={12} /> Speichern</>}
            </button>
          </div>
          <div className={cn(NW, 'shrink-0 border-l-2 border-slate-300 dark:border-slate-600')} />
        </div>

        {/* ══════════ ALERTNESS ══════════ */}
        <SectionDivider label="Alertness" />

        <TestBlock label="Alertness" badge="[M]" testKey="alM" col={col} upd={upd}>
          <TGrid>
            <ValInput prefix="M=" value={col.f.alM_rt} onChange={v => upd({ alM_rt: v })} unit="ms" />
            <PrInput value={col.f.alM_pr} onChange={v => upd({ alM_pr: v })} />
            <ValInput prefix="s=" value={col.f.alM_sd} onChange={v => upd({ alM_sd: v })} unit="ms" />
            <PrInput value={col.f.alM_sd_pr} onChange={v => upd({ alM_sd_pr: v })} placeholder="PR-SD" />
          </TGrid>
        </TestBlock>

        <TestBlock label="Alertness" badge="[2.3]" testKey="al23" col={col} upd={upd}>
          <SubHeader label="ohne Warnton" />
          <TGrid>
            <ValInput prefix="M=" value={col.f.al23_ohne_rt} onChange={v => upd({ al23_ohne_rt: v })} unit="ms" />
            <PrInput value={col.f.al23_ohne_pr} onChange={v => upd({ al23_ohne_pr: v })} />
            <ValInput prefix="s=" value={col.f.al23_ohne_sd} onChange={v => upd({ al23_ohne_sd: v })} unit="ms" />
            <PrInput value={col.f.al23_ohne_sd_pr} onChange={v => upd({ al23_ohne_sd_pr: v })} placeholder="PR-SD" />
          </TGrid>
          <SubHeader label="mit Warnton 🔊" />
          <TGrid>
            <ValInput prefix="M=" value={col.f.al23_mit_rt} onChange={v => upd({ al23_mit_rt: v })} unit="ms" />
            <PrInput value={col.f.al23_mit_pr} onChange={v => upd({ al23_mit_pr: v })} />
            <ValInput prefix="s=" value={col.f.al23_mit_sd} onChange={v => upd({ al23_mit_sd: v })} unit="ms" />
            <PrInput value={col.f.al23_mit_sd_pr} onChange={v => upd({ al23_mit_sd_pr: v })} placeholder="PR-SD" />
          </TGrid>
          <TGrid>
            <ValInput value={col.f.al23_phasisch} onChange={v => upd({ al23_phasisch: v })} numeric={false} placeholder="Phasisch" />
            <PrInput value={col.f.al23_pr} onChange={v => upd({ al23_pr: v })} placeholder="PR ges." />
          </TGrid>
        </TestBlock>

        {/* ══════════ SELEKTIVE AUFMERKSAMKEIT ══════════ */}
        <SectionDivider label="Selektive Aufmerksamkeit" />

        <TestBlock label="Go/Nogo 1" testKey="gn" verKey="gn_ver" col={col} upd={upd}>
          <TGrid>
            <ValInput prefix="M=" value={col.f.gn_rt} onChange={v => upd({ gn_rt: v })} unit="ms" />
            <PrInput value={col.f.gn_pr} onChange={v => upd({ gn_pr: v })} />
            <ValInput prefix="s=" value={col.f.gn_sd} onChange={v => upd({ gn_sd: v })} unit="ms" />
            <PrInput value={col.f.gn_sd_pr} onChange={v => upd({ gn_sd_pr: v })} placeholder="PR-SD" />
            <ValInput prefix="F=" value={col.f.gn_fehler} onChange={v => upd({ gn_fehler: v })} />
            <span />
            <ValInput prefix="A=" value={col.f.gn_ausl} onChange={v => upd({ gn_ausl: v })} />
            <span />
          </TGrid>
        </TestBlock>

        <TestBlock label="Go/Nogo 2" badge="[2.3]" testKey="gn2" col={col} upd={upd}>
          <TGrid>
            <ValInput prefix="M=" value={col.f.gn2_rt} onChange={v => upd({ gn2_rt: v })} unit="ms" />
            <PrInput value={col.f.gn2_pr} onChange={v => upd({ gn2_pr: v })} />
            <ValInput prefix="s=" value={col.f.gn2_sd} onChange={v => upd({ gn2_sd: v })} unit="ms" />
            <PrInput value={col.f.gn2_sd_pr} onChange={v => upd({ gn2_sd_pr: v })} placeholder="PR-SD" />
            <ValInput prefix="F=" value={col.f.gn2_fehler} onChange={v => upd({ gn2_fehler: v })} />
            <span />
            <ValInput prefix="A=" value={col.f.gn2_ausl} onChange={v => upd({ gn2_ausl: v })} />
            <span />
          </TGrid>
        </TestBlock>

        <TestBlock label="Flexibilität" testKey="fl" verKey="fl_ver" col={col} upd={upd}>
          <TGrid>
            <ValInput prefix="M=" value={col.f.fl_rt} onChange={v => upd({ fl_rt: v })} unit="ms" />
            <PrInput value={col.f.fl_pr} onChange={v => upd({ fl_pr: v })} />
            <ValInput prefix="s=" value={col.f.fl_sd} onChange={v => upd({ fl_sd: v })} unit="ms" />
            <PrInput value={col.f.fl_sd_pr} onChange={v => upd({ fl_sd_pr: v })} placeholder="PR-SD" />
            <ValInput prefix="F=" value={col.f.fl_fehler} onChange={v => upd({ fl_fehler: v })} />
            <span />
          </TGrid>
        </TestBlock>

        <TestBlock label="Geteilte Aufmerksamkeit" testKey="ga" verKey="ga_ver" col={col} upd={upd}>
          <SubHeader label="Auditiv" />
          <TGrid>
            <ValInput prefix="M=" value={col.f.ga_rt} onChange={v => upd({ ga_rt: v })} unit="ms" />
            <PrInput value={col.f.ga_pr} onChange={v => upd({ ga_pr: v })} />
            <ValInput prefix="s=" value={col.f.ga_sd} onChange={v => upd({ ga_sd: v })} unit="ms" />
            <PrInput value={col.f.ga_sd_pr} onChange={v => upd({ ga_sd_pr: v })} placeholder="PR-SD" />
          </TGrid>
          <SubHeader label="Visuell" />
          <TGrid>
            <ValInput prefix="M=" value={col.f.gv_rt} onChange={v => upd({ gv_rt: v })} unit="ms" />
            <span />
            <ValInput prefix="s=" value={col.f.gv_sd} onChange={v => upd({ gv_sd: v })} unit="ms" />
            <PrInput value={col.f.gv_sd_pr} onChange={v => upd({ gv_sd_pr: v })} placeholder="PR-SD" />
          </TGrid>
          <SubHeader label="Fehler · Auslassungen" />
          <TGrid>
            <ValInput prefix="F=" value={col.f.g_fehler} onChange={v => upd({ g_fehler: v })} />
            <span />
            <ValInput prefix="A♪=" value={col.f.g_ausl_tone} onChange={v => upd({ g_ausl_tone: v })} />
            <span />
            <ValInput prefix="A⊞=" value={col.f.g_ausl_quad} onChange={v => upd({ g_ausl_quad: v })} />
            <span />
          </TGrid>
        </TestBlock>

        <TestBlock label="Vigilanz" badge="[2.3]" testKey="vig" col={col} upd={upd}>
          <TGrid>
            <ValInput prefix="M=" value={col.f.vig_rt} onChange={v => upd({ vig_rt: v })} unit="ms" />
            <PrInput value={col.f.vig_pr} onChange={v => upd({ vig_pr: v })} />
            <ValInput prefix="s=" value={col.f.vig_sd} onChange={v => upd({ vig_sd: v })} unit="ms" />
            <PrInput value={col.f.vig_sd_pr} onChange={v => upd({ vig_sd_pr: v })} placeholder="PR-SD" />
            <ValInput prefix="F=" value={col.f.vig_fehler} onChange={v => upd({ vig_fehler: v })} />
            <span />
            <ValInput prefix="A=" value={col.f.vig_ausl} onChange={v => upd({ vig_ausl: v })} />
            <span />
          </TGrid>
        </TestBlock>

        {/* ══════════ GEDÄCHTNIS ══════════ */}
        <SectionDivider label="Gedächtnis" />

        <TestBlock label="Arbeitsgedächtnis" badge="[2.3]" testKey="ag" col={col} upd={upd}>
          <TGrid>
            <ValInput prefix="M=" value={col.f.ag_rt} onChange={v => upd({ ag_rt: v })} unit="ms" />
            <PrInput value={col.f.ag_pr} onChange={v => upd({ ag_pr: v })} />
            <ValInput prefix="s=" value={col.f.ag_sd} onChange={v => upd({ ag_sd: v })} unit="ms" />
            <PrInput value={col.f.ag_sd_pr} onChange={v => upd({ ag_sd_pr: v })} placeholder="PR-SD" />
            <ValInput prefix="F=" value={col.f.ag_fehler} onChange={v => upd({ ag_fehler: v })} />
            <span />
            <ValInput prefix="A=" value={col.f.ag_ausl} onChange={v => upd({ ag_ausl: v })} />
            <span />
          </TGrid>
        </TestBlock>

        {/* ══════════ VISUELLES SCANNING ══════════ */}
        <SectionDivider label="Visuelles Scanning" />

        <TestBlock label="Visuelles Scanning" testKey="ve" verKey="ve_ver" col={col} upd={upd}>
          <SubHeader label="Kritische Stimuli" />
          <TGrid>
            <ValInput prefix="M=" value={col.f.ve_rt_krit} onChange={v => upd({ ve_rt_krit: v })} unit="ms" />
            <PrInput value={col.f.ve_pr_krit} onChange={v => upd({ ve_pr_krit: v })} />
            <ValInput prefix="s=" value={col.f.ve_sd_krit} onChange={v => upd({ ve_sd_krit: v })} unit="ms" />
            <PrInput value={col.f.ve_sd_pr_krit} onChange={v => upd({ ve_sd_pr_krit: v })} placeholder="PR-SD" />
          </TGrid>
          <SubHeader label="Nicht-kritische Stimuli" />
          <TGrid>
            <ValInput prefix="M=" value={col.f.ve_rt_nkrit} onChange={v => upd({ ve_rt_nkrit: v })} unit="ms" />
            <PrInput value={col.f.ve_pr_nkrit} onChange={v => upd({ ve_pr_nkrit: v })} />
            <ValInput prefix="s=" value={col.f.ve_sd_nkrit} onChange={v => upd({ ve_sd_nkrit: v })} unit="ms" />
            <PrInput value={col.f.ve_sd_pr_nkrit} onChange={v => upd({ ve_sd_pr_nkrit: v })} placeholder="PR-SD" />
          </TGrid>
          <SubHeader label="Fehler · Auslassungen · Zeilen · Spalten" />
          <TGrid>
            <ValInput prefix="F=" value={col.f.ve_fehler} onChange={v => upd({ ve_fehler: v })} />
            <PrInput value={col.f.ve_pr_fehler} onChange={v => upd({ ve_pr_fehler: v })} placeholder="PR-F" />
            <ValInput prefix="A=" value={col.f.ve_ausl_krit} onChange={v => upd({ ve_ausl_krit: v })} />
            <PrInput value={col.f.ve_pr_ausl} onChange={v => upd({ ve_pr_ausl: v })} placeholder="PR-A" />
            <ValInput prefix="Z=" value={col.f.ve_zeilen_r} onChange={v => upd({ ve_zeilen_r: v })} />
            <PrInput value={col.f.ve_pr_zeilen} onChange={v => upd({ ve_pr_zeilen: v })} placeholder="PR-Z" />
            <ValInput prefix="S=" value={col.f.ve_spalten_r} onChange={v => upd({ ve_spalten_r: v })} />
            <PrInput value={col.f.ve_pr_spalten} onChange={v => upd({ ve_pr_spalten: v })} placeholder="PR-S" />
          </TGrid>
        </TestBlock>

        {/* ══════════ GESICHTSFELD & NEGLECT ══════════ */}
        <SectionDivider label="Gesichtsfeld &amp; Neglect" />

        <TestBlock label="Gesichtsfeld" badge="[2.3]" testKey="gf" eyeKey col={col} upd={upd}>
          <TGrid>
            <ValInput prefix="L=" value={col.f.gf_rt_l} onChange={v => upd({ gf_rt_l: v })} unit="ms" />
            <PrInput value={col.f.gf_pr} onChange={v => upd({ gf_pr: v })} />
            <ValInput prefix="R=" value={col.f.gf_rt_r} onChange={v => upd({ gf_rt_r: v })} unit="ms" />
            <ValInput prefix="A=" value={col.f.gf_ausl} onChange={v => upd({ gf_ausl: v })} />
          </TGrid>
          <QuadRow
            label="RT Quadranten"
            mq={decodeQuad(col.f.gf_mq)} aq={decodeQuad(col.f.gf_aq)}
            onMq={q => upd({ gf_mq: encodeQuad(q) })} onAq={q => upd({ gf_aq: encodeQuad(q) })}
          />
        </TestBlock>

        <TestBlock label="Neglect" badge="[2.3]" testKey="neg" col={col} upd={upd}>
          <TGrid>
            <ValInput prefix="L=" value={col.f.neg_rt_l} onChange={v => upd({ neg_rt_l: v })} unit="ms" />
            <PrInput value={col.f.neg_pr} onChange={v => upd({ neg_pr: v })} />
            <ValInput prefix="R=" value={col.f.neg_rt_r} onChange={v => upd({ neg_rt_r: v })} unit="ms" />
            <ValInput prefix="A=" value={col.f.neg_ausl} onChange={v => upd({ neg_ausl: v })} />
          </TGrid>
          <QuadRow
            label="RT Quadranten"
            mq={decodeQuad(col.f.neg_mq)} aq={decodeQuad(col.f.neg_aq)}
            onMq={q => upd({ neg_mq: encodeQuad(q) })} onAq={q => upd({ neg_aq: encodeQuad(q) })}
          />
        </TestBlock>

      </div>{/* end form card */}

      {/* ── HISTORY ── */}
      {tapResults.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <button
            onClick={() => setExpandedHistory(v => !v)}
            className="flex items-center gap-2 text-sm font-black text-slate-600 dark:text-slate-300 w-full"
          >
            <History size={16} className="text-indigo-500" />
            Verlauf ({tapResults.length} Messung{tapResults.length !== 1 ? 'en' : ''})
            {expandedHistory ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
          </button>
          {expandedHistory && (
            <div className="mt-3 space-y-2">
              {tapResults.map((res, idx) => (
                <div key={res.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-xs">
                  {idx === 0 && (
                    <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded uppercase tracking-wide">neueste</span>
                  )}
                  <span className="font-bold text-slate-700 dark:text-slate-200">{formatDate(res.date)}</span>
                  {res.examiner && <span className="text-slate-400">{res.examiner}</span>}
                  <div className="ml-auto flex items-center gap-1">
                    {confirmDeleteId === res.id ? (
                      <>
                        <button
                          onClick={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                          className="px-2 py-1 text-[10px] font-black bg-red-100 text-red-600 rounded-lg hover:bg-red-200 flex items-center gap-1"
                        >
                          <Check size={11} /> Löschen
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </>
                    ) : (
                      patient.status !== 'entlassen' && (
                        <button
                          onClick={() => setConfirmDeleteId(res.id)}
                          className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"
                          title="Löschen"
                        >
                          <Trash2 size={12} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
