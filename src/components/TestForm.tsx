/**
 * Shared design system for all test input forms.
 */
import React from 'react';
import { Save, CheckCircle2, X, History, OctagonX } from 'lucide-react';
import { cn, formatDate, calculateAge } from '../lib/utils';

const noSpinner = 'appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

// ── "Notiz ohne Messwerte" beim Speichern ─────────────────────────────────────
// Wird ein Test-Formular ohne einen einzigen Messwert und ohne gesetztes
// „abgebrochen"-Flag gespeichert, aber MIT einer eingetragenen Notiz, dann ist
// das fast immer der Fall „Test konnte nicht durchgeführt werden, Grund steht in
// der Notiz". Früher hat `handleSave` in diesem Fall stillschweigend gar nichts
// gespeichert — die Notiz ging verloren und im Leistungsprofil tauchte nichts
// auf. Statt dessen wird jetzt nachgefragt und das Ergebnis auf Wunsch als
// Abbruch mit der Notiz als Begründung gespeichert.
export const NOTE_ONLY_SAVE_PROMPT =
  'Es wurden keine Messwerte eingegeben.\n\n'
  + 'Soll der Test als „nicht durchgeführt / abgebrochen" gespeichert werden und '
  + 'die eingegebene Notiz als Begründung übernommen werden?';

/**
 * Entscheidet, was ein `handleSave` ohne Messwerte tun soll:
 * - Notiz vorhanden  → fragt nach; bei Bestätigung als Abbruch speichern.
 * - keine Notiz      → nichts speichern (wie bisher).
 */
export function resolveNoteOnlySave(noteText: string): 'save-aborted' | 'cancel' {
  if (noteText.trim() && window.confirm(NOTE_ONLY_SAVE_PROMPT)) return 'save-aborted';
  return 'cancel';
}

// ── PR color coding ───────────────────────────────────────────────────────────

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
      const hiM = s.match(/[-–]>?(\d+)/);
      const hi = hiM ? parseFloat(hiM[1]) : NaN;
      n = isNaN(hi) ? lo : (lo + hi) / 2;
    }
  }
  if (isNaN(n) || n < 2)  return 'bg-red-100    text-red-700';
  if (n < 16)             return 'bg-orange-100  text-orange-700';
  if (n < 31)             return 'bg-yellow-100  text-yellow-700';
  if (n < 69)             return 'bg-green-100   text-green-700';
  if (n < 84)             return 'bg-blue-100    text-blue-700';
  if (n < 98)             return 'bg-violet-100  text-violet-700';
  return                         'bg-purple-100  text-purple-800';
}

// ── PrBadge ───────────────────────────────────────────────────────────────────

export const PrBadge: React.FC<{ value: number | string }> = ({ value }) => (
  <span className={cn('inline-block px-2.5 py-0.5 rounded-xl font-semibold text-[11px] tabular-nums', prColorCls(value))}>
    {value}
  </span>
);

// ── PrField ───────────────────────────────────────────────────────────────────

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
    'flex items-stretch rounded-2xl overflow-hidden bg-gray-50 transition-all',
    'focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-200',
    className,
  )}>
    <div className="px-3 flex items-center bg-slate-900 text-white text-[11px] font-semibold tracking-widest shrink-0 select-none rounded-l-2xl">
      PR
    </div>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1 px-3 py-2.5 text-sm font-mono text-gray-700 bg-transparent outline-none placeholder:text-gray-300"
    />
  </div>
);

// ── StackedField ──────────────────────────────────────────────────────────────

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
    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight truncate">
      {label}
    </label>
    <div className={cn(
      'flex items-center gap-1.5 rounded-xl px-3 py-2 transition-all',
      'bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-200',
    )}>
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
        className="flex-1 min-w-0 text-sm font-mono text-center text-gray-700 bg-transparent outline-none"
      />
      {unit && <span className="text-xs text-gray-400 font-medium shrink-0">{unit}</span>}
    </div>
  </div>
);

// ── RawField ──────────────────────────────────────────────────────────────────

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
    <span className="text-sm text-gray-500 flex-1 leading-tight">{label}</span>
    <div className={cn(
      'flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all',
      'bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-200',
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
        className={cn(width, 'text-sm font-mono text-center text-gray-700 bg-transparent outline-none')}
      />
      {unit && <span className="text-xs text-gray-400 font-medium shrink-0">{unit}</span>}
    </div>
  </div>
);

// ── MsGroup ───────────────────────────────────────────────────────────────────

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
  <div className="rounded-2xl bg-gray-50/80 px-4 py-3 grid grid-cols-2 gap-3">
    <StackedField label={rtLabel} value={rtValue} onChange={onRt} unit="ms" />
    <StackedField label={sdLabel} value={sdValue} onChange={onSd} unit="ms" />
  </div>
);

// ── CountField ────────────────────────────────────────────────────────────────

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

// ── SectionCard ───────────────────────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  pr?: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, subtitle, children, pr }) => (
  <div className="rounded-[20px] bg-white shadow-xl shadow-slate-300/60 overflow-hidden">
    <div className="px-4 py-3 border-b border-gray-50">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</span>
      {subtitle && <span className="ml-2 text-[10px] text-gray-400 font-medium">{subtitle}</span>}
    </div>
    <div className="px-4 py-3 space-y-1">
      {children}
    </div>
    {pr && (
      <div className="px-4 pb-4 border-t border-gray-50 pt-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
          Prozentrang (PR) — aus dem Testprotokoll
        </p>
        {pr}
      </div>
    )}
  </div>
);

// ── TestMeta ──────────────────────────────────────────────────────────────────

