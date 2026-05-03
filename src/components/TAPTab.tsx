import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import {
  Bell, BellOff, Save, CheckCircle2,
  History, ChevronDown, ChevronUp, Trash2, Check, Zap,
  StickyNote, X,
} from 'lucide-react';
import { Patient, TestResult } from '../types';
import { cn, formatDate } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { addNotification } from '../lib/notifications';
import { QuadValues, QuadGrid, decodeQuad, encodeQuad } from './NeglectShared';
import { AbortButton, AbortBadge } from './TestForm';

// TODO: TAP-Normen als JSON einpflegen für automatische PR-Berechnung aus Rohwerten.
// Aktuell werden PR-Werte manuell aus dem TAP-Protokollbogen abgelesen und eingetragen.
// Normenquelle: Zimmermann & Fimm (2002/2012), TAP 2.3 Normierungsstichprobe.

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── PR Map exports (used by ProfileTab + exportPDF) ───────────────────────────

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

// ── Empty state ────────────────────────────────────────────────────────────────

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

// ── Encode ─────────────────────────────────────────────────────────────────────

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

// ── Primitive inputs ───────────────────────────────────────────────────────────

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
      'p-1 rounded transition-colors shrink-0',
      flagged
        ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-500'
        : 'text-slate-300 dark:text-slate-600 hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20',
    )}
  >
    {flagged ? <Bell size={13} /> : <BellOff size={13} />}
  </button>
);

/** Raw value input — compact for table layout */
const Val: React.FC<{
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  placeholder?: string;
  unit?: string;
}> = ({ value, onChange, numeric = true, placeholder = '—', unit }) => (
  <div className="flex items-center gap-0.5">
    <input
      type="text"
      inputMode={numeric ? 'numeric' : 'text'}
      value={value}
      onChange={e => onChange(numeric ? e.target.value.replace(/[^\d,.-]/g, '') : e.target.value)}
      placeholder={placeholder}
      className="w-14 text-[11px] text-center font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded px-1 py-[3px] outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
    />
    {unit && <span className="text-[9px] text-slate-400 dark:text-slate-500 ml-0.5 shrink-0">{unit}</span>}
  </div>
);

/** Percentile rank input — indigo tint */
const PR: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  value, onChange, placeholder = 'PR',
}) => (
  <input
    type="text"
    inputMode="text"
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-12 text-[11px] text-center font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-700 rounded px-1 py-[3px] outline-none focus:ring-1 focus:ring-indigo-400 transition-colors"
  />
);

// ── Grid table primitives ──────────────────────────────────────────────────────

/** Section header spanning full table width */
const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <tr>
    <td colSpan={99} className="pt-4 pb-1 px-3">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-px bg-indigo-100 dark:bg-indigo-900/50" />
      </div>
    </td>
  </tr>
);

/** Sub-label row (e.g. "ohne Warnton", "Auditiv") — indented under a test group */
const SubRow: React.FC<{ label: string }> = ({ label }) => (
  <tr>
    <td colSpan={99} className="px-3 pt-2 pb-0.5">
      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">
        {label}
      </span>
    </td>
  </tr>
);

/**
 * One data row: test label | cells (each is a Val or PR or empty)
 * Pass flagged/onFlag/verToggle/noteValue/onNoteChange for the row controls.
 */
interface DataRowProps {
  label: string;
  badge?: string;
  indent?: boolean;
  flagged?: boolean;
  onFlag?: () => void;
  verToggle?: React.ReactNode;
  eyeToggle?: React.ReactNode;
  noteValue?: string;
  onNoteChange?: (v: string) => void;
  activeNote?: boolean;
  onToggleNote?: () => void;
  children: React.ReactNode; // the <td> cells
}

