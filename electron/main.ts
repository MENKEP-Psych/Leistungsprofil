import { app, BrowserWindow, ipcMain } from 'electron';
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

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

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
    // Reopen with fresh snapshot.
    db.openDatabase(config.dbPath);
    encryptionKey = loadOrCreateEncryptionKey(config.dbPath);
    recoveryKey = loadOrCreateRecoveryKey(config.dbPath);
    db.ensureRecoveryUser(recoveryKey);
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

ipcMain.handle('sync:hasLocalChanges', () => {
  if (!config.pullTime) return false;
  return hasLocalChanges(config.dbPath, config.pullTime);
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

ipcMain.handle('db:saveResult', (_, patientId: string, result: TestResultPayload, createdBy: string | null) =>
  db.saveResult(patientId, result, createdBy)
);
ipcMain.handle('db:updateResult', (_, patientId: string, result: TestResultPayload) =>
  db.updateResult(patientId, result)
);
ipcMain.handle('db:deleteResult', (_, patientId: string, resultId: string) =>
  db.deleteResult(patientId, resultId)
);

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
