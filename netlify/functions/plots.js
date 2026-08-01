import { supabase, json, fail } from "./_supabase.js";

const PLOT_COLUMNS = [
  "Plot_ID", "Project_ID", "Plot_Number", "Plot_Ref", "Property_Config_ID",
  "PV", "Heat_Pump_Model_ID", "Heat_Source_ID", "KVA_Load", "Self_Lay_Provider", "Project_Developer_ID",
].join(",");

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;

  try {
    if (req.method === "GET") {
      const { data, error } = await db
        .from("Plot")
        .select(PLOT_COLUMNS)
        .eq("Project_ID", projectId)
        .order("Plot_ID");
      if (error) throw error;

      /* The load a plot actually draws, which is usually not the one on
         its own row.

         Plot.KVA_Load is the override — normally empty. The working
         figure comes from House_Type_Consumption, looked up on bedrooms
         and heat source together. Reading the column alone shows a dash
         for a plot whose load is perfectly well known, which is what the
         plots page was doing.

         Taken from gis_unplaced_plots rather than joined again here, so
         there is one rule for what a plot draws and not two. A second
         COALESCE written out in this file would agree with that function
         today and drift from it the first time either changed — the
         canvas and the plots page would then quietly disagree about the
         same plot, which is worse than either being wrong. */
      const rows = data || [];
      const { data: resolved } = await db
        .rpc("gis_unplaced_plots", { p_project: Number(projectId) });

      const byId = new Map((resolved || []).map((r) => [Number(r.plot_id), r]));
      return json({
        rows: rows.map((p) => {
          const r = byId.get(Number(p.Plot_ID));
          return {
            ...p,
            /* Null when nothing supplies a figure, never zero. A plot
               with no load recorded and a plot drawing nothing are
               different problems and must not look the same. */
            KVA_Resolved: r?.kva_load ?? null,
            /* 'entered', 'house type' or 'not set', straight from the
               database's own verdict rather than inferred here. */
            KVA_Source: r?.kva_source ?? "not set",
          };
        }),
      });
    }

    /* Batch insert. One request for the whole set rather than one per plot —
       a 300-plot site would otherwise be 300 round trips and blow the 10s
       function timeout. Plot_Ref is left to the database trigger. */
    if (req.method === "POST") {
      const { plots = [] } = await req.json();
      if (!plots.length) return json({ error: "No plots supplied" }, 400);
      if (plots.length > 1000) return json({ error: "Maximum 1000 plots per batch" }, 400);

      const rows = plots.map((p) => ({ ...p, Project_ID: Number(projectId) }));
      const { data, error } = await db.from("Plot").insert(rows).select(PLOT_COLUMNS);

      // 23505 = unique violation on (Project_ID, Plot_Number)
      if (error && error.code === "23505") {
        return json({ error: "One or more plot numbers already exist on this project." }, 409);
      }
      if (error) throw error;
      return json({ rows: data }, 201);
    }

    /* Bulk edit: one statement for the whole selection rather than a
       request per plot, which would blow the 10s function timeout on a
       large site. */
    if (req.method === "PATCH") {
      const { plot_ids = [], changes = {} } = await req.json();
      if (!plot_ids.length) return json({ error: "No plots selected" }, 400);
      const clean = Object.fromEntries(
        Object.entries(changes).filter(([, v]) => v !== undefined)
      );
      if (!Object.keys(clean).length) return json({ error: "No changes supplied" }, 400);

      const { data, error } = await db
        .from("Plot").update(clean)
        .in("Plot_ID", plot_ids).eq("Project_ID", projectId)
        .select(PLOT_COLUMNS);
      if (error) throw error;
      return json({ rows: data, updated: data?.length ?? 0 });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const plotId = url.searchParams.get("plot_id");
      const ids = url.searchParams.get("plot_ids");
      if (!plotId && !ids) return json({ error: "plot_id or plot_ids required" }, 400);
      const list = ids ? ids.split(",").map(Number) : [Number(plotId)];
      const { error } = await db
        .from("Plot").delete().in("Plot_ID", list).eq("Project_ID", projectId);
      if (error) throw error;
      return json({ deleted: list.length });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/plots" };
