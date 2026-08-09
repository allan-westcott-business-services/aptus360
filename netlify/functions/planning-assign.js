import { supabase, json, fail } from "./_supabase.js";

/* Giving an unassigned phase to a gang.

   The board draws a chip for every phase a call-off's work type
   involves that nobody has taken, sitting at the date the customer
   asked for. Dragging one onto a lane is the moment it becomes work: a
   Call_Off_Assignment and the day under it.

   ── One day, and not a guess ──

   The booking is created a single day long. The board does not know how
   long the work takes and neither does this — a length invented here is
   a number somebody has to notice is wrong before they correct it,
   which is worse than a number that is obviously a starting point. The
   planner stretches it by its handle.

   ── The rules are checked here, not only in the browser ──

   The board asks whether the gang covers the region and holds the craft
   before it lets the chip go. This asks again, because a rule the
   browser enforces is not a rule, and because this endpoint creates
   work: a booking made against a gang that cannot do it is a gang sent
   to the wrong job, and nothing downstream re-checks.

   The two ask the same questions in the same order and say the same
   sentences, so a refusal reads the same whichever noticed it. */

const partOn = (date, w) => {
  const x = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(x.getTime())) return null;
  const d = x.getUTCDay();
  if (d !== 0 && d !== 6) return "Full";
  const am = !!(d === 6 ? w.Sat_AM : w.Sun_AM);
  const pm = !!(d === 6 ? w.Sat_PM : w.Sun_PM);
  if (am && pm) return "Full";
  if (am) return "AM";
  if (pm) return "PM";
  return null;
};

const nextDay = (date, n) => {
  const x = new Date(`${date}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export default async function handler(req) {
  const db = supabase();
  try {
    if (req.method !== "POST") return json({ error: "Not found" }, 404);

    const body = await req.json();
    const submissionId = Number(body.submissionId);
    const taskTypeId = Number(body.taskTypeId);
    const teamId = Number(body.teamId);
    const date = String(body.date || "").slice(0, 10);

    if (!submissionId || !taskTypeId || !teamId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({
        error: "A call-off, a phase, a team and a date are all needed.",
      }, 400);
    }

    const weekend = body.weekend && typeof body.weekend === "object"
      ? {
        Sat_AM: !!body.weekend.Sat_AM, Sat_PM: !!body.weekend.Sat_PM,
        Sun_AM: !!body.weekend.Sun_AM, Sun_PM: !!body.weekend.Sun_PM,
      }
      : { Sat_AM: false, Sat_PM: false, Sun_AM: false, Sun_PM: false };

    /* Already taken. Two planners on the same board a second apart
       would otherwise both create a booking for one phase, and the
       second is invisible until somebody counts. */
    const { data: already } = await db.from("Call_Off_Assignment")
      .select("Assignment_ID")
      .eq("Submission_ID", submissionId)
      .eq("Task_Type_ID", taskTypeId);
    if (already?.length) {
      return json({
        error: "That phase already has a team. Refresh the board to see it.",
      }, 409);
    }

    const [subRes, teamRes, taskRes] = await Promise.all([
      db.from("Mains_Call_Off_Submission")
        .select("Submission_ID,Project_ID,AP_Number").eq("Submission_ID", submissionId).single(),
      db.from("Team").select("Team_ID,Team_Name,Active").eq("Team_ID", teamId).single(),
      db.from("Task_Type").select("Task_Type_ID,Task_Type_Name,Craft_ID")
        .eq("Task_Type_ID", taskTypeId).single(),
    ]);
    if (subRes.error) throw subRes.error;
    const team = teamRes.data;
    const task = taskRes.data;
    if (!team) return json({ error: "That team does not exist." }, 400);
    if (team.Active === false) {
      return json({ error: `${team.Team_Name} is not active.` }, 400);
    }

    /* Region, and only where the project has one — a project with no
       region should not make every team ineligible. */
    const { data: project } = subRes.data?.Project_ID
      ? await db.from("Project").select("Project_ID,Region_ID")
        .eq("Project_ID", subRes.data.Project_ID).single()
      : { data: null };

    if (project?.Region_ID != null) {
      const { data: covers } = await db.from("Team_Region")
        .select("Team_ID").eq("Team_ID", teamId).eq("Region_ID", project.Region_ID);
      if (!covers?.length) {
        const { data: region } = await db.from("Region")
          .select("Region").eq("Region_ID", project.Region_ID).single();
        return json({
          error: `${team.Team_Name} is not set up to work in `
            + `${region?.Region ? `the ${region.Region} region` : "that region"}.`,
        }, 400);
      }
    }

    if (task?.Craft_ID != null) {
      const { data: holds } = await db.from("Team_Craft")
        .select("Team_ID").eq("Team_ID", teamId).eq("Craft_ID", task.Craft_ID);
      if (!holds?.length) {
        return json({
          error: `${team.Team_Name} is not set up to perform `
            + `${task.Task_Type_Name || "that work"}.`,
        }, 400);
      }
    }

    /* The day it lands on. Pushed to the next day the booking works
       where the drop was on a weekend half nobody is taking — which is
       the same stepping the move endpoint does, for the same reason. */
    let start = date;
    for (let i = 0; i < 8 && !partOn(start, weekend); i++) start = nextDay(start, 1);
    const part = partOn(start, weekend);
    if (!part) {
      return json({
        error: "There is no day here this booking could work.",
      }, 400);
    }

    const { data: made, error: makeErr } = await db.from("Call_Off_Assignment")
      .insert({
        Submission_ID: submissionId,
        Task_Type_ID: taskTypeId,
        Team_ID: teamId,
        Start_Date: start,
        End_Date: start,
        ...weekend,
      })
      .select("Assignment_ID,Start_Date,End_Date,Team_ID")
      .single();
    if (makeErr) throw makeErr;

    /* The day under it. Reported rather than thrown if it fails: the
       booking exists and is visible, and saying "could not assign it"
       over a booking that plainly got assigned is the worse lie. */
    const { error: dayErr } = await db.from("Call_Off_Work_Day").insert({
      Assignment_ID: made.Assignment_ID,
      Work_Date: start,
      Part: part,
      Off_Site: false,
    });

    return json({ ...made, Part: part, dayRecorded: !dayErr });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/planning/assignments" };
