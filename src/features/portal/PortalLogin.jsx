/* Signing in to the portal.

   ── Email and password, and nothing else ──

   It used to ask for the organisation and the branch first. The code
   admitted, in a comment beside the submit handler, that they were "a
   convenience, not a claim": neither was sent anywhere, neither was
   checked, and naming an organisation proved nothing. They were two
   questions asked before the two that matter.

   Worse for the one case they were meant to help — a contact at two
   branches of the same group — because a dropdown of every
   organisation on the system is a list somebody has to find themselves
   in before they can type a password.

   So the credential is the credential. What the account may see is
   settled by its Portal_Access record, on the server, and the portal
   shows it as soon as they are in: the branches they are attached to,
   or the one site, or every branch of the group. Somebody who is at
   two branches now sees both, rather than choosing one in advance and
   wondering where the rest went. */
import { useState } from "react";
import { useAuth } from "../../lib/AuthContext.jsx";

/* The titles are per audience, so the door somebody came through is
   still named on the card they land on. */
const TITLES = {
  developer: "Developer portal",
  dno: "DNO portal",
  idno: "IDNO portal",
};

export default function PortalLogin({ audience, onBack }) {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");


  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: authErr } = await signIn(email.trim(), password);
      if (authErr) throw new Error(authErr.message || "Those details were not recognised.");
      /* Nothing else to do: the app asks the server who this account is
         and opens the right thing. The organisation and branch chosen
         above are a convenience, not a claim. */
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function forgot() {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setBusy(true); setError("");
    try {
      await resetPassword(email.trim());
      setNotice("If that email has an account, a reset link is on its way.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="lp">
      <style>{CSS}</style>
      <form className="lp-card" onSubmit={submit}
        aria-label={TITLES[audience] || "Sign in"}>
        <img className="lp-logo" src="/aptus360-logo.png" alt="Aptus360" />
        <h1>{TITLES[audience] || "Sign in"}</h1>

        {error && <div className="banner error">{error}</div>}
        {notice && <div className="banner ok">{notice}</div>}

        <label htmlFor="pl-email">Email</label>
        <input id="pl-email" type="email" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="pl-pass">Password</label>
        <input id="pl-pass" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} required />

        <button className="btn accent" type="submit" disabled={busy}>
          {busy ? "Signing in\u2026" : "Sign in"}
        </button>

        <button type="button" className="lp-link" onClick={forgot} disabled={busy}>
          Forgotten your password?
        </button>

        <p className="lp-foot">
          No account yet? Your Aptus contact sets these up {"\u2014"} tell them which
          branch you work from.
        </p>
      </form>

      <button type="button" className="lp-back" onClick={onBack}>
        &larr; Choose again
      </button>
    </div>
  );
}

const CSS = `
.lp { min-height: 100vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 4px;
  background: #f8fafc; padding: 24px; }
.lp-card { width: min(420px, 94vw); background: #fff; border-radius: 14px;
  padding: 26px; box-shadow: 0 18px 50px rgba(15,23,42,.12);
  display: flex; flex-direction: column; gap: 6px; }
.lp-logo { height: 38px; align-self: center; margin-bottom: 8px; }
.lp-card h1 { font-size: 18px; margin: 0 0 10px; text-align: center; }
.lp-card label { font-size: 12.5px; color: var(--muted); margin-top: 8px; }
.lp-card input, .lp-card select { padding: 9px 10px; border-radius: 8px;
  border: 1px solid #cbd5e1; font: inherit; }
.lp-card .btn { margin-top: 16px; }
.lp-link { background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 12.5px; margin-top: 10px; }
.lp-foot { font-size: 12px; color: var(--muted); margin: 12px 0 0;
  text-align: center; }
.lp-back { margin-top: 14px; background: none; border: none; cursor: pointer;
  color: var(--muted); font-size: 12.5px; }
`;
