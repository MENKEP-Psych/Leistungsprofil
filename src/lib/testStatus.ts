import { TestResult } from '../types';

// Kanonische Test-Gruppen für die Test-Status-Übersicht und "Sitzung beenden" im
// Leistungsprofil-Tab. TAP ist bewusst ausgeschlossen, "custom" (Eigene Tests) hat
// keine feste Identität (Freitext-Name unter gemeinsamer testId) und wird ebenfalls
// nicht aufgeführt.

export interface TestStatusItem {
  /** Eindeutige Id für dieses Slot — entspricht der TestResult.testId. */
  id: string;
  label: string;
  /** Die TestResult.testId(s), von denen mindestens eine vorhanden sein muss, damit
   *  dieser Slot als "erledigt" gilt. */
  testIds: string[];
}

export const STANDARD_TESTS: TestStatusItem[] = [
  { id: 'tmt',         label: 'TMT A/B',            testIds: ['tmt'] },
  { id: 'vlmt',        label: 'VLMT',                testIds: ['vlmt'] },
  { id: 'wms_vw',      label: 'Vis. Wiedergabe',     testIds: ['wms_vw'] },
  // Zahlenspanne und Blockspanne sind eigenständige Slots (früher als ein
  // kombinierter "merkspanne"-Slot geführt) — s. Fehlerbericht 7dbl79.
  { id: 'zahlenspanne', label: 'Zahlenspanne',       testIds: ['zahlenspanne'] },
  { id: 'blockspanne',  label: 'Blockspanne',        testIds: ['blockspanne'] },
  { id: 'lg',          label: 'Log. Gedächtnis',     testIds: ['lg'] },
  { id: 'mosaik',      label: 'Mosaik-Test',         testIds: ['mosaik'] },
  { id: 'tol',         label: 'Turm von London',     testIds: ['tol'] },
];

export const REST_TESTS: TestStatusItem[] = [
  { id: 'zzt',         label: 'ZZT',                 testIds: ['zzt'] },
  { id: 'rey',         label: 'ROCFT (Rey-Figur)',   testIds: ['rey'] },
  { id: 'lps',         label: 'LPS',                 testIds: ['lps'] },
  { id: 'buerotest',   label: 'Bürotest',            testIds: ['buerotest'] },
  { id: 'tagesplan',   label: 'Tagesplan',           testIds: ['tagesplan'] },
  { id: 'neglect_gf',  label: 'Explorationsaufgaben',testIds: ['neglect_gf'] },
];

export function isTestDone(item: TestStatusItem, results: TestResult[]): boolean {
  return item.testIds.some(tid => results.some(r => r.testId === tid));
}

export function labelForTestStatusId(id: string): string | undefined {
  return [...STANDARD_TESTS, ...REST_TESTS].find(t => t.id === id)?.label;
}
