// Raw DB row shapes (no decryption done in main process)
export interface RawPatient {
  id: string;
  encryptedName: string;
  encryptedGeburtsdatum: string;
  encryptedGeschlecht: string;
  encryptedBildungsjahre: string | null;
  encryptedNeuropsychologin: string | null;
  encryptedMitarbeiter: string | null;
  encryptedAufnahmedatum: string | null;
  encryptedEntlassdatum: string | null;
  encryptedDiagnose: string | null;
  encryptedLokalisation: string | null;
  status: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RawTestResult {
  id: string;
  patientId: string;
  testId: string;       // plain — needed for merge detection
  date: string;         // plain — needed for sorting
  examiner: string | null;
  encryptedRawValues: string;
  encryptedCalculatedValues: string;
  encryptedPercentileRanks: string;
  normInfo: string | null;
  domainMapping: string | null;
  note: string | null;
  createdBy: string | null;
  updatedAt: number;
}

export interface PatientCreatePayload {
  id: string;
  encryptedName: string;
  encryptedGeburtsdatum: string;
  encryptedGeschlecht: string;
  encryptedBildungsjahre: string | null;
  encryptedNeuropsychologin: string | null;
  encryptedMitarbeiter: string | null;
  encryptedAufnahmedatum: string | null;
  encryptedEntlassdatum: string | null;
  encryptedDiagnose: string | null;
  encryptedLokalisation: string | null;
  encryptedGeneralNote: string;
  createdBy: string | null;
}

export interface PatientUpdatePayload {
  encryptedName?: string;
  encryptedGeburtsdatum?: string;
  encryptedGeschlecht?: string;
  encryptedBildungsjahre?: string | null;
  encryptedNeuropsychologin?: string | null;
  encryptedMitarbeiter?: string | null;
  encryptedAufnahmedatum?: string | null;
  encryptedEntlassdatum?: string | null;
  encryptedDiagnose?: string | null;
  encryptedLokalisation?: string | null;
  status?: string;
}

export interface TestResultPayload {
  id: string;
  testId: string;
  date: string;
  examiner?: string | null;
  encryptedRawValues: string;
  encryptedCalculatedValues: string;
  encryptedPercentileRanks: string;
  normInfo?: string;
  domainMapping?: string | null;
  note?: string | null;
}

export interface LoginResult {
  success: boolean;
  username?: string;
  role?: 'admin' | 'user';
  error?: string;
}

export interface UserRow {
  username: string;
  role: string;
  createdAt: number;
}

export interface AuditRow {
  id: string;
  action: string;
  patientName: string | null;
  details: string | null;
  username: string;
  timestamp: number;
}

export interface StartupState {
  phase: 'loading' | 'ready' | 'error';
  error: string;
  warning: string; // Non-fatal: server unreachable, running with local copy
}

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

// The API exposed on window.electronAPI by the preload script
export interface ElectronAPI {
  // Auth
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: (username: string) => Promise<void>;

  // Patients
  getPatients: () => Promise<RawPatient[]>;
  getPatient: (id: string) => Promise<{ patient: RawPatient; results: RawTestResult[]; encryptedNote: string } | null>;
  createPatient: (data: PatientCreatePayload) => Promise<boolean>;
  updatePatient: (id: string, updates: PatientUpdatePayload) => Promise<boolean>;
  deletePatient: (id: string) => Promise<boolean>;

  // PDF folder picker
  pickFolder: () => Promise<string | null>;

  // Test results
  saveResult: (patientId: string, result: TestResultPayload, createdBy: string | null) => Promise<boolean>;
  updateResult: (patientId: string, result: TestResultPayload) => Promise<boolean>;
  deleteResult: (patientId: string, resultId: string) => Promise<boolean>;

  // General note
  saveNote: (patientId: string, encryptedNote: string) => Promise<boolean>;

  // Audit log
  addAuditEntry: (action: string, username: string, patientName?: string, details?: string) => Promise<void>;
  getAuditLog: () => Promise<AuditRow[]>;

  // Admin: user management
  createUser: (username: string, password: string, role: 'admin' | 'user') => Promise<{ success: boolean; error?: string }>;
  deleteUser: (username: string) => Promise<{ success: boolean; error?: string }>;
  getUsers: () => Promise<UserRow[]>;
  changePassword: (username: string, newPassword: string) => Promise<boolean>;
  changeRole: (username: string, newRole: 'admin' | 'user') => Promise<{ success: boolean; error?: string }>;

  // DB path configuration
  getDbPath: () => Promise<string>;
  setDbPath: (newPath: string) => Promise<{ success: boolean; error?: string }>;

  // Encryption key (shared via key file next to the DB)
  getEncryptionKey: () => Promise<string>;

  // Recovery key (emergency admin password stored in .recovery file)
  getRecoveryKey: () => Promise<string>;

  // Startup state (renderer polls until phase === 'ready')
  getStartupState: () => Promise<StartupState>;

  // Sync
  syncPull: () => Promise<{ success: boolean; error?: string }>;
  syncPush: () => Promise<SyncResult>;
  syncGetServerPath: () => Promise<string>;
  syncSetServerPath: (path: string) => Promise<{ success: boolean; error?: string }>;
  syncHasLocalChanges: () => Promise<boolean>;
  syncGetNormsStore: () => Promise<string>;
  syncSetNormsStore: (data: string) => Promise<{ success: boolean; error?: string }>;

  // Textbausteine shared JSON store (next to server DB)
  textbausteinGetStore: () => Promise<string>;
  textbausteinSetStore: (data: string) => Promise<{ success: boolean; error?: string }>;

  // Notifications shared JSON store (next to server DB)
  notificationsGetStore: () => Promise<string>;
  notificationsSetStore: (data: string) => Promise<{ success: boolean; error?: string }>;

  // PDF
  getPdfFolder: () => Promise<string>;
  setPdfFolder: (folder: string) => Promise<{ success: boolean; error?: string }>;
  savePdf: (filename: string, bytes: number[]) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  // Render the print-optimised profile in a hidden window and export it as a vector PDF.
  exportProfilePdf: (patientId: string, filename: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  // Print window → main: print layout has finished rendering (fire-and-forget).
  printReady: () => void;
}
