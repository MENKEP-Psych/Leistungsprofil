import React, { useState, useEffect } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import {
  Bell, BellOff, Save, CheckCircle2,
  History, Trash2, Check, Zap, StickyNote, X, RotateCcw, ClipboardList, OctagonX,
} from 'lucide-react';
import { addTapNormEntries, buildNormEntriesFromSF } from '../lib/tapNormDb';
import { Patient, TestResult } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { addNotification } from '../lib/notifications';
import { QuadValues, QuadGrid, decodeQuad, encodeQuad } from './NeglectShared';
import { AbortBadge, HistoryDate } from './TestForm';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SF {
  gn_ver: '2.3' | 'M'; fl_ver: '2.3' | 'M'; ga_ver: '2.3' | 'M'; ve_ver: '2.3' | 'M';

  flag_alM: boolean; flag_al23: boolean; flag_gn: boolean; flag_gn2: boolean;
  flag_fl: boolean; flag_ga: boolean; flag_vig: boolean; flag_ag: boolean;
  flag_ve: boolean; flag_gf: boolean; flag_neg: boolean;

  note_alM: string; note_al23: string; note_gn: string; note_gn2: string;
  note_fl: string; note_ga: string; note_vig: string; note_ag: string;
  note_ve: string; note_neg: string;
  // Gesichtsfeld-Anmerkung je Auge (li/re/beide werden unabhängig erfasst).
  note_gf_LA: string; note_gf_RA: string; note_gf_BA: string;

  // Per-test dates: e_ = Eingangstestung, b_ = Abschlusstestung
  e_date_alM: string; b_date_alM: string;
  e_date_al23: string; b_date_al23: string;
  e_date_gn: string; b_date_gn: string;
  e_date_gn2: string; b_date_gn2: string;
  e_date_fl: string; b_date_fl: string;
  e_date_ga: string; b_date_ga: string;
  e_date_vig: string; b_date_vig: string;
  e_date_ag: string; b_date_ag: string;
  e_date_ve: string; b_date_ve: string;
  // Gesichtsfeld-Daten je Auge (li/re/beide sind unabhängige Messslots, s.u.).
  e_date_gf_LA: string; b_date_gf_LA: string;
  e_date_gf_RA: string; b_date_gf_RA: string;
  e_date_gf_BA: string; b_date_gf_BA: string;
  e_date_neg: string; b_date_neg: string;

  // Eingang values (field names kept for backwards compatibility)
  alM_rt: string; alM_sd: string; alM_pr: string; alM_sd_pr: string;
  al23_ohne_rt: string; al23_ohne_sd: string; al23_ohne_pr: string; al23_ohne_sd_pr: string;
  al23_mit_rt: string; al23_mit_sd: string; al23_mit_pr: string; al23_mit_sd_pr: string;
  al23_phasisch: string; al23_pr: string;
  gn_rt: string; gn_sd: string; gn_fehler: string; gn_ausl: string;
  gn_pr: string; gn_sd_pr: string; gn_fehler_pr: string; gn_ausl_pr: string;
  gn2_rt: string; gn2_sd: string; gn2_fehler: string; gn2_ausl: string;
  gn2_pr: string; gn2_sd_pr: string; gn2_fehler_pr: string; gn2_ausl_pr: string;
  fl_rt: string; fl_sd: string; fl_fehler: string;
  fl_pr: string; fl_sd_pr: string; fl_fehler_pr: string;
  ga_rt: string; ga_sd: string; gv_rt: string; gv_sd: string;
  g_fehler: string; g_ausl_ges: string;
  ga_pr: string; gv_pr: string; ga_sd_pr: string; gv_sd_pr: string;
  g_fehler_pr: string; g_ausl_ges_pr: string;
  vig_rt: string; vig_sd: string; vig_fehler: string; vig_ausl: string;
  vig_pr: string; vig_sd_pr: string; vig_fehler_pr: string; vig_ausl_pr: string;
  ag_rt: string; ag_sd: string; ag_fehler: string; ag_ausl: string;
  ag_pr: string; ag_sd_pr: string; ag_fehler_pr: string; ag_ausl_pr: string;
  ve_rt_krit: string; ve_sd_krit: string; ve_pr_krit: string; ve_sd_pr_krit: string;
  ve_rt_nkrit: string; ve_sd_nkrit: string; ve_pr_nkrit: string; ve_sd_pr_nkrit: string;
  ve_fehler: string; ve_pr_fehler: string;
  ve_ausl_krit: string; ve_pr_ausl: string;
  ve_zeilen_r: string; ve_pr_zeilen: string;
  ve_spalten_r: string; ve_pr_spalten: string;
  // Gesichtsfeld — unabhängige Slots je Auge (behebt Überschreiben beim Augenwechsel).
  gf_LA_rt_l: string; gf_LA_rt_r: string; gf_LA_mq: string; gf_LA_aq: string; gf_LA_ausl: string; gf_LA_pr: string;
  gf_RA_rt_l: string; gf_RA_rt_r: string; gf_RA_mq: string; gf_RA_aq: string; gf_RA_ausl: string; gf_RA_pr: string;
  gf_BA_rt_l: string; gf_BA_rt_r: string; gf_BA_mq: string; gf_BA_aq: string; gf_BA_ausl: string; gf_BA_pr: string;
  neg_rt_l: string; neg_rt_r: string; neg_mq: string; neg_aq: string; neg_ausl: string; neg_pr: string;

  // Abschluss values (b_ prefix)
  b_alM_rt: string; b_alM_sd: string; b_alM_pr: string; b_alM_sd_pr: string;
  b_al23_ohne_rt: string; b_al23_ohne_sd: string; b_al23_ohne_pr: string; b_al23_ohne_sd_pr: string;
  b_al23_mit_rt: string; b_al23_mit_sd: string; b_al23_mit_pr: string; b_al23_mit_sd_pr: string;
  b_al23_phasisch: string; b_al23_pr: string;
  b_gn_rt: string; b_gn_sd: string; b_gn_fehler: string; b_gn_ausl: string;
  b_gn_pr: string; b_gn_sd_pr: string; b_gn_fehler_pr: string; b_gn_ausl_pr: string;
  b_gn2_rt: string; b_gn2_sd: string; b_gn2_fehler: string; b_gn2_ausl: string;
  b_gn2_pr: string; b_gn2_sd_pr: string; b_gn2_fehler_pr: string; b_gn2_ausl_pr: string;
  b_fl_rt: string; b_fl_sd: string; b_fl_fehler: string;
  b_fl_pr: string; b_fl_sd_pr: string; b_fl_fehler_pr: string;
  b_ga_rt: string; b_ga_sd: string; b_gv_rt: string; b_gv_sd: string;
  b_g_fehler: string; b_g_ausl_ges: string;
  b_ga_pr: string; b_gv_pr: string; b_ga_sd_pr: string; b_gv_sd_pr: string;
  b_g_fehler_pr: string; b_g_ausl_ges_pr: string;
  b_vig_rt: string; b_vig_sd: string; b_vig_fehler: string; b_vig_ausl: string;
  b_vig_pr: string; b_vig_sd_pr: string; b_vig_fehler_pr: string; b_vig_ausl_pr: string;
  b_ag_rt: string; b_ag_sd: string; b_ag_fehler: string; b_ag_ausl: string;
  b_ag_pr: string; b_ag_sd_pr: string; b_ag_fehler_pr: string; b_ag_ausl_pr: string;
  b_ve_rt_krit: string; b_ve_sd_krit: string; b_ve_pr_krit: string; b_ve_sd_pr_krit: string;
  b_ve_rt_nkrit: string; b_ve_sd_nkrit: string; b_ve_pr_nkrit: string; b_ve_sd_pr_nkrit: string;
  b_ve_fehler: string; b_ve_pr_fehler: string;
  b_ve_ausl_krit: string; b_ve_pr_ausl: string;
  b_ve_zeilen_r: string; b_ve_pr_zeilen: string;
  b_ve_spalten_r: string; b_ve_pr_spalten: string;
  b_gf_LA_rt_l: string; b_gf_LA_rt_r: string; b_gf_LA_mq: string; b_gf_LA_aq: string; b_gf_LA_ausl: string; b_gf_LA_pr: string;
  b_gf_RA_rt_l: string; b_gf_RA_rt_r: string; b_gf_RA_mq: string; b_gf_RA_aq: string; b_gf_RA_ausl: string; b_gf_RA_pr: string;
  b_gf_BA_rt_l: string; b_gf_BA_rt_r: string; b_gf_BA_mq: string; b_gf_BA_aq: string; b_gf_BA_ausl: string; b_gf_BA_pr: string;
  b_neg_rt_l: string; b_neg_rt_r: string; b_neg_mq: string; b_neg_aq: string; b_neg_ausl: string; b_neg_pr: string;
}

type DiagnostikSchwerpunkt = 'wiedereingliederung' | 'neglect' | 'anderer';

interface ColData {
  id: string | null;
  date: string;
  examiner: string;
  schwerpunkt: DiagnostikSchwerpunkt;
  schwerpunktAnderer: string;
  aborted: boolean;
  abortComment: string;
  f: SF;
}

// ── PR Map exports (used by ProfileTab + exportPDF) ───────────────────────────

export const TAP_PR_MAP = [
  { key: 'alertnessM',         label: 'Alertness [M] – RT',              domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'alertness23_ohne',   label: 'Alertness [2.3] ohne – RT',       domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'alertness23_mit',    label: 'Alertness [2.3] mit – RT',        domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'alertness23',        label: 'Alertness [2.3] – phasisch',      domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'gonogo',             label: 'Go/Nogo 1',                        domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'gonogo2',            label: 'Go/Nogo 2',                        domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'flexibilitaet',      label: 'Flexibilität',                     domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'geteilte',           label: 'Get. Aufmerksamkeit (aud.)',       domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'geteilteVisuell',    label: 'Get. Aufmerksamkeit (vis.)',       domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'vigilanz',           label: 'Vigilanz',                         domain: '1. Aufmerksamkeit (Vigilanz)' },
  { key: 'arbeitsgedaechtnis', label: 'Arbeitsgedächtnis (TAP)',          domain: '2. Gedächtnis (Arbeitsgedächtnis)' },
  { key: 'neg_pr',             label: 'Neglect (TAP)',                    domain: '6. Exploration' },
] as const;

export const TAP_FEHLER_AUSL_PR_MAP = [
  { key: 'gn_fehler_pr',      label: 'Go/Nogo 1 – Fehler',              rawKey: 'gn_fehler',      unit: '', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'gn_ausl_pr',        label: 'Go/Nogo 1 – Auslassungen',        rawKey: 'gn_ausl',        unit: '', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'gn2_fehler_pr',     label: 'Go/Nogo 2 – Fehler',              rawKey: 'gn2_fehler',     unit: '', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'gn2_ausl_pr',       label: 'Go/Nogo 2 – Auslassungen',        rawKey: 'gn2_ausl',       unit: '', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'fl_fehler_pr',      label: 'Flexibilität – Fehler',            rawKey: 'fl_fehler',      unit: '', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'g_fehler_pr',       label: 'Get. Aufmerksamkeit – Fehler',     rawKey: 'g_fehler',       unit: '', domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'g_ausl_ges_pr',     label: 'Get. Aufmerksamkeit – Auslassungen', rawKey: 'g_ausl_ges',   unit: '', domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'vig_fehler_pr',     label: 'Vigilanz – Fehler',                rawKey: 'vig_fehler',     unit: '', domain: '1. Aufmerksamkeit (Vigilanz)' },
  { key: 'vig_ausl_pr',       label: 'Vigilanz – Auslassungen',          rawKey: 'vig_ausl',       unit: '', domain: '1. Aufmerksamkeit (Vigilanz)' },
  { key: 'ag_fehler_pr',      label: 'Arbeitsgedächtnis – Fehler',       rawKey: 'ag_fehler',      unit: '', domain: '2. Gedächtnis (Arbeitsgedächtnis)' },
  { key: 'ag_ausl_pr',        label: 'Arbeitsgedächtnis – Auslassungen', rawKey: 'ag_ausl',        unit: '', domain: '2. Gedächtnis (Arbeitsgedächtnis)' },
] as const;

export const TAP_SD_PR_MAP = [
  { key: 'alM_sd_pr',       rawKey: 'alM_sd',       label: 'Alertness [M] – SD',              unit: 'ms', domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'al23_ohne_sd_pr', rawKey: 'al23_ohne_sd', label: 'Alertness 2.3 ohne – SD',         unit: 'ms', domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'al23_mit_sd_pr',  rawKey: 'al23_mit_sd',  label: 'Alertness 2.3 mit – SD',          unit: 'ms', domain: '1. Aufmerksamkeit (Alertness)' },
  { key: 'gn_sd_pr',        rawKey: 'gn_sd',        label: 'Go/Nogo 1 – SD',                  unit: 'ms', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'gn2_sd_pr',       rawKey: 'gn2_sd',       label: 'Go/Nogo 2 – SD',                  unit: 'ms', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'fl_sd_pr',        rawKey: 'fl_sd',        label: 'Flexibilität – SD',                unit: 'ms', domain: '1. Aufmerksamkeit (Selektiv)' },
  { key: 'ga_sd_pr',        rawKey: 'ga_sd',        label: 'Get. Aufmerksamkeit aud. – SD',    unit: 'ms', domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'gv_sd_pr',        rawKey: 'gv_sd',        label: 'Get. Aufmerksamkeit vis. – SD',    unit: 'ms', domain: '1. Aufmerksamkeit (Geteilt)' },
  { key: 'vig_sd_pr',       rawKey: 'vig_sd',       label: 'Vigilanz – SD',                   unit: 'ms', domain: '1. Aufmerksamkeit (Vigilanz)' },
  { key: 'ag_sd_pr',        rawKey: 'ag_sd',        label: 'Arbeitsgedächtnis – SD',           unit: 'ms', domain: '2. Gedächtnis (Arbeitsgedächtnis)' },
] as const;

export const TAP_VE_PR_MAP = [
  { key: 've_rt_krit_pr',   label: 'Vis. Scanning – RT (krit.)',    rawKey: 've_rt_krit',   unit: 'ms', domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_sd_krit_pr',   label: 'Vis. Scanning – SD (krit.)',    rawKey: 've_sd_krit',   unit: 'ms', domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_rt_nkrit_pr',  label: 'Vis. Scanning – RT (n-krit.)', rawKey: 've_rt_nkrit',  unit: 'ms', domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_sd_nkrit_pr',  label: 'Vis. Scanning – SD (n-krit.)', rawKey: 've_sd_nkrit',  unit: 'ms', domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_fehler_pr',    label: 'Vis. Scanning – Fehlreak.',     rawKey: 've_fehler',    unit: '',   domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_ausl_krit_pr', label: 'Vis. Scanning – Auslassungen',  rawKey: 've_ausl_krit', unit: '',   domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_zeilen_r_pr',  label: 'Vis. Scanning – Zeilen r',      rawKey: 've_zeilen_r',  unit: '',   domain: '1. Aufmerksamkeit (Visuell)' },
  { key: 've_spalten_r_pr', label: 'Vis. Scanning – Spalten r',     rawKey: 've_spalten_r', unit: '',   domain: '1. Aufmerksamkeit (Visuell)' },
] as const;

// ── Empty state ────────────────────────────────────────────────────────────────

