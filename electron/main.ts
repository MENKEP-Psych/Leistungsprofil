import { app, BrowserWindow, ipcMain, dialog, type IpcMainEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import * as db from './db';
import { pullFromServer, pushToServer, hasLocalChanges } from './sync';
import type { PatientCreatePayload, PatientUpdatePayload, TestResultPayload } from '../src/lib/ipc-types';

const isDev = !app.isPackaged;

// ── Config ────────────────────────────────────────────────────────────────────

interface AppConfig {
  dbPath: string;
  serverDbPath?: string; // Path to master DB on the server share (e.g. G:\LP\leistungsprofil.sqlite)
  pullTime?: number;     // Unix timestamp (seconds) of the last successful pull
  pdfFolder?: string;   // Default folder for PDF exports
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return JSON.parse(raw) as AppConfig;
  } catch {
    return { dbPath: path.join(app.getPath('userData'), 'leistungsprofil.sqlite') };
  }
}

function saveConfig(cfg: AppConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

// Try to read a centrally-managed server-config.json placed next to the master DB.
// Admins can update this one file to change the DB path for all clients at once.
function tryReadServerConfig(serverDbPath: string): Partial<AppConfig> {
  try {
    const dir = path.dirname(serverDbPath);
    const cfgPath = path.join(dir, 'server-config.json');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    return JSON.parse(raw) as Partial<AppConfig>;
  } catch {
    return {};
  }
}

let config = loadConfig();

// ── Pending deletions (survives DB file replacement on pull) ──────────────────

interface PendingDeletion {
  type: 'result' | 'patient';
  id: string;
  patientId?: string; // only for results
  deletedAt: number;  // unix seconds
}

function getPendingDeletionsPath(): string {
  return path.join(app.getPath('userData'), 'pending-deletions.json');
}

function loadPendingDeletions(): PendingDeletion[] {
  try {
    return JSON.parse(fs.readFileSync(getPendingDeletionsPath(), 'utf8')) as PendingDeletion[];
  } catch { return []; }
}

function savePendingDeletions(list: PendingDeletion[]): void {
  fs.writeFileSync(getPendingDeletionsPath(), JSON.stringify(list), 'utf8');
}

function addPendingDeletion(entry: PendingDeletion): void {
  const list = loadPendingDeletions();
  if (!list.some(e => e.type === entry.type && e.id === entry.id)) {
    list.push(entry);
    savePendingDeletions(list);
  }
}

function applyPendingDeletionsToDb(dbFilePath: string, deletions: PendingDeletion[]): void {
  if (deletions.length === 0) return;
  let localDb: import('better-sqlite3').Database | null = null;
  try {
    const Database = require('better-sqlite3');
    localDb = new Database(dbFilePath);
    for (const d of deletions) {
      if (d.type === 'result' && d.patientId) {
        localDb!.prepare('DELETE FROM test_results WHERE id = ? AND patient_id = ?').run(d.id, d.patientId);
        localDb!.prepare('UPDATE patients SET updated_at = unixepoch() WHERE id = ?').run(d.patientId);
      } else if (d.type === 'patient') {
        localDb!.prepare('DELETE FROM patients WHERE id = ?').run(d.id);
      }
    }
  } catch { /* ignore */ } finally {
    localDb?.close();
  }
}

function applyPendingDeletionsToServer(serverDbPath: string, deletions: PendingDeletion[]): void {
  if (deletions.length === 0) return;
  let serverDb: import('better-sqlite3').Database | null = null;
  try {
    const Database = require('better-sqlite3');
    serverDb = new Database(serverDbPath);
    serverDb!.pragma('foreign_keys = OFF');
    serverDb!.pragma('busy_timeout = 10000');
    const del = serverDb!.transaction(() => {
      for (const d of deletions) {
        if (d.type === 'result' && d.patientId) {
          serverDb!.prepare('DELETE FROM test_results WHERE id = ? AND patient_id = ?').run(d.id, d.patientId);
          serverDb!.prepare('UPDATE patients SET updated_at = unixepoch() WHERE id = ?').run(d.patientId);
        } else if (d.type === 'patient') {
          serverDb!.prepare('DELETE FROM patients WHERE id = ?').run(d.id);
        }
      }
    });
    del();
  } catch { /* ignore */ } finally {
    serverDb?.close();
  }
}

// ── Startup state (polled by renderer to show loading screen) ─────────────────

type StartupPhase = 'loading' | 'ready' | 'error';

let startupPhase: StartupPhase = 'loading';
let startupError = '';
let startupWarning = ''; // Non-fatal: server unreachable, continuing with local copy

// ── Encryption & recovery keys ────────────────────────────────────────────────

let encryptionKey = '';
let recoveryKey = '';

function getKeyFilePath(dbPath: string): string {
  return dbPath + '.key';
}

function loadOrCreateEncryptionKey(dbPath: string): string {
  const keyPath = getKeyFilePath(dbPath);
  try {
    const existing = fs.readFileSync(keyPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch { /* create below */ }
  const key = randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, key, 'utf8');
  return key;
}

function loadOrCreateRecoveryKey(dbPath: string): string {
  const recoveryPath = dbPath + '.recovery';
  try {
    const existing = fs.readFileSync(recoveryPath, 'utf8').trim();
    if (existing.length >= 12) return existing;
  } catch { /* create below */ }
  const key = [
    randomBytes(2).toString('hex').toUpperCase(),
    randomBytes(2).toString('hex').toUpperCase(),
    randomBytes(2).toString('hex').toUpperCase(),
    randomBytes(2).toString('hex').toUpperCase(),
  ].join('-');
  fs.writeFileSync(recoveryPath, key, 'utf8');
  return key;
}

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Leistungsprofil',
    backgroundColor: '#0f172a', // Match app dark background to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.maximize();
  mainWindow.webContents.session.setSpellCheckerLanguages(['de', 'de-DE']);

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (isDev) return; // No confirm in dev mode
    e.preventDefault();
    dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['Beenden', 'Abbrechen'],
      defaultId: 1,
      cancelId: 1,
      title: 'Leistungsprofil beenden',
      message: 'Möchten Sie die Anwendung wirklich schließen?',
      detail: 'Stellen Sie sicher, dass alle Änderungen synchronisiert wurden.',
    }).then(({ response }) => {
      if (response === 0) {
        mainWindow?.destroy();
      }
    });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Startup sequence ──────────────────────────────────────────────────────────

