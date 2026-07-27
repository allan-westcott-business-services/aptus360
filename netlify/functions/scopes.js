import { supabase, json, fail } from "./_supabase.js";

const nullEmpty = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

/* Design fields only. Commercial fields (Scope_Status_ID, Secured_Date,
   quote values) are edited on the project Details tab, so this endpoint
   deliberately can't touch them — two screens writing the same columns is
   how records end up disagreeing with themselves. */
const DESIGN_FIELDS = new Set([
  "Designer_ID", "Design_Status_ID", "Design_Checked_By", "POC_Status_ID",
  "Target_Date", "Actual_Date", "Revision", "Carried_Forward",
  "External_Design", "IDNO_ID", "Reference",
  "Manual_Base_Points", "Base_Points_Overridden",
]);

export default async function handler(req, context) {
  const db = supabase();
  const id = context?.params?.id;

  try {
    if (req.method === "PATCH" && id) {
      const body = await req.json();
      const changes = Object.fromEntries(
        Object.entries(body).filter(([k]) => DESIGN_FIELDS.has(k))
      );
      if (!Object.keys(changes).length) {
        return json({ error: "No editable design fields supplied." }, 400);
      }
      const { data, error } = await db
        .from("Project_Scope").update(nullEmpty(changes)).eq("Project_Scope_ID", id).select().single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE" && id) {
      const { error } = await db.from("Project_Scope").delete().eq("Project_Scope_ID", id);
      if (error && error.code === "23503") {
        return json({ error: "Something still references this scope." }, 409);
      }
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/scopes/:id" };
