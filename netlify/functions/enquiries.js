/* Enquiries waiting for somebody here.

   A developer fills in a sheet in the portal and it lands as
   `submitted`. Nothing becomes a project by itself — that decision
   creates work, a reference and a place in a pipeline — so it waits
   here until somebody accepts or declines it.

   ── Staff only ──

   `withAuth` is the same guard every other staff endpoint uses. A
   portal account never reaches this file: the portal has its own
   endpoint, and what a developer may see is decided there. Two doors,
   and this is the inside one.

   ── Reading an old enquiry ──

   The answers carry `Question_Text`, the question AS IT WAS WORDED, so
   an enquiry from March reads in March's terms however the sheet has
   changed since. Nothing here joins back to the live questions for
   that reason: the join would show today's wording against last
   spring's answers, which is a quietly wrong drawing of what somebody
   actually said. */

import { supabase, json, fail, withAuth } from "./_supabase.js";

const LIST =
  "Enquiry_Submission_ID,Enquiry_Form_ID,Organisation_ID,Organisation_Branch_ID,"
  + "Submitted_By,Submitted_At,Project_ID,Status,Decided_At,Decided_By,Decision_Note";

/* `withAuth` passes the signed-in user as the THIRD argument, not on
   the context. Taking it from the context instead records null against
   every decision — which looks like a decision nobody made. */
export default withAuth(async function handler(req, context, user) {
  const db = supabase();
  const url = new URL(req.url);
  const what = context?.params?.what || url.searchParams.get("what") || "list";

  try {
    /* ── The queue ──

       Waiting first and oldest first, which is the order a queue is
       worked. Decided ones are returned too, because "what did we say
       to them in April" is asked at least as often as "what is
       new" — but they sort after, so opening the screen shows the work
       rather than the archive. */
    if (what === "list") {
      const status = url.searchParams.get("status");
      let q = db.from("Enquiry_Submission").select(LIST);
      if (status) q = q.eq("Status", status);
      const { data, error } = await q.order("Submitted_At", { ascending: true });
      if (error) throw error;

      const rows = data || [];
      const orgIds = [...new Set(rows.map((r) => r.Organisation_ID).filter(Boolean))];
      const brIds = [...new Set(rows.map((r) => r.Organisation_Branch_ID).filter(Boolean))];

      /* Names, so a queue reads as companies rather than as numbers. */
      const orgs = orgIds.length
        ? (await db.from("Organisation").select("Organisation_ID,Name")
          .in("Organisation_ID", orgIds)).data || []
        : [];
      const brs = brIds.length
        ? (await db.from("Organisation_Branch")
          .select("Organisation_Branch_ID,Branch_Name")
          .in("Organisation_Branch_ID", brIds)).data || []
        : [];

      const orgName = new Map(orgs.map((o) => [Number(o.Organisation_ID), o.Name]));
      const brName = new Map(brs.map((b) =>
        [Number(b.Organisation_Branch_ID), b.Branch_Name]));

      const order = { submitted: 0, draft: 1, accepted: 2, declined: 3 };
      return json({
        enquiries: rows
          .map((r) => ({
            ...r,
            organisationName: orgName.get(Number(r.Organisation_ID)) ?? null,
            branchName: brName.get(Number(r.Organisation_Branch_ID)) ?? null,
          }))
          .sort((a, b) => (order[a.Status] ?? 9) - (order[b.Status] ?? 9)),
      });
    }

    /* ── One enquiry, as it was answered ── */
    if (what === "one") {
      const id = Number(url.searchParams.get("id"));
      if (!id) return json({ error: "Which enquiry?" }, 400);

      const { data: sub, error } = await db.from("Enquiry_Submission")
        .select(LIST).eq("Enquiry_Submission_ID", id).maybeSingle();
      if (error) throw error;
      if (!sub) return json({ error: "No such enquiry." }, 404);

      const { data: answers, error: aErr } = await db.from("Enquiry_Answer")
        .select("Enquiry_Answer_ID,Enquiry_Question_ID,Question_Text,"
          + "Answer_Text,Storage_Path,Answered_At")
        .eq("Enquiry_Submission_ID", id)
        .order("Enquiry_Answer_ID", { ascending: true });
      if (aErr) throw aErr;

      return json({ enquiry: sub, answers: answers || [] });
    }

    /* ── Accepting or declining ──

       The decision, who made it and when. `Project_ID` is optional and
       is a LINK to a project that already exists: making one from an
       enquiry needs a reference, a customer and a branch decided by
       rules this endpoint does not know, and inventing a project is a
       worse mistake than asking somebody to pick one.

       An enquiry can be decided once. Deciding an already-decided one
       is refused rather than silently overwriting a colleague's answer
       and the date they gave it. */
    if (what === "decide" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = Number(body?.id);
      const decision = String(body?.decision || "").toLowerCase();
      if (!id) return json({ error: "Which enquiry?" }, 400);
      if (decision !== "accepted" && decision !== "declined") {
        return json({ error: "Accept or decline." }, 400);
      }

      const { data: sub, error: rErr } = await db.from("Enquiry_Submission")
        .select("Enquiry_Submission_ID,Status")
        .eq("Enquiry_Submission_ID", id).maybeSingle();
      if (rErr) throw rErr;
      if (!sub) return json({ error: "No such enquiry." }, 404);
      if (sub.Status === "accepted" || sub.Status === "declined") {
        return json({
          error: `That enquiry was already ${sub.Status}. Reload to see it.`,
        }, 409);
      }

      const patch = {
        Status: decision,
        Decided_At: new Date().toISOString(),
        Decided_By: user?.email ?? null,
        Decision_Note: body?.note ? String(body.note).slice(0, 2000) : null,
      };
      if (decision === "accepted" && body?.projectId) {
        patch.Project_ID = Number(body.projectId);
      }

      const { error: uErr } = await db.from("Enquiry_Submission")
        .update(patch).eq("Enquiry_Submission_ID", id);
      if (uErr) throw uErr;

      return json({ ok: true });
    }

    return json({ error: "Not found." }, 404);
  } catch (e) {
    return fail(e);
  }
});

export const config = { path: "/api/enquiries/:what" };
