import { encryptData, decryptData } from './encryption';
import { PatientListItem } from '../hooks/usePatients';
import { Patient, TestResult, AuditEntry } from '../types';
import type { RawPatient, PatientCreatePayload, PatientUpdatePayload, TestResultPayload } from './ipc-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeMitarbeiter(row: RawPatient, encryptionKey: string): string[] {
  if (row.encryptedMitarbeiter) {
    try {
      const decoded = decryptData(row.encryptedMitarbeiter, encryptionKey);
      if (Array.isArray(decoded)) return decoded as string[];
    } catch { /* fall through */ }
  }
  // Backward compat: old rows only have encryptedNeuropsychologin
  if (row.encryptedNeuropsychologin) {
    const np = decryptData(row.encryptedNeuropsychologin, encryptionKey) as string;
    if (np) return [np];
  }
  return [];
}

// Diagnose/Lokalisation used to be a single string each (one diagnosis, one
// localisation). Records saved before the multi-diagnosis change still decrypt
// to that legacy shape — normalise them into the current array/map shape here.
function decodeDiagnoseLokalisation(
  row: RawPatient,
  encryptionKey: string,
): { diagnose?: string[]; lokalisation?: Record<string, string> } {
  const decodedDiagnose = row.encryptedDiagnose ? decryptData(row.encryptedDiagnose, encryptionKey) : undefined;
  const decodedLokalisation = row.encryptedLokalisation ? decryptData(row.encryptedLokalisation, encryptionKey) : undefined;

  let diagnose: string[] | undefined;
  if (Array.isArray(decodedDiagnose)) {
    diagnose = decodedDiagnose.length > 0 ? (decodedDiagnose as string[]) : undefined;
  } else if (typeof decodedDiagnose === 'string' && decodedDiagnose) {
    diagnose = [decodedDiagnose];
  }

  let lokalisation: Record<string, string> | undefined;
  if (decodedLokalisation && typeof decodedLokalisation === 'string') {
    // Legacy: one flat string, implicitly tied to the (single) legacy diagnosis.
    const legacyKey = diagnose?.[0];
    lokalisation = legacyKey ? { [legacyKey]: decodedLokalisation } : undefined;
  } else if (decodedLokalisation && typeof decodedLokalisation === 'object') {
    lokalisation = decodedLokalisation as Record<string, string>;
  }

  return { diagnose, lokalisation };
}

// "Sitzung beenden": Notiz + geplante testIds für die nächste Sitzung.
function decodeNextSession(
  row: RawPatient,
  encryptionKey: string,
): { nextSessionNote?: string; nextSessionTestIds?: string[] } {
  const note = row.encryptedNextSessionNote
    ? (decryptData(row.encryptedNextSessionNote, encryptionKey) as string) || undefined
    : undefined;
  const testIds = row.encryptedNextSessionTests
    ? (decryptData(row.encryptedNextSessionTests, encryptionKey) as string[])
    : undefined;
  return { nextSessionNote: note, nextSessionTestIds: Array.isArray(testIds) ? testIds : undefined };
}

// ── Runtime detection ─────────────────────────────────────────────────────────

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as { electronAPI?: unknown }).electronAPI;
}

function getElectronAPI() {
  return (window as unknown as { electronAPI: import('./ipc-types').ElectronAPI }).electronAPI;
}

// ── Patient list ──────────────────────────────────────────────────────────────

