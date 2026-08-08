import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getPlanning, moveAssignment } from "../../api/planning.js";
import { remember, recall } from "../../lib/session.js";
import {
  DAY_MS, buildRows, packLanes, daysInRange, isWeekend, todayMs, toISO,
  phaseColours, activeDays, nextActiveDay, prevActiveDay,
} from "./timeline.js";
import AssignmentModal from "./AssignmentModal.jsx";
import PmColoursModal from "./PmColoursModal.jsx";

/* The schedule, as a board.

   Time runs left to right; each row is a team, a region, a work type, a
   call-off or a project manager, depending on what is being asked. A
   booking is a bar. That is the whole idea, and the reason it beats the
   call-off list for this particular question: "is there a gang free on
   the 14th" is a question about shape, and a list cannot show shape.

   ── What is here, and what is deliberately not ──

   Bookings can be dragged along the time axis, and that writes. They
   cannot be dragged between rows: moving work to another team is a
   question about craft and region — the rules in assignments.js — and a
   board that let you drop a jointing job on a reinstatement gang would
   be offering to break them. That decision belongs on the call-off,
   where the eligible teams are worked out and shown.

   Unassigned phases appear on their own row at the customer's preferred
   date so they can be seen against the gangs' free time, but they are
   not draggable either: there is nothing yet to move.

   ── The layout ──

   A fixed label column and a track that fills the rest, with the bars
   positioned as percentages of the track. Percentages rather than
   pixels so the board reflows with the window without recomputing
   anything, and the header strip and the rows share one column model so
   they cannot drift apart. */

const RANGES = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "Month" },
  { days: 60, label: "2 months" },
];

const PIVOTS = [
  { key: "team", label: "Team" },
  { key: "region", label: "Region" },
  { key: "worktype", label: "Work type" },
  { key: "ref", label: "Call-off" },
  { key: "pm", label: "Project manager" },
];

const LANE_H = 46;
const ROW_MIN_H = 54;

const fmtFull = (ms) => new Date(ms).toLocaleDateString("en-GB",
  { day: "numeric", month: "short", year: "numeric" });

/* White or near-black on a chosen colour, by contrast rather than by a
   brightness threshold — the argument is in lib/pillColour.js, which
   this uses so a manager's colour reads the same here as a status pill
   does anywhere else. */
import { contrast } from "../../lib/pillColour.js";
const inkOn = (c) => (contrast(c, "#1f2937") >= contrast(c, "#ffffff")
  ? "#1f2937" : "#ffffff");

