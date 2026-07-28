import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Patient, TestResult } from '../types';
import { formatDate } from './utils';
import { isElectron, dbSavePdf } from './db-api';

// ── Colour helpers ─────────────────────────────────────────────────────────────

function hex2rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Below-average threshold per column type (mirrors UI prColorCls)
function isBelowAverage(pr: number, tapM: boolean): boolean {
  return pr < (tapM ? 31 : 16);
}

function parseNumericPr(raw: string): number | null {
  const n = parseFloat(raw);
  if (!isNaN(n)) return n;
  const mGt = raw.match(/^>\s*(\d+(?:\.\d+)?)/);
  if (mGt) return Math.min(100, parseFloat(mGt[1]) + 1);
  const mLt = raw.match(/^<\s*(\d+(?:\.\d+)?)/);
  if (mLt) return parseFloat(mLt[1]) / 2;
  const mRange = raw.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (mRange) return (parseFloat(mRange[1]) + parseFloat(mRange[2])) / 2;
  return null;
}

// ── Semantic cell colours ─────────────────────────────────────────────────────

const ORANGE_BG:    [number, number, number] = [255, 247, 237];
const ORANGE_FG:    [number, number, number] = [154,  52,  18];
const AMBER_STRIPE: [number, number, number] = [245, 158,  11];
const ROSE_BG:      [number, number, number] = [255, 241, 242]; // rose-50
const ROSE_FG:      [number, number, number] = [220,  38,  38]; // rose-600
const HATCH_LINE:   [number, number, number] = [148, 163, 184]; // slate-400

// ── 31 PR column definitions (Vigilanz + Arb.Ged. removed) ────────────────────
// tapM: true  → below-average threshold is PR < 31 (mirrors UI prColorCls)
// tapM: false → below-average threshold is PR < 16

const TAP_ALL_COLS = [
  // Alertness (6) — alM columns use TAP-M cutoff (PR < 31)
  { key: 'alertnessM',        label: 'Alert. M – RT',          group: 'Alertness',  tapM: true  },
  { key: 'alM_sd_pr',         label: 'Alert. M – SD',          group: 'Alertness',  tapM: true  },
  { key: 'alertness23_ohne',  label: 'Alert. 2.3 ohne – RT',   group: 'Alertness',  tapM: false },
  { key: 'al23_ohne_sd_pr',   label: 'Alert. 2.3 ohne – SD',   group: 'Alertness',  tapM: false },
  { key: 'alertness23_mit',   label: 'Alert. 2.3 mit – RT',    group: 'Alertness',  tapM: false },
  { key: 'al23_mit_sd_pr',    label: 'Alert. 2.3 mit – SD',    group: 'Alertness',  tapM: false },
  // Go/Nogo 1 (4)
  { key: 'gonogo',            label: 'Go/Nogo 1 – RT',         group: 'Go/Nogo 1',  tapM: false },
  { key: 'gn_sd_pr',          label: 'Go/Nogo 1 – SD',         group: 'Go/Nogo 1',  tapM: false },
  { key: 'gn_fehler_pr',      label: 'Go/Nogo 1 – Fehler',     group: 'Go/Nogo 1',  tapM: false },
  { key: 'gn_ausl_pr',        label: 'Go/Nogo 1 – Ausl.',      group: 'Go/Nogo 1',  tapM: false },
  // Go/Nogo 2 (4)
  { key: 'gonogo2',           label: 'Go/Nogo 2 – RT',         group: 'Go/Nogo 2',  tapM: false },
  { key: 'gn2_sd_pr',         label: 'Go/Nogo 2 – SD',         group: 'Go/Nogo 2',  tapM: false },
  { key: 'gn2_fehler_pr',     label: 'Go/Nogo 2 – Fehler',     group: 'Go/Nogo 2',  tapM: false },
  { key: 'gn2_ausl_pr',       label: 'Go/Nogo 2 – Ausl.',      group: 'Go/Nogo 2',  tapM: false },
  // Flexibilität (3)
  { key: 'flexibilitaet',     label: 'Flexibil. – RT',         group: 'Flexibil.',  tapM: false },
  { key: 'fl_sd_pr',          label: 'Flexibil. – SD',         group: 'Flexibil.',  tapM: false },
  { key: 'fl_fehler_pr',      label: 'Flexibil. – Fehler',     group: 'Flexibil.',  tapM: false },
  // Geteilte Aufmerksamkeit (7)
  { key: 'geteilte',          label: 'Get. Aufm. aud. – RT',   group: 'Get. Aufm.', tapM: false },
  { key: 'ga_sd_pr',          label: 'Get. Aufm. aud. – SD',   group: 'Get. Aufm.', tapM: false },
  { key: 'geteilteVisuell',   label: 'Get. Aufm. vis. – RT',   group: 'Get. Aufm.', tapM: false },
  { key: 'gv_sd_pr',          label: 'Get. Aufm. vis. – SD',   group: 'Get. Aufm.', tapM: false },
  { key: 'g_fehler_pr',       label: 'Get. Aufm. – Fehler',    group: 'Get. Aufm.', tapM: false },
  { key: 'g_ausl_ges_pr',     label: 'Get. Aufm. – Auslassungen',group: 'Get. Aufm.', tapM: false },
  // Vis. Scanning (6)
  { key: 've_rt_krit_pr',     label: 'Vis.Sc. – RT krit.',     group: 'Vis. Scan.', tapM: false },
  { key: 've_sd_krit_pr',     label: 'Vis.Sc. – SD krit.',     group: 'Vis. Scan.', tapM: false },
  { key: 've_rt_nkrit_pr',    label: 'Vis.Sc. – RT n-krit.',   group: 'Vis. Scan.', tapM: false },
  { key: 've_sd_nkrit_pr',    label: 'Vis.Sc. – SD n-krit.',   group: 'Vis. Scan.', tapM: false },
  { key: 've_fehler_pr',      label: 'Vis.Sc. – Fehlreak.',    group: 'Vis. Scan.', tapM: false },
  { key: 've_ausl_krit_pr',   label: 'Vis.Sc. – Auslassungen', group: 'Vis. Scan.', tapM: false },
  // Neglect (1)
  { key: 'neg_pr',            label: 'Neglect',                group: 'Neglect',    tapM: false },
] as const;

