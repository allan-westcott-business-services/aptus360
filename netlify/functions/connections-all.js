import { supabase, json, fail, withAuth } from "./_supabase.js";

/* ── Only what this page reads ──

   Every field here is rendered, filtered on or used to build a row.
   The ones taken out - Meter_Reference, Meter_Date, Service_Card_Date,
   Reference, AV_Value, AV_Invoice_Number, AV_Invoiced_Date, Notes,
   Dead_Jointed_Date, IDNO_ID and the plot's Plot_Ref - appear nowhere
   in PlotConnectionsPage.

   It matters now because the page loads EVERY connection, and there
   are 33,150 of them: a field nobody looks at is a column of nulls
   repeated thirty-three thousand times, and a Netlify function's
   response is capped at 6 MB.

   Safe because an edit sends a one-field patch - `{ [key]: value }` -
   rather than writing the row back whole. If that ever changes, a
   field missing from here would be saved as null, so the two belong
   in the same thought. */
const COLS = [
  "Plot_Utility_ID", "Plot_ID", "Utility_ID",
  "Programmed_Date", "Connection_Date", "As_Laid_Date",
  "Meter_Number", "Service_Card_Submission_Date", "Meter_Card_Submission_Date",
  "Pack_Status_ID", "Visit_Outcome_ID", "Self_Lay_Provider", "Team_ID",
  "Planned_Jointing_Date", "Actual_Jointing_Date",
].join(",");

/* ── Read a whole table, in parallel, without lying about it ──

   Three versions of this before it became a function, and the first
   two were each wrong in a different direction.

   It began as `.limit(2000)` with no ORDER BY: whichever 2,000 rows
   came back first, nothing said the rest existed, and a project with
   238 connections showed one of them. Silent truncation on a page
   people plan gangs from.

   Replacing that with a sequential page-by-page loop fixed the lie and
   created a hang: 33,150 connections is 34 round trips one after
   another, and a Netlify function does not get that long. The page sat
   on "Loading connections" and timed out. A fix whose cost nobody
   measured.

   So: ask how many there are, then fetch the ranges CONCURRENTLY. The
   wall clock becomes the slowest batch rather than the sum of all of
   them. Bounded, because thirty-four simultaneous requests is its own
   kind of rude.

   ── The first page is a probe ──

   Parallel ranges have to assume a stride, and assuming 1,000 where
   PostgREST's own max-rows is lower would SKIP every row between what
   came back and where the next range starts. Silent loss again, and
   worse than the sequential version, because nothing downstream would
   be left to notice. So the first page is fetched alone and its length
   IS the stride.

   Returns `{ rows, truncated }`. Truncation is reported, never
   assumed impossible: short of the count means something was skipped
   or written while this ran, and either way the caller must not
   present what it has as the whole of it. */
async function readAll(db, table, select, orderCol, opts = {}) {
  const PAGE = opts.page || 1000;
  const CONCURRENCY = opts.concurrency || 6;
  const HARD_CAP = opts.hardCap || 200000;

  const { count, error: cErr } = await db
    .from(table).select(orderCol, { count: "exact", head: true });
  if (cErr) throw cErr;

  const total = Math.min(count || 0, HARD_CAP);
  let truncated = (count || 0) > HARD_CAP;

  /* Ordered by the key so the ranges cannot overlap or skip. An
     unordered range scan may hand back a row twice and another not at
     all, and fetched in parallel there is no sequence left to notice
     it from. */
  const at = (from, size) => db.from(table).select(select)
    .order(orderCol, { ascending: true }).range(from, from + size - 1);

  const first = await at(0, PAGE);
  if (first.error) throw first.error;
  const head = first.data || [];
  const stride = head.length;

  const pages = [head];
  if (stride > 0 && stride < total) {
    const starts = [];
    for (let i = stride; i < total; i += stride) starts.push(i);
    for (let i = 0; i < starts.length; i += CONCURRENCY) {
      const got = await Promise.all(
        starts.slice(i, i + CONCURRENCY).map((f) => at(f, stride)));
      for (const r of got) {
        if (r.error) throw r.error;
        pages.push(r.data || []);
      }
    }
  }
  const rows = pages.flat();
  if (rows.length < total) truncated = true;
  return { rows, truncated };
}

/* Every connection across every project. Embeds the plot and its project
   so the table can show which site a row belongs to — the whole point of
   a cross-project view. */
export default withAuth(async function handler(req) {
  const db = supabase();

  try {
    const SELECT =
      `${COLS},Plot!inner(Plot_ID,Plot_Number,Project_ID,` +
      `Project!inner(Project_ID,Project_Ref,Site_Name,Region_ID,AP_Number))`;

    const { rows: data, truncated: connTruncated } =
      await readAll(db, "Plot_Utility", SELECT, "Plot_Utility_ID");

    /* Three things the connection doesn't carry, fetched alongside rather
       than joined: the IDNO belongs to the project's AV agreement, and
       the photo count is a count. Small tables, one round trip each,
       merged below — cheaper and clearer than widening the embed. */
    const [agr, photos] = await Promise.all([
      db.from("AV_Agreement").select("Project_ID,Utility_ID,IDNO_ID,IDNO(IDNO_Name)"),
      /* Paged too. This was a bare select, which PostgREST caps at its
         own max-rows: past that the counts were simply short, and a
         photo count that silently stops at a round number is the same
         fault as the row cap above, one query lower down. */
      readAll(db, "Plot_Utility_Photo", "Plot_Utility_ID", "Photo_ID"),
    ]);
    if (agr.error) throw agr.error;

    /* Keyed on project and utility together, which is what an agreement
       is scoped to. First one wins if a project has two for the same
       utility — the same rule the view uses, so the two agree. */
    const idnoBy = {};
    for (const a of agr.data || []) {
      const k = `${a.Project_ID}|${a.Utility_ID}`;
      if (!(k in idnoBy)) idnoBy[k] = { id: a.IDNO_ID, name: a.IDNO?.IDNO_Name ?? null };
    }
    const photoCount = {};
    for (const ph of photos.rows || []) {
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

    /* Either being short makes the page incomplete, and the page
       should say so once rather than reason about which. */
    const truncated = connTruncated || photos.truncated;

    return json({ connections, plots, truncated });
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/connections" };