const emptyF = (): SF => {
  const today = new Date().toISOString().split('T')[0];
  return {
    gn_ver: '2.3', fl_ver: '2.3', ga_ver: '2.3', ve_ver: '2.3',
    flag_alM: false, flag_al23: false, flag_gn: false, flag_gn2: false,
    flag_fl: false, flag_ga: false, flag_vig: false, flag_ag: false,
    flag_ve: false, flag_gf: false, flag_neg: false,
    note_alM: '', note_al23: '', note_gn: '', note_gn2: '',
    note_fl: '', note_ga: '', note_vig: '', note_ag: '',
    note_ve: '', note_neg: '',
    note_gf_LA: '', note_gf_RA: '', note_gf_BA: '',
    e_date_alM: today, b_date_alM: today, e_date_al23: today, b_date_al23: today,
    e_date_gn: today, b_date_gn: today, e_date_gn2: today, b_date_gn2: today,
    e_date_fl: today, b_date_fl: today, e_date_ga: today, b_date_ga: today,
    e_date_vig: today, b_date_vig: today, e_date_ag: today, b_date_ag: today,
    e_date_ve: today, b_date_ve: today,
    e_date_gf_LA: today, b_date_gf_LA: today,
    e_date_gf_RA: today, b_date_gf_RA: today,
    e_date_gf_BA: today, b_date_gf_BA: today,
    e_date_neg: today, b_date_neg: today,
    alM_rt: '', alM_sd: '', alM_pr: '', alM_sd_pr: '',
    al23_ohne_rt: '', al23_ohne_sd: '', al23_ohne_pr: '', al23_ohne_sd_pr: '',
    al23_mit_rt: '', al23_mit_sd: '', al23_mit_pr: '', al23_mit_sd_pr: '',
    al23_phasisch: '', al23_pr: '',
    gn_rt: '', gn_sd: '', gn_fehler: '', gn_ausl: '', gn_pr: '', gn_sd_pr: '', gn_fehler_pr: '', gn_ausl_pr: '',
    gn2_rt: '', gn2_sd: '', gn2_fehler: '', gn2_ausl: '', gn2_pr: '', gn2_sd_pr: '', gn2_fehler_pr: '', gn2_ausl_pr: '',
    fl_rt: '', fl_sd: '', fl_fehler: '', fl_pr: '', fl_sd_pr: '', fl_fehler_pr: '',
    ga_rt: '', ga_sd: '', gv_rt: '', gv_sd: '',
    g_fehler: '', g_ausl_ges: '', ga_pr: '', gv_pr: '',
    ga_sd_pr: '', gv_sd_pr: '', g_fehler_pr: '', g_ausl_ges_pr: '',
    vig_rt: '', vig_sd: '', vig_fehler: '', vig_ausl: '', vig_pr: '', vig_sd_pr: '', vig_fehler_pr: '', vig_ausl_pr: '',
    ag_rt: '', ag_sd: '', ag_fehler: '', ag_ausl: '', ag_pr: '', ag_sd_pr: '', ag_fehler_pr: '', ag_ausl_pr: '',
    ve_rt_krit: '', ve_sd_krit: '', ve_pr_krit: '', ve_sd_pr_krit: '',
    ve_rt_nkrit: '', ve_sd_nkrit: '', ve_pr_nkrit: '', ve_sd_pr_nkrit: '',
    ve_fehler: '', ve_pr_fehler: '', ve_ausl_krit: '', ve_pr_ausl: '',
    ve_zeilen_r: '', ve_pr_zeilen: '', ve_spalten_r: '', ve_pr_spalten: '',
    gf_LA_rt_l: '', gf_LA_rt_r: '', gf_LA_mq: '', gf_LA_aq: '', gf_LA_ausl: '', gf_LA_pr: '',
    gf_RA_rt_l: '', gf_RA_rt_r: '', gf_RA_mq: '', gf_RA_aq: '', gf_RA_ausl: '', gf_RA_pr: '',
    gf_BA_rt_l: '', gf_BA_rt_r: '', gf_BA_mq: '', gf_BA_aq: '', gf_BA_ausl: '', gf_BA_pr: '',
    neg_rt_l: '', neg_rt_r: '', neg_mq: '', neg_aq: '', neg_ausl: '', neg_pr: '',
    b_alM_rt: '', b_alM_sd: '', b_alM_pr: '', b_alM_sd_pr: '',
    b_al23_ohne_rt: '', b_al23_ohne_sd: '', b_al23_ohne_pr: '', b_al23_ohne_sd_pr: '',
    b_al23_mit_rt: '', b_al23_mit_sd: '', b_al23_mit_pr: '', b_al23_mit_sd_pr: '',
    b_al23_phasisch: '', b_al23_pr: '',
    b_gn_rt: '', b_gn_sd: '', b_gn_fehler: '', b_gn_ausl: '', b_gn_pr: '', b_gn_sd_pr: '', b_gn_fehler_pr: '', b_gn_ausl_pr: '',
    b_gn2_rt: '', b_gn2_sd: '', b_gn2_fehler: '', b_gn2_ausl: '', b_gn2_pr: '', b_gn2_sd_pr: '', b_gn2_fehler_pr: '', b_gn2_ausl_pr: '',
    b_fl_rt: '', b_fl_sd: '', b_fl_fehler: '', b_fl_pr: '', b_fl_sd_pr: '', b_fl_fehler_pr: '',
    b_ga_rt: '', b_ga_sd: '', b_gv_rt: '', b_gv_sd: '',
    b_g_fehler: '', b_g_ausl_ges: '', b_ga_pr: '', b_gv_pr: '',
    b_ga_sd_pr: '', b_gv_sd_pr: '', b_g_fehler_pr: '', b_g_ausl_ges_pr: '',
    b_vig_rt: '', b_vig_sd: '', b_vig_fehler: '', b_vig_ausl: '', b_vig_pr: '', b_vig_sd_pr: '', b_vig_fehler_pr: '', b_vig_ausl_pr: '',
    b_ag_rt: '', b_ag_sd: '', b_ag_fehler: '', b_ag_ausl: '', b_ag_pr: '', b_ag_sd_pr: '', b_ag_fehler_pr: '', b_ag_ausl_pr: '',
    b_ve_rt_krit: '', b_ve_sd_krit: '', b_ve_pr_krit: '', b_ve_sd_pr_krit: '',
    b_ve_rt_nkrit: '', b_ve_sd_nkrit: '', b_ve_pr_nkrit: '', b_ve_sd_pr_nkrit: '',
    b_ve_fehler: '', b_ve_pr_fehler: '', b_ve_ausl_krit: '', b_ve_pr_ausl: '',
    b_ve_zeilen_r: '', b_ve_pr_zeilen: '', b_ve_spalten_r: '', b_ve_pr_spalten: '',
    b_gf_LA_rt_l: '', b_gf_LA_rt_r: '', b_gf_LA_mq: '', b_gf_LA_aq: '', b_gf_LA_ausl: '', b_gf_LA_pr: '',
    b_gf_RA_rt_l: '', b_gf_RA_rt_r: '', b_gf_RA_mq: '', b_gf_RA_aq: '', b_gf_RA_ausl: '', b_gf_RA_pr: '',
    b_gf_BA_rt_l: '', b_gf_BA_rt_r: '', b_gf_BA_mq: '', b_gf_BA_aq: '', b_gf_BA_ausl: '', b_gf_BA_pr: '',
    b_neg_rt_l: '', b_neg_rt_r: '', b_neg_mq: '', b_neg_aq: '', b_neg_ausl: '', b_neg_pr: '',
  };
};

const emptyCol = (user: string): ColData => ({
  id: null,
  date: new Date().toISOString().split('T')[0],
  examiner: user,
  schwerpunkt: 'wiedereingliederung',
  schwerpunktAnderer: '',
  aborted: false,
  abortComment: '',
  f: emptyF(),
});

// ── Encode ─────────────────────────────────────────────────────────────────────

const encodeCol = (col: ColData): TestResult => {
  const f = col.f;
  const best = (b: string, e: string) => b.trim() ? b : e;

  return {
    id: col.id ?? Date.now().toString(),
    testId: 'tap',
    date: col.date,
    examiner: col.examiner,
    note: '',
    aborted: col.aborted || undefined,
    abortComment: col.aborted ? col.abortComment : undefined,
    rawValues: {
      schwerpunkt: col.schwerpunkt,
      schwerpunktAnderer: col.schwerpunktAnderer,
      gn_ver: f.gn_ver, fl_ver: f.fl_ver, ga_ver: f.ga_ver, ve_ver: f.ve_ver,
      flag_alM: f.flag_alM ? 1 : 0, flag_al23: f.flag_al23 ? 1 : 0,
      flag_gn: f.flag_gn ? 1 : 0, flag_gn2: f.flag_gn2 ? 1 : 0,
      flag_fl: f.flag_fl ? 1 : 0, flag_ga: f.flag_ga ? 1 : 0,
      flag_vig: f.flag_vig ? 1 : 0, flag_ag: f.flag_ag ? 1 : 0,
      flag_ve: f.flag_ve ? 1 : 0, flag_gf: f.flag_gf ? 1 : 0, flag_neg: f.flag_neg ? 1 : 0,
      note_alM: f.note_alM, note_al23: f.note_al23, note_gn: f.note_gn, note_gn2: f.note_gn2,
      note_fl: f.note_fl, note_ga: f.note_ga, note_vig: f.note_vig, note_ag: f.note_ag,
      note_ve: f.note_ve, note_neg: f.note_neg,
      note_gf_LA: f.note_gf_LA, note_gf_RA: f.note_gf_RA, note_gf_BA: f.note_gf_BA,
      e_date_alM: f.e_date_alM, b_date_alM: f.b_date_alM,
      e_date_al23: f.e_date_al23, b_date_al23: f.b_date_al23,
      e_date_gn: f.e_date_gn, b_date_gn: f.b_date_gn,
      e_date_gn2: f.e_date_gn2, b_date_gn2: f.b_date_gn2,
      e_date_fl: f.e_date_fl, b_date_fl: f.b_date_fl,
      e_date_ga: f.e_date_ga, b_date_ga: f.b_date_ga,
      e_date_vig: f.e_date_vig, b_date_vig: f.b_date_vig,
      e_date_ag: f.e_date_ag, b_date_ag: f.b_date_ag,
      e_date_ve: f.e_date_ve, b_date_ve: f.b_date_ve,
      e_date_gf_LA: f.e_date_gf_LA, b_date_gf_LA: f.b_date_gf_LA,
      e_date_gf_RA: f.e_date_gf_RA, b_date_gf_RA: f.b_date_gf_RA,
      e_date_gf_BA: f.e_date_gf_BA, b_date_gf_BA: f.b_date_gf_BA,
      e_date_neg: f.e_date_neg, b_date_neg: f.b_date_neg,
      alM_rt: f.alM_rt, alM_sd: f.alM_sd, alM_sd_pr: f.alM_sd_pr, e_alM_pr: f.alM_pr,
      al23_ohne_rt: f.al23_ohne_rt, al23_ohne_sd: f.al23_ohne_sd, al23_ohne_sd_pr: f.al23_ohne_sd_pr, e_al23_ohne_pr: f.al23_ohne_pr,
      al23_mit_rt: f.al23_mit_rt, al23_mit_sd: f.al23_mit_sd, al23_mit_sd_pr: f.al23_mit_sd_pr, e_al23_mit_pr: f.al23_mit_pr,
      al23_phasisch: f.al23_phasisch, e_al23_pr: f.al23_pr,
      gn_rt: f.gn_rt, gn_sd: f.gn_sd, gn_fehler: f.gn_fehler, gn_ausl: f.gn_ausl, gn_sd_pr: f.gn_sd_pr,
      e_gn_pr: f.gn_pr, e_gn_fehler_pr: f.gn_fehler_pr, e_gn_ausl_pr: f.gn_ausl_pr,
      gn2_rt: f.gn2_rt, gn2_sd: f.gn2_sd, gn2_fehler: f.gn2_fehler, gn2_ausl: f.gn2_ausl, gn2_sd_pr: f.gn2_sd_pr,
      e_gn2_pr: f.gn2_pr, e_gn2_fehler_pr: f.gn2_fehler_pr, e_gn2_ausl_pr: f.gn2_ausl_pr,
      fl_rt: f.fl_rt, fl_sd: f.fl_sd, fl_fehler: f.fl_fehler, fl_sd_pr: f.fl_sd_pr,
      e_fl_pr: f.fl_pr, e_fl_fehler_pr: f.fl_fehler_pr,
      ga_rt: f.ga_rt, ga_sd: f.ga_sd, gv_rt: f.gv_rt, gv_sd: f.gv_sd,
      g_fehler: f.g_fehler, g_ausl_ges: f.g_ausl_ges,
      ga_sd_pr: f.ga_sd_pr, gv_sd_pr: f.gv_sd_pr,
      e_ga_pr: f.ga_pr, e_gv_pr: f.gv_pr,
      e_g_fehler_pr: f.g_fehler_pr, e_g_ausl_ges_pr: f.g_ausl_ges_pr,
      vig_rt: f.vig_rt, vig_sd: f.vig_sd, vig_fehler: f.vig_fehler, vig_ausl: f.vig_ausl, vig_sd_pr: f.vig_sd_pr,
      e_vig_pr: f.vig_pr, e_vig_fehler_pr: f.vig_fehler_pr, e_vig_ausl_pr: f.vig_ausl_pr,
      ag_rt: f.ag_rt, ag_sd: f.ag_sd, ag_fehler: f.ag_fehler, ag_ausl: f.ag_ausl, ag_sd_pr: f.ag_sd_pr,
      e_ag_pr: f.ag_pr, e_ag_fehler_pr: f.ag_fehler_pr, e_ag_ausl_pr: f.ag_ausl_pr,
      ve_rt_krit: f.ve_rt_krit, ve_sd_krit: f.ve_sd_krit, ve_rt_nkrit: f.ve_rt_nkrit, ve_sd_nkrit: f.ve_sd_nkrit,
      ve_fehler: f.ve_fehler, ve_ausl_krit: f.ve_ausl_krit, ve_zeilen_r: f.ve_zeilen_r, ve_spalten_r: f.ve_spalten_r,
      e_ve_pr_krit: f.ve_pr_krit, e_ve_sd_pr_krit: f.ve_sd_pr_krit,
      e_ve_pr_nkrit: f.ve_pr_nkrit, e_ve_sd_pr_nkrit: f.ve_sd_pr_nkrit,
      e_ve_pr_fehler: f.ve_pr_fehler, e_ve_pr_ausl: f.ve_pr_ausl,
      e_ve_pr_zeilen: f.ve_pr_zeilen, e_ve_pr_spalten: f.ve_pr_spalten,
      gf_LA_rt_l: f.gf_LA_rt_l, gf_LA_rt_r: f.gf_LA_rt_r, gf_LA_mq: f.gf_LA_mq, gf_LA_aq: f.gf_LA_aq, gf_LA_ausl: f.gf_LA_ausl, e_gf_LA_pr: f.gf_LA_pr,
      gf_RA_rt_l: f.gf_RA_rt_l, gf_RA_rt_r: f.gf_RA_rt_r, gf_RA_mq: f.gf_RA_mq, gf_RA_aq: f.gf_RA_aq, gf_RA_ausl: f.gf_RA_ausl, e_gf_RA_pr: f.gf_RA_pr,
      gf_BA_rt_l: f.gf_BA_rt_l, gf_BA_rt_r: f.gf_BA_rt_r, gf_BA_mq: f.gf_BA_mq, gf_BA_aq: f.gf_BA_aq, gf_BA_ausl: f.gf_BA_ausl, e_gf_BA_pr: f.gf_BA_pr,
      neg_rt_l: f.neg_rt_l, neg_rt_r: f.neg_rt_r, neg_mq: f.neg_mq, neg_aq: f.neg_aq, neg_ausl: f.neg_ausl,
      e_neg_pr: f.neg_pr,
      b_alM_rt: f.b_alM_rt, b_alM_sd: f.b_alM_sd, b_alM_pr: f.b_alM_pr, b_alM_sd_pr: f.b_alM_sd_pr,
      b_al23_ohne_rt: f.b_al23_ohne_rt, b_al23_ohne_sd: f.b_al23_ohne_sd, b_al23_ohne_pr: f.b_al23_ohne_pr, b_al23_ohne_sd_pr: f.b_al23_ohne_sd_pr,
      b_al23_mit_rt: f.b_al23_mit_rt, b_al23_mit_sd: f.b_al23_mit_sd, b_al23_mit_pr: f.b_al23_mit_pr, b_al23_mit_sd_pr: f.b_al23_mit_sd_pr,
      b_al23_phasisch: f.b_al23_phasisch, b_al23_pr: f.b_al23_pr,
      b_gn_rt: f.b_gn_rt, b_gn_sd: f.b_gn_sd, b_gn_fehler: f.b_gn_fehler, b_gn_ausl: f.b_gn_ausl,
      b_gn_pr: f.b_gn_pr, b_gn_sd_pr: f.b_gn_sd_pr, b_gn_fehler_pr: f.b_gn_fehler_pr, b_gn_ausl_pr: f.b_gn_ausl_pr,
      b_gn2_rt: f.b_gn2_rt, b_gn2_sd: f.b_gn2_sd, b_gn2_fehler: f.b_gn2_fehler, b_gn2_ausl: f.b_gn2_ausl,
      b_gn2_pr: f.b_gn2_pr, b_gn2_sd_pr: f.b_gn2_sd_pr, b_gn2_fehler_pr: f.b_gn2_fehler_pr, b_gn2_ausl_pr: f.b_gn2_ausl_pr,
      b_fl_rt: f.b_fl_rt, b_fl_sd: f.b_fl_sd, b_fl_fehler: f.b_fl_fehler,
      b_fl_pr: f.b_fl_pr, b_fl_sd_pr: f.b_fl_sd_pr, b_fl_fehler_pr: f.b_fl_fehler_pr,
      b_ga_rt: f.b_ga_rt, b_ga_sd: f.b_ga_sd, b_gv_rt: f.b_gv_rt, b_gv_sd: f.b_gv_sd,
      b_g_fehler: f.b_g_fehler, b_g_ausl_ges: f.b_g_ausl_ges,
      b_ga_pr: f.b_ga_pr, b_gv_pr: f.b_gv_pr, b_ga_sd_pr: f.b_ga_sd_pr, b_gv_sd_pr: f.b_gv_sd_pr,
      b_g_fehler_pr: f.b_g_fehler_pr, b_g_ausl_ges_pr: f.b_g_ausl_ges_pr,
      b_vig_rt: f.b_vig_rt, b_vig_sd: f.b_vig_sd, b_vig_fehler: f.b_vig_fehler, b_vig_ausl: f.b_vig_ausl,
      b_vig_pr: f.b_vig_pr, b_vig_sd_pr: f.b_vig_sd_pr, b_vig_fehler_pr: f.b_vig_fehler_pr, b_vig_ausl_pr: f.b_vig_ausl_pr,
      b_ag_rt: f.b_ag_rt, b_ag_sd: f.b_ag_sd, b_ag_fehler: f.b_ag_fehler, b_ag_ausl: f.b_ag_ausl,
      b_ag_pr: f.b_ag_pr, b_ag_sd_pr: f.b_ag_sd_pr, b_ag_fehler_pr: f.b_ag_fehler_pr, b_ag_ausl_pr: f.b_ag_ausl_pr,
      b_ve_rt_krit: f.b_ve_rt_krit, b_ve_sd_krit: f.b_ve_sd_krit, b_ve_pr_krit: f.b_ve_pr_krit, b_ve_sd_pr_krit: f.b_ve_sd_pr_krit,
      b_ve_rt_nkrit: f.b_ve_rt_nkrit, b_ve_sd_nkrit: f.b_ve_sd_nkrit, b_ve_pr_nkrit: f.b_ve_pr_nkrit, b_ve_sd_pr_nkrit: f.b_ve_sd_pr_nkrit,
      b_ve_fehler: f.b_ve_fehler, b_ve_pr_fehler: f.b_ve_pr_fehler,
      b_ve_ausl_krit: f.b_ve_ausl_krit, b_ve_pr_ausl: f.b_ve_pr_ausl,
      b_ve_zeilen_r: f.b_ve_zeilen_r, b_ve_pr_zeilen: f.b_ve_pr_zeilen,
      b_ve_spalten_r: f.b_ve_spalten_r, b_ve_pr_spalten: f.b_ve_pr_spalten,
      b_gf_LA_rt_l: f.b_gf_LA_rt_l, b_gf_LA_rt_r: f.b_gf_LA_rt_r, b_gf_LA_mq: f.b_gf_LA_mq, b_gf_LA_aq: f.b_gf_LA_aq, b_gf_LA_ausl: f.b_gf_LA_ausl, b_gf_LA_pr: f.b_gf_LA_pr,
      b_gf_RA_rt_l: f.b_gf_RA_rt_l, b_gf_RA_rt_r: f.b_gf_RA_rt_r, b_gf_RA_mq: f.b_gf_RA_mq, b_gf_RA_aq: f.b_gf_RA_aq, b_gf_RA_ausl: f.b_gf_RA_ausl, b_gf_RA_pr: f.b_gf_RA_pr,
      b_gf_BA_rt_l: f.b_gf_BA_rt_l, b_gf_BA_rt_r: f.b_gf_BA_rt_r, b_gf_BA_mq: f.b_gf_BA_mq, b_gf_BA_aq: f.b_gf_BA_aq, b_gf_BA_ausl: f.b_gf_BA_ausl, b_gf_BA_pr: f.b_gf_BA_pr,
      b_neg_rt_l: f.b_neg_rt_l, b_neg_rt_r: f.b_neg_rt_r, b_neg_mq: f.b_neg_mq, b_neg_aq: f.b_neg_aq, b_neg_ausl: f.b_neg_ausl, b_neg_pr: f.b_neg_pr,
    },
    percentileRanks: {
      alertnessM:         best(f.b_alM_pr, f.alM_pr),
      alertness23_ohne:   best(f.b_al23_ohne_pr, f.al23_ohne_pr),
      alertness23_mit:    best(f.b_al23_mit_pr, f.al23_mit_pr),
      alertness23:        best(f.b_al23_pr, f.al23_pr),
      gonogo:             best(f.b_gn_pr, f.gn_pr),
      gonogo2:            best(f.b_gn2_pr, f.gn2_pr),
      flexibilitaet:      best(f.b_fl_pr, f.fl_pr),
      geteilte:           best(f.b_ga_pr, f.ga_pr),
      geteilteVisuell:    best(f.b_gv_pr, f.gv_pr),
      vigilanz:           best(f.b_vig_pr, f.vig_pr),
      arbeitsgedaechtnis: best(f.b_ag_pr, f.ag_pr),
      neg_pr:             best(f.b_neg_pr, f.neg_pr),
      gn_fehler_pr:       best(f.b_gn_fehler_pr, f.gn_fehler_pr),
      gn_ausl_pr:         best(f.b_gn_ausl_pr, f.gn_ausl_pr),
      gn2_fehler_pr:      best(f.b_gn2_fehler_pr, f.gn2_fehler_pr),
      gn2_ausl_pr:        best(f.b_gn2_ausl_pr, f.gn2_ausl_pr),
      fl_fehler_pr:       best(f.b_fl_fehler_pr, f.fl_fehler_pr),
      g_fehler_pr:        best(f.b_g_fehler_pr, f.g_fehler_pr),
      g_ausl_ges_pr:      best(f.b_g_ausl_ges_pr, f.g_ausl_ges_pr),
      vig_fehler_pr:      best(f.b_vig_fehler_pr, f.vig_fehler_pr),
      vig_ausl_pr:        best(f.b_vig_ausl_pr, f.vig_ausl_pr),
      ag_fehler_pr:       best(f.b_ag_fehler_pr, f.ag_fehler_pr),
      ag_ausl_pr:         best(f.b_ag_ausl_pr, f.ag_ausl_pr),
      alM_sd_pr:          best(f.b_alM_sd_pr, f.alM_sd_pr),
      al23_ohne_sd_pr:    best(f.b_al23_ohne_sd_pr, f.al23_ohne_sd_pr),
      al23_mit_sd_pr:     best(f.b_al23_mit_sd_pr, f.al23_mit_sd_pr),
      gn_sd_pr:           best(f.b_gn_sd_pr, f.gn_sd_pr),
      gn2_sd_pr:          best(f.b_gn2_sd_pr, f.gn2_sd_pr),
      fl_sd_pr:           best(f.b_fl_sd_pr, f.fl_sd_pr),
      ga_sd_pr:           best(f.b_ga_sd_pr, f.ga_sd_pr),
      gv_sd_pr:           best(f.b_gv_sd_pr, f.gv_sd_pr),
      vig_sd_pr:          best(f.b_vig_sd_pr, f.vig_sd_pr),
      ag_sd_pr:           best(f.b_ag_sd_pr, f.ag_sd_pr),
      ve_rt_krit_pr:      best(f.b_ve_pr_krit, f.ve_pr_krit),
      ve_sd_krit_pr:      best(f.b_ve_sd_pr_krit, f.ve_sd_pr_krit),
      ve_rt_nkrit_pr:     best(f.b_ve_pr_nkrit, f.ve_pr_nkrit),
      ve_sd_nkrit_pr:     best(f.b_ve_sd_pr_nkrit, f.ve_sd_pr_nkrit),
      ve_fehler_pr:       best(f.b_ve_pr_fehler, f.ve_pr_fehler),
      ve_ausl_krit_pr:    best(f.b_ve_pr_ausl, f.ve_pr_ausl),
      ve_zeilen_r_pr:     best(f.b_ve_pr_zeilen, f.ve_pr_zeilen),
      ve_spalten_r_pr:    best(f.b_ve_pr_spalten, f.ve_pr_spalten),
    },
    normInfo: '',
    calculatedValues: {},
  };
};

