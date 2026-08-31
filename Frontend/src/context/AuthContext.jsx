import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { checkSetupStatus, fetchMe, logout as clearAuthStorage } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsAdminSignup, setNeedsAdminSignup] = useState(false);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const setup = await checkSetupStatus();
        if (!active) return;

        setNeedsAdminSignup(Boolean(setup.needsAdminSignup));

        const token = localStorage.getItem('token');
        if (!token) {
          setIsAuthenticated(false);
          return;
        }

        await fetchMe();
        if (!active) return;
        setIsAuthenticated(true);
      } catch {
        if (!active) return;
        clearAuthStorage();
        setIsAuthenticated(false);
      } finally {
        if (active) setReady(true);
      }
    }

    init();
    return () => {
      active = false;
    };
  }, []);

  const markAuthenticated = useCallback(() => {
    setIsAuthenticated(true);
    setNeedsAdminSignup(false);
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    setIsAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({ ready, isAuthenticated, needsAdminSignup, markAuthenticated, logout }),
    [ready, isAuthenticated, needsAdminSignup, markAuthenticated, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
