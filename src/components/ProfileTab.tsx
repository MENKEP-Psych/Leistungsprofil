import React from 'react';
import { Patient, TestResult, PRResult } from '../types';
import { PRProfile, TextProfileResult } from './PRProfile';
import { Download, Layers, Eye, StickyNote, Minus, TrendingUp, TrendingDown } from 'lucide-react';
import { exportProfilePDF } from '../lib/exportPDF';
import { formatDate } from '../lib/utils';
import { FieldSection, decodeQuad } from './NeglectShared';
import { TAP_PR_MAP, TAP_SD_PR_MAP, TAP_VE_PR_MAP } from './TAPTab';
import { LPS_SUBTESTS, LPS_KORREKTUR_OPTIONS } from './LPSTab';

// ── Neglect/GF section config ─────────────────────────────────────────────────

const EXP_FIELDS = [
  { key: 'exp_linien',    label: 'Linienhalbieren' },
  { key: 'exp_dreieck',   label: '▲ durchstreichen' },
  { key: 'exp_apples',    label: 'Apples-Test' },
  { key: 'exp_abzeichen', label: 'Abzeichnen' },
  { key: 'exp_uhr',       label: 'Uhr zeichnen' },
] as const;

interface ProfileTabProps {
  patient: Patient;
  results: TestResult[];
  generalNote: string;
}

const DEFAULT_DOMAINS: Record<string, string> = {
  'tmt-A': '1. Aufmerksamkeit (Geschwindigkeit)',
  'tmt-B': '1. Aufmerksamkeit (Geteilt)',
};

interface VLMTMeasure {
  key: string;
  label: string;
  domain: string;
  getDetail: (r: TestResult) => string;
}

// Reihenfolge: Dg1-5, Σ | I | Dg6, Δ5-6 | Dg7, Δ5-7 | W, W_F
const VLMT_MEASURES: VLMTMeasure[] = [
  { key: 'Dg1',      label: 'Supraspanne [1]',                domain: '2. Gedächtnis (Lernen)',         getDetail: r => `Dg1: ${r.rawValues.Dg1}` },
  { key: 'Dg5',      label: 'Lernleistung [5]',               domain: '2. Gedächtnis (Lernen)',         getDetail: r => `Dg5: ${r.rawValues.Dg5}` },
  { key: 'sumDg1_5', label: 'Gesamtlernleistung [Σ1–5]',      domain: '2. Gedächtnis (Lernen)',         getDetail: r => `Σ: ${r.calculatedValues.sumDg1_5}` },
  { key: 'I',        label: 'Interferenzliste [I]',            domain: '2. Gedächtnis (Interferenz)',    getDetail: r => `I: ${r.rawValues.I}` },
  { key: 'Dg6',      label: 'Abruf n. Interferenz [6]',       domain: '2. Gedächtnis (Kurzzeit)',       getDetail: r => `Dg6: ${r.rawValues.Dg6}` },
  { key: 'Dg5_Dg6',  label: 'Verlust n. Interferenz [Δ5–6]',  domain: '2. Gedächtnis (Kurzzeit)',       getDetail: r => `Δ: ${r.calculatedValues.Dg5_Dg6}` },
  { key: 'Dg7',      label: 'Verzögerter Abruf [7]',          domain: '2. Gedächtnis (Langzeit)',       getDetail: r => `Dg7: ${r.rawValues.Dg7}` },
  { key: 'Dg5_Dg7',  label: 'Verlust n. Verzögerung [Δ5–7]',  domain: '2. Gedächtnis (Langzeit)',       getDetail: r => `Δ: ${r.calculatedValues.Dg5_Dg7}` },
  { key: 'W',        label: 'Richtig [WR]',                   domain: '2. Gedächtnis (Wiedererkennen)', getDetail: r => `W: ${r.rawValues.W}` },
  { key: 'W_F',      label: 'Korr. Wiedererkennen [WR–FP]',   domain: '2. Gedächtnis (Wiedererkennen)', getDetail: r => `W_F: ${r.rawValues.W_F ?? '–'}` },
];

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

