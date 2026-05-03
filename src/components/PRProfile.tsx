import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, OctagonX } from 'lucide-react';
import { PRResult } from '../types';
import { formatDate } from '../lib/utils';

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
}

// ── Equal-width scale ──────────────────────────────────────────────────────────
// 7 zones, each visually equal (1/7 of total width).
// Boundaries are the z-score based PR cutoffs.
const PR_BOUNDS = [0, 2.28, 15.87, 30.85, 69.15, 84.1, 97.72, 100];
const N_ZONES   = 7;
const ZONE_W    = 100 / N_ZONES; // ≈ 14.286 %

// Map a raw PR value (0–100) → visual position (0–100%) on the equal-width scale
function prToEqualPos(pr: number): number {
  const p = Math.max(0, Math.min(100, pr));
  for (let i = 0; i < N_ZONES; i++) {
    const lo = PR_BOUNDS[i], hi = PR_BOUNDS[i + 1];
    if (p <= hi || i === N_ZONES - 1) {
      const t = hi > lo ? (p - lo) / (hi - lo) : 0;
      return (i + Math.max(0, Math.min(1, t))) * ZONE_W;
    }
  }
  return 100;
}

// Convenience: parse a range string → [lo, hi] PR values or null
// Handles:
//   "15-35" / "15–35"  → [15, 35]
//   "80->95"            → [80, 100]   (VLMT flat-zone ending at >95)
//   ">90" / ">95"       → [90, 100]   (above-ceiling boundary)
//   "<10" / "< 10"      → [0,  10]    (below-floor boundary)
function parseRangeBounds(pr: number | string): [number, number] | null {
  if (typeof pr === 'number') return null;
  const s = pr.toString().trim();

  // "N->95" format (VLMT range ending at the >95 boundary)
  const mTop = s.match(/^(\d+(?:\.\d+)?)->95$/);
  if (mTop) {
    const a = parseFloat(mTop[1]);
    return isNaN(a) ? null : [a, 100];
  }

  // ">N" — score above the ceiling of the norm table
  const mGt = s.match(/^>\s*(\d+(?:\.\d+)?)$/);
  if (mGt) {
    const a = parseFloat(mGt[1]);
    return isNaN(a) ? null : [a, 100];
  }

  // "<N" — score below the floor of the norm table
  const mLt = s.match(/^<\s*(\d+(?:\.\d+)?)$/);
  if (mLt) {
    const a = parseFloat(mLt[1]);
    return isNaN(a) ? null : [0, a];
  }

  // Plain "N-M" or "N–M" range
  const mRange = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (!mRange) return null;
  const a = parseFloat(mRange[1]), b = parseFloat(mRange[2]);
  return [Math.min(a, b), Math.max(a, b)];
}

// Numeric midpoint of any PR value (number, range string, or "<N" / ">N")
function prToNum(pr: number | string): number {
  if (typeof pr === 'number') return Math.max(0, Math.min(100, pr));
  const str = pr.toString().trim();
  const rng = parseRangeBounds(str);
  if (rng) return (rng[0] + rng[1]) / 2;
  if (str.startsWith('≤')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 1 : v / 2; }
  if (str.startsWith('≥')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 99 : Math.min(100, v); }
  if (str.startsWith('<')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 1 : v / 2; }
  if (str.startsWith('>')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 99 : Math.min(100, v + 1); }
  const n = parseFloat(str);
  return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
}

// ── Zone definitions (7 equal-width visual slots) ─────────────────────────────
// Color families: zones 1+2 = reds, zones 3+4+5 = greens, zones 6+7 = violets
const ZONES = [
  { prLabel: '0–2',    prMin: 0,     prMax: 2.28,  color: '#991b1b', bg: 'rgba(153,27,27,0.22)'  }, // dark red
  { prLabel: '2–16',   prMin: 2.28,  prMax: 15.87, color: '#dc2626', bg: 'rgba(220,38,38,0.13)'  }, // medium red
  { prLabel: '16–31',  prMin: 15.87, prMax: 30.85, color: '#15803d', bg: 'rgba(21,128,61,0.11)'  }, // light green
  { prLabel: '31–69',  prMin: 30.85, prMax: 69.15, color: '#166534', bg: 'rgba(22,101,52,0.20)'  }, // strong green (Normbereich)
  { prLabel: '69–84',  prMin: 69.15, prMax: 84.1,  color: '#15803d', bg: 'rgba(21,128,61,0.11)'  }, // light green (symmetric)
  { prLabel: '84–98',  prMin: 84.1,  prMax: 97.72, color: '#7c3aed', bg: 'rgba(124,58,237,0.13)' }, // medium violet
  { prLabel: '98–100', prMin: 97.72, prMax: 100,   color: '#4c1d95', bg: 'rgba(76,29,149,0.22)'  }, // dark violet
].map((z, i) => ({ ...z, visMin: i * ZONE_W, visMax: (i + 1) * ZONE_W }));

