import { useState, useEffect, useMemo } from "react";
import {
  listAllCallOffs, setCallOffStatus, updateCallOff, deleteCallOff,
} from "../../api/calloffs.js";
import { remember, recall } from "../../lib/session.js";
import { takeCallOffIntent, onOpenCallOff } from "../../lib/callOffIntent.js";
import { getLookups } from "../../api/lookups.js";
import { getProject, listProjects } from "../../api/projects.js";
import { openProject } from "../../lib/projectIntent.js";
import { setPlotEnergisation } from "../../api/calloffs.js";
import { energisationFloor, dayAfter, byUtilityColumn } from "./rules.js";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import { pillStyle } from "../../lib/pillColour.js";
import { useDragHandle } from "../../lib/useDragHandle.js";
import {
  eligibleTeams, earliestStart, parsePlots, serialisePlots,
  validate as checkAssignment, daysBetween, dayTotal, takenPlots,
  bookedParts, partIsFree,
  WEEKEND_PARTS, worksAnyWeekend, availablePart, laySchedule, workedDaysIn,
} from "./assignments.js";
import { dependencyProblems, dependencyFloor } from "../planning/dependencies.js";

/* Call-offs across the business.

   The project tab answers "what is on this project"; this answers "what
   is coming up" — every site, filtered by status, searched by reference,
   site, customer or contact.

   Clicking one opens it, where the work is scheduled and the status
   moved. */

export const STATUSES = [
  "Pending Review", "Reviewed", "Scheduled", "In Progress",
  "Complete", "Withdrawn (Customer)", "Withdrawn (Aptus)",
];

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
const partFor = ({ date, part: allowed }, draft) =>
  (allowed !== "Full" ? allowed : (draft.parts?.[date] || "Full"));

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