function doStartup(): void {
  config = loadConfig();

  // Allow a centrally-managed server-config.json to override the server DB path.
  if (config.serverDbPath) {
    const override = tryReadServerConfig(config.serverDbPath);
    if (override.serverDbPath && override.serverDbPath !== config.serverDbPath) {
      config.serverDbPath = override.serverDbPath;
      saveConfig(config);
    }
  }

  // Pull from server if a server path is configured.
  if (config.serverDbPath) {
    const localChanges = config.pullTime
      ? hasLocalChanges(config.dbPath, config.pullTime)
      : false;

    if (localChanges) {
      // Protect unsaved local changes: skip auto-pull and show a warning.
      startupWarning = 'Sie haben ungespeicherte lokale Änderungen. Bitte erst synchronisieren, dann aktualisieren.';
    } else {
      try {
        pullFromServer(config.serverDbPath, config.dbPath);
        config.pullTime = Math.floor(Date.now() / 1000);
        saveConfig(config);
      } catch (err) {
        // Server unreachable — continue with the last local copy.
        startupWarning = `Server nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  // Open local DB (either freshly pulled or last known state).
  try {
    db.openDatabase(config.dbPath);
    encryptionKey = loadOrCreateEncryptionKey(config.dbPath);
    recoveryKey = loadOrCreateRecoveryKey(config.dbPath);
    db.ensureRecoveryUser(recoveryKey);
    // Re-apply any pending deletions (they may have been wiped by the pull).
    db.applyPendingDeletions(loadPendingDeletions());
    startupPhase = 'ready';
  } catch (err) {
    startupError = err instanceof Error ? err.message : String(err);
    startupPhase = 'error';
  }
}

app.whenReady().then(() => {
  // Create the window first so it can show a loading screen immediately.
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Defer startup work by one tick so the window starts rendering before we potentially block.
  setImmediate(doStartup);
});

app.on('window-all-closed', () => {
  db.closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: Startup state ────────────────────────────────────────────────────────

ipcMain.handle('db:getStartupState', () => ({
  phase: startupPhase,
  error: startupError,
  warning: startupWarning,
}));

// ── IPC: Sync ─────────────────────────────────────────────────────────────────

ipcMain.handle('sync:pull', () => {
  if (!config.serverDbPath) return { success: false, error: 'Kein Server-Pfad konfiguriert' };
  try {
    const localChanges = config.pullTime ? hasLocalChanges(config.dbPath, config.pullTime) : false;
    if (localChanges) {
      return { success: false, error: 'Ungespeicherte lokale Änderungen — bitte erst synchronisieren.' };
    }
    // Close local DB before replacing the file.
    db.closeDatabase();
    pullFromServer(config.serverDbPath, config.dbPath);
    config.pullTime = Math.floor(Date.now() / 1000);
    saveConfig(config);
    // Reopen with fresh snapshot, then re-apply pending deletions.
    db.openDatabase(config.dbPath);
    encryptionKey = loadOrCreateEncryptionKey(config.dbPath);
    recoveryKey = loadOrCreateRecoveryKey(config.dbPath);
    db.ensureRecoveryUser(recoveryKey);
    db.applyPendingDeletions(loadPendingDeletions());
    return { success: true };
  } catch (err) {
    // Make sure DB is open even on error.
    try { db.openDatabase(config.dbPath); } catch { /* ignore */ }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('sync:push', () => {
  if (!config.serverDbPath) return { success: false, error: 'Kein Server-Pfad konfiguriert', newPatients: 0, updatedPatients: 0, newResults: 0, updatedResults: 0, newUsers: 0, newAuditEntries: 0 };
  const pullTime = config.pullTime ?? 0;
  // Apply pending deletions to server before pushing so they propagate.
  const pendingDels = loadPendingDeletions();
  applyPendingDeletionsToServer(config.serverDbPath, pendingDels);
  const result = pushToServer(config.serverDbPath, config.dbPath, pullTime);
  if (result.success) {
    // After a successful push, pull the master DB back so the local copy reflects
    // all changes from other clients that were already on the server.
    try {
      db.closeDatabase();
      pullFromServer(config.serverDbPath, config.dbPath);
    } finally {
      db.openDatabase(config.dbPath);
    }
    // Re-apply pending deletions to freshly-pulled local DB, then clear them.
    db.applyPendingDeletions(pendingDels);
    savePendingDeletions([]);
    config.pullTime = Math.floor(Date.now() / 1000);
    saveConfig(config);
  }
  return result;
});

ipcMain.handle('sync:getServerPath', () => config.serverDbPath ?? '');

ipcMain.handle('sync:setServerPath', (_, newServerPath: string) => {
  try {
    config.serverDbPath = newServerPath || undefined;
    config.pullTime = undefined; // Reset so the next startup pulls fresh.
    saveConfig(config);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('config:getPdfFolder', () => config.pdfFolder ?? '');

ipcMain.handle('config:setPdfFolder', (_, folder: string) => {
  try {
    config.pdfFolder = folder || undefined;
    saveConfig(config);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Write PDF bytes to disk. If a default PDF folder is configured, skip the
// dialog and save directly; otherwise show a native save dialog.
// Returns { success: true, filePath } or { success: false, error|canceled }.
async function writePdf(
  filename: string,
  buffer: Buffer,
): Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }> {
  const folderSet = config.pdfFolder && fs.existsSync(config.pdfFolder);
  if (folderSet) {
    const filePath = path.join(config.pdfFolder!, filename);
    try {
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  const defaultDir = app.getPath('documents');
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'PDF speichern',
    defaultPath: path.join(defaultDir, filename),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Legacy path: renderer hands over pre-rendered PDF bytes (rasterised screenshot
// export / web fallback). Kept for non-print code paths.
ipcMain.handle('dialog:savePdf', async (_, filename: string, bytes: number[]) =>
  writePdf(filename, Buffer.from(bytes)),
);

// Fehlerbericht-Export: anonymisierten Fall als JSON-Datei speichern. Fragt
// IMMER nach dem Speicherort (anders als writePdf, das einen konfigurierten
// Ordner überspringen kann) — der Nutzer soll bei jedem Bericht bewusst
// entscheiden, wohin die Datei geht. Default: Desktop des angemeldeten Windows-Nutzers.
ipcMain.handle('dialog:saveJson', async (_, filename: string, content: string) => {
  const defaultDir = app.getPath('desktop');
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Fehlerbericht speichern',
    defaultPath: path.join(defaultDir, filename),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Vector PDF export: render the print-optimised profile in a hidden window and
// capture it with webContents.printToPDF (selectable text, crisp lines, legend
// on every page). The window fetches the patient itself via the db IPC.
ipcMain.handle('pdf:exportProfile', async (_evt, patientId: string, filename: string) => {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    // Resolve once the print window signals its layout + fonts have settled.
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ipcMain.removeListener('print:ready', onReady);
        reject(new Error('Zeitüberschreitung beim Rendern des PDFs'));
      }, 8000);
      const onReady = (e: IpcMainEvent) => {
        if (e.sender !== win.webContents) return; // ignore signals from other windows
        clearTimeout(timeout);
        ipcMain.removeListener('print:ready', onReady);
        resolve();
      };
      ipcMain.on('print:ready', onReady);
    });

    if (isDev) {
      await win.loadURL(`http://localhost:3000/?print=1&patient=${encodeURIComponent(patientId)}`);
    } else {
      await win.loadFile(path.join(__dirname, '../../dist/index.html'), {
        query: { print: '1', patient: patientId },
      });
    }

    await ready;

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true, // honour @page size + margins from print.css
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px; width:100%; padding:0 10mm; text-align:right; color:#64748b; font-family: Arial, sans-serif;">Seite <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });

    return await writePdf(filename, pdf);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    win.destroy();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PDF Experimental — full copy of the pdf:exportProfile handler above.
//
// Independent export pipeline so the experimental PDF layout can be reworked
// without risking the production export. Only difference: it loads the hidden
// window with `?print=exp` (→ PrintProfileAppExperimental + print-experimental.css).
// The low-level writePdf / PDF-folder plumbing is shared on purpose.
// See src/lib/featureFlags.ts (PDF_EXPERIMENTAL_ENABLED) for the full file list.
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('pdf:exportProfileExperimental', async (_evt, patientId: string, filename: string) => {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    // Resolve once the print window signals its layout + fonts have settled.
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ipcMain.removeListener('print:ready', onReady);
        reject(new Error('Zeitüberschreitung beim Rendern des PDFs'));
      }, 8000);
      const onReady = (e: IpcMainEvent) => {
        if (e.sender !== win.webContents) return; // ignore signals from other windows
        clearTimeout(timeout);
        ipcMain.removeListener('print:ready', onReady);
        resolve();
      };
      ipcMain.on('print:ready', onReady);
    });

    if (isDev) {
      await win.loadURL(`http://localhost:3000/?print=exp&patient=${encodeURIComponent(patientId)}`);
    } else {
      await win.loadFile(path.join(__dirname, '../../dist/index.html'), {
        query: { print: 'exp', patient: patientId },
      });
    }

    await ready;

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true, // honour @page size + margins from print-experimental.css
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px; width:100%; padding:0 10mm; text-align:right; color:#64748b; font-family: Arial, sans-serif;">Seite <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });

    return await writePdf(filename, pdf);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    win.destroy();
  }
});

