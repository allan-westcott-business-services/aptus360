import { supabase, json, fail } from "./_supabase.js";

/* Create any plots in the range that don't exist yet, then hand the whole
   range back ready to place. Its own path for the same reason as
   gis-plots: no ordering to get wrong. */
export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const {
      numbers = [], property_config_id = null, heat_source_id = null,
      developer_id = null,
    } = await req.json();
    if (!numbers.length) return json({ error: "No plot numbers given" }, 400);

    const { data: existing, error: exErr } = await db.from("Plot")
      .select("Plot_ID,Plot_Number").eq("Project_ID", projectId);
    if (exErr) throw exErr;
    const have = new Set((existing || []).map((p) => String(p.Plot_Number)));

    const toMake = numbers.filter((n) => !have.has(String(n)));
    if (toMake.length) {
      const rows = toMake.map((n) => ({
        Project_ID: Number(projectId),
        Plot_Number: String(n),
        Property_Config_ID: property_config_id ? Number(property_config_id) : null,
        Heat_Source_ID: heat_source_id ? Number(heat_source_id) : null,
        Project_Developer_ID: developer_id ? Number(developer_id) : null,
      }));
      const { error } = await db.from("Plot").insert(rows);
      if (error) throw error;
    }

    const { data: all, error: allErr } = await db.rpc("gis_unplaced_plots", {
      p_project: Number(projectId),
    });
    if (allErr) throw allErr;

    const wanted = numbers.map(String);
    return json({
      created: toMake.length,
      plots: (all || []).filter((p) => wanted.includes(String(p.plot_number))),
    });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/gis-ensure-plots" };
