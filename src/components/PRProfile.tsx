import React from 'react';
import { OctagonX, StickyNote } from 'lucide-react';
import { PRResult } from '../types';
import { formatDate } from '../lib/utils';
import { probit } from '../lib/stats';
import { useProfilePrefs } from '../context/ProfilePrefsContext';

export interface TextProfileResult {
  domain: string;
  testGroup: string;
  items: { label: string; text: string }[];
  date?: string;
  examiner?: string;
  note?: string;
}

interface PRProfileProps {
  results: PRResult[];
  textResults?: TextProfileResult[];
  extraBottomContent?: React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement>;
  /** Suppress the in-flow legend (used by the PDF print layout, which renders
   *  the legend once in the repeating page header instead). */
  hideLegend?: boolean;
  /** Force-hide the trend connectors/arrows regardless of the user preference.
   *  Used by the PDF export, which should never render the arrows. */
  hideTrendArrows?: boolean;
  /** Suppress the in-flow SD/PR scale at the top of the chart. Used by the PDF
   *  print layout, which renders the scale in the repeating page header instead. */
  hideAxis?: boolean;
  /** Render previous/older-measurement markers in high contrast (dark outline on
   *  white) instead of the subtle grey/hatched on-screen style, so they stay
   *  legible in black-and-white print. Set by the PDF export. */
  printMode?: boolean;
}

const LEFT_W = 300;

function dotColor(pr: number | string): string {
  const n = prToNum(pr);
  if (n < 2)  return '#991b1b';
  if (n < 15.87) return '#dc2626';
  if (n > 84.13) return '#15803d';
  return '#94a3b8';
}

// ── X-Achse: linear in Standardabweichungen (z-Werten) ──────────────────────
// Die horizontale Position eines Prozentrangs ergibt sich aus seinem z-Wert
// (Probit-Transformation). Dadurch entspricht ein gleich großer SD-Unterschied
// überall der gleichen Pixel-Breite — „ein Hauptstrich = eine SD".
//
// Z_MAX = 3 deckt den vollständigen PR-Bereich 0–100 an den Rändern ab.
// Alternative: Z_MAX = 2.5  → der sichtbare Rand entspricht dann PR ~0,6 / ~99,4
// (schärfere Auflösung im klinisch relevanten Kernbereich; Extremwerte werden
// an den Rand geklemmt).
export const Z_MAX = 3;

/** z-Wert → X-Position in Prozent (0 = links, 100 = rechts). */
export function zToX(z: number): number {
  const zc = Math.max(-Z_MAX, Math.min(Z_MAX, z));
  return ((zc + Z_MAX) / (2 * Z_MAX)) * 100;
}

function prToX(pr: number): number {
  // pr = 0 / 100 würde z = ∓∞ ergeben → auf einen sehr kleinen Rand-Abstand klemmen.
  const p = Math.max(0.05, Math.min(99.95, pr)) / 100;
  return zToX(probit(p));
}

function prToNum(pr: number | string): number {
  if (typeof pr === 'number') return Math.max(0, Math.min(100, pr));
  const str = pr.toString().trim();

  const mTop = str.match(/^(\d+(?:\.\d+)?)->95$/);
  if (mTop) { const a = parseFloat(mTop[1]); return isNaN(a) ? 97 : (a + 100) / 2; }

  const mGt = str.match(/^>\s*(\d+(?:\.\d+)?)$/);
  if (mGt) { const a = parseFloat(mGt[1]); return isNaN(a) ? 99 : Math.min(100, a + 1); }

  const mLt = str.match(/^<\s*(\d+(?:\.\d+)?)$/);
  if (mLt) { const a = parseFloat(mLt[1]); return isNaN(a) ? 1 : a / 2; }

  const mRange = str.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (mRange) {
    const a = parseFloat(mRange[1]), b = parseFloat(mRange[2]);
    return (Math.min(a, b) + Math.max(a, b)) / 2;
  }

  if (str.startsWith('≤')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 1 : v / 2; }
  if (str.startsWith('≥')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 99 : Math.min(100, v); }

  const n = parseFloat(str);
  return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
}

function parseRangeBounds(pr: number | string): [number, number] | null {
  if (typeof pr === 'number') return null;
  const s = pr.toString().trim();

  const mTop = s.match(/^(\d+(?:\.\d+)?)->95$/);
  if (mTop) { const a = parseFloat(mTop[1]); return isNaN(a) ? null : [a, 100]; }

  const mGt = s.match(/^>\s*(\d+(?:\.\d+)?)$/);
  if (mGt) { const a = parseFloat(mGt[1]); return isNaN(a) ? null : [a, 100]; }

  const mLt = s.match(/^<\s*(\d+(?:\.\d+)?)$/);
  if (mLt) { const a = parseFloat(mLt[1]); return isNaN(a) ? null : [0, a]; }

  const mRange = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (!mRange) return null;
  const a = parseFloat(mRange[1]), b = parseFloat(mRange[2]);
  return [Math.min(a, b), Math.max(a, b)];
}

// Color zones matching dotColor boundaries, split at PR 2 / 16 / 84
const COLOR_ZONE_BOUNDS = [
  { lo: 0,  hi: 2,   color: '#991b1b' },
  { lo: 2,  hi: 16,  color: '#dc2626' },
  { lo: 16, hi: 84,  color: '#94a3b8' },
  { lo: 84, hi: 100, color: '#15803d' },
] as const;

