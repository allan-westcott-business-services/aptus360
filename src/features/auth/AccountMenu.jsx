import { useState } from "react";
import { useAuth } from "../../lib/AuthContext.jsx";

/* Who's signed in, with a change-password form and sign out. */
export default function AccountMenu() {
  const { user, signOut, updatePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  if (!user) return null;
  const initials = (user.email || "?").slice(0, 2).toUpperCase();

  async function change() {
    setErr(""); setMsg("");
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    if (pw !== confirm) return setErr("The two passwords don't match.");
    const { error } = await updatePassword(pw);
    if (error) return setErr(error.message);
    setPw(""); setConfirm(""); setChanging(false);
    setMsg("Password changed.");
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <div className="am" onClick={(e) => e.stopPropagation()}>
      <style>{CSS}</style>
      <button className="am-btn" onClick={() => setOpen((o) => !o)} title={user.email}>
        {initials}
      </button>
      {open && (
        <>
          <span className="am-backdrop" onClick={() => setOpen(false)} />
          <div className="am-menu">
            <p className="am-email">{user.email}</p>
            {msg && <p className="am-ok">{msg}</p>}
            {err && <p className="am-err">{err}</p>}

            {changing ? (
              <div className="am-form">
                <input type="password" placeholder="New password" aria-label="New password" value={pw}
                  onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
                <input type="password" placeholder="Confirm" aria-label="Confirm new password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                <div className="am-row">
                  <button className="btn accent sm" onClick={change}>Save</button>
                  <button className="btn ghost sm" onClick={() => { setChanging(false); setErr(""); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="am-item" onClick={() => setChanging(true)}>Change password</button>
            )}
            <button className="am-item danger" onClick={() => signOut(false)}>Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.am { position: relative; }
.am-btn { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border);
  background: var(--accent); color: #fff; font: 700 11px inherit; cursor: pointer; }
.am-backdrop { position: fixed; inset: 0; z-index: 940; }
.am-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 950; width: 232px;
  background: var(--white); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 8px 26px rgba(0,0,0,.18); padding: 8px; }
.am-email { margin: 0 0 8px; padding: 0 4px 8px; font-size: 12px; color: var(--muted);
  border-bottom: 1px solid var(--border); word-break: break-all; }
.am-item { display: block; width: 100%; text-align: left; background: none; border: none;
  border-radius: 5px; padding: 7px 9px; cursor: pointer; font: 500 12.5px inherit; color: var(--text); }
.am-item:hover { background: var(--bg); }
.am-item.danger { color: #dc2626; }
.am-item.danger:hover { background: #fef2f2; }
.am-form { display: flex; flex-direction: column; gap: 6px; padding: 4px; }
.am-form input { font-size: 12px; }
.am-row { display: flex; gap: 6px; }
.am-row .btn { flex: 1; padding: 5px; font-size: 12px; }
.am-ok { margin: 0 0 6px; font-size: 11.5px; color: var(--ok-text); padding: 0 4px; }
.am-err { margin: 0 0 6px; font-size: 11.5px; color: var(--err-text); padding: 0 4px; }
`;
