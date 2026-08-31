// Kurzer, stabiler Fingerabdruck jeder Norm-Datendatei. Damit lässt sich in
// einem Fehlerbericht feststellen, mit welchem Norm-Stand ein gespeicherter
// Prozentrang erzeugt wurde — die Neuberechnung der Norm-Werte läuft nur
// manuell über den Admin-Tab, gespeicherte PR können also veralten.

import blockspanne from '../data/blockspanne-norms.json';
import lg from '../data/logisches_gedaechtnis_normen.json';
import mosaik from '../data/mosaik_normen.json';
import rocft from '../data/rocft_normen.json';
import transformation from '../data/testnormen_transformation.json';
import tmt from '../data/tmt-norms.json';
import tolAlter from '../data/tol_normen_alter.json';
import tolBildung from '../data/tol_normen_bildung.json';
import vlmt from '../data/vlmt_normen.json';
import wmsVw from '../data/wms_iv_visuelle_wiedergabe_normen.json';
import zahlenspanne from '../data/zahlenspanne_normen.json';
import zzt from '../data/zzt_normen.json';

// FNV-1a (32 bit) → 8-stelliger Hex-String. Kein Krypto-Anspruch, nur
// „gleicher Inhalt ⇒ gleicher Fingerabdruck".
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const NORM_FILES: Record<string, unknown> = {
  'blockspanne-norms.json': blockspanne,
  'logisches_gedaechtnis_normen.json': lg,
  'mosaik_normen.json': mosaik,
  'rocft_normen.json': rocft,
  'testnormen_transformation.json': transformation,
  'tmt-norms.json': tmt,
  'tol_normen_alter.json': tolAlter,
  'tol_normen_bildung.json': tolBildung,
  'vlmt_normen.json': vlmt,
  'wms_iv_visuelle_wiedergabe_normen.json': wmsVw,
  'zahlenspanne_normen.json': zahlenspanne,
  'zzt_normen.json': zzt,
};

export function normFileFingerprints(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(NORM_FILES)) {
    out[name] = fnv1a(JSON.stringify(data));
  }
  return out;
}
