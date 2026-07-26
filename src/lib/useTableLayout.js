import { useState, useEffect, useRef } from "react";

/* Column widths, order and visibility, with drag-resize and localStorage
   persistence. Shared by every table in the app so the behaviour is
   identical and the logic exists once.

   Usage:
     const layout = useTableLayout("plots", COLUMNS);
     layout.visible          // columns to render, in order
     layout.widths[key]      // current width
     layout.startResize(e, key)
*/
export function useTableLayout(storageKey, columns) {
  const KEY = `aptus_tbl_${storageKey}`;
  const defaults = () => ({
    order: columns.map((c) => c.key),
    hidden: [],
    widths: Object.fromEntries(columns.map((c) => [c.key, c.width || 130])),
  });

  const [prefs, setPrefs] = useState(() => {
    const def = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return def;
      const p = JSON.parse(raw);
      const valid = new Set(def.order);
      const order = (p.order || []).filter((k) => valid.has(k));
      def.order.forEach((k) => !order.includes(k) && order.push(k));
      return {
        order,
        hidden: (p.hidden || []).filter((k) => valid.has(k)),
        widths: { ...def.widths, ...(p.widths || {}) },
      };
    } catch {
      return def;
    }
  });

  const save = (p) => {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
  };
  const drag = useRef(null);

  useEffect(() => {
    const move = (e) => {
      if (!drag.current) return;
      const { key, startX, startW } = drag.current;
      const w = Math.max(48, startW + (e.clientX - startX));
      setPrefs((p) => ({ ...p, widths: { ...p.widths, [key]: w } }));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.classList.remove("resizing");
      setPrefs((p) => { save(p); return p; });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startResize(e, key) {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { key, startX: e.clientX, startW: prefs.widths[key] || 130 };
    document.body.classList.add("resizing");
  }

  function toggleColumn(key) {
    setPrefs((p) => {
      const hidden = p.hidden.includes(key) ? p.hidden.filter((k) => k !== key) : [...p.hidden, key];
      const next = { ...p, hidden };
      save(next);
      return next;
    });
  }

  function reset() {
    const def = defaults();
    setPrefs(def);
    save(def);
  }

  const visible = prefs.order
    .filter((k) => !prefs.hidden.includes(k))
    .map((k) => columns.find((c) => c.key === k))
    .filter(Boolean);

  return { ...prefs, visible, startResize, toggleColumn, reset };
}

/* Shared CSS for resizable, sortable tables. Injected once per table. */
export const TABLE_CSS = `
body.resizing { cursor: col-resize; user-select: none; }
.dt-wrap { border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; max-height: 62vh; }
.dt { border-collapse: separate; border-spacing: 0; font-size: 12.5px; table-layout: fixed; }
.dt th, .dt td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt thead .head-row th {
  position: sticky; top: 0; z-index: 3; background: var(--accent); color: #fff;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;
}
.dt thead .head-row th:hover { background: var(--accent-dark); }
.dt .arrow { margin-left: 4px; font-size: 8px; }
.dt .resizer { position: absolute; right: 0; top: 0; height: 100%; width: 7px; cursor: col-resize; z-index: 4; }
.dt .resizer:hover { background: rgba(255,255,255,.35); }
.dt thead .filter-row th {
  position: sticky; top: 30px; z-index: 2; background: #eef0f4;
  border-bottom: 1px solid var(--border); padding: 4px 5px; overflow: visible;
}
.dt td { padding: 6px 10px; border-top: 1px solid var(--border); }
.dt tbody tr:nth-child(even) { background: #fafbfc; }
.dt tbody tr:hover { background: var(--accent-light); }
.dt .no-rows { text-align: center; padding: 36px; color: var(--muted); white-space: normal; }
`;
