import { useState, useMemo, useRef } from "react";
import { toDateOrNull, formatDate } from "./pipeline.js";

/* The grid both data tabs use: sort, per-column filter, resizable
   columns, paging.

   Kept as its own component rather than two near-copies, because the
   Site Details and Schedule tables differ only in their columns and
   whether a cell can be edited. */

export function formatCell(value, col) {
  if (col?.type === "date") {
    const d = toDateOrNull(value);
    return d ? formatDate(d) : "";
  }
  if (value == null) return "";
  if (value instanceof Date) return formatDate(value);
  return String(value);
}

export default function VynTable({ columns, rows, onCellEdit }) {
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [widths, setWidths] = useState(
    () => Object.fromEntries(columns.map((c) => [c.key, c.mono ? 130 : 150])));
  const drag = useRef(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((row) => {
      if (q && !columns.some((c) => formatCell(row[c.key], c).toLowerCase().includes(q))) {
        return false;
      }
      for (const [key, term] of Object.entries(filters)) {
        if (!term) continue;
        const col = columns.find((c) => c.key === key);
        if (!formatCell(row[key], col).toLowerCase().includes(term.toLowerCase())) return false;
      }
      return true;
    });
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key);
      out = [...out].sort((a, b) => {
        let av = a[sort.key], bv = b[sort.key];
        if (col?.type === "date") {
          av = toDateOrNull(av)?.getTime() ?? -Infinity;
          bv = toDateOrNull(bv)?.getTime() ?? -Infinity;
        } else {
          av = formatCell(av, col).toLowerCase();
          bv = formatCell(bv, col).toLowerCase();
        }
        return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
      });
    }
    return out;
  }, [rows, columns, search, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const activeFilters = Object.values(filters).filter(Boolean).length + (search ? 1 : 0);

  function startResize(e, key) {
    e.preventDefault();
    drag.current = { key, x: e.clientX, w: widths[key] };
    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      setWidths((w) => ({ ...w, [d.key]: Math.max(60, d.w + (ev.clientX - d.x)) }));
    };
    const up = () => {
      drag.current = null;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  return (
    <div className="vy-table">
      <div className="vy-toolbar">
        <input className="vy-search" value={search} placeholder="Search all columns…"
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <span className="vy-pill">
          {filtered.length.toLocaleString("en-GB")} of {rows.length.toLocaleString("en-GB")} rows
        </span>
        <button className="btn sm" disabled={!activeFilters}
          onClick={() => { setFilters({}); setSearch(""); setPage(1); }}>
          Clear all filters{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </div>

      <div className="vy-scroll">
        <table>
          <colgroup>
            {columns.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>
                  <button className="vy-sort"
                    onClick={() => setSort((s) => (s.key === c.key
                      ? { key: c.key, dir: -s.dir } : { key: c.key, dir: 1 }))}>
                    <span>{c.label}</span>
                    <span className="vy-arrow">
                      {sort.key === c.key ? (sort.dir === 1 ? "\u25B2" : "\u25BC") : ""}
                    </span>
                  </button>
                  <span className="vy-resize" onMouseDown={(e) => startResize(e, c.key)} />
                </th>
              ))}
            </tr>
            <tr className="vy-filters">
              {columns.map((c) => (
                <th key={c.key}>
                  <input value={filters[c.key] ?? ""} placeholder="Filter…"
                    onChange={(e) => {
                      setFilters((f) => ({ ...f, [c.key]: e.target.value })); setPage(1);
                    }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!pageRows.length && (
              <tr><td className="vy-empty" colSpan={columns.length}>No rows match.</td></tr>
            )}
            {pageRows.map((row, i) => (
              <tr key={start + i}>
                {columns.map((c) => {
                  const text = formatCell(row[c.key], c);
                  if (c.editable && onCellEdit) {
                    return (
                      <td key={c.key} className="vy-edit">
                        <input defaultValue={text} placeholder={"\u2014"}
                          onBlur={(e) => onCellEdit(row, c.key, e.target.value)} />
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className={c.mono ? "vy-mono" : ""}>
                      {text === "" ? <span className="vy-dash">{"\u2014"}</span> : text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="vy-pager">
        <span>Page {current} of {totalPages}</span>
        <span className="vy-pager-btns">
          <select value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button className="btn sm" disabled={current <= 1}
            onClick={() => setPage(current - 1)}>{"\u2190"} Prev</button>
          <button className="btn sm" disabled={current >= totalPages}
            onClick={() => setPage(current + 1)}>Next {"\u2192"}</button>
        </span>
      </div>
    </div>
  );
}