export default function CallOffsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(() => recall("callOffStatus", "open"));
  const [picking, setPicking] = useState(false);
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
      setStatus("all");
      setQ("");
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
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && CLOSED.has(r.Status)) return false;
      if (status !== "open" && status !== "all" && r.Status !== status) return false;
      if (!t) return true;
      /* Everything somebody might have in front of them: the reference
         off an email, the site off a drawing, the name of whoever rang. */
      return [r.AP_Number, r.Site_Name, r.Site_Address, r.Customer_Name,
        r.Contact_Name, r.Project_Ref, r.Work_Type?.Work_Type_Name]
        .some((v) => String(v ?? "").toLowerCase().includes(t));
    });
  }, [rows, q, status]);

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
        <select className="co-status-sel" value={status}
          onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open call-offs</option>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(q || status !== "open") && (
          <button className="btn ghost sm" onClick={() => { setQ(""); setStatus("open"); }}>
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
        <button className="btn accent sm" onClick={() => setPicking(true)}>
          + New call-off
        </button>
      </div>

      {picking && (
        <ProjectPicker
          onCancel={() => setPicking(false)}
          onPick={(project) => openProject(project, "calloffs")}
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
        <table className="co-tbl">
          <thead>
            <tr>
              <th>Submitted</th><th>Reference</th><th>Site</th>
              <th>Customer</th><th>Work Type</th><th>Contact</th>
              <th>Preferred</th><th>Status</th>
              {/* Edit and delete on the row itself.

                  They were on the detail page, which meant opening a
                  call-off to delete it — three clicks to remove
                  something raised by mistake, and no way to see at a
                  glance that removing it was even possible. */}
              <th className="co-act-h">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              /* The whole row opens it: the target is bigger and there is
                 nothing else on a row to click. */
              <tr key={r.Submission_ID} onClick={() => setOpenId(r.Submission_ID)}>
                <td className="co-dim">{fmt(String(r.Created_At || "").slice(0, 10))}</td>
                <td><strong>{r.AP_Number || `#${r.Submission_ID}`}</strong></td>
                <td>{r.Site_Name || "\u2014"}</td>
                <td>{r.Customer_Name || "\u2014"}</td>
                <td>
                  <span className="co-wt-pill">
                    {r.Work_Type?.Work_Type_Name || "\u2014"}
                  </span>
                </td>
                <td>{r.Contact_Name || "\u2014"}</td>
                <td>{fmt(r.Preferred_Date)}</td>
                <td>
                  <span className={`co-st s-${String(r.Status || "").replace(/\W+/g, "").toLowerCase()}`}>
                    {r.Status}
                  </span>
                </td>
                {/* stopPropagation on both: the row opens the call-off,
                    and without it Delete would open the one it had just
                    removed. */}
                <td className="co-act">
                  <button className="btn edit sm"
                    onClick={(e) => { e.stopPropagation(); setOpenId(r.Submission_ID); }}>
                    Edit
                  </button>
                  <button className="btn delete sm"
                    onClick={(e) => { e.stopPropagation(); remove(r.Submission_ID, r.Project_ID); }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                {mode === "Span" && <><th>D/P</th><th>Length</th></>}
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
  const [all, setAll] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [openPhase, setOpenPhase] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [workDays, setWorkDays] = useState([]);
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
      const [tt, map, tm, tc, tr, cr, asg] = await Promise.all([
        adminList("Task_Type"), adminList("Work_Type_Task_Type"),
        adminList("Team"), adminList("Team_Craft"), adminList("Team_Region"),
        adminList("Craft"), adminList("Call_Off_Assignment"),
      ]);
      const wd = await adminList("Call_Off_Work_Day").catch(() => ({ rows: [] }));
      setWorkDays(wd.rows || []);
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
    const length = editing != null
      ? workedDaysIn(draft.Start_Date, draft.End_Date, weekend).length
      : daysBetween(draft.Start_Date, draft.End_Date).length;
    return { ...laySchedule(draft.Start_Date, length, weekend), weekend };
  }, [draft.Start_Date, draft.End_Date, draft.weekend, editing]);

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
    });
    setEditing(a.Assignment_ID);
    setOpenPhase(a.Task_Type_ID);
    setError("");
  }

  function openFor(phase) {
    const floor = floorFor(phase.Task_Type_ID, mine, plotUniverse);
    setDraft({
      Task_Type_ID: phase.Task_Type_ID,
      Team_ID: "",
      /* The first run nobody is on yet.

         Blank — the whole call-off — is only right where nothing is
         assigned. Once one run has a team, opening the form on "all
         spans" offers something that would overlap, and somebody has to
         notice and change it before anything else works. */
      Span_ID: (() => {
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
      })(),
      /* Defaulted to the earliest it may start — the preferred date, or
         later if an earlier phase pushes it. */
      Start_Date: floor?.date || row.Preferred_Date || "",
      End_Date: "",
      /* The plots not already taken by another team on this phase.

         A call-off split three and three should open the second
         assignment with the remaining three already chosen, rather than
         with all six and two of them refused. */
      plots: plotUniverse.filter((pl) =>
        !takenPlots(mine, phase.Task_Type_ID).has(pl)),
      /* No weekend working unless somebody ticks it. The common case,
         and the safe default: a booking that quietly put a gang on a
         Sunday would be found by the gang. */
      weekend: {},
      /* Marked full and on site unless somebody says otherwise. */
      parts: {},
      offDays: {},
    });
    setEditing(null);
    setOpenPhase(phase.Task_Type_ID);
    setError("");
  }

  /* A mains call-off divides spans, not plots, so the plot rule does not
     apply to it — requiring at least one plot would make every mains
     assignment impossible to save. */
  const problems = openPhase != null
    ? checkAssignment({
      ...draft,
      Plot_Range: row.Selection_Mode === "Span"
        ? "n/a" : serialisePlots(draft.plots || []),
    }, {
      phases, assignments: all, today: new Date().toISOString().slice(0, 10),
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
          ? null : (serialisePlots(draft.plots) || null),
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
          }));
        }
        setWorkDays((xs) => [
          ...xs.filter((x) => Number(x.Assignment_ID) !== Number(id)),
          ...made,
        ]);
      } catch (dayErr) {
        setError(`Saved, but the day breakdown failed: ${dayErr.message}`);
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

  return (
    <div className="co-card">
      <h3>
        Team assignments
        <span className="co-dim">
          {` \u00b7 ${mine.length} across ${phases.length} phase${phases.length === 1 ? "" : "s"}`}
        </span>
      </h3>
      <p className="hint">
        Several teams can work one phase in parallel &mdash; Team A on the
        first plots, Team B on the rest. Teams are those holding the
        craft the phase needs.
      </p>

      {error && <p className="co-err">{error}</p>}

      {phases.map((ph, i) => {
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
          return days.every((d) => !partIsFree(taken.get(d), "AM")
            && !partIsFree(taken.get(d), "PM"));
        };

        const can = eligibleTeams(teams, {
          teamCrafts, teamRegions,
          craftId: ph.Craft_ID,
          regionId: row.Region_ID ?? null,
        });
        const floor = floorFor(ph.Task_Type_ID, mine, plotUniverse, null);

        return (
          <div className="asg-phase" key={ph.Task_Type_ID}>
            <div className="asg-head">
              <span className="asg-n">{i + 1}</span>
              <strong>{ph.Task_Type_Name}</strong>
              <span className="asg-craft">
                {ph.Craft_ID
                  ? `needs ${craftName(ph.Craft_ID) ?? "a craft"}`
                  : "any craft"}
                {row.Region_ID ? " in this region" : ""}
                {` \u00b7 ${can.length} team${can.length === 1 ? "" : "s"}`}
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

            {/* Why a phase cannot start yet, before somebody tries. */}
            {floor && (
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
              <div className="asg-row" key={a.Assignment_ID}>
                <span className="asg-team">{teamName(a.Team_ID)}</span>
                <span className="asg-when">
                  {fmt(a.Start_Date)} to {fmt(a.End_Date)}
                </span>

                {/* How much of each day, from the day rows.

                    The dates alone say a gang is there on the sixth and
                    nothing about whether that is a morning, an
                    afternoon or the whole day — which is the difference
                    between one team doing two spans and two teams doing
                    one each.

                    Where every day is the same it is said once; where
                    they differ each is named, because "AM" against a
                    week that is only a morning on the Friday would be
                    wrong. */}
                {(() => {
                  const mineDays = workDays
                    .filter((d) => Number(d.Assignment_ID) === Number(a.Assignment_ID))
                    .sort((x, y) => String(x.Work_Date).localeCompare(y.Work_Date));
                  if (!mineDays.length) return null;

                  const parts = [...new Set(mineDays.map((d) => d.Part || "Full"))];
                  const label = (p) => (p === "Full" ? "Full day" : p);

                  return (
                    <span className="asg-part-tag">
                      {parts.length === 1
                        ? label(parts[0])
                        : mineDays.map((d) =>
                          `${String(d.Work_Date).slice(8)} ${label(d.Part)}`).join(", ")}
                    </span>
                  );
                })()}


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
                    : (a.Plot_Range || "all plots")}
                </span>

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
                        ...d2, Span_ID: e.target.value,
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
                            {!taken.size && <option value="">All spans</option>}
                            {free.map((it) => (
                              <option key={it.Span_ID} value={it.Span_ID}>
                                {it.Plots}
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
                  <select className="asg-team-sel" value={draft.Team_ID}
                    aria-label="Team"
                    onChange={(e) => setDraft((d) => ({ ...d, Team_ID: e.target.value }))}>
                    <option value="">Team…</option>
                      {can.map((t) => (
                      <option key={t.Team_ID} value={t.Team_ID}
                        disabled={busyAcross(t)}>
                        {t.Team_Name}{busyAcross(t) ? " \u2014 booked" : ""}
                      </option>
                    ))}
                  </select>
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
                    }))} />
                  <span className="asg-to">to</span>
                  <input className="asg-date" type="date" value={draft.End_Date}
                    aria-label="End date"
                    /* Never before it starts. Disabling the earlier days
                       says so in the picker, where somebody is looking,
                       rather than in a message after they have chosen. */
                    min={draft.Start_Date || todayISO()}
                    onChange={(e) => setDraft((d) => ({ ...d, End_Date: e.target.value }))} />

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
                    {schedule.days.map(({ date: d, part: allowed }) => {
                      const part = partFor({ date: d, part: allowed }, draft);
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
                            const fixed = allowed !== "Full" && opt !== allowed;
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
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Plots as pills, as they are chosen everywhere else on
                    a call-off — clicking one off is quicker than editing
                    a range by hand, and a pill cannot produce "1-4, 4".

                    Not on a mains call-off. That names spans of trench —
                    A1 to A5 — and the whole span is laid; there is no
                    sense in which one team takes some of its plots and
                    another the rest, because the plots are not what is
                    being divided. */}
                {row.Selection_Mode !== "Span" && plotUniverse.length > 0 && (
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
                            !takenPlots(mine, ph.Task_Type_ID, editing).has(pl));
                          return {
                            ...d,
                            plots: (d.plots || []).length >= free.length ? [] : free,
                          };
                        })}>
                        {(draft.plots || []).length
                          >= plotUniverse.filter((pl) =>
                            !takenPlots(mine, ph.Task_Type_ID, editing).has(pl)).length
                          ? "Clear" : "All free"}
                      </button>
                    </div>
                    <div className="asg-pills">
                      {(() => {
                        /* Plots another team already has on this phase.
                           Disabled rather than hidden: a plot missing
                           from the grid looks like a plot missing from
                           the call-off. */
                        const taken = takenPlots(mine, ph.Task_Type_ID, editing,
                          (id) => teamName(id));
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

const CSS = `
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
.asg-off { display: inline-flex; align-items: center; gap: 6px; margin-left: 4px;
  font: 600 11.5px inherit; cursor: pointer; }
.asg-off input { width: auto; }

.asg-wknd { display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }
.asg-wknd strong { font-size: 12px; margin-right: 3px; }
.asg-wknd-n { font-size: 11px; color: var(--muted); margin-left: 4px; }
.asg-pushed { margin: 8px 0 0; font-size: 11.5px; color: #92400e;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;
  padding: 6px 9px; }
.asg-days, .asg-plots-pick { margin-top: 12px; padding-top: 10px;
  border-top: 1px dashed var(--border); }
.asg-days-head { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
.asg-days-head strong { font-size: 12px; }
.asg-days-tot { font-size: 11px; color: var(--muted); margin-right: auto; }
.asg-all { background: none; border: 1px solid var(--border); border-radius: 5px;
  cursor: pointer; font: 600 10px inherit; padding: 2px 9px; color: var(--accent); }
.asg-day { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
.asg-day-d { width: 110px; font: 600 11.5px inherit; }
.asg-part { background: var(--white); border: 1px solid var(--border);
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
