import { useState, useEffect, useMemo, useCallback } from "react";
import {
  listAllCallOffs, setCallOffStatus, updateCallOff, deleteCallOff,
} from "../../api/calloffs.js";
import { remember, recall } from "../../lib/session.js";
import { takeCallOffIntent, onOpenCallOff } from "../../lib/callOffIntent.js";
import { getLookups } from "../../api/lookups.js";
import { getProject, listProjects } from "../../api/projects.js";
import { openProject } from "../../lib/projectIntent.js";
import { openGis } from "../../lib/gisIntent.js";
import { setPlotEnergisation } from "../../api/calloffs.js";
import { energisationFloor, dayAfter, byUtilityColumn, isDigTask } from "./rules.js";
import { isJointTask, jointEstimate, jointEstimateText } from "../gis/jointRate.js";
import { halfDaysText } from "./digDays.js";
import { phaseCover, COVER_LABEL, isListedPhase } from "./assignmentCover.js";
import { useTableLayout } from "../../lib/useTableLayout.js";
import ColumnsMenu from "../../components/ColumnsMenu.jsx";
import FilterCell, {
  blankFilter, rowPasses, FILTER_CSS,
} from "../../components/FilterCell.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import { pillStyle } from "../../lib/pillColour.js";
import { useDragHandle } from "../../lib/useDragHandle.js";
import {
  eligibleTeams, earliestStart, parsePlots, serialisePlots,
  validate as checkAssignment, daysBetween, dayTotal, takenPlots,
  bookedParts, partIsFree, plotDayOwner,
  WEEKEND_PARTS, worksAnyWeekend, availablePart, laySchedule, workedDaysIn,
  splitsByUtility, endAfterHalves, layHalves,
} from "./assignments.js";
import { phasesToShow, phasesHidden } from "./callOffPhases.js";
import { dependencyProblems, dependencyFloor } from "../planning/dependencies.js";

/* Call-offs across the business.

   The project tab answers "what is on this project"; this answers "what
   is coming up" — every site, filtered by status, searched by reference,
   site, customer or contact.

   Clicking one opens it, where the work is scheduled and the status
   moved. */

/* The statuses a call-off moves through, in the order it moves through
   them.

   Declared here as well as seeded in the database (0116, 0169) because
   this is the order things are *read* in — grouping by status should
   put Pending Review before Complete, which says something about
   progress that P-before-C does not.

   Submitted and Aborted were missing: 0169 added them for the field
   app, and this list was not updated, so neither could be set by hand
   on a call-off that needed correcting. */
export const STATUSES = [
  "Pending Review", "Reviewed", "Scheduled", "In Progress",
  "Submitted", "Complete", "Aborted",
  "Withdrawn (Customer)", "Withdrawn (Aptus)",
];

/* Where a status sits in that order. Anything not on the list sorts
   after everything that is, rather than at the front — a status added
   to the database and not here should be visible as an oddity, not
   promoted above the ones somebody thought about. */
export function statusRank(name) {
  const i = STATUSES.indexOf(String(name || ""));
  return i < 0 ? STATUSES.length : i;
}

/* The later of two dates, either of which may be missing. Used where
   two floors apply at once — today and a dependency — and the binding
   one is whichever is later. */
export const maxDate = (a, b) => {
  if (!a) return b || "";
  if (!b) return a;
  return a > b ? a : b;
};

/* Today, as the pickers want it. Local rather than UTC: west of
   Greenwich in the evening, toISOString has already moved on to
   tomorrow, and a picker that will not accept today is the sort of
   thing nobody reproduces. */
export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* The end date after the start has been dragged somewhere else.

   The same length, kept. Measured in calendar days between the two
   dates as they stand, which is the length somebody sees in the
   pickers — the working days it lays onto are worked out afterwards by
   the weekend rule, and it is that rule's job, not this one's.

   Falls back to the new start where the old pair made no sense: a
   booking with no end, or an end before its start, has no length to
   preserve, and a single day is the honest answer. */
export function slideEnd(oldStart, oldEnd, newStart) {
  const ms = (d) => {
    const [y, m, dd] = String(d || "").slice(0, 10).split("-").map(Number);
    return (y && m && dd) ? new Date(y, m - 1, dd, 12).getTime() : NaN;
  };
  const a = ms(oldStart);
  const b = ms(oldEnd);
  const c = ms(newStart);
  if (!Number.isFinite(c)) return oldEnd;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return newStart;

  const out = new Date(c + (b - a));
  const p = (n) => String(n).padStart(2, "0");
  return `${out.getFullYear()}-${p(out.getMonth() + 1)}-${p(out.getDate())}`;
}

/* Whether a booking runs across a Saturday or a Sunday.

   The weekend controls appear only when it does — see the comment where
   they are rendered. Measured across the laid-out range rather than the
   typed one, because pushing past one weekend can reach the next. */
export function spansAWeekend(start, end) {
  if (!start || !end) return false;
  return daysBetween(start, end).some((d) => {
    const [y, m, dd] = d.split("-").map(Number);
    const w = new Date(y, m - 1, dd, 12).getDay();
    return w === 0 || w === 6;
  });
}

/* How much of a day is booked: what somebody chose, unless the weekend
   rule has already decided it. A Saturday with only the morning ticked
   is a morning whatever is in `parts`, which may hold "Full" from
   before the rule was changed. */
/* Which half of a day is worked.

   A day the weekend rule fixed to a half stays as it is: the rule above
   put it there and the form must not contradict it.

   Anything else is a default somebody can change — including the odd
   half at the end of an estimate, which lands in the morning because
   the halves are laid in order. A gang finishing at lunchtime and one
   starting after it are both ordinary, and this used to refuse the
   second because an estimate's half and a weekend's half arrived
   looking identical. */
const partFor = ({ date, part: allowed, fixed }, draft) =>
  (fixed ? allowed : (draft.parts?.[date] || allowed || "Full"));

/* Statuses that mean the job is done with, one way or another. Kept
   apart because the default view is work still to do, and a list that
   opens with three years of completed call-offs is a list nobody reads. */
const CLOSED = new Set(["Complete", "Withdrawn (Customer)", "Withdrawn (Aptus)"]);

/* Dates as people write them: 17-Aug-2026.

   The month as three letters rather than a number, because 03-04-2026 is
   two different days depending on who is reading it. The year in full
   rather than "26": a programme runs across a year end and "17-Aug-26"
   next to "03-Jan-27" is a pair somebody has to think about.

   Anything unparseable is passed through rather than mangled — a value
   the reader can see is wrong is better than one silently rewritten. */
const fmt = (d) => {
  if (!d) return "\u2014";
  const [y, m, dd] = String(d).split("-");
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return M && dd ? `${dd}-${M}-${y}` : d;
};

/* A phase, as it is said rather than as the task type spells it.

   "Dig" and "Reinstate" were shorter and were not what anybody calls
   them. A pill on a list is read in passing, and a word somebody has to
   translate is worse than one that takes a little more room.

   The task type's own name is the fallback, so a phase nobody has named
   here appears as itself rather than as its first word — which turned
   "Traffic Management" into "Traffic". */
function shortPhase(name) {
  const n = String(name || "");
  if (/^excav/i.test(n)) return "Excavate & Lay";
  if (/^lay/i.test(n)) return "Lay";
  if (/^reinstat/i.test(n)) return "Reinstatement";
  return n;
}

/* The columns, as every other table in the app describes them.

   The call-off list was hand-written markup: a fixed run of th and td
   in one order, with no filters and no sort. Every other list — plots,
   connections, outline designs, non-residential — is driven by a column
   list like this one, and gets moving, resizing, hiding, filtering and
   sorting from useTableLayout and FilterCell without asking.

   `raw` is what the column is filtered and sorted on, and it is
   deliberately not what is drawn. Status sorts on its text; Assigned
   sorts on how much is outstanding, because "which of these is least
   ready" is the question somebody is asking when they click it.

   `type` picks the filter: text is a contains-box, multi is a list of
   the values present, date is a range, none means the column is not
   filtered at all. */
const COLS = [
  { key: "created", label: "Submitted", width: 110, type: "date",
    raw: (r) => String(r.Created_At || "").slice(0, 10) },
  { key: "ref", label: "Reference", width: 110, type: "text",
    raw: (r) => r.AP_Number || `#${r.Submission_ID}` },
  { key: "site", label: "Site", width: 190, type: "text",
    raw: (r) => r.Site_Name || "" },
  /* The branch, under a heading that says Customer.

     A customer with three regional offices is three different people to
     send a call-off to, and the branch is what says which — "Barratt
     Homes" on a row is true of half the list and tells nobody anything.

     The heading stays short because the column is narrow and "Customer
     Branch" would wrap. The name it carries already contains the
     customer: the branch dropdowns read "Barratt Homes (Yorkshire
     East)".

     Falls back to the customer where no branch was recorded — call-offs
     raised before the branch was captured have one and not the other,
     and an em dash there would lose what is known. */
  { key: "customer", label: "Customer", width: 150, type: "multi",
    raw: (r) => r.Branch_Name || r.Customer_Name || "" },
  { key: "worktype", label: "Work Type", width: 140, type: "multi",
    raw: (r) => r.Work_Type?.Work_Type_Name || "" },
  { key: "contact", label: "Contact", width: 140, type: "text",
    raw: (r) => r.Contact_Name || "" },
  { key: "preferred", label: "Preferred", width: 110, type: "date",
    raw: (r) => r.Preferred_Date || "" },
  { key: "assigned", label: "Assigned", width: 210, type: "multi",
    /* The worst state on the row, so filtering on "Unassigned" finds
       every call-off with anything outstanding rather than only those
       with nothing booked at all. Sorting puts those first for the same
       reason. */
    raw: (r) => r._cover?.worst ?? "" },
  { key: "status", label: "Status", width: 130, type: "multi",
    raw: (r) => r.Status || "" },
  { key: "act", label: "", width: 130, type: "none", align: "center",
    raw: () => "" },
];

/* How much of a call-off is booked, and the worst of it.

   Worked out once per row rather than in the cell, because the filter
   and the sort need the same answer and a second calculation would let
   the column disagree with the list it is in. */
const COVER_RANK = { unassigned: 0, part: 1, assigned: 2 };

/* The columns a filter can be set on. Worked out once: the actions
   column has no value to match and rowPasses would call raw() on it for
   every row. */
const FILTERABLE = COLS.filter((c) => c.type !== "none");

/* An em dash for nothing, so an empty cell reads as empty rather than
   as a column that failed to render. */
const col_text = (v) => (v === "" || v == null ? "\u2014" : v);

