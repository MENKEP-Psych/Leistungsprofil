import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Patient, TestResult, PRResult } from '../types';
import { formatDate } from './utils';
import { decodeField, decodeQuad } from '../components/NeglectShared';
import { isElectron, dbSavePdf } from './db-api';

// ── Neglect graphic helpers ───────────────────────────────────────────────────

// QuadValues: [UL, UR, LL, LR, center]
type QV = [string, string, string, string, string];

const GFX   = 18;    // graphic box size in mm
const GFX_H = GFX / 2;
const GFX_R = 3.4;   // circle radius for 'A' shape (18/96 * 18 ≈ 3.375)

/**
 * Draw one QuadGrid (cross or circle) at position (gx, gy).
 * gx/gy = top-left corner of the GFX×GFX bounding box.
 */
function drawQuadGrid(
  doc: jsPDF,
  gx: number,
  gy: number,
  values: QV,
  shape: 'cross' | 'circle',
): void {
  const cx = gx + GFX_H;
  const cy = gy + GFX_H;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.5);

  if (shape === 'cross') {
    doc.line(gx, cy, gx + GFX, cy);           // horizontal
    doc.line(cx, gy, cx, gy + GFX);           // vertical
  } else {
    // Arms stopping exactly at the circle boundary
    doc.line(cx, gy,           cx, cy - GFX_R);         // top
    doc.line(cx, cy + GFX_R,   cx, gy + GFX);           // bottom
    doc.line(gx, cy,           cx - GFX_R, cy);         // left
    doc.line(cx + GFX_R, cy,   gx + GFX, cy);           // right
    // White-filled circle on top
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, GFX_R, 'FD');
  }

  // Text positions for [UL, UR, LL, LR, center]
  const tx: [number, number][] = [
    [gx + GFX * 0.27, gy + GFX * 0.27],
    [gx + GFX * 0.73, gy + GFX * 0.27],
    [gx + GFX * 0.27, gy + GFX * 0.75],
    [gx + GFX * 0.73, gy + GFX * 0.75],
    [cx,              cy + 1.8         ],
  ];

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  values.forEach((v, i) => {
    const filled = v !== '' && v !== '0';
    if (filled) {
      doc.setTextColor(220, 38, 38);   // red, matching UI
      doc.text(v, tx[i][0], tx[i][1], { align: 'center' });
    } else {
      doc.setTextColor(180, 190, 200);
      doc.text('·', tx[i][0], tx[i][1], { align: 'center' });
    }
  });
  doc.setTextColor(0, 0, 0);
}

/** Draw a complete FieldSection (label + ML/MR + M cross + A circle).
 *  Returns the height consumed. */
function drawFieldSectionPDF(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  field: ReturnType<typeof decodeField>,
): number {
  // Section label
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(55, 65, 81);
  doc.text(label, x, y + 3.5);

  let cy = y + 7;

  // ML / MR latency values
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`M\u2082L = ${field.ml || '–'} ms`, x,      cy);
  doc.text(`M\u2082R = ${field.mr || '–'} ms`, x + 25, cy);
  cy += 4;

  // "M" shape label
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('M', x, cy + GFX_H + 1);

  // M cross  (left column)
  drawQuadGrid(doc, x + 4, cy, field.mq as QV, 'cross');

  // "A" shape label
  doc.text('A', x + 4 + GFX + 5, cy + GFX_H + 1);

  // A circle  (right column)
  drawQuadGrid(doc, x + 4 + GFX + 5 + 4, cy, field.aq as QV, 'circle');

  return (cy - y) + GFX + 3;   // total height consumed
}

// ── Domain helpers (mirrors PRProfile.tsx) ────────────────────────────────────

function getMajorDomain(domain?: string): string {
  if (!domain) return 'Weitere';
  const match = domain.match(/^(\d+\.\s*[^(]+)/);
  return match ? match[1].trim() : domain;
}

// ── Zone definitions (matches PRProfile.tsx) ──────────────────────────────────

const ZONES = [
  { min: 0,  max: 2.28,  color: '#991b1b' }, // dark red
  { min: 2.28,  max: 15.87, color: '#dc2626' }, // medium red
  { min: 15.87, max: 30.85, color: '#15803d' }, // light green
  { min: 30.85, max: 69.15, color: '#166534' }, // strong green
  { min: 69.15, max: 84.1,  color: '#15803d' }, // light green
  { min: 84.1,  max: 97.72, color: '#7c3aed' }, // medium violet
  { min: 97.72, max: 100,   color: '#4c1d95' }, // dark violet
];

// ── Color helpers ─────────────────────────────────────────────────────────────

function hex2rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

/** Blend hex color with white (simulates low-opacity fill) */
function tint(hex: string, strength = 0.13): [number, number, number] {
  const [r, g, b] = hex2rgb(hex);
  return [
    Math.round(r * strength + 255 * (1 - strength)),
    Math.round(g * strength + 255 * (1 - strength)),
    Math.round(b * strength + 255 * (1 - strength)),
  ];
}

function zoneColor(pr: number): string {
  for (const z of ZONES) if (pr >= z.min && pr <= z.max) return z.color;
  return '#16a34a';
}

/**
 * Draw text at (x, y) using the current font, but render any Σ characters
 * using the PDF built-in Symbol font (where 'S' at position 0x53 = Σ).
 * Preserves the current font/style after the call.
 */
function drawTextWithSigma(doc: jsPDF, text: string, x: number, y: number): void {
  if (!text.includes('Σ')) {
    doc.text(text, x, y);
    return;
  }
  const font = doc.getFont();
  const parts = text.split('Σ');
  let cx = x;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      doc.setFont('symbol', 'normal');
      doc.text('S', cx, y);
      cx += doc.getTextWidth('S');
      doc.setFont(font.fontName, font.fontStyle);
    }
    if (parts[i]) {
      doc.text(parts[i], cx, y);
      cx += doc.getTextWidth(parts[i]);
    }
  }
}

function parseRange(pr: number | string): [number, number] | null {
  if (typeof pr === 'number') return null;
  const s = pr.toString().trim();
  // "N->95" (VLMT flat-zone ending)
  const mTop = s.match(/^(\d+(?:\.\d+)?)->95$/);
  if (mTop) { const a = parseFloat(mTop[1]); return isNaN(a) ? null : [a, 100]; }
  // ">N"
  const mGt = s.match(/^>\s*(\d+(?:\.\d+)?)$/);
  if (mGt)  { const a = parseFloat(mGt[1]);  return isNaN(a) ? null : [a, 100]; }
  // "<N"
  const mLt = s.match(/^<\s*(\d+(?:\.\d+)?)$/);
  if (mLt)  { const a = parseFloat(mLt[1]);  return isNaN(a) ? null : [0, a];   }
  // "N-M" or "N–M"
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const a = parseFloat(m[1]), b = parseFloat(m[2]);
  return [Math.min(a, b), Math.max(a, b)];
}