const DataRow: React.FC<DataRowProps> = ({
  label, badge, indent, flagged, onFlag, verToggle, eyeToggle,
  noteValue, onNoteChange, activeNote, onToggleNote, children,
}) => (
  <tr className={cn(
    'group transition-colors',
    flagged
      ? 'bg-orange-50/60 dark:bg-orange-950/10'
      : 'hover:bg-slate-50/60 dark:hover:bg-slate-700/20',
  )}>
    {/* Label cell */}
    <td className={cn(
      'px-3 py-1.5 whitespace-nowrap align-middle border-r border-slate-100 dark:border-slate-700/60',
      flagged ? 'border-orange-100 dark:border-orange-900/40' : '',
    )}>
      <div className="flex items-center gap-1.5">
        {indent && <span className="w-3 shrink-0" />}
        <span className={cn(
          'text-[11px] font-bold text-slate-700 dark:text-slate-200',
          flagged && 'text-orange-700 dark:text-orange-300',
        )}>{label}</span>
        {badge && (
          <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 leading-none shrink-0">
            {badge}
          </span>
        )}
      </div>
    </td>

    {/* Data cells */}
    {children}

    {/* Controls cell */}
    <td className="pl-2 pr-3 py-1.5 align-middle">
      <div className="flex items-center gap-1">
        {verToggle}
        {eyeToggle}
        {onNoteChange && (
          <button
            type="button"
            onClick={onToggleNote}
            title="Anmerkung"
            className={cn(
              'p-1 rounded transition-colors',
              activeNote || (noteValue && noteValue.trim())
                ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/30'
                : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700',
            )}
          >
            <StickyNote size={12} />
          </button>
        )}
        {onFlag && <FlagBtn flagged={!!flagged} onClick={onFlag} />}
      </div>
    </td>
  </tr>
);

/** Inline note row — shown below a DataRow when note is open */
const NoteRow: React.FC<{ value: string; onChange: (v: string) => void; onClose: () => void }> = ({
  value, onChange, onClose,
}) => (
  <tr className="bg-amber-50/40 dark:bg-amber-950/10">
    <td colSpan={99} className="px-3 pb-2 pt-0.5">
      <div className="flex items-start gap-1.5">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Anmerkung…"
          rows={1}
          autoFocus
          className="flex-1 text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5 resize-none outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed overflow-hidden transition-colors"
          onInput={e => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = `${t.scrollHeight}px`;
          }}
        />
        <button
          type="button"
          onClick={onClose}
          className="mt-1.5 p-1 rounded text-slate-300 hover:text-slate-500 transition-colors"
        >
          <X size={11} />
        </button>
      </div>
    </td>
  </tr>
);

/** Empty/dash cell for columns that don't apply to a row */
const Empty: React.FC = () => (
  <td className="px-1.5 py-1.5 align-middle text-center">
    <span className="text-[10px] text-slate-200 dark:text-slate-700 select-none">·</span>
  </td>
);

/** A cell containing a Val input */
const VCell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <td className="px-1.5 py-1.5 align-middle">{children}</td>
);

/** A cell containing a PR input — slightly tinted background to reinforce grouping */
const PCell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <td className="px-1 py-1.5 align-middle bg-indigo-50/30 dark:bg-indigo-950/10">{children}</td>
);

/** Column group header */
const ColHead: React.FC<{ label: string; pr?: boolean; span?: number }> = ({ label, pr, span = 1 }) => (
  <th
    colSpan={span}
    className={cn(
      'px-1.5 py-2 text-[9px] font-black uppercase tracking-wide text-center whitespace-nowrap',
      pr
        ? 'text-indigo-400 dark:text-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
        : 'text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800',
    )}
  >
    {label}
  </th>
);

// ── Quad section (Gesichtsfeld / Neglect) ──────────────────────────────────────

const QuadSection: React.FC<{
  mq: QuadValues; aq: QuadValues;
  onMq: (q: QuadValues) => void; onAq: (q: QuadValues) => void;
}> = ({ mq, aq, onMq, onAq }) => (
  <tr>
    <td colSpan={99} className="px-3 pb-2 pt-1">
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">MQ</span>
          <QuadGrid value={mq} onChange={onMq} shape="cross" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">AQ</span>
          <QuadGrid value={aq} onChange={onAq} shape="circle" />
        </div>
      </div>
    </td>
  </tr>
);

