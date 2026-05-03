import { encryptData, decryptData } from './encryption';
import { PatientListItem } from '../hooks/usePatients';
import { Patient, TestResult, AuditEntry } from '../types';
import type { PatientCreatePayload, PatientUpdatePayload, TestResultPayload } from './ipc-types';

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
  return rows.map(row => ({
    id: row.id,
    name: (decryptData(row.encryptedName, encryptionKey) as string) || 'Unbekannt',
    geburtsdatum: (decryptData(row.encryptedGeburtsdatum, encryptionKey) as string) || '',
    geschlecht: (decryptData(row.encryptedGeschlecht, encryptionKey) as 'm' | 'w' | 'd') || 'm',
    status: row.status as 'aktiv' | 'entlassen',
    neuropsychologin: row.encryptedNeuropsychologin
      ? (decryptData(row.encryptedNeuropsychologin, encryptionKey) as string) || undefined
      : undefined,
    updatedAt: { seconds: row.updatedAt },
  })).sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
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
    neuropsychologin: row.encryptedNeuropsychologin
      ? (decryptData(row.encryptedNeuropsychologin, encryptionKey) as string) || undefined
      : undefined,
    aufnahmedatum: row.encryptedAufnahmedatum
      ? (decryptData(row.encryptedAufnahmedatum, encryptionKey) as string) || undefined
      : undefined,
    entlassdatum: row.encryptedEntlassdatum
      ? (decryptData(row.encryptedEntlassdatum, encryptionKey) as string) || undefined
      : undefined,
    diagnose: row.encryptedDiagnose
      ? (decryptData(row.encryptedDiagnose, encryptionKey) as string) || undefined
      : undefined,
    lokalisation: row.encryptedLokalisation
      ? (decryptData(row.encryptedLokalisation, encryptionKey) as string) || undefined
      : undefined,
    station: row.encryptedStation
      ? (decryptData(row.encryptedStation, encryptionKey) as string) || undefined
      : undefined,
    zimmer: row.encryptedZimmer
      ? (decryptData(row.encryptedZimmer, encryptionKey) as string) || undefined
      : undefined,
    status: row.status as 'aktiv' | 'entlassen',
    age: calculateAge((decryptData(row.encryptedGeburtsdatum, encryptionKey) as string) || '', sorted[0]?.date),
    createdBy: row.createdBy ?? undefined,
  };

  return { patient, results, note: encryptedNote ? (decryptData(encryptedNote, encryptionKey) as string) || '' : '' };
}

// ── Create patient ────────────────────────────────────────────────────────────

export async function dbCreatePatient(p: Patient, encryptionKey: string, createdBy: string | null): Promise<boolean> {
  if (!isElectron()) return createPatientLocal(p, encryptionKey);

  const payload: PatientCreatePayload = {
    id: p.id,
    encryptedName: encryptData(p.name, encryptionKey) as string,
    encryptedGeburtsdatum: encryptData(p.geburtsdatum, encryptionKey) as string,
    encryptedGeschlecht: encryptData(p.geschlecht, encryptionKey) as string,
    encryptedBildungsjahre: p.bildungsjahre !== undefined ? encryptData(p.bildungsjahre, encryptionKey) as string : null,
    encryptedNeuropsychologin: p.neuropsychologin ? encryptData(p.neuropsychologin, encryptionKey) as string : null,
    encryptedAufnahmedatum: p.aufnahmedatum ? encryptData(p.aufnahmedatum, encryptionKey) as string : null,
    encryptedEntlassdatum: p.entlassdatum ? encryptData(p.entlassdatum, encryptionKey) as string : null,
    encryptedDiagnose: p.diagnose ? encryptData(p.diagnose, encryptionKey) as string : null,
    encryptedLokalisation: p.lokalisation ? encryptData(p.lokalisation, encryptionKey) as string : null,
    encryptedStation: p.station ? encryptData(p.station, encryptionKey) as string : null,
    encryptedZimmer: p.zimmer ? encryptData(p.zimmer, encryptionKey) as string : null,
    encryptedGeneralNote: encryptData('', encryptionKey) as string,
    createdBy,
  };
  return getElectronAPI().createPatient(payload);
}

// ── Update patient ────────────────────────────────────────────────────────────

export async function dbUpdatePatient(
  id: string,
  updates: Partial<Pick<Patient, 'name' | 'geburtsdatum' | 'geschlecht' | 'bildungsjahre' | 'neuropsychologin' | 'aufnahmedatum' | 'entlassdatum' | 'diagnose' | 'lokalisation' | 'station' | 'zimmer'>>,
  encryptionKey: string
): Promise<boolean> {
  if (!isElectron()) return updatePatientLocal(id, updates);

  const payload: PatientUpdatePayload = {};
  if (updates.name !== undefined) payload.encryptedName = encryptData(updates.name, encryptionKey) as string;
  if (updates.geburtsdatum !== undefined) payload.encryptedGeburtsdatum = encryptData(updates.geburtsdatum, encryptionKey) as string;
  if (updates.geschlecht !== undefined) payload.encryptedGeschlecht = encryptData(updates.geschlecht, encryptionKey) as string;
  if ('bildungsjahre' in updates) payload.encryptedBildungsjahre = updates.bildungsjahre !== undefined ? encryptData(updates.bildungsjahre, encryptionKey) as string : null;
  if ('neuropsychologin' in updates) payload.encryptedNeuropsychologin = updates.neuropsychologin ? encryptData(updates.neuropsychologin, encryptionKey) as string : null;
  if ('aufnahmedatum' in updates) payload.encryptedAufnahmedatum = updates.aufnahmedatum ? encryptData(updates.aufnahmedatum, encryptionKey) as string : null;
  if ('entlassdatum' in updates) payload.encryptedEntlassdatum = updates.entlassdatum ? encryptData(updates.entlassdatum, encryptionKey) as string : null;
  if ('diagnose' in updates) payload.encryptedDiagnose = updates.diagnose ? encryptData(updates.diagnose, encryptionKey) as string : null;
  if ('lokalisation' in updates) payload.encryptedLokalisation = updates.lokalisation ? encryptData(updates.lokalisation, encryptionKey) as string : null;
  if ('station' in updates) payload.encryptedStation = updates.station ? encryptData(updates.station, encryptionKey) as string : null;
  if ('zimmer' in updates) payload.encryptedZimmer = updates.zimmer ? encryptData(updates.zimmer, encryptionKey) as string : null;

  return getElectronAPI().updatePatient(id, payload);
}

export async function dbDischargePatient(id: string): Promise<boolean> {
  if (!isElectron()) return dischargePatientLocal(id);
  return getElectronAPI().updatePatient(id, { status: 'entlassen' });
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

// ── localStorage fallbacks (dev / web mode) ────────────────────────────────────
// These mirror the existing localStorage logic exactly.

function fetchPatientsLocal(): PatientListItem[] {
  return JSON.parse(localStorage.getItem('patients_list') || '[]') as PatientListItem[];
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
    list[idx].updatedAt = { seconds: Date.now() / 1000 };
    localStorage.setItem('patients_list', JSON.stringify(list));
  }
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
