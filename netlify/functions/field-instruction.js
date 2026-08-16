import { supabase, withAuth, json, fail } from "./_supabase.js";

/* The work instruction: started, saved as it goes, and submitted.

   Three actions on one row, in one file, because they are three moments
   in the life of the same thing. A draft is the submission, earlier —
   nothing is copied across when it is sent, so there is no step that
   can half-happen.

   ── Why saving as they go matters ──

   A work instruction is filled in across a day: some at the start, the
   photographs as work happens, the declaration at the end. A form that
   lives only between opening and submitting loses a morning when the
   tablet sleeps or the van moves out of signal — and what happens next
   is somebody fills it in on paper and types it up at home, which is
   the outcome this exercise exists to avoid.

   ── Who may do any of it ──

   The leader of the team the assignment belongs to, and only for the
   job that is currently released. The same two rules as aborting, for
   the same reasons: without the first anybody with an account could
   write on anybody's work, and without the second a gang could fill in
   next week's jobs today.

   ── Submitting releases the next job ──

   Not approving it. The office review is quality control on the record,
   not permission to carry on working — a gang that submitted at nine
   would otherwise stand still until somebody opened a laptop. */

const FINISHED = ["Submitted", "Complete", "Aborted"];

/* Who is asking, and the team they lead. */
async function leaderOf(db, email) {
  const { data: person } = await db.from("Person")
    .select("Person_ID,Person_Name,Email")
    .ilike("Email", String(email || "").trim())
    .eq("Is_Active", true)
    .maybeSingle();
  if (!person) return { error: "This login is not linked to anyone." };

  const { data: memberships } = await db.from("Team_Member")
    .select("Team_ID,Is_Team_Leader").eq("Person_ID", person.Person_ID);
  const leading = (memberships || []).filter((m) => m.Is_Team_Leader);
  if (leading.length !== 1) {
    return { error: "You are not set up as the leader of one team." };
  }
  return { person, teamId: leading[0].Team_ID };
}

/* The job that is open on this team's queue, and whether it is the one
   being asked about. */
async function openJob(db, teamId, assignmentId) {
  const { data: rows } = await db.from("Call_Off_Assignment")
    .select("Assignment_ID,Team_ID,Status,Start_Date,Submission_ID")
    .eq("Team_ID", teamId)
    .order("Start_Date").order("Assignment_ID");

  const queue = rows || [];
  const job = queue.find((a) => Number(a.Assignment_ID) === Number(assignmentId));
  /* Not found on this team reads the same as not existing. Telling
     somebody an id belongs to another team is telling them the ids are
     worth guessing. */
  if (!job) return { error: "That job is not yours.", status: 404 };

  const open = queue.find((a) => !FINISHED.includes(a.Status));
  if (Number(open?.Assignment_ID) !== Number(assignmentId)) {
    return {
      error: "That is not the job you are on. Finish this one first.",
      status: 409,
    };
  }
  return { job, queue };
}

export default withAuth(async function handler(req, context, user) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = supabase();

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    const assignmentId = Number(body?.assignmentId);
    if (!assignmentId) return json({ error: "Which job?" }, 400);

    const who = await leaderOf(db, user?.email);
    if (who.error) return json({ error: who.error }, 403);

    const found = await openJob(db, who.teamId, assignmentId);
    if (found.error) return json({ error: found.error }, found.status);

    /* The draft on this job, if there is one. One per assignment — two
       would be two half-filled forms with no way to say which is
       real. */
    const { data: draft } = await db.from("Field_Submission")
      .select("Field_Submission_ID,Version,Payload,Started_At")
      .eq("Assignment_ID", assignmentId)
      .eq("Is_Draft", true)
      .maybeSingle();

    /* ── Starting ── */
    if (action === "start") {
      if (draft) {
        /* Already going. Returned rather than refused: a second tap on
           a slow connection, or coming back to a job left open, should
           carry on where it was. */
        return json({ submissionId: draft.Field_Submission_ID, ...draft, resumed: true });
      }

      /* The next version. A first attempt is 1; a form the office sent
         back and is being redone is the one after whatever exists. */
      const { data: prior } = await db.from("Field_Submission")
        .select("Version").eq("Assignment_ID", assignmentId)
        .order("Version", { ascending: false }).limit(1);
      const version = (prior?.[0]?.Version ?? 0) + 1;

      const { data: made, error: mkErr } = await db.from("Field_Submission")
        .insert({
          Assignment_ID: assignmentId,
          Version: version,
          Payload: {},
          Is_Draft: true,
          Started_At: new Date().toISOString(),
          Submitted_By: who.person.Person_Name || user?.email,
        })
        .select("Field_Submission_ID,Version,Payload,Started_At")
        .single();
      if (mkErr) throw mkErr;

      /* And the job says somebody is on site. Second, because a status
         saying work has begun with no form behind it is a job nobody
         can finish. */
      await db.from("Call_Off_Assignment")
        .update({ Status: "In Progress" })
        .eq("Assignment_ID", assignmentId)
        .eq("Team_ID", who.teamId);

      return json({ submissionId: made.Field_Submission_ID, ...made });
    }

    /* ── Saving ── */
    if (action === "save") {
      if (!draft) return json({ error: "Nothing has been started." }, 409);

      /* Merged, not replaced. The tablet sends the section somebody has
         just filled in; a whole-payload write would lose anything
         another section had put there since it loaded. */
      const patch = body?.payload && typeof body.payload === "object"
        ? body.payload : {};
      const next = { ...(draft.Payload || {}), ...patch };

      const { error: upErr } = await db.from("Field_Submission")
        .update({ Payload: next })
        .eq("Field_Submission_ID", draft.Field_Submission_ID);
      if (upErr) throw upErr;

      return json({ submissionId: draft.Field_Submission_ID, payload: next });
    }

    /* ── Submitting ── */
    if (action === "submit") {
      if (!draft) return json({ error: "Nothing has been started." }, 409);

      const payload = { ...(draft.Payload || {}), ...(body?.payload || {}) };

      /* What the form insists on. Kept here as well as on the tablet,
         because a screen is not a rule: the same form opened on a
         second device, or a request made by hand, must meet it too.

         The declaration only, for now. Which other fields are mandatory
         is a question for whoever reads these, and a list guessed at
         here would be one somebody types anything into to get home. */
      if (!payload.declaration) {
        return json({ error: "The declaration has to be signed." }, 400);
      }

      const { error: subErr } = await db.from("Field_Submission")
        .update({
          Payload: payload,
          Is_Draft: false,
          Submitted_At: new Date().toISOString(),
          Submitted_By: who.person.Person_Name || user?.email,
        })
        .eq("Field_Submission_ID", draft.Field_Submission_ID);
      if (subErr) throw subErr;

      /* The job, second — a job marked Submitted with a draft still
         open behind it is one the office cannot review. */
      const { error: stErr } = await db.from("Call_Off_Assignment")
        .update({ Status: "Submitted" })
        .eq("Assignment_ID", assignmentId)
        .eq("Team_ID", who.teamId);
      if (stErr) throw stErr;

      /* What is open now, so the tablet can move on without asking
         again. */
      const after = (found.queue || [])
        .map((a) => (Number(a.Assignment_ID) === assignmentId
          ? { ...a, Status: "Submitted" } : a))
        .find((a) => !FINISHED.includes(a.Status));

      return json({
        submissionId: draft.Field_Submission_ID,
        submitted: true,
        nextAssignmentId: after ? after.Assignment_ID : null,
      });
    }

    return json({ error: "Not something this can do." }, 400);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/field/instruction" };