// Column group spans (0-indexed into TAP_ALL_COLS, no vigilanz/arb.ged.)
const TAP_COL_GROUPS = [
  { label: 'Alertness',   start: 0,  end: 5,  bg: [248, 250, 252] as [number,number,number] },
  { label: 'Go/Nogo 1',  start: 6,  end: 9,  bg: [241, 245, 249] as [number,number,number] },
  { label: 'Go/Nogo 2',  start: 10, end: 13, bg: [248, 250, 252] as [number,number,number] },
  { label: 'Flexibil.',  start: 14, end: 16, bg: [241, 245, 249] as [number,number,number] },
  { label: 'Get. Aufm.', start: 17, end: 23, bg: [248, 250, 252] as [number,number,number] },
  { label: 'Vis. Scan.', start: 24, end: 29, bg: [241, 245, 249] as [number,number,number] },
  { label: 'Neglect',    start: 30, end: 30, bg: [248, 250, 252] as [number,number,number] },
];

// ── Redo detection (vigilanz + arb.ged. flags still checked for redo section) ──

const TAP_GROUPS = [
  { label: 'Alertness',  flagKeys: ['flag_alM', 'flag_al23'] },
  { label: 'Go/Nogo',    flagKeys: ['flag_gn',  'flag_gn2']  },
  { label: 'Flexibil.',  flagKeys: ['flag_fl']               },
  { label: 'Get. Aufm.', flagKeys: ['flag_ga']               },
  { label: 'Vigilanz',   flagKeys: ['flag_vig']              },
  { label: 'Arb.Ged.',   flagKeys: ['flag_ag']               },
  { label: 'Vis. Scan.', flagKeys: ['flag_ve']               },
  { label: 'Neglect',    flagKeys: ['flag_neg', 'flag_gf']   },
] as const;

function isGroupFlagged(result: TestResult, flagKeys: readonly string[]): boolean {
  return flagKeys.some(k => !!result.rawValues[k]);
}

// ── Page layout constants ─────────────────────────────────────────────────────

const PW = 297;
const PH = 210;
const M  = 7;
const USABLE_W  = PW - 2 * M;          // 283 mm
const PAT_COL_W = 38;
const N_COLS    = TAP_ALL_COLS.length;  // 31
const DCW       = (USABLE_W - PAT_COL_W) / N_COLS; // ≈ 7.9 mm

const TITLE_H   = 11;
const GRP_BAR_H = 5;
const COL_HDR_H = 30;
const ROW_H     = 9;