// ── Main categories: separators at ±1 SD (PR 15.87 / 84.1) ───────────────────
// Zone indices 0+1 = unter, 2+3+4 = durch, 5+6 = über
const MAIN_CATS = [
  { label: 'Unterdurchschnittlich', visMin: 0 * ZONE_W, visMax: 2 * ZONE_W, color: '#dc2626', bg: 'rgba(220,38,38,0.07)'  },
  { label: 'Durchschnittlich',      visMin: 2 * ZONE_W, visMax: 5 * ZONE_W, color: '#166534', bg: 'rgba(22,101,52,0.06)'  },
  { label: 'Überdurchschnittlich',  visMin: 5 * ZONE_W, visMax: 7 * ZONE_W, color: '#7c3aed', bg: 'rgba(124,58,237,0.06)' },
];

function getZone(pr: number | string) {
  const n = prToNum(pr);
  return ZONES.find(z => n >= z.prMin && n < z.prMax) ?? ZONES[3];
}

function getMajorDomain(domain?: string): string {
  if (!domain) return 'Weitere';
  // Extract "1. Aufmerksamkeit" from "1. Aufmerksamkeit (Geschwindigkeit)"
  const match = domain.match(/^(\d+\.\s*[^(]+)/);
  return match ? match[1].trim() : domain;
}

const LEFT_W = 290;

function orderedUnique(arr: string[]): string[] {
  return arr.filter((v, i) => arr.indexOf(v) === i);
}

export const PRProfile: React.FC<PRProfileProps> = ({ results, textResults = [] }) => {
  const domainGroups = orderedUnique([
    ...results.map(r => getMajorDomain(r.domain)),
    ...textResults.map(t => getMajorDomain(t.domain)),
  ]).sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="pr-chart w-full bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none">

      {/* ── SCALE HEADER ── */}
      <div className="flex items-end mb-2" style={{ gap: 0 }}>
        {/* Left spacer */}
        <div style={{ width: LEFT_W, flexShrink: 0 }} className="flex items-end justify-end pr-3 pb-1 gap-1">
          <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Vorher</span>
          <span className="text-[8px] text-slate-300 dark:text-slate-600">›</span>
          <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Aktuell</span>
        </div>

        {/* Zone header */}
        <div className="flex-1 relative" style={{ height: 64 }}>

          {/* Row 1 (top 14px): Main categories with thick separators */}
          {MAIN_CATS.map((cat, i) => (
            <div
              key={cat.label}
              className="absolute flex items-center justify-center rounded-t-md overflow-hidden"
              style={{
                top: 0, height: 14,
                left: `${cat.visMin}%`,
                width: `${cat.visMax - cat.visMin}%`,
                backgroundColor: cat.bg,
                borderTop: `2px solid ${cat.color}55`,
                borderLeft: i > 0 ? `3px solid ${cat.color}bb` : 'none',
              }}
            >
              <span className="text-[7px] font-black uppercase tracking-widest truncate px-1" style={{ color: cat.color }}>
                {cat.label}
              </span>
            </div>
          ))}

          {/* Row 2 (14–26px): Sub-zone color strip with PR range labels */}
          {ZONES.map((z, i) => (
            <div
              key={z.prLabel + '-strip'}
              className="absolute flex items-center justify-center overflow-hidden"
              style={{
                top: 14, height: 12,
                left: `${z.visMin}%`,
                width: `${z.visMax - z.visMin}%`,
                backgroundColor: z.bg,
                borderRight: i < N_ZONES - 1
                  ? (i === 1 || i === 4)
                    ? '3px solid rgba(0,0,0,0.22)'
                    : '1px solid rgba(0,0,0,0.09)'
                  : 'none',
              }}
            />
          ))}

          {/* Row 3 (26–38px): PR range labels */}
          {ZONES.map(z => (
            <div
              key={z.prLabel + '-label'}
              className="absolute flex items-center justify-center overflow-hidden"
              style={{ top: 26, height: 12, left: `${z.visMin}%`, width: `${z.visMax - z.visMin}%` }}
            >
              <span className="text-[6px] font-black tabular-nums truncate px-0.5 leading-none" style={{ color: z.color }}>
                {z.prLabel}
              </span>
            </div>
          ))}

          {/* Row 4 (38–56px): Tick marks at zone boundaries */}
          {PR_BOUNDS.map((pr, i) => (
            <div
              key={pr}
              className="absolute flex flex-col items-center"
              style={{ top: 38, left: `${i * ZONE_W}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-2.5 bg-slate-300" />
              <span className="text-[7px] font-bold text-slate-400 mt-0.5 whitespace-nowrap tabular-nums">
                {pr % 1 === 0 ? pr : pr.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── TEST GROUPS ── */}
      <div className="space-y-3 mt-1">
        {domainGroups.map(group => {
          const groupResults = results.filter(r => getMajorDomain(r.domain) === group);
          const groupTextResults = textResults.filter(t => getMajorDomain(t.domain) === group);

          // Unique subdomains sorted ascending by numeric prefix (1.1, 1.2, …)
          const subdomains = orderedUnique(
            groupResults.map(r => r.subdomain ?? '').filter(Boolean)
          ).sort((a, b) => {
            const num = (s: string) => parseFloat(s.match(/^[\d.]+/)?.[0] ?? '0');
            return num(a) - num(b);
          });
          const noSubResults = groupResults.filter(r => !r.subdomain);

          // ── Single bar row renderer ──────────────────────────────────────────
          const BarRow = ({ res, rowIdx }: { res: PRResult; rowIdx: number }) => {
            const isAbortedNoData = res.aborted && (res.currentPr === 'n/a' || res.currentPr === undefined);
            const currPrNum  = isAbortedNoData ? 50 : prToNum(res.currentPr);
            const currVisPos = prToEqualPos(currPrNum);
            const prevPrNum  = res.previousPr !== undefined ? prToNum(res.previousPr) : null;
            const prevVisPos = prevPrNum !== null ? prToEqualPos(prevPrNum) : null;
            const currZone   = isAbortedNoData ? ZONES[3] : getZone(res.currentPr);

            return (
              <div className={`flex items-center gap-0 ${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-700/40'}`}>

                {/* ── LEFT INFO COLUMN ── */}
                <div className="shrink-0 pr-3 py-1 flex gap-0 overflow-hidden" style={{ width: LEFT_W, minHeight: 26 }}>
                  {res.testGroup && (
                    <div className={`shrink-0 w-1 rounded-full mr-1.5 self-stretch ${isAbortedNoData ? 'bg-orange-300' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  )}
                  <div className="flex flex-col justify-center flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="pr-label-text text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-tight flex-1 min-w-0 truncate">{res.label}</span>
                      {res.tapVersion && (
                        <span
                          className="text-[8px] font-black px-1 py-px rounded shrink-0 border"
                          style={res.tapVersion === 'M'
                            ? { color: '#b45309', backgroundColor: '#fffbeb', borderColor: '#fde68a' }
                            : { color: '#4f46e5', backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }}
                          title={res.tapVersion === 'M' ? 'TAP-M Version' : 'TAP 2.3 Version'}
                        >
                          {res.tapVersion}
                        </span>
                      )}
                      {res.lpsKorrektur && (
                        <span
                          className="text-[8px] font-black px-1 py-px rounded shrink-0 border"
                          style={{ color: '#0369a1', backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}
                          title={`Normkorrektur: ${res.lpsKorrektur}`}
                        >
                          {res.lpsKorrektur}
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        {res.previousPr !== undefined ? (
                          <span className="text-[8px] font-black px-1 py-px rounded tabular-nums"
                            style={{ color: getZone(res.previousPr).color, backgroundColor: getZone(res.previousPr).bg }}>
                            {res.previousPr}
                          </span>
                        ) : (
                          <span className="text-[8px] font-bold text-slate-300 dark:text-slate-600 px-1">–</span>
                        )}
                        {res.prevAborted && (
                          <span title={res.prevAbortComment || 'Vorheriger Test abgebrochen'}
                            className="inline-flex items-center text-orange-500 opacity-70">
                            <OctagonX size={8} />
                          </span>
                        )}
                        <span className="text-slate-300 dark:text-slate-600 text-[8px]">›</span>
                        {isAbortedNoData ? (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-black px-1 py-px rounded bg-orange-100 text-orange-700 border border-orange-300">
                            <OctagonX size={7} />Abgebr.
                          </span>
                        ) : (
                          <span className="text-[8px] font-black px-1 py-px rounded tabular-nums"
                            style={{ color: currZone.color, backgroundColor: currZone.bg }}>
                            {res.currentPr}
                          </span>
                        )}
                      </div>
                    </div>
                    {(res.date || res.prevDate) && (
                      <div className="flex items-center gap-1 mt-px">
                        {res.prevDate && <span className="text-[9px] text-slate-400">{formatDate(res.prevDate)}</span>}
                        {res.prevDate && res.date && <ArrowRight size={7} className="text-slate-300 shrink-0" />}
                        {res.date && <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">{formatDate(res.date)}</span>}
                      </div>
                    )}
                    {res.testGroup && (
                      <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{res.testGroup}</span>
                    )}
                    {res.note && (
                      <div className="text-[9px] italic text-slate-400 whitespace-pre-wrap mt-px">{res.note}</div>
                    )}
                  </div>
                </div>

                {/* ── BAR AREA ── */}
                <div className="pr-bar-row flex-1 relative" style={{ height: 26 }}>
                  {isAbortedNoData ? (
                    <div className="absolute inset-0 rounded-xl flex items-center px-3 border border-orange-200 dark:border-orange-900 bg-orange-50/70 dark:bg-orange-950/30">
                      <OctagonX size={10} className="text-orange-400 shrink-0 mr-1.5" />
                      <span className="text-[10px] text-orange-700 dark:text-orange-300 italic truncate">
                        {res.abortComment || 'Test abgebrochen / unvollständig'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="absolute inset-0 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600">
                        {ZONES.map(z => (
                          <div key={z.prLabel} className="absolute inset-y-0"
                            style={{ left: `${z.visMin}%`, width: `${z.visMax - z.visMin}%`, backgroundColor: z.bg }} />
                        ))}
                        {ZONES.slice(1).map((z, i) => (
                          <div key={z.prLabel + '-div'}
                            className={`absolute inset-y-0 ${(i === 1 || i === 4) ? 'pr-zone-div-major' : 'pr-zone-div-minor'}`}
                            style={{
                              left: `${z.visMin}%`,
                              width: (i === 1 || i === 4) ? 2 : 1,
                              backgroundColor: (i === 1 || i === 4) ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.08)',
                            }} />
                        ))}
                      </div>

                      {/* Current PR – range or point */}
                      {(() => {
                        const range = parseRangeBounds(res.currentPr);
                        if (range) {
                          const [lo, hi] = range;
                          const segments = ZONES
                            .filter(z => z.prMax > lo && z.prMin < hi)
                            .map((z, si, arr) => ({
                              vL: prToEqualPos(Math.max(lo, z.prMin)),
                              vR: prToEqualPos(Math.min(hi, z.prMax)),
                              color: z.color, first: si === 0, last: si === arr.length - 1,
                            }));
                          return (
                            <>
                              {segments.map((seg, si) => (
                                <motion.div key={si}
                                  initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
                                  transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                                  className="absolute z-30"
                                  style={{
                                    left: `${seg.vL}%`, width: `${Math.max(seg.vR - seg.vL, 0.3)}%`,
                                    top: 3, bottom: 3, transformOrigin: 'left center',
                                    backgroundColor: seg.color,
                                    borderTop: `2px solid ${seg.color}`, borderBottom: `2px solid ${seg.color}`,
                                    borderLeft: seg.first ? `2px solid ${seg.color}` : 'none',
                                    borderRight: seg.last ? `2px solid ${seg.color}` : 'none',
                                    borderRadius: seg.first && seg.last ? 3 : seg.first ? '3px 0 0 3px' : seg.last ? '0 3px 3px 0' : 0,
                                  }} />
                              ))}
                            </>
                          );
                        }
                        return (
                          <motion.div
                            initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }}
                            transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
                            className="absolute z-30"
                            style={{
                              left: `${currVisPos}%`, top: 3, bottom: 3,
                              transform: 'translateX(-50%)', transformOrigin: 'center',
                              width: 5, borderRadius: 2, backgroundColor: currZone.color,
                              boxShadow: `0 0 6px ${currZone.color}60`,
                            }} />
                        );
                      })()}

                      {/* Previous PR – outlined */}
                      {prevVisPos !== null && (() => {
                        const prevRange = res.previousPr !== undefined ? parseRangeBounds(res.previousPr) : null;
                        const prevZoneColor = getZone(res.previousPr!).color;
                        if (prevRange) {
                          const vL = prToEqualPos(prevRange[0]), vR = prToEqualPos(prevRange[1]);
                          return (
                            <div style={{
                              position: 'absolute', left: `${vL}%`, width: `${Math.max(vR - vL, 0.3)}%`,
                              top: 4, bottom: 4, backgroundColor: 'white',
                              border: `2px solid ${prevZoneColor}`, borderRadius: 3, zIndex: 20,
                            }} />
                          );
                        }
                        return (
                          <div style={{
                            position: 'absolute', left: `${prevVisPos}%`, top: 4, bottom: 4,
                            transform: 'translateX(-50%)', width: 7, borderRadius: 2,
                            backgroundColor: 'white', border: `2px solid ${prevZoneColor}`, zIndex: 20,
                          }} />
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            );
          };

          // ── Text result row renderer ──────────────────────────────────────────
          const TextRow = ({ tr, rowIdx }: { tr: TextProfileResult; rowIdx: number }) => (
            <div className={`flex items-stretch gap-0 ${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-700/40'}`}>
              <div className="shrink-0 pr-3 py-2 flex gap-0 overflow-hidden" style={{ width: LEFT_W }}>
                <div className="shrink-0 w-1 rounded-full mr-1.5 self-stretch bg-slate-300 dark:bg-slate-600" />
                <div className="flex flex-col justify-center flex-1 min-w-0">
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-tight">{tr.testGroup}</span>
                  {(tr.date || tr.examiner) && (
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-px">
                      {tr.date && formatDate(tr.date)}{tr.examiner && ` · ${tr.examiner}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 py-2 pr-2 pl-3 space-y-2">
                {tr.items.map((item, ii) => (
                  <div key={ii}>
                    <div className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">{item.label}</div>
                    <p className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug whitespace-pre-wrap">{item.text}</p>
                  </div>
                ))}
                {tr.note && <p className="text-[10px] italic text-slate-400 dark:text-slate-500">{tr.note}</p>}
              </div>
            </div>
          );

          return (
            <div key={group}>
              {/* Major domain header */}
              <div className="flex items-center gap-2 mb-1">
                <h3 className="pr-group-badge text-[9px] font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-[0.2em] px-3 py-1 bg-indigo-50 dark:bg-indigo-950 rounded-lg border border-indigo-100 dark:border-indigo-900 whitespace-nowrap">
                  {group}
                </h3>
                <div className="h-px flex-1 bg-gradient-to-r from-indigo-100 to-transparent" />
              </div>

              <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700">
                {/* Items without subdomain */}
                {noSubResults.map((res, i) => (
                  <React.Fragment key={`${res.label}-${i}`}>{BarRow({ res, rowIdx: i })}</React.Fragment>
                ))}

                {/* Items grouped by subdomain */}
                {subdomains.map(sub => {
                  const subItems = groupResults.filter(r => r.subdomain === sub);
                  return (
                    <React.Fragment key={sub}>
                      {/* Subdomain header row */}
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-slate-700/60 border-y border-slate-100 dark:border-slate-700">
                        <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] whitespace-nowrap">{sub}</span>
                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
                      </div>
                      {subItems.map((res, i) => (
                        <React.Fragment key={`${sub}-${res.label}-${i}`}>{BarRow({ res, rowIdx: i })}</React.Fragment>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* Text results (Bürotest, Tagesplan) */}
                {groupTextResults.map((tr, ti) => (
                  <React.Fragment key={`${tr.testGroup}-${ti}`}>{TextRow({ tr, rowIdx: noSubResults.length + groupResults.filter(r => r.subdomain).length + ti })}</React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── LEGEND ── */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* Aktuelle Messung – solid bar */}
        <div className="flex items-center gap-2">
          <div className="rounded-sm" style={{ width: 6, height: 18, backgroundColor: '#64748b' }} />
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Aktuelle Messung</span>
        </div>
        {/* Vorherige Messung – outlined bar */}
        <div className="flex items-center gap-2">
          <div className="rounded-sm bg-white border-2 border-slate-400" style={{ width: 8, height: 18 }} />
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Vorherige Messung</span>
        </div>
        {/* PR-Spanne – zone-colored range example */}
        <div className="flex items-center gap-2">
          <div className="relative rounded-sm overflow-hidden" style={{ width: 32, height: 14, border: '1.5px solid #64748b' }}>
            <div className="absolute inset-y-0" style={{ left: 0, width: '43%', backgroundColor: '#dc2626' }} />
            <div className="absolute inset-y-0" style={{ left: '43%', width: '57%', backgroundColor: '#15803d' }} />
          </div>
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">PR-Spanne</span>
        </div>
      </div>
    </div>
  );
};
