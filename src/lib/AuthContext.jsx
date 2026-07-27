import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { supabase, authEnabled } from "./supabaseClient.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const IDLE_MS = 10 * 60 * 1000;          // 10 minutes
const LAST_ACTIVE_KEY = "aptus_last_active";
const ACTIVITY = ["mousedown", "keydown", "touchstart", "scroll", "click"];

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idleOut, setIdleOut] = useState(false);
  const timer = useRef(null);

  const signOut = useCallback(async (wasIdle = false) => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem(LAST_ACTIVE_KEY);
    setSession(null);
    setIdleOut(wasIdle);
  }, []);

  useEffect(() => {
    if (!authEnabled) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      /* Returning after a long absence counts as idle too — otherwise
         "log out after 10 minutes" only holds while the tab is open,
         which is the opposite of what it's for. */
      const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
      if (data.session && last && Date.now() - last > IDLE_MS) {
        signOut(true);
      } else {
        setSession(data.session);
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [signOut]);

  // idle timer
  useEffect(() => {
    if (!session) return;
    const bump = () => {
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => signOut(true), IDLE_MS);
    };
    bump();
    ACTIVITY.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
      if (last && Date.now() - last > IDLE_MS) signOut(true);
      else bump();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer.current);
      ACTIVITY.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, signOut]);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    idleOut,
    authEnabled,
    clearIdleNotice: () => setIdleOut(false),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut,
    resetPassword: (email) =>
      supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` }),
    updatePassword: (password) => supabase.auth.updateUser({ password }),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
