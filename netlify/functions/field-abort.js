import { supabase, withAuth, json, fail } from "./_supabase.js";

/* Refusing a job, and releasing the one behind it.

   ── Why an operative can do this at all ──

   The queue is strict: one job open, and nothing else reachable. That
   only works if there is a way past a job that cannot be done. Without
   one, an operative who arrives at a locked site either loses the day
   or marks the work complete to unlock the next — and a completion
   record that means "I wanted to move on" is worse than no record.

   So an abort is a real outcome. It ends the job, releases the next,
   and cannot be undone from here: an aborted job is rescheduled by the
   office as new work, never reopened.

   ── What is checked before it is allowed ──

   The caller leads the team the assignment belongs to, and the
   assignment is the one currently released. Both matter. Without the
   first, anybody with an account could abort anybody's work by guessing
   an id; without the second, a leader could clear four jobs at once and
   the ordering would be decoration.

   ── The reason is from a list ──

   Field_Abort_Reason, so it can be counted. A month of "no access at
   plot 34" is a fact worth having; a month of prose is a month of
   reading. Some reasons demand a note and some are the office's alone,
   and both rules live on the row rather than here.

   ── Who called it ──

   By_Office is false on this route. The office has its own, and the
   same outcome from the two is not the same evidence: a run of
   self-aborts on wet Fridays is a thing worth being able to see. */

const FINISHED = ["Submitted", "Complete", "Aborted"];

export default withAuth(async function handler(req, context, user) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = supabase();

  try {
    const body = await req.json();
    const assignmentId = Number(body?.assignmentId);
    const reasonCode = String(body?.reasonCode ?? "").trim();
    const note = String(body?.note ?? "").trim() || null;

    if (!assignmentId) return json({ error: "Which job?" }, 400);
    if (!reasonCode) return json({ error: "Pick a reason." }, 400);

    /* ── Who is asking ── */
    const email = String(user?.email ?? "").trim();
    const { data: person } = await db.from("Person")
      .select("Person_ID,Person_Name,Email")
      .ilike("Email", email).eq("Is_Active", true).maybeSingle();
    if (!person) return json({ error: "This login is not linked to anyone." }, 403);

    const { data: memberships } = await db.from("Team_Member")
      .select("Team_ID,Is_Team_Leader").eq("Person_ID", person.Person_ID);
    const leading = (memberships || []).filter((m) => m.Is_Team_Leader);
    if (leading.length !== 1) {
      return json({ error: "You are not set up as the leader of one team." }, 403);
    }
    const teamId = leading[0].Team_ID;

    /* ── The reason ── */
    const { data: reason } = await db.from("Field_Abort_Reason")
      .select("Reason_Code,Label,Office_Only,Needs_Note,Is_Active")
      .eq("Reason_Code", reasonCode).maybeSingle();

    if (!reason || !reason.Is_Active) {
      return json({ error: "That is not a reason on the list." }, 400);
    }
    /* Office-only reasons are the office's to give. A gang on a doorstep
       does not discover that a call-off has been withdrawn. */
    if (reason.Office_Only) {
      return json({
        error: `"${reason.Label}" is for the office to record. Ring them.`,
      }, 403);
    }
    if (reason.Needs_Note && !note) {
      return json({
        error: `"${reason.Label}" needs a line saying what happened.`,
      }, 400);
    }

    /* ── The job, and whether it is theirs to refuse ── */
    const { data: rows } = await db.from("Call_Off_Assignment")
      .select("Assignment_ID,Team_ID,Status,Start_Date")
      .eq("Team_ID", teamId)
      .order("Start_Date").order("Assignment_ID");

    const queue = rows || [];
    const job = queue.find((a) => Number(a.Assignment_ID) === assignmentId);

    /* Not found on this team reads the same as not existing at all —
       deliberately. Telling somebody an id belongs to another team is
       telling them the ids are worth guessing. */
    if (!job) return json({ error: "That job is not yours." }, 404);

    if (FINISHED.includes(job.Status)) {
      return json({ error: "That job is already finished." }, 409);
    }

    const open = queue.find((a) => !FINISHED.includes(a.Status));
    if (Number(open?.Assignment_ID) !== assignmentId) {
      /* The one thing that would quietly break the whole process:
         clearing jobs that were never released. */
      return json({
        error: "That is not the job you are on. Finish this one first.",
      }, 409);
    }

    /* ── Written ──

       The reason first. If the status change fails after it, the
       drawing has an explanation attached to a job that is still open —
       visible, and the next attempt says so. The other order leaves a
       job aborted with no reason, which nobody can act on. */
    const { error: aErr } = await db.from("Field_Abort").insert({
      Assignment_ID: assignmentId,
      Reason_Code: reasonCode,
      Note: note,
      Aborted_By: person.Person_Name || email,
      By_Office: false,
    });
    /* Already aborted — the unique index caught a second tap on a slow
       connection. Not an error worth showing: the job is in the state
       they asked for. */
    if (aErr && !/duplicate key/i.test(aErr.message ?? "")) throw aErr;

    const { error: sErr } = await db.from("Call_Off_Assignment")
      .update({ Status: "Aborted" })
      .eq("Assignment_ID", assignmentId)
      .eq("Team_ID", teamId);
    if (sErr) throw sErr;

    /* What is now open, so the tablet can move on without asking
       again. */
    const after = queue
      .map((a) => (Number(a.Assignment_ID) === assignmentId
        ? { ...a, Status: "Aborted" } : a))
      .find((a) => !FINISHED.includes(a.Status));

    return json({
      aborted: assignmentId,
      reason: reason.Label,
      nextAssignmentId: after ? after.Assignment_ID : null,
    });
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/field/abort" };