function getRangeSegments(lo: number, hi: number) {
  const segs: { x1: number; x2: number; color: string }[] = [];
  for (const z of COLOR_ZONE_BOUNDS) {
    const sLo = Math.max(lo, z.lo);
    const sHi = Math.min(hi, z.hi);
    if (sHi > sLo) segs.push({ x1: prToX(sLo), x2: prToX(sHi), color: z.color });
  }
  return segs;
}

type Seg = { x1: number; x2: number; color: string };

function renderSegs(segs: Seg[], h: number, bw: number, alpha: string, zIndex = 3, hatched = false, printMode = false): React.ReactElement {
  return React.createElement(
    React.Fragment,
    null,
    ...segs.map((seg, si) => {
      // S/W-Druck: schraffierte (= ältere) Bereiche dunkel umranden und kräftig
      // schraffieren, damit sie nicht hellgrau verschwinden.
      const stroke = printMode && hatched ? '#0f172a' : seg.color;
      const bwEff  = printMode && hatched ? Math.max(bw, 1.5) : bw;
      const hatchColor = printMode ? '#0f172a' : `${seg.color}70`;
      return React.createElement('div', {
        key: si,
        className: 'absolute',
        style: {
          left: `${seg.x1}%`,
          width: `${Math.max(0.5, seg.x2 - seg.x1)}%`,
          top: '50%', transform: 'translateY(-50%)',
          height: h,
          borderRadius: si === 0 && si === segs.length - 1 ? h / 2
            : si === 0 ? `${h / 2}px 0 0 ${h / 2}px`
            : si === segs.length - 1 ? `0 ${h / 2}px ${h / 2}px 0`
            : 0,
          backgroundColor: hatched ? 'transparent' : `${seg.color}${alpha}`,
          backgroundImage: hatched
            ? `repeating-linear-gradient(45deg, ${hatchColor} 0px, ${hatchColor} 2px, transparent 2px, transparent ${printMode ? 4 : 5}px)`
            : 'none',
          borderTop:    `${bwEff}px solid ${stroke}`,
          borderBottom: `${bwEff}px solid ${stroke}`,
          borderLeft:   si === 0               ? `${bwEff}px solid ${stroke}` : 'none',
          borderRight:  si === segs.length - 1 ? `${bwEff}px solid ${stroke}` : 'none',
          zIndex,
        },
      });
    })
  );
}

function getMajorDomain(domain?: string): string {
  if (!domain) return 'Weitere';
  const match = domain.match(/^(\d+\.\s*[^(]+)/);
  return match ? match[1].trim() : domain;
}

function orderedUnique<T>(arr: T[]): T[] {
  return arr.filter((v, i) => arr.indexOf(v) === i);
}

// ---------------------------------------------------------------------------
// Static 3-level layout configuration
// ---------------------------------------------------------------------------

interface SubsectionConfig {
  subLabel: string;
  testGroups: string[];
}
interface DomainConfig {
  domainMatch: string;
  label: string;
  subsections: SubsectionConfig[];
}

const LAYOUT: DomainConfig[] = [
  {
    domainMatch: 'Aufmerksamkeit',
    label: '1. Aufmerksamkeit',
    subsections: [
      {
        subLabel: '1.1 Informationsverarbeitungsgeschwindigkeit',
        testGroups: ['Zahlen-Zeichen-Test', 'Zahlen-Zeige-Test', 'Trail Making Test A', 'Trail-Making-Test A'],
      },
      {
        subLabel: '1.2 Aufmerksamkeitsaktivierung',
        testGroups: ['Alertness'],
      },
      {
        subLabel: '1.3 Selektive Aufmerksamkeit',
        testGroups: ['Go/Nogo', 'Flexibilität'],
      },
      {
        subLabel: '1.4 Geteilte Aufmerksamkeit',
        testGroups: ['Geteilte Aufmerksamkeit', 'Trail Making Test B', 'Trail-Making-Test B'],
      },
    ],
  },
  {
    domainMatch: 'Gedächtnis',
    label: '2. Gedächtnis',
    subsections: [
      {
        subLabel: '2.1 Merkspanne',
        testGroups: [
          'Auditive Merkspanne', 'Zahlenspanne vorwärts', 'Zahlenspanne',
          'Visuelle Merkspanne', 'Blockspanne vorwärts', 'Blockspanne',
        ],
      },
      {
        subLabel: '2.2 Arbeitsgedächtnis',
        testGroups: [
          'Zahlennachsprechen rückwärts', 'Zahlenspanne rückwärts',
          'Blockspanne rückwärts',
        ],
      },
      {
        subLabel: '2.3 Verbale Lern- und Merkfähigkeit',
        testGroups: ['VLMT', 'Logisches Gedächtnis'],
      },
      {
        subLabel: '2.4 Figurales Gedächtnis',
        testGroups: ['Visuelle Wiedergabe', 'WMS-IV Visuelle Wiedergabe'],
      },
    ],
  },
  {
    domainMatch: 'Visuo',
    label: '3. Visuo-perzeptive und visuo-konstruktive Leistungen',
    subsections: [
      { subLabel: '', testGroups: ['Mosaik-Test', 'Rey-Osterrieth-Figur', 'ROCFT', 'Rey-Osterrieth-Figur (ROCFT)'] },
    ],
  },
  {
    domainMatch: 'Intellektuelle',
    label: '4. Intellektuelle Leistungen',
    subsections: [
      { subLabel: '', testGroups: ['LPS'] },
    ],
  },
  {
    domainMatch: 'Exekutive',
    label: '5. Exekutive Funktionen',
    subsections: [
      { subLabel: '', testGroups: ['Turm von London', 'Bürotest', 'Tagesplan'] },
    ],
  },
  {
    domainMatch: 'Visuelle Exploration',
    label: '6. Visuelle Exploration | Gesichtsfeld- und Neglectprüfung',
    subsections: [
      {
        subLabel: '',
        testGroups: ['TAP – Vis. Scanning', 'Visuelles Scanning', 'Gesichtsfeldprüfung', 'Neglectprüfung', 'Explorationsaufgaben'],
      },
    ],
  },
];

function findDomainConfig(domain: string): DomainConfig | undefined {
  return LAYOUT.find(cfg =>
    domain.includes(cfg.domainMatch) || cfg.domainMatch.includes(domain)
  );
}

function findSubsectionIndex(cfg: DomainConfig, tg: string): number {
  return cfg.subsections.findIndex(sub =>
    sub.testGroups.some(key => tg.includes(key) || key.includes(tg))
  );
}

function findTestGroupOrder(sub: SubsectionConfig, tg: string): number {
  return sub.testGroups.findIndex(key => tg.includes(key) || key.includes(tg));
}

// ---------------------------------------------------------------------------
// Reference lines overlay
// ---------------------------------------------------------------------------

// Ganze SD = durchgezogener „Hauptstrich"; halbe SD = feine gestrichelte Linie.
const SD_MAJOR = [-3, -2, -1, 0, 1, 2, 3] as const;
const SD_MINOR = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5] as const;

