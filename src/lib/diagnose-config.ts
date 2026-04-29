export const DIAGNOSE_OPTIONEN = [
  'Schlaganfall / Apoplex',
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
