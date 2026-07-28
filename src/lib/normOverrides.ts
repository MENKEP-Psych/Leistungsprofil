// Singleton registry for PR-level norm overrides.
// Key format: `${testId}|${subtype}|${String(rohwert)}|${ageGroupLabel}`
// where ageGroupLabel matches the column headers in NormenVerifizierenTab.

export interface NormOverrideEntry {
  value: string | number;
  oldValue: string | number; // original JSON-computed value (preserved on subsequent edits)
  changedBy: string;
  changedAt: string; // ISO date
}

export type NormOverrides = Record<string, NormOverrideEntry>;
export type NormAssignments = Record<string, string>; // testId → responsible employee

export interface NormsConfigData {
  version: 2;
  verification: Record<string, { status: 'unverified' | 'verified' | 'incorrect'; date: string; verifiedBy?: string }>;
  overrides: NormOverrides;
  assignments: NormAssignments;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _registry: NormOverrides = {};

export function getNormOverrides(): NormOverrides { return _registry; }
export function setNormOverrideRegistry(o: NormOverrides): void { _registry = { ...o }; }

// ── Key helpers ───────────────────────────────────────────────────────────────

export function makeNormKey(
  testId: string,
  subtype: string,
  rohwert: string | number,
  ageGroup: string,
): string {
  return `${testId}|${subtype}|${String(rohwert)}|${ageGroup}`;
}

// Returns the overridden value if one exists, otherwise the fallback.
export function getOverriddenPR(
  key: string,
  fallback: string | number | null | undefined,
): string | number | null | undefined {
  const entry = _registry[key];
  return entry !== undefined ? entry.value : fallback;
}