interface TestMetaProps {
  date: string;
  onDate: (v: string) => void;
  examiner: string;
  onExaminer: (v: string) => void;
}

export const TestMeta: React.FC<TestMetaProps> = ({ date, onDate, examiner, onExaminer }) => (
  <div className="grid grid-cols-2 gap-3">
    <div className="space-y-1.5">
      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Datum</label>
      <input
        type="date"
        value={date}
        onChange={e => onDate(e.target.value)}
        className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:ring-2 focus:ring-gray-200 transition-all"
      />
    </div>
    <div className="space-y-1.5">
      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Untersucher</label>
      <input
        type="text"
        value={examiner}
        onChange={e => onExaminer(e.target.value)}
        placeholder="Kürzel"
        className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:ring-2 focus:ring-gray-200 transition-all placeholder:text-gray-300"
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
    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Notiz (optional)</label>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Besonderheiten, Beobachtungen…"
      rows={2}
      className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-600 placeholder:text-gray-300 outline-none focus:bg-white focus:ring-2 focus:ring-gray-200 transition-all resize-none"
    />
  </div>
);

// ── AbortButton ───────────────────────────────────────────────────────────────

interface AbortButtonProps {
  aborted: boolean;
  comment: string;
  onToggle: () => void;
  onComment: (v: string) => void;
}

export const AbortButton: React.FC<AbortButtonProps> = ({ aborted, comment, onToggle, onComment }) => (
  <div className="space-y-2">
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-medium transition-all w-full',
        aborted
          ? 'bg-orange-50 text-orange-700 border border-orange-100'
          : 'bg-gray-50 text-gray-400 hover:bg-orange-50 hover:text-orange-600',
      )}
    >
      <OctagonX size={15} className="shrink-0" />
      {aborted ? 'Test als abgebrochen markiert — hier klicken zum Aufheben' : 'Test abgebrochen / unvollständig'}
    </button>
    {aborted && (
      <textarea
        value={comment}
        onChange={e => onComment(e.target.value)}
        placeholder="Grund für Abbruch (z.B. Patient verweigerte Weiterführung, Ermüdung, Zeit)"
        rows={2}
        className="w-full px-3 py-2 text-sm rounded-2xl bg-orange-50 outline-none focus:ring-2 focus:ring-orange-200 resize-none placeholder:text-orange-300"
      />
    )}
  </div>
);

// ── AbortBadge ────────────────────────────────────────────────────────────────

export const AbortBadge: React.FC<{ comment?: string }> = ({ comment }) => (
  <span
    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-semibold bg-orange-100 text-orange-700 whitespace-nowrap"
    title={comment || 'Abgebrochen'}
  >
    <OctagonX size={8} />
    Abgebr.
  </span>
);

// ── FormSave ──────────────────────────────────────────────────────────────────

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
        'flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95',
        saved
          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
          : 'bg-slate-900 hover:bg-slate-700 text-white shadow-md shadow-slate-400/20',
      )}
    >
      {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
      {saved ? 'Gespeichert' : editingId ? 'Aktualisieren' : 'Speichern'}
    </button>
    {editingId && (
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-white transition-all"
      >
        <X size={14} />
        Abbrechen
      </button>
    )}
  </div>
);

// ── PageHeader ────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-4">
    <div className="w-12 h-12 bg-slate-900 rounded-[16px] flex items-center justify-center text-white shadow-md shadow-slate-400/20 shrink-0">
      {icon}
    </div>
    <div>
      <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">{title}</h2>
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">{subtitle}</p>
    </div>
  </div>
);

// ── HistoryHeader ─────────────────────────────────────────────────────────────

export const HistoryHeader: React.FC<{ count: number }> = ({ count }) => (
  <div className="flex items-center gap-2">
    <History size={16} className="text-gray-400" />
    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
      Vorherige Messungen
      {count > 0 && (
        <span className="ml-2 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-lg font-semibold">
          {count}
        </span>
      )}
    </h3>
  </div>
);

// ── EmptyHistory ──────────────────────────────────────────────────────────────

export const EmptyHistory: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-14 text-gray-300">
    <History size={40} strokeWidth={1.5} className="mb-3" />
    <p className="text-sm font-medium text-gray-400">Noch keine Messungen gespeichert</p>
  </div>
);

// ── HistoryDate ───────────────────────────────────────────────────────────────

interface HistoryDateProps {
  date: string;
  geburtsdatum: string;
}

export const HistoryDate: React.FC<HistoryDateProps> = ({ date, geburtsdatum }) => {
  const age = calculateAge(geburtsdatum, date);
  return (
    <span className="font-medium text-gray-700">
      {formatDate(date)}
      {age != null && (
        <span className="ml-1 text-[10px] text-gray-400 font-normal">({age} J.)</span>
      )}
    </span>
  );
};

// ── OutOfRangeWarning ────────────────────────────────────────────────────────
export const OutOfRangeWarning: React.FC = () => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-700">
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span className="text-[11px] font-semibold">Alter außerhalb Normierungsbereich — PR-Werte nicht interpretierbar</span>
  </div>
);

// ── HistoryRowActions ─────────────────────────────────────────────────────────

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
            ? 'bg-slate-200 text-slate-700'
            : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700',
        )}
      >
        <Pencil size={13} />
      </button>
      {confirmDeleteId === id ? (
        <button
          onClick={onConfirmDelete}
          title="Löschen bestätigen"
          className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
        >
          <Check size={13} />
        </button>
      ) : (
        <button
          onClick={onSetConfirm}
          title="Löschen"
          className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
};
