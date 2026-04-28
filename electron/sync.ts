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

    // SQLite ATTACH accepts forward slashes on all platforms.
    const safeLocal = localDbPath.replace(/\\/g, '/').replace(/'/g, "''");
    serverDb.exec(`ATTACH DATABASE '${safeLocal}' AS local`);

    let newPatients = 0, updatedPatients = 0, newResults = 0, updatedResults = 0;
    let newUsers = 0, newAuditEntries = 0;

    serverDb.transaction(() => {
      // ── Patients ──
      // 1. Insert patients created locally after the last pull.
      newPatients = serverDb!.prepare(`
        INSERT OR IGNORE INTO patients
        SELECT * FROM local.patients WHERE created_at >= ?
      `).run(pullTime).changes;

      // 2. Update patients that exist on both sides but local version is newer.
      //    Use UPDATE (not INSERT OR REPLACE) to avoid cascading DELETE of test_results.
      updatedPatients = serverDb!.prepare(`
        UPDATE patients
        SET encrypted_name           = lp.encrypted_name,
            encrypted_geburtsdatum   = lp.encrypted_geburtsdatum,
            encrypted_geschlecht     = lp.encrypted_geschlecht,
            encrypted_bildungsjahre  = lp.encrypted_bildungsjahre,
            encrypted_neuropsychologin = lp.encrypted_neuropsychologin,
            encrypted_aufnahmedatum  = lp.encrypted_aufnahmedatum,
            encrypted_entlassdatum   = lp.encrypted_entlassdatum,
            encrypted_general_note   = lp.encrypted_general_note,
            status                   = lp.status,
            updated_at               = lp.updated_at
        FROM local.patients AS lp
        WHERE patients.id = lp.id
          AND lp.updated_at > patients.updated_at
          AND lp.created_at < ?
      `).run(pullTime).changes;

      // ── Test results ──
      // INSERT OR REPLACE is safe here — no other table references test_results.
      newResults = serverDb!.prepare(`
        INSERT OR IGNORE INTO test_results
        SELECT * FROM local.test_results WHERE created_at >= ?
      `).run(pullTime).changes;

      updatedResults = serverDb!.prepare(`
        INSERT OR REPLACE INTO test_results
        SELECT lr.*
        FROM local.test_results lr
        INNER JOIN test_results sr ON lr.id = sr.id
        WHERE lr.updated_at > sr.updated_at
          AND lr.created_at < ?
      `).run(pullTime).changes;

      // ── Users (admin may have created new accounts locally) ──
      newUsers = serverDb!.prepare(`
        INSERT OR IGNORE INTO users
        SELECT * FROM local.users WHERE created_at >= ?
      `).run(pullTime).changes;

      // ── Audit log ──
      newAuditEntries = serverDb!.prepare(`
        INSERT OR IGNORE INTO audit_log
        SELECT * FROM local.audit_log WHERE timestamp >= ?
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
    const patients = (db.prepare('SELECT COUNT(*) AS c FROM patients WHERE created_at >= ? OR updated_at >= ?').get(pullTime, pullTime) as { c: number }).c;
    const results = (db.prepare('SELECT COUNT(*) AS c FROM test_results WHERE created_at >= ? OR updated_at >= ?').get(pullTime, pullTime) as { c: number }).c;
    return patients + results > 0;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
