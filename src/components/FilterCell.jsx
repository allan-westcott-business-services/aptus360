import { useState, useRef, useLayoutEffect } from "react";

/* One filter control per column type. Popups are position:fixed against the
   trigger's rect — the table wrapper has overflow:auto, which clips
   absolutely-positioned children however high the z-index goes. */

export const blankFilter = (type) =>
  type === "date" ? { from: "", to: "", blank: false }
  : type === "multi" ? []
  : type === "num" ? { min: "", max: "" }
  : "";

export const isActive = (f, type) => {
  if (f == null) return false;
  if (type === "date") return !!(f.from || f.to || f.blank);
  if (type === "multi") return f.length > 0;
  if (type === "num") return f.min !== "" || f.max !== "";
  return f !== "";
};

const iso = (d) => (d ? String(d).slice(0, 10) : "");
const fmt = (d) => (d ? iso(d).split("-").reverse().join("/") : "");

/* Row test shared by every table. */
export function rowPasses(row, columns, filters) {
  for (const c of columns) {
    const f = filters[c.key];
    if (!isActive(f, c.type)) continue;
    const v = c.raw(row);

    if (c.type === "date") {
      const val = iso(v);
      if (f.blank) { if (val) return false; continue; }
      if (!val) return false;
      if (f.from && val < f.from) return false;
      if (f.to && val > f.to) return false;
    } else if (c.type === "multi") {
      const key = v == null || v === "" ? "__blank__" : String(v);
      if (!f.includes(key)) return false;
    } else if (c.type === "num") {
      const n = Number(v);
      if (f.min !== "" && n < Number(f.min)) return false;
      if (f.max !== "" && n > Number(f.max)) return false;
    } else if (c.type === "bool") {
      if (f === "y" && !v) return false;
      if (f === "n" && v) return false;
    } else {
      if (!String(v ?? "").toLowerCase().includes(String(f).toLowerCase())) return false;
    }
  }
  return true;
}

export default function FilterCell({ col, value, onChange, options, open, setOpen }) {
  const trigger = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return setPos(null);
    const r = trigger.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 3,
      left: Math.min(r.left, window.innerWidth - 232),
      minWidth: Math.max(r.width, 180),
    });
  }, [open]);

  if (col.type === "date") {
    const on = isActive(value, "date");
    return (
      <div className="fc">
        <button ref={trigger} className={on ? "fc-btn on" : "fc-btn"} onClick={() => setOpen(!open)}>
          {value.blank ? "Blank only"
            : value.from || value.to ? `${value.from ? fmt(value.from) : "\u2190"} \u2013 ${value.to ? fmt(value.to) : "\u2192"}`
            : "All dates"}
        </button>
        {open && pos && (
          <div className="fc-pop" style={pos}>
            <label className="fc-lbl">From</label>
            <input type="date" value={value.from} disabled={value.blank}
              onChange={(e) => onChange({ ...value, from: e.target.value })} />
            <label className="fc-lbl">To</label>
            <input type="date" value={value.to} disabled={value.blank}
              onChange={(e) => onChange({ ...value, to: e.target.value })} />
            <label className="fc-check">
              <input type="checkbox" checked={value.blank}
                onChange={(e) => onChange({ from: "", to: "", blank: e.target.checked })} />
              Blank only
            </label>
            <button className="fc-clear" onClick={() => { onChange(blankFilter("date")); setOpen(false); }}>
              Clear
            </button>
          </div>
        )}
      </div>
    );
  }

  if (col.type === "multi") {
    const on = value.length > 0;
    const label = !on ? "All"
      : value.length === 1
        ? (value[0] === "__blank__" ? "(Blank)"
           : options.find((o) => String(o.id) === value[0])?.label ?? "1 selected")
        : `${value.length} selected`;
    const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    return (
      <div className="fc">
        <button ref={trigger} className={on ? "fc-btn on" : "fc-btn"} onClick={() => setOpen(!open)}>
          <span className="fc-trunc">{label}</span>
          <span className="fc-caret">&#9662;</span>
        </button>
        {open && pos && (
          <div className="fc-pop wide" style={pos}>
            <div className="fc-actions">
              <button onClick={() => onChange(["__blank__", ...options.map((o) => String(o.id))])}>All</button>
              <button onClick={() => onChange([])}>None</button>
            </div>
            <div className="fc-opts">
              <label className={value.includes("__blank__") ? "fc-opt on" : "fc-opt"}>
                <input type="checkbox" checked={value.includes("__blank__")} onChange={() => toggle("__blank__")} />
                <em>(Blank)</em>
              </label>
              {options.map((o) => {
                const id = String(o.id);
                return (
                  <label className={value.includes(id) ? "fc-opt on" : "fc-opt"} key={id}>
                    <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (col.type === "num") {
    return (
      <div className="fc num">
        <input type="number" aria-label={`${col.label} minimum`} placeholder="min" value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })} />
        <input type="number" aria-label={`${col.label} maximum`} placeholder="max" value={value.max}
          onChange={(e) => onChange({ ...value, max: e.target.value })} />
      </div>
    );
  }

  if (col.type === "bool") {
    return (
      <select className="fc-sel" aria-label={`Filter by ${col.label}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        <option value="y">Yes</option>
        <option value="n">No</option>
      </select>
    );
  }

  if (col.type === "none") return null;

  return (
    <input className="fc-text" value={value} aria-label={`Filter by ${col.label}`} placeholder="Contains&hellip;"
      onChange={(e) => onChange(e.target.value)} />
  );
}

export const FILTER_CSS = `
.fc { position: relative; }
.fc-btn, .fc-text, .fc-sel {
  width: 100%; font-size: 11.5px; padding: 3px 6px; border-radius: 5px;
  border: 1px solid var(--border); background: var(--white); font-family: inherit;
  color: var(--text); text-align: left; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: 4px;
}
.fc-text { cursor: text; display: block; }
.fc-sel { cursor: pointer; display: block; }
.fc-btn.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }
.fc-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fc-caret { font-size: 8px; flex: none; }
.fc.num { display: flex; gap: 3px; }
.fc.num input { width: 50%; font-size: 11.5px; padding: 3px 5px; border-radius: 5px; }
.fc-pop {
  position: fixed; z-index: 900; min-width: 180px; background: var(--white);
  border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0,0,0,.16); padding: 9px;
}
.fc-pop.wide { min-width: 210px; max-width: 260px; }
.fc-lbl { display: block; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); margin: 0 0 3px; }
.fc-pop input[type=date] { font-size: 11.5px; padding: 4px 6px; margin-bottom: 7px; width: 100%; }
.fc-check { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 4px 0 8px; cursor: pointer; }
.fc-clear { width: 100%; background: var(--bg); border: 1px solid var(--border);
  border-radius: 5px; padding: 4px; font: 600 11.5px inherit; color: var(--muted); cursor: pointer; }
.fc-actions { display: flex; gap: 5px; margin-bottom: 6px; }
.fc-actions button { flex: 1; background: var(--bg); border: 1px solid var(--border);
  border-radius: 5px; padding: 3px; font: 600 11px inherit; color: var(--accent); cursor: pointer; }
.fc-opts { max-height: 220px; overflow-y: auto; }
.fc-opt { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 400;
  text-transform: none; letter-spacing: 0; color: var(--text); padding: 4px 5px; margin: 0;
  cursor: pointer; white-space: normal; border-radius: 4px; }
.fc-opt:hover { background: var(--bg); }
.fc-opt.on { background: var(--accent-light); color: var(--accent); font-weight: 600; }
.fc-opt em { font-style: italic; color: var(--muted); }
`;
