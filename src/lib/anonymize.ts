import { Patient, TestResult } from '../types';

// ── Anonymisierung für Fehlerberichte ───────────────────────────────────────
//
// Baut aus einem echten Patienten + seinen Testergebnissen eine Version, die
// gefahrlos per E-Mail verschickt werden kann: identifizierende Stammdaten
// werden auf Defaults gesetzt, alle Freitext-Felder (die im Klartext Namen,
// Orte oder andere identifizierende Angaben enthalten könnten) werden durch
// einen Platzhalter ersetzt. Rohwerte, Prozentränge, Testdaten und sonstige
// numerische/kodierte Felder bleiben unverändert — sie werden für die
// Fehlerreproduktion gebraucht und sind nicht identifizierend.

const REDACTED = '[Text entfernt]';

const ANON_NAME = 'Testfall';
const ANON_GEBURTSDATUM = '2000-01-01';

// rawValues-Schlüssel, die je nach Test Freitext enthalten (Notizen,
// Beobachtungen, Explorationsantworten) statt Roh-Messwerten.
const FREETEXT_RAWVALUE_KEYS = new Set([
  // TAP: Anmerkung je Untertest
  'note_alM', 'note_al23', 'note_gn', 'note_gn2', 'note_fl', 'note_ga',
  'note_vig', 'note_ag', 'note_neg', 'note_ve',
  'note_gf_LA', 'note_gf_RA', 'note_gf_BA',
  // TMT: Anmerkung je Teil
  'noteA', 'noteB',
  // Bürotest: Freitext-Antworten
  'aufgabe1', 'aufgabe6',
  // Tagesplan: Freitext
  'planText',
  // Explorationsaufgaben (Neglect/GF): Freitext-Beobachtungen je Aufgabe
  'exp_linien', 'exp_dreieck', 'exp_apples', 'exp_abzeichen', 'exp_uhr', 'exp_freitext',
]);

function redactString(v: string): string {
  return v.trim() === '' ? v : REDACTED;
}

function anonymizeRawValues(raw: Record<string, number | string>): Record<string, number | string> {
  const out: Record<string, number | string> = { ...raw };
  for (const key of Object.keys(out)) {
    if (FREETEXT_RAWVALUE_KEYS.has(key) && typeof out[key] === 'string') {
      out[key] = redactString(out[key] as string);
    }
  }
  // Eigener Test: "rows" ist ein JSON-String mit optionalem Freitext-Feld je Zeile.
  if (typeof out.rows === 'string') {
    try {
      const rows = JSON.parse(out.rows) as Array<Record<string, unknown>>;
      const cleaned = rows.map(row => ({
        ...row,
        freitext: typeof row.freitext === 'string' ? redactString(row.freitext) : row.freitext,
      }));
      out.rows = JSON.stringify(cleaned);
    } catch { /* kein gültiges JSON — unverändert lassen */ }
  }
  return out;
}

export function anonymizeResult(result: TestResult): TestResult {
  return {
    ...result,
    rawValues: anonymizeRawValues(result.rawValues),
    note: result.note != null ? redactString(result.note) : result.note,
    abortComment: result.abortComment != null ? redactString(result.abortComment) : result.abortComment,
  };
}

export function anonymizePatient(patient: Patient): Patient {
  return {
    ...patient,
    name: ANON_NAME,
    geburtsdatum: ANON_GEBURTSDATUM,
    diagnose: undefined,
    mitarbeiter: [],
    neuropsychologin: undefined,
    lokalisation: undefined,
    nextSessionNote: undefined,
    nextSessionTestIds: undefined,
    createdBy: undefined,
  };
}
