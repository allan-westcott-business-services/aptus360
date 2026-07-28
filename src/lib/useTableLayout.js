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
  const dragCol = useRef(null);
  const [overCol, setOverCol] = useState(null);

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

  /* Drag a header onto another to move the column there.

     HTML5 drag rather than pointer maths: it gives the drag image, the
     cursor and the escape-to-cancel for nothing, and a table header is
     exactly the kind of coarse target it suits. The resizer opts out
     with draggable={false}, or dragging its edge would reorder instead
     of resize. */
  function moveColumn(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setPrefs((p) => {
      const order = p.order.filter((k) => k !== fromKey);
      const at = order.indexOf(toKey);
      if (at < 0) return p;
      /* Dropping on a column to the right puts it after that column,
         to the left puts it before — which is what the drop indicator
         shows and what the movement feels like. */
      const wasBefore = p.order.indexOf(fromKey) < p.order.indexOf(toKey);
      order.splice(wasBefore ? at + 1 : at, 0, fromKey);
      const next = { ...p, order };
      save(next);
      return next;
    });
  }

  function reorderProps(key) {
    return {
      draggable: true,
      onDragStart: (e) => {
        dragCol.current = key;
        e.dataTransfer.effectAllowed = "move";
        /* Firefox won't start a drag without data set on it. */
        try { e.dataTransfer.setData("text/plain", key); } catch { /* ignore */ }
      },
      onDragOver: (e) => {
        if (!dragCol.current || dragCol.current === key) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (overCol !== key) setOverCol(key);
      },
      onDragLeave: () => { if (overCol === key) setOverCol(null); },
      onDrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        moveColumn(dragCol.current, key);
        dragCol.current = null;
        setOverCol(null);
      },
      onDragEnd: () => { dragCol.current = null; setOverCol(null); },
      className: overCol === key ? "col-drop" : undefined,
    };
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

  return { ...prefs, visible, startResize, toggleColumn, reset, reorderProps, moveColumn };
}

/* The table spec lives in src/styles.css, under "Data tables", so every
   table in the app reads one definition rather than each injecting its
   own copy. Kept as an empty export so a component that still adds it to
   its CSS string is harmless rather than broken. */
export const TABLE_CSS = "";