// ── Main component ─────────────────────────────────────────────────────────────

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
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [nichtErschienen, setNichtErschienen] = useState(false);
  const [nichtErschienienTest, setNichtErschienienTest] = useState('');
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  // Track which notes are open
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const toggleNote = (key: string) =>
    setOpenNotes(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const upd = (f: Partial<SF>) => setCol(prev => ({ ...prev, f: { ...prev.f, ...f } }));

  const handleSave = () => {
    const id = col.id ?? Date.now().toString();
    const saveDate = col.date || new Date().toISOString().split('T')[0];
    const result = encodeCol({ ...col, id, date: saveDate });
    result.aborted = aborted || undefined;
    result.abortComment = aborted ? abortComment : undefined;
    onSave(result);

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
    setAborted(false);
    setAbortComment('');
    setOpenNotes(new Set());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  useShortcutSave(handleSave);

  const tapResults = previousResults
    .filter(r => r.testId === 'tap')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Helper to build note-row helper inline
  const maybeNote = (key: string, noteKey: keyof SF) =>
    openNotes.has(key) ? (
      <NoteRow
        value={col.f[noteKey] as string}
        onChange={v => upd({ [noteKey]: v })}
        onClose={() => toggleNote(key)}
      />
    ) : null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

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

      {/* Date / Examiner / Save */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={col.date}
          onChange={e => setCol({ ...col, date: e.target.value })}
          className="text-[11px] px-2 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-200"
        />
        <input
          type="text"
          value={col.examiner}
          onChange={e => setCol({ ...col, examiner: e.target.value })}
          placeholder="Untersucher"
          className="text-[11px] px-2 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-200 w-28"
        />
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
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
            className="text-[10px] px-1.5 py-1.5 bg-slate-50 dark:bg-slate-700 border border-rose-300 dark:border-rose-700 rounded-lg outline-none focus:ring-1 focus:ring-rose-400 text-slate-700 dark:text-slate-200"
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
            'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-black transition-all ml-auto',
            saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700',
          )}
        >
          {saved ? <><CheckCircle2 size={13} /> Gespeichert</> : <><Save size={13} /> Speichern</>}
        </button>
        {aborted && (
          <div className="w-full mt-2">
            <textarea
              value={abortComment}
              onChange={e => setAbortComment(e.target.value)}
              placeholder="Grund für Abbruch…"
              rows={1}
              className="w-full px-3 py-1.5 text-[11px] border border-orange-300 rounded-lg bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700 dark:text-slate-200 outline-none resize-none placeholder:text-orange-300"
            />
          </div>
        )}
      </div>

      {/* Abort toggle */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setAborted(!aborted)}
          className={aborted
            ? 'w-full flex items-center gap-2 px-4 py-2 text-[11px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
            : 'w-full flex items-center gap-2 px-4 py-2 text-[11px] font-bold text-slate-400 hover:text-orange-600 dark:hover:text-orange-400'}
        >
          <span className="text-base leading-none">⊗</span>
          {aborted ? 'Test als abgebrochen markiert — klicken zum Aufheben' : 'Test abgebrochen / unvollständig'}
        </button>
      </div>

      {/* ══ MAIN GRID TABLE ══ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {/* sticky label column */}
              <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 whitespace-nowrap w-40">
                Test
              </th>
              {/* RT / M */}
              <ColHead label="M / RT" />
              <ColHead label="PR" pr />
              {/* SD */}
              <ColHead label="SD" />
              <ColHead label="PR-SD" pr />
              {/* Fehler */}
              <ColHead label="Fehler" />
              <ColHead label="PR-F" pr />
              {/* Auslassungen */}
              <ColHead label="Ausl." />
              <ColHead label="PR-A" pr />
              {/* Extra columns for tests that need them */}
              <ColHead label="Zusatz" />
              <ColHead label="PR-Z" pr />
              {/* Controls */}
              <th className="px-3 py-2 bg-slate-50 dark:bg-slate-800 w-24" />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">

            {/* ══ ALERTNESS ══ */}
            <SectionHeader label="Alertness" />

            {/* Alertness TAP-M */}
            <DataRow
              label="Alertness"
              badge="M"
              flagged={col.f.flag_alM}
              onFlag={() => upd({ flag_alM: !col.f.flag_alM })}
              noteValue={col.f.note_alM}
              onNoteChange={v => upd({ note_alM: v })}
              activeNote={openNotes.has('alM')}
              onToggleNote={() => toggleNote('alM')}
            >
              <VCell><Val value={col.f.alM_rt} onChange={v => upd({ alM_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.alM_pr} onChange={v => upd({ alM_pr: v })} /></PCell>
              <VCell><Val value={col.f.alM_sd} onChange={v => upd({ alM_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.alM_sd_pr} onChange={v => upd({ alM_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>
            {maybeNote('alM', 'note_alM')}

            {/* Alertness 2.3 ohne Warnton */}
            <SubRow label="2.3 – ohne Warnton" />
            <DataRow
              label="Alertness"
              badge="2.3"
              indent
              flagged={col.f.flag_al23}
              onFlag={() => upd({ flag_al23: !col.f.flag_al23 })}
              noteValue={col.f.note_al23}
              onNoteChange={v => upd({ note_al23: v })}
              activeNote={openNotes.has('al23')}
              onToggleNote={() => toggleNote('al23')}
            >
              <VCell><Val value={col.f.al23_ohne_rt} onChange={v => upd({ al23_ohne_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.al23_ohne_pr} onChange={v => upd({ al23_ohne_pr: v })} /></PCell>
              <VCell><Val value={col.f.al23_ohne_sd} onChange={v => upd({ al23_ohne_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.al23_ohne_sd_pr} onChange={v => upd({ al23_ohne_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>

            {/* Alertness 2.3 mit Warnton */}
            <SubRow label="2.3 – mit Warnton 🔊" />
            <DataRow
              label="Alertness"
              badge="2.3"
              indent
              flagged={col.f.flag_al23}
            >
              <VCell><Val value={col.f.al23_mit_rt} onChange={v => upd({ al23_mit_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.al23_mit_pr} onChange={v => upd({ al23_mit_pr: v })} /></PCell>
              <VCell><Val value={col.f.al23_mit_sd} onChange={v => upd({ al23_mit_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.al23_mit_sd_pr} onChange={v => upd({ al23_mit_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>

            {/* Phasische Alertness */}
            <SubRow label="2.3 – Phasische Alertness" />
            <DataRow
              label="Phasisch"
              indent
              flagged={col.f.flag_al23}
            >
              {/* Kennwert goes in the M/RT column */}
              <VCell><Val value={col.f.al23_phasisch} onChange={v => upd({ al23_phasisch: v })} numeric={false} placeholder="Kennwert" /></VCell>
              <PCell><PR value={col.f.al23_pr} onChange={v => upd({ al23_pr: v })} placeholder="PR ges." /></PCell>
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>
            {maybeNote('al23', 'note_al23')}

            {/* ══ SELEKTIVE AUFMERKSAMKEIT ══ */}
            <SectionHeader label="Selektive Aufmerksamkeit" />

            <DataRow
              label="Go/Nogo 1"
              flagged={col.f.flag_gn}
              onFlag={() => upd({ flag_gn: !col.f.flag_gn })}
              verToggle={<VerToggle value={col.f.gn_ver} onChange={v => upd({ gn_ver: v })} />}
              noteValue={col.f.note_gn}
              onNoteChange={v => upd({ note_gn: v })}
              activeNote={openNotes.has('gn')}
              onToggleNote={() => toggleNote('gn')}
            >
              <VCell><Val value={col.f.gn_rt} onChange={v => upd({ gn_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.gn_pr} onChange={v => upd({ gn_pr: v })} /></PCell>
              <VCell><Val value={col.f.gn_sd} onChange={v => upd({ gn_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.gn_sd_pr} onChange={v => upd({ gn_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <VCell><Val value={col.f.gn_fehler} onChange={v => upd({ gn_fehler: v })} /></VCell>
              <Empty />
              <VCell><Val value={col.f.gn_ausl} onChange={v => upd({ gn_ausl: v })} /></VCell>
              <Empty /><Empty /><Empty />
            </DataRow>
            {maybeNote('gn', 'note_gn')}

            <DataRow
              label="Go/Nogo 2"
              badge="2.3"
              flagged={col.f.flag_gn2}
              onFlag={() => upd({ flag_gn2: !col.f.flag_gn2 })}
              noteValue={col.f.note_gn2}
              onNoteChange={v => upd({ note_gn2: v })}
              activeNote={openNotes.has('gn2')}
              onToggleNote={() => toggleNote('gn2')}
            >
              <VCell><Val value={col.f.gn2_rt} onChange={v => upd({ gn2_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.gn2_pr} onChange={v => upd({ gn2_pr: v })} /></PCell>
              <VCell><Val value={col.f.gn2_sd} onChange={v => upd({ gn2_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.gn2_sd_pr} onChange={v => upd({ gn2_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <VCell><Val value={col.f.gn2_fehler} onChange={v => upd({ gn2_fehler: v })} /></VCell>
              <Empty />
              <VCell><Val value={col.f.gn2_ausl} onChange={v => upd({ gn2_ausl: v })} /></VCell>
              <Empty /><Empty /><Empty />
            </DataRow>
            {maybeNote('gn2', 'note_gn2')}

            <DataRow
              label="Flexibilität"
              flagged={col.f.flag_fl}
              onFlag={() => upd({ flag_fl: !col.f.flag_fl })}
              verToggle={<VerToggle value={col.f.fl_ver} onChange={v => upd({ fl_ver: v })} />}
              noteValue={col.f.note_fl}
              onNoteChange={v => upd({ note_fl: v })}
              activeNote={openNotes.has('fl')}
              onToggleNote={() => toggleNote('fl')}
            >
              <VCell><Val value={col.f.fl_rt} onChange={v => upd({ fl_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.fl_pr} onChange={v => upd({ fl_pr: v })} /></PCell>
              <VCell><Val value={col.f.fl_sd} onChange={v => upd({ fl_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.fl_sd_pr} onChange={v => upd({ fl_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <VCell><Val value={col.f.fl_fehler} onChange={v => upd({ fl_fehler: v })} /></VCell>
              <Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>
            {maybeNote('fl', 'note_fl')}

            {/* ══ GETEILTE AUFMERKSAMKEIT ══ */}
            <SectionHeader label="Geteilte Aufmerksamkeit" />

            <SubRow label="Auditiv" />
            <DataRow
              label="Get. Aufmerk."
              indent
              flagged={col.f.flag_ga}
              onFlag={() => upd({ flag_ga: !col.f.flag_ga })}
              verToggle={<VerToggle value={col.f.ga_ver} onChange={v => upd({ ga_ver: v })} />}
              noteValue={col.f.note_ga}
              onNoteChange={v => upd({ note_ga: v })}
              activeNote={openNotes.has('ga')}
              onToggleNote={() => toggleNote('ga')}
            >
              <VCell><Val value={col.f.ga_rt} onChange={v => upd({ ga_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.ga_pr} onChange={v => upd({ ga_pr: v })} /></PCell>
              <VCell><Val value={col.f.ga_sd} onChange={v => upd({ ga_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.ga_sd_pr} onChange={v => upd({ ga_sd_pr: v })} placeholder="PR-SD" /></PCell>
              {/* Fehler und Auslassungen (aud+vis) stehen in der visuellen Zeile */}
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>

            <SubRow label="Visuell" />
            <DataRow
              label="Get. Aufmerk."
              indent
              flagged={col.f.flag_ga}
            >
              <VCell><Val value={col.f.gv_rt} onChange={v => upd({ gv_rt: v })} placeholder="ms" /></VCell>
              <Empty />
              <VCell><Val value={col.f.gv_sd} onChange={v => upd({ gv_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.gv_sd_pr} onChange={v => upd({ gv_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>

            <SubRow label="Fehler · Auslassungen" />
            <DataRow
              label="Get. Aufmerk."
              indent
              flagged={col.f.flag_ga}
            >
              <Empty /><Empty /><Empty /><Empty />
              <VCell><Val value={col.f.g_fehler} onChange={v => upd({ g_fehler: v })} /></VCell>
              <Empty />
              {/* Ausl. Ton */}
              <VCell><Val value={col.f.g_ausl_tone} onChange={v => upd({ g_ausl_tone: v })} placeholder="A♪" /></VCell>
              <Empty />
              {/* Ausl. Quadrant in Zusatz */}
              <VCell><Val value={col.f.g_ausl_quad} onChange={v => upd({ g_ausl_quad: v })} placeholder="A⊞" /></VCell>
              <Empty />
            </DataRow>
            {maybeNote('ga', 'note_ga')}

            {/* ══ VIGILANZ ══ */}
            <SectionHeader label="Vigilanz" />

            <DataRow
              label="Vigilanz"
              badge="2.3"
              flagged={col.f.flag_vig}
              onFlag={() => upd({ flag_vig: !col.f.flag_vig })}
              noteValue={col.f.note_vig}
              onNoteChange={v => upd({ note_vig: v })}
              activeNote={openNotes.has('vig')}
              onToggleNote={() => toggleNote('vig')}
            >
              <VCell><Val value={col.f.vig_rt} onChange={v => upd({ vig_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.vig_pr} onChange={v => upd({ vig_pr: v })} /></PCell>
              <VCell><Val value={col.f.vig_sd} onChange={v => upd({ vig_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.vig_sd_pr} onChange={v => upd({ vig_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <VCell><Val value={col.f.vig_fehler} onChange={v => upd({ vig_fehler: v })} /></VCell>
              <Empty />
              <VCell><Val value={col.f.vig_ausl} onChange={v => upd({ vig_ausl: v })} /></VCell>
              <Empty /><Empty /><Empty />
            </DataRow>
            {maybeNote('vig', 'note_vig')}

            {/* ══ GEDÄCHTNIS ══ */}
            <SectionHeader label="Gedächtnis" />

            <DataRow
              label="Arbeitsgedächtnis"
              badge="2.3"
              flagged={col.f.flag_ag}
              onFlag={() => upd({ flag_ag: !col.f.flag_ag })}
              noteValue={col.f.note_ag}
              onNoteChange={v => upd({ note_ag: v })}
              activeNote={openNotes.has('ag')}
              onToggleNote={() => toggleNote('ag')}
            >
              <VCell><Val value={col.f.ag_rt} onChange={v => upd({ ag_rt: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.ag_pr} onChange={v => upd({ ag_pr: v })} /></PCell>
              <VCell><Val value={col.f.ag_sd} onChange={v => upd({ ag_sd: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.ag_sd_pr} onChange={v => upd({ ag_sd_pr: v })} placeholder="PR-SD" /></PCell>
              <VCell><Val value={col.f.ag_fehler} onChange={v => upd({ ag_fehler: v })} /></VCell>
              <Empty />
              <VCell><Val value={col.f.ag_ausl} onChange={v => upd({ ag_ausl: v })} /></VCell>
              <Empty /><Empty /><Empty />
            </DataRow>
            {maybeNote('ag', 'note_ag')}

            {/* ══ VISUELLES SCANNING ══ */}
            <SectionHeader label="Visuelles Scanning" />

            <SubRow label="Kritische Stimuli" />
            <DataRow
              label="Vis. Scanning"
              indent
              flagged={col.f.flag_ve}
              onFlag={() => upd({ flag_ve: !col.f.flag_ve })}
              verToggle={<VerToggle value={col.f.ve_ver} onChange={v => upd({ ve_ver: v })} />}
              noteValue={col.f.note_ve}
              onNoteChange={v => upd({ note_ve: v })}
              activeNote={openNotes.has('ve')}
              onToggleNote={() => toggleNote('ve')}
            >
              <VCell><Val value={col.f.ve_rt_krit} onChange={v => upd({ ve_rt_krit: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.ve_pr_krit} onChange={v => upd({ ve_pr_krit: v })} /></PCell>
              <VCell><Val value={col.f.ve_sd_krit} onChange={v => upd({ ve_sd_krit: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.ve_sd_pr_krit} onChange={v => upd({ ve_sd_pr_krit: v })} placeholder="PR-SD" /></PCell>
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>

            <SubRow label="Nicht-kritische Stimuli" />
            <DataRow
              label="Vis. Scanning"
              indent
              flagged={col.f.flag_ve}
            >
              <VCell><Val value={col.f.ve_rt_nkrit} onChange={v => upd({ ve_rt_nkrit: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.ve_pr_nkrit} onChange={v => upd({ ve_pr_nkrit: v })} /></PCell>
              <VCell><Val value={col.f.ve_sd_nkrit} onChange={v => upd({ ve_sd_nkrit: v })} placeholder="ms" /></VCell>
              <PCell><PR value={col.f.ve_sd_pr_nkrit} onChange={v => upd({ ve_sd_pr_nkrit: v })} placeholder="PR-SD" /></PCell>
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
            </DataRow>

            <SubRow label="Fehler · Auslassungen · Zeilen · Spalten" />
            {/* Fehler + Auslassungen */}
            <DataRow
              label="Vis. Scanning"
              indent
              flagged={col.f.flag_ve}
            >
              <Empty /><Empty /><Empty /><Empty />
              <VCell><Val value={col.f.ve_fehler} onChange={v => upd({ ve_fehler: v })} /></VCell>
              <PCell><PR value={col.f.ve_pr_fehler} onChange={v => upd({ ve_pr_fehler: v })} placeholder="PR-F" /></PCell>
              <VCell><Val value={col.f.ve_ausl_krit} onChange={v => upd({ ve_ausl_krit: v })} /></VCell>
              <PCell><PR value={col.f.ve_pr_ausl} onChange={v => upd({ ve_pr_ausl: v })} placeholder="PR-A" /></PCell>
              <Empty /><Empty />
            </DataRow>

            {/* Zeilen */}
            <DataRow
              label="Zeilen / Spalten"
              indent
              flagged={col.f.flag_ve}
            >
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
              {/* Zeilen r in Zusatz */}
              <VCell><Val value={col.f.ve_zeilen_r} onChange={v => upd({ ve_zeilen_r: v })} placeholder="Z" /></VCell>
              <PCell><PR value={col.f.ve_pr_zeilen} onChange={v => upd({ ve_pr_zeilen: v })} placeholder="PR-Z" /></PCell>
            </DataRow>
            {/* Spalten */}
            <DataRow
              label="Spalten r"
              indent
              flagged={col.f.flag_ve}
            >
              <Empty /><Empty /><Empty /><Empty /><Empty /><Empty /><Empty /><Empty />
              <VCell><Val value={col.f.ve_spalten_r} onChange={v => upd({ ve_spalten_r: v })} placeholder="S" /></VCell>
              <PCell><PR value={col.f.ve_pr_spalten} onChange={v => upd({ ve_pr_spalten: v })} placeholder="PR-S" /></PCell>
            </DataRow>
            {maybeNote('ve', 'note_ve')}

            {/* ══ GESICHTSFELD & NEGLECT ══ */}
            <SectionHeader label="Gesichtsfeld & Neglect" />

            <DataRow
              label="Gesichtsfeld"
              badge="2.3"
              flagged={col.f.flag_gf}
              onFlag={() => upd({ flag_gf: !col.f.flag_gf })}
              eyeToggle={<EyeToggle value={col.f.gf_eye} onChange={v => upd({ gf_eye: v })} />}
              noteValue={col.f.note_gf}
              onNoteChange={v => upd({ note_gf: v })}
              activeNote={openNotes.has('gf')}
              onToggleNote={() => toggleNote('gf')}
            >
              {/* RT L in M/RT, RT R in SD */}
              <VCell><Val value={col.f.gf_rt_l} onChange={v => upd({ gf_rt_l: v })} placeholder="L ms" /></VCell>
              <Empty />
              <VCell><Val value={col.f.gf_rt_r} onChange={v => upd({ gf_rt_r: v })} placeholder="R ms" /></VCell>
              <Empty />
              <Empty /><Empty />
              {/* Auslassungen */}
              <VCell><Val value={col.f.gf_ausl} onChange={v => upd({ gf_ausl: v })} /></VCell>
              <Empty />
              {/* PR gesamt in Zusatz */}
              <Empty />
              <PCell><PR value={col.f.gf_pr} onChange={v => upd({ gf_pr: v })} /></PCell>
            </DataRow>
            <QuadSection
              mq={decodeQuad(col.f.gf_mq)} aq={decodeQuad(col.f.gf_aq)}
              onMq={q => upd({ gf_mq: encodeQuad(q) })} onAq={q => upd({ gf_aq: encodeQuad(q) })}
            />
            {maybeNote('gf', 'note_gf')}

            <DataRow
              label="Neglect"
              badge="2.3"
              flagged={col.f.flag_neg}
              onFlag={() => upd({ flag_neg: !col.f.flag_neg })}
              noteValue={col.f.note_neg}
              onNoteChange={v => upd({ note_neg: v })}
              activeNote={openNotes.has('neg')}
              onToggleNote={() => toggleNote('neg')}
            >
              <VCell><Val value={col.f.neg_rt_l} onChange={v => upd({ neg_rt_l: v })} placeholder="L ms" /></VCell>
              <Empty />
              <VCell><Val value={col.f.neg_rt_r} onChange={v => upd({ neg_rt_r: v })} placeholder="R ms" /></VCell>
              <Empty />
              <Empty /><Empty />
              <VCell><Val value={col.f.neg_ausl} onChange={v => upd({ neg_ausl: v })} /></VCell>
              <Empty />
              <Empty />
              <PCell><PR value={col.f.neg_pr} onChange={v => upd({ neg_pr: v })} /></PCell>
            </DataRow>
            <QuadSection
              mq={decodeQuad(col.f.neg_mq)} aq={decodeQuad(col.f.neg_aq)}
              onMq={q => upd({ neg_mq: encodeQuad(q) })} onAq={q => upd({ neg_aq: encodeQuad(q) })}
            />
            {maybeNote('neg', 'note_neg')}

          </tbody>
        </table>
      </div>

      {/* ── HISTORY ── */}
      {tapResults.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <button
            onClick={() => setExpandedHistory(v => !v)}
            className="flex items-center gap-2 text-sm font-black text-slate-600 dark:text-slate-300 w-full"
          >
            <History size={15} className="text-indigo-500" />
            Verlauf ({tapResults.length} Messung{tapResults.length !== 1 ? 'en' : ''})
            {expandedHistory ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
          </button>
          {expandedHistory && (
            <div className="mt-3 space-y-2">
              {tapResults.map((res, idx) => {
                const isExpanded = expandedResultId === res.id;
                const prEntries = TAP_PR_MAP.filter(m => {
                  const v = String(res.percentileRanks[m.key] ?? '').trim();
                  return v !== '' && v !== '0';
                });
                return (
                  <div key={res.id} className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2 bg-slate-50/80 dark:bg-slate-700/40">
                      {idx === 0 && (
                        <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded uppercase tracking-wide">neueste</span>
                      )}
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatDate(res.date)}</span>
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                      {res.examiner && <span className="text-xs text-slate-400 dark:text-slate-500">{res.examiner}</span>}
                      <div className="ml-auto flex items-center gap-1">
                        {prEntries.length > 0 && (
                          <button
                            onClick={() => setExpandedResultId(isExpanded ? null : res.id)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-black text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                          >
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            {isExpanded ? 'Einklappen' : 'PR-Werte'}
                          </button>
                        )}
                        {confirmDeleteId === res.id ? (
                          <>
                            <button
                              onClick={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                              className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                              title="Löschen bestätigen"
                            ><Check size={12} /></button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            ><ChevronDown size={12} /></button>
                          </>
                        ) : (
                          patient.status !== 'entlassen' && (
                            <button
                              onClick={() => setConfirmDeleteId(res.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                              title="Löschen"
                            ><Trash2 size={12} /></button>
                          )
                        )}
                      </div>
                    </div>
                    {isExpanded && prEntries.length > 0 && (
                      <div className="p-3 bg-white dark:bg-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                        {prEntries.map(m => (
                          <div key={m.key} className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400 dark:text-slate-500 italic truncate flex-1">{m.label}:</span>
                            <span className="font-black text-indigo-600 dark:text-indigo-400 tabular-nums shrink-0">
                              PR {res.percentileRanks[m.key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
