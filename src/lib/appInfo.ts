import { isElectron } from './db-api';

// Laufzeit-/Build-Infos für Fehlerberichte und Support. `__APP_VERSION__` &
// Co. werden zur Build-Zeit über vite `define` gesetzt (vite.config.ts); im
// reinen `tsc`-Kontext (ohne vite) sind sie evtl. nicht definiert — daher der
// typeof-Guard mit Fallback.

export interface AppInfo {
  version: string;
  buildTime: string;
  gitSha: string;
  runtime: 'electron' | 'browser';
  platform: string;
  userAgent: string;
}

const safe = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.length > 0 ? v : fallback;

export function getAppInfo(): AppInfo {
  return {
    version: safe(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined, 'dev'),
    buildTime: safe(typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : undefined, ''),
    gitSha: safe(typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : undefined, 'unknown'),
    runtime: isElectron() ? 'electron' : 'browser',
    platform: typeof navigator !== 'undefined' ? navigator.platform : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

/** Kurzform für UI-Anzeige, z. B. „1.0.8 (5dd2cf5)". */
export function appVersionLabel(): string {
  const { version, gitSha } = getAppInfo();
  return gitSha && gitSha !== 'unknown' ? `${version} (${gitSha})` : version;
}
