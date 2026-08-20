import { useState } from "react";
import * as XLSX from "xlsx";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { parsePlotRange } from "./plotRange.js";

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
  report, projectRef, siteName, pocOutput, onClose,
  onRemoveFromCircuit, onDeleteCircuit, onCreateCircuit, onMoveToCircuit, busy,
  progress, rings, onToggleRings,
}) {
  const drag = useDragHandle();
  const [sort, setSort] = useState({ key: "plot", dir: "asc" });
  const [filters, setFilters] = useState({});
  /* Selection spans circuits: someone tidying up picks meters from two
     feeders at once and moves them together. Kept as a set of meter ids
     rather than per circuit, so the buttons only have to work out which
     of their own rows are in it. */
  const [picked, setPicked] = useState([]);
  /* Picking by plot number rather than by eye. On an estate the unlinked
     group runs to hundreds of rows and the meters wanted are "6 to 14" —
     a phrase the designer already has, and a great many clicks. */
  const [range, setRange] = useState("");
  const [rangeNote, setRangeNote] = useState("");
  /* Which circuit the move buttons point at, held per circuit so two
     sections cannot fight over one selection. */
  const [moveTo, setMoveTo] = useState({});

  const toggle = (id) => setPicked((p) =>
    (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const setMany = (ids, on) => setPicked((p) => (on
    ? [...new Set([...p, ...ids])]
    : p.filter((x) => !ids.includes(x))));

  const allMeterIds = report.circuits.flatMap((c) => c.meters.map((m) => m.id));
  const realCircuits = report.circuits.filter((c) => c.id !== "unlinked").length;

  /* Ticking the boxes a range names, rather than replacing the
     selection: a range and a few individual picks are one intent, and
     someone who types 6-14 then spots plot 20 should not lose the
     range by clicking it.

     Matched on plot number, which is what a designer means by "6 to 14"
     — meter labels carry the plot number but also a good deal else, and
     matching those would make 1 catch 11 and 21. */
  function applyRange(rows) {
    const { numbers, bad } = parsePlotRange(range);
    if (!numbers.length) {
      setRangeNote(bad.length ? `Couldn't read: ${bad.join(", ")}` : "Type a range, like 6-14");
      return;
    }
    const want = new Set(numbers.map(String));
    const hits = rows.filter((r) => want.has(String(r.plot)));
    if (!hits.length) {
      setRangeNote(`No unassigned meter on plot ${numbers.join(", ")}`);
      return;
    }
    setMany(hits.map((r) => r.id), true);
    /* Naming what was asked for but not found: a range that quietly
       matches four of nine plots looks like it worked. */
    const missing = numbers.filter((n) => !hits.some((h) => String(h.plot) === String(n)));
    setRangeNote(
      `${hits.length} meter(s) ticked`
      + (missing.length ? ` \u00B7 not here: ${missing.join(", ")}` : "")
      + (bad.length ? ` \u00B7 couldn't read: ${bad.join(", ")}` : "")
    );
  }

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
        /* "not traced to the origin" rather than naming a substation
           the scheme may not have. The column header stays as it is —
           it is an export somebody has spreadsheets built on. */
        Circuit: `Not traced to ${report.station}`, Substation: "",
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

        {/* What a long job is doing, inside the panel that asked for it.

            Deleting a circuit is four writes over as many features as it
            had, and on a large one that is a long silence with a greyed
            out button. The canvas has a progress bar of its own but it
            sits under this panel, so it would run where nobody could see
            it. */}
        {progress && (
          <div className="cr-prog" role="status" aria-live="polite">
            <p className="cr-prog-l">{progress.label}</p>
            <div className="cr-prog-t">
              <div className="cr-prog-b" style={{
                width: `${progress.total
                  ? Math.round(Math.min(1, progress.done / progress.total) * 100)
                  : 0}%`,
              }} />
            </div>
          </div>
        )}

        <div className="cr-head" {...drag.handleProps}>
          <div>
            <h3>Circuit report &mdash; electric meters by feeder</h3>
            {/* The same rings the Layers menu turns on, reachable from
                here.

                This is where someone works out which meters belong to
                which feeder, and the answer is easier to see on the
                drawing than in a table — but the drawing is behind the
                report, and hunting through a menu to show it means
                losing the place in the list. */}
            {onToggleRings && (
              <button className="cr-rings" onClick={onToggleRings}
                title={rings
                  ? "Stop ringing each meter in its circuit's colour"
                  : "Ring each meter in its circuit's colour"}>
                {rings ? "Hide circuit rings" : "Show circuit rings"}
              </button>
            )}
            <p className="cr-sub">
              {[projectRef, siteName].filter(Boolean).join(" \u2014 ")}
              {/* Real circuits only. The unlinked group is carried in
                  the same list so it renders as a section, but counting
                  it said "3 circuits" on a drawing with two — and then
                  the move list offering one destination looked like a
                  fault rather than arithmetic. */}
              {" \u00B7 "}{realCircuits} circuit{realCircuits === 1 ? "" : "s"}
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
            /* Every other real circuit — the unlinked group is the
               absence of a circuit, not somewhere to move a meter to.
               Use Remove from circuit for that. */
            const others = report.circuits.filter((x) =>
              x.id !== "unlinked" && x.id !== c.id);
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
                    {/* Said where it happens rather than left as a
                        column of dashes: a missing distance means the
                        walk could not get there from the substation,
                        which is a network not joined up \u2014 usually a
                        feeder that does not start on the substation. */}
                    {c.unreached > 0 && (
                      <span className="cr-gap">
                        {" "}({c.unreached} not reached from the substation \u2014
                        check the feeder starts on it)
                      </span>
                    )}
                    {c.kvaMissing > 0 && (
                      <span className="cr-gap"> ({c.kvaMissing} with no load recorded)</span>
                    )}
                    {c.maxDist > 0 && ` \u00B7 furthest ${distF(c.maxDist)}`}
                  </span>
                  {anyFilter && (
                    <button className="cr-clear" onClick={() => setFilters({})}>Clear filters</button>
                  )}
                  {/* Only a real circuit can be unassigned from or deleted.
                      The unlinked group is the absence of a circuit, not
                      one of its own. */}
                  {/* Moving meters onto an existing circuit. Offered on
                      every group including the unlinked one: meters left
                      over at the end of a design usually belong on a
                      feeder that already exists, and having only "assign
                      to a new circuit" there meant making a circuit
                      nobody wanted in order to move four plots.

                      Taking out and putting back would do the same job
                      and is not the same operation: the ways on the
                      substation do not change, only which meters hang
                      off them, and unassigning first would leave the
                      meters on no circuit if the second write failed. */}
                  {others.length > 0 && (
                    <span className="cr-move">
                      <select value={moveTo[c.id] ?? ""}
                        aria-label={`Circuit to move the selected meters to`}
                        onChange={(e) => setMoveTo((m) => ({ ...m, [c.id]: e.target.value }))}>
                        <option value="">Move to&hellip;</option>
                        {others.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.letter ? `${o.letter} \u00B7 ` : ""}{o.name}
                          </option>
                        ))}
                      </select>
                      <button className="cr-act cr-move-b"
                        disabled={!pickedHere.length || !moveTo[c.id] || busy}
                        title={!pickedHere.length
                          ? "Tick the meters to move"
                          : !moveTo[c.id]
                            ? "Choose the circuit to move them to"
                            : `Move ${pickedHere.length} meter(s) to that circuit`}
                        onClick={() => {
                          onMoveToCircuit?.(pickedHere, Number(moveTo[c.id]));
                          /* Cleared because the rows are about to belong
                             somewhere else, and a selection pointing at
                             another circuit's rows is a trap for the
                             next button pressed. */
                          setPicked([]);
                          setMoveTo((m) => ({ ...m, [c.id]: "" }));
                        }}>
                        Move
                      </button>
                    </span>
                  )}
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
                  {/* The unlinked group's one action: gather some of these
                      into a circuit that doesn't exist yet. Its number,
                      letter and way on the substation are worked out when
                      it is made, exactly as Link to Circuit does — this
                      is the same operation reached by picking from a list
                      instead of drawing round the plots, which is the
                      only practical way when they aren't neighbours. */}
                  {c.id === "unlinked" && (
                    <div className="cr-mk">
                      <input className="cr-range" value={range}
                        placeholder="Plots, e.g. 6-14"
                        aria-label="Select meters by plot number"
                        onChange={(e) => { setRange(e.target.value); setRangeNote(""); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); applyRange(c.meters); }
                        }} />
                      <button className="cr-clear" disabled={!range.trim()}
                        onClick={() => applyRange(c.meters)}>
                        Tick range
                      </button>
                      <button className="cr-act cr-new" disabled={!pickedHere.length || busy}
                        title={pickedHere.length
                          ? `Put ${pickedHere.length} meter(s) on a new circuit`
                          : "Tick the meters, or type a plot range"}
                        onClick={() => onCreateCircuit?.(pickedHere)}>
                        Assign selected to a new circuit
                      </button>
                    </div>
                  )}
                </div>

                <div className="dt-wrap cr-wrap">
                  <table className="dt cr-tbl">
                    <thead>
                      <tr className="head-row">
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
                        <th />
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
                        <tr><td colSpan={6} className="no-rows">
                          Nothing matches that filter.
                        </td></tr>
                      )}
                      {rows.map((m) => (
                        <tr key={m.id} className={picked.includes(m.id) ? "cr-on" : ""}>
                          <td className="mid">
                            <input type="checkbox" checked={picked.includes(m.id)}
                              aria-label={`Select ${m.meter}`}
                              onChange={() => toggle(m.id)} />
                          </td>
                          <td>{m.meter}</td>
                          <td className="mono">{num(m.plot)}</td>
                          <td className="mono">{m.houseType}</td>
                          <td className="num">{distF(m.distM)}</td>
                          <td className={m.kvaMissing ? "num cr-gap" : "num"}
                            title={m.kvaMissing ? "No load recorded on this plot" : undefined}>
                            {m.kvaMissing ? "\u2014" : kvaF(m.kva)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.id === "unlinked" && rangeNote && (
                  <p className="cr-note">{rangeNote}</p>
                )}
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
                        <td className={m.kvaMissing ? "num cr-gap" : "num"}>
                          {m.kvaMissing ? "\u2014" : kvaF(m.kva)}
                        </td>
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
.cr-rings { background: var(--white); border: 1px solid var(--border); border-radius: 6px;
  cursor: pointer; font: 600 11px inherit; padding: 4px 10px; margin-top: 7px;
  color: var(--accent); }
.cr-rings:hover { border-color: var(--accent); }
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
.cr-mk { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cr-range { border: 1px solid var(--border); border-radius: 6px; font: 600 11px inherit;
  padding: 3px 8px; width: 120px; }
.cr-new { background: #ecfdf5; border-color: #6ee7b7; color: #047857; }
.cr-move { display: inline-flex; align-items: center; gap: 4px; }
.cr-move select { border: 1px solid var(--border); border-radius: 6px; font: 600 11px inherit;
  padding: 3px 6px; max-width: 150px; }
.cr-move-b { background: var(--accent-light); border-color: var(--accent); color: var(--accent); }
.cr-note { font-size: 11px; color: var(--muted); margin: 4px 0 0; }
.cr-gap { color: #b45309; font-weight: 600; }
.cr-prog { padding: 11px 16px; border-bottom: 1px solid var(--border); background: var(--bg); }
.cr-prog-l { margin: 0 0 7px; font-size: 12.5px; font-weight: 600; }
.cr-prog-t { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
.cr-prog-b { height: 100%; background: var(--accent); transition: width .18s ease; }
.dt.cr-tbl tbody tr.cr-on { background: var(--accent-light); }
.cr-wrap { max-height: none; }
.dt.cr-tbl { width: 100%; }
.dt.cr-tbl td { padding: 5px 10px; }
.cr-hint { font-size: 11px; color: var(--muted); margin: 5px 0 0; }
`;
