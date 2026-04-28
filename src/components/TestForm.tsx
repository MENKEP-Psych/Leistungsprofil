/**
 * Shared design system for all test input forms.
 * Ensures visual consistency across TAP, TMT, VLMT, TOL, etc.
 */
import React from 'react';
import { Save, CheckCircle2, X, History } from 'lucide-react';
import { cn } from '../lib/utils';

// ── PR color coding (single source of truth) ──────────────────────────────────

export function prColorCls(pr: number | string): string {
  let n: number;
  if (typeof pr === 'number') {
    n = pr;
  } else {
    const s = pr.toString().trim();
    if (s.startsWith('<')) {
      const v = parseFloat(s.slice(1).trim());
      n = isNaN(v) ? 1 : v / 2;
    } else if (s.startsWith('>')) {
      const v = parseFloat(s.slice(1).trim());
      n = isNaN(v) ? 99 : Math.min(100, v + 1);
    } else {
      const lo = parseFloat(s);
      const hiM = s.match(/[-\u2013]>?(\d+)/);
      const hi = hiM ? parseFloat(hiM[1]) : NaN;
      n = isNaN(hi) ? lo : (lo + hi) / 2;
    }
  }
  if (isNaN(n) || n < 2)  return 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400';
  if (n < 16)             return 'bg-orange-100  text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  if (n < 31)             return 'bg-yellow-100  text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-600';
  if (n < 69)             return 'bg-green-100   text-green-700  dark:bg-green-900/30  dark:text-green-400';
  if (n < 84)             return 'bg-blue-100    text-blue-700   dark:bg-blue-900/30   dark:text-blue-400';
  if (n < 98)             return 'bg-violet-100  text-violet-700 dark:bg-violet-900/30 dark:text-violet-400';
  return                         'bg-purple-100  text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
}

// ── PrBadge — display-only colored pill (for history tables) ──────────────────

export const PrBadge: React.FC<{ value: number | string }> = ({ value }) => (
  <span className={cn('inline-block px-2 py-0.5 rounded-lg font-black text-[11px] tabular-nums', prColorCls(value))}>
    {value}
  </span>
);

// ── PrField — THE signature PR input, always identical across all tabs ─────────
// Indigo "PR" badge + free-text input. Instantly recognizable everywhere.
// Use inside SectionCard's `pr` prop — the card adds the "Prozentrang (PR)" label.

interface PrFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export const PrField: React.FC<PrFieldProps> = ({
  value, onChange,
  placeholder = 'Wert eingeben  z.B.  42  ·  < 5  ·  > 95',
  className,
}) => (
  <div className={cn(
    'flex items-stretch rounded-xl overflow-hidden border-2 border-indigo-200 dark:border-indigo-800',
    'focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/15 transition-all',
    className,
  )}>
    <div className="px-3 flex items-center bg-indigo-600 text-white text-[11px] font-black tracking-widest shrink-0 select-none">
      PR
    </div>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1 px-3 py-2.5 text-sm font-mono text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-700 outline-none placeholder:text-indigo-300 dark:placeholder:text-indigo-700"
    />
  </div>
);

// ── StackedField — label directly above input, no stretching gap ──────────────
// Use this instead of RawField wherever the label → input distance feels too wide.

interface StackedFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  allowDecimal?: boolean;
  numeric?: boolean;
  placeholder?: string;
}

export const StackedField: React.FC<StackedFieldProps> = ({
  label, value, onChange, unit, allowDecimal = false, numeric = true, placeholder = '—',
}) => (
  <div className="space-y-1 min-w-0">
    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide leading-tight truncate">
      {label}
    </label>
    <div className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all">
      <input
        type="text"
        inputMode={allowDecimal ? 'decimal' : numeric ? 'numeric' : 'text'}
        value={value}
        onChange={e => onChange(
          allowDecimal
            ? e.target.value.replace(/[^0-9.,-]/g, '')
            : numeric
              ? e.target.value.replace(/[^0-9-]/g, '')
              : e.target.value,
        )}
        placeholder={placeholder}
        className="flex-1 min-w-0 text-sm font-mono text-center text-slate-700 dark:text-slate-200 bg-transparent outline-none"
      />
      {unit && <span className="text-xs text-slate-400 dark:text-slate-500 font-medium shrink-0">{unit}</span>}
    </div>
  </div>
);

// ── RawField — horizontal label + input (used in VE table rows) ───────────────
// Note: for form fields, prefer StackedField to avoid label→input distance issues.

interface RawFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  allowDecimal?: boolean;
  width?: string;
}

export const RawField: React.FC<RawFieldProps> = ({
  label, value, onChange, unit, allowDecimal = false, width = 'w-20',
}) => (
  <div className="flex items-center gap-3 py-0.5">
    <span className="text-sm text-slate-500 dark:text-slate-400 flex-1 leading-tight">{label}</span>
    <div className={cn(
      'flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5',
      'bg-white dark:bg-slate-700 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all',
    )}>
      <input
        type="text"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        value={value}
        onChange={e => onChange(
          allowDecimal
            ? e.target.value.replace(/[^0-9.,-]/g, '')
            : e.target.value.replace(/[^0-9-]/g, ''),
        )}
        placeholder="—"
        className={cn(width, 'text-sm font-mono text-center text-slate-700 dark:text-slate-200 bg-transparent outline-none')}
      />
      {unit && <span className="text-xs text-slate-400 dark:text-slate-500 font-medium shrink-0">{unit}</span>}
    </div>
  </div>
);

// ── MsGroup — RT (M) + SD (s) side by side, each with label above ────────────
// 2-column stacked grid: label is directly above its input, no stretching gap.

interface MsGroupProps {
  rtLabel?: string;
  rtValue: string;
  onRt: (v: string) => void;
  sdLabel?: string;
  sdValue: string;
  onSd: (v: string) => void;
}

