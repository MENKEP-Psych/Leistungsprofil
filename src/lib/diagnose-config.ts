export const DIAGNOSE_OPTIONEN = [
  'Schlaganfall / Apoplex',
  'SAB / Subarachnoidalblutung',
  'Schädel-Hirn-Trauma',
  'Multiple Sklerose',
  'Epilepsie',
  'Hirntumor',
  'Demenz / MCI',
  'Parkinson-Syndrom',
  'Hypoxischer Hirnschaden',
  'Enzephalitis',
  'Post-Covid Syndrom',
  'Andere',
] as const;

export type DiagnoseOption = typeof DIAGNOSE_OPTIONEN[number];

export interface LokalisationGroup {
  label: string;
  options: string[];
}

/** Maps each diagnosis to its contextual localisation button groups.
 *  Diagnoses not listed here have no localisation (Parkinson already included below). */
export const LOKALISATION_CONFIG: Partial<Record<DiagnoseOption, LokalisationGroup[]>> = {
  'Schlaganfall / Apoplex': [
    {
      label: 'Gefäß / Region',
      options: [
        'A. cerebri media',
        'A. cerebri anterior',
        'A. cerebri posterior',
        'A. basilaris',
        'Kleinhirn / PICA',
        'Stammhirn',
        'Lakunär',
        'Großterritoriell',
      ],
    },
    {
      label: 'Seite',
      options: ['Links', 'Rechts', 'Bilateral'],
    },
  ],
  'SAB / Subarachnoidalblutung': [
    {
      label: 'Aneurysma-Lokalisation',
      options: [
        'A. communicans anterior',
        'A. communicans posterior',
        'A. cerebri media',
        'A. cerebri anterior',
        'A. basilaris / vertebrobasilär',
        'A. carotis interna',
        'Perimesenzephal (nicht-aneurysmatisch)',
        'Unbekannt',
      ],
    },
    {
      label: 'Seite',
      options: ['Links', 'Rechts', 'Median', 'Bilateral'],
    },
    {
      label: 'Genese',
      options: ['Traumatisch', 'Atraumatisch'],
    },
    {
      label: 'Verlauf',
      options: ['Akut', 'Chronisch'],
    },
  ],
  'Schädel-Hirn-Trauma': [
    {
      label: 'Region',
      options: ['Frontal', 'Temporal', 'Parietal', 'Okzipital', 'Diffus axonal', 'Multilokulär'],
    },
    {
      label: 'Seite',
      options: ['Links', 'Rechts', 'Bilateral'],
    },
  ],
  'Hirntumor': [
    {
      label: 'Region',
      options: [
        'Frontal',
        'Temporal',
        'Parietal',
        'Okzipital',
        'Zerebellär',
        'Stammhirn',
        'Thalamus / Basalganglien',
      ],
    },
    {
      label: 'Seite',
      options: ['Links', 'Rechts', 'Bilateral / Median'],
    },
  ],
  'Epilepsie': [
    {
      label: 'Anfallsform',
      options: [
        'Fokal bewusst',
        'Fokal mit Bewusstseinsstörung',
        'Fokal zu bilateral tonisch-klonisch',
        'Generalisiert',
        'Unklassifiziert',
      ],
    },
    {
      label: 'Fokus / Lappen',
      options: ['Temporal', 'Frontal', 'Parietal', 'Okzipital', 'Multifokale', 'Unbekannt'],
    },
    {
      label: 'Seite',
      options: ['Links', 'Rechts', 'Bilateral'],
    },
  ],
  'Multiple Sklerose': [
    {
      label: 'Verlaufsform',
      options: ['RRMS', 'SPMS', 'PPMS', 'CIS'],
    },
  ],
  'Demenz / MCI': [
    {
      label: 'Ätiologie',
      options: [
        'Alzheimer-Demenz',
        'Vaskuläre Demenz',
        'Lewy-Körper-Demenz',
        'Frontotemporale Demenz',
        'MCI amnestisch',
        'MCI nicht-amnestisch',
        'Gemischt / Unklar',
      ],
    },
  ],
  'Parkinson-Syndrom': [
    {
      label: 'Syndromtyp',
      options: ['Idiopathisch (iPD)', 'PSP', 'MSA', 'CBD'],
    },
  ],
  'Enzephalitis': [
    {
      label: 'Ätiologie',
      options: ['Autoimmun', 'Anti-NMDA-R', 'Anti-LGI1', 'Viral', 'Bakteriell', 'Paraneoplastisch'],
    },
    {
      label: 'Verteilung',
      options: ['Limbisch', 'Diffus', 'Fokal'],
    },
  ],
  'Hypoxischer Hirnschaden': [
    {
      label: 'Schweregrad',
      options: ['Leicht', 'Mittel', 'Schwer'],
    },
  ],
  // 'Post-Covid Syndrom', 'Andere' → no localisation groups
};

/** Serialize group selections → stored string, e.g. "A. cerebri media · Rechts" */
export function serializeLokalisation(selections: string[]): string {
  return selections.filter(s => s !== '').join(' · ');
}

/**
 * Restore group selections from stored string for the given diagnosis.
 * Returns an array with one entry per group ('' if that group had no selection).
 */
export function restoreLokalisation(stored: string, diagnose: DiagnoseOption | string): string[] {
  const groups = LOKALISATION_CONFIG[diagnose as DiagnoseOption] ?? [];
  const parts = stored ? stored.split(' · ') : [];
  return groups.map(g => parts.find(p => g.options.includes(p)) ?? '');
}

// ── Mehrfachauswahl-Helfer (mehrere Diagnosen je Patient) ──────────────────────

/** Toggles a diagnosis in a multi-select list (adds if absent, removes if present). */
export function toggleDiagnoseSelection(current: string[], opt: string): string[] {
  return current.includes(opt) ? current.filter(d => d !== opt) : [...current, opt];
}

/** Resolves the UI-selected diagnosis tags (+ optional "Andere" free text) into the stored array. */
export function resolveDiagnoses(selected: string[], andereText: string): string[] {
  return selected
    .map(d => (d === 'Andere' ? (andereText.trim() ? `Andere: ${andereText.trim()}` : null) : d))
    .filter((d): d is string => !!d);
}

/**
 * Splits a stored diagnoses array back into UI selection tags + "Andere" free text.
 * A stored "Andere: <text>" entry becomes the "Andere" tag plus its text.
 */
export function splitAndereFromDiagnoses(stored: string[]): { selected: string[]; andereText: string } {
  const andereEntry = stored.find(d => d.startsWith('Andere: '));
  const selected = stored.map(d => (d.startsWith('Andere: ') ? 'Andere' : d));
  return { selected, andereText: andereEntry ? andereEntry.slice('Andere: '.length) : '' };
}

/** Builds the per-diagnosis Lokalisation map to store, from per-diagnosis group selections. */
export function resolveLokalisationMap(
  selected: string[],
  selectionsByDiagnose: Record<string, string[]>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const d of selected) {
    if (!LOKALISATION_CONFIG[d as DiagnoseOption]) continue;
    const serialized = serializeLokalisation(selectionsByDiagnose[d] ?? []);
    if (serialized) result[d] = serialized;
  }
  return result;
}

/** Restores per-diagnosis Lokalisation group-selection arrays from the stored map, for editing. */
export function restoreLokalisationMap(
  selected: string[],
  stored: Record<string, string>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const d of selected) {
    result[d] = restoreLokalisation(stored[d] ?? '', d);
  }
  return result;
}
