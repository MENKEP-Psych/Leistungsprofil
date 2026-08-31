import React, { useMemo } from 'react';
import { Patient, TestResult, PRResult } from '../types';
import { TextProfileResult } from '../components/PRProfile';
import { formatDate, calculateAge } from '../lib/utils';
import { FieldSection, decodeQuad } from '../components/NeglectShared';
import { TAP_PR_MAP, TAP_SD_PR_MAP, TAP_VE_PR_MAP, TAP_FEHLER_AUSL_PR_MAP } from '../components/TAPTab';
import { lookupZahlenspanne } from '../lib/normUtils';
import { ZZT_ENABLED } from '../lib/featureFlags';
import { LPS_SUBTESTS, LPS_KORREKTUR_OPTIONS, LPS_VERSION_OPTIONS, LPS_50PLUS_FORM_OPTIONS } from '../components/LPSTab';
import { VLMT_VERSION_OPTIONS } from '../components/VLMTTab';

// ── Neglect/GF section config ─────────────────────────────────────────────────

const EXP_FIELDS = [
  { key: 'exp_linien',    label: 'Linienhalbieren' },
  { key: 'exp_dreieck',   label: '▲ durchstreichen' },
  { key: 'exp_apples',    label: 'Apples-Test' },
  { key: 'exp_abzeichen', label: 'Abzeichnen' },
  { key: 'exp_uhr',       label: 'Uhr zeichnen' },
] as const;

const DEFAULT_DOMAINS: Record<string, string> = {
  'tmt-A': '1. Aufmerksamkeit (Geschwindigkeit)',
  'tmt-B': '1. Aufmerksamkeit (Geteilt)',
};

interface VLMTMeasure {
  key: string;
  label: string;
  domain: string;
  getDetail: (r: TestResult) => string;
  // Ob für diese Messung ein Rohwert vorliegt — unabhängig davon, ob der PR
  // bereits berechnet werden konnte (z. B. weil eine Wiederholungstestung noch
  // nicht vollständig ist). Ein vorhandener Rohwert soll die Zeile immer sichtbar
  // machen, auch ohne PR.
  hasRaw: (r: TestResult) => boolean;
}

const hasVal = (v: unknown) => v != null && String(v).trim() !== '';

// Reihenfolge: Dg1-5, Σ | I | Dg6, Δ5-6 | Dg7, Δ5-7 | W, W_F
const VLMT_MEASURES: VLMTMeasure[] = [
  { key: 'Dg1',      label: 'Supraspanne [1]',                domain: '2. Gedächtnis (Lernen)',         getDetail: r => `Dg1: ${r.rawValues.Dg1}`,       hasRaw: r => hasVal(r.rawValues.Dg1) },
  { key: 'Dg5',      label: 'Lernleistung [5]',               domain: '2. Gedächtnis (Lernen)',         getDetail: r => `Dg5: ${r.rawValues.Dg5}`,       hasRaw: r => hasVal(r.rawValues.Dg5) },
  { key: 'sumDg1_5', label: 'Gesamtlernleistung [Σ1–5]',      domain: '2. Gedächtnis (Lernen)',         getDetail: r => `Σ: ${r.calculatedValues.sumDg1_5}`, hasRaw: r => hasVal(r.calculatedValues.sumDg1_5) },
  { key: 'I',        label: 'Interferenzliste [I]',            domain: '2. Gedächtnis (Interferenz)',    getDetail: r => `I: ${r.rawValues.I}`,           hasRaw: r => hasVal(r.rawValues.I) },
  { key: 'Dg6',      label: 'Abruf n. Interferenz [6]',       domain: '2. Gedächtnis (Kurzzeit)',       getDetail: r => `Dg6: ${r.rawValues.Dg6}`,       hasRaw: r => hasVal(r.rawValues.Dg6) },
  { key: 'Dg5_Dg6',  label: 'Verlust n. Interferenz [Δ5–6]',  domain: '2. Gedächtnis (Kurzzeit)',       getDetail: r => `Δ: ${r.calculatedValues.Dg5_Dg6}`, hasRaw: r => hasVal(r.calculatedValues.Dg5_Dg6) },
  { key: 'Dg7',      label: 'Verzögerter Abruf [7]',          domain: '2. Gedächtnis (Langzeit)',       getDetail: r => `Dg7: ${r.rawValues.Dg7}`,       hasRaw: r => hasVal(r.rawValues.Dg7) },
  { key: 'Dg5_Dg7',  label: 'Verlust n. Verzögerung [Δ5–7]',  domain: '2. Gedächtnis (Langzeit)',       getDetail: r => `Δ: ${r.calculatedValues.Dg5_Dg7}`, hasRaw: r => hasVal(r.calculatedValues.Dg5_Dg7) },
  { key: 'W',        label: 'Richtig [WR]',                   domain: '2. Gedächtnis (Wiedererkennen)', getDetail: r => `W: ${r.rawValues.W}`,           hasRaw: r => hasVal(r.rawValues.W) },
  { key: 'W_F',      label: 'Korr. Wiedererkennen [WR–FP]',   domain: '2. Gedächtnis (Wiedererkennen)', getDetail: r => `W_F: ${r.rawValues.W_F ?? '–'}`, hasRaw: r => hasVal(r.rawValues.W_F) },
];

// Normalisiert einen aktuellen PR-Wert: `undefined` und leere Strings (z. B. aus
// Alt-Datensätzen, bei denen ein TAP-PR-Feld nie ausgefüllt wurde) werden auf das
// App-weite "kein PR"-Sentinel 'n/a' abgebildet, statt `undefined` durchzureichen —
// sonst rendert PRProfile den Punkt fälschlich bei PR 50 bzw. als "abgebrochen".
const prOrNA = (v: string | number | undefined): string | number =>
  (v === undefined || (typeof v === 'string' && v.trim() === '')) ? 'n/a' : v;

// Normalisiert einen Vorher-PR-Wert für die History-Marker: `undefined`, leere
// Strings und das 'n/a'-Sentinel werden alle zu `undefined`, damit kein History-Punkt
// gezeichnet wird, wenn für die vorherige Messung kein Normwert vorlag.
const prevPrOrUndef = (v: string | number | undefined): string | number | undefined =>
  (v === undefined || (typeof v === 'string' && (v.trim() === '' || v.trim() === 'n/a'))) ? undefined : v;

// Combines notes from the latest and previous test sessions.
// If both have notes, the previous one is prefixed with its date.
const combineNotes = (latest: TestResult, previous?: TestResult): string | undefined => {
  const a = latest.note?.trim() || '';
  const b = previous?.note?.trim() || '';
  if (!a && !b) return undefined;
  if (!b) return a || undefined;
  if (!a) return `[${formatDate(previous!.date)}] ${b}`;
  if (a === b) return a;
  return `${a}\n[${formatDate(previous!.date)}] ${b}`;
};

// TMT Teil A und B haben je eine eigene Notiz (rawValues.noteA/noteB). Ältere,
// vor der Trennung gespeicherte Datensätze kennen nur die gemeinsame `note` —
// die wird als Fallback für beide Teile verwendet.
const combineTmtNotes = (latest: TestResult, previous: TestResult | undefined, part: 'A' | 'B'): string | undefined => {
  const field = part === 'A' ? 'noteA' : 'noteB';
  // Nur echte Alt-Datensätze (weder noteA noch noteB gesetzt) fallen auf die gemeinsame
  // `note` zurück — sonst würde eine nur für den anderen Teil eingegebene Notiz hier
  // fälschlich mit angezeigt.
  const legacyNote = (r: TestResult) => (r.rawValues.noteA == null && r.rawValues.noteB == null) ? r.note : undefined;
  const a = String(latest.rawValues[field] ?? legacyNote(latest) ?? '').trim();
  const b = previous ? String(previous.rawValues[field] ?? legacyNote(previous) ?? '').trim() : '';
  let base = '';
  if (a && b) base = a === b ? a : `${a}\n[${formatDate(previous!.date)}] ${b}`;
  else if (a) base = a;
  else if (b) base = `[${formatDate(previous!.date)}] ${b}`;
  const err = latest.rawValues[`err${part}`];
  const suffix = err != null ? ` – Fehler ${part}: ${err}` : '';
  const result = (base + suffix).trim();
  return result || undefined;
};

export interface ProfileData {
  profileData: PRResult[];
  textResults: TextProfileResult[];
  extraBottomContent: React.ReactNode;
}

/**
 * Derives the full performance profile (PR rows, text-based results and the
 * GF/Neglect graphic block) from a patient's raw test results.
 *
 * Extracted from ProfileTab so the on-screen profile and the PDF print layout
 * render byte-identical data from a single source of truth.
 */
