export interface Patient {
  id: string; // internal DB key, not displayed
  name: string;
  geburtsdatum: string;
  geschlecht: 'm' | 'w' | 'd';
  bildungsjahre?: number;
  status: 'aktiv' | 'entlassen';
  age: number; // calculated from geburtsdatum + last test date
  mitarbeiter: string[];
  neuropsychologin?: string;
  aufnahmedatum?: string; // YYYY-MM-DD
  entlassdatum?: string;  // YYYY-MM-DD
  diagnose?: string[];
  /** Lokalisations-Auswahl je Diagnose (Diagnose-Text → serialisierte Gruppen-Auswahl). */
  lokalisation?: Record<string, string>;
  createdBy?: string;
  /** Notiz zur nächsten Sitzung, gesetzt über "Sitzung beenden" im Leistungsprofil-Tab. */
  nextSessionNote?: string;
  /** Ids der für die nächste Sitzung geplanten Test-Slots (s. STANDARD_TESTS/REST_TESTS). */
  nextSessionTestIds?: string[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  username: string;
  action:
    | 'LOGIN'
    | 'LOGOUT'
    | 'PATIENT_CREATED'
    | 'PATIENT_UPDATED'
    | 'PATIENT_DISCHARGED'
    | 'TEST_SAVED'
    | 'TEST_UPDATED'
    | 'RESULT_DELETED';
  patientName?: string;
  details?: string;
}

export interface Notification {
  id: string;
  fromUser: string;
  toUser: string;
  message: string;
  patientName?: string;
  isRead: boolean;
  createdAt: string;
  autoSent?: boolean;
}

export interface PRResult {
  label: string;
  currentPr: number | string;
  previousPr?: number | string;
  previousPrs?: (number | string)[];
  date?: string;
  prevDate?: string;
  domain?: string;
  subdomain?: string;
  testGroup?: string;
  details?: string[];
  previousDetails?: string[];
  note?: string;
  tapVersion?: 'M' | '2.3';
  lpsKorrektur?: string;
  aborted?: boolean;
  abortComment?: string;
  prevAborted?: boolean;
  prevAbortComment?: string;
}

export interface TestResult {
  id: string;
  testId: string;
  date: string;
  rawValues: Record<string, number | string>;
  calculatedValues: Record<string, number | string>;
  percentileRanks: Record<string, number | string>;
  normInfo: string;
  examiner?: string;
  domainMapping?: Record<string, string>;
  note?: string;
  aborted?: boolean;
  abortComment?: string;
}

export interface TestConfig {
  id: string;
  name: string;
  shortName: string;
  fields: TestField[];
  calculations: (raw: Record<string, number>) => Record<string, number>;
  getNorms: (
    age: number,
    calculated: Record<string, number>
  ) => { prs: Record<string, number | string>; info: string };
}

export interface TestField {
  id: string;
  label: string;
  type: 'number' | 'text' | 'select';
  unit?: string;
  required: boolean;
  min?: number;
  max?: number;
}