const ReferenceLinesOverlay: React.FC = () => (
  <>
    <div className="absolute pointer-events-none" style={{
      top: '50%', left: 0, right: 0, height: 1,
      backgroundColor: '#e2e8f0',
      transform: 'translateY(-50%)',
      zIndex: 0,
    }} />
    {SD_MINOR.map(z => (
      <div key={z} className="absolute pointer-events-none" style={{
        left: `${zToX(z)}%`, top: 0, bottom: 0, width: 1,
        backgroundImage: 'repeating-linear-gradient(to bottom, #cbd5e1 0px, #cbd5e1 3px, transparent 3px, transparent 6px)',
        zIndex: 1,
      }} />
    ))}
    {SD_MAJOR.map(z => (
      <div key={z} className="absolute pointer-events-none" style={{
        left: `${zToX(z)}%`, top: 0, bottom: 0,
        width: z === 0 ? 2 : 1.5,
        backgroundColor: z === 0 ? '#94a3b8' : '#cbd5e1',
        zIndex: 1,
      }} />
    ))}
  </>
);

// SD-/PR-Skala über dem Profil. `pr` = leerer String → nur die SD-Marke ohne
// Prozentrang (die Ränder ±3 SD liegen jenseits PR 1 bzw. 99).
const AXIS_TICKS = [
  { z: -3, pr: ''   },
  { z: -2, pr: '2'  },
  { z: -1, pr: '16' },
  { z:  0, pr: '50' },
  { z:  1, pr: '84' },
  { z:  2, pr: '98' },
  { z:  3, pr: ''   },
] as const;