const GROUP_BOUNDARIES = new Set(TAP_COL_GROUPS.filter(g => g.start > 0).map(g => g.start));

// ── Data types ────────────────────────────────────────────────────────────────

interface ProcessedPatient {
  patient: Patient;
  sessions: TestResult[];
  needsRedo: boolean;
  redoGroups: string[];
  noTap: boolean;
  latestPr: Record<string, string | null>;
  latestAborted: boolean;
  sessionDates: string;
  groupSessionCounts: number[];
}

function processPatient(patient: Patient, allResults: TestResult[]): ProcessedPatient {
  const sessions = allResults
    .filter(r => r.testId === 'tap')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const noTap = sessions.length === 0;

  const redoGroupSet = new Set<string>();
  for (const group of TAP_GROUPS) {
    for (const s of sessions) {
      if (isGroupFlagged(s, group.flagKeys)) redoGroupSet.add(group.label);
    }
  }
  const lastSession = sessions[sessions.length - 1] ?? null;
  const lastAborted = lastSession?.aborted ?? false;
  const needsRedo   = lastAborted || redoGroupSet.size > 0;
  const redoGroups  = lastAborted
    ? [`Sitzung abgebr. (${lastSession ? formatDate(lastSession.date) : '–'})`, ...redoGroupSet]
    : [...redoGroupSet];

  const prRecord = (lastSession?.percentileRanks ?? {}) as Record<string, string | number | undefined>;
  const latestPr: Record<string, string | null> = {};
  for (const col of TAP_ALL_COLS) {
    const val = prRecord[col.key];
    if (val !== undefined && val !== null) {
      const s = String(val).trim();
      latestPr[col.key] = (s !== '' && s !== 'n/a') ? s : null;
    } else {
      latestPr[col.key] = null;
    }
  }

  const groupSessionCounts = TAP_COL_GROUPS.map(grp => {
    const groupKeys = TAP_ALL_COLS.slice(grp.start, grp.end + 1).map(c => c.key);
    return sessions.filter(s => {
      const pr = (s.percentileRanks ?? {}) as Record<string, string | number | undefined>;
      return groupKeys.some(k => {
        const v = String(pr[k] ?? '').trim();
        return v !== '' && v !== 'n/a';
      });
    }).length;
  });

  return {
    patient,
    sessions,
    needsRedo,
    redoGroups,
    noTap,
    latestPr,
    latestAborted: lastAborted,
    sessionDates: sessions.map(s => formatDate(s.date)).join(' / '),
    groupSessionCounts,
  };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

// 45° hatching (/ direction), lines clipped to rect bounds
function drawHatch45(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  color: [number,number,number], step = 1.5,
): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.2);
  for (let d = step; d < w + h; d += step) {
    const x1 = x + Math.min(d, w);
    const y1 = y + Math.max(0, d - w);
    const x2 = x + Math.max(0, d - h);
    const y2 = y + Math.min(d, h);
    doc.line(x1, y1, x2, y2);
  }
}

function drawTitleBar(doc: jsPDF, title: string, meta: string): void {
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, PW, TITLE_H, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(title, M, TITLE_H - 2.5);
  if (meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(meta, PW - M, TITLE_H - 2.5, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
}

function drawTableHeaders(doc: jsPDF, y: number): number {
  // ── Group label bar ─────────────────────────────────────────────────────────
  doc.setFillColor(241, 245, 249);
  doc.rect(M, y, PAT_COL_W, GRP_BAR_H, 'F');

  for (const grp of TAP_COL_GROUPS) {
    const gx = M + PAT_COL_W + grp.start * DCW;
    const gw = (grp.end - grp.start + 1) * DCW;
    doc.setFillColor(...grp.bg);
    doc.rect(gx, y, gw, GRP_BAR_H, 'F');
    if (gw >= 5) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.5);
      doc.setTextColor(71, 85, 105);
      doc.text(grp.label, gx + gw / 2, y + 3.3, { align: 'center' });
    }
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(M, y + GRP_BAR_H, M + USABLE_W, y + GRP_BAR_H);

  y += GRP_BAR_H;

  // ── Column header area ──────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.rect(M, y, USABLE_W, COL_HDR_H, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Patient / Datum', M + 2, y + COL_HDR_H - 3);

  // Rotated headers: align:'left' means text starts at the anchor and extends upward
  // Anchor y = bottom of header area → text visually starts at the bottom
  const textBottomY = y + COL_HDR_H - 1.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(30, 41, 59);
  for (let i = 0; i < N_COLS; i++) {
    // x offset of -1.0 horizontally centres the ~1.9mm font body in each column
    const tx = M + PAT_COL_W + (i + 0.5) * DCW - 1.0;
    doc.text(TAP_ALL_COLS[i].label, tx, textBottomY, { angle: 90, align: 'left' });
  }

  // Patient col separator
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.5);
  doc.line(M + PAT_COL_W, y, M + PAT_COL_W, y + COL_HDR_H);

  // Group boundary separators
  for (const idx of GROUP_BOUNDARIES) {
    const lx = M + PAT_COL_W + idx * DCW;
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.5);
    doc.line(lx, y, lx, y + COL_HDR_H);
  }

  // Fine column lines within groups
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.1);
  for (let i = 1; i < N_COLS; i++) {
    if (!GROUP_BOUNDARIES.has(i)) {
      const lx = M + PAT_COL_W + i * DCW;
      doc.line(lx, y, lx, y + COL_HDR_H);
    }
  }

  // Bottom border
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.5);
  doc.line(M, y + COL_HDR_H, M + USABLE_W, y + COL_HDR_H);

  return y + COL_HDR_H;
}

