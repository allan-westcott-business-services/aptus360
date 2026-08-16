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
        .from("Plot").select("Plot_ID,Plot_Number,Plot_Ref,Property_Config_ID,Self_Lay_Provider")
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

    /* Generating connections creates a row per plot per selected utility,
       skipping any that already exist and any self-lay plot — the customer
       connects those, so we aren't tracking them. */
    if (req.method === "POST") {
      const { utility_ids = [], plot_ids = [], programmed_date = null, extra = {} } = await req.json();
      if (!utility_ids.length || !plot_ids.length) {
        return json({ error: "Select at least one plot and one utility" }, 400);
      }
      const { data: existing } = await db.from("Plot_Utility")
        .select("Plot_ID,Utility_ID").in("Plot_ID", plot_ids);
      const have = new Set((existing || []).map((r) => `${r.Plot_ID}:${r.Utility_ID}`));

      const rows = [];
      plot_ids.forEach((p) => utility_ids.forEach((u) => {
        if (!have.has(`${p}:${u}`)) {
          rows.push({
            Plot_ID: Number(p), Utility_ID: Number(u),
            Programmed_Date: programmed_date || null,
            ...pick(extra),
          });
        }
      }));
      if (!rows.length) return json({ rows: [], created: 0, skipped: plot_ids.length * utility_ids.length });

      const { data, error } = await db.from("Plot_Utility").insert(rows).select(COLS);
      if (error) throw error;
      return json({ rows: data, created: data.length }, 201);
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
