import { useState, useEffect, useMemo } from "react";
import { listAllCallOffs, setCallOffStatus } from "../../api/calloffs.js";
import { remember, recall } from "../../lib/session.js";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import {
  eligibleTeams, earliestStart, parsePlots, serialisePlots,
  validate as checkAssignment, daysBetween, dayTotal, takenPlots,
} from "./assignments.js";

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

/* Statuses that mean the job is done with, one way or another. Kept
   apart because the default view is work still to do, and a list that
   opens with three years of completed call-offs is a list nobody reads. */
const CLOSED = new Set(["Complete", "Withdrawn (Customer)", "Withdrawn (Aptus)"]);

const fmt = (d) => {
  if (!d) return "\u2014";
  const [y, m, dd] = String(d).split("-");
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return M ? `${dd}-${M}-${String(y).slice(2)}` : d;
};

export default function CallOffsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(() => recall("callOffStatus", "open"));
  const [openId, setOpenId] = useState(null);

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

  async function move(id, next) {
    try {
      await setCallOffStatus(id, next);
      setRows((rs) => rs.map((r) =>
        Number(r.Submission_ID) === Number(id) ? { ...r, Status: next } : r));
      setError("");
    } catch (e) { setError(e.message); }
  }

  if (open) {
    return <CallOffDetail row={open} onBack={() => setOpenId(null)} onMove={move} />;
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
      </div>

      {error && <p className="co-err">{error}</p>}
      {loading && <p className="hint">Loading…</p>}

      {!loading && !shown.length && (
        <p className="hint co-none">
          {rows.length
            ? "Nothing matches that."
            : "No call-offs yet. They are raised from a project's Call-offs tab."}
        </p>
      )}

      {!!shown.length && (
        <table className="co-tbl">
          <thead>
            <tr>
              <th>Submitted</th><th>Reference</th><th>Site</th>
              <th>Customer</th><th>Work Type</th><th>Contact</th>
              <th>Preferred</th><th>Status</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* One call-off: what was asked for, and where it has got to. */
function CallOffDetail({ row, onBack, onMove }) {
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
      </div>

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
        ) : (
          <table className="co-tbl flat">
            <thead>
              <tr>
                <th>{mode === "ColumnList" ? "Column" : mode === "Span" ? "Section" : "Plot"}</th>
                {mode === "Span" && <><th>D/P</th><th>Length</th></>}
                <th>Energisation date</th>
              </tr>
            </thead>
            <tbody>
              {row.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <strong>
                      {mode === "PlotList" ? it.Plot
                        : mode === "ColumnList" ? it.Street_Light_ID
                          : it.Plots}
                    </strong>
                  </td>
                  {mode === "Span" && (
                    <>
                      <td>{it.D_or_P || "\u2014"}</td>
                      <td>{it.Estimated_Length_m ? `${it.Estimated_Length_m} m` : "\u2014"}</td>
                    </>
                  )}
                  <td>{fmt(it.Energisation_Date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="co-card">
        <h3>Status</h3>
        <p className="hint">Move this call-off through its workflow.</p>
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

      <Assignments row={row} />

      <div className="co-card">
        <h3>Status</h3>
        <p className="hint">Move this call-off through its workflow.</p>
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

  async function load() {
    try {
      const [tt, map, tm, tc, tr, cr, asg] = await Promise.all([
        adminList("Task_Type"), adminList("Work_Type_Task_Type"),
        adminList("Team"), adminList("Team_Craft"), adminList("Team_Region"),
        adminList("Craft"), adminList("Call_Off_Assignment"),
      ]);
      const wd = await adminList("Call_Off_Work_Day").catch(() => ({ rows: [] }));
      setWorkDays(wd.rows || []);
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
      Start_Date: a.Start_Date,
      End_Date: a.End_Date,
      plots: parsePlots(a.Plot_Range),
      parts: Object.fromEntries(mineDays.map((d) => [d.Work_Date, d.Part])),
      offDays: Object.fromEntries(mineDays.map((d) => [d.Work_Date, !!d.Off_Site])),
    });
    setEditing(a.Assignment_ID);
    setOpenPhase(a.Task_Type_ID);
    setError("");
  }

  function openFor(phase) {
    const floor = earliestStart(phases, mine, phase.Task_Type_ID, plotUniverse);
    setDraft({
      Task_Type_ID: phase.Task_Type_ID,
      Team_ID: "",
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
      /* Marked full and on site unless somebody says otherwise. */
      parts: {},
      offDays: {},
    });
    setEditing(null);
    setOpenPhase(phase.Task_Type_ID);
    setError("");
  }

  const problems = openPhase != null
    ? checkAssignment({ ...draft, Plot_Range: serialisePlots(draft.plots || []) }, {
      phases, assignments: all, today: new Date().toISOString().slice(0, 10),
      exceptId: editing,
    })
    : [];

  async function save() {
    if (problems.length) return;
    setBusy("save");
    try {
      const payload = {
        Submission_ID: row.Submission_ID,
        Task_Type_ID: draft.Task_Type_ID,
        Team_ID: Number(draft.Team_ID),
        Start_Date: draft.Start_Date,
        End_Date: draft.End_Date,
        Plot_Range: serialisePlots(draft.plots) || null,
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
      const days = daysBetween(draft.Start_Date, draft.End_Date);
      try {
        for (const d of old) await adminDelete("Call_Off_Work_Day", d.Work_Day_ID);
        const made = [];
        for (const d of days) {
          made.push(await adminCreate("Call_Off_Work_Day", {
            Assignment_ID: id,
            Work_Date: d,
            Part: draft.parts?.[d] || "Full",
            Off_Site: !!draft.offDays?.[d],
          }));
        }
        setWorkDays((xs) => [
          ...xs.filter((x) => Number(x.Assignment_ID) !== Number(id)),
          ...made,
        ]);
      } catch (dayErr) {
        setError(`Saved, but the day breakdown failed: ${dayErr.message}`);
      }

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
        const can = eligibleTeams(teams, {
          teamCrafts, teamRegions, craftId: ph.Craft_ID, regionId: null,
        });
        const floor = earliestStart(phases, mine, ph.Task_Type_ID, plotUniverse);

        return (
          <div className="asg-phase" key={ph.Task_Type_ID}>
            <div className="asg-head">
              <span className="asg-n">{i + 1}</span>
              <strong>{ph.Task_Type_Name}</strong>
              <span className="asg-craft">
                {ph.Craft_ID
                  ? `needs ${craftName(ph.Craft_ID) ?? "a craft"} \u00b7 ${can.length} team${can.length === 1 ? "" : "s"}`
                  : `any team \u00b7 ${can.length}`}
              </span>
              <button className="btn accent sm"
                disabled={!can.length}
                onClick={() => openFor(ph)}>
                + Assign
              </button>
            </div>

            {/* Why a phase cannot start yet, before somebody tries. */}
            {floor && (
              <p className="asg-floor">
                {`Cannot start before ${floor.date} \u2014 ${floor.phase} begins then.`}
              </p>
            )}

            {!can.length && (
              <p className="asg-none warn">
                {ph.Craft_ID
                  ? `No active team holds ${craftName(ph.Craft_ID) ?? "this craft"}.`
                  : "No active teams."}
              </p>
            )}

            {!rows.length && can.length > 0 && (
              <p className="asg-none">Nobody assigned yet.</p>
            )}

            {rows.map((a) => (
              <div className="asg-row" key={a.Assignment_ID}>
                <span className="asg-team">{teamName(a.Team_ID)}</span>
                <span className="asg-when">{a.Start_Date} to {a.End_Date}</span>
                <span className="asg-plots">{a.Plot_Range || "all plots"}</span>
                {/* How much of the booking is off site, from the days
                    rather than the booking — a week with one off-site
                    Tuesday reads as one day, not as a whole week. */}
                {(() => {
                  const off = workDays.filter((d) =>
                    Number(d.Assignment_ID) === Number(a.Assignment_ID) && d.Off_Site);
                  return off.length
                    ? <span className="asg-off-tag">{off.length} off site</span>
                    : null;
                })()}
                <button className="asg-edit"
                  onClick={() => editFor(a)}>Edit</button>
                <button className="co-x" aria-label="Delete"
                  disabled={busy === `d:${a.Assignment_ID}`}
                  onClick={() => remove(a.Assignment_ID)}>&times;</button>
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
                  <select className="asg-team-sel" value={draft.Team_ID}
                    aria-label="Team"
                    onChange={(e) => setDraft((d) => ({ ...d, Team_ID: e.target.value }))}>
                    <option value="">Team…</option>
                    {can.map((t) => (
                      <option key={t.Team_ID} value={t.Team_ID}>{t.Team_Name}</option>
                    ))}
                  </select>
                  <input className="asg-date" type="date" value={draft.Start_Date}
                    aria-label="Start date"
                    onChange={(e) => setDraft((d) => ({ ...d, Start_Date: e.target.value }))} />
                  <span className="asg-to">to</span>
                  <input className="asg-date" type="date" value={draft.End_Date}
                    aria-label="End date"
                    onChange={(e) => setDraft((d) => ({ ...d, End_Date: e.target.value }))} />

                </div>

                {/* How much of each day, because a gang is not always
                    there all day — half a day here and half at the next
                    site is ordinary, and booking whole days overstates
                    what the team can take on. */}
                {daysBetween(draft.Start_Date, draft.End_Date).length > 0 && (
                  <div className="asg-days">
                    <div className="asg-days-head">
                      <strong>Days</strong>
                      <span className="asg-days-tot">
                        {(() => {
                          const ds = daysBetween(draft.Start_Date, draft.End_Date);
                          const parts = Object.fromEntries(
                            ds.map((d) => [d, draft.parts?.[d] || "Full"]));
                          const t = dayTotal(parts);
                          return `${t} day${t === 1 ? "" : "s"}`;
                        })()}
                      </span>
                    </div>
                    {daysBetween(draft.Start_Date, draft.End_Date).map((d) => {
                      const part = draft.parts?.[d] || "Full";
                      return (
                        <div className="asg-day" key={d}>
                          <span className="asg-day-d">{fmt(d)}</span>
                          {/* One of the three, never two: a day is a
                              whole day or one half of it, and "AM and
                              PM" is a full day written twice. */}
                          {["Full", "AM", "PM"].map((opt) => (
                            <button key={opt} type="button"
                              className={part === opt ? "asg-part on" : "asg-part"}
                              aria-pressed={part === opt}
                              onClick={() => setDraft((dd) => ({
                                ...dd, parts: { ...(dd.parts || {}), [d]: opt },
                              }))}>
                              {opt === "Full" ? "Full day" : opt}
                            </button>
                          ))}
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
                    a range by hand, and a pill cannot produce "1-4, 4". */}
                {plotUniverse.length > 0 && (
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
                  <button className="btn accent sm" disabled={!!busy || problems.length > 0}
                    onClick={save}>{busy === "save" ? "Saving…" : "Save assignment"}</button>
                  <button className="btn ghost sm"
                    onClick={() => { setOpenPhase(null); setEditing(null); }}>
                    Cancel
                  </button>
                </div>

                {/* Everything wrong at once, so three problems are not
                    found across three attempts to save. */}
                {problems.length > 0 && (
                  <ul className="asg-problems">
                    {problems.map((t, k) => <li key={k}>{t}</li>)}
                  </ul>
                )}
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
.asg-floor { margin: 7px 0 0; font: 600 11px inherit; color: #92400e; }
.asg-none { margin: 8px 0 0; font-size: 12px; color: var(--muted); font-style: italic; }
.asg-none.warn { color: #b45309; font-style: normal; font-weight: 600; }
.asg-row { display: flex; align-items: center; gap: 12px; margin-top: 8px;
  padding: 6px 9px; background: var(--bg); border-radius: 6px; font-size: 12.5px; }
.asg-team { font-weight: 700; }
.asg-when { color: var(--muted); }
.asg-plots { margin-left: auto; font-weight: 600; }
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
/* Wide enough for dd/mm/yyyy and the picker button, and no wider. */
.asg-date { width: 140px; }
.asg-to { font-size: 11.5px; color: var(--muted); }
.asg-off { display: inline-flex; align-items: center; gap: 6px; margin-left: 4px;
  font: 600 11.5px inherit; cursor: pointer; }
.asg-off input { width: auto; }

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
.co-todo { border-style: dashed; }
.co-todo p { margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.6; }
`;
