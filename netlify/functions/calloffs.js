import { supabase, json, fail } from "./_supabase.js";

/* Call-offs: a request to come and do a piece of work on a site.

   One submission, with rows underneath saying which pieces — and which
   table those rows live in depends on the work type's Selection_Mode.
   Three tables rather than one with mostly-null columns, because a run
   of trench, a plot and a lighting column are different things. */

const SUB_COLS = [
  "Submission_ID", "Status", "Project_ID",
  "Customer_ID", "Customer_Name", "Branch_ID", "Branch_Name",
  "Contract_ID", "AP_Number", "Site_Name", "Site_Address",
  "Work_Type_ID", "Contact_Name", "Contact_Phone", "Contact_Company",
  "Preferred_Date", "Alternative_Date",
  "Obstruction_Free", "Ground_Unmade", "Line_Level_Required",
  "Notes", "GIS_Data", "Created_By", "Created_At",
].join(",");

const WRITABLE = new Set(SUB_COLS.split(",")
  .filter((c) => c !== "Submission_ID" && c !== "Created_At"));

const pick = (o) => Object.fromEntries(
  Object.entries(o || {}).filter(([k]) => WRITABLE.has(k)));

/* Where each mode's rows live, and what identifies one.

   Held in one place so a mode cannot be handled one way on the way in
   and another on the way out. */
export const CHILD = {
  Span: {
    table: "Mains_Call_Off_Span",
    key: "Span_ID",
    cols: ["Plots", "D_or_P", "Energisation_Date", "Estimated_Length_m",
      "Sort_Order", "From_Node_ID", "To_Node_ID"],
  },
  PlotList: {
    table: "Service_Call_Off_Plot",
    key: "Service_Plot_ID",
    cols: ["Plot", "Energisation_Date", "Sort_Order"],
  },
  ColumnList: {
    table: "Street_Light_Call_Off",
    key: "Street_Light_Call_Off_ID",
    cols: ["Street_Light_ID", "Energisation_Date", "Sort_Order"],
  },
};

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const id = new URL(req.url).searchParams.get("id");

  try {

    /* ── GET: every call-off on a project, with its rows ── */
    if (req.method === "GET") {
      const { data: subs, error } = await db
        .from("Mains_Call_Off_Submission")
        .select(`${SUB_COLS},Work_Type(Work_Type_ID,Work_Type_Name,Selection_Mode)`)
        .eq("Project_ID", projectId)
        .order("Submission_ID", { ascending: false });
      if (error) throw error;

      /* The rows for each submission, from whichever table its mode
         uses. Fetched per table rather than per submission: three
         queries whatever the list length, instead of one per row. */
      const ids = (subs || []).map((s) => s.Submission_ID);
      const kids = {};
      if (ids.length) {
        for (const [mode, spec] of Object.entries(CHILD)) {
          const { data } = await db
            .from(spec.table)
            .select(`${spec.key},Submission_ID,${spec.cols.join(",")}`)
            .in("Submission_ID", ids)
            .order("Sort_Order");
          kids[mode] = data || [];
        }
      }

      const rows = (subs || []).map((s) => {
        const mode = s.Work_Type?.Selection_Mode ?? null;
        const mine = mode
          ? (kids[mode] || []).filter((k) => k.Submission_ID === s.Submission_ID)
          : [];
        return { ...s, Selection_Mode: mode, items: mine };
      });

      return json({ rows });
    }

    /* ── POST: a new call-off, with its rows ── */
    if (req.method === "POST") {
      const body = await req.json();
      const { items = [], Selection_Mode: mode, ...sub } = body;

      const { data: created, error } = await db
        .from("Mains_Call_Off_Submission")
        .insert(pick(sub))
        .select(SUB_COLS)
        .single();
      if (error) throw error;

      /* The rows, in the table the mode calls for.

         Written after the submission and reported separately if they
         fail: a submission with no rows is recoverable by editing, and
         losing the whole thing because one row was malformed is not. */
      const spec = CHILD[mode];
      if (spec && items.length) {
        const payload = items.map((r, i) => {
          const out = { Submission_ID: created.Submission_ID, Sort_Order: i };
          for (const c of spec.cols) if (c !== "Sort_Order") out[c] = r[c] ?? null;
          return out;
        });
        const { error: kidErr } = await db.from(spec.table).insert(payload);
        if (kidErr) {
          return json({
            ...created,
            warning: `Saved as #${created.Submission_ID}, but the rows failed: ${kidErr.message}`,
          });
        }
      }

      return json(created);
    }

    /* ── PATCH: the submission only ── */
    if (req.method === "PATCH" && id) {
      const body = await req.json();
      const { data, error } = await db
        .from("Mains_Call_Off_Submission")
        .update(pick(body))
        .eq("Submission_ID", id)
        .select(SUB_COLS)
        .single();
      if (error) throw error;
      return json(data);
    }

    /* ── DELETE: the submission, and its rows with it ── */
    if (req.method === "DELETE" && id) {
      const { error } = await db
        .from("Mains_Call_Off_Submission")
        .delete()
        .eq("Submission_ID", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/calloffs" };
