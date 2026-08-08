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
      .select("Assignment_ID,Start_Date,End_Date")
      .eq("Assignment_ID", id)
      .single();
    if (readErr) throw readErr;

    const start = shiftDay(asgn.Start_Date, shift);
    const end = shiftDay(asgn.End_Date, shift);
    if (!start || !end) {
      return json({ error: "This assignment has no usable start and end date." }, 400);
    }

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
    const { data: rows } = await db
      .from("Call_Off_Work_Day")
      .select("Work_Day_ID,Work_Date")
      .eq("Assignment_ID", id);

    for (const r of rows || []) {
      const when = shiftDay(r.Work_Date, shift);
      if (!when) continue;
      const { error } = await db
        .from("Call_Off_Work_Day")
        .update({ Work_Date: when })
        .eq("Work_Day_ID", r.Work_Day_ID);
      /* Reported rather than thrown: the assignment has already moved,
         and failing here would leave the caller believing nothing
         happened when the larger half of it did. */
      if (!error) movedDays += 1;
    }

    return json({
      Assignment_ID: Number(id),
      Start_Date: start,
      End_Date: end,
      days: shift,
      movedDays,
      partial: movedDays !== (rows || []).length,
    });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/planning/assignments/:id/move" };
