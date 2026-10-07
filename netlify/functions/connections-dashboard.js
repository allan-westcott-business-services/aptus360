import { supabase, json, fail, withAuth } from "./_supabase.js";

/* The rows the Plot Connections dashboard reasons over.

   ── Why not reuse /api/connections ──

   That endpoint carries what the TABLE renders — meter numbers, team,
   the project's site name, a photo count. The dashboard needs a
   different and much narrower set: the dates its cards compare, the
   utility, the outcome, the pack status. Pulling the table's payload
   to count exceptions would move several megabytes nobody looks at,
   and widening the table's payload to suit the dashboard would slow
   the page that is already the heaviest in the app.

   Two readers of one table wanting different columns is not a reason
   to make one query serve both badly.

   ── Why the rows and not the counts ──

   The counts could be computed in SQL and would transfer almost
   nothing. They are not, because then every predicate would exist
   twice — once in SQL for the card and once in JavaScript for the
   drill-down — and the pair would drift. This codebase has paid for
   that already: two writers of one fact, with a reader looking at the
   wrong one. One definition, in dashboardMetrics.js, and this hands it
   the rows.

   ~33,000 rows of eleven small fields is a couple of megabytes, inside
   the 6 MB a function may return. If it ever is not, `truncated` says
   so rather than the dashboard quietly counting part of the data. */

const COLS = [
  "Plot_Utility_ID", "Plot_ID", "Utility_ID",
  "Programmed_Date", "Connection_Date", "As_Laid_Date",
  "Service_Card_Submission_Date", "Meter_Card_Submission_Date",
  "Pack_Status_ID", "Visit_Outcome_ID", "Self_Lay_Provider", "Team_ID",
  "Planned_Jointing_Date", "Actual_Jointing_Date",
].join(",");

/* Same shape as the one in connections-all.js, and the same reasons:
   count, probe the first page for the real stride, then fetch the rest
   concurrently. The stride is probed rather than assumed because
   PostgREST's max-rows may be lower than the page asked for, and a
   fixed stride would step straight over the rows in between. */
async function readAll(db, table, select, orderCol, opts = {}) {
  const PAGE = opts.page || 1000;
  const CONCURRENCY = opts.concurrency || 6;
  const HARD_CAP = opts.hardCap || 200000;

  const { count, error: cErr } = await db
    .from(table).select(orderCol, { count: "exact", head: true });
  if (cErr) throw cErr;

  const total = Math.min(count || 0, HARD_CAP);
  let truncated = (count || 0) > HARD_CAP;

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

export default withAuth(async function handler() {
  const db = supabase();

  try {
    /* The project is embedded for the region filter and so a card's
       drill-down can say which contract a row belongs to. AP_Number
       because that is how the business names a contract — searching
       the connections page for one found nothing until recently. */
    const SELECT = `${COLS},Plot!inner(Plot_ID,Plot_Number,Project_ID,`
      + `Project!inner(Project_ID,Project_Ref,Site_Name,Region_ID,AP_Number))`;

    const { rows, truncated } =
      await readAll(db, "Plot_Utility", SELECT, "Plot_Utility_ID");

    const connections = rows.map((r) => {
      const { Plot, ...conn } = r;
      const proj = Plot?.Project;
      return {
        ...conn,
        _plotNumber: Plot?.Plot_Number ?? "",
        _projectId: proj?.Project_ID ?? null,
        _projectRef: proj?.Project_Ref ?? "",
        _apNumber: proj?.AP_Number ?? "",
        _siteName: proj?.Site_Name ?? "",
        _regionId: proj?.Region_ID ?? null,
      };
    });

    return json({ connections, truncated });
  } catch (e) { return fail(e, 400); }
});

export const config = { path: "/api/connections-dashboard" };
