import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Which plots are still to place, and which utilities need meters.

   Its own path rather than a query parameter on /gis: a conditional
   branch below an unconditional one for the same method is invisible
   until something silently returns the wrong shape, which is exactly
   what happened here. A distinct route can't be shadowed. */
export default withAuth(async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const [plots, utils] = await Promise.all([
      db.rpc("gis_unplaced_plots", { p_project: Number(projectId) }),
      db.rpc("gis_project_utilities", { p_project: Number(projectId) }),
    ]);
    if (plots.error) throw plots.error;
    if (utils.error) throw utils.error;

    return json({ plots: plots.data || [], utilities: utils.data || [] });
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects/:projectId/gis-plots" };
