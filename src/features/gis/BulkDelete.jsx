import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { bulkDeleteCategories, idsForKeys } from "./bulkDelete.js";
import CategoryPicker from "./CategoryPicker.jsx";

/* Bulk delete.

   Clearing a drawing is not a selection job — nobody rubber-bands four
   hundred service trenches. It is "get rid of all the meters", so the
   choices are categories rather than features.

   Every category shows how many it holds, and the total updates as you
   tick, because the number you are about to destroy is the one fact that
   matters before pressing the button. Categories overlap deliberately
   and the union is deduped, so All Electric plus All Meters removes an
   electric meter once.

   The picker itself is CategoryPicker, shared with the bulk editor:
   naming what to act on is the same job whichever thing is then done to
   it, and the cascade between a utility and the kinds beneath it is
   subtle enough that a second copy would go wrong quietly rather than
   obviously. */

export default function BulkDelete({ features, lineTypes, layers, onDelete, onClose, busy }) {
  const drag = useDragHandle();
  const [keys, setKeys] = useState([]);

  const cats = useMemo(
    () => bulkDeleteCategories(features, { lineTypes, layers }),
    [features, lineTypes, layers]
  );
  const ids = useMemo(() => idsForKeys(cats, keys), [cats, keys]);

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

        <div className="bd-scroll">
          <CategoryPicker categories={cats} keys={keys} onChange={setKeys}
            disabled={busy} multiColumn />
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
/* Wide enough for several columns; the columns themselves are the
   picker's, in the shared stylesheet. */
.bd { background: var(--white); border-radius: 12px; width: min(1120px, 96vw); max-height: 86vh;
  display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.bd-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.bd-head > div { flex: 1; }
.bd-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.bd-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); }
.bd-scroll { padding: 6px 12px 12px; overflow-y: auto; flex: 1; }
.bd-foot { display: flex; align-items: center; gap: 8px; padding: 12px 18px;
  border-top: 1px solid var(--border); }
.bd-count { flex: 1; font-size: 12px; font-weight: 600; color: var(--muted); }
.btn.danger { background: #b91c1c; border-color: #b91c1c; color: #fff; }
.btn.danger:disabled { opacity: .45; }
`;
