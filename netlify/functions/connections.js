import { supabase, json, fail, withAuth } from "./_supabase.js";

const COLS = [
  "Plot_Utility_ID","Plot_ID","Utility_ID","Programmed_Date","As_Laid_Date","Connection_Date",
  "Meter_Number","Meter_Reference","Meter_Date","Service_Card_Date",
  "Service_Card_Submission_Date","Meter_Card_Submission_Date","Pack_Status_ID","Visit_Outcome",
  "IDNO_ID","Reference","AV_Value","AV_Invoice_Number","AV_Invoiced_Date","Self_Lay_Provider","Notes",
  "Dead_Jointed_Date","Visit_Outcome_ID","Team_ID",
].join(",");

const WRITABLE = new Set(COLS.split(",").filter((c) => c !== "Plot_Utility_ID"));
const pick = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => WRITABLE.has(k)).map(([k, v]) => [k, v === "" ? null : v]));

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const { data: plots, error: pErr } = await db
        /* No Self_Lay_Provider. It was the plot-level boolean, read by
           the schedule form to grey out whole plots; that form reads
           the per-utility flag off the connection rows below now. */
        .from("Plot").select("Plot_ID,Plot_Number,Plot_Ref,Property_Config_ID")
        .eq("Project_ID", projectId);
      if (pErr) throw pErr;
      const ids = (plots || []).map((p) => p.Plot_ID);
      let rows = [];
      if (ids.length) {
        /* Read from the view rather than the table: it carries the IDNO
           from the project's AV agreement, the plot's self-lay flag and a
           photo count, none of which live on the connection. Writes still
           go to Plot_Utility — a view is not something to update. */
        const { data, error } = await db.from("Plot_Connection_Detail").select("*").in("Plot_ID", ids);
        if (error) throw error;
        rows = data || [];
      }
      return json({ plots: plots || [], connections: rows });
    }

    /* ── Scheduling a plot-utility pair for a date ──

       Two jobs, and they used to be one. The row for a plot-utility
       pair has to EXIST, and it has to carry a Programmed_Date. This
       inserted the missing ones and skipped everything else — which
       worked for exactly as long as rows only came into being here.

       They do not any more. 1,714 were back-filled on 26 Aug so that
       self-lay could be recorded per utility, and a row with no dates
       on it is an empty row waiting, not a scheduled visit — the
       schedule form has said so in a comment since the day treating
       existence as "scheduled" made every such plot unselectable.

       So after the back-fill this endpoint found every pair already
       present, inserted nothing, and reported "those connections
       already exist" for every visit anybody tried to book. The form
       looked broken and no date was written.

       It now does the job it is named for: the pair ends up scheduled,
       whether that took an insert or an update.

       ── What it will not overwrite ──

       A pair that already has a Programmed_Date or a Connection_Date is
       left exactly as it is and reported back. Moving a booked visit is
       a decision with a gang and a customer behind it, and it belongs
       on the Plot Connections page where the existing date is on screen
       — not as a silent side effect of ticking a plot in a bulk form.

       ── And self-lay is refused here ──

       Not in the three screens that call this. A self-lay pair is not
       ours to connect, and that has been true in a comment on this
       function for months while the code did nothing about it. Each
       caller filtered it its own way, per PLOT, which cannot express a
       plot that is self-lay for water and ours for electric. Refused
       once, on the row that holds the fact. */
    if (req.method === "POST") {
      const { utility_ids = [], plot_ids = [], programmed_date = null, extra = {} } = await req.json();
      if (!utility_ids.length || !plot_ids.length) {
        return json({ error: "Select at least one plot and one utility" }, 400);
      }

      const { data: existing, error: exErr } = await db.from("Plot_Utility")
        .select("Plot_Utility_ID,Plot_ID,Utility_ID,Self_Lay_Provider,Programmed_Date,Connection_Date")
        .in("Plot_ID", plot_ids);
      if (exErr) throw exErr;

      const key = (p, u) => `${Number(p)}:${Number(u)}`;
      const rowFor = new Map((existing || []).map((r) => [key(r.Plot_ID, r.Utility_ID), r]));

      const toInsert = [];
      const toUpdate = [];
      const selfLay = [];
      const alreadyBooked = [];

      for (const p of plot_ids) {
        for (const u of utility_ids) {
          const row = rowFor.get(key(p, u));
          if (!row) {
            toInsert.push({
              Plot_ID: Number(p), Utility_ID: Number(u),
              Programmed_Date: programmed_date || null,
              ...pick(extra),
            });
            continue;
          }
          if (row.Self_Lay_Provider) { selfLay.push(row.Plot_Utility_ID); continue; }
          if (row.Programmed_Date || row.Connection_Date) {
            alreadyBooked.push(row.Plot_Utility_ID);
            continue;
          }
          toUpdate.push(row.Plot_Utility_ID);
        }
      }

      const written = [];

      if (toInsert.length) {
        const { data, error } = await db.from("Plot_Utility").insert(toInsert).select(COLS);
        if (error) throw error;
        written.push(...(data || []));
      }

      /* Named fields only, never an upsert. Supabase's upsert is
         ON CONFLICT DO UPDATE with exactly the fields supplied, so
         everything else on the row becomes null — the meter number, the
         as-laid date, the adopter. Recurring fault 5. */
      if (toUpdate.length) {
        const { data, error } = await db.from("Plot_Utility")
          .update({ Programmed_Date: programmed_date || null, ...pick(extra) })
          .in("Plot_Utility_ID", toUpdate)
          .select(COLS);
        if (error) throw error;
        written.push(...(data || []));
      }

      return json({
        rows: written,
        created: toInsert.length,
        updated: toUpdate.length,
        /* Counted apart, because they are three different answers to
           "why is this plot not on my list" and each needs a different
           thing doing about it. */
        self_lay: selfLay.length,
        already_scheduled: alreadyBooked.length,
      }, toInsert.length ? 201 : 200);
    }

    if (req.method === "PATCH") {
      const id = url.searchParams.get("id");
      const body = await req.json();
      if (id) {
        const { data, error } = await db.from("Plot_Utility")
          .update(pick(body)).eq("Plot_Utility_ID", id).select(COLS).single();
        if (error) throw error;
        return json(data);
      }
      // bulk: same change across many connections in one statement
      const { ids = [], changes = {} } = body;
      if (!ids.length) return json({ error: "ids required" }, 400);
      const { data, error } = await db.from("Plot_Utility")
        .update(pick(changes)).in("Plot_Utility_ID", ids).select(COLS);
      if (error) throw error;
      return json({ rows: data, updated: data.length });
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from("Plot_Utility").delete().eq("Plot_Utility_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects/:projectId/connections" };