/** Wiederverwendbare SD-/PR-Skala (Bildschirm-Kopf + wiederkehrender PDF-Seitenkopf). */
export const AxisScale: React.FC<{ className?: string; printMode?: boolean }> = ({ className = '', printMode = false }) => (
  <div className={`relative w-full ${className}`} style={{ height: 30 }}>
    <div className="absolute" style={{ left: 0, right: 0, top: 15, height: 1, backgroundColor: printMode ? '#94a3b8' : '#cbd5e1' }} />
    {SD_MINOR.map(z => (
      <div key={`m${z}`} className="absolute" style={{ left: `${zToX(z)}%`, transform: 'translateX(-50%)', top: 12, width: 1, height: 4, backgroundColor: '#cbd5e1' }} />
    ))}
    {AXIS_TICKS.map(({ z, pr }) => {
      // Rand-Ticks (±3 SD) nach innen ausrichten, damit die Beschriftung nicht
      // aus der Grafik-Spalte herausragt.
      const edge = z === -Z_MAX ? 'left' : z === Z_MAX ? 'right' : 'center';
      const xf = edge === 'left' ? 'none' : edge === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';
      const ai = edge === 'left' ? 'flex-start' : edge === 'right' ? 'flex-end' : 'center';
      return (
        <div key={z} className="absolute flex flex-col" style={{ left: `${zToX(z)}%`, transform: xf, alignItems: ai, top: 0 }}>
          <span className="text-[10px] font-semibold tabular-nums leading-none text-slate-500 dark:text-slate-400">{pr || ' '}</span>
          <div style={{ width: 1, height: 6, backgroundColor: '#94a3b8', marginTop: 1, alignSelf: ai }} />
          <span className="text-[9px] tabular-nums leading-none mt-0.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">
            {z > 0 ? `+${z}` : z} SD
          </span>
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Legend — shared between the in-flow profile and the print header
// ---------------------------------------------------------------------------

const LEGEND_ZONES = [
  { color: '#991b1b', label: 'PR < 2' },
  { color: '#dc2626', label: 'PR 2–16' },
  { color: '#94a3b8', label: 'PR 16–84' },
  { color: '#15803d', label: 'PR > 84' },
] as const;

// Performance-zone legend. `className` is merged onto the flex container so
// call sites can add their own spacing / borders (in-flow vs. print header).
export const ProfileLegend: React.FC<{ className?: string; printMode?: boolean }> = ({ className = '', printMode = false }) => (
  <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 ${className}`}>
    {LEGEND_ZONES.map(z => (
      <div key={z.label} className="flex items-center gap-1.5">
        <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: z.color }} />
        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">{z.label}</span>
      </div>
    ))}
    <div className="flex items-center gap-1.5">
      {/* Ring muss zum Chart-Marker passen: im S/W-Druck dunkel auf weiß. */}
      <div style={{ width: 9, height: 9, borderRadius: '50%', border: printMode ? '2px solid #0f172a' : '2px solid #94a3b8', backgroundColor: printMode ? '#ffffff' : 'transparent' }} />
      <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">vorherige Messung</span>
    </div>
    <div className="flex items-center gap-1.5">
      <div style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: '#39B165' }} />
      <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">verbessert</span>
    </div>
    <div className="flex items-center gap-1.5">
      <div style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: '#E14747' }} />
      <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">verschlechtert</span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Notiz-Banner — die Notiz(en) einer Testung werden EINMAL, gut lesbar und über
// die volle Breite am Anfang des jeweiligen Testblocks gezeigt (statt je Zeile
// klein wiederholt). Betrifft besonders Tests mit mehreren Kennwerten (VLMT,
// TAP, ROCFT, WMS, LG, Zahlen-/Blockspanne …).
// ---------------------------------------------------------------------------

const collectNotes = (rows: { note?: string }[]): string[] =>
  orderedUnique(rows.map(r => (r.note ?? '').trim()).filter(Boolean));

const NoteBanner: React.FC<{ notes: string[]; printMode?: boolean }> = ({ notes, printMode = false }) => {
  if (notes.length === 0) return null;
  return (
    <div className="pr-note-banner mt-0.5 mb-1.5 space-y-0.5">
      {notes.map((n, i) => (
        <div
          key={i}
          className={`flex items-start gap-1.5 ${printMode ? 'text-slate-700' : 'text-slate-600 dark:text-slate-300'}`}
        >
          <StickyNote size={12} className="shrink-0 mt-[3px] text-slate-400 dark:text-slate-500" />
          <p className="text-[12px] leading-snug whitespace-pre-wrap flex-1 min-w-0">{n}</p>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const PRProfile: React.FC<PRProfileProps> = ({ results, textResults = [], extraBottomContent, containerRef, hideLegend = false, hideTrendArrows = false, hideAxis = false, printMode = false }: PRProfileProps) => {
  const { showTrendArrows } = useProfilePrefs();
  // PDF-Export erzwingt „keine Pfeile" über hideTrendArrows, unabhängig von der Nutzer-Einstellung.
  const showArrows = showTrendArrows && !hideTrendArrows;

  const allDataDomains = orderedUnique([
    ...results.map(r => getMajorDomain(r.domain)),
    ...textResults.map(t => getMajorDomain(t.domain)),
  ]);

  const orderedDomainPairs: { cfg: DomainConfig; dataDomain: string }[] = [];
  const unmatchedDomains: string[] = [];

  for (const cfg of LAYOUT) {
    const matched = allDataDomains.filter(d => findDomainConfig(d) === cfg);
    for (const d of matched) orderedDomainPairs.push({ cfg, dataDomain: d });
  }
  for (const d of allDataDomains) {
    if (!findDomainConfig(d)) unmatchedDomains.push(d);
  }

  // ---- Row renderers -------------------------------------------------------

  const BarRow = ({ res }: { res: PRResult }) => {
    // `res.currentPr === undefined` zählt IMMER als "keine Daten" — unabhängig von
    // res.aborted. Das Aborted-Flag kann bei einer nicht mehr aktuellen Persistenz-Schicht
    // verloren gehen (z. B. nach Neuladen aus einer älteren DB-Kopie), während
    // percentileRanks weiterhin leer bleibt; ohne diesen Fallback würde `dotColor`/`prToNum`
    // dann mit `undefined` aufgerufen und abstürzen ("Cannot read properties of undefined").
    const isAbortedNoData = res.currentPr === undefined || (res.aborted && res.currentPr === 'n/a');
    const isNoPrData = !res.aborted && res.currentPr === 'n/a';
    const currPrNum = isAbortedNoData ? 50 : prToNum(res.currentPr);
    const currColor = isAbortedNoData ? '#9ca3af' : dotColor(res.currentPr);
    const currX     = isAbortedNoData ? 50 : prToX(currPrNum);

    const prevPrNum = res.previousPr !== undefined ? prToNum(res.previousPr) : null;
    const prevX     = prevPrNum !== null ? prToX(prevPrNum) : null;
    const prevColor = res.previousPr !== undefined ? dotColor(res.previousPr) : null;

    const extraPrevs = res.previousPrs ?? [];

    const range     = !isAbortedNoData ? parseRangeBounds(res.currentPr) : null;
    const prevRange = res.previousPr !== undefined ? parseRangeBounds(res.previousPr) : null;

    const rangeSegs     = range     ? getRangeSegments(Math.max(0, range[0]),     Math.min(100, range[1]))     : null;
    const prevRangeSegs = prevRange ? getRangeSegments(Math.max(0, prevRange[0]), Math.min(100, prevRange[1])) : null;

    // Hantel-Darstellung: nur wenn beide Punktwerte vorliegen (keine PR-Bereiche, nicht abgebrochen).
    // Richtungsfarbe: alle Werte sind Prozentränge (höher = besser) → grün = Verbesserung, rot = Verschlechterung.
    // Kein Trendpfeil, wenn der Wert unverändert ist (vorher == aktuell).
    const hasPair  = prevPrNum !== null && prevX !== null && !range && !prevRange && !isAbortedNoData && !isNoPrData && currPrNum !== prevPrNum;
    const dirColor = !hasPair
      ? '#94a3b8'
      : currPrNum > (prevPrNum as number) ? '#39B165'
      : currPrNum < (prevPrNum as number) ? '#E14747'
      : '#94a3b8';

    // Auch bei abgebrochenen Tests ohne Normwert sollen bereits erfasste Rohwerte
    // weiterhin angezeigt werden (links neben dem "k.A."-Balken).
    const detailsText     = res.details?.filter(Boolean).join('  ') || null;
    const prevDetailsText = res.previousDetails?.filter(Boolean).join('  ') || null;

    // S/W-Druck: die helle Durchschnitts-Graustufe (#94a3b8) der Werttexte abdunkeln, damit lesbar.
    const inkPrint = (c: string) => (printMode && c === '#94a3b8' ? '#475569' : c);

    return (
      <div className="pr-row flex items-start" style={{ minHeight: 30 }}>
        <div className="shrink-0 pl-6 pr-3 overflow-hidden" style={{ width: LEFT_W }}>
          <div className="flex items-center gap-1.5">
            <span
              className="text-[13px] text-slate-700 dark:text-slate-200 leading-tight flex-1 min-w-0 truncate"
              title={res.note || undefined}
            >
              {res.label}
              {res.tapVersion && (
                <span className="ml-1 text-[9px] text-slate-400 dark:text-slate-500">({res.tapVersion})</span>
              )}
              {res.lpsKorrektur && (
                <span className="ml-1 text-[9px] text-slate-400 dark:text-slate-500">({res.lpsKorrektur})</span>
              )}
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              {res.previousPr !== undefined && !isAbortedNoData && (
                <>
                  <span className="text-[10px] tabular-nums" style={{ color: inkPrint(prevColor ?? '#94a3b8'), opacity: printMode ? 1 : 0.65 }}>
                    {res.previousPr}
                  </span>
                  <span className={`text-[8px] mx-0.5 ${printMode ? 'text-slate-500' : 'text-slate-300 dark:text-slate-600'}`}>›</span>
                </>
              )}
              {isAbortedNoData ? (
                <span className="text-[10px] text-slate-400">k.A.</span>
              ) : isNoPrData ? (
                <span className="text-[10px] text-slate-400">–</span>
              ) : (
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: inkPrint(currColor) }}>
                  {res.currentPr}
                </span>
              )}
            </div>
          </div>
          {detailsText && (
            <div className="flex items-center gap-1 mt-0.5 leading-none">
              {prevDetailsText && (
                <>
                  <span className={`text-[10px] tabular-nums ${printMode ? 'text-slate-500' : 'text-slate-300 dark:text-slate-600'}`}>{prevDetailsText}</span>
                  <span className={`text-[8px] mx-0.5 ${printMode ? 'text-slate-500' : 'text-slate-300 dark:text-slate-600'}`}>›</span>
                </>
              )}
              <span className={`text-[10px] tabular-nums ${printMode ? 'text-slate-700' : 'text-slate-400 dark:text-slate-500'}`}>{detailsText}</span>
            </div>
          )}
          {/* PDF: Datum je Messung (vorher › aktuell) */}
          {printMode && res.date && (
            <div className="text-[9px] text-slate-500 tabular-nums mt-0.5 leading-none">
              {res.prevDate && res.prevDate !== res.date
                ? `${formatDate(res.prevDate)} › ${formatDate(res.date)}`
                : formatDate(res.date)}
            </div>
          )}
          {/* Die Notiz wird nicht mehr je Zeile klein angezeigt, sondern EINMAL
              als gut lesbares Banner am Anfang des jeweiligen Testblocks
              (siehe <NoteBanner> im Testgruppen-Renderer). */}
        </div>

        <div className="flex-1 relative self-center" style={{ height: 28 }}>
          {isAbortedNoData ? (
            <div className="absolute inset-0 flex items-center px-2">
              <OctagonX size={10} className="text-slate-400 shrink-0 mr-1.5" />
              <span className="text-[10px] text-slate-400 dark:text-slate-500 italic truncate">
                {res.abortComment || 'Nicht auswertbar'}
              </span>
            </div>
          ) : isNoPrData ? null : (
            <>
              <ReferenceLinesOverlay />
              {/* Hantel-Verbindung vorher → aktuell, eingefärbt nach Richtung (grün/rot), mit Pfeil.
                  Pro Nutzer im Optionen-Tab abschaltbar. */}
              {hasPair && showArrows && (() => {
                const lo = Math.min(prevX as number, currX);
                const hi = Math.max(prevX as number, currX);
                const toRight = currX >= (prevX as number);
                const ARROW = 5;
                const PAD = 14; // Abstand vom Wertepunkt-Mittelpunkt (≈ Radius + Pfeillänge) – Linie & Pfeil enden davor
                return (
                  <>
                    <div className="absolute pr-trend-arrow" style={{
                      left: toRight ? `${lo}%` : `calc(${lo}% + ${PAD}px)`,
                      width: `max(0px, calc(${hi - lo}% - ${PAD}px))`,
                      top: '50%', transform: 'translateY(-50%)',
                      height: 2, backgroundColor: dirColor, borderRadius: 1, zIndex: 1,
                    }} />
                    <div className="absolute pr-trend-arrow" style={{
                      left: toRight ? `calc(${currX}% - ${PAD}px)` : `calc(${currX}% + ${PAD - ARROW}px)`,
                      top: '50%', transform: 'translateY(-50%)',
                      width: 0, height: 0,
                      borderTop: '3.5px solid transparent',
                      borderBottom: '3.5px solid transparent',
                      ...(toRight ? { borderLeft: `${ARROW}px solid ${dirColor}` } : { borderRight: `${ARROW}px solid ${dirColor}` }),
                      zIndex: 2,
                    }} />
                  </>
                );
              })()}
              {prevX !== null && (
                prevRangeSegs
                  ? renderSegs(prevRangeSegs, 5, 1.5, '20', 2, true, printMode)
                  : React.createElement('div', { className: 'absolute', style: {
                      left: `${prevX}%`,
                      top: '50%', transform: 'translate(-50%, -50%)',
                      width: printMode ? 10 : 9, height: printMode ? 10 : 9, borderRadius: '50%',
                      // S/W-Druck: kräftiger dunkler Ring auf Weiß statt hellgrau.
                      border: printMode ? '2.5px solid #0f172a' : '2px solid #94a3b8',
                      backgroundColor: printMode ? '#ffffff' : 'transparent',
                      zIndex: 2,
                    }})
              )}
              {extraPrevs.map((p, i) => {
                const epNum   = prToNum(p);
                const epX     = prToX(epNum);
                const epColor = dotColor(p);
                const epRange = parseRangeBounds(p);
                const epSegs  = epRange ? getRangeSegments(Math.max(0, epRange[0]), Math.min(100, epRange[1])) : null;
                return epSegs
                  ? <React.Fragment key={i}>{renderSegs(epSegs, 4, 1, '15', 2, true, printMode)}</React.Fragment>
                  : React.createElement('div', { key: i, className: 'absolute', style: {
                      left: `${epX}%`,
                      top: '50%', transform: 'translate(-50%, -50%)',
                      width: printMode ? 7 : 6, height: printMode ? 7 : 6, borderRadius: '50%',
                      // S/W-Druck: dunkler Ring auf Weiß, volle Deckkraft – statt blassem Raster.
                      border: printMode ? '2px solid #0f172a' : `1px solid ${epColor}`,
                      backgroundImage: printMode ? 'none' : `repeating-linear-gradient(45deg, ${epColor}40 0px, ${epColor}40 2px, transparent 2px, transparent 5px)`,
                      backgroundColor: printMode ? '#ffffff' : 'transparent',
                      zIndex: 2,
                      opacity: printMode ? 1 : 0.5,
                    }});
              })}
              {rangeSegs
                ? renderSegs(rangeSegs, 7, 2, '', 3)
                : React.createElement('div', { className: 'absolute', style: {
                    left: `${currX}%`,
                    top: '50%', transform: 'translate(-50%, -50%)',
                    width: 10, height: 10, borderRadius: '50%',
                    backgroundColor: currColor,
                    boxShadow: `0 1px 4px ${currColor}60`,
                    zIndex: 3,
                  }})
              }
            </>
          )}
        </div>
      </div>
    );
  };

  const TextRow = ({ tr }: { tr: TextProfileResult }) => (
    <div className="pr-row flex items-start" style={{ minHeight: 30 }}>
      <div className="shrink-0 pr-3 py-1 overflow-hidden" style={{ width: LEFT_W }}>
        {tr.date ? (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-none">{formatDate(tr.date)}</span>
        ) : (
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 truncate">{tr.testGroup}</span>
        )}
      </div>
      <div className="flex-1 py-1 space-y-1">
        {tr.items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            {item.label && <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap min-w-[120px] leading-snug">{item.label}</span>}
            <span className="text-[12px] text-slate-700 dark:text-slate-200 leading-snug whitespace-pre-wrap flex-1 italic">{item.text}</span>
          </div>
        ))}
        {tr.note && <p className="text-[11px] italic text-slate-400 dark:text-slate-500">{tr.note}</p>}
      </div>
    </div>
  );

  // ---- 3-level domain renderer with subdomain-based placement ---------------

  // testGroups that mark the start of the "Exploration" section in domain 6;
  // injectNode is rendered immediately before the first one that has data
  const EXPLORATION_TGS = new Set(['Gesichtsfeldprüfung', 'Neglectprüfung', 'Explorationsaufgaben']);

  const renderDomain = (cfg: DomainConfig, dataDomain: string, isFirst: boolean, injectNode?: React.ReactNode) => {
    const domainResults     = results.filter(r => getMajorDomain(r.domain) === dataDomain);
    const domainTextResults = textResults.filter(t => getMajorDomain(t.domain) === dataDomain);

    // Group PRResults: subdomain label match > testGroup fallback > unassigned
    const subResultBuckets: PRResult[][] = cfg.subsections.map((): PRResult[] => []);
    const noGroupResults:   PRResult[]   = [];
    const unassignedResults: PRResult[]  = [];

    for (const res of domainResults) {
      if (!res.testGroup) { noGroupResults.push(res); continue; }
      let idx = -1;
      if (res.subdomain) {
        idx = cfg.subsections.findIndex(sub => sub.subLabel === res.subdomain);
      }
      if (idx === -1) idx = findSubsectionIndex(cfg, res.testGroup);
      if (idx !== -1) subResultBuckets[idx].push(res);
      else unassignedResults.push(res);
    }

    // Group TextProfileResults by testGroup matching
    const subTextBuckets:       TextProfileResult[][] = cfg.subsections.map((): TextProfileResult[] => []);
    const unassignedTextResults: TextProfileResult[]  = [];
    for (const tr of domainTextResults) {
      const idx = findSubsectionIndex(cfg, tr.testGroup);
      if (idx !== -1) subTextBuckets[idx].push(tr);
      else unassignedTextResults.push(tr);
    }

    let renderedSubsections = 0;

    return (
      <div key={dataDomain} className={`pr-domain ${!isFirst ? 'mt-8' : ''}`}>
        {/* Domain heading */}
        <div className={!isFirst ? 'border-t border-slate-300 dark:border-slate-600 pt-4 mb-3' : 'mb-3'}>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest text-center">
            {cfg.label}
          </h3>
        </div>

        {/* Ungrouped rows (no testGroup set) */}
        <NoteBanner notes={collectNotes(noGroupResults)} printMode={printMode} />
        {noGroupResults.map((res, i) => (
          <React.Fragment key={`ng-${i}`}>{BarRow({ res })}</React.Fragment>
        ))}

        {/* Subsections */}
        {cfg.subsections.map((sub, si) => {
          const resInSub  = subResultBuckets[si];
          const textInSub = subTextBuckets[si];
          if (resInSub.length === 0 && textInSub.length === 0) return null;

          const isFirstBlock = renderedSubsections === 0 && noGroupResults.length === 0;
          renderedSubsections++;

          // Unique testGroups sorted by LAYOUT config order
          const tgsInSub = orderedUnique([
            ...resInSub.map(r => r.testGroup ?? ''),
            ...textInSub.map(t => t.testGroup),
          ]).filter(Boolean);

          tgsInSub.sort((a, b) => {
            const oa = findTestGroupOrder(sub, a);
            const ob = findTestGroupOrder(sub, b);
            if (oa === -1 && ob === -1) return 0;
            if (oa === -1) return 1;
            if (ob === -1) return -1;
            return oa - ob;
          });

          return (
            <div key={`sub-${si}`} className={!isFirstBlock ? 'mt-3' : ''}>
              {sub.subLabel && (
                <div className="flex items-center gap-2 mb-1 mt-2">
                  {/* Abschnitts-Überschrift (z. B. „2.4 Figurales Gedächtnis") fett, linksbündig */}
                  <span className="text-[10px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider whitespace-nowrap">
                    {sub.subLabel}
                  </span>
                  <div className="h-px flex-1 bg-slate-300 dark:bg-slate-500" />
                </div>
              )}

              {(() => {
                // index of the first exploration testGroup — injectNode goes before it
                const injectIdx = injectNode
                  ? tgsInSub.findIndex(tg => EXPLORATION_TGS.has(tg))
                  : -1;
                return tgsInSub.map((tg, tgi) => {
                  const tgResults     = resInSub.filter(r => r.testGroup === tg);
                  const tgTextResults = textInSub.filter(t => t.testGroup === tg);
                  // Show testGroup label only when no subsection heading exists,
                  // or explicitly for VLMT and LPS which need labeling within named subsections
                  const showThisLabel = !sub.subLabel || tg.startsWith('VLMT') || tg.includes('LPS') || tg.includes('Logisches Gedächtnis') || tg.includes('Visuelle Wiedergabe');
                  return (
                    <React.Fragment key={tg}>
                      {tgi === injectIdx && injectNode}
                      {/* Größere Lücke vor jedem benannten Testverfahren (z. B. VLMT ↔ Logisches Gedächtnis) */}
                      <div className={tgi > 0 ? (showThisLabel ? 'mt-4' : 'mt-1') : ''}>
                        {showThisLabel && (
                          <div className="flex items-center gap-2 mb-0.5 pl-2">
                            {/* Testverfahren-Name fett ("dick gedruckt"), eingerückt unter den Abschnitt */}
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-200 uppercase tracking-wider whitespace-nowrap">
                              {tg}
                            </span>
                            {tg !== 'VLMT' && <div className="h-px flex-1 bg-slate-300 dark:bg-slate-500" />}
                          </div>
                        )}
                        <NoteBanner notes={collectNotes(tgResults)} printMode={printMode} />
                        {tgResults.map((res, i) => (
                          <React.Fragment key={i}>{BarRow({ res })}</React.Fragment>
                        ))}
                        {tgTextResults.map((tr, i) => (
                          <React.Fragment key={i}>{TextRow({ tr })}</React.Fragment>
                        ))}
                      </div>
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          );
        })}

        {/* Unassigned testGroups (not in LAYOUT config for this domain) */}
        {(unassignedResults.length > 0 || unassignedTextResults.length > 0) && (
          <div className="mt-3">
            {orderedUnique([
              ...unassignedResults.map(r => r.testGroup ?? ''),
              ...unassignedTextResults.map(t => t.testGroup),
            ]).filter(Boolean).map((tg, tgi) => {
              const tgResults = unassignedResults.filter(r => r.testGroup === tg);
              const tgText    = unassignedTextResults.filter(t => t.testGroup === tg);
              return (
                <div key={tg} className={tgi > 0 ? 'mt-1' : ''}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">{tg}</span>
                    <div className="h-px flex-1 bg-slate-300 dark:bg-slate-500" />
                  </div>
                  <NoteBanner notes={collectNotes(tgResults)} printMode={printMode} />
                  {tgResults.map((res, i) => <React.Fragment key={i}>{BarRow({ res })}</React.Fragment>)}
                  {tgText.map((tr, i)    => <React.Fragment key={i}>{TextRow({ tr })}</React.Fragment>)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ---- Root render ---------------------------------------------------------

  // Split domains: main (1–5) rendered before the axis, exploration (6) after
  const mainPairs = orderedDomainPairs.filter(({ cfg }) => cfg.domainMatch !== 'Visuelle Exploration');
  const explorationPairs = orderedDomainPairs.filter(({ cfg }) => cfg.domainMatch === 'Visuelle Exploration');
  const hasMainContent = mainPairs.length > 0 || unmatchedDomains.length > 0;

  return (
    <div ref={containerRef} className="pr-chart w-full bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md shadow-slate-200/60 dark:shadow-none">

      {/* Spaltenkopf + SD-/PR-Skala: die Skala steht jetzt oben über der Grafik-Spalte
          (Bildschirm). Im PDF wird sie stattdessen im wiederkehrenden Seitenkopf gezeigt
          (hideAxis) — sie erscheint dort auf jeder Seite. */}
      {hasMainContent && (
        <div className="flex items-end mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-700">
          <div className="shrink-0 pr-3 flex items-baseline justify-between" style={{ width: LEFT_W }}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Test</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Prozentrang (PR)</span>
          </div>
          <div className="flex-1">
            {!hideAxis && <AxisScale printMode={printMode} />}
          </div>
        </div>
      )}

      {/* Main domains (1–5) */}
      {mainPairs.map(({ cfg, dataDomain }, di) =>
        renderDomain(cfg, dataDomain, di === 0)
      )}

      {/* Fallback: unmatched domains (custom tests etc.) — rendered before axis */}
      {unmatchedDomains.map((domain, di) => {
        const domainResults     = results.filter(r => getMajorDomain(r.domain) === domain);
        const domainTextResults = textResults.filter(t => getMajorDomain(t.domain) === domain);
        const allTgs = orderedUnique([
          ...domainResults.map(r => r.testGroup ?? ''),
          ...domainTextResults.map(t => t.testGroup),
        ]);
        const noGroupResults = domainResults.filter(r => !r.testGroup);
        const isFirst = mainPairs.length === 0 && di === 0;
        return (
          <div key={domain} className={!isFirst ? 'mt-8' : ''}>
            <div className={!isFirst ? 'border-t border-slate-300 dark:border-slate-600 pt-4 mb-3' : 'mb-3'}>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest text-center">{domain}</h3>
            </div>
            <NoteBanner notes={collectNotes(noGroupResults)} printMode={printMode} />
            {noGroupResults.map((res, i) => (
              <React.Fragment key={i}>{BarRow({ res })}</React.Fragment>
            ))}
            {allTgs.filter(Boolean).map((tg, tgi) => {
              const tgResults     = domainResults.filter(r => r.testGroup === tg);
              const tgTextResults = domainTextResults.filter(t => t.testGroup === tg);
              return (
                <div key={tg} className={tgi > 0 || noGroupResults.length > 0 ? 'mt-3' : ''}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">{tg}</span>
                    <div className="h-px flex-1 bg-slate-300 dark:bg-slate-500" />
                  </div>
                  <NoteBanner notes={collectNotes(tgResults)} printMode={printMode} />
                  {tgResults.map((res, i) => (
                    <React.Fragment key={i}>{BarRow({ res })}</React.Fragment>
                  ))}
                  {tgTextResults.map((tr, i) => (
                    <React.Fragment key={i}>{TextRow({ tr })}</React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Trennlinie vor Domäne 6 / Legende (die SD-/PR-Skala steht jetzt oben). */}
      <div className="mt-4" />

      {/* Legend — after axis when domain 6 is absent; injected inside domain 6 otherwise.
          Suppressed entirely in print mode (rendered in the repeating page header). */}
      {!hideLegend && explorationPairs.length === 0 && (
        <ProfileLegend className="mt-4 pt-3 border-t border-slate-300 dark:border-slate-600" />
      )}

      {/* Domain 6: Visuelle Exploration — rendered after axis; legend injected before Explorationsaufgaben
          (omitted in print mode — the legend lives in the repeating page header instead). */}
      {explorationPairs.length > 0 && (() => {
        const legendNode = hideLegend ? undefined : (
          <ProfileLegend className="mt-3 mb-2 pt-2 border-t border-slate-300 dark:border-slate-600" />
        );
        return (
          <div className={hasMainContent ? 'mt-6' : ''}>
            {explorationPairs.map(({ cfg, dataDomain }, di) =>
              renderDomain(cfg, dataDomain, di === 0, legendNode)
            )}
          </div>
        );
      })()}

      {/* Extra content for domain 6 (GF/Neglect) rendered inside this card */}
      {extraBottomContent}
    </div>
  );
};