function drawPatientRow(doc: jsPDF, p: ProcessedPatient, y: number, rowIdx: number): void {
  const rowBg: [number, number, number] = rowIdx % 2 === 0 ? [255, 255, 255] : [248, 250, 252];

  // ── Patient column ──────────────────────────────────────────────────────────
  doc.setFillColor(...rowBg);
  doc.rect(M, y, PAT_COL_W, ROW_H, 'F');

  if (p.needsRedo) {
    doc.setFillColor(...AMBER_STRIPE);
    doc.rect(M, y, 1.5, ROW_H, 'F');
  }

  const nameX    = M + (p.needsRedo ? 3.5 : 2);
  const maxNameW = PAT_COL_W - (p.needsRedo ? 5.5 : 3) - 10; // leave room for M1/M2 badge

  // Patient name (first wrapped line only)
  const nameLines = doc.splitTextToSize(p.patient.name, maxNameW) as string[];
  doc.setFont('helvetica', p.needsRedo ? 'bold' : 'normal');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(nameLines[0], nameX, y + 3.8);

  // Date line
  const mCount = p.sessions.length;
  const latestDate = mCount > 0
    ? formatDate(p.sessions[mCount - 1].date)
    : '';
  const sesPrefix = mCount >= 2 ? `${mCount}x · ` : '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${sesPrefix}${latestDate}`, nameX, y + 7.2, { maxWidth: PAT_COL_W - (p.needsRedo ? 5.5 : 3) });

  // ── PR data cells ───────────────────────────────────────────────────────────
  for (let ci = 0; ci < N_COLS; ci++) {
    const col  = TAP_ALL_COLS[ci];
    const cx   = M + PAT_COL_W + ci * DCW;
    const prRaw = p.latestPr[col.key];

    if (prRaw !== null && prRaw !== undefined) {
      const pr = parseNumericPr(prRaw);
      const belowAvg = pr !== null && isBelowAverage(pr, col.tapM);

      if (belowAvg) {
        // Below average: rose background + PR value
        doc.setFillColor(...ROSE_BG);
        doc.rect(cx, y, DCW, ROW_H, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...ROSE_FG);
        doc.text(prRaw, cx + DCW / 2, y + 5.5, { align: 'center' });
      } else {
        // Normal or above average: white bg + diagonal hatching
        doc.setFillColor(...rowBg);
        doc.rect(cx, y, DCW, ROW_H, 'F');
        drawHatch45(doc, cx, y, DCW, ROW_H, HATCH_LINE, 1.0);
      }
    } else if (p.latestAborted) {
      // Session aborted, this column not reached
      doc.setFillColor(...ORANGE_BG);
      doc.rect(cx, y, DCW, ROW_H, 'F');
    } else {
      // Not tested
      doc.setFillColor(...rowBg);
      doc.rect(cx, y, DCW, ROW_H, 'F');
    }
  }

  // ── Row / column lines ──────────────────────────────────────────────────────
  doc.setLineWidth(0.15);
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y + ROW_H, M + USABLE_W, y + ROW_H);

  doc.setLineWidth(0.4);
  doc.setDrawColor(100, 116, 139);
  doc.line(M + PAT_COL_W, y, M + PAT_COL_W, y + ROW_H);

  doc.setLineWidth(0.4);
  doc.setDrawColor(100, 116, 139);
  for (const idx of GROUP_BOUNDARIES) {
    const lx = M + PAT_COL_W + idx * DCW;
    doc.line(lx, y, lx, y + ROW_H);
  }

  doc.setLineWidth(0.1);
  doc.setDrawColor(226, 232, 240);
  for (let i = 1; i < N_COLS; i++) {
    if (!GROUP_BOUNDARIES.has(i)) {
      const lx = M + PAT_COL_W + i * DCW;
      doc.line(lx, y, lx, y + ROW_H);
    }
  }

  // Per-group measurement label centered over each group span
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  for (let gi = 0; gi < TAP_COL_GROUPS.length; gi++) {
    const count = p.groupSessionCounts[gi];
    if (count === 0) continue;
    const grp = TAP_COL_GROUPS[gi];
    const spanMidX = M + PAT_COL_W + (grp.start + (grp.end - grp.start + 1) / 2) * DCW;
    const label = count >= 2 ? '2. Messung' : '1. Messung';
    const labelColor: [number, number, number] = count >= 2 ? [30, 41, 59] : [100, 116, 139];
    doc.setTextColor(...labelColor);
    doc.text(label, spanMidX, y + 2.5, { align: 'center' });
  }
}

