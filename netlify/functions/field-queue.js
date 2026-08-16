import { supabase, withAuth, json, fail } from "./_supabase.js";

/* A team leader's queue of work.

   ── Who is asking ──

   The signed-in email, not a parameter. A leader asks for their own
   queue or they ask for nothing: an endpoint that took a team id would
   let anybody with an account read anybody's work, and the whole reason
   the wrapper exists is that a tablet is a thing that gets lost.

   The chain is Work_Email → Person → Team_Member where Is_Team_Leader →
   Team → the assignments against it. Work rather than personal email
   because the login is a work account, and a person's private address
   is not a credential.

   ── One job open at a time ──

   The queue is ordered and only the first unfinished job is released.
   Everything behind it comes back with enough to see it is there —
   where, and roughly when — and nothing that would let it be started.

   Order is Start_Date, then Assignment_ID. The date is what the office
   planned; the id breaks ties in the order they were created, which is
   the order somebody entered them and therefore the order they meant.

   ── What releases the next one ──

   Submitted or Aborted, not Complete. Complete means the office has
   approved the photos, and a queue that waited for that would leave a
   van standing still until somebody opened a laptop.

   ── Corrections do not wait in the queue ──

   A returned form comes back separately. By then the team is several
   jobs on, possibly next week, and its place in the order is behind
   them — so it cannot be a queue position without stopping everything
   that has already moved past it. */

const ASSIGNMENT_COLS = [
  "Assignment_ID", "Submission_ID", "Task_Type_ID", "Team_ID", "Span_ID",
  "Start_Date", "End_Date", "Plot_Range", "Status",
].join(",");

/* The states a job has left the queue in. Both release what follows;
   neither can be returned to by the tablet. */
const FINISHED = ["Submitted", "Complete", "Aborted"];

export default withAuth(async function handler(req, context, user) {
  const db = supabase();

  try {
    const email = String(user?.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "That account has no email." }, 403);

    /* ── The team this person leads ── */
    const { data: people, error: pErr } = await db
      .from("Person")
      .select("Person_ID,Person_Name,Work_Email");
    if (pErr) throw pErr;

    const person = (people || []).find((p) =>
      String(p.Work_Email ?? "").trim().toLowerCase() === email);
    if (!person) {
      /* Said plainly rather than returned as an empty queue. "No work
         today" and "this account is not linked to anybody" look
         identical on a tablet, and only one of them is worth phoning
         the office about. */
      return json({
        error: "This login is not linked to anyone. Ask the office to check "
          + "your work email against your record.",
      }, 403);
    }

    const { data: memberships, error: mErr } = await db
      .from("Team_Member")
      .select("Team_ID,Is_Team_Leader")
      .eq("Person_ID", person.Person_ID);
    if (mErr) throw mErr;

    const leading = (memberships || []).filter((m) => m.Is_Team_Leader);
    if (!leading.length) {
      return json({
        error: "You are not set up as a team leader, so there is no queue to "
          + "show. Ask the office if that is wrong.",
      }, 403);
    }
    /* A person leads one team. If that ever stops being true the queue
       becomes two queues with no single next job, so it is worth saying
       rather than silently picking one. */
    if (leading.length > 1) {
      return json({
        error: "You are leading more than one team. The office needs to sort "
          + "that out before a queue can be shown.",
      }, 409);
    }
    const teamId = leading[0].Team_ID;

    /* ── The work ── */
    const { data: rows, error: aErr } = await db
      .from("Call_Off_Assignment")
      .select(ASSIGNMENT_COLS)
      .eq("Team_ID", teamId)
      .order("Start_Date")
      .order("Assignment_ID");
    if (aErr) throw aErr;

    const assignments = rows || [];
    const ids = assignments.map((a) => a.Assignment_ID);

    /* Names for the phases and the sites, so the tablet shows what the
       job is rather than a pair of ids. */
    const [tasks, subs, teams] = await Promise.all([
      db.from("Task_Type").select("Task_Type_ID,Task_Type_Name"),
      ids.length
        ? db.from("Mains_Call_Off_Submission")
          .select("Submission_ID,Site_Name,Site_Address,AP_Number,Project_ID")
          .in("Submission_ID",
            [...new Set(assignments.map((a) => a.Submission_ID).filter(Boolean))])
        : Promise.resolve({ data: [] }),
      db.from("Team").select("Team_ID,Team_Name").eq("Team_ID", teamId),
    ]);

    const taskName = new Map((tasks.data || [])
      .map((t) => [Number(t.Task_Type_ID), t.Task_Type_Name]));
    const site = new Map((subs.data || [])
      .map((s) => [Number(s.Submission_ID), s]));

    /* Corrections: submissions the office sent back, on this team's
       work, not yet answered by a later version. */
    const { data: submissions } = ids.length
      ? await db.from("Field_Submission")
        .select("Field_Submission_ID,Assignment_ID,Version,Review_Outcome,"
          + "Review_Note,Reviewed_At")
        .in("Assignment_ID", ids)
        .order("Version")
      : { data: [] };

    const latest = new Map();
    for (const s of submissions || []) latest.set(Number(s.Assignment_ID), s);

    const corrections = [...latest.values()]
      .filter((s) => s.Review_Outcome === "returned")
      .map((s) => ({
        assignmentId: Number(s.Assignment_ID),
        submissionId: s.Field_Submission_ID,
        version: s.Version,
        note: s.Review_Note,
        returnedAt: s.Reviewed_At,
      }));

    /* ── Which one is open ──

       The first that has not finished. Everything before it is done;
       everything after waits. */
    const openIndex = assignments.findIndex((a) => !FINISHED.includes(a.Status));

    const queue = assignments.map((a, i) => {
      const s = site.get(Number(a.Submission_ID)) || {};
      const released = i === openIndex;
      return {
        assignmentId: a.Assignment_ID,
        position: i + 1,
        released,
        status: a.Status,
        task: taskName.get(Number(a.Task_Type_ID)) ?? null,
        startDate: a.Start_Date,
        endDate: a.End_Date,
        siteName: s.Site_Name ?? null,
        /* Only on the released job. A queue that showed every address
           would be a list somebody could work from in any order, on
           paper, which is the thing the ordering is for. */
        siteAddress: released ? (s.Site_Address ?? null) : null,
        plots: released ? (a.Plot_Range ?? null) : null,
        projectId: released ? (s.Project_ID ?? null) : null,
        apNumber: released ? (s.AP_Number ?? null) : null,
      };
    });

    return json({
      teamId,
      teamName: (teams.data || [])[0]?.Team_Name ?? null,
      leader: { personId: person.Person_ID, name: person.Person_Name, email },
      /* The one to do now, or null when the queue is empty or every job
         is with the office. */
      current: queue.find((q) => q.released) ?? null,
      queue,
      corrections,
      /* Said rather than left to be counted, because "nothing to do" and
         "everything submitted, waiting on the office" are different
         situations and only one of them means go home. */
      remaining: queue.filter((q) => !FINISHED.includes(q.status)).length,
      awaitingReview: queue.filter((q) => q.status === "Submitted").length,
    });
  } catch (e) {
    return fail(e);
  }
});

export const config = { path: "/api/field/queue" };
