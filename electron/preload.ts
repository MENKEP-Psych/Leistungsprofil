import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../src/lib/ipc-types';

const api: ElectronAPI = {
  // Auth
  login: (u, p) => ipcRenderer.invoke('db:login', u, p),
  logout: (u) => ipcRenderer.invoke('db:logout', u),

  // Patients
  getPatients: () => ipcRenderer.invoke('db:getPatients'),
  getPatient: (id) => ipcRenderer.invoke('db:getPatient', id),
  createPatient: (data) => ipcRenderer.invoke('db:createPatient', data),
  updatePatient: (id, updates) => ipcRenderer.invoke('db:updatePatient', id, updates),

  // Test results
  saveResult: (pid, r, by) => ipcRenderer.invoke('db:saveResult', pid, r, by),
  updateResult: (pid, r) => ipcRenderer.invoke('db:updateResult', pid, r),
  deleteResult: (pid, rid) => ipcRenderer.invoke('db:deleteResult', pid, rid),

  // General note
  saveNote: (pid, note) => ipcRenderer.invoke('db:saveNote', pid, note),

  // Audit
  addAuditEntry: (action, user, pName, details) => ipcRenderer.invoke('db:addAuditEntry', action, user, pName, details),
  getAuditLog: () => ipcRenderer.invoke('db:getAuditLog'),

  // User management
  createUser: (u, p, r) => ipcRenderer.invoke('db:createUser', u, p, r),
  deleteUser: (u) => ipcRenderer.invoke('db:deleteUser', u),
  getUsers: () => ipcRenderer.invoke('db:getUsers'),
  changePassword: (u, p) => ipcRenderer.invoke('db:changePassword', u, p),
  changeRole: (u, r) => ipcRenderer.invoke('db:changeRole', u, r),

  // DB path configuration (local working copy)
  getDbPath: () => ipcRenderer.invoke('db:getDbPath'),
  setDbPath: (p) => ipcRenderer.invoke('db:setDbPath', p),

  // Encryption / recovery keys
  getEncryptionKey: () => ipcRenderer.invoke('db:getEncryptionKey'),
  getRecoveryKey: () => ipcRenderer.invoke('db:getRecoveryKey'),

  // Startup state (renderer polls this to show loading screen)
  getStartupState: () => ipcRenderer.invoke('db:getStartupState'),

  // Sync
  syncPull: () => ipcRenderer.invoke('sync:pull'),
  syncPush: () => ipcRenderer.invoke('sync:push'),
  syncGetServerPath: () => ipcRenderer.invoke('sync:getServerPath'),
  syncSetServerPath: (p) => ipcRenderer.invoke('sync:setServerPath', p),
  syncHasLocalChanges: () => ipcRenderer.invoke('sync:hasLocalChanges'),

  // PDF
  getPdfFolder: () => ipcRenderer.invoke('config:getPdfFolder'),
  setPdfFolder: (folder) => ipcRenderer.invoke('config:setPdfFolder', folder),
  savePdf: (filename, bytes) => ipcRenderer.invoke('dialog:savePdf', filename, bytes),
};

contextBridge.exposeInMainWorld('electronAPI', api);
