import { supabase, json, fail, withAuth } from "./_supabase.js";

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const id = context?.params?.id;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!id) return json({ error: "Project id required" }, 400);

  try {
    const { data, error } = await db.rpc("resurrect_project", { p_project: Number(id) });
    if (error) throw error;
    return json({ resurrected: true, later_revisions: data ?? 0 });
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects/:id/resurrect" };
