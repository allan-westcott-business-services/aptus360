import { supabase, json, fail } from "./_supabase.js";

/* Dragging an assignment along the schedule.

   ── Why this is not a PATCH on Call_Off_Assignment ──

   Because moving one is not one write. The assignment carries a start
   and an end; the days under it carry which half of which day is being
   worked and whether that day is off site. Shift the assignment alone
   and the days stay where they were — the bar moves on the board and
   the work instruction still says Tuesday.

   The generic admin endpoint cannot do it: it writes one row in one
   table and knows nothing about what hangs off that row. So this exists
   to make "move it three days" a single thing that either happens or
   does not, rather than four requests from a browser with no way to
   undo the two that succeeded.

   ── Days, not milliseconds ──

   The shift is whole days, because that is what the schema stores. The
   original encoded the AM/PM start in the time — 08:00 or 13:00 on a
   timestamptz — and dragging changed it. Here the half is a fact
   recorded per day in Call_Off_Work_Day."Part", so a drag along the
   board moves which days are worked and leaves the halves exactly as
   somebody set them. A morning stays a morning three days later, which
   is what dragging a bar means and what the old encoding could not say
   without also moving the clock.

   ── A separate file, deliberately ──

   The recurring fault this codebase has been bitten by four times is a
   conditional branch sitting under an unconditional one for the same
   method, never running and failing with the wrong shape rather than an
   error. One endpoint, one file, one thing it does. */

const isoDay = (d) => {
  const x = new Date(`${d}T00:00:00Z`);
  return Number.isFinite(x.getTime()) ? x : null;
};

const shiftDay = (d, days) => {
  const x = isoDay(d);
  if (!x) return null;
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
};

/* ── The weekend, on the way past ──

   A drag is a number of calendar days, and a booking shifted three days
   can land a Friday on a Monday or a Thursday on a Sunday. The second
   is the one that matters: without this, dragging a bar would put work
   on a weekend nobody has said they are working, and the first anyone
   would know is a gang not turning up.

   So the days are re-laid rather than shifted. The booking keeps its
   length and its shape — which day is a morning, which is off site —
   and steps over the weekend halves the assignment does not work,
   exactly as the form does when it lays them in the first place.

   The rule is duplicated here rather than imported from
   features/calloffs/assignments.js on purpose: nothing under
   netlify/functions may import from src/, because these run with the
   service-role key and that boundary is the reason the key is safe.
   The two are checked against each other by the test rather than by
   being one file. */
const partOn = (date, a) => {
  const x = isoDay(date);
  if (!x) return null;
  const d = x.getUTCDay();
  if (d !== 0 && d !== 6) return "Full";
  const am = !!(d === 6 ? a.Sat_AM : a.Sun_AM);
  const pm = !!(d === 6 ? a.Sat_PM : a.Sun_PM);
  if (am && pm) return "Full";
  if (am) return "AM";
  if (pm) return "PM";
  return null;
};

/* `count` working days from `from` inclusive, stepping over the halves
   this assignment does not work. */
function layDays(from, count, a) {
  const out = [];
  let cursor = from;
  let guard = 0;
  while (out.length < count && guard++ < 400) {
    const part = partOn(cursor, a);
    if (part) out.push({ date: cursor, part });
    cursor = shiftDay(cursor, 1);
    if (!cursor) break;
  }
  return out;
}

export default async function handler(req, context) {
  const db = supabase();
  const id = context?.params?.id;
  try {
    if (req.method !== "PATCH" && req.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }

    const { days } = await req.json();
    const shift = Number(days);
    if (!Number.isInteger(shift)) {
      return json({ error: "days must be a whole number of days." }, 400);
    }
    /* A drag that lands where it started is not an error and not a
       write. Answered rather than rejected, so the board can call this
       without first working out whether it needs to. */
    if (shift === 0) return json({ moved: 0, days: 0 });

    const { data: asgn, error: readErr } = await db
      .from("Call_Off_Assignment")
      .select("Assignment_ID,Start_Date,End_Date,Sat_AM,Sat_PM,Sun_AM,Sun_PM")
      .eq("Assignment_ID", id)
      .single();
    if (readErr) throw readErr;

    const { data: existing } = await db
      .from("Call_Off_Work_Day")
      .select("Work_Day_ID,Work_Date,Part,Off_Site")
      .eq("Assignment_ID", id)
      .order("Work_Date");
    const had = existing || [];

    /* Where the booking now starts. Shifted, then pushed forward to the
       first day it can work — dragging onto a Saturday it does not work
       means it begins on the Monday, not that it begins on a day off. */
    let start = shiftDay(asgn.Start_Date, shift);
    if (!start) {
      return json({ error: "This assignment has no usable start date." }, 400);
    }
    for (let i = 0; i < 8 && !partOn(start, asgn); i++) start = shiftDay(start, 1);
    if (!partOn(start, asgn)) {
      return json({
        error: "This assignment works no days of the week, so it cannot be placed.",
      }, 400);
    }

    /* Its length: however many days it works. From the day rows where
       there are any, since those are what was agreed; from the date
       span where there are none, which is a booking made before that
       table existed. */
    const length = had.length
      || layDays(asgn.Start_Date,
        Math.max(1, Math.round(
          (isoDay(asgn.End_Date) - isoDay(asgn.Start_Date)) / 86400000) + 1),
        asgn).length
      || 1;

    const laid = layDays(start, length, asgn);
    const end = laid.length ? laid[laid.length - 1].date : start;

    const { error: updErr } = await db
      .from("Call_Off_Assignment")
      .update({ Start_Date: start, End_Date: end })
      .eq("Assignment_ID", id);
    if (updErr) throw updErr;

    /* The days move with it, each by the same shift. Read then written
       one at a time rather than recomputed from the new range: the days
       are not necessarily every day between start and end — a gang off
       on the Wednesday has a gap — and rebuilding the range would
       quietly fill it in.

       Tolerated missing. An assignment made before the day table
       existed has none, and moving it is still moving it. */
    let movedDays = 0;
    for (let i = 0; i < had.length && i < laid.length; i++) {
      const row = had[i];
      const to = laid[i];
      /* Off site travels with the day; the part is taken from where it
         has landed. A full day dragged onto a Saturday morning is a
         morning, because that is all the assignment works then — and
         keeping "Full" would be the row disagreeing with the rule
         above it. */
      const { error } = await db
        .from("Call_Off_Work_Day")
        .update({ Work_Date: to.date, Part: to.part === "Full" ? (row.Part || "Full") : to.part })
        .eq("Work_Day_ID", row.Work_Day_ID);
      if (!error) movedDays += 1;
    }

    return json({
      Assignment_ID: Number(id),
      Start_Date: start,
      End_Date: end,
      days: shift,
      movedDays,
      /* Reported rather than thrown: the assignment has already moved,
         and failing here would leave the caller believing nothing
         happened when the larger half of it did. */
      partial: movedDays !== had.length,
    });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/planning/assignments/:id/move" };
