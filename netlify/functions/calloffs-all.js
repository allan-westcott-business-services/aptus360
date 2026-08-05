import { supabase, json, fail } from "./_supabase.js";

/* Every call-off across every project, for the operations list.

   Separate from the per-project endpoint because the questions differ:
   that one asks "what is on this project", this one asks "what is coming
   up" — across the business, filtered by status, searched by reference,
   site, customer or contact.

   The joins are the point of it. A call-off on its own says Project_ID
   and little else; the list has to show the site and the customer, and
   fetching those per row would be a query per row. */

const COLS = [
  "Submission_ID", "Status", "Project_ID", "AP_Number",
  "Customer_ID", "Customer_Name", "Branch_Name",
  "Site_Name", "Site_Address", "Work_Type_ID",
  "Contact_Name", "Contact_Company", "Contact_Phone",
  "Preferred_Date", "Alternative_Date",
  "Obstruction_Free", "Ground_Unmade", "Line_Level_Required",
  "Notes", "Created_By", "Created_At",
].join(",");

export default async function handler(req) {
  const db = supabase();
  try {
    if (req.method !== "GET") return json({ error: "Not found" }, 404);

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const id = url.searchParams.get("id");

    let q = db
      .from("Mains_Call_Off_Submission")
      .select(`${COLS},Work_Type(Work_Type_ID,Work_Type_Name,Selection_Mode)`)
      .order("Submission_ID", { ascending: false });

    if (id) q = q.eq("Submission_ID", id);
    /* Statuses are filtered here rather than in the browser: a business
       with three years of call-offs should not send them all down the
       wire so the page can hide most of them. */
    if (status && status !== "all") q = q.eq("Status", status);

    const { data: subs, error } = await q;
    if (error) throw error;

    /* The rows for each, from whichever table the work type uses. Three
       queries whatever the list length, rather than one per call-off. */
    const ids = (subs || []).map((s) => s.Submission_ID);
    const kids = { Span: [], PlotList: [], ColumnList: [] };
    if (ids.length) {
      const [spans, plots, cols] = await Promise.all([
        db.from("Mains_Call_Off_Span")
          .select("Span_ID,Submission_ID,Plots,D_or_P,Energisation_Date,Estimated_Length_m,Sort_Order")
          .in("Submission_ID", ids).order("Sort_Order"),
        db.from("Service_Call_Off_Plot")
          .select("Service_Plot_ID,Submission_ID,Plot,Energisation_Date,Sort_Order")
          .in("Submission_ID", ids).order("Sort_Order"),
        db.from("Street_Light_Call_Off")
          .select("Street_Light_Call_Off_ID,Submission_ID,Street_Light_ID,Energisation_Date,Sort_Order")
          .in("Submission_ID", ids).order("Sort_Order"),
      ]);
      kids.Span = spans.data || [];
      kids.PlotList = plots.data || [];
      kids.ColumnList = cols.data || [];
    }

    /* The site name, where the submission did not capture one.

       A call-off records the site as it was when raised, so a project
       renamed later does not rewrite it. Older rows have none, and
       falling back to the project is better than a blank column. */
    const projectIds = [...new Set((subs || [])
      .map((s) => s.Project_ID).filter(Boolean))];
    let projects = new Map();
    if (projectIds.length) {
      const { data } = await db.from("Project")
        .select("Project_ID,Project_Ref,Site_Name,Site_Address")
        .in("Project_ID", projectIds);
      projects = new Map((data || []).map((p) => [Number(p.Project_ID), p]));
    }

    const rows = (subs || []).map((s) => {
      const mode = s.Work_Type?.Selection_Mode ?? null;
      const proj = projects.get(Number(s.Project_ID)) || null;
      return {
        ...s,
        Selection_Mode: mode,
        Project_Ref: proj?.Project_Ref ?? null,
        Site_Name: s.Site_Name || proj?.Site_Name || null,
        Site_Address: s.Site_Address || proj?.Site_Address || null,
        items: mode
          ? kids[mode].filter((k) => k.Submission_ID === s.Submission_ID)
          : [],
      };
    });

    return json({ rows });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/calloffs" };