function prToNum(pr: number | string): number {
  if (typeof pr === 'number') return Math.min(99, Math.max(1, pr));
  const str = pr.toString().trim();
  if (str.startsWith('≤')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 1 : Math.max(0.5, v / 2); }
  if (str.startsWith('≥')) { const v = parseFloat(str.slice(1)); return isNaN(v) ? 99 : Math.min(99.5, v); }
  if (str.startsWith('<')) return Math.max(0.5, parseFloat(str.slice(1).trim()) - 1);
  if (str.startsWith('>')) return Math.min(99.5, parseFloat(str.slice(1).trim()) + 1);
  const rng = parseRange(pr);
  if (rng) return (rng[0] + rng[1]) / 2;
  const n = parseFloat(str);
  return isNaN(n) ? 50 : Math.min(99, Math.max(1, n));
}

// ── Page layout constants ─────────────────────────────────────────────────────

const PW = 210;          // A4 width mm
const PH = 297;          // A4 height mm
const M = 12;            // margin
const HDR_H = 15;        // header height
const CS = HDR_H + 5;    // content start y

// Chart geometry
const LBL_W = 70;                    // label column width
const PR_COL_W = 22;                 // PR value column width
const CHTX = M + LBL_W + 2;         // chart area start x
const CHTW = PW - CHTX - PR_COL_W - M;  // chart area width
const PRX  = CHTX + CHTW + 2;           // PR text column x

// ── Equal-width zone scale (mirrors PRProfile.tsx) ───────────────────────────

const EQ_BOUNDS  = [0, 2.28, 15.87, 30.85, 69.15, 84.1, 97.72, 100];
const EQ_N       = 7;
const EQ_COLORS  = ['#991b1b', '#dc2626', '#15803d', '#166534', '#15803d', '#7c3aed', '#4c1d95'];
const EQ_LABELS  = ['0–2', '2–16', '16–31', '31–69', '69–84', '84–98', '98–100'];

/** Map a PR value → visual % position on the equal-width scale (0–100). */
function prEqPct(pr: number): number {
  const p = Math.max(0, Math.min(100, pr));
  const ZW = 100 / EQ_N;
  for (let i = 0; i < EQ_N; i++) {
    const lo = EQ_BOUNDS[i], hi = EQ_BOUNDS[i + 1];
    if (p <= hi || i === EQ_N - 1) {
      const t = hi > lo ? (p - lo) / (hi - lo) : 0;
      return (i + Math.max(0, Math.min(1, t))) * ZW;
    }
  }
  return 100;
}

/** Map a PR value → absolute x coordinate in the chart area. */
function prEqX(pr: number): number {
  return CHTX + prEqPct(pr) / 100 * CHTW;
}

// ── Per-page header ───────────────────────────────────────────────────────────

