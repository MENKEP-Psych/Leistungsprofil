import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface SyncResult {
  success: boolean;
  newPatients: number;
  updatedPatients: number;
  newResults: number;
  updatedResults: number;
  newUsers: number;
  newAuditEntries: number;
  error?: string;
}

// Copies the master DB (and its key file) from server to the local working path.
export function pullFromServer(serverDbPath: string, localDbPath: string): void {
  const localDir = path.dirname(localDbPath);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  fs.copyFileSync(serverDbPath, localDbPath);

  // Key file is immutable once created — always overwrite local with server's to stay in sync.
  const serverKeyPath = serverDbPath + '.key';
  if (fs.existsSync(serverKeyPath)) {
    fs.copyFileSync(serverKeyPath, localDbPath + '.key');
  }

  // Recovery file: only copy on first setup (it doesn't change).
  const serverRecoveryPath = serverDbPath + '.recovery';
  const localRecoveryPath = localDbPath + '.recovery';
  if (fs.existsSync(serverRecoveryPath) && !fs.existsSync(localRecoveryPath)) {
    fs.copyFileSync(serverRecoveryPath, localRecoveryPath);
  }
}

// Merges local changes back into the master DB on the server.
// pullTime is a Unix timestamp in SECONDS (matching SQLite's unixepoch()).
// Only records created or modified after pullTime are considered "local changes".
export function pushToServer(serverDbPath: string, localDbPath: string, pullTime: number): SyncResult {
  let serverDb: Database.Database | null = null;
  try {
    serverDb = new Database(serverDbPath);
    serverDb.pragma('journal_mode = DELETE');
    serverDb.pragma('busy_timeout = 10000');
    // Foreign keys must be OFF during the merge to avoid cascade issues when using INSERT OR REPLACE.
    serverDb.pragma('foreign_keys = OFF');

    // Bring server schema up to date (idempotent — mirrors db.ts createSchema migrations).
    // patients
    try { serverDb.exec('ALTER TABLE patients ADD COLUMN encrypted_aufnahmedatum TEXT'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE patients ADD COLUMN encrypted_entlassdatum TEXT'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE patients ADD COLUMN encrypted_diagnose TEXT'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE patients ADD COLUMN encrypted_lokalisation TEXT'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE patients ADD COLUMN encrypted_mitarbeiter TEXT'); } catch { /* already exists */ }
    // test_results columns that may be missing on older DBs
    try { serverDb.exec('ALTER TABLE test_results ADD COLUMN examiner TEXT'); } catch { /* already exists */ }
    try { serverDb.exec("ALTER TABLE test_results ADD COLUMN encrypted_calculated_values TEXT NOT NULL DEFAULT '{}'"); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE test_results ADD COLUMN norm_info TEXT'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE test_results ADD COLUMN domain_mapping TEXT'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE test_results ADD COLUMN note TEXT'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE test_results ADD COLUMN created_by TEXT'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE test_results ADD COLUMN aborted INTEGER'); } catch { /* already exists */ }
    try { serverDb.exec('ALTER TABLE test_results ADD COLUMN abort_comment TEXT'); } catch { /* already exists */ }
    // users
    try { serverDb.exec('ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch())'); } catch { /* already exists */ }

    // SQLite ATTACH accepts forward slashes on all platforms.
    const safeLocal = localDbPath.replace(/\\/g, '/').replace(/'/g, "''");
    serverDb.exec(`ATTACH DATABASE '${safeLocal}' AS local`);

    let newPatients = 0, updatedPatients = 0, newResults = 0, updatedResults = 0;
    let newUsers = 0, newAuditEntries = 0;

    serverDb.transaction(() => {
      // ── Patients ──
      // 1. Insert patients created locally after the last pull.
      newPatients = serverDb!.prepare(`
        INSERT OR IGNORE INTO patients (
          id, encrypted_name, encrypted_geburtsdatum, encrypted_geschlecht,
          encrypted_bildungsjahre, encrypted_neuropsychologin, encrypted_mitarbeiter,
          encrypted_aufnahmedatum, encrypted_entlassdatum,
          encrypted_diagnose, encrypted_lokalisation,
          status, encrypted_general_note, created_by, created_at, updated_at)
        SELECT
          id, encrypted_name, encrypted_geburtsdatum, encrypted_geschlecht,
          encrypted_bildungsjahre, encrypted_neuropsychologin, encrypted_mitarbeiter,
          encrypted_aufnahmedatum, encrypted_entlassdatum,
          encrypted_diagnose, encrypted_lokalisation,
          status, encrypted_general_note, created_by, created_at, updated_at
        FROM local.patients WHERE created_at >= ?
      `).run(pullTime).changes;

      // 2. Update patients that exist on both sides but local version is newer.
      //    Use UPDATE (not INSERT OR REPLACE) to avoid cascading DELETE of test_results.
      updatedPatients = serverDb!.prepare(`
        UPDATE patients
        SET encrypted_name             = lp.encrypted_name,
            encrypted_geburtsdatum     = lp.encrypted_geburtsdatum,
            encrypted_geschlecht       = lp.encrypted_geschlecht,
            encrypted_bildungsjahre    = lp.encrypted_bildungsjahre,
            encrypted_neuropsychologin = lp.encrypted_neuropsychologin,
            encrypted_mitarbeiter      = lp.encrypted_mitarbeiter,
            encrypted_aufnahmedatum    = lp.encrypted_aufnahmedatum,
            encrypted_entlassdatum     = lp.encrypted_entlassdatum,
            encrypted_diagnose         = lp.encrypted_diagnose,
            encrypted_lokalisation     = lp.encrypted_lokalisation,
            encrypted_general_note     = lp.encrypted_general_note,
            status                     = lp.status,
            updated_at                 = lp.updated_at
        FROM local.patients AS lp
        WHERE patients.id = lp.id
          AND lp.updated_at > patients.updated_at
          AND lp.created_at < ?
      `).run(pullTime).changes;

      // ── Test results ──
      // INSERT OR REPLACE is safe here — no other table references test_results.
      // Explicit column list prevents schema-mismatch errors when server DB is older.
      newResults = serverDb!.prepare(`
        INSERT OR IGNORE INTO test_results (
          id, patient_id, test_id, date, examiner,
          encrypted_raw_values, encrypted_calculated_values, encrypted_percentile_ranks,
          norm_info, domain_mapping, note, aborted, abort_comment, created_by, created_at, updated_at)
        SELECT
          id, patient_id, test_id, date, examiner,
          encrypted_raw_values, encrypted_calculated_values, encrypted_percentile_ranks,
          norm_info, domain_mapping, note, aborted, abort_comment, created_by, created_at, updated_at
        FROM local.test_results WHERE created_at >= ?
      `).run(pullTime).changes;

      updatedResults = serverDb!.prepare(`
        INSERT OR REPLACE INTO test_results (
          id, patient_id, test_id, date, examiner,
          encrypted_raw_values, encrypted_calculated_values, encrypted_percentile_ranks,
          norm_info, domain_mapping, note, aborted, abort_comment, created_by, created_at, updated_at)
        SELECT
          lr.id, lr.patient_id, lr.test_id, lr.date, lr.examiner,
          lr.encrypted_raw_values, lr.encrypted_calculated_values, lr.encrypted_percentile_ranks,
          lr.norm_info, lr.domain_mapping, lr.note, lr.aborted, lr.abort_comment, lr.created_by, lr.created_at, lr.updated_at
        FROM local.test_results lr
        INNER JOIN test_results sr ON lr.id = sr.id
        WHERE lr.updated_at > sr.updated_at
          AND lr.created_at < ?
      `).run(pullTime).changes;

      // ── Users (admin may have created new accounts or changed passwords locally) ──
      // 'recovery' is a local-only pseudo-account derived from the key file — never sync it.
      newUsers = serverDb!.prepare(`
        INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at, updated_at)
        SELECT id, username, password_hash, role, created_at, updated_at
        FROM local.users WHERE created_at >= ? AND username != 'recovery'
      `).run(pullTime).changes;

      // Sync password and role changes for existing users when local record is newer.
      serverDb!.prepare(`
        UPDATE users
        SET password_hash = lu.password_hash,
            role          = lu.role,
            updated_at    = lu.updated_at
        FROM local.users lu
        WHERE users.username = lu.username
          AND lu.username    != 'recovery'
          AND lu.updated_at  > users.updated_at
      `).run();

      // ── Audit log ──
      newAuditEntries = serverDb!.prepare(`
        INSERT OR IGNORE INTO audit_log (id, action, patient_name, details, username, timestamp)
        SELECT id, action, patient_name, details, username, timestamp
        FROM local.audit_log WHERE timestamp >= ?
      `).run(pullTime).changes;
    })();

    serverDb.exec('DETACH DATABASE local');
    return { success: true, newPatients, updatedPatients, newResults, updatedResults, newUsers, newAuditEntries };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, newPatients: 0, updatedPatients: 0, newResults: 0, updatedResults: 0, newUsers: 0, newAuditEntries: 0, error };
  } finally {
    if (serverDb) {
      try { serverDb.exec('DETACH DATABASE local'); } catch { /* may already be detached */ }
      serverDb.close();
    }
  }
}

// Checks whether the local DB has any records created or modified after pullTime.
// Used to warn the user before an auto-pull would overwrite unsaved changes.
export function hasLocalChanges(localDbPath: string, pullTime: number): boolean {
  if (!fs.existsSync(localDbPath)) return false;
  let db: Database.Database | null = null;
  try {
    db = new Database(localDbPath, { readonly: true });
    const patients = (db.prepare('SELECT COUNT(*) AS c FROM patients WHERE created_at > ? OR updated_at > ?').get(pullTime, pullTime) as { c: number }).c;
    const results = (db.prepare('SELECT COUNT(*) AS c FROM test_results WHERE created_at > ? OR updated_at > ?').get(pullTime, pullTime) as { c: number }).c;
    return patients + results > 0;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
