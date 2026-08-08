import { useDragHandle } from "../../lib/useDragHandle.js";
import { pillStyle } from "../../lib/pillColour.js";

/* What is behind a bar.

   The board answers "when"; this answers everything else, because a bar
   two centimetres wide can carry a reference and a phase and nothing
   more. Read-only on purpose: changing a booking means checking whether
   the team holds the craft, covers the region and is free — the rules
   in calloffs/assignments.js — and half of that checking sitting here
   as well is how the two come to disagree about what is allowed.

   So this ends at a way back to the call-off, where the editing is. */

const fmt = (d) => {
  if (!d) return "\u2014";
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return M && dd ? `${dd}-${M}-${y}` : String(d);
};

const PART_NAMES = { Full: "Full day", AM: "Morning", PM: "Afternoon" };

export default function AssignmentModal({ item, data, utilities = [], onClose }) {
  const drag = useDragHandle();

  const sub = item.sub;
  const project = (data.projects || [])
    .find((p) => Number(p.Project_ID) === Number(sub?.Project_ID));
  const team = (data.teams || [])
    .find((t) => Number(t.Team_ID) === Number(item.raw?.Team_ID));
  const region = (data.regions || [])
    .find((r) => Number(r.Region_ID) === Number(project?.Region_ID));
  const manager = (data.people || [])
    .find((p) => Number(p.Person_ID) === Number(project?.Project_Manager_ID));
  const workType = (data.workTypes || [])
    .find((w) => Number(w.Work_Type_ID) === Number(sub?.Work_Type_ID));

  const days = (data.workDays || [])
    .filter((d) => Number(d.Assignment_ID) === Number(item.assignmentId))
    .sort((a, b) => String(a.Work_Date).localeCompare(String(b.Work_Date)));

  /* Halves, not days. A booking of three mornings is a day and a half
     of somebody's week, and calling it three days is the number that
     ends up in a capacity argument. */
  const halves = days.length
    ? days.reduce((n, d) => n + ((d.Part === "AM" || d.Part === "PM") ? 1 : 2), 0)
    : null;

  const status = (data.statuses || [])
    .find((s) => String(s.Status) === String(item.raw?.Status));

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="pam" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Booking">
        <style>{CSS}</style>

        <div className="pam-head" style={{ background: item.colour }} {...drag.handleProps}>
          <div>
            <p className="pam-kicker">{item.phase}</p>
            <h3>
              {item.ref}
              {sub?.Site_Name ? ` \u00b7 ${sub.Site_Name}` : ""}
            </h3>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="pam-body">
          <dl className="pam-facts">
            <dt>Team</dt>
            <dd>{team?.Team_Name || `Team #${item.raw?.Team_ID}`}</dd>

            <dt>Status</dt>
            <dd>
              {item.raw?.Status
                ? (
                  <span className="pam-pill"
                    style={pillStyle(status?.Colour, status?.Text_Colour)}>
                    {item.raw.Status}
                  </span>
                )
                : "\u2014"}
            </dd>

            <dt>Dates</dt>
            <dd>
              {fmt(item.startDate)} &rarr; {fmt(item.endDate)}
              {halves != null && (
                <span className="pam-sub">
                  {" "}&middot; {halves / 2} day{halves === 2 ? "" : "s"} of work
                </span>
              )}
            </dd>

            <dt>Project</dt>
            <dd>
              {project
                ? `${project.Display_Ref || project.Project_Ref || `#${project.Project_ID}`}`
                : "\u2014 not linked to a project \u2014"}
            </dd>

            <dt>Manager</dt>
            <dd>{manager?.Person_Name || "\u2014"}</dd>

            <dt>Region</dt>
            <dd>{region?.Region || "\u2014"}</dd>

            <dt>Work type</dt>
            <dd>{workType?.Work_Type_Name || "\u2014"}</dd>

            {item.raw?.Plot_Range && (
              <>
                <dt>Plots</dt>
                <dd>{item.raw.Plot_Range}</dd>
              </>
            )}

            <dt>Utilities</dt>
            <dd className="pam-utils">
              {utilities.length
                ? utilities.map((u) => (
                  <span key={u.Utility_ID} className="pam-util">
                    <i style={{ background: u.Colour || "#94a3b8" }} />
                    {u.Utility}
                  </span>
                ))
                : <span className="pam-none">No asset value agreement on this project</span>}
            </dd>

            <dt>Requested</dt>
            <dd>
              {fmt(sub?.Preferred_Date)}
              {/* The gap between what was asked for and what was
                  booked. It is the number a planner is challenged on,
                  and working it out from two dates in different parts
                  of the panel is exactly the sort of arithmetic that
                  gets done wrong out loud. */}
              {sub?.Preferred_Date && item.startDate && (
                <span className="pam-sub"> {slip(sub.Preferred_Date, item.startDate)}</span>
              )}
            </dd>
          </dl>

          {!!days.length && (
            <div className="pam-days">
              <p className="pam-days-t">Days booked</p>
              <ul>
                {days.map((d) => (
                  <li key={d.Work_Day_ID}>
                    <span>{fmt(d.Work_Date)}</span>
                    <span className="pam-part">{PART_NAMES[d.Part] || d.Part || "Full day"}</span>
                    {d.Off_Site && <span className="pam-off">Off site</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!days.length && (
            <p className="pam-nodays">
              No day breakdown on this booking, so the bar is drawn from its start and
              end dates. Opening it on the call-off and saving will record the days.
            </p>
          )}
        </div>

        <div className="fe-foot">
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* How far the booking sits from the date the customer asked for. */
function slip(preferred, actual) {
  const ms = (d) => {
    const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, dd).getTime();
  };
  const days = Math.round((ms(actual) - ms(preferred)) / 86400000);
  if (!Number.isFinite(days) || days === 0) return "\u00b7 booked on the day requested";
  const n = Math.abs(days);
  return `\u00b7 ${n} day${n === 1 ? "" : "s"} ${days > 0 ? "later" : "earlier"}`;
}

const CSS = `
.pam { background: var(--white); border-radius: 12px; width: min(560px, 94vw);
  max-height: 88vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(15,23,42,.28); overflow: hidden; }
.pam-head { display: flex; align-items: flex-start; gap: 10px; padding: 14px 18px;
  color: #fff; }
.pam-head h3 { margin: 2px 0 0; font-size: 16px; font-weight: 700; }
.pam-kicker { margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
  opacity: .8; }
.pam-head > div { flex: 1; min-width: 0; }
.pam-head .fe-x { color: #fff; }
.pam-body { padding: 15px 18px; overflow-y: auto; flex: 1; }
.pam-facts { display: grid; grid-template-columns: 108px 1fr; gap: 8px 14px; margin: 0;
  font-size: 13px; align-items: baseline; }
.pam-facts dt { color: var(--muted); font-weight: 600; font-size: 12px; }
.pam-facts dd { margin: 0; }
.pam-sub { color: var(--muted); font-size: 12px; }
.pam-pill { display: inline-block; border-radius: 20px; padding: 1px 9px;
  font-size: 11px; font-weight: 700; }
.pam-utils { display: flex; flex-wrap: wrap; gap: 10px; }
.pam-util { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; }
.pam-util i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.pam-none { color: var(--muted); font-size: 12px; }
.pam-days { margin-top: 14px; }
.pam-days-t { margin: 0 0 5px; font-size: 12px; font-weight: 600; color: var(--muted); }
.pam-days ul { margin: 0; padding: 0; list-style: none; border: 1px solid var(--border);
  border-radius: 7px; overflow: hidden; }
.pam-days li { display: flex; align-items: center; gap: 10px; padding: 5px 10px;
  font-size: 12.5px; border-bottom: 1px solid var(--border); }
.pam-days li:last-child { border-bottom: 0; }
.pam-part { color: var(--muted); }
.pam-off { margin-left: auto; font-size: 10px; font-weight: 700; color: #991b1b;
  background: #fef2f2; border: 1px solid #fca5a5; border-radius: 20px; padding: 0 7px; }
.pam-nodays { margin: 14px 0 0; font-size: 12px; color: var(--muted); }
`;
