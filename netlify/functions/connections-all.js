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

  try {
    /* ── Every row, fetched a page at a time ──

       This took `.limit(2000)` and returned whatever 2,000 rows came
       back first. No ORDER BY, so WHICH 2,000 was Postgres's business,
       and the page said nothing about the rest: a project with 238
       connections showed one of them, and the count beside it read 1
       as though that were the fact.

       Silent truncation on a page people plan work from is worse than
       a slow page and far worse than an error. 33,000 connections came
       in from the original app and the cap was set when there were a
       couple of thousand.

       Ordered by the key so the pages cannot overlap or skip - an
       unordered range scan may return a row twice and another not at
       all. `truncated` is reported rather than assumed impossible: if
       it is ever true the page says so instead of quietly lying.  */
    const PAGE = 1000;
    const HARD_CAP = 200000;
    const data = [];
    let truncated = false;
    let from = 0;
    for (;;) {
      const { data: page, error } = await db
        .from("Plot_Utility")
        .select(`${COLS},Plot!inner(Plot_ID,Plot_Number,Plot_Ref,Project_ID,Project!inner(Project_ID,Project_Ref,Site_Name,Region_ID,AP_Number))`)
        .order("Plot_Utility_ID", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!page || page.length === 0) break;
      for (const row of page) data.push(row);
      /* Advanced by what came BACK, not by what was asked for, and
         stopped only on an empty page.

         PostgREST has a max-rows of its own. Ask for 1,000 where the
         server allows 500 and every page is short — and "a short page
         means the end" would stop at 500 rows and call it the whole
         table. That is the same silent truncation this is replacing,
         rebuilt in the fix for it. */
      from += page.length;
      if (data.length >= HARD_CAP) { truncated = true; break; }
    }

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
        /* The AP number, which is how the business names a contract.
           It was in neither the payload nor the search, so looking up
           AP1989 on this page found nothing at all. */
        _apNumber: proj?.AP_Number ?? "",
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
        /* The plot, without a self-lay flag on it. Self-lay belongs to
           a plot-utility pair and is on each connection row above. */
        plots.push({ Plot_ID: Plot.Plot_ID, Plot_Number: Plot.Plot_Number });
      }
    });

    return json({ connections, plots, truncated });
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/connections" };