// ── Decode (load from saved TestResult back into ColData) ──────────────────────

const decodeResult = (r: TestResult): ColData => {
  const rv = r.rawValues ?? {};
  const pr = r.percentileRanks ?? {};
  const s = (k: string) => String(rv[k] ?? '');
  const p = (k: string) => String(pr[k] ?? '');
  const today = new Date().toISOString().split('T')[0];
  const d = (k: string) => s(k) || today; // date fields fall back to today if empty

  // ── Gesichtsfeld-Migration ─────────────────────────────────────────────────
  // Ältere TestResults kennen nur EIN gemeinsames Werte-Set (gf_rt_l usw.) plus
  // ein gf_eye-Flag, statt je Auge einen eigenen Slot. Beim ersten Laden werden
  // diese Altwerte verlustfrei in den passenden LA/RA/BA-Slot übernommen.
  const legacyGfEye = (rv.gf_eye as 'LA' | 'RA' | 'BA') || 'BA';
  const gfL = (eye: 'LA' | 'RA' | 'BA', newKey: string, legacyKey: string) =>
    s(newKey) || (eye === legacyGfEye ? s(legacyKey) : '');
  const gfLd = (eye: 'LA' | 'RA' | 'BA', newKey: string, legacyKey: string) =>
    s(newKey) || (eye === legacyGfEye ? s(legacyKey) : '') || today;

  return {
    id: r.id,
    date: r.date,
    examiner: r.examiner ?? '',
    schwerpunkt: (rv.schwerpunkt as DiagnostikSchwerpunkt) || 'wiedereingliederung',
    schwerpunktAnderer: s('schwerpunktAnderer'),
    aborted: r.aborted ?? false,
    abortComment: r.abortComment ?? '',
    f: {
      gn_ver: (rv.gn_ver as '2.3' | 'M') || '2.3',
      fl_ver: (rv.fl_ver as '2.3' | 'M') || '2.3',
      ga_ver: (rv.ga_ver as '2.3' | 'M') || '2.3',
      ve_ver: (rv.ve_ver as '2.3' | 'M') || '2.3',
      flag_alM: !!rv.flag_alM, flag_al23: !!rv.flag_al23,
      flag_gn: !!rv.flag_gn, flag_gn2: !!rv.flag_gn2,
      flag_fl: !!rv.flag_fl, flag_ga: !!rv.flag_ga,
      flag_vig: !!rv.flag_vig, flag_ag: !!rv.flag_ag,
      flag_ve: !!rv.flag_ve, flag_gf: !!rv.flag_gf, flag_neg: !!rv.flag_neg,
      note_alM: s('note_alM'), note_al23: s('note_al23'),
      note_gn: s('note_gn'), note_gn2: s('note_gn2'),
      note_fl: s('note_fl'), note_ga: s('note_ga'),
      note_vig: s('note_vig'), note_ag: s('note_ag'),
      note_ve: s('note_ve'), note_neg: s('note_neg'),
      note_gf_LA: gfL('LA', 'note_gf_LA', 'note_gf'),
      note_gf_RA: gfL('RA', 'note_gf_RA', 'note_gf'),
      note_gf_BA: gfL('BA', 'note_gf_BA', 'note_gf'),
      e_date_alM: d('e_date_alM'), b_date_alM: d('b_date_alM'),
      e_date_al23: d('e_date_al23'), b_date_al23: d('b_date_al23'),
      e_date_gn: d('e_date_gn'), b_date_gn: d('b_date_gn'),
      e_date_gn2: d('e_date_gn2'), b_date_gn2: d('b_date_gn2'),
      e_date_fl: d('e_date_fl'), b_date_fl: d('b_date_fl'),
      e_date_ga: d('e_date_ga'), b_date_ga: d('b_date_ga'),
      e_date_vig: d('e_date_vig'), b_date_vig: d('b_date_vig'),
      e_date_ag: d('e_date_ag'), b_date_ag: d('b_date_ag'),
      e_date_ve: d('e_date_ve'), b_date_ve: d('b_date_ve'),
      e_date_gf_LA: gfLd('LA', 'e_date_gf_LA', 'e_date_gf'), b_date_gf_LA: gfLd('LA', 'b_date_gf_LA', 'b_date_gf'),
      e_date_gf_RA: gfLd('RA', 'e_date_gf_RA', 'e_date_gf'), b_date_gf_RA: gfLd('RA', 'b_date_gf_RA', 'b_date_gf'),
      e_date_gf_BA: gfLd('BA', 'e_date_gf_BA', 'e_date_gf'), b_date_gf_BA: gfLd('BA', 'b_date_gf_BA', 'b_date_gf'),
      e_date_neg: d('e_date_neg'), b_date_neg: d('b_date_neg'),
      alM_rt: s('alM_rt'), alM_sd: s('alM_sd'), alM_sd_pr: s('alM_sd_pr'),
      alM_pr: s('e_alM_pr') || p('alertnessM'),
      al23_ohne_rt: s('al23_ohne_rt'), al23_ohne_sd: s('al23_ohne_sd'), al23_ohne_sd_pr: s('al23_ohne_sd_pr'),
      al23_ohne_pr: s('e_al23_ohne_pr') || p('alertness23_ohne'),
      al23_mit_rt: s('al23_mit_rt'), al23_mit_sd: s('al23_mit_sd'), al23_mit_sd_pr: s('al23_mit_sd_pr'),
      al23_mit_pr: s('e_al23_mit_pr') || p('alertness23_mit'),
      al23_phasisch: s('al23_phasisch'),
      al23_pr: s('e_al23_pr') || p('alertness23'),
      gn_rt: s('gn_rt'), gn_sd: s('gn_sd'), gn_fehler: s('gn_fehler'), gn_ausl: s('gn_ausl'), gn_sd_pr: s('gn_sd_pr'),
      gn_pr: s('e_gn_pr') || p('gonogo'),
      gn_fehler_pr: s('e_gn_fehler_pr') || p('gn_fehler_pr'),
      gn_ausl_pr: s('e_gn_ausl_pr') || p('gn_ausl_pr'),
      gn2_rt: s('gn2_rt'), gn2_sd: s('gn2_sd'), gn2_fehler: s('gn2_fehler'), gn2_ausl: s('gn2_ausl'), gn2_sd_pr: s('gn2_sd_pr'),
      gn2_pr: s('e_gn2_pr') || p('gonogo2'),
      gn2_fehler_pr: s('e_gn2_fehler_pr') || p('gn2_fehler_pr'),
      gn2_ausl_pr: s('e_gn2_ausl_pr') || p('gn2_ausl_pr'),
      fl_rt: s('fl_rt'), fl_sd: s('fl_sd'), fl_fehler: s('fl_fehler'), fl_sd_pr: s('fl_sd_pr'),
      fl_pr: s('e_fl_pr') || p('flexibilitaet'),
      fl_fehler_pr: s('e_fl_fehler_pr') || p('fl_fehler_pr'),
      ga_rt: s('ga_rt'), ga_sd: s('ga_sd'), gv_rt: s('gv_rt'), gv_sd: s('gv_sd'),
      g_fehler: s('g_fehler'), g_ausl_ges: s('g_ausl_ges'),
      ga_sd_pr: s('ga_sd_pr'), gv_sd_pr: s('gv_sd_pr'),
      ga_pr: s('e_ga_pr') || p('geteilte'),
      gv_pr: s('e_gv_pr') || p('geteilteVisuell'),
      g_fehler_pr: s('e_g_fehler_pr') || p('g_fehler_pr'),
      g_ausl_ges_pr: s('e_g_ausl_ges_pr') || p('g_ausl_ges_pr'),
      vig_rt: s('vig_rt'), vig_sd: s('vig_sd'), vig_fehler: s('vig_fehler'), vig_ausl: s('vig_ausl'), vig_sd_pr: s('vig_sd_pr'),
      vig_pr: s('e_vig_pr') || p('vigilanz'),
      vig_fehler_pr: s('e_vig_fehler_pr') || p('vig_fehler_pr'),
      vig_ausl_pr: s('e_vig_ausl_pr') || p('vig_ausl_pr'),
      ag_rt: s('ag_rt'), ag_sd: s('ag_sd'), ag_fehler: s('ag_fehler'), ag_ausl: s('ag_ausl'), ag_sd_pr: s('ag_sd_pr'),
      ag_pr: s('e_ag_pr') || p('arbeitsgedaechtnis'),
      ag_fehler_pr: s('e_ag_fehler_pr') || p('ag_fehler_pr'),
      ag_ausl_pr: s('e_ag_ausl_pr') || p('ag_ausl_pr'),
      ve_rt_krit: s('ve_rt_krit'), ve_sd_krit: s('ve_sd_krit'), ve_rt_nkrit: s('ve_rt_nkrit'), ve_sd_nkrit: s('ve_sd_nkrit'),
      ve_fehler: s('ve_fehler'), ve_ausl_krit: s('ve_ausl_krit'), ve_zeilen_r: s('ve_zeilen_r'), ve_spalten_r: s('ve_spalten_r'),
      ve_pr_krit: s('e_ve_pr_krit') || p('ve_rt_krit_pr'),
      ve_sd_pr_krit: s('e_ve_sd_pr_krit') || p('ve_sd_krit_pr'),
      ve_pr_nkrit: s('e_ve_pr_nkrit') || p('ve_rt_nkrit_pr'),
      ve_sd_pr_nkrit: s('e_ve_sd_pr_nkrit') || p('ve_sd_nkrit_pr'),
      ve_pr_fehler: s('e_ve_pr_fehler') || p('ve_fehler_pr'),
      ve_pr_ausl: s('e_ve_pr_ausl') || p('ve_ausl_krit_pr'),
      ve_pr_zeilen: s('e_ve_pr_zeilen') || p('ve_zeilen_r_pr'),
      ve_pr_spalten: s('e_ve_pr_spalten') || p('ve_spalten_r_pr'),
      gf_LA_rt_l: gfL('LA', 'gf_LA_rt_l', 'gf_rt_l'), gf_LA_rt_r: gfL('LA', 'gf_LA_rt_r', 'gf_rt_r'),
      gf_LA_mq: gfL('LA', 'gf_LA_mq', 'gf_mq'), gf_LA_aq: gfL('LA', 'gf_LA_aq', 'gf_aq'), gf_LA_ausl: gfL('LA', 'gf_LA_ausl', 'gf_ausl'),
      gf_LA_pr: gfL('LA', 'e_gf_LA_pr', 'e_gf_pr'),
      gf_RA_rt_l: gfL('RA', 'gf_RA_rt_l', 'gf_rt_l'), gf_RA_rt_r: gfL('RA', 'gf_RA_rt_r', 'gf_rt_r'),
      gf_RA_mq: gfL('RA', 'gf_RA_mq', 'gf_mq'), gf_RA_aq: gfL('RA', 'gf_RA_aq', 'gf_aq'), gf_RA_ausl: gfL('RA', 'gf_RA_ausl', 'gf_ausl'),
      gf_RA_pr: gfL('RA', 'e_gf_RA_pr', 'e_gf_pr'),
      gf_BA_rt_l: gfL('BA', 'gf_BA_rt_l', 'gf_rt_l'), gf_BA_rt_r: gfL('BA', 'gf_BA_rt_r', 'gf_rt_r'),
      gf_BA_mq: gfL('BA', 'gf_BA_mq', 'gf_mq'), gf_BA_aq: gfL('BA', 'gf_BA_aq', 'gf_aq'), gf_BA_ausl: gfL('BA', 'gf_BA_ausl', 'gf_ausl'),
      gf_BA_pr: gfL('BA', 'e_gf_BA_pr', 'e_gf_pr'),
      neg_rt_l: s('neg_rt_l'), neg_rt_r: s('neg_rt_r'), neg_mq: s('neg_mq'), neg_aq: s('neg_aq'), neg_ausl: s('neg_ausl'),
      neg_pr: s('e_neg_pr') || p('neg_pr'),
      b_alM_rt: s('b_alM_rt'), b_alM_sd: s('b_alM_sd'), b_alM_pr: s('b_alM_pr'), b_alM_sd_pr: s('b_alM_sd_pr'),
      b_al23_ohne_rt: s('b_al23_ohne_rt'), b_al23_ohne_sd: s('b_al23_ohne_sd'), b_al23_ohne_pr: s('b_al23_ohne_pr'), b_al23_ohne_sd_pr: s('b_al23_ohne_sd_pr'),
      b_al23_mit_rt: s('b_al23_mit_rt'), b_al23_mit_sd: s('b_al23_mit_sd'), b_al23_mit_pr: s('b_al23_mit_pr'), b_al23_mit_sd_pr: s('b_al23_mit_sd_pr'),
      b_al23_phasisch: s('b_al23_phasisch'), b_al23_pr: s('b_al23_pr'),
      b_gn_rt: s('b_gn_rt'), b_gn_sd: s('b_gn_sd'), b_gn_fehler: s('b_gn_fehler'), b_gn_ausl: s('b_gn_ausl'),
      b_gn_pr: s('b_gn_pr'), b_gn_sd_pr: s('b_gn_sd_pr'), b_gn_fehler_pr: s('b_gn_fehler_pr'), b_gn_ausl_pr: s('b_gn_ausl_pr'),
      b_gn2_rt: s('b_gn2_rt'), b_gn2_sd: s('b_gn2_sd'), b_gn2_fehler: s('b_gn2_fehler'), b_gn2_ausl: s('b_gn2_ausl'),
      b_gn2_pr: s('b_gn2_pr'), b_gn2_sd_pr: s('b_gn2_sd_pr'), b_gn2_fehler_pr: s('b_gn2_fehler_pr'), b_gn2_ausl_pr: s('b_gn2_ausl_pr'),
      b_fl_rt: s('b_fl_rt'), b_fl_sd: s('b_fl_sd'), b_fl_fehler: s('b_fl_fehler'),
      b_fl_pr: s('b_fl_pr'), b_fl_sd_pr: s('b_fl_sd_pr'), b_fl_fehler_pr: s('b_fl_fehler_pr'),
      b_ga_rt: s('b_ga_rt'), b_ga_sd: s('b_ga_sd'), b_gv_rt: s('b_gv_rt'), b_gv_sd: s('b_gv_sd'),
      b_g_fehler: s('b_g_fehler'), b_g_ausl_ges: s('b_g_ausl_ges'),
      b_ga_pr: s('b_ga_pr'), b_gv_pr: s('b_gv_pr'), b_ga_sd_pr: s('b_ga_sd_pr'), b_gv_sd_pr: s('b_gv_sd_pr'),
      b_g_fehler_pr: s('b_g_fehler_pr'), b_g_ausl_ges_pr: s('b_g_ausl_ges_pr'),
      b_vig_rt: s('b_vig_rt'), b_vig_sd: s('b_vig_sd'), b_vig_fehler: s('b_vig_fehler'), b_vig_ausl: s('b_vig_ausl'),
      b_vig_pr: s('b_vig_pr'), b_vig_sd_pr: s('b_vig_sd_pr'), b_vig_fehler_pr: s('b_vig_fehler_pr'), b_vig_ausl_pr: s('b_vig_ausl_pr'),
      b_ag_rt: s('b_ag_rt'), b_ag_sd: s('b_ag_sd'), b_ag_fehler: s('b_ag_fehler'), b_ag_ausl: s('b_ag_ausl'),
      b_ag_pr: s('b_ag_pr'), b_ag_sd_pr: s('b_ag_sd_pr'), b_ag_fehler_pr: s('b_ag_fehler_pr'), b_ag_ausl_pr: s('b_ag_ausl_pr'),
      b_ve_rt_krit: s('b_ve_rt_krit'), b_ve_sd_krit: s('b_ve_sd_krit'), b_ve_pr_krit: s('b_ve_pr_krit'), b_ve_sd_pr_krit: s('b_ve_sd_pr_krit'),
      b_ve_rt_nkrit: s('b_ve_rt_nkrit'), b_ve_sd_nkrit: s('b_ve_sd_nkrit'), b_ve_pr_nkrit: s('b_ve_pr_nkrit'), b_ve_sd_pr_nkrit: s('b_ve_sd_pr_nkrit'),
      b_ve_fehler: s('b_ve_fehler'), b_ve_pr_fehler: s('b_ve_pr_fehler'),
      b_ve_ausl_krit: s('b_ve_ausl_krit'), b_ve_pr_ausl: s('b_ve_pr_ausl'),
      b_ve_zeilen_r: s('b_ve_zeilen_r'), b_ve_pr_zeilen: s('b_ve_pr_zeilen'),
      b_ve_spalten_r: s('b_ve_spalten_r'), b_ve_pr_spalten: s('b_ve_pr_spalten'),
      b_gf_LA_rt_l: gfL('LA', 'b_gf_LA_rt_l', 'b_gf_rt_l'), b_gf_LA_rt_r: gfL('LA', 'b_gf_LA_rt_r', 'b_gf_rt_r'),
      b_gf_LA_mq: gfL('LA', 'b_gf_LA_mq', 'b_gf_mq'), b_gf_LA_aq: gfL('LA', 'b_gf_LA_aq', 'b_gf_aq'), b_gf_LA_ausl: gfL('LA', 'b_gf_LA_ausl', 'b_gf_ausl'),
      b_gf_LA_pr: gfL('LA', 'b_gf_LA_pr', 'b_gf_pr'),
      b_gf_RA_rt_l: gfL('RA', 'b_gf_RA_rt_l', 'b_gf_rt_l'), b_gf_RA_rt_r: gfL('RA', 'b_gf_RA_rt_r', 'b_gf_rt_r'),
      b_gf_RA_mq: gfL('RA', 'b_gf_RA_mq', 'b_gf_mq'), b_gf_RA_aq: gfL('RA', 'b_gf_RA_aq', 'b_gf_aq'), b_gf_RA_ausl: gfL('RA', 'b_gf_RA_ausl', 'b_gf_ausl'),
      b_gf_RA_pr: gfL('RA', 'b_gf_RA_pr', 'b_gf_pr'),
      b_gf_BA_rt_l: gfL('BA', 'b_gf_BA_rt_l', 'b_gf_rt_l'), b_gf_BA_rt_r: gfL('BA', 'b_gf_BA_rt_r', 'b_gf_rt_r'),
      b_gf_BA_mq: gfL('BA', 'b_gf_BA_mq', 'b_gf_mq'), b_gf_BA_aq: gfL('BA', 'b_gf_BA_aq', 'b_gf_aq'), b_gf_BA_ausl: gfL('BA', 'b_gf_BA_ausl', 'b_gf_ausl'),
      b_gf_BA_pr: gfL('BA', 'b_gf_BA_pr', 'b_gf_pr'),
      b_neg_rt_l: s('b_neg_rt_l'), b_neg_rt_r: s('b_neg_rt_r'), b_neg_mq: s('b_neg_mq'), b_neg_aq: s('b_neg_aq'), b_neg_ausl: s('b_neg_ausl'), b_neg_pr: s('b_neg_pr'),
    },
  };
};

