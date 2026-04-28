import React, { createContext, useContext, useState } from 'react';
import { isElectron, dbLogin, dbGetEncryptionKey } from '../lib/db-api';

interface SessionData {
  username: string;
  encryptionKey: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: string | null;
  currentUserRole: 'admin' | 'user' | null;
  encryptionKey: string;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<SessionData | null>(() => {
    try {
      const stored = sessionStorage.getItem('auth_session');
      return stored ? (JSON.parse(stored) as SessionData) : null;
    } catch {
      return null;
    }
  });

  const login = async (username: string, password: string): Promise<boolean> => {
    const result = await dbLogin(username, password);
    if (result && result.success && result.username && result.role) {
      const key = await dbGetEncryptionKey();
      const newSession: SessionData = {
        username: result.username,
        encryptionKey: key,
        role: result.role,
      };
      setSession(newSession);
      sessionStorage.setItem('auth_session', JSON.stringify(newSession));
      return true;
    }
    return false;
  };

  const logout = () => {
    setSession(null);
    sessionStorage.removeItem('auth_session');
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: session !== null,
        currentUser: session?.username ?? null,
        currentUserRole: session?.role ?? null,
        encryptionKey: session?.encryptionKey ?? '',
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
