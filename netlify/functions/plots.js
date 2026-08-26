import { supabase, json, fail, withAuth } from "./_supabase.js";

const PLOT_COLUMNS = [
  "Plot_ID", "Project_ID", "Plot_Number", "Plot_Ref", "Property_Config_ID",
  "PV", "Heat_Pump_Model_ID", "Heat_Source_ID", "KVA_Load", "Self_Lay_Provider", "Project_Developer_ID",
  /* The gas override, beside the electric one and read the same way:
     normally empty, with the working figure coming from the house type.
     Listed here because a column absent from this list is neither saved
     nor returned, and the screen shows a blank that looks like a plot
     with no gas rather than a column nobody wired up. */
  "Gas_Load_kW",
].join(",");

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  /* Declared here rather than in the branch that first needed it. The
     self-lay PATCH below reads a query parameter, and a `const` in the
     DELETE branch is not in scope above it — that is fault 2, and it
     throws rather than misbehaving, which is the good version of it. */
  const url = new URL(req.url);

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

      /* ── Which utilities each plot takes, and which are self-lay ──

         From Plot_Utility, one row per plot per utility. The flag that
         matters is on THAT row, not Plot.Self_Lay_Provider: a plot can
         be self-lay for water and ours for electric, and the plot-level
         boolean cannot say so. Both columns exist and 0066 has to alias
         one of them to stop them colliding in a view, which is how
         close together they sit.

         One query for the project rather than one per plot: a 150-plot
         site is 450 rows, and 450 round trips would blow the ten-second
         function timeout.

         Every plot has rows as of 26 Aug — 1,714 were back-filled from
         each project's Project_Scope, since only 28 plots had any. A
         plot with none is therefore a plot added since, or one whose
         project has no scopes, and it comes back with empty lists
         rather than being hidden: a plot that takes no utilities is a
         real thing to look at, not a row to drop. */
      const ids = rows.map((p) => p.Plot_ID);
      let utilRows = [];
      if (ids.length) {
        const { data: pu, error: puErr } = await db.from("Plot_Utility")
          .select("Plot_ID,Utility_ID,Self_Lay_Provider").in("Plot_ID", ids);
        if (puErr) throw puErr;
        utilRows = pu || [];
      }
      const utilsOf = new Map();
      const slpOf = new Map();
      for (const r of utilRows) {
        const k = Number(r.Plot_ID);
        if (!utilsOf.has(k)) { utilsOf.set(k, []); slpOf.set(k, []); }
        utilsOf.get(k).push(Number(r.Utility_ID));
        if (r.Self_Lay_Provider) slpOf.get(k).push(Number(r.Utility_ID));
      }

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
            /* And the same for gas, from the same function for the same
               reason: one rule for what a plot draws, so the canvas and
               this page cannot disagree about the same plot.

               The source carries a fourth verdict the electric one has
               no use for — 'no gas' — because a plot on air source
               correctly has no figure, and that is not the same as a
               gas plot nobody has set one for. The screen shows those
               two differently and needs to be told which is which. */
            Gas_Load_Resolved: r?.gas_load_kw ?? null,
            Gas_Load_Source: r?.gas_load_source ?? "not set",
            /* Sorted, so a chip list reads the same on every row and
               two plots with the same utilities cannot look different.
               Utility_ID order is the seeded order — electric, gas,
               water — which is how they are said out loud. */
            Utility_IDs: (utilsOf.get(Number(p.Plot_ID)) || []).sort((a, b) => a - b),
            SLP_Utility_IDs: (slpOf.get(Number(p.Plot_ID)) || []).sort((a, b) => a - b),
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

      /* ── A plot takes the utilities its project is scoped for ──

         One Plot_Utility row per new plot per utility on Project_Scope,
         which is the same rule the 1,714 rows were back-filled by on
         26 Aug. Without this a plot added afterwards would have none —
         and a plot with no rows cannot be marked self-lay, cannot be
         scheduled, and appears on no connections list. It would look
         like a plot nobody had got to yet.

         Self_Lay_Provider defaults to false, so a new plot is ours
         until somebody says otherwise. That is the safe direction: the
         other one takes work off a call-off nobody decided to give
         away.

         ── Not fatal ──

         The plots are already inserted and there is no transaction
         across the two. A failure here leaves plots with no utilities,
         which is recoverable — the same query that back-filled the
         first 1,714 fills them in, and it is in 0197's sibling note.
         Losing the plots to roll it back would be worse.

         So it is reported ON the response rather than thrown: the
         screen says the plots were added and what did not follow, which
         is what somebody needs to know to put it right. Swallowing it
         would leave a plot that looks complete and takes no part in
         anything, which is fault 22. */
      const created = data || [];
      let utilityRows = 0;
      let utilityError = null;

      if (created.length) {
        const { data: scopes, error: sErr } = await db.from("Project_Scope")
          .select("Utility_ID").eq("Project_ID", projectId);

        if (sErr) {
          utilityError = sErr.message;
        } else {
          /* Distinct, because Project_Scope holds a row per utility and
             a duplicate would insert the same pair twice — there is no
             unique index on (Plot_ID, Utility_ID) to catch it. */
          const utilityIds = [...new Set((scopes || [])
            .map((x) => Number(x.Utility_ID)).filter(Number.isFinite))];

          if (utilityIds.length) {
            const pairs = created.flatMap((p) =>
              utilityIds.map((u) => ({ Plot_ID: p.Plot_ID, Utility_ID: u })));
            const { data: made, error: puErr } = await db.from("Plot_Utility")
              .insert(pairs).select("Plot_Utility_ID");
            if (puErr) utilityError = puErr.message;
            else utilityRows = (made || []).length;
          }
        }
      }

      return json({
        rows: created,
        /* Said plainly, so the screen can report it. A project with no
           scopes yields none, which is true and worth seeing rather
           than a silent zero. */
        utility_rows: utilityRows,
        ...(utilityError ? { utility_error: utilityError } : {}),
      }, 201);
    }

    /* ── Self-lay, per plot per utility ──

       Its own branch rather than part of the bulk PATCH above, because
       it writes a different table. That one updates Plot; this updates
       Plot_Utility, one row per plot per utility, and the two have
       nothing in common but the plot ids.

       A separate branch and not a separate FILE only because it is the
       same resource — but note the branch order rule: this is a PATCH
       with `self_lay` in the body, and it sits ABOVE the unconditional
       PATCH. A conditional branch below an unconditional one for the
       same method never runs, which is recurring fault 1 and has bitten
       four times.

       ── It updates and never inserts ──

       Every plot has a row per utility its project is scoped for; 1,714
       were back-filled on 26 Aug. So a missing row is a fact about the
       drawing, not something to paper over: silently creating one would
       give a plot a connection for a utility its project is not doing,
       and nothing would say where it came from.

       The count of what was actually written is returned, so a caller
       that asked for forty and changed thirty-eight can say so. */
    if (req.method === "PATCH" && url.searchParams.get("self_lay") !== null) {
      const { plot_ids = [], utility_id = null, value = null } = await req.json();
      if (!plot_ids.length) return json({ error: "No plots selected" }, 400);
      if (utility_id == null) return json({ error: "utility_id required" }, 400);
      if (typeof value !== "boolean") return json({ error: "value must be true or false" }, 400);

      /* Only this project's plots. plot_ids arrives from the browser,
         and a plot id from another project would otherwise be writable
         through this route. */
      const { data: mine, error: mErr } = await db.from("Plot")
        .select("Plot_ID").eq("Project_ID", projectId).in("Plot_ID", plot_ids);
      if (mErr) throw mErr;
      const allowed = (mine || []).map((p) => p.Plot_ID);
      if (!allowed.length) return json({ error: "No plots on this project" }, 400);

      const { data, error } = await db.from("Plot_Utility")
        .update({ Self_Lay_Provider: value, Updated_At: new Date().toISOString() })
        .in("Plot_ID", allowed).eq("Utility_ID", Number(utility_id))
        .select("Plot_ID,Utility_ID,Self_Lay_Provider");
      if (error) throw error;

      const written = data || [];
      return json({
        rows: written,
        updated: written.length,
        /* Named, not counted. A plot with no row for this utility is
           one whose project is not scoped for it — worth saying, and a
           number on its own is something to go looking for. */
        missing: allowed.filter((id) =>
          !written.some((w) => Number(w.Plot_ID) === Number(id))),
      });
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
});

export const config = { path: "/api/projects/:projectId/plots" };
