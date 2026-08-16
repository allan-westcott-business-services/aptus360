import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Moving a call-off through its workflow.

   Its own endpoint rather than a general PATCH: the status is the one
   field the operations page changes, and the statuses are a fixed set
   rather than free text. Checking them here means a typo cannot put a
   call-off into a state nothing lists. */

export const STATUSES = [
  "Pending Review",
  "Reviewed",
  "Scheduled",
  "In Progress",
  "Complete",
  "Withdrawn (Customer)",
  "Withdrawn (Aptus)",
];

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const id = context?.params?.id;
  try {
    if (req.method !== "PATCH" && req.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }
    const { Status } = await req.json();
    if (!STATUSES.includes(Status)) {
      return json({ error: `Unknown status: ${Status}` }, 400);
    }

    const { data, error } = await db
      .from("Mains_Call_Off_Submission")
      .update({ Status })
      .eq("Submission_ID", id)
      .select("Submission_ID,Status")
      .single();
    if (error) throw error;
    return json(data);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/calloffs/:id/status" };
