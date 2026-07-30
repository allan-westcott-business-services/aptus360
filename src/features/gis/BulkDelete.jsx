import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { bulkDeleteCategories, idsForKeys, groupCategories } from "./bulkDelete.js";

/* Bulk delete.

   Clearing a drawing is not a selection job — nobody rubber-bands four
   hundred service trenches. It is "get rid of all the meters", so the
   choices are categories rather than features.

   Every category shows how many it holds, and the total updates as you
   tick, because the number you are about to destroy is the one fact that
   matters before pressing the button. Categories overlap deliberately
   and the union is deduped, so All Electric plus All Meters removes an
   electric meter once. */

export default function BulkDelete({ features, lineTypes, layers, onDelete, onClose, busy }) {
  const drag = useDragHandle();
  const [keys, setKeys] = useState([]);

  const cats = useMemo(
    () => bulkDeleteCategories(features, { lineTypes, layers }),
    [features, lineTypes, layers]
  );
  const groups = useMemo(() => groupCategories(cats), [cats]);
  const ids = useMemo(() => idsForKeys(cats, keys), [cats, keys]);

  const toggle = (k) => setKeys((p) =>
    (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  /* Everything makes the rest meaningless, so ticking it clears them —
     leaving twelve boxes ticked under it suggests they still matter. */
  const pick = (k) => (k === "all" ? setKeys(keys.includes("all") ? [] : ["all"]) : toggle(k));
  const locked = keys.includes("all");

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="bd" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Bulk delete">
        <style>{CSS}</style>

        <div className="bd-head" {...drag.handleProps}>
          <div>
            <h3>Bulk delete</h3>
            <p className="bd-sub">Whole categories at once. This cannot be undone.</p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="bd-body">
          {groups.map((g) => (
            <section key={g.label}>
              <p className="bd-group">{g.label}</p>
              {g.items.map((c) => (
                <label key={c.key}
                  className={["bd-row", c.count ? "" : "empty",
                    locked && c.key !== "all" ? "locked" : ""].filter(Boolean).join(" ")}>
                  <input type="checkbox"
                    checked={keys.includes(c.key)}
                    /* Nothing to delete, nothing to tick. A checkbox that
                       does nothing is a question with no answer. */
                    disabled={!c.count || busy || (locked && c.key !== "all")}
                    onChange={() => pick(c.key)} />
                  <span className="bd-label">{c.label}</span>
                  <em>{c.count}</em>
                </label>
              ))}
            </section>
          ))}
        </div>

        <div className="bd-foot">
          <span className="bd-count">
            {ids.length === 0
              ? "Nothing selected"
              : `${ids.length} feature${ids.length === 1 ? "" : "s"} will be deleted`}
          </span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn danger" disabled={!ids.length || busy}
            onClick={() => onDelete(ids, keys.length)}>
            {busy ? "Deleting\u2026" : `Delete ${ids.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.bd { background: var(--white); border-radius: 12px; width: min(440px, 94vw); max-height: 86vh;
  display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.bd-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.bd-head > div { flex: 1; }
.bd-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.bd-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); }
.bd-body { padding: 6px 12px 12px; overflow-y: auto; flex: 1; }
.bd-group { margin: 12px 6px 3px; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); }
.bd-row { display: flex; align-items: center; gap: 9px; padding: 5px 8px; border-radius: 6px;
  font-size: 12.5px; font-weight: 500; text-transform: none; letter-spacing: 0;
  color: var(--text); margin: 0; cursor: pointer; }
.bd-row:hover { background: var(--bg); }
.bd-row.empty { color: var(--muted); cursor: default; }
.bd-row.locked { opacity: .4; cursor: default; }
.bd-label { flex: 1; }
.bd-row em { font-style: normal; font-size: 11px; font-weight: 700; color: var(--muted);
  font-variant-numeric: tabular-nums; }
.bd-foot { display: flex; align-items: center; gap: 8px; padding: 12px 18px;
  border-top: 1px solid var(--border); }
.bd-count { flex: 1; font-size: 12px; font-weight: 600; color: var(--muted); }
.btn.danger { background: #b91c1c; border-color: #b91c1c; color: #fff; }
.btn.danger:disabled { opacity: .45; }
`;
