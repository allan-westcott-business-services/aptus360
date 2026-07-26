import { supabase, json, fail } from "./_supabase.js";

/* Columns are listed explicitly and in one place. If the schema moves, the
   query fails loudly at this boundary instead of being swallowed by a
   fallback — the failure mode that hid sixteen phantom columns in the
   legacy contract list. */
const PROJECT_COLUMNS = [
  "Project_ID", "Project_Ref", "Revision", "Option_Letter", "Project_Status_ID",
  "Customer_ID", "Branch_ID", "Region_ID", "Sub_Region_ID",
  "Site_Name", "Site_Address", "Postcode", "Eastings", "Northings",
  "Date_Received", "KPI_Date", "Date_Sent", "Secured_Date", "Status_Changed_Date",
  "BDD_KAM_ID", "Estimator_ID", "Quote_Type_ID", "I_and_C", "Is_Priority", "Notes",
  "Contract_Number", "Date_Signed", "Site_Contact", "Fire_Service_ID",
  "Heat_Pump_Model_ID", "Default_Plot_Heat_Source_ID", "Lay_Only_MU",
  "Minimum_Service_Call_Off", "Audacia_Customer_Name", "Audacia_Plot_Count",
].join(",");

const SCOPE_COLUMNS = [
  "Project_Scope_ID", "Project_ID", "Utility_ID", "Scope_Status_ID",
  "Date_Sent", "Secured_Date", "Quote_Value_To_Client", "Quote_Value_To_Aptus",
  "Designer_ID", "Design_Status_ID", "Target_Date", "Actual_Date", "Revision",
  "POC_Status_ID", "Design_Checked_By", "Carried_Forward", "External_Design",
  "External_Supplier_ID", "Auto_Base_Points", "Manual_Base_Points",
  "Base_Points_Overridden", "IDNO_ID", "Reference",
].join(",");


/* An HTML form sends "" for an untouched field. Postgres rejects that for
   date, numeric and bigint columns — "invalid input syntax for type date".
   Empty means absent, so normalise to null at the boundary. */
function nullEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === "" ? null : v;
  }
  return out;
}

export default async function handler(req, context) {
  const db = supabase();
  const id = context?.params?.id;

  try {
    /* ── GET /api/projects/:id ─────────────────────────────────── */
    if (req.method === "GET" && id) {
      const [{ data: project, error: pErr }, { data: scopes, error: sErr }] = await Promise.all([
        db.from("Project").select(PROJECT_COLUMNS).eq("Project_ID", id).single(),
        db.from("Project_Scope").select(SCOPE_COLUMNS).eq("Project_ID", id).order("Utility_ID"),
      ]);
      if (pErr) throw pErr;
      if (sErr) throw sErr;
      return json({ ...project, scopes: scopes || [] });
    }

    /* ── GET /api/projects ─────────────────────────────────────── */
    if (req.method === "GET") {
      const url = new URL(req.url);
      const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
      const offset = Number(url.searchParams.get("offset") || 0);

      let q = db
        .from("Project")
        .select(PROJECT_COLUMNS, { count: "exact" })
        .order("Date_Received", { ascending: false })
        .range(offset, offset + limit - 1);

      const status = url.searchParams.get("status_id");
      if (status) q = q.eq("Project_Status_ID", status);

      const { data, error, count } = await q;
      if (error) throw error;
      return json({ rows: data, total: count });
    }

    /* ── POST /api/projects ────────────────────────────────────── */
    if (req.method === "POST") {
      const body = await req.json();
      const { scopes = [], ...project } = body;

      const { data: created, error } = await db
        .from("Project")
        .insert(nullEmpty(project))
        .select(PROJECT_COLUMNS)
        .single();
      if (error) throw error;

      if (scopes.length) {
        const rows = scopes.map((s) => ({ ...s, Project_ID: created.Project_ID }));
        const { error: sErr } = await db.from("Project_Scope").insert(rows);
        if (sErr) throw sErr;
      }

      return json(created, 201);
    }

    /* ── PATCH /api/projects/:id ───────────────────────────────── */
    if (req.method === "PATCH" && id) {
      const body = await req.json();
      const { scopes, Project_ID, ...changes } = body;

      const { data: updated, error } = await db
        .from("Project")
        .update(nullEmpty(changes))
        .eq("Project_ID", id)
        .select(PROJECT_COLUMNS)
        .single();
      if (error) throw error;

      if (Array.isArray(scopes)) {
        for (const s of scopes) {
          const { Project_Scope_ID, ...scopeChanges } = s;
          const { error: sErr } = await db
            .from("Project_Scope")
            .update(nullEmpty(scopeChanges))
            .eq("Project_Scope_ID", Project_Scope_ID);
          if (sErr) throw sErr;
        }
      }

      return json(updated);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects{/:id}?" };
