import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Plus, Trash2, Copy, Check, ChevronRight, ChevronDown,
  Edit3, X, GripVertical, HelpCircle, BookCopy, CalendarDays,
  FileDown, FileText,
} from 'lucide-react';
import { Patient, TestResult } from '../types';
import { useAuth } from '../context/AuthContext';
import { getTestSymbolCounts } from '../lib/testSummary';
import { ZZT_ENABLED } from '../lib/featureFlags';
import {
  Textbaustein, BefundSection, BlockRelevance, VerlaufsEintrag,
  loadLibrary,
  addBlock, updateBlock, deleteBlock, renameCategory, deleteCategory,
  addItemToReport, removeItem, reorderItems, setFinalText,
  addItemToVerlauf, removeVerlaufItem, reorderVerlaufItems,
  getCategories, emptyReport, getKnownUsers,
  loadStoreIntoLocalStorage,
} from '../lib/textbaustein';
import { cn } from '../lib/utils';
import { isElectron } from '../lib/db-api';
import { useBefundSync } from '../hooks/useBefundSync';
import { useLibrarySync } from '../hooks/useLibrarySync';

// ── Constants ─────────────────────────────────────────────────────────────────

// Order mirrors PRProfile domain grouping:
// 1. Aufmerksamkeit (ZZT → TMT → TAP)
// 2. Gedächtnis (Zahlenspanne → Blockspanne → VLMT → LG → WMS-IV)
// 3. Visuo-Perz./Konstr. (Mosaik → ROCFT)
// 4. Intellektuell (LPS)
// 5. Exekutiv (TOL)
const AVAILABLE_TESTS = [
  { id: 'zzt',          label: 'ZZT' },
  { id: 'tmt',          label: 'TMT A/B' },
  { id: 'tap',          label: 'TAP' },
  { id: 'zahlenspanne', label: 'Zahlenspanne' },
  { id: 'blockspanne',  label: 'Blockspanne' },
  { id: 'vlmt',         label: 'VLMT' },
  { id: 'lg',           label: 'Log. Gedächtnis' },
  { id: 'wms_vw',       label: 'WMS / Vis. Wiedergabe' },
  { id: 'mosaik',       label: 'Mosaik-Test' },
  { id: 'rey',          label: 'Rey-Figur (ROCFT)' },
  { id: 'lps',          label: 'LPS' },
  { id: 'tol',          label: 'Turm von London' },
] as const;

// ZZT auf Wunsch der Klinik ausgeblendet (Logik/Normen bleiben, siehe featureFlags.ts).
const VISIBLE_TESTS = AVAILABLE_TESTS.filter(t => ZZT_ENABLED || t.id !== 'zzt');

const PR_RANGE_OPTIONS = [
  { value: 'below'   as const, label: 'Unterdurchschnittlich (PR < 16)' },
  { value: 'average' as const, label: 'Durchschnittlich (PR 16–84)' },
  { value: 'above'   as const, label: 'Überdurchschnittlich (PR > 84)' },
];

const HIGHLIGHT_CLASSES: Record<'below' | 'average' | 'above', string> = {
  below:   'border-l-[3px] border-rose-400 bg-rose-50/60',
  average: 'border-l-[3px] border-slate-400 bg-slate-50',
  above:   'border-l-[3px] border-emerald-400 bg-emerald-50/60',
};

const RELEVANCE_PILL_CLASSES: Record<'below' | 'average' | 'above', string> = {
  below:   'bg-rose-50 text-rose-600 border border-rose-200',
  average: 'bg-slate-100 text-slate-500 border border-slate-200',
  above:   'bg-emerald-50 text-emerald-600 border border-emerald-200',
};