export function useProfileData(patient: Patient, results: TestResult[]): ProfileData {
  return useMemo<ProfileData>(() => {
    const profileData: PRResult[] = (() => {
      const data: PRResult[] = [];

      const abt  = (r: TestResult)  => r.aborted  ? { aborted:     true as const, abortComment:     r.abortComment  } : {};
      const pabt = (r?: TestResult) => r?.aborted ? { prevAborted: true as const, prevAbortComment: r.abortComment  } : {};

      // ── TMT ──────────────────────────────────────────────────────────────────
      // Teil A und B sind unabhängig speicherbar — deshalb je Teil eigene
      // Eingang/Abschluss-Sitzungen ermitteln, statt einen gemeinsamen `latest`
      // TestResult vorauszusetzen (der könnte nur den jeweils anderen Teil haben).
      const tmtResults = results
        .filter(r => r.testId === 'tmt')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Ein als "abgebrochen" markierter Datensatz zählt für beide Teile (auch ohne
      // Werte) mit, damit ein komplett abgebrochener Test weiterhin als n/a erscheint.
      // Ebenso zählt eine für den jeweiligen Teil eingetragene Notiz (z. B. „TMT-B
      // wegen Farbfehlsichtigkeit nicht durchführbar") mit — sonst würde diese
      // Erklärung im Leistungsprofil nie auftauchen, weil ohne Zeit-Wert keine Zeile
      // für den Teil erzeugt wird.
      const tmtSessionsFor = (part: 'A' | 'B') =>
        tmtResults.filter(r =>
          (r.rawValues[part] != null && String(r.rawValues[part]).trim() !== '')
          || hasVal(r.rawValues[part === 'A' ? 'noteA' : 'noteB'])
          || r.aborted);

      const latestA = tmtSessionsFor('A')[0];
      if (latestA) {
        const previousA = tmtSessionsFor('A')[1];
        data.push({
          label: 'TMT Teil A',
          // Bei "abgebrochen" nie einen (ggf. dennoch berechneten) Prozentrang zeigen —
          // der Test gilt als nicht valide durchgeführt, unabhängig davon, ob aus dem
          // eingegebenen Rohwert rechnerisch ein PR ermittelt werden könnte.
          currentPr: latestA.aborted ? 'n/a' : prOrNA(latestA.percentileRanks.A),
          previousPr: prevPrOrUndef(previousA?.percentileRanks.A),
          date: latestA.date,
          prevDate: previousA?.date,
          domain: latestA.domainMapping?.A ?? DEFAULT_DOMAINS['tmt-A'],
          subdomain: '1.1 Informationsverarbeitungsgeschwindigkeit',
          testGroup: 'Trail Making Test',
          details: hasVal(latestA.rawValues.A) ? [`Zeit: ${latestA.rawValues.A}s`] : undefined,
          previousDetails: previousA && hasVal(previousA.rawValues.A) ? [`Zeit: ${previousA.rawValues.A}s`] : undefined,
          note: combineTmtNotes(latestA, previousA, 'A'),
          ...abt(latestA),
          ...pabt(previousA),
        });
      }
      const latestB = tmtSessionsFor('B')[0];
      if (latestB) {
        const previousB = tmtSessionsFor('B')[1];
        data.push({
          label: 'TMT Teil B',
          currentPr: latestB.aborted ? 'n/a' : prOrNA(latestB.percentileRanks.B),
          previousPr: prevPrOrUndef(previousB?.percentileRanks.B),
          date: latestB.date,
          prevDate: previousB?.date,
          domain: latestB.domainMapping?.B ?? DEFAULT_DOMAINS['tmt-B'],
          subdomain: '1.4 Geteilte Aufmerksamkeit',
          testGroup: 'Trail Making Test',
          details: hasVal(latestB.rawValues.B) ? [`Zeit: ${latestB.rawValues.B}s`] : undefined,
          previousDetails: previousB && hasVal(previousB.rawValues.B) ? [`Zeit: ${previousB.rawValues.B}s`] : undefined,
          note: combineTmtNotes(latestB, previousB, 'B'),
          ...abt(latestB),
          ...pabt(previousB),
        });
      }

      // ── VLMT ─────────────────────────────────────────────────────────────────
      const vlmtResults = results
        .filter(r => r.testId === 'vlmt')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (vlmtResults.length > 0) {
        const latest   = vlmtResults[0];
        const previous = vlmtResults[1];
        // Verwendete Wortlisten-Version (A/C/D) in der Test-Überschrift anzeigen.
        const vlmtVersionLabel = VLMT_VERSION_OPTIONS.find(o => o.value === latest.rawValues.version)?.label;
        const vlmtTestGroup = vlmtVersionLabel ? `VLMT – ${vlmtVersionLabel}` : 'VLMT';

        // Abgebrochen und kein einziger Rohwert erfasst (z. B. „Test nicht durchführbar,
        // Grund siehe Notiz") → nur EINE Sammelzeile mit der Begründung, statt 10 leere
        // „k.A."-Zeilen.
        const vlmtNoRaw = latest.aborted && !VLMT_MEASURES.some(m => m.hasRaw(latest));
        if (vlmtNoRaw) {
          data.push({
            label: 'VLMT',
            currentPr: 'n/a',
            date: latest.date,
            domain: '2. Gedächtnis (Lernen)',
            subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
            testGroup: vlmtTestGroup,
            note: combineNotes(latest, previous),
            ...abt(latest),
          });
        }

        for (const m of VLMT_MEASURES) {
          if (vlmtNoRaw) break;
          const currPr = latest.percentileRanks[m.key];
          if (currPr === undefined && !latest.aborted && !m.hasRaw(latest)) continue;
          data.push({
            label: m.label,
            currentPr: latest.aborted ? 'n/a' : prOrNA(currPr),
            previousPr: prevPrOrUndef(previous?.percentileRanks[m.key]),
            date: latest.date,
            prevDate: previous?.date,
            domain: m.domain,
            subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
            testGroup: vlmtTestGroup,
            details: [m.getDetail(latest)],
            previousDetails: previous ? [m.getDetail(previous)] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── TOL ──────────────────────────────────────────────────────────────────
      const tolResults = results
        .filter(r => r.testId === 'tol')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (tolResults.length > 0) {
        const latest   = tolResults[0];
        const previous = tolResults[1];
        const detailStr = (r: TestResult) => `Rohwert: ${r.rawValues.rohwert}`;

        data.push({
          label: 'Turm von London (alterskorrigiert)',
          // Bei "abgebrochen" nie einen (ggf. dennoch berechneten) Prozentrang zeigen —
          // der Test gilt als nicht valide durchgeführt.
          currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.alterkorrigiert),
          previousPr: prevPrOrUndef(previous?.percentileRanks.alterkorrigiert),
          date: latest.date,
          prevDate: previous?.date,
          domain: '5. Exekutive Funktionen',
          testGroup: 'Turm von London',
          details: [detailStr(latest)],
          previousDetails: previous ? [detailStr(previous)] : undefined,
          note: combineNotes(latest, previous),
          ...abt(latest),
          ...pabt(previous),
        });

        if (latest.percentileRanks.alter_bildung !== undefined || latest.aborted) {
          data.push({
            label: 'Turm von London (alters- & bildungskorrigiert)',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.alter_bildung),
            previousPr: prevPrOrUndef(previous?.percentileRanks.alter_bildung),
            date: latest.date,
            prevDate: previous?.date,
            domain: '5. Exekutive Funktionen',
            testGroup: 'Turm von London',
            details: [detailStr(latest)],
            previousDetails: previous ? [detailStr(previous)] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── TAP ──────────────────────────────────────────────────────────────────
      const tapResults = results
        .filter(r => r.testId === 'tap')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      // Map TAP result keys to version field in rawValues (null = key-encoded version)
      const TAP_VER_FIELD: Record<string, string | null> = {
        alertnessM:         null,
        alertness23:        null,
        alertness23_ohne:   null,
        alertness23_mit:    null,
        gonogo:             'gn_ver',
        gonogo2:            'gn_ver',
        flexibilitaet:      'fl_ver',
        geteilte:           'ga_ver',
        geteilteVisuell:    'ga_ver',
        vigilanz:           null,
        arbeitsgedaechtnis: null,
        gf_pr:              null,
        neg_pr:             null,
      };

      // Subdomain grouping within "1. Aufmerksamkeit" per PDF structure
      const TAP_SUBDOMAIN: Record<string, string | undefined> = {
        alertnessM:         '1.2 Aufmerksamkeitsaktivierung',
        alertness23:        '1.2 Aufmerksamkeitsaktivierung',
        alertness23_ohne:   '1.2 Aufmerksamkeitsaktivierung',
        alertness23_mit:    '1.2 Aufmerksamkeitsaktivierung',
        gonogo:             '1.3 Selektive Aufmerksamkeit',
        gonogo2:            '1.3 Selektive Aufmerksamkeit',
        flexibilitaet:      '1.3 Selektive Aufmerksamkeit',
        geteilte:           '1.4 Geteilte Aufmerksamkeit',
        geteilteVisuell:    '1.4 Geteilte Aufmerksamkeit',
        vigilanz:           '1.5 Daueraufmerksamkeit / Vigilanz',
        arbeitsgedaechtnis: '2.2 Arbeitsgedächtnis',
        gf_pr:              '6.2 Gesichtsfeld & Neglect',
        neg_pr:             '6.2 Gesichtsfeld & Neglect',
      };

      // Maps each main TAP key to its SD counterpart for inline pairing
      const TAP_MAIN_TO_SD: Record<string, string> = {
        alertnessM:         'alM_sd_pr',
        alertness23_ohne:   'al23_ohne_sd_pr',
        alertness23_mit:    'al23_mit_sd_pr',
        gonogo:             'gn_sd_pr',
        gonogo2:            'gn2_sd_pr',
        flexibilitaet:      'fl_sd_pr',
        geteilte:           'ga_sd_pr',
        geteilteVisuell:    'gv_sd_pr',
        vigilanz:           'vig_sd_pr',
        arbeitsgedaechtnis: 'ag_sd_pr',
      };

      // Maps each main TAP key to Fehler/Auslassungen PR keys pushed inline after SD
      const TAP_MAIN_TO_FEHLER_AUSL: Record<string, readonly string[]> = {
        gonogo:             ['gn_fehler_pr', 'gn_ausl_pr'],
        gonogo2:            ['gn2_fehler_pr', 'gn2_ausl_pr'],
        flexibilitaet:      ['fl_fehler_pr'],
        geteilteVisuell:    ['g_fehler_pr', 'g_ausl_ges_pr'],
        vigilanz:           ['vig_fehler_pr', 'vig_ausl_pr'],
        arbeitsgedaechtnis: ['ag_fehler_pr', 'ag_ausl_pr'],
      };

      // 'n/a' zählt hier wie ein leerer Wert — seit `best()` (TAPTab.tsx) für „kein PR"
      // konsequent das Sentinel 'n/a' statt eines leeren Strings liefert, ist JEDES
      // TAP-Kennwertfeld mindestens 'n/a' (also ein wahrheitswertig nicht-leerer String).
      // Ohne diesen Ausschluss würde jede Messung als „vorhanden" durchgehen, selbst wenn
      // rein gar nichts eingetragen wurde.
      const tapNoValue = (v: unknown) => v == null || String(v).trim() === '' || String(v).trim() === 'n/a';

      // Helper: for a given accessor, find sessions with a non-empty value, newest first
      const tapSessionsFor = <T,>(accessor: (r: TestResult) => T | undefined) =>
        tapResults.filter(r => !tapNoValue(accessor(r)));

      // Wie tapSessionsFor, aber eine Sitzung zählt zusätzlich mit, wenn zwar kein Normwert
      // vorliegt, aber mindestens einer der angegebenen Rohwert-Felder bereits ausgefüllt
      // wurde (unabhängig davon, ob die Sitzung als "abgebrochen" markiert ist — ein einzeln
      // eingetragener Rohwert, dessen PR noch nicht nachgetragen wurde, soll ebenfalls sofort
      // als "k.A."-Zeile mit Rohwert erscheinen) — so erscheint nur die tatsächlich begonnene
      // Messung, statt entweder gar nichts oder gleich alle ~30 TAP-Messungen.
      const tapSessionsForAllowRawOnly = (accessor: (r: TestResult) => unknown, ...rawKeys: (string | undefined)[]) =>
        tapResults.filter(r => {
          if (!tapNoValue(accessor(r))) return true;
          return rawKeys.some(k => k != null && !tapNoValue(r.rawValues[k]));
        });

      // TAP Erst/Abschluss: Eingangstestung (e_) = „vorher", Abschlusstestung (b_) = „aktuell".
      // „vorher" wird nur gezeigt, wenn auch ein Abschlusswert vorliegt (sonst nur der eine Punkt).
      // Hauptmaße brauchen eine explizite e_/b_-Zuordnung (PR-Key ≠ rawValues-Key);
      // SD- und Fehler/Auslassungs-Werte werden per Präfix abgeleitet (b_/e_ + Key).
      const tapTrim = (v: unknown) => v != null && String(v).trim() !== '';
      const TAP_MAIN_EB: Record<string, { e: string; b: string }> = {
        alertnessM:         { e: 'e_alM_pr',       b: 'b_alM_pr' },
        alertness23_ohne:   { e: 'e_al23_ohne_pr', b: 'b_al23_ohne_pr' },
        alertness23_mit:    { e: 'e_al23_mit_pr',  b: 'b_al23_mit_pr' },
        alertness23:        { e: 'e_al23_pr',      b: 'b_al23_pr' },
        gonogo:             { e: 'e_gn_pr',        b: 'b_gn_pr' },
        gonogo2:            { e: 'e_gn2_pr',       b: 'b_gn2_pr' },
        flexibilitaet:      { e: 'e_fl_pr',        b: 'b_fl_pr' },
        geteilte:           { e: 'e_ga_pr',        b: 'b_ga_pr' },
        geteilteVisuell:    { e: 'e_gv_pr',        b: 'b_gv_pr' },
        vigilanz:           { e: 'e_vig_pr',       b: 'b_vig_pr' },
        arbeitsgedaechtnis: { e: 'e_ag_pr',        b: 'b_ag_pr' },
        neg_pr:             { e: 'e_neg_pr',       b: 'b_neg_pr' },
      };
      // Visuelles Scanning: PR-Key ≠ rawValues-Key (e_ve_pr_… / b_ve_pr_…)
      const TAP_VE_EB: Record<string, { e: string; b: string }> = {
        ve_rt_krit_pr:   { e: 'e_ve_pr_krit',      b: 'b_ve_pr_krit' },
        ve_sd_krit_pr:   { e: 'e_ve_sd_pr_krit',   b: 'b_ve_sd_pr_krit' },
        ve_rt_nkrit_pr:  { e: 'e_ve_pr_nkrit',     b: 'b_ve_pr_nkrit' },
        ve_sd_nkrit_pr:  { e: 'e_ve_sd_pr_nkrit',  b: 'b_ve_sd_pr_nkrit' },
        ve_fehler_pr:    { e: 'e_ve_pr_fehler',    b: 'b_ve_pr_fehler' },
        ve_ausl_krit_pr: { e: 'e_ve_pr_ausl',      b: 'b_ve_pr_ausl' },
        ve_zeilen_r_pr:  { e: 'e_ve_pr_zeilen',    b: 'b_ve_pr_zeilen' },
        ve_spalten_r_pr: { e: 'e_ve_pr_spalten',   b: 'b_ve_pr_spalten' },
      };

      // Reaktionszeit-/Median-Rohwert je Hauptmetrik (für die Detailzeile unter dem PR).
      // alertness23 ist die phasische Alertness (kein ms-Wert); neg_pr hat keinen Median.
      const TAP_MAIN_RT: Record<string, { rawKey: string; label: string; unit: string } | undefined> = {
        alertnessM:         { rawKey: 'alM_rt',       label: 'Median', unit: ' ms' },
        alertness23_ohne:   { rawKey: 'al23_ohne_rt', label: 'Median', unit: ' ms' },
        alertness23_mit:    { rawKey: 'al23_mit_rt',  label: 'Median', unit: ' ms' },
        alertness23:        { rawKey: 'al23_phasisch', label: 'Phasisch', unit: '' },
        gonogo:             { rawKey: 'gn_rt',        label: 'Median', unit: ' ms' },
        gonogo2:            { rawKey: 'gn2_rt',       label: 'Median', unit: ' ms' },
        flexibilitaet:      { rawKey: 'fl_rt',        label: 'Median', unit: ' ms' },
        geteilte:           { rawKey: 'ga_rt',        label: 'Median', unit: ' ms' },
        geteilteVisuell:    { rawKey: 'gv_rt',        label: 'Median', unit: ' ms' },
        vigilanz:           { rawKey: 'vig_rt',       label: 'Median', unit: ' ms' },
        arbeitsgedaechtnis: { rawKey: 'ag_rt',        label: 'Median', unit: ' ms' },
      };

      // Datum je Messung: TAP speichert Eingang/Abschluss-Daten pro Metrik (e_date_<base>/b_date_<base>).
      const TAP_DATE_BASE: Record<string, string> = {
        alertnessM: 'alM', alertness23: 'al23', alertness23_ohne: 'al23', alertness23_mit: 'al23',
        gonogo: 'gn', gonogo2: 'gn2', flexibilitaet: 'fl',
        geteilte: 'ga', geteilteVisuell: 'ga', vigilanz: 'vig', arbeitsgedaechtnis: 'ag',
        neg_pr: 'neg', gf_pr: 'gf',
        alM_sd_pr: 'alM', al23_ohne_sd_pr: 'al23', al23_mit_sd_pr: 'al23',
        gn_sd_pr: 'gn', gn2_sd_pr: 'gn2', fl_sd_pr: 'fl',
        ga_sd_pr: 'ga', gv_sd_pr: 'ga', vig_sd_pr: 'vig', ag_sd_pr: 'ag',
      };
      // Anmerkung je TAP-Untertest (rawValues.note_XX) — bislang nur erfasst, nie angezeigt.
      const TAP_NOTE_FIELD: Record<string, string> = {
        alertnessM: 'note_alM',
        alertness23: 'note_al23', alertness23_ohne: 'note_al23', alertness23_mit: 'note_al23',
        gonogo: 'note_gn', gonogo2: 'note_gn2', flexibilitaet: 'note_fl',
        geteilte: 'note_ga', geteilteVisuell: 'note_ga',
        vigilanz: 'note_vig', arbeitsgedaechtnis: 'note_ag',
        neg_pr: 'note_neg',
      };
      // Führt die Anmerkung eines TAP-Untertests aus der aktuellen und der vorherigen
      // Sitzung zusammen (analog combineNotes) — bei getrennten Wiederholungsmessungen
      // soll der Kommentar aus beiden Sitzungen sichtbar bleiben, nicht nur der neueste.
      const combineTapNoteField = (latest: TestResult, previous: TestResult | undefined, field: string | undefined): string | undefined => {
        if (!field) return undefined;
        const a = String(latest.rawValues[field] ?? '').trim();
        const b = previous ? String(previous.rawValues[field] ?? '').trim() : '';
        if (!a && !b) return undefined;
        if (!b) return a || undefined;
        if (!a) return `[${formatDate(previous!.date)}] ${b}`;
        if (a === b) return a;
        return `${a}\n[${formatDate(previous!.date)}] ${b}`;
      };
      const tapNote = (r: TestResult, key: string, previous?: TestResult): string | undefined =>
        combineTapNoteField(r, previous, TAP_NOTE_FIELD[key]);
      // Liefert aktuelles + vorheriges Datum: bei In-Sitzungs-Paar Abschluss-/Eingangsdatum,
      // sonst das (Abschluss-bevorzugte) Datum der jeweiligen Sitzung.
      const tapRowDates = (base: string | undefined, lt: TestResult, pv: TestResult | undefined, inSession: boolean): { date: string; prevDate?: string } => {
        if (!base) return { date: lt.date, prevDate: pv?.date };
        const cur = (r: TestResult) => {
          const b = r.rawValues[`b_date_${base}`], e = r.rawValues[`e_date_${base}`];
          return String(tapTrim(b) ? b : tapTrim(e) ? e : r.date);
        };
        const e = lt.rawValues[`e_date_${base}`];
        return {
          date: cur(lt),
          prevDate: inSession ? (tapTrim(e) ? String(e) : undefined) : (pv ? cur(pv) : undefined),
        };
      };

      if (tapResults.length > 0) {
        for (const m of TAP_PR_MAP) {
          // Per-metric: find all sessions that actually have a value for this metric
          // (oder bei Abbruch zumindest einen erfassten Rohwert für dieses Maß).
          const mainRawKey = TAP_MAIN_RT[m.key]?.rawKey;
          const sessions = tapSessionsForAllowRawOnly(
            r => r.percentileRanks[m.key],
            mainRawKey, mainRawKey ? `b_${mainRawKey}` : undefined,
          );
          if (sessions.length === 0) continue;
          const latest   = sessions[0];
          const previous = sessions[1];

          const currPr = prOrNA(latest.percentileRanks[m.key]);
          // „vorher" = Eingangstestung der aktuellen Sitzung, nur wenn auch Abschluss vorhanden
          const eb = TAP_MAIN_EB[m.key];
          const erstVal      = eb ? latest.rawValues[eb.e] : undefined;
          const abschlussVal = eb ? latest.rawValues[eb.b] : undefined;
          // „vorher" je Maß: Eingang derselben Sitzung; ohne In-Sitzungs-Paar die zweitneueste
          // separate Sitzung DESSELBEN Maßes (sessions ist bereits per m.key gefiltert – Tests
          // werden also nie vermischt).
          const hasInSession = tapTrim(abschlussVal) && tapTrim(erstVal);
          const prevPr = hasInSession ? erstVal : previous?.percentileRanks[m.key];
          // Historie-Punkte: mit In-Sitzungs-Paar zählt sessions[1] noch dazu, sonst ist sie bereits „vorher".
          const olderArr = hasInSession ? sessions.slice(1) : sessions.slice(2);

          // Determine version badge: 'M' or '2.3' only for items with a version toggle
          const verField = TAP_VER_FIELD[m.key];
          let tapVersion: 'M' | '2.3' | undefined;
          if (m.key === 'alertnessM') {
            tapVersion = 'M';
          } else if (m.key === 'alertness23' || m.key === 'alertness23_ohne' || m.key === 'alertness23_mit') {
            tapVersion = '2.3';
          } else if (verField) {
            tapVersion = String(latest.rawValues[verField] ?? '') === 'M' ? 'M' : '2.3';
          }

          const olderMainPrs = olderArr
            .map(r => r.percentileRanks[m.key])
            .filter((v): v is string | number => !!v && String(v).trim() !== '' && String(v).trim() !== 'n/a');

          // Median-/RT-Rohwert als Detailzeile (Abschluss bevorzugt, Eingang als „vorher").
          const rt = TAP_MAIN_RT[m.key];
          let mainDetails: string[] | undefined;
          let mainPrevDetails: string[] | undefined;
          if (rt) {
            const eRt = latest.rawValues[rt.rawKey];
            const bRt = latest.rawValues[`b_${rt.rawKey}`];
            const currRt = tapTrim(bRt) ? bRt : eRt;
            if (tapTrim(currRt)) mainDetails = [`${rt.label}: ${currRt}${rt.unit}`];
            // „vorher"-Rohwert: Eingang derselben Sitzung, sonst RT der vorherigen Sitzung.
            const prevRt = (tapTrim(bRt) && tapTrim(eRt)) ? eRt : previous?.rawValues[rt.rawKey];
            if (tapTrim(prevRt)) mainPrevDetails = [`${rt.label}: ${prevRt}${rt.unit}`];
          }

          data.push({
            label: m.label,
            currentPr: currPr,
            previousPr: prevPrOrUndef(prevPr),
            previousPrs: olderMainPrs.length > 0 ? olderMainPrs : undefined,
            date: tapRowDates(TAP_DATE_BASE[m.key], latest, previous, hasInSession).date,
            prevDate: tapRowDates(TAP_DATE_BASE[m.key], latest, previous, hasInSession).prevDate,
            domain: m.domain,
            subdomain: TAP_SUBDOMAIN[m.key],
            testGroup: 'TAP',
            tapVersion,
            details: mainDetails,
            previousDetails: mainPrevDetails,
            note: tapNote(latest, m.key, previous),
            ...abt(latest),
            ...pabt(previous),
          });

          // Push the corresponding SD row immediately after its main value
          const sdKey = TAP_MAIN_TO_SD[m.key];
          if (sdKey) {
            const sdDef = TAP_SD_PR_MAP.find(s => s.key === sdKey);
            if (sdDef) {
              const sdErst      = latest.rawValues[sdDef.key];
              const sdAbschluss = latest.rawValues[`b_${sdDef.key}`];
              const sdCurrPr = tapTrim(sdAbschluss) ? sdAbschluss : sdErst;
              const sdRawErst      = latest.rawValues[sdDef.rawKey];
              const sdRawAbschluss = latest.rawValues[`b_${sdDef.rawKey}`];
              const sdHasRaw = tapTrim(sdRawErst) || tapTrim(sdRawAbschluss);
              if ((sdCurrPr && String(sdCurrPr).trim() !== '') || sdHasRaw) {
                // Eingang/Abschluss-Zuordnung richtet sich nach den ROHWERT-Feldern, nicht nach
                // den PR-Feldern — sonst verschwindet der Abschluss-Rohwert einer Wiederholungs-
                // testung, solange nur der (oft erst später nachgetragene) PR noch fehlt.
                const sdHasInSession = tapTrim(sdRawAbschluss) && tapTrim(sdRawErst);
                const sdPrevPr = sdHasInSession ? sdErst : previous?.rawValues[sdDef.key];
                const sdRaw = tapTrim(sdRawAbschluss) ? sdRawAbschluss : sdRawErst;
                const sdPrevRaw = sdHasInSession ? sdRawErst : previous?.rawValues[sdDef.rawKey];
                const olderSdPrs = olderArr
                  .map(r => r.rawValues[sdDef.key])
                  .filter((v): v is string | number => !!v && String(v).trim() !== '' && String(v).trim() !== 'n/a');
                data.push({
                  label: sdDef.label,
                  currentPr: sdCurrPr && String(sdCurrPr).trim() !== '' ? sdCurrPr : 'n/a',
                  previousPr: prevPrOrUndef(sdPrevPr),
                  previousPrs: olderSdPrs.length > 0 ? olderSdPrs : undefined,
                  date: tapRowDates(TAP_DATE_BASE[m.key], latest, previous, sdHasInSession).date,
                  prevDate: tapRowDates(TAP_DATE_BASE[m.key], latest, previous, sdHasInSession).prevDate,
                  domain: m.domain,
                  subdomain: TAP_SUBDOMAIN[m.key],
                  testGroup: 'TAP',
                  details: sdRaw ? [`SD: ${sdRaw} ${sdDef.unit}`] : undefined,
                  previousDetails: tapTrim(sdPrevRaw) ? [`SD: ${sdPrevRaw} ${sdDef.unit}`] : undefined,
                  note: tapNote(latest, m.key, previous),
                  ...abt(latest),
                  ...pabt(previous),
                });
              }
            }
          }

          // Push Fehler/Auslassungen inline immediately after SD
          for (const fk of TAP_MAIN_TO_FEHLER_AUSL[m.key] ?? []) {
            const fDef = TAP_FEHLER_AUSL_PR_MAP.find(f => f.key === fk);
            if (!fDef) continue;
            const fCurrPr = latest.percentileRanks[fk as keyof typeof latest.percentileRanks];
            const fErst      = latest.rawValues[`e_${fk}`];
            const fAbschluss = latest.rawValues[`b_${fk}`];
            const rawValErst      = latest.rawValues[fDef.rawKey];
            const rawValAbschluss = latest.rawValues[`b_${fDef.rawKey}`];
            const fHasRaw = tapTrim(rawValErst) || tapTrim(rawValAbschluss);
            if (tapNoValue(fCurrPr) && !fHasRaw) continue;
            // Eingang/Abschluss-Zuordnung richtet sich nach den ROHWERT-Feldern, nicht nach
            // den PR-Feldern — sonst verschwindet der Abschluss-Rohwert einer Wiederholungs-
            // testung, solange nur der (oft erst später nachgetragene) PR noch fehlt.
            const fHasInSession = tapTrim(rawValAbschluss) && tapTrim(rawValErst);
            const fPrevPr = fHasInSession ? fErst : previous?.percentileRanks[fk as keyof typeof latest.percentileRanks];
            const rawVal = tapTrim(rawValAbschluss) ? rawValAbschluss : rawValErst;
            const fPrevRaw = fHasInSession ? rawValErst : previous?.rawValues[fDef.rawKey];
            const olderFPrs = olderArr
              .map(r => r.percentileRanks[fk as keyof typeof r.percentileRanks])
              .filter((v): v is string | number => !!v && String(v).trim() !== '' && String(v).trim() !== 'n/a');
            data.push({
              label: fDef.label,
              currentPr: tapNoValue(fCurrPr) ? 'n/a' : fCurrPr,
              previousPr: prevPrOrUndef(fPrevPr),
              previousPrs: olderFPrs.length > 0 ? olderFPrs : undefined,
              date: tapRowDates(TAP_DATE_BASE[m.key], latest, previous, fHasInSession).date,
              prevDate: tapRowDates(TAP_DATE_BASE[m.key], latest, previous, fHasInSession).prevDate,
              domain: m.domain,
              subdomain: TAP_SUBDOMAIN[m.key],
              testGroup: 'TAP',
              details: rawVal != null && rawVal !== '' ? [`Wert: ${rawVal}`] : undefined,
              previousDetails: tapTrim(fPrevRaw) ? [`Wert: ${fPrevRaw}`] : undefined,
              note: tapNote(latest, m.key, previous),
              ...abt(latest),
              ...pabt(previous),
            });
          }
        }
      }

      // ── TAP Visuelle Exploration ──────────────────────────────────────────────
      const TAP_VE_SUBDOMAIN = '6.1 Visuelles Scanning';
      if (tapResults.length > 0) {
        for (const m of TAP_VE_PR_MAP) {
          const sessions = tapSessionsForAllowRawOnly(r => r.percentileRanks[m.key], m.rawKey, `b_${m.rawKey}`);
          if (sessions.length === 0) continue;
          const latest   = sessions[0];
          const previous = sessions[1];

          const currPr = prOrNA(latest.percentileRanks[m.key]);
          const veEb = TAP_VE_EB[m.key];
          const veErst      = veEb ? latest.rawValues[veEb.e] : undefined;
          const veAbschluss = veEb ? latest.rawValues[veEb.b] : undefined;
          const veRawErst      = latest.rawValues[m.rawKey];
          const veRawAbschluss = latest.rawValues[`b_${m.rawKey}`];
          // Eingang/Abschluss-Zuordnung richtet sich nach den ROHWERT-Feldern, nicht nach
          // den PR-Feldern — sonst verschwindet der Abschluss-Rohwert einer Wiederholungs-
          // testung, solange nur der (oft erst später nachgetragene) PR noch fehlt.
          const hasInSession = tapTrim(veRawAbschluss) && tapTrim(veRawErst);
          const prevPr = hasInSession ? veErst : previous?.percentileRanks[m.key];
          const olderArr = hasInSession ? sessions.slice(1) : sessions.slice(2);
          const rawVal = tapTrim(veRawAbschluss) ? veRawAbschluss : veRawErst;
          const vePrevRaw = hasInSession ? veRawErst : previous?.rawValues[m.rawKey];
          const veIsTapM = String(latest.rawValues.ve_ver ?? '') === 'M';
          const olderVePrs = olderArr
            .map(r => r.percentileRanks[m.key])
            .filter((v): v is string | number => !!v && String(v).trim() !== '' && String(v).trim() !== 'n/a');
          data.push({
            label: m.label,
            currentPr: currPr,
            previousPr: prevPrOrUndef(prevPr),
            previousPrs: olderVePrs.length > 0 ? olderVePrs : undefined,
            date: tapRowDates('ve', latest, previous, hasInSession).date,
            prevDate: tapRowDates('ve', latest, previous, hasInSession).prevDate,
            domain: '6. Visuelle Exploration',
            subdomain: TAP_VE_SUBDOMAIN,
            testGroup: 'TAP – Vis. Scanning',
            tapVersion: veIsTapM ? 'M' : '2.3',
            details: rawVal ? [`Wert: ${rawVal}${m.unit ? ' ' + m.unit : ''}`] : undefined,
            previousDetails: tapTrim(vePrevRaw) ? [`Wert: ${vePrevRaw}${m.unit ? ' ' + m.unit : ''}`] : undefined,
            note: combineTapNoteField(latest, previous, 'note_ve'),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── TAP Standardabweichungen ──────────────────────────────────────────────
      const TAP_SD_SUBDOMAIN: Record<string, string | undefined> = {
        alM_sd_pr:       '1.2 Aufmerksamkeitsaktivierung',
        al23_ohne_sd_pr: '1.2 Aufmerksamkeitsaktivierung',
        al23_mit_sd_pr:  '1.2 Aufmerksamkeitsaktivierung',
        gn_sd_pr:        '1.3 Selektive Aufmerksamkeit',
        gn2_sd_pr:       '1.3 Selektive Aufmerksamkeit',
        fl_sd_pr:        '1.3 Selektive Aufmerksamkeit',
        ga_sd_pr:        '1.4 Geteilte Aufmerksamkeit',
        gv_sd_pr:        '1.4 Geteilte Aufmerksamkeit',
        vig_sd_pr:       '1.5 Daueraufmerksamkeit / Vigilanz',
        ag_sd_pr:        '2.2 Arbeitsgedächtnis',
      };
      const TAP_SD_NOTE_FIELD: Record<string, string> = {
        alM_sd_pr: 'note_alM', al23_ohne_sd_pr: 'note_al23', al23_mit_sd_pr: 'note_al23',
        gn_sd_pr: 'note_gn', gn2_sd_pr: 'note_gn2', fl_sd_pr: 'note_fl',
        ga_sd_pr: 'note_ga', gv_sd_pr: 'note_ga', vig_sd_pr: 'note_vig', ag_sd_pr: 'note_ag',
      };
      if (tapResults.length > 0) {
        for (const m of TAP_SD_PR_MAP) {
          if (Object.values(TAP_MAIN_TO_SD).includes(m.key)) continue; // already pushed inline after main
          const sessions = tapSessionsFor(r => r.rawValues[m.key]);
          if (sessions.length === 0) continue;
          const latest   = sessions[0];
          const previous = sessions[1];

          const sdErst      = latest.rawValues[m.key];
          const sdAbschluss = latest.rawValues[`b_${m.key}`];
          const currPr = (tapTrim(sdAbschluss) ? sdAbschluss : sdErst)!;
          // Eingang/Abschluss derselben Sitzung, sonst die zweitneueste separate Messung als „vorher".
          const hasInSession = tapTrim(sdAbschluss) && tapTrim(sdErst);
          const prevPr = hasInSession ? sdErst : previous?.rawValues[m.key];
          const olderArr = hasInSession ? sessions.slice(1) : sessions.slice(2);
          // Rohwert (ms) folgt derselben Eingang/Abschluss-Präferenz wie der PR (currPr) —
          // sonst fehlt der Rohwert, wenn nur die Abschluss-/Wiederholungstestung ausgefüllt ist.
          const rawValErst      = latest.rawValues[m.rawKey];
          const rawValAbschluss = latest.rawValues[`b_${m.rawKey}`];
          const rawVal = tapTrim(sdAbschluss) ? rawValAbschluss : rawValErst;
          const sdOnlyPrevRaw = hasInSession ? undefined : previous?.rawValues[m.rawKey];
          const olderSdOnlyPrs = olderArr
            .map(r => r.rawValues[m.key])
            .filter((v): v is string | number => !!v && String(v).trim() !== '' && String(v).trim() !== 'n/a');
          data.push({
            label: m.label,
            currentPr: currPr,
            previousPr: prevPrOrUndef(prevPr),
            previousPrs: olderSdOnlyPrs.length > 0 ? olderSdOnlyPrs : undefined,
            date: tapRowDates(TAP_DATE_BASE[m.key], latest, previous, hasInSession).date,
            prevDate: tapRowDates(TAP_DATE_BASE[m.key], latest, previous, hasInSession).prevDate,
            domain: m.domain,
            subdomain: TAP_SD_SUBDOMAIN[m.key],
            testGroup: 'TAP – Standardabweichungen',
            details: rawVal ? [`SD: ${rawVal} ${m.unit}`] : undefined,
            previousDetails: tapTrim(sdOnlyPrevRaw) ? [`SD: ${sdOnlyPrevRaw} ${m.unit}`] : undefined,
            note: combineTapNoteField(latest, previous, TAP_SD_NOTE_FIELD[m.key]),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // TAP Fehler/Auslassungen are now pushed inline after each test's SD (see TAP_MAIN_TO_FEHLER_AUSL above)

      // ── WMS-IV Visuelle Wiedergabe ────────────────────────────────────────────
      const wmsResults = results
        .filter(r => r.testId === 'wms_vw')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (wmsResults.length > 0) {
        const latest   = wmsResults[0];
        const previous = wmsResults[1];

        if (latest.percentileRanks.sofortiger_abruf !== undefined || latest.aborted || hasVal(latest.rawValues.sofortig)) {
          data.push({
            label: 'Sofortiger Abruf',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.sofortiger_abruf),
            previousPr: prevPrOrUndef(previous?.percentileRanks.sofortiger_abruf),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Visuell)',
            subdomain: '2.4 Figurales Gedächtnis',
            testGroup: 'Visuelle Wiedergabe WMS-IV',
            details: [`RW: ${latest.rawValues.sofortig}, WP: ${latest.calculatedValues.sofortig_wp ?? '–'}`],
            previousDetails: previous?.rawValues.sofortig !== undefined
              ? [`RW: ${previous.rawValues.sofortig}, WP: ${previous.calculatedValues.sofortig_wp ?? '–'}`]
              : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }

        if (latest.percentileRanks.verzoegerter_abruf !== undefined || latest.aborted || hasVal(latest.rawValues.verzoegert)) {
          data.push({
            label: 'Verzögerter Abruf',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.verzoegerter_abruf),
            previousPr: prevPrOrUndef(previous?.percentileRanks.verzoegerter_abruf),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Visuell)',
            subdomain: '2.4 Figurales Gedächtnis',
            testGroup: 'Visuelle Wiedergabe WMS-IV',
            details: [`RW: ${latest.rawValues.verzoegert}, WP: ${latest.calculatedValues.verzoegert_wp ?? '–'}`],
            previousDetails: previous?.rawValues.verzoegert !== undefined
              ? [`RW: ${previous.rawValues.verzoegert}, WP: ${previous.calculatedValues.verzoegert_wp ?? '–'}`]
              : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }

        if (latest.percentileRanks.wiedererkennen !== undefined || latest.aborted || hasVal(latest.rawValues.wiedererkennen)) {
          data.push({
            label: 'Wiedererkennen',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.wiedererkennen),
            previousPr: prevPrOrUndef(previous?.percentileRanks.wiedererkennen),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Visuell)',
            subdomain: '2.4 Figurales Gedächtnis',
            testGroup: 'Visuelle Wiedergabe WMS-IV',
            details: [`RW: ${latest.rawValues.wiedererkennen}`],
            previousDetails: previous?.rawValues.wiedererkennen !== undefined
              ? [`RW: ${previous.rawValues.wiedererkennen}`]
              : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── ROCFT ────────────────────────────────────────────────────────────────
      const rocftResults = results
        .filter(r => r.testId === 'rey')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (rocftResults.length > 0) {
        const latest   = rocftResults[0];
        const previous = rocftResults[1];
        const ROCFT_SCALES = [
          { key: 'cft', label: 'Kopieren (ROCFT)',  rawKey: 'cft' },
          { key: 'cfm', label: 'Direkter Abruf (ROCFT)',     rawKey: 'cfm' },
          { key: 'cqm', label: 'Verzögerter Abruf (ROCFT)',  rawKey: 'cqm' },
        ] as const;
        for (const s of ROCFT_SCALES) {
          const currPr = latest.percentileRanks[s.key];
          if ((currPr === undefined || currPr === 'n/a') && !latest.aborted && !hasVal(latest.rawValues[s.rawKey])) continue;
          data.push({
            label: s.label,
            currentPr: latest.aborted ? 'n/a' : prOrNA(currPr),
            previousPr: prevPrOrUndef(previous?.percentileRanks[s.key]),
            date: latest.date,
            prevDate: previous?.date,
            domain: '3. Visuo-Perz. / Visuo-Konstr.',
            testGroup: 'Rey-Osterrieth-Figur (ROCFT)',
            details: [`RW: ${latest.rawValues[s.rawKey] ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues[s.rawKey] ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── ZZT ──────────────────────────────────────────────────────────────────
      const zztResults = results
        .filter(r => r.testId === 'zzt')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (ZZT_ENABLED && zztResults.length > 0) {
        const latest   = zztResults[0];
        const previous = zztResults[1];
        if (latest.percentileRanks.zzt !== undefined || latest.aborted || hasVal(latest.rawValues.median) || hasVal(latest.rawValues.rohwert)) {
          data.push({
            label: 'ZZT (Median)',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.zzt),
            previousPr: prevPrOrUndef(previous?.percentileRanks.zzt),
            date: latest.date,
            prevDate: previous?.date,
            domain: '1. Aufmerksamkeit',
            subdomain: '1.1 Informationsverarbeitungsgeschwindigkeit',
            testGroup: 'Zahlen-Zeichen-Test',
            details: latest.rawValues.median != null ? [`Median: ${latest.rawValues.median} ms`] : latest.rawValues.rohwert != null ? [`RW: ${latest.rawValues.rohwert}`] : undefined,
            previousDetails: previous?.rawValues.median != null ? [`Median: ${previous.rawValues.median} ms`] : previous?.rawValues.rohwert != null ? [`RW: ${previous.rawValues.rohwert}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── Zahlenspanne ─────────────────────────────────────────────────────────
      const zahlenspanneResults = results
        .filter(r => r.testId === 'zahlenspanne')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (zahlenspanneResults.length > 0) {
        const latest   = zahlenspanneResults[0];
        const previous = zahlenspanneResults[1];
        const ageAtTest = calculateAge(patient.geburtsdatum, latest.date);
        const prevAge   = previous ? calculateAge(patient.geburtsdatum, previous.date) : null;

        // Fallback: recalculate PR from rawValues if not stored (e.g. old results with null-PR rohwerts)
        const resolveZSPR = (res: typeof latest, dir: 'vorwaerts' | 'rueckwaerts', age: number) => {
          const stored = res.percentileRanks[dir];
          if (stored !== undefined && String(stored).trim() !== '') return stored;
          const raw = res.rawValues[dir];
          if (raw == null || raw === '') return undefined;
          const calc = lookupZahlenspanne(Number(raw), age, dir);
          return calc ?? undefined;
        };

        const vwPR   = resolveZSPR(latest, 'vorwaerts',  ageAtTest);
        const rkPR   = resolveZSPR(latest, 'rueckwaerts', ageAtTest);
        const pvwPR  = previous && prevAge != null ? resolveZSPR(previous, 'vorwaerts',  prevAge) : undefined;
        const prkPR  = previous && prevAge != null ? resolveZSPR(previous, 'rueckwaerts', prevAge) : undefined;

        if (vwPR !== undefined || latest.aborted || hasVal(latest.rawValues.vorwaerts)) {
          data.push({
            label: 'Zahlenspanne vorwärts (WMS-R)',
            currentPr: latest.aborted ? 'n/a' : prOrNA(vwPR),
            previousPr: prevPrOrUndef(pvwPR),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Kurzzeitgedächtnis)',
            subdomain: '2.1 Merkspanne',
            testGroup: 'Zahlenspanne',
            details: [`RW: ${latest.rawValues.vorwaerts ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues.vorwaerts ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }

        if (rkPR !== undefined || latest.aborted || hasVal(latest.rawValues.rueckwaerts)) {
          data.push({
            label: 'Zahlenspanne rückwärts (WMS-R)',
            currentPr: latest.aborted ? 'n/a' : prOrNA(rkPR),
            previousPr: prevPrOrUndef(prkPR),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Arbeitsgedächtnis)',
            subdomain: '2.2 Arbeitsgedächtnis',
            testGroup: 'Zahlenspanne',
            details: [`RW: ${latest.rawValues.rueckwaerts ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues.rueckwaerts ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── Blockspanne ──────────────────────────────────────────────────────────
      const blockspanneResults = results
        .filter(r => r.testId === 'blockspanne')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (blockspanneResults.length > 0) {
        const latest   = blockspanneResults[0];
        const previous = blockspanneResults[1];

        if (latest.percentileRanks.vorwaerts !== undefined || latest.aborted || hasVal(latest.rawValues.vorwaerts)) {
          data.push({
            label: 'Blockspanne vorwärts (WMS-R)',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.vorwaerts),
            previousPr: prevPrOrUndef(previous?.percentileRanks.vorwaerts),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Kurzzeitgedächtnis)',
            subdomain: '2.1 Merkspanne',
            testGroup: 'Blockspanne',
            details: [`RW: ${latest.rawValues.vorwaerts ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues.vorwaerts ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }

        if (latest.percentileRanks.rueckwaerts !== undefined || latest.aborted || hasVal(latest.rawValues.rueckwaerts)) {
          data.push({
            label: 'Blockspanne rückwärts (WMS-R)',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.rueckwaerts),
            previousPr: prevPrOrUndef(previous?.percentileRanks.rueckwaerts),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Arbeitsgedächtnis)',
            subdomain: '2.2 Arbeitsgedächtnis',
            testGroup: 'Blockspanne',
            details: [`RW: ${latest.rawValues.rueckwaerts ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues.rueckwaerts ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── Logisches Gedächtnis ──────────────────────────────────────────────────
      const lgResults = results
        .filter(r => r.testId === 'lg')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (lgResults.length > 0) {
        const latest   = lgResults[0];
        const previous = lgResults[1];

        if (latest.percentileRanks.lgI !== undefined || latest.aborted || hasVal(latest.rawValues.lgI)) {
          data.push({
            label: 'Log. Gedächtnis I (Sofort)',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.lgI),
            previousPr: prevPrOrUndef(previous?.percentileRanks.lgI),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Lernen)',
            subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
            testGroup: 'Logisches Gedächtnis (WMS-IV)',
            details: [`RW: ${latest.rawValues.lgI ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues.lgI ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }

        if (latest.percentileRanks.lgII !== undefined || latest.aborted || hasVal(latest.rawValues.lgII)) {
          data.push({
            label: 'Log. Gedächtnis II (Verzögert)',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.lgII),
            previousPr: prevPrOrUndef(previous?.percentileRanks.lgII),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Langzeit)',
            subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
            testGroup: 'Logisches Gedächtnis (WMS-IV)',
            details: [`RW: ${latest.rawValues.lgII ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues.lgII ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }

        if (latest.percentileRanks.wiedererk !== undefined || latest.aborted || hasVal(latest.rawValues.wiedererk)) {
          data.push({
            label: 'Log. Gedächtnis Wiedererkennen',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.wiedererk),
            previousPr: prevPrOrUndef(previous?.percentileRanks.wiedererk),
            date: latest.date,
            prevDate: previous?.date,
            domain: '2. Gedächtnis (Wiedererkennen)',
            subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
            testGroup: 'Logisches Gedächtnis (WMS-IV)',
            details: [`RW: ${latest.rawValues.wiedererk ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues.wiedererk ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── Mosaik-Test ───────────────────────────────────────────────────────────
      const mosaikResults = results
        .filter(r => r.testId === 'mosaik')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (mosaikResults.length > 0) {
        const latest   = mosaikResults[0];
        const previous = mosaikResults[1];
        if (latest.percentileRanks.mosaik !== undefined || latest.aborted || hasVal(latest.rawValues.rohwert)) {
          data.push({
            label: 'Mosaik-Test',
            currentPr: latest.aborted ? 'n/a' : prOrNA(latest.percentileRanks.mosaik),
            previousPr: prevPrOrUndef(previous?.percentileRanks.mosaik),
            date: latest.date,
            prevDate: previous?.date,
            domain: '3. Visuo-Perz. / Visuo-Konstr.',
            testGroup: 'Mosaik-Test',
            details: [`RW: ${latest.rawValues.rohwert ?? '–'}`],
            previousDetails: previous ? [`RW: ${previous.rawValues.rohwert ?? '–'}`] : undefined,
            note: combineNotes(latest, previous),
            ...abt(latest),
            ...pabt(previous),
          });
        }
      }

      // ── LPS – Leistungsprüfsystem ─────────────────────────────────────────────
      // Each subtest is evaluated independently across all LPS sessions so that
      // subtests entered in different sessions all appear in the profile.
      const lpsResults = results
        .filter(r => r.testId === 'lps')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (lpsResults.length > 0) {
        // Version (A/B/50+) aus der jüngsten LPS-Sitzung; wird in der Profil-Überschrift gezeigt.
        const lpsVersionLabel = LPS_VERSION_OPTIONS.find(o => o.value === lpsResults[0].rawValues.version)?.label;
        const lps50FormLabel = lpsResults[0].rawValues.version === '50plus'
          ? LPS_50PLUS_FORM_OPTIONS.find(o => o.value === lpsResults[0].rawValues.lps50Form)?.label
          : undefined;
        const lpsTestGroup = lpsVersionLabel
          ? `LPS – ${lpsVersionLabel}${lps50FormLabel ? ` (${lps50FormLabel})` : ''}`
          : 'LPS';
        let lpsRowCount = 0;
        for (const s of LPS_SUBTESTS) {
          // Alle Sitzungen mit PR ODER bereits eingetragenem Rohwert für diesen Subtest,
          // neueste zuerst — ein Rohwert ohne (noch) berechneten PR soll trotzdem erscheinen.
          const withData = lpsResults.filter(r =>
            r.percentileRanks[s.id] !== undefined || hasVal(r.rawValues[`${s.id}_rw`]),
          );
          if (withData.length === 0) continue;

          const latest   = withData[0];
          const previous = withData[1];

          const korrekturLabel = LPS_KORREKTUR_OPTIONS.find(
            o => o.value === latest.rawValues.korrektur
          )?.label ?? 'Unkorrigiert';

          const rw  = latest.rawValues[`${s.id}_rw`];
          const tw  = latest.rawValues[`${s.id}_tw`];
          const prw = previous?.rawValues[`${s.id}_rw`];
          const ptw = previous?.rawValues[`${s.id}_tw`];

          data.push({
            label: s.label,
            currentPr: prOrNA(latest.percentileRanks[s.id]),
            previousPr: prevPrOrUndef(previous?.percentileRanks[s.id]),
            date: latest.date,
            prevDate: previous?.date,
            domain: '4. Intellektuelle Leistungen',
            testGroup: lpsTestGroup,
            lpsKorrektur: korrekturLabel,
            details: [
              [rw !== undefined ? `RW: ${rw}` : null, tw !== undefined ? `T: ${tw}` : null]
                .filter(Boolean).join('  ') || undefined,
            ].filter(Boolean) as string[],
            previousDetails: previous ? [
              [prw !== undefined ? `RW: ${prw}` : null, ptw !== undefined ? `T: ${ptw}` : null]
                .filter(Boolean).join('  ') || undefined,
            ].filter(Boolean) as string[] : undefined,
            note: combineNotes(latest, previous),
          });
          lpsRowCount++;
        }

        // Abgebrochen und kein Subtest erfasst → eine Sammelzeile mit der Begründung.
        if (lpsRowCount === 0 && lpsResults[0].aborted) {
          data.push({
            label: 'LPS',
            currentPr: 'n/a',
            date: lpsResults[0].date,
            domain: '4. Intellektuelle Leistungen',
            testGroup: lpsTestGroup,
            note: combineNotes(lpsResults[0], lpsResults[1]),
            ...abt(lpsResults[0]),
          });
        }
      }

      // ── Custom Tests ─────────────────────────────────────────────────────────
      const customResults = results
        .filter(r => r.testId === 'custom')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (customResults.length > 0) {
        // Group by test name
        const byName = new Map<string, typeof customResults>();
        for (const r of customResults) {
          const name = String(r.rawValues.testName ?? 'Eigener Test');
          if (!byName.has(name)) byName.set(name, []);
          byName.get(name)!.push(r);
        }

        for (const [name, rList] of byName) {
          const latest = rList[0];
          const previous = rList[1];
          let parsedRows: Array<{label: string; value: string; pr: string}> = [];
          try { parsedRows = JSON.parse(String(latest.rawValues.rows ?? '[]')); } catch { /* ignore */ }

          const isRangePr = (s: string) => /^[\d.]+\s*[-–]\s*[\d.]+$|^[<>]\s*[\d.]/.test(s.trim());
          const parsePr = (s: string): number | string | 'n/a' => {
            const t = s.trim();
            if (!t) return 'n/a';
            if (isRangePr(t)) return t;           // preserve range / boundary strings
            const n = parseFloat(t);
            return isNaN(n) ? t : n;              // numeric or qualitative text
          };

          parsedRows.forEach((row, i) => {
            if (!row.label && !row.value && !row.pr) return;
            const currPr = parsePr(row.pr);

            let prevParsedRows: Array<{label: string; value: string; pr: string}> = [];
            if (previous) {
              try { prevParsedRows = JSON.parse(String(previous.rawValues.rows ?? '[]')); } catch { /* ignore */ }
            }
            const prevRow = prevParsedRows[i];
            const prevPr = prevRow?.pr ? parsePr(prevRow.pr) : undefined;
            const prevPrVal = prevPr === 'n/a' ? undefined : prevPr;

            data.push({
              label: row.label || `Wert ${i + 1}`,
              currentPr: currPr,
              previousPr: prevPrVal,
              date: latest.date,
              prevDate: previous?.date,
              domain: name,
              testGroup: name,
              details: row.value ? [`Wert: ${row.value}`] : undefined,
              previousDetails: prevRow?.value ? [`Wert: ${prevRow.value}`] : undefined,
              note: combineNotes(latest, previous),
              ...abt(latest),
              ...pabt(previous),
            });
          });
        }
      }

      // ── Notiz-Deduplizierung ───────────────────────────────────────────────────
      // Eine Notiz gehört zur gesamten Testsitzung, nicht zu einzelnen Unterskalen.
      // Da dieselbe Notiz an jede Zeile eines Tests gehängt wird (z. B. an alle drei
      // ROCFT-Skalen oder an sofortigen/verzögerten Abruf), pro Testgruppe nur einmal
      // anzeigen – verhindert die mehrfache Anzeige derselben Notiz.
      const seenNotes = new Set<string>();
      for (const row of data) {
        if (!row.note) continue;
        const k = `${row.testGroup ?? ''} ${row.note}`;
        if (seenNotes.has(k)) row.note = undefined;
        else seenNotes.add(k);
      }

      return data;
    })();

    // ── Text-based results (Bürotest, Tagesplan) ─────────────────────────────
    const textResults: TextProfileResult[] = [];

    const bueroLatest = results
      .filter(r => r.testId === 'buerotest')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (bueroLatest) {
      const items: { label: string; text: string }[] = [];
      if (String(bueroLatest.rawValues.aufgabe1 ?? '').trim())
        items.push({ label: 'Aufgabe 1', text: String(bueroLatest.rawValues.aufgabe1) });
      if (String(bueroLatest.rawValues.aufgabe6 ?? '').trim())
        items.push({
          label: `Aufgabe 6${bueroLatest.rawValues.aufgabe6variant ? ` (${bueroLatest.rawValues.aufgabe6variant})` : ''}`,
          text: String(bueroLatest.rawValues.aufgabe6),
        });
      if (items.length > 0)
        textResults.push({ domain: '5. Exekutive Funktionen', testGroup: 'Bürotest', items, date: bueroLatest.date, examiner: bueroLatest.examiner, note: combineNotes(bueroLatest) });
    }

    const tagesplanLatest = results
      .filter(r => r.testId === 'tagesplan')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (tagesplanLatest && String(tagesplanLatest.rawValues.planText ?? '').trim()) {
      textResults.push({
        domain: '5. Exekutive Funktionen',
        testGroup: 'Tagesplan',
        items: [{ label: 'Tagesplan', text: String(tagesplanLatest.rawValues.planText) }],
        date: tagesplanLatest.date,
        examiner: tagesplanLatest.examiner,
        note: combineNotes(tagesplanLatest),
      });
    }

    // ── Custom Tests: Freitext-Zeilen → TextProfileResults ───────────────────────
    {
      const customResults = results
        .filter(r => r.testId === 'custom')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const byName = new Map<string, typeof customResults>();
      for (const r of customResults) {
        const name = String(r.rawValues.testName ?? 'Eigener Test');
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name)!.push(r);
      }
      for (const [name, rList] of byName) {
        const latest = rList[0];
        let parsedRows: Array<{ label: string; value: string; pr: string; freitext?: string }> = [];
        try { parsedRows = JSON.parse(String(latest.rawValues.rows ?? '[]')); } catch { /* ignore */ }
        const freitextItems = parsedRows
          .filter(row => row.freitext !== undefined && row.freitext.trim() !== '')
          .map(row => ({ label: '', text: row.freitext! }));
        if (freitextItems.length > 0)
          textResults.push({ domain: name, testGroup: name, items: freitextItems, date: latest.date, examiner: latest.examiner, note: latest.note ?? undefined });
      }
    }

    // ── Explorationsaufgaben → TextProfileResults for domain 6 ─────────────────
    const expResultsForText = results
      .filter(r => r.testId === 'neglect_gf')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    for (const res of expResultsForText) {
      const r = res.rawValues;
      const activeExp = EXP_FIELDS.filter(f => String(r[f.key] ?? '').trim() !== '');
      const freitext = String(r.exp_freitext ?? '').trim();
      if (activeExp.length === 0 && !freitext) continue;
      const items: { label: string; text: string }[] = activeExp.map(f => ({ label: f.label, text: String(r[f.key]) }));
      if (freitext) items.push({ label: 'Freitext', text: freitext });
      textResults.push({
        domain: '6. Visuelle Exploration',
        testGroup: 'Explorationsaufgaben',
        items,
        date: res.date,
        note: res.note ?? undefined,
      });
    }

    // ── GF/Neglect graphic block (domain 6) ──────────────────────────────────────
    // TAP results sorted oldest→newest (oldest=Eingang, newest=Abschluss)
    const tapResultsForGF = results
      .filter(r => r.testId === 'tap')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // A single GF/Neglect quadrant cell counts as "data" if it holds anything
    // other than empty / comma separators.
    const cellHasData = (v: number | string | undefined) => {
      const s = String(v ?? '');
      return s !== '' && s.replace(/[,]/g, '') !== '';
    };
    // Both the entry ('') and the final ('b_') column are checked — the second
    // eye is often recorded in the Abschluss column, which was previously ignored.
    // Gesichtsfeld hält unabhängige Slots je Auge (LA/RA/BA) — jedes zählt separat.
    const GF_EYES = ['LA', 'RA', 'BA'] as const;
    const GFNEG_BASES = [
      ...GF_EYES.flatMap(eye => [`gf_${eye}_rt_l`, `gf_${eye}_rt_r`, `gf_${eye}_mq`, `gf_${eye}_aq`, `gf_${eye}_ausl`]),
      'neg_rt_l', 'neg_rt_r', 'neg_mq', 'neg_aq', 'neg_ausl',
    ];
    const hasTapGfData = (r: TestResult) =>
      GFNEG_BASES.some(base => cellHasData(r.rawValues[base]) || cellHasData(r.rawValues[`b_${base}`]));

    const tapGfData = tapResultsForGF.filter(hasTapGfData);
    const hasTapGf = tapGfData.length > 0;

    // Readable eye label (Augen-Schalter LA/RA/BA).
    const EYE_LABEL: Record<string, string> = { LA: 'li. Auge', RA: 're. Auge', BA: 'beide Augen' };

    // Build a FieldEntry for one prefix ('' = Eingang, 'b_' = Abschluss) of a gf_<eye>/neg stem.
    const buildField = (rv: Record<string, number | string>, prefix: string, stem: string) => ({
      ml: String(rv[`${prefix}${stem}_rt_l`] ?? ''),
      mr: String(rv[`${prefix}${stem}_rt_r`] ?? ''),
      mq: decodeQuad(rv[`${prefix}${stem}_mq`]),
      aq: decodeQuad(rv[`${prefix}${stem}_aq`]),
    });
    const fieldHasData = (rv: Record<string, number | string>, prefix: string, stem: string) =>
      ['_rt_l', '_rt_r', '_mq', '_aq', '_ausl'].some(suf => cellHasData(rv[`${prefix}${stem}${suf}`]));

    const extraBottomContent: React.ReactNode = hasTapGf ? (
      <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-5">
        <div>
          <div className="pr-neglect-heading text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
            Gesichtsfeld- und Neglectprüfung (TAP)
          </div>
          {tapGfData.map((res, idx) => {
            const rv = res.rawValues;
            const sessionLabel = tapGfData.length === 1 ? '1. Messung' : idx === tapGfData.length - 1 ? 'Neueste Messung' : `${idx + 1}. Messung`;

            // Render one test (GF-je-Auge oder Neglect) mit beiden Zeitpunkten
            // (Eingang/Abschluss), die Daten enthalten — je eine eigene Grafik.
            const renderTest = (stem: string, title: string, eDateKey: string, bDateKey: string, noteKey?: string) => {
              const tps = [
                { prefix: '', tp: 'Eingang', date: rv[eDateKey] },
                { prefix: 'b_', tp: 'Abschluss', date: rv[bDateKey] },
              ].filter(t => fieldHasData(rv, t.prefix, stem));
              if (tps.length === 0) return null;
              const note = noteKey ? String(rv[noteKey] ?? '').trim() : '';
              return (
                <div className="pr-neglect-block" key={stem}>
                  <div className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{title}</div>
                  <div className="flex flex-wrap gap-8">
                    {tps.map(t => (
                      <div key={t.prefix}>
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 mb-1">
                          {t.tp}{t.date ? ` · ${formatDate(String(t.date))}` : ''}
                        </div>
                        <FieldSection value={buildField(rv, t.prefix, stem)} disabled />
                        {cellHasData(rv[`${t.prefix}${stem}_ausl`]) && (
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-1">
                            Auslassungen: <span className="font-semibold text-slate-600 dark:text-slate-300">{String(rv[`${t.prefix}${stem}_ausl`])}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {note && (
                    <p className="text-[9px] italic text-slate-400 dark:text-slate-500 mt-1.5 max-w-md whitespace-pre-wrap">{note}</p>
                  )}
                </div>
              );
            };

            return (
              <div key={res.id} className={`pr-neglect-session ${idx > 0 ? 'border-t border-slate-100 dark:border-slate-800 pt-4' : ''}`}>
                <div className="pr-neglect-heading flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-2 py-0.5 uppercase tracking-widest">
                    {sessionLabel}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {formatDate(res.date)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-10">
                  {GF_EYES.map(eye => renderTest(
                    `gf_${eye}`, `Gesichtsfeldprüfung (${EYE_LABEL[eye]})`,
                    `e_date_gf_${eye}`, `b_date_gf_${eye}`, `note_gf_${eye}`,
                  ))}
                  {renderTest('neg', 'Neglectprüfung', 'e_date_neg', 'b_date_neg', 'note_neg')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : undefined;

    return { profileData, textResults, extraBottomContent };
  }, [patient, results]);
}