// ── UI Primitives ──────────────────────────────────────────────────────────────

const DateInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <input
    type="date"
    value={value}
    onChange={e => onChange(e.target.value)}
    tabIndex={-1}
    className="text-[10px] px-1.5 py-1 bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300 outline-none focus:ring-1 focus:ring-slate-400 w-[118px] block"
  />
);

const goNextField = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement>('input:not([tabindex="-1"])')
  );
  const idx = all.indexOf(e.currentTarget);
  if (idx >= 0 && idx < all.length - 1) all[idx + 1].focus();
};

const Val: React.FC<{
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  placeholder?: string;
  unit?: string;
  prefix?: string;
}> = ({ value, onChange, numeric = true, placeholder = '—', unit, prefix }) => (
  <div className="flex items-center gap-0.5">
    {prefix && <span className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0 select-none">{prefix}</span>}
    <input
      type="text"
      inputMode={numeric ? 'numeric' : 'text'}
      value={value}
      onChange={e => onChange(numeric ? e.target.value.replace(/[^\d,.-]/g, '') : e.target.value)}
      onKeyDown={goNextField}
      placeholder={placeholder}
      className={cn(
        'w-14 text-[11px] text-center font-mono rounded px-1 py-[3px] outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-colors border',
        value.trim()
          ? 'text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 border-slate-400 dark:border-slate-400 font-semibold shadow-sm'
          : 'text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800/60 border-slate-300 dark:border-slate-600 border-dashed placeholder:text-slate-300',
      )}
    />
    {unit && <span className="text-[9px] text-slate-400 dark:text-slate-500 ml-0.5 shrink-0">{unit}</span>}
  </div>
);

// Representative PR as a number, understanding range / boundary notations so
// that "< 2", "> 12", "50-75", "≤5", "≥95", "30->95" are coloured like in the
// profile (mirrors prToNum in PRProfile.tsx). Returns NaN for empty/qualitative.
const prToRepresentativeNum = (value: string): number => {
  const s = value.toString().trim().replace(',', '.');
  if (!s) return NaN;
  const mTop = s.match(/^(\d+(?:\.\d+)?)->95$/);
  if (mTop) { const a = parseFloat(mTop[1]); return isNaN(a) ? 97 : (a + 100) / 2; }
  const mGt = s.match(/^>\s*(\d+(?:\.\d+)?)$/);
  if (mGt) { const a = parseFloat(mGt[1]); return isNaN(a) ? 99 : Math.min(100, a + 1); }
  const mLt = s.match(/^<\s*(\d+(?:\.\d+)?)$/);
  if (mLt) { const a = parseFloat(mLt[1]); return isNaN(a) ? 1 : a / 2; }
  const mRange = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (mRange) { const a = parseFloat(mRange[1]), b = parseFloat(mRange[2]); return (Math.min(a, b) + Math.max(a, b)) / 2; }
  if (s.startsWith('≤')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? 1 : v / 2; }
  if (s.startsWith('≥')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? 99 : Math.min(100, v); }
  return parseFloat(s);
};

// PR color based on standard or TAP-M cutoffs
const prColorCls = (value: string, tapM = false): string => {
  const n = prToRepresentativeNum(value);
  if (!value.trim() || isNaN(n)) return '';
  if (n < (tapM ? 31 : 16))
    return 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300';
  if (n >= 75)
    return 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-300';
  return '';
};

const PR: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string; tapM?: boolean }> = ({
  value, onChange, placeholder = 'PR', tapM = false,
}) => {
  const colorCls = prColorCls(value, tapM);
  return (
    <input
      type="text"
      inputMode="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={goNextField}
      placeholder={placeholder}
      className={cn(
        'w-12 text-[11px] text-center font-mono rounded px-1 py-[3px] outline-none focus:ring-1 focus:ring-slate-400 transition-colors border',
        colorCls || 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 border-slate-300 dark:border-slate-500',
      )}
    />
  );
};

const Dash: React.FC = () => (
  <span className="text-[10px] text-slate-200 dark:text-slate-700 select-none">·</span>
);

const FlagBtn: React.FC<{ flagged: boolean; onClick: () => void }> = ({ flagged, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    tabIndex={-1}
    title={flagged ? 'Markierung aufheben' : 'Vor Entlassung wiederholen'}
    className={cn(
      'p-1.5 rounded-lg border transition-colors shrink-0',
      flagged
        ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-500 border-orange-200 dark:border-orange-800/60'
        : 'bg-white dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-200 dark:hover:border-orange-800/50',
    )}
  >
    {flagged ? <Bell size={12} /> : <BellOff size={12} />}
  </button>
);

const VerToggle: React.FC<{ value: '2.3' | 'M'; onChange: (v: '2.3' | 'M') => void }> = ({ value, onChange }) => (
  <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600 text-[9px] font-semibold shrink-0">
    {(['2.3', 'M'] as const).map(v => (
      <button key={v} type="button" tabIndex={-1} onClick={() => onChange(v)} className={cn(
        'px-1.5 py-0.5 transition-colors',
        value === v
          ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
          : 'bg-white dark:bg-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600',
      )}>{v}</button>
    ))}
  </div>
);

const EyeToggle: React.FC<{ value: 'LA' | 'RA' | 'BA'; onChange: (v: 'LA' | 'RA' | 'BA') => void }> = ({ value, onChange }) => (
  <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600 text-[9px] font-semibold shrink-0">
    {(['LA', 'RA', 'BA'] as const).map(v => (
      <button key={v} type="button" tabIndex={-1} onClick={() => onChange(v)} className={cn(
        'px-1.5 py-0.5 transition-colors',
        value === v
          ? 'bg-slate-600 dark:bg-slate-200 text-white dark:text-slate-900'
          : 'bg-white dark:bg-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600',
      )}>{v}</button>
    ))}
  </div>
);

const EYE_LABEL_SHORT: Record<'LA' | 'RA' | 'BA', string> = { LA: 'li. Auge', RA: 're. Auge', BA: 'beide Augen' };

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <tr>
    <td colSpan={9} className="pt-3 pb-0 px-2">
      <div className="bg-slate-800 rounded-md px-3 py-1.5">
        <span className="text-[10px] font-bold text-slate-100 dark:text-slate-100 uppercase tracking-widest whitespace-nowrap">
          {label}
        </span>
      </div>
    </td>
  </tr>
);

// ── TestGroupRows: renders all rows for one test with Eingang / Abschluss columns ──

interface RowDef {
  label: string;
  eVal: string;   onEVal: (v: string) => void;
  ePr?: string;   onEPr?: (v: string) => void; ePrPh?: string;
  aVal: string;   onAVal: (v: string) => void;
  aPr?: string;   onAPr?: (v: string) => void;
  prefix?: string; unit?: string;
  numeric?: boolean; valPh?: string;
  tapM?: boolean;
}

const TestGroupRows: React.FC<{
  testLabel: string;
  badge?: string;
  verToggle?: React.ReactNode;
  flagged: boolean;
  onFlag: () => void;
  noteValue: string;
  onNoteChange: (v: string) => void;
  noteOpen: boolean;
  onToggleNote: () => void;
  eDate: string;  onEDate: (v: string) => void;
  aDate: string;  onADate: (v: string) => void;
  rows: RowDef[];
  onReset: () => void;
}> = ({ testLabel, badge, verToggle, flagged, onFlag, noteValue, onNoteChange, noteOpen, onToggleNote, eDate, onEDate, aDate, onADate, rows, onReset }) => {
  const n = rows.length;
  const hasNote = !!(noteValue?.trim());
  const hasData = rows.some(r =>
    r.eVal.trim() || r.aVal.trim() || (r.ePr ?? '').trim() || (r.aPr ?? '').trim(),
  );
  // Eine Testgruppe besteht aus mehreren <tr>, deren Label-/Datums-/Notiz-Zellen per
  // rowSpan über alle Unterzeilen laufen. Ein reines tr-eigenes :hover würde daher nur
  // Teile der Gruppe einfärben (ragged). Stattdessen highlighten wir beim Hover die
  // gesamte Gruppe einheitlich.
  const [hover, setHover] = useState(false);
  const bdr = (extra = '') => cn(
    flagged ? 'border-orange-100 dark:border-orange-900/40' : 'border-slate-100 dark:border-slate-700/40',
    extra,
  );
  const rowBg = flagged
    ? 'bg-orange-50/50 dark:bg-orange-950/10'
    : hover ? 'bg-slate-50/50 dark:bg-slate-700/15' : '';

  return (
    <>
      {rows.map((row, i) => (
        <tr key={i}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          className={cn('transition-colors', rowBg)}>
          {i === 0 && (
            <td rowSpan={n} className={bdr('px-3 py-2 align-top border-r')}>
              <div className="flex flex-col gap-1.5 min-w-0 pt-0.5">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={cn(
                    'text-[11px] font-semibold whitespace-nowrap',
                    flagged ? 'text-orange-700 dark:text-orange-300' : 'text-slate-700 dark:text-slate-200',
                  )}>
                    {testLabel}
                  </span>
                  {badge && (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 leading-none shrink-0 font-medium">
                      {badge}
                    </span>
                  )}
                  {hasData && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500 shrink-0" title="Werte eingetragen" />
                  )}
                </div>
                {verToggle}
              </div>
            </td>
          )}
          <td className={bdr('px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-middle')}>
            {row.label}
          </td>
          {i === 0 && (
            <td rowSpan={n} className={bdr('px-2 py-2 align-top border-r')}>
              <DateInput value={eDate} onChange={onEDate} />
            </td>
          )}
          <td className="px-1.5 py-1.5 align-middle">
            <Val value={row.eVal} onChange={row.onEVal} prefix={row.prefix} unit={row.unit}
              numeric={row.numeric !== false} placeholder={row.valPh ?? '—'} />
          </td>
          <td className={bdr('px-1 py-1.5 align-middle border-r')}>
            {row.ePr !== undefined && row.onEPr
              ? <PR value={row.ePr} onChange={row.onEPr} placeholder={row.ePrPh ?? 'PR'} tapM={row.tapM} />
              : <Dash />}
          </td>
          {i === 0 && (
            <td rowSpan={n} className={bdr('px-2 py-2 align-top border-r')}>
              <DateInput value={aDate} onChange={onADate} />
            </td>
          )}
          <td className="px-1.5 py-1.5 align-middle">
            <Val value={row.aVal} onChange={row.onAVal} prefix={row.prefix} unit={row.unit}
              numeric={row.numeric !== false} placeholder={row.valPh ?? '—'} />
          </td>
          <td className="px-1 py-1.5 align-middle">
            {row.aPr !== undefined && row.onAPr
              ? <PR value={row.aPr} onChange={row.onAPr} placeholder={row.ePrPh ?? 'PR'} tapM={row.tapM} />
              : <Dash />}
          </td>
          {i === 0 && (
            <td rowSpan={n} className="pl-2 pr-3 py-1.5 align-top border-l border-slate-100 dark:border-slate-700/40">
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={onToggleNote}
                  tabIndex={-1}
                  title="Anmerkung"
                  className={cn(
                    'p-1.5 rounded-lg border transition-colors shrink-0',
                    noteOpen || hasNote
                      ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
                      : 'bg-white dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:border-amber-200',
                  )}
                >
                  <StickyNote size={12} />
                </button>
                <FlagBtn flagged={flagged} onClick={onFlag} />
                <button
                  type="button"
                  onClick={onReset}
                  tabIndex={-1}
                  title="Felder leeren"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/60 transition-colors text-slate-400 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-200 dark:hover:border-rose-800/50 shrink-0"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </td>
          )}
        </tr>
      ))}
      {noteOpen && (
        <tr className="bg-amber-50/40 dark:bg-amber-950/10">
          <td colSpan={9} className="px-3 pb-2 pt-0.5">
            <div className="flex items-start gap-1.5">
              <textarea
                value={noteValue}
                onChange={e => onNoteChange(e.target.value)}
                placeholder="Anmerkung…"
                rows={1}
                autoFocus
                tabIndex={-1}
                className="flex-1 text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5 resize-none outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed overflow-hidden transition-colors"
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = `${t.scrollHeight}px`;
                }}
              />
              <button type="button" tabIndex={-1} onClick={onToggleNote} className="mt-1.5 p-1 rounded text-slate-300 hover:text-slate-500 transition-colors">
                <X size={11} />
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ── History domain blocks ──────────────────────────────────────────────────────

const HIST_BLOCKS = [
  { key: 'alM',  label: 'Alertness [M]', rows: [
    { label: 'RT',        rawKey: 'alM_rt',       unit: 'ms', prKey: 'alertnessM',        tapM: true as const },
    { label: 'SD',        rawKey: 'alM_sd',        unit: 'ms', prKey: 'alM_sd_pr',         tapM: true as const },
  ]},
  { key: 'al23', label: 'Alertness [2.3]', rows: [
    { label: 'ohne RT',   rawKey: 'al23_ohne_rt',  unit: 'ms', prKey: 'alertness23_ohne' },
    { label: 'mit RT',    rawKey: 'al23_mit_rt',   unit: 'ms', prKey: 'alertness23_mit'  },
    { label: 'phasisch',  rawKey: 'al23_phasisch', unit: '',   prKey: 'alertness23'       },
  ]},
  { key: 'gn',   label: 'Go/Nogo 1', rows: [
    { label: 'RT',        rawKey: 'gn_rt',         unit: 'ms', prKey: 'gonogo'        },
    { label: 'Fehler',    rawKey: 'gn_fehler',      unit: '',   prKey: 'gn_fehler_pr'  },
    { label: 'Ausl.',     rawKey: 'gn_ausl',        unit: '',   prKey: 'gn_ausl_pr'   },
  ]},
  { key: 'gn2',  label: 'Go/Nogo 2', rows: [
    { label: 'RT',        rawKey: 'gn2_rt',        unit: 'ms', prKey: 'gonogo2'        },
    { label: 'Fehler',    rawKey: 'gn2_fehler',     unit: '',   prKey: 'gn2_fehler_pr'  },
  ]},
  { key: 'fl',   label: 'Flexibilität', rows: [
    { label: 'RT',        rawKey: 'fl_rt',         unit: 'ms', prKey: 'flexibilitaet'  },
    { label: 'Fehler',    rawKey: 'fl_fehler',      unit: '',   prKey: 'fl_fehler_pr'   },
  ]},
  { key: 'ga',   label: 'Get. Aufmerksamkeit', rows: [
    { label: 'RT aud.',   rawKey: 'ga_rt',         unit: 'ms', prKey: 'geteilte'        },
    { label: 'RT vis.',   rawKey: 'gv_rt',         unit: 'ms', prKey: 'geteilteVisuell' },
    { label: 'Fehler',    rawKey: 'g_fehler',       unit: '',   prKey: 'g_fehler_pr'    },
  ]},
  { key: 'vig',  label: 'Vigilanz', rows: [
    { label: 'RT',        rawKey: 'vig_rt',        unit: 'ms', prKey: 'vigilanz'       },
    { label: 'Fehler',    rawKey: 'vig_fehler',     unit: '',   prKey: 'vig_fehler_pr'  },
  ]},
  { key: 'ag',   label: 'Arbeitsgedächtnis', rows: [
    { label: 'RT',        rawKey: 'ag_rt',         unit: 'ms', prKey: 'arbeitsgedaechtnis' },
    { label: 'Fehler',    rawKey: 'ag_fehler',      unit: '',   prKey: 'ag_fehler_pr'       },
  ]},
  { key: 've',   label: 'Vis. Scanning', rows: [
    { label: 'RT krit.',  rawKey: 've_rt_krit',    unit: 'ms', prKey: 've_rt_krit_pr'  },
    { label: 'RT n-krit.',rawKey: 've_rt_nkrit',   unit: 'ms', prKey: 've_rt_nkrit_pr' },
    { label: 'Fehler',    rawKey: 've_fehler',      unit: '',   prKey: 've_fehler_pr'   },
  ]},
  { key: 'neg',  label: 'Neglect', rows: [
    { label: 'RT links',  rawKey: 'neg_rt_l',      unit: 'ms', prKey: 'neg_pr' },
    { label: 'RT rechts', rawKey: 'neg_rt_r',      unit: 'ms', prKey: ''       },
  ]},
];

// ── Main component ─────────────────────────────────────────────────────────────

interface TAPTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (r: TestResult) => void;
  onUpdate: (r: TestResult) => void;
  onDelete: (id: string) => void;
}

