import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Utility_ID is writable but not asked for: a trigger sets it from the
   agreement type, so whatever arrives here is overwritten with the right
   one rather than trusted. */
const A = "AV_Agreement_ID,Project_ID,Utility_ID,IDNO_ID,IDNO_Organisation_ID,AV_Agreement_Type_ID,AV_Value,Estimated_Plot_AV_Value,Agreement_Date,Status,Notes,IDNO_Reference,Initial_AV_Fee_Percent,Initial_AV_Fee,Contract_Path";
const W = new Set(A.split(",").filter((x) => x !== "AV_Agreement_ID"));
const pick = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => W.has(k)).map(([k, v]) => [k, v === "" ? null : v]));

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const id = new URL(req.url).searchParams.get("id");

  try {
    if (req.method === "GET") {
      /* Read from the view: it carries the invoiced value, the plot count
         and how many have been claimed, none of which are stored — they
         change every time an invoice is raised. Writes still go to the
         table below. */
      const { data, error } = await db.from("AV_Agreement_Detail")
        .select("*").eq("Project_ID", projectId).order("AV_Agreement_Type_ID");
      if (error) throw error;
      return json({ rows: data || [] });
    }
    if (req.method === "POST") {
      const { data, error } = await db.from("AV_Agreement")
        .insert(pick({ ...(await req.json()), Project_ID: Number(projectId) })).select(A).single();
      if (error && error.code === "23505") {
        return json({ error: "There's already an agreement for that utility and operator." }, 409);
      }
      if (error) throw error;
      return json(data, 201);
    }
    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const { data, error } = await db.from("AV_Agreement")
        .update(pick(await req.json())).eq("AV_Agreement_ID", id).select(A).single();
      if (error) throw error;
      return json(data);
    }
    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from("AV_Agreement").delete().eq("AV_Agreement_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) { return fail(e, 400); }
});

export const config = { path: "/api/projects/:projectId/av-agreements" };
