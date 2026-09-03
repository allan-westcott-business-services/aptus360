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

/* The plot number, and who connects it.

   A self-lay plot is on no circuit of ours — somebody else connects it
   — so it appears in every list of meters that are not on one, beside a
   note about checking the trenches. Saying so on the number itself is
   what stops that reading as a fault to chase.

   Written once and used by both tables, because a plot marked in one
   list and bare in the other is the same plot described two ways, and
   the reader would be right to wonder which was true. */
/* What the drawing is fed from, as the word to put in a sentence.

   "POC" or "Substation", from the report's own stationRole. It was
   written out at four places and hard-coded as "substation" at a
   fifth — which said "not reached from the substation" on a site fed
   from a POC, and told somebody to check a feeder starts on a thing
   that is not on their drawing. */
export const originWordOf = (report, caps = false) => (report?.stationRole === "poc"
  ? "POC"
  : (caps ? "Substation" : "substation"));

const plotCell = (m) => (m?.selfLay
  ? `${num(m.plot)} (SLP)`
  : num(m.plot));
const kvaF = (v) => `${(Math.round((v || 0) * 10) / 10).toFixed(1)} kVA`;
const distF = (v) => (v == null ? "\u2014" : `${v.toFixed(1)} m`);

export default function CircuitReport({
  report, projectRef, siteName, pocOutput, onClose,
  onRemoveFromCircuit, onDeleteCircuit, onCreateCircuit, onMoveToCircuit, busy,
  progress, rings, onToggleRings, onRunLevels,
  /* Names which POC feeds a circuit, written across its members by the
     canvas. Only offered where report.origins has more than one. */
  onSetCircuitOrigin,
  /* The circuit's drawn colour: current values by circuit id, and the
     setter that writes a choice to the circuit's own origin. */
  onSetCircuitColour, circuitInk,
  /* Link boxes on each circuit, and the write that moves meters
     between their outputs \u2014 the same shape as the circuit mover. */
  linkBoxes = [], onMoveToLinkWay,
}) {
  const drag = useDragHandle();
  const [sort, setSort] = useState({ key: "plot", dir: "asc" });
  /* One circuit at a time, where the drawing has more than one.

     A site fed from two POCs has two sets of figures, and the same
     location can appear in both \u2014 a feeder point of each circuit at
     one junction \u2014 so circuits stacked down the page read as one
     network contradicting itself. "All" stays available for the site
     totals and for the export, which always carries every circuit. */
  const [onlyCircuit, setOnlyCircuit] = useState("all");
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
  /* Which output the ticked meters are bound for, per circuit. The
     value is "boxId:way", or "" for none, or "off" to take them off
     an output and back onto the origin's routing. */
  const [wayTo, setWayTo] = useState({});

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
    const matched = rows.filter((r) => want.has(String(r.plot)));
    /* Self-lay meters are not pickable, so a range that names one must
       not tick it. Counted apart, because "3 ticked" on a range of five
       is a question, and "2 are self-lay" is the answer to it. */
    const hits = matched.filter((r) => !r.selfLay);
    const selfLay = matched.filter((r) => r.selfLay);
    if (!hits.length) {
      setRangeNote(selfLay.length
        ? `Plot ${selfLay.map((r) => r.plot).join(", ")} `
          + `${selfLay.length === 1 ? "is" : "are"} self-lay \u2014 somebody else `
          + "connects them, so they go on no circuit of ours."
        : `No unassigned meter on plot ${numbers.join(", ")}`);
      return;
    }
    setMany(hits.map((r) => r.id), true);
    /* Naming what was asked for but not found: a range that quietly
       matches four of nine plots looks like it worked. */
    /* Against everything the range matched, not just what was ticked —
       a self-lay plot is reported as self-lay, and saying it is "not
       here" as well would be two answers to one question, one of them
       untrue. */
    const missing = numbers.filter((n) => !matched.some((h) => String(h.plot) === String(n)));
    setRangeNote(
      `${hits.length} meter(s) ticked`
      + (selfLay.length ? ` \u00B7 ${selfLay.length} self-lay, left alone` : "")
      + (missing.length ? ` \u00B7 not here: ${missing.join(", ")}` : "")
      + (bad.length ? ` \u00B7 couldn't read: ${bad.join(", ")}` : "")
    );
  }

  const setFilter = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

  const sortRows = (rows) => {
    const { key, dir } = sort;
    const s = [...rows].sort((a, b) => {
      /* ── Sorting by output ──

         The Fuse cell is a control, not a value, so the sort works off
         the fact behind it: box then way, as one comparable string.
         Meters on no output sort last with the other missing values,
         because "fed from the origin" is not output zero \u2014 it is a
         meter the box does not feed. */
      const fuseKey = (r) => (r.linkBoxId != null && r.linkWay != null
        ? `${String(r.linkBoxId).padStart(9, "0")}:${r.linkWay}` : null);
      const av = key === "fuse" ? fuseKey(a) : a[key];
      const bv = key === "fuse" ? fuseKey(b) : b[key];
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
          [`Distance from ${originWordOf(report)} (m)`]: m.distM,
          kVA: m.kva,
          /* A column of its own, not "(SLP)" after the number.

             The screen puts it in brackets because a person reads the
             two together. A spreadsheet does not: "41 (SLP)" is text,
             and a column with one text value in it returns zero from
             every sum and sort built on it — which is the same reason
             the distance column is a number rather than "400.8 m", two
             comments above.

             Added at the end, so every column somebody already has a
             formula pointing at stays where it was. */
          "Self-lay": m.selfLay ? "Yes" : "",
          /* Why the distance is blank, where it is. Last, for the
             reason Self-lay is last. */
          "Not reached": m.why || "",
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
        [`Distance from ${originWordOf(report)} (m)`]: null,
        kVA: m.kva,
        "Self-lay": m.selfLay ? "Yes" : "",
        "Not reached": m.selfLay ? "" : (m.why || ""),
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
            {/* The gap between the origin and the network.

                Said out loud where it is real, because the reach that
                lets a POC sit across a footway is also wide enough to
                reach the wrong cable. Every distance below includes
                this, so a designer who disagrees with the number knows
                the whole column is out by it.

                Silent under a quarter of a metre: that is the drawing
                tolerance, and a substation is held to it. */}
            {report.stationGapM > 0.25 && (
              <p className="cr-gap">
                {originWordOf(report, true)} sits{" "}
                {report.stationGapM} m from the nearest cable
                {" \u2014 "}included in every distance below.
              </p>
            )}
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
          {/* ── The next question, from where it gets asked ──

              This report says how much load is on each feeder and how
              far the furthest meter is. The question that follows is
              always whether the volt drop and loop impedance are within
              limits, and until now that meant closing the report,
              finding the Electric menu and running the levels check
              from there.

              The report closes as it runs. The levels panel is a panel
              of its own and would open behind this one, which reads as
              the button having done nothing. */}
          {onRunLevels && (
            <button className="btn sm" disabled={!!busy}
              title={`Loop impedance and volt drop on every circuit, from the ${originWordOf(report)}`}
              onClick={() => { onRunLevels(); onClose(); }}>
              Run Levels Check
            </button>
          )}
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
              No meter is linked to a circuit or reachable from the {originWordOf(report)} yet.
              Use Link to Circuit to group plots, and check the substation sits on
              the trench network.
            </p>
          )}

          {report.circuits.length > 1 && (
            <div className="cr-pick">
              <label htmlFor="cr-circuit">Showing</label>
              <select id="cr-circuit" value={onlyCircuit}
                onChange={(e) => setOnlyCircuit(e.target.value)}>
                <option value="all">All circuits</option>
                {report.circuits.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {report.circuits
            .filter((c) => onlyCircuit === "all" || String(c.id) === onlyCircuit)
            .map((c) => {
            const rows = sortRows(match(c.meters));
            /* The link boxes on this circuit, and where each row sits
               now \u2014 read off the meters, which is where the lasso and
               the build both read it. */
            const boxesHere = (linkBoxes || []).filter((b) =>
              c.id !== "unlinked"
              && Number(b.Attributes?.Circuit_ID) === Number(c.id));
            const wayValueOf = (m) => (m.linkBoxId != null && m.linkWay != null
              ? `${m.linkBoxId}:${m.linkWay}` : "off");
            /* ── Named output first ──

               The label read "Link Box 1 · output 2 (400 A)" and the
               column clipped it after "output", so every row looked
               identical and the one fact the column exists to show \u2014
               WHICH output \u2014 was the part cut off. The output leads
               now, the fuse follows it, and the box's name is added
               only where the circuit has more than one box to tell
               apart. */
            const wayLabel = (b, w) => {
              const ways = Number(b.Attributes?.Link_Ways) === 4 ? 3 : 1;
              const fuse = b.Attributes?.Way_Fuse_A?.[w];
              const head = ways === 1 ? "Output" : `Output ${w}`;
              const amps = fuse ? ` \u00b7 ${fuse} A` : "";
              const which = boxesHere.length > 1
                ? ` \u00b7 ${b.Label || `box ${b.Feature_ID}`}` : "";
              return `${head}${amps}${which}`;
            };
            const wayOptions = () => boxesHere.flatMap((b) => Array.from(
              { length: Number(b.Attributes?.Link_Ways) === 4 ? 3 : 1 },
              (_, i) => i + 1,
            ).map((w) => (
              <option key={`${b.Feature_ID}:${w}`} value={`${b.Feature_ID}:${w}`}>
                {wayLabel(b, w)}
              </option>
            )));
            /* The meters that can be picked. Self-lay ones are not:
               somebody else connects them, so they go on no circuit of
               ours. Select-all works from this, so ticking the header
               box on a group of self-lay meters ticks nothing rather
               than ticking rows that every button then refuses. */
            const ids = c.meters.filter((m) => !m.selfLay).map((m) => m.id);
            const pickedHere = picked.filter((id) => ids.includes(id));

            /* ── A self-lay meter among the ticked ones ──

               `ids` leaves them out, so this is normally empty and both
               buttons below are governed by pickedHere as before.

               It is not always empty. A selection outlives a reload of
               the report: tick plot 41, mark it self-lay on the Plots
               tab, come back, and its id is still in `picked` while the
               row is now unpickable. Measured against `c.meters` rather
               than `ids` for exactly that \u2014 measured against `ids` it
               would drop out silently and the plot would just not be
               moved, which is the quiet version of the same fault.

               So the buttons refuse rather than acting on what is left,
               and they say which plot is stopping them. */
            const pickedSelfLay = c.meters.filter((m) => m.selfLay && picked.includes(m.id));
            const selfLayWhy = pickedSelfLay.length
              ? `Plot ${pickedSelfLay.map((m) => m.plot).join(", ")} `
                + `${pickedSelfLay.length === 1 ? "is" : "are"} self-lay \u2014 somebody else `
                + "connects them. Untick them, or clear the self-lay flag on the Plots tab."
              : null;
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
                  {/* ── Fed from ──

                      The report is the one place every circuit is in
                      view with all its meters, so this is where the
                      decision reads best: one box per circuit, the
                      whole membership rewritten on change, and the
                      hint on the empty state says what happens if
                      nobody chooses. Only on a drawing with a choice.
                      The distances re-measure as soon as the write
                      lands, because the report reads the drawing \u2014
                      the ROUTING only moves on the next build. */}
                  {report.origins?.length > 1 && onSetCircuitOrigin
                    && c.id !== "unlinked" && (
                    <span className="cr-fed">
                      <label htmlFor={`cr-fed-${c.id}`}>Fed from</label>
                      <select id={`cr-fed-${c.id}`} disabled={!!busy}
                        value={c.originId != null ? String(c.originId) : ""}
                        onChange={(e) => onSetCircuitOrigin(c.id,
                          e.target.value === "" ? null : Number(e.target.value))}>
                        <option value="">Build decides (nearest)</option>
                        {report.origins.map((o) => (
                          <option key={o.id} value={String(o.id)}>{o.label}</option>
                        ))}
                      </select>
                    </span>
                  )}
                  {/* The circuit's cable colour, beside its feed \u2014 the
                      report is where every circuit is in view, so the
                      choice reads against its neighbours. Immediate,
                      because the report has no Save; the small \u00D7
                      puts the circuit back on the palette. */}
                  {onSetCircuitColour && c.id !== "unlinked" && (
                    <span className="cr-ink">
                      <label title={`Colour of ${c.name} on the drawing`}>
                        <input type="color" disabled={!!busy}
                          value={circuitInk?.get?.(Number(c.id)) || "#64748b"}
                          aria-label={`Cable colour for ${c.name}`}
                          onChange={(e) => onSetCircuitColour(c.id, e.target.value)} />
                        <span className="cr-ink-sw"
                          style={{ background: circuitInk?.get?.(Number(c.id)) || "#64748b" }} />
                      </label>
                      <button type="button" className="cr-ink-x" disabled={!!busy}
                        title="Back to the automatic palette colour"
                        onClick={() => onSetCircuitColour(c.id, null)}>&times;</button>
                    </span>
                  )}
                  <span className="cr-meta">
                    {report.origins?.length > 1 ? "" : `from ${report.station} \u00B7 `}
                    {c.count} meter{c.count === 1 ? "" : "s"}
                    {" \u00B7 "}{kvaF(c.totalKva)}
                    {/* Said where it happens rather than left as a
                        column of dashes: a missing distance means the
                        walk could not get there from the origin, which
                        is a network not joined up.

                        Two faults were in this one sentence. It said
                        "substation" on every drawing, including the
                        ones fed from a POC — sending somebody to check
                        a feeder starts on a thing that is not there.

                        And the em dash was written `\u2014`, which is an
                        escape a JavaScript STRING understands and JSX
                        text does not: it rendered as those six
                        characters. Every other escape in this file is
                        inside a template literal, where it works, which
                        is why this one lasted. In JSX text the entity
                        is the way to say it. */}
                    {c.unreached > 0 && (
                      <span className="cr-gap">
                        {" "}({c.unreached} not reached from the {originWordOf(report)}{" "}
                        &mdash; check the trench network joins back to it)
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
                  {boxesHere.length > 0 && onMoveToLinkWay && (
                    /* The same shape as the circuit mover: tick rows,
                       choose an output, press once. */
                    <span className="cr-move">
                      <select value={wayTo[c.id] ?? ""}
                        aria-label="Output to move the selected meters to"
                        onChange={(e) => setWayTo((m) => ({ ...m, [c.id]: e.target.value }))}>
                        <option value="">Move to output&hellip;</option>
                        <option value="off">From the origin</option>
                        {wayOptions()}
                      </select>
                      <button className="cr-act cr-move-b"
                        disabled={!pickedHere.length || !wayTo[c.id] || busy}
                        title={!pickedHere.length ? "Tick the meters to move"
                          : !wayTo[c.id] ? "Choose the output to move them to"
                            : `Move ${pickedHere.length} meter(s)`}
                        onClick={() => {
                          const v = wayTo[c.id];
                          onMoveToLinkWay(pickedHere, v === "off" ? null
                            : { boxId: Number(v.split(":")[0]),
                              way: Number(v.split(":")[1]) });
                          setPicked([]);
                          setWayTo((m) => ({ ...m, [c.id]: "" }));
                        }}>
                        Move
                      </button>
                    </span>
                  )}
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
                        disabled={!pickedHere.length || !moveTo[c.id] || busy
                          || pickedSelfLay.length > 0}
                        title={selfLayWhy
                          || (!pickedHere.length
                            ? "Tick the meters to move"
                            : !moveTo[c.id]
                              ? "Choose the circuit to move them to"
                              : `Move ${pickedHere.length} meter(s) to that circuit`)}
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
                      <button className="cr-act cr-new"
                        disabled={!pickedHere.length || busy || pickedSelfLay.length > 0}
                        title={selfLayWhy
                          || (pickedHere.length
                            ? `Put ${pickedHere.length} meter(s) on a new circuit`
                            : "Tick the meters, or type a plot range")}
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
                          /* Named for whatever the network is measured
                             from. On a connection to an existing
                             network there is no transformer, so a
                             column headed "from substation" is naming
                             something the scheme does not have.
                             circuitReport says which it used. */
                          ["distM", `Dist. from ${originWordOf(report)}`],
                          ["kva", "kVA"]].map(([k, l]) => (
                            <th key={k} onClick={() => setSort((s) => ({
                              key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc",
                            }))}>
                              {l}{sort.key === k && (sort.dir === "asc" ? " \u25B2" : " \u25BC")}
                            </th>
                          ))}
                        {/* Which output of which link box feeds this
                            meter. Only where the circuit has a box, so
                            an ordinary circuit's table is unchanged. */}
                        {boxesHere.length > 0 && (
                          <th onClick={() => setSort((x) => ({
                            key: "fuse",
                            dir: x.key === "fuse" && x.dir === "asc" ? "desc" : "asc",
                          }))}>
                            Fuse{sort.key === "fuse"
                              && (sort.dir === "asc" ? " \u25B2" : " \u25BC")}
                          </th>
                        )}
                      </tr>
                      <tr className="filter-row">
                        <th />
                        {["meter", "plot", "houseType"].map((k) => (
                          <th key={k}>
                            <input value={filters[k] ?? ""} placeholder="Filter&hellip;"
                              onChange={(e) => setFilter(k)(e.target.value)} />
                          </th>
                        ))}
                        <th colSpan={boxesHere.length > 0 ? 3 : 2} />
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
                          {/* ── A self-lay meter cannot be ticked ──

                              Somebody else connects it. It draws nothing
                              from our transformer, takes no way, and
                              belongs in no volt drop or loop impedance
                              calculation.

                              Refused here rather than at the buttons,
                              because there are four ways to a circuit
                              from this panel — this box, the header's
                              select-all, Tick range, and then either
                              Assign or Move. Guarding the two buttons
                              would leave the row tickable and the
                              button dead, which reads as the button
                              being broken. A row that cannot be picked
                              cannot reach any of them.

                              To put one on a circuit, clear its
                              electric self-lay flag on the Plots tab
                              first. The title says so, because a
                              disabled box with no reason is the fault
                              runStep was written to avoid. */}
                          <td className="mid">
                            <input type="checkbox"
                              checked={picked.includes(m.id)}
                              disabled={m.selfLay}
                              aria-label={m.selfLay
                                ? `${m.meter} is self-lay and cannot go on a circuit`
                                : `Select ${m.meter}`}
                              title={m.selfLay
                                ? "Self-lay \u2014 somebody else connects this one. Clear its "
                                  + "electric self-lay flag on the Plots tab to put it on a circuit."
                                : undefined}
                              onChange={() => toggle(m.id)} />
                          </td>
                          <td>{m.meter}</td>
                          <td className="mono">{plotCell(m)}</td>
                          <td className="mono">{m.houseType}</td>
                          <td className={m.why ? "num cr-gap" : "num"}
                            title={m.why || undefined}>
                            {distF(m.distM)}
                          </td>
                          <td className={m.kvaMissing ? "num cr-gap" : "num"}
                            title={m.kvaMissing ? "No load recorded on this plot" : undefined}>
                            {m.kvaMissing ? "\u2014" : kvaF(m.kva)}
                          </td>
                          {boxesHere.length > 0 && (
                            /* One click to open, one to choose \u2014 the
                               row moves to that output and the next
                               build routes it from there. "From the
                               origin" is the way off a box entirely,
                               named as what it means rather than as an
                               empty value. */
                            <td className="cr-fuse">
                              <select value={wayValueOf(m)} disabled={!!busy}
                                aria-label={`Output feeding ${m.meter}`}
                                onChange={(e) => onMoveToLinkWay?.([m.id],
                                  e.target.value === "off" ? null
                                    : { boxId: Number(e.target.value.split(":")[0]),
                                      way: Number(e.target.value.split(":")[1]) })}>
                                <option value="off">From the origin</option>
                                {wayOptions()}
                              </select>
                            </td>
                          )}
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
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.unreachable.map((m) => (
                      <tr key={m.id}>
                        <td>{m.meter}</td>
                        <td className="mono">{plotCell(m)}</td>
                        <td className="mono">{m.houseType}</td>
                        <td className={m.kvaMissing ? "num cr-gap" : "num"}>
                          {m.kvaMissing ? "\u2014" : kvaF(m.kva)}
                        </td>
                        {/* The reason in the row, because this table
                            exists to send somebody to the drawing and
                            a row with no reason sends them to all of
                            it. A self-lay plot has no fault to name. */}
                        <td className="cr-gap">{m.selfLay ? "" : (m.why || "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* ── The advice has to match what is in the list ──

                  "Check the trenches connect these plots back to it" is
                  the right thing to do about a plot we are connecting
                  and the wrong thing about a self-lay one: that plot is
                  connected to the incumbent's main, the drawing is
                  already correct, and following the note means going to
                  look for a fault that is not there.

                  So the note says which of the two it is. Where every
                  one of them is self-lay it stops giving the advice at
                  all rather than qualifying it, because a sentence
                  telling somebody to check something that is right is
                  not improved by a footnote. */}
              {(() => {
                const slp = report.unreachable.filter((m) => m.selfLay).length;
                const ours = report.unreachable.length - slp;
                if (!ours) {
                  return (
                    <p className="cr-hint">
                      {slp === 1 ? "This is a self-lay supply" : "These are self-lay supplies"}
                      {" \u2014 somebody else connects "}
                      {slp === 1 ? "it" : "them"}, so {slp === 1 ? "it is" : "they are"} on
                      none of our circuits. Nothing to fix.
                    </p>
                  );
                }
                return (
                  <p className="cr-hint">
                    {ours === report.unreachable.length
                      ? "These aren\u2019t reachable"
                      : `${ours} of these aren\u2019t reachable`}
                    {` from the ${originWordOf(report)} along the network. Check the trenches `}
                    connect {ours === 1 ? "that plot" : "those plots"} back to it.
                    {slp > 0 && ` The ${slp} marked (SLP) ${slp === 1 ? "is" : "are"} `
                      + "connected by somebody else and belong on no circuit of ours."}
                  </p>
                );
              })()}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.cr-ink { display: inline-flex; align-items: center; gap: 4px; margin-left: 10px; }
.cr-ink label { position: relative; display: inline-flex; width: 22px; height: 16px;
  cursor: pointer; }
.cr-ink input[type="color"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.cr-ink-sw { display: inline-block; width: 22px; height: 16px; border-radius: 4px;
  border: 1.5px solid #e2e8f0; pointer-events: none; }
.cr-ink-x { border: none; background: none; color: #94a3b8; cursor: pointer;
  font-size: 14px; padding: 0 2px; }
.cr-ink-x:hover { color: #dc2626; }
.cr-fuse { white-space: nowrap; }
.cr-fuse select { padding: 2px 6px; border: 1.5px solid #e2e8f0; border-radius: 6px;
  background: #fff; font: inherit; font-size: 12px; width: 100%; min-width: 150px; }
.cr-fed { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; }
.cr-fed label { font-size: 12px; color: #64748b; }
.cr-fed select { padding: 3px 6px; border: 1.5px solid #e2e8f0; border-radius: 6px;
  background: #fff; font: inherit; font-size: 12px; }
.cr-pick { display: flex; align-items: center; gap: 8px; margin: 8px 0 4px; }
.cr-pick label { font-size: 12px; color: #64748b; }
.cr-pick select { padding: 4px 8px; border: 1.5px solid #e2e8f0; border-radius: 6px;
  background: #fff; font: inherit; }
/* Wider than it was: the Fuse column arrived and 880px clipped the
   output number off every row \u2014 the one fact that column carries.
   Still bounded by the viewport, so a laptop shows the same table
   without a horizontal scroll. */
.cr { background: var(--white); border-radius: 12px; width: min(1180px, 96vw); max-height: 88vh;
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
/* Amber, not red: a POC across a footway is normal and the report is
   correct. It is worth reading, not worth stopping for. */
.cr-gap { margin: 4px 0 0; font-size: 11.5px; color: var(--warn, #92400e); }
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
