import { supabase, json, fail } from "./_supabase.js";

const COLS = [
  "POC_Application_ID","Project_ID","Utility_ID","IDNO_ID","POC_Status_ID","POC_Type",
  "Application_Date","Expected_Rx_Date","Applicant_Person_ID","Business_Address",
  "Plot_Count","Requested_kVA","Contingency_Load","Quote_Reference","Quote_Date",
  "Valid_Until_Date","Connection_Type","Distance_m","Estimated_Cost","Notes",
].join(",");

const nullEmpty = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("POC_Application")
        .select(COLS).eq("Project_ID", projectId).order("POC_Application_ID");
      if (error) throw error;
      return json({ rows: data || [] });
    }

    /* One row per selected operator. Applying to three operators is three
       applications, not one with three names on it — they quote separately
       and progress at different speeds. */
    if (req.method === "POST") {
      const { idno_ids = [], ...common } = await req.json();
      const base = nullEmpty({ ...common, Project_ID: Number(projectId) });
      const rows = idno_ids.length
        ? idno_ids.map((id) => ({ ...base, IDNO_ID: Number(id) }))
        : [{ ...base, IDNO_ID: null }];
      const { data, error } = await db.from("POC_Application").insert(rows).select(COLS);
      if (error) throw error;
      return json({ rows: data }, 201);
    }

    if (req.method === "PATCH") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400);
      const body = await req.json();
      const { data, error } = await db.from("POC_Application")
        .update(nullEmpty(body)).eq("POC_Application_ID", id).select(COLS).single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from("POC_Application").delete().eq("POC_Application_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/poc" };
