// ── "Was ist neu?"-System (Spotlight-Tour) ──────────────────────────────────
//
// Wiederverwendbar: jeder Eintrag in ONBOARDING_ENTRIES ist eine mehrschrittige
// Tour, die jedem Nutzer genau einmal komplett gezeigt wird (Fortschritt pro
// Login-Name in localStorage, analog zum bestehenden
// `christmas_notification_shown_${year}_${user}`-Muster in App.tsx). Für einen
// neuen Hinweis reicht es, unten einen weiteren Eintrag anzuhängen.
//
// Jeder Schritt zeigt auf ein Element im DOM über `data-onboarding="<targetId>"`.
// Voraussetzung: das Zielelement muss sichtbar sein, wenn die Tour aktiv ist
// (siehe `canRunTour` in App.tsx — die aktuelle Tour setzt voraus, dass ein
// Patient geöffnet ist).
//
// Schließt der Nutzer die Tour vorzeitig (X), wird der aktuelle Schritt
// gespeichert und die Tour setzt beim nächsten Öffnen eines Patienten dort
// fort — sie gilt erst als "gesehen", wenn der letzte Schritt bestätigt wurde.
//
// Im Dev-Modus (import.meta.env.DEV) wird die neueste Tour immer von Schritt 1
// an gezeigt, unabhängig vom gespeicherten Fortschritt.

export interface OnboardingStep {
  /** Muss zu einem `data-onboarding="<targetId>"`-Attribut im DOM passen. */
  targetId: string;
  title: string;
  body: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

export interface OnboardingEntry {
  id: string;
  steps: OnboardingStep[];
}

// Älteste zuerst — bei mehreren ungesehenen Einträgen wird chronologisch vorgegangen.
export const ONBOARDING_ENTRIES: OnboardingEntry[] = [
  {
    id: '2026-08-testuebersicht-und-fehlermeldung',
    steps: [
      {
        targetId: 'test-sidebar',
        placement: 'right',
        title: 'Testübersicht neu',
        body: 'Die farbigen Kreise/Zahlen neben den Testnamen sind weg. Stattdessen werden '
          + 'bereits durchgeführte Tests jetzt ausgegraut dargestellt, offene Tests bleiben '
          + 'hervorgehoben — auf einen Blick ist klar, was noch fehlt.',
      },
      {
        targetId: 'next-session-btn',
        placement: 'top',
        title: 'Nächste Sitzung planen',
        body: 'Dieser Button (nur sichtbar, wenn ein Patient geöffnet ist) schaltet einen '
          + 'Markiermodus ein: Tests in der linken Leiste anklicken, um sie für den nächsten '
          + 'Termin vorzumerken. Die Markierung verschwindet automatisch, sobald der jeweilige '
          + 'Test durchgeführt und gespeichert wurde — händisch entfernen ist nicht nötig.',
      },
      {
        targetId: 'bug-report-btn',
        placement: 'bottom',
        title: 'Fehler melden',
        body: 'Neu: Beschreibe, was passieren sollte und was stattdessen passiert ist — die '
          + 'App speichert daraus automatisch eine anonymisierte Version des Falls (Name, '
          + 'Geburtsdatum, Diagnose und alle Freitext-Notizen werden entfernt) als Datei, die '
          + 'du gefahrlos per E-Mail weiterleiten kannst.',
      },
    ],
  },
];

interface Progress {
  doneIds: string[];
  current?: { id: string; step: number };
}

const isDev = import.meta.env.DEV;

function storageKey(username: string): string {
  return `onboarding_progress_${username}`;
}

function getProgress(username: string): Progress {
  try {
    const raw = localStorage.getItem(storageKey(username));
    return raw ? (JSON.parse(raw) as Progress) : { doneIds: [] };
  } catch {
    return { doneIds: [] };
  }
}

function setProgress(username: string, p: Progress): void {
  localStorage.setItem(storageKey(username), JSON.stringify(p));
}

export interface ActiveTour {
  entry: OnboardingEntry;
  stepIndex: number;
}

/** Liefert die aktuell laufende/fortzusetzende Tour für diesen Nutzer, oder `null`. */
export function getActiveTour(username: string): ActiveTour | null {
  if (ONBOARDING_ENTRIES.length === 0) return null;

  if (isDev) {
    const entry = ONBOARDING_ENTRIES[ONBOARDING_ENTRIES.length - 1];
    return { entry, stepIndex: 0 };
  }

  const progress = getProgress(username);
  if (progress.current) {
    const entry = ONBOARDING_ENTRIES.find(e => e.id === progress.current!.id);
    if (entry && !progress.doneIds.includes(entry.id)) {
      const stepIndex = Math.min(progress.current.step, entry.steps.length - 1);
      return { entry, stepIndex };
    }
  }
  const next = ONBOARDING_ENTRIES.find(e => !progress.doneIds.includes(e.id));
  return next ? { entry: next, stepIndex: 0 } : null;
}

/** Beim Weiterklicken innerhalb einer Tour aufrufen — merkt sich den Fortschritt. */
export function saveOnboardingStep(username: string, entryId: string, stepIndex: number): void {
  if (isDev) return;
  const progress = getProgress(username);
  setProgress(username, { ...progress, current: { id: entryId, step: stepIndex } });
}

/** Beim letzten Schritt ("Fertig") aufrufen — Tour gilt danach als gesehen. */
export function markOnboardingDone(username: string, entryId: string): void {
  if (isDev) return;
  const progress = getProgress(username);
  const doneIds = progress.doneIds.includes(entryId) ? progress.doneIds : [...progress.doneIds, entryId];
  setProgress(username, { doneIds, current: undefined });
}