export default function PlanningPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  const [pivot, setPivot] = useState(() => recall("planPivot", "team"));
  const [rangeDays, setRangeDays] = useState(() => Number(recall("planRange", 14)) || 14);
  const [rangeStart, setRangeStart] = useState(todayMs);
  const [activeOnly, setActiveOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [openBar, setOpenBar] = useState(null);
  const [coloursOpen, setColoursOpen] = useState(false);

  useEffect(() => remember("planPivot", pivot), [pivot]);
  useEffect(() => remember("planRange", rangeDays), [rangeDays]);

  async function load() {
    setLoading(true);
    try {
      setData(await getPlanning());
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  /* A message that clears itself. Used for the two edges of the jump
     buttons and for what a drag did, neither of which is an error and
     neither of which should stay on screen. */
  const say = useCallback((msg) => {
    setNote(msg);
    window.clearTimeout(say._t);
    say._t = window.setTimeout(() => setNote(""), 4000);
  }, []);

  const days = useMemo(() => daysInRange(rangeStart, rangeDays), [rangeStart, rangeDays]);
  const rangeEnd = rangeStart + rangeDays * DAY_MS;
  const today = todayMs();

  const rows = useMemo(() => (data
    ? buildRows(data, {
      pivot, rangeStart, rangeDays,
      activeTeamsOnly: activeOnly, collapsedGroups: collapsed,
    })
    : []), [data, pivot, rangeStart, rangeDays, activeOnly, collapsed]);

  const colours = useMemo(() => phaseColours(data?.taskTypes || []), [data]);

  /* Which utilities each project has an agreement for, as a strip of
     dots on the bar.

     The original used emoji for this because it had nothing else. Here
     the agreement carries Utility_ID and the utility carries a colour —
     the same colour the drawing and the bill of materials use — so the
     strip is read rather than guessed, and it matches what the reader
     has already seen elsewhere for that utility. */
  const utilitiesByProject = useMemo(() => {
    const byId = new Map((data?.utilities || [])
      .map((u) => [Number(u.Utility_ID), u]));
    const out = new Map();
    for (const a of data?.agreements || []) {
      const u = byId.get(Number(a.Utility_ID));
      if (!u) continue;
      const key = Number(a.Project_ID);
      if (!out.has(key)) out.set(key, new Map());
      out.get(key).set(Number(u.Utility_ID), u);
    }
    return new Map([...out].map(([k, m]) => [k,
      [...m.values()].sort((x, y) => (x.Sort_Order ?? 0) - (y.Sort_Order ?? 0))]));
  }, [data]);

  const jumpDays = useMemo(() => (data ? activeDays(data) : []), [data]);

  function jump(dir) {
    const to = dir > 0
      ? nextActiveDay(jumpDays, rangeStart)
      : prevActiveDay(jumpDays, rangeStart);
    if (to == null) {
      say(dir > 0 ? "Nothing scheduled after this." : "Nothing scheduled before this.");
      return;
    }
    setRangeStart(to);
  }

  /* Paging moves half a window rather than a whole one, so what was on
     the right edge is still on screen after the step — a full page
     leaves nothing in common between the two views and makes a run of
     work impossible to follow across the join. */
  const page = (dir) => setRangeStart((s) =>
    s + dir * Math.max(1, Math.floor(rangeDays / 2)) * DAY_MS);

  /* ── Dragging a booking ──

     Horizontal only, snapped to half days, and the write goes through
     one endpoint that moves the assignment and its work days together.

     The bar is moved with a transform while the pointer is down rather
     than by re-rendering the board on every mousemove: the board is a
     few hundred absolutely positioned divs, and rebuilding it sixty
     times a second to follow a cursor is how a drag becomes a stutter. */
  const trackRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = drag;

  const onBarPointerDown = (e, item) => {
    if (item.kind !== "assignment") return;
    if (e.button !== 0) return;
    const track = e.currentTarget.parentElement;
    const dayPx = track.getBoundingClientRect().width / rangeDays;
    if (!Number.isFinite(dayPx) || dayPx <= 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    setDrag({
      id: item.id, assignmentId: item.assignmentId,
      dayPx, startX: e.clientX, offsetPx: 0, shiftDays: 0, moved: false,
    });
  };

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      /* Snapped to whole days, because the schema stores days. Half-day
         snapping would let a drag land somewhere the database cannot
         record, and the bar would spring back on reload. */
      const shiftDays = Math.round(dx / d.dayPx);
      setDrag((cur) => (cur && (cur.shiftDays !== shiftDays || !cur.moved)
        ? { ...cur, shiftDays, offsetPx: shiftDays * cur.dayPx, moved: cur.moved || Math.abs(dx) > 3 }
        : cur));
    };
    const up = async () => {
      const d = dragRef.current;
      setDrag(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!d || !d.moved || !d.shiftDays) return;
      /* Optimistic, then reconciled. The board is the thing being
         worked in, and waiting for a round trip before the bar moves
         makes a drag feel broken on a slow connection. */
      setData((cur) => shiftInPlace(cur, d.assignmentId, d.shiftDays));
      try {
        await moveAssignment(d.assignmentId, d.shiftDays);
        say(`Moved ${Math.abs(d.shiftDays)} day${Math.abs(d.shiftDays) === 1 ? "" : "s"} `
          + `${d.shiftDays > 0 ? "later" : "earlier"}.`);
      } catch (err) {
        /* Put it back. A failed write that leaves the bar where it was
           dropped is worse than no move at all: the board would show a
           booking on a day the database has never heard of. */
        setData((cur) => shiftInPlace(cur, d.assignmentId, -d.shiftDays));
        setError(`Could not move it: ${err.message}`);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag?.id, say]);

  /* ── Middle-button pan ──

     Held and dragged, the window slides through the schedule. Snapped
     to whole days so the grid stays aligned with its own header. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    let pan = null;
    const down = (e) => {
      if (e.button !== 1) return;
      const w = el.getBoundingClientRect().width;
      const dayPx = w / rangeDays;
      if (!Number.isFinite(dayPx) || dayPx <= 0) return;
      e.preventDefault();
      pan = { x: e.clientX, from: rangeStart, dayPx };
    };
    const move = (e) => {
      if (!pan) return;
      const delta = Math.round((pan.x - e.clientX) / pan.dayPx);
      setRangeStart(pan.from + delta * DAY_MS);
    };
    const up = () => { pan = null; };
    el.addEventListener("mousedown", down);
    /* Chrome opens its scroll widget on a middle click unless the
       auxclick is refused as well. */
    const aux = (e) => { if (e.button === 1) e.preventDefault(); };
    el.addEventListener("auxclick", aux);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      el.removeEventListener("mousedown", down);
      el.removeEventListener("auxclick", aux);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [rangeStart, rangeDays]);

  const dayPct = 100 / rangeDays;
  const halfPct = dayPct / 2;
  const maxHalf = rangeDays * 2;
  /* AM and PM only where a day is wide enough to letter. Below that the
     split is a pair of unreadable slivers and the dashes it needs make
     the grid look broken. */
  const showHalves = rangeDays <= 14;

  const totals = useMemo(() => {
    const items = rows.flatMap((r) => r.items || []);
    return {
      booked: items.filter((i) => i.kind === "assignment").length,
      waiting: items.filter((i) => i.kind === "unassigned").length,
    };
  }, [rows]);

  return (
    <div className="page pln-page">
      <style>{CSS}</style>

      <div className="pln-bar">
        <h2>Planning</h2>

        <div className="pln-pivots" role="group" aria-label="Group the schedule by">
          {PIVOTS.map((p) => (
            <button key={p.key}
              className={`pln-pivot${pivot === p.key ? " on" : ""}`}
              onClick={() => setPivot(p.key)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="pln-nav">
          <button className="btn ghost sm" onClick={() => page(-1)} title="Back">
            &larr;
          </button>
          <button className="btn ghost sm" onClick={() => setRangeStart(todayMs())}>
            Today
          </button>
          <button className="btn ghost sm" onClick={() => page(1)} title="Forward">
            &rarr;
          </button>
        </div>

        <div className="pln-nav">
          <button className="btn ghost sm" onClick={() => jump(-1)}
            title="Jump back to the nearest day with work on it">
            &#9198; Previous
          </button>
          <button className="btn ghost sm" onClick={() => jump(1)}
            title="Jump forward to the nearest day with work on it">
            Next &#9197;
          </button>
        </div>

        <select className="pln-range" value={rangeDays} aria-label="How much to show"
          onChange={(e) => setRangeDays(Number(e.target.value))}>
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>{r.label}</option>
          ))}
        </select>

        <span className="pln-dates">
          {fmtFull(rangeStart)} &rarr; {fmtFull(rangeEnd - DAY_MS)}
        </span>

        {pivot === "team" && (
          <label className="pln-check">
            <input type="checkbox" checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)} />
            Only teams with work
          </label>
        )}

        <span className="pln-spacer" />

        {pivot === "pm" && (
          <button className="btn ghost sm" onClick={() => setColoursOpen(true)}>
            Manager colours
          </button>
        )}
        <button className="btn ghost sm" onClick={load} disabled={loading}>
          {loading ? "Loading\u2026" : "Refresh"}
        </button>
      </div>

      {error && <p className="pln-err">{error}</p>}
      {note && <p className="pln-note">{note}</p>}

      {loading && !data && <p className="hint">Loading the schedule&hellip;</p>}

      {data && (
        <>
          <div className="pln-grid">
            <div className="pln-head">
              <div className="pln-head-label">
                {PIVOTS.find((p) => p.key === pivot)?.label}
              </div>
              <div className="pln-head-track" ref={trackRef}>
                {days.map((d, i) => {
                  const dt = new Date(d);
                  return (
                    <div key={d}
                      className={`pln-day${isWeekend(d) ? " wknd" : ""}${d === today ? " today" : ""}`}
                      style={{ width: `${dayPct}%` }}>
                      <span className="pln-dow">
                        {dt.toLocaleDateString("en-GB", { weekday: "short" })}
                      </span>
                      <span className="pln-dnum">{dt.getDate()}</span>
                      {/* The month, but only where it changes — on a two
                          month window a column of repeated "Aug" is
                          noise, and the one place it is needed is the
                          day the month turns over. */}
                      {(i === 0 || new Date(days[i - 1]).getMonth() !== dt.getMonth()) && (
                        <span className="pln-mon">
                          {dt.toLocaleDateString("en-GB", { month: "short" })}
                        </span>
                      )}
                      {showHalves && (
                        <span className="pln-halves"><i>AM</i><i>PM</i></span>
                      )}
                    </div>
                  );
                })}
                {today >= rangeStart && today < rangeEnd && (
                  <div className="pln-now"
                    style={{ left: `${((today - rangeStart) / (rangeEnd - rangeStart)) * 100}%` }} />
                )}
              </div>
            </div>

            {!rows.length && (
              <p className="pln-empty">
                Nothing scheduled in this window. Page forward, or use Next to jump
                to the nearest day with work on it.
              </p>
            )}

            {rows.map((row) => {
              if (row.type === "group") {
                return (
                  <button key={row.key} className="pln-group"
                    style={{ background: row.colour, color: inkOn(row.colour) }}
                    onClick={() => setCollapsed((cur) => {
                      const next = new Set(cur);
                      if (next.has(row.groupId)) next.delete(row.groupId);
                      else next.add(row.groupId);
                      return next;
                    })}>
                    <span className="pln-caret">{row.collapsed ? "\u25b6" : "\u25bc"}</span>
                    <span className="pln-group-name">{row.label}</span>
                    <span className="pln-group-n">{row.count}</span>
                  </button>
                );
              }

              const { spans, laneCount } = packLanes((row.items || []).map((it) => ({ ...it })));
              const height = Math.max(ROW_MIN_H, laneCount * LANE_H + 8);

              return (
                <div key={row.key}
                  className={`pln-row${row.isUnassigned ? " unassigned" : ""}`}
                  style={{ minHeight: height }}>
                  <div className="pln-label"
                    style={row.groupColour
                      ? { background: row.groupColour, color: inkOn(row.groupColour) }
                      : undefined}>
                    <span className="pln-label-text">{row.label}</span>
                    {!!(row.items || []).length && (
                      <span className="pln-count">{row.items.length}</span>
                    )}
                  </div>
                  <div className="pln-track">
                    {days.map((d, i) => (
                      <div key={d}
                        className={`pln-col${isWeekend(d) ? " wknd" : ""}`}
                        style={{ left: `${dayPct * i}%`, width: `${dayPct}%` }} />
                    ))}
                    {showHalves && days.map((d, i) => (
                      <div key={`h${d}`} className="pln-half"
                        style={{ left: `${dayPct * (i + 0.5)}%` }} />
                    ))}
                    {today >= rangeStart && today < rangeEnd && (
                      <div className="pln-now"
                        style={{ left: `${((today - rangeStart) / (rangeEnd - rangeStart)) * 100}%` }} />
                    )}

                    {spans.map((item) => {
                      const from = Math.max(0, item.startHalf);
                      const to = Math.min(maxHalf, item.startHalf + item.lengthHalves);
                      if (to <= from) return null;
                      const clipL = item.startHalf < 0;
                      const clipR = item.startHalf + item.lengthHalves > maxHalf;
                      const utils = utilitiesByProject.get(Number(item.projectId)) || [];
                      const moving = drag?.id === item.id;
                      return (
                        <div key={item.id}
                          className={`pln-bar-item${item.kind === "unassigned" ? " waiting" : ""}`
                            + `${clipL ? " clip-l" : ""}${clipR ? " clip-r" : ""}`
                            + `${moving ? " moving" : ""}`}
                          style={{
                            left: `${from * halfPct}%`,
                            width: `calc(${(to - from) * halfPct}% - 3px)`,
                            top: item.lane * LANE_H + 4,
                            height: LANE_H - 8,
                            background: item.colour,
                            transform: moving ? `translateX(${drag.offsetPx}px)` : undefined,
                          }}
                          title={`${item.label}\n${item.startDate} \u2192 ${item.endDate}`}
                          onPointerDown={(e) => onBarPointerDown(e, item)}
                          onClick={() => {
                            /* A drag ends with a click. Opening the
                               panel every time somebody moved a bar
                               would put a dialog over the board on
                               every reschedule. */
                            if (drag?.moved) return;
                            if (item.kind === "assignment") setOpenBar(item);
                          }}>
                          {item.offSite && <span className="pln-off" title="Off site">!</span>}
                          <span className="pln-ref">{item.ref}</span>
                          <span className="pln-phase">{item.phase}</span>
                          {!!utils.length && (
                            <span className="pln-utils">
                              {utils.map((u) => (
                                <i key={u.Utility_ID} title={u.Utility}
                                  style={{ background: u.Colour || "#94a3b8" }} />
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pln-legend">
            <span className="pln-legend-t">Phases</span>
            {(data.taskTypes || []).map((t) => (
              <span key={t.Task_Type_ID} className="pln-key">
                <i style={{ background: colours.get(Number(t.Task_Type_ID)) }} />
                {t.Task_Type_Name}
              </span>
            ))}
            <span className="pln-key">
              <i className="pln-key-waiting" />
              Not yet assigned, at the requested date
            </span>
            <span className="pln-key"><i className="pln-key-now" />Today</span>
            <span className="pln-legend-n">
              {totals.booked} booked, {totals.waiting} waiting in this window
            </span>
          </div>

          <p className="pln-help">
            Drag a booking sideways to move it &mdash; its work days move with it.
            Hold the middle mouse button to pan. Moving work to a different team is
            done on the call-off, where the teams qualified for the phase are shown.
          </p>
        </>
      )}

      {openBar && data && (
        <AssignmentModal
          item={openBar}
          data={data}
          utilities={utilitiesByProject.get(Number(openBar.projectId)) || []}
          onClose={() => setOpenBar(null)}
        />
      )}

      {coloursOpen && data && (
        <PmColoursModal
          data={data}
          onClose={() => setColoursOpen(false)}
          onSaved={(colours2) => {
            setData((cur) => ({
              ...cur,
              people: (cur.people || []).map((p) => (colours2[p.Person_ID] != null
                ? { ...p, Planner_Colour: colours2[p.Person_ID] } : p)),
            }));
            setColoursOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* Moving a booking in the copy the board is drawing from.

   Both the assignment and its days, because the footprint is read from
   the days where there are any — shifting the assignment alone would
   move the dates in the panel and leave the bar exactly where it was.

   Exported so the shift can be checked without a browser. */
export function shiftInPlace(data, assignmentId, days) {
  if (!data) return data;
  const move = (d) => {
    if (!d) return d;
    const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number);
    if (!y || !m || !dd) return d;
    return toISO(new Date(y, m - 1, dd).getTime() + days * DAY_MS);
  };
  return {
    ...data,
    assignments: (data.assignments || []).map((a) =>
      (Number(a.Assignment_ID) === Number(assignmentId)
        ? { ...a, Start_Date: move(a.Start_Date), End_Date: move(a.End_Date) }
        : a)),
    workDays: (data.workDays || []).map((w) =>
      (Number(w.Assignment_ID) === Number(assignmentId)
        ? { ...w, Work_Date: move(w.Work_Date) }
        : w)),
  };
}

const CSS = `
.pln-page { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 28px; }
.pln-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.pln-bar h2 { margin: 0; font-size: 18px; font-weight: 700; }
.pln-spacer { flex: 1; }
.pln-pivots { display: inline-flex; border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; background: var(--white); }
.pln-pivot { border: 0; border-left: 1px solid var(--border); background: var(--white);
  padding: 6px 12px; font: 600 12px inherit; color: var(--text); cursor: pointer; }
.pln-pivot:first-child { border-left: 0; }
.pln-pivot.on { background: #39467B; color: #fff; }
.pln-nav { display: inline-flex; gap: 4px; }
.pln-range { border: 1px solid var(--border); border-radius: 6px; font: 600 12px inherit;
  padding: 5px 9px; }
.pln-dates { font-size: 12.5px; font-weight: 600; color: var(--muted); }
.pln-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
  color: var(--muted); cursor: pointer; }
.pln-err { font-size: 12.5px; color: #991b1b; background: #fef2f2; border: 1px solid #fca5a5;
  border-radius: 6px; padding: 7px 10px; margin: 0; }
.pln-note { font-size: 12.5px; color: #1e3a8a; background: #eff6ff; border: 1px solid #bfdbfe;
  border-radius: 6px; padding: 7px 10px; margin: 0; }

.pln-grid { border: 1px solid var(--border); border-radius: 10px; background: var(--white);
  overflow: hidden; }
.pln-head { display: flex; align-items: stretch; position: sticky; top: 0; z-index: 5;
  background: #39467B; color: #fff; border-bottom: 1px solid var(--border); }
.pln-head-label { width: 200px; flex: none; padding: 8px 12px; font-size: 11px;
  font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  display: flex; align-items: center; border-right: 1px solid rgba(255,255,255,.18); }
.pln-head-track { flex: 1; display: flex; position: relative; background: var(--white);
  color: var(--text); }
.pln-day { flex: none; text-align: center; padding: 5px 2px 3px;
  border-right: 1px solid var(--border); font-size: 11px; line-height: 1.15;
  display: flex; flex-direction: column; align-items: center; }
.pln-day:last-child { border-right: 0; }
.pln-day.wknd { background: #f8fafc; }
.pln-day.today { background: #fef3c7; }
.pln-dow { color: var(--muted); text-transform: uppercase; letter-spacing: .04em; font-size: 9.5px; }
.pln-dnum { font-weight: 700; font-size: 13px; }
.pln-mon { font-size: 9px; font-weight: 700; color: #92400e; letter-spacing: .04em;
  text-transform: uppercase; }
.pln-halves { display: flex; width: 100%; margin-top: 2px; border-top: 1px solid var(--border);
  font-size: 8.5px; font-weight: 700; color: var(--muted); }
.pln-halves i { flex: 1; font-style: normal; padding: 1px 0; }
.pln-halves i:first-child { border-right: 1px dashed var(--border); }

.pln-row { display: flex; align-items: stretch; border-bottom: 1px solid var(--border); }
.pln-row.unassigned { background: #fffbeb; }
.pln-row.unassigned .pln-label { background: #fef3c7; color: #92400e; }
.pln-label { width: 200px; flex: none; padding: 8px 12px; background: #f8fafc;
  border-right: 1px solid var(--border); font-size: 12px; font-weight: 700;
  display: flex; align-items: center; gap: 8px; }
.pln-label-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pln-count { margin-left: auto; font-size: 10px; font-weight: 700; background: #e0e7ff;
  color: #3730a3; border-radius: 99px; padding: 1px 7px; }
.pln-row.unassigned .pln-count { background: #fde68a; color: #92400e; }
.pln-track { flex: 1; position: relative; }
.pln-col { position: absolute; top: 0; bottom: 0; border-left: 1px solid #f1f5f9; }
.pln-col.wknd { background: rgba(148,163,184,.08); }
.pln-half { position: absolute; top: 0; bottom: 0; border-left: 1px dashed #eef2f7;
  pointer-events: none; }
.pln-now { position: absolute; top: 0; bottom: 0; width: 2px; background: #ef4444;
  z-index: 3; pointer-events: none; }

.pln-group { display: flex; align-items: center; gap: 10px; width: 100%; border: 0;
  border-bottom: 1px solid var(--border); padding: 7px 12px; font: 700 13px inherit;
  cursor: pointer; text-align: left; }
.pln-caret { font-size: 10px; }
.pln-group-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pln-group-n { margin-left: auto; background: rgba(255,255,255,.28); border-radius: 99px;
  padding: 1px 8px; font-size: 11px; }

.pln-bar-item { position: absolute; border-radius: 6px; border: 1px solid rgba(0,0,0,.14);
  color: #fff; padding: 3px 6px; font-size: 10px; font-weight: 700; line-height: 1.15;
  display: flex; flex-direction: column; gap: 1px; box-sizing: border-box;
  cursor: grab; overflow: visible; }
.pln-bar-item.moving { cursor: grabbing; z-index: 6; opacity: .9; }
.pln-bar-item.waiting { border: 2px dashed rgba(255,255,255,.75); opacity: .85; cursor: pointer; }
.pln-bar-item.clip-l { border-top-left-radius: 0; border-bottom-left-radius: 0; }
.pln-bar-item.clip-r { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.pln-ref { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pln-phase { white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-weight: 600; opacity: .85; font-size: 9.5px; }
.pln-utils { display: flex; gap: 3px; margin-top: 1px; }
.pln-utils i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid rgba(255,255,255,.7); }
.pln-off { position: absolute; top: -7px; left: -7px; width: 16px; height: 16px;
  border-radius: 50%; background: #dc2626; color: #fff; border: 2px solid #fff;
  display: flex; align-items: center; justify-content: center; font-size: 10px;
  font-weight: 800; z-index: 3; }

.pln-empty { padding: 34px 20px; text-align: center; color: var(--muted); font-size: 13px;
  margin: 0; }
.pln-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
  font-size: 11px; color: var(--muted); }
.pln-legend-t { font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.pln-legend-n { margin-left: auto; font-weight: 600; }
.pln-key { display: inline-flex; align-items: center; gap: 5px; }
.pln-key i { width: 13px; height: 13px; border-radius: 3px; display: inline-block; }
.pln-key-waiting { border: 2px dashed #94a3b8; background: rgba(148,163,184,.3); }
.pln-key-now { width: 2px !important; height: 13px; background: #ef4444; border-radius: 0; }
.pln-help { font-size: 11.5px; color: var(--muted); margin: 0; }
`;