export const MsGroup: React.FC<MsGroupProps> = ({
  rtLabel = 'Reaktionszeit (M)',
  rtValue, onRt,
  sdLabel = 'Standardabw. (s)',
  sdValue, onSd,
}) => (
  <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-4 py-3 grid grid-cols-2 gap-3">
    <StackedField label={rtLabel} value={rtValue} onChange={onRt} unit="ms" />
    <StackedField label={sdLabel} value={sdValue} onChange={onSd} unit="ms" />
  </div>
);

// ── CountField — integer count (horizontal, for VE table) ────────────────────

interface CountFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export const CountField: React.FC<CountFieldProps> = ({ label, value, onChange }) => (
  <RawField
    label={label}
    value={value}
    onChange={v => onChange(v.replace(/[^0-9]/g, ''))}
    width="w-16"
  />
);

// ── SectionCard — groups related fields with a title ──────────────────────────

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  pr?: React.ReactNode; // PrField to render at the bottom
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, subtitle, children, pr }) => (
  <div className="rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
    {/* Section header */}
    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
      <span className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider">{title}</span>
      {subtitle && <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500 font-medium">{subtitle}</span>}
    </div>
    {/* Fields */}
    <div className="px-4 py-3 space-y-1 bg-white dark:bg-slate-800">
      {children}
    </div>
    {/* PR always at bottom — with clear label so users know what to enter */}
    {pr && (
      <div className="px-4 pb-4 bg-white dark:bg-slate-800 border-t border-indigo-50 dark:border-indigo-900/40 pt-3">
        <p className="text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1.5">
          Prozentrang (PR) — aus dem Testprotokoll
        </p>
        {pr}
      </div>
    )}
  </div>
);

// ── TestMeta — date + examiner row (identical across all tabs) ────────────────

interface TestMetaProps {
  date: string;
  onDate: (v: string) => void;
  examiner: string;
  onExaminer: (v: string) => void;
}

export const TestMeta: React.FC<TestMetaProps> = ({ date, onDate, examiner, onExaminer }) => (
  <div className="grid grid-cols-2 gap-3">
    <div className="space-y-1.5">
      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Datum</label>
      <input
        type="date"
        value={date}
        onChange={e => onDate(e.target.value)}
        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
      />
    </div>
    <div className="space-y-1.5">
      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Untersucher</label>
      <input
        type="text"
        value={examiner}
        onChange={e => onExaminer(e.target.value)}
        placeholder="Kürzel"
        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
      />
    </div>
  </div>
);

// ── NoteField ─────────────────────────────────────────────────────────────────

interface NoteFieldProps {
  value: string;
  onChange: (v: string) => void;
}

export const NoteField: React.FC<NoteFieldProps> = ({ value, onChange }) => (
  <div className="space-y-1.5">
    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Notiz (optional)</label>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Besonderheiten, Beobachtungen…"
      rows={2}
      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none"
    />
  </div>
);

// ── FormSave — save / cancel button row ──────────────────────────────────────

interface FormSaveProps {
  onSave: () => void;
  saved: boolean;
  editingId: string | null;
  onCancel: () => void;
}

export const FormSave: React.FC<FormSaveProps> = ({ onSave, saved, editingId, onCancel }) => (
  <div className="flex items-center gap-3">
    <button
      onClick={onSave}
      className={cn(
        'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all active:scale-95',
        saved
          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 dark:shadow-none'
          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200/60 dark:shadow-none',
      )}
    >
      {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
      {saved ? 'Gespeichert' : editingId ? 'Aktualisieren' : 'Speichern'}
    </button>
    {editingId && (
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
      >
        <X size={14} />
        Abbrechen
      </button>
    )}
  </div>
);

// ── PageHeader — standardized test tab header (single source of truth) ────────

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-4">
    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none shrink-0">
      {icon}
    </div>
    <div>
      <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{title}</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{subtitle}</p>
    </div>
  </div>
);

// ── HistoryHeader ─────────────────────────────────────────────────────────────

export const HistoryHeader: React.FC<{ count: number }> = ({ count }) => (
  <div className="flex items-center gap-2">
    <History size={16} className="text-slate-400 dark:text-slate-500" />
    <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
      Vorherige Messungen
      {count > 0 && <span className="ml-2 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded-md font-black">{count}</span>}
    </h3>
  </div>
);

// ── EmptyHistory ──────────────────────────────────────────────────────────────

export const EmptyHistory: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-14 text-slate-300 dark:text-slate-600">
    <History size={40} strokeWidth={1.5} className="mb-3" />
    <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Noch keine Messungen gespeichert</p>
  </div>
);

// ── HistoryRowActions — edit + delete with confirm ────────────────────────────

import { Pencil, Trash2, Check } from 'lucide-react';

interface HistoryRowActionsProps {
  id: string;
  editingId: string | null;
  confirmDeleteId: string | null;
  patientDischarged: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onSetConfirm: () => void;
}

export const HistoryRowActions: React.FC<HistoryRowActionsProps> = ({
  id, editingId, confirmDeleteId, patientDischarged,
  onEdit, onDelete, onConfirmDelete, onSetConfirm,
}) => {
  if (patientDischarged) return null;
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        onClick={onEdit}
        title="Bearbeiten"
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          editingId === id
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
            : 'text-slate-300 dark:text-slate-600 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
        )}
      >
        <Pencil size={13} />
      </button>
      {confirmDeleteId === id ? (
        <button
          onClick={onConfirmDelete}
          title="Löschen bestätigen"
          className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 transition-colors"
        >
          <Check size={13} />
        </button>
      ) : (
        <button
          onClick={onSetConfirm}
          title="Löschen"
          className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
};
