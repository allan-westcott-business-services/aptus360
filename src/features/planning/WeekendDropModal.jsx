import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { WEEKEND_PARTS, resizeByHalves, availablePart } from "../calloffs/assignments.js";

/* Where the weekend halves go.

   ── When this appears ──

   A booking dragged so that part of it lands on a Saturday or a Sunday.
   A full day on the Friday nudged forward by a morning is an afternoon
   on the Friday and a morning that has to go somewhere: Saturday
   morning, Saturday afternoon, Sunday morning, Sunday afternoon, or
   Monday. That is a decision about whether a gang is working the
   weekend, and it is not one the board should make quietly on the
   strength of where a cursor was let go.

   ── Why it is the weekend rule and not a one-off placement ──

   The five destinations in that question are four weekend halves and
   "none of them". Tick the halves this booking works and the schedule
   falls out: an untaken half is stepped over, so ticking nothing puts
   the remainder on Monday morning. That is exactly the rule stored on
   the assignment by 0133, so answering the question here answers it for
   good rather than for this drag — and the next drag knows.

   ── The preview is the point ──

   Nobody can hold "afternoon, morning, full day, morning" in their head
   from four checkboxes. So the resulting days are laid out, live, from
   the same function that will write them. What is shown is what is
   about to be saved. */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PART_LABEL = { Full: "Full day", AM: "Morning", PM: "Afternoon" };

const pretty = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y) return iso;
  const dt = new Date(y, m - 1, d, 12);
  return `${DOW[dt.getDay()]} ${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

const isWeekendISO = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y) return false;
  const w = new Date(y, m - 1, d, 12).getDay();
  return w === 0 || w === 6;
};

/* The first day at or after `from` that the ticked halves allow. */
function nextWorked(from, weekend) {
  let d = from;
  for (let i = 0; i < 8; i++) {
    const part = availablePart(d, weekend);
    if (part) return { date: d, part, offSite: false };
    const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number);
    const x = new Date(y, m - 1, dd, 12);
    x.setDate(x.getDate() + 1);
    const p = (n) => String(n).padStart(2, "0");
    d = `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  }
  return null;
}

