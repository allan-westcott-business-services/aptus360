import { useState, useRef, useEffect } from "react";

/* The canvas menu bar.

   The toolbar had grown to eighteen buttons in one row, which is the
   point at which finding something takes longer than doing it. These
   group by what you are working on rather than by what the control
   happens to be — layer toggles for electric sit with Link to Circuit,
   because someone drawing an LV network wants both and neither belongs
   with the background plan.

   One menu open at a time, click away or Escape to close. */

export function MenuBar({ children }) {
  const [open, setOpen] = useState(null);
  const wrap = useRef(null);

  useEffect(() => {
    if (open == null) return;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="gm-bar" ref={wrap}>
      <style>{CSS}</style>
      {children({ open, setOpen })}
    </div>
  );
}

export function Menu({ id, label, open, setOpen, children, badge }) {
  const isOpen = open === id;
  return (
    <div className="gm-wrap">
      <button className={isOpen ? "gm-btn on" : "gm-btn"}
        aria-expanded={isOpen} aria-haspopup="true"
        onClick={() => setOpen(isOpen ? null : id)}>
        {label}
        {badge != null && badge !== 0 && <span className="gm-badge">{badge}</span>}
      </button>
      {isOpen && (
        <div className="gm-menu" role="menu"
          /* Closes on choosing an action, but not on a visibility
             toggle — those are usually flicked several at a time, and
             reopening the menu between each would be maddening. */
          onClick={(e) => { if (e.target.closest("[data-keep-open]")) return; setOpen(null); }}>
          {children}
        </div>
      )}
    </div>
  );
}

export const MenuGroup = ({ label }) => <p className="gm-group">{label}</p>;

export function MenuItem({ label, hint, onClick, disabled, active, danger }) {
  return (
    <button className={["gm-item", active ? "on" : "", danger ? "danger" : ""]
      .filter(Boolean).join(" ")}
      role="menuitem" disabled={disabled} onClick={onClick} title={hint}>
      <span>{label}</span>
      {hint && <em>{hint}</em>}
    </button>
  );
}

/* A visibility toggle. Reads as a state rather than an action, because
   that is what it is — the eye says what is true now, not what clicking
   will do. */
export function MenuToggle({ label, on, onChange, colour, count }) {
  return (
    <button className={on ? "gm-tog on" : "gm-tog"} role="menuitemcheckbox"
      aria-checked={on} data-keep-open onClick={() => onChange(!on)}>
      <span className="gm-eye">{on ? "\u25C9" : "\u25CB"}</span>
      {colour && <span className="gm-dot" style={{ background: colour }} />}
      <span className="gm-lbl">{label}</span>
      {count != null && <em>{count}</em>}
    </button>
  );
}

const CSS = `
.gm-bar { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.gm-wrap { position: relative; }
.gm-btn { background: none; border: 1px solid transparent; border-radius: 7px; cursor: pointer;
  font: 600 12.5px inherit; color: var(--text); padding: 7px 12px; display: inline-flex;
  align-items: center; gap: 6px; white-space: nowrap; }
.gm-btn:hover { background: var(--bg); }
.gm-btn.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.gm-badge { background: rgba(255,255,255,.25); border-radius: 20px; padding: 0 6px;
  font-size: 10px; font-weight: 700; }
.gm-btn:not(.on) .gm-badge { background: var(--accent); color: #fff; }

.gm-menu { position: absolute; left: 0; top: 100%; margin-top: 4px; z-index: 60;
  background: var(--white); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15,23,42,.18); padding: 6px; min-width: 234px;
  max-height: 70vh; overflow-y: auto; }
.gm-group { margin: 7px 8px 4px; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); }
.gm-group:first-child { margin-top: 3px; }

.gm-item, .gm-tog { display: flex; align-items: center; gap: 8px; width: 100%; background: none;
  border: none; border-radius: 6px; cursor: pointer; font: 500 12.5px inherit; color: var(--text);
  padding: 6px 9px; text-align: left; }
.gm-item:hover:not(:disabled), .gm-tog:hover { background: var(--bg); }
.gm-item:disabled { color: var(--muted); cursor: not-allowed; }
.gm-item.on { background: var(--accent-light); color: var(--accent); font-weight: 700; }
.gm-item.danger { color: #b91c1c; }
.gm-item span, .gm-tog .gm-lbl { flex: 1; }
.gm-item em, .gm-tog em { font-style: normal; font-size: 10.5px; color: var(--muted);
  font-weight: 500; }
.gm-item:disabled em { font-style: italic; }

.gm-eye { font-size: 11px; color: var(--border); width: 12px; }
.gm-tog.on .gm-eye { color: var(--accent); }
.gm-tog:not(.on) .gm-lbl { color: var(--muted); }
.gm-dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.gm-tog:not(.on) .gm-dot { opacity: .3; }
.gm-sep { height: 1px; background: var(--border); margin: 5px 0; }
`;