export default function CallOffsPage() {
  const [rows, setRows] = useState([]);
  /* Sent alongside the rows so the list can say how much of each
     call-off is booked. Days belong to assignments rather than to
     call-offs, so they arrive once rather than copied onto every row
     that touches them. */
  const [allWorkDays, setAllWorkDays] = useState([]);
  const [allTaskTypes, setAllTaskTypes] = useState([]);
  /* Which phases each work type has, so a call-off with nothing booked
     can still say what is outstanding. */
  const [workTypePhases, setWorkTypePhases] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  /* The open/closed filter that lived above the table is gone: the
     Status column filters itself, and two controls for one question
     could disagree — one saying open, the other Complete, and a table
     showing nothing with no obvious reason.

     Which leaves what happens by default. Filtering to open with no
     control on screen would hide finished call-offs with nothing to say
     so, and somebody would think they had lost one. So everything shows
     and the Status filter narrows it. */
  /* Raising a call-off: null, or "editor" / "canvas" once the way has
     been chosen.

     Two ways, and they are not the same job. The editor is for a
     call-off somebody can describe — plots, dates, a work type. The
     canvas is for one they have to point at, where the answer is which
     runs between which span nodes and that is only legible on a
     drawing.

     Asked before the project rather than after, because the choice does
     not depend on the project and asking afterwards would mean going
     back. */
  const [picking, setPicking] = useState(null);
  const [openId, setOpenId] = useState(null);

  /* Arrived here from the planning board, which asked for one call-off
     in particular. Taken on mount and whenever another request comes in
     — the page may already be showing, in which case nothing remounts
     and only the listener fires.

     The status filter is cleared as well: a booking on the board can
     belong to a call-off the current filter hides, and switching to a
     page that says "no results" is a worse answer than switching to the
     row somebody asked for. */
  useEffect(() => {
    const take = (intent) => {
      const id = Number(intent?.submissionId);
      if (!id) return;
      setOpenId(id);
      /* Cleared, so the row somebody was sent to is not hidden by
         whatever was being looked at before.

         This used to widen the status filter above the table; that has
         gone, but the column filters can hide a row just as
         effectively — and arriving from the planning board to an empty
         table is the same confusion by a different route. */
      setQ("");
      setFilters({});
      setGroupBy("none");
    };
    take(takeCallOffIntent());
    return onOpenCallOff(take);
  }, []);

  useEffect(() => remember("callOffStatus", status), [status]);

  async function load() {
    setLoading(true);
    try {
      /* Everything, filtered here — the status control includes "open",
         which is several statuses rather than one and cannot be asked
         for as a single equality. */
      const res = await listAllCallOffs({});
      setRows(res.rows || []);
      setAllWorkDays(res.workDays || []);
      setAllTaskTypes(res.taskTypes || []);
      setWorkTypePhases(res.workTypePhases || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  /* ── The table ── */
  const layout = useTableLayout("calloffs", COLS);
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [sort, setSort] = useState({ key: "created", dir: "desc" });

  /* Grouping, and which groups are shut.

     Collapsed rather than expanded is the state worth keeping: a table
     of six branches is read one branch at a time, and the ones already
     dealt with should stay out of the way.

     The status dropdown above the table is gone with this. It did what
     the Status column filter already does, and having both meant two
     controls that could disagree — one saying open, the other saying
     Complete, and a table showing nothing with no obvious reason. */
  const [groupBy, setGroupBy] = useState("none");
  const [collapsed, setCollapsed] = useState({});

  const toggleSort = (key) => setSort((sc) => (sc.key === key
    ? { key, dir: sc.dir === "asc" ? "desc" : "asc" }
    : { key, dir: "asc" }));

  /* Each row's cover worked out once. The Assigned column filters and
     sorts on it, and the cell draws from it — three readings of one
     calculation would eventually disagree. */
  const coverFor = useMemo(() => {
    const out = new Map();
    for (const r of rows) {
      const asg = r.assignments || [];
      /* The phases this work type has, whether or not anything is
         booked on them.

         It used to show only phases with an assignment against them, so
         a call-off with nothing booked showed nothing — and "nothing
         booked" is the state this column exists to flag. A service
         call-off showed one green pill and no sign of the two phases
         nobody had touched.

         From the mapping rather than from the task type names: a work
         type with no reinstatement should not be asked about
         reinstatement. */
      const phases = workTypePhases
        .filter((m) => Number(m.Work_Type_ID) === Number(r.Work_Type?.Work_Type_ID))
        .map((m) => allTaskTypes
          .find((t) => Number(t.Task_Type_ID) === Number(m.Task_Type_ID)))
        .filter(Boolean)
        .filter((t) => isListedPhase(t.Task_Type_Name));

      /* ── Energising the substation ──

         On one call-off per project: the first electric service one.
         The transformer is switched on and the network goes live, which
         is a day's work happening as part of that visit rather than as
         a job of its own.

         Added here rather than through Work_Type_Task_Type because it
         is not a property of the work type — every electric service
         call-off has the same phases, and this is true of exactly one
         of them. */
      if (r.Needs_Energisation) {
        const en = allTaskTypes.find((t) =>
          /^energis/i.test(String(t.Task_Type_Name || "")));
        if (en && !phases.some((p) => Number(p.Task_Type_ID) === Number(en.Task_Type_ID))) {
          phases.push(en);
          /* In the order the work happens, not on the end.

             The cable goes in, the substation is switched on, the
             joints are made onto a live network, and the ground is
             reinstated last. Appended, it sat after reinstatement and
             read as work happening once the ground was closed.

             Sorted by the task type's own Display_Order, which is where
             that order is recorded — the mapping's order says where a
             phase sits within its work type, and this phase belongs to
             no work type. */
          phases.sort((a, b) =>
            (Number(a.Display_Order) || 0) - (Number(b.Display_Order) || 0));
        }
      }
      const states = phases.map((t) => ({
        taskTypeId: t.Task_Type_ID,
        name: t.Task_Type_Name,
        state: phaseCover(r.items || [],
          asg.filter((a) => Number(a.Task_Type_ID) === Number(t.Task_Type_ID)),
          allWorkDays),
      }));
      /* The worst of them, so filtering on Unassigned finds every
         call-off with anything outstanding rather than only the
         untouched ones. */
      const worst = states.length
        ? COVER_LABEL[states.reduce((w, x) =>
          (COVER_RANK[x.state] < COVER_RANK[w] ? x.state : w), "assigned")]
        : "";
      out.set(Number(r.Submission_ID), { states, worst });
    }
    return out;
  }, [rows, allTaskTypes, allWorkDays]);

  /* Named so the column list can reach it. COLS is declared outside the
     component and cannot close over state, so the row carries the
     answer to it. */
  const withCover = useMemo(() => rows.map((r) => ({
    ...r, _cover: coverFor.get(Number(r.Submission_ID)) ?? { states: [], worst: "" },
  })), [rows, coverFor]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = withCover.filter((r) => {
      /* The column filters, on top of the search box and the status
         dropdown above the table. All three narrow: none of them
         replaces another.

         rowPasses takes the whole column list and the whole filter
         object and walks them itself — called once per column with one
         of each, it tried to iterate a single column and threw "e is
         not iterable". The other tables call it the same way this now
         does. */
      if (!rowPasses(r, FILTERABLE, filters)) return false;
      if (!t) return true;
      /* Everything somebody might have in front of them: the reference
         off an email, the site off a drawing, the name of whoever rang. */
      return [r.AP_Number, r.Site_Name, r.Site_Address, r.Customer_Name,
        r.Contact_Name, r.Project_Ref, r.Work_Type?.Work_Type_Name]
        .some((v) => String(v ?? "").toLowerCase().includes(t));
    });

    const col = COLS.find((c) => c.key === sort.key);
    if (!col) return list;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = col.raw(a);
      const y = col.raw(b);
      /* Numbers compare as numbers, everything else as text — a date
         held as yyyy-mm-dd sorts correctly either way. */
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x ?? "").localeCompare(String(y ?? "")) * dir;
    });
  }, [withCover, q, status, filters, sort]);

  /* The rows, in groups.

     One heading row per group, so a branch or a work type reads as a
     block rather than something to scan for. Sorted by label, except
     status, which reads in the order the office works through rather
     than alphabetically — Pending Review before Complete says something
     about progress that P-before-C does not. */
  const groups = useMemo(() => {
    if (groupBy === "none") return [["", shown]];

    const label = (r) => {
      if (groupBy === "customer") {
        return r.Branch_Name || r.Customer_Name || "No customer";
      }
      if (groupBy === "worktype") {
        return r.Work_Type?.Work_Type_Name || "No work type";
      }
      return r.Status || "No status";
    };

    const m = new Map();
    for (const r of shown) {
      const k = label(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }

    const order = groupBy === "status"
      ? (a, b) => statusRank(a[0]) - statusRank(b[0])
      : (a, b) => a[0].localeCompare(b[0], undefined, { numeric: true });
    return [...m].sort(order);
  }, [shown, groupBy]);

  /* The column being grouped by, folded away: repeating the branch on
     every row under a heading that says the branch is noise. */
  const groupedCol = { customer: "customer", worktype: "worktype", status: "status" }[groupBy];
  const cols = layout.visible.filter((c) => c.key !== groupedCol);

  /* The values present in a column, for its filter list. Taken from what
     survives the other filters, so a list never offers a value that
     would show nothing. */
  const filterOptions = (key) => {
    const col = COLS.find((c) => c.key === key);
    if (!col) return [];
    return [...new Set(withCover.map((r) => col.raw(r)).filter((v) => v !== ""))]
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((v) => ({ value: v, label: String(v) }));
  };

  const open = openId != null
    ? rows.find((r) => Number(r.Submission_ID) === Number(openId))
    : null;

  /* Changing a call-off's details.

     The header only — dates, contact, the site questions, notes. The
     spans are not editable here on purpose: a run is picked by clicking
     two nodes on the drawing, and a table of text boxes is no way to say
     which piece of trench somebody means. Changing those means raising
     it again from the canvas. */
  async function saveEdit(id, projectId, patch) {
    try {
      /* The project id passed in rather than read from a `row` that does
         not exist here — the page holds `rows`, and the singular was a
         reference to nothing that would only have failed on save. */
      const saved = await updateCallOff(projectId, id, patch);

      /* ── Dates the new visit dates overtook ──

         The endpoint removes energisation dates that fall on or before
         the preferred or alternative date, because a date that cannot
         happen is not a date. It says how many, and that has to be said
         out loud: they were somebody's promise to a customer, and
         silently emptying the fields would leave the next person to
         notice the blanks and wonder whether anyone ever filled them.

         Re-read rather than patched into place, since the rows the
         panel draws from carry those dates. */
      const cleared = Number(saved?.clearedDates) || 0;
      if (cleared) {
        await load();
        window.alert(
          `${cleared} energisation date${cleared === 1 ? " was" : "s were"} removed.\n\n`
          + "They fell on or before the new visit dates, so they can no longer "
          + "happen. Set new target energisation dates on the plots below.",
        );
      } else {
        setRows((rs) => rs.map((r) =>
          Number(r.Submission_ID) === Number(id) ? { ...r, ...patch } : r));
      }
      setError("");
      return true;
    } catch (e) { setError(e.message); return false; }
  }

  async function remove(id, projectId) {
    if (!window.confirm(
      "Delete this call-off, its spans and any team assignments on it?")) {
      return;
    }
    try {
      await deleteCallOff(projectId, id);
      setRows((rs) => rs.filter((r) => Number(r.Submission_ID) !== Number(id)));
      setOpenId(null);
      setError("");
    } catch (e) { setError(e.message); }
  }

  async function move(id, next) {
    try {
      await setCallOffStatus(id, next);
      setRows((rs) => rs.map((r) =>
        Number(r.Submission_ID) === Number(id) ? { ...r, Status: next } : r));
      setError("");
    } catch (e) { setError(e.message); }
  }

  if (open) {
    return (
      <CallOffDetail row={open} onBack={() => setOpenId(null)} onMove={move}
        onSave={(id, patch) => saveEdit(id, open.Project_ID, patch)}
        /* Energisation dates are written by their own endpoint, so the
           list has to be re-read to show them — the panel is drawn from
           this row and does not hold its own copy. */
        onReload={load}
        onDelete={(id) => remove(id, open.Project_ID)} />
    );
  }

  return (
    <div className="page co-page">
      <style>{CSS}</style>

      <div className="co-bar">
        <h2>
          Call-offs
          <span className="co-of">
            {loading ? "" : `(${shown.length} of ${rows.length})`}
          </span>
        </h2>
        <input className="co-search" value={q} placeholder="Search reference, site, customer, contact…"
          onChange={(e) => setQ(e.target.value)} />
        {/* Grouping, where the status dropdown was.

            That dropdown did what the Status column filter already
            does, and having both meant two controls that could
            disagree — one saying open, the other saying Complete, and a
            table showing nothing with no obvious reason why. */}
        <select className="co-status-sel" value={groupBy}
          aria-label="Group by"
          onChange={(e) => { setGroupBy(e.target.value); setCollapsed({}); }}>
          <option value="none">No grouping</option>
          <option value="customer">Group by customer</option>
          <option value="worktype">Group by work type</option>
          <option value="status">Group by status</option>
        </select>
        {(q || groupBy !== "none" || Object.keys(filters).length > 0) && (
          <button className="btn ghost sm"
            onClick={() => { setQ(""); setGroupBy("none"); setFilters({}); }}>
            Clear
          </button>
        )}
        <span className="co-spacer" />
        {/* ── Raising one from here ──

            A call-off belongs to a project, and everything it needs —
            the plots, the work type, the site — comes from one. So this
            asks which project and then goes there, to the form that
            already exists on its Call-offs tab.

            Not a form of its own. A second place to raise a call-off is
            a second place for the plot list, the work type rules and
            the service-plot penalty to be got slightly wrong, and the
            two would drift the first time either changed. */}
        {/* Which columns are shown, and a way back to the default.

            Beside the new-call-off button, as on every other list: a
            table that can hide columns needs somewhere to unhide them,
            and somewhere obvious enough that nobody has to be told the
            preference is remembered. */}
        <ColumnsMenu
          columns={COLS}
          hidden={layout.hidden}
          onToggle={layout.toggleColumn}
          onReset={layout.reset}
        />
        <button className="btn accent sm" onClick={() => setPicking("how")}>
          + New call-off
        </button>
      </div>

      {picking === "how" && (
        <div className="co-modal" role="dialog" aria-modal="true">
          <div className="co-how">
            <h3>How do you want to raise it?</h3>
            <button className="co-how-opt" onClick={() => setPicking("editor")}>
              <strong>Fill in the call-off form</strong>
              <span>
                Plots, dates and utilities, typed in. Best when you already
                know what is being asked for.
              </span>
            </button>
            <button className="co-how-opt" onClick={() => setPicking("canvas")}>
              <strong>Pick it off the drawing</strong>
              <span>
                Opens the GIS canvas to choose the runs between span nodes.
                Best for mains, where which lengths are being laid is only
                clear on a plan.
              </span>
            </button>
            <button className="btn ghost" onClick={() => setPicking(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(picking === "editor" || picking === "canvas") && (
        <ProjectPicker
          onCancel={() => setPicking(null)}
          onPick={(project) => (picking === "canvas"
            /* Straight to the drawing, with everything but the call-off
               turned off. Somebody who came here to raise one is not
               here to edit the design, and a canvas with every tool live
               invites a change nobody asked for on the way past. */
            ? openGis({ project, callOffOnly: true })
            /* Straight to the editor, not to the tab it lives on. The
               tab's New call-off button asked nothing and could only be
               pressed — a step, not a decision. */
            : openProject(project, "calloffs", { newCallOff: true }))}
        />
      )}

      {error && <p className="co-err">{error}</p>}
      {loading && <p className="hint">Loading…</p>}

      {!loading && !shown.length && (
        <p className="hint co-none">
          {rows.length
            ? "Nothing matches that."
            : "No call-offs yet. Use New call-off to pick a project and raise one."}
        </p>
      )}

      {!!shown.length && (
        <div className="dt-wrap">
          <table className="dt co-tbl">
            <colgroup>
              {cols.map((c) =>
                <col key={c.key} style={{ width: layout.widths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr className="head-row">
                {cols.map((c) => (
                  <th key={c.key} {...layout.reorderProps(c.key)}
                      className={c.align === "center" ? "ta-c" : undefined}
                      onClick={() => c.type !== "none" && toggleSort(c.key)}>
                    {c.label}
                    {sort.key === c.key && (
                      <span className="arrow">
                        {sort.dir === "asc" ? "\u25B2" : "\u25BC"}
                      </span>
                    )}
                    {/* draggable={false} on the handle: without it the
                        column drag starts the moment somebody grabs the
                        edge to resize, and the two fight. */}
                    <span className="resizer" draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onMouseDown={(e) => layout.startResize(e, c.key)} />
                  </th>
                ))}
              </tr>
              <tr className="filter-row" onClick={(e) => e.stopPropagation()}>
                {cols.map((c) => (
                  <th key={c.key}>
                    {c.type !== "none" && (
                      <FilterCell col={c} value={filters[c.key] ?? blankFilter(c.type)}
                        onChange={(v) => setFilters((x) => ({ ...x, [c.key]: v }))}
                        options={c.type === "multi" ? filterOptions(c.key) : null}
                        open={openFilter === c.key}
                        setOpen={(o) => setOpenFilter(o ? c.key : null)} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.flatMap(([label, list]) => [
                /* A heading per group, spanning the table. Clicking it
                   shuts the group: a list of six branches is read one
                   branch at a time, and the ones dealt with should get
                   out of the way. */
                ...(label ? [(
                  <tr className="co-grp" key={`g:${label}`}
                    onClick={() => setCollapsed((c) => ({ ...c, [label]: !c[label] }))}>
                    <td colSpan={cols.length}>
                      <button className="co-grp-t" aria-expanded={!collapsed[label]}
                        aria-label={`${collapsed[label] ? "Expand" : "Collapse"} ${label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollapsed((c) => ({ ...c, [label]: !c[label] }));
                        }}>
                        {collapsed[label] ? "\u25B8" : "\u25BE"}
                      </button>
                      <strong>{label}</strong>
                      {/* The count, because a shut group otherwise says
                          nothing about what is inside it. */}
                      <span className="co-grp-n">
                        {`${list.length} call-off${list.length === 1 ? "" : "s"}`}
                      </span>
                    </td>
                  </tr>
                )] : []),
                ...(collapsed[label] ? [] : list.map((r) => (
                /* The whole row opens it: the target is bigger and there
                   is nothing else on a row to click. */
                <tr key={r.Submission_ID} onClick={() => setOpenId(r.Submission_ID)}>
                  {cols.map((c) => {
                    if (c.key === "act") {
                      /* stopPropagation on both: the row opens the
                         call-off, and without it Delete would open the
                         one it had just removed. */
                      return (
                        <td key={c.key} className="co-act">
                          <button className="btn edit sm"
                            onClick={(e) => {
                              e.stopPropagation(); setOpenId(r.Submission_ID);
                            }}>Edit</button>
                          <button className="btn delete sm"
                            onClick={(e) => {
                              e.stopPropagation(); remove(r.Submission_ID, r.Project_ID);
                            }}>Delete</button>
                        </td>
                      );
                    }
                    if (c.key === "created") {
                      return (
                        <td key={c.key} className="co-dim">
                          {fmt(String(r.Created_At || "").slice(0, 10))}
                        </td>
                      );
                    }
                    if (c.key === "ref") {
                      return (
                        <td key={c.key}>
                          <strong>{r.AP_Number || `#${r.Submission_ID}`}</strong>
                        </td>
                      );
                    }
                    if (c.key === "worktype") {
                      return (
                        <td key={c.key}>
                          <span className="co-wt-pill">
                            {r.Work_Type?.Work_Type_Name || "\u2014"}
                          </span>
                        </td>
                      );
                    }
                    if (c.key === "preferred") {
                      return <td key={c.key}>{fmt(r.Preferred_Date)}</td>;
                    }
                    if (c.key === "status") {
                      return (
                        <td key={c.key}>
                          <span className={`co-st s-${String(r.Status || "")
                            .replace(/\W+/g, "").toLowerCase()}`}>
                            {r.Status}
                          </span>
                        </td>
                      );
                    }
                    if (c.key === "assigned") {
                      const states = r._cover?.states ?? [];
                      return (
                        <td key={c.key} className="co-cover">
                          {states.length ? states.map((x) => (
                            <span className={`co-cov c-${x.state}`} key={x.taskTypeId}
                              title={`${x.name}: ${COVER_LABEL[x.state]}`}>
                              {shortPhase(x.name)}
                              <b>{COVER_LABEL[x.state]}</b>
                            </span>
                          )) : <span className="co-dim">&mdash;</span>}
                        </td>
                      );
                    }
                    /* Everything else is its own raw value, which is
                       also what it filters and sorts on — so the column
                       cannot show one thing and be ordered by another. */
                    return <td key={c.key}>{col_text(c.raw(r))}</td>;
                  })}
                </tr>
                ))),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* One call-off: what was asked for, and where it has got to. */
/* ── Energisation dates: plots down, utilities across ──

   One table, one date picker per cell. The first version put a
   collapsed editor inside each row's cell, which meant the utility
   labels were repeated four times, wrapped in a column sized for a
   date, and sat a long way from the plot they belonged to. A grid says
   the same thing once along the top.

   ── Only the utilities on the project ──

   The ones with an outline design. A project designed for electric and
   water has no gas to energise, and offering a gas date invites
   somebody to fill it in for work nobody is doing. Scopes are what an
   outline design is — one per utility — so the columns are the scopes.

   Empty where a project has no designs yet, and the table says so
   rather than drawing a header with nothing under it.

   ── Apply to all plots ──

   A phased handover is the exception; most call-offs energise together.
   So the top row can be copied down, which turns twelve pickers into
   three. It copies whatever is in the first row at the moment it is
   ticked, including blanks — "the same as plot 1" has to mean the same,
   or it would quietly leave old dates behind on the plots below. */
/* Which project the new call-off is for.

   ── Why this asks instead of guessing ──

   A call-off belongs to exactly one project and there is no sensible
   default: the last one somebody looked at is a guess, and a guess that
   raises work against the wrong site is expensive to unpick.

   ── Only contracted projects ──

   Call-offs are a contract-stage thing — the tab does not exist on a
   tender — so offering a tender project would send somebody to a page
   with no form on it. Filtered here rather than at the endpoint because
   the same list serves other callers.

   Search rather than paging: a planner knows the reference or the site
   and would rather type three characters than scroll. */
export function ProjectPicker({ onCancel, onPick }) {
  const drag = useDragHandle();
  const [rows, setRows] = useState([]);
  /* Sent alongside the rows so the list can say how much of each
     call-off is booked. Days belong to assignments rather than to
     call-offs, so they arrive once rather than copied onto every row
     that touches them. */
  const [allWorkDays, setAllWorkDays] = useState([]);
  const [allTaskTypes, setAllTaskTypes] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listProjects({ pageSize: 500 })
      .then((r) => { if (alive) setRows(r.rows || []); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => {
    const contracted = rows.filter((r) =>
      String(r.Stage || "").toLowerCase() !== "tender");
    const needle = q.trim().toLowerCase();
    if (!needle) return contracted.slice(0, 60);
    return contracted.filter((r) => [
      r.Display_Ref, r.Project_Ref, r.Site_Name, r.Customer_Name,
    ].some((v) => String(v || "").toLowerCase().includes(needle))).slice(0, 60);
  }, [rows, q]);

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onCancel(); }}>
      <div className="pp" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Choose a project">
        <div className="pp-head" {...drag.handleProps}>
          <div>
            <h3>New call-off</h3>
            <p className="pp-sub">
              Which project is it for? You will land on its Call-offs tab.
            </p>
          </div>
          <button className="fe-x" onClick={onCancel} aria-label="Close">&times;</button>
        </div>

        <div className="pp-body">
          <input className="pp-search" autoFocus value={q}
            placeholder={"Search reference, site, customer\u2026"}
            onChange={(e) => setQ(e.target.value)} />

          {error && <p className="pp-err">{error}</p>}
          {loading && <p className="hint">Loading projects&hellip;</p>}
          {!loading && !shown.length && (
            <p className="hint">
              {rows.length
                ? "No contracted project matches that."
                : "No projects found."}
            </p>
          )}

          <ul className="pp-list">
            {shown.map((p) => (
              <li key={p.Project_ID}>
                <button onClick={() => onPick(p)}>
                  <strong>{p.Display_Ref || p.Project_Ref || `#${p.Project_ID}`}</strong>
                  <span>{p.Site_Name || ""}</span>
                  <em>{p.Customer_Name || ""}</em>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="fe-foot">
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function EnergisationGrid({ heading, plots, utilities, floor, onSaved }) {
  const earliest = floor ? dayAfter(floor.date) : "";

  /* Keyed plot then utility. Seeded from what is saved, so opening the
     panel and saving without touching anything changes nothing. */
  const saved = () => Object.fromEntries(plots.map((p) => [
    p.Service_Plot_ID,
    Object.fromEntries((p.Utilities || [])
      .map((u) => [Number(u.Utility_ID), u.Energisation_Date || ""])),
  ]));

  const [draft, setDraft] = useState(saved);
  const [applyAll, setApplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const first = plots[0];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved());

  const set = (plotId, utilityId, value) => setDraft((d) => {
    const next = { ...d, [plotId]: { ...(d[plotId] || {}), [Number(utilityId)]: value } };
    /* Still ticked, so the rest of the column follows the top row as it
       is typed rather than only when the box was clicked. */
    if (applyAll && first && Number(plotId) === Number(first.Service_Plot_ID)) {
      for (const p of plots) {
        next[p.Service_Plot_ID] = {
          ...(next[p.Service_Plot_ID] || {}), [Number(utilityId)]: value,
        };
      }
    }
    return next;
  });

  const copyDown = (on) => {
    setApplyAll(on);
    if (!on || !first) return;
    setDraft((d) => {
      const top = d[first.Service_Plot_ID] || {};
      const next = { ...d };
      for (const p of plots) next[p.Service_Plot_ID] = { ...top };
      return next;
    });
  };

  async function save() {
    setBusy(true);
    setError("");
    try {
      /* One request per plot, in order, so a failure names the plot it
         failed on rather than leaving the whole table in doubt. */
      for (const p of plots) {
        await setPlotEnergisation(p.Service_Plot_ID, utilities.map((u) => ({
          Utility_ID: u.Utility_ID,
          Energisation_Date: draft[p.Service_Plot_ID]?.[Number(u.Utility_ID)] || "",
        })));
      }
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!utilities.length) {
    return (
      <p className="hint">
        No outline designs on this project, so there are no utilities to energise.
        Add a design on the project&rsquo;s Outline Designs tab.
      </p>
    );
  }

  return (
    <div className="eg">
      {/* Named for what these dates are: a target, not a commitment.
          The column header said "energisation date" and the table now
          holds one per utility, so the singular had stopped being
          true. */}
      {heading && <h4 className="eg-head">{heading}</h4>}
      <table className="eg-tbl">
        <thead>
          <tr>
            <th className="eg-plot">Plot</th>
            {utilities.map((u) => (
              <th key={u.Utility_ID}>
                <span className="eg-dot" style={{ background: u.Colour || "#94a3b8" }} />
                {u.Utility}
              </th>
            ))}
            <th className="eg-all" />
          </tr>
        </thead>
        <tbody>
          {plots.map((p, i) => (
            <tr key={p.Service_Plot_ID}>
              <th scope="row" className="eg-plot">{p.Plot}</th>
              {utilities.map((u) => (
                <td key={u.Utility_ID}>
                  <input type="date" className="eg-date"
                    aria-label={`Plot ${p.Plot} ${u.Utility} energisation date`}
                    min={earliest || undefined}
                    /* Every row below the first follows it while the box
                       is ticked, so they are shown as the read-only
                       consequence they are rather than as fields that
                       look editable and then spring back. */
                    disabled={applyAll && i > 0}
                    value={draft[p.Service_Plot_ID]?.[Number(u.Utility_ID)] || ""}
                    onChange={(e) => set(p.Service_Plot_ID, u.Utility_ID, e.target.value)} />
                </td>
              ))}
              <td className="eg-all">
                {i === 0 && (
                  <label className="eg-applyall">
                    <input type="checkbox" checked={applyAll}
                      onChange={(e) => copyDown(e.target.checked)} />
                    Apply to all plots
                  </label>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {floor && (
        <p className="eg-floor">
          Nothing before {earliest} &mdash; the day after {floor.why}.
        </p>
      )}
      {error && <p className="eg-err">{error}</p>}
      <div className="eg-foot">
        <button className="btn accent sm" disabled={busy || !dirty} onClick={save}>
          {busy ? "Saving\u2026" : "Save energisation dates"}
        </button>
        {dirty && !busy && (
          <button className="btn ghost sm" onClick={() => { setDraft(saved()); setApplyAll(false); }}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function CallOffDetail({ row, onBack, onMove, onSave, onReload, onDelete }) {
  /* Utility names for the energisation column. Loaded here rather than
     threaded down: this is the only place in the panel that needs them,
     and the lookups are cached. Falls back to the id, which is ugly and
     true — better than a blank where a utility used to be. */
  const [utils, setUtils] = useState([]);
  useEffect(() => {
    let alive = true;
    getLookups()
      .then((lk) => { if (alive) setUtils(lk?.utilities || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const utilityName = (id) => utils
    .find((u) => Number(u.Utility_ID) === Number(id))?.Utility || `#${id}`;

  /* ── The utilities this project actually has ──

     The ones with an outline design, which in this schema is a scope:
     one per utility on the project. A project designed for electric and
     water has no gas to energise, and a gas column would invite
     somebody to fill in a date for work nobody is doing.

     Scopes come back with the project, so this is one request and not a
     table of its own. Ordered the way the utilities are ordered
     everywhere else rather than the order the designs were added — a
     column that moves between call-offs is a column somebody mis-reads
     once. */
  const [scopes, setScopes] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!row.Project_ID) return undefined;
    getProject(row.Project_ID)
      .then((p) => { if (alive) setScopes(p?.scopes || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [row.Project_ID]);

  const designUtilities = useMemo(() => {
    const wanted = new Set(scopes.map((sc) => Number(sc.Utility_ID)));
    /* Gas, water, electric \u2014 see byUtilityColumn. This screen and the
       call-off tab draw the same grid, so they read the same order from
       the same place. */
    return utils.filter((u) => wanted.has(Number(u.Utility_ID)))
      .slice()
      .sort(byUtilityColumn);
  }, [utils, scopes]);

  /* The earliest anything on this call-off may be asked to go live.

     Unlike the form the call-off was raised on, this screen knows what
     has actually been booked, so the floor here is the real one: the
     day the excavation and lay finishes. */
  const [digAssignments, setDigAssignments] = useState([]);
  const [digPhases, setDigPhases] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.all([adminList("Call_Off_Assignment"), adminList("Task_Type")])
      .then(([a, t]) => {
        if (!alive) return;
        setDigAssignments((a.rows || [])
          .filter((x) => Number(x.Submission_ID) === Number(row.Submission_ID)));
        setDigPhases(t.rows || []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [row.Submission_ID]);

  const energFloor = energisationFloor(row, {
    assignments: digAssignments, taskTypes: digPhases,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  /* Started from the call-off as it is, so cancelling leaves nothing
     behind and saving sends only what somebody actually changed. */
  const startEdit = () => {
    setDraft({
      Preferred_Date: row.Preferred_Date ?? "",
      Alternative_Date: row.Alternative_Date ?? "",
      Contact_Name: row.Contact_Name ?? "",
      Contact_Phone: row.Contact_Phone ?? "",
      Contact_Company: row.Contact_Company ?? "",
      Obstruction_Free: row.Obstruction_Free ?? "",
      Ground_Unmade: row.Ground_Unmade ?? "",
      Line_Level_Required: row.Line_Level_Required ?? "",
      Notes: row.Notes ?? "",
      /* Which utilities this call-off covers (0146). Editable here
         rather than on the project's call-off tab: that tab is a list,
         and one place to edit a call-off is better than two. */
      utility_ids: [...(row.utility_ids || [])],
    });
    setEditing(true);
  };

  const mode = row.Selection_Mode;
  const heading = mode === "ColumnList" ? "Columns"
    : mode === "Span" ? "Trench sections" : "Service plots";

  return (
    <div className="page co-page">
      <style>{CSS}</style>

      <div className="co-head-bar">
        <button className="btn ghost sm" onClick={onBack}>&larr; Back</button>
        <div>
          <p className="co-kicker">
            Call-off &middot; {row.Work_Type?.Work_Type_Name || "\u2014"}
          </p>
          <h2>
            {row.AP_Number || `#${row.Submission_ID}`}
            {row.Site_Name ? ` \u00b7 ${row.Site_Name}` : ""}
          </h2>
        </div>
        <span className={`co-st big s-${String(row.Status || "").replace(/\W+/g, "").toLowerCase()}`}>
          {row.Status}
        </span>
        {!editing && (
          <>
            <button className="btn edit sm" onClick={startEdit}>Edit</button>
            {/* Deleting takes the spans and any assignments with it, so
                it says so before it happens. */}
            {/* "btn ghost danger", which is how the rest of the app
                spells a destructive button — "btn danger" is defined
                nowhere and would have rendered as a plain button, with
                Delete looking exactly like Edit. */}
            <button className="btn delete sm"
              onClick={() => onDelete?.(row.Submission_ID)}>Delete</button>
          </>
        )}
      </div>

      {editing && (
        <div className="co-card">
          <h3>Edit call-off</h3>

          <div className="co-ed-utils">
            <span className="co-ed-utils-label">Utilities in this call-off</span>
            {utils.filter((u) => !u.Is_Lighting).map((u) => (
              <label className="co-ed-util" key={u.Utility_ID}>
                <input type="checkbox"
                  checked={(draft.utility_ids || []).includes(Number(u.Utility_ID))}
                  onChange={(e) => setDraft((d) => {
                    const cur = d.utility_ids || [];
                    return {
                      ...d,
                      utility_ids: e.target.checked
                        ? [...cur, Number(u.Utility_ID)]
                        : cur.filter((x) => x !== Number(u.Utility_ID)),
                    };
                  })} />
                {u.Utility}
              </label>
            ))}
          </div>

          <div className="co-edit">
            {[
              ["Preferred_Date", "Preferred date", "date"],
              ["Alternative_Date", "Alternative date", "date"],
              ["Contact_Name", "Contact", "text"],
              ["Contact_Phone", "Phone", "text"],
              ["Contact_Company", "Company", "text"],
            ].map(([k, label, type]) => (
              <label className="co-ed" key={k}>
                <span>{label}</span>
                <input type={type} value={draft[k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
              </label>
            ))}
            {[
              ["Obstruction_Free", "Obstruction free"],
              ["Ground_Unmade", "Ground unmade"],
              ["Line_Level_Required", "Line and level"],
            ].map(([k, label]) => (
              <label className="co-ed" key={k}>
                <span>{label}</span>
                <select value={draft[k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}>
                  <option value="">&mdash;</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
            ))}
            <label className="co-ed wide">
              <span>Notes</span>
              <textarea rows={3} value={draft.Notes}
                onChange={(e) => setDraft((d) => ({ ...d, Notes: e.target.value }))} />
            </label>
          </div>

          {/* Said plainly rather than left to be discovered: the runs
              are picked on the drawing and cannot be typed here. */}
          <p className="hint co-ed-note">
            {row.Selection_Mode === "Span"
              ? "The trench sections are picked on the GIS canvas. To change "
                + "them, raise the call-off again from there."
              : "The plots are chosen on the project's Call-offs tab."}
          </p>

          <div className="co-actions">
            <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn accent" disabled={saving}
              onClick={async () => {
                setSaving(true);
                const ok = await onSave?.(row.Submission_ID, {
                  ...draft,
                  /* Blank optional fields as null, not "" — an empty
                     string reads as an answer of nothing rather than as
                     no answer. */
                  Alternative_Date: draft.Alternative_Date || null,
                  Contact_Company: draft.Contact_Company || null,
                  Obstruction_Free: draft.Obstruction_Free || null,
                  Ground_Unmade: draft.Ground_Unmade || null,
                  Line_Level_Required: draft.Line_Level_Required || null,
                  Notes: draft.Notes || null,
                });
                setSaving(false);
                if (ok) setEditing(false);
              }}>
              {saving ? "Saving\u2026" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      <div className="co-card">
        <h3>Request</h3>
        <div className="co-facts">
          {[
            ["Customer", row.Customer_Name],
            ["Branch", row.Branch_Name],
            ["Site address", row.Site_Address],
            ["Contact", row.Contact_Name],
            ["Company", row.Contact_Company],
            ["Phone", row.Contact_Phone],
            ["Preferred date", fmt(row.Preferred_Date)],
            ["Alternative date", fmt(row.Alternative_Date)],
            ["Obstruction free", row.Obstruction_Free],
            ["Ground unmade", row.Ground_Unmade],
            ["Line and level required", row.Line_Level_Required],
            ["Raised by", row.Created_By],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div className="co-fact" key={k}>
              <span>{k}</span><strong>{v}</strong>
            </div>
          ))}
        </div>
        {row.Notes && <p className="co-notes">{row.Notes}</p>}
      </div>

      <div className="co-card">
        <h3>{heading} <span className="co-dim">&middot; {row.items?.length ?? 0}</span></h3>
        {!row.items?.length ? (
          <p className="hint">Nothing listed on this call-off.</p>
        ) : mode === "PlotList" ? (
          /* Plots get the grid: one row each, one column per utility the
             project has a design for. */
          <EnergisationGrid
            heading="Target energisation dates"
            plots={row.items.filter((it) => it.Service_Plot_ID)}
            utilities={designUtilities}
            floor={energFloor}
            onSaved={onReload}
          />
        ) : (
          <table className="co-tbl flat">
            <thead>
              <tr>
                <th>{mode === "ColumnList" ? "Column" : "Section"}</th>
                {mode === "Span" && (
                  <>
                    <th>D/P</th>
                    <th>Length</th>
                    {/* What is laid along the section, from the drawing
                        as the call-off was raised (0160). A gang needs
                        the sizes as well as the kinds, and the
                        utilities on the request only say which kinds. */}
                    <th>Pipes and cables</th>
                    {/* And how long it takes, which is what an
                        assignment's end date is defaulted from. Here
                        too, so the two can be read against each
                        other. */}
                    <th>Dig &amp; lay</th>
                  </>
                )}
                <th>Energisation date</th>
              </tr>
            </thead>
            <tbody>
              {row.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <strong>
                      {mode === "ColumnList" ? it.Street_Light_ID : it.Plots}
                    </strong>
                  </td>
                  {mode === "Span" && (
                    <>
                      <td>{it.D_or_P || "\u2014"}</td>
                      <td>{it.Estimated_Length_m ? `${it.Estimated_Length_m} m` : "\u2014"}</td>
                      {/* A dash for a section nothing was recorded for
                          — a call-off raised before this was kept, or
                          one whose trench had nothing routed in it. Not
                          an empty cell: "nothing is laid here" and
                          "nobody wrote it down" look the same when both
                          are blank. */}
                      <td className="co-contents">{it.Contents || "\u2014"}</td>
                      <td>{it.Estimated_Half_Days
                        ? halfDaysText(it.Estimated_Half_Days) : "\u2014"}</td>
                    </>
                  )}
                  {/* A span still carries one date and a lighting column
                      only ever has electric, so both show what they
                      have. 0136 covers plots; the same shape would fit
                      spans if a mains call-off ever needs it. */}
                  <td>{fmt(it.Energisation_Date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      <Assignments row={row} />

      <div className="co-card">
        <h3>Request status</h3>
        <p className="hint">
          Where the request itself has got to — raised, reviewed, withdrawn.
          What each team has done with the work is on its own assignment above.
        </p>
        <div className="co-steps">
          {STATUSES.map((s) => (
            <button key={s}
              className={s === row.Status ? "co-step on" : "co-step"}
              onClick={() => onMove(row.Submission_ID, s)}>
              {s === row.Status && <span className="co-dot" />}
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Teams on the phases of a call-off.

   A work type is done in phases, each needing a craft, and only teams
   holding that craft in that region may work it. One phase can carry
   several assignments — Team A on the first five plots, Team B on the
   rest — so the work runs in parallel where the site allows.

   Loads its own data rather than taking it from the page: the page lists
   call-offs and has no reason to carry teams and crafts for the one that
   happens to be open. */
function Assignments({ row }) {
  const [phases, setPhases] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamCrafts, setTeamCrafts] = useState([]);
  const [teamRegions, setTeamRegions] = useState([]);
  const [crafts, setCrafts] = useState([]);
  /* Which utilities each craft covers (0151). No rows against a craft
     means any \u2014 a reinstatement gang follows whatever was dug. */
  const [craftUtilities, setCraftUtilities] = useState([]);
  const [all, setAll] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [openPhase, setOpenPhase] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [workDays, setWorkDays] = useState([]);
  /* Which utilities each booking covers, where it is split (0147).
     Assignment_ID to a list; a booking with no entry covers whatever
     the call-off does, which is what most of them are. */
  const [assignmentUtilRows, setAssignmentUtilRows] = useState([]);
  /* The utilities, for the split control.

     Loaded here rather than passed down: this panel already reads its
     own lookups \u2014 teams, crafts, task types \u2014 and the detail
     component above holds a `utils` of its own for the energisation
     grid. Two components needing the same table is not a reason to
     thread it through props; it is a reason for each to ask. */
  const [utils, setUtils] = useState([]);
  const [saidSaved, setSaidSaved] = useState("");
  /* The states a team's work can be in, with their colours. From the
     table rather than a list in this file, so adding "On Hold" is an
     admin job and not a deploy. */
  const [statuses, setStatuses] = useState([]);
  /* What follows what — 0134 and 0135. Held here so the editor refuses
     the same arrangements the planning board refuses: two screens that
     disagree about whether jointing may precede the dig would let
     somebody get the answer they wanted by choosing the other one. */
  const [dependencies, setDependencies] = useState([]);
  const [dependencyTypes, setDependencyTypes] = useState([]);

  /* The earliest a phase may start on this call-off.

     The dependency rules first, since they are what somebody has
     actually stated about the work; the phase-order guess only where
     there are none. Those two disagree by design — the order-based one
     lets a phase begin the day an earlier phase begins, which a
     finish-to-start forbids — so asking them in the wrong order would
     default jointing to the day the dig starts and then refuse to save
     it.

     Written once and used for all three of: the date a new assignment
     opens on, the earliest the picker will accept, and the sentence
     that says why. Three places reading the same answer, rather than
     three chances to compute it differently. */
  const floorFor = (taskTypeId, mine, plotUniverse, spanId = null) =>
    dependencyFloor(taskTypeId, {
      assignments: mine,
      dependencies, dependencyTypes,
      taskTypes: phases,
      workTypeId: row.Work_Type_ID,
    })
    || earliestStart(phases, mine, taskTypeId, plotUniverse, spanId);

  async function load() {
    try {
      const [tt, map, tm, tc, tr, cr, asg, ut] = await Promise.all([
        adminList("Task_Type"), adminList("Work_Type_Task_Type"),
        adminList("Team"), adminList("Team_Craft"), adminList("Team_Region"),
        adminList("Craft"), adminList("Call_Off_Assignment"),
        adminList("Utility"),
      ]);
      /* Gas, water, electric \u2014 the same order the energisation
         columns read in, so the two do not disagree. */
      setUtils((ut.rows || []).slice().sort(byUtilityColumn));
      const wd = await adminList("Call_Off_Work_Day").catch(() => ({ rows: [] }));
      setWorkDays(wd.rows || []);
      /* Tolerated missing like the rest: a database where 0147 has not
         been run has no split bookings, and a panel that refused to
         open because of that would be worse than one that shows every
         booking as covering everything. */
      const au = await adminList("Call_Off_Assignment_Utility")
        .catch(() => ({ rows: [] }));
      setAssignmentUtilRows(au.rows || []);
      /* Tolerated missing like the rest: a database without 0151 has no
         craft utilities, and the rule falls back to the older check
         rather than refusing every team. */
      const cu = await adminList("Craft_Utility").catch(() => ({ rows: [] }));
      setCraftUtilities(cu.rows || []);
      /* Tolerated missing, like the work days above: an assignment whose
         status cannot be read is still an assignment worth showing, and
         a panel that renders nothing because a lookup table is absent is
         worse than one with grey pills on it. */
      /* Tolerated missing in the same way: a database where 0134 has
         not been run has no dependency rules, and an editor that
         refused to open because of that would be worse than one that
         simply enforces nothing. */
      const [dep, depT] = await Promise.all([
        adminList("Task_Dependency").catch(() => ({ rows: [] })),
        adminList("Dependency_Type").catch(() => ({ rows: [] })),
      ]);
      setDependencies((dep.rows || []).filter((d) => d.Is_Active !== false));
      setDependencyTypes(depT.rows || []);

      const st = await adminList("Call_Off_Status").catch(() => ({ rows: [] }));
      setStatuses((st.rows || [])
        .filter((x) => x.Is_Active !== false)
        .sort((a, b) => (a.Display_Order ?? 0) - (b.Display_Order ?? 0)));
      /* The phases this work type involves, in its own order — the same
         phase can sit at a different point in different work types. */
      const mine = (map.rows || [])
        .filter((m) => Number(m.Work_Type_ID) === Number(row.Work_Type_ID))
        .sort((a, b) => (a.Display_Order ?? 0) - (b.Display_Order ?? 0))
        .map((m) => (tt.rows || []).find((t) =>
          Number(t.Task_Type_ID) === Number(m.Task_Type_ID)))
        .filter(Boolean);

      setPhases(mine);
      setTeams(tm.rows || []);
      setTeamCrafts(tc.rows || []);
      setTeamRegions(tr.rows || []);
      setCrafts(cr.rows || []);
      /* Every assignment, not only this call-off's: a team cannot be on
         two sites at once, and the clash that matters is the one nobody
         looking at this call-off would see. */
      setAll(asg.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [row.Submission_ID]);

  const mine = all.filter((a) =>
    Number(a.Submission_ID) === Number(row.Submission_ID));

  /* The plots this call-off covers, which is what an assignment splits
     between teams. */
  /* Assignment_ID to its utilities, built once rather than filtered per
     row. */
  const assignmentUtils = useMemo(() => {
    const m = new Map();
    for (const r of assignmentUtilRows) {
      const k = Number(r.Assignment_ID);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(Number(r.Utility_ID));
    }
    return m;
  }, [assignmentUtilRows]);

  const plotUniverse = (row.items || [])
    .map((it) => it.Plot ?? it.Plots ?? String(it.Street_Light_ID ?? ""))
    .filter(Boolean);

  /* The metres an assignment covers.

     A team turning up to dig wants to know how much, and the figure was
     already on the call-off — every item carries Estimated_Length_m and
     the items table above shows it — but it stopped there, so the
     assignment rows named a span and said nothing about its size.

     Three cases, and only three are answerable:

       a named span      that span's length
       no span named     the whole call-off, which is what it covers
       a plot range      nothing

     The last is a refusal on purpose. In plot mode the metres belong to
     the runs, not to the plots, and there is no honest way to divide a
     span's length between the plots along it — a number worked out that
     way would look exactly as authoritative as the other two and be a
     guess. Better a blank the reader can chase than a figure they
     cannot. */
  const metresFor = (a) => {
    const items = row.items || [];
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };

    if (a.Span_ID != null) {
      const it = items.find((x) => Number(x.Span_ID) === Number(a.Span_ID));
      return it ? num(it.Estimated_Length_m) : 0;
    }
    /* No span named: the assignment is the whole call-off. In plot mode
       that only holds when it takes all the plots too. */
    if (row.Selection_Mode === "Span" || !a.Plot_Range) {
      return items.reduce((t, x) => t + num(x.Estimated_Length_m), 0);
    }
    return 0;
  };

  /* ── The days this booking actually falls on ──

     Length in days of work, laid out from the start over the weekend
     rule. Everything the form shows below — the day rows, the total,
     the end date it saves — reads this, so the three cannot disagree
     about whether the Saturday counts.

     The length comes from the days already worked when an existing
     booking is reopened, and from the calendar span when one is being
     entered. That is what makes the round trip stable: four days laid
     from a Friday end on the Wednesday, and reopening that finds four
     worked days and lays them on the same four dates. Measuring the
     length in calendar days both times would walk the end date two
     further out every time somebody opened it. */
  const schedule = useMemo(() => {
    const weekend = draft.weekend || {};
    if (!draft.Start_Date || !draft.End_Date) {
      return { days: [], end: null, pushed: 0, weekend };
    }
    /* Where the estimate put the dates there, lay it out in halves.

       The two measures below both work in whole days, which is right
       for dates somebody typed and wrong for dates derived from an
       estimate. A day and a half of work from a Saturday finishes on
       the Tuesday morning; measured as a calendar span that is four
       days, and laying four worked days from the Saturday gave Monday
       to Thursday — four full days against an estimate of one and a
       half.

       Laid half by half instead, so the odd half shows as an AM on its
       last day rather than rounding up to a whole one. The same
       layHalves the end date came from, so the rows and the date cannot
       disagree.

       Only while the defaulted dates are still standing. Once somebody
       has typed an end date they mean those dates, and the calendar
       span is the right reading of them again. */
    if (editing == null && draft.autoHalves > 0 && draft.End_Date === draft.autoEnd) {
      const laid = layHalves(
        draft.Start_Date, false,
        Array.from({ length: draft.autoHalves }, () => ({})), weekend,
      );
      return { ...laid, pushed: 0, weekend };
    }

    const length = editing != null
      ? workedDaysIn(draft.Start_Date, draft.End_Date, weekend).length
      : daysBetween(draft.Start_Date, draft.End_Date).length;
    return { ...laySchedule(draft.Start_Date, length, weekend), weekend };
  }, [draft.Start_Date, draft.End_Date, draft.autoHalves, draft.autoEnd,
    draft.weekend, editing]);

  /* The end date follows the day rows, while the rows are the form's.

     Everything that changes the shape of a booking — the run it covers,
     the start it moves to, whether the weekend is worked — changes
     where the work finishes. Each of those was correcting the end date
     its own way, and each got it wrong differently: moving a start from
     the Saturday to the Monday slid the end two days as well, so two
     days of work read as the 17th to the 20th while the rows
     underneath, correctly, showed only the 17th and 18th.

     So there is one rule instead of four. The rows are laid from the
     estimate and the calendar; the field says where they end. It cannot
     disagree with them because it is not worked out separately.

     Only while the dates are still the ones the form put there. A date
     somebody typed is theirs, and this stops following the moment it
     stops matching. */
  useEffect(() => {
    if (editing != null) return;
    if (!(draft.autoHalves > 0)) return;
    if (draft.End_Date !== draft.autoEnd) return;
    const end = schedule.end;
    if (!end || end === draft.End_Date) return;
    setDraft((d) => ({ ...d, End_Date: end, autoEnd: end }));
  }, [schedule.end, draft.autoHalves, draft.End_Date, draft.autoEnd, editing]);

  /* Moving one assignment along.

     Written on the spot rather than through the edit form: a gang
     finishing a span is the most frequent thing anybody records here,
     and making it open a form, change a dropdown and save is three
     actions for a fact that takes one.

     Shown before it is saved and put back if the save fails. The
     alternative — waiting for the round trip — makes a click on a pill
     feel like it did nothing, which is how the same click gets made
     three times. */
  async function moveStatus(a, next) {
    const was = a.Status;
    if (next === was) return;
    setAll((xs) => xs.map((x) =>
      Number(x.Assignment_ID) === Number(a.Assignment_ID) ? { ...x, Status: next } : x));
    setBusy(`s:${a.Assignment_ID}`);
    try {
      await adminUpdate("Call_Off_Assignment", a.Assignment_ID, { Status: next });
      setError("");
    } catch (e) {
      setAll((xs) => xs.map((x) =>
        Number(x.Assignment_ID) === Number(a.Assignment_ID) ? { ...x, Status: was } : x));
      setError(e.message);
    } finally { setBusy(null); }
  }

  const craftName = (id) =>
    crafts.find((c) => Number(c.Craft_ID) === Number(id))?.Craft_Name ?? null;
  const teamName = (id) =>
    teams.find((t) => Number(t.Team_ID) === Number(id))?.Team_Name ?? `Team ${id}`;

  /* Opening an existing assignment to change it.

     The same form as adding one, filled in — a separate edit dialog
     would be the same fields written twice and would drift. */
  function editFor(a) {
    const mineDays = workDays.filter((d) =>
      Number(d.Assignment_ID) === Number(a.Assignment_ID));
    setDraft({
      Assignment_ID: a.Assignment_ID,
      Task_Type_ID: a.Task_Type_ID,
      Team_ID: String(a.Team_ID),
      Span_ID: a.Span_ID ? String(a.Span_ID) : "",
      Start_Date: a.Start_Date,
      End_Date: a.End_Date,
      /* The rule as saved, so reopening a Saturday-working booking does
         not quietly reschedule it as a weekday one. */
      weekend: Object.fromEntries(WEEKEND_PARTS.map((w) => [w.key, !!a[w.key]])),
      plots: parsePlots(a.Plot_Range),
      parts: Object.fromEntries(mineDays.map((d) => [d.Work_Date, d.Part])),
      offDays: Object.fromEntries(mineDays.map((d) => [d.Work_Date, !!d.Off_Site])),

      /* Which plots each day covers, where the days differ (0147). A
         day with none recorded takes the booking's whole range, so a
         booking saved before this existed reopens unchanged. */
      dayPlots: Object.fromEntries(mineDays
        .filter((d) => d.Plot_Range)
        .map((d) => [d.Work_Date, parsePlots(d.Plot_Range)])),
      /* On when any day was saved differing from the rest \u2014 the tick
         box reflects what was saved rather than resetting each time. */
      byDay: mineDays.some((d) => d.Plot_Range),

      /* Which utilities this booking covers, and whether it is split at
         all. Empty means the whole call-off's, which is the ordinary
         case and what every existing booking is. */
      utility_ids: (assignmentUtils.get(Number(a.Assignment_ID)) || []).slice(),
      byUtility: (assignmentUtils.get(Number(a.Assignment_ID)) || []).length > 0,
    });
    setEditing(a.Assignment_ID);
    setOpenPhase(a.Task_Type_ID);
    setError("");
  }

  /* The end date a run of this length needs, from the estimate saved on
     the call-off when it was raised (0159).

     Per run where one is chosen and the whole call-off where none is,
     which is what "All spans" means. A run the drawing could not answer
     for returns nothing rather than a date — the field stays empty, and
     empty says nobody knows.

     Only for the excavation and lay: a jointing booking is not the
     trenching, and giving it the trenching's length would put a
     fortnight against half a day's work. */
  const halvesForSpan = useCallback((d, spanId) => {
    const phaseType = (phases || [])
      .find((t) => Number(t.Task_Type_ID) === Number(d?.Task_Type_ID));

    /* Jointing on a service call-off is counted, not measured: one plot
       is one connection and a connection takes about two hours. Twelve
       plots is three days, where the trench length says nothing about
       it.

       Service call-offs only. A mains call-off's jointing is tees and
       live insertions, which does not follow from a plot count — a
       mains run may serve no plots at all — and nobody has given a
       figure for it. So nothing is estimated there and the end date
       stays empty, which says nobody knows. */
    if (isJointTask(phaseType)) {
      if (row.Selection_Mode !== "PlotList") return null;
      const est = jointEstimate({ plots: (row.items || []).length });
      return est.ok ? est.halfDays : null;
    }

    if (!isDigTask(phaseType)) return null;

    const halves = spanId
      ? (row.items || [])
        .find((it) => Number(it.Span_ID) === Number(spanId))?.Estimated_Half_Days
      : row.Estimated_Half_Days;

    return Number(halves) > 0 ? Math.ceil(Number(halves)) : null;
  }, [phases, row]);

  const endForSpan = useCallback((d, spanId) => {
    const start = d?.Start_Date;
    if (!start) return null;
    return endAfterHalves(start, halvesForSpan(d, spanId), {});
  }, [halvesForSpan]);

  function openFor(phase) {
    const floor = floorFor(phase.Task_Type_ID, mine, plotUniverse);
    const start = floor?.date || row.Preferred_Date || "";
    /* The first run nobody is on yet, worked out below — the end date
       has to be for that run and not for the whole call-off, or a form
       that opens on one run of six shows the length of all six. */
    const openSpan = (() => {
      if (row.Selection_Mode !== "Span") return "";
      const onPhase = mine.filter((a) =>
        Number(a.Task_Type_ID) === Number(phase.Task_Type_ID));
      const taken = new Set(onPhase
        .filter((a) => a.Span_ID != null)
        .map((a) => Number(a.Span_ID)));
      if (!taken.size) return "";
      const free = (row.items || [])
        .find((it) => !taken.has(Number(it.Span_ID)));
      return free ? String(free.Span_ID) : "";
    })();
    const defaultEnd = endForSpan(
      { Start_Date: start, Task_Type_ID: phase.Task_Type_ID }, openSpan,
    ) || "";

    setDraft({
      Task_Type_ID: phase.Task_Type_ID,
      Team_ID: "",
      /* The first run nobody is on yet.

         Blank — the whole call-off — is only right where nothing is
         assigned. Once one run has a team, opening the form on "all
         spans" offers something that would overlap, and somebody has to
         notice and change it before anything else works. */
      Span_ID: openSpan,
      /* Defaulted to the earliest it may start — the preferred date, or
         later if an earlier phase pushes it. */
      Start_Date: floor?.date || row.Preferred_Date || "",
      /* And long enough to do the work.

         From the dig estimate saved on the call-off when it was raised
         (0159), laid out half by half around weekends — four half-days
         from a Friday finish on the Monday, which adding days to a date
         would get wrong.

         Only for the excavation and lay. A jointing or reinstatement
         booking is not the trenching, and giving it the trenching's
         length would put a fortnight against half a day's work.

         Left empty where there is no estimate: a call-off raised before
         this existed, or one whose ends are not all on the trench
         network. Empty says nobody knows; defaulting it to the start
         date would say the work takes no time.

         A default, not a decision — the field is still a date picker
         and the planner changes it where the estimate is wrong. */
      End_Date: defaultEnd,
      /* What was defaulted, so changing the run can tell a date the
         form put there from one somebody typed. Not saved — both exist
         for as long as the form is open. */
      autoEnd: defaultEnd,
      /* And in halves, which is what the day rows are laid from. A day
         and a half is two rows, the second of them an AM — a length the
         end date alone cannot express. */
      autoHalves: halvesForSpan(
        { Start_Date: start, Task_Type_ID: phase.Task_Type_ID }, openSpan,
      ),
      /* The plots not already taken by another team on this phase.

         A call-off split three and three should open the second
         assignment with the remaining three already chosen, rather than
         with all six and two of them refused. */
      plots: plotUniverse.filter((pl) =>
        !takenFor(phase.Task_Type_ID).has(pl)),
      /* No weekend working unless somebody ticks it. The common case,
         and the safe default: a booking that quietly put a gang on a
         Sunday would be found by the gang. */
      weekend: {},
      /* Marked full and on site unless somebody says otherwise. */
      parts: {},
      offDays: {},

      /* Both splits off to begin with. The same plots every day and the
         whole call-off's utilities is what most bookings are, and a
         form that opens already split asks two questions nobody had. */
      byDay: false,
      dayPlots: {},
      byUtility: false,
      utility_ids: [],
    });
    setEditing(null);
    setOpenPhase(phase.Task_Type_ID);
    setError("");
  }

  /* What the booking as a whole covers.

     Where the days carry their own plots, it is everything they cover
     between them — the bottom picker is hidden then, so nothing else
     is saying it. Falls back to that picker otherwise.

     One definition, read by the save and by the validation below, so
     they cannot disagree about whether a booking has any plots on it. */
  /* Plots another team holds for this phase, against a set of
     utilities. Laying the gas does not take a plot for the electric.

     `forUtilities` defaults to what the draft covers; the utility pills
     pass their own, to ask "would anything be left if I picked this?"

     One definition because six places ask, and six copies is six
     chances for one to forget the utilities and disable plots that are
     free. */
  /* What a phase is called, for the rules that go by name. */
  const phaseOf = (taskTypeId) => phases
    .find((p) => Number(p.Task_Type_ID) === Number(taskTypeId))?.Task_Type_Name || "";

  const takenFor = (taskTypeId, exceptId = null, opts = {}) => {
    const { named = false, forUtilities = null } = opts;
    return takenPlots(
      mine, taskTypeId, exceptId,
      named ? ((id) => teamName(id)) : (() => null),
      {
        utilitiesOf: (a) => assignmentUtils.get(Number(a.Assignment_ID)) || [],
        mine: forUtilities ?? (draft.byUtility ? (draft.utility_ids || []) : []),
      },
    );
  };

  /* Different plots each day, and there is more than one day. The tick
     is hidden on a one-day booking, but the flag survives from when the
     dates were wider. Derived once so the form, the validation and the
     save take the same view. */
  const splitByDay = !!draft.byDay && schedule.days.length > 1;

  /* Booked against estimated.

     The estimate is the half-days the drawing gave this run (0159); the
     booking is the day parts somebody has ticked. They are allowed to
     differ — a gang may be given the morning and the rest handed to
     another team, or picked up later in the week — but the difference
     should be said rather than discovered on site.

     Only where there is an estimate to compare against. A call-off
     raised before 0159, or one whose ends are not both on the trench
     network, has none — and a warning that fires on every one of those
     is a warning nobody reads. */
  const shortfall = useMemo(() => {
    if (editing == null && !draft.Start_Date) return null;
    const halves = halvesForSpan(draft, draft.Span_ID);
    if (!(halves > 0) || !schedule.days.length) return null;

    const booked = dayTotal(Object.fromEntries(schedule.days
      .map((x) => [x.date, partFor(x, draft)])));
    const needed = halves / 2;
    if (booked >= needed) return null;
    return { booked, needed, short: Math.round((needed - booked) * 10) / 10 };
  }, [draft, schedule.days, halvesForSpan, editing]);

  /* The days a booking works, each with how much of it.

     Never "10 Aug to 12 Aug". A range says a gang is on site
     continuously between two dates, and a booking that is a Monday
     morning and a Wednesday afternoon is not that \u2014 it reads as three
     days of work when it is one.

     "(Full day)" only where the days differ. Beside an "(AM)" it is
     needed, or the bare date reads as an omission; where every day is
     the same it is noise on every one of them.

     No day rows \u2014 a booking made before they existed \u2014 falls back to
     the dates it spans, still listed rather than ranged. */
  const daysOf = (a) => {
    const rows = workDays
      .filter((d) => Number(d.Assignment_ID) === Number(a.Assignment_ID))
      .sort((x, y) => String(x.Work_Date).localeCompare(String(y.Work_Date)));

    if (!rows.length) {
      const out = [];
      for (let t = new Date(a.Start_Date); t <= new Date(a.End_Date);
        t.setDate(t.getDate() + 1)) {
        out.push({ date: t.toISOString().slice(0, 10), part: null });
      }
      return out;
    }

    const parts = new Set(rows.map((d) => d.Part || "Full"));
    const mixed = parts.size > 1;
    return rows.map((d) => {
      const part = d.Part === "AM" || d.Part === "PM" ? d.Part : "Full day";
      return {
        date: d.Work_Date,
        part: mixed || part !== "Full day" ? part : null,
        plots: d.Plot_Range || null,
      };
    });
  };

  const whenOf = (a) => daysOf(a)
    .map((d) => fmt(d.date) + (d.part ? ` (${d.part})` : ""))
    .join(", ");

  /* What a booking covers, named the way the split control names it. */
  const utilityLabel = (a) => {
    const ids = assignmentUtils.get(Number(a.Assignment_ID)) || [];
    if (!ids.length) return null;
    return utils.filter((u) => ids.includes(Number(u.Utility_ID)))
      .map((u) => u.Utility).join(" / ");
  };

  /* What a booking comes to, day by day \u2014 only where the days differ,
     or it would repeat the row above it. */
  const breakdownOf = (a) => workDays
    .filter((d) => Number(d.Assignment_ID) === Number(a.Assignment_ID))
    .filter((d) => d.Plot_Range)
    .sort((x, y) => String(x.Work_Date).localeCompare(String(y.Work_Date)))
    .map((d) => ({
      key: `${a.Assignment_ID}-${d.Work_Date}`,
      when: fmt(d.Work_Date),
      /* Named, including the full ones. "11-Aug-2026" beside
         "10-Aug-2026 (AM)" reads as an omission rather than as a full
         day \u2014 the reader has to know the convention to see it. */
      part: null,   /* set from daysOf below */
      plots: serialisePlots(parsePlots(d.Plot_Range)),
    }));

  const bookingPlots = splitByDay
    ? [...new Set(Object.values(draft.dayPlots || {}).flat())]
      .sort((a, b) => Number(a) - Number(b))
    : (draft.plots || []);

  /* Which day of this booking already holds each plot.

     Derived once for the whole grid rather than per pill: every day
     redraws every plot, so a six-plot booking over three days asks the
     question eighteen times and the answer is the same each time.

     Empty unless the days carry their own plots — the pills are not on
     screen otherwise, and building it from a stale `dayPlots` would
     mean a tick somebody unticked still greying things out. */
  const dayPlotOwner = splitByDay
    ? plotDayOwner(draft.dayPlots || {})
    : new Map();

  /* A mains call-off divides spans, not plots, so the plot rule does not
     apply to it — requiring at least one plot would make every mains
     assignment impossible to save. */
  const problems = openPhase != null
    ? checkAssignment({
      ...draft,
      Plot_Range: row.Selection_Mode === "Span"
        ? "n/a" : serialisePlots(bookingPlots),
    }, {
      phases, assignments: all, today: new Date().toISOString().slice(0, 10),
      /* So a booking for the electric is not refused the plots the gas
         booking holds. */
      utilitiesOf: (a) => assignmentUtils.get(Number(a.Assignment_ID)) || [],
      utilities: draft.byUtility ? (draft.utility_ids || []) : [],
      /* The per-day plots, and only where the days actually carry their
         own. `bookingPlots` above folds them into a set, so by the time
         the draft reaches the rule a plot ticked on two days looks
         exactly like a plot ticked on one — the duplicate has to be
         handed over separately or it cannot be seen at all. */
      dayPlots: splitByDay ? (draft.dayPlots || {}) : null,
      /* So a Sunday nobody is on site for is not tested for clashes. */
      exceptId: editing,
      /* So a clash is checked half-day by half-day: a gang doing one
         span in the morning can do another in the afternoon. */
      workDays,
      /* The start this assignment already had, so an unchanged past date
         is not treated as a typo. */
      wasStart: editing != null
        ? all.find((x) => Number(x.Assignment_ID) === Number(editing))?.Start_Date
        : null,
    })
    : [];

  /* ── Out of order ──

     The same check the planning board applies, on the same rules, so
     the two screens refuse the same arrangements. Jointing cannot be
     saved to start before the dig on its own call-off has finished, and
     it does not matter which screen somebody reaches for.

     Run against the call-off's assignments with the draft standing in
     for the one being edited — the question is about the schedule that
     would exist once this is saved, not the one on screen now. A new
     assignment is appended rather than replacing anything.

     Empty where 0134 has not been run and there are no rules, which is
     the honest answer: nothing has been said about what follows what. */
  const orderProblems = openPhase != null && dependencies.length
    ? dependencyProblems(
      [
        ...all.filter((a) => Number(a.Submission_ID) === Number(row.Submission_ID)
          && Number(a.Assignment_ID) !== Number(editing)),
        {
          Assignment_ID: editing ?? -1,
          Submission_ID: row.Submission_ID,
          Task_Type_ID: openPhase,
          Start_Date: draft.Start_Date,
          End_Date: schedule.end || draft.End_Date,
        },
      ],
      {
        dependencies,
        dependencyTypes,
        taskTypes: phases,
        submissions: [row],
        workDays,
      },
    )
    : [];

  const allProblems = [...problems, ...orderProblems];

  /* The floor for the phase currently open in the editor, so the start
     picker can refuse anything earlier. The same answer the phase
     header shows above it. */
  const openFloor = openPhase != null
    ? floorFor(openPhase,
      all.filter((a) => Number(a.Submission_ID) === Number(row.Submission_ID)),
      plotUniverse)
    : null;

  async function save() {
    /* Asked once, and only where it applies.

       The panel above says it already; this is the point at which
       ignoring it becomes a decision. Both answers are legitimate — the
       rest of the work may genuinely be somebody else's — so the
       question names them rather than warning and refusing. */
    if (shortfall && !window.confirm(
      `This booking is ${shortfall.short} day`
      + `${shortfall.short === 1 ? "" : "s"} short of the estimate.\n\n`
      + "OK to save it as it is \u2014 the rest can go to another team or "
      + "another day.\n\nCancel to go back and change the days."
    )) return;

    if (allProblems.length) {
      /* Said out loud. Returning quietly is what made a disabled button
         and an ignored click indistinguishable. */
      setError(allProblems[0]);
      return;
    }
    setSaidSaved("");
    setBusy("save");
    try {
      const payload = {
        Submission_ID: row.Submission_ID,
        Task_Type_ID: draft.Task_Type_ID,
        Team_ID: Number(draft.Team_ID),
        Span_ID: draft.Span_ID ? Number(draft.Span_ID) : null,
        Start_Date: draft.Start_Date,
        /* The end the schedule arrived at, not the one that was typed.
           Where the weekend pushed the job out, those are different,
           and the one that matches the days is the one worth storing. */
        End_Date: schedule.end || draft.End_Date,
        ...Object.fromEntries(WEEKEND_PARTS
          .map((w) => [w.key, !!draft.weekend?.[w.key]])),
        /* A mains assignment covers the spans the call-off names, so
           there is nothing to record here. */
        Plot_Range: row.Selection_Mode === "Span"
          ? null : (serialisePlots(bookingPlots) || null),
      };

      let saved;
      if (editing != null) {
        saved = await adminUpdate("Call_Off_Assignment", editing, payload);
        saved = { ...saved, Assignment_ID: editing };
        setAll((xs) => xs.map((a) =>
          Number(a.Assignment_ID) === Number(editing) ? { ...a, ...payload } : a));
      } else {
        saved = await adminCreate("Call_Off_Assignment", payload);
        setAll((xs) => [...xs, saved]);
      }

      /* The days, rewritten rather than patched.

         The range can change — a booking shortened by two days leaves
         two rows that no longer belong to it — and working out which to
         add, change and remove is three operations where one will do.
         The table is a handful of rows per assignment. */
      const id = saved.Assignment_ID;
      const old = workDays.filter((d) => Number(d.Assignment_ID) === Number(id));
      /* The days the schedule laid, so a weekend nobody works gets no
         row — which is what makes the board draw a gap there and the
         work instruction leave it out. */
      const days = schedule.days;
      try {
        for (const d of old) await adminDelete("Call_Off_Work_Day", d.Work_Day_ID);
        const made = [];
        for (const d of days) {
          made.push(await adminCreate("Call_Off_Work_Day", {
            Assignment_ID: id,
            Work_Date: d.date,
            Part: partFor(d, draft),
            Off_Site: !!draft.offDays?.[d.date],
            /* Which plots this day covers, only where the days differ.
               Null otherwise, which means the booking's whole range \u2014
               writing the same list against every day would turn one
               fact into five that can fall out of step. */
            Plot_Range: splitByDay
              ? ((draft.dayPlots?.[d.date] || []).join(", ") || null)
              : null,
          }));
        }
        setWorkDays((xs) => [
          ...xs.filter((x) => Number(x.Assignment_ID) !== Number(id)),
          ...made,
        ]);
      } catch (dayErr) {
        setError(`Saved, but the day breakdown failed: ${dayErr.message}`);
      }

      /* Which utilities this booking covers. Cleared and rewritten, the
         same as the days: a handful of rows, and three operations to
         work out what changed is more code than doing it again. */
      try {
        for (const r of assignmentUtilRows
          .filter((r) => Number(r.Assignment_ID) === Number(id))) {
          await adminDelete("Call_Off_Assignment_Utility", r.Assignment_Utility_ID);
        }
        const madeUtils = [];
        /* And not on reinstatement, whatever the flag says.

           The tick is hidden there, so a booking whose phase changed —
           or one saved before the rule existed — could carry a split
           with no control left to clear it. Written from the rule
           rather than from the flag, so the two cannot disagree. */
        if (draft.byUtility && splitsByUtility(phaseOf(draft.Task_Type_ID))) {
          for (const uid of [...new Set((draft.utility_ids || []).map(Number))]) {
            madeUtils.push(await adminCreate("Call_Off_Assignment_Utility", {
              Assignment_ID: id, Utility_ID: uid,
            }));
          }
        }
        setAssignmentUtilRows((xs) => [
          ...xs.filter((x) => Number(x.Assignment_ID) !== Number(id)),
          ...madeUtils,
        ]);
      } catch (uErr) {
        setError(`Saved, but the utility split failed: ${uErr.message}`);
      }

      setSaidSaved(editing != null ? "Assignment updated." : "Assignment added.");
      setTimeout(() => setSaidSaved(""), 5000);
      setOpenPhase(null);
      setEditing(null);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function remove(id) {
    if (!window.confirm("Delete this assignment and its days?")) return;
    setBusy(`d:${id}`);
    try {
      /* The days first: the cascade should take them, but it is added
         guardedly in the migration and may not be there. Deleting them
         explicitly means no orphans either way. */
      for (const d of workDays.filter((x) =>
        Number(x.Assignment_ID) === Number(id))) {
        await adminDelete("Call_Off_Work_Day", d.Work_Day_ID).catch(() => {});
      }
      await adminDelete("Call_Off_Assignment", id);
      setWorkDays((xs) => xs.filter((x) => Number(x.Assignment_ID) !== Number(id)));
      setAll((xs) => xs.filter((a) => a.Assignment_ID !== id));
      if (editing === id) { setEditing(null); setOpenPhase(null); }
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  if (!row.Work_Type_ID) {
    return (
      <div className="co-card co-todo">
        <h3>Team assignments</h3>
        <p>No work type on this call-off, so there are no phases to assign to.</p>
      </div>
    );
  }

  if (!phases.length) {
    return (
      <div className="co-card co-todo">
        <h3>Team assignments</h3>
        <p>
          This work type has no phases mapped. Set them under
          {" "}<strong>Admin &rarr; Work Phases</strong>.
        </p>
      </div>
    );
  }

  /* An electric service is laid in the trench the mains call-off dug,
     and the ground is reinstated once for the street rather than plot
     by plot. So those two sections are not booked here.

     Filtered rather than taken off the work type: the same mapping
     drives the schedule and the cover states, and other utilities do
     dig for their services. */
  const shownPhases = phasesToShow(phases, row.Work_Type?.Work_Type_Name);
  const notHere = phasesHidden(phases, row.Work_Type?.Work_Type_Name);

  return (
    <div className="co-card">
      <h3>
        Team assignments
        <span className="co-dim">
          {` \u00b7 ${mine.length} across ${shownPhases.length} phase${shownPhases.length === 1 ? "" : "s"}`}
        </span>
      </h3>
      <p className="hint">
        Several teams can work one phase in parallel &mdash; Team A on the
        first plots, Team B on the rest. Teams are those holding the
        craft the phase needs.
      </p>

      {/* Said once, rather than two sections quietly missing.

          A section that disappears reads as something broken to
          whoever knew it was there and as nothing at all to whoever
          did not — and the fact it carries, that the dig belongs to
          the mains call-off, is what a planner needs to know. */}
      {notHere.length > 0 && (
        <p className="hint">
          {notHere.map((p) => shortPhase(p.Task_Type_Name)).join(" and ")}
          {notHere.length === 1 ? " is" : " are"} booked on the mains call-off,
          not here &mdash; an electric service is laid in the trench the mains
          gang dug.
        </p>
      )}

      {error && <p className="co-err">{error}</p>}

      {shownPhases.map((ph, i) => {
        const rows = mine.filter((a) =>
          Number(a.Task_Type_ID) === Number(ph.Task_Type_ID));
        /* Teams holding the craft this phase needs, in the region the
           project is in.

           The region comes from the project rather than the call-off: a
           gang covers the North West, and which call-off it is working
           does not change that.

           Where the project has no region the filter is not applied.
           Leaving every team ineligible because a project record is
           incomplete would look like a fault in the teams. */
        /* Teams with nothing free across the whole booking are dropped
           from the list.

           A team booked solid every day of the range cannot take it,
           and offering it means finding that out on save. Where the
           dates are not set yet nothing is dropped — there is no range
           to be busy across. */
        const busyAcross = (t) => {
          if (!draft.Start_Date || !draft.End_Date) return false;
          const taken = bookedParts(t.Team_ID, all, workDays, editing);
          /* The days the booking actually falls on. A weekend it does
             not work cannot make a team busy, and counting it would
             drop teams from the list for being unavailable on a day
             nobody is asking them for. */
          const days = schedule.days.map((x) => x.date);
          if (!days.length) return false;
          /* Any, not every. A team already out on the Tuesday cannot
             take a Monday-to-Wednesday job, even though it is free on
             two of the three. Asking whether it was busy for the whole
             stretch let a half-available team be picked and refused on
             save. */
          return days.some((d) => !partIsFree(taken.get(d), "AM")
            || !partIsFree(taken.get(d), "PM"));
        };

        /* Mains or service, from the call-off's work type. It decides
           which of the Excavation & Lay crafts applies.

           Off the row, which already carries it \u2014 there is no
           workTypes list in this component, and reaching for one that
           does not exist would have thrown the moment a phase rendered. */
        const workTypeName = row.Work_Type?.Work_Type_Name || "";

        const can = eligibleTeams(teams, {
          teamCrafts, teamRegions,
          craftId: ph.Craft_ID,
          regionId: row.Region_ID ?? null,
          /* The three facts a craft is matched on (0151). Task_Type
             could name only one craft, so "Excavation & Lay" matched
             nothing and every team was offered. */
          crafts, craftUtilities,
          taskTypeId: ph.Task_Type_ID,
          scope: /service/i.test(workTypeName || "") ? "service"
            : /main/i.test(workTypeName || "") ? "mains" : null,
          /* What this booking covers: the utilities chosen where the
             phase is split, otherwise the call-off's own. An Electric
             Only gang is refused the whole of an E/G call-off and
             offered the electric half of it. */
          utilityIds: draft.byUtility && (draft.utility_ids || []).length
            ? draft.utility_ids
            : (row.utility_ids || []),
        });
        const floor = floorFor(ph.Task_Type_ID, mine, plotUniverse, null);

        return (
          <div className="asg-phase" key={ph.Task_Type_ID}>
            <div className="asg-head">
              <span className="asg-n">{i + 1}</span>
              <strong>{ph.Task_Type_Name}</strong>
              {/* How many teams can take this phase.

                  It used to open with "any craft in this region", which
                  read as a setting rather than as "nothing restricts
                  it" — and the region part repeated on every phase of
                  every call-off, saying the same thing each time.

                  Where a craft is genuinely required that is worth
                  saying, because it explains a short list. Where none
                  is, the count says everything there is to say. */}
              <span className="asg-craft">
                {ph.Craft_ID
                  ? `needs ${craftName(ph.Craft_ID) ?? "a craft"} \u00b7 `
                  : ""}
                {`${can.length} team${can.length === 1 ? "" : "s"}`}
              </span>
              {(() => {
                /* Nothing left to assign on this phase: said on the
                   button rather than found after opening the form. */
                const taken = new Set(rows
                  .filter((a) => a.Span_ID != null)
                  .map((a) => Number(a.Span_ID)));
                const allTaken = row.Selection_Mode === "Span"
                  && (row.items?.length ?? 0) > 0
                  && (row.items || []).every((it) => taken.has(Number(it.Span_ID)));
                return (
                  <button className="btn accent sm"
                    disabled={!can.length || allTaken}
                    title={allTaken ? "Every span on this phase is assigned" : ""}
                    onClick={() => openFor(ph)}>
                    {allTaken ? "All assigned" : "+ Assign"}
                  </button>
                );
              })()}
            </div>

            {/* Why a phase cannot start yet — before somebody tries.

                Only while nothing is booked on it. Once a team is
                assigned the note has done its work: it is telling
                somebody about a constraint on a decision they have
                already made, and it sat there for the rest of the
                call-off's life saying so. */}
            {floor && !mine.some((a) =>
              Number(a.Task_Type_ID) === Number(ph.Task_Type_ID)) && (
              <p className="asg-floor">
                {/* The reason where the rules gave one — "Excavation
                    and Lay finishes on 18-Aug" — and the older
                    order-based wording where they did not. The two say
                    different things and should not be made to sound
                    alike: one is a rule somebody stated, the other is a
                    guess from the order phases are listed in. */}
                {floor.why
                  ? `Cannot start before ${fmt(floor.date)} \u2014 ${floor.why
                    .replace(/(\d{4}-\d{2}-\d{2})/, (m) => fmt(m))}.`
                  : `Cannot start before ${fmt(floor.date)} \u2014 ${floor.phase} begins then.`}
              </p>
            )}

            {/* Which of the two conditions failed, because they have
                different fixes: give a team the craft, or give it the
                region. "No teams available" would be neither. */}
            {!can.length && (
              <p className="asg-none warn">
                {ph.Craft_ID && row.Region_ID
                  ? `No active team holds ${craftName(ph.Craft_ID) ?? "this craft"} in this region.`
                  : ph.Craft_ID
                    ? `No active team holds ${craftName(ph.Craft_ID) ?? "this craft"}.`
                    : row.Region_ID
                      ? "No active team covers this region."
                      : "No active teams."}
              </p>
            )}

            {!rows.length && can.length > 0 && (
              <p className="asg-none">Nobody assigned yet.</p>
            )}

            {rows.map((a) => (
              <div className="asg-wrap" key={a.Assignment_ID}>
              <div className="asg-row">
                <span className="asg-team">{teamName(a.Team_ID)}</span>
                <span className="asg-when">{whenOf(a)}</span>

                {/* What is being done, beside when it is being done.

                    These belong together: the plots and the dates are
                    one statement — these plots, on these days — and the
                    status is a different one. With the plots after the
                    status the row read as two halves of a sentence with
                    somebody else's sentence in the middle. */}
                <span className="asg-plots">
                  {row.Selection_Mode === "Span"
                    ? (row.items || []).find((it) =>
                      Number(it.Span_ID) === Number(a.Span_ID))?.Plots
                      ?? "all spans"
                    : (a.Plot_Range ? `Plots ${a.Plot_Range}` : "all plots")}
                </span>

                {/* Which utilities this booking is for. On the row
                    because a one-day booking has no day lines to carry
                    it and was saying nothing about what it was for. */}
                {utilityLabel(a) && (
                  <span className="asg-util-tag">{utilityLabel(a)}</span>
                )}

                {/* How much of it there is.

                    Whole metres. The drawing measures to a tenth, which
                    is precision a schedule cannot use — "123.4m" of
                    trench to a team with a digger says nothing "123m"
                    does not, and reads as though somebody measured it.

                    Nothing at all where there is no length recorded,
                    rather than "(0m)": a call-off item whose length was
                    never filled in is not a zero-metre dig, and the
                    items table above already shows the dash. */}
                {(() => {
                  const m = metresFor(a);
                  if (!m) return null;
                  return (
                    <span className="asg-len"
                      title={a.Span_ID != null
                        ? "Length of this span"
                        : "Total length of the spans on this call-off"}>
                      ({Math.round(m)}m)
                    </span>
                  );
                })()}

                {/* Where this team's work has got to.

                    A select rather than a pill with a menu behind it:
                    it is one control, it opens on a tap, it works from
                    the keyboard, and it cannot get out of step with the
                    list of statuses because it is drawn from it. The
                    colour comes from the status, so the row reads at a
                    glance across a phase with four teams on it. */}
                {statuses.length > 0 && (
                  <label className="asg-status"
                    style={pillStyle(
                      statuses.find((x) => x.Status_Name === a.Status)?.Colour,
                      statuses.find((x) => x.Status_Name === a.Status)?.Text_Colour)}>
                    <span className="sr-only">Status</span>
                    <select value={a.Status ?? ""}
                      disabled={busy === `s:${a.Assignment_ID}`}
                      onChange={(e) => moveStatus(a, e.target.value)}>
                      {/* A status that is no longer active, or was
                          renamed under the row's feet, still has to
                          appear or the select would silently show the
                          wrong one. */}
                      {a.Status && !statuses.some((x) => x.Status_Name === a.Status) && (
                        <option value={a.Status}>{a.Status}</option>
                      )}
                      {statuses.map((x) => (
                        <option key={x.Call_Off_Status_ID} value={x.Status_Name}>
                          {x.Status_Name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {/* Off site, from the span this assignment covers.

                    A property of the trench, not of the day: a length
                    dug through an adopted road is off site whoever turns
                    up and whenever they do. Ticked automatically, since
                    the drawing already knows and asking somebody to
                    remember is how it gets missed. */}
                {(() => {
                  const span = (row.items || []).find((it) =>
                    Number(it.Span_ID) === Number(a.Span_ID));
                  /* With no span named the assignment covers the whole
                     call-off, so any off-site run in it counts. */
                  const off = span
                    ? span.Off_Site
                    : (row.items || []).some((it) => it.Off_Site);
                  return off
                    ? <span className="asg-off-tag">&#10003; Off site</span>
                    : null;
                })()}
                <button className="btn edit sm"
                  onClick={() => editFor(a)}>Edit</button>
                <button className="btn delete sm"
                  disabled={busy === `d:${a.Assignment_ID}`}
                  onClick={() => remove(a.Assignment_ID)}>Delete</button>
              </div>

              {/* What it comes to, day by day. */}
              {breakdownOf(a).map((b) => (
                <div className="asg-break" key={b.key}>
                  <span className="asg-break-when">
                    {b.when}
                  </span>
                  <span className="asg-break-plots">Plots {b.plots}</span>
                </div>
              ))}
              </div>
            ))}

            {openPhase === ph.Task_Type_ID && (
              <div className="asg-form">
                {/* One row, each control the width of what goes in it.

                    They were full-width blocks stacked down the panel: a
                    date field a thousand pixels wide to hold ten
                    characters, and a form four times taller than it
                    needed to be. */}
                <div className="asg-line">
                  {/* Which run, where there is more than one.

                      A call-off with a single run has nothing to
                      choose, and a dropdown of one is furniture. */}
                  {row.Selection_Mode === "Span" && (row.items?.length ?? 0) > 1 && (
                    <select className="asg-span-sel" value={draft.Span_ID}
                      aria-label="Span"
                      onChange={(e) => setDraft((d2) => ({
                        ...d2,
                        Span_ID: e.target.value,
                        /* And the end date with it. Picking one run out
                           of six should not leave a booking the length
                           of all six sitting in the date box — that is
                           the number a planner would accept without
                           reading, having just told the form it is
                           doing a sixth of the work.

                           Only while the default is still standing. A
                           date somebody has typed is theirs, and moving
                           it because the run changed would throw away a
                           decision to make a point about arithmetic. */
                        End_Date: d2.End_Date && d2.End_Date !== d2.autoEnd
                          ? d2.End_Date
                          : (endForSpan(d2, e.target.value) ?? ""),
                        autoEnd: endForSpan(d2, e.target.value) ?? "",
                        autoHalves: halvesForSpan(d2, e.target.value),
                      }))}>
                      {/* Spans nobody is on yet.

                          A run already assigned on this phase is not
                          available on it again — offering it means
                          picking it, filling in the dates and being
                          refused, when the answer was known before the
                          dropdown opened.

                          Per phase, not per call-off: the same run is
                          excavated, jointed and reinstated, by
                          different gangs at different times. */}
                      {(() => {
                        const taken = new Set(rows
                          .filter((x) => x.Span_ID != null)
                          .filter((x) => editing == null
                            || Number(x.Assignment_ID) !== Number(editing))
                          .map((x) => Number(x.Span_ID)));

                        const free = (row.items || [])
                          .filter((it) => !taken.has(Number(it.Span_ID)));

                        return (
                          <>
                            {/* "All spans" only where nothing is taken.
                                Once one run has a team on it, an
                                assignment covering everything would
                                overlap it. */}
                            {/* How long each run takes, on the option
                                itself.

                                The choice being made here is which runs
                                go to which team, and that cannot be
                                made from the run's name alone — "Plot
                                12 to Plot 16" says nothing about
                                whether it is an afternoon or a
                                fortnight. Putting it in the dropdown
                                puts it where the decision happens,
                                rather than a field away from it.

                                Left off where the drawing could not
                                answer for a run: a silent option among
                                labelled ones reads as unknown, which is
                                what it is, and "0 days" would read as
                                nothing to do. */}
                            {!taken.size && (
                              <option value="">
                                {`All spans${row.Estimated_Half_Days
                                  ? ` \u2014 ${halfDaysText(row.Estimated_Half_Days)}` : ""}`}
                              </option>
                            )}
                            {free.map((it) => (
                              <option key={it.Span_ID} value={it.Span_ID}>
                                {`${it.Plots}${it.Estimated_Half_Days
                                  ? ` \u2014 ${halfDaysText(it.Estimated_Half_Days)}` : ""}`}
                              </option>
                            ))}
                            {!free.length && (
                              <option value="" disabled>
                                Every span on this phase is assigned
                              </option>
                            )}
                          </>
                        );
                      })()}
                    </select>
                  )}
                  {/* ── Moving the start moves the end ──

                      A booking has a length, and changing when it
                      begins does not change how long it takes. Somebody
                      pushing the start back a week means the whole
                      thing a week later, not a booking that has
                      silently grown by a week — which is what happens
                      when only one of the two dates is touched, and it
                      is the kind of error that is only found when a
                      gang is still on site on the Friday.

                      The end can still be set on its own; that is what
                      changes the length. */}
                  <input className="asg-date" type="date" value={draft.Start_Date}
                    aria-label="Start date"
                    /* Nothing in the past. A booking cannot be made for
                       a day that has gone, and a picker that offers one
                       is a picker that will be used. */
                    /* Nothing in the past, and nothing before the phase
                       this one depends on allows. Both are floors and
                       the later of the two applies — a picker that
                       offers a date the form will refuse is a picker
                       that wastes somebody's time twice. */
                    min={maxDate(todayISO(), openFloor?.date)}
                    onChange={(e) => setDraft((d) => ({
                      ...d,
                      Start_Date: e.target.value,
                      End_Date: slideEnd(d.Start_Date, d.End_Date, e.target.value),
                      /* Slid with it, so a booking moved a week later is
                         still recognised as one the form put there
                         rather than one somebody typed. Where the
                         estimate is driving, the effect below then
                         corrects both to the day the work actually
                         finishes. */
                      autoEnd: d.autoEnd
                        ? slideEnd(d.Start_Date, d.autoEnd, e.target.value)
                        : d.autoEnd,
                    }))} />
                  <span className="asg-to">to</span>
                  <input className="asg-date" type="date" value={draft.End_Date}
                    aria-label="End date"
                    /* Never before it starts. Disabling the earlier days
                       says so in the picker, where somebody is looking,
                       rather than in a message after they have chosen. */
                    min={draft.Start_Date || todayISO()}
                    onChange={(e) => setDraft((d) => ({ ...d, End_Date: e.target.value }))} />

                  {/* Who, after when.

                      The dates decide which teams there are to choose
                      from, so asking for a team first is asking a
                      question whose answer changes as soon as the next
                      one is answered. Disabled until both dates are in,
                      and then listing only teams free on all of them. */}
                  <select className="asg-team-sel" value={draft.Team_ID}
                    aria-label="Team"
                    disabled={!draft.Start_Date || !draft.End_Date}
                    onChange={(e) => setDraft((d) => ({ ...d, Team_ID: e.target.value }))}>
                    <option value="">
                      {!draft.Start_Date || !draft.End_Date
                        ? "Dates first\u2026" : "Team\u2026"}
                    </option>
                    {(() => {
                      const free = can.filter((t) => !busyAcross(t));
                      /* The team already on this booking stays listed
                         while it is being edited, or reopening it would
                         show an empty box where a team is. */
                      const held = editing != null
                        ? can.filter((t) => Number(t.Team_ID) === Number(draft.Team_ID)
                          && !free.some((f) => Number(f.Team_ID) === Number(t.Team_ID)))
                        : [];
                      return [...held, ...free].map((t) => (
                        <option key={t.Team_ID} value={t.Team_ID}>{t.Team_Name}</option>
                      ));
                    })()}
                  </select>

                </div>

                {/* How much of each day, because a gang is not always
                    there all day — half a day here and half at the next
                    site is ordinary, and booking whole days overstates
                    what the team can take on. */}
                {/* ── The weekend ──

                    Offered only where the booking actually meets one.
                    Four toggles on a Tuesday-to-Thursday job are four
                    controls that can do nothing, and a form full of
                    those teaches people to stop reading it.

                    Each half on its own, because that is how it is
                    agreed: a gang in on Saturday morning to finish a
                    joint is not a gang in all weekend. */}
                {spansAWeekend(draft.Start_Date, schedule.end || draft.End_Date) && (
                  <div className="asg-wknd">
                    <strong>Weekend</strong>
                    {WEEKEND_PARTS.map((w) => (
                      <button key={w.key} type="button"
                        className={draft.weekend?.[w.key] ? "asg-part on" : "asg-part"}
                        aria-pressed={!!draft.weekend?.[w.key]}
                        onClick={() => setDraft((dd) => ({
                          ...dd,
                          weekend: { ...(dd.weekend || {}), [w.key]: !dd.weekend?.[w.key] },
                        }))}>
                        {w.label}
                      </button>
                    ))}
                    <span className="asg-wknd-n">
                      {worksAnyWeekend(draft.weekend)
                        ? "Worked as ticked."
                        : "Not worked \u2014 the job carries on the next weekday."}
                    </span>
                  </div>
                )}

                {/* What the weekend did to the end date. Said in words
                    rather than left for somebody to notice that the
                    date they typed is not the date that saved. */}
                {schedule.pushed > 0 && schedule.end && (
                  <p className="asg-pushed">
                    {schedule.pushed} day{schedule.pushed === 1 ? "" : "s"} of weekend in
                    the way, so this finishes on <strong>{fmt(schedule.end)}</strong>.
                  </p>
                )}

                {schedule.days.length > 0 && (
                  <div className="asg-days">
                    <div className="asg-ticks">
                    {/* Four plots over three days is not four plots on
                        all three. Off by default because most bookings
                        do the same plots throughout, and a grid of
                        pills against every day would be four questions
                        where there was one. */}
                    {/* Nothing to divide on a one-day booking, so the
                        tick is not offered: it would be a choice between
                        the same plots every day and different plots each
                        day when there is only one day. */}
                    {row.Selection_Mode !== "Span" && plotUniverse.length > 0
                      && schedule.days.length > 1 && (
                      <label className="asg-byday">
                        <input type="checkbox" checked={!!draft.byDay}
                          onChange={(e) => setDraft((dd) => ({
                            ...dd,
                            byDay: e.target.checked,
                            dayPlots: e.target.checked ? (dd.dayPlots || {}) : {},
                          }))} />
                        Different plots each day
                      </label>
                    )}

                    {/* Not on reinstatement: it puts the ground back and
                        what was laid in it does not matter. */}
                    {splitsByUtility(ph.Task_Type_Name) && (
                      <label className="asg-split-tick">
                        <input type="checkbox" checked={!!draft.byUtility}
                          onChange={(e) => setDraft((d) => ({
                            ...d,
                            byUtility: e.target.checked,
                            utility_ids: e.target.checked ? (d.utility_ids || []) : [],
                          }))} />
                        Split by utility
                      </label>
                    )}
                    </div>

                    <div className="asg-days-head">
                      <strong>Days</strong>
                      <span className="asg-days-tot">
                        {(() => {
                          const parts = Object.fromEntries(schedule.days
                            .map((x) => [x.date, partFor(x, draft)]));
                          const t = dayTotal(parts);
                          return `${t} day${t === 1 ? "" : "s"}`;
                        })()}
                      </span>
                    </div>

                    {/* Where the jointing estimate came from.

                        A number nobody can check is a number somebody
                        overrides on a hunch. "12 plots at 2 hr each"
                        can be argued with, which is the point: if the
                        two hours is wrong for this site, the person
                        reading it is the one who knows. */}
                    {(() => {
                      const phaseType = (phases || []).find((t) =>
                        Number(t.Task_Type_ID) === Number(draft?.Task_Type_ID));
                      if (!isJointTask(phaseType)) return null;
                      if (row.Selection_Mode !== "PlotList") return null;
                      const est = jointEstimate({ plots: (row.items || []).length });
                      if (!est.ok) return null;
                      return <p className="asg-est">{jointEstimateText(est)}</p>;
                    })()}

                    {/* Less time booked than the work is estimated to
                        take.

                        A warning rather than a refusal. Booking half of
                        it is ordinary: the rest may go to another team,
                        or to this one later in the week, and an
                        application insisting on the whole estimate
                        would be wrong more often than right.

                        Beside the pills that caused it, so it can be
                        answered by changing them. */}
                    {shortfall && (
                      <p className="asg-short">
                        {`This is estimated at ${shortfall.needed} day`}
                        {shortfall.needed === 1 ? "" : "s"}
                        {` and you have booked ${shortfall.booked} day`}
                        {/* "1 day" and "1.5 days" — pluralised on the
                            number itself, so a booking of exactly one
                            day does not read "1 days". */}
                        {shortfall.booked === 1 ? "" : "s"}
                        {`, meaning ${shortfall.short} day`}
                        {shortfall.short === 1 ? "" : "s"}
                        {" would be left for another team or another visit."}
                      </p>
                    )}
                    {/* The whole row, not a copy of two of its fields.

                        It rebuilt `{ date, part }` here and handed that
                        to partFor, which reads `fixed` — so `fixed` was
                        always undefined, every half day looked like the
                        weekend rule had set it, and the buttons on the
                        odd half at the end of an estimate did nothing.

                        The flag was added to the rows and threaded
                        through partFor, and this one call site quietly
                        dropped it. */}
                    {schedule.days.map((d0) => {
                      const d = d0.date;
                      const allowed = d0.part;
                      const part = partFor(d0, draft);
                      return (
                        <div className="asg-day" key={d}>
                          <span className="asg-day-d">{fmt(d)}</span>
                          {/* One of the three, never two: a day is a
                              whole day or one half of it, and "AM and
                              PM" is a full day written twice. */}
                          {/* Parts the team already has that day are
                              refused here rather than at save time.

                              A gang on site all Tuesday cannot take
                              Tuesday at all; one doing a morning can
                              still do the afternoon, and Full is then
                              not on offer because half the day is
                              already gone. */}
                          {["Full", "AM", "PM"].map((opt) => {
                            const taken = draft.Team_ID
                              ? bookedParts(draft.Team_ID, all, workDays, editing).get(d)
                              : null;
                            /* A weekend half is decided by the rule
                               above, not here. Offering "Full day" on a
                               Saturday where only the morning is ticked
                               would let the form contradict the thing
                               that put the Saturday in the list. */
                            /* Fixed by the weekend rule, not merely a
                               half. The estimate's own odd half is a
                               default, and the whole point of these
                               buttons is to move it. */
                            const fixed = d0.fixed && opt !== allowed;
                            const free = !fixed && partIsFree(taken, opt);
                            return (
                              <button key={opt} type="button"
                                className={part === opt ? "asg-part on" : "asg-part"}
                                aria-pressed={part === opt}
                                disabled={fixed || (!free && part !== opt)}
                                title={fixed
                                  ? "Set by the weekend rule above"
                                  : (free ? "" : `Team already booked ${
                                    [...(taken || [])].join(" and ")} that day`)}
                                onClick={() => setDraft((dd) => ({
                                  ...dd, parts: { ...(dd.parts || {}), [d]: opt },
                                }))}>
                                {opt === "Full" ? "Full day" : opt}
                              </button>
                            );
                          })}
                          {/* Per day, because a gang is off site on the
                              Tuesday and back on the Wednesday — the
                              notice, the rate and often the permit
                              follow the day rather than the booking. */}
                          <label className="asg-off">
                            <input type="checkbox"
                              checked={!!draft.offDays?.[d]}
                              onChange={(e) => setDraft((dd) => ({
                                ...dd,
                                offDays: { ...(dd.offDays || {}), [d]: e.target.checked },
                              }))} />
                            <span>Off site</span>
                          </label>

                          {/* Which plots this day. Only when the days
                              differ \u2014 otherwise every row would carry
                              the same list and the grid would say five
                              times what the booking says once. */}
                          {splitByDay && row.Selection_Mode !== "Span"
                            && plotUniverse.length > 0 && (
                            <div className="asg-day-plots">
                              {(draft.plots || []).map((pl) => {
                                const on = (draft.dayPlots?.[d] || []).includes(pl);
                                /* Already down for another day of this
                                   same booking.

                                   A plot is dug, laid or jointed once.
                                   Ticked on the Wednesday as well as
                                   the Tuesday, it goes out on both
                                   days' work — so either two gangs
                                   turn up to it or one does it twice
                                   and bills twice, and neither is
                                   discovered until somebody is
                                   standing on it.

                                   Refused here rather than only on
                                   save, so the grid says which plots
                                   are still going while they are being
                                   picked.

                                   Never the lit one. A booking saved
                                   before this rule can hold a plot on
                                   two days, and disabling both pills
                                   would leave a planner looking at the
                                   fault with no way to undo it. The
                                   day that has it keeps its pill, and
                                   unticking there frees the plot
                                   everywhere else. */
                                const heldBy = !on ? dayPlotOwner.get(pl) : null;
                                return (
                                  <button key={pl} type="button"
                                    className={`asg-pill sm${on ? " on" : ""}`
                                      + (heldBy ? " held" : "")}
                                    disabled={!!heldBy}
                                    title={heldBy
                                      ? `Already on ${fmt(heldBy)} \u2014 a plot is done once`
                                      : ""}
                                    onClick={() => setDraft((dd) => {
                                      const cur = dd.dayPlots?.[d] || [];
                                      return {
                                        ...dd,
                                        dayPlots: {
                                          ...(dd.dayPlots || {}),
                                          [d]: on
                                            ? cur.filter((x) => x !== pl)
                                            : [...cur, pl],
                                        },
                                      };
                                    })}>
                                    {pl}
                                  </button>
                                );
                              })}
                              {!(draft.dayPlots?.[d] || []).length && (
                                <span className="asg-day-all">
                                  nothing chosen &mdash; all of them
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* The utilities this booking covers. The tick that
                    turns this on sits with the per-day one above, beside
                    the days it divides \u2014 not here, where it was a
                    second copy of the same control. */}
                <div className="asg-split">
                  {draft.byUtility && splitsByUtility(ph.Task_Type_Name) && (
                    <div className="asg-split-utils">
                      {utils
                        /* Only the utilities this call-off covers. A
                           gas-only call-off has no electric to split. */
                        .filter((u) => !u.Is_Lighting)
                        .filter((u) => !(row.utility_ids || []).length
                          || (row.utility_ids || []).includes(Number(u.Utility_ID)))
                        .map((u) => {
                          const id = Number(u.Utility_ID);
                          const chosen = draft.utility_ids || [];
                          const on = chosen.includes(id);

                          /* Two is the most a split can name. All three
                             is the same as not splitting. */
                          const full = !on && chosen.length >= 2;

                          /* And nothing left to give it. Every plot on
                             this phase already laid for this utility
                             means picking it leaves an empty booking \u2014
                             which is what the plots grid was already
                             saying in red while this pill said nothing. */
                          const nothingLeft = !on
                            && row.Selection_Mode !== "Span"
                            && plotUniverse.length > 0
                            && plotUniverse.every((pl) =>
                              takenFor(openPhase, editing, { forUtilities: [id] }).has(pl));

                          const off = full || nothingLeft;
                          return (
                            <button key={u.Utility_ID} type="button"
                              disabled={off}
                              title={nothingLeft
                                ? `Every plot is already assigned for ${u.Utility}`
                                : full
                                  ? "A split names one or two utilities, not all three"
                                  : undefined}
                              className={[
                                "asg-pill", on ? "on" : "", off ? "off" : "",
                              ].filter(Boolean).join(" ")}
                              onClick={() => setDraft((d) => {
                                const cur = d.utility_ids || [];
                                return {
                                  ...d,
                                  utility_ids: on
                                    ? cur.filter((x) => x !== id)
                                    : [...cur, id],
                                };
                              })}>
                              {u.Utility}
                            </button>
                          );
                        })}
                    </div>
                  )}
                  {/* All three are offered because nothing says
                      otherwise, which is not the same as the call-off
                      covering all three. Said plainly: a gas and water
                      call-off showing Electric here is one whose
                      utilities were never recorded, and the fix is on
                      the call-off rather than in this panel. */}
                  {draft.byUtility && !(row.utility_ids || []).length && (
                    <p className="asg-split-hint">
                      This call-off has no utilities recorded, so every one is
                      offered. Set them on the call-off to narrow this.
                    </p>
                  )}

                  {draft.byUtility && !(draft.utility_ids || []).length
                    && !!(row.utility_ids || []).length && (
                    <p className="asg-split-hint">
                      Nothing chosen &mdash; this booking would cover no utilities.
                    </p>
                  )}
                </div>

                {/* Plots as pills, as they are chosen everywhere else on
                    a call-off — clicking one off is quicker than editing
                    a range by hand, and a pill cannot produce "1-4, 4".

                    Not on a mains call-off. That names spans of trench —
                    A1 to A5 — and the whole span is laid; there is no
                    sense in which one team takes some of its plots and
                    another the rest, because the plots are not what is
                    being divided. */}
                {/* Not while the days carry their own. It would be the
                    same question asked twice, and the answer here is
                    the one that does nothing \u2014 which is worse than
                    not asking. The booking's range is then whatever the
                    days between them cover. */}
                {row.Selection_Mode !== "Span" && plotUniverse.length > 0
                  && !splitByDay && (
                  <div className="asg-plots-pick">
                    <div className="asg-days-head">
                      <strong>Plots</strong>
                      <span className="asg-days-tot">
                        {`${(draft.plots || []).length} of ${plotUniverse.length}`}
                      </span>
                      <button type="button" className="asg-all"
                        onClick={() => setDraft((d) => {
                          /* "All" means all that are still going, not
                             all that exist — offering plots another team
                             holds would only be refused on save. */
                          const free = plotUniverse.filter((pl) =>
                            !takenFor(ph.Task_Type_ID, editing).has(pl));
                          return {
                            ...d,
                            plots: (d.plots || []).length >= free.length ? [] : free,
                          };
                        })}>
                        {(draft.plots || []).length
                          >= plotUniverse.filter((pl) =>
                            !takenFor(ph.Task_Type_ID, editing).has(pl)).length
                          ? "Clear" : "All free"}
                      </button>
                    </div>
                    <div className="asg-pills">
                      {(() => {
                        /* Plots another team already has on this phase.
                           Disabled rather than hidden: a plot missing
                           from the grid looks like a plot missing from
                           the call-off. */
                        const taken = takenFor(ph.Task_Type_ID, editing, { named: true });
                        return plotUniverse.map((pl) => {
                          const on = (draft.plots || []).includes(pl);
                          const by = !on ? taken.get(pl) : null;
                          return (
                            <button key={pl} type="button"
                              className={[
                                "asg-pill", on ? "on" : "", by ? "off" : "",
                              ].filter(Boolean).join(" ")}
                              disabled={!!by}
                              aria-pressed={on}
                              title={by ? `Already assigned to ${by}` : `Plot ${pl}`}
                              onClick={() => setDraft((d) => ({
                                ...d,
                                plots: on
                                  ? (d.plots || []).filter((x) => x !== pl)
                                  : [...(d.plots || []), pl],
                              }))}>
                              {pl}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                <div className="asg-line asg-actions">
                  {/* Enabled even where there are problems, so pressing
                      it says why rather than doing nothing.

                      A disabled button with the reasons listed below it
                      reads, at a glance, as a button that is broken —
                      which is exactly how this was reported. save()
                      still refuses; the refusal is now visible at the
                      moment of pressing. */}
                  <button className="btn accent sm" disabled={!!busy}
                    onClick={save}>
                    {busy === "save" ? "Saving…"
                      : (editing != null ? "Save changes" : "Save assignment")}
                  </button>
                  <button className="btn ghost sm"
                    onClick={() => { setOpenPhase(null); setEditing(null); }}>
                    Cancel
                  </button>
                </div>

                {/* Everything wrong at once, so three problems are not
                    found across three attempts to save. */}
                {allProblems.length > 0 && (
                  <ul className="asg-problems">
                    {allProblems.map((t, k) => <li key={k}>{t}</li>)}
                  </ul>
                )}
                {saidSaved && <p className="asg-saved">{saidSaved}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CSS = FILTER_CSS + `
.asg-phase { border: 1px solid var(--border); border-radius: 9px; padding: 11px 13px;
  margin-bottom: 9px; }
.asg-head { display: flex; align-items: center; gap: 9px; }
.asg-head strong { font-size: 13px; }
.asg-n { width: 20px; height: 20px; border-radius: 50%; background: var(--bg);
  display: inline-flex; align-items: center; justify-content: center;
  font: 700 10.5px inherit; color: var(--muted); flex: 0 0 auto; }
.asg-craft { font-size: 11px; color: var(--muted); margin-right: auto; }
/* ── The energisation grid ──

   Sized to what each column holds. The plot number is a couple of
   characters, a utility name is a word, and a date input needs about
   130px — anything wider is empty space that pushes the next column
   away from the plot it belongs to.

   A width of 1px with nowrap on the narrow columns is the old trick for
   "as narrow as the content": the browser treats it as a minimum and
   the content sets the real width, which beats guessing a pixel value
   that a longer utility name would then wrap inside.

   No backticks in here — this whole block lives inside a template
   literal, and one would end it. */
.eg-head { margin: 0 0 8px; font-size: 13px; font-weight: 700; }
.eg-tbl { border-collapse: collapse; font-size: 12.5px; }
.eg-tbl th, .eg-tbl td { padding: 5px 10px; border-bottom: 1px solid var(--border);
  text-align: left; white-space: nowrap; }
.eg-tbl thead th { background: #39467B; color: #fff; font-size: 10.5px;
  text-transform: uppercase; letter-spacing: .05em; font-weight: 700;
  border-bottom: 0; }
.eg-tbl thead th:first-child { border-top-left-radius: 7px; }
.eg-tbl thead th:last-child { border-top-right-radius: 7px; }
.eg-plot { width: 1px; font-weight: 700; text-align: center !important; }
.eg-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  margin-right: 6px; vertical-align: middle; }
.eg-date { width: 138px; font-size: 12px; }
.eg-date:disabled { background: #f8fafc; color: var(--muted); }
.eg-all { width: 1px; }
.eg-applyall { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px;
  font-weight: 600; cursor: pointer; white-space: nowrap; }
.eg-applyall input { width: auto; }
.eg-floor { margin: 7px 0 0; font-size: 11px; color: #92400e; }
.eg-err { margin: 6px 0 0; font-size: 11px; color: #991b1b; }
.eg-foot { display: flex; gap: 7px; margin-top: 10px; }
.asg-floor { margin: 7px 0 0; font: 600 11px inherit; color: #92400e; }
.asg-none { margin: 8px 0 0; font-size: 12px; color: var(--muted); font-style: italic; }
.asg-none.warn { color: #b45309; font-style: normal; font-weight: 600; }
.asg-wrap { margin-top: 8px; }
.asg-wrap .asg-row { margin-top: 0; }
.asg-ticks { display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  margin-bottom: 6px; }
/* Indented under the booking it explains, and lighter than it. */
.asg-break { display: flex; align-items: baseline; gap: 8px; font-size: 12px;
  color: var(--muted); padding: 3px 0 0 14px; }
.asg-break-when { font-weight: 600; color: var(--text); min-width: 128px; }
.asg-break-plots { font-weight: 600; }
.asg-util-tag { font: 700 11px inherit; color: var(--accent);
  background: var(--accent-light); padding: 2px 8px; border-radius: 20px; }

.asg-row { display: flex; align-items: center; gap: 12px; margin-top: 8px;
  padding: 6px 9px; background: var(--bg); border-radius: 6px; font-size: 12.5px; }
.asg-team { font-weight: 700; }
.asg-when { color: var(--muted); }
.asg-part-tag { font: 700 10.5px inherit; padding: 2px 8px; border-radius: 4px;
  background: #e0e7ff; color: #3730a3; white-space: nowrap; }
/* The pill. The select sits inside it with no chrome of its own, so it
   reads as a label and behaves as a control — the arrow and the border a
   browser would draw would make a row of these look like a form. */
.asg-status { margin-left: auto; }
.asg-status { display: inline-flex; align-items: center; border-radius: 999px;
  padding: 3px 12px; font-size: 11.5px; font-weight: 700; letter-spacing: .02em;
  cursor: pointer; }
.asg-status select { appearance: none; -webkit-appearance: none; background: none;
  border: none; color: inherit; font: inherit; letter-spacing: inherit;
  cursor: pointer; padding: 0; text-align: center; }
.asg-status select:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.asg-status select:disabled { cursor: progress; opacity: .7; }
/* The option list is drawn by the browser on its own background, so the
   pill's white-on-colour text would be white on white in the menu. */
.asg-status option { background: #fff; color: #1f2937; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; }
/* No margin-left:auto any more. That pushed the plots to the far right
   of the row, which is what put the status between them and the dates;
   beside the dates they need to sit where they are written. */
.asg-plots { font: 600 11.5px inherit; color: var(--accent);
  background: var(--accent-light); padding: 2px 8px; border-radius: 20px; }
/* Beside the span it measures, and lighter than it: the label is what
   the row is, the length is a fact about it.

   No fixed width any more: it sat at the end of the row where the
   figures lined up as a column, and beside the plots a 62px box leaves
   a gap after "Plots 1-4" that reads as something missing. */
.asg-len { color: var(--muted); font-weight: 600;
  font-variant-numeric: tabular-nums; }
/* Each control the width of what goes in it.

   A date field holds ten characters and a team name perhaps thirty —
   neither wants the full width of the panel, and stacked full-width
   blocks made a form four times taller than its content. */
.asg-form { margin-top: 10px; padding-top: 10px;
  border-top: 1px solid var(--border); }
.asg-line { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.asg-actions { margin-top: 12px; }
.asg-form select, .asg-form input[type="date"], .asg-form input[type="text"] {
  font: 500 12px inherit; padding: 5px 8px;
  border: 1px solid var(--border); border-radius: 6px; background: var(--white); }
.asg-team-sel { min-width: 150px; max-width: 220px; }
.asg-span-sel { min-width: 160px; max-width: 260px; }
/* Wide enough for dd/mm/yyyy and the picker button, and no wider. */
.asg-date { width: 140px; }
.asg-to { font-size: 11.5px; color: var(--muted); }
/* "Off site" on one line. Two words wrapping inside a tick box label
   read as two separate options. */
.asg-off { display: inline-flex; align-items: center; gap: 6px; margin-left: 4px;
  font: 600 11.5px inherit; cursor: pointer; white-space: nowrap; }
.asg-off input { width: auto; }

.asg-wknd { display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }
.asg-wknd strong { font-size: 12px; margin-right: 3px; }
.asg-wknd-n { font-size: 11px; color: var(--muted); margin-left: 4px; }
.asg-pushed { margin: 8px 0 0; font-size: 11.5px; color: #92400e;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;
  padding: 6px 9px; }
.asg-split { padding: 10px 0 0; }
.asg-split-tick, .asg-byday { display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; cursor: pointer; color: var(--muted); white-space: nowrap; }
.asg-byday { font-weight: 500; white-space: nowrap; }
.asg-split-utils { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.asg-split-hint { font-size: 12px; color: var(--warn-text); margin: 6px 0 0; }
/* Beside the off-site tick, not under the row. They belong to the same
   line as the rest of what the day is \u2014 which half of it, on site or
   not, and which plots. The row wraps as a whole if it has to, so a
   narrow window moves the pills down together rather than breaking one
   of the controls in half. */
.asg-day-plots { display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
  margin-left: 2px; }
.asg-pill.sm { font-size: 11px; padding: 1px 7px; }
.asg-day-all { font-size: 11.5px; color: var(--muted); }

.asg-days, .asg-plots-pick { margin-top: 12px; padding-top: 10px;
  border-top: 1px dashed var(--border); }
.asg-days-head { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
.asg-days-head strong { font-size: 12px; }
/* Short of the estimate. Amber rather than red: it is a thing worth
   knowing, not a thing that is wrong — booking half the work is
   ordinary when the rest is going to another team. */
/* Where an estimate came from, under the total it explains. */
.asg-est { margin: 6px 0 0; font-size: 11.5px; color: var(--muted); }
.asg-short { margin: 8px 0 0; padding: 9px 11px; border-radius: 8px;
  background: #fef3e2; border: 1px solid #f2d675; font-size: 12.5px;
  line-height: 1.6; max-width: 70ch; color: #7c4a03; }
.asg-days-tot { margin-left: auto; }
.asg-days-tot { font-size: 11px; color: var(--muted); margin-right: auto; }
.asg-all { background: none; border: 1px solid var(--border); border-radius: 5px;
  cursor: pointer; font: 600 10px inherit; padding: 2px 9px; color: var(--accent); }
.asg-day { display: flex; align-items: center; gap: 7px; margin-bottom: 5px;
  flex-wrap: wrap; }
/* Wide enough for "10-Aug-2026" in one piece. It was 110px and the year
   dropped to a second line, which made a four-day booking eight rows
   tall and every control below it shuffle. */
.asg-day-d { flex: 0 0 auto; min-width: 96px; font: 600 11.5px inherit;
  white-space: nowrap; }
.asg-part { white-space: nowrap; background: var(--white); border: 1px solid var(--border);
  border-radius: 5px; cursor: pointer; font: 600 10.5px inherit; padding: 3px 10px;
  color: var(--muted); }
.asg-part:hover { border-color: var(--accent); }
.asg-part.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.asg-pills { display: flex; flex-wrap: wrap; gap: 4px; max-height: 130px;
  overflow-y: auto; }
.asg-pill { min-width: 34px; background: var(--white); border: 1.5px solid var(--border);
  border-radius: 5px; cursor: pointer; font: 600 11px inherit; padding: 3px 7px; }
.asg-pill.on { border-color: var(--accent); background: #eff6ff; color: var(--accent); }
/* Taken by another team: dimmed rather than hidden, so the call-off's
   plots all remain visible and the reason is in the tooltip. */
.asg-pill.off { border-color: #fecaca; background: #fef2f2; color: #b91c1c;
  cursor: not-allowed; opacity: .65; }
/* Held by another day of this same booking. Grey rather than the red
   above: that one is a clash with somebody else's work and wants
   noticing, this is the booking's own arrangement seen from the wrong
   day. Red on every plot the Tuesday has would make a correctly filled
   grid look like a screen full of errors. */
.asg-pill.held { color: var(--muted); background: var(--bg); cursor: not-allowed;
  opacity: .55; }
.asg-edit { background: none; border: 1px solid var(--border); border-radius: 5px;
  cursor: pointer; font: 600 10.5px inherit; padding: 2px 9px; color: var(--accent); }
.asg-off-tag { font: 700 10px inherit; padding: 2px 7px; border-radius: 4px;
  background: #fef3c7; color: #92400e; }
.asg-problems { flex: 1 0 100%; margin: 4px 0 0; padding-left: 18px;
  font: 600 11.5px inherit; color: #b45309; }

.co-page { padding: 18px 22px 40px; }
.co-spacer { flex: 1; }
.pp { background: var(--white); border-radius: 12px; width: min(520px, 94vw);
  max-height: 80vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.pp-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.pp-head > div { flex: 1; }
.pp-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.pp-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.pp-body { padding: 12px 18px; overflow-y: auto; flex: 1; }
.pp-search { width: 100%; margin-bottom: 9px; }
.pp-err { font-size: 12px; color: #991b1b; margin: 0 0 8px; }
.pp-list { list-style: none; margin: 0; padding: 0; }
.pp-list li { border-bottom: 1px solid var(--border); }
.pp-list li:last-child { border-bottom: 0; }
.pp-list button { display: flex; align-items: baseline; gap: 10px; width: 100%;
  text-align: left; border: 0; background: transparent; cursor: pointer;
  padding: 7px 6px; font: inherit; border-radius: 6px; }
.pp-list button:hover { background: #f1f5f9; }
.pp-list strong { font-size: 12.5px; min-width: 76px; }
.pp-list span { font-size: 12.5px; flex: 1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.pp-list em { font-size: 11px; color: var(--muted); font-style: normal; }
/* Wrapping is the last resort rather than the first.

   A flex item shrinks by default, and the title was the one part not
   told otherwise — so on a narrow window it gave up its width first and
   broke "Call-offs (1 of 1)" across two lines, which reads as a fault
   rather than a layout. It now keeps its width and the row wraps as a
   whole if there is genuinely not enough room. */
.co-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
  flex-wrap: wrap; }
/* The title keeps its own line rather than wrapping mid-phrase — "Call-offs
   (1 of" then "1)" on the next line reads as a fault. */
.co-bar h2 { margin: 0; font-size: 18px; white-space: nowrap; flex: 0 0 auto; }
.co-of { font: 600 12px inherit; color: var(--muted); margin-left: 8px; }
/* The search takes the room going spare, but not below a width a site
   name fits in. Without the basis it collapsed to nothing beside the
   dropdown, which had no width of its own and grew to fill the bar. */
.co-search { flex: 1 1 260px; min-width: 200px; max-width: 380px;
  font: 500 12.5px inherit; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 7px; }
/* Sized to fit its longest option — "Withdrawn (Customer)" — and no
   wider. A dropdown of nine short statuses has no reason to take a third
   of the bar, but one narrow enough to clip its own options is worse
   than one that is too wide. */
.co-status-sel { flex: 0 0 auto; width: 182px; font: 500 12.5px inherit;
  padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px;
  background: var(--white); }
.co-err { color: #b91c1c; font: 600 12.5px inherit; margin: 0 0 12px; }
.co-none { margin: 24px 0; }
/* What is laid along a section. Kept from stretching the table when a
   joint trench carries three sizes — the column can wrap, the section
   name beside it should not. */
/* What is laid along a section, with each utility's own mark in front
   of its size. Slightly larger than the text around it so the marks
   read as marks rather than as punctuation, and kept from stretching
   the table when a joint trench carries three sizes — this column can
   wrap, the section name beside it should not. */
.co-contents { color: var(--muted); max-width: 260px; font-size: 12px;
  line-height: 1.6; white-space: normal; }
.co-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px;
  background: var(--white); border: 1px solid var(--border); border-radius: 9px;
  overflow: hidden; }
.co-tbl th { background: #2c3455; color: #fff; text-align: left; padding: 9px 12px;
  font: 700 11.5px inherit; }
.co-tbl td { padding: 9px 12px; border-top: 1px solid var(--border); }
.co-tbl tbody tr { cursor: pointer; }
.co-tbl tbody tr:hover { background: var(--bg); }
.co-tbl.flat tbody tr { cursor: default; }
.co-tbl.flat tbody tr:hover { background: none; }
.co-dim { color: var(--muted); }
/* How much of each phase is booked.

   Named as well as coloured. Three shades of pill is a legend somebody
   has to learn, and the state that matters — part assigned — is exactly
   the one a colour alone would not tell from done.

   Amber for part rather than red: a half-booked call-off is not wrong,
   it is unfinished, and a list of red rows stops being read. Grey for
   unassigned, because that is where everything starts. */
/* Choosing how to raise a call-off. Two options as full-width cards
   with a sentence each, not a pair of buttons: they lead to different
   screens doing different jobs, and a label alone would not say which
   is which to somebody meeting them for the first time. */
.co-modal { position: fixed; inset: 0; background: rgba(15,23,42,.4);
  display: flex; align-items: center; justify-content: center; z-index: 70;
  padding: 16px; }
.co-how { background: var(--white); border-radius: 12px; padding: 20px;
  width: min(520px, 100%); box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.co-how h3 { margin: 0 0 14px; font-size: 17px; font-weight: 700; }
.co-how-opt { display: block; width: 100%; text-align: left; margin-bottom: 10px;
  padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--white); cursor: pointer; }
.co-how-opt:hover { border-color: var(--accent); background: var(--bg); }
.co-how-opt strong { display: block; font-size: 15px; margin-bottom: 3px; }
.co-how-opt span { display: block; font-size: 12.5px; color: var(--muted);
  line-height: 1.6; }
/* A group heading, spanning the table. Its own row rather than a
   sub-table, so the columns stay aligned across every group — the
   thing a table is for. */
.co-grp td { background: var(--bg); border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border); padding: 7px 10px; cursor: pointer;
  font-size: 12.5px; position: sticky; left: 0; }
.co-grp strong { font-size: 13px; }
.co-grp-t { background: none; border: none; cursor: pointer; padding: 0 7px 0 0;
  font-size: 11px; color: var(--muted); }
/* What is inside a shut group, which it otherwise says nothing about. */
.co-grp-n { margin-left: 9px; font-size: 11.5px; color: var(--muted); }
.co-cover { display: flex; flex-wrap: wrap; gap: 4px; }
.co-cov { display: inline-flex; align-items: baseline; gap: 5px;
  border-radius: 20px; padding: 2px 9px; font-size: 11px; white-space: nowrap;
  border: 1px solid transparent; }
.co-cov b { font-weight: 700; }
.co-cov.c-unassigned { background: #f1f5f9; color: #64748b; border-color: #e2e8f0; }
.co-cov.c-part { background: #fef3e2; color: #92400e; border-color: #f2d675; }
.co-cov.c-assigned { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
.co-wt-pill { font: 700 11px inherit; padding: 2px 9px; border-radius: 5px;
  background: #f3e8ff; color: #7c3aed; }
.co-st { font: 700 10.5px inherit; padding: 2px 9px; border-radius: 20px;
  background: var(--bg); color: var(--muted); white-space: nowrap; }
.co-st.big { font-size: 12px; padding: 5px 14px; margin-left: auto; }
.co-st.s-pendingreview { background: #fef3c7; color: #92400e; }
.co-st.s-reviewed { background: #dbeafe; color: #1e40af; }
.co-st.s-scheduled { background: #e0e7ff; color: #3730a3; }
.co-st.s-inprogress { background: #ccfbf1; color: #0f766e; }
.co-st.s-complete { background: #dcfce7; color: #166534; }
.co-st.s-withdrawncustomer, .co-st.s-withdrawnaptus {
  background: #fee2e2; color: #991b1b; }
.co-head-bar { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.co-head-bar h2 { margin: 0; font-size: 18px; }
.co-kicker { margin: 0 0 2px; font: 700 10.5px inherit; color: var(--muted);
  letter-spacing: .06em; text-transform: uppercase; }
.co-card { background: var(--white); border: 1px solid var(--border);
  border-radius: 11px; padding: 16px 20px; margin-bottom: 14px; }
.co-card h3 { margin: 0 0 10px; font-size: 14px; }
.co-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px 18px; }
.co-fact { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; }
.co-fact > span { font: 700 10.5px inherit; color: var(--muted);
  letter-spacing: .04em; text-transform: uppercase; }
.co-notes { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--border);
  font-size: 12.5px; white-space: pre-wrap; }
.co-steps { display: flex; flex-wrap: wrap; gap: 7px; }
.co-step { background: var(--white); border: 1px solid var(--border);
  border-radius: 20px; cursor: pointer; font: 600 11.5px inherit; padding: 5px 14px; }
.co-step:hover { border-color: var(--accent); }
.co-step.on { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
.co-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%;
  background: currentColor; margin-right: 6px; vertical-align: middle; }
.co-edit { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 11px 14px; }
.co-ed-utils { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px;
  padding: 0 0 14px; margin-bottom: 14px; border-bottom: 1px solid var(--border); }
.co-ed-utils-label { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.co-ed-util { display: inline-flex; align-items: center; gap: 6px; font-size: 13px;
  cursor: pointer; }

.co-ed { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.co-ed.wide { grid-column: 1 / -1; }
.co-ed > span { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.co-ed input, .co-ed select, .co-ed textarea { font: 500 12.5px inherit;
  padding: 6px 9px; border: 1px solid var(--border); border-radius: 6px; }
.co-ed-note { margin: 12px 0; }
/* The row buttons, always visible.

   Hidden until hover to begin with, on the reasoning that a table of
   forty call-offs need not show eighty buttons. That was the wrong
   trade: an action nobody can see is an action nobody knows about, and
   somebody scanning the table for a way to remove a row found nothing
   until the cursor happened to cross it.

   Kept quiet rather than hidden — outlined, in the accent and the
   danger colours, so they read as available without competing with the
   call-off's own details. */
.co-act-h { width: 1%; }
.co-act { white-space: nowrap; text-align: right; }
.co-rb { background: var(--white); border: 1px solid var(--border);
  border-radius: 5px; cursor: pointer; font: 600 11px inherit;
  padding: 3px 10px; color: var(--accent); margin-left: 5px; }
.co-rb:hover { background: #eff6ff; border-color: var(--accent); }
.co-rb.del { color: #b91c1c; }
.co-rb.del:hover { background: #fef2f2; border-color: #fecaca; }
.co-del { color: #b91c1c; }
.co-del:hover { background: #fef2f2; border-color: #fecaca; }
.co-todo { border-style: dashed; }
.co-todo p { margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.6; }
`;
