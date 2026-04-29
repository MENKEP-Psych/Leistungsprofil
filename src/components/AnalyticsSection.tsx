import React, { useState, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  BarChart2, Download, Loader2, RefreshCw, TrendingUp, SlidersHorizontal,
  TrendingDown, Minus,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { fetchPatients, fetchPatient } from '../lib/db-api';
import { Patient, TestResult } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsRow { patient: Patient; results: TestResult[]; }

interface TestStats {
  testId: string; label: string;
  nPerformed: number;  // patients who did this test (regardless of PR availability)
  n: number;           // patients with valid avg PR
  mean: number; sd: number; median: number; q25: number; q75: number; min: number; max: number;
  ageCorr: { r: number; p: number } | null;
  genderT: { t: number; p: number; d: number; nM: number; nW: number } | null;
  anova: ANOVAResult | null;
}

interface ANOVAResult {
  F_A: number; p_A: number; eta2_A: number;
  F_B: number; p_B: number; eta2_B: number;
  F_AB: number; p_AB: number; eta2_AB: number;
  N: number;
}

interface ClassBreakdown {
  testId: string; label: string; n: number;
  below: number; average: number; above: number;
  belowPct: number; avgPct: number; abovePct: number;
}

interface RawHistogram {
  testId: string; testLabel: string; key: string; keyLabel: string;
  n: number; mean: number; sd: number;
  buckets: { label: string; n: number }[];
}

interface SubtestStat {
  testId: string; testLabel: string; key: string; keyLabel: string;
  n: number; mean: number; sd: number; median: number; min: number; max: number;
}

interface LongitudinalStat {
  testId: string; label: string; n: number;
  meanChange: number; sdChange: number;
  improved: number; declined: number; stable: number;
}

interface DiagMeanPR { diag: string; n: number; mean: number; sd: number; }
interface LokMeanPR  { lok: string;  n: number; mean: number; sd: number; }

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_LABELS: Record<string, string> = {
  tmt: 'TMT', vlmt: 'VLMT', tol: 'TOL', zzt: 'ZZT',
  mosaik: 'Mosaik', zahlenspanne: 'Zahlenspanne',
  lg: 'Log. Gedächtnis', wms: 'WMS-IV', wms_vw: 'Vis. Wiedergabe (WMS)',
  rocft: 'ROCFT', rey: 'ROCFT (Rey)', tap: 'TAP',
  burotest: 'Bürotest', buerotest: 'Bürotest',
  tagesplan: 'Tagesplan', neglect: 'Neglect',
  neglect_gf: 'Exploration/Neglect', custom: 'Eigener Test',
  // Virtual TAP subtest IDs
  tap_alertness:         'TAP – Alertness',
  tap_gonogo:            'TAP – Go/Nogo 1',
  tap_gonogo2:           'TAP – Go/Nogo 2',
  tap_flexibilitaet:     'TAP – Flexibilität',
  tap_geteilte:          'TAP – Geteilte Aufm.',
  tap_vigilanz:          'TAP – Vigilanz',
  tap_arbeitsgedaechtnis:'TAP – Arbeitsgedächtnis',
  tap_vis_scanning:      'TAP – Vis. Scanning',
};

// ── TAP subtest definitions ───────────────────────────────────────────────────

const TAP_SUBTEST_DEFS: { virtId: string; label: string; prKeys: string[] }[] = [
  { virtId: 'tap_alertness',          label: 'TAP – Alertness',          prKeys: ['alertnessM','alertness23','alertness23_ohne','alertness23_mit'] },
  { virtId: 'tap_gonogo',             label: 'TAP – Go/Nogo 1',          prKeys: ['gonogo'] },
  { virtId: 'tap_gonogo2',            label: 'TAP – Go/Nogo 2',          prKeys: ['gonogo2'] },
  { virtId: 'tap_flexibilitaet',      label: 'TAP – Flexibilität',        prKeys: ['flexibilitaet'] },
  { virtId: 'tap_geteilte',           label: 'TAP – Geteilte Aufm.',      prKeys: ['geteilte'] },
  { virtId: 'tap_vigilanz',           label: 'TAP – Vigilanz',            prKeys: ['vigilanz'] },
  { virtId: 'tap_arbeitsgedaechtnis', label: 'TAP – Arbeitsgedächtnis',   prKeys: ['arbeitsgedaechtnis'] },
  { virtId: 'tap_vis_scanning',       label: 'TAP – Vis. Scanning',       prKeys: ['ve_rt_krit_pr','ve_sd_krit_pr','ve_rt_nkrit_pr','ve_sd_nkrit_pr','ve_fehler_pr','ve_ausl_krit_pr'] },
];

/** Expand each TAP TestResult into one virtual entry per performed subtest. */
function expandResults(results: TestResult[]): TestResult[] {
  const out: TestResult[] = [];
  for (const r of results) {
    if (r.testId !== 'tap') { out.push(r); continue; }
    for (const def of TAP_SUBTEST_DEFS) {
      const filteredPRs: Record<string, number | string> = {};
      for (const k of def.prKeys) {
        const v = r.percentileRanks[k];
        if (v !== undefined && v !== null && v !== '' && String(v).toLowerCase() !== 'n/a') {
          filteredPRs[k] = v;
        }
      }
      if (Object.keys(filteredPRs).length === 0) continue;
      out.push({ ...r, testId: def.virtId, percentileRanks: filteredPRs });
    }
  }
  return out;
}

const PR_KEY_LABELS: Record<string, string> = {
  A: 'Teil A', B: 'Teil B',
  Dg1: 'Durchgang 1', Dg5: 'Durchgang 5', Dg6: 'Abruf (Dg6)',
  Dg7: 'Verzög. Abruf', W: 'Wiedererkennung', sumDg1_5: 'Σ Dg1–5',
  vorwaerts: 'Vorwärts', rueckwaerts: 'Rückwärts',
  lgI: 'LG I', lgII: 'LG II', wiedererk: 'Wiedererkennung (LG)',
  sofortiger_abruf: 'Sofort. Abruf', verzoegerter_abruf: 'Verzög. Abruf',
  wiedererkennen: 'Wiedererkennen',
  alterkorrigiert: 'Alterskorrigiert', alter_bildung: 'Alter + Bildung',
  cft: 'Kopieren (CFT)', cfm: 'Direkt (CFM)', cqm: 'Verzögert (CQM)',
  mosaik: 'Mosaik', zzt: 'ZZT',
  alertnessM: 'Alertness [M]', alertness23: 'Alertness 2.3',
  alertness23_ohne: 'Alertness ohne Ton', alertness23_mit: 'Alertness mit Ton',
  gonogo: 'Go/Nogo 1', gonogo2: 'Go/Nogo 2',
  flexibilitaet: 'Flexibilität', geteilte: 'Geteilte Aufm.',
  vigilanz: 'Vigilanz', arbeitsgedaechtnis: 'Arbeitsgedächtnis',
  ve_rt_krit_pr: 'Vis. Scanning RT', ve_sd_krit_pr: 'Vis. Scanning SD',
};

// raw value sources per testId: [key, label, 'raw'|'calc']
const RAW_KEY_DEFS: Record<string, { key: string; label: string; src: 'raw' | 'calc' }[]> = {
  tmt:          [{ key: 'A',              label: 'Teil A (Sek.)',       src: 'raw'  },
                 { key: 'B',              label: 'Teil B (Sek.)',       src: 'raw'  }],
  vlmt:         [{ key: 'Dg1',            label: 'Durchgang 1',         src: 'raw'  },
                 { key: 'Dg5',            label: 'Durchgang 5',         src: 'raw'  },
                 { key: 'sumDg1_5',       label: 'Σ Dg1–5',            src: 'calc' },
                 { key: 'Dg6',            label: 'Abruf (Dg6)',         src: 'raw'  },
                 { key: 'Dg7',            label: 'Verzög. Abruf (Dg7)', src: 'raw'  },
                 { key: 'W',              label: 'Wiedererkennung',      src: 'raw'  }],
  zzt:          [{ key: 'wp',             label: 'Wartezeit (s)',        src: 'calc' }],
  zahlenspanne: [{ key: 'vorwaerts',      label: 'Vorwärts',            src: 'raw'  },
                 { key: 'rueckwaerts',    label: 'Rückwärts',           src: 'raw'  }],
  lg:           [{ key: 'lgI',            label: 'LG I',                src: 'raw'  },
                 { key: 'lgII',           label: 'LG II',               src: 'raw'  },
                 { key: 'wiedererk',      label: 'Wiedererkennung',      src: 'raw'  }],
  mosaik:       [{ key: 'rohwert',        label: 'Rohwert',             src: 'raw'  },
                 { key: 'awp',            label: 'AWP',                 src: 'calc' }],
  tol:          [{ key: 'rohwert',        label: 'Rohwert',             src: 'raw'  }],
  rey:          [{ key: 'cft',            label: 'Kopieren (CFT)',       src: 'raw'  },
                 { key: 'cfm',            label: 'Direkt (CFM)',         src: 'raw'  },
                 { key: 'cqm',            label: 'Verzögert (CQM)',      src: 'raw'  }],
};

// ── Statistics helpers ────────────────────────────────────────────────────────

function _mean(v: number[]): number { return v.length === 0 ? 0 : v.reduce((s, x) => s + x, 0) / v.length; }
function _sd(v: number[]): number {
  if (v.length < 2) return 0;
  const m = _mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}
function _sorted(v: number[]): number[] { return [...v].sort((a, b) => a - b); }
function _median(v: number[]): number {
  const s = _sorted(v);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
function _pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function _normCDF(z: number): number {
  const b1=0.319381530, b2=-0.356563782, b3=1.781477937, b4=-1.821255978, b5=1.330274429, p0=0.2316419;
  const t = 1 / (1 + p0 * Math.abs(z));
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}
function _tCDF(t: number, df: number): number {
  if (df <= 0) return 0.5;
  const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + (t * t) / (2 * df));
  return _normCDF(z);
}
function _lgamma(x: number): number {
  const c = [76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.001208650973866179,-0.000005395239384953];
  let y=x, tmp=x+5.5;
  tmp -= (x+0.5)*Math.log(tmp);
  let ser = 1.000000000190015;
  for (const ci of c) { y++; ser += ci/y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function _betacf(x: number, a: number, b: number): number {
  const MAXIT=100, EPS=3e-7, FPMIN=1e-30;
  const qab=a+b, qap=a+1, qam=a-1;
  let c=1, d=1-qab*x/qap;
  if (Math.abs(d)<FPMIN) d=FPMIN; d=1/d; let h=d;
  for (let m=1; m<=MAXIT; m++) {
    const m2=2*m;
    let aa=m*(b-m)*x/((qam+m2)*(a+m2));
    d=1+aa*d; if(Math.abs(d)<FPMIN)d=FPMIN; c=1+aa/c; if(Math.abs(c)<FPMIN)c=FPMIN; d=1/d; h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
    d=1+aa*d; if(Math.abs(d)<FPMIN)d=FPMIN; c=1+aa/c; if(Math.abs(c)<FPMIN)c=FPMIN;
    d=1/d; const del=d*c; h*=del;
    if(Math.abs(del-1)<EPS) break;
  }
  return h;
}
function _ibeta(x: number, a: number, b: number): number {
  if (x<=0) return 0; if (x>=1) return 1;
  const bt=Math.exp(_lgamma(a+b)-_lgamma(a)-_lgamma(b)+a*Math.log(x)+b*Math.log(1-x));
  if (x<(a+1)/(a+b+2)) return bt*_betacf(x,a,b)/a;
  return 1-bt*_betacf(1-x,b,a)/b;
}
function _fPValue(f: number, d1: number, d2: number): number {
  if (f<=0||d1<=0||d2<=0) return 1;
  return 1-_ibeta(d1*f/(d1*f+d2), d1/2, d2/2);
}
function _pearson(x: number[], y: number[]): { r: number; p: number } {
  const n=x.length; if(n<4) return {r:0,p:1};
  const mx=_mean(x), my=_mean(y);
  const num=x.reduce((s,xi,i)=>s+(xi-mx)*(y[i]-my),0);
  const dX=Math.sqrt(x.reduce((s,xi)=>s+(xi-mx)**2,0));
  const dY=Math.sqrt(y.reduce((s,yi)=>s+(yi-my)**2,0));
  const r=dX*dY===0?0:num/(dX*dY);
  const tStat=r*Math.sqrt(n-2)/Math.sqrt(1-r*r);
  return {r, p: 2*(1-_tCDF(Math.abs(tStat),n-2))};
}
function _welchT(a: number[], b: number[]): { t: number; p: number; d: number } | null {
  if (a.length<3||b.length<3) return null;
  const ma=_mean(a), mb=_mean(b), sa=_sd(a), sb=_sd(b), na=a.length, nb=b.length;
  const se=Math.sqrt(sa**2/na+sb**2/nb);
  if (se===0) return null;
  const t=(ma-mb)/se;
  const df=(sa**2/na+sb**2/nb)**2/((sa**2/na)**2/(na-1)+(sb**2/nb)**2/(nb-1));
  const p=2*(1-_tCDF(Math.abs(t),df));
  const poolSD=Math.sqrt(((na-1)*sa**2+(nb-1)*sb**2)/(na+nb-2));
  return {t, p, d: poolSD===0?0:(ma-mb)/poolSD};
}
function _twowayAnova(rows: {ageGroup:0|1|2; gender:'m'|'w'; pr:number}[]): ANOVAResult | null {
  const A=3, B=2;
  const cells: number[][][]=Array.from({length:A},()=>Array.from({length:B},()=>[]));
  for (const d of rows) { const j=d.gender==='m'?0:1; cells[d.ageGroup][j].push(d.pr); }
  const ns=cells.map(row=>row.map(c=>c.length));
  const N=ns.flat().reduce((a,b)=>a+b,0);
  if (N<12) return null;
  if (!ns.every(row=>row.every(n=>n>=1))) return null;
  const cellMeans=cells.map(row=>row.map(c=>_mean(c)));
  const allPRs=cells.flat().flat();
  const grandMean=_mean(allPRs);
  const SS_total=allPRs.reduce((s,x)=>s+(x-grandMean)**2,0);
  let SS_cells=0;
  for(let i=0;i<A;i++) for(let j=0;j<B;j++) SS_cells+=ns[i][j]*(cellMeans[i][j]-grandMean)**2;
  let SS_within=0;
  for(let i=0;i<A;i++) for(let j=0;j<B;j++) { const m=cellMeans[i][j]; for(const x of cells[i][j]) SS_within+=(x-m)**2; }
  const rowNs=ns.map(row=>row.reduce((a,b)=>a+b,0));
  const rowMeans=cells.map((row,i)=>rowNs[i]>0?row.reduce((acc,c,j)=>acc+ns[i][j]*cellMeans[i][j],0)/rowNs[i]:0);
  const colNs=[0,1].map(j=>ns.reduce((acc,row)=>acc+row[j],0));
  const colMeans=[0,1].map(j=>colNs[j]>0?cells.reduce((acc,row,i)=>acc+ns[i][j]*cellMeans[i][j],0)/colNs[j]:0);
  let SS_A=0; for(let i=0;i<A;i++) SS_A+=rowNs[i]*(rowMeans[i]-grandMean)**2;
  let SS_B=0; for(let j=0;j<B;j++) SS_B+=colNs[j]*(colMeans[j]-grandMean)**2;
  const SS_AB=Math.max(0,SS_cells-SS_A-SS_B);
  const df_A=A-1, df_B=B-1, df_AB=df_A*df_B;
  const filledCells=ns.flat().filter(n=>n>0).length;
  const df_within=N-filledCells;
  if (df_within<1) return null;
  const MS_within=SS_within/df_within;
  if (MS_within<=0) return null;
  const F_A=(SS_A/df_A)/MS_within, F_B=(SS_B/df_B)/MS_within, F_AB=(SS_AB/df_AB)/MS_within;
  return { F_A, p_A:_fPValue(F_A,df_A,df_within), eta2_A:SS_A/SS_total,
           F_B, p_B:_fPValue(F_B,df_B,df_within), eta2_B:SS_B/SS_total,
           F_AB, p_AB:_fPValue(F_AB,df_AB,df_within), eta2_AB:SS_AB/SS_total, N };
}
function ageGroup(age: number): 0|1|2 { return age<40?0:age<60?1:2; }

// ── Value parsers ─────────────────────────────────────────────────────────────

function parsePR(v: number | string): number | null {
  if (typeof v==='number') return isNaN(v)?null:v;
  const s=String(v).trim().toLowerCase();
  if (!s||s==='n/a'||s==='–') return null;
  if (s.startsWith('>')) { const n=parseFloat(s.slice(1)); return isNaN(n)?null:Math.min(n+2,100); }
  if (s.startsWith('<')) { const n=parseFloat(s.slice(1)); return isNaN(n)?null:Math.max(n-2,0); }
  const arrow=s.indexOf('->');
  if (arrow>0) {
    const a=parseFloat(s.slice(0,arrow));
    const bStr=s.slice(arrow+2);
    const b=bStr.startsWith('>')?parseFloat(bStr.slice(1))+2:parseFloat(bStr);
    return !isNaN(a)&&!isNaN(b)?(a+b)/2:null;
  }
  const di=s.indexOf('-',s.startsWith('-')?1:0);
  if (di>0) { const a=parseFloat(s.slice(0,di)), b=parseFloat(s.slice(di+1)); if(!isNaN(a)&&!isNaN(b)) return (a+b)/2; }
  const n=parseFloat(s);
  return isNaN(n)?null:n;
}

function avgPR(result: TestResult): number | null {
  const vals=Object.values(result.percentileRanks).map(parsePR).filter((v): v is number=>v!==null);
  return vals.length>0?_mean(vals):null;
}

function getRawNum(result: TestResult, key: string, src: 'raw'|'calc'): number | null {
  const obj=src==='raw'?result.rawValues:result.calculatedValues;
  const val=(obj as Record<string,unknown>)[key];
  if (val===null||val===undefined||val==='') return null;
  const n=parseFloat(String(val));
  return isNaN(n)?null:n;
}

function autoHistogram(vals: number[], nBins=8): { label: string; n: number }[] {
  if (vals.length===0) return [];
  const lo=Math.min(...vals), hi=Math.max(...vals);
  if (lo===hi) return [{label:lo.toFixed(1),n:vals.length}];
  const step=(hi-lo)/nBins;
  return Array.from({length:nBins},(_,i)=>{
    const binLo=lo+i*step, binHi=binLo+step;
    const count=vals.filter(v=>i===nBins-1?v>=binLo&&v<=binHi:v>=binLo&&v<binHi).length;
    return {label:`${binLo.toFixed(1)}–${binHi.toFixed(1)}`,n:count};
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function monthKey(dateStr: string): string { return dateStr.slice(0,7); }
function monthLabel(key: string): string { const [y,m]=key.split('-'); return `${m}/${y.slice(2)}`; }
function last12Months(): string[] {
  const keys: string[]=[];
  const d=new Date();
  for (let i=11;i>=0;i--) {
    const m=new Date(d.getFullYear(),d.getMonth()-i,1);
    keys.push(`${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`);
  }
  return keys;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(n: number, dec=1): string { return n.toFixed(dec); }
function fmtP(p: number): string {
  if (p<0.001) return '< .001';
  if (p<0.01)  return '< .01';
  if (p<0.05)  return '< .05';
  return `= ${p.toFixed(2)}`;
}

// ── Classification thresholds (±1 SD of normal distribution) ─────────────────
const PR_BELOW  = 15.87;
const PR_ABOVE  = 84.13;

function classifyPR(pr: number): 'below'|'average'|'above' {
  if (pr < PR_BELOW) return 'below';
  if (pr > PR_ABOVE) return 'above';
  return 'average';
}

// ── PDF export ────────────────────────────────────────────────────────────────

function exportPDF(
  testStats:        TestStats[],
  classBreakdown:   ClassBreakdown[],
  subtestStats:     SubtestStat[],
  longitudinal:     LongitudinalStat[],
  diagMeanPR:       DiagMeanPR[],
  lokMeanPR:        LokMeanPR[],
  prHistograms:     { testId: string; label: string; buckets: { label: string; n: number }[] }[],
  rawHistograms:    RawHistogram[],
  totalPatients:    number,
  totalTests:       number,
  globalMeanPR:     number,
  patsWithImpairment: number,
  patientsPerMonth: { month: string; n: number }[],
  testsPerMonth:    { month: string; n: number }[],
  diagnoseBreakdown: { label: string; n: number }[],
  exportDate: string,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const IND = [79, 70, 229] as [number, number, number];
  const VIO = [109, 40, 217] as [number, number, number];
  const ROS = [225, 29, 72]  as [number, number, number];
  let y = 18;

  const addPage = () => { doc.addPage(); y = 18; };
  const needY = (h: number) => { if (y + h > 275) addPage(); };
  const heading = (text: string, sub?: string) => {
    needY(12);
    doc.setFontSize(12); doc.setFont('helvetica','bold');
    doc.text(text, 14, y); y += 5;
    if (sub) { doc.setFontSize(7); doc.setFont('helvetica','italic'); doc.text(sub,14,y); y+=4; }
  };
  const tbl = (head: string[][], body: (string|number)[][], colW?: number[], opts?: Record<string,unknown>) => {
    autoTable(doc, {
      startY: y, head, body,
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: IND, fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248,250,252] },
      margin: { left: 14, right: 14 },
      ...(colW ? { columnStyles: Object.fromEntries(colW.map((w,i)=>[i,{cellWidth:w}])) } : {}),
      ...(opts ?? {}),
    });
    y = (doc as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable.finalY + 6;
  };

  // ── Cover ──────────────────────────────────────────────────────────────────
  doc.setFillColor(...IND); doc.rect(0,0,210,40,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('Leistungsprofil', 14, 16);
  doc.setFontSize(11); doc.setFont('helvetica','normal');
  doc.text('Statistische Auswertung — Klinische Neuropsychologie', 14, 24);
  doc.setFontSize(8);
  doc.text(`Erstellt am ${exportDate}  ·  N = ${totalPatients} Patienten  ·  ${totalTests} Testergebnisse`, 14, 32);
  doc.setTextColor(0,0,0);
  y = 50;

  // ── Überblick ──────────────────────────────────────────────────────────────
  heading('Überblick');
  tbl([['Kennzahl','Wert']],[
    ['Patienten gesamt', String(totalPatients)],
    ['Testergebnisse gesamt', String(totalTests)],
    ['Tests pro Patient (Ø)', totalPatients>0?fmt(totalTests/totalPatients):'-'],
    ['Mittlerer Prozentrang (alle Tests, Ø)', fmt(globalMeanPR,1)],
    ['Patienten mit min. 1 PR < 16 (klinisch auffällig)', String(patsWithImpairment)],
    ['Anteil klinisch auffällig', totalPatients>0?fmt(patsWithImpairment/totalPatients*100,1)+'%':'-'],
  ],[60,60]);

  // ── Aufnahmen & Tests pro Monat ────────────────────────────────────────────
  needY(10); heading('Aufnahmen & Tests pro Monat (letzte 12 Monate)');
  tbl(
    [['Monat','Aufnahmen','Tests']],
    patientsPerMonth.map(r=>[monthLabel(r.month),String(r.n),String(testsPerMonth.find(t=>t.month===r.month)?.n??0)]),
    [40,50,50],
  );

  // ── Diagnoseverteilung ─────────────────────────────────────────────────────
  if (diagnoseBreakdown.length > 0) {
    needY(10); heading('Diagnoseverteilung');
    tbl([['Diagnose','N','%']],diagnoseBreakdown.map(d=>[d.label,String(d.n),
      totalPatients>0?fmt(d.n/totalPatients*100,1)+'%':'-']),[100,25,35]);
  }

  // ── Leistungsklassen-Verteilung ────────────────────────────────────────────
  needY(10);
  heading('Leistungsklassen-Verteilung pro Test',
    'Klassifikation: PR < 15,87 = unterdurchschnittlich · 15,87–84,13 = durchschnittlich · > 84,13 = überdurchschnittlich (±1 SD)');
  tbl(
    [['Test','N','Unterdurchschnittl. N (%)','Durchschnittlich N (%)','Überdurchschnittl. N (%)']],
    classBreakdown.map(c=>[
      c.label, String(c.n),
      `${c.below} (${fmt(c.belowPct,1)}%)`,
      `${c.average} (${fmt(c.avgPct,1)}%)`,
      `${c.above} (${fmt(c.abovePct,1)}%)`,
    ]),
    [45,15,52,52,52],
  );

  // ── Deskriptive Statistik (mit Quartilen) ──────────────────────────────────
  needY(10);
  heading('Deskriptive Statistik – Mittlerer PR pro Test (neueste Messung)',
    'N durchgef. = Test absolviert · N PR = Patienten mit berechenbarem PR');
  tbl(
    [['Test','N durchgef.','N PR','M','SD','Mdn','Q25','Q75','Min','Max']],
    testStats.map(s=>[s.label,String(s.nPerformed),s.n>0?String(s.n):'–',s.n>0?fmt(s.mean):'–',s.n>0?fmt(s.sd):'–',s.n>0?fmt(s.median):'–',s.n>0?fmt(s.q25):'–',s.n>0?fmt(s.q75):'–',s.n>0?fmt(s.min):'–',s.n>0?fmt(s.max):'–']),
    [38,18,14,14,14,14,14,14,14,14],
  );

  // ── Subtest-PR-Statistik ───────────────────────────────────────────────────
  if (subtestStats.length > 0) {
    addPage();
    heading('Subtest-PR-Statistik – Deskriptive Kennwerte pro PR-Skala');
    tbl(
      [['Test','Subtest','N','M','SD','Mdn','Min','Max']],
      subtestStats.map(s=>[s.testLabel,s.keyLabel,String(s.n),fmt(s.mean),fmt(s.sd),fmt(s.median),fmt(s.min),fmt(s.max)]),
      [40,45,12,16,16,16,16,16],
    );
  }

  // ── Inferenzstatistik ──────────────────────────────────────────────────────
  needY(10);
  heading('Inferenzstatistik – Alterskorrelation & Geschlechtsunterschied',
    'Alterskorrelation: Pearson r · Geschlecht: Welch-t-Test (m vs. w) + Cohen\'s d');
  const infRows=testStats.filter(s=>s.ageCorr||s.genderT).map(s=>[
    s.label,
    s.ageCorr?`r = ${fmt(s.ageCorr.r,2)}, p ${fmtP(s.ageCorr.p)}`:'–',
    s.genderT?`t = ${fmt(s.genderT.t,2)}, p ${fmtP(s.genderT.p)}, d = ${fmt(s.genderT.d,2)} (n♂=${s.genderT.nM}, n♀=${s.genderT.nW})`:'–',
  ]);
  tbl([['Test','Alter × PR','Geschlecht × PR']],infRows,[40,60,80]);

  // ── Zweifaktorielle ANOVA ──────────────────────────────────────────────────
  const anovaStats=testStats.filter(s=>s.anova);
  if (anovaStats.length>0) {
    needY(10);
    heading('Zweifaktorielle ANOVA – Altersgruppe × Geschlecht',
      'Faktoren: A = Altersgruppe (<40 / 40–59 / ≥60), B = Geschlecht (m vs. w). Type I SS. N ≥ 12 und alle 6 Zellen besetzt.');
    tbl(
      [['Test','N','F(A)','p(A)','η²(A)','F(B)','p(B)','η²(B)','F(A×B)','p(A×B)','η²(A×B)']],
      anovaStats.map(s=>{ const a=s.anova!; return [
        s.label,String(a.N),fmt(a.F_A,2),fmtP(a.p_A),fmt(a.eta2_A,3),
        fmt(a.F_B,2),fmtP(a.p_B),fmt(a.eta2_B,3),
        fmt(a.F_AB,2),fmtP(a.p_AB),fmt(a.eta2_AB,3),
      ]; }),
      [32,12,16,18,17,16,18,17,18,18,17],
    );
  }

  // ── Längsschnittanalyse ────────────────────────────────────────────────────
  if (longitudinal.length > 0) {
    addPage();
    heading('Längsschnittanalyse – PR-Veränderung über Messwiederholungen',
      'Verbesserung: ΔPR > 5 · Verschlechterung: ΔPR < –5 · Stabil: |ΔPR| ≤ 5. Vergleich: erste vs. letzte Messung.');
    tbl(
      [['Test','N Patienten','Ø ΔPR','SD ΔPR','Verbessert','Stabil','Verschlechtert']],
      longitudinal.map(l=>[
        l.label, String(l.n),
        (l.meanChange>=0?'+':'')+fmt(l.meanChange,1), fmt(l.sdChange,1),
        `${l.improved} (${fmt(l.n>0?l.improved/l.n*100:0,0)}%)`,
        `${l.stable}   (${fmt(l.n>0?l.stable/l.n*100:0,0)}%)`,
        `${l.declined} (${fmt(l.n>0?l.declined/l.n*100:0,0)}%)`,
      ]),
      [40,22,20,20,30,30,34],
    );
  }

  // ── Diagnose × mittlerer PR ────────────────────────────────────────────────
  if (diagMeanPR.length > 0) {
    needY(10);
    heading('Diagnose-stratifizierter mittlerer PR',
      'Mittlerer PR (Ø über alle Tests, neueste Messung) pro Diagnosegruppe. Nur Gruppen mit N ≥ 3.');
    tbl(
      [['Diagnose','N','Ø PR','SD']],
      diagMeanPR.map(d=>[d.diag,String(d.n),fmt(d.mean,1),fmt(d.sd,1)]),
      [90,20,30,30],
    );
  }

  // ── Lokalisation × mittlerer PR ───────────────────────────────────────────
  if (lokMeanPR.length > 0) {
    needY(10);
    heading('Lokalisation-stratifizierter mittlerer PR',
      'Mittlerer PR (Ø über alle Tests) pro Läsionslokalisation. N ≥ 2.');
    tbl(
      [['Lokalisation','N','Ø PR','SD']],
      lokMeanPR.map(l=>[l.lok,String(l.n),fmt(l.mean,1),fmt(l.sd,1)]),
      [90,20,30,30],
    );
  }

  // ── PR-Häufigkeitsverteilungen (alle Tests) ────────────────────────────────
  addPage();
  heading('PR-Häufigkeitsverteilungen – alle Tests (10 Klassen à 10 PR-Punkte)');

  const PR_BUCKETS=['0–9','10–19','20–29','30–39','40–49','50–59','60–69','70–79','80–89','90–100'];
  for (const h of prHistograms) {
    needY(10);
    doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(h.label, 14, y); y += 4;
    tbl(
      [PR_BUCKETS],
      [h.buckets.map(b=>String(b.n))],
    );
    y -= 2;
  }

  // ── Rohwert-Häufigkeitsverteilungen ───────────────────────────────────────
  if (rawHistograms.length > 0) {
    addPage();
    heading('Rohwert-Häufigkeitsverteilungen – wichtige Kennwerte pro Test');
    for (const h of rawHistograms) {
      needY(14);
      doc.setFontSize(8.5); doc.setFont('helvetica','bold');
      doc.text(`${h.testLabel} – ${h.keyLabel}  (N=${h.n}, M=${fmt(h.mean,1)}, SD=${fmt(h.sd,1)})`, 14, y); y+=4;
      const labels=h.buckets.map(b=>b.label);
      const counts=h.buckets.map(b=>String(b.n));
      const colW=Math.min(24,(210-28)/labels.length);
      tbl([labels],[counts],labels.map(()=>colW));
      y -= 2;
    }
  }

  doc.save(`leistungsprofil_auswertung_${exportDate.replace(/\./g,'-')}.pdf`);
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const Section: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({ label, value, sub, color='indigo' }) => (
  <div className={cn('rounded-2xl px-5 py-4 flex flex-col gap-1',
    color==='rose'   ? 'bg-rose-50 dark:bg-rose-950/30'   : color==='emerald' ? 'bg-emerald-50 dark:bg-emerald-950/30'
    : color==='amber'? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-indigo-50 dark:bg-indigo-950/30')}>
    <span className={cn('text-[10px] font-black uppercase tracking-widest',
      color==='rose'?'text-rose-400':color==='emerald'?'text-emerald-500':color==='amber'?'text-amber-500':'text-indigo-400')}>
      {label}
    </span>
    <span className={cn('text-3xl font-black',
      color==='rose'?'text-rose-700 dark:text-rose-300':color==='emerald'?'text-emerald-700 dark:text-emerald-300':color==='amber'?'text-amber-700 dark:text-amber-300':'text-indigo-700 dark:text-indigo-300')}>
      {value}
    </span>
    {sub && <span className={cn('text-[11px]',color==='rose'?'text-rose-400':color==='emerald'?'text-emerald-400':color==='amber'?'text-amber-500':'text-indigo-400')}>{sub}</span>}
  </div>
);

const PBadge: React.FC<{ p: number }> = ({ p }) => (
  <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black',
    p<0.05?'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
          :'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400')}>
    {p<0.001?'p < .001':p<0.01?'p < .01':p<0.05?'p < .05':`p = ${p.toFixed(2)}`}
  </span>
);

const SectionHead: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <div className="mb-3">
    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</p>
    {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-0.5">{sub}</p>}
  </div>
);

// ── Filter state ──────────────────────────────────────────────────────────────

interface Filters {
  diagnose: string; lokalisation: string; geschlecht: string;
  ageMin: string; ageMax: string; dateFrom: string; dateTo: string;
}
const defaultFilters: Filters = { diagnose:'', lokalisation:'', geschlecht:'', ageMin:'', ageMax:'', dateFrom:'', dateTo:'' };

function applyFilters(rows: AnalyticsRow[], f: Filters): AnalyticsRow[] {
  return rows
    .filter(r=>{
      if (f.diagnose && r.patient.diagnose!==f.diagnose) return false;
      if (f.lokalisation && !(r.patient.lokalisation??'').includes(f.lokalisation)) return false;
      if (f.geschlecht && r.patient.geschlecht!==f.geschlecht) return false;
      const age=r.patient.age;
      if (f.ageMin && age<parseInt(f.ageMin,10)) return false;
      if (f.ageMax && age>parseInt(f.ageMax,10)) return false;
      return true;
    })
    .map(r=>{
      if (!f.dateFrom&&!f.dateTo) return r;
      const results=r.results.filter(res=>{
        if (f.dateFrom&&res.date<f.dateFrom) return false;
        if (f.dateTo&&res.date>f.dateTo) return false;
        return true;
      });
      return {...r, results};
    })
    .filter(r=>(!f.dateFrom&&!f.dateTo)||r.results.length>0);
}

// ── Main component ────────────────────────────────────────────────────────────

export const AnalyticsSection: React.FC = () => {
  const { encryptionKey } = useAuth();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [data, setData] = useState<AnalyticsRow[] | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    if (!encryptionKey) { setError('Kein Verschlüsselungsschlüssel – bitte neu anmelden.'); return; }
    setLoading(true); setError(''); setData(null); setProgress(null);
    try {
      const patients = await fetchPatients(encryptionKey);
      setProgress({ done: 0, total: patients.length });
      const rows: AnalyticsRow[] = [];
      const BATCH = 8;
      for (let i = 0; i < patients.length; i += BATCH) {
        const batch = patients.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(p => fetchPatient(p.id, encryptionKey)));
        for (const r of results) if (r) rows.push({ patient: r.patient, results: r.results });
        setProgress({ done: Math.min(i + BATCH, patients.length), total: patients.length });
      }
      setData(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false); setProgress(null);
    }
  }, [encryptionKey]);

  const filteredData = useMemo(() => data ? applyFilters(data, filters) : null, [data, filters]);

  const allDiagnosen = useMemo(() => data ? Array.from(new Set(data.map(r=>r.patient.diagnose).filter((d): d is string=>!!d))).sort() : [], [data]);
  const allLokalisationen = useMemo(() => {
    if (!data) return [];
    const parts = data.flatMap(r=>(r.patient.lokalisation??'').split(' · ').map(s=>s.trim()).filter(Boolean));
    return Array.from(new Set(parts)).sort();
  }, [data]);

  // ── Derived analytics ─────────────────────────────────────────────────────

  const analytics = useMemo(() => {
    const d = filteredData;
    if (!d) return null;

    const totalPatients = d.length;
    // Raw results (TAP = 1 entry per session)
    const allResultsRaw = d.flatMap(r => r.results);
    // Expanded results: TAP split into per-subtest virtual entries
    const allResults = expandResults(allResultsRaw);
    // totalTests counts expanded entries (each TAP subtest = 1 test, VLMT whole session = 1)
    const totalTests = allResults.length;

    // Pre-compute which (expanded) testIds each patient performed
    const patientTestIds = new Map<string, Set<string>>();
    for (const row of d) {
      patientTestIds.set(row.patient.id, new Set(expandResults(row.results).map(r => r.testId)));
    }

    const testCounts: Record<string,number> = {};
    for (const r of allResults) testCounts[r.testId] = (testCounts[r.testId]??0)+1;
    const mostUsed = Object.entries(testCounts).sort((a,b)=>b[1]-a[1])[0];

    const months = last12Months();
    const patientsPerMonth = months.map(m=>({ month:m, n:d.filter(r=>r.patient.aufnahmedatum?.startsWith(m)).length }));
    // testsPerMonth uses expanded results
    const testsPerMonth = months.map(m=>({ month:m, n:allResults.filter(r=>r.date.startsWith(m)).length }));

    const testFreq = Object.entries(testCounts)
      .map(([id,n])=>({ id, label: TEST_LABELS[id]??id, n }))
      .sort((a,b)=>b.n-a.n);

    // Diagnosis breakdown
    const diagnoseCounts: Record<string,number> = {};
    for (const r of d) { const k=r.patient.diagnose??'(keine Angabe)'; diagnoseCounts[k]=(diagnoseCounts[k]??0)+1; }
    const diagnoseBreakdown = Object.entries(diagnoseCounts).map(([label,n])=>({label,n})).sort((a,b)=>b.n-a.n);

    // ── Per-test stats ────────────────────────────────────────────────────────
    const testIds: string[] = Array.from(new Set(allResults.map(r => r.testId)));

    const testStats: TestStats[] = testIds.map(testId => {
      // nPerformed: patients who performed this test (expanded view)
      const nPerformed = d.filter(row => patientTestIds.get(row.patient.id)?.has(testId) ?? false).length;
      if (nPerformed === 0) return null;

      // For PR-based stats: use the latest result per patient that has a valid avgPR
      const rows = d.map(row => {
        const res = row.results
          .flatMap(r => (r.testId === 'tap' && testId.startsWith('tap_'))
            ? expandResults([r]).filter(e => e.testId === testId)
            : r.testId === testId ? [r] : [])
          .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latestPR = res.length > 0 ? avgPR(res[0]) : null;
        return latestPR !== null
          ? { age: row.patient.age, geschlecht: row.patient.geschlecht, pr: latestPR }
          : null;
      }).filter((r): r is {age:number;geschlecht:string;pr:number} => r !== null);

      const prs = rows.map(r => r.pr);
      const hasPRs = prs.length > 0;
      const s = hasPRs ? _sorted(prs) : [];

      const ageCorr = rows.length >= 4 ? _pearson(rows.map(r=>r.age), prs) : null;
      const mPRs = rows.filter(r=>r.geschlecht==='m').map(r=>r.pr);
      const wPRs = rows.filter(r=>r.geschlecht==='w').map(r=>r.pr);
      const welchResult = _welchT(mPRs, wPRs);
      const genderT = welchResult ? {...welchResult, nM:mPRs.length, nW:wPRs.length} : null;
      const anovaInput = rows.filter(r=>r.geschlecht==='m'||r.geschlecht==='w').map(r=>({ageGroup:ageGroup(r.age),gender:r.geschlecht as 'm'|'w',pr:r.pr}));
      const anova = _twowayAnova(anovaInput);

      return {
        testId, label: TEST_LABELS[testId] ?? testId,
        nPerformed, n: prs.length,
        mean: hasPRs ? _mean(prs) : 0, sd: hasPRs ? _sd(prs) : 0,
        median: hasPRs ? _median(prs) : 0,
        q25: hasPRs ? _pct(s, 25) : 0, q75: hasPRs ? _pct(s, 75) : 0,
        min: hasPRs ? Math.min(...prs) : 0, max: hasPRs ? Math.max(...prs) : 0,
        ageCorr, genderT, anova,
      };
    }).filter((s): s is TestStats => s !== null).sort((a,b) => b.nPerformed - a.nPerformed);

    // Helper: get all PR values for a testId from expanded results
    const expandedValsForTest = (testId: string): number[] =>
      allResults.filter(r => r.testId === testId).map(r => avgPR(r)).filter((v): v is number => v !== null);

    // ── PR histograms – ALL tests (only those with ≥1 PR value) ──────────────
    const PR_BUCKETS = ['0–9','10–19','20–29','30–39','40–49','50–59','60–69','70–79','80–89','90–100'];
    const prHistograms = testStats
      .filter(s => s.n > 0)
      .map(s => {
        const vals = expandedValsForTest(s.testId);
        const buckets = PR_BUCKETS.map((label, i) => {
          const lo = i * 10, hi = i === 9 ? 100 : lo + 10;
          return { label, n: vals.filter(v => v >= lo && v < (i === 9 ? hi + 1 : hi)).length };
        });
        return { testId: s.testId, label: s.label, buckets };
      });

    // ── Classification breakdown (PR < 15.87 / 15.87–84.13 / > 84.13) ────────
    const classBreakdown: ClassBreakdown[] = testStats
      .filter(s => s.n > 0)
      .map(s => {
        const vals = expandedValsForTest(s.testId);
        const below   = vals.filter(v => v < PR_BELOW).length;
        const above   = vals.filter(v => v > PR_ABOVE).length;
        const average = vals.length - below - above;
        const n = vals.length;
        return { testId: s.testId, label: s.label, n, below, average, above,
          belowPct: n ? below/n*100 : 0, avgPct: n ? average/n*100 : 0, abovePct: n ? above/n*100 : 0 };
      });

    // ── Subtest-PR-Statistik (per individual PR key, from expanded results) ────
    const subtestStats: SubtestStat[] = [];
    for (const testId of testIds) {
      const keyData: Record<string, number[]> = {};
      // Use expanded allResults for this testId (already handles TAP splitting)
      for (const r of allResults.filter(res => res.testId === testId)) {
        for (const [k, v] of Object.entries(r.percentileRanks) as [string, number | string][]) {
          const n = parsePR(v);
          if (n === null) continue;
          if (!keyData[k]) keyData[k] = [];
          keyData[k].push(n);
        }
      }
      const testLabel = TEST_LABELS[testId] ?? testId;
      for (const [key, vals] of Object.entries(keyData)) {
        if (vals.length < 2) continue;
        const s = _sorted(vals);
        subtestStats.push({
          testId, testLabel, key,
          keyLabel: PR_KEY_LABELS[key] ?? key,
          n: vals.length, mean: _mean(vals), sd: _sd(vals), median: _median(vals),
          min: Math.min(...vals), max: Math.max(...vals),
        });
      }
    }
    subtestStats.sort((a, b) => {
      const ai = testStats.findIndex(t => t.testId === a.testId);
      const bi = testStats.findIndex(t => t.testId === b.testId);
      if (ai !== bi) return ai - bi;
      return b.n - a.n;
    });

    // ── Raw score histograms (use raw results, not expanded) ─────────────────
    const rawHistograms: RawHistogram[] = [];
    for (const [testId, defs] of Object.entries(RAW_KEY_DEFS)) {
      for (const def of defs) {
        // Use all results (not just latest per patient) for distribution richness
        const vals: number[] = allResultsRaw
          .filter(r => r.testId === testId)
          .map(r => getRawNum(r, def.key, def.src))
          .filter((v): v is number => v !== null);
        if (vals.length < 3) continue;
        rawHistograms.push({
          testId, testLabel: TEST_LABELS[testId] ?? testId,
          key: def.key, keyLabel: def.label,
          n: vals.length, mean: _mean(vals), sd: _sd(vals),
          buckets: autoHistogram(vals, 8),
        });
      }
    }

    // ── Längsschnittanalyse ───────────────────────────────────────────────────
    const longitudinal: LongitudinalStat[] = testIds.map(testId => {
      const changes: number[] = [];
      let improved=0, declined=0, stable=0;
      for (const row of d) {
        // Use expandResults so virtual TAP IDs (tap_alertness etc.) are resolved correctly
        const sorted = expandResults(row.results)
          .filter(r => r.testId === testId)
          .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (sorted.length < 2) continue;
        const first = avgPR(sorted[0]);
        const last  = avgPR(sorted[sorted.length-1]);
        if (first===null||last===null) continue;
        const delta = last-first;
        changes.push(delta);
        if (delta>5) improved++; else if (delta<-5) declined++; else stable++;
      }
      if (changes.length===0) return null;
      return {
        testId, label: TEST_LABELS[testId]??testId,
        n:changes.length, meanChange:_mean(changes), sdChange:_sd(changes),
        improved, declined, stable,
      };
    }).filter((x): x is LongitudinalStat => x!==null && x.n>0).sort((a,b)=>b.n-a.n);

    const longitudinalPatients = new Set(
      d.filter(row => testIds.some(tid => expandResults(row.results).filter(r=>r.testId===tid).length>=2)).map(r=>r.patient.id)
    ).size;

    // ── Diagnose × mittlerer PR ───────────────────────────────────────────────
    const diagPRMap: Record<string,number[]> = {};
    for (const row of d) {
      const key = row.patient.diagnose??'(keine Angabe)';
      const prVals = row.results.map(r=>avgPR(r)).filter((v): v is number=>v!==null);
      if (prVals.length===0) continue;
      if (!diagPRMap[key]) diagPRMap[key]=[];
      diagPRMap[key].push(_mean(prVals));
    }
    const diagMeanPR: DiagMeanPR[] = Object.entries(diagPRMap)
      .map(([diag,vals])=>({ diag, n:vals.length, mean:_mean(vals), sd:_sd(vals) }))
      .filter(x=>x.n>=3).sort((a,b)=>b.n-a.n);

    // ── Lokalisation × mittlerer PR ───────────────────────────────────────────
    const lokPRMap: Record<string,number[]> = {};
    for (const row of d) {
      const loks = (row.patient.lokalisation??'').split(' · ').map(s=>s.trim()).filter(Boolean);
      const prVals = row.results.map(r=>avgPR(r)).filter((v): v is number=>v!==null);
      if (prVals.length===0||loks.length===0) continue;
      const mean = _mean(prVals);
      for (const lok of loks) { if (!lokPRMap[lok]) lokPRMap[lok]=[]; lokPRMap[lok].push(mean); }
    }
    const lokMeanPR: LokMeanPR[] = Object.entries(lokPRMap)
      .map(([lok,vals])=>({ lok, n:vals.length, mean:_mean(vals), sd:_sd(vals) }))
      .filter(x=>x.n>=2).sort((a,b)=>b.n-a.n);

    // ── Global metrics ────────────────────────────────────────────────────────
    const globalPRVals = d.flatMap(row=>row.results.map(r=>avgPR(r)).filter((v): v is number=>v!==null));
    const globalMeanPR = globalPRVals.length>0 ? _mean(globalPRVals) : 0;

    const patientsWithImpairment = d.filter(row =>
      row.results.some(r => {
        const pr = avgPR(r);
        return pr!==null && pr < PR_BELOW;
      })
    ).length;

    return {
      totalPatients, totalTests, mostUsed, globalMeanPR, patientsWithImpairment, longitudinalPatients,
      patientsPerMonth, testsPerMonth, testFreq,
      testStats, prHistograms, classBreakdown, subtestStats, rawHistograms,
      longitudinal, diagMeanPR, lokMeanPR, diagnoseBreakdown,
    };
  }, [filteredData]);

  const activeFilterCount = Object.values(filters).filter(v=>v!=='').length;
  const exportDate = new Date().toLocaleDateString('de-DE');

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Section>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <BarChart2 size={15} className="text-slate-400 dark:text-slate-500" />
          <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em]">Statistische Auswertung</span>
          <span className="text-[9px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md uppercase tracking-wider">Admin</span>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <button
              onClick={() => setShowFilters(v=>!v)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all',
                activeFilterCount>0?'bg-violet-600 hover:bg-violet-700 text-white'
                  :'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400')}
            >
              <SlidersHorizontal size={12} />
              Filter{activeFilterCount>0?` (${activeFilterCount})`:''}
            </button>
          )}
          {analytics && (
            <button
              onClick={() => exportPDF(
                analytics.testStats, analytics.classBreakdown, analytics.subtestStats,
                analytics.longitudinal, analytics.diagMeanPR, analytics.lokMeanPR,
                analytics.prHistograms, analytics.rawHistograms,
                analytics.totalPatients, analytics.totalTests,
                analytics.globalMeanPR, analytics.patientsWithImpairment,
                analytics.patientsPerMonth, analytics.testsPerMonth,
                analytics.diagnoseBreakdown, exportDate,
              )}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-md shadow-indigo-200 dark:shadow-none"
            >
              <Download size={12} /> PDF Export
            </button>
          )}
          <button
            onClick={loadData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 text-xs font-black transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {data ? 'Neu laden' : 'Auswertung starten'}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && data && (
        <div className="mx-6 mb-4 p-4 bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 rounded-2xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {([
              { label:'Diagnose', key:'diagnose', opts:allDiagnosen },
              { label:'Lokalisation', key:'lokalisation', opts:allLokalisationen },
            ] as const).map(({ label, key, opts }) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">{label}</label>
                <select value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/30">
                  <option value="">Alle</option>
                  {opts.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Geschlecht</label>
              <select value={filters.geschlecht} onChange={e=>setFilters(f=>({...f,geschlecht:e.target.value}))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none">
                <option value="">Alle</option>
                <option value="m">Männlich</option>
                <option value="w">Weiblich</option>
                <option value="d">Divers</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Altersbereich</label>
              <div className="flex items-center gap-1">
                <input type="number" placeholder="Min" value={filters.ageMin} onChange={e=>setFilters(f=>({...f,ageMin:e.target.value}))}
                  className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none" min={0} max={120}/>
                <span className="text-xs text-slate-400">–</span>
                <input type="number" placeholder="Max" value={filters.ageMax} onChange={e=>setFilters(f=>({...f,ageMax:e.target.value}))}
                  className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none" min={0} max={120}/>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Testdatum ab</label>
              <input type="date" value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"/>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Testdatum bis</label>
              <input type="date" value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"/>
            </div>
            <div className="flex items-end">
              <button onClick={()=>setFilters(defaultFilters)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-black text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors">
                Filter zurücksetzen
              </button>
            </div>
          </div>
          {activeFilterCount>0 && (
            <p className="mt-2 text-[10px] text-violet-500 dark:text-violet-400 font-semibold">
              Zeige {analytics?.totalPatients??0} von {data.length} Patienten
            </p>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 dark:border-slate-700 px-6 py-5 space-y-10">
        {!loading && !data && !error && (
          <div className="flex flex-col items-center gap-3 py-10 text-slate-400 dark:text-slate-500">
            <TrendingUp size={32} className="opacity-30" />
            <p className="text-sm font-bold">Auswertung noch nicht gestartet</p>
            <p className="text-xs">Klicke auf „Auswertung starten", um alle Patientendaten zu laden und auszuwerten.</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 size={28} className="animate-spin text-indigo-400" />
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
              {progress?`Lade Patientendaten… ${progress.done}/${progress.total}`:'Initialisiere…'}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-2xl px-5 py-4 text-sm text-red-600 dark:text-red-400 font-semibold">{error}</div>
        )}

        {analytics && !loading && (
          <>
            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Patienten" value={analytics.totalPatients} />
              <StatCard label="Testergebnisse" value={analytics.totalTests} />
              <StatCard label="Tests/Patient Ø" value={analytics.totalPatients>0?fmt(analytics.totalTests/analytics.totalPatients):'-'} />
              <StatCard label="Mittlerer PR" value={fmt(analytics.globalMeanPR,1)} sub="Ø über alle Tests" color="emerald"/>
              <StatCard label="Klinisch auffällig" value={analytics.patientsWithImpairment}
                sub={`min. 1 PR < 16 (${analytics.totalPatients>0?fmt(analytics.patientsWithImpairment/analytics.totalPatients*100,0):'–'}%)`} color="rose"/>
              <StatCard label="Mit Verlaufsmessung" value={analytics.longitudinalPatients}
                sub="≥ 2 Messungen in min. 1 Test" color="amber"/>
            </div>

            {/* ── Leistungsklassen-Verteilung ── */}
            {analytics.classBreakdown.length > 0 && (
              <div>
                <SectionHead
                  title="Leistungsklassen-Verteilung pro Test"
                  sub="PR < 15,87 = unterdurchschnittlich (rot) · 15,87–84,13 = durchschnittlich (grau) · > 84,13 = überdurchschnittlich (grün)"
                />
                <div className="space-y-2.5">
                  {analytics.classBreakdown.map(c => (
                    <div key={c.testId}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-40 shrink-0">{c.label}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">N={c.n}</span>
                        <div className="flex-1 flex h-5 rounded-lg overflow-hidden">
                          {c.belowPct > 0 && (
                            <div className="flex items-center justify-center text-[9px] font-black text-white bg-rose-500"
                              style={{ width: `${c.belowPct}%` }}>
                              {c.belowPct>=8?`${fmt(c.belowPct,0)}%`:''}
                            </div>
                          )}
                          {c.avgPct > 0 && (
                            <div className="flex items-center justify-center text-[9px] font-black text-slate-500 dark:text-slate-300 bg-slate-200 dark:bg-slate-600"
                              style={{ width: `${c.avgPct}%` }}>
                              {c.avgPct>=8?`${fmt(c.avgPct,0)}%`:''}
                            </div>
                          )}
                          {c.abovePct > 0 && (
                            <div className="flex items-center justify-center text-[9px] font-black text-white bg-emerald-500"
                              style={{ width: `${c.abovePct}%` }}>
                              {c.abovePct>=8?`${fmt(c.abovePct,0)}%`:''}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-3 text-[10px] shrink-0">
                          <span className="text-rose-500 font-black">{c.below}↓</span>
                          <span className="text-slate-400 font-black">{c.average}–</span>
                          <span className="text-emerald-500 font-black">{c.above}↑</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Diagnose-Verteilung ── */}
            {analytics.diagnoseBreakdown.length > 0 && (
              <div>
                <SectionHead title="Diagnoseverteilung" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={Math.max(180, analytics.diagnoseBreakdown.slice(0,10).length*22)}>
                    <BarChart data={analytics.diagnoseBreakdown.slice(0,10)} layout="vertical" margin={{top:0,right:20,left:4,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                      <XAxis type="number" tick={{fontSize:10}}/>
                      <YAxis type="category" dataKey="label" tick={{fontSize:9}} width={130}/>
                      <Tooltip contentStyle={{fontSize:11,borderRadius:10}}/>
                      <Bar dataKey="n" fill="#7c3aed" radius={[0,4,4,0]} name="Patienten"/>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                          <th className="text-left pb-2">Diagnose</th>
                          <th className="text-right pb-2">N</th>
                          <th className="text-right pb-2">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.diagnoseBreakdown.map(d=>(
                          <tr key={d.label} className="border-b border-slate-50 dark:border-slate-700/50">
                            <td className="py-1.5 font-medium text-slate-700 dark:text-slate-200">{d.label}</td>
                            <td className="py-1.5 text-right font-black text-slate-700 dark:text-slate-200">{d.n}</td>
                            <td className="py-1.5 text-right text-slate-400 dark:text-slate-500">
                              {analytics.totalPatients>0?fmt(d.n/analytics.totalPatients*100,1):'–'}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Diagnose × mittlerer PR ── */}
            {analytics.diagMeanPR.length > 0 && (
              <div>
                <SectionHead title="Diagnose-stratifizierter mittlerer PR"
                  sub="Mittlerer PR (Ø über alle Tests, neueste Messung pro Test) pro Diagnosegruppe · nur Gruppen N ≥ 3"/>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={Math.max(160, analytics.diagMeanPR.length*24)}>
                    <BarChart data={analytics.diagMeanPR} layout="vertical" margin={{top:0,right:20,left:4,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                      <XAxis type="number" domain={[0,100]} tick={{fontSize:10}}/>
                      <YAxis type="category" dataKey="diag" tick={{fontSize:9}} width={130}/>
                      <Tooltip contentStyle={{fontSize:11,borderRadius:10}} formatter={(v:number)=>[v.toFixed(1),'Ø PR']}/>
                      <Bar dataKey="mean" fill="#6366f1" radius={[0,4,4,0]} name="Ø PR"/>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                          <th className="text-left pb-2">Diagnose</th>
                          <th className="text-right pb-2">N</th>
                          <th className="text-right pb-2">Ø PR</th>
                          <th className="text-right pb-2">SD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.diagMeanPR.map(d=>(
                          <tr key={d.diag} className="border-b border-slate-50 dark:border-slate-700/50">
                            <td className="py-1.5 font-medium text-slate-700 dark:text-slate-200">{d.diag}</td>
                            <td className="py-1.5 text-right font-black text-slate-600 dark:text-slate-300">{d.n}</td>
                            <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{fmt(d.mean,1)}</td>
                            <td className="py-1.5 text-right text-slate-400 dark:text-slate-500">{fmt(d.sd,1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Lokalisation × mittlerer PR ── */}
            {analytics.lokMeanPR.length > 0 && (
              <div>
                <SectionHead title="Lokalisation-stratifizierter mittlerer PR" sub="Ø PR über alle Tests · N ≥ 2 pro Lokalisation"/>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={Math.max(140, analytics.lokMeanPR.length*22)}>
                    <BarChart data={analytics.lokMeanPR} layout="vertical" margin={{top:0,right:20,left:4,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                      <XAxis type="number" domain={[0,100]} tick={{fontSize:10}}/>
                      <YAxis type="category" dataKey="lok" tick={{fontSize:9}} width={130}/>
                      <Tooltip contentStyle={{fontSize:11,borderRadius:10}} formatter={(v:number)=>[v.toFixed(1),'Ø PR']}/>
                      <Bar dataKey="mean" fill="#0ea5e9" radius={[0,4,4,0]} name="Ø PR"/>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                          <th className="text-left pb-2">Lokalisation</th>
                          <th className="text-right pb-2">N</th>
                          <th className="text-right pb-2">Ø PR</th>
                          <th className="text-right pb-2">SD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.lokMeanPR.map(l=>(
                          <tr key={l.lok} className="border-b border-slate-50 dark:border-slate-700/50">
                            <td className="py-1.5 font-medium text-slate-700 dark:text-slate-200">{l.lok}</td>
                            <td className="py-1.5 text-right font-black text-slate-600 dark:text-slate-300">{l.n}</td>
                            <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{fmt(l.mean,1)}</td>
                            <td className="py-1.5 text-right text-slate-400 dark:text-slate-500">{fmt(l.sd,1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Aufnahmen & Tests pro Monat ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <SectionHead title="Aufnahmen pro Monat (letzte 12 Monate)"/>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={analytics.patientsPerMonth.map(d=>({...d,label:monthLabel(d.month)}))} margin={{top:0,right:8,left:-20,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                    <XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:10}}/>
                    <Tooltip contentStyle={{fontSize:11,borderRadius:10}}/>
                    <Bar dataKey="n" fill="#6366f1" radius={[4,4,0,0]} name="Aufnahmen"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <SectionHead title="Tests pro Monat (letzte 12 Monate)"/>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={analytics.testsPerMonth.map(d=>({...d,label:monthLabel(d.month)}))} margin={{top:0,right:8,left:-20,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                    <XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:10}}/>
                    <Tooltip contentStyle={{fontSize:11,borderRadius:10}}/>
                    <Bar dataKey="n" fill="#8b5cf6" radius={[4,4,0,0]} name="Tests"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Testhäufigkeit ── */}
            <div>
              <SectionHead title="Testhäufigkeit gesamt"/>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={analytics.testFreq} margin={{top:0,right:8,left:-20,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                  <XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:10}}/>
                  <Tooltip contentStyle={{fontSize:11,borderRadius:10}}/>
                  <Bar dataKey="n" fill="#0ea5e9" radius={[4,4,0,0]} name="Durchführungen"/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── PR-Verteilung aller Tests ── */}
            {analytics.prHistograms.length > 0 && (
              <div>
                <SectionHead title="PR-Verteilung – alle Tests (Klassen à 10 PR-Punkte)"
                  sub="Verwendeter Wert: Ø PR über alle Skalen des Tests (neueste Messung je Patient pro Test)"/>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {analytics.prHistograms.map(h=>(
                    <div key={h.testId}>
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 mb-1">{h.label}</p>
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={h.buckets} margin={{top:0,right:4,left:-28,bottom:0}}>
                          <XAxis dataKey="label" tick={{fontSize:7}}/>
                          <YAxis allowDecimals={false} tick={{fontSize:8}}/>
                          <Tooltip contentStyle={{fontSize:10,borderRadius:8}}/>
                          <Bar dataKey="n" radius={[2,2,0,0]} name="Häufigkeit">
                            {h.buckets.map((b,i)=>{
                              const lo=i*10;
                              const col = lo<PR_BELOW?'#f43f5e':lo>=PR_ABOVE?'#10b981':'#94a3b8';
                              return <Cell key={b.label} fill={col}/>;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Rohwert-Verteilungen ── */}
            {analytics.rawHistograms.length > 0 && (
              <div>
                <SectionHead title="Rohwert-Verteilungen – wichtige Kennwerte pro Test"
                  sub="8 gleichbreite Klassen zwischen Min und Max · N = Anzahl Patienten mit Datenpunkten"/>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {analytics.rawHistograms.map(h=>(
                    <div key={`${h.testId}-${h.key}`}>
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 mb-0.5">{h.testLabel}</p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mb-1">{h.keyLabel} · N={h.n} · M={fmt(h.mean,1)} · SD={fmt(h.sd,1)}</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={h.buckets} margin={{top:0,right:4,left:-28,bottom:0}}>
                          <XAxis dataKey="label" tick={{fontSize:6}}/>
                          <YAxis allowDecimals={false} tick={{fontSize:8}}/>
                          <Tooltip contentStyle={{fontSize:10,borderRadius:8}}/>
                          <Bar dataKey="n" fill="#f59e0b" radius={[2,2,0,0]} name="Häufigkeit"/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Längsschnittanalyse ── */}
            {analytics.longitudinal.length > 0 && (
              <div>
                <SectionHead title="Längsschnittanalyse – PR-Veränderung über Messwiederholungen"
                  sub="Verbesserung: ΔPR > 5 · Stabil: |ΔPR| ≤ 5 · Verschlechterung: ΔPR < –5 · Vergleich erste vs. letzte Messung"/>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                        <th className="text-left pb-2">Test</th>
                        <th className="text-right pb-2">N Pat.</th>
                        <th className="text-right pb-2">Ø ΔPR</th>
                        <th className="text-right pb-2">SD ΔPR</th>
                        <th className="text-right pb-2"><TrendingUp size={10} className="inline text-emerald-500"/> Verb.</th>
                        <th className="text-right pb-2"><Minus size={10} className="inline text-slate-400"/> Stabil</th>
                        <th className="text-right pb-2"><TrendingDown size={10} className="inline text-rose-500"/> Versch.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.longitudinal.map(l=>(
                        <tr key={l.testId} className="border-b border-slate-50 dark:border-slate-700/50">
                          <td className="py-2 font-bold text-slate-700 dark:text-slate-200">{l.label}</td>
                          <td className="py-2 text-right font-black text-slate-600 dark:text-slate-300">{l.n}</td>
                          <td className={cn('py-2 text-right font-black', l.meanChange>2?'text-emerald-600 dark:text-emerald-400':l.meanChange<-2?'text-rose-600 dark:text-rose-400':'text-slate-500 dark:text-slate-400')}>
                            {l.meanChange>=0?'+':''}{fmt(l.meanChange,1)}
                          </td>
                          <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(l.sdChange,1)}</td>
                          <td className="py-2 text-right text-emerald-600 dark:text-emerald-400 font-black">{l.improved} ({fmt(l.n>0?l.improved/l.n*100:0,0)}%)</td>
                          <td className="py-2 text-right text-slate-400 dark:text-slate-500">{l.stable} ({fmt(l.n>0?l.stable/l.n*100:0,0)}%)</td>
                          <td className="py-2 text-right text-rose-600 dark:text-rose-400 font-black">{l.declined} ({fmt(l.n>0?l.declined/l.n*100:0,0)}%)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Deskriptive Statistik ── */}
            <div>
              <SectionHead title="Deskriptive Statistik – mittlerer PR pro Test (neueste Messung)"
                sub="N durchgef. = Patienten, die den Test absolviert haben · N PR = Patienten mit berechenbarem PR · M = Mittelwert · SD · Mdn = Median"/>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left pb-2">Test</th>
                      <th className="text-right pb-2 whitespace-nowrap">N durchgef.</th>
                      <th className="text-right pb-2 whitespace-nowrap">N PR</th>
                      <th className="text-right pb-2">M</th>
                      <th className="text-right pb-2">SD</th>
                      <th className="text-right pb-2">Mdn</th>
                      <th className="text-right pb-2">Q25</th>
                      <th className="text-right pb-2">Q75</th>
                      <th className="text-right pb-2">Min</th>
                      <th className="text-right pb-2">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.testStats.map(s=>(
                      <tr key={s.testId} className="border-b border-slate-50 dark:border-slate-700/50">
                        <td className="py-2 font-bold text-slate-700 dark:text-slate-200">{s.label}</td>
                        <td className="py-2 text-right font-black text-slate-600 dark:text-slate-300">{s.nPerformed}</td>
                        <td className="py-2 text-right text-slate-400 dark:text-slate-500">{s.n > 0 ? s.n : '–'}</td>
                        <td className="py-2 text-right text-slate-600 dark:text-slate-300">{s.n > 0 ? fmt(s.mean) : '–'}</td>
                        <td className="py-2 text-right text-slate-600 dark:text-slate-300">{s.n > 0 ? fmt(s.sd) : '–'}</td>
                        <td className="py-2 text-right text-slate-600 dark:text-slate-300">{s.n > 0 ? fmt(s.median) : '–'}</td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">{s.n > 0 ? fmt(s.q25) : '–'}</td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">{s.n > 0 ? fmt(s.q75) : '–'}</td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">{s.n > 0 ? fmt(s.min) : '–'}</td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">{s.n > 0 ? fmt(s.max) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Subtest-PR-Statistik ── */}
            {analytics.subtestStats.length > 0 && (
              <div>
                <SectionHead title="Subtest-PR-Statistik – deskriptive Kennwerte pro Skala"
                  sub="Alle PR-Skalen aus der jeweils neuesten Messung pro Patient und Test"/>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                        <th className="text-left pb-2">Test</th>
                        <th className="text-left pb-2">Subtest</th>
                        <th className="text-right pb-2">N</th>
                        <th className="text-right pb-2">M</th>
                        <th className="text-right pb-2">SD</th>
                        <th className="text-right pb-2">Mdn</th>
                        <th className="text-right pb-2">Min</th>
                        <th className="text-right pb-2">Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.subtestStats.map(s=>(
                        <tr key={`${s.testId}-${s.key}`} className="border-b border-slate-50 dark:border-slate-700/50">
                          <td className="py-1.5 font-bold text-slate-700 dark:text-slate-200">{s.testLabel}</td>
                          <td className="py-1.5 text-slate-600 dark:text-slate-300">{s.keyLabel}</td>
                          <td className="py-1.5 text-right font-black text-slate-600 dark:text-slate-300">{s.n}</td>
                          <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{fmt(s.mean)}</td>
                          <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{fmt(s.sd)}</td>
                          <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{fmt(s.median)}</td>
                          <td className="py-1.5 text-right text-slate-500 dark:text-slate-400">{fmt(s.min)}</td>
                          <td className="py-1.5 text-right text-slate-500 dark:text-slate-400">{fmt(s.max)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Inferenzstatistik ── */}
            <div>
              <SectionHead title="Inferenzstatistik – Alterskorrelation & Geschlechtsunterschied"
                sub="Alter × PR: Pearson-Korrelation (min. N=4) · Geschlecht: Welch-t-Test (m vs. w, min. N=3 je Gruppe) + Cohen's d"/>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left pb-2">Test</th>
                      <th className="text-right pb-2 whitespace-nowrap">r (Alter)</th>
                      <th className="text-right pb-2"></th>
                      <th className="text-right pb-2 whitespace-nowrap">t (m vs. w)</th>
                      <th className="text-right pb-2">d</th>
                      <th className="text-right pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.testStats.map(s=>(
                      <tr key={s.testId} className="border-b border-slate-50 dark:border-slate-700/50">
                        <td className="py-2 font-bold text-slate-700 dark:text-slate-200">{s.label}</td>
                        {s.ageCorr ? (
                          <><td className="py-2 text-right text-slate-600 dark:text-slate-300">r = {fmt(s.ageCorr.r,2)}</td><td className="py-2 text-right"><PBadge p={s.ageCorr.p}/></td></>
                        ) : (<><td className="py-2 text-right text-slate-400">–</td><td/></>)}
                        {s.genderT ? (
                          <><td className="py-2 text-right text-slate-600 dark:text-slate-300">t = {fmt(s.genderT.t,2)} (n♂={s.genderT.nM}, n♀={s.genderT.nW})</td>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(s.genderT.d,2)}</td>
                            <td className="py-2 text-right"><PBadge p={s.genderT.p}/></td></>
                        ) : (<><td className="py-2 text-right text-slate-400">–</td><td/><td/></>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Zweifaktorielle ANOVA ── */}
            <div>
              <SectionHead title="Zweifaktorielle ANOVA – Altersgruppe × Geschlecht"
                sub="Faktoren: A = Altersgruppe (<40 / 40–59 / ≥60), B = Geschlecht (m vs. w). Type I SS. Nur Tests mit N ≥ 12 und allen 6 Zellen besetzt."/>
              {analytics.testStats.every(s=>!s.anova) ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">Zu wenige Daten (N ≥ 12 je Test, alle 6 Altersgruppe-×-Geschlecht-Zellen besetzt).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                        <th className="text-left pb-2">Test</th>
                        <th className="text-right pb-2">N</th>
                        <th className="text-right pb-2 whitespace-nowrap">F (Alter)</th>
                        <th className="text-right pb-2">η²</th><th className="text-right pb-2"></th>
                        <th className="text-right pb-2 whitespace-nowrap">F (Gesch.)</th>
                        <th className="text-right pb-2">η²</th><th className="text-right pb-2"></th>
                        <th className="text-right pb-2 whitespace-nowrap">F (A×B)</th>
                        <th className="text-right pb-2">η²</th><th className="text-right pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.testStats.filter(s=>s.anova).map(s=>{
                        const a=s.anova!;
                        return (
                          <tr key={s.testId} className="border-b border-slate-50 dark:border-slate-700/50">
                            <td className="py-2 font-bold text-slate-700 dark:text-slate-200">{s.label}</td>
                            <td className="py-2 text-right font-black text-slate-600 dark:text-slate-300">{a.N}</td>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(a.F_A,2)}</td>
                            <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(a.eta2_A,3)}</td>
                            <td className="py-2 text-right"><PBadge p={a.p_A}/></td>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(a.F_B,2)}</td>
                            <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(a.eta2_B,3)}</td>
                            <td className="py-2 text-right"><PBadge p={a.p_B}/></td>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(a.F_AB,2)}</td>
                            <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(a.eta2_AB,3)}</td>
                            <td className="py-2 text-right"><PBadge p={a.p_AB}/></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Section>
  );
};