function drawSectionBar(
  doc: jsPDF,
  y: number,
  label: string,
  fill: [number,number,number],
  textColor: [number,number,number],
  border: [number,number,number],
): number {
  doc.setFillColor(...fill);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.25);
  doc.rect(M, y, USABLE_W, 6.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...textColor);
  doc.text(label, M + 3, y + 4.5);
  doc.setTextColor(0, 0, 0);
  return y + 8;
}

function drawLegend(doc: jsPDF, y: number): void {
  const OB = 3;
  let lx = M;
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');

  // Amber stripe
  doc.setFillColor(...AMBER_STRIPE);
  doc.rect(lx, y, 3, OB, 'F');
  doc.setTextColor(154, 52, 18);
  doc.text('Wiederholung ausstehend', lx + 5, y + OB - 0.5);
  lx += 50;

  // Hatching = normal/above average
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(lx, y, OB, OB, 'FD');
  drawHatch45(doc, lx, y, OB, OB, HATCH_LINE, 0.7);
  doc.setTextColor(71, 85, 105);
  doc.text('Normbereich / überdurchschn.', lx + OB + 1.5, y + OB - 0.5);
  lx += OB + 52;

  // Rose = below average
  doc.setFillColor(...ROSE_BG);
  doc.setDrawColor(...ROSE_FG);
  doc.setLineWidth(0.3);
  doc.rect(lx, y, OB, OB, 'FD');
  doc.setTextColor(...ROSE_FG);
  doc.text('Unterdurchschnittlich (PR < 16; Alert. M: PR < 31)', lx + OB + 1.5, y + OB - 0.5);
  lx += OB + 85;

  // Orange = aborted
  doc.setFillColor(...ORANGE_BG);
  doc.setDrawColor(...ORANGE_FG);
  doc.setLineWidth(0.3);
  doc.rect(lx, y, OB, OB, 'FD');
  doc.setTextColor(...ORANGE_FG);
  doc.text('Sitzung abgebrochen', lx + OB + 1.5, y + OB - 0.5);

  doc.setTextColor(0, 0, 0);
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function exportTapDailyPDF(
  data: { patient: Patient; results: TestResult[] }[],
): Promise<void> {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const processed = data.map(({ patient, results }) => processPatient(patient, results));
    const withTap   = processed.filter(p => !p.noTap);
    const noTap     = processed.filter(p => p.noTap);
    const needsRedo = processed.filter(p => p.needsRedo);

    const metaStr = [
      `Exportiert am ${formatDate(new Date().toISOString().split('T')[0])}`,
      withTap.length  > 0 ? `${withTap.length} Patient${withTap.length !== 1 ? 'en' : ''} mit TAP-Daten` : '',
      needsRedo.length > 0 ? `${needsRedo.length} mit ausstehender Wiederholung` : '',
    ].filter(Boolean).join('   ·   ');

    drawTitleBar(doc, 'TAP – Tagesübersicht', metaStr);
    let y = TITLE_H + 1;

    // ── Main overview table ────────────────────────────────────────────────────
    if (withTap.length > 0) {
      y = drawTableHeaders(doc, y);

      for (let ri = 0; ri < withTap.length; ri++) {
        if (y + ROW_H > PH - M) {
          doc.addPage();
          drawTitleBar(doc, 'TAP – Tagesübersicht (Forts.)', '');
          y = drawTableHeaders(doc, TITLE_H + 1);
        }
        drawPatientRow(doc, withTap[ri], y, ri);
        y += ROW_H;
      }

      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.5);
      doc.line(M, y, M + USABLE_W, y);
      y += 5;
    } else {
      y = TITLE_H + 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Keine TAP-Daten vorhanden.', M, y);
      y += 10;
    }

    // ── Legend ─────────────────────────────────────────────────────────────────
    if (y < PH - 18) {
      drawLegend(doc, y);
      y += 9;
    }

    // ── Ausstehende Wiederholungen ─────────────────────────────────────────────
    if (needsRedo.length > 0) {
      if (y > PH - 50) { doc.addPage(); y = M + 5; }

      y = drawSectionBar(doc, y, 'Ausstehende Wiederholungen',
        [255, 247, 237], [154, 52, 18], [253, 186, 116]);

      const redoBody = needsRedo.map(p => [
        p.patient.name,
        p.patient.status === 'aktiv' ? 'Aktiv' : 'Entlassen',
        p.patient.entlassdatum ? formatDate(p.patient.entlassdatum) : '–',
        p.sessionDates || '–',
        p.redoGroups.join('  ·  ') || '–',
      ]);

      autoTable(doc, {
        startY: y,
        head: [[
          { content: 'Patient',                   styles: { halign: 'left',   fontStyle: 'bold' } },
          { content: 'Status',                    styles: { halign: 'center', fontStyle: 'bold' } },
          { content: 'Entlassung',                styles: { halign: 'center', fontStyle: 'bold' } },
          { content: 'Sitzungsdaten',             styles: { halign: 'left',   fontStyle: 'bold' } },
          { content: 'Wiederholung erforderlich', styles: { halign: 'left',   fontStyle: 'bold' } },
        ]],
        body: redoBody,
        styles: {
          fontSize: 8,
          cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
          lineColor: [253, 186, 116] as [number, number, number],
          lineWidth: 0.15,
          valign: 'middle',
        },
        headStyles: {
          fillColor: [255, 237, 213] as [number, number, number],
          textColor: [154,  52,  18] as [number, number, number],
          fontSize: 8,
          fontStyle: 'bold',
          lineColor: [253, 186, 116] as [number, number, number],
          lineWidth: 0.2,
        },
        alternateRowStyles: { fillColor: [255, 250, 245] as [number, number, number] },
        columnStyles: {
          0: { cellWidth: 44,                      fontStyle: 'bold' },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 45 },
          4: { cellWidth: USABLE_W - 44 - 18 - 22 - 45 },
        },
        margin: { left: M, right: M },
        tableWidth: USABLE_W,
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 1) {
            const txt = Array.isArray(data.cell.text)
              ? data.cell.text.join('')
              : String(data.cell.text ?? '');
            data.cell.styles.textColor = txt === 'Aktiv'
              ? [22, 101, 52]   as [number,number,number]
              : [100, 116, 139] as [number,number,number];
          }
        },
      });

      y = (doc as any).lastAutoTable?.finalY ?? y + 20;
      y += 5;
    }

    // ── TAP noch nicht begonnen ────────────────────────────────────────────────
    if (noTap.length > 0) {
      if (y > PH - 35) { doc.addPage(); y = M; }

      y = drawSectionBar(doc, y, 'TAP noch nicht begonnen',
        [241, 245, 249], [71, 85, 105], [203, 213, 225]);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);

      const perRow = 4;
      const colWid = USABLE_W / perRow;
      noTap.forEach((p, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const lx  = M + col * colWid;
        const ly  = y + row * 5.5 + 4;
        if (ly < PH - 10) doc.text(p.patient.name, lx, ly);
      });
    }

    // ── Save ───────────────────────────────────────────────────────────────────
    const dateStr  = new Date().toISOString().split('T')[0];
    const filename = `TAP_Tagesuebersicht_${dateStr}.pdf`;
    if (isElectron()) {
      const uint8 = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
      await dbSavePdf(filename, Array.from(uint8));
    } else {
      doc.save(filename);
    }
  } catch (err) {
    console.error('TAP-Täglich PDF Fehler:', err);
    alert(`PDF Fehler: ${err instanceof Error ? err.message : String(err)}`);
  }
}
