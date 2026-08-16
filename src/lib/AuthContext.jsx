import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { getSupabase, authEnabled } from "./supabaseClient.js";

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
    const sb = await getSupabase();
    if (sb) await sb.auth.signOut();
    localStorage.removeItem(LAST_ACTIVE_KEY);
    setSession(null);
    setIdleOut(wasIdle);
  }, []);

  /* A refused request ends the session here.

     Every endpoint requires a signed-in caller now, so a 401 means the
     session has gone — expired, revoked, or signed out in another tab.
     The api client cannot act on that itself: it knows nothing about
     React or routing, and a module that reached in to change auth state
     would be a second owner of it.

     So it announces, and this listens. The person lands on the login
     screen once, rather than watching every panel on the page fail with
     "Sign in to use this." */
  useEffect(() => {
    const onRefused = () => {
      /* Not signOut(): that calls Supabase to end a session the server
         has already refused, and would fail on the way out. Clearing
         what this holds is the whole of it. */
      setSession(null);
      localStorage.removeItem(LAST_ACTIVE_KEY);
    };
    window.addEventListener("aptus:signed-out", onRefused);
    return () => window.removeEventListener("aptus:signed-out", onRefused);
  }, []);

  useEffect(() => {
    if (!authEnabled) { setLoading(false); return; }
    /* The client arrives a moment after first paint now, so the session
       check is chained onto it rather than run at module scope. Nothing
       downstream notices: loading was already true until this resolved. */
    getSupabase().then((sb) => sb.auth.getSession()).then(({ data }) => {
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
    let sub = null;
    let live = true;
    getSupabase().then((sb) => {
      if (!live || !sb) return;
      sub = sb.auth.onAuthStateChange((_e, s) => setSession(s)).data.subscription;
    });
    /* live guards the case where this unmounts before the client arrives:
       without it the subscription is created after cleanup has run and
       never torn down. */
    return () => { live = false; sub?.unsubscribe(); };
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
    signIn: async (email, password) =>
      (await getSupabase()).auth.signInWithPassword({ email, password }),
    signOut,
    resetPassword: (email) =>
      getSupabase().then((sb) =>
        sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` })),
    updatePassword: async (password) => (await getSupabase()).auth.updateUser({ password }),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
