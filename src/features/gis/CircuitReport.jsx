import { useState } from "react";
import * as XLSX from "xlsx";
import { useDragHandle } from "../../lib/useDragHandle.js";

/* Circuit report — electric meters by feeder.

   A port of the original's gisCircuitReport. Each circuit lists its
   meters with the plot, house type, distance from the substation and
   load, and its header carries what a designer checks first: how many
   meters, how much load, and how far the furthest one is.

   Distance is measured along the network, not as the crow flies. A meter
   fifty metres away across a garden may be four hundred metres of cable,
   and it is the cable that has to be sized.

   Three groups, because the fix differs. A circuit is planned work. A
   meter reachable but unlinked needs putting in a circuit. A meter that
   cannot be traced back to the substation is a gap in the trenches — a
   drawing fault, not a planning one. */

const num = (v) => (v == null ? "\u2014" : v);
const kvaF = (v) => `${(Math.round((v || 0) * 10) / 10).toFixed(1)} kVA`;
const distF = (v) => (v == null ? "\u2014" : `${v.toFixed(1)} m`);

export default function CircuitReport({
  report, projectRef, siteName, pocOutput, onClose, onRemoveFromCircuit, onDeleteCircuit, busy,
}) {
  const drag = useDragHandle();
  const [sort, setSort] = useState({ key: "plot", dir: "asc" });
  const [filters, setFilters] = useState({});
  /* Selection spans circuits: someone tidying up picks meters from two
     feeders at once and moves them together. Kept as a set of meter ids
     rather than per circuit, so the buttons only have to work out which
     of their own rows are in it. */
  const [picked, setPicked] = useState([]);

  const toggle = (id) => setPicked((p) =>
    (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const setMany = (ids, on) => setPicked((p) => (on
    ? [...new Set([...p, ...ids])]
    : p.filter((x) => !ids.includes(x))));

  const allMeterIds = report.circuits.flatMap((c) => c.meters.map((m) => m.id));

  const setFilter = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

  const sortRows = (rows) => {
    const { key, dir } = sort;
    const s = [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      /* Missing sorts last whichever way round, because "no distance" is
         not a small distance — it is a meter that isn't connected. */
      if (av == null) return 1;
      if (bv == null) return -1;
      return typeof av === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
    });
    return dir === "asc" ? s : s.reverse();
  };

  const match = (rows) => rows.filter((r) => (
    ["meter", "plot", "houseType"].every((k) =>
      !filters[k] || String(r[k] ?? "").toLowerCase().includes(filters[k].toLowerCase()))
  ));

  const anyFilter = Object.values(filters).some(Boolean);

  function exportXlsx() {
    const stamp = new Date().toISOString().slice(0, 10);
    const rows = [];
    for (const c of report.circuits) {
      for (const m of c.meters) {
        rows.push({
          Circuit: c.name, Substation: report.station,
          Meter: m.meter, Plot: m.plot, "House type": m.houseType,
          /* Numeric, not "400.8 m" — a column of text returns zero from
             every sum built on it downstream. */
          "Distance from substation (m)": m.distM,
          kVA: m.kva,
        });
      }
    }
    for (const m of report.unreachable) {
      rows.push({
        Circuit: "Not traced to a substation", Substation: "",
        Meter: m.meter, Plot: m.plot, "House type": m.houseType,
        "Distance from substation (m)": null, kVA: m.kva,
      });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Circuits");
    XLSX.writeFile(wb, `Circuit report ${projectRef || ""} ${stamp}.xlsx`.replace(/\s+/g, " "));
  }

  const over = pocOutput != null && report.totalKva > pocOutput;

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="cr" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Circuit report">
        <style>{CSS}</style>

        <div className="cr-head" {...drag.handleProps}>
          <div>
            <h3>Circuit report &mdash; electric meters by feeder</h3>
            <p className="cr-sub">
              {[projectRef, siteName].filter(Boolean).join(" \u2014 ")}
              {" \u00B7 "}{report.circuits.length} circuit{report.circuits.length === 1 ? "" : "s"}
              {" \u00B7 "}{report.totalMeters} meter{report.totalMeters === 1 ? "" : "s"}
              {" \u00B7 "}{kvaF(report.totalKva)} total
              {pocOutput != null && ` (POC capacity ${kvaF(pocOutput)})`}
            </p>
          </div>
          <label className="cr-all">
            <input type="checkbox"
              checked={allMeterIds.length > 0 && picked.length === allMeterIds.length}
              ref={(el) => {
                if (el) el.indeterminate = picked.length > 0 && picked.length < allMeterIds.length;
              }}
              onChange={(e) => setPicked(e.target.checked ? allMeterIds : [])} />
            Select all meters
          </label>
          <button className="btn accent sm" onClick={exportXlsx}>Export</button>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="cr-body">
          {/* The one figure that turns a report into a decision. */}
          {over && (
            <p className="cr-warn">
              Connected load {kvaF(report.totalKva)} exceeds the POC capacity
              of {kvaF(pocOutput)}.
            </p>
          )}

          {report.circuits.length === 0 && (
            <p className="cr-none">
              No meter is linked to a circuit or reachable from the substation yet.
              Use Link to Circuit to group plots, and check the substation sits on
              the trench network.
            </p>
          )}

          {report.circuits.map((c) => {
            const rows = sortRows(match(c.meters));
            const ids = c.meters.map((m) => m.id);
            const pickedHere = picked.filter((id) => ids.includes(id));
            return (
              <section key={c.id}>
                <div className="cr-ch">
                  <strong>
                    {c.letter && <span className="cr-let">{c.letter}</span>}
                    {c.name}
                  </strong>
                  <span className="cr-meta">
                    from {report.station} &middot; {c.count} meter{c.count === 1 ? "" : "s"}
                    {" \u00B7 "}{kvaF(c.totalKva)}
                    {c.maxDist > 0 && ` \u00B7 furthest ${distF(c.maxDist)}`}
                  </span>
                  {anyFilter && (
                    <button className="cr-clear" onClick={() => setFilters({})}>Clear filters</button>
                  )}
                  {/* Only a real circuit can be unassigned from or deleted.
                      The unlinked group is the absence of a circuit, not
                      one of its own. */}
                  {c.id !== "unlinked" && (
                    <>
                      <button className="cr-act" disabled={!pickedHere.length || busy}
                        title={pickedHere.length
                          ? `Take ${pickedHere.length} meter(s) out of ${c.name}`
                          : "Tick the meters to take out"}
                        onClick={() => onRemoveFromCircuit?.(pickedHere, c)}>
                        Remove selected from circuit
                      </button>
                      <button className="cr-act cr-del" disabled={busy}
                        title="Unassigns every meter and frees the circuit's way on the substation. The meters and trenches stay."
                        onClick={() => onDeleteCircuit?.(c)}>
                        Delete circuit
                      </button>
                    </>
                  )}
                </div>

                <div className="dt-wrap cr-wrap">
                  <table className="dt cr-tbl">
                    <thead>
                      <tr className="head-row">
                        {c.id !== "unlinked" && (
                          <th style={{ width: 34 }}>
                            <input type="checkbox"
                              aria-label={`Select every meter in ${c.name}`}
                              checked={ids.length > 0 && pickedHere.length === ids.length}
                              ref={(el) => {
                                if (el) el.indeterminate =
                                  pickedHere.length > 0 && pickedHere.length < ids.length;
                              }}
                              onChange={(e) => setMany(ids, e.target.checked)} />
                          </th>
                        )}
                        {[["meter", "Meter"], ["plot", "Plot"], ["houseType", "House type"],
                          ["distM", "Dist. from substation"], ["kva", "kVA"]].map(([k, l]) => (
                            <th key={k} onClick={() => setSort((s) => ({
                              key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc",
                            }))}>
                              {l}{sort.key === k && (sort.dir === "asc" ? " \u25B2" : " \u25BC")}
                            </th>
                          ))}
                      </tr>
                      <tr className="filter-row">
                        {c.id !== "unlinked" && <th />}
                        {["meter", "plot", "houseType"].map((k) => (
                          <th key={k}>
                            <input value={filters[k] ?? ""} placeholder="Filter&hellip;"
                              onChange={(e) => setFilter(k)(e.target.value)} />
                          </th>
                        ))}
                        <th colSpan={2} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={c.id === "unlinked" ? 5 : 6} className="no-rows">
                          Nothing matches that filter.
                        </td></tr>
                      )}
                      {rows.map((m) => (
                        <tr key={m.id} className={picked.includes(m.id) ? "cr-on" : ""}>
                          {c.id !== "unlinked" && (
                            <td className="mid">
                              <input type="checkbox" checked={picked.includes(m.id)}
                                aria-label={`Select ${m.meter}`}
                                onChange={() => toggle(m.id)} />
                            </td>
                          )}
                          <td>{m.meter}</td>
                          <td className="mono">{num(m.plot)}</td>
                          <td className="mono">{m.houseType}</td>
                          <td className="num">{distF(m.distM)}</td>
                          <td className="num">{kvaF(m.kva)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {report.unreachable.length > 0 && (
            <section>
              <div className="cr-ch cr-bad">
                <strong>
                  Not traced to a substation &mdash; {report.unreachable.length} meter
                  {report.unreachable.length === 1 ? "" : "s"}
                </strong>
              </div>
              <div className="dt-wrap cr-wrap">
                <table className="dt cr-tbl">
                  <thead>
                    <tr className="head-row">
                      <th>Meter</th><th>Plot</th><th>House type</th><th>kVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.unreachable.map((m) => (
                      <tr key={m.id}>
                        <td>{m.meter}</td>
                        <td className="mono">{num(m.plot)}</td>
                        <td className="mono">{m.houseType}</td>
                        <td className="num">{kvaF(m.kva)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="cr-hint">
                These aren&rsquo;t reachable from the substation along the network.
                Check the trenches connect these plots back to it.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.cr { background: var(--white); border-radius: 12px; width: min(880px, 95vw); max-height: 88vh;
  display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.cr-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.cr-head > div { flex: 1; }
.cr-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.cr-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); }
.cr-body { padding: 4px 18px 18px; overflow-y: auto; flex: 1; }
.cr-warn { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; border-radius: 8px;
  padding: 9px 13px; font-size: 12.5px; font-weight: 600; margin: 12px 0; }
.cr-none { color: var(--muted); font-size: 12.5px; padding: 30px; text-align: center; }
.cr-ch { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 16px 0 6px; }
.cr-ch strong { font-size: 13px; color: #ea580c; display: inline-flex; align-items: center; gap: 7px; }
.cr-ch.cr-bad strong { color: #b45309; }
.cr-let { background: var(--accent); color: #fff; border-radius: 5px; padding: 0 7px;
  font-size: 11px; }
.cr-meta { font-size: 11.5px; color: var(--muted); flex: 1; }
.cr-clear { background: none; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  font: 600 11px inherit; padding: 3px 10px; color: var(--muted); }
.cr-all { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 0; cursor: pointer; }
.cr-act { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 6px;
  cursor: pointer; font: 600 11px inherit; padding: 3px 10px; }
.cr-act:disabled { opacity: .45; cursor: not-allowed; }
.cr-del { border-width: 1.5px; border-color: #dc2626; font-weight: 700; }
.dt.cr-tbl tbody tr.cr-on { background: var(--accent-light); }
.cr-wrap { max-height: none; }
.dt.cr-tbl { width: 100%; }
.dt.cr-tbl td { padding: 5px 10px; }
.cr-hint { font-size: 11px; color: var(--muted); margin: 5px 0 0; }
`;
