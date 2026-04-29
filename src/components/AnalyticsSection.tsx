import React, { useState, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BarChart2, Download, Loader2, RefreshCw, TrendingUp, SlidersHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { fetchPatients, fetchPatient } from '../lib/db-api';
import { Patient, TestResult } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsRow {
  patient: Patient;
  results: TestResult[];
}

interface TestStats {
  testId: string;
  label: string;
  n: number;
  mean: number;
  sd: number;
  median: number;
  min: number;
  max: number;
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

// ── Test name map ─────────────────────────────────────────────────────────────

const TEST_LABELS: Record<string, string> = {
  tmt: 'TMT',
  vlmt: 'VLMT',
  tol: 'TOL',
  zzt: 'ZZT',
  mosaik: 'Mosaik',
  zahlenspanne: 'Zahlenspanne',
  lg: 'Log. Gedächtnis',
  wms: 'WMS-IV',
  rocft: 'ROCFT',
  tap: 'TAP',
  burotest: 'Bürotest',
  tagesplan: 'Tagesplan',
  neglect: 'Neglect',
};

// ── Statistics helpers ────────────────────────────────────────────────────────

function _mean(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / v.length;
}
function _sd(v: number[]): number {
  if (v.length < 2) return 0;
  const m = _mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}
function _median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Normal CDF (Hart's polynomial approximation) */
function _normCDF(z: number): number {
  const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937;
  const b4 = -1.821255978, b5 = 1.330274429, p0 = 0.2316419;
  const t = 1 / (1 + p0 * Math.abs(z));
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

/** t-distribution CDF (Cornish-Fisher approximation, accurate for df > 5) */
function _tCDF(t: number, df: number): number {
  if (df <= 0) return 0.5;
  const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + (t * t) / (2 * df));
  return _normCDF(z);
}

/** Log-Gamma (Lanczos approximation) */
function _lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const ci of c) { y++; ser += ci / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** Regularized incomplete beta function continued fraction (Lentz method) */
function _betacf(x: number, a: number, b: number): number {
  const MAXIT = 100, EPS = 3e-7, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function _ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(_lgamma(a + b) - _lgamma(a) - _lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * _betacf(x, a, b) / a;
  return 1 - bt * _betacf(1 - x, b, a) / b;
}

/** F-distribution upper-tail p-value */
function _fPValue(f: number, d1: number, d2: number): number {
  if (f <= 0 || d1 <= 0 || d2 <= 0) return 1;
  return 1 - _ibeta(d1 * f / (d1 * f + d2), d1 / 2, d2 / 2);
}

function _pearson(x: number[], y: number[]): { r: number; p: number } {
  const n = x.length;
  if (n < 4) return { r: 0, p: 1 };
  const mx = _mean(x), my = _mean(y);
  const num = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0);
  const dX = Math.sqrt(x.reduce((s, xi) => s + (xi - mx) ** 2, 0));
  const dY = Math.sqrt(y.reduce((s, yi) => s + (yi - my) ** 2, 0));
  const r = dX * dY === 0 ? 0 : num / (dX * dY);
  const tStat = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
  const p = 2 * (1 - _tCDF(Math.abs(tStat), n - 2));
  return { r, p };
}

function _welchT(a: number[], b: number[]): { t: number; p: number; d: number } | null {
  if (a.length < 3 || b.length < 3) return null;
  const ma = _mean(a), mb = _mean(b);
  const sa = _sd(a), sb = _sd(b);
  const na = a.length, nb = b.length;
  const se = Math.sqrt(sa ** 2 / na + sb ** 2 / nb);
  if (se === 0) return null;
  const t = (ma - mb) / se;
  const df = (sa ** 2 / na + sb ** 2 / nb) ** 2
    / ((sa ** 2 / na) ** 2 / (na - 1) + (sb ** 2 / nb) ** 2 / (nb - 1));
  const p = 2 * (1 - _tCDF(Math.abs(t), df));
  const poolSD = Math.sqrt(((na - 1) * sa ** 2 + (nb - 1) * sb ** 2) / (na + nb - 2));
  const d = poolSD === 0 ? 0 : (ma - mb) / poolSD;
  return { t, p, d };
}

/**
 * Two-way ANOVA: age group (3 levels: <40, 40–59, ≥60) × gender (m, w).
 * Uses Type I SS (sequential). Excludes 'd' gender and patients with no gender match.
 * Returns null when N < 12 or any cell is empty.
 */
function _twowayAnova(rows: { ageGroup: 0 | 1 | 2; gender: 'm' | 'w'; pr: number }[]): ANOVAResult | null {
  const A = 3, B = 2;
  const cells: number[][][] = Array.from({ length: A }, () => Array.from({ length: B }, () => []));

  for (const d of rows) {
    const j = d.gender === 'm' ? 0 : 1;
    cells[d.ageGroup][j].push(d.pr);
  }

  const ns = cells.map(row => row.map(c => c.length));
  const N = ns.flat().reduce((a, b) => a + b, 0);
  if (N < 12) return null;
  if (!ns.every(row => row.every(n => n >= 1))) return null;

  const cellMeans = cells.map(row => row.map(c => _mean(c)));
  const allPRs = cells.flat().flat();
  const grandMean = _mean(allPRs);

  const SS_total = allPRs.reduce((s, x) => s + (x - grandMean) ** 2, 0);

  // SS_cells (between-cell)
  let SS_cells = 0;
  for (let i = 0; i < A; i++)
    for (let j = 0; j < B; j++)
      SS_cells += ns[i][j] * (cellMeans[i][j] - grandMean) ** 2;

  // SS_within (within cells)
  let SS_within = 0;
  for (let i = 0; i < A; i++)
    for (let j = 0; j < B; j++) {
      const m = cellMeans[i][j];
      for (const x of cells[i][j]) SS_within += (x - m) ** 2;
    }

  // Weighted row/column marginal means
  const rowNs = ns.map(row => row.reduce((a, b) => a + b, 0));
  const rowMeans = cells.map((row, i) =>
    rowNs[i] > 0
      ? row.reduce((acc, c, j) => acc + ns[i][j] * cellMeans[i][j], 0) / rowNs[i]
      : 0
  );
  const colNs = [0, 1].map(j => ns.reduce((acc, row) => acc + row[j], 0));
  const colMeans = [0, 1].map(j =>
    colNs[j] > 0
      ? cells.reduce((acc, row, i) => acc + ns[i][j] * cellMeans[i][j], 0) / colNs[j]
      : 0
  );

  let SS_A = 0;
  for (let i = 0; i < A; i++) SS_A += rowNs[i] * (rowMeans[i] - grandMean) ** 2;

  let SS_B = 0;
  for (let j = 0; j < B; j++) SS_B += colNs[j] * (colMeans[j] - grandMean) ** 2;

  const SS_AB = Math.max(0, SS_cells - SS_A - SS_B);

  const df_A = A - 1, df_B = B - 1, df_AB = df_A * df_B;
  const filledCells = ns.flat().filter(n => n > 0).length;
  const df_within = N - filledCells;
  if (df_within < 1) return null;

  const MS_within = SS_within / df_within;
  if (MS_within <= 0) return null;

  const F_A = (SS_A / df_A) / MS_within;
  const F_B = (SS_B / df_B) / MS_within;
  const F_AB = (SS_AB / df_AB) / MS_within;

  return {
    F_A, p_A: _fPValue(F_A, df_A, df_within), eta2_A: SS_A / SS_total,
    F_B, p_B: _fPValue(F_B, df_B, df_within), eta2_B: SS_B / SS_total,
    F_AB, p_AB: _fPValue(F_AB, df_AB, df_within), eta2_AB: SS_AB / SS_total,
    N,
  };
}

function ageGroup(age: number): 0 | 1 | 2 {
  if (age < 40) return 0;
  if (age < 60) return 1;
  return 2;
}

/** Parse a PR value (string like ">95", "<5", "15-35", "1->95" or number) to numeric midpoint */
function parsePR(v: number | string): number | null {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'n/a' || s === '–') return null;
  if (s.startsWith('>')) {
    const n = parseFloat(s.slice(1));
    return isNaN(n) ? null : Math.min(n + 2, 100);
  }
  if (s.startsWith('<')) {
    const n = parseFloat(s.slice(1));
    return isNaN(n) ? null : Math.max(n - 2, 0);
  }
  const arrow = s.indexOf('->');
  if (arrow > 0) {
    const a = parseFloat(s.slice(0, arrow));
    const bStr = s.slice(arrow + 2);
    const b = bStr.startsWith('>') ? parseFloat(bStr.slice(1)) + 2 : parseFloat(bStr);
    return !isNaN(a) && !isNaN(b) ? (a + b) / 2 : null;
  }
  const di = s.indexOf('-', s.startsWith('-') ? 1 : 0);
  if (di > 0) {
    const a = parseFloat(s.slice(0, di));
    const b = parseFloat(s.slice(di + 1));
    if (!isNaN(a) && !isNaN(b)) return (a + b) / 2;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function avgPR(result: TestResult): number | null {
  const vals = Object.values(result.percentileRanks).map(parsePR).filter((v): v is number => v !== null);
  return vals.length > 0 ? _mean(vals) : null;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function monthKey(dateStr: string): string { return dateStr.slice(0, 7); }
function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${month}/${year.slice(2)}`;
}
function last12Months(): string[] {
  const keys: string[] = [];
  const d = new Date();
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// ── PDF export ────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1): string { return n.toFixed(decimals); }
function fmtP(p: number): string {
  if (p < 0.001) return '< .001';
  if (p < 0.01) return '< .01';
  if (p < 0.05) return '< .05';
  return `= ${p.toFixed(2)}`;
}

function exportPDF(
  testStats: TestStats[],
  totalPatients: number,
  totalTests: number,
  patientsPerMonth: { month: string; n: number }[],
  testsPerMonth: { month: string; n: number }[],
  exportDate: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 20;

  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('Leistungsprofil – Statistische Auswertung', 14, y); y += 7;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Erstellt am ${exportDate}`, 14, y); y += 10;

  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Übersicht', 14, y); y += 5;
  autoTable(doc, {
    startY: y,
    head: [['Kennzahl', 'Wert']],
    body: [['Anzahl Patienten (gesamt)', String(totalPatients)], ['Anzahl Testergebnisse (gesamt)', String(totalTests)]],
    styles: { fontSize: 9 }, headStyles: { fillColor: [79, 70, 229] }, margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Aufnahmen pro Monat (letzte 12 Monate)', 14, y); y += 5;
  autoTable(doc, {
    startY: y,
    head: [['Monat', 'Aufnahmen']],
    body: patientsPerMonth.map(r => [monthLabel(r.month), String(r.n)]),
    styles: { fontSize: 9 }, headStyles: { fillColor: [79, 70, 229] }, margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Testergebnisse pro Monat (letzte 12 Monate)', 14, y); y += 5;
  autoTable(doc, {
    startY: y,
    head: [['Monat', 'Tests']],
    body: testsPerMonth.map(r => [monthLabel(r.month), String(r.n)]),
    styles: { fontSize: 9 }, headStyles: { fillColor: [79, 70, 229] }, margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (y > 200) { doc.addPage(); y = 20; }
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Deskriptive Statistik – PR-Werte pro Test', 14, y); y += 5;
  autoTable(doc, {
    startY: y,
    head: [['Test', 'N', 'M', 'SD', 'Mdn', 'Min', 'Max']],
    body: testStats.map(s => [s.label, String(s.n), fmt(s.mean), fmt(s.sd), fmt(s.median), fmt(s.min), fmt(s.max)]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [79, 70, 229] }, margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (y > 200) { doc.addPage(); y = 20; }
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Inferenzstatistik (t-Test, Korrelation)', 14, y); y += 5;
  const infRows = testStats.filter(s => s.ageCorr || s.genderT).map(s => [
    s.label,
    s.ageCorr ? `r = ${fmt(s.ageCorr.r, 2)}, p ${fmtP(s.ageCorr.p)}` : '–',
    s.genderT ? `t = ${fmt(s.genderT.t, 2)}, p ${fmtP(s.genderT.p)}, d = ${fmt(s.genderT.d, 2)} (n♂=${s.genderT.nM}, n♀=${s.genderT.nW})` : '–',
  ]);
  autoTable(doc, {
    startY: y,
    head: [['Test', 'Alter × PR', 'Geschlecht × PR']],
    body: infRows,
    styles: { fontSize: 8 }, headStyles: { fillColor: [79, 70, 229] },
    columnStyles: { 1: { cellWidth: 55 }, 2: { cellWidth: 85 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const anovaStats = testStats.filter(s => s.anova);
  if (anovaStats.length > 0) {
    if (y > 200) { doc.addPage(); y = 20; }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Zweifaktorielle ANOVA (Altersgruppe × Geschlecht)', 14, y); y += 4;
    doc.setFontSize(7); doc.setFont('helvetica', 'italic');
    doc.text('Altersgruppen: <40 / 40–59 / ≥60. Faktoren: Altersgruppe (A), Geschlecht m vs. w (B), Interaktion (A×B). Type I SS.', 14, y + 3);
    y += 9;
    autoTable(doc, {
      startY: y,
      head: [['Test', 'N', 'F_A', 'p_A', 'η²_A', 'F_B', 'p_B', 'η²_B', 'F_A×B', 'p_A×B', 'η²_A×B']],
      body: anovaStats.map(s => {
        const a = s.anova!;
        return [s.label, String(a.N), fmt(a.F_A, 2), fmtP(a.p_A), fmt(a.eta2_A, 3),
          fmt(a.F_B, 2), fmtP(a.p_B), fmt(a.eta2_B, 3),
          fmt(a.F_AB, 2), fmtP(a.p_AB), fmt(a.eta2_AB, 3)];
      }),
      styles: { fontSize: 7 }, headStyles: { fillColor: [79, 70, 229] }, margin: { left: 14, right: 14 },
    });
  }

  doc.save(`leistungsprofil_auswertung_${exportDate.replace(/\./g, '-')}.pdf`);
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const Section: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

const StatCard: React.FC<{ label: string; value: string | number; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl px-5 py-4 flex flex-col gap-1">
    <span className="text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest">{label}</span>
    <span className="text-3xl font-black text-indigo-700 dark:text-indigo-300">{value}</span>
    {sub && <span className="text-[11px] text-indigo-400 dark:text-indigo-500">{sub}</span>}
  </div>
);

const PBadge: React.FC<{ p: number }> = ({ p }) => (
  <span className={cn(
    'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black',
    p < 0.05
      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  )}>
    {p < 0.001 ? 'p < .001' : p < 0.01 ? 'p < .01' : p < 0.05 ? 'p < .05' : `p = ${p.toFixed(2)}`}
  </span>
);

// ── Filter state ──────────────────────────────────────────────────────────────

interface Filters {
  diagnose: string;   // '' = all
  geschlecht: string; // '' = all
  ageMin: string;
  ageMax: string;
  dateFrom: string;
  dateTo: string;
}

const defaultFilters: Filters = { diagnose: '', geschlecht: '', ageMin: '', ageMax: '', dateFrom: '', dateTo: '' };

function applyFilters(rows: AnalyticsRow[], f: Filters): AnalyticsRow[] {
  return rows
    .filter(r => {
      if (f.diagnose && r.patient.diagnose !== f.diagnose) return false;
      if (f.geschlecht && r.patient.geschlecht !== f.geschlecht) return false;
      const age = r.patient.age;
      if (f.ageMin && age < parseInt(f.ageMin, 10)) return false;
      if (f.ageMax && age > parseInt(f.ageMax, 10)) return false;
      return true;
    })
    .map(r => {
      if (!f.dateFrom && !f.dateTo) return r;
      const results = r.results.filter(res => {
        if (f.dateFrom && res.date < f.dateFrom) return false;
        if (f.dateTo && res.date > f.dateTo) return false;
        return true;
      });
      return { ...r, results };
    })
    .filter(r => !f.dateFrom && !f.dateTo || r.results.length > 0);
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
    setLoading(true);
    setError('');
    setData(null);
    setProgress(null);
    try {
      const patients = await fetchPatients(encryptionKey);
      setProgress({ done: 0, total: patients.length });
      const rows: AnalyticsRow[] = [];
      const BATCH = 8;
      for (let i = 0; i < patients.length; i += BATCH) {
        const batch = patients.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(p => fetchPatient(p.id, encryptionKey)));
        for (const r of results) {
          if (r) rows.push({ patient: r.patient, results: r.results });
        }
        setProgress({ done: Math.min(i + BATCH, patients.length), total: patients.length });
      }
      setData(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [encryptionKey]);

  // ── Apply filters ─────────────────────────────────────────────────────────

  const filteredData = useMemo(() => {
    if (!data) return null;
    return applyFilters(data, filters);
  }, [data, filters]);

  // ── All unique diagnoses for filter dropdown ───────────────────────────────

  const allDiagnosen = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map(r => r.patient.diagnose).filter((d): d is string => !!d))).sort();
  }, [data]);

  // ── Derived analytics ─────────────────────────────────────────────────────

  const analytics = useMemo(() => {
    const d = filteredData;
    if (!d) return null;

    const totalPatients = d.length;
    const allResults = d.flatMap(r => r.results);
    const totalTests = allResults.length;

    const testCounts: Record<string, number> = {};
    for (const r of allResults) testCounts[r.testId] = (testCounts[r.testId] ?? 0) + 1;
    const mostUsed = Object.entries(testCounts).sort((a, b) => b[1] - a[1])[0];

    const months = last12Months();
    const patientsPerMonth = months.map(m => ({
      month: m,
      n: d.filter(r => r.patient.aufnahmedatum?.startsWith(m)).length,
    }));
    const testsPerMonth = months.map(m => ({
      month: m,
      n: allResults.filter(r => r.date.startsWith(m)).length,
    }));

    const testFreq = Object.entries(testCounts)
      .map(([id, n]) => ({ id, label: TEST_LABELS[id] ?? id, n }))
      .sort((a, b) => b.n - a.n);

    // Diagnosis breakdown
    const diagnoseCounts: Record<string, number> = {};
    for (const r of d) {
      const key = r.patient.diagnose ?? '(keine Angabe)';
      diagnoseCounts[key] = (diagnoseCounts[key] ?? 0) + 1;
    }
    const diagnoseBreakdown = Object.entries(diagnoseCounts)
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n);

    // Per-test stats
    const testIds = Array.from(new Set(allResults.map(r => r.testId as string)));
    const testStats: TestStats[] = testIds.map((testId: string) => {
      const rows = d
        .map(row => {
          const res = row.results.filter(r => r.testId === testId);
          const latestPR = res.length > 0
            ? avgPR(res.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0])
            : null;
          return latestPR !== null
            ? { age: row.patient.age, geschlecht: row.patient.geschlecht, pr: latestPR }
            : null;
        })
        .filter((r): r is { age: number; geschlecht: string; pr: number } => r !== null);

      const prs = rows.map(r => r.pr);
      if (prs.length === 0) {
        return { testId, label: TEST_LABELS[testId] ?? testId, n: 0, mean: 0, sd: 0, median: 0, min: 0, max: 0, ageCorr: null, genderT: null, anova: null };
      }

      const ageCorr = rows.length >= 4 ? _pearson(rows.map(r => r.age), prs) : null;

      const mPRs = rows.filter(r => r.geschlecht === 'm').map(r => r.pr);
      const wPRs = rows.filter(r => r.geschlecht === 'w').map(r => r.pr);
      const welchResult = _welchT(mPRs, wPRs);
      const genderT = welchResult ? { ...welchResult, nM: mPRs.length, nW: wPRs.length } : null;

      const anovaInput = rows
        .filter(r => r.geschlecht === 'm' || r.geschlecht === 'w')
        .map(r => ({ ageGroup: ageGroup(r.age), gender: r.geschlecht as 'm' | 'w', pr: r.pr }));
      const anova = _twowayAnova(anovaInput);

      return {
        testId, label: TEST_LABELS[testId] ?? testId,
        n: prs.length, mean: _mean(prs), sd: _sd(prs), median: _median(prs),
        min: Math.min(...prs), max: Math.max(...prs),
        ageCorr, genderT, anova,
      };
    }).filter(s => s.n > 0).sort((a, b) => b.n - a.n);

    const prBuckets = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80–89', '90–100'];
    const prHistograms = testStats.slice(0, 6).map(s => {
      const vals = d
        .flatMap(row => row.results.filter(r => r.testId === s.testId).map(r => avgPR(r)))
        .filter((v): v is number => v !== null);
      const buckets = prBuckets.map((label, i) => {
        const lo = i * 10, hi = i === 9 ? 100 : lo + 10;
        return { label, n: vals.filter(v => v >= lo && v < hi + (i === 9 ? 1 : 0)).length };
      });
      return { testId: s.testId, label: s.label, buckets };
    });

    return { totalPatients, totalTests, mostUsed, patientsPerMonth, testsPerMonth, testFreq, testStats, prHistograms, diagnoseBreakdown };
  }, [filteredData]);

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;
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
              onClick={() => setShowFilters(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all',
                activeFilterCount > 0
                  ? 'bg-violet-600 hover:bg-violet-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400'
              )}
            >
              <SlidersHorizontal size={12} />
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          )}
          {analytics && (
            <button
              onClick={() => exportPDF(analytics.testStats, analytics.totalPatients, analytics.totalTests, analytics.patientsPerMonth, analytics.testsPerMonth, exportDate)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-md shadow-indigo-200 dark:shadow-none"
            >
              <Download size={12} />
              PDF Export
            </button>
          )}
          <button
            onClick={loadData}
            disabled={loading}
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
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Diagnose</label>
              <select
                value={filters.diagnose}
                onChange={e => setFilters(f => ({ ...f, diagnose: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
              >
                <option value="">Alle</option>
                {allDiagnosen.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Geschlecht</label>
              <select
                value={filters.geschlecht}
                onChange={e => setFilters(f => ({ ...f, geschlecht: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
              >
                <option value="">Alle</option>
                <option value="m">Männlich</option>
                <option value="w">Weiblich</option>
                <option value="d">Divers</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Altersbereich</label>
              <div className="flex items-center gap-1">
                <input type="number" placeholder="Min" value={filters.ageMin} onChange={e => setFilters(f => ({ ...f, ageMin: e.target.value }))}
                  className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none" min={0} max={120} />
                <span className="text-xs text-slate-400">–</span>
                <input type="number" placeholder="Max" value={filters.ageMax} onChange={e => setFilters(f => ({ ...f, ageMax: e.target.value }))}
                  className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none" min={0} max={120} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Testdatum ab</label>
              <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Testdatum bis</label>
              <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none" />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters(defaultFilters)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-black text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
              >
                Filter zurücksetzen
              </button>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <p className="mt-2 text-[10px] text-violet-500 dark:text-violet-400 font-semibold">
              Zeige {analytics?.totalPatients ?? 0} von {data.length} Patienten
            </p>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 dark:border-slate-700 px-6 py-5 space-y-8">
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
              {progress ? `Lade Patientendaten… ${progress.done}/${progress.total}` : 'Initialisiere…'}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-2xl px-5 py-4 text-sm text-red-600 dark:text-red-400 font-semibold">
            {error}
          </div>
        )}

        {analytics && !loading && (
          <>
            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Patienten gesamt" value={analytics.totalPatients} />
              <StatCard label="Testergebnisse" value={analytics.totalTests} />
              <StatCard label="Tests/Patient Ø" value={analytics.totalPatients > 0 ? (analytics.totalTests / analytics.totalPatients).toFixed(1) : '–'} />
              <StatCard
                label="Häufigster Test"
                value={TEST_LABELS[analytics.mostUsed?.[0]] ?? analytics.mostUsed?.[0] ?? '–'}
                sub={analytics.mostUsed ? `${analytics.mostUsed[1]}× durchgeführt` : undefined}
              />
            </div>

            {/* ── Diagnose-Verteilung ── */}
            {analytics.diagnoseBreakdown.length > 0 && (
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Diagnoseverteilung</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={analytics.diagnoseBreakdown.slice(0, 10)}
                      layout="vertical"
                      margin={{ top: 0, right: 20, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={130} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                      <Bar dataKey="n" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Patienten" />
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
                        {analytics.diagnoseBreakdown.map(d => (
                          <tr key={d.label} className="border-b border-slate-50 dark:border-slate-700/50">
                            <td className="py-1.5 font-medium text-slate-700 dark:text-slate-200">{d.label}</td>
                            <td className="py-1.5 text-right font-black text-slate-700 dark:text-slate-200">{d.n}</td>
                            <td className="py-1.5 text-right text-slate-400 dark:text-slate-500">
                              {analytics.totalPatients > 0 ? ((d.n / analytics.totalPatients) * 100).toFixed(1) : '–'}%
                            </td>
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
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Aufnahmen pro Monat (letzte 12 Monate)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={analytics.patientsPerMonth.map(d => ({ ...d, label: monthLabel(d.month) }))} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                    <Bar dataKey="n" fill="#6366f1" radius={[4, 4, 0, 0]} name="Aufnahmen" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Tests pro Monat (letzte 12 Monate)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={analytics.testsPerMonth.map(d => ({ ...d, label: monthLabel(d.month) }))} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                    <Bar dataKey="n" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Tests" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Test frequency ── */}
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Testhäufigkeit gesamt</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={analytics.testFreq} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                  <Bar dataKey="n" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Durchführungen" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── PR histograms ── */}
            {analytics.prHistograms.length > 0 && (
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">PR-Verteilung (Top-6 Tests)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {analytics.prHistograms.map(h => (
                    <div key={h.testId}>
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 mb-1">{h.label}</p>
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={h.buckets} margin={{ top: 0, right: 4, left: -28, bottom: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 8 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 8 }} />
                          <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
                          <Bar dataKey="n" fill="#f59e0b" radius={[2, 2, 0, 0]} name="Häufigkeit" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Deskriptive Statistik ── */}
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Deskriptive Statistik – PR-Werte pro Test</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left pb-2">Test</th>
                      <th className="text-right pb-2">N</th>
                      <th className="text-right pb-2">M</th>
                      <th className="text-right pb-2">SD</th>
                      <th className="text-right pb-2">Mdn</th>
                      <th className="text-right pb-2">Min</th>
                      <th className="text-right pb-2">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.testStats.map(s => (
                      <tr key={s.testId} className="border-b border-slate-50 dark:border-slate-700/50">
                        <td className="py-2 font-bold text-slate-700 dark:text-slate-200">{s.label}</td>
                        <td className="py-2 text-right font-black text-slate-600 dark:text-slate-300">{s.n}</td>
                        <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(s.mean)}</td>
                        <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(s.sd)}</td>
                        <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(s.median)}</td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(s.min)}</td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(s.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Inferentielle Statistik ── */}
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Inferenzstatistik</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3 italic">Alterskorrelation: Pearson r · Geschlechtsunterschied m vs. w: Welch-t-Test + Cohen's d</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left pb-2">Test</th>
                      <th className="text-right pb-2 whitespace-nowrap">Alter × PR</th>
                      <th className="text-right pb-2"></th>
                      <th className="text-right pb-2 whitespace-nowrap">m vs. w (t)</th>
                      <th className="text-right pb-2">d</th>
                      <th className="text-right pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.testStats.map(s => (
                      <tr key={s.testId} className="border-b border-slate-50 dark:border-slate-700/50">
                        <td className="py-2 font-bold text-slate-700 dark:text-slate-200">{s.label}</td>
                        {s.ageCorr ? (
                          <>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">r = {fmt(s.ageCorr.r, 2)}</td>
                            <td className="py-2 text-right"><PBadge p={s.ageCorr.p} /></td>
                          </>
                        ) : (
                          <><td className="py-2 text-right text-slate-400">–</td><td /></>
                        )}
                        {s.genderT ? (
                          <>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">t = {fmt(s.genderT.t, 2)} (n♂={s.genderT.nM}, n♀={s.genderT.nW})</td>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(s.genderT.d, 2)}</td>
                            <td className="py-2 text-right"><PBadge p={s.genderT.p} /></td>
                          </>
                        ) : (
                          <><td className="py-2 text-right text-slate-400">–</td><td /><td /></>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Zweifaktorielle ANOVA ── */}
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Zweifaktorielle ANOVA – Altersgruppe × Geschlecht</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3 italic">
                Faktoren: A = Altersgruppe (&lt;40 / 40–59 / ≥60), B = Geschlecht (m vs. w). Type I SS.
                Nur Tests mit N ≥ 12 und allen 6 Zellen besetzt werden angezeigt.
              </p>
              {analytics.testStats.every(s => !s.anova) ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">Zu wenige Daten für zweifaktorielle ANOVA (N ≥ 12 je Test, alle 6 Altersgruppe-×-Geschlecht-Zellen besetzt).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
                        <th className="text-left pb-2">Test</th>
                        <th className="text-right pb-2">N</th>
                        <th className="text-right pb-2 whitespace-nowrap">F (Alter)</th>
                        <th className="text-right pb-2">η²</th>
                        <th className="text-right pb-2"></th>
                        <th className="text-right pb-2 whitespace-nowrap">F (Gesch.)</th>
                        <th className="text-right pb-2">η²</th>
                        <th className="text-right pb-2"></th>
                        <th className="text-right pb-2 whitespace-nowrap">F (A×B)</th>
                        <th className="text-right pb-2">η²</th>
                        <th className="text-right pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.testStats.filter(s => s.anova).map(s => {
                        const a = s.anova!;
                        return (
                          <tr key={s.testId} className="border-b border-slate-50 dark:border-slate-700/50">
                            <td className="py-2 font-bold text-slate-700 dark:text-slate-200">{s.label}</td>
                            <td className="py-2 text-right font-black text-slate-600 dark:text-slate-300">{a.N}</td>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(a.F_A, 2)}</td>
                            <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(a.eta2_A, 3)}</td>
                            <td className="py-2 text-right"><PBadge p={a.p_A} /></td>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(a.F_B, 2)}</td>
                            <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(a.eta2_B, 3)}</td>
                            <td className="py-2 text-right"><PBadge p={a.p_B} /></td>
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">{fmt(a.F_AB, 2)}</td>
                            <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(a.eta2_AB, 3)}</td>
                            <td className="py-2 text-right"><PBadge p={a.p_AB} /></td>
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
