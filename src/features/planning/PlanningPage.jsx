import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getPlanning, moveAssignment, deleteAssignment, assignPhase } from "../../api/planning.js";
import { remember, recall } from "../../lib/session.js";
import {
  DAY_MS, buildRows, packLanes, daysInRange, isWeekend, todayMs, toISO,
  phaseColours, activeDays, nextActiveDay, prevActiveDay,
} from "./timeline.js";
import { resizeByHalves, teamMayTake } from "../calloffs/assignments.js";
import { openCallOff } from "../../lib/callOffIntent.js";
import { dependentAssignments } from "./dependencies.js";
import AssignmentModal from "./AssignmentModal.jsx";
import PmColoursModal from "./PmColoursModal.jsx";
import WeekendDropModal from "./WeekendDropModal.jsx";

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
  /* A refusal, which is not an error. Nothing went wrong when a gang
     does not cover a region — the answer to the question was no — so it
     is said differently and does not sit in the red bar reserved for
     things that broke. */
  const [notice, setNotice] = useState("");

  const [pivot, setPivot] = useState(() => recall("planPivot", "team"));
  const [rangeDays, setRangeDays] = useState(() => Number(recall("planRange", 14)) || 14);
  const [rangeStart, setRangeStart] = useState(todayMs);
  const [activeOnly, setActiveOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [openBar, setOpenBar] = useState(null);
  /* Where the right-click menu is, and what it is about. Null when
     closed — the position is part of the same value so the two can
     never disagree about whether there is a menu. */
  const [menu, setMenu] = useState(null);
  /* A drop that ran into a weekend, held until somebody says what to do
     with it. Nothing is written and the bar does not move until then. */
  const [weekendAsk, setWeekendAsk] = useState(null);
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

  /* Escape closes the menu, and closes it before anything else does —
     a menu that survives the key that closes everything else is a menu
     somebody has to hunt for a way out of. */
  useEffect(() => {
    if (!menu) return undefined;
    const key = (e) => { if (e.key === "Escape") setMenu(null); };
    const scroll = () => setMenu(null);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [menu]);

  /* A message that clears itself. Used for the two edges of the jump
     buttons and for what a drag did, neither of which is an error and
     neither of which should stay on screen. */
  const say = useCallback((msg) => {
    setNote(msg);
    window.clearTimeout(say._t);
    say._t = window.setTimeout(() => setNote(""), 4000);
  }, []);

  /* The current board, readable from a closure that was built earlier.
     The commit path needs the state to put back on failure, and it must
     be the state as it is when the write starts. */
  const dataRef = useRef(null);
  dataRef.current = data;

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

  /* The bars currently drawn, by id. A ref rather than state: the drop
     handler is a closure built when the pointer went down, and it needs
     whatever is on screen *now* — reading it from a ref means the
     listener does not have to be torn down and rebuilt every time the
     board re-renders mid-drag. */
  const itemsById = useRef(new Map());

  /* Writing a move, once it is settled.

     One path whether the drop needed a question or not, so a move that
     was answered at the dialog and one that went straight through
     cannot end up doing different things. Optimistic, then reconciled:
     the board is the thing being worked in, and waiting for a round
     trip before the bar moves makes a drag feel broken on a slow
     connection.

     `before` is the board as it was, kept rather than the move being
     undone by shifting back — a shift is not always reversible once the
     weekend has absorbed a half, and putting the old state back is the
     only way to be sure the board shows what the database holds. */
  /* Why this gang cannot take this work, or null if it can.

     The rule lives in calloffs/assignments.js and is applied here with
     what the board already has. Everything it needs is in the payload,
     so the answer appears the instant a bar is dropped rather than
     after a round trip — which matters, because the answer is often no
     and a bar that hangs for half a second before refusing feels like a
     bar that failed to move. */
  const whyNot = useCallback((teamId, item) => {
    const d = dataRef.current;
    if (!d) return "The board is still loading.";
    if (!d.teamRulesKnown) {
      return "Which regions each team covers is not set up, so work cannot be "
        + "moved between gangs here. Set it on the team, or move it on the call-off.";
    }
    const team = (d.teams || []).find((t) => Number(t.Team_ID) === Number(teamId));
    const project = (d.projects || [])
      .find((p) => Number(p.Project_ID) === Number(item?.sub?.Project_ID));
    const task = (d.taskTypes || [])
      .find((t) => Number(t.Task_Type_ID) === Number(item?.taskTypeId));
    const region = (d.regions || [])
      .find((r) => Number(r.Region_ID) === Number(project?.Region_ID));
    const craft = (d.crafts || [])
      .find((c) => Number(c.Craft_ID) === Number(task?.Craft_ID));

    return teamMayTake(team, {
      teamRegions: d.teamRegions || [],
      teamCrafts: d.teamCrafts || [],
      regionId: project?.Region_ID ?? null,
      craftId: task?.Craft_ID ?? null,
      regionName: region?.Region || null,
      craftName: craft?.Craft_Name || null,
      /* The phase as the board labels it, so the refusal names the
         thing on the bar rather than the craft behind it. */
      taskName: task?.Task_Type_Name || item?.phase || null,
    });
  }, []);

  const commitMove = useCallback(async (op) => {
    /* Called with an object, and only ever with an object. Checked
       because it has not always been: an earlier version took five
       positional arguments, one call site was left behind when it
       changed, and destructuring a number gave undefined for every
       field — which travelled all the way to a message reading
       "shortened by NaN days" and a bar that snapped back.

       A missing id is the one field that cannot be recovered from, so
       it is the one that is checked. Said out loud rather than swallowed:
       a drag that does nothing and explains nothing is worse than one
       that admits it went wrong. */
    if (!op || typeof op !== "object" || !op.assignmentId) {
      setError("Something went wrong moving that booking — nothing has changed.");
      return;
    }
    const {
      assignmentId, startShift = 0, endShift = 0, weekend, item, toTeam,
      follows = [],
    } = op;
    const before = dataRef.current;
    setData((cur) => {
      /* The booking and everything that follows it, in one update. The
         same weekend answer applies to all of them: it was one question
         about one weekend. */
      let next = shiftInPlace(cur, assignmentId, startShift, endShift, weekend, toTeam);
      for (const f of follows) {
        next = shiftInPlace(next, f.assignmentId, f.startShift, f.endShift, weekend, null);
      }
      return next;
    });
    try {
      const result = await moveAssignment(assignmentId, {
        startShift, endShift, weekend, teamId: toTeam,
        also: follows.map((f) => ({
          assignmentId: f.assignmentId,
          startShift: f.startShift,
          endShift: f.endShift,
          weekend,
        })),
      });
      /* A follower that could not be moved is named. The rest of the
         schedule did move, so putting everything back would undo work
         that succeeded — the honest thing is to say which one is now
         out of step and let somebody look at it. */
      if (result?.failed?.length) {
        setError(`Moved, but ${result.failed.length} dependent booking(s) `
          + "could not follow. Refresh the board to see where things stand.");
      }

      const much = (h) => {
        const n = Math.abs(Number(h)) / 2;
        if (!Number.isFinite(n) || !n) return "";
        return n === 0.5 ? "half a day" : `${n} day${n === 1 ? "" : "s"}`;
      };
      const team = toTeam
        ? (dataRef.current?.teams || [])
          .find((t) => Number(t.Team_ID) === Number(toTeam))?.Team_Name
        : null;
      /* Said as what happened rather than as two numbers. A stretch and
         a move are different things to have done and the sentence
         should not make somebody work out which it was. */
      const grew = endShift - startShift;
      const what = [
        (startShift && startShift === endShift && much(startShift))
          ? `moved ${much(startShift)} ${startShift > 0 ? "later" : "earlier"}` : null,
        (grew && much(grew))
          ? `${grew > 0 ? "extended" : "shortened"} by ${much(grew)}` : null,
        team ? `given to ${team}` : null,
      ].filter(Boolean).join(", ");
      say(`${item?.ref ? `${item.ref} \u00b7 ` : ""}${what || "unchanged"}.`);
    } catch (err) {
      setData(before);
      setError(`Could not do that: ${err.message}`);
    }
  }, [say]);

  /* Taking a phase off the Unassigned lane and giving it to a gang.

     There is no booking yet, so this creates one: a single day at the
     day it was dropped on, which the planner then stretches or moves.
     One day rather than a guess at how long the work takes — the board
     does not know, and a booking of an invented length is a number
     somebody has to notice is wrong before they correct it. */
  const commitAssign = useCallback(async (op) => {
    const { item, teamId, date, weekend } = op;
    const before = dataRef.current;
    try {
      const made = await assignPhase({
        submissionId: item.submissionId,
        taskTypeId: item.taskTypeId,
        teamId,
        date,
        weekend,
      });
      const team = (dataRef.current?.teams || [])
        .find((t) => Number(t.Team_ID) === Number(teamId))?.Team_Name;
      /* Reloaded rather than stitched in by hand. A new booking brings
         an id, its days bring theirs, and the phase has to leave the
         unassigned lane — three things to keep in step against one
         request that is already in flight. */
      setData(await getPlanning());
      say(`${item.ref} \u00b7 ${item.phase} given to ${team || "the team"}`
        + `${made?.Start_Date ? ` on ${made.Start_Date}` : ""}.`);
    } catch (err) {
      setData(before);
      setError(`Could not assign it: ${err.message}`);
    }
  }, [say]);

  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = drag;

  const onBarPointerDown = (e, item, mode = "move") => {
    if (e.button !== 0) return;
    /* An unassigned chip can be picked up, but only to be given to a
       gang — there is no booking to move in time or to stretch, so the
       handles are not on it and a sideways drag does nothing. */
    if (item.kind !== "assignment" && mode !== "move") return;
    const track = e.currentTarget.closest(".pln-track");
    if (!track) return;
    const dayPx = track.getBoundingClientRect().width / rangeDays;
    if (!Number.isFinite(dayPx) || dayPx <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    /* Not captured to the bar. A pointer capture keeps every event on
       the element it started on, which is exactly wrong here: the whole
       point of dragging upward is to find out what is underneath, and a
       captured pointer makes elementFromPoint answer with the bar every
       time. The listeners are on the window instead. */
    setDrag({
      id: item.id, mode,
      kind: item.kind,
      assignmentId: item.assignmentId ?? null,
      fromTeam: Number(item.raw?.Team_ID) || null,
      dayPx, startX: e.clientX, startY: e.clientY,
      offsetPx: 0, offsetY: 0, halves: 0, overTeam: null, moved: false,
    });
  };

  /* Which lane the pointer is over.

     Read off the DOM rather than from stored row rectangles: rows grow
     and shrink as lanes are packed, the board scrolls, and a table of
     bounds captured at drag start would be wrong by the time it was
     used. The lane's team is on a data attribute, so what comes back is
     the answer and not something to look up.

     The bar under the cursor is invisible to this — pointer-events are
     off while dragging — so what is found is the lane. */
  /* The date a half-slot falls on, for a chip dropped from the
     unassigned lane. Half-slots are counted from the left edge of the
     window, so this is the window's start plus however many days. */
  const dayAt = (half) => toISO(rangeStart + Math.floor(half / 2) * DAY_MS);

  /* An assignment's day rows in the shape the laying functions want.
     The same normalising timeline.js does for the bars — done again
     here because a follower may be off the edge of the window and so
     have no bar to read it from. */
  const partsOf = (assignment) => (dataRef.current?.workDays || [])
    .filter((w) => Number(w.Assignment_ID) === Number(assignment.Assignment_ID))
    .map((w) => ({
      date: String(w.Work_Date).slice(0, 10),
      part: w.Part || "Full",
      offSite: !!w.Off_Site,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const laneUnder = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const lane = el?.closest?.("[data-team-id]");
    if (!lane) return null;
    const id = Number(lane.getAttribute("data-team-id"));
    return Number.isFinite(id) && id ? id : null;
  };

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      /* Snapped to half days, which is the smallest thing the schedule
         records: Call_Off_Work_Day carries a Part, so a morning is a
         position the database can hold. Snapping to whole days meant a
         booking could only be nudged in steps of two, and a gang
         starting after lunch could not be said at all.

         The bar preview follows the same snap, so what is let go of is
         what gets written. */
      const halfPx = d.dayPx / 2;
      const halves = Math.round(dx / halfPx);
      /* The lane under the cursor, and how far the bar has been lifted
         towards it. The vertical offset is the raw pointer movement
         rather than a snap: there is nothing to snap to until the drop,
         and a bar that jumped between lanes while being dragged would
         make it hard to aim at the one below. */
      const overTeam = laneUnder(e.clientX, e.clientY);
      const dy = e.clientY - d.startY;
      setDrag((cur) => (cur
        && (cur.halves !== halves || cur.overTeam !== overTeam || !cur.moved)
        ? {
          ...cur, halves, overTeam, offsetY: dy,
          offsetPx: halves * halfPx,
          moved: cur.moved || Math.abs(dx) > 3 || Math.abs(dy) > 6,
        }
        : cur));
    };
    const up = async () => {
      const d = dragRef.current;
      setDrag(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const item = d ? itemsById.current.get(d.id) : null;
      /* Where it was dropped, if that is a different gang's lane. */
      const toTeam = d && d.overTeam && d.overTeam !== d.fromTeam ? d.overTeam : null;
      if (!d || !d.moved || !item) return;

      /* ── A phase given to a gang ──

         Dropped from the Unassigned lane onto a team. There is nothing
         to move — the booking does not exist yet — so a drop that is
         not on a lane does nothing at all. */
      if (d.kind === "unassigned") {
        if (!toTeam) return;
        const why = whyNot(toTeam, item);
        if (why) { setNotice(why); return; }
        const on = dayAt(item.startHalf + d.halves);
        if (isWeekendISO(on)) {
          setWeekendAsk({ kind: "assign", item, toTeam, date: on });
          return;
        }
        await commitAssign({ item, teamId: toTeam, date: on, weekend: null });
        return;
      }

      /* A move drags both ends together; a handle drags one. */
      const startShift = d.mode === "right" ? 0 : d.halves;
      const endShift = d.mode === "left" ? 0 : d.halves;
      if (!startShift && !endShift && !toTeam) return;

      /* ── Can that gang take it? ──

         Answered before anything moves, with the same rule the call-off
         page applies when it lists the teams for a phase. A board that
         let a booking be dropped where that page would refuse it is two
         answers to one question.

         Refused rather than allowed where the rules are unknown: if
         Team_Region did not come back, the honest position is that
         nobody can say this gang covers the patch, and quietly moving
         the work would be worse than not moving it. */
      if (toTeam) {
        const why = whyNot(toTeam, item);
        if (why) {
          setNotice(why);
          return;
        }
      }

      /* ── What travels with it ──

         Everything downstream of this booking on the same call-off,
         shifted by the same amount so the arrangement somebody already
         made is kept: jointing set to start the day after the dig still
         starts the day after when the dig moves.

         Only when the whole booking moves. Stretching the far end of a
         dig does not push the jointing that follows it — the dig
         finishes later, which may well break the rule, and saying so is
         a different job from silently shoving the rest of the programme
         along. Dragging the *start* does move everything, because that
         is the whole thing travelling. */
      const follows = (startShift && startShift === endShift)
        ? dependentAssignments(item.raw, {
          assignments: dataRef.current?.assignments || [],
          dependencies: dataRef.current?.dependencies || [],
          submissions: dataRef.current?.submissions || [],
        }).map((a) => ({
          assignmentId: Number(a.Assignment_ID),
          startShift, endShift: startShift,
          parts: partsOf(a),
          raw: a,
        }))
        : [];

      /* Nothing left of it. A handle dragged past the other end would
         delete the booking, and deleting is what the right-click menu
         is for — said, so the drag does not look like it failed. */
      if (!resizeByHalves(item.parts || [], startShift, endShift, weekendOf(item))) {
        setNotice("A booking cannot be shorter than half a day. "
          + "Use right-click \u2192 Delete to remove it.");
        return;
      }
      /* Does this run into a weekend? Asked of the work rather than of
         where the cursor was: a booking can be dropped on a Thursday
         and still spill into Saturday.

         Nothing is written until somebody answers. The bar stays where
         it was, which is the honest state — the move has not happened
         yet. */
      /* The weekend question covers the whole move, followers
         included. One weekend, one decision about working it — asking
         separately for each booking would put three dialogs in a row in
         front of somebody who has made one decision.

         Asked if *any* of them reaches a weekend, including a follower
         that does when the booking dragged does not. */
      const reaches = touchesWeekend(item.parts || [], startShift, endShift)
        || follows.some((f) => touchesWeekend(f.parts, f.startShift, f.endShift));

      if (reaches) {
        setWeekendAsk({
          kind: "move", item, startShift, endShift, toTeam,
          days: item.parts || [], follows,
        });
        return;
      }
      await commitMove({
        assignmentId: d.assignmentId, startShift, endShift,
        weekend: null, item, toTeam, follows,
      });
      return;
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
      {notice && (
        <p className="pln-refuse" role="status">
          {notice}
          <button className="pln-refuse-x" onClick={() => setNotice("")}
            aria-label="Dismiss">&times;</button>
        </p>
      )}
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
              for (const sp of spans) itemsById.current.set(sp.id, sp);
              const height = Math.max(ROW_MIN_H, laneCount * LANE_H + 8);

              return (
                <div key={row.key}
                  className={`pln-row${row.isUnassigned ? " unassigned" : ""}`
                    + `${drag?.overTeam && row.teamId === drag.overTeam ? " drop-here" : ""}`
                    + `${drag && row.teamId === drag.fromTeam ? " drop-from" : ""}`}
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
                  <div className="pln-track"
                    /* What a drop lands on. Only lanes that are a team
                       carry it, so a drop in the region or work-type
                       pivot finds nothing and is treated as a move in
                       time alone. */
                    data-team-id={row.teamId ?? undefined}>
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
                      /* The project's utilities, narrowed to the ones
                         this phase is actually about — jointing is
                         electric, so a jointing bar carries one dot and
                         not three. */
                      const utils = (utilitiesByProject.get(Number(item.projectId)) || [])
                        .filter((u) => !item.utilityNames
                          || item.utilityNames.includes(
                            String(u.Utility || "").toLowerCase().trim()));
                      const moving = drag?.id === item.id;
                      return (
                        <div key={item.id}
                          className={`pln-bar-item${item.kind === "unassigned" ? " waiting" : ""}`
                            + `${clipL ? " clip-l" : ""}${clipR ? " clip-r" : ""}`
                            + `${moving ? " moving" : ""}`}
                          style={{
                            left: `${from * halfPct}%`,
                            width: moving && drag.mode !== "move"
                              ? `calc(${(to - from) * halfPct}% - 3px + `
                                + `${drag.mode === "right" ? drag.offsetPx : -drag.offsetPx}px)`
                              : `calc(${(to - from) * halfPct}% - 3px)`,
                            top: item.lane * LANE_H + 4,
                            height: LANE_H - 8,
                            background: item.colour,
                            /* A move slides the whole bar; a handle
                               moves one edge and leaves the other where
                               it is, so the preview is a width change
                               rather than a translation. */
                            transform: moving && drag.mode === "move"
                              ? `translate(${drag.offsetPx}px, ${drag.offsetY}px)`
                              : undefined,
                            marginLeft: moving && drag.mode === "left"
                              ? drag.offsetPx : undefined,
                            marginRight: moving && drag.mode === "left"
                              ? -drag.offsetPx : undefined,
                            paddingRight: undefined,
                          }}
                          title={`${item.label}\n${item.startDate} \u2192 ${item.endDate}`}
                          onPointerDown={(e) => onBarPointerDown(e, item)}
                          onContextMenu={(e) => {
                            /* Unassigned chips have nothing to edit and
                               nothing to delete — there is no booking
                               yet — so they keep the browser's own
                               menu rather than being given one that
                               can only disappoint. */
                            if (item.kind !== "assignment") return;
                            e.preventDefault();
                            /* Kept inside the window here, where the
                               pointer is, rather than while rendering.
                               A component that reads window.innerWidth
                               to draw itself cannot be rendered outside
                               a browser, and being able to render it
                               outside one is what has caught two of the
                               faults in this file. */
                            setMenu({
                              item,
                              x: Math.min(e.clientX, window.innerWidth - 210),
                              y: Math.min(e.clientY, window.innerHeight - 120),
                            });
                          }}
                          onClick={() => {
                            /* A drag ends with a click. Opening the
                               panel every time somebody moved a bar
                               would put a dialog over the board on
                               every reschedule. */
                            if (drag?.moved) return;
                            if (item.kind === "assignment") setOpenBar(item);
                          }}>
                          {/* Days inside the booking nobody is working
                              — a weekend it does not cover, or a day
                              the gang is off. Drawn through the bar
                              rather than splitting it into two, because
                              it is one booking. */}
                          {(item.gaps || []).map((g) => {
                            const gFrom = Math.max(from, g.startHalf);
                            const gTo = Math.min(to, g.startHalf + g.lengthHalves);
                            if (gTo <= gFrom) return null;
                            const span = to - from;
                            return (
                              <span key={g.startHalf} className="pln-gap"
                                style={{
                                  left: `${((gFrom - from) / span) * 100}%`,
                                  width: `${((gTo - gFrom) / span) * 100}%`,
                                }} />
                            );
                          })}
                          {/* ── The two ends ──

                              Grabbing one stretches the booking from
                              that end; the middle moves the whole
                              thing. Wide enough to hit without being
                              wide enough to make a short bar unmovable,
                              and only on real bookings — an unassigned
                              chip has no length to change. */}
                          {item.kind === "assignment" && (
                            <>
                              <span className="pln-grip l"
                                title="Drag to change when it starts"
                                onPointerDown={(e) => onBarPointerDown(e, item, "left")} />
                              <span className="pln-grip r"
                                title="Drag to change when it finishes"
                                onPointerDown={(e) => onBarPointerDown(e, item, "right")} />
                            </>
                          )}
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
            Drag a booking sideways to move it, or by either end to change how long
            it runs &mdash; half a day at a time. Drag an unassigned phase onto a
            gang&rsquo;s lane to give it to them, or a booking onto another lane to
            hand it over.
            A gang that does not cover the region, or hold the craft the phase needs,
            will say so rather than take it. Right-click a booking to edit or delete
            it. Hold the middle mouse button to pan.
          </p>
        </>
      )}

      {/* ── The right-click menu ──

          Two things: open the call-off where this booking is edited,
          and delete it. Deliberately not an editor of its own — moving
          work to another team is a question about craft, region and
          clashes, and a second place that half-answers it is how the
          two come to disagree about what is allowed.

          Positioned where the pointer was, and closed by anything: a
          click, a scroll, Escape. A menu that outlives the thing it is
          about is worse than no menu. */}
      {menu && (
        <>
          <div className="pln-menu-veil" onClick={() => setMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="pln-menu" role="menu"
            style={{ left: menu.x, top: menu.y }}>
            <p className="pln-menu-t">{menu.item.ref} &middot; {menu.item.phase}</p>
            <button role="menuitem" onClick={() => {
              const sid = menu.item.submissionId;
              setMenu(null);
              openCallOff({ submissionId: sid });
            }}>
              Edit on the call-off
            </button>
            <button role="menuitem" className="danger" onClick={async () => {
              const it = menu.item;
              setMenu(null);
              if (!window.confirm(
                `Delete this booking?\n\n${it.ref} \u00b7 ${it.phase}\n`
                + `${it.startDate} to ${it.endDate}\n\n`
                + "The days under it go too. The phase goes back to unassigned.")) return;
              const before = dataRef.current;
              const dayIds = (data.workDays || [])
                .filter((w) => Number(w.Assignment_ID) === it.assignmentId)
                .map((w) => w.Work_Day_ID);
              /* Taken off the board first. A delete that leaves the bar
                 sitting there until a round trip finishes reads as a
                 click that did not register, and the second click
                 deletes something else. */
              setData((cur) => ({
                ...cur,
                assignments: (cur.assignments || [])
                  .filter((a) => Number(a.Assignment_ID) !== it.assignmentId),
                workDays: (cur.workDays || [])
                  .filter((w) => Number(w.Assignment_ID) !== it.assignmentId),
              }));
              try {
                await deleteAssignment(it.assignmentId, dayIds);
                say(`Deleted ${it.ref} \u00b7 ${it.phase}.`);
              } catch (err) {
                setData(before);
                setError(`Could not delete it: ${err.message}`);
              }
            }}>
              Delete booking
            </button>
          </div>
        </>
      )}

      {/* ── A move that ran into the weekend ──

          Nothing has been written and the bar has not moved. Whatever
          is chosen here is applied as one operation: the days and the
          weekend rule they were laid over, together. */}
      {weekendAsk && (
        <WeekendDropModal
          kind={weekendAsk.kind}
          item={weekendAsk.item}
          days={weekendAsk.days}
          startShift={weekendAsk.startShift}
          endShift={weekendAsk.endShift}
          date={weekendAsk.date}
          weekend={weekendOf(weekendAsk.item)}
          onCancel={() => setWeekendAsk(null)}
          onConfirm={(weekend) => {
            const ask = weekendAsk;
            setWeekendAsk(null);
            if (ask.kind === "assign") {
              commitAssign({
                item: ask.item, teamId: ask.toTeam, date: ask.date, weekend,
              });
              return;
            }
            commitMove({
              assignmentId: ask.item.assignmentId,
              startShift: ask.startShift, endShift: ask.endShift,
              weekend, item: ask.item, toTeam: ask.toTeam,
              follows: ask.follows || [],
            });
          }}
        />
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

/* The four flags as this booking currently claims them. */
export const weekendOf = (item) => ({
  Sat_AM: !!item?.raw?.Sat_AM, Sat_PM: !!item?.raw?.Sat_PM,
  Sun_AM: !!item?.raw?.Sun_AM, Sun_PM: !!item?.raw?.Sun_PM,
});

/* Would this move put work on a Saturday or a Sunday?

   Asked by laying the move out twice: once as if every weekend half
   were worked, and once over what this booking actually claims. If the
   first touches a weekend and the two disagree, the weekend is in the
   way and somebody has to say what happens to it.

   Both halves of that test matter.

   Laying it with every half worked is what finds the case in the
   question. A full day on the Friday nudged half a day forward is an
   afternoon on the Friday and a morning that falls on the Saturday —
   and the booking's own rule, which says no weekend working, quietly
   pushes that morning to Monday. Comparing the move against itself
   would never notice, because that is exactly what its rule says to do.
   The question is not "does the rule put work on a weekend", it is
   "does this move run into one".

   Comparing the two is what stops it asking when there is nothing to
   ask. A gang that already works Saturday mornings, moved so a morning
   lands on a Saturday, gets what it was always going to get — the two
   lays are identical and no question is worth putting on screen.

   Asked of the naive lay rather than of where the cursor was let go: a
   booking can be dropped on a Thursday and still spill into Saturday. */
const ALL_WEEKEND = { Sat_AM: true, Sat_PM: true, Sun_AM: true, Sun_PM: true };

export const isWeekendISO = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y) return false;
  const w = new Date(y, m - 1, d, 12).getDay();
  return w === 0 || w === 6;
};

/* Does this move or stretch run into a Saturday or a Sunday?

   Laid out as if every weekend half were worked, and asked whether any
   of it lands on one. That is the question — does the work reach the
   weekend — and it is asked of the work, not of the rule: a booking
   whose rule says "no weekend" would otherwise never be seen to reach
   one, because its rule quietly steps over it.

   ── Asked every time, even when it was asked yesterday ──

   An earlier version compared this against the booking's own weekend
   rule and stayed quiet when the two agreed — a gang that worked
   Saturday mornings, moved onto a Saturday morning, was not asked
   again. That is a guess about a decision somebody else made about a
   different set of dates, and it is not one to make on their behalf:
   the gang that worked last Saturday because the programme was tight
   has not agreed to work this one.

   So the weekend is a question every time work reaches it, and the
   answer is taken fresh. */
export function touchesWeekend(days, startShift, endShift) {
  if (!days?.length) return false;
  const naive = resizeByHalves(days, startShift, endShift, ALL_WEEKEND);
  return !!naive?.days?.some((d) => isWeekendISO(d.date));
}

/* Moving a booking in the copy the board is drawing from.

   The days are re-laid rather than shifted, through the same function
   the endpoint's own copy is checked against — so what appears the
   instant a bar is dropped is what the database is about to be told,
   and the board does not flicker into a different answer when the
   response arrives.

   Both the assignment and its days: the bar's footprint is read from
   the days where there are any, so moving the assignment alone would
   change the dates in the panel and leave the bar where it was.

   Exported so the move can be checked without a browser. */
export function shiftInPlace(data, assignmentId, startShift, endShift, weekendOverride, toTeam) {
  if (!data) return data;
  const id = Number(assignmentId);

  const asgn = (data.assignments || [])
    .find((a) => Number(a.Assignment_ID) === id);
  if (!asgn) return data;

  /* A lane change with no move in time still has to be applied — a
     booking handed to another gang on the same days is an ordinary
     thing to do, and there is nothing to re-lay. */
  const withTeam = (a) => (toTeam ? { ...a, Team_ID: Number(toTeam) } : a);
  if (!startShift && !endShift) {
    return toTeam
      ? {
        ...data,
        assignments: data.assignments.map((a) =>
          (Number(a.Assignment_ID) === id ? withTeam(a) : a)),
      }
      : data;
  }

  const mine = (data.workDays || [])
    .filter((w) => Number(w.Assignment_ID) === id)
    .map((w) => ({ date: String(w.Work_Date).slice(0, 10), part: w.Part || "Full", offSite: !!w.Off_Site, row: w }))
    .sort((a, b) => a.date.localeCompare(b.date));

  /* No day rows: the booking is only its two dates, and there is
     nothing to lay. Shifted whole days so a drag still does something
     visible, rounded away from zero so half a day still moves it. */
  if (!mine.length) {
    /* No day rows to lay, so only a whole-day move is meaningful and a
       stretch cannot be applied at all. */
    const halves = startShift;
    const by = halves > 0 ? Math.ceil(halves / 2) : Math.floor(halves / 2);
    const move = (d) => {
      if (!d) return d;
      const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number);
      if (!y || !m || !dd) return d;
      return toISO(new Date(y, m - 1, dd).getTime() + by * DAY_MS);
    };
    return {
      ...data,
      assignments: data.assignments.map((a) => (Number(a.Assignment_ID) === id
        ? withTeam({ ...a, Start_Date: move(a.Start_Date), End_Date: move(a.End_Date) })
        : a)),
    };
  }

  /* The answer just given at the dialog, where there was one, so the
     board shows what is about to be written rather than what the
     booking claimed a moment ago. */
  const weekend = weekendOverride || {
    Sat_AM: !!asgn.Sat_AM, Sat_PM: !!asgn.Sat_PM,
    Sun_AM: !!asgn.Sun_AM, Sun_PM: !!asgn.Sun_PM,
  };
  const laid = resizeByHalves(mine, startShift, endShift, weekend);
  /* Null when the stretch would leave nothing, and empty when there was
     nowhere to put it — either way the board is left as it was, and the
     write is not attempted. */
  if (!laid?.days?.length) return data;

  return {
    ...data,
    assignments: data.assignments.map((a) => (Number(a.Assignment_ID) === id
      ? withTeam({
        ...a, Start_Date: laid.days[0].date, End_Date: laid.end,
        ...(weekendOverride || {}),
      })
      : a)),
    workDays: [
      ...(data.workDays || []).filter((w) => Number(w.Assignment_ID) !== id),
      ...laid.days.map((d, i) => ({
        ...(mine[i]?.row ?? {}),
        Work_Day_ID: mine[i]?.row?.Work_Day_ID ?? `tmp-${id}-${i}`,
        Assignment_ID: id,
        Work_Date: d.date,
        Part: d.part,
        Off_Site: d.offSite,
      })),
    ],
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
/* A day inside a booking that nobody is working. Hatched rather than
   hollow: a hole in the bar would read as two bookings, and the
   thing being said is that this one booking pauses. */
.pln-gap { position: absolute; top: 0; bottom: 0; pointer-events: none;
  background: repeating-linear-gradient(135deg,
    rgba(255,255,255,.55) 0 3px, rgba(255,255,255,0) 3px 7px);
  border-left: 1px solid rgba(255,255,255,.5);
  border-right: 1px solid rgba(255,255,255,.5); }
/* The grab handles. Transparent until the bar is hovered, so a board
   full of bookings is not a board full of furniture. */
.pln-grip { position: absolute; top: 0; bottom: 0; width: 7px; cursor: ew-resize;
  background: rgba(255,255,255,0); border-radius: 5px; }
.pln-grip.l { left: 0; }
.pln-grip.r { right: 0; }
.pln-bar-item:hover .pln-grip { background: rgba(255,255,255,.45); }
.pln-grip:hover { background: rgba(255,255,255,.8) !important; }
.pln-bar-item.waiting .pln-grip { display: none; }

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

/* The lane a bar is being held over. Deliberately quiet: a full
   highlight on a row that is about to be refused would be a promise. */
.pln-row.drop-here { background: #eff6ff; }
.pln-row.drop-here .pln-label { background: #dbeafe; }
.pln-row.drop-from .pln-label { opacity: .6; }
/* Nothing under the cursor may catch the pointer while a bar is being
   dragged, or the lane below can never be found. */
.pln-bar-item.moving { pointer-events: none; }

.pln-refuse { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px;
  color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;
  padding: 7px 10px; margin: 0; }
.pln-refuse-x { border: 0; background: transparent; color: inherit; cursor: pointer;
  font-size: 15px; line-height: 1; margin-left: auto; padding: 0 2px; }

.pln-menu-veil { position: fixed; inset: 0; z-index: 40; }
.pln-menu { position: fixed; z-index: 41; background: var(--white);
  border: 1px solid var(--border); border-radius: 8px; min-width: 190px;
  box-shadow: 0 12px 32px rgba(15,23,42,.22); padding: 4px; }
.pln-menu-t { margin: 0; padding: 5px 9px 6px; font-size: 10.5px; font-weight: 700;
  color: var(--muted); border-bottom: 1px solid var(--border);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
.pln-menu button { display: block; width: 100%; text-align: left; border: 0;
  background: transparent; padding: 7px 9px; font: 600 12.5px inherit;
  color: var(--text); border-radius: 5px; cursor: pointer; }
.pln-menu button:hover { background: #f1f5f9; }
.pln-menu button.danger { color: #b91c1c; }
.pln-menu button.danger:hover { background: #fef2f2; }
`;
