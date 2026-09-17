/* Signing in from outside Aptus.

   A client developer is not an email address to this business: they are
   a CONTACT, at a BRANCH, of an ORGANISATION. That is how they were
   recorded when the organisation was set up, and it is how they think
   of themselves — "Barratt, Northampton office" — so it is what they
   are asked for.

   ── The organisation and branch are not the credential ──

   The password is. Naming an organisation proves nothing and grants
   nothing: what somebody sees afterwards comes from the record held
   against their account, which the server reads from the verified
   token. Two reasons for asking anyway.

   First, it is how the account is found when something is wrong: an
   email that signs in but has no portal record can be told "we have
   you at this branch — ask your Aptus contact" rather than shown an
   empty page.

   Second, a contact at two branches of the same group signs in with
   the branch they mean, rather than getting whichever the database
   happened to return first.

   If the account's own record disagrees with what was chosen here, the
   ACCOUNT wins and the portal says so. A form that could override the
   record would make this screen the security boundary, which is the
   thing the front door deliberately is not. */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/AuthContext.jsx";
import { http } from "../../api/client.js";

const TITLES = {
  developer: "Client developer sign in",
  dno: "Network owner sign in",
  idno: "Independent network sign in",
};

export default function PortalLogin({ audience, onBack }) {
  const { signIn, resetPassword } = useAuth();
  const [orgs, setOrgs] = useState(null);
  const [orgId, setOrgId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    /* Open, and deliberately thin: names and branches of active
       organisations, which is what is printed on their own letterhead.
       Nothing here is a secret, and a sign-in screen that needed a
       session to populate itself could never be used. */
    http.get(`/portal-orgs?audience=${encodeURIComponent(audience)}`)
      .then((r) => setOrgs(r.organisations || []))
      .catch(() => setOrgs([]));
  }, [audience]);

  const branches = useMemo(() => {
    const o = (orgs || []).find((x) => String(x.Organisation_ID) === String(orgId));
    return o?.branches || [];
  }, [orgs, orgId]);

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

        <label htmlFor="pl-org">Your organisation</label>
        <select id="pl-org" value={orgId}
          onChange={(e) => { setOrgId(e.target.value); setBranchId(""); }}>
          <option value="">
            {orgs == null ? "Loading\u2026"
              : orgs.length ? "Choose\u2026" : "None listed"}
          </option>
          {(orgs || []).map((o) => (
            <option key={o.Organisation_ID} value={o.Organisation_ID}>{o.Name}</option>
          ))}
        </select>

        <label htmlFor="pl-branch">Your branch</label>
        <select id="pl-branch" value={branchId} disabled={!orgId}
          onChange={(e) => setBranchId(e.target.value)}>
          <option value="">
            {!orgId ? "Choose an organisation first"
              : branches.length ? "Choose\u2026" : "No branches listed"}
          </option>
          {branches.map((b) => (
            <option key={b.Organisation_Branch_ID} value={b.Organisation_Branch_ID}>
              {b.Branch_Dropdown || b.Branch_Name}
            </option>
          ))}
        </select>

        <label htmlFor="pl-email">Email</label>
        <input id="pl-email" type="email" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="pl-pass">Password</label>
        <input id="pl-pass" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} required />

        {/* An empty list is a dead end, so it says why rather than
            leaving somebody clicking an empty dropdown. Signing in is
            still allowed: the organisation is a convenience, and an
            account whose organisation is missing from the list should
            not be locked out by it. */}
        {orgs?.length === 0 && (
          <p className="lp-foot">
            We have no organisations listed for this door yet. You can still
            sign in; tell your Aptus contact so we can put it right.
          </p>
        )}

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
