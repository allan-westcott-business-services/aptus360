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

const halfIsWorked = (date, pm, a) => {
  const p = partOn(date, a);
  return !!p && (p === "Full" || p === (pm ? "PM" : "AM"));
};

/* The nearest worked half to a target, stepping whole days in the
   direction of travel and keeping the half it was asked for. Both parts
   of that matter and are argued in features/calloffs/assignments.js,
   where the same rule lives for the browser. */
function resolveStartHalf(date, pm, a, dir) {
  let d = date;
  for (let i = 0; i < 10; i++) {
    if (halfIsWorked(d, pm, a)) return { date: d, pm: !!pm };
    if (halfIsWorked(d, !pm, a)) return { date: d, pm: !pm };
    d = shiftDay(d, dir > 0 ? 1 : -1);
    if (!d) return null;
  }
  return null;
}

/* `halves` laid from a day and a half of it, stepping over the weekend
   halves this assignment does not work. Each entry carries whatever
   travelled with it — off site, so far — and a day is off site if
   either of its halves was. */
function layHalves(start, startPM, halves, a) {
  const rows = [];
  let cursor = start;
  let idx = 0;
  let first = true;
  let guard = 0;
  while (idx < halves.length && guard++ < 400) {
    const avail = partOn(cursor, a);
    if (avail) {
      const canAM = (avail === "Full" || avail === "AM") && !(first && startPM);
      const canPM = avail === "Full" || avail === "PM";
      const taken = [];
      if (canAM && idx < halves.length) taken.push(["AM", halves[idx++]]);
      if (canPM && idx < halves.length) taken.push(["PM", halves[idx++]]);
      if (taken.length) {
        rows.push({
          date: cursor,
          part: taken.length === 2 ? "Full" : taken[0][0],
          offSite: taken.some(([, h]) => !!h?.offSite),
        });
      }
      first = false;
    }
    cursor = shiftDay(cursor, 1);
    if (!cursor) break;
  }
  return rows;
}

/* Applying one booking's move. The handler does this for the booking
   that was dragged and then for each that follows it, which is why it
   is a function and not the body of the handler: a cascade written half
   one way and half another is exactly the kind of difference nobody
   finds until the dates disagree. */
