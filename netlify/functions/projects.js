import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Columns are listed explicitly and in one place. If the schema moves, the
   query fails loudly at this boundary instead of being swallowed by a
   fallback — the failure mode that hid sixteen phantom columns in the
   legacy contract list. */
const PROJECT_COLUMNS = [
  "Project_ID", "Project_Ref", "Revision", "Option_Letter", "Display_Ref", "Project_Status_ID",
  /* The two references the project is known by elsewhere: the AP number
     to the network operator, the tender reference to the client. */
  "AP_Number", "Tender_Ref",
  "Customer_ID", "Branch_ID",
  /* The branch where it is an Organisation_Branch (0154). A project
     names one or the other, never both. */
  "Organisation_Branch_ID",
  "Region_ID", "Sub_Region_ID",
  "Site_Name", "Site_Address", "Postcode", "Eastings", "Northings",
  "Date_Received", "KPI_Date", "Date_Sent", "Secured_Date", "Status_Changed_Date",
  "BDD_KAM_ID", "Estimator_ID", "Quote_Type_ID", "I_and_C", "Is_Priority", "Notes",
  "Contract_Number", "Date_Signed", "Site_Contact", "Project_Manager_ID",
  "Fire_Service_ID", "Heat_Pump_Model_ID", "Default_Heat_Source_ID",
  "Lay_Only_MU", "Minimum_Service_Call_Off", "Town_Council_ID", "County_Council_ID",
  "Tender_Base_Points", "Tender_Total_Points", "Manual_Base_Points",
  "Total_Design_Points", "Points_Breakdown",
  "Manual_Total_Points", "Points_Note",
].join(",");

const SCOPE_COLUMNS = [
  "Project_Scope_ID", "Project_ID", "Utility_ID", "Scope_Status_ID",
  "Date_Sent", "Secured_Date", "Quote_Value_To_Client", "Quote_Value_To_Aptus",
  "Designer_ID", "Design_Status_ID", "Design_Checked_By", "POC_Status_ID",
  "Target_Date", "Actual_Date", "Revision",
  "Carried_Forward", "External_Design", "IDNO_ID", "Reference",
  /* The distribution operator for this utility — 0121. Listed here or
     the scope comes back without it and the picker opens empty on a
     project that has one set. */
  "DNO_Organisation_ID",
  "Auto_Base_Points", "Manual_Base_Points", "Base_Points_Overridden",
  /* What new runs on this utility are drawn with. Electric takes a
     cable from the catalogue; gas and water take free text, because
     their sizes are free text on the features too. */
  "Default_Main_Cable_Size_ID", "Default_Service_Cable_Size_ID",
  "Default_Main_Size", "Default_Service_Size",
].join(",");


/* An HTML form sends "" for an untouched field. Postgres rejects that for
   date, numeric and bigint columns — "invalid input syntax for type date".
   Empty means absent, so normalise to null at the boundary. */
/* Computed fields like Auto_Plot_Count are added to the GET response, and
   forms post the whole object back. Filter to real columns so a derived
   value can't be mistaken for something writable. */
/* Columns the database fills in for itself.

   Display_Ref is a stored generated column — Project_Ref with the option
   letter appended — and Postgres refuses an UPDATE that names one at
   all, even setting it to the value it already holds: "column
   Display_Ref can only be updated to DEFAULT". Changing the site name
   failed with an error about a field nobody had touched.

   The cause is that WRITABLE was built from the read list. A column
   being readable does not make it writable, and Display_Ref has to be
   read — it is what the project dropdowns show. Anything generated added
   later belongs here too, and the schema is the only place that fact
   lives, so it is written down rather than inferred. */
const GENERATED = new Set(["Display_Ref"]);

const WRITABLE = new Set(PROJECT_COLUMNS.split(",")
  .filter((c) => c !== "Project_ID" && !GENERATED.has(c)));
const onlyColumns = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => WRITABLE.has(k)));

function nullEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === "" ? null : v;
  }
  return out;
}

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const id = context?.params?.id;

  try {
    /* ── GET /api/projects/:id ─────────────────────────────────── */
    if (req.method === "GET" && id) {
      const [{ data: project, error: pErr }, { data: scopes, error: sErr }, { count, error: cErr }] =
        await Promise.all([
          db.from("Project").select(PROJECT_COLUMNS).eq("Project_ID", id).single(),
          db.from("Project_Scope").select(SCOPE_COLUMNS).eq("Project_ID", id).order("Utility_ID"),
          db.from("Plot").select("Plot_ID", { count: "exact", head: true }).eq("Project_ID", id),
        ]);
      if (pErr) throw pErr;
      if (sErr) throw sErr;
      if (cErr) throw cErr;
      return json({ ...project, Auto_Plot_Count: count ?? 0, scopes: scopes || [] });
    }

    /* ── GET /api/projects ─────────────────────────────────────── */
    if (req.method === "GET") {
      const url = new URL(req.url);
      const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
      const offset = Number(url.searchParams.get("offset") || 0);

      /* Embedded selects keep this to one round trip. Plot(count) returns
         an aggregate rather than the rows themselves. */
      let q = db
        .from("Project")
        .select(
          /* Designer_ID as well: the list shows who is on each outline
             design and filters by them, and without it the column can
             only count. */
          `${PROJECT_COLUMNS},Project_Scope(Utility_ID,Scope_Status_ID,Design_Status_ID,Designer_ID),Plot(count)`,
          { count: "exact" }
        )
        .order("Date_Received", { ascending: false })
        .range(offset, offset + limit - 1);

      const status = url.searchParams.get("status_id");
      if (status) q = q.eq("Project_Status_ID", status);

      const { data, error, count } = await q;
      if (error) throw error;

      const rows = (data || []).map((r) => {
        const { Plot, Project_Scope, ...rest } = r;
        return {
          ...rest,
          Plot_Count: Plot?.[0]?.count ?? 0,
          scopes: Project_Scope || [],
        };
      });
      return json({ rows, total: count });
    }

    /* ── POST /api/projects ────────────────────────────────────── */
    if (req.method === "POST") {
      const body = await req.json();
      const { scopes = [], ...project } = body;

      const { data: created, error } = await db
        .from("Project")
        .insert(onlyColumns(nullEmpty(project)))
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
        .update(onlyColumns(nullEmpty(changes)))
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

    if (req.method === "DELETE" && id) {
      const { error } = await db.from("Project").delete().eq("Project_ID", id);
      if (error && error.code === "23503") {
        return json({ error: "This project has plots or designs attached. Remove those first." }, 409);
      }
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects{/:id}?" };
