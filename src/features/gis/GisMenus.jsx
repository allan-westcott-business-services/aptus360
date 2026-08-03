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

export function Menu({ id, label, open, setOpen, children, badge, columns = 1 }) {
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
        <div className={columns > 1 ? "gm-menu gm-2col" : "gm-menu"} role="menu"
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

/* A heading. `newColumn` starts the second column here in a two-column
   menu — an explicit break rather than letting the content fall where it
   happens to, so the split lands on a heading and not part way through a
   group of related items. */
export const MenuGroup = ({ label, newColumn = false }) => (
  <p className={newColumn ? "gm-group gm-brk" : "gm-group"}>{label}</p>
);

/* hint goes to the tooltip, not beside the label. Shown inline it wrapped
   under long labels and turned a tidy list into a wall of grey text —
   and most of it is detail you want when hesitating over an item, not
   while scanning past it. */
export function MenuItem({ label, hint, onClick, disabled, active, danger, indent }) {
  return (
    <button className={["gm-item", active ? "on" : "", danger ? "danger" : "",
      indent ? "in" : ""].filter(Boolean).join(" ")}
      role="menuitem" disabled={disabled} onClick={onClick} title={hint}>
      <span>{label}</span>
    </button>
  );
}

/* A layer row: the name, and H and S beside it.

   H hides just this one. S isolates it — everything else goes, which is
   the quicker gesture when you want to look at one thing on a busy
   drawing. A checkbox could only express the first, and getting to the
   second meant unticking everything else by hand.

   Both are buttons rather than a checkbox because both are actions with
   an effect elsewhere: H changes this row, S changes every other. A
   checkbox implies it only speaks for itself. */
export function MenuLayer({ label, hidden, solo, onHide, onSolo, colour, count }) {
  return (
    <div className={hidden ? "gm-row off" : "gm-row"} data-keep-open>
      {colour && <span className="gm-dot" style={{ background: colour }} />}
      <span className="gm-lbl">{label}</span>
      {count != null && <em>{count}</em>}
      <button className={hidden ? "gm-hs on" : "gm-hs"}
        title={hidden ? `Show ${label}` : `Hide ${label}`}
        aria-pressed={hidden} onClick={onHide}>H</button>
      {/* Solo only where there is something to solo against. The
          background plan has no soloing — hiding everything else to
          leave a survey on its own is what the Hide buttons already do,
          and a button that does nothing is worse than no button. */}
      {onSolo && (
        <button className={solo ? "gm-hs solo on" : "gm-hs solo"}
          title={solo ? "Show everything again" : `Show only ${label}`}
          aria-pressed={solo} onClick={onSolo}>S</button>
      )}
    </div>
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
/* Two columns, for a menu long enough to scroll.

   Multi-column rather than two hand-built lists: the items stay in one
   flow, so nothing has to be kept in step when one is added, and the
   break is placed by naming a heading rather than by counting rows.

   Items must not straddle the boundary — half a row at the foot of one
   column and half at the head of the next is worse than the scroll it
   replaces. */
.gm-2col { columns: 2; column-gap: 14px; min-width: 520px; max-height: none; }
.gm-2col > * { break-inside: avoid; }
.gm-2col .gm-brk { break-before: column; margin-top: 0; }
.gm-group { margin: 7px 8px 4px; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); }
.gm-group:first-child { margin-top: 3px; }
/* A line of explanation under a group heading, for a control whose
   behaviour isn't obvious from its label. */
.gm-note { margin: 0 8px 6px; font-size: 10.5px; color: var(--muted); line-height: 1.35; }

.gm-item, .gm-tog { display: flex; align-items: center; gap: 8px; width: 100%; background: none;
  border: none; border-radius: 6px; cursor: pointer; font: 500 12.5px inherit; color: var(--text);
  padding: 6px 9px; text-align: left; }
.gm-item:hover:not(:disabled), .gm-tog:hover { background: var(--bg); }
.gm-item:disabled { color: var(--muted); cursor: not-allowed; }
.gm-item.on { background: var(--accent-light); color: var(--accent); font-weight: 700; }
.gm-item.danger { color: #b91c1c; }
.gm-item span, .gm-tog .gm-lbl { flex: 1; }
/* A nested action — Draw > Mains trench — reads as belonging to the one
   above it rather than as another top-level choice. */
.gm-item.in { padding-left: 24px; }
.gm-item em, .gm-tog em { font-style: normal; font-size: 10.5px; color: var(--muted);
  font-weight: 500; }
.gm-item:disabled em { font-style: italic; }

.gm-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 9px;
  border-radius: 6px; font-size: 12.5px; }
.gm-row:hover { background: var(--bg); }
.gm-row .gm-lbl { flex: 1; }
.gm-row.off .gm-lbl { color: var(--muted); text-decoration: line-through; }
.gm-row.off .gm-dot { opacity: .3; }
.gm-dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
/* Small, square and equal, so H and S read as a pair rather than as two
   unrelated controls. */
.gm-hs { width: 20px; height: 20px; flex: none; border: 1px solid var(--border);
  background: var(--white); border-radius: 4px; cursor: pointer; font: 700 10px inherit;
  color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }
.gm-hs:hover { border-color: var(--accent); color: var(--accent); }
.gm-hs.on { background: #b91c1c; border-color: #b91c1c; color: #fff; }
.gm-hs.solo.on { background: var(--accent); border-color: var(--accent); }
.gm-sep { height: 1px; background: var(--border); margin: 5px 0; }
`;