async function applyMove(db, id, { startShift, endShift, asked, toTeam }) {
  const { data: asgn, error: readErr } = await db
    .from("Call_Off_Assignment")
    .select("Assignment_ID,Submission_ID,Task_Type_ID,Team_ID,"
      + "Start_Date,End_Date,Sat_AM,Sat_PM,Sun_AM,Sun_PM")
    .eq("Assignment_ID", id)
    .single();
  if (readErr) throw readErr;

  const rule = asked || asgn;

  const { data: existing } = await db
    .from("Call_Off_Work_Day")
    .select("Work_Day_ID,Work_Date,Part,Off_Site")
    .eq("Assignment_ID", id)
    .order("Work_Date");
  const had = (existing || []).map((r) => ({
    ...r, Work_Date: String(r.Work_Date).slice(0, 10),
  }));

  if (!startShift && !endShift) {
    const patch = { ...(asked || {}), ...(toTeam ? { Team_ID: toTeam } : {}) };
    if (Object.keys(patch).length) {
      const { error } = await db.from("Call_Off_Assignment")
        .update(patch).eq("Assignment_ID", id);
      if (error) throw error;
    }
    return {
      Assignment_ID: Number(id),
      Start_Date: asgn.Start_Date, End_Date: asgn.End_Date,
      movedDays: 0, partial: false,
    };
  }

  if (!had.length) {
    const by = startShift > 0 ? Math.ceil(startShift / 2) : Math.floor(startShift / 2);
    const s = shiftDay(asgn.Start_Date, by);
    const e = shiftDay(asgn.End_Date, by);
    if (!s || !e) throw new Error("This assignment has no usable start and end date.");
    const { error } = await db.from("Call_Off_Assignment")
      .update({
        Start_Date: s, End_Date: e,
        ...(asked || {}), ...(toTeam ? { Team_ID: toTeam } : {}),
      })
      .eq("Assignment_ID", id);
    if (error) throw error;
    return { Assignment_ID: Number(id), Start_Date: s, End_Date: e, movedDays: 0, partial: false };
  }

  let parts = [];
  for (const r of had) {
    const p = r.Part || "Full";
    if (p === "Full") parts.push({ offSite: !!r.Off_Site }, { offSite: !!r.Off_Site });
    else parts.push({ offSite: !!r.Off_Site });
  }

  /* Only the difference between the shifts changes the length; a move
     is equal shifts and changes nothing about the list. Trimming the
     front by startShift and padding the back by endShift is the right
     arithmetic in the wrong order — a two-day booking moved four days
     came out four days long, because slicing eight halves off a list of
     four leaves nothing for the padding to put back.

     The mirror of resizeByHalves in features/calloffs/assignments.js,
     checked against it by test. */
  const grow = endShift - startShift;
  const fresh = (n) => Array(n).fill(null).map(() => ({ offSite: false }));
  if (grow > 0) {
    parts = startShift === 0 ? [...parts, ...fresh(grow)] : [...fresh(grow), ...parts];
  } else if (grow < 0) {
    parts = startShift === 0
      ? parts.slice(0, parts.length + grow)
      : parts.slice(-grow);
  }

  if (!parts.length) throw new Error("A booking cannot be shorter than half a day.");

  const firstPM = (had[0].Part || "Full") === "PM";
  const pos = (firstPM ? 1 : 0) + startShift;
  const target = shiftDay(had[0].Work_Date, Math.floor(pos / 2));
  if (!target) throw new Error("This assignment has no usable start date.");
  const startHalf = resolveStartHalf(target, ((pos % 2) + 2) % 2 === 1,
    rule, startShift < 0 ? -1 : 1);
  if (!startHalf) throw new Error("This assignment works no half of any day.");

  const laid = layHalves(startHalf.date, startHalf.pm, parts, rule);
  if (!laid.length) throw new Error("There was nowhere to put this booking.");
  const start = laid[0].date;
  const end = laid[laid.length - 1].date;

  const { error: updErr } = await db
    .from("Call_Off_Assignment")
    .update({
      Start_Date: start, End_Date: end,
      ...(asked || {}), ...(toTeam ? { Team_ID: toTeam } : {}),
    })
    .eq("Assignment_ID", id);
  if (updErr) throw updErr;

  let movedDays = 0;
  for (let i = 0; i < laid.length; i++) {
    const to = laid[i];
    const row = had[i];
    const values = {
      Assignment_ID: Number(id),
      Work_Date: to.date,
      Part: to.part,
      Off_Site: to.offSite,
    };
    const { error } = row
      ? await db.from("Call_Off_Work_Day").update(values).eq("Work_Day_ID", row.Work_Day_ID)
      : await db.from("Call_Off_Work_Day").insert(values);
    if (!error) movedDays += 1;
  }
  const spare = had.slice(laid.length).map((r) => r.Work_Day_ID);
  if (spare.length) {
    await db.from("Call_Off_Work_Day").delete().in("Work_Day_ID", spare);
  }

  return {
    Assignment_ID: Number(id),
    Start_Date: start, End_Date: end,
    movedDays,
    partial: movedDays !== laid.length,
  };
}