// Open native folder picker dialog.
ipcMain.handle('dialog:pickFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Ordner auswählen',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('sync:hasLocalChanges', () => {
  if (!config.pullTime) return false;
  return hasLocalChanges(config.dbPath, config.pullTime);
});

ipcMain.handle('sync:getNormsStore', () => {
  if (!config.serverDbPath) return '';
  try {
    const filePath = path.join(path.dirname(config.serverDbPath), 'normen_verifikation.json');
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch { return ''; }
});

ipcMain.handle('sync:setNormsStore', (_, data: string) => {
  if (!config.serverDbPath) return { success: false, error: 'Kein Server-Pfad konfiguriert' };
  try {
    const filePath = path.join(path.dirname(config.serverDbPath), 'normen_verifikation.json');
    fs.writeFileSync(filePath, data, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('textbaustein:getStore', () => {
  if (!config.serverDbPath) return '';
  try {
    const filePath = path.join(path.dirname(config.serverDbPath), 'textbausteine.json');
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch { return ''; }
});

ipcMain.handle('textbaustein:setStore', (_, data: string) => {
  if (!config.serverDbPath) return { success: false, error: 'Kein Server-Pfad konfiguriert' };
  try {
    const filePath = path.join(path.dirname(config.serverDbPath), 'textbausteine.json');
    fs.writeFileSync(filePath, data, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Benachrichtigungen als gemeinsame JSON-Datei neben der Server-DB (geräteübergreifend)
ipcMain.handle('notifications:getStore', () => {
  if (!config.serverDbPath) return '';
  try {
    const filePath = path.join(path.dirname(config.serverDbPath), 'notifications.json');
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch { return ''; }
});

ipcMain.handle('notifications:setStore', (_, data: string) => {
  if (!config.serverDbPath) return { success: false, error: 'Kein Server-Pfad konfiguriert' };
  try {
    const filePath = path.join(path.dirname(config.serverDbPath), 'notifications.json');
    fs.writeFileSync(filePath, data, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// ── IPC: Database ─────────────────────────────────────────────────────────────

ipcMain.handle('db:login', (_, username: string, password: string) =>
  db.loginUser(username, password)
);

ipcMain.handle('db:logout', (_, username: string) => {
  db.addAuditEntry('LOGOUT', username);
});

ipcMain.handle('db:getPatients', () => db.getPatients());
ipcMain.handle('db:getPatient', (_, id: string) => db.getPatient(id));
ipcMain.handle('db:createPatient', (_, data: PatientCreatePayload) => db.createPatient(data));
ipcMain.handle('db:updatePatient', (_, id: string, updates: PatientUpdatePayload) => db.updatePatient(id, updates));

ipcMain.handle('db:deletePatient', (_, id: string) => {
  const ok = db.deletePatient(id);
  if (ok) addPendingDeletion({ type: 'patient', id, deletedAt: Math.floor(Date.now() / 1000) });
  return ok;
});

ipcMain.handle('db:saveResult', (_, patientId: string, result: TestResultPayload, createdBy: string | null) =>
  db.saveResult(patientId, result, createdBy)
);
ipcMain.handle('db:updateResult', (_, patientId: string, result: TestResultPayload) =>
  db.updateResult(patientId, result)
);
ipcMain.handle('db:deleteResult', (_, patientId: string, resultId: string) => {
  const ok = db.deleteResult(patientId, resultId);
  if (ok) addPendingDeletion({ type: 'result', id: resultId, patientId, deletedAt: Math.floor(Date.now() / 1000) });
  return ok;
});

ipcMain.handle('db:saveNote', (_, patientId: string, encryptedNote: string) =>
  db.saveNote(patientId, encryptedNote)
);

ipcMain.handle('db:addAuditEntry', (_, action: string, username: string, patientName?: string, details?: string) => {
  db.addAuditEntry(action, username, patientName, details);
});
ipcMain.handle('db:getAuditLog', () => db.getAuditLog());

ipcMain.handle('db:createUser', (_, username: string, password: string, role: 'admin' | 'user') =>
  db.createUser(username, password, role)
);
ipcMain.handle('db:deleteUser', (_, username: string) => db.deleteUser(username));
ipcMain.handle('db:getUsers', () => db.getUsers());
ipcMain.handle('db:changePassword', (_, username: string, newPassword: string) =>
  db.changePassword(username, newPassword)
);
ipcMain.handle('db:changeRole', (_, username: string, newRole: 'admin' | 'user') =>
  db.changeRole(username, newRole)
);

ipcMain.handle('db:getDbPath', () => config.dbPath);

ipcMain.handle('db:getEncryptionKey', () => encryptionKey);
ipcMain.handle('db:getRecoveryKey', () => recoveryKey);

ipcMain.handle('db:setDbPath', async (_, newPath: string) => {
  try {
    db.closeDatabase();
    db.openDatabase(newPath);
    encryptionKey = loadOrCreateEncryptionKey(newPath);
    recoveryKey = loadOrCreateRecoveryKey(newPath);
    db.ensureRecoveryUser(recoveryKey);
    config = { ...config, dbPath: newPath };
    saveConfig(config);
    return { success: true };
  } catch (err) {
    try {
      db.openDatabase(config.dbPath);
      encryptionKey = loadOrCreateEncryptionKey(config.dbPath);
      recoveryKey = loadOrCreateRecoveryKey(config.dbPath);
      db.ensureRecoveryUser(recoveryKey);
    } catch { /* ignore */ }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
