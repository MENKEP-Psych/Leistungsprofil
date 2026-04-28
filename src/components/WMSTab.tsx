import React, { useState } from 'react';
import {
  Save, History, AlertCircle, CheckCircle2, Pencil, X, Brain,
  Trash2, Check, ListChecks, ChevronLeft, ChevronRight,
  Image as ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from './TestForm';
import wmsNormen from '../data/wms_iv_visuelle_wiedergabe_normen.json';
import transformationNormen from '../data/testnormen_transformation.json';

interface WMSTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

// ── Figure / criteria data ────────────────────────────────────────────────────
// ⚠️ criterion.text, .bullets und .note bitte aus dem WMS-IV Handbuch eintragen.
// correctImgs / wrongImgs: Dateipfade zu den Beispielbildern (z.B. '/wms/I_k1_richtig_1.png')

interface WMSCriterion {
  id: string;
  title: string;           // kurzer Name z.B. "Horizontale Linie"
  bullets: string[];       // 3–5 Stichpunkte
  note: string;            // 1–2 erklärende Sätze
  pts: number;             // immer 1
  correctImgs: string[];   // Pfade zu "korrekt"-Beispielen
  wrongImgs: string[];     // Pfade zu "nicht korrekt"-Beispielen
}

interface WMSSubfigure {
  id: string;
  label: string;
  maxPts: number;
  criteria: WMSCriterion[];
}

interface WMSCard {
  cardId: string;
  cardLabel: string;
  subfigures: WMSSubfigure[];
}

function makeCriteria(prefix: string, count: number): WMSCriterion[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}_${i + 1}`,
    title: `Kriterium ${i + 1}`,
    bullets: [
      'Stichpunkt 1 — bitte aus Manual eintragen',
      'Stichpunkt 2',
      'Stichpunkt 3',
    ],
    note: 'Erläuterung folgt aus dem WMS-IV Auswertungshandbuch.',
    pts: 1,
    correctImgs: [],  // z.B. ['/wms/I_k1_richtig_1.png']
    wrongImgs: [],    // z.B. ['/wms/I_k1_falsch_1.png']
  }));
}

// Summe: 5 + 7 + 7 + (7+5) + (7+5) = 43
const WMS_CARDS: WMSCard[] = [
  {
    cardId: 'I', cardLabel: 'Karte I',
    subfigures: [
      { id: 'I', label: 'Figur I', maxPts: 5, criteria: makeCriteria('I', 5) },
    ],
  },
  {
    cardId: 'II', cardLabel: 'Karte II',
    subfigures: [
      { id: 'II', label: 'Figur II', maxPts: 7, criteria: makeCriteria('II', 7) },
    ],
  },
  {
    cardId: 'III', cardLabel: 'Karte III',
    subfigures: [
      { id: 'III', label: 'Figur III', maxPts: 7, criteria: makeCriteria('III', 7) },
    ],
  },
  {
    cardId: 'IV', cardLabel: 'Karte IV',
    subfigures: [
      { id: 'IV_A', label: 'Figur IV-A', maxPts: 7, criteria: makeCriteria('IV_A', 7) },
      { id: 'IV_B', label: 'Figur IV-B', maxPts: 5, criteria: makeCriteria('IV_B', 5) },
    ],
  },
  {
    cardId: 'V', cardLabel: 'Karte V',
    subfigures: [
      { id: 'V_A', label: 'Figur V-A', maxPts: 7, criteria: makeCriteria('V_A', 7) },
      { id: 'V_B', label: 'Figur V-B', maxPts: 5, criteria: makeCriteria('V_B', 5) },
    ],
  },
];

// Flat subfigure list (7 entries: I, II, III, IV_A, IV_B, V_A, V_B)
interface FlatSubfigure extends WMSSubfigure {
  cardId: string;
  cardLabel: string;
}

const ALL_SUBFIGURES: FlatSubfigure[] = WMS_CARDS.flatMap(card =>
  card.subfigures.map(sf => ({ ...sf, cardId: card.cardId, cardLabel: card.cardLabel }))
);

const WMS_TOTAL_MAX = WMS_CARDS.reduce(
  (s, c) => s + c.subfigures.reduce((ss, sf) => ss + sf.maxPts, 0), 0
);

// ── Norm helpers ──────────────────────────────────────────────────────────────

function prToNum(pr: number | string): number {
  if (typeof pr === 'number') return Math.max(0, Math.min(100, pr));
  const str = pr.toString().trim();
  if (str.startsWith('≤')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 1 : v / 2; }
  if (str.startsWith('≥')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 99 : Math.min(100, v); }
  if (str.startsWith('<'))  { const v = parseFloat(str.slice(1)); return isNaN(v) ? 1 : v / 2; }
  if (str.startsWith('>'))  { const v = parseFloat(str.slice(1)); return isNaN(v) ? 99 : Math.min(100, v + 1); }
  const m = str.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
  const n = parseFloat(str);
  return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
}

function prColorCls(pr: number | string): string {
  const n = prToNum(pr);
  if (isNaN(n) || n < 2)  return 'bg-red-100 text-red-700';
  if (n < 16) return 'bg-orange-100 text-orange-700';
  if (n < 31) return 'bg-yellow-100 text-yellow-700';
  if (n < 69) return 'bg-green-100 text-green-700';
  if (n < 84) return 'bg-blue-100 text-blue-700';
  if (n < 98) return 'bg-violet-100 text-violet-700';
  return 'bg-purple-100 text-purple-800';
}

function parseRohwertStr(s: string | null | undefined): [number, number] | null {
  if (!s) return null;
  const m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (m) { const a = parseInt(m[1], 10), b = parseInt(m[2], 10); return [Math.min(a,b), Math.max(a,b)]; }
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? null : [n, n];
}

function findAgeGroupIdx(age: number, groups: Array<{ von_jahre: number; bis_jahre: number }>): number {
  return groups.findIndex(g => age >= g.von_jahre && age <= g.bis_jahre);
}

function lookupWP(rohwert: number, wpNormen: Array<{ wp: number; rohwert: string | null }>): number | null {
  for (const e of wpNormen) {
    const r = parseRohwertStr(e.rohwert);
    if (r && rohwert >= r[0] && rohwert <= r[1]) return e.wp;
  }
  return null;
}

function wpToPR(wp: number): number | null {
  const normen = transformationNormen.normen as Array<{ AWP: number | null; PR: number }>;
  const e = normen.find(e => e.AWP === wp);
  return e != null ? e.PR : null;
}

function lookupWiedererkennenPR(
  rohwert: number,
  prNormen: Array<{ pr_bereich: string; rohwert: string | null }>
): string | null {
  for (const e of prNormen) {
    const r = parseRohwertStr(e.rohwert);
    if (r && rohwert >= r[0] && rohwert <= r[1]) return e.pr_bereich;
  }
  return null;
}

interface Computed {
  sofortig_wp: number | null; sofortig_pr: number | null;
  verzoegert_wp: number | null; verzoegert_pr: number | null;
  wiedererkennen_pr: string | null;
  ageGroupLabel: string | null; ageOutOfRange: boolean;
}

function computeAll(sofortig: string, verzoegert: string, wiedererkennen: string, age: number): Computed {
  const vwI = wmsNormen.normen.VW_I;
  const vwV = wmsNormen.normen.VW_verzoegert;
  const wie  = wmsNormen.normen.Wiedererkennen;
  const idxI = findAgeGroupIdx(age, vwI.altersgruppen);
  const idxV = findAgeGroupIdx(age, vwV.altersgruppen);
  const idxW = findAgeGroupIdx(age, wie.altersgruppen);
  const ageOutOfRange = idxI === -1;
  let sofortig_wp = null, sofortig_pr = null, verzoegert_wp = null, verzoegert_pr = null, wiedererkennen_pr = null;
  if (sofortig !== '' && !isNaN(Number(sofortig)) && idxI >= 0) {
    sofortig_wp = lookupWP(Number(sofortig), vwI.altersgruppen[idxI].wp_normen);
    if (sofortig_wp !== null) sofortig_pr = wpToPR(sofortig_wp);
  }
  if (verzoegert !== '' && !isNaN(Number(verzoegert)) && idxV >= 0) {
    verzoegert_wp = lookupWP(Number(verzoegert), vwV.altersgruppen[idxV].wp_normen);
    if (verzoegert_wp !== null) verzoegert_pr = wpToPR(verzoegert_wp);
  }
  if (wiedererkennen !== '' && !isNaN(Number(wiedererkennen)) && idxW >= 0) {
    wiedererkennen_pr = lookupWiedererkennenPR(Number(wiedererkennen), wie.altersgruppen[idxW].pr_normen);
  }
  return { sofortig_wp, sofortig_pr, verzoegert_wp, verzoegert_pr, wiedererkennen_pr,
           ageGroupLabel: idxI >= 0 ? vwI.altersgruppen[idxI].label : null, ageOutOfRange };
}

// ── Image placeholder ─────────────────────────────────────────────────────────

const ImgPlaceholder: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 gap-1">
    <ImageIcon size={22} strokeWidth={1.5} />
    <span className="text-[10px] font-medium">{label ?? 'Bild folgt'}</span>
  </div>
);

// ── Wizard component ──────────────────────────────────────────────────────────

type WizardStep = 'abruf_select' | 'subfigure_intro' | 'criterion' | 'summary';

interface CriteriaWizardProps {
  onApplyPts: (pts: number, target: 'sofortig' | 'verzoegert') => void;
  onClose: () => void;
}

const CriteriaWizard: React.FC<CriteriaWizardProps> = ({ onApplyPts, onClose }) => {
  const [step, setStep]           = useState<WizardStep>('abruf_select');
  const [abrufType, setAbrufType] = useState<'sofortig' | 'verzoegert'>('sofortig');
  const [sfIdx, setSfIdx]         = useState(0);   // index into ALL_SUBFIGURES
  const [critIdx, setCritIdx]     = useState(0);   // index within current subfigure
  const [direction, setDirection] = useState<1 | -1>(1);
  const [scores, setScores]       = useState<Record<string, boolean | undefined>>({});

  const sf   = ALL_SUBFIGURES[sfIdx];
  const crit = sf?.criteria[critIdx];

  // Global criterion index across all subfigures (for progress bar)
  const criteriaBeforeSf = ALL_SUBFIGURES.slice(0, sfIdx)
    .reduce<number>((s, x) => s + x.criteria.length, 0);
  const globalCritIdx = criteriaBeforeSf + critIdx;
  const totalCriteria = WMS_TOTAL_MAX; // 43

  const earnedPts = (): number =>
    ALL_SUBFIGURES.reduce<number>((total, s) =>
      total + s.criteria.reduce<number>((sum, c) => sum + (scores[c.id] === true ? c.pts : 0), 0), 0);

  const ptsForSf = (s: FlatSubfigure): number =>
    s.criteria.reduce<number>((sum, c) => sum + (scores[c.id] === true ? c.pts : 0), 0);

  const ptsForCard = (cardId: string, sfId?: string) =>
    ALL_SUBFIGURES.filter(s => s.cardId === cardId && (sfId == null || s.id === sfId))
      .reduce<number>((sum, s) => sum + ptsForSf(s), 0);

  const maxForCard = (cardId: string, sfId?: string) =>
    ALL_SUBFIGURES
      .filter(s => s.cardId === cardId && (sfId == null || s.id === sfId))
      .reduce<number>((sum, s) => sum + s.maxPts, 0);

  // Quick-score entire subfigure (all correct or all wrong)
  const quickScore = (correct: boolean) => {
    const next: Record<string, boolean | undefined> = { ...scores };
    sf.criteria.forEach(c => { next[c.id] = correct; });
    setScores(next);
    setDirection(1);
    if (sfIdx < ALL_SUBFIGURES.length - 1) {
      setSfIdx(sfIdx + 1); setCritIdx(0); setStep('subfigure_intro');
    } else {
      setStep('summary');
    }
  };

  // Score one criterion, then advance
  const handleScore = (correct: boolean) => {
    const next = { ...scores, [crit.id]: correct };
    setScores(next);
    setDirection(1);
    if (critIdx < sf.criteria.length - 1) {
      setCritIdx(critIdx + 1);                       // next criterion in same subfigure
    } else if (sfIdx < ALL_SUBFIGURES.length - 1) {
      setSfIdx(sfIdx + 1); setCritIdx(0); setStep('subfigure_intro'); // next subfigure
    } else {
      setStep('summary');                             // all done
    }
  };

  const startNextAbruf = () => {
    onApplyPts(earnedPts(), abrufType);
    setAbrufType('verzoegert');
    setScores({});
    setSfIdx(0); setCritIdx(0);
    setStep('subfigure_intro');
  };

  const goBack = () => {
    if (step === 'summary') {
      setSfIdx(ALL_SUBFIGURES.length - 1); setStep('subfigure_intro'); return;
    }
    if (step === 'criterion') {
      setStep('subfigure_intro');
      return;
    }
    if (step === 'subfigure_intro') {
      if (sfIdx > 0) { setDirection(-1); setSfIdx(sfIdx - 1); }
      else setStep('abruf_select');
      return;
    }
  };

  // ── Abruf selection screen ──────────────────────────────────────────────────
  if (step === 'abruf_select') {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-10 flex flex-col items-center gap-8 max-w-2xl mx-auto">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <ListChecks size={26} />
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">Kriterien-Bewertung</h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
            Welchen Abruf bewertest du gerade?
          </p>
        </div>

        <div className="flex gap-4 w-full max-w-sm">
          {(['sofortig', 'verzoegert'] as const).map(t => (
            <button
              key={t}
              onClick={() => setAbrufType(t)}
              className={cn(
                'flex-1 py-4 rounded-2xl text-sm font-black transition-all border-2',
                abrufType === t
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200'
                  : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-indigo-300'
              )}
            >
              {t === 'sofortig' ? '① Sofortiger Abruf' : '② Verzögerter Abruf'}
            </button>
          ))}
        </div>

        <div className="flex gap-3 w-full max-w-sm">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={() => { setSfIdx(0); setCritIdx(0); setScores({}); setStep('subfigure_intro'); }}
            className="flex-1 py-3 rounded-xl text-sm font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Bewertung starten →
          </button>
        </div>
      </div>
    );
  }

  // ── Subfigure intro screen (quick-score or go criterion by criterion) ────────
  if (step === 'subfigure_intro') {
    const sfLabel = sf.cardLabel + (sf.label !== sf.cardLabel ? ` – ${sf.label}` : '');
    const sfProgress = `${sfIdx + 1} / ${ALL_SUBFIGURES.length}`;
    const sfScored = sf.criteria.every(c => scores[c.id] !== undefined);
    const sfPts = ptsForSf(sf);
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden max-w-2xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <ChevronLeft size={16} /> Zurück
          </button>
          <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Figur {sfProgress}
          </span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Progress bar (subfigure-level) */}
        <div className="h-1 bg-slate-100 dark:bg-slate-700">
          <motion.div className="h-1 bg-indigo-400" initial={false}
            animate={{ width: `${((sfIdx) / ALL_SUBFIGURES.length) * 100}%` }} transition={{ duration: 0.3 }} />
        </div>

        <div className="p-8 flex flex-col items-center gap-6 text-center">
          {/* Subfigure title */}
          <div className="space-y-1">
            <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">
              {abrufType === 'sofortig' ? 'Sofortiger Abruf' : 'Verzögerter Abruf'}
            </p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{sfLabel}</h3>
            <p className="text-sm text-slate-400 font-medium">
              {sf.maxPts} Kriterien · max. {sf.maxPts} Punkte
            </p>
            {sfScored && (
              <p className="text-sm font-black text-emerald-600">Bereits bewertet: {sfPts} / {sf.maxPts} Pkt.</p>
            )}
          </div>

          {/* Quick-score row */}
          <div className="flex gap-3 w-full max-w-sm">
            <button
              onClick={() => quickScore(false)}
              className="flex-1 py-3.5 rounded-2xl text-sm font-black border-2 border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors flex flex-col items-center gap-0.5"
            >
              <span className="text-lg">✗</span>
              <span>0 Punkte</span>
            </button>

            <button
              onClick={() => { setStep('criterion'); setCritIdx(0); }}
              className="flex-1 py-3.5 rounded-2xl text-sm font-black border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors flex flex-col items-center gap-0.5"
            >
              <span className="text-lg">⋯</span>
              <span>Einzeln bewerten</span>
            </button>

            <button
              onClick={() => quickScore(true)}
              className="flex-1 py-3.5 rounded-2xl text-sm font-black border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 transition-colors flex flex-col items-center gap-0.5"
            >
              <span className="text-lg">✓</span>
              <span>{sf.maxPts} Punkte</span>
            </button>
          </div>

          {/* Running total */}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            Gesamt bisher: <span className="font-black text-slate-600 dark:text-slate-300">{earnedPts()} Pkt.</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Summary screen ──────────────────────────────────────────────────────────
  if (step === 'summary') {
    const pts = earnedPts();
    const isSofortig = abrufType === 'sofortig';
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden max-w-2xl mx-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft size={16} /> Zurück
          </button>
          <span className="text-sm font-black text-slate-700 dark:text-slate-200">
            {isSofortig ? 'Sofortiger Abruf' : 'Verzögerter Abruf'} – Ergebnis
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Score */}
          <div className="text-center py-3">
            <div className="text-5xl font-black text-slate-800 dark:text-slate-100">
              {pts}
              <span className="text-2xl font-medium text-slate-400 ml-1">/ {WMS_TOTAL_MAX}</span>
            </div>
            <p className="text-sm text-slate-400 font-medium mt-1">Gesamtpunkte</p>
          </div>

          {/* Per-card breakdown */}
          <div className="space-y-2">
            {WMS_CARDS.map(card => (
              <div key={card.cardId} className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                {card.subfigures.length === 1 ? (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{card.cardLabel}</span>
                    <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                      {ptsForCard(card.cardId)} / {maxForCard(card.cardId)} Pkt.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-700/50">
                      <span className="text-sm font-black text-slate-600 dark:text-slate-300">{card.cardLabel}</span>
                      <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                        {ptsForCard(card.cardId)} / {maxForCard(card.cardId)} Pkt.
                      </span>
                    </div>
                    {card.subfigures.map(csf => (
                      <div key={csf.id} className="flex items-center justify-between px-6 py-1.5 border-t border-slate-50 dark:border-slate-700">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{csf.label}</span>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {ptsForCard(card.cardId, csf.id)} / {maxForCard(card.cardId, csf.id)} Pkt.
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="space-y-2 pt-1">
            {/* Primary: if sofortig → continue with verzögert; if verzögert → close */}
            {isSofortig ? (
              <button
                onClick={startNextAbruf}
                className="w-full py-3.5 rounded-xl font-black text-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={16} /> {pts} Pkt. eintragen + Verzögerter Abruf starten →
              </button>
            ) : (
              <button
                onClick={() => { onApplyPts(pts, 'verzoegert'); onClose(); }}
                className="w-full py-3.5 rounded-xl font-black text-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={16} /> {pts} Punkte eintragen
              </button>
            )}
            {/* Secondary: just save this session and close */}
            {isSofortig && (
              <button
                onClick={() => { onApplyPts(pts, 'sofortig'); onClose(); }}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Nur Sofortiger Abruf eintragen (ohne Verzögerter)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Scoring screen (all criteria for current subfigure at once) ─────────────

  const sfPtsThisPage = ptsForSf(sf);
  const allScoredThisPage = sf.criteria.every(c => scores[c.id] !== undefined);

  const advanceFromCriteria = () => {
    if (sfIdx < ALL_SUBFIGURES.length - 1) {
      setDirection(1); setSfIdx(sfIdx + 1); setCritIdx(0); setStep('subfigure_intro');
    } else {
      setStep('summary');
    }
  };

  const toggleCriterion = (id: string) => {
    setScores(prev => ({ ...prev, [id]: prev[id] !== true }));
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden max-w-2xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <ChevronLeft size={16} /> Zurück
        </button>

        <div className="text-center">
          <div className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {sf.cardLabel}{sf.label !== sf.cardLabel && ` · ${sf.label}`}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">
            Figur {sfIdx + 1} / {ALL_SUBFIGURES.length}
            &ensp;·&ensp;{abrufType === 'sofortig' ? 'Sofortiger Abruf' : 'Verzögerter Abruf'}
          </div>
        </div>

        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100 dark:bg-slate-700">
        <motion.div
          className="h-1 bg-indigo-500"
          initial={false}
          animate={{ width: `${(sfIdx / ALL_SUBFIGURES.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Criteria list — all at once, click to toggle */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sfIdx}
          initial={{ x: direction === 1 ? 40 : -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction === 1 ? -40 : 40, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="p-5 space-y-2"
        >
          {sf.criteria.map((c, i) => {
            const scored = scores[c.id];
            return (
              <button
                key={c.id}
                onClick={() => toggleCriterion(c.id)}
                className={cn(
                  'w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all border-2 active:scale-[0.99]',
                  scored === true
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : scored === false
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400'
                      : 'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20'
                )}
              >
                {/* Criterion number */}
                <span className={cn(
                  'w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0',
                  scored === true ? 'bg-emerald-500 text-white' :
                  scored === false ? 'bg-red-400 text-white' :
                  'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400'
                )}>
                  {i + 1}
                </span>

                {/* Title */}
                <span className="flex-1 text-sm font-bold leading-snug">{c.title}</span>

                {/* Score indicator */}
                <span className={cn(
                  'text-lg shrink-0 transition-transform',
                  scored === true ? 'scale-110' : 'opacity-30'
                )}>
                  {scored === true ? '✓' : scored === false ? '✗' : '○'}
                </span>
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Footer: score + navigation */}
      <div className="px-5 pb-5 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700 pt-4">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-black text-slate-800 dark:text-slate-100">{sfPtsThisPage}</span>
          <span className="text-xs"> / {sf.maxPts} Pkt.</span>
          <span className="ml-3 text-xs text-slate-400">Gesamt: {earnedPts()} Pkt.</span>
        </div>
        <button
          onClick={advanceFromCriteria}
          disabled={!allScoredThisPage}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all',
            allScoredThisPage
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          )}
        >
          {sfIdx < ALL_SUBFIGURES.length - 1 ? 'Nächste Figur' : 'Zusammenfassung'}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const WMSTab: React.FC<WMSTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [sofortig,     setSofortig]     = useState('');
  const [verzoegert,   setVerzoegert]   = useState('');
  const [wiedererkennen, setWiedererkennen] = useState('');
  const [note,         setNote]         = useState('');
  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0]);
  const [examiner,     setExaminer]     = useState(currentUser ?? '');
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [lastSaved,    setLastSaved]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [scoringMode,  setScoringMode]  = useState<'direct' | 'criteria'>('direct');

  const wmsResults = previousResults
    .filter(r => r.testId === 'wms_vw')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const age = calculateAge(patient.geburtsdatum, date);
  const preview = computeAll(sofortig, verzoegert, wiedererkennen, age);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (sofortig === '' && verzoegert === '' && wiedererkennen === '')
      e.general = 'Mindestens einen Wert eingeben.';
    if (sofortig !== '') { const n = Number(sofortig); if (isNaN(n)||!Number.isInteger(n)||n<0||n>43) e.sofortig='Ganzzahl 0–43.'; }
    if (verzoegert !== '') { const n = Number(verzoegert); if (isNaN(n)||!Number.isInteger(n)||n<0||n>43) e.verzoegert='Ganzzahl 0–43.'; }
    if (wiedererkennen !== '') { const n = Number(wiedererkennen); if (isNaN(n)||!Number.isInteger(n)||n<0||n>7) e.wiedererkennen='Ganzzahl 0–7.'; }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setSofortig(res.rawValues.sofortig !== undefined ? String(res.rawValues.sofortig) : '');
    setVerzoegert(res.rawValues.verzoegert !== undefined ? String(res.rawValues.verzoegert) : '');
    setWiedererkennen(res.rawValues.wiedererkennen !== undefined ? String(res.rawValues.wiedererkennen) : '');
    setDate(res.date); setExaminer(res.examiner ?? ''); setNote(res.note ?? '');
    setErrors({}); setScoringMode('direct');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setSofortig(''); setVerzoegert(''); setWiedererkennen('');
    setNote(''); setDate(new Date().toISOString().split('T')[0]); setExaminer('');
    setErrors({});
  };

  const handleSave = () => {
    if (!validate()) return;
    const c = computeAll(sofortig, verzoegert, wiedererkennen, age);
    const raw: Record<string, number | string> = {};
    const calc: Record<string, number> = {};
    const prs: Record<string, number | string> = {};
    const dom: Record<string, string> = {};

    if (sofortig !== '') {
      raw.sofortig = Number(sofortig);
      if (c.sofortig_wp !== null) calc.sofortig_wp = c.sofortig_wp;
      if (c.sofortig_pr !== null) { prs.sofortiger_abruf = c.sofortig_pr; dom.sofortiger_abruf = '2. Gedächtnis (Visuell)'; }
    }
    if (verzoegert !== '') {
      raw.verzoegert = Number(verzoegert);
      if (c.verzoegert_wp !== null) calc.verzoegert_wp = c.verzoegert_wp;
      if (c.verzoegert_pr !== null) { prs.verzoegerter_abruf = c.verzoegert_pr; dom.verzoegerter_abruf = '2. Gedächtnis (Visuell)'; }
    }
    if (wiedererkennen !== '') {
      raw.wiedererkennen = Number(wiedererkennen);
      if (c.wiedererkennen_pr !== null) { prs.wiedererkennen = c.wiedererkennen_pr; dom.wiedererkennen = '2. Gedächtnis (Visuell)'; }
    }

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'wms_vw', date,
      rawValues: raw, calculatedValues: calc, percentileRanks: prs,
      normInfo: `WMS-IV, Altersgruppe: ${c.ageGroupLabel ?? 'Unbekannt'}`,
      examiner, note, domainMapping: dom,
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true); setTimeout(() => setLastSaved(false), 3000);
    setSofortig(''); setVerzoegert(''); setWiedererkennen('');
    setNote(''); setDate(new Date().toISOString().split('T')[0]); setExaminer('');
  };

  const renderInput = (
    label: string, value: string, onChange: (v: string) => void,
    errorKey: string, max: number,
    prev: { wp?: number | null; pr: number | string | null }, prLabel = 'PR'
  ) => (
    <div className="space-y-1">
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</label>
      <input
        type="number" value={value} onChange={e => onChange(e.target.value)}
        className={cn('w-full px-4 py-3 text-xl font-mono border-2 rounded-xl outline-none transition-all',
          errors[errorKey] ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white dark:bg-slate-700 focus:border-indigo-500')}
        placeholder="–" min={0} max={max}
        onKeyDown={e => e.key === 'Enter' && handleSave()}
      />
      {errors[errorKey] && <p className="text-[10px] text-red-600 flex items-center gap-1"><AlertCircle size={10} />{errors[errorKey]}</p>}
      {value !== '' && !errors[errorKey] && (
        <div className="mt-1 space-y-1">
          {prev.wp !== undefined && prev.wp !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold w-28">→ WP</span>
              <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">{prev.wp}</span>
            </div>
          )}
          {prev.pr !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold w-28">→ {prLabel}</span>
              <span className={cn('text-[11px] font-black px-2 py-0.5 rounded-lg', prColorCls(prev.pr))}>{prev.pr}</span>
            </div>
          )}
          {prev.pr === null && <p className="text-[10px] text-amber-600 italic">Kein PR für diesen Rohwert.</p>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Brain size={22} />}
        title="Visuelle Wiedergabe"
        subtitle={`WMS-IV · Alter: ${age} J.${preview.ageGroupLabel ? ` · ${preview.ageGroupLabel}` : ''}`}
      />

      {preview.ageOutOfRange && (
        <div className="px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-700 font-medium">
          Kein Normwert für Alter {age} (Normen gelten 16–69 J.).
        </div>
      )}

      {/* ── CRITERIA WIZARD (full-width) ── */}
      {scoringMode === 'criteria' && (
        <CriteriaWizard
          onApplyPts={(pts, target) => {
            if (target === 'sofortig') setSofortig(String(pts));
            else setVerzoegert(String(pts));
          }}
          onClose={() => setScoringMode('direct')}
        />
      )}

      {/* ── DIRECT MODE (2-column) ── */}
      {scoringMode === 'direct' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Save size={16} className="text-indigo-600" />
                  {editingId ? 'Messung bearbeiten' : 'Neue Messung'}
                </h3>
                {editingId && (
                  <button onClick={cancelEdit} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={13} /> Abbrechen
                  </button>
                )}
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Datum</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Untersucher</label>
                    <input type="text" value={examiner} onChange={e => setExaminer(e.target.value)} placeholder="Kürzel"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>

                {/* Criteria mode button */}
                <button
                  onClick={() => setScoringMode('criteria')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 text-indigo-500 dark:text-indigo-400 text-[12px] font-black hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                >
                  <ListChecks size={15} /> Kriterien Schritt für Schritt bewerten
                </button>

                {errors.general && <p className="text-[10px] text-red-600 flex items-center gap-1"><AlertCircle size={10} />{errors.general}</p>}

                {renderInput('Sofortiger Abruf (max. 43)', sofortig, setSofortig, 'sofortig', 43,
                  { wp: preview.sofortig_wp, pr: preview.sofortig_pr })}

                {renderInput('Verzögerter Abruf (max. 43)', verzoegert, setVerzoegert, 'verzoegert', 43,
                  { wp: preview.verzoegert_wp, pr: preview.verzoegert_pr })}

                {renderInput('Wiedererkennen (max. 7)', wiedererkennen, setWiedererkennen, 'wiedererkennen', 7,
                  { pr: preview.wiedererkennen_pr }, 'PR-Bereich')}

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Notiz (optional)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Besonderheiten, Beobachtungen..."
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none" />
                </div>

                <button onClick={handleSave}
                  className={cn('w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2',
                    lastSaved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200')}>
                  {lastSaved ? <><CheckCircle2 size={18} /> Gespeichert!</> : editingId ? <><Save size={18} /> Änderung speichern</> : <><Save size={18} /> Messung speichern</>}
                </button>
              </div>
            </div>

            <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 leading-relaxed">
              <span className="font-black text-slate-500 uppercase tracking-wider">Norm: </span>
              WMS-IV. Wertpunkte (WP) via Altersgruppen-Tabellen; PR via AWP-Transformationstabelle; Wiedererkennen direkt als PR-Bereich.
            </div>
          </div>

          {/* History */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
              <History size={16} className="text-indigo-600" /> Verlauf
            </h3>
            {wmsResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <History size={48} strokeWidth={1} className="mb-3 opacity-20" />
                <p className="text-sm font-medium">Keine vorherigen Messungen.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[520px]">
                  <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 font-black uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3">Datum</th>
                      <th className="px-2 py-3 text-center">Sof. RW</th>
                      <th className="px-2 py-3 text-center">WP</th>
                      <th className="px-2 py-3 text-center">PR</th>
                      <th className="px-2 py-3 text-center">Verz. RW</th>
                      <th className="px-2 py-3 text-center">WP</th>
                      <th className="px-2 py-3 text-center">PR</th>
                      <th className="px-2 py-3 text-center">Wieder.</th>
                      <th className="px-2 py-3 text-center">PR-Ber.</th>
                      {patient.status !== 'entlassen' && <th className="px-2 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {wmsResults.map(res => (
                      <tr key={res.id}
                        className={cn('hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors',
                          editingId === res.id && 'bg-indigo-50/60 dark:bg-indigo-900/30')}>
                        <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatDate(res.date)}</td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.rawValues.sofortig ?? <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-500">
                          {res.calculatedValues.sofortig_wp ?? <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {res.percentileRanks.sofortiger_abruf !== undefined
                            ? <span className={cn('px-1.5 py-0.5 rounded-lg font-black text-[10px]', prColorCls(res.percentileRanks.sofortiger_abruf))}>{res.percentileRanks.sofortiger_abruf}</span>
                            : <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.rawValues.verzoegert ?? <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-500">
                          {res.calculatedValues.verzoegert_wp ?? <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {res.percentileRanks.verzoegerter_abruf !== undefined
                            ? <span className={cn('px-1.5 py-0.5 rounded-lg font-black text-[10px]', prColorCls(res.percentileRanks.verzoegerter_abruf))}>{res.percentileRanks.verzoegerter_abruf}</span>
                            : <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.rawValues.wiedererkennen ?? <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {res.percentileRanks.wiedererkennen !== undefined
                            ? <span className={cn('px-1.5 py-0.5 rounded-lg font-black text-[10px]', prColorCls(res.percentileRanks.wiedererkennen))}>{res.percentileRanks.wiedererkennen}</span>
                            : <span className="text-slate-300">–</span>}
                        </td>
                        {patient.status !== 'entlassen' && (
                          <td className="px-2 py-2.5 text-center">
                            <div className="flex items-center gap-1 justify-center">
                              <button
                                onClick={() => { setConfirmDeleteId(null); editingId === res.id ? cancelEdit() : startEdit(res); }}
                                className={cn('p-1.5 rounded-lg transition-colors',
                                  editingId === res.id ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-indigo-50 text-slate-300 hover:text-indigo-500')}
                                title="Bearbeiten"
                              ><Pencil size={12} /></button>
                              {confirmDeleteId === res.id ? (
                                <button onClick={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                                  className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors" title="Löschen bestätigen">
                                  <Check size={12} />
                                </button>
                              ) : (
                                <button onClick={() => { setConfirmDeleteId(res.id); setEditingId(null); }}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors" title="Löschen">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
