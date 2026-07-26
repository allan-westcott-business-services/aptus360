import { supabase, json, fail } from "./_supabase.js";

const COLS = [
  "Plot_Utility_ID","Plot_ID","Utility_ID","Programmed_Date","As_Laid_Date","Connection_Date",
  "Meter_Number","Meter_Reference","Meter_Date","Service_Card_Date",
  "Service_Card_Submission_Date","Meter_Card_Submission_Date","Pack_Status_ID","Visit_Outcome",
  "IDNO_ID","Reference","AV_Value","AV_Invoice_Number","AV_Invoiced_Date","Self_Lay_Provider","Notes",
].join(",");

/* Every connection across every project. Embeds the plot and its project
   so the table can show which site a row belongs to — the whole point of
   a cross-project view. */
export default async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 2000), 5000);

  try {
    const { data, error } = await db
      .from("Plot_Utility")
      .select(`${COLS},Plot!inner(Plot_ID,Plot_Number,Plot_Ref,Self_Lay_Provider,Project_ID,Project!inner(Project_ID,Project_Ref,Site_Name,Region_ID))`)
      .limit(limit);
    if (error) throw error;

    const connections = [];
    const plots = [];
    const seen = new Set();
    (data || []).forEach((r) => {
      const { Plot, ...conn } = r;
      const proj = Plot?.Project;
      connections.push({
        ...conn,
        _plotNumber: Plot?.Plot_Number ?? "",
        _projectId: proj?.Project_ID ?? null,
        _projectRef: proj?.Project_Ref ?? "",
        _siteName: proj?.Site_Name ?? "",
        _regionId: proj?.Region_ID ?? null,
      });
      if (Plot && !seen.has(Plot.Plot_ID)) {
        seen.add(Plot.Plot_ID);
        plots.push({ Plot_ID: Plot.Plot_ID, Plot_Number: Plot.Plot_Number, Self_Lay_Provider: Plot.Self_Lay_Provider });
      }
    });

    return json({ connections, plots });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/connections" };
