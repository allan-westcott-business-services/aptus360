import { supabase, json, fail, withAuth } from "./_supabase.js";

const PROJECT_COLUMNS = "Project_ID,Project_Ref,Revision,Project_Status_ID,Site_Name";

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const id = context?.params?.id;

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!id) return json({ error: "Project id required" }, 400);

  try {
    const { carry_scope_ids = [], copy_plots = true } = await req.json().catch(() => ({}));

    /* One database function: several inserts plus superseding the
       original. A half-made revision is worse than none. */
    const { data: newId, error } = await db.rpc("create_project_revision", {
      p_project: Number(id),
      p_carry_scopes: carry_scope_ids.map(Number),
      p_copy_plots: copy_plots !== false,
    });
    if (error) throw error;

    const { data: created, error: readErr } = await db
      .from("Project").select(PROJECT_COLUMNS).eq("Project_ID", newId).single();
    if (readErr) throw readErr;

    return json(created, 201);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects/:id/revision" };
