import { supabase, json, fail, withAuth } from "./_supabase.js";

const COLS = [
  "Plot_Utility_ID","Plot_ID","Utility_ID","Programmed_Date","As_Laid_Date","Connection_Date",
  "Meter_Number","Meter_Reference","Meter_Date","Service_Card_Date",
  "Service_Card_Submission_Date","Meter_Card_Submission_Date","Pack_Status_ID","Visit_Outcome",
  "IDNO_ID","Reference","AV_Value","AV_Invoice_Number","AV_Invoiced_Date","Self_Lay_Provider","Notes",
  "Dead_Jointed_Date","Visit_Outcome_ID","Team_ID",
].join(",");

/* Every connection across every project. Embeds the plot and its project
   so the table can show which site a row belongs to — the whole point of
   a cross-project view. */
export default withAuth(async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 2000), 5000);

  try {
    const { data, error } = await db
      .from("Plot_Utility")
      .select(`${COLS},Plot!inner(Plot_ID,Plot_Number,Plot_Ref,Self_Lay_Provider,Project_ID,Project!inner(Project_ID,Project_Ref,Site_Name,Region_ID))`)
      .limit(limit);
    if (error) throw error;

    /* Three things the connection doesn't carry, fetched alongside rather
       than joined: the IDNO belongs to the project's AV agreement, and
       the photo count is a count. Small tables, one round trip each,
       merged below — cheaper and clearer than widening the embed. */
    const [agr, photos] = await Promise.all([
      db.from("AV_Agreement").select("Project_ID,Utility_ID,IDNO_ID,IDNO(IDNO_Name)"),
      db.from("Plot_Utility_Photo").select("Plot_Utility_ID"),
    ]);
    if (agr.error) throw agr.error;
    if (photos.error) throw photos.error;

    /* Keyed on project and utility together, which is what an agreement
       is scoped to. First one wins if a project has two for the same
       utility — the same rule the view uses, so the two agree. */
    const idnoBy = {};
    for (const a of agr.data || []) {
      const k = `${a.Project_ID}|${a.Utility_ID}`;
      if (!(k in idnoBy)) idnoBy[k] = { id: a.IDNO_ID, name: a.IDNO?.IDNO_Name ?? null };
    }
    const photoCount = {};
    for (const ph of photos.data || []) {
      photoCount[ph.Plot_Utility_ID] = (photoCount[ph.Plot_Utility_ID] || 0) + 1;
    }

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
        /* ── The row's own flag, not the plot's ──

           Every row here IS a plot-utility pair, and Plot_Utility
           carries Self_Lay_Provider for exactly that pair. This showed
           the plot-level boolean instead, so an SLP column sat on a
           per-utility row telling it about the whole plot: three rows
           all ticked because the water is somebody else's, and no way
           to see which one it actually was.

           Two records of one fact with a reader looking at the wrong
           one — fault 13, in a single line. The plot-level column is
           being retired; this was the last screen showing it as though
           it meant this row. */
        _slp: !!conn.Self_Lay_Provider,
        _idnoName: idnoBy[`${proj?.Project_ID}|${conn.Utility_ID}`]?.name ?? null,
        _photos: photoCount[conn.Plot_Utility_ID] || 0,
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
});

export const config = { path: "/api/connections" };