export async function fetchPatients(encryptionKey: string): Promise<PatientListItem[]> {
  if (!isElectron()) return fetchPatientsLocal();

  const rows = await getElectronAPI().getPatients();
  return rows.map(row => {
    const mitarbeiter = decodeMitarbeiter(row, encryptionKey);
    return {
      id: row.id,
      name: (decryptData(row.encryptedName, encryptionKey) as string) || 'Unbekannt',
      geburtsdatum: (decryptData(row.encryptedGeburtsdatum, encryptionKey) as string) || '',
      geschlecht: (decryptData(row.encryptedGeschlecht, encryptionKey) as 'm' | 'w' | 'd') || 'm',
      status: row.status as 'aktiv' | 'entlassen',
      mitarbeiter,
      neuropsychologin: mitarbeiter[0],
      entlassdatum: row.encryptedEntlassdatum
        ? (decryptData(row.encryptedEntlassdatum, encryptionKey) as string) || undefined
        : undefined,
      updatedAt: { seconds: row.updatedAt },
    };
  }).sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

// ── Patient detail ────────────────────────────────────────────────────────────

export async function fetchPatient(
  id: string,
  encryptionKey: string
): Promise<{ patient: Patient; results: TestResult[]; note: string } | null> {
  if (!isElectron()) return fetchPatientLocal(id, encryptionKey);

  const data = await getElectronAPI().getPatient(id);
  if (!data) return null;

  const { patient: row, results: rawResults, encryptedNote } = data;
  const mitarbeiter = decodeMitarbeiter(row, encryptionKey);
  const results: TestResult[] = rawResults.map(r => ({
    id: r.id,
    testId: r.testId,
    date: r.date,
    examiner: r.examiner ?? undefined,
    rawValues: (decryptData(r.encryptedRawValues, encryptionKey) as Record<string, number | string>) ?? {},
    calculatedValues: (decryptData(r.encryptedCalculatedValues, encryptionKey) as Record<string, number>) ?? {},
    percentileRanks: (decryptData(r.encryptedPercentileRanks, encryptionKey) as Record<string, number | string>) ?? {},
    normInfo: r.normInfo ?? '',
    domainMapping: r.domainMapping ? JSON.parse(r.domainMapping) : undefined,
    note: r.note ?? undefined,
    aborted: r.aborted ? true : undefined,
    abortComment: r.abortComment ?? undefined,
  }));

  const sorted = [...results].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const { calculateAge } = await import('./utils');
  const patient: Patient = {
    id,
    name: (decryptData(row.encryptedName, encryptionKey) as string) || 'Unbekannt',
    geburtsdatum: (decryptData(row.encryptedGeburtsdatum, encryptionKey) as string) || '',
    geschlecht: (decryptData(row.encryptedGeschlecht, encryptionKey) as 'm' | 'w' | 'd') || 'm',
    bildungsjahre: row.encryptedBildungsjahre
      ? (decryptData(row.encryptedBildungsjahre, encryptionKey) as number | undefined)
      : undefined,
    mitarbeiter,
    neuropsychologin: mitarbeiter[0],
    aufnahmedatum: row.encryptedAufnahmedatum
      ? (decryptData(row.encryptedAufnahmedatum, encryptionKey) as string) || undefined
      : undefined,
    entlassdatum: row.encryptedEntlassdatum
      ? (decryptData(row.encryptedEntlassdatum, encryptionKey) as string) || undefined
      : undefined,
    ...decodeDiagnoseLokalisation(row, encryptionKey),
    ...decodeNextSession(row, encryptionKey),
    status: row.status as 'aktiv' | 'entlassen',
    age: calculateAge((decryptData(row.encryptedGeburtsdatum, encryptionKey) as string) || '', sorted[0]?.date),
    createdBy: row.createdBy ?? undefined,
  };

  return { patient, results, note: encryptedNote ? (decryptData(encryptedNote, encryptionKey) as string) || '' : '' };
}

// ── Create patient ────────────────────────────────────────────────────────────

export async function dbCreatePatient(p: Patient, encryptionKey: string, createdBy: string | null): Promise<boolean> {
  if (!isElectron()) return createPatientLocal(p, encryptionKey);

  const mitarbeiter = p.mitarbeiter ?? [];
  const payload: PatientCreatePayload = {
    id: p.id,
    encryptedName: encryptData(p.name, encryptionKey) as string,
    encryptedGeburtsdatum: encryptData(p.geburtsdatum, encryptionKey) as string,
    encryptedGeschlecht: encryptData(p.geschlecht, encryptionKey) as string,
    encryptedBildungsjahre: p.bildungsjahre !== undefined ? encryptData(p.bildungsjahre, encryptionKey) as string : null,
    encryptedNeuropsychologin: mitarbeiter[0] ? encryptData(mitarbeiter[0], encryptionKey) as string : null,
    encryptedMitarbeiter: mitarbeiter.length > 0 ? encryptData(mitarbeiter, encryptionKey) as string : null,
    encryptedAufnahmedatum: p.aufnahmedatum ? encryptData(p.aufnahmedatum, encryptionKey) as string : null,
    encryptedEntlassdatum: p.entlassdatum ? encryptData(p.entlassdatum, encryptionKey) as string : null,
    encryptedDiagnose: p.diagnose && p.diagnose.length > 0 ? encryptData(p.diagnose, encryptionKey) as string : null,
    encryptedLokalisation: p.lokalisation && Object.keys(p.lokalisation).length > 0 ? encryptData(p.lokalisation, encryptionKey) as string : null,
    encryptedGeneralNote: encryptData('', encryptionKey) as string,
    createdBy,
  };
  return getElectronAPI().createPatient(payload);
}

// ── Update patient ────────────────────────────────────────────────────────────

export async function dbUpdatePatient(
  id: string,
  updates: Partial<Pick<Patient, 'name' | 'geburtsdatum' | 'geschlecht' | 'bildungsjahre' | 'mitarbeiter' | 'aufnahmedatum' | 'entlassdatum' | 'diagnose' | 'lokalisation' | 'nextSessionNote' | 'nextSessionTestIds'>>,
  encryptionKey: string
): Promise<boolean> {
  if (!isElectron()) return updatePatientLocal(id, updates);

  const payload: PatientUpdatePayload = {};
  if (updates.name !== undefined) payload.encryptedName = encryptData(updates.name, encryptionKey) as string;
  if (updates.geburtsdatum !== undefined) payload.encryptedGeburtsdatum = encryptData(updates.geburtsdatum, encryptionKey) as string;
  if (updates.geschlecht !== undefined) payload.encryptedGeschlecht = encryptData(updates.geschlecht, encryptionKey) as string;
  if ('bildungsjahre' in updates) payload.encryptedBildungsjahre = updates.bildungsjahre !== undefined ? encryptData(updates.bildungsjahre, encryptionKey) as string : null;
  if ('mitarbeiter' in updates) {
    const m = updates.mitarbeiter ?? [];
    payload.encryptedMitarbeiter = m.length > 0 ? encryptData(m, encryptionKey) as string : null;
    payload.encryptedNeuropsychologin = m[0] ? encryptData(m[0], encryptionKey) as string : null;
  }
  if ('aufnahmedatum' in updates) payload.encryptedAufnahmedatum = updates.aufnahmedatum ? encryptData(updates.aufnahmedatum, encryptionKey) as string : null;
  if ('entlassdatum' in updates) payload.encryptedEntlassdatum = updates.entlassdatum ? encryptData(updates.entlassdatum, encryptionKey) as string : null;
  if ('diagnose' in updates) payload.encryptedDiagnose = updates.diagnose && updates.diagnose.length > 0 ? encryptData(updates.diagnose, encryptionKey) as string : null;
  if ('lokalisation' in updates) payload.encryptedLokalisation = updates.lokalisation && Object.keys(updates.lokalisation).length > 0 ? encryptData(updates.lokalisation, encryptionKey) as string : null;
  if ('nextSessionNote' in updates) payload.encryptedNextSessionNote = updates.nextSessionNote ? encryptData(updates.nextSessionNote, encryptionKey) as string : null;
  if ('nextSessionTestIds' in updates) payload.encryptedNextSessionTests = updates.nextSessionTestIds && updates.nextSessionTestIds.length > 0 ? encryptData(updates.nextSessionTestIds, encryptionKey) as string : null;
  return getElectronAPI().updatePatient(id, payload);
}

export async function dbDischargePatient(id: string): Promise<boolean> {
  if (!isElectron()) return dischargePatientLocal(id);
  return getElectronAPI().updatePatient(id, { status: 'entlassen' });
}

export async function dbDeletePatient(id: string): Promise<boolean> {
  if (!isElectron()) return deletePatientLocal(id);
  return getElectronAPI().deletePatient(id);
}

export async function dbPickFolder(): Promise<string | null> {
  if (!isElectron()) return null;
  return getElectronAPI().pickFolder();
}

export async function dbUndoDischarge(id: string): Promise<boolean> {
  if (!isElectron()) return undoDischargeLocal(id);
  return getElectronAPI().updatePatient(id, { status: 'aktiv' });
}

// ── Test results ──────────────────────────────────────────────────────────────

export async function dbSaveResult(
  patientId: string,
  result: TestResult,
  encryptionKey: string,
  createdBy: string | null
): Promise<boolean> {
  if (!isElectron()) return saveResultLocal(patientId, result, encryptionKey);

  const payload: TestResultPayload = {
    id: result.id,
    testId: result.testId,
    date: result.date,
    examiner: result.examiner ?? null,
    encryptedRawValues: encryptData(result.rawValues, encryptionKey) as string,
    encryptedCalculatedValues: encryptData(result.calculatedValues, encryptionKey) as string,
    encryptedPercentileRanks: encryptData(result.percentileRanks, encryptionKey) as string,
    normInfo: result.normInfo,
    domainMapping: result.domainMapping ? JSON.stringify(result.domainMapping) : null,
    note: result.note ?? null,
    aborted: result.aborted ? 1 : null,
    abortComment: result.abortComment ?? null,
  };
  return getElectronAPI().saveResult(patientId, payload, createdBy);
}

export async function dbUpdateResult(patientId: string, result: TestResult, encryptionKey: string): Promise<boolean> {
  if (!isElectron()) return updateResultLocal(patientId, result, encryptionKey);

  const payload: TestResultPayload = {
    id: result.id,
    testId: result.testId,
    date: result.date,
    examiner: result.examiner ?? null,
    encryptedRawValues: encryptData(result.rawValues, encryptionKey) as string,
    encryptedCalculatedValues: encryptData(result.calculatedValues, encryptionKey) as string,
    encryptedPercentileRanks: encryptData(result.percentileRanks, encryptionKey) as string,
    normInfo: result.normInfo,
    domainMapping: result.domainMapping ? JSON.stringify(result.domainMapping) : null,
    note: result.note ?? null,
    aborted: result.aborted ? 1 : null,
    abortComment: result.abortComment ?? null,
  };
  return getElectronAPI().updateResult(patientId, payload);
}

export async function dbDeleteResult(patientId: string, resultId: string): Promise<boolean> {
  if (!isElectron()) return deleteResultLocal(patientId, resultId);
  return getElectronAPI().deleteResult(patientId, resultId);
}

// ── Note ─────────────────────────────────────────────────────────────────────

export async function dbSaveNote(patientId: string, note: string, encryptionKey: string): Promise<boolean> {
  if (!isElectron()) return saveNoteLocal(patientId, note);
  return getElectronAPI().saveNote(patientId, encryptData(note, encryptionKey) as string);
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export async function dbAddAuditEntry(
  action: string,
  username: string,
  patientName?: string,
  details?: string
): Promise<void> {
  if (!isElectron()) {
    addAuditLocal({ id: Date.now().toString(), timestamp: new Date().toISOString(), username, action: action as AuditEntry['action'], patientName, details });
    return;
  }
  await getElectronAPI().addAuditEntry(action, username, patientName, details);
}

export async function dbGetAuditLog(): Promise<AuditEntry[]> {
  if (!isElectron()) return getAuditLocal();

  const rows = await getElectronAPI().getAuditLog();
  return rows.map(r => ({
    id: r.id,
    timestamp: new Date(r.timestamp * 1000).toISOString(),
    username: r.username,
    action: r.action as AuditEntry['action'],
    patientName: r.patientName ?? undefined,
    details: r.details ?? undefined,
  }));
}

// ── Auth (Electron-only) ──────────────────────────────────────────────────────

export async function dbLogin(username: string, password: string) {
  if (!isElectron()) {
    const users = await ensureWebUsers();
    const found = users.find(u => u.username === username && u.password === password);
    if (found) return { success: true, username: found.username, role: found.role as 'admin' | 'user' };
    return null;
  }
  return getElectronAPI().login(username, password);
}

export async function dbGetEncryptionKey(): Promise<string> {
  if (!isElectron()) return 'dev-mode-key'; // fixed key for local dev/web mode
  return getElectronAPI().getEncryptionKey();
}

// ── User management ───────────────────────────────────────────────────────────

// Web/dev mode: users are kept in localStorage (seeded once from users.json)
const WEB_USERS_KEY = 'leistungsprofil_users_v1';
interface WebUser { username: string; password: string; role: 'admin' | 'user' }

async function ensureWebUsers(): Promise<WebUser[]> {
  try {
    const stored = localStorage.getItem(WEB_USERS_KEY);
    if (stored) return JSON.parse(stored) as WebUser[];
    // First run — seed from static users.json
    const mod = await import('../data/users.json');
    const seed = (Array.isArray(mod.default) ? mod.default : []) as WebUser[];
    localStorage.setItem(WEB_USERS_KEY, JSON.stringify(seed));
    return seed;
  } catch { return []; }
}

function saveWebUsers(users: WebUser[]): void {
  localStorage.setItem(WEB_USERS_KEY, JSON.stringify(users));
}

export async function dbGetUsers(): Promise<{ username: string; role: string }[]> {
  if (!isElectron()) {
    const users = await ensureWebUsers();
    return users.map(u => ({ username: u.username, role: u.role }));
  }
  return getElectronAPI().getUsers();
}

export async function dbCreateUser(username: string, password: string, role: 'admin' | 'user') {
  if (!isElectron()) {
    const users = await ensureWebUsers();
    if (users.find(u => u.username === username)) {
      return { success: false, error: 'Benutzername bereits vergeben' };
    }
    saveWebUsers([...users, { username, password, role }]);
    return { success: true };
  }
  return getElectronAPI().createUser(username, password, role);
}

export async function dbDeleteUser(username: string) {
  if (!isElectron()) {
    const users = await ensureWebUsers();
    saveWebUsers(users.filter(u => u.username !== username));
    return { success: true };
  }
  return getElectronAPI().deleteUser(username);
}

export async function dbChangePassword(username: string, newPassword: string) {
  if (!isElectron()) {
    const users = await ensureWebUsers();
    const updated = users.map(u => u.username === username ? { ...u, password: newPassword } : u);
    saveWebUsers(updated);
    return true;
  }
  return getElectronAPI().changePassword(username, newPassword);
}

export async function dbChangeRole(username: string, newRole: 'admin' | 'user') {
  if (!isElectron()) {
    const users = await ensureWebUsers();
    const updated = users.map(u => u.username === username ? { ...u, role: newRole } : u);
    saveWebUsers(updated);
    return { success: true };
  }
  return getElectronAPI().changeRole(username, newRole);
}

export async function dbGetRecoveryKey(): Promise<string> {
  if (!isElectron()) return '';
  return getElectronAPI().getRecoveryKey();
}

// ── Startup state ─────────────────────────────────────────────────────────────

export async function dbGetStartupState() {
  if (!isElectron()) return { phase: 'ready' as const, error: '', warning: '' };
  return getElectronAPI().getStartupState();
}

// ── Sync (Electron-only) ──────────────────────────────────────────────────────

export async function dbSyncPull() {
  if (!isElectron()) return { success: true };
  return getElectronAPI().syncPull();
}

export async function dbSyncPush() {
  if (!isElectron()) return { success: true, newPatients: 0, updatedPatients: 0, newResults: 0, updatedResults: 0, newUsers: 0, newAuditEntries: 0 };
  return getElectronAPI().syncPush();
}

export async function dbSyncGetServerPath(): Promise<string> {
  if (!isElectron()) return '';
  return getElectronAPI().syncGetServerPath();
}

export async function dbSyncSetServerPath(p: string) {
  if (!isElectron()) return { success: true };
  return getElectronAPI().syncSetServerPath(p);
}

export async function dbSyncHasLocalChanges(): Promise<boolean> {
  if (!isElectron()) return false;
  return getElectronAPI().syncHasLocalChanges();
}

export async function dbSyncGetNormsStore(): Promise<string> {
  if (!isElectron()) return '';
  return getElectronAPI().syncGetNormsStore();
}

export async function dbSyncSetNormsStore(data: string): Promise<{ success: boolean; error?: string }> {
  if (!isElectron()) return { success: true };
  return getElectronAPI().syncSetNormsStore(data);
}

// ── Notifications shared store (geräteübergreifend, JSON neben der Server-DB) ────
export async function dbGetNotifications(): Promise<string> {
  if (!isElectron()) return '';
  return getElectronAPI().notificationsGetStore();
}

export async function dbSetNotifications(data: string): Promise<{ success: boolean; error?: string }> {
  if (!isElectron()) return { success: true };
  return getElectronAPI().notificationsSetStore(data);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export async function dbGetPdfFolder(): Promise<string> {
  if (!isElectron()) return '';
  return getElectronAPI().getPdfFolder();
}

export async function dbSetPdfFolder(folder: string) {
  if (!isElectron()) return { success: true };
  return getElectronAPI().setPdfFolder(folder);
}

export async function dbSavePdf(filename: string, bytes: number[]) {
  if (!isElectron()) return { success: false, error: 'Not in Electron' };
  return getElectronAPI().savePdf(filename, bytes);
}

export async function dbSaveJson(filename: string, content: string) {
  if (!isElectron()) return { success: false, error: 'Nur in der Desktop-App verfügbar' };
  return getElectronAPI().saveJson(filename, content);
}

// Render the print-optimised profile in a hidden window and export it as a
// vector PDF (Electron only). Returns { success, filePath } or { success:false }.
export async function dbExportProfilePdf(patientId: string, filename: string) {
  if (!isElectron()) return { success: false, error: 'Not in Electron' };
  return getElectronAPI().exportProfilePdf(patientId, filename);
}

// PDF Experimental — forked copy of dbExportProfilePdf. Runs through the fully
// independent experimental export pipeline (see src/lib/featureFlags.ts,
// PDF_EXPERIMENTAL_ENABLED). Electron only, no screenshot fallback.
export async function dbExportProfilePdfExperimental(patientId: string, filename: string) {
  if (!isElectron()) return { success: false, error: 'Not in Electron' };
  return getElectronAPI().exportProfilePdfExperimental(patientId, filename);
}

// Print window → main: signal that the print layout has finished rendering.
export function printReady(): void {
  if (isElectron()) getElectronAPI().printReady();
}

// ── All active patients with results (for TAP-Täglich PDF) ────────────────────

export async function fetchAllActivePatients(
  encryptionKey: string
): Promise<{ patient: Patient; results: TestResult[] }[]> {
  const list = await fetchPatients(encryptionKey);
  const active = list.filter(p => p.status === 'aktiv');
  const results = await Promise.all(
    active.map(async p => {
      const data = await fetchPatient(p.id, encryptionKey);
      if (!data) return null;
      return { patient: data.patient, results: data.results };
    })
  );
  return results.filter((r): r is { patient: Patient; results: TestResult[] } => r !== null);
}

export async function fetchAllPatientsForExport(
  encryptionKey: string
): Promise<{ patient: Patient; results: TestResult[] }[]> {
  const list = await fetchPatients(encryptionKey);
  const data = await Promise.all(
    list.map(async p => {
      const d = await fetchPatient(p.id, encryptionKey);
      if (!d) return null;
      return { patient: d.patient, results: d.results };
    })
  );
  return data.filter((r): r is { patient: Patient; results: TestResult[] } => r !== null);
}

// ── localStorage fallbacks (dev / web mode) ────────────────────────────────────
// These mirror the existing localStorage logic exactly.

function fetchPatientsLocal(): PatientListItem[] {
  const list = JSON.parse(localStorage.getItem('patients_list') || '[]') as Array<Record<string, unknown>>;
  return list.map(item => {
    // Enrich list entries with full patient data (neuropsychologin, entlassdatum etc.
    // were never stored in the list index — read them from the full patient record)
    const fullRaw = localStorage.getItem(`patient_${item.id as string}`);
    const full = fullRaw ? (JSON.parse(fullRaw) as { patient: Patient }).patient : null;
    const mitarbeiter = full?.mitarbeiter ?? (full?.neuropsychologin ? [full.neuropsychologin] : []);
    return {
      id: item.id as string,
      name: item.name as string,
      geburtsdatum: item.geburtsdatum as string,
      geschlecht: item.geschlecht as 'm' | 'w' | 'd',
      status: item.status as 'aktiv' | 'entlassen',
      mitarbeiter,
      neuropsychologin: mitarbeiter[0],
      entlassdatum: full?.entlassdatum ?? undefined,
      updatedAt: item.updatedAt as { seconds: number } | null,
    };
  });
}

function fetchPatientLocal(id: string, _key: string): { patient: Patient; results: TestResult[]; note: string } | null {
  const raw = localStorage.getItem(`patient_${id}`);
  if (!raw) return null;
  return JSON.parse(raw) as { patient: Patient; results: TestResult[]; note: string };
}

function createPatientLocal(p: Patient, _key: string): boolean {
  const list: unknown[] = JSON.parse(localStorage.getItem('patients_list') || '[]');
  list.unshift({ id: p.id, name: p.name, geburtsdatum: p.geburtsdatum, geschlecht: p.geschlecht, status: 'aktiv', updatedAt: { seconds: Date.now() / 1000 } });
  localStorage.setItem('patients_list', JSON.stringify(list));
  localStorage.setItem(`patient_${p.id}`, JSON.stringify({ results: [], note: '', patient: { ...p, status: 'aktiv' } }));
  window.dispatchEvent(new Event('patients_updated'));
  return true;
}

function updatePatientLocal(id: string, updates: Partial<Patient>): boolean {
  const raw = localStorage.getItem(`patient_${id}`);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  parsed.patient = { ...parsed.patient, ...updates };
  localStorage.setItem(`patient_${id}`, JSON.stringify(parsed));
  const list = JSON.parse(localStorage.getItem('patients_list') || '[]') as Array<Record<string, unknown>>;
  const idx = list.findIndex(p => p.id === id);
  if (idx !== -1) {
    if (updates.name !== undefined) list[idx].name = updates.name;
    if (updates.geburtsdatum !== undefined) list[idx].geburtsdatum = updates.geburtsdatum;
    if (updates.geschlecht !== undefined) list[idx].geschlecht = updates.geschlecht;
    if ('neuropsychologin' in updates) list[idx].neuropsychologin = updates.neuropsychologin ?? null;
    if ('entlassdatum' in updates) list[idx].entlassdatum = updates.entlassdatum ?? null;
    list[idx].updatedAt = { seconds: Date.now() / 1000 };
    localStorage.setItem('patients_list', JSON.stringify(list));
  }
  window.dispatchEvent(new Event('patients_updated'));
  return true;
}

function deletePatientLocal(id: string): boolean {
  localStorage.removeItem(`patient_${id}`);
  const list = JSON.parse(localStorage.getItem('patients_list') || '[]') as Array<Record<string, unknown>>;
  localStorage.setItem('patients_list', JSON.stringify(list.filter(p => p.id !== id)));
  window.dispatchEvent(new Event('patients_updated'));
  return true;
}

function dischargePatientLocal(id: string): boolean {
  const raw = localStorage.getItem(`patient_${id}`);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  parsed.patient = { ...parsed.patient, status: 'entlassen' };
  localStorage.setItem(`patient_${id}`, JSON.stringify(parsed));
  const list = JSON.parse(localStorage.getItem('patients_list') || '[]') as Array<Record<string, unknown>>;
  const idx = list.findIndex(p => p.id === id);
  if (idx !== -1) { list[idx].status = 'entlassen'; list[idx].updatedAt = { seconds: Date.now() / 1000 }; localStorage.setItem('patients_list', JSON.stringify(list)); }
  window.dispatchEvent(new Event('patients_updated'));
  return true;
}

function undoDischargeLocal(id: string): boolean {
  const raw = localStorage.getItem(`patient_${id}`);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  parsed.patient = { ...parsed.patient, status: 'aktiv' };
  localStorage.setItem(`patient_${id}`, JSON.stringify(parsed));
  const list = JSON.parse(localStorage.getItem('patients_list') || '[]') as Array<Record<string, unknown>>;
  const idx = list.findIndex(p => p.id === id);
  if (idx !== -1) { list[idx].status = 'aktiv'; list[idx].updatedAt = { seconds: Date.now() / 1000 }; localStorage.setItem('patients_list', JSON.stringify(list)); }
  window.dispatchEvent(new Event('patients_updated'));
  return true;
}

function saveResultLocal(patientId: string, result: TestResult, _key: string): boolean {
  const raw = localStorage.getItem(`patient_${patientId}`);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  parsed.results = [result, ...(parsed.results || [])];
  localStorage.setItem(`patient_${patientId}`, JSON.stringify(parsed));
  return true;
}

function updateResultLocal(patientId: string, result: TestResult, _key: string): boolean {
  const raw = localStorage.getItem(`patient_${patientId}`);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  parsed.results = (parsed.results as TestResult[]).map(r => r.id === result.id ? result : r);
  localStorage.setItem(`patient_${patientId}`, JSON.stringify(parsed));
  return true;
}

function deleteResultLocal(patientId: string, resultId: string): boolean {
  const raw = localStorage.getItem(`patient_${patientId}`);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  parsed.results = (parsed.results as TestResult[]).filter(r => r.id !== resultId);
  localStorage.setItem(`patient_${patientId}`, JSON.stringify(parsed));
  return true;
}

function saveNoteLocal(patientId: string, note: string): boolean {
  const raw = localStorage.getItem(`patient_${patientId}`);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  parsed.note = note;
  localStorage.setItem(`patient_${patientId}`, JSON.stringify(parsed));
  return true;
}

function addAuditLocal(entry: AuditEntry): void {
  const existing: AuditEntry[] = JSON.parse(localStorage.getItem('audit_log') || '[]');
  existing.unshift(entry);
  localStorage.setItem('audit_log', JSON.stringify(existing.slice(0, 500)));
}

function getAuditLocal(): AuditEntry[] {
  return JSON.parse(localStorage.getItem('audit_log') || '[]');
}
