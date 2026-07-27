import { useState, useEffect } from "react";
import { useAuth } from "../../lib/AuthContext.jsx";
import { supabase } from "../../lib/supabaseClient.js";

/* Sign in, forgot password, and the set-a-new-password step people land
   on from the reset email. One screen with three modes rather than three
   routes, since there's no router yet. */
export default function LoginPage() {
  const { signIn, resetPassword, updatePassword, idleOut, clearIdleNotice } = useAuth();
  const [mode, setMode] = useState("signin");   // signin | forgot | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /* Supabase puts the user in a recovery session when they follow the
     reset link, so switch straight to the new-password step. */
  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    if (window.location.hash.includes("type=recovery")) setMode("reset");
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signin") {
        clearIdleNotice();
        const { error: err } = await signIn(email.trim(), password);
        if (err) throw err;
      } else if (mode === "forgot") {
        const { error: err } = await resetPassword(email.trim());
        if (err) throw err;
        /* Same message whether or not the address exists — otherwise this
           form tells anyone who asks which emails are registered. */
        setNotice("If that address has an account, a reset link is on its way.");
      } else {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        if (password !== confirm) throw new Error("The two passwords don't match.");
        const { error: err } = await updatePassword(password);
        if (err) throw err;
        setNotice("Password updated. You're signed in.");
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (e2) {
      setError(e2.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lp">
      <style>{CSS}</style>
      <form className="lp-card" onSubmit={submit}>
        <div className="lp-brand">
          <span className="lp-mark">A360</span>
          <span className="lp-text"><strong>Aptus360</strong><em>End-to-End MU Management</em></span>
        </div>

        {idleOut && mode === "signin" && (
          <div className="lp-note idle">Signed out after 10 minutes of inactivity.</div>
        )}
        {error && <div className="lp-note error">{error}</div>}
        {notice && <div className="lp-note ok">{notice}</div>}

        {mode !== "reset" && (
          <div className="fld">
            <label>Email</label>
            <input type="email" required autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
        )}

        {mode === "signin" && (
          <div className="fld">
            <label>Password</label>
            <input type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}

        {mode === "reset" && (
          <>
            <div className="fld">
              <label>New password</label>
              <input type="password" required autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
              <p className="hint">At least 8 characters.</p>
            </div>
            <div className="fld">
              <label>Confirm password</label>
              <input type="password" required autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </>
        )}

        <button className="btn accent lp-go" type="submit" disabled={busy}>
          {busy ? "\u2026"
            : mode === "signin" ? "Sign in"
            : mode === "forgot" ? "Send reset link"
            : "Set password"}
        </button>

        <div className="lp-links">
          {mode === "signin" && (
            <button type="button" onClick={() => { setMode("forgot"); setError(""); }}>
              Forgotten your password?
            </button>
          )}
          {mode !== "signin" && (
            <button type="button" onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>
              &larr; Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const CSS = `
.lp { min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); padding: 24px; }
.lp-card { background: var(--white); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,.09); padding: 28px; width: 100%; max-width: 380px;
  display: flex; flex-direction: column; gap: 14px; }
.lp-brand { display: flex; align-items: center; gap: 11px; margin-bottom: 4px; }
.lp-mark { width: 40px; height: 40px; flex: none; border-radius: 8px; background: var(--accent);
  color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.lp-text { display: flex; flex-direction: column; line-height: 1.25; }
.lp-text strong { font-size: 16px; font-weight: 700; }
.lp-text em { font-style: normal; font-size: 11px; color: var(--muted); }
.lp-note { border-radius: var(--radius); padding: 9px 12px; font-size: 12.5px; border: 1px solid; }
.lp-note.error { background: var(--err-bg); color: var(--err-text); border-color: var(--err-border); }
.lp-note.ok { background: var(--ok-bg); color: var(--ok-text); border-color: var(--ok-border); }
.lp-note.idle { background: var(--warn-bg); color: var(--warn-text); border-color: var(--warn-border); }
.lp-go { width: 100%; padding: 10px; font-size: 13.5px; }
.lp-links { display: flex; justify-content: center; }
.lp-links button { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 12.5px inherit; }
.lp-links button:hover { text-decoration: underline; }
`;
