import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { RawPatient, RawTestResult, PatientCreatePayload, PatientUpdatePayload, TestResultPayload, LoginResult, UserRow, AuditRow } from '../src/lib/ipc-types';

let db: Database.Database | null = null;
let dbPath: string | null = null;

// Accounts that cannot be deleted via the UI
const PROTECTED_USERNAMES = ['recovery'];

export function openDatabase(dbFilePath: string): void {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbPath = dbFilePath;
  db = new Database(dbFilePath);
  db.pragma('journal_mode = DELETE'); // WAL requires memory-mapped -shm which breaks on SMB network shares
  db.pragma('locking_mode = NORMAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('wal_autocheckpoint = 100');
  db.pragma('busy_timeout = 5000'); // wait up to 5s if DB is locked by another user

  createSchema();
  seedDefaultUsers();
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function createSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      encrypted_name TEXT NOT NULL,
      encrypted_geburtsdatum TEXT NOT NULL,
      encrypted_geschlecht TEXT NOT NULL,
      encrypted_bildungsjahre TEXT,
      encrypted_neuropsychologin TEXT,
      status TEXT NOT NULL DEFAULT 'aktiv',
      encrypted_general_note TEXT NOT NULL DEFAULT '',
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      test_id TEXT NOT NULL,
      date TEXT NOT NULL,
      examiner TEXT,
      encrypted_raw_values TEXT NOT NULL,
      encrypted_calculated_values TEXT NOT NULL DEFAULT '{}',
      encrypted_percentile_ranks TEXT NOT NULL,
      norm_info TEXT,
      domain_mapping TEXT,
      note TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_results_patient ON test_results(patient_id);
    CREATE INDEX IF NOT EXISTS idx_results_updated ON test_results(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients(updated_at DESC);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      action TEXT NOT NULL,
      patient_name TEXT,
      details TEXT,
      username TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Migrations for new columns (safe to run on existing DBs)
  try { getDb().exec('ALTER TABLE patients ADD COLUMN encrypted_aufnahmedatum TEXT'); } catch { /* already exists */ }
  try { getDb().exec('ALTER TABLE patients ADD COLUMN encrypted_entlassdatum TEXT'); } catch { /* already exists */ }
  try { getDb().exec('ALTER TABLE patients ADD COLUMN encrypted_diagnose TEXT'); } catch { /* already exists */ }
  try { getDb().exec('ALTER TABLE patients ADD COLUMN encrypted_lokalisation TEXT'); } catch { /* already exists */ }
  // Track when user credentials were last changed so push can sync password updates.
  try { getDb().exec('ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch())'); } catch { /* already exists */ }
}

function seedDefaultUsers(): void {
  const count = (getDb().prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (count === 0) {
    const initialPassword = crypto.randomBytes(12).toString('base64url');
    getDb().prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('IT', bcrypt.hashSync(initialPassword, 10), 'admin');

    // Write the generated password to a file next to the database so the admin can retrieve it.
    if (dbPath) {
      const credFile = path.join(path.dirname(dbPath), 'FIRST-RUN-CREDENTIALS.txt');
      fs.writeFileSync(
        credFile,
        `Erststart-Zugangsdaten fuer das Leistungsprofil\n` +
        `================================================\n\n` +
        `Benutzername: IT\n` +
        `Passwort:     ${initialPassword}\n\n` +
        `Bitte nach dem ersten Login unter Optionen > Benutzerverwaltung\n` +
        `ein eigenes Passwort setzen und diese Datei anschliessend loeschen.\n`,
        'utf8'
      );
    }
    console.log(`[Leistungsprofil] Erststart: Admin-Konto "IT" angelegt. Passwort: ${initialPassword}`);
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export function loginUser(username: string, password: string): LoginResult {
  const row = getDb()
    .prepare('SELECT username, password_hash, role FROM users WHERE username = ?')
    .get(username) as { username: string; password_hash: string; role: string } | undefined;

  if (!row) return { success: false, error: 'Benutzer nicht gefunden' };
  if (!bcrypt.compareSync(password, row.password_hash))
    return { success: false, error: 'Falsches Passwort' };

  return { success: true, username: row.username, role: row.role as 'admin' | 'user' };
}

// ── Patients ─────────────────────────────────────────────────────────────────

export function getPatients(): RawPatient[] {
  return (getDb().prepare(`
    SELECT id, encrypted_name, encrypted_geburtsdatum, encrypted_geschlecht,
           encrypted_bildungsjahre, encrypted_neuropsychologin,
           encrypted_aufnahmedatum, encrypted_entlassdatum, encrypted_diagnose, encrypted_lokalisation,
           status, created_by, created_at, updated_at
    FROM patients
    ORDER BY updated_at DESC
  `).all() as Array<Record<string, unknown>>).map(rowToRawPatient);
}

export function getPatient(id: string): { patient: RawPatient; results: RawTestResult[]; encryptedNote: string } | null {
  const row = getDb().prepare(`
    SELECT id, encrypted_name, encrypted_geburtsdatum, encrypted_geschlecht,
           encrypted_bildungsjahre, encrypted_neuropsychologin,
           encrypted_aufnahmedatum, encrypted_entlassdatum, encrypted_diagnose, encrypted_lokalisation,
           status, encrypted_general_note, created_by, created_at, updated_at
    FROM patients WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  const results = (getDb().prepare(`
    SELECT id, patient_id, test_id, date, examiner,
           encrypted_raw_values, encrypted_calculated_values, encrypted_percentile_ranks,
           norm_info, domain_mapping, note, created_by, updated_at
    FROM test_results WHERE patient_id = ?
    ORDER BY date DESC, updated_at DESC
  `).all(id) as Array<Record<string, unknown>>).map(rowToRawTestResult);

  return {
    patient: rowToRawPatient(row),
    results,
    encryptedNote: (row.encrypted_general_note as string) ?? '',
  };
}

export function createPatient(data: PatientCreatePayload): boolean {
  try {
    getDb().prepare(`
      INSERT INTO patients (id, encrypted_name, encrypted_geburtsdatum, encrypted_geschlecht,
        encrypted_bildungsjahre, encrypted_neuropsychologin,
        encrypted_aufnahmedatum, encrypted_entlassdatum, encrypted_diagnose, encrypted_lokalisation,
        status, encrypted_general_note, created_by)
      VALUES (@id, @encryptedName, @encryptedGeburtsdatum, @encryptedGeschlecht,
        @encryptedBildungsjahre, @encryptedNeuropsychologin,
        @encryptedAufnahmedatum, @encryptedEntlassdatum, @encryptedDiagnose, @encryptedLokalisation,
        'aktiv', @encryptedGeneralNote, @createdBy)
    `).run({
      id: data.id,
      encryptedName: data.encryptedName,
      encryptedGeburtsdatum: data.encryptedGeburtsdatum,
      encryptedGeschlecht: data.encryptedGeschlecht,
      encryptedBildungsjahre: data.encryptedBildungsjahre ?? null,
      encryptedNeuropsychologin: data.encryptedNeuropsychologin ?? null,
      encryptedAufnahmedatum: data.encryptedAufnahmedatum ?? null,
      encryptedEntlassdatum: data.encryptedEntlassdatum ?? null,
      encryptedDiagnose: data.encryptedDiagnose ?? null,
      encryptedLokalisation: data.encryptedLokalisation ?? null,
      encryptedGeneralNote: data.encryptedGeneralNote,
      createdBy: data.createdBy ?? null,
    });
    return true;
  } catch {
    return false;
  }
}

export function updatePatient(id: string, updates: PatientUpdatePayload): boolean {
  const sets: string[] = ['updated_at = unixepoch()'];
  const params: Record<string, unknown> = { id };

  if (updates.encryptedName !== undefined) { sets.push('encrypted_name = @encryptedName'); params.encryptedName = updates.encryptedName; }
  if (updates.encryptedGeburtsdatum !== undefined) { sets.push('encrypted_geburtsdatum = @encryptedGeburtsdatum'); params.encryptedGeburtsdatum = updates.encryptedGeburtsdatum; }
  if (updates.encryptedGeschlecht !== undefined) { sets.push('encrypted_geschlecht = @encryptedGeschlecht'); params.encryptedGeschlecht = updates.encryptedGeschlecht; }
  if ('encryptedBildungsjahre' in updates) { sets.push('encrypted_bildungsjahre = @encryptedBildungsjahre'); params.encryptedBildungsjahre = updates.encryptedBildungsjahre ?? null; }
  if ('encryptedNeuropsychologin' in updates) { sets.push('encrypted_neuropsychologin = @encryptedNeuropsychologin'); params.encryptedNeuropsychologin = updates.encryptedNeuropsychologin ?? null; }
  if ('encryptedAufnahmedatum' in updates) { sets.push('encrypted_aufnahmedatum = @encryptedAufnahmedatum'); params.encryptedAufnahmedatum = updates.encryptedAufnahmedatum ?? null; }
  if ('encryptedEntlassdatum' in updates) { sets.push('encrypted_entlassdatum = @encryptedEntlassdatum'); params.encryptedEntlassdatum = updates.encryptedEntlassdatum ?? null; }
  if ('encryptedDiagnose' in updates) { sets.push('encrypted_diagnose = @encryptedDiagnose'); params.encryptedDiagnose = updates.encryptedDiagnose ?? null; }
  if ('encryptedLokalisation' in updates) { sets.push('encrypted_lokalisation = @encryptedLokalisation'); params.encryptedLokalisation = updates.encryptedLokalisation ?? null; }
  if (updates.status !== undefined) { sets.push('status = @status'); params.status = updates.status; }

  if (sets.length === 1) return true; // only updated_at, nothing to do
  getDb().prepare(`UPDATE patients SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return true;
}

export function saveNote(patientId: string, encryptedNote: string): boolean {
  getDb().prepare(
    'UPDATE patients SET encrypted_general_note = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(encryptedNote, patientId);
  return true;
}

// ── Test Results ─────────────────────────────────────────────────────────────

export function saveResult(patientId: string, result: TestResultPayload, createdBy: string | null): boolean {
  try {
    getDb().prepare(`
      INSERT INTO test_results
        (id, patient_id, test_id, date, examiner, encrypted_raw_values,
         encrypted_calculated_values, encrypted_percentile_ranks,
         norm_info, domain_mapping, note, created_by)
      VALUES
        (@id, @patientId, @testId, @date, @examiner, @encryptedRawValues,
         @encryptedCalculatedValues, @encryptedPercentileRanks,
         @normInfo, @domainMapping, @note, @createdBy)
    `).run({
      id: result.id,
      patientId,
      testId: result.testId,
      date: result.date,
      examiner: result.examiner ?? null,
      encryptedRawValues: result.encryptedRawValues,
      encryptedCalculatedValues: result.encryptedCalculatedValues,
      encryptedPercentileRanks: result.encryptedPercentileRanks,
      normInfo: result.normInfo ?? null,
      domainMapping: result.domainMapping ?? null,
      note: result.note ?? null,
      createdBy: createdBy ?? null,
    });
    // Touch patient updated_at so patient list sorts correctly
    getDb().prepare('UPDATE patients SET updated_at = unixepoch() WHERE id = ?').run(patientId);
    return true;
  } catch {
    return false;
  }
}

export function updateResult(patientId: string, result: TestResultPayload): boolean {
  try {
    getDb().prepare(`
      UPDATE test_results SET
        test_id = @testId, date = @date, examiner = @examiner,
        encrypted_raw_values = @encryptedRawValues,
        encrypted_calculated_values = @encryptedCalculatedValues,
        encrypted_percentile_ranks = @encryptedPercentileRanks,
        norm_info = @normInfo, domain_mapping = @domainMapping,
        note = @note, updated_at = unixepoch()
      WHERE id = @id AND patient_id = @patientId
    `).run({
      id: result.id,
      patientId,
      testId: result.testId,
      date: result.date,
      examiner: result.examiner ?? null,
      encryptedRawValues: result.encryptedRawValues,
      encryptedCalculatedValues: result.encryptedCalculatedValues,
      encryptedPercentileRanks: result.encryptedPercentileRanks,
      normInfo: result.normInfo ?? null,
      domainMapping: result.domainMapping ?? null,
      note: result.note ?? null,
    });
    getDb().prepare('UPDATE patients SET updated_at = unixepoch() WHERE id = ?').run(patientId);
    return true;
  } catch {
    return false;
  }
}

export function deleteResult(patientId: string, resultId: string): boolean {
  getDb().prepare('DELETE FROM test_results WHERE id = ? AND patient_id = ?').run(resultId, patientId);
  getDb().prepare('UPDATE patients SET updated_at = unixepoch() WHERE id = ?').run(patientId);
  return true;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export function addAuditEntry(action: string, username: string, patientName?: string, details?: string): void {
  getDb().prepare(
    'INSERT INTO audit_log (action, username, patient_name, details) VALUES (?, ?, ?, ?)'
  ).run(action, username, patientName ?? null, details ?? null);
}

export function getAuditLog(): AuditRow[] {
  return getDb().prepare(
    'SELECT id, action, patient_name as patientName, details, username, timestamp FROM audit_log ORDER BY timestamp DESC LIMIT 500'
  ).all() as AuditRow[];
}

// ── User management ───────────────────────────────────────────────────────────

export function createUser(username: string, password: string, role: 'admin' | 'user'): { success: boolean; error?: string } {
  try {
    getDb().prepare('INSERT INTO users (username, password_hash, role, updated_at) VALUES (?, ?, ?, unixepoch())')
      .run(username, bcrypt.hashSync(password, 10), role);
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg.includes('UNIQUE') ? 'Benutzername bereits vergeben' : msg };
  }
}

export function deleteUser(username: string): { success: boolean; error?: string } {
  if (PROTECTED_USERNAMES.includes(username)) {
    return { success: false, error: 'Systemkonto kann nicht gelöscht werden' };
  }
  const adminCount = (getDb().prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }).c;
  const isAdmin = (getDb().prepare("SELECT role FROM users WHERE username = ?").get(username) as { role: string } | undefined)?.role === 'admin';
  if (isAdmin && adminCount <= 1) {
    return { success: false, error: 'Der letzte Administrator kann nicht gelöscht werden' };
  }
  getDb().prepare('DELETE FROM users WHERE username = ?').run(username);
  return { success: true };
}

// Creates or updates the recovery account with the given plain-text password.
// Called on every DB open so the recovery password stays in sync with the key file.
export function ensureRecoveryUser(password: string): void {
  const hash = bcrypt.hashSync(password, 10);
  getDb().prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES ('recovery', ?, 'admin')
    ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
  `).run(hash);
}

export function isProtectedUser(username: string): boolean {
  return PROTECTED_USERNAMES.includes(username);
}

export function getUsers(): UserRow[] {
  return (getDb().prepare('SELECT username, role, created_at as createdAt FROM users ORDER BY created_at').all() as UserRow[]);
}

export function changePassword(username: string, newPassword: string): boolean {
  getDb().prepare('UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE username = ?')
    .run(bcrypt.hashSync(newPassword, 10), username);
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToRawPatient(row: Record<string, unknown>): RawPatient {
  return {
    id: row.id as string,
    encryptedName: row.encrypted_name as string,
    encryptedGeburtsdatum: row.encrypted_geburtsdatum as string,
    encryptedGeschlecht: row.encrypted_geschlecht as string,
    encryptedBildungsjahre: (row.encrypted_bildungsjahre as string | null) ?? null,
    encryptedNeuropsychologin: (row.encrypted_neuropsychologin as string | null) ?? null,
    encryptedAufnahmedatum: (row.encrypted_aufnahmedatum as string | null) ?? null,
    encryptedEntlassdatum: (row.encrypted_entlassdatum as string | null) ?? null,
    encryptedDiagnose: (row.encrypted_diagnose as string | null) ?? null,
    encryptedLokalisation: (row.encrypted_lokalisation as string | null) ?? null,
    status: row.status as string,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToRawTestResult(row: Record<string, unknown>): RawTestResult {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    testId: row.test_id as string,
    date: row.date as string,
    examiner: (row.examiner as string | null) ?? null,
    encryptedRawValues: row.encrypted_raw_values as string,
    encryptedCalculatedValues: row.encrypted_calculated_values as string,
    encryptedPercentileRanks: row.encrypted_percentile_ranks as string,
    normInfo: (row.norm_info as string | null) ?? null,
    domainMapping: (row.domain_mapping as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    updatedAt: row.updated_at as number,
  };
}