// Like combineNotes but appends TMT error counts for the given part (A or B).
const combineTmtNotes = (latest: TestResult, previous: TestResult | undefined, part: 'A' | 'B'): string | undefined => {
  const base = combineNotes(latest, previous) ?? '';
  const err = latest.rawValues[`err${part}`];
  const suffix = err != null ? ` – Fehler ${part}: ${err}` : '';
  const result = (base + suffix).trim();
  return result || undefined;
};

export const ProfileTab: React.FC<ProfileTabProps> = ({
  patient,
  results,
  generalNote,
}) => {
  const profileData: PRResult[] = (() => {
    const data: PRResult[] = [];

    const abt  = (r: TestResult)  => r.aborted  ? { aborted:     true as const, abortComment:     r.abortComment  } : {};
    const pabt = (r?: TestResult) => r?.aborted ? { prevAborted: true as const, prevAbortComment: r.abortComment  } : {};

    // ── TMT ──────────────────────────────────────────────────────────────────
    const tmtResults = results
      .filter(r => r.testId === 'tmt')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (tmtResults.length > 0) {
      const latest   = tmtResults[0];
      const previous = tmtResults[1];
      data.push(
        {
          label: 'TMT Teil A (Suchen)',
          currentPr: latest.percentileRanks.A ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.A,
          date: latest.date,
          prevDate: previous?.date,
          domain: latest.domainMapping?.A ?? DEFAULT_DOMAINS['tmt-A'],
          subdomain: '1.1 Informationsverarbeitungsgeschwindigkeit',
          testGroup: 'Trail Making Test',
          details: [`Zeit: ${latest.rawValues.A}s`],
          previousDetails: previous ? [`Zeit: ${previous.rawValues.A}s`] : undefined,
          note: combineTmtNotes(latest, previous, 'A'),
          ...abt(latest),
          ...pabt(previous),
        },
        {
          label: 'TMT Teil B (Wechseln)',
          currentPr: latest.percentileRanks.B ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.B,
          date: latest.date,
          prevDate: previous?.date,
          domain: latest.domainMapping?.B ?? DEFAULT_DOMAINS['tmt-B'],
          subdomain: '1.4 Geteilte Aufmerksamkeit',
          testGroup: 'Trail Making Test',
          details: [`Zeit: ${latest.rawValues.B}s`],
          previousDetails: previous ? [`Zeit: ${previous.rawValues.B}s`] : undefined,
          note: combineTmtNotes(latest, previous, 'B'),
          ...abt(latest),
          ...pabt(previous),
        }
      );
    }

    // ── VLMT ─────────────────────────────────────────────────────────────────
    const vlmtResults = results
      .filter(r => r.testId === 'vlmt')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (vlmtResults.length > 0) {
      const latest   = vlmtResults[0];
      const previous = vlmtResults[1];

      for (const m of VLMT_MEASURES) {
        const currPr = latest.percentileRanks[m.key];
        if ((currPr === undefined || currPr === 'n/a') && !latest.aborted) continue;
        data.push({
          label: m.label,
          currentPr: currPr ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks[m.key] !== 'n/a'
            ? previous?.percentileRanks[m.key]
            : undefined,
          date: latest.date,
          prevDate: previous?.date,
          domain: m.domain,
          subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
          testGroup: 'VLMT',
          details: [m.getDetail(latest)],
          previousDetails: previous ? [m.getDetail(previous)] : undefined,
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
        label: 'TOL (Alterskorrigiert)',
        currentPr: latest.percentileRanks.alterkorrigiert ?? (latest.aborted ? 'n/a' : undefined),
        previousPr: previous?.percentileRanks.alterkorrigiert,
        date: latest.date,
        prevDate: previous?.date,
        domain: '5. Exekutive Funktionen',
        testGroup: 'Turm von London',
        details: [detailStr(latest)],
        previousDetails: previous ? [detailStr(previous)] : undefined,
        note: latest.note,
        ...abt(latest),
        ...pabt(previous),
      });

      if (latest.percentileRanks.alter_bildung !== undefined) {
        data.push({
          label: 'TOL (Alters- & bildungskorrigiert)',
          currentPr: latest.percentileRanks.alter_bildung,
          previousPr: previous?.percentileRanks.alter_bildung,
          date: latest.date,
          prevDate: previous?.date,
          domain: '5. Exekutive Funktionen',
          testGroup: 'Turm von London',
          details: [detailStr(latest)],
          previousDetails: previous ? [detailStr(previous)] : undefined,
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
      vigilanz:           '1.5 Daueraufmerksamkeit / Vigilanz',
      arbeitsgedaechtnis: '2.2 Arbeitsgedächtnis',
      gf_pr:              '6.2 Gesichtsfeld & Neglect',
      neg_pr:             '6.2 Gesichtsfeld & Neglect',
    };

    if (tapResults.length > 0) {
      const latest   = tapResults[0];
      const previous = tapResults[1];
      for (const m of TAP_PR_MAP) {
        const currPr = latest.percentileRanks[m.key];
        if (!currPr || String(currPr).trim() === '') continue;
        const prevPr = previous?.percentileRanks[m.key];

        // Determine version badge: 'M' or '2.3' only for items with a version toggle
        const verField = TAP_VER_FIELD[m.key];
        let tapVersion: 'M' | '2.3' | undefined;
        if (m.key === 'alertnessM') {
          tapVersion = 'M';
        } else if (verField) {
          tapVersion = String(latest.rawValues[verField] ?? '') === 'M' ? 'M' : '2.3';
        }
        // vigilanz, arbeitsgedaechtnis, gf_pr, neg_pr, alertness23* → no version badge

        data.push({
          label: m.label,
          currentPr: currPr,
          previousPr: (prevPr && String(prevPr).trim() !== '') ? prevPr : undefined,
          date: latest.date,
          prevDate: previous?.date,
          domain: m.domain,
          subdomain: TAP_SUBDOMAIN[m.key],
          testGroup: 'TAP',
          tapVersion,
          ...abt(latest),
          ...pabt(previous),
        });
      }
    }

    // ── TAP Visuelle Exploration ──────────────────────────────────────────────
    const TAP_VE_SUBDOMAIN = '6.1 Visuelles Scanning';
    if (tapResults.length > 0) {
      const latest   = tapResults[0];
      const previous = tapResults[1];
      // Determine TAP version for VE (ve_ver field)
      const veIsTapM = String(latest.rawValues.ve_ver ?? '') === 'M';
      for (const m of TAP_VE_PR_MAP) {
        const currPr = latest.percentileRanks[m.key];
        if (!currPr || String(currPr).trim() === '') continue;
        const prevPr = previous?.percentileRanks[m.key];
        const rawVal = latest.rawValues[m.rawKey];
        data.push({
          label: m.label,
          currentPr: currPr,
          previousPr: (prevPr && String(prevPr).trim() !== '') ? prevPr : undefined,
          date: latest.date,
          prevDate: previous?.date,
          domain: m.domain,
          subdomain: TAP_VE_SUBDOMAIN,
          testGroup: 'TAP – Vis. Scanning',
          tapVersion: veIsTapM ? 'M' : '2.3',
          details: rawVal ? [`Wert: ${rawVal}${m.unit ? ' ' + m.unit : ''}`] : undefined,
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
    if (tapResults.length > 0) {
      const latest   = tapResults[0];
      const previous = tapResults[1];
      for (const m of TAP_SD_PR_MAP) {
        const currPr = latest.rawValues[m.key];
        if (!currPr || String(currPr).trim() === '') continue;
        const prevPr = previous?.rawValues[m.key];
        const rawVal = latest.rawValues[m.rawKey];
        data.push({
          label: m.label,
          currentPr: currPr,
          previousPr: (prevPr && String(prevPr).trim() !== '') ? prevPr : undefined,
          date: latest.date,
          prevDate: previous?.date,
          domain: m.domain,
          subdomain: TAP_SD_SUBDOMAIN[m.key],
          testGroup: 'TAP – Standardabweichungen',
          details: rawVal ? [`SD: ${rawVal} ${m.unit}`] : undefined,
          ...abt(latest),
          ...pabt(previous),
        });
      }
    }

    // ── WMS-IV Visuelle Wiedergabe ────────────────────────────────────────────
    const wmsResults = results
      .filter(r => r.testId === 'wms_vw')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (wmsResults.length > 0) {
      const latest   = wmsResults[0];
      const previous = wmsResults[1];

      if (latest.percentileRanks.sofortiger_abruf !== undefined || latest.aborted) {
        data.push({
          label: 'Sofortiger Abruf',
          currentPr: latest.percentileRanks.sofortiger_abruf ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.sofortiger_abruf,
          date: latest.date,
          prevDate: previous?.date,
          domain: '2. Gedächtnis (Visuell)',
          subdomain: '2.4 Figurales Gedächtnis',
          testGroup: 'WMS-IV Visuelle Wiedergabe',
          details: [`RW: ${latest.rawValues.sofortig}, WP: ${latest.calculatedValues.sofortig_wp ?? '–'}`],
          previousDetails: previous?.rawValues.sofortig !== undefined
            ? [`RW: ${previous.rawValues.sofortig}, WP: ${previous.calculatedValues.sofortig_wp ?? '–'}`]
            : undefined,
          note: combineNotes(latest, previous),
          ...abt(latest),
          ...pabt(previous),
        });
      }

      if (latest.percentileRanks.verzoegerter_abruf !== undefined || latest.aborted) {
        data.push({
          label: 'Verzögerter Abruf',
          currentPr: latest.percentileRanks.verzoegerter_abruf ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.verzoegerter_abruf,
          date: latest.date,
          prevDate: previous?.date,
          domain: '2. Gedächtnis (Visuell)',
          subdomain: '2.4 Figurales Gedächtnis',
          testGroup: 'WMS-IV Visuelle Wiedergabe',
          details: [`RW: ${latest.rawValues.verzoegert}, WP: ${latest.calculatedValues.verzoegert_wp ?? '–'}`],
          previousDetails: previous?.rawValues.verzoegert !== undefined
            ? [`RW: ${previous.rawValues.verzoegert}, WP: ${previous.calculatedValues.verzoegert_wp ?? '–'}`]
            : undefined,
          ...abt(latest),
          ...pabt(previous),
        });
      }

      if (latest.percentileRanks.wiedererkennen !== undefined || latest.aborted) {
        data.push({
          label: 'Wiedererkennen',
          currentPr: latest.percentileRanks.wiedererkennen ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.wiedererkennen,
          date: latest.date,
          prevDate: previous?.date,
          domain: '2. Gedächtnis (Visuell)',
          subdomain: '2.4 Figurales Gedächtnis',
          testGroup: 'WMS-IV Visuelle Wiedergabe',
          details: [`RW: ${latest.rawValues.wiedererkennen}`],
          previousDetails: previous?.rawValues.wiedererkennen !== undefined
            ? [`RW: ${previous.rawValues.wiedererkennen}`]
            : undefined,
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
        { key: 'cft', label: 'CFT – Kopieren',  rawKey: 'cft' },
        { key: 'cfm', label: 'CFM – Direkt',     rawKey: 'cfm' },
        { key: 'cqm', label: 'CQM – Verzögert',  rawKey: 'cqm' },
      ] as const;
      for (const s of ROCFT_SCALES) {
        const currPr = latest.percentileRanks[s.key];
        if ((currPr === undefined || currPr === 'n/a') && !latest.aborted) continue;
        data.push({
          label: s.label,
          currentPr: currPr ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks[s.key] !== 'n/a' ? previous?.percentileRanks[s.key] : undefined,
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

    if (zztResults.length > 0) {
      const latest   = zztResults[0];
      const previous = zztResults[1];
      if (latest.percentileRanks.zzt !== undefined || latest.aborted) {
        data.push({
          label: 'ZZT (Median)',
          currentPr: latest.percentileRanks.zzt ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.zzt,
          date: latest.date,
          prevDate: previous?.date,
          domain: '1. Aufmerksamkeit',
          subdomain: '1.1 Informationsverarbeitungsgeschwindigkeit',
          testGroup: 'Zahlen-Zeichen-Test',
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

      if (latest.percentileRanks.vorwaerts !== undefined || latest.aborted) {
        data.push({
          label: 'Zahlenspanne vorwärts',
          currentPr: latest.percentileRanks.vorwaerts ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.vorwaerts,
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

      if (latest.percentileRanks.rueckwaerts !== undefined || latest.aborted) {
        data.push({
          label: 'Zahlenspanne rückwärts',
          currentPr: latest.percentileRanks.rueckwaerts ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.rueckwaerts,
          date: latest.date,
          prevDate: previous?.date,
          domain: '2. Gedächtnis (Arbeitsgedächtnis)',
          subdomain: '2.2 Arbeitsgedächtnis',
          testGroup: 'Zahlenspanne',
          details: [`RW: ${latest.rawValues.rueckwaerts ?? '–'}`],
          previousDetails: previous ? [`RW: ${previous.rawValues.rueckwaerts ?? '–'}`] : undefined,
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

      if (latest.percentileRanks.vorwaerts !== undefined || latest.aborted) {
        data.push({
          label: 'Blockspanne vorwärts',
          currentPr: latest.percentileRanks.vorwaerts ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.vorwaerts,
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

      if (latest.percentileRanks.rueckwaerts !== undefined || latest.aborted) {
        data.push({
          label: 'Blockspanne rückwärts',
          currentPr: latest.percentileRanks.rueckwaerts ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.rueckwaerts,
          date: latest.date,
          prevDate: previous?.date,
          domain: '2. Gedächtnis (Arbeitsgedächtnis)',
          subdomain: '2.2 Arbeitsgedächtnis',
          testGroup: 'Blockspanne',
          details: [`RW: ${latest.rawValues.rueckwaerts ?? '–'}`],
          previousDetails: previous ? [`RW: ${previous.rawValues.rueckwaerts ?? '–'}`] : undefined,
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

      if (latest.percentileRanks.lgI !== undefined || latest.aborted) {
        data.push({
          label: 'Log. Gedächtnis I (Sofort)',
          currentPr: latest.percentileRanks.lgI ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.lgI,
          date: latest.date,
          prevDate: previous?.date,
          domain: '2. Gedächtnis (Lernen)',
          subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
          testGroup: 'Logisches Gedächtnis',
          details: [`RW: ${latest.rawValues.lgI ?? '–'}`],
          previousDetails: previous ? [`RW: ${previous.rawValues.lgI ?? '–'}`] : undefined,
          note: combineNotes(latest, previous),
          ...abt(latest),
          ...pabt(previous),
        });
      }

      if (latest.percentileRanks.lgII !== undefined || latest.aborted) {
        data.push({
          label: 'Log. Gedächtnis II (Verzögert)',
          currentPr: latest.percentileRanks.lgII ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.lgII,
          date: latest.date,
          prevDate: previous?.date,
          domain: '2. Gedächtnis (Langzeit)',
          subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
          testGroup: 'Logisches Gedächtnis',
          details: [`RW: ${latest.rawValues.lgII ?? '–'}`],
          previousDetails: previous ? [`RW: ${previous.rawValues.lgII ?? '–'}`] : undefined,
          ...abt(latest),
          ...pabt(previous),
        });
      }

      if (latest.percentileRanks.wiedererk !== undefined || latest.aborted) {
        data.push({
          label: 'Log. Gedächtnis Wiedererkennen',
          currentPr: latest.percentileRanks.wiedererk ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.wiedererk,
          date: latest.date,
          prevDate: previous?.date,
          domain: '2. Gedächtnis (Wiedererkennen)',
          subdomain: '2.3 Verbale Lern- und Merkfähigkeit',
          testGroup: 'Logisches Gedächtnis',
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
      if (latest.percentileRanks.mosaik !== undefined || latest.aborted) {
        data.push({
          label: 'Mosaik-Test',
          currentPr: latest.percentileRanks.mosaik ?? (latest.aborted ? 'n/a' : undefined),
          previousPr: previous?.percentileRanks.mosaik,
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
      for (const s of LPS_SUBTESTS) {
        // All sessions that recorded a PR value for this subtest, newest first
        const withData = lpsResults.filter(r => r.percentileRanks[s.id] !== undefined);
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
          currentPr: latest.percentileRanks[s.id],
          previousPr: previous?.percentileRanks[s.id],
          date: latest.date,
          prevDate: previous?.date,
          domain: '4. Intellektuelle Leistungen',
          testGroup: 'LPS',
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
          if (currPr === 'n/a') return; // skip rows with no PR in the chart

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

    return data;
  })();

  const getTrend = (curr: number | string, prev?: number | string) => {
    if (prev === undefined) return <Minus size={14} className="text-slate-300" />;
    const c = typeof curr === 'number' ? curr : parseFloat(curr.toString().replace(/[<>]/g, '').trim());
    const p = typeof prev === 'number' ? prev : parseFloat(prev.toString().replace(/[<>]/g, '').trim());
    if (isNaN(c) || isNaN(p)) return <Minus size={14} className="text-slate-300" />;
    if (c > p) return <TrendingUp size={14} className="text-emerald-500" />;
    if (c < p) return <TrendingDown size={14} className="text-rose-500" />;
    return <Minus size={14} className="text-slate-300" />;
  };

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

  const handleExportPDF = async () => {
    await exportProfilePDF(patient, profileData, results, generalNote);
  };

  // ── Summary data ────────────────────────────────────────────────────────────
  const expResults = results
    .filter(r => r.testId === 'neglect_gf')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // TAP results sorted oldest→newest (oldest=Eingang, newest=Abschluss)
  const tapResultsForGF = results
    .filter(r => r.testId === 'tap')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Check if a TAP result has any GF or Neglect data
  const hasTapGfData = (r: TestResult) =>
    [r.rawValues.gf_rt_l, r.rawValues.gf_rt_r, r.rawValues.gf_mq, r.rawValues.gf_aq,
     r.rawValues.neg_rt_l, r.rawValues.neg_rt_r, r.rawValues.neg_mq, r.rawValues.neg_aq]
      .some(v => {
        const s = String(v ?? '');
        return s !== '' && s.replace(/[,]/g, '') !== '';
      });

  const tapGfData = tapResultsForGF.filter(hasTapGfData);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-200">
            <Layers size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">Leistungsprofil</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
              Domänen-basierte Auswertung
              {results.length > 0 &&
                ` · ${results.length} Messung${results.length !== 1 ? 'en' : ''}`}
            </p>
          </div>
        </div>
        <div className="no-print flex gap-3">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 rounded-2xl text-sm font-black text-white hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95"
          >
            <Download size={16} /> PDF Export
          </button>
        </div>
      </div>

      {/* ── Allgemeine Notiz (wenn vorhanden) ── */}
      {generalNote && generalNote.trim() && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-5 py-3">
          <StickyNote size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-0.5">
              Allgemeine Notiz
            </div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 leading-relaxed">{generalNote}</p>
          </div>
        </div>
      )}

      {profileData.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-16 text-center">
          <Layers size={48} strokeWidth={1} className="mx-auto mb-4 text-slate-200" />
          <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300">Noch keine Testdaten</h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Geben Sie Testergebnisse ein, um das Leistungsprofil zu sehen.
          </p>
        </div>
      ) : (
        <PRProfile results={profileData} textResults={textResults} />
      )}

      {/* ── TAP GF / NEGLECT SUMMARY ── */}
      {tapGfData.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950 rounded-2xl flex items-center justify-center">
              <Eye size={18} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                Gesichtsfeld / Neglect (TAP)
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {tapGfData.length === 1 ? '1 Messung' : `${tapGfData.length} Messungen`}
              </p>
            </div>
          </div>

          {tapGfData.map((res, idx) => {
            const r = res.rawValues;
            const gfEntry = { ml: String(r.gf_rt_l ?? ''), mr: String(r.gf_rt_r ?? ''), mq: decodeQuad(r.gf_mq), aq: decodeQuad(r.gf_aq) };
            const negEntry = { ml: String(r.neg_rt_l ?? ''), mr: String(r.neg_rt_r ?? ''), mq: decodeQuad(r.neg_mq), aq: decodeQuad(r.neg_aq) };
            const hasGF  = [r.gf_rt_l,  r.gf_rt_r,  r.gf_mq,  r.gf_aq ].some(v => String(v ?? '').replace(/[,]/g, '') !== '');
            const hasNeg = [r.neg_rt_l, r.neg_rt_r, r.neg_mq, r.neg_aq].some(v => String(v ?? '').replace(/[,]/g, '') !== '');
            const sessionLabel = tapGfData.length === 1 ? '1. Messung' : idx === tapGfData.length - 1 ? 'Neueste Messung' : `${idx + 1}. Messung`;

            return (
              <div key={res.id} className={idx > 0 ? 'border-t border-slate-100 dark:border-slate-700 pt-6' : ''}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 rounded-lg px-2 py-0.5 uppercase tracking-widest">
                    {sessionLabel}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {formatDate(res.date)}{res.examiner && ` · ${res.examiner}`}
                  </span>
                  {r.gf_eye && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2 py-0.5">
                      {r.gf_eye}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-10">
                  {hasGF && (
                    <div>
                      <div className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                        Gesichtsfeldprüfung
                      </div>
                      <FieldSection value={gfEntry} disabled />
                    </div>
                  )}
                  {hasNeg && (
                    <div>
                      <div className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                        Neglectprüfung
                      </div>
                      <FieldSection value={negEntry} disabled />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── EXPLORATIONSAUFGABEN SUMMARY ── */}
      {expResults.length > 0 && expResults.some(r => EXP_FIELDS.some(f => String(r.rawValues[f.key] ?? '').trim() !== '')) && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950 rounded-2xl flex items-center justify-center">
              <Eye size={18} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                Explorationsaufgaben
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {expResults.length} Messung{expResults.length !== 1 ? 'en' : ''}
              </p>
            </div>
          </div>

          {expResults.map((res, idx) => {
            const r = res.rawValues;
            const activeExp = EXP_FIELDS.filter(f => String(r[f.key] ?? '').trim() !== '');
            if (activeExp.length === 0) return null;

            return (
              <div key={res.id} className={idx > 0 ? 'border-t border-slate-100 dark:border-slate-700 pt-6' : ''}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 rounded-lg px-2 py-0.5 uppercase tracking-widest">
                    {idx === 0 ? 'Aktuell' : `Messung ${expResults.length - idx}`}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {formatDate(res.date)}{res.examiner && ` · ${res.examiner}`}
                  </span>
                </div>
                <div className="space-y-1">
                  {activeExp.map(f => (
                    <div key={f.key} className="flex items-baseline gap-2">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap min-w-[130px]">
                        {f.label}
                      </span>
                      <span className="text-[11px] text-slate-700 dark:text-slate-300 italic">
                        {String(r[f.key] ?? '')}
                      </span>
                    </div>
                  ))}
                </div>
                {res.note && (
                  <div className="text-[11px] italic text-slate-400 dark:text-slate-500 mt-2">{res.note}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