export default function WeekendDropModal({
  kind = "move", item, days = [], startShift = 0, endShift = 0, date,
  weekend, onCancel, onConfirm,
}) {
  const drag = useDragHandle();

  /* ── Starts empty, deliberately ──

     Not from what the booking already claims. That an assignment worked
     last Saturday is a decision somebody made about a particular set of
     dates under whatever pressure the programme was under then, and it
     says nothing about this one. Pre-ticking it would turn a question
     into a default, and a default that puts a gang on site at the
     weekend is the wrong thing to get silently.

     What it claimed is shown below instead, as something to read and
     copy in one click if it still holds. */
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(WEEKEND_PARTS.map((w) => [w.key, false])));

  const previous = WEEKEND_PARTS.filter((w) => weekend?.[w.key]);
  const asBefore = () => setDraft(
    Object.fromEntries(WEEKEND_PARTS.map((w) => [w.key, !!weekend?.[w.key]])));

  /* For a phase being given to a gang there is no booking yet — one day
     at the day it was dropped on — so the preview is that day under
     whatever is ticked. */
  const laid = useMemo(() => {
    if (kind === "assign") {
      const on = nextWorked(date, draft);
      return { days: on ? [on] : [], end: on?.date || null };
    }
    return resizeByHalves(days, startShift, endShift, draft) || { days: [], end: null };
  }, [kind, date, days, startShift, endShift, draft]);

  const onWeekend = laid.days.filter((d) => isWeekendISO(d.date));
  const changed = WEEKEND_PARTS.some((w) => !!draft[w.key] !== !!weekend?.[w.key]);

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onCancel(); }}>
      <div className="wkd" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Weekend working">
        <style>{CSS}</style>

        <div className="wkd-head" {...drag.handleProps}>
          <div>
            <h3>This lands on the weekend</h3>
            <p className="wkd-sub">
              {item.ref} &middot; {item.phase}. Tick the halves this gang is working
              this weekend. Anything left untaken carries on to the next weekday.
            </p>
          </div>
          <button className="fe-x" onClick={onCancel} aria-label="Close">&times;</button>
        </div>

        <div className="wkd-body">
          <div className="wkd-picks">
            {WEEKEND_PARTS.map((w) => (
              <button key={w.key} type="button"
                className={draft[w.key] ? "wkd-pick on" : "wkd-pick"}
                aria-pressed={!!draft[w.key]}
                onClick={() => setDraft((d) => ({ ...d, [w.key]: !d[w.key] }))}>
                {w.label}
              </button>
            ))}
            {/* The fifth answer in the question, and the one that is not
                a tick: none of them. A button rather than a note,
                because "just push it to Monday" is a thing somebody
                decides, and hunting for the four they need to untick is
                not how they should have to say it. */}
            <button type="button" className="wkd-pick none"
              onClick={() => setDraft(Object.fromEntries(
                WEEKEND_PARTS.map((w) => [w.key, false])))}>
              None &mdash; next weekday
            </button>
          </div>

          {/* What it was last set to. Offered rather than applied: it is
              a fair guess and a bad default. */}
          {!!previous.length && (
            <p className="wkd-prev">
              Last time this booking worked {previous.map((w) => w.label).join(", ")}.
              <button type="button" onClick={asBefore}>Use that again</button>
            </p>
          )}

          <div className="wkd-preview">
            <p className="wkd-preview-t">
              {laid.days.length} day{laid.days.length === 1 ? "" : "s"},
              {" "}{onWeekend.length
                ? `${onWeekend.length} on the weekend`
                : "none on the weekend"}
            </p>
            <ul>
              {laid.days.map((d) => (
                <li key={d.date} className={isWeekendISO(d.date) ? "wknd" : ""}>
                  <span className="wkd-when">{pretty(d.date)}</span>
                  <span className="wkd-part">{PART_LABEL[d.part] || d.part}</span>
                  {d.offSite && <span className="wkd-off">Off site</span>}
                </li>
              ))}
            </ul>
            {!laid.days.length && (
              <p className="wkd-empty">
                There is nowhere for this to go. Tick at least one half, or move it
                somewhere else.
              </p>
            )}
          </div>
        </div>

        <div className="fe-foot">
          {/* Said plainly, because it is the part somebody will not
              expect: this answer sticks to the booking. */}
          <span className="wkd-note">
            {changed ? "This booking's weekend working will be updated." : ""}
          </span>
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onCancel}>
            {kind === "assign" ? "Cancel" : "Cancel the move"}
          </button>
          <button className="btn accent" disabled={!laid.days.length}
            onClick={() => onConfirm(draft)}>
            {kind === "assign" ? "Assign it" : "Move it"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.wkd { background: var(--white); border-radius: 12px; width: min(500px, 94vw);
  max-height: 86vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.wkd-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.wkd-head > div { flex: 1; }
.wkd-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.wkd-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.wkd-body { padding: 13px 18px; overflow-y: auto; flex: 1; }
.wkd-picks { display: flex; flex-wrap: wrap; gap: 6px; }
.wkd-pick { border: 1px solid var(--border); background: var(--white); border-radius: 20px;
  padding: 4px 12px; font: 600 12px inherit; color: var(--text); cursor: pointer; }
.wkd-pick.on { background: #39467B; border-color: #39467B; color: #fff; }
.wkd-pick.none { margin-left: auto; border-style: dashed; }
.wkd-preview { margin-top: 13px; }
.wkd-preview-t { margin: 0 0 5px; font-size: 11.5px; color: var(--muted); font-weight: 600; }
.wkd-preview ul { margin: 0; padding: 0; list-style: none; border: 1px solid var(--border);
  border-radius: 7px; overflow: hidden; }
.wkd-preview li { display: flex; align-items: center; gap: 10px; padding: 5px 10px;
  font-size: 12.5px; border-bottom: 1px solid var(--border); }
.wkd-preview li:last-child { border-bottom: 0; }
.wkd-preview li.wknd { background: #fffbeb; }
.wkd-when { font-weight: 600; min-width: 92px; }
.wkd-part { color: var(--muted); }
.wkd-off { margin-left: auto; font-size: 10px; font-weight: 700; color: #991b1b;
  background: #fef2f2; border: 1px solid #fca5a5; border-radius: 20px; padding: 0 7px; }
.wkd-empty { margin: 8px 0 0; font-size: 12px; color: #991b1b; }
.wkd-note { font-size: 11px; color: var(--muted); }
.wkd-prev { margin: 9px 0 0; font-size: 11.5px; color: var(--muted); }
.wkd-prev button { border: 0; background: transparent; color: #39467B; cursor: pointer;
  font: 700 11.5px inherit; padding: 0 0 0 6px; text-decoration: underline; }
`;
