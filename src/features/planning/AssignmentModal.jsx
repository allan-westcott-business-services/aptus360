import { useState, useEffect } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { adminList, adminCreate, adminUpdate } from "../../api/admin.js";
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

  /* The instruction flag and the notes both live on the booking, so
     they are read and written here rather than passed down. The board
     does not need them to draw a bar. */
  const [wiCreated, setWiCreated] = useState(!!item.raw?.Work_Instruction_Created);
  const [savingWi, setSavingWi] = useState(false);
  const [comments, setComments] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    adminList("Call_Off_Assignment_Comment")
      .then((r) => {
        if (!alive) return;
        setComments((r.rows || [])
          .filter((c) => Number(c.Assignment_ID) === Number(item.raw?.Assignment_ID))
          .sort((a, b) => String(b.Created_At).localeCompare(String(a.Created_At))));
      })
      /* Tolerated missing: a database without 0150 has no comments
         table, and a modal that refused to open because of that would
         be worse than one with an empty list. */
      .catch(() => {});
    return () => { alive = false; };
  }, [item.raw?.Assignment_ID]);

  async function setWorkInstruction(next) {
    setSavingWi(true);
    setWiCreated(next);            /* answers immediately; the round trip follows */
    try {
      await adminUpdate("Call_Off_Assignment", item.raw.Assignment_ID,
        { Work_Instruction_Created: next });
      setErr("");
    } catch (e) {
      setWiCreated(!next);         /* put it back rather than lie */
      setErr(e.message);
    } finally { setSavingWi(false); }
  }

  async function addComment() {
    const text = note.trim();
    if (!text) return;
    setBusy(true);
    try {
      const made = await adminCreate("Call_Off_Assignment_Comment", {
        Assignment_ID: item.raw.Assignment_ID, Comment: text,
      });
      setComments((xs) => [made, ...xs]);
      setNote("");
      setErr("");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  /* How much of each day. The board already works this out for the bar;
     said in words here because "Full day" is what a work instruction
     says and "2 halves" is not. */
  const durationLabel = (() => {
    const parts = (data.workDays || [])
      .filter((d) => Number(d.Assignment_ID) === Number(item.raw?.Assignment_ID))
      .map((d) => d.Part || "Full");
    const set = new Set(parts);
    if (!parts.length) return item.lengthHalves === 1 ? "Half day" : "Full day";
    if (set.size === 1) return set.has("AM") ? "AM" : set.has("PM") ? "PM" : "Full day";
    return parts.map((p) => (p === "Full" ? "Full day" : p)).join(", ");
  })();

  /* The lines the call-off was raised for. The planning payload does
     not carry a call-off's sections, so this is what the board knows:
     the phase, the plots and the utilities on it. Where the sections
     are available they are listed instead. */
  const workItems = (() => {
    const rows = item.sub?.items || [];
    if (rows.length) {
      return rows.map((r, i) => ({
        id: r.Span_ID ?? r.Service_Plot_ID ?? i,
        text: r.Plots || r.Plot || `Item ${i + 1}`,
        utilities,
      }));
    }
    if (!item.phase) return [];
    return [{
      id: item.id,
      text: [item.phase, item.raw?.Plot_Range ? `Plots ${item.raw.Plot_Range}` : null,
        item.offSite ? "Off site" : null].filter(Boolean).join(" \u00b7 "),
      utilities,
    }];
  })();

  /* Utilities, mains or service, on or off site, and where on the run.
     Each part omitted where the drawing does not say it. */
  const description = (() => {
    const bits = [];
    const utils = (item.utilityNames === null
      ? utilities
      : utilities.filter((u) => (item.utilityNames || [])
        .includes(String(u.Utility || "").toLowerCase().trim())))
      .map((u) => String(u.Utility || "")[0])
      .filter(Boolean);
    const wt = (data.workTypes || [])
      .find((w) => Number(w.Work_Type_ID) === Number(item.sub?.Work_Type_ID));
    if (utils.length && wt) bits.push(`${utils.join("/")} ${wt.Work_Type_Name}`);
    else if (wt) bits.push(wt.Work_Type_Name);
    bits.push(item.offSite ? "Off site" : "Onsite");
    if (item.sub?.Ground_Unmade) bits.push("Unmade");
    if (item.raw?.Span_ID != null && item.spanLabel) bits.push(item.spanLabel);
    if (item.raw?.Plot_Range) bits.push(`Plots ${item.raw.Plot_Range}`);
    return bits.join(", ");
  })();

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
            {/* The bar falls back to the call-off's reference where
                there is no project, and a heading that looks like any
                other would hide that. Said once, here, rather than
                leaving somebody to notice the number is the wrong
                shape. */}
            {!project && (
              <p className="pam-warn">Not linked to a project</p>
            )}
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="pam-body">
          <dl className="pam-facts">
            {/* What the gang is being sent to do, in the words a work
                instruction uses: utilities, mains or service, on or off
                site, the surface, and where on the run.

                Composed rather than stored, so it cannot fall out of
                step with the booking it describes. Anything the drawing
                does not say is left out rather than guessed \u2014 a
                description that invents a surface is worse than one
                that omits it. */}
            <dt>Job description</dt>
            <dd className="pam-desc">{description || "\u2014"}</dd>

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

            <dt>Call-off</dt>
            <dd>
              {item.apNumber || `#${item.submissionId}`}
              {/* The reference the request was raised under. It has left
                  the bar, where the project number is more use at a
                  glance, so it belongs here — this is where somebody
                  comes to find the call-off in the list. */}
            </dd>

            <dt>Duration</dt>
            <dd>{durationLabel}</dd>

            {/* Whether the paperwork that sends a gang to site exists.
                Not the status: a booking can be scheduled for a
                fortnight's time with nothing written yet, and it is the
                planner's list of what still needs doing. */}
            <dt>Work instruction</dt>
            <dd>
              <label className="pam-check">
                <input type="checkbox" checked={wiCreated} disabled={savingWi}
                  onChange={(e) => setWorkInstruction(e.target.checked)} />
                <span>{wiCreated ? "Created" : "Not created yet"}</span>
              </label>
            </dd>

            <dt>Manager</dt>
            <dd>{manager?.Person_Name || "\u2014"}</dd>

            <dt>Region</dt>
            <dd>{region?.Region || "\u2014"}</dd>

            <dt>Work type</dt>
            <dd>{workType?.Work_Type_Name || "\u2014"}</dd>

            <dt>Weekend</dt>
            <dd>
              {/* Named halves rather than yes or no. "Works weekends"
                  is not something a gang does; being in on Saturday
                  morning is. */}
              {(() => {
                const on = [
                  ["Sat_AM", "Sat AM"], ["Sat_PM", "Sat PM"],
                  ["Sun_AM", "Sun AM"], ["Sun_PM", "Sun PM"],
                ].filter(([k]) => item.raw?.[k]).map(([, l]) => l);
                return on.length
                  ? on.join(", ")
                  : <span className="pam-none">Not worked {"\u2014"} runs on to the next weekday</span>;
              })()}
            </dd>

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

          {/* What the call-off actually asks for, section by section.
              The booking is one gang's share of it; these are the lines
              a work instruction is written from. */}
          {!!workItems.length && (
            <div className="pam-days">
              <p className="pam-days-t">Work items</p>
              <ul className="pam-items">
                {workItems.map((w, i) => (
                  <li key={w.id ?? i}>
                    <span className="pam-item-u">
                      {(w.utilities || []).map((u) => (
                        <i key={u.Utility_ID} title={u.Utility}
                          style={{ background: u.Colour || "#94a3b8" }} />
                      ))}
                    </span>
                    {w.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pam-days">
            <p className="pam-days-t">Comments</p>
            {err && <p className="pam-warn">{err}</p>}
            <div className="pam-add">
              <input value={note} placeholder={"Add a note\u2026"}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addComment(); }} />
              <button className="btn accent sm" disabled={busy || !note.trim()}
                onClick={addComment}>Add</button>
            </div>
            {comments.length ? (
              <ul className="pam-notes">
                {comments.map((c) => (
                  <li key={c.Assignment_Comment_ID}>
                    <span className="pam-note-t">{c.Comment}</span>
                    <span className="pam-note-w">
                      {[c.Created_By, c.Created_At ? fmt(c.Created_At.slice(0, 10)) : null]
                        .filter(Boolean).join(" \u00b7 ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="pam-none">No comments yet.</p>}
          </div>

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
.pam-warn { margin: 3px 0 0; font-size: 11px; font-weight: 700;
  background: rgba(255,255,255,.24); border-radius: 20px; padding: 1px 9px;
  display: inline-block; }
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
.pam-desc { font-weight: 600; }
/* Normal case and left aligned: both inherited from the surrounding
   list, which shouted "CREATED" and centred every note. */
.pam-check { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
.pam-check span { font: 400 13px inherit; text-transform: none; letter-spacing: 0;
  color: var(--text); }
.pam-check input { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }
.pam-item-u { display: inline-flex; gap: 3px; }
.pam-item-u i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.pam-add { display: flex; gap: 6px; margin-bottom: 8px; }
.pam-add input { flex: 1; min-width: 0; font: inherit; font-size: 12.5px;
  padding: 6px 9px; border: 1px solid var(--border); border-radius: 7px; }
.pam-notes { list-style: none; margin: 0; padding: 0; display: flex;
  flex-direction: column; gap: 7px; }
.pam-note-t { font-size: 12.5px; }
.pam-note-w { font-size: 11px; color: var(--muted); }

.pam-days-t { margin: 0 0 5px; font-size: 12px; font-weight: 600; color: var(--muted); }
.pam-days ul { margin: 0; padding: 0; list-style: none; border: 1px solid var(--border);
  border-radius: 7px; overflow: hidden; }
.pam-days li { display: flex; align-items: center; gap: 10px; padding: 5px 10px;
  font-size: 12.5px; border-bottom: 1px solid var(--border); }
.pam-days li:last-child { border-bottom: 0; }

/* After .pam-days li, not before it: that rule centres its contents,
   and these were being overridden by it rather than overriding it. A
   note is a paragraph and reads from the left. */
.pam-items li { align-items: center; gap: 7px; text-align: left; }
.pam-notes li { flex-direction: column; align-items: flex-start; gap: 1px;
  text-align: left; }
.pam-part { color: var(--muted); }
.pam-off { margin-left: auto; font-size: 10px; font-weight: 700; color: #991b1b;
  background: #fef2f2; border: 1px solid #fca5a5; border-radius: 20px; padding: 0 7px; }
.pam-nodays { margin: 14px 0 0; font-size: 12px; color: var(--muted); }
`;
