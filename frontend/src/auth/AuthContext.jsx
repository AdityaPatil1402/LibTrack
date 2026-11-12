import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'authed' | 'anon'
  const [user, setUser] = useState(null);
  const [notice, setNotice] = useState(null); // e.g. "signed out after 30 minutes of inactivity"
  const [signedOutByUser, setSignedOutByUser] = useState(false);

  const timeoutMinutes = useRef(30);
  const lastActivity = useRef(Date.now());
  const lastHeartbeat = useRef(Date.now());

  const endSession = useCallback((message = null) => {
    setUser(null);
    setStatus('anon');
    setNotice(message);
  }, []);

  const startSession = useCallback((nextUser, minutes) => {
    timeoutMinutes.current = minutes ?? 30;
    lastActivity.current = Date.now();
    lastHeartbeat.current = Date.now();
    setUser(nextUser);
    setStatus('authed');
    setNotice(null);
    setSignedOutByUser(false);
  }, []);

  // The server is the source of truth: any 401 about the session ends it here too.
  useEffect(() => {
    setUnauthorizedHandler((err) => endSession(err.code === 'SESSION_EXPIRED' ? err.message : null));
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  // On first load, ask the server whether the browser already has a valid session.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((data) => {
        if (!cancelled) startSession(data.user, data.inactivityTimeoutMinutes);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('anon');
        if (err.code === 'SESSION_EXPIRED' || err.code === 'NETWORK') setNotice(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [startSession]);

  // While signed in: track real activity, keep the server session alive for people who are reading
  // or typing without making requests, and sign out locally once the inactivity limit passes.
  useEffect(() => {
    if (status !== 'authed') return undefined;

    const markActive = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActive, { passive: true }));

    const timer = setInterval(() => {
      const now = Date.now();
      const limitMs = timeoutMinutes.current * 60_000;

      if (now - lastActivity.current >= limitMs) {
        api.logout().catch(() => {});
        endSession(`You were signed out after ${timeoutMinutes.current} minutes of inactivity. Please sign in again.`);
        return;
      }
      const beatEveryMs = Math.min(limitMs / 4, 5 * 60_000);
      if (lastActivity.current > lastHeartbeat.current && now - lastHeartbeat.current >= beatEveryMs) {
        lastHeartbeat.current = now;
        api.heartbeat().catch(() => {});
      }
    }, 15_000);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive));
      clearInterval(timer);
    };
  }, [status, endSession]);

  const login = useCallback(
    async (identifier, password) => {
      const data = await api.login(identifier, password);
      startSession(data.user, data.inactivityTimeoutMinutes);
    },
    [startSession]
  );

  const logout = useCallback(async () => {
    setSignedOutByUser(true);
    try {
      await api.logout();
    } catch {
      /* even if the request fails, leave the app signed out */
    }
    endSession(null);
  }, [endSession]);

  const value = useMemo(
    () => ({ status, user, notice, signedOutByUser, login, logout, setUser, clearNotice: () => setNotice(null) }),
    [status, user, notice, signedOutByUser, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
