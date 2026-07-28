import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// Persönliche Anzeige-Einstellungen für das Leistungsprofil – pro Nutzer (am Benutzernamen
// gekeyt) im localStorage gespeichert. Display-Präferenz, daher gerätelokal.
interface ProfilePrefs {
  showTrendArrows: boolean; // Verbindungslinie + Pfeil (vorher → aktuell) im Profil anzeigen
}

interface ProfilePrefsContextValue extends ProfilePrefs {
  setShowTrendArrows: (value: boolean) => void;
}

const DEFAULT_PREFS: ProfilePrefs = { showTrendArrows: true };

const ProfilePrefsContext = createContext<ProfilePrefsContextValue>({
  ...DEFAULT_PREFS,
  setShowTrendArrows: () => {},
});

const keyFor = (user: string | null) => `leistungsprofil_profileprefs_${user ?? 'default'}`;

export const ProfilePrefsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [prefs, setPrefs] = useState<ProfilePrefs>(DEFAULT_PREFS);

  // Beim Login/Benutzerwechsel die Einstellungen des aktuellen Nutzers laden.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(currentUser));
      setPrefs(raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS);
    } catch {
      setPrefs(DEFAULT_PREFS);
    }
  }, [currentUser]);

  const persist = (next: ProfilePrefs) => {
    setPrefs(next);
    try { localStorage.setItem(keyFor(currentUser), JSON.stringify(next)); } catch { /* ignore */ }
  };

  const setShowTrendArrows = (value: boolean) => persist({ ...prefs, showTrendArrows: value });

  return (
    <ProfilePrefsContext.Provider value={{ ...prefs, setShowTrendArrows }}>
      {children}
    </ProfilePrefsContext.Provider>
  );
};

export const useProfilePrefs = () => useContext(ProfilePrefsContext);