function drawPageHeader(doc: jsPDF, patient: Patient, pageN: number) {
  // Indigo background
  const [ir, ig, ib] = hex2rgb('#4338ca');
  doc.setFillColor(ir, ig, ib);
  doc.rect(0, 0, PW, HDR_H, 'F');

  doc.setTextColor(255, 255, 255);

  // "LEISTUNGSPROFIL" label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('LEISTUNGSPROFIL', M, 5.5);

  // Patient name (Nachname, Vorname)
  const parts = patient.name.trim().split(' ');
  const last  = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${last}, ${first}`, M + 37, 6);

  // Info line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const infoParts: string[] = [`*${formatDate(patient.geburtsdatum)}`];
  if (patient.bildungsjahre) infoParts.push(`Bildung: ${patient.bildungsjahre} J.`);
  if (patient.neuropsychologin) infoParts.push(`NP: ${patient.neuropsychologin}`);
  if (patient.station) infoParts.push(`Station: ${patient.station}`);
  if (patient.diagnose) infoParts.push(`Diag.: ${patient.diagnose}`);
  if (patient.aufnahmedatum) infoParts.push(`Aufn.: ${formatDate(patient.aufnahmedatum)}`);
  if (patient.entlassdatum) infoParts.push(`Entl.: ${formatDate(patient.entlassdatum)}`);
  doc.text(infoParts.join('   ·   '), M + 37, 12);

  // Page number (right-aligned)
  doc.setFontSize(7.5);
  doc.text(`Seite ${pageN}`, PW - M, 9, { align: 'right' });

  doc.setTextColor(0, 0, 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sectionHeader(doc: jsPDF, y: number, title: string): number {
  const [sr, sg, sb] = tint('#4338ca', 0.09);
  doc.setFillColor(sr, sg, sb);
  doc.setDrawColor(200, 210, 240);
  doc.setLineWidth(0.3);
  doc.rect(M, y, PW - 2 * M, 7, 'FD');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(55, 48, 163); // indigo-800
  doc.text(title, M + 3, y + 4.8);
  doc.setTextColor(0, 0, 0);
  return y + 9;
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportProfilePDF(
  patient: Patient,
  profileData: PRResult[],
  results: TestResult[],
  generalNote: string,
): Promise<void> {
  try {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = CS;
  let pageN = 1;

  drawPageHeader(doc, patient, pageN);

  const newPage = () => {
    doc.addPage();
    pageN++;
    drawPageHeader(doc, patient, pageN);
    y = CS;
  };

  const ensure = (needed: number) => {
    if (y + needed > PH - 14) newPage();
  };

  // ── Patient info box ───────────────────────────────────────────────────────

  const medParts: string[] = [];
  if (patient.diagnose) medParts.push(`Diagnose: ${patient.diagnose}`);
  if (patient.lokalisation) medParts.push(`Lok.: ${patient.lokalisation}`);
  if (patient.station) medParts.push(`Station: ${patient.station}`);
  if (patient.zimmer) medParts.push(`Zimmer: ${patient.zimmer}`);
  const hasMedInfo = medParts.length > 0;
  const boxH = hasMedInfo ? 30 : 24;

  const [br, bg, bb] = tint('#4338ca', 0.05);
  doc.setFillColor(br, bg, bb);
  doc.setDrawColor(210, 214, 253);
  doc.setLineWidth(0.3);
  doc.rect(M, y, PW - 2 * M, boxH, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(99, 102, 241);
  doc.text('PATIENT', M + 3, y + 5);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(patient.name, M + 3, y + 11.5);

  const detailItems: string[] = [];
  detailItems.push(`*${formatDate(patient.geburtsdatum)}`);
  detailItems.push(patient.geschlecht === 'm' ? 'Männlich' : patient.geschlecht === 'w' ? 'Weiblich' : 'Divers');
  if (patient.bildungsjahre) detailItems.push(`${patient.bildungsjahre} Bildungsjahre`);
  if (patient.neuropsychologin) detailItems.push(`NP: ${patient.neuropsychologin}`);
  if (patient.aufnahmedatum) detailItems.push(`Aufnahme: ${formatDate(patient.aufnahmedatum)}`);
  if (patient.entlassdatum) detailItems.push(`Entlassung: ${formatDate(patient.entlassdatum)}`);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(detailItems.join('   ·   '), M + 3, y + 18);

  if (hasMedInfo) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(medParts.join('   ·   '), M + 3, y + 25);
  }

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Exportiert am ${formatDate(new Date().toISOString().split('T')[0])}`, PW - M, y + 18, { align: 'right' });

  y += boxH + 4;

  // ── PR CHART SECTION ───────────────────────────────────────────────────────

  if (profileData.length > 0) {
    ensure(55);
    y = sectionHeader(doc, y, 'Leistungsprofil – Übersicht');

    const ZW = CHTW / EQ_N;   // mm width of one equal zone

    // ── Header row 1: Main categories ──────────────────────────────────────
    const H_CAT = 3.5;
    const MAIN_CATS_DEF = [
      { label: 'Unterdurchschnittlich', from: 0, to: 2, color: '#dc2626' },
      { label: 'Durchschnittlich',      from: 2, to: 5, color: '#166534' },
      { label: 'Überdurchschnittlich',  from: 5, to: 7, color: '#7c3aed' },
    ];
    MAIN_CATS_DEF.forEach((cat, ci) => {
      const cx = CHTX + cat.from * ZW;
      const cw = (cat.to - cat.from) * ZW;
      const [cr, cg, cb] = hex2rgb(cat.color);
      doc.setFillColor(
        Math.round(cr * 0.08 + 255 * 0.92),
        Math.round(cg * 0.08 + 255 * 0.92),
        Math.round(cb * 0.08 + 255 * 0.92),
      );
      doc.rect(cx, y, cw, H_CAT, 'F');
      if (ci > 0) {
        doc.setDrawColor(cr, cg, cb);
        doc.setLineWidth(0.7);
        doc.line(cx, y, cx, y + H_CAT);
      }
      doc.setFontSize(5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(cr, cg, cb);
      doc.text(cat.label.toUpperCase(), cx + cw / 2, y + 2.4, { align: 'center' });
    });
    y += H_CAT;

    // ── Header row 2: Sub-zone color strip ──────────────────────────────────
    const H_STRIP = 2.5;
    EQ_COLORS.forEach((col, i) => {
      const [r, g, b] = hex2rgb(col);
      doc.setFillColor(r, g, b);
      doc.rect(CHTX + i * ZW, y, ZW, H_STRIP, 'F');
      if (i < EQ_N - 1) {
        const major = (i === 1 || i === 4);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(major ? 0.7 : 0.2);
        doc.line(CHTX + (i + 1) * ZW, y, CHTX + (i + 1) * ZW, y + H_STRIP);
      }
    });
    y += H_STRIP;

    // ── Header row 3: PR range labels ───────────────────────────────────────
    const H_LBL = 3;
    EQ_LABELS.forEach((lbl, i) => {
      const [r, g, b] = hex2rgb(EQ_COLORS[i]);
      doc.setFillColor(
        Math.round(r * 0.10 + 255 * 0.90),
        Math.round(g * 0.10 + 255 * 0.90),
        Math.round(b * 0.10 + 255 * 0.90),
      );
      doc.rect(CHTX + i * ZW, y, ZW, H_LBL, 'F');
      doc.setFontSize(4.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(r, g, b);
      doc.text(lbl, CHTX + i * ZW + ZW / 2, y + 2.1, { align: 'center' });
    });
    y += H_LBL;

    // ── Tick marks at zone boundaries ───────────────────────────────────────
    const H_TICK = 5;
    EQ_BOUNDS.forEach((pr, i) => {
      const tx = CHTX + i * ZW;
      doc.setDrawColor(160, 170, 180);
      doc.setLineWidth(0.2);
      doc.line(tx, y, tx, y + 2);
      doc.setFontSize(4.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 130, 150);
      const tickLbl = pr % 1 === 0 ? String(pr) : pr.toFixed(0);
      doc.text(tickLbl, tx, y + 4.5, { align: 'center' });
    });

    // Column header labels
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184);
    doc.text('Test', M, y + 4.5);
    doc.text('PR', PRX + PR_COL_W / 2, y + 4.5, { align: 'center' });
    y += H_TICK;

    // ── Group rows ──────────────────────────────────────────────────────────
    const groupMap = new Map<string, PRResult[]>();
    profileData.forEach(r => {
      const g = getMajorDomain(r.domain);
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(r);
    });

    // Sort groups numerically by leading number (mirrors PRProfile.tsx)
    const groups = [...groupMap.entries()].sort(([a], [b]) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    const numPrefix = (s: string) => parseFloat(s.match(/^[\d.]+/)?.[0] ?? '0');

    for (const [groupName, groupResults] of groups) {
      ensure(10 + groupResults.length * 8);

      // Group header bar
      const [gr, gg, gb] = tint('#4338ca', 0.07);
      doc.setFillColor(gr, gg, gb);
      doc.setDrawColor(200, 210, 240);
      doc.setLineWidth(0.2);
      doc.rect(M, y, PW - 2 * M, 5, 'FD');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(55, 48, 163);
      doc.text(groupName, M + 2.5, y + 3.4);
      y += 5;

      // Sort subdomains ascending by numeric prefix
      const subdomains = [...new Set(groupResults.map(r => r.subdomain ?? '').filter(Boolean))]
        .sort((a, b) => numPrefix(a) - numPrefix(b));
      const noSubResults = groupResults.filter(r => !r.subdomain);

      let rowIdx = 0;

      const renderPRRow = (result: PRResult) => {
        ensure(9);
        const ROW_H = 8;
        const ri = rowIdx++;
        const isAbortedNoData = result.aborted && (result.currentPr === 'n/a' || result.currentPr === undefined);

        const rowBg = ri % 2 === 0 ? 255 : 250;

        if (isAbortedNoData) {
          // Orange-tinted abort row
          doc.setFillColor(255, 247, 237);
          doc.rect(M, y, PW - 2 * M, ROW_H, 'F');

          // Left sidebar stripe
          doc.setFillColor(253, 186, 116); // orange-300
          doc.rect(M, y, 1.5, ROW_H, 'F');

          // Label
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          drawTextWithSigma(doc, result.label, M + 3, y + 3.6);

          // Abort comment in chart area
          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(194, 65, 12);
          const abortText = result.abortComment || 'Test abgebrochen / unvollständig';
          const maxAbortW = CHTW + PR_COL_W - 4;
          const abortLine = doc.splitTextToSize(abortText, maxAbortW)[0] as string;
          doc.text(abortLine, CHTX + 2, y + 3.6);

          // "Abgebr." in PR column
          doc.setFontSize(6);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(194, 65, 12);
          doc.text('Abgebr.', PRX, y + 3.6);

          // Previous PR (outlined, if any)
          if (result.previousPr !== undefined) {
            const pNum = prToNum(result.previousPr);
            const [pr2, pg2, pb2] = hex2rgb(zoneColor(pNum));
            doc.setDrawColor(pr2, pg2, pb2);
            doc.setFillColor(255, 255, 255);
            doc.setLineWidth(0.5);
            doc.rect(prEqX(pNum) - 1.5, y + 1.5, 3, ROW_H - 3, 'FD');
            doc.setFontSize(5.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(150, 160, 180);
            doc.text(`(${result.previousPr})`, PRX, y + 6.8);
          }
        } else {
          doc.setFillColor(rowBg, rowBg, rowBg);
          doc.rect(M, y, PW - 2 * M, ROW_H, 'F');

          EQ_COLORS.forEach((col, i) => {
            const [r, g, b] = hex2rgb(col);
            doc.setFillColor(
              Math.round(r * 0.10 + rowBg * 0.90),
              Math.round(g * 0.10 + rowBg * 0.90),
              Math.round(b * 0.10 + rowBg * 0.90),
            );
            doc.rect(CHTX + i * ZW, y, ZW, ROW_H, 'F');
          });

          for (let i = 1; i < EQ_N; i++) {
            const major = (i === 2 || i === 5);
            doc.setDrawColor(major ? 100 : 210, major ? 110 : 215, major ? 135 : 230);
            doc.setLineWidth(major ? 0.4 : 0.15);
            doc.line(CHTX + i * ZW, y, CHTX + i * ZW, y + ROW_H);
          }

          const cNum = prToNum(result.currentPr);
          const cRng = parseRange(result.currentPr);
          const [cr, cg, cb] = hex2rgb(zoneColor(cNum));

          if (result.previousPr !== undefined) {
            const pNum = prToNum(result.previousPr);
            const pRng = parseRange(result.previousPr);
            const [pr2, pg2, pb2] = hex2rgb(zoneColor(pNum));
            doc.setDrawColor(pr2, pg2, pb2);
            doc.setFillColor(255, 255, 255);
            doc.setLineWidth(0.5);
            if (pRng) {
              const px = prEqX(pRng[0]);
              const pw = Math.max(prEqX(pRng[1]) - px, 1.5);
              doc.rect(px, y + 1.5, pw, ROW_H - 3, 'FD');
            } else {
              doc.rect(prEqX(pNum) - 1.5, y + 1.5, 3, ROW_H - 3, 'FD');
            }
          }

          doc.setLineWidth(0);
          if (cRng) {
            const [lo, hi] = cRng;
            const barY = y + 1.5;
            const barH = ROW_H - 3;
            const activeSegs = ZONES.filter(z => z.max > lo && z.min < hi);
            activeSegs.forEach((z, si) => {
              const segLo = Math.max(lo, z.min);
              const segHi = Math.min(hi, z.max);
              const sx = prEqX(segLo);
              const sw = Math.max(prEqX(segHi) - sx, 0.3);
              const [zr, zg, zb] = hex2rgb(z.color);
              doc.setFillColor(zr, zg, zb);
              doc.setLineWidth(0);
              doc.rect(sx, barY, sw, barH, 'F');
              doc.setDrawColor(zr, zg, zb);
              doc.setLineWidth(0.5);
              doc.line(sx, barY,        sx + sw, barY);
              doc.line(sx, barY + barH, sx + sw, barY + barH);
              if (si === 0)                     doc.line(sx,      barY, sx,      barY + barH);
              if (si === activeSegs.length - 1) doc.line(sx + sw, barY, sx + sw, barY + barH);
            });
          } else {
            doc.setFillColor(cr, cg, cb);
            doc.rect(prEqX(cNum) - 1.5, y + 1.5, 3, ROW_H - 3, 'F');
          }

          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          drawTextWithSigma(doc, result.label, M, y + 3.6);
          if (result.tapVersion) {
            const labelWidth = doc.getTextWidth(result.label);
            doc.setTextColor(217, 119, 6);
            doc.setFontSize(6);
            doc.setFont('helvetica', 'bold');
            doc.text(` ${result.tapVersion}`, M + labelWidth, y + 3.6);
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(7);
          }
          if (result.lpsKorrektur) {
            const labelWidth = doc.getTextWidth(result.label);
            doc.setTextColor(3, 105, 161); // sky-700
            doc.setFontSize(6);
            doc.setFont('helvetica', 'bold');
            doc.text(` [${result.lpsKorrektur}]`, M + labelWidth, y + 3.6);
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(7);
          }

          if (result.details?.[0]) {
            doc.setFontSize(5.5);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            drawTextWithSigma(doc, result.details[0], M, y + 6.8);
          }

          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(cr, cg, cb);
          doc.text(String(result.currentPr), PRX, y + 3.6);
          if (result.previousPr !== undefined) {
            doc.setFontSize(5.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(150, 160, 180);
            doc.text(`(${result.previousPr})`, PRX, y + 6.8);
          }
        }

        y += ROW_H;
        doc.setDrawColor(230, 235, 245);
        doc.setLineWidth(0.15);
        doc.line(CHTX, y, CHTX + CHTW, y);
      };

      // Rows without subdomain first
      noSubResults.forEach(renderPRRow);

      // Then subdomains in sorted order
      subdomains.forEach(sub => {
        ensure(6);
        // Subdomain header strip
        doc.setFillColor(245, 246, 250);
        doc.setDrawColor(220, 224, 235);
        doc.setLineWidth(0.2);
        doc.rect(M, y, PW - 2 * M, 4.5, 'FD');
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(sub.toUpperCase(), M + 2.5, y + 3.1);
        y += 4.5;

        groupResults.filter(r => r.subdomain === sub).forEach(renderPRRow);
      });

      y += 3;
    }

    // ── Text results (Bürotest, Tagesplan) ───────────────────────────────────
    type TGItem = { label: string; text: string };
    type TG = { name: string; items: TGItem[]; date?: string; examiner?: string; note?: string };
    const textGroups: TG[] = [];

    const bueroRes = results
      .filter(r => r.testId === 'buerotest')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (bueroRes) {
      const tgItems: TGItem[] = [];
      if (String(bueroRes.rawValues.aufgabe1 ?? '').trim())
        tgItems.push({ label: 'Aufgabe 1', text: String(bueroRes.rawValues.aufgabe1) });
      if (String(bueroRes.rawValues.aufgabe6 ?? '').trim())
        tgItems.push({ label: `Aufgabe 6${bueroRes.rawValues.aufgabe6variant ? ` (${bueroRes.rawValues.aufgabe6variant})` : ''}`, text: String(bueroRes.rawValues.aufgabe6) });
      if (tgItems.length > 0)
        textGroups.push({ name: 'Bürotest', items: tgItems, date: bueroRes.date, examiner: bueroRes.examiner, note: bueroRes.note });
    }

    const tagesplanRes = results
      .filter(r => r.testId === 'tagesplan')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (tagesplanRes && String(tagesplanRes.rawValues.planText ?? '').trim())
      textGroups.push({ name: 'Tagesplan', items: [{ label: 'Tagesplan', text: String(tagesplanRes.rawValues.planText) }], date: tagesplanRes.date, examiner: tagesplanRes.examiner, note: tagesplanRes.note });

    const ZW2 = CHTW / EQ_N;
    const lineH = 3.2;
    const txtW = PW - CHTX - M - 2;

    for (const tg of textGroups) {
      // Compute dynamic row height
      let totalRowH = 5;
      const wrappedLines: string[][] = [];
      for (const item of tg.items) {
        const lines = doc.splitTextToSize(item.text, txtW) as string[];
        wrappedLines.push(lines);
        totalRowH += 3.5 + lines.length * lineH + 2;
      }
      if (tg.note) totalRowH += lineH + 1;
      totalRowH = Math.max(12, totalRowH);

      ensure(8 + totalRowH);

      // Group header bar
      const [gh_r, gh_g, gh_b] = tint('#4338ca', 0.07);
      doc.setFillColor(gh_r, gh_g, gh_b);
      doc.setDrawColor(200, 210, 240);
      doc.setLineWidth(0.2);
      doc.rect(M, y, PW - 2 * M, 5, 'FD');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(55, 48, 163);
      doc.text(tg.name, M + 2.5, y + 3.4);
      y += 5;

      // Row background (white)
      doc.setFillColor(255, 255, 255);
      doc.rect(M, y, PW - 2 * M, totalRowH, 'F');

      // Zone background strips
      EQ_COLORS.forEach((col, i) => {
        const [r, g, b] = hex2rgb(col);
        doc.setFillColor(
          Math.round(r * 0.10 + 255 * 0.90),
          Math.round(g * 0.10 + 255 * 0.90),
          Math.round(b * 0.10 + 255 * 0.90),
        );
        doc.rect(CHTX + i * ZW2, y, ZW2, totalRowH, 'F');
      });
      // Zone dividers
      for (let i = 1; i < EQ_N; i++) {
        const major = (i === 2 || i === 5);
        doc.setDrawColor(major ? 100 : 210, major ? 110 : 215, major ? 135 : 230);
        doc.setLineWidth(major ? 0.4 : 0.15);
        doc.line(CHTX + i * ZW2, y, CHTX + i * ZW2, y + totalRowH);
      }

      // Left column: test name + date
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(tg.name, M, y + 4);
      if (tg.date) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(formatDate(tg.date) + (tg.examiner ? ` · ${tg.examiner}` : ''), M, y + 7.5);
      }

      // Right column: items (chart area)
      let textY = y + 3;
      for (let ii = 0; ii < tg.items.length; ii++) {
        const item = tg.items[ii];
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(item.label.toUpperCase(), CHTX + 2, textY + 2);
        textY += 3.5;
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        for (const line of wrappedLines[ii]) {
          doc.text(line, CHTX + 2, textY + 2);
          textY += lineH;
        }
        textY += 2;
      }
      if (tg.note) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(130, 140, 160);
        doc.text(tg.note, CHTX + 2, textY + 2);
      }

      y += totalRowH + 3;
    }

    // ── Legend ──────────────────────────────────────────────────────────────
    ensure(8);
    y += 2;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);

    // Aktuelle Messung – solid filled bar
    doc.setFillColor(100, 116, 139);
    doc.setLineWidth(0);
    doc.rect(M, y + 0.5, 3, 3.5, 'F');
    doc.text('Aktuelle Messung', M + 5, y + 2.8);

    // Vorherige Messung – white fill, solid outline
    doc.setDrawColor(100, 116, 139);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.rect(M + 46, y + 0.5, 4, 3.5, 'FD');
    doc.text('Vorherige Messung', M + 52, y + 2.8);

    // PR-Spanne – zone-colored segments with border
    const spanX = M + 102;
    const spanW = 10;
    const spanY = y + 0.8;
    const spanH = 3;
    // Red segment (~43% of width)
    const [rr1, rg1, rb1] = hex2rgb('#dc2626');
    doc.setFillColor(rr1, rg1, rb1);
    doc.setLineWidth(0);
    doc.rect(spanX, spanY, spanW * 0.43, spanH, 'F');
    // Green segment (~57% of width)
    const [rr2, rg2, rb2] = hex2rgb('#15803d');
    doc.setFillColor(rr2, rg2, rb2);
    doc.rect(spanX + spanW * 0.43, spanY, spanW * 0.57, spanH, 'F');
    // Border around whole span
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.rect(spanX, spanY, spanW, spanH, 'D');
    doc.text('PR-Spanne', spanX + spanW + 2, y + 2.8);

    y += 8;
  }

  // ── DETAILED RESULTS ──────────────────────────────────────────────────────

  newPage();
  y = sectionHeader(doc, y, 'Detaillierte Testergebnisse');
  y += 2;

  // Helper: autotable wrapper
  const renderTable = (startY: number, head: string[][], body: (string | number)[][], colWidths?: number[], extraOpts?: Record<string, unknown>) => {
    const opts: Record<string, unknown> = {
      startY,
      head,
      body,
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [238, 240, 255], textColor: [55, 48, 163], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: M, right: M },
      tableWidth: PW - 2 * M,
      ...extraOpts,
    };
    if (colWidths) opts.columnStyles = Object.fromEntries(colWidths.map((w, i) => [i, { cellWidth: w }]));
    autoTable(doc, opts);
    return ((doc as any).lastAutoTable?.finalY ?? startY + 10) as number;
  };

  // ── TMT ──
  const tmtResults = results
    .filter(r => r.testId === 'tmt')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (tmtResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'Trail Making Test (TMT)');
    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'Teil A (s)', 'PR A', 'Teil B (s)', 'PR B', 'Notiz']],
      tmtResults.map((r, i) => {
        const msLabel = (i === 0 ? 'Aktuell' : `Messung ${tmtResults.length - i}`) + (r.aborted ? ' (Abgebr.)' : '');
        const noteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        return [msLabel, formatDate(r.date), r.examiner || '–',
          r.rawValues.A != null ? String(r.rawValues.A) : '–', String(r.percentileRanks.A ?? '–'),
          r.rawValues.B != null ? String(r.rawValues.B) : '–', String(r.percentileRanks.B ?? '–'),
          noteVal];
      }),
    ) + 6;
  }

  // ── VLMT ──
  const vlmtResults = results
    .filter(r => r.testId === 'vlmt')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (vlmtResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'Verbaler Lern- und Merkfähigkeitstest (VLMT)');
    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'Dg1', 'Dg5', 'S1\u20135', 'Dg6', 'Dg7', 'WR', 'Notiz']],
      vlmtResults.map((r, i) => {
        const v = r.rawValues;
        const msLabel = (i === 0 ? 'Aktuell' : `Messung ${vlmtResults.length - i}`) + (r.aborted ? ' (Abgebr.)' : '');
        const noteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        return [msLabel, formatDate(r.date), r.examiner || '–',
          String(v.Dg1 ?? '–'), String(v.Dg5 ?? '–'), String(r.calculatedValues.sumDg1_5 ?? '–'),
          String(v.Dg6 ?? '–'), String(v.Dg7 ?? '–'), String(v.W ?? '–'), noteVal];
      }),
      undefined,
      {
        // Re-draw the 'S1–5' header cell using the Symbol font so 'S' renders as Σ
        didDrawCell: (data: any) => {
          if (data.section !== 'head') return;
          const cellText: string = Array.isArray(data.cell.text) ? data.cell.text.join('') : String(data.cell.text);
          if (!cellText.startsWith('S') || !cellText.includes('\u2013')) return;
          // Cover autoTable's already-drawn text with the head background
          doc.setFillColor(238, 240, 255);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          // Compute baseline y matching autoTable's middle valign
          const fontSize = 7;
          const lineH = doc.getLineHeightFactor() * fontSize / doc.internal.scaleFactor;
          const textY = data.cell.y + data.cell.height / 2 + lineH / 2;
          const textX = data.cell.x + data.cell.padding('left');
          // Draw Σ in Symbol font, then '1–5' back in Helvetica bold
          doc.setFontSize(fontSize);
          doc.setTextColor(55, 48, 163);
          doc.setFont('symbol', 'normal');
          doc.text('S', textX, textY);
          const sigmaW = doc.getTextWidth('S');
          doc.setFont('helvetica', 'bold');
          doc.text('1\u20135', textX + sigmaW, textY);
          doc.setTextColor(0, 0, 0);
        },
      },
    ) + 6;
  }

  // ── TOL ──
  const tolResults = results
    .filter(r => r.testId === 'tol')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (tolResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'Turm von London (TOL)');
    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'Rohwert', 'PR (Alter)', 'PR (Alter + Bildung)', 'Notiz']],
      tolResults.map((r, i) => {
        const msLabel = (i === 0 ? 'Aktuell' : `Messung ${tolResults.length - i}`) + (r.aborted ? ' (Abgebr.)' : '');
        const noteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        return [msLabel, formatDate(r.date), r.examiner || '–',
          String(r.rawValues.rohwert ?? '–'), String(r.percentileRanks.alterkorrigiert ?? '–'),
          String(r.percentileRanks.alter_bildung ?? '–'), noteVal];
      }),
    ) + 6;
  }

  // ── TAP ──
  const tapResults = results
    .filter(r => r.testId === 'tap')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (tapResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'TAP – Testbatterie zur Aufmerksamkeitsprüfung');

    const tapRows: (string | number)[][] = [];
    tapResults.forEach((r, i) => {
      const rv = r.rawValues;
      const pr = r.percentileRanks;
      const msLabel = i === 0 ? 'Aktuell' : `Messung ${tapResults.length - i}`;
      const date  = formatDate(r.date);
      const exam  = r.examiner || '–';
      const abortNote = r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : '';
      const sessionNote = [r.note, abortNote].filter(Boolean).join(' | ') || '–';
      const sessionLabel = r.aborted ? msLabel + ' (Abgebr.)' : msLabel;

      const subtestRows: Array<{sub: string; rt: string; sd: string; fehler: string; ausl: string; prVal: string}> = [];

      const vStr = (k: string) => { const x = String(rv[k] ?? '').trim(); return x || '–'; };
      const pStr = (k: string) => { const x = String(pr[k] ?? '').trim(); return x || '–'; };
      const sdPrStr = (k: string) => { const x = String(rv[k] ?? '').trim(); return x ? ` (SD-PR: ${x})` : ''; };

      if (rv.alM_rt) subtestRows.push({
        sub: 'Alertness [M]', rt: vStr('alM_rt'), sd: vStr('alM_sd'),
        fehler: '–', ausl: '–', prVal: pStr('alertnessM') + sdPrStr('alM_sd_pr'),
      });
      if (rv.al23_ohne_rt) subtestRows.push({
        sub: 'Alertness [2.3] ohne', rt: vStr('al23_ohne_rt'), sd: vStr('al23_ohne_sd'),
        fehler: '–', ausl: '–', prVal: pStr('alertness23_ohne') + sdPrStr('al23_ohne_sd_pr'),
      });
      if (rv.al23_mit_rt) subtestRows.push({
        sub: 'Alertness [2.3] mit', rt: vStr('al23_mit_rt'), sd: vStr('al23_mit_sd'),
        fehler: '–', ausl: '–', prVal: pStr('alertness23_mit') + sdPrStr('al23_mit_sd_pr'),
      });
      if (rv.al23_phasisch) subtestRows.push({
        sub: 'Alertness phasisch', rt: String(rv.al23_phasisch), sd: '–',
        fehler: '–', ausl: '–', prVal: pStr('alertness23'),
      });

      if (rv.gn_rt) subtestRows.push({
        sub: 'Go/Nogo 1', rt: vStr('gn_rt'), sd: vStr('gn_sd'),
        fehler: String(rv.gn_fehler ?? 0), ausl: String(rv.gn_ausl ?? 0),
        prVal: pStr('gonogo') + sdPrStr('gn_sd_pr'),
      });
      if (rv.gn2_rt) subtestRows.push({
        sub: 'Go/Nogo 2', rt: vStr('gn2_rt'), sd: vStr('gn2_sd'),
        fehler: String(rv.gn2_fehler ?? 0), ausl: String(rv.gn2_ausl ?? 0),
        prVal: pStr('gonogo2') + sdPrStr('gn2_sd_pr'),
      });
      if (rv.fl_rt) subtestRows.push({
        sub: 'Flexibilität', rt: vStr('fl_rt'), sd: vStr('fl_sd'),
        fehler: String(rv.fl_fehler ?? 0), ausl: '–',
        prVal: pStr('flexibilitaet') + sdPrStr('fl_sd_pr'),
      });

      if (rv.ga_rt) subtestRows.push({
        sub: 'Get. Aufm. auditiv', rt: vStr('ga_rt'), sd: vStr('ga_sd'),
        fehler: '–', ausl: '–', prVal: pStr('geteilte') + sdPrStr('ga_sd_pr'),
      });
      if (rv.gv_rt) subtestRows.push({
        sub: 'Get. Aufm. visuell', rt: vStr('gv_rt'), sd: vStr('gv_sd'),
        fehler: '–', ausl: '–',
        prVal: String(rv.gv_sd_pr ?? '').trim() ? `SD-PR: ${rv.gv_sd_pr}` : '–',
      });

      if (rv.vig_rt) subtestRows.push({
        sub: 'Vigilanz', rt: vStr('vig_rt'), sd: vStr('vig_sd'),
        fehler: String(rv.vig_fehler ?? 0), ausl: String(rv.vig_ausl ?? 0),
        prVal: pStr('vigilanz') + sdPrStr('vig_sd_pr'),
      });
      if (rv.ag_rt) subtestRows.push({
        sub: 'Arbeitsgedächtnis', rt: vStr('ag_rt'), sd: vStr('ag_sd'),
        fehler: String(rv.ag_fehler ?? 0), ausl: String(rv.ag_ausl ?? 0),
        prVal: pStr('arbeitsgedaechtnis') + sdPrStr('ag_sd_pr'),
      });

      if (rv.ve_rt_krit || rv.ve_rt_nkrit || rv.ve_fehler || rv.ve_zeilen_r) {
        if (rv.ve_rt_krit || rv.ve_sd_krit) subtestRows.push({
          sub: 'Vis. Scanning krit.', rt: vStr('ve_rt_krit'), sd: vStr('ve_sd_krit'),
          fehler: String(rv.ve_fehler ?? '–'), ausl: String(rv.ve_ausl_krit ?? '–'),
          prVal: [
            pr.ve_rt_krit_pr   ? `RT: ${pr.ve_rt_krit_pr}`     : '',
            pr.ve_sd_krit_pr   ? `SD: ${pr.ve_sd_krit_pr}`     : '',
            pr.ve_fehler_pr    ? `Fehl.: ${pr.ve_fehler_pr}`   : '',
            pr.ve_ausl_krit_pr ? `Ausl.: ${pr.ve_ausl_krit_pr}` : '',
          ].filter(Boolean).join(' | ') || '–',
        });
        if (rv.ve_rt_nkrit || rv.ve_sd_nkrit) subtestRows.push({
          sub: 'Vis. Scanning n-krit.', rt: vStr('ve_rt_nkrit'), sd: vStr('ve_sd_nkrit'),
          fehler: '–', ausl: '–',
          prVal: [
            pr.ve_rt_nkrit_pr ? `RT: ${pr.ve_rt_nkrit_pr}` : '',
            pr.ve_sd_nkrit_pr ? `SD: ${pr.ve_sd_nkrit_pr}` : '',
          ].filter(Boolean).join(' | ') || '–',
        });
        if (rv.ve_zeilen_r || rv.ve_spalten_r) subtestRows.push({
          sub: 'Vis. Scanning (r)', rt: String(rv.ve_zeilen_r ?? '–'), sd: String(rv.ve_spalten_r ?? '–'),
          fehler: '–', ausl: '–',
          prVal: [
            pr.ve_zeilen_r_pr  ? `Zeilen: ${pr.ve_zeilen_r_pr}`   : '',
            pr.ve_spalten_r_pr ? `Spalten: ${pr.ve_spalten_r_pr}` : '',
          ].filter(Boolean).join(' | ') || '–',
        });
      }

      subtestRows.forEach((s, si) => {
        tapRows.push([
          si === 0 ? sessionLabel : '',
          si === 0 ? date : '',
          si === 0 ? exam : '',
          s.sub, s.rt, s.sd, s.fehler, s.ausl, s.prVal,
          si === 0 ? sessionNote : '',
        ]);
      });
    });

    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'Subtest', 'M-RT (ms)', 'SD (ms)', 'Fehler', 'Ausl.', 'PR', 'Notiz']],
      tapRows,
      [15, 18, 20, 35, 16, 14, 12, 12, 22, 22],
    ) + 6;
  }

  // ── TAP GESICHTSFELD / NEGLECT ──
  // TAP results sorted oldest→newest (oldest=Eingang, newest=Abschluss)
  const tapGfResults = results
    .filter(r => r.testId === 'tap')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter(r => {
      const rv = r.rawValues;
      return [rv.gf_rt_l, rv.gf_rt_r, rv.gf_mq, rv.gf_aq,
              rv.neg_rt_l, rv.neg_rt_r, rv.neg_mq, rv.neg_aq]
        .some(v => String(v ?? '').replace(/[,]/g, '') !== '');
    });

  if (tapGfResults.length > 0) {
    const FS_COL_W = 4 + GFX + 5 + 4 + GFX + 4;
    const FS_ROW_H = 33;
    const COL_GAP  = 10;

    ensure(20);
    y = sectionHeader(doc, y, 'Gesichtsfeld / Neglect (TAP)');
    y += 3;

    tapGfResults.forEach((res, idx) => {
      const rv = res.rawValues;
      const sessionLabel = tapGfResults.length === 1 ? '1. Messung'
        : idx === tapGfResults.length - 1 ? 'Neueste Messung' : `${idx + 1}. Messung`;

      ensure(12);
      const [mhr, mhg, mhb] = tint('#4338ca', 0.08);
      doc.setFillColor(mhr, mhg, mhb);
      doc.rect(M, y, PW - 2 * M, 6, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(55, 48, 163);
      const eyeLabel = rv.gf_eye ? `  ·  ${String(rv.gf_eye)}` : '';
      doc.text(
        `${sessionLabel}  ·  ${formatDate(res.date)}${res.examiner ? '  ·  ' + res.examiner : ''}${eyeLabel}`,
        M + 3, y + 4.2,
      );
      y += 8;

      const hasGF  = [rv.gf_rt_l,  rv.gf_rt_r,  rv.gf_mq,  rv.gf_aq ].some(v => String(v ?? '').replace(/[,]/g, '') !== '');
      const hasNeg = [rv.neg_rt_l, rv.neg_rt_r, rv.neg_mq, rv.neg_aq].some(v => String(v ?? '').replace(/[,]/g, '') !== '');

      if (hasGF) {
        ensure(8);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text('GESICHTSFELDPRÜFUNG', M, y + 2);
        y += 5;

        ensure(FS_ROW_H + 4);
        const gfEntry = {
          ml: String(rv.gf_rt_l ?? ''),
          mr: String(rv.gf_rt_r ?? ''),
          mq: decodeQuad(rv.gf_mq),
          aq: decodeQuad(rv.gf_aq),
        };
        const h = drawFieldSectionPDF(doc, M, y, '', gfEntry);
        y += h + 3;
      }

      if (hasNeg) {
        ensure(8);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text('NEGLECTPRÜFUNG', M, y + 2);
        y += 5;

        ensure(FS_ROW_H + 4);
        const negEntry = {
          ml: String(rv.neg_rt_l ?? ''),
          mr: String(rv.neg_rt_r ?? ''),
          mq: decodeQuad(rv.neg_mq),
          aq: decodeQuad(rv.neg_aq),
        };
        const h = drawFieldSectionPDF(doc, M, y, '', negEntry);
        y += h + 3;
      }

      if (idx < tapGfResults.length - 1) {
        ensure(4);
        doc.setDrawColor(220, 225, 235);
        doc.setLineWidth(0.3);
        doc.line(M, y + 3, PW - M, y + 3);
        y += 7;
      }
    });

    y += 4;
  }

  // ── EXPLORATIONSAUFGABEN ──
  const expFieldLabels: Record<string, string> = {
    exp_linien:    'Linienhalbieren',
    exp_dreieck:   '▲ durchstreichen',
    exp_apples:    'Apples-Test',
    exp_abzeichen: 'Abzeichnen',
    exp_uhr:       'Uhr zeichnen',
  };

  const expResults = results
    .filter(r => r.testId === 'neglect_gf')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter(r => Object.keys(expFieldLabels).some(k => String(r.rawValues[k] ?? '').trim() !== ''));

  if (expResults.length > 0) {
    ensure(20);
    y = sectionHeader(doc, y, 'Explorationsaufgaben');
    y += 3;

    expResults.forEach((res, measIdx) => {
      const rv = res.rawValues;
      const measLabel = measIdx === 0 ? 'Aktuell' : `Messung ${expResults.length - measIdx}`;

      ensure(12);
      const [mhr, mhg, mhb] = tint('#4338ca', 0.08);
      doc.setFillColor(mhr, mhg, mhb);
      doc.rect(M, y, PW - 2 * M, 6, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(55, 48, 163);
      doc.text(
        `${measLabel}  ·  ${formatDate(res.date)}${res.examiner ? '  ·  ' + res.examiner : ''}`,
        M + 3, y + 4.2,
      );
      y += 8;

      const activeExp = Object.entries(expFieldLabels).filter(
        ([key]) => String(rv[key] ?? '').trim() !== '',
      );
      if (activeExp.length > 0) {
        ensure(activeExp.length * 5 + 2);
        activeExp.forEach(([key, label]) => {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
          doc.text(`${label}:  ${String(rv[key])}`, M + 3, y + 3);
          y += 5;
        });
      }

      if (res.note) {
        ensure(10);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 116, 139);
        const noteLines = doc.splitTextToSize(`Notiz: ${res.note}`, PW - 2 * M - 3);
        doc.text(noteLines, M + 3, y + 3);
        y += noteLines.length * 4 + 4;
      }

      if (measIdx < expResults.length - 1) {
        ensure(4);
        doc.setDrawColor(220, 225, 235);
        doc.setLineWidth(0.3);
        doc.line(M, y + 3, PW - M, y + 3);
        y += 7;
      }
    });

    y += 4;
  }

  // ── ZZT ──
  const zztResults = results
    .filter(r => r.testId === 'zzt')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (zztResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'Zahlen-Zeige-Test (ZZT)');
    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'Ø WP', 'PR', 'Notiz']],
      zztResults.map((r, i) => {
        const msLabel = (i === 0 ? 'Aktuell' : `Messung ${zztResults.length - i}`) + (r.aborted ? ' (Abgebr.)' : '');
        const noteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        return [msLabel, formatDate(r.date), r.examiner || '–',
          String(r.calculatedValues.wp ?? '–'), String(r.percentileRanks.zzt ?? '–'), noteVal];
      }),
    ) + 6;
  }

  // ── Zahlenspanne ──
  const zahlenspanneResults = results
    .filter(r => r.testId === 'zahlenspanne')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (zahlenspanneResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'Zahlenspanne (WMS-R)');
    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'Vorwärts', 'PR Vorw.', 'Rückwärts', 'PR Rückw.', 'Notiz']],
      zahlenspanneResults.map((r, i) => {
        const msLabel = (i === 0 ? 'Aktuell' : `Messung ${zahlenspanneResults.length - i}`) + (r.aborted ? ' (Abgebr.)' : '');
        const noteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        return [msLabel, formatDate(r.date), r.examiner || '–',
          String(r.rawValues.vorwaerts ?? '–'), String(r.percentileRanks.vorwaerts ?? '–'),
          String(r.rawValues.rueckwaerts ?? '–'), String(r.percentileRanks.rueckwaerts ?? '–'), noteVal];
      }),
    ) + 6;
  }

  // ── Logisches Gedächtnis ──
  const lgResults = results
    .filter(r => r.testId === 'lg')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (lgResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'Logisches Gedächtnis (WMS-R)');
    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'LG I', 'PR LG I', 'LG II', 'PR LG II', 'Wiedererk.', 'PR WE', 'Notiz']],
      lgResults.map((r, i) => {
        const msLabel = (i === 0 ? 'Aktuell' : `Messung ${lgResults.length - i}`) + (r.aborted ? ' (Abgebr.)' : '');
        const noteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        return [msLabel, formatDate(r.date), r.examiner || '–',
          String(r.rawValues.lgI ?? '–'), String(r.percentileRanks.lgI ?? '–'),
          String(r.rawValues.lgII ?? '–'), String(r.percentileRanks.lgII ?? '–'),
          String(r.rawValues.wiedererk ?? '–'), String(r.percentileRanks.wiedererk ?? '–'), noteVal];
      }),
    ) + 6;
  }

  // ── Mosaik ──
  const mosaikResults = results
    .filter(r => r.testId === 'mosaik')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (mosaikResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'Mosaik-Test (WAIS-IV)');
    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'Rohwert', 'AWP', 'PR', 'Notiz']],
      mosaikResults.map((r, i) => {
        const msLabel = (i === 0 ? 'Aktuell' : `Messung ${mosaikResults.length - i}`) + (r.aborted ? ' (Abgebr.)' : '');
        const noteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        return [msLabel, formatDate(r.date), r.examiner || '–',
          String(r.rawValues.rohwert ?? '–'), String(r.calculatedValues.awp ?? '–'),
          String(r.percentileRanks.mosaik ?? '–'), noteVal];
      }),
    ) + 6;
  }

  // ── Rey-Osterrieth-Figur ──
  const reyResults = results
    .filter(r => r.testId === 'rey')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (reyResults.length > 0) {
    ensure(30);
    y = sectionHeader(doc, y, 'Rey-Osterrieth-Figur (Rohwerte)');
    y = renderTable(
      y,
      [['', 'Datum', 'Untersucher', 'CFT (Kopieren)', 'CFM (Direkt)', 'CQM (Verzögert)', 'Notiz']],
      reyResults.map((r, i) => {
        const msLabel = (i === 0 ? 'Aktuell' : `Messung ${reyResults.length - i}`) + (r.aborted ? ' (Abgebr.)' : '');
        const noteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        return [msLabel, formatDate(r.date), r.examiner || '–',
          String(r.rawValues.cft ?? '–'), String(r.rawValues.cfm ?? '–'),
          String(r.rawValues.cqm ?? '–'), noteVal];
      }),
    ) + 6;
  }

  // ── CUSTOM TESTS ──
  const customResultsForPDF = results
    .filter(r => r.testId === 'custom')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (customResultsForPDF.length > 0) {
    // Group by test name
    const customByName = new Map<string, typeof customResultsForPDF>();
    for (const r of customResultsForPDF) {
      const name = String(r.rawValues.testName ?? 'Eigener Test');
      if (!customByName.has(name)) customByName.set(name, []);
      customByName.get(name)!.push(r);
    }

    for (const [name, rList] of customByName) {
      ensure(30);
      y = sectionHeader(doc, y, `Eigener Test: ${name}`);

      const head = [['', 'Datum', 'Untersucher', 'Bezeichnung', 'Wert', 'PR', 'Notiz']];
      const body: (string | number)[][] = [];

      rList.forEach((r, ri) => {
        let parsedRows: Array<{label: string; value: string; pr: string}> = [];
        try { parsedRows = JSON.parse(String(r.rawValues.rows ?? '[]')); } catch { /* ignore */ }
        const msLabel = ri === 0 ? 'Aktuell' : `Messung ${rList.length - ri}`;

        const abortedLabel = msLabel + (r.aborted ? ' (Abgebr.)' : '');
        const abortNoteVal = [r.note, r.aborted && r.abortComment ? `Abbruch: ${r.abortComment}` : ''].filter(Boolean).join(' | ') || '–';
        if (parsedRows.length === 0) {
          body.push([abortedLabel, formatDate(r.date), r.examiner || '–', '–', '–', '–', abortNoteVal]);
        } else {
          parsedRows.forEach((row, rowIdx) => {
            body.push([
              rowIdx === 0 ? abortedLabel : '',
              rowIdx === 0 ? formatDate(r.date) : '',
              rowIdx === 0 ? (r.examiner || '–') : '',
              row.label || '–',
              row.value || '–',
              row.pr || '–',
              rowIdx === 0 ? abortNoteVal : '',
            ]);
          });
        }
      });

      y = renderTable(y, head, body) + 6;
    }
  }

  // Save
  const nameParts = patient.name.trim().split(' ');
  const lastName  = nameParts[nameParts.length - 1];
  const firstName = nameParts.slice(0, -1).join(' ');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${lastName}, ${firstName} ${dateStr} Leistungsprofil.pdf`;
  if (isElectron()) {
    const uint8 = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
    await dbSavePdf(filename, Array.from(uint8));
  } else {
    doc.save(filename);
  }
  } catch (err) {
    console.error('PDF Export Fehler:', err);
    alert(`PDF Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  }
}
