import { supabase, json, fail } from "./_supabase.js";

const COLS = [
  "NRS_ID","Project_ID","Utility_ID","NRS_Sub_Type_ID","Supply_Ref","Description",
  "Address","MPAN","Requested_kVA","IDNO_ID","Date_Received","Self_Lay_Provider","Notes",
].join(",");

const WRITABLE = new Set(COLS.split(",").filter((c) => c !== "NRS_ID"));
const pick = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => WRITABLE.has(k)).map(([k, v]) => [k, v === "" ? null : v]));

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const id = new URL(req.url).searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("Non_Residential_Supply")
        .select(COLS).eq("Project_ID", projectId).order("NRS_ID");
      if (error) throw error;
      return json({ rows: data || [] });
    }
    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await db.from("Non_Residential_Supply")
        .insert(pick({ ...body, Project_ID: Number(projectId) })).select(COLS).single();
      if (error) throw error;
      return json(data, 201);
    }
    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const body = await req.json();
      const { data, error } = await db.from("Non_Residential_Supply")
        .update(pick(body)).eq("NRS_ID", id).select(COLS).single();
      if (error) throw error;
      return json(data);
    }
    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from("Non_Residential_Supply").delete().eq("NRS_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/nrs" };