export default async function handler(req, context) {
  const db = supabase();
  const id = context?.params?.id;
  try {
    if (req.method !== "PATCH" && req.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }

    const body = await req.json();
    /* Half-days, because that is the smallest thing the schedule
       records. `days` is still accepted so an older client — a tab left
       open across a deploy — moves by the right amount rather than by
       half of it. */
    /* A shift for each end. Equal shifts slide the booking; different
       ones change its length, which is what a handle does. `halves` and
       `days` are still read so a tab left open across a deploy moves by
       the right amount rather than not at all. */
    const startShift = Number.isFinite(Number(body.startShift))
      ? Math.round(Number(body.startShift))
      : (Number.isFinite(Number(body.halves))
        ? Math.round(Number(body.halves))
        : Math.round(Number(body.days) * 2));
    const endShift = Number.isFinite(Number(body.endShift))
      ? Math.round(Number(body.endShift))
      : startShift;
    const shift = startShift;

    /* An answer to "which weekend halves does this work", given because
       the move ran into a weekend and the board asked. Saved with the
       move rather than before it: the flags and the days they produce
       are one decision, and writing the flags first would leave a
       booking claiming Saturdays with its days still on weekdays if the
       move then failed.

       Only the four keys, and only as booleans. Whatever else is in the
       body is not a weekend rule. */
    /* Handed to another gang. Checked below rather than trusted: the
       board asks the same question before it lets the bar go, but a
       rule the browser enforces is not a rule. */
    const toTeam = Number(body.teamId) || null;

    const asked = body.weekend && typeof body.weekend === "object"
      ? {
        Sat_AM: !!body.weekend.Sat_AM, Sat_PM: !!body.weekend.Sat_PM,
        Sun_AM: !!body.weekend.Sun_AM, Sun_PM: !!body.weekend.Sun_PM,
      }
      : null;
    if (!Number.isInteger(startShift) || !Number.isInteger(endShift)) {
      return json({ error: "The shifts must be whole numbers of half-days." }, 400);
    }
    /* A drag that lands where it started is not an error and not a
       write. Answered rather than rejected, so the board can call this
       without first working out whether it needs to. */
    if (!startShift && !endShift && !toTeam) return json({ moved: 0, halves: 0 });

    const { data: asgn, error: readErr } = await db
      .from("Call_Off_Assignment")
      .select("Assignment_ID,Submission_ID,Task_Type_ID,Team_ID")
      .eq("Assignment_ID", id)
      .single();
    if (readErr) throw readErr;

    /* ── May that gang take this work? ──

       The same two rules the browser applied, applied again here. Not
       because the board is untrusted so much as because this endpoint
       is reachable without it, and a booking given to a gang that does
       not cover the region is a gang sent to the wrong county. */
    if (toTeam) {
      const { data: sub } = await db.from("Mains_Call_Off_Submission")
        .select("Submission_ID,Project_ID,Work_Type_ID")
        .eq("Submission_ID", asgn.Submission_ID).single();
      const { data: project } = sub?.Project_ID
        ? await db.from("Project").select("Project_ID,Region_ID")
          .eq("Project_ID", sub.Project_ID).single()
        : { data: null };
      const { data: team } = await db.from("Team")
        .select("Team_ID,Team_Name,Active").eq("Team_ID", toTeam).single();

      if (!team) return json({ error: "That team does not exist." }, 400);
      if (team.Active === false) {
        return json({ error: `${team.Team_Name} is not active.` }, 400);
      }

      if (project?.Region_ID != null) {
        const { data: covers } = await db.from("Team_Region")
          .select("Team_ID").eq("Team_ID", toTeam).eq("Region_ID", project.Region_ID);
        if (!covers?.length) {
          const { data: region } = await db.from("Region")
            .select("Region").eq("Region_ID", project.Region_ID).single();
          return json({
            error: `${team.Team_Name} is not set up to work in `
              + `${region?.Region ? `the ${region.Region} region` : "that region"}.`,
          }, 400);
        }
      }

      const { data: task } = await db.from("Task_Type")
        .select("Task_Type_ID,Task_Type_Name,Craft_ID")
        .eq("Task_Type_ID", asgn.Task_Type_ID).single();
      if (task?.Craft_ID != null) {
        const { data: holds } = await db.from("Team_Craft")
          .select("Team_ID").eq("Team_ID", toTeam).eq("Craft_ID", task.Craft_ID);
        if (!holds?.length) {
          return json({
            error: `${team.Team_Name} is not set up to perform `
              + `${task.Task_Type_Name || "that work"}.`,
          }, 400);
        }
      }
    }

    const main = await applyMove(db, id, { startShift, endShift, asked, toTeam });

    /* ── What follows it ──

       Each with its own shift and its own weekend answer, worked out by
       the board from the rules in Task_Dependency and sent with the
       move. Applied here rather than recomputed, so the schedule that
       was previewed and agreed to is the schedule that is written.

       One at a time and reported one at a time: there is no transaction
       across these, so what matters is that the caller can be told
       exactly how far it got rather than being left to guess. */
    const followed = [];
    const failed = [];
    for (const step of Array.isArray(body.also) ? body.also : []) {
      const stepId = Number(step.assignmentId);
      if (!stepId || stepId === Number(id)) continue;
      const stepWeekend = step.weekend && typeof step.weekend === "object"
        ? {
          Sat_AM: !!step.weekend.Sat_AM, Sat_PM: !!step.weekend.Sat_PM,
          Sun_AM: !!step.weekend.Sun_AM, Sun_PM: !!step.weekend.Sun_PM,
        }
        : null;
      try {
        followed.push(await applyMove(db, stepId, {
          startShift: Math.round(Number(step.startShift) || 0),
          endShift: Math.round(Number(step.endShift) || 0),
          asked: stepWeekend,
          toTeam: null,
        }));
      } catch (e) {
        failed.push({ Assignment_ID: stepId, error: e.message });
      }
    }

    return json({
      ...main,
      startShift,
      endShift,
      halves: startShift,
      followed,
      /* Named rather than thrown. The booking that was dragged has
         moved; saying the whole thing failed would send somebody
         looking for a move that plainly happened. */
      failed,
      partial: main.partial || failed.length > 0,
    });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/planning/assignments/:id/move" };