export const TAPTab: React.FC<TAPTabProps> = ({
  patient, previousResults, onSave, onUpdate, onDelete,
}) => {
  const { currentUser } = useAuth();
  const [col, setCol] = useState<ColData>(() => emptyCol(currentUser ?? ''));
  const [saved, setSaved] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [nichtErschienen, setNichtErschienen] = useState(false);
  const [nichtErschienienTest, setNichtErschienienTest] = useState('');
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  // Hover-Highlight für die Sonder-Sektionen mit rowSpan-Layout (Gesichtsfeld, Neglect):
  // damit beim Überfahren die gesamte Gruppe einheitlich hervorgehoben wird.
  const [hoverGf, setHoverGf] = useState(false);
  const [hoverNeg, setHoverNeg] = useState(false);
  // Welches Auge gerade im Gesichtsfeld-Block bearbeitet wird — reine Anzeige-
  // Auswahl, unabhängig von den (je Auge separat gespeicherten) Werten selbst.
  const [gfEyeTab, setGfEyeTab] = useState<'LA' | 'RA' | 'BA'>('BA');

  const tapResults = previousResults
    .filter(r => r.testId === 'tap')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  useEffect(() => {
    if (tapResults.length > 0) {
      setCol(decodeResult(tapResults[0]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleNote = (key: string) =>
    setOpenNotes(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const upd = (f: Partial<SF>) => setCol(prev => ({ ...prev, f: { ...prev.f, ...f } }));
  const setAborted = (v: boolean) => setCol(prev => ({ ...prev, aborted: v, abortComment: v ? prev.abortComment : '' }));
  const setAbortComment = (v: string) => setCol(prev => ({ ...prev, abortComment: v }));

  const today = new Date().toISOString().split('T')[0];

  const handleSave = () => {
    const id = col.id ?? Date.now().toString();
    const result = encodeCol({ ...col, id, date: today });

    if (col.id) {
      onUpdate(result);
    } else {
      onSave(result);
      setCol(prev => ({ ...prev, id }));
    }

    // Collect anonymous norm data
    if (patient.geburtsdatum) {
      const birth = new Date(patient.geburtsdatum);
      const testDate = new Date(today);
      let age = testDate.getFullYear() - birth.getFullYear();
      const m = testDate.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && testDate.getDate() < birth.getDate())) age--;
      addTapNormEntries(buildNormEntriesFromSF(age, col.f as unknown as Record<string, string>));
    }

    if (nichtErschienen && patient.neuropsychologin && currentUser && patient.neuropsychologin !== currentUser) {
      const gebDatum = patient.geburtsdatum
        ? new Date(patient.geburtsdatum).toLocaleDateString('de-DE')
        : '?';
      const testPart = nichtErschienienTest ? ` (${nichtErschienienTest})` : '';
      const msg = `Patient „${patient.name} – Geb.-Datum: ${gebDatum}" ist nicht erschienen zur TAP-Messung${testPart}. (Automatisch gesendet durch ${currentUser})`;
      addNotification(currentUser, patient.neuropsychologin, msg, patient.name, true);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  useShortcutSave(handleSave);
  const containerRef = useAutoFocusFirst<HTMLDivElement>();

  const f = col.f;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3" ref={containerRef}>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-slate-800 dark:bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
          <Zap size={16} className="text-white dark:text-slate-900" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">TAP</h2>
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Testbatterie zur Aufmerksamkeitsprüfung · 2.3 &amp; TAP-M
            {tapResults.length > 0 && ` · ${tapResults.length} Messung${tapResults.length !== 1 ? 'en' : ''}`}
          </p>
        </div>
      </div>

      {/* Control bar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 flex flex-col gap-3">
        {/* Diagnostik-Schwerpunkt */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium shrink-0">Diagnostik-Schwerpunkt</span>
          {(
            [
              { key: 'wiedereingliederung', label: 'Berufliche Wiedereingliederung' },
              { key: 'neglect',             label: 'Gesichtsfeld / Visueller Neglect' },
              { key: 'anderer',             label: 'Anderer' },
            ] as { key: DiagnostikSchwerpunkt; label: string }[]
          ).map(opt => (
            <button
              key={opt.key}
              type="button"
              tabIndex={-1}
              onClick={() => setCol(prev => ({ ...prev, schwerpunkt: opt.key }))}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all',
                col.schwerpunkt === opt.key
                  ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800 dark:border-slate-100'
                  : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-400',
              )}
            >{opt.label}</button>
          ))}
          {col.schwerpunkt === 'anderer' && (
            <input
              type="text"
              tabIndex={-1}
              value={col.schwerpunktAnderer}
              onChange={e => setCol(prev => ({ ...prev, schwerpunktAnderer: e.target.value }))}
              placeholder="Schwerpunkt beschreiben…"
              className="text-[11px] px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-1 focus:ring-slate-400 text-slate-700 dark:text-slate-200 w-52"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Untersucher</span>
          <input
            type="text"
            tabIndex={-1}
            value={col.examiner}
            onChange={e => {
              const v = e.target.value;
              setCol({ ...col, examiner: v.replace(/\b\w/g, c => c.toUpperCase()) });
            }}
            placeholder="Name"
            className="text-[11px] px-2 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-1 focus:ring-slate-400 text-slate-700 dark:text-slate-200 w-28"
          />
        </div>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { setNichtErschienen(prev => !prev); if (nichtErschienen) setNichtErschienienTest(''); }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all border select-none',
            nichtErschienen
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-500 dark:text-rose-400'
              : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-rose-200 dark:hover:border-rose-800 hover:text-rose-400',
          )}
        >
          Nicht erschienen
        </button>
        {nichtErschienen && (
          <select
            tabIndex={-1}
            value={nichtErschienienTest}
            onChange={e => setNichtErschienienTest(e.target.value)}
            className="text-[10px] px-1.5 py-1.5 bg-slate-50 dark:bg-slate-700 border border-rose-300 dark:border-rose-700 rounded-lg outline-none focus:ring-1 focus:ring-rose-400 text-slate-700 dark:text-slate-200"
          >
            <option value="">— Test (optional) —</option>
            <option>Alertness (TAP-M)</option>
            <option>Alertness (TAP 2.3)</option>
            <option>Go/Nogo 1</option>
            <option>Go/Nogo 2</option>
            <option>Flexibilität</option>
            <option>Geteilte Aufmerksamkeit</option>
            <option>Vigilanz</option>
            <option>Arbeitsgedächtnis</option>
            <option>Visuelles Scanning</option>
            <option>Gesichtsfeld</option>
            <option>Neglect</option>
          </select>
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setAborted(!col.aborted)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all border select-none',
            col.aborted
              ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-500 dark:text-orange-400'
              : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-orange-200 dark:hover:border-orange-800 hover:text-orange-400',
          )}
        >
          <OctagonX size={12} /> Test abgebrochen / unvollständig
        </button>
        {col.aborted && (
          <input
            type="text"
            tabIndex={-1}
            value={col.abortComment}
            onChange={e => setAbortComment(e.target.value)}
            placeholder="Grund (optional)…"
            className="text-[10px] px-2 py-1.5 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg outline-none focus:ring-1 focus:ring-orange-400 text-slate-700 dark:text-slate-200 placeholder:text-orange-300 w-48"
          />
        )}
        <button
          tabIndex={-1}
          onClick={handleSave}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all ml-auto',
            saved
              ? 'bg-emerald-500 text-white'
              : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white',
          )}
        >
          {saved ? <><CheckCircle2 size={13} /> Gespeichert</> : <><Save size={13} /> Speichern</>}
        </button>
        </div>{/* end inner row */}
      </div>

      {/* ══ MAIN TABLE — PDF-Structure: Eingang | Abschluss ══ */}
      <div className="flex gap-3 items-start">
      <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th rowSpan={2} className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-b border-r border-slate-200 dark:border-slate-700 w-44">
                Testverfahren
              </th>
              <th rowSpan={2} className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-b border-r border-slate-200 dark:border-slate-700 w-36">
                Kennwert
              </th>
              <th colSpan={3} className="px-3 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border-b border-r border-slate-200 dark:border-slate-700">
                Eingangstestung
              </th>
              <th colSpan={3} className="px-3 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                Abschlusstestung
              </th>
              <th rowSpan={2} className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-b border-l border-slate-200 dark:border-slate-700 w-16" />
            </tr>
            <tr>
              <th className="px-2 py-1.5 text-center text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 w-[120px]">Datum</th>
              <th className="px-1.5 py-1.5 text-center text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">Testwert</th>
              <th className="px-1.5 py-1.5 text-center text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-b border-r border-slate-200 dark:border-slate-700">PR</th>
              <th className="px-2 py-1.5 text-center text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 w-[120px]">Datum</th>
              <th className="px-1.5 py-1.5 text-center text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">Testwert</th>
              <th className="px-1.5 py-1.5 text-center text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">PR</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">

            {/* ══ ALERTNESS ══ */}
            <SectionHeader label="Alertness" />

            {/* Alertness [M] */}
            <TestGroupRows
              testLabel="Alertness" badge="M"
              flagged={f.flag_alM} onFlag={() => upd({ flag_alM: !f.flag_alM })}
              noteValue={f.note_alM} onNoteChange={v => upd({ note_alM: v })}
              noteOpen={openNotes.has('alM')} onToggleNote={() => toggleNote('alM')}
              eDate={f.e_date_alM} onEDate={v => upd({ e_date_alM: v })}
              aDate={f.b_date_alM} onADate={v => upd({ b_date_alM: v })}
              onReset={() => upd({
                e_date_alM: today, b_date_alM: today,
                alM_rt: '', alM_sd: '', alM_pr: '', alM_sd_pr: '',
                b_alM_rt: '', b_alM_sd: '', b_alM_pr: '', b_alM_sd_pr: '',
              })}
              rows={[
                {
                  label: 'Reaktionszeit',
                  eVal: f.alM_rt, onEVal: v => upd({ alM_rt: v }),
                  ePr: f.alM_pr, onEPr: v => upd({ alM_pr: v }),
                  aVal: f.b_alM_rt, onAVal: v => upd({ b_alM_rt: v }),
                  aPr: f.b_alM_pr, onAPr: v => upd({ b_alM_pr: v }),
                  prefix: 'M=', unit: 'ms', tapM: true,
                },
                {
                  label: 'Standardabweichung',
                  eVal: f.alM_sd, onEVal: v => upd({ alM_sd: v }),
                  ePr: f.alM_sd_pr, onEPr: v => upd({ alM_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_alM_sd, onAVal: v => upd({ b_alM_sd: v }),
                  aPr: f.b_alM_sd_pr, onAPr: v => upd({ b_alM_sd_pr: v }),
                  prefix: 's=', unit: 'ms', tapM: true,
                },
              ]}
            />

            {/* Alertness [2.3] */}
            <TestGroupRows
              testLabel="Alertness" badge="2.3"
              flagged={f.flag_al23} onFlag={() => upd({ flag_al23: !f.flag_al23 })}
              noteValue={f.note_al23} onNoteChange={v => upd({ note_al23: v })}
              noteOpen={openNotes.has('al23')} onToggleNote={() => toggleNote('al23')}
              eDate={f.e_date_al23} onEDate={v => upd({ e_date_al23: v })}
              aDate={f.b_date_al23} onADate={v => upd({ b_date_al23: v })}
              onReset={() => upd({
                e_date_al23: today, b_date_al23: today,
                al23_ohne_rt: '', al23_ohne_sd: '', al23_ohne_pr: '', al23_ohne_sd_pr: '',
                al23_mit_rt: '', al23_mit_sd: '', al23_mit_pr: '', al23_mit_sd_pr: '',
                al23_phasisch: '', al23_pr: '',
                b_al23_ohne_rt: '', b_al23_ohne_sd: '', b_al23_ohne_pr: '', b_al23_ohne_sd_pr: '',
                b_al23_mit_rt: '', b_al23_mit_sd: '', b_al23_mit_pr: '', b_al23_mit_sd_pr: '',
                b_al23_phasisch: '', b_al23_pr: '',
              })}
              rows={[
                {
                  label: 'ohne Warnton – Reaktionszeit',
                  eVal: f.al23_ohne_rt, onEVal: v => upd({ al23_ohne_rt: v }),
                  ePr: f.al23_ohne_pr, onEPr: v => upd({ al23_ohne_pr: v }),
                  aVal: f.b_al23_ohne_rt, onAVal: v => upd({ b_al23_ohne_rt: v }),
                  aPr: f.b_al23_ohne_pr, onAPr: v => upd({ b_al23_ohne_pr: v }),
                  prefix: 'M=', unit: 'ms',
                },
                {
                  label: 'ohne Warnton – Standardabw.',
                  eVal: f.al23_ohne_sd, onEVal: v => upd({ al23_ohne_sd: v }),
                  ePr: f.al23_ohne_sd_pr, onEPr: v => upd({ al23_ohne_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_al23_ohne_sd, onAVal: v => upd({ b_al23_ohne_sd: v }),
                  aPr: f.b_al23_ohne_sd_pr, onAPr: v => upd({ b_al23_ohne_sd_pr: v }),
                  prefix: 's=', unit: 'ms',
                },
                {
                  label: 'mit Warnton – Reaktionszeit',
                  eVal: f.al23_mit_rt, onEVal: v => upd({ al23_mit_rt: v }),
                  ePr: f.al23_mit_pr, onEPr: v => upd({ al23_mit_pr: v }),
                  aVal: f.b_al23_mit_rt, onAVal: v => upd({ b_al23_mit_rt: v }),
                  aPr: f.b_al23_mit_pr, onAPr: v => upd({ b_al23_mit_pr: v }),
                  prefix: 'M=', unit: 'ms',
                },
                {
                  label: 'mit Warnton – Standardabw.',
                  eVal: f.al23_mit_sd, onEVal: v => upd({ al23_mit_sd: v }),
                  ePr: f.al23_mit_sd_pr, onEPr: v => upd({ al23_mit_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_al23_mit_sd, onAVal: v => upd({ b_al23_mit_sd: v }),
                  aPr: f.b_al23_mit_sd_pr, onAPr: v => upd({ b_al23_mit_sd_pr: v }),
                  prefix: 's=', unit: 'ms',
                },
                {
                  label: 'phasischer Kennwert',
                  eVal: f.al23_phasisch, onEVal: v => upd({ al23_phasisch: v }),
                  ePr: f.al23_pr, onEPr: v => upd({ al23_pr: v }),
                  aVal: f.b_al23_phasisch, onAVal: v => upd({ b_al23_phasisch: v }),
                  aPr: f.b_al23_pr, onAPr: v => upd({ b_al23_pr: v }),
                },
              ]}
            />

            {/* ══ SELEKTIVE AUFMERKSAMKEIT ══ */}
            <SectionHeader label="Selektive Aufmerksamkeit" />

            {/* Go/Nogo 1 */}
            <TestGroupRows
              testLabel="Go/Nogo 1"
              verToggle={<VerToggle value={f.gn_ver} onChange={v => upd({ gn_ver: v })} />}
              flagged={f.flag_gn} onFlag={() => upd({ flag_gn: !f.flag_gn })}
              noteValue={f.note_gn} onNoteChange={v => upd({ note_gn: v })}
              noteOpen={openNotes.has('gn')} onToggleNote={() => toggleNote('gn')}
              eDate={f.e_date_gn} onEDate={v => upd({ e_date_gn: v })}
              aDate={f.b_date_gn} onADate={v => upd({ b_date_gn: v })}
              onReset={() => upd({
                e_date_gn: today, b_date_gn: today,
                gn_rt: '', gn_sd: '', gn_fehler: '', gn_ausl: '', gn_pr: '', gn_sd_pr: '', gn_fehler_pr: '', gn_ausl_pr: '',
                b_gn_rt: '', b_gn_sd: '', b_gn_fehler: '', b_gn_ausl: '', b_gn_pr: '', b_gn_sd_pr: '', b_gn_fehler_pr: '', b_gn_ausl_pr: '',
              })}
              rows={[
                {
                  label: 'Reaktionszeit',
                  eVal: f.gn_rt, onEVal: v => upd({ gn_rt: v }),
                  ePr: f.gn_pr, onEPr: v => upd({ gn_pr: v }),
                  aVal: f.b_gn_rt, onAVal: v => upd({ b_gn_rt: v }),
                  aPr: f.b_gn_pr, onAPr: v => upd({ b_gn_pr: v }),
                  prefix: 'M=', unit: 'ms', tapM: f.gn_ver === 'M',
                },
                {
                  label: 'Standardabweichung',
                  eVal: f.gn_sd, onEVal: v => upd({ gn_sd: v }),
                  ePr: f.gn_sd_pr, onEPr: v => upd({ gn_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_gn_sd, onAVal: v => upd({ b_gn_sd: v }),
                  aPr: f.b_gn_sd_pr, onAPr: v => upd({ b_gn_sd_pr: v }),
                  prefix: 's=', unit: 'ms', tapM: f.gn_ver === 'M',
                },
                {
                  label: 'Fehleraktionen',
                  eVal: f.gn_fehler, onEVal: v => upd({ gn_fehler: v }),
                  ePr: f.gn_fehler_pr, onEPr: v => upd({ gn_fehler_pr: v }), ePrPh: 'PR-F',
                  aVal: f.b_gn_fehler, onAVal: v => upd({ b_gn_fehler: v }),
                  aPr: f.b_gn_fehler_pr, onAPr: v => upd({ b_gn_fehler_pr: v }),
                  tapM: f.gn_ver === 'M',
                },
                {
                  label: 'Auslassungen',
                  eVal: f.gn_ausl, onEVal: v => upd({ gn_ausl: v }),
                  ePr: f.gn_ausl_pr, onEPr: v => upd({ gn_ausl_pr: v }), ePrPh: 'PR-A',
                  aVal: f.b_gn_ausl, onAVal: v => upd({ b_gn_ausl: v }),
                  aPr: f.b_gn_ausl_pr, onAPr: v => upd({ b_gn_ausl_pr: v }),
                  tapM: f.gn_ver === 'M',
                },
              ]}
            />

            {/* Go/Nogo 2 */}
            <TestGroupRows
              testLabel="Go/Nogo 2" badge="2.3"
              flagged={f.flag_gn2} onFlag={() => upd({ flag_gn2: !f.flag_gn2 })}
              noteValue={f.note_gn2} onNoteChange={v => upd({ note_gn2: v })}
              noteOpen={openNotes.has('gn2')} onToggleNote={() => toggleNote('gn2')}
              eDate={f.e_date_gn2} onEDate={v => upd({ e_date_gn2: v })}
              aDate={f.b_date_gn2} onADate={v => upd({ b_date_gn2: v })}
              onReset={() => upd({
                e_date_gn2: today, b_date_gn2: today,
                gn2_rt: '', gn2_sd: '', gn2_fehler: '', gn2_ausl: '', gn2_pr: '', gn2_sd_pr: '', gn2_fehler_pr: '', gn2_ausl_pr: '',
                b_gn2_rt: '', b_gn2_sd: '', b_gn2_fehler: '', b_gn2_ausl: '', b_gn2_pr: '', b_gn2_sd_pr: '', b_gn2_fehler_pr: '', b_gn2_ausl_pr: '',
              })}
              rows={[
                {
                  label: 'Reaktionszeit',
                  eVal: f.gn2_rt, onEVal: v => upd({ gn2_rt: v }),
                  ePr: f.gn2_pr, onEPr: v => upd({ gn2_pr: v }),
                  aVal: f.b_gn2_rt, onAVal: v => upd({ b_gn2_rt: v }),
                  aPr: f.b_gn2_pr, onAPr: v => upd({ b_gn2_pr: v }),
                  prefix: 'M=', unit: 'ms',
                },
                {
                  label: 'Standardabweichung',
                  eVal: f.gn2_sd, onEVal: v => upd({ gn2_sd: v }),
                  ePr: f.gn2_sd_pr, onEPr: v => upd({ gn2_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_gn2_sd, onAVal: v => upd({ b_gn2_sd: v }),
                  aPr: f.b_gn2_sd_pr, onAPr: v => upd({ b_gn2_sd_pr: v }),
                  prefix: 's=', unit: 'ms',
                },
                {
                  label: 'Fehleraktionen',
                  eVal: f.gn2_fehler, onEVal: v => upd({ gn2_fehler: v }),
                  ePr: f.gn2_fehler_pr, onEPr: v => upd({ gn2_fehler_pr: v }), ePrPh: 'PR-F',
                  aVal: f.b_gn2_fehler, onAVal: v => upd({ b_gn2_fehler: v }),
                  aPr: f.b_gn2_fehler_pr, onAPr: v => upd({ b_gn2_fehler_pr: v }),
                },
                {
                  label: 'Auslassungen',
                  eVal: f.gn2_ausl, onEVal: v => upd({ gn2_ausl: v }),
                  ePr: f.gn2_ausl_pr, onEPr: v => upd({ gn2_ausl_pr: v }), ePrPh: 'PR-A',
                  aVal: f.b_gn2_ausl, onAVal: v => upd({ b_gn2_ausl: v }),
                  aPr: f.b_gn2_ausl_pr, onAPr: v => upd({ b_gn2_ausl_pr: v }),
                },
              ]}
            />

            {/* Flexibilität */}
            <TestGroupRows
              testLabel="Flexibilität"
              verToggle={<VerToggle value={f.fl_ver} onChange={v => upd({ fl_ver: v })} />}
              flagged={f.flag_fl} onFlag={() => upd({ flag_fl: !f.flag_fl })}
              noteValue={f.note_fl} onNoteChange={v => upd({ note_fl: v })}
              noteOpen={openNotes.has('fl')} onToggleNote={() => toggleNote('fl')}
              eDate={f.e_date_fl} onEDate={v => upd({ e_date_fl: v })}
              aDate={f.b_date_fl} onADate={v => upd({ b_date_fl: v })}
              onReset={() => upd({
                e_date_fl: today, b_date_fl: today,
                fl_rt: '', fl_sd: '', fl_fehler: '', fl_pr: '', fl_sd_pr: '', fl_fehler_pr: '',
                b_fl_rt: '', b_fl_sd: '', b_fl_fehler: '', b_fl_pr: '', b_fl_sd_pr: '', b_fl_fehler_pr: '',
              })}
              rows={[
                {
                  label: 'Reaktionszeit',
                  eVal: f.fl_rt, onEVal: v => upd({ fl_rt: v }),
                  ePr: f.fl_pr, onEPr: v => upd({ fl_pr: v }),
                  aVal: f.b_fl_rt, onAVal: v => upd({ b_fl_rt: v }),
                  aPr: f.b_fl_pr, onAPr: v => upd({ b_fl_pr: v }),
                  prefix: 'M=', unit: 'ms', tapM: f.fl_ver === 'M',
                },
                {
                  label: 'Standardabweichung',
                  eVal: f.fl_sd, onEVal: v => upd({ fl_sd: v }),
                  ePr: f.fl_sd_pr, onEPr: v => upd({ fl_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_fl_sd, onAVal: v => upd({ b_fl_sd: v }),
                  aPr: f.b_fl_sd_pr, onAPr: v => upd({ b_fl_sd_pr: v }),
                  prefix: 's=', unit: 'ms', tapM: f.fl_ver === 'M',
                },
                {
                  label: 'Fehleraktionen',
                  eVal: f.fl_fehler, onEVal: v => upd({ fl_fehler: v }),
                  ePr: f.fl_fehler_pr, onEPr: v => upd({ fl_fehler_pr: v }), ePrPh: 'PR-F',
                  aVal: f.b_fl_fehler, onAVal: v => upd({ b_fl_fehler: v }),
                  aPr: f.b_fl_fehler_pr, onAPr: v => upd({ b_fl_fehler_pr: v }),
                  tapM: f.fl_ver === 'M',
                },
              ]}
            />

            {/* ══ GETEILTE AUFMERKSAMKEIT ══ */}
            <SectionHeader label="Geteilte Aufmerksamkeit" />

            <TestGroupRows
              testLabel="Get. Aufmerksamkeit"
              verToggle={<VerToggle value={f.ga_ver} onChange={v => upd({ ga_ver: v })} />}
              flagged={f.flag_ga} onFlag={() => upd({ flag_ga: !f.flag_ga })}
              noteValue={f.note_ga} onNoteChange={v => upd({ note_ga: v })}
              noteOpen={openNotes.has('ga')} onToggleNote={() => toggleNote('ga')}
              eDate={f.e_date_ga} onEDate={v => upd({ e_date_ga: v })}
              aDate={f.b_date_ga} onADate={v => upd({ b_date_ga: v })}
              onReset={() => upd({
                e_date_ga: today, b_date_ga: today,
                ga_rt: '', ga_sd: '', gv_rt: '', gv_sd: '',
                g_fehler: '', g_ausl_ges: '', ga_pr: '', gv_pr: '',
                ga_sd_pr: '', gv_sd_pr: '', g_fehler_pr: '', g_ausl_ges_pr: '',
                b_ga_rt: '', b_ga_sd: '', b_gv_rt: '', b_gv_sd: '',
                b_g_fehler: '', b_g_ausl_ges: '', b_ga_pr: '', b_gv_pr: '',
                b_ga_sd_pr: '', b_gv_sd_pr: '', b_g_fehler_pr: '', b_g_ausl_ges_pr: '',
              })}
              rows={[
                {
                  label: 'Reaktionszeit auditiv',
                  eVal: f.ga_rt, onEVal: v => upd({ ga_rt: v }),
                  ePr: f.ga_pr, onEPr: v => upd({ ga_pr: v }),
                  aVal: f.b_ga_rt, onAVal: v => upd({ b_ga_rt: v }),
                  aPr: f.b_ga_pr, onAPr: v => upd({ b_ga_pr: v }),
                  prefix: 'M=', unit: 'ms', tapM: f.ga_ver === 'M',
                },
                {
                  label: 'Standardabw. auditiv',
                  eVal: f.ga_sd, onEVal: v => upd({ ga_sd: v }),
                  ePr: f.ga_sd_pr, onEPr: v => upd({ ga_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_ga_sd, onAVal: v => upd({ b_ga_sd: v }),
                  aPr: f.b_ga_sd_pr, onAPr: v => upd({ b_ga_sd_pr: v }),
                  prefix: 's=', unit: 'ms', tapM: f.ga_ver === 'M',
                },
                {
                  label: 'Reaktionszeit visuell',
                  eVal: f.gv_rt, onEVal: v => upd({ gv_rt: v }),
                  ePr: f.gv_pr, onEPr: v => upd({ gv_pr: v }),
                  aVal: f.b_gv_rt, onAVal: v => upd({ b_gv_rt: v }),
                  aPr: f.b_gv_pr, onAPr: v => upd({ b_gv_pr: v }),
                  prefix: 'M=', unit: 'ms', tapM: f.ga_ver === 'M',
                },
                {
                  label: 'Standardabw. visuell',
                  eVal: f.gv_sd, onEVal: v => upd({ gv_sd: v }),
                  ePr: f.gv_sd_pr, onEPr: v => upd({ gv_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_gv_sd, onAVal: v => upd({ b_gv_sd: v }),
                  aPr: f.b_gv_sd_pr, onAPr: v => upd({ b_gv_sd_pr: v }),
                  prefix: 's=', unit: 'ms', tapM: f.ga_ver === 'M',
                },
                {
                  label: 'Fehleraktionen',
                  eVal: f.g_fehler, onEVal: v => upd({ g_fehler: v }),
                  ePr: f.g_fehler_pr, onEPr: v => upd({ g_fehler_pr: v }), ePrPh: 'PR-F',
                  aVal: f.b_g_fehler, onAVal: v => upd({ b_g_fehler: v }),
                  aPr: f.b_g_fehler_pr, onAPr: v => upd({ b_g_fehler_pr: v }),
                  tapM: f.ga_ver === 'M',
                },
                {
                  label: 'Auslassungen insgesamt',
                  eVal: f.g_ausl_ges, onEVal: v => upd({ g_ausl_ges: v }),
                  ePr: f.g_ausl_ges_pr, onEPr: v => upd({ g_ausl_ges_pr: v }), ePrPh: 'PR-A',
                  aVal: f.b_g_ausl_ges, onAVal: v => upd({ b_g_ausl_ges: v }),
                  aPr: f.b_g_ausl_ges_pr, onAPr: v => upd({ b_g_ausl_ges_pr: v }),
                  tapM: f.ga_ver === 'M',
                },
              ]}
            />

            {/* ══ VIGILANZ ══ */}
            <SectionHeader label="Vigilanz" />

            <TestGroupRows
              testLabel="Vigilanz" badge="2.3"
              flagged={f.flag_vig} onFlag={() => upd({ flag_vig: !f.flag_vig })}
              noteValue={f.note_vig} onNoteChange={v => upd({ note_vig: v })}
              noteOpen={openNotes.has('vig')} onToggleNote={() => toggleNote('vig')}
              eDate={f.e_date_vig} onEDate={v => upd({ e_date_vig: v })}
              aDate={f.b_date_vig} onADate={v => upd({ b_date_vig: v })}
              onReset={() => upd({
                e_date_vig: today, b_date_vig: today,
                vig_rt: '', vig_sd: '', vig_fehler: '', vig_ausl: '', vig_pr: '', vig_sd_pr: '', vig_fehler_pr: '', vig_ausl_pr: '',
                b_vig_rt: '', b_vig_sd: '', b_vig_fehler: '', b_vig_ausl: '', b_vig_pr: '', b_vig_sd_pr: '', b_vig_fehler_pr: '', b_vig_ausl_pr: '',
              })}
              rows={[
                {
                  label: 'Reaktionszeit',
                  eVal: f.vig_rt, onEVal: v => upd({ vig_rt: v }),
                  ePr: f.vig_pr, onEPr: v => upd({ vig_pr: v }),
                  aVal: f.b_vig_rt, onAVal: v => upd({ b_vig_rt: v }),
                  aPr: f.b_vig_pr, onAPr: v => upd({ b_vig_pr: v }),
                  prefix: 'M=', unit: 'ms',
                },
                {
                  label: 'Standardabweichung',
                  eVal: f.vig_sd, onEVal: v => upd({ vig_sd: v }),
                  ePr: f.vig_sd_pr, onEPr: v => upd({ vig_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_vig_sd, onAVal: v => upd({ b_vig_sd: v }),
                  aPr: f.b_vig_sd_pr, onAPr: v => upd({ b_vig_sd_pr: v }),
                  prefix: 's=', unit: 'ms',
                },
                {
                  label: 'Fehleraktionen',
                  eVal: f.vig_fehler, onEVal: v => upd({ vig_fehler: v }),
                  ePr: f.vig_fehler_pr, onEPr: v => upd({ vig_fehler_pr: v }), ePrPh: 'PR-F',
                  aVal: f.b_vig_fehler, onAVal: v => upd({ b_vig_fehler: v }),
                  aPr: f.b_vig_fehler_pr, onAPr: v => upd({ b_vig_fehler_pr: v }),
                },
                {
                  label: 'Auslassungen',
                  eVal: f.vig_ausl, onEVal: v => upd({ vig_ausl: v }),
                  ePr: f.vig_ausl_pr, onEPr: v => upd({ vig_ausl_pr: v }), ePrPh: 'PR-A',
                  aVal: f.b_vig_ausl, onAVal: v => upd({ b_vig_ausl: v }),
                  aPr: f.b_vig_ausl_pr, onAPr: v => upd({ b_vig_ausl_pr: v }),
                },
              ]}
            />

            {/* ══ ARBEITSGEDÄCHTNIS ══ */}
            <SectionHeader label="Arbeitsgedächtnis" />

            <TestGroupRows
              testLabel="Arbeitsgedächtnis" badge="2.3"
              flagged={f.flag_ag} onFlag={() => upd({ flag_ag: !f.flag_ag })}
              noteValue={f.note_ag} onNoteChange={v => upd({ note_ag: v })}
              noteOpen={openNotes.has('ag')} onToggleNote={() => toggleNote('ag')}
              eDate={f.e_date_ag} onEDate={v => upd({ e_date_ag: v })}
              aDate={f.b_date_ag} onADate={v => upd({ b_date_ag: v })}
              onReset={() => upd({
                e_date_ag: today, b_date_ag: today,
                ag_rt: '', ag_sd: '', ag_fehler: '', ag_ausl: '', ag_pr: '', ag_sd_pr: '', ag_fehler_pr: '', ag_ausl_pr: '',
                b_ag_rt: '', b_ag_sd: '', b_ag_fehler: '', b_ag_ausl: '', b_ag_pr: '', b_ag_sd_pr: '', b_ag_fehler_pr: '', b_ag_ausl_pr: '',
              })}
              rows={[
                {
                  label: 'Reaktionszeit',
                  eVal: f.ag_rt, onEVal: v => upd({ ag_rt: v }),
                  ePr: f.ag_pr, onEPr: v => upd({ ag_pr: v }),
                  aVal: f.b_ag_rt, onAVal: v => upd({ b_ag_rt: v }),
                  aPr: f.b_ag_pr, onAPr: v => upd({ b_ag_pr: v }),
                  prefix: 'M=', unit: 'ms',
                },
                {
                  label: 'Standardabweichung',
                  eVal: f.ag_sd, onEVal: v => upd({ ag_sd: v }),
                  ePr: f.ag_sd_pr, onEPr: v => upd({ ag_sd_pr: v }), ePrPh: 'PR-SD',
                  aVal: f.b_ag_sd, onAVal: v => upd({ b_ag_sd: v }),
                  aPr: f.b_ag_sd_pr, onAPr: v => upd({ b_ag_sd_pr: v }),
                  prefix: 's=', unit: 'ms',
                },
                {
                  label: 'Fehleraktionen',
                  eVal: f.ag_fehler, onEVal: v => upd({ ag_fehler: v }),
                  ePr: f.ag_fehler_pr, onEPr: v => upd({ ag_fehler_pr: v }), ePrPh: 'PR-F',
                  aVal: f.b_ag_fehler, onAVal: v => upd({ b_ag_fehler: v }),
                  aPr: f.b_ag_fehler_pr, onAPr: v => upd({ b_ag_fehler_pr: v }),
                },
                {
                  label: 'Auslassungen',
                  eVal: f.ag_ausl, onEVal: v => upd({ ag_ausl: v }),
                  ePr: f.ag_ausl_pr, onEPr: v => upd({ ag_ausl_pr: v }), ePrPh: 'PR-A',
                  aVal: f.b_ag_ausl, onAVal: v => upd({ b_ag_ausl: v }),
                  aPr: f.b_ag_ausl_pr, onAPr: v => upd({ b_ag_ausl_pr: v }),
                },
              ]}
            />

            {/* ══ VISUELLES SCANNING ══ */}
            <SectionHeader label="Visuelles Scanning" />

            <TestGroupRows
              testLabel="Visuelles Scanning"
              verToggle={<VerToggle value={f.ve_ver} onChange={v => upd({ ve_ver: v })} />}
              flagged={f.flag_ve} onFlag={() => upd({ flag_ve: !f.flag_ve })}
              noteValue={f.note_ve} onNoteChange={v => upd({ note_ve: v })}
              noteOpen={openNotes.has('ve')} onToggleNote={() => toggleNote('ve')}
              eDate={f.e_date_ve} onEDate={v => upd({ e_date_ve: v })}
              aDate={f.b_date_ve} onADate={v => upd({ b_date_ve: v })}
              onReset={() => upd({
                e_date_ve: today, b_date_ve: today,
                ve_rt_krit: '', ve_sd_krit: '', ve_pr_krit: '', ve_sd_pr_krit: '',
                ve_rt_nkrit: '', ve_sd_nkrit: '', ve_pr_nkrit: '', ve_sd_pr_nkrit: '',
                ve_fehler: '', ve_pr_fehler: '', ve_ausl_krit: '', ve_pr_ausl: '',
                ve_zeilen_r: '', ve_pr_zeilen: '', ve_spalten_r: '', ve_pr_spalten: '',
                b_ve_rt_krit: '', b_ve_sd_krit: '', b_ve_pr_krit: '', b_ve_sd_pr_krit: '',
                b_ve_rt_nkrit: '', b_ve_sd_nkrit: '', b_ve_pr_nkrit: '', b_ve_sd_pr_nkrit: '',
                b_ve_fehler: '', b_ve_pr_fehler: '', b_ve_ausl_krit: '', b_ve_pr_ausl: '',
                b_ve_zeilen_r: '', b_ve_pr_zeilen: '', b_ve_spalten_r: '', b_ve_pr_spalten: '',
              })}
              rows={[
                {
                  label: 'RT kritisch',
                  eVal: f.ve_rt_krit, onEVal: v => upd({ ve_rt_krit: v }),
                  ePr: f.ve_pr_krit, onEPr: v => upd({ ve_pr_krit: v }),
                  aVal: f.b_ve_rt_krit, onAVal: v => upd({ b_ve_rt_krit: v }),
                  aPr: f.b_ve_pr_krit, onAPr: v => upd({ b_ve_pr_krit: v }),
                  prefix: 'M=', unit: 'ms', tapM: f.ve_ver === 'M',
                },
                {
                  label: 'SD kritisch',
                  eVal: f.ve_sd_krit, onEVal: v => upd({ ve_sd_krit: v }),
                  ePr: f.ve_sd_pr_krit, onEPr: v => upd({ ve_sd_pr_krit: v }), ePrPh: 'PR-SD',
                  aVal: f.b_ve_sd_krit, onAVal: v => upd({ b_ve_sd_krit: v }),
                  aPr: f.b_ve_sd_pr_krit, onAPr: v => upd({ b_ve_sd_pr_krit: v }),
                  prefix: 's=', unit: 'ms', tapM: f.ve_ver === 'M',
                },
                {
                  label: 'RT nicht-kritisch',
                  eVal: f.ve_rt_nkrit, onEVal: v => upd({ ve_rt_nkrit: v }),
                  ePr: f.ve_pr_nkrit, onEPr: v => upd({ ve_pr_nkrit: v }),
                  aVal: f.b_ve_rt_nkrit, onAVal: v => upd({ b_ve_rt_nkrit: v }),
                  aPr: f.b_ve_pr_nkrit, onAPr: v => upd({ b_ve_pr_nkrit: v }),
                  prefix: 'M=', unit: 'ms', tapM: f.ve_ver === 'M',
                },
                {
                  label: 'SD nicht-kritisch',
                  eVal: f.ve_sd_nkrit, onEVal: v => upd({ ve_sd_nkrit: v }),
                  ePr: f.ve_sd_pr_nkrit, onEPr: v => upd({ ve_sd_pr_nkrit: v }), ePrPh: 'PR-SD',
                  aVal: f.b_ve_sd_nkrit, onAVal: v => upd({ b_ve_sd_nkrit: v }),
                  aPr: f.b_ve_sd_pr_nkrit, onAPr: v => upd({ b_ve_sd_pr_nkrit: v }),
                  prefix: 's=', unit: 'ms', tapM: f.ve_ver === 'M',
                },
                {
                  label: 'Fehleraktionen',
                  eVal: f.ve_fehler, onEVal: v => upd({ ve_fehler: v }),
                  ePr: f.ve_pr_fehler, onEPr: v => upd({ ve_pr_fehler: v }), ePrPh: 'PR-F',
                  aVal: f.b_ve_fehler, onAVal: v => upd({ b_ve_fehler: v }),
                  aPr: f.b_ve_pr_fehler, onAPr: v => upd({ b_ve_pr_fehler: v }),
                  tapM: f.ve_ver === 'M',
                },
                {
                  label: 'Auslassungen (kritisch)',
                  eVal: f.ve_ausl_krit, onEVal: v => upd({ ve_ausl_krit: v }),
                  ePr: f.ve_pr_ausl, onEPr: v => upd({ ve_pr_ausl: v }), ePrPh: 'PR-A',
                  aVal: f.b_ve_ausl_krit, onAVal: v => upd({ b_ve_ausl_krit: v }),
                  aPr: f.b_ve_pr_ausl, onAPr: v => upd({ b_ve_pr_ausl: v }),
                  tapM: f.ve_ver === 'M',
                },
                {
                  label: 'Zeilen r',
                  eVal: f.ve_zeilen_r, onEVal: v => upd({ ve_zeilen_r: v }),
                  ePr: f.ve_pr_zeilen, onEPr: v => upd({ ve_pr_zeilen: v }), ePrPh: 'PR-Z',
                  aVal: f.b_ve_zeilen_r, onAVal: v => upd({ b_ve_zeilen_r: v }),
                  aPr: f.b_ve_pr_zeilen, onAPr: v => upd({ b_ve_pr_zeilen: v }),
                  tapM: f.ve_ver === 'M',
                },
                {
                  label: 'Spalten r',
                  eVal: f.ve_spalten_r, onEVal: v => upd({ ve_spalten_r: v }),
                  ePr: f.ve_pr_spalten, onEPr: v => upd({ ve_pr_spalten: v }), ePrPh: 'PR-S',
                  aVal: f.b_ve_spalten_r, onAVal: v => upd({ b_ve_spalten_r: v }),
                  aPr: f.b_ve_pr_spalten, onAPr: v => upd({ b_ve_pr_spalten: v }),
                  tapM: f.ve_ver === 'M',
                },
              ]}
            />

            {/* ══ GESICHTSFELD & NEGLECT ══ */}
            <SectionHeader label="Gesichtsfeld & Neglect" />

            {/* Gesichtsfeld — special because of QuadGrid (inline rows) */}
            {(() => {
              const gfBdr = f.flag_gf
                ? 'border-orange-100 dark:border-orange-900/40'
                : 'border-slate-100 dark:border-slate-700/40';
              const gfBg = f.flag_gf
                ? 'bg-orange-50/50 dark:bg-orange-950/10'
                : hoverGf ? 'bg-slate-50/50 dark:bg-slate-700/15' : '';
              // Je Auge unabhängige Slots (LA/RA/BA) — der EyeToggle wählt nur, welcher
              // Slot gerade im Formular sichtbar/editierbar ist; Werte anderer Augen
              // bleiben beim Umschalten unangetastet (behebt das Überschreiben-Problem).
              type GfSuffix = 'rt_l' | 'rt_r' | 'mq' | 'aq' | 'ausl' | 'pr';
              const gfKey = (bp: '' | 'b_', suf: GfSuffix) => `${bp}gf_${gfEyeTab}_${suf}` as keyof SF;
              const gfVal = (bp: '' | 'b_', suf: GfSuffix) => f[gfKey(bp, suf)] as string;
              const gfUpd = (bp: '' | 'b_', suf: GfSuffix, v: string) => upd({ [gfKey(bp, suf)]: v } as Partial<SF>);
              const gfDateKey = (bp: 'e_' | 'b_') => `${bp}date_gf_${gfEyeTab}` as keyof SF;
              const gfDateVal = (bp: 'e_' | 'b_') => f[gfDateKey(bp)] as string;
              const gfNoteKey = () => `note_gf_${gfEyeTab}` as keyof SF;
              const gfNoteVal = () => f[gfNoteKey()] as string;
              const EYES = ['LA', 'RA', 'BA'] as const;
              const hasGfData = EYES.some(eye => f[`gf_${eye}_rt_l` as keyof SF] || f[`gf_${eye}_rt_r` as keyof SF] || f[`gf_${eye}_ausl` as keyof SF]);
              const hasGfNote = EYES.some(eye => !!(f[`note_gf_${eye}` as keyof SF] as string)?.trim());
              const gfNoteOpen = openNotes.has('gf');
              return (
                <>
                  {/* Row 1: RT links — holds rowspan cells */}
                  <tr onMouseEnter={() => setHoverGf(true)} onMouseLeave={() => setHoverGf(false)} className={cn('transition-colors', gfBg)}>
                    <td rowSpan={4} className={cn('px-3 py-2 align-top border-r', gfBdr)}>
                      <div className="flex flex-col gap-1.5 pt-0.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={cn('text-[11px] font-semibold whitespace-nowrap',
                            f.flag_gf ? 'text-orange-700 dark:text-orange-300' : 'text-slate-700 dark:text-slate-200',
                          )}>
                            Gesichtsfeld
                          </span>
                          <span className="text-[8px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 leading-none shrink-0 font-medium">
                            2.3
                          </span>
                          {hasGfData && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500 shrink-0" title="Werte eingetragen" />
                          )}
                        </div>
                        <EyeToggle value={gfEyeTab} onChange={setGfEyeTab} />
                      </div>
                    </td>
                    <td className={cn('px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-middle', gfBdr)}>
                      RT links
                    </td>
                    <td rowSpan={4} className={cn('px-2 py-2 align-top border-r', gfBdr)}>
                      <DateInput value={gfDateVal('e_')} onChange={v => upd({ [gfDateKey('e_')]: v } as Partial<SF>)} />
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={gfVal('', 'rt_l')} onChange={v => gfUpd('', 'rt_l', v)} prefix="M=" unit="ms" />
                    </td>
                    <td className={cn('px-1 py-1.5 align-middle border-r', gfBdr)}><Dash /></td>
                    <td rowSpan={4} className={cn('px-2 py-2 align-top border-r', gfBdr)}>
                      <DateInput value={gfDateVal('b_')} onChange={v => upd({ [gfDateKey('b_')]: v } as Partial<SF>)} />
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={gfVal('b_', 'rt_l')} onChange={v => gfUpd('b_', 'rt_l', v)} prefix="M=" unit="ms" />
                    </td>
                    <td className="px-1 py-1.5 align-middle"><Dash /></td>
                    <td rowSpan={4} className="pl-2 pr-3 py-1.5 align-top border-l border-slate-100 dark:border-slate-700/40">
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleNote('gf')}
                          title="Anmerkung"
                          className={cn(
                            'p-1.5 rounded-lg border transition-colors shrink-0',
                            gfNoteOpen || hasGfNote
                              ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
                              : 'bg-white dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:border-amber-200',
                          )}
                        >
                          <StickyNote size={12} />
                        </button>
                        <FlagBtn flagged={f.flag_gf} onClick={() => upd({ flag_gf: !f.flag_gf })} />
                        <button
                          type="button"
                          onClick={() => upd({
                            [gfDateKey('e_')]: today, [gfDateKey('b_')]: today,
                            [gfKey('', 'rt_l')]: '', [gfKey('', 'rt_r')]: '', [gfKey('', 'mq')]: '', [gfKey('', 'aq')]: '', [gfKey('', 'ausl')]: '', [gfKey('', 'pr')]: '',
                            [gfKey('b_', 'rt_l')]: '', [gfKey('b_', 'rt_r')]: '', [gfKey('b_', 'mq')]: '', [gfKey('b_', 'aq')]: '', [gfKey('b_', 'ausl')]: '', [gfKey('b_', 'pr')]: '',
                          } as Partial<SF>)}
                          title={`Felder leeren (${EYE_LABEL_SHORT[gfEyeTab]})`}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/60 transition-colors text-slate-400 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-200 dark:hover:border-rose-800/50 shrink-0"
                        >
                          <RotateCcw size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Row 2: RT rechts */}
                  <tr onMouseEnter={() => setHoverGf(true)} onMouseLeave={() => setHoverGf(false)} className={cn('transition-colors', gfBg)}>
                    <td className={cn('px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-middle', gfBdr)}>
                      RT rechts
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={gfVal('', 'rt_r')} onChange={v => gfUpd('', 'rt_r', v)} prefix="M=" unit="ms" />
                    </td>
                    <td className={cn('px-1 py-1.5 align-middle border-r', gfBdr)}><Dash /></td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={gfVal('b_', 'rt_r')} onChange={v => gfUpd('b_', 'rt_r', v)} prefix="M=" unit="ms" />
                    </td>
                    <td className="px-1 py-1.5 align-middle"><Dash /></td>
                  </tr>
                  {/* Row 3: Quadranten */}
                  <tr onMouseEnter={() => setHoverGf(true)} onMouseLeave={() => setHoverGf(false)} className={cn('transition-colors', gfBg)}>
                    <td className={cn('px-3 py-2 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-top', gfBdr)}>
                      Quadranten
                    </td>
                    <td colSpan={2} className={cn('px-2 py-2 align-top border-r', gfBdr)}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 shrink-0">MQ</span>
                          <QuadGrid value={decodeQuad(gfVal('', 'mq'))} onChange={q => gfUpd('', 'mq', encodeQuad(q))} shape="cross" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 shrink-0">AQ</span>
                          <QuadGrid value={decodeQuad(gfVal('', 'aq'))} onChange={q => gfUpd('', 'aq', encodeQuad(q))} shape="circle" />
                        </div>
                      </div>
                    </td>
                    <td colSpan={2} className="px-2 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 shrink-0">MQ</span>
                          <QuadGrid value={decodeQuad(gfVal('b_', 'mq'))} onChange={q => gfUpd('b_', 'mq', encodeQuad(q))} shape="cross" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 shrink-0">AQ</span>
                          <QuadGrid value={decodeQuad(gfVal('b_', 'aq'))} onChange={q => gfUpd('b_', 'aq', encodeQuad(q))} shape="circle" />
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* Row 4: Auslassungen */}
                  <tr onMouseEnter={() => setHoverGf(true)} onMouseLeave={() => setHoverGf(false)} className={cn('transition-colors', gfBg)}>
                    <td className={cn('px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-middle', gfBdr)}>
                      Auslassungen
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={gfVal('', 'ausl')} onChange={v => gfUpd('', 'ausl', v)} />
                    </td>
                    <td className={cn('px-1 py-1.5 align-middle border-r', gfBdr)}><Dash /></td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={gfVal('b_', 'ausl')} onChange={v => gfUpd('b_', 'ausl', v)} />
                    </td>
                    <td className="px-1 py-1.5 align-middle"><Dash /></td>
                  </tr>
                  {/* Gesichtsfeld note row — je Auge (LA/RA/BA) getrennt */}
                  {gfNoteOpen && (
                    <tr className="bg-amber-50/40 dark:bg-amber-950/10">
                      <td colSpan={9} className="px-3 pb-2 pt-0.5">
                        <div className="flex items-start gap-1.5">
                          <textarea
                            value={gfNoteVal()}
                            onChange={e => upd({ [gfNoteKey()]: e.target.value } as Partial<SF>)}
                            placeholder={`Anmerkung (${EYE_LABEL_SHORT[gfEyeTab]})…`}
                            rows={1}
                            autoFocus
                            className="flex-1 text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5 resize-none outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed overflow-hidden transition-colors"
                            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }}
                          />
                          <button type="button" onClick={() => toggleNote('gf')} className="mt-1.5 p-1 rounded text-slate-300 hover:text-slate-500 transition-colors">
                            <X size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })()}

            {/* Neglect — special because of QuadGrid + overall PR */}
            {(() => {
              const negBdr = f.flag_neg
                ? 'border-orange-100 dark:border-orange-900/40'
                : 'border-slate-100 dark:border-slate-700/40';
              const negBg = f.flag_neg
                ? 'bg-orange-50/50 dark:bg-orange-950/10'
                : hoverNeg ? 'bg-slate-50/50 dark:bg-slate-700/15' : '';
              const hasNegData = f.neg_rt_l || f.neg_rt_r || f.neg_ausl || f.neg_pr;
              const hasNegNote = !!(f.note_neg?.trim());
              const negNoteOpen = openNotes.has('neg');
              return (
                <>
                  {/* Row 1: RT links */}
                  <tr onMouseEnter={() => setHoverNeg(true)} onMouseLeave={() => setHoverNeg(false)} className={cn('transition-colors', negBg)}>
                    <td rowSpan={4} className={cn('px-3 py-2 align-top border-r', negBdr)}>
                      <div className="flex flex-col gap-1.5 pt-0.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={cn('text-[11px] font-semibold whitespace-nowrap',
                            f.flag_neg ? 'text-orange-700 dark:text-orange-300' : 'text-slate-700 dark:text-slate-200',
                          )}>
                            Neglect
                          </span>
                          <span className="text-[8px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 leading-none shrink-0 font-medium">
                            2.3
                          </span>
                          {hasNegData && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500 shrink-0" title="Werte eingetragen" />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={cn('px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-middle', negBdr)}>
                      RT links
                    </td>
                    <td rowSpan={4} className={cn('px-2 py-2 align-top border-r', negBdr)}>
                      <DateInput value={f.e_date_neg} onChange={v => upd({ e_date_neg: v })} />
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={f.neg_rt_l} onChange={v => upd({ neg_rt_l: v })} prefix="M=" unit="ms" />
                    </td>
                    <td className={cn('px-1 py-1.5 align-middle border-r', negBdr)}><Dash /></td>
                    <td rowSpan={4} className={cn('px-2 py-2 align-top border-r', negBdr)}>
                      <DateInput value={f.b_date_neg} onChange={v => upd({ b_date_neg: v })} />
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={f.b_neg_rt_l} onChange={v => upd({ b_neg_rt_l: v })} prefix="M=" unit="ms" />
                    </td>
                    <td className="px-1 py-1.5 align-middle"><Dash /></td>
                    <td rowSpan={4} className="pl-2 pr-3 py-1.5 align-top border-l border-slate-100 dark:border-slate-700/40">
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleNote('neg')}
                          title="Anmerkung"
                          className={cn(
                            'p-1.5 rounded-lg border transition-colors shrink-0',
                            negNoteOpen || hasNegNote
                              ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
                              : 'bg-white dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:border-amber-200',
                          )}
                        >
                          <StickyNote size={12} />
                        </button>
                        <FlagBtn flagged={f.flag_neg} onClick={() => upd({ flag_neg: !f.flag_neg })} />
                        <button
                          type="button"
                          onClick={() => upd({
                            e_date_neg: today, b_date_neg: today,
                            neg_rt_l: '', neg_rt_r: '', neg_mq: '', neg_aq: '', neg_ausl: '', neg_pr: '',
                            b_neg_rt_l: '', b_neg_rt_r: '', b_neg_mq: '', b_neg_aq: '', b_neg_ausl: '', b_neg_pr: '',
                          })}
                          title="Felder leeren"
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/60 transition-colors text-slate-400 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-200 dark:hover:border-rose-800/50 shrink-0"
                        >
                          <RotateCcw size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Row 2: RT rechts */}
                  <tr onMouseEnter={() => setHoverNeg(true)} onMouseLeave={() => setHoverNeg(false)} className={cn('transition-colors', negBg)}>
                    <td className={cn('px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-middle', negBdr)}>
                      RT rechts
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={f.neg_rt_r} onChange={v => upd({ neg_rt_r: v })} prefix="M=" unit="ms" />
                    </td>
                    <td className={cn('px-1 py-1.5 align-middle border-r', negBdr)}><Dash /></td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={f.b_neg_rt_r} onChange={v => upd({ b_neg_rt_r: v })} prefix="M=" unit="ms" />
                    </td>
                    <td className="px-1 py-1.5 align-middle"><Dash /></td>
                  </tr>
                  {/* Row 3: Quadranten */}
                  <tr onMouseEnter={() => setHoverNeg(true)} onMouseLeave={() => setHoverNeg(false)} className={cn('transition-colors', negBg)}>
                    <td className={cn('px-3 py-2 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-top', negBdr)}>
                      Quadranten
                    </td>
                    <td colSpan={2} className={cn('px-2 py-2 align-top border-r', negBdr)}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 shrink-0">MQ</span>
                          <QuadGrid value={decodeQuad(f.neg_mq)} onChange={q => upd({ neg_mq: encodeQuad(q) })} shape="cross" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 shrink-0">AQ</span>
                          <QuadGrid value={decodeQuad(f.neg_aq)} onChange={q => upd({ neg_aq: encodeQuad(q) })} shape="circle" />
                        </div>
                      </div>
                    </td>
                    <td colSpan={2} className="px-2 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 shrink-0">MQ</span>
                          <QuadGrid value={decodeQuad(f.b_neg_mq)} onChange={q => upd({ b_neg_mq: encodeQuad(q) })} shape="cross" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 shrink-0">AQ</span>
                          <QuadGrid value={decodeQuad(f.b_neg_aq)} onChange={q => upd({ b_neg_aq: encodeQuad(q) })} shape="circle" />
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* Row 4: Auslassungen + Gesamt-PR */}
                  <tr onMouseEnter={() => setHoverNeg(true)} onMouseLeave={() => setHoverNeg(false)} className={cn('transition-colors', negBg)}>
                    <td className={cn('px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-r align-middle', negBdr)}>
                      Auslassungen
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={f.neg_ausl} onChange={v => upd({ neg_ausl: v })} />
                    </td>
                    <td className={cn('px-1 py-1.5 align-middle border-r', negBdr)}>
                      <PR value={f.neg_pr} onChange={v => upd({ neg_pr: v })} placeholder="PR" />
                    </td>
                    <td className="px-1.5 py-1.5 align-middle">
                      <Val value={f.b_neg_ausl} onChange={v => upd({ b_neg_ausl: v })} />
                    </td>
                    <td className="px-1 py-1.5 align-middle">
                      <PR value={f.b_neg_pr} onChange={v => upd({ b_neg_pr: v })} />
                    </td>
                  </tr>
                  {/* Neglect note row */}
                  {negNoteOpen && (
                    <tr className="bg-amber-50/40 dark:bg-amber-950/10">
                      <td colSpan={9} className="px-3 pb-2 pt-0.5">
                        <div className="flex items-start gap-1.5">
                          <textarea
                            value={f.note_neg}
                            onChange={e => upd({ note_neg: e.target.value })}
                            placeholder="Anmerkung…"
                            rows={1}
                            autoFocus
                            className="flex-1 text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5 resize-none outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed overflow-hidden transition-colors"
                            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }}
                          />
                          <button type="button" onClick={() => toggleNote('neg')} className="mt-1.5 p-1 rounded text-slate-300 hover:text-slate-500 transition-colors">
                            <X size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })()}

          </tbody>
        </table>
      </div>{/* end table card */}

      {/* ── PENDING TESTS CARD (right column) ── */}
      {(() => {
        const wied = col.schwerpunkt === 'wiedereingliederung';
        const neg  = col.schwerpunkt === 'neglect';
        if (!wied && !neg) return null;

        const alertnessDone = !!(
          f.alM_rt || f.alM_pr || f.alM_sd || f.alM_sd_pr ||
          f.al23_ohne_rt || f.al23_ohne_pr || f.al23_ohne_sd || f.al23_ohne_sd_pr ||
          f.al23_mit_rt || f.al23_mit_pr || f.al23_phasisch || f.al23_pr
        );
        const gonogoDone = !!(
          f.gn_rt || f.gn_pr || f.gn_sd || f.gn_sd_pr || f.gn_fehler || f.gn_fehler_pr || f.gn_ausl || f.gn_ausl_pr ||
          f.gn2_rt || f.gn2_pr || f.gn2_sd || f.gn2_sd_pr || f.gn2_fehler || f.gn2_fehler_pr
        );
        const flexDone = !!(f.fl_rt || f.fl_pr || f.fl_sd || f.fl_sd_pr || f.fl_fehler || f.fl_fehler_pr);
        const gaDone = !!(
          f.ga_rt || f.ga_pr || f.ga_sd || f.ga_sd_pr ||
          f.gv_rt || f.gv_pr || f.gv_sd || f.gv_sd_pr ||
          f.g_fehler || f.g_fehler_pr || f.g_ausl_ges || f.g_ausl_ges_pr
        );
        const scanningDone = !!(
          f.ve_rt_krit || f.ve_pr_krit || f.ve_sd_krit || f.ve_sd_pr_krit ||
          f.ve_rt_nkrit || f.ve_pr_nkrit || f.ve_fehler || f.ve_pr_fehler ||
          f.ve_ausl_krit || f.ve_pr_ausl || f.ve_zeilen_r || f.ve_pr_zeilen || f.ve_spalten_r || f.ve_pr_spalten
        );
        const gfDone = !!(
          f.gf_LA_rt_l || f.gf_LA_rt_r || f.gf_LA_pr || f.gf_LA_mq || f.gf_LA_aq || f.gf_LA_ausl ||
          f.gf_RA_rt_l || f.gf_RA_rt_r || f.gf_RA_pr || f.gf_RA_mq || f.gf_RA_aq || f.gf_RA_ausl ||
          f.gf_BA_rt_l || f.gf_BA_rt_r || f.gf_BA_pr || f.gf_BA_mq || f.gf_BA_aq || f.gf_BA_ausl
        );
        const neglectDone = !!(f.neg_rt_l || f.neg_rt_r || f.neg_pr || f.neg_mq || f.neg_aq || f.neg_ausl);

        const isBelowThr = (pr: string, tapM: boolean): boolean => {
          const t = pr.trim(); if (!t) return false;
          const n = prToRepresentativeNum(t);
          return !isNaN(n) && n < (tapM ? 31 : 15.87);
        };
        const anyBelow = (prs: { pr: string; tapM: boolean }[]): boolean =>
          prs.some(({ pr, tapM }) => isBelowThr(pr, tapM));

        const gnM = f.gn_ver === 'M', flM = f.fl_ver === 'M', gaM = f.ga_ver === 'M', veM = f.ve_ver === 'M';

        const alertnessWarning = alertnessDone && (f.flag_alM || f.flag_al23 || anyBelow([
          { pr: f.alM_pr, tapM: true }, { pr: f.b_alM_pr, tapM: true },
          { pr: f.alM_sd_pr, tapM: true }, { pr: f.b_alM_sd_pr, tapM: true },
          { pr: f.al23_ohne_pr, tapM: false }, { pr: f.b_al23_ohne_pr, tapM: false },
          { pr: f.al23_ohne_sd_pr, tapM: false }, { pr: f.b_al23_ohne_sd_pr, tapM: false },
          { pr: f.al23_mit_pr, tapM: false }, { pr: f.b_al23_mit_pr, tapM: false },
          { pr: f.al23_mit_sd_pr, tapM: false }, { pr: f.b_al23_mit_sd_pr, tapM: false },
          { pr: f.al23_pr, tapM: false }, { pr: f.b_al23_pr, tapM: false },
        ]));
        const gonogoWarning = gonogoDone && (f.flag_gn || f.flag_gn2 || anyBelow([
          { pr: f.gn_pr, tapM: gnM }, { pr: f.b_gn_pr, tapM: gnM },
          { pr: f.gn_sd_pr, tapM: gnM }, { pr: f.b_gn_sd_pr, tapM: gnM },
          { pr: f.gn_fehler_pr, tapM: gnM }, { pr: f.b_gn_fehler_pr, tapM: gnM },
          { pr: f.gn_ausl_pr, tapM: gnM }, { pr: f.b_gn_ausl_pr, tapM: gnM },
          { pr: f.gn2_pr, tapM: false }, { pr: f.b_gn2_pr, tapM: false },
          { pr: f.gn2_sd_pr, tapM: false }, { pr: f.b_gn2_sd_pr, tapM: false },
          { pr: f.gn2_fehler_pr, tapM: false }, { pr: f.b_gn2_fehler_pr, tapM: false },
          { pr: f.gn2_ausl_pr, tapM: false }, { pr: f.b_gn2_ausl_pr, tapM: false },
        ]));
        const flexWarning = flexDone && (f.flag_fl || anyBelow([
          { pr: f.fl_pr, tapM: flM }, { pr: f.b_fl_pr, tapM: flM },
          { pr: f.fl_sd_pr, tapM: flM }, { pr: f.b_fl_sd_pr, tapM: flM },
          { pr: f.fl_fehler_pr, tapM: flM }, { pr: f.b_fl_fehler_pr, tapM: flM },
        ]));
        const gaWarning = gaDone && (f.flag_ga || anyBelow([
          { pr: f.ga_pr, tapM: gaM }, { pr: f.b_ga_pr, tapM: gaM },
          { pr: f.ga_sd_pr, tapM: gaM }, { pr: f.b_ga_sd_pr, tapM: gaM },
          { pr: f.gv_pr, tapM: gaM }, { pr: f.b_gv_pr, tapM: gaM },
          { pr: f.gv_sd_pr, tapM: gaM }, { pr: f.b_gv_sd_pr, tapM: gaM },
          { pr: f.g_fehler_pr, tapM: gaM }, { pr: f.b_g_fehler_pr, tapM: gaM },
          { pr: f.g_ausl_ges_pr, tapM: gaM }, { pr: f.b_g_ausl_ges_pr, tapM: gaM },
        ]));
        const scanningWarning = scanningDone && (f.flag_ve || anyBelow([
          { pr: f.ve_pr_krit, tapM: veM }, { pr: f.b_ve_pr_krit, tapM: veM },
          { pr: f.ve_sd_pr_krit, tapM: veM }, { pr: f.b_ve_sd_pr_krit, tapM: veM },
          { pr: f.ve_pr_nkrit, tapM: veM }, { pr: f.b_ve_pr_nkrit, tapM: veM },
          { pr: f.ve_sd_pr_nkrit, tapM: veM }, { pr: f.b_ve_sd_pr_nkrit, tapM: veM },
          { pr: f.ve_pr_fehler, tapM: veM }, { pr: f.b_ve_pr_fehler, tapM: veM },
          { pr: f.ve_pr_ausl, tapM: veM }, { pr: f.b_ve_pr_ausl, tapM: veM },
          { pr: f.ve_pr_zeilen, tapM: veM }, { pr: f.b_ve_pr_zeilen, tapM: veM },
          { pr: f.ve_pr_spalten, tapM: veM }, { pr: f.b_ve_pr_spalten, tapM: veM },
        ]));
        const gfWarning = gfDone && (f.flag_gf || anyBelow([
          { pr: f.gf_LA_pr, tapM: false }, { pr: f.b_gf_LA_pr, tapM: false },
          { pr: f.gf_RA_pr, tapM: false }, { pr: f.b_gf_RA_pr, tapM: false },
          { pr: f.gf_BA_pr, tapM: false }, { pr: f.b_gf_BA_pr, tapM: false },
        ]));
        const neglectWarning = neglectDone && (f.flag_neg || anyBelow([
          { pr: f.neg_pr, tapM: false }, { pr: f.b_neg_pr, tapM: false },
        ]));

        const coveredByRequired = wied
          ? ['alM', 'al23', 'gn', 'gn2', 'fl', 'ga', 've']
          : ['gf', 'neg'];
        const extraFlagged = [
          { key: 'alM',  label: 'Alertness M',         flag: f.flag_alM  },
          { key: 'al23', label: 'Alertness 2.3',        flag: f.flag_al23 },
          { key: 'gn',   label: 'Go/Nogo 1',           flag: f.flag_gn   },
          { key: 'gn2',  label: 'Go/Nogo 2',           flag: f.flag_gn2  },
          { key: 'fl',   label: 'Flexibilität',         flag: f.flag_fl   },
          { key: 'ga',   label: 'Get. Aufmerksamkeit',  flag: f.flag_ga   },
          { key: 'vig',  label: 'Vigilanz',             flag: f.flag_vig  },
          { key: 'ag',   label: 'Arbeitsgedächtnis',    flag: f.flag_ag   },
          { key: 've',   label: 'Vis. Scanning',        flag: f.flag_ve   },
          { key: 'gf',   label: 'Gesichtsfeld',         flag: f.flag_gf   },
          { key: 'neg',  label: 'Neglect',              flag: f.flag_neg  },
        ].filter(t => t.flag && !coveredByRequired.includes(t.key));

        const required = [
          ...(wied
            ? [
                { label: 'Alertness (1×)',          done: alertnessDone, warning: alertnessWarning },
                { label: 'Go/Nogo',                 done: gonogoDone,    warning: gonogoWarning },
                { label: 'Flexibilität',            done: flexDone,      warning: flexWarning },
                { label: 'Geteilte Aufmerksamkeit', done: gaDone,        warning: gaWarning },
                { label: 'Visuelles Scanning',      done: scanningDone,  warning: scanningWarning },
              ]
            : [
                { label: 'Gesichtsfeld',            done: gfDone,        warning: gfWarning },
                { label: 'Neglect',                 done: neglectDone,   warning: neglectWarning },
              ]),
          ...extraFlagged.map(t => ({ label: t.label, done: true, warning: true })),
        ];

        const doneCount = required.filter(r => r.done).length;
        const total = required.length;
        const hasWarnings = required.some(r => r.warning);

        return (
          <div className="w-52 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-3 self-start sticky top-3">
            <div className="flex items-center gap-1.5 mb-2">
              <ClipboardList size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                Ausstehend
              </span>
              <span className={cn(
                'ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full',
                doneCount === total && !hasWarnings
                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600'
                  : doneCount === total && hasWarnings
                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500',
              )}>
                {doneCount}/{total}
              </span>
            </div>
            <div className="space-y-1">
              {required.map(r => (
                <div key={r.label} className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] transition-colors',
                  r.done && !r.warning
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
                    : r.done && r.warning
                    ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400',
                )}>
                  <span className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center',
                    r.done && !r.warning
                      ? 'bg-emerald-400 dark:bg-emerald-500 border-emerald-400'
                      : r.done && r.warning
                      ? 'bg-amber-400 dark:bg-amber-500 border-amber-400'
                      : 'border-slate-300 dark:border-slate-600',
                  )}>
                    {r.done && !r.warning && <Check size={8} className="text-white" strokeWidth={3} />}
                    {r.done && r.warning && <span className="text-white text-[7px] font-black leading-none">!</span>}
                  </span>
                  <span className="font-medium flex-1">{r.label}</span>
                  {r.done && r.warning && (
                    <span className="text-[8px] font-bold text-amber-500 dark:text-amber-400 shrink-0">↓PR</span>
                  )}
                </div>
              ))}
            </div>
            {doneCount === total && (
              <p className={cn(
                'mt-2 text-[9px] text-center font-semibold',
                hasWarnings
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400',
              )}>
                {hasWarnings ? 'Auffällige Werte — Verlauf prüfen' : 'Alle Pflicht-Tests erhoben ✓'}
              </p>
            )}
          </div>
        );
      })()}

      </div>{/* end flex layout */}

      {/* ── HISTORY ── */}
      {tapResults.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <History size={14} className="text-slate-400 dark:text-slate-500" />
            <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">Verlauf</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {tapResults.length} Messung{tapResults.length !== 1 ? 'en' : ''}
            </span>
          </div>
          <div className="space-y-4">
            {tapResults.map((res, idx) => {
              const rv = res.rawValues ?? {};
              const pr = res.percentileRanks ?? {};

              const activeBlocks = HIST_BLOCKS.filter(b =>
                b.rows.some(r => {
                  const raw = String(rv[r.rawKey] ?? '').trim();
                  const prv = r.prKey ? String(pr[r.prKey] ?? '').trim() : '';
                  return (raw !== '' && raw !== '0') || (prv !== '' && prv !== '0');
                }),
              );

              return (
                <div key={res.id} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  {/* Card header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                    {idx === 0 && (
                      <span className="text-[9px] font-semibold text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                        aktuell
                      </span>
                    )}
                    <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                      <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                    </span>
                    {res.examiner && (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 capitalize">
                        {res.examiner}
                      </span>
                    )}
                    {res.aborted && <AbortBadge comment={res.abortComment} />}
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      {confirmDeleteId === res.id ? (
                        <>
                          <button
                            onClick={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                            className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                            title="Löschen bestätigen"
                          ><Check size={12} /></button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                          ><X size={12} /></button>
                        </>
                      ) : (
                        patient.status !== 'entlassen' && (
                          <button
                            onClick={() => setConfirmDeleteId(res.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                            title="Löschen"
                          ><Trash2 size={12} /></button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Domain blocks */}
                  {activeBlocks.length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-slate-400 italic">Keine Werte eingetragen.</p>
                  ) : (
                    <div className="flex flex-wrap gap-0 divide-x divide-slate-100 dark:divide-slate-700">
                      {activeBlocks.map(block => (
                        <div key={block.key} className="px-3 py-2 min-w-[130px]">
                          <div className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                            {block.label}
                          </div>
                          <div className="space-y-1">
                            {block.rows.map(row => {
                              const rawVal = String(rv[row.rawKey] ?? '').trim();
                              const prVal  = row.prKey ? String(pr[row.prKey] ?? '').trim() : '';
                              if (!rawVal && !prVal) return null;
                              const prCls = prVal ? prColorCls(prVal, (row as { tapM?: boolean }).tapM) : '';
                              return (
                                <div key={row.label} className="flex items-center gap-1.5 text-[10px]">
                                  <span className="text-slate-400 dark:text-slate-500 w-16 shrink-0">{row.label}</span>
                                  {rawVal && (
                                    <span className="font-mono text-slate-700 dark:text-slate-200 shrink-0">
                                      {rawVal}{row.unit ? <span className="text-slate-400 text-[8px] ml-0.5">{row.unit}</span> : null}
                                    </span>
                                  )}
                                  {prVal && (
                                    <span className={cn(
                                      'text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0',
                                      prCls || 'bg-slate-50 dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400',
                                    )}>
                                      PR {prVal}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
