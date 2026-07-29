import { useEffect, useRef, useState } from "react";

/* The Columns picker.

   One component so every table offers the same thing in the same place,
   rather than each screen growing its own. It takes the column list and
   the hidden set and hands back which key was toggled — it holds no
   preferences of its own, so a table that keeps its own layout and one
   that uses useTableLayout can both use it.

   A column with `fixed` can't be turned off. Some cells are the row's
   identity — the plot number, the project reference — and a table with
   nothing to identify a row by is a wall of values. */
export default function ColumnsMenu({ columns, hidden, onToggle, onReset, label = "Columns" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  /* Clicking anywhere else closes it. Without this the menu stays open
     behind whatever you clicked next, which reads as the app hanging. */
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const showing = columns.filter((c) => !hidden.includes(c.key)).length;

  return (
    <div className="col-menu-wrap" ref={wrap}>
      <button className="btn ghost" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-haspopup="true"
        title="Choose which columns to show">
        {label}
        {hidden.length > 0 && <span className="cm-count">{showing}/{columns.length}</span>}
      </button>

      {open && (
        <div className="col-menu" role="dialog" aria-label="Choose columns">
          <div className="col-menu-head">
            <span>Show columns</span>
            {onReset && <button onClick={onReset}>Reset</button>}
          </div>
          {columns.map((c) => (
            <label key={c.key} className={c.fixed ? "col-opt fixed" : "col-opt"}>
              <input type="checkbox"
                checked={!hidden.includes(c.key)}
                disabled={!!c.fixed}
                onChange={() => onToggle(c.key)} />
              {c.label}
              {c.fixed && <span className="cm-lock" title="Always shown">&#9679;</span>}
            </label>
          ))}
        </div>
      )}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.col-menu-wrap { position: relative; }
.col-menu {
  position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 40;
  background: var(--white); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 6px 20px rgba(0,0,0,.12); padding: 8px; width: 200px;
  max-height: 340px; overflow-y: auto;
}
.col-menu-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); padding: 2px 6px 7px; border-bottom: 1px solid var(--border);
  margin-bottom: 5px;
}
.col-menu-head button { background: none; border: none; cursor: pointer;
  color: var(--accent); font: 600 11px inherit; text-transform: none; letter-spacing: 0; }
.col-opt { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 5px;
  font-size: 12.5px; font-weight: 500; text-transform: none; letter-spacing: 0;
  color: var(--text); cursor: pointer; margin: 0; }
.col-opt:hover { background: var(--bg); }
.col-opt.fixed { color: var(--muted); cursor: default; }
.cm-lock { margin-left: auto; font-size: 7px; color: var(--border); }
.cm-count { margin-left: 6px; font-size: 10.5px; font-weight: 700; color: var(--muted); }
`;
