import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Patient } from '../types';
import { isElectron, dbSavePdf } from './db-api';
import { formatDate } from './utils';

// Height of the report title line printed above the header on page 1 (mm)
const TITLE_H = 6;
// Height of the patient info header printed on page 1 (mm)
const HEADER_H = 24;
const HEADER_GAP = 3;

// Target render width before capture: narrower = larger text on A4.
// At 700px CSS → 14px text ≈ 11pt on paper; PR chart scales down proportionally.
const CAPTURE_WIDTH = 700;

function waitFrames(n: number): Promise<void> {
  return new Promise(resolve => {
    let count = 0;
    const tick = () => { if (++count >= n) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

function drawHeader(doc: jsPDF, patient: Patient, margin: number, contentW: number): void {
  const x = margin;

  // Report title (page 1 only)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('Neuropsychologisches Leistungsprofil', x + contentW / 2, margin + 4, { align: 'center' });

  const y = margin + TITLE_H;

  // Background box
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, contentW, HEADER_H, 2, 2, 'FD');

  // Patient name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // slate-900
  const nameParts = patient.name.trim().split(' ');
  const lastName  = nameParts[nameParts.length - 1];
  const firstName = nameParts.slice(0, -1).join(' ');
  doc.text(`${lastName}${firstName ? ', ' + firstName : ''}`, x + 4, y + 7);

  // Meta line 1: Geburtsdatum · Geschlecht · Aufnahmedatum
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-500
  const geschlechtLabel = patient.geschlecht === 'm' ? 'männlich' : patient.geschlecht === 'w' ? 'weiblich' : 'divers';
  const metaParts: string[] = [
    `* ${formatDate(patient.geburtsdatum)}`,
    geschlechtLabel,
  ];
  if (patient.aufnahmedatum) metaParts.push(`Aufnahme ${formatDate(patient.aufnahmedatum)}`);
  if (patient.entlassdatum)  metaParts.push(`Entlassung ${formatDate(patient.entlassdatum)}`);
  doc.text(metaParts.join('   ·   '), x + 4, y + 13);

  // Meta line 2: Mitarbeiter
  if (patient.mitarbeiter && patient.mitarbeiter.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-400
    doc.text('Mitarbeiter:innen', x + 4, y + 19.5);
    doc.setFont('helvetica', 'normal');
    doc.text(patient.mitarbeiter.join(', '), x + 34, y + 19.5);
  }
}

export async function exportProfilePDFScreenshot(
  element: HTMLElement,
  patient: Patient,
): Promise<{ success: boolean; filePath?: string } | undefined> {
  // ── Narrow element width for capture ──────────────────────────────────────────
  // Saving/restoring inline styles only (CSS-class widths are untouched).
  const saved = {
    width:    element.style.width,
    maxWidth: element.style.maxWidth,
    minWidth: element.style.minWidth,
  };
  element.style.width    = `${CAPTURE_WIDTH}px`;
  element.style.maxWidth = `${CAPTURE_WIDTH}px`;
  element.style.minWidth = `${CAPTURE_WIDTH}px`;
  void element.offsetWidth; // force synchronous reflow
  await waitFrames(2);      // let CSS transitions / Recharts settle

  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(element, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      filter: (node) => {
        if (node instanceof HTMLElement) {
          // Trend-Pfeile/Verbindungslinien nie ins PDF übernehmen.
          if (node.classList.contains('pr-trend-arrow')) return false;
          const style = window.getComputedStyle(node);
          if (style.position === 'fixed') return false;
        }
        return true;
      },
    });
  } finally {
    // Always restore — even if toCanvas throws
    element.style.width    = saved.width;
    element.style.maxWidth = saved.maxWidth;
    element.style.minWidth = saved.minWidth;
  }

  try {
    const canvasW = canvas.width;
    const canvasH = canvas.height;

    // A4 portrait, 6mm margins
    const margin = 6;
    const contentW = 210 - 2 * margin;
    const contentPageH = 297 - 2 * margin;

    // Scale factor: content width in mm / canvas width in px
    const scale = contentW / canvasW;
    // Full page height in canvas pixels
    const pageHeightPx = Math.floor(contentPageH / scale);
    // First page: title + header take space at the top
    const firstPageOffset = TITLE_H + HEADER_H + HEADER_GAP; // mm
    const firstPageHeightPx = Math.floor((contentPageH - firstPageOffset) / scale);
    // 2% overlap between subsequent pages
    const overlapPx = Math.ceil(pageHeightPx * 0.02);
    const stride = pageHeightPx - overlapPx;

    // Build list of canvas slices: { yOffset, height (px), pdfY (mm) }
    const slices: { yOffset: number; heightPx: number; pdfY: number }[] = [];
    slices.push({ yOffset: 0, heightPx: Math.min(firstPageHeightPx, canvasH), pdfY: margin + firstPageOffset });
    let yOffset = firstPageHeightPx - overlapPx;
    while (yOffset < canvasH) {
      const heightPx = Math.min(pageHeightPx, canvasH - yOffset);
      slices.push({ yOffset, heightPx, pdfY: margin });
      yOffset += stride;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    for (let page = 0; page < slices.length; page++) {
      if (page > 0) doc.addPage();
      const { yOffset: yo, heightPx, pdfY } = slices[page];

      if (page === 0) drawHeader(doc, patient, margin, contentW);

      // Crop this page's slice from the full canvas
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width  = canvasW;
      pageCanvas.height = heightPx;
      const ctx = pageCanvas.getContext('2d')!;
      ctx.drawImage(canvas, 0, -yo);

      const pageImgH = heightPx * scale;
      doc.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, pdfY, contentW, pageImgH);
    }

    const nameParts = patient.name.trim().split(' ');
    const lastName  = nameParts[nameParts.length - 1];
    const firstName = nameParts.slice(0, -1).join(' ');
    const dateStr   = new Date().toISOString().split('T')[0];
    const filename  = `${lastName}, ${firstName} ${dateStr} Leistungsprofil.pdf`;

    if (isElectron()) {
      const uint8  = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
      const result = await dbSavePdf(filename, Array.from(uint8));
      return result;
    } else {
      doc.save(filename);
      return { success: true };
    }
  } catch (err) {
    console.error('PDF Screenshot Export Fehler:', err);
    alert(`PDF Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  }
}
