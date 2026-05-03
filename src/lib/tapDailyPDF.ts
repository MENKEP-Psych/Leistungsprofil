import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Patient, TestResult } from '../types';
import { formatDate } from './utils';
import { TAP_PR_MAP, TAP_VE_PR_MAP } from '../components/TAPTab';
import { isElectron, dbSavePdf } from './db-api';

const ALL_TAP_COLUMNS = [
  ...TAP_PR_MAP.map(m => ({ key: m.key as string, label: m.label as string })),
  ...TAP_VE_PR_MAP.map(m => ({ key: m.key as string, label: m.label as string })),
];

const SHORT_LABELS: Record<string, string> = {
  alertnessM:      'Alert-M',
  alertness23:     'Alert-23',
  gonogo:          'GoNogo',
  flexibilitaet:   'Flex',
  geteilte:        'Geteilt',
  ve_rt_krit_pr:   'RT-krit',
  ve_sd_krit_pr:   'SD-krit',
  ve_rt_nkrit_pr:  'RT-n-kr',
  ve_sd_nkrit_pr:  'SD-n-kr',
  ve_fehler_pr:    'Fehler',
  ve_ausl_krit_pr: 'Auslsng',
  ve_zeilen_r_pr:  'Zeilen-r',
  ve_spalten_r_pr: 'Spalten-r',
};

function prToSymbol(pr: number | string | undefined): string {
  if (pr === undefined || pr === null || String(pr).trim() === '') return '';
  const val = typeof pr === 'number' ? pr : parseFloat(String(pr));
  if (isNaN(val)) return '';
  if (val < 16) return '\u2193'; // ↓
  if (val > 84) return '\u2191'; // ↑
  return '\u2013';               // –
}

function getCellContent(tapResults: TestResult[], measureIdx: number, prKey: string): string {
  const res = tapResults[measureIdx];
  if (!res) return '';
  const pr = res.percentileRanks[prKey];
  const sym = prToSymbol(pr);
  if (!sym) return '';
  return res.rawValues[`flag_${prKey}`] ? sym + '!' : sym;
}

export async function exportTapDailyPDF(data: { patient: Patient; results: TestResult[] }[]): Promise<void> {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const PW = 297;
    const M = 8;

    // ── Page header bar ──────────────────────────────────────────────────────
    doc.setFillColor(67, 56, 202);
    doc.rect(0, 0, PW, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TAP \u2013 Tages\u00fcbersicht', M, 8);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`Exportiert am ${formatDate(new Date().toISOString().split('T')[0])}`, PW - M, 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // ── Two-row header ────────────────────────────────────────────────────────
    // Row 1: fixed cols (rowSpan 2) + one cell per test (colSpan 2)
    // Row 2: "1" and "2" for each test
    const headRow1: object[] = [
      { content: 'Patient',  rowSpan: 2, styles: { valign: 'middle', halign: 'left',   fontStyle: 'bold' } },
      { content: 'Entlass',  rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold' } },
      ...ALL_TAP_COLUMNS.map(col => ({
        content: SHORT_LABELS[col.key] ?? col.key,
        colSpan: 2,
        styles: { halign: 'center', fontStyle: 'bold' },
      })),
    ];
    const headRow2: object[] = ALL_TAP_COLUMNS.flatMap(() => [
      { content: '1', styles: { halign: 'center', fontStyle: 'normal' } },
      { content: '2', styles: { halign: 'center', fontStyle: 'normal' } },
    ]);

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = data.map(({ patient, results }) => {
      const tapResults = results
        .filter(r => r.testId === 'tap')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return [
        patient.name,
        patient.entlassdatum ? formatDate(patient.entlassdatum) : '\u2013',
        ...ALL_TAP_COLUMNS.flatMap(col => [
          getCellContent(tapResults, 0, col.key),
          getCellContent(tapResults, 1, col.key),
        ]),
      ];
    });

    // ── Column widths ─────────────────────────────────────────────────────────
    const usable   = PW - 2 * M;
    const patientW = 32;
    const entlassW = 15;
    const nDataCols = ALL_TAP_COLUMNS.length * 2; // 26
    const dataCellW = (usable - patientW - entlassW) / nDataCols;

    const columnStyles: Record<number, object> = {
      0: { cellWidth: patientW, halign: 'left' },
      1: { cellWidth: entlassW, halign: 'center' },
    };
    for (let i = 0; i < nDataCols; i++) {
      columnStyles[i + 2] = { cellWidth: dataCellW, halign: 'center' };
    }

    autoTable(doc, {
      startY: 14,
      head: [headRow1, headRow2],
      body,
      styles: {
        fontSize: 6.5,
        cellPadding: 1.2,
        overflow: 'hidden',
        lineColor: [210, 215, 230] as [number, number, number],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [238, 240, 255] as [number, number, number],
        textColor: [55, 48, 163] as [number, number, number],
        fontSize: 5.5,
        cellPadding: 1,
        lineColor: [210, 215, 230] as [number, number, number],
        lineWidth: 0.1,
      },
      columnStyles,
      margin: { left: M, right: M },
      tableWidth: usable,

      didParseCell: (data: any) => {
        if (data.section !== 'body' || data.column.index < 2) return;
        const text: string = Array.isArray(data.cell.text)
          ? data.cell.text.join('')
          : String(data.cell.text ?? '');
        if (text.includes('!')) {
          data.cell.styles.textColor = [234, 88, 12];
          data.cell.styles.fontStyle = 'bold';
        } else if (text === '\u2193') {
          data.cell.styles.textColor = [220, 38, 38];
        } else if (text === '\u2191') {
          data.cell.styles.textColor = [124, 58, 237];
        } else if (text === '\u2013') {
          data.cell.styles.textColor = [22, 101, 52];
        }
      },

      // Draw a thick separator line on the LEFT of every M1 cell (start of each test group)
      didDrawCell: (data: any) => {
        const col = data.column.index;
        // M1 columns: indices 2, 4, 6, … (every even offset from 2)
        if (col < 2 || (col - 2) % 2 !== 0) return;
        const x = data.cell.x;
        const y = data.cell.y;
        const h = data.cell.height;
        doc.setDrawColor(130, 140, 200);
        doc.setLineWidth(0.5);
        doc.line(x, y, x, y + h);
      },
    });

    const dateStr = new Date().toISOString().split('T')[0];
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