const RELEVANCE_PILL_LABEL: Record<'below' | 'average' | 'above', string> = {
  below:   '↓',
  average: '–',
  above:   '↑',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

function formatDateLong(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
}

function applyVariables(text: string, patient: import('../types').Patient): string {
  const parts    = patient.name.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : patient.name;
  const anrede   = patient.geschlecht === 'w' ? 'Frau' : patient.geschlecht === 'm' ? 'Herr' : '';
  const nameStr  = anrede ? `${anrede} ${lastName}` : lastName;
  const today    = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return text.replaceAll('$$', nameStr).replaceAll('%%', today);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Rich text editor helpers ──────────────────────────────────────────────────

function ensureHtml(text: string): string {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ── Rich text editor ──────────────────────────────────────────────────────────

const RichTextEditor: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
}> = ({ value, onChange, placeholder, minHeight = 160 }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = ensureHtml(value);
    if (el.innerHTML !== html) {
      el.innerHTML = html;
    }
  }, [value]);

  const handleInput = () => {
    const html = ref.current?.innerHTML ?? '';
    onChange(html === '<br>' || html === '<div><br></div>' ? '' : html);
  };

  const execFormat = (cmd: string) => {
    document.execCommand(cmd, false);
    ref.current?.focus();
    handleInput();
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5 px-3 py-1 border-b border-slate-100 bg-slate-50/60 rounded-none">
        <button
          onMouseDown={e => { e.preventDefault(); execFormat('bold'); }}
          title="Fett (Ctrl+B)"
          className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 text-[13px] font-bold transition-colors"
        >B</button>
        <button
          onMouseDown={e => { e.preventDefault(); execFormat('italic'); }}
          title="Kursiv (Ctrl+I)"
          className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 text-[13px] italic transition-colors"
        >I</button>
        <button
          onMouseDown={e => { e.preventDefault(); execFormat('underline'); }}
          title="Unterstrichen (Ctrl+U)"
          className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 text-[13px] underline transition-colors"
        >U</button>
      </div>
      <div className="relative">
        {!value && placeholder && (
          <span className="absolute top-4 left-4 text-sm text-slate-300 pointer-events-none select-none leading-relaxed">
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          spellCheck
          lang="de"
          style={{ minHeight }}
          className="relative z-10 block w-full text-sm text-slate-700 leading-relaxed p-4 rounded-b-xl focus:outline-none"
        />
      </div>
    </div>
  );
};

// ── Block queue ───────────────────────────────────────────────────────────────

const BlockQueue: React.FC<{
  items: { instanceId: string; title: string; sectionId?: string }[];
  sections?: BefundSection[];
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}> = ({ items, sections = [], onRemove, onReorder }) => {
  const dragIdxRef = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col divide-y divide-slate-100 max-h-48 overflow-y-auto">
      {items.map((item, idx) => {
        const sectionName = item.sectionId ? sections.find(s => s.id === item.sectionId)?.name : undefined;
        return (
          <div
            key={item.instanceId}
            draggable
            onDragStart={() => { dragIdxRef.current = idx; }}
            onDragOver={e => { e.preventDefault(); setOverIdx(idx); }}
            onDrop={() => {
              const from = dragIdxRef.current;
              if (from !== null && from !== idx) onReorder(from, idx);
              dragIdxRef.current = null;
              setOverIdx(null);
            }}
            onDragEnd={() => { dragIdxRef.current = null; setOverIdx(null); }}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 transition-all border-t-2',
              overIdx === idx
                ? 'bg-blue-50 border-blue-400'
                : 'hover:bg-slate-50 border-transparent',
            )}
          >
            <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded p-0.5 transition-colors shrink-0">
              <GripVertical size={14} />
            </div>
            <span className="min-w-[20px] h-5 bg-slate-700 text-white text-[10px] font-bold rounded flex items-center justify-center shrink-0">
              {idx + 1}
            </span>
            <span className="flex-1 text-[12px] font-medium text-slate-700 truncate">{item.title || 'Baustein'}</span>
            {sectionName && (
              <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0 truncate max-w-[80px]" title={sectionName}>
                {sectionName}
              </span>
            )}
            <button
              onClick={() => onRemove(item.instanceId)}
              title="Entfernen"
              className="p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};


// ── Block edit modal ──────────────────────────────────────────────────────────

const EditBlockModal: React.FC<{
  block: Textbaustein | null;
  categories: string[];
  onSave: (p: { title: string; content: string; category: string; relevance: BlockRelevance[] }) => void;
  onClose: () => void;
}> = ({ block, categories, onSave, onClose }) => {
  const [title, setTitle]       = useState(block?.title ?? '');
  const [content, setContent]   = useState(block?.content ?? '');
  const [category, setCategory] = useState(block?.category ?? (categories[0] ?? ''));
  const [newCat, setNewCat]     = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [relevance, setRelevance] = useState<BlockRelevance[]>(block?.relevance ?? []);
  const titleRef = useRef<HTMLInputElement>(null);
  const newCatRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => { if (showNewCat) newCatRef.current?.focus(); }, [showNewCat]);

  const effectiveCat = newCat.trim() || category;
  const valid = title.trim() && htmlToPlainText(content).trim() && effectiveCat.trim();

  const addRelevance = () =>
    setRelevance(r => [...r, { testId: VISIBLE_TESTS[0].id, prRange: 'below' }]);
  const updateRelevance = (idx: number, patch: Partial<BlockRelevance>) =>
    setRelevance(r => r.map((e, i) => i === idx ? { ...e, ...patch } : e));
  const removeRelevance = (idx: number) =>
    setRelevance(r => r.filter((_, i) => i !== idx));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 6 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {block ? 'Baustein bearbeiten' : 'Neuer Baustein'}
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 block">Kategorie</label>
            <div className="flex gap-2">
              <select
                value={showNewCat ? '__new__' : category}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setShowNewCat(true);
                    setNewCat('');
                  } else {
                    setCategory(e.target.value);
                    setNewCat('');
                    setShowNewCat(false);
                  }
                }}
                className="flex-1 text-sm border border-slate-300 bg-white shadow-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">+ Neue Kategorie…</option>
              </select>
              {showNewCat && (
                <input
                  ref={newCatRef}
                  value={newCat}
                  onChange={e => setNewCat(e.target.value)}
                  placeholder="Name der neuen Kategorie"
                  className="flex-1 text-sm border border-slate-300 bg-white shadow-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 block">Kurztitel</label>
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Aufmerksamkeit unauffällig"
              className="w-full text-sm border border-slate-300 bg-white shadow-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 block">Bausteintext</label>
            <div className="border border-slate-300 bg-white shadow-sm rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-slate-400">
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="Text des Bausteins…"
                minHeight={96}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Relevanz (Hervorhebung)
              </label>
              <button
                onClick={addRelevance}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                <Plus size={11} /> Hinzufügen
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Baustein wird hervorgehoben, wenn Patientenbefund für den gewählten Test in diesen Bereich fällt.
            </p>
            {relevance.length === 0 ? (
              <p className="text-[11px] text-slate-300 italic">Keine Relevanz definiert.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {relevance.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={r.testId}
                      onChange={e => updateRelevance(i, { testId: e.target.value })}
                      className="flex-1 text-xs border border-slate-200 bg-white rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    >
                      {VISIBLE_TESTS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <select
                      value={r.prRange}
                      onChange={e => updateRelevance(i, { prRange: e.target.value as BlockRelevance['prRange'] })}
                      className="flex-1 text-xs border border-slate-200 bg-white rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    >
                      {PR_RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button onClick={() => removeRelevance(i)} className="text-slate-300 hover:text-rose-500 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Abbrechen
          </button>
          <button
            onClick={() => valid && onSave({ title: title.trim(), content: content.trim(), category: effectiveCat.trim(), relevance })}
            disabled={!valid}
            className="px-4 py-1.5 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Speichern
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── PR classification helpers ─────────────────────────────────────────────────

function parsePRValue(pr: number | string): number | null {
  if (typeof pr === 'number') return pr;
  const s = String(pr).trim();
  const gt = s.match(/^>\s*(\d+(?:\.\d+)?)/); if (gt) return parseFloat(gt[1]);
  const lt = s.match(/^<\s*(\d+(?:\.\d+)?)/); if (lt) return parseFloat(lt[1]);
  const rng = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (rng) return (parseFloat(rng[1]) + parseFloat(rng[2])) / 2;
  const n = parseFloat(s); return isNaN(n) ? null : n;
}

function classifyPR(
  pr: number | string,
  belowThreshold: number = 15.87,
): 'below' | 'average' | 'above' | null {
  const n = parsePRValue(pr);
  if (n === null) return null;
  return n > 84.13 ? 'above' : n < belowThreshold ? 'below' : 'average';
}

// TAP-M version uses PR < 31 as "below" threshold (≈ −0.5 SD)
const TAP_M_ALWAYS_KEYS = new Set(['alertnessM', 'alM_sd_pr']);
const TAP_M_VERSION_GROUPS: { verField: string; keys: Set<string> }[] = [
  { verField: 'gn_ver', keys: new Set(['gonogo', 'gn_sd_pr', 'gn_fehler_pr', 'gn_ausl_pr']) },
  { verField: 'fl_ver', keys: new Set(['flexibilitaet', 'fl_sd_pr', 'fl_fehler_pr']) },
  { verField: 'ga_ver', keys: new Set(['geteilte', 'geteilteVisuell', 'ga_sd_pr', 'gv_sd_pr', 'g_fehler_pr', 'g_ausl_ges_pr']) },
  { verField: 've_ver', keys: new Set(['ve_rt_krit_pr', 've_sd_krit_pr', 've_rt_nkrit_pr', 've_sd_nkrit_pr', 've_fehler_pr', 've_ausl_krit_pr', 've_zeilen_r_pr', 've_spalten_r_pr']) },
];

function getTapMKeys(rawValues: Record<string, unknown>): Set<string> {
  const keys = new Set(TAP_M_ALWAYS_KEYS);
  for (const { verField, keys: vKeys } of TAP_M_VERSION_GROUPS) {
    if (rawValues[verField] === 'M') {
      for (const k of vKeys) keys.add(k);
    }
  }
  return keys;
}

// Keys to display per test (mirrors testSummary PR_KEY_MAP)
const PR_DISPLAY_KEYS: Record<string, string[] | undefined> = {
  tmt:          ['A', 'B'],
  vlmt:         undefined,
  tap:          undefined,
  zzt:          ['zzt'],
  wms_vw:       ['sofortiger_abruf', 'verzoegerter_abruf', 'wiedererkennen'],
  zahlenspanne: ['vorwaerts', 'rueckwaerts'],
  blockspanne:  ['vorwaerts', 'rueckwaerts'],
  lg:           ['lgI', 'lgII'],
  mosaik:       ['mosaik'],
  rey:          ['cft', 'cfm', 'cqm'],
  lps:          ['s1_2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14'],
  tol:          ['alterkorrigiert', 'alter_bildung'],
};

const PR_BADGE: Record<'below' | 'average' | 'above', string> = {
  below:   'bg-rose-50 text-rose-700 border-rose-300',
  average: 'bg-slate-50 text-slate-600 border-slate-200',
  above:   'bg-emerald-50 text-emerald-700 border-emerald-300',
};

// Short display labels for individual PR keys
const KEY_SHORT_LABEL: Record<string, string> = {
  A: 'Teil A', B: 'Teil B',
  Dg1: 'Dg1', Dg5: 'Dg5', sumDg1_5: 'Σ1–5', I: 'I',
  Dg6: 'Dg6', Dg5_Dg6: 'Δ5–6', Dg7: 'Dg7', Dg5_Dg7: 'Δ5–7',
  W: 'WR', W_F: 'WR–FP',
  zzt: 'Median',
  vorwaerts: 'vw', rueckwaerts: 'rk',
  sofortiger_abruf: 'sofort', verzoegerter_abruf: 'verzög.', wiedererkennen: 'WE',
  cft: 'Kopieren', cfm: 'dir. Abruf', cqm: 'verzög. Abruf',
  lgI: 'LGI', lgII: 'LGII', wiedererk: 'WE',
  alterkorrigiert: 'Alter', alter_bildung: 'Alter+Bild.',
  mosaik: 'Mosaik',
  alertnessM: 'Alertness M', alertness23: 'Alertness 2.3',
  alertness23_ohne: 'Alertness o. WR', alertness23_mit: 'Alertness m. WR',
  gonogo: 'Go/Nogo', gonogo2: 'Go/Nogo 2', flexibilitaet: 'Flexibilität',
  geteilte: 'Get. Aufmerksamkeit', geteilteVisuell: 'Get. Aufm. (visuell)',
  vigilanz: 'Vigilanz', arbeitsgedaechtnis: 'Arbeitsgedächtnis',
  alM_sd_pr: 'Alertness M SD', al23_ohne_sd_pr: 'Alert. o.WR SD', al23_mit_sd_pr: 'Alert. m.WR SD',
  gn_sd_pr: 'Go/Nogo SD', gn2_sd_pr: 'Go/Nogo 2 SD', fl_sd_pr: 'Flexibilität SD',
  ga_sd_pr: 'Get. Aufm. SD', gv_sd_pr: 'Get. Aufm. vis. SD',
  vig_sd_pr: 'Vigilanz SD', ag_sd_pr: 'Arbeitsged. SD',
  gn_fehler_pr: 'Go/Nogo Fehler', gn_ausl_pr: 'Go/Nogo Auslasser',
  gn2_fehler_pr: 'Go/Nogo 2 Fehler', gn2_ausl_pr: 'Go/Nogo 2 Auslasser',
  fl_fehler_pr: 'Flexib. Fehler',
  g_fehler_pr: 'Get. Aufm. Fehler', g_ausl_ges_pr: 'Get. Aufm. Auslasser',
  vig_fehler_pr: 'Vigilanz Fehler', vig_ausl_pr: 'Vigilanz Auslasser',
  ag_fehler_pr: 'Arbeitsged. Fehler', ag_ausl_pr: 'Arbeitsged. Auslasser',
  ve_rt_krit_pr: 'Scan Treffer RT', ve_sd_krit_pr: 'Scan Treffer SD',
  ve_rt_nkrit_pr: 'Scan Nkrit. RT', ve_sd_nkrit_pr: 'Scan Nkrit. SD',
  ve_fehler_pr: 'Scan Fehler', ve_ausl_krit_pr: 'Scan krit. Auslasser',
  ve_zeilen_r_pr: 'Scan Zeilen', ve_spalten_r_pr: 'Scan Spalten',
  gf_pr: 'Gesichtsfeld', neg_pr: 'Neglect',
};

// Fallback domain when domainMapping is absent (e.g. older results)
const FALLBACK_DOMAIN: Record<string, string> = {
  zzt:          '1. Aufmerksamkeit',
  tmt:          '1. Aufmerksamkeit',
  tap:          '1. Aufmerksamkeit',
  zahlenspanne: '2. Gedächtnis',
  blockspanne:  '2. Gedächtnis',
  vlmt:         '2. Gedächtnis',
  lg:           '2. Gedächtnis',
  wms_vw:       '2. Gedächtnis',
  mosaik:       '3. Visuo-Perz. / Visuo-Konstr.',
  rey:          '3. Visuo-Perz. / Visuo-Konstr.',
  lps:          '4. Intellektuelle Fähigkeiten',
  tol:          '5. Exekutive Funktionen',
};

// TAP has no domainMapping saved — provide per-key overrides for keys that
// don't belong in Aufmerksamkeit (ve_* → Visuelle Exploration)
const TAP_KEY_DOMAIN: Record<string, string> = {
  ve_rt_krit_pr:  '6. Visuelle Exploration',
  ve_sd_krit_pr:  '6. Visuelle Exploration',
  ve_rt_nkrit_pr: '6. Visuelle Exploration',
  ve_sd_nkrit_pr: '6. Visuelle Exploration',
  ve_fehler_pr:   '6. Visuelle Exploration',
  ve_ausl_krit_pr:'6. Visuelle Exploration',
  ve_zeilen_r_pr: '6. Visuelle Exploration',
  ve_spalten_r_pr:'6. Visuelle Exploration',
  gf_pr:          '6. Visuelle Exploration',
  neg_pr:         '6. Visuelle Exploration',
  arbeitsgedaechtnis: '2. Gedächtnis',
  ag_sd_pr:           '2. Gedächtnis',
  ag_fehler_pr:       '2. Gedächtnis',
  ag_ausl_pr:         '2. Gedächtnis',
};

// Strip subdomain suffix "(…)" to get the major domain label
function getMajorDomain(domain: string): string {
  const m = domain.match(/^(\d+\.\s*[^(]+)/);
  return m ? m[1].trim() : domain;
}

// ── Test results overview panel ───────────────────────────────────────────────

type PRClassification = 'below' | 'average' | 'above' | null;

type PanelTestEntry = {
  testId: string;
  testLabel: string;
  date: string;
  prPairs: [string, number | string, PRClassification][];
};

const TestResultsPanel: React.FC<{ results: TestResult[] }> = ({ results }) => {
  const [open, setOpen] = useState(false);

  // Group PR values by major domain, mirroring PRProfile's domain structure.
  // Tests like TAP can appear in multiple domain sections (Aufmerksamkeit,
  // Gedächtnis, Visuelle Exploration) with only the relevant PR keys per section.
  const domainGroups = useMemo(() => {
    const groupMap = new Map<string, PanelTestEntry[]>();

    for (const { id: testId, label: testLabel } of VISIBLE_TESTS) {
      const latest = results
        .filter(r => r.testId === testId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (!latest) continue;

      const allowedKeys = PR_DISPLAY_KEYS[testId];
      const rawCandidates: [string, number | string][] = allowedKeys
        ? allowedKeys
            .map(k => [k, latest.percentileRanks[k]] as [string, number | string])
            .filter(([, v]) => v != null && v !== '' && v !== 'n/a')
        : (Object.entries(latest.percentileRanks) as [string, number | string][])
            .filter(([, v]) => v != null && v !== '' && v !== 'n/a');

      // For TAP: determine which keys use the M-version threshold (PR < 31)
      const tapMKeys = testId === 'tap'
        ? getTapMKeys((latest.rawValues ?? {}) as Record<string, unknown>)
        : null;

      const candidates: [string, number | string, PRClassification][] =
        rawCandidates.map(([key, pr]) => {
          const threshold = tapMKeys?.has(key) ? 31 : 15.87;
          return [key, pr, classifyPR(pr, threshold)];
        });

      // Bucket each PR key into its major domain
      const byDomain = new Map<string, [string, number | string, PRClassification][]>();
      for (const [key, pr, cl] of candidates) {
        const fullDomain =
          latest.domainMapping?.[key] ??
          (testId === 'tap' ? TAP_KEY_DOMAIN[key] : undefined) ??
          FALLBACK_DOMAIN[testId] ??
          'Weitere';
        const major = getMajorDomain(fullDomain);
        if (!byDomain.has(major)) byDomain.set(major, []);
        byDomain.get(major)!.push([key, pr, cl]);
      }

      for (const [major, prPairs] of byDomain) {
        if (!groupMap.has(major)) groupMap.set(major, []);
        groupMap.get(major)!.push({ testId, testLabel, date: latest.date, prPairs });
      }
    }

    return [...groupMap.entries()]
      .sort(([a], [b]) => (parseFloat(a) || 99) - (parseFloat(b) || 99))
      .map(([domain, entries]) => ({ domain, entries }));
  }, [results]);

  if (!domainGroups.length) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors rounded-xl"
      >
        {open
          ? <ChevronDown size={12} className="text-slate-400 shrink-0" />
          : <ChevronRight size={12} className="text-slate-400 shrink-0" />}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex-1">
          Testergebnisse im Überblick
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {domainGroups.length} Domänen
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100">
              {domainGroups.map(({ domain, entries }) => (
                <div key={domain}>
                  <div className="px-3 py-1 bg-slate-50 border-b border-slate-100">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {domain}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {entries.map(({ testId, testLabel, date, prPairs }) => (
                      <div key={testId} className="flex items-start gap-3 px-3 py-2">
                        <div className="w-[88px] shrink-0 pt-0.5">
                          <div className="text-[11px] font-semibold text-slate-700 leading-tight">{testLabel}</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">{formatDate(date)}</div>
                        </div>
                        <div className="flex flex-wrap gap-1 flex-1 pt-0.5">
                          {prPairs.map(([key, pr, cl]) => {
                            const lbl = KEY_SHORT_LABEL[key] ?? key.replace(/_/g, ' ');
                            return (
                              <span
                                key={key}
                                title={`${lbl}: PR ${pr}`}
                                className={cn(
                                  'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border',
                                  cl ? PR_BADGE[cl] : 'bg-slate-50 text-slate-400 border-slate-100',
                                )}
                              >
                                <span className="opacity-60 text-[9px]">{lbl}</span>
                                <span className="font-bold">{pr}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const BefundTab: React.FC<{ patient: Patient; previousResults: TestResult[] }> = ({
  patient, previousResults,
}) => {
  const { currentUser } = useAuth();
  const username = currentUser ?? 'default';

  // ── Library ────────────────────────────────────────────────────────────────
  const { library, setLibrary, knownUsers, setKnownUsers } = useLibrarySync(username);
  const [viewingUser, setViewingUser]     = useState(username);
  const [viewingLibrary, setViewingLibrary] = useState<Textbaustein[]>(() => loadLibrary(username));
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp]           = useState(false);

  // Category management
  const [renamingCat, setRenamingCat]     = useState<string | null>(null);
  const [renameValue, setRenameValue]     = useState('');
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<string | null>(null);

  const [editingBlock, setEditingBlock]   = useState<Textbaustein | null | 'new'>(null);
  const [copied, setCopied]               = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();


  // ── Sub-tabs ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]         = useState<'befund' | 'verlauf'>('befund');

  // ── Verlaufseinträge UI state ──────────────────────────────────────────────
  const [editingVerlaufId, setEditingVerlaufId] = useState<string | null>(null);
  const [confirmDeleteVerlaufId, setConfirmDeleteVerlaufId] = useState<string | null>(null);
  const [verlaufCopied, setVerlaufCopied] = useState<string | null>(null);
  const verlaufCopiedTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Save indicators ────────────────────────────────────────────────────────
  const [reportSaved, setReportSaved]   = useState(false);
  const [verlaufSaved, setVerlaufSaved] = useState(false);
  const reportSavedTimerRef  = useRef<ReturnType<typeof setTimeout>>();
  const verlaufSavedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const onReportSave = useCallback(() => {
    setReportSaved(true);
    if (reportSavedTimerRef.current) clearTimeout(reportSavedTimerRef.current);
    reportSavedTimerRef.current = setTimeout(() => setReportSaved(false), 2000);
  }, []);

  const onVerlaufSave = useCallback(() => {
    setVerlaufSaved(true);
    if (verlaufSavedTimerRef.current) clearTimeout(verlaufSavedTimerRef.current);
    verlaufSavedTimerRef.current = setTimeout(() => setVerlaufSaved(false), 2000);
  }, []);

  // ── Report & Verlauf — synced to Firestore when Firebase is enabled ─────────
  const { report, setReport, verlaufEntries, setVerlaufEntries } = useBefundSync(
    patient.id,
    onReportSave,
    onVerlaufSave,
  );

  const activeVerlauf = verlaufEntries.find(e => e.id === editingVerlaufId) ?? null;

  // On mount: pull shared textbausteine.json so other users' libraries are visible (Electron only)
  useEffect(() => {
    if (!isElectron()) return;
    const api = (window as unknown as { electronAPI: import('../lib/ipc-types').ElectronAPI }).electronAPI;
    api.textbausteinGetStore().then(raw => {
      if (!raw) return;
      try {
        const store = JSON.parse(raw) as Record<string, Textbaustein[]>;
        loadStoreIntoLocalStorage(store);
        setKnownUsers(getKnownUsers());
      } catch { /* ignore malformed file */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push own library changes to shared file — read-modify-write so other users' data is preserved.
  // Using buildStoreFromLocalStorage() alone would overwrite colleagues' entries on first load
  // (before the async pull above has registered them in localStorage).
  useEffect(() => {
    if (!isElectron()) return;
    const api = (window as unknown as { electronAPI: import('../lib/ipc-types').ElectronAPI }).electronAPI;
    api.textbausteinGetStore().then(raw => {
      let existing: Record<string, Textbaustein[]> = {};
      if (raw) { try { existing = JSON.parse(raw) as Record<string, Textbaustein[]>; } catch { /* ignore */ } }
      const merged = { ...existing, [username]: library };
      api.textbausteinSetStore(JSON.stringify(merged, null, 2));
    });
  }, [library, username]);

  // When viewingUser changes, load that user's library
  useEffect(() => {
    setViewingLibrary(viewingUser === username ? library : loadLibrary(viewingUser));
  }, [viewingUser, username, library]);


  // ── Test status ────────────────────────────────────────────────────────────
  const testStatus = useMemo(() => {
    const map = new Map<string, 'below' | 'average' | 'above'>();
    for (const { id: testId } of VISIBLE_TESTS) {
      const counts = getTestSymbolCounts(testId, previousResults);
      if (!counts) continue;
      if (counts.below > 0) map.set(testId, 'below');
      else if (counts.above > 0) map.set(testId, 'above');
      else map.set(testId, 'average');
    }
    return map;
  }, [previousResults]);

  const getBlockHighlight = useCallback((block: Textbaustein): 'below' | 'average' | 'above' | null => {
    if (!block.relevance?.length) return null;
    for (const r of block.relevance) {
      if (testStatus.get(r.testId) === r.prRange) return r.prRange;
    }
    return null;
  }, [testStatus]);

  const isViewingOwn = viewingUser === username;
  const categories   = getCategories(viewingLibrary);

  const toggleCat = (cat: string) =>
    setCollapsedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  // ── Category management ────────────────────────────────────────────────────
  const startRename = (cat: string) => { setRenamingCat(cat); setRenameValue(cat); };
  const confirmRename = () => {
    if (renamingCat && renameValue.trim() && renameValue.trim() !== renamingCat) {
      setLibrary(lib => renameCategory(lib, renamingCat, renameValue.trim()));
    }
    setRenamingCat(null);
  };

  // ── Block insert ───────────────────────────────────────────────────────────
  const doInsertBlock = useCallback((block: Textbaustein, sectionId: string | undefined) => {
    if (activeTab === 'befund') {
      setReport(r => addItemToReport(r, block, sectionId));
    } else {
      if (editingVerlaufId === null) {
        const newEntry: VerlaufsEintrag = {
          id: crypto.randomUUID(),
          date: todayISO(),
          items: [], finalText: '',
          createdAt: Date.now(),
        };
        const patch = addItemToVerlauf(newEntry, block);
        const withBlock = { ...newEntry, ...patch };
        setVerlaufEntries(e => [withBlock, ...e]);
        setEditingVerlaufId(withBlock.id);
      } else {
        setVerlaufEntries(entries => entries.map(e => {
          if (e.id !== editingVerlaufId) return e;
          return { ...e, ...addItemToVerlauf(e, block) };
        }));
      }
    }
  }, [activeTab, editingVerlaufId]);

  const handleInsertBlock = useCallback((block: Textbaustein) => {
    const resolved = { ...block, content: applyVariables(block.content, patient) };
    doInsertBlock(resolved, undefined);
  }, [patient, doInsertBlock]);

  const handleSaveBlock = (patch: { title: string; content: string; category: string; relevance: BlockRelevance[] }) => {
    if (editingBlock === 'new') {
      setLibrary(lib => addBlock(lib, patch));
    } else if (editingBlock) {
      setLibrary(lib => updateBlock(lib, editingBlock.id, patch));
    }
    setEditingBlock(null);
  };

  // ── Befund copy & PDF ──────────────────────────────────────────────────────
  const handleCopy = async () => {
    const html = report.finalText.trim();
    if (!html) return;
    const plain = htmlToPlainText(html);
    const finish = () => {
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    };
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      finish();
    } catch {
      navigator.clipboard.writeText(plain).then(finish);
    }
  };

  const handlePdfExport = () => {
    const content = report.finalText.trim();
    if (!content) return;

    const doc = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Befundbericht – ${escapeHtml(patient.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; margin: 0; padding: 2.5cm; line-height: 1.7; color: #111; }
  .doc-header { border-bottom: 1px solid #aaa; padding-bottom: 14px; margin-bottom: 24px; }
  h1 { font-size: 14pt; margin: 0 0 8px; font-weight: bold; letter-spacing: 0.02em; }
  .meta { font-size: 10pt; color: #555; display: flex; gap: 32px; flex-wrap: wrap; }
  .content { line-height: 1.7; }
  @page { margin: 2cm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="doc-header">
  <h1>Neuropsychologischer Befundbericht</h1>
  <div class="meta">
    <span><strong>Patient:</strong> ${escapeHtml(patient.name)}</span>
    <span><strong>Datum:</strong> ${escapeHtml(formatDate(todayISO()))}</span>
    <span><strong>Untersucher:</strong> ${escapeHtml(username)}</span>
  </div>
</div>
<div class="content">${content}</div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(doc);
    win.document.close();
  };

  // ── Verlauf operations ─────────────────────────────────────────────────────
  const createVerlaufEntry = () => {
    const entry: VerlaufsEintrag = {
      id: crypto.randomUUID(),
      date: todayISO(),
      items: [], finalText: '',
      createdAt: Date.now(),
    };
    setVerlaufEntries(e => [entry, ...e]);
    setEditingVerlaufId(entry.id);
  };

  const patchActiveVerlauf = useCallback((patch: Partial<Pick<VerlaufsEintrag, 'finalText' | 'items' | 'date'>>) => {
    if (!editingVerlaufId) return;
    setVerlaufEntries(entries => entries.map(e => e.id === editingVerlaufId ? { ...e, ...patch } : e));
  }, [editingVerlaufId]);

  const handleVerlaufCopy = async (entry: VerlaufsEintrag) => {
    const html = entry.finalText.trim();
    if (!html) return;
    const plain = htmlToPlainText(html);
    const finish = () => {
      setVerlaufCopied(entry.id);
      if (verlaufCopiedTimer.current) clearTimeout(verlaufCopiedTimer.current);
      verlaufCopiedTimer.current = setTimeout(() => setVerlaufCopied(null), 2000);
    };
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      finish();
    } catch {
      navigator.clipboard.writeText(plain).then(finish);
    }
  };

  const sortedVerlaufHistory = useMemo(
    () => [...verlaufEntries]
      .filter(e => e.id !== editingVerlaufId)
      .sort((a, b) => b.createdAt - a.createdAt),
    [verlaufEntries, editingVerlaufId],
  );

  return (
    <div className="flex gap-6 h-full min-h-0">

      {/* ══════════════════════════════════════════════════════════════════
          LEFT — Block library (fixed width, independently scrollable)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="w-[280px] shrink-0 flex flex-col gap-3 min-h-0">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Bausteinbibliothek
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowHelp(h => !h)}
              title="Hilfe anzeigen"
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
                showHelp
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700',
              )}
            >
              <HelpCircle size={15} />
            </button>
            {isViewingOwn && (
              <button
                onClick={() => setEditingBlock('new')}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <Plus size={12} /> Neuer Baustein
              </button>
            )}
          </div>
        </div>

        {/* Help panel */}
        <AnimatePresence initial={false}>
          {showHelp && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden shrink-0"
            >
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2 text-[11px] text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700 text-[10px] uppercase tracking-widest">Wie funktioniert der Befund-Tab?</p>

                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Bericht / Verlaufseintrag erstellen</p>
                  <p>Klick auf <span className="font-semibold">Einfügen</span> → Baustein erscheint im Textfeld. Bausteine werden mit Leerzeile verbunden. Im Textfeld kann frei editiert werden. <span className="font-semibold">Text kopieren</span> kopiert das Ergebnis in die Zwischenablage.</p>
                  <p><span className="font-semibold">Bausteine anordnen</span> (unten rechts): Nummern zeigen die Reihenfolge — per Drag & Drop umordnen. <span className="font-semibold">×</span> entfernt einen Baustein. <span className="font-semibold">Leeren</span> löscht alle auf einmal.</p>
                </div>

                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Variablen in Bausteintexten</p>
                  <p><span className="font-mono font-semibold bg-slate-100 px-1 rounded">$$</span> → <span className="font-semibold">Herr / Frau [Nachname]</span> &nbsp;|&nbsp; <span className="font-mono font-semibold bg-slate-100 px-1 rounded">%%</span> → <span className="font-semibold">heutiges Datum</span></p>
                </div>

                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Bibliothek verwalten</p>
                  <p><span className="font-semibold">Neuer Baustein</span> → Kategorie, Kurztitel, Text, optional Relevanz-Verknüpfung. ✏ bearbeitet, 🗑 löscht. Nutzer-Auswahl oben → fremde Bibliothek ansehen.</p>
                </div>

                <p className="text-[10px] text-slate-400">Rechtschreibprüfung: browser-integriert — Rechtsklick auf unterstrichene Wörter.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User selector */}
        {knownUsers.length > 1 && (
          <select
            value={viewingUser}
            onChange={e => setViewingUser(e.target.value)}
            className="w-full shrink-0 text-xs font-medium border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value={username}>Eigene Bausteine</option>
            {knownUsers.filter(u => u !== username).map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}

        {/* Scrollable category list */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-0.5">
          {categories.map(cat => {
            const blocks      = viewingLibrary.filter(b => b.category === cat);
            const isCollapsed = collapsedCats.has(cat);
            const hasHighlighted = blocks.some(b => getBlockHighlight(b) !== null);

            return (
              <div key={cat} className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">

                {/* Category header */}
                <div className="flex items-center gap-1.5 bg-slate-200 border-b border-slate-200 rounded-t-xl px-3 py-1.5 group/cathead">
                  <button
                    onClick={() => !renamingCat && toggleCat(cat)}
                    className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {renamingCat === cat ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={confirmRename}
                      onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenamingCat(null); }}
                      className="flex-1 text-[11px] font-semibold bg-white text-slate-700 border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  ) : (
                    <span
                      className="flex-1 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer select-none"
                      onClick={() => toggleCat(cat)}
                    >
                      {cat}
                      {hasHighlighted && (
                        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-rose-400 align-middle" title="Hervorgehobene Bausteine vorhanden" />
                      )}
                    </span>
                  )}

                  <span className="text-[10px] text-slate-400 shrink-0">{blocks.length}</span>

                  {isViewingOwn && renamingCat !== cat && (
                    <>
                      <button
                        onClick={() => startRename(cat)}
                        title="Kategorie umbenennen"
                        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-800 hover:bg-slate-300 transition-colors opacity-0 group-hover/cathead:opacity-100"
                      >
                        <Edit3 size={10} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteCat(cat)}
                        title="Kategorie löschen"
                        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-rose-600 hover:bg-rose-100 transition-colors opacity-0 group-hover/cathead:opacity-100"
                      >
                        <Trash2 size={10} />
                      </button>
                    </>
                  )}
                </div>

                {/* Delete category confirmation */}
                <AnimatePresence>
                  {confirmDeleteCat === cat && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      transition={{ duration: 0.12 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border-t border-rose-100">
                        <span className="text-[11px] text-rose-700 flex-1">
                          {blocks.length} Baustein{blocks.length !== 1 ? 'e' : ''} löschen?
                        </span>
                        <button
                          onClick={() => { setLibrary(lib => deleteCategory(lib, cat)); setConfirmDeleteCat(null); }}
                          className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition-colors"
                        >Löschen</button>
                        <button
                          onClick={() => setConfirmDeleteCat(null)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
                        >Abbrechen</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Blocks */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-slate-100">
                        {blocks.map(block => {
                          const highlight = getBlockHighlight(block);
                          return (
                            <div
                              key={block.id}
                              className={cn(
                                'group flex items-center gap-2 px-3 py-2 transition-colors',
                                highlight ? HIGHLIGHT_CLASSES[highlight] : 'hover:bg-slate-50',
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[12px] font-medium text-slate-700 leading-snug">
                                    {block.title}
                                  </span>
                                  {block.relevance?.map((r, i) => {
                                    const testLabel = VISIBLE_TESTS.find(t => t.id === r.testId)?.label ?? r.testId;
                                    const isActive  = testStatus.get(r.testId) === r.prRange;
                                    return (
                                      <span
                                        key={i}
                                        className={cn(
                                          'text-[9px] font-semibold px-1 py-0.5 rounded',
                                          isActive
                                            ? RELEVANCE_PILL_CLASSES[r.prRange]
                                            : 'bg-slate-50 text-slate-300 border border-slate-100',
                                        )}
                                        title={`${testLabel} – ${PR_RANGE_OPTIONS.find(o => o.value === r.prRange)?.label}`}
                                      >
                                        {testLabel} {RELEVANCE_PILL_LABEL[r.prRange]}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {isViewingOwn && (
                                  <button
                                    onClick={() => setEditingBlock(block)}
                                    title="Bearbeiten"
                                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <Edit3 size={11} />
                                  </button>
                                )}
                                {isViewingOwn && (
                                  <button
                                    onClick={() => setLibrary(lib => deleteBlock(lib, block.id))}
                                    title="Löschen"
                                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-rose-600 hover:bg-rose-100 transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                                {!isViewingOwn && (
                                  <button
                                    onClick={() => setLibrary(lib => addBlock(lib, {
                                      title: block.title,
                                      content: block.content,
                                      category: block.category,
                                      relevance: block.relevance,
                                    }))}
                                    title="In eigene Bibliothek kopieren"
                                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-100 transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <BookCopy size={11} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleInsertBlock(block)}
                                  title="In Bericht einfügen"
                                  className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          RIGHT — Sub-tabs: Befundbericht | Verlaufseinträge
      ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 gap-3">

        {/* Sub-tab switcher */}
        <div className="flex gap-0.5 bg-slate-100 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setActiveTab('befund')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all',
              activeTab === 'befund'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-400 hover:text-slate-600',
            )}
          >
            <FileText size={13} />
            Befundbericht
          </button>
          <button
            onClick={() => setActiveTab('verlauf')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all',
              activeTab === 'verlauf'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-400 hover:text-slate-600',
            )}
          >
            <CalendarDays size={13} />
            Verlaufseinträge
            {verlaufEntries.length > 0 && (
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors',
                activeTab === 'verlauf' ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500',
              )}>
                {verlaufEntries.length}
              </span>
            )}
          </button>
        </div>

        {/* Test results overview — collapsible, visible in both sub-tabs */}
        <TestResultsPanel results={previousResults} />

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-3 pb-4">

            {/* ── BEFUNDBERICHT ────────────────────────────────────────── */}
            {activeTab === 'befund' && (
              <>

                {/* Report card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-md shadow-slate-200/60">
                  <div className="flex items-center gap-2 bg-slate-200 border-b border-slate-200 rounded-t-xl px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 flex-1 truncate">
                      Befundbericht — {patient.name}
                    </span>
                    {/* Save indicator */}
                    <AnimatePresence>
                      {reportSaved && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium shrink-0"
                        >
                          <Check size={10} /> Gespeichert
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {report.items.length > 0 && (
                      <button
                        onClick={() => setReport(emptyReport())}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                      >
                        <Trash2 size={11} /> Leeren
                      </button>
                    )}
                    <button
                      onClick={handlePdfExport}
                      disabled={!report.finalText.trim()}
                      title="Als PDF exportieren"
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <FileDown size={11} /> PDF
                    </button>
                    <button
                      onClick={handleCopy}
                      disabled={!report.finalText.trim()}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-md transition-all',
                        copied
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-35 disabled:cursor-not-allowed',
                      )}
                    >
                      {copied ? <Check size={11} /> : <Copy size={11} />}
                      {copied ? 'Kopiert!' : 'Text kopieren'}
                    </button>
                  </div>
                  <RichTextEditor
                    value={report.finalText}
                    onChange={v => setReport(r => setFinalText(r, v))}
                    placeholder={
                      report.items.length === 0
                        ? 'Bausteine aus der Bibliothek einfügen oder hier direkt schreiben…'
                        : 'Text aus Bausteinen — hier direkt bearbeiten…'
                    }
                  />
                </div>

                {/* Block queue */}
                {report.items.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-md shadow-slate-200/60 flex flex-col">
                    <div className="flex items-center gap-2 bg-slate-200 border-b border-slate-200 rounded-t-xl px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 flex-1">
                        Bausteine anordnen
                      </span>
                      <span className="text-[10px] text-slate-400">Drag & Drop ändert die Reihenfolge</span>
                    </div>
                    <BlockQueue
                      items={report.items}
                      sections={report.sections}
                      onRemove={id => setReport(r => removeItem(r, id))}
                      onReorder={(from, to) => setReport(r => reorderItems(r, from, to))}
                    />
                  </div>
                )}
              </>
            )}

            {/* ── VERLAUFSEINTRÄGE ──────────────────────────────────────── */}
            {activeTab === 'verlauf' && (
              <>
                {/* Active entry editor */}
                {activeVerlauf ? (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-md shadow-slate-200/60">
                    <div className="flex items-center gap-2 bg-slate-200 border-b border-slate-200 rounded-t-xl px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 shrink-0">
                        Verlaufseintrag
                      </span>
                      <input
                        type="date"
                        value={activeVerlauf.date}
                        onChange={e => patchActiveVerlauf({ date: e.target.value })}
                        className="text-xs bg-white text-slate-700 rounded-md px-2 py-0.5 border border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                      <div className="flex-1" />
                      {/* Verlauf save indicator */}
                      <AnimatePresence>
                        {verlaufSaved && (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium shrink-0"
                          >
                            <Check size={10} /> Gespeichert
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <button
                        onClick={() => handleVerlaufCopy(activeVerlauf)}
                        disabled={!activeVerlauf.finalText.trim()}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all',
                          verlaufCopied === activeVerlauf.id
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-35 disabled:cursor-not-allowed',
                        )}
                      >
                        {verlaufCopied === activeVerlauf.id ? <Check size={11} /> : <Copy size={11} />}
                        {verlaufCopied === activeVerlauf.id ? 'Kopiert!' : 'Kopieren'}
                      </button>
                      <button
                        onClick={() => setEditingVerlaufId(null)}
                        title="Schließen"
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <RichTextEditor
                      value={activeVerlauf.finalText}
                      onChange={v => patchActiveVerlauf({ finalText: v })}
                      placeholder="Verlaufseintrag schreiben oder Bausteine aus der Bibliothek einfügen…"
                      minHeight={120}
                    />
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-dashed border-slate-300 flex items-center justify-center p-6">
                    <button
                      onClick={createVerlaufEntry}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-colors shadow-sm"
                    >
                      <Plus size={14} /> Neuer Verlaufseintrag
                    </button>
                  </div>
                )}

                {/* Active entry block queue */}
                {activeVerlauf && activeVerlauf.items.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-md shadow-slate-200/60 flex flex-col">
                    <div className="flex items-center gap-2 bg-slate-200 border-b border-slate-200 rounded-t-xl px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 flex-1">
                        Bausteine anordnen
                      </span>
                      <span className="text-[10px] text-slate-400">Drag & Drop ändert die Reihenfolge</span>
                    </div>
                    <BlockQueue
                      items={activeVerlauf.items}
                      onRemove={id => patchActiveVerlauf(removeVerlaufItem(activeVerlauf, id))}
                      onReorder={(from, to) => patchActiveVerlauf(reorderVerlaufItems(activeVerlauf, from, to))}
                    />
                  </div>
                )}

                {/* History */}
                <div className="flex flex-col gap-2">
                  {/* History header */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex-1">
                      Verlaufshistorie
                      {sortedVerlaufHistory.length > 0 && (
                        <span className="ml-2 bg-slate-200 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {sortedVerlaufHistory.length}
                        </span>
                      )}
                    </span>
                    {activeVerlauf ? (
                      <button
                        onClick={() => setEditingVerlaufId(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        <Check size={11} /> Eintrag speichern
                      </button>
                    ) : (
                      <button
                        onClick={createVerlaufEntry}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
                      >
                        <Check size={11} /> Eintrag speichern
                      </button>
                    )}
                  </div>

                  {sortedVerlaufHistory.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-[12px] text-slate-300 italic">
                      {verlaufEntries.length === 0
                        ? 'Noch keine Verlaufseinträge — oben einen neuen anlegen.'
                        : 'Aktuell in Bearbeitung — schließen zum Archivieren.'}
                    </div>
                  ) : (
                    /* Timeline layout */
                    <div className="relative">
                      {/* Vertical timeline line */}
                      <div className="absolute left-[13px] top-3 bottom-3 w-px bg-slate-200 pointer-events-none" />

                      <div className="flex flex-col gap-5">
                        {sortedVerlaufHistory.map(entry => {
                          const isCopied = verlaufCopied === entry.id;
                          return (
                            <div key={entry.id} className="relative flex gap-3.5">
                              {/* Timeline dot */}
                              <div className="shrink-0 mt-[11px] w-[11px] h-[11px] rounded-full bg-white border-2 border-slate-300 z-10" />

                              {/* Entry content */}
                              <div className="flex-1 min-w-0">
                                {/* Date row + actions */}
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-[13px] font-semibold text-slate-600 leading-none">
                                    {formatDateLong(entry.date)}
                                  </span>
                                  <div className="flex items-center gap-0.5 ml-auto shrink-0">
                                    <button
                                      onClick={() => handleVerlaufCopy(entry)}
                                      disabled={!entry.finalText.trim()}
                                      title="Text kopieren"
                                      className={cn(
                                        'w-6 h-6 flex items-center justify-center rounded-md transition-colors',
                                        isCopied
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30',
                                      )}
                                    >
                                      {isCopied ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                    <button
                                      onClick={() => setEditingVerlaufId(entry.id)}
                                      title="Bearbeiten"
                                      className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                    >
                                      <Edit3 size={12} />
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteVerlaufId(entry.id)}
                                      title="Löschen"
                                      className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>

                                {/* Delete confirm */}
                                <AnimatePresence>
                                  {confirmDeleteVerlaufId === entry.id && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.12 }}
                                      className="overflow-hidden mb-1.5"
                                    >
                                      <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 rounded-lg border border-rose-100">
                                        <span className="text-[11px] text-rose-700 flex-1">Eintrag löschen?</span>
                                        <button
                                          onClick={() => { setVerlaufEntries(e => e.filter(x => x.id !== entry.id)); setConfirmDeleteVerlaufId(null); }}
                                          className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition-colors"
                                        >Löschen</button>
                                        <button
                                          onClick={() => setConfirmDeleteVerlaufId(null)}
                                          className="text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
                                        >Abbrechen</button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>

                                {/* Content card */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                                  <div className="px-4 py-3.5 text-[13px] text-slate-700 leading-[1.75] whitespace-pre-wrap">
                                    {entry.finalText || <span className="italic text-slate-300">Leerer Eintrag</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {/* Edit/New block modal */}
      <AnimatePresence>
        {editingBlock !== null && (
          <EditBlockModal
            block={editingBlock === 'new' ? null : editingBlock}
            categories={getCategories(library)}
            onSave={handleSaveBlock}
            onClose={() => setEditingBlock(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
};
