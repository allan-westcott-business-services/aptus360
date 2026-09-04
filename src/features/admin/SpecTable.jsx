import { useMemo, useState } from "react";
import { useTableLayout } from "../../lib/useTableLayout.js";

/* An editable table on the standard spec.

   The Electric Specs tabs were eight hand-built tables, each with its
   own header row and its own body, and none of them had the sorting,
   filtering or column dragging every other table in the app has. Adding
   those eight times over would have meant eight places to keep in step.

   So the tabs declare their columns and this renders them. A column is:

     key      the field on the row
     label    the heading
     type     text | number | select
     width    starting width in pixels
     options  for select: [{ value, label }]

   Editing stays inline, as it was. Sorting and filtering operate on what
   is displayed rather than on the raw value, so a cable type sorts by its
   name rather than by the id behind it — which is the only ordering
   anyone would expect from a column headed "Cable type". */

export default function SpecTable({
  storageKey, columns, rows, pk, onCell, onCommit, onDelete, cap = 300,
}) {
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const [filters, setFilters] = useState({});

  const layout = useTableLayout(storageKey, columns);

  /* What a cell shows, as opposed to what it holds. Sorting and
     filtering both work from this. */
  const shown = (r, c) => {
    /* A column read from somewhere else. `value` computes it from the
       row — a cable's Usage lives on its TYPE, not on the size — and
       everything here works from `shown`, so it sorts and filters like
       any other column without being editable. */
    if (typeof c.value === "function") return c.value(r) ?? "";
    if (c.type === "select") {
      const o = (c.options || []).find((x) => String(x.value) === String(r[c.key]));
      return o ? o.label : "";
    }
    return r[c.key] ?? "";
  };

  const view = useMemo(() => {
    let out = rows;

    const active = Object.entries(filters).filter(([, v]) => String(v).trim());
    if (active.length) {
      out = out.filter((r) => active.every(([k, v]) => {
        const c = columns.find((x) => x.key === k);
        return String(shown(r, c)).toLowerCase().includes(String(v).toLowerCase());
      }));
    }

    if (sort.key) {
      const c = columns.find((x) => x.key === sort.key);
      out = [...out].sort((a, b) => {
        const av = shown(a, c), bv = shown(b, c);
        /* Blanks last whichever way the sort runs: an empty cell is a
           gap, not a small value, and burying them at the top when
           sorting ascending hides the rows worth looking at. */
        if (av === "" && bv === "") return 0;
        if (av === "") return 1;
        if (bv === "") return -1;
        const n = c.type === "number" ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sort.dir === "asc" ? n : -n;
      });
    }
    return out;
  }, [rows, columns, filters, sort]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Every row is a set of live inputs, so a table of 1,255 is several
     thousand of them and the browser feels it. Showing the first few
     hundred keeps the page responsive, and the filters above are how you
     reach the rest — which is how anyone finds one row in a thousand
     anyway. */
  const capped = view.length > cap;
  const page = capped ? view.slice(0, cap) : view;

  const toggleSort = (key) => setSort((s) =>
    (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const anyFilter = Object.values(filters).some((v) => String(v).trim());

  return (
    <div className="dt-wrap">
      <style>{CSS}</style>
      <table className="dt es">
        <colgroup>
          {layout.visible.map((c) => <col key={c.key} style={{ width: layout.widths[c.key] }} />)}
          <col style={{ width: 40 }} />
        </colgroup>

        <thead>
          <tr className="head-row">
            {layout.visible.map((c) => (
              <th key={c.key} {...layout.reorderProps(c.key)}
                onClick={() => toggleSort(c.key)}
                title="Click to sort, drag to move">
                <span className="th-label">
                  {c.label}
                  {sort.key === c.key && <span className="arrow">
                    {sort.dir === "asc" ? " \u25B2" : " \u25BC"}
                  </span>}
                </span>
                <span className="resizer" onMouseDown={(e) => layout.startResize(e, c.key)} />
              </th>
            ))}
            <th />
          </tr>

          <tr className="filter-row">
            {layout.visible.map((c) => (
              <th key={c.key}>
                <input value={filters[c.key] ?? ""} placeholder="Filter&hellip;"
                  aria-label={`Filter by ${c.label}`}
                  onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))} />
              </th>
            ))}
            <th className="mid">
              {anyFilter && (
                <button className="es-x" title="Clear filters"
                  onClick={() => setFilters({})}>&#10005;</button>
              )}
            </th>
          </tr>
        </thead>

        <tbody>
          {view.length === 0 && (
            <tr>
              <td colSpan={layout.visible.length + 1} className="no-rows">
                {rows.length ? "Nothing matches those filters." : "No rows yet."}
              </td>
            </tr>
          )}

          {page.map((r) => (
            <tr key={r[pk]}>
              {layout.visible.map((c) => (
                <td key={c.key}>
                  {typeof c.value === "function" ? (
                    /* Read-only: it belongs to another table, and a box
                       that takes typing and throws it away is worse
                       than one that does not. */
                    <input className="es-in es-ro" readOnly tabIndex={-1}
                      title={c.from ? `From ${c.from}` : undefined}
                      value={shown(r, c)} />
                  ) : c.type === "checkbox" ? (
                    <input type="checkbox" checked={!!r[c.key]}
                      onChange={(e) => {
                        onCell(r[pk], c.key, e.target.checked);
                        onCommit(r[pk], c.key, e.target.checked);
                      }} />
                  ) : c.type === "select" ? (
                    <select className="es-in" value={r[c.key] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        onCell(r[pk], c.key, v);
                        onCommit(r[pk], c.key, v);
                      }}>
                      <option value="">&mdash;</option>
                      {(c.options || []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={c.type === "number" ? "es-in num" : "es-in"}
                      type={c.type === "number" ? "number" : "text"}
                      step={c.type === "number" ? "any" : undefined}
                      value={r[c.key] ?? ""}
                      onChange={(e) => onCell(r[pk], c.key, e.target.value)}
                      onBlur={(e) => onCommit(r[pk], c.key,
                        c.type === "number"
                          ? (e.target.value === "" ? null : Number(e.target.value))
                          : e.target.value)}
                    />
                  )}
                </td>
              ))}
              <td className="mid">
                <button className="es-x" onClick={() => onDelete(r[pk])}
                  aria-label="Delete row">&#10005;</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {capped && (
        <p className="es-cap">
          Showing {cap} of {view.length}. Filter above to narrow it down.
        </p>
      )}
    </div>
  );
}

/* Styled here rather than in ElectricSpecsAdmin: this component renders
   these elements, and a component that depends on another file's styles
   only works while the two happen to share a page.

   The table itself is the shared .dt spec in styles.css — this only adds
   what an always-editable grid needs on top. */
const CSS = `
.dt.es td { padding: 3px 5px; }
.dt.es .es-in { width: 100%; box-sizing: border-box; padding: 5px 7px;
  border: 1.5px solid var(--border); border-radius: 6px; font: inherit; font-size: 12.5px; }
.dt.es .es-in.num { text-align: right; font-variant-numeric: tabular-nums; }
/* A column read from another table. Flat and greyed so it does not
   invite typing that would be thrown away. */
.dt.es .es-in.es-ro { background: var(--bg); border-style: dashed;
  color: var(--muted); cursor: default; }
.dt.es .es-in:focus { border-color: var(--accent); outline: none; }
.dt.es th { cursor: pointer; }
.dt.es tr.filter-row th { cursor: default; }
.es-x { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 13px; line-height: 1; padding: 2px 5px; }
.es-x:hover { color: #b91c1c; }
.es-cap { margin: 6px 2px 0; font-size: 11px; color: var(--muted); }
`;
