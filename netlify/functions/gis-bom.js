import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Quantities for a project. The aggregation is gis_bom in 0056 — a
   Postgres function rather than a query built here, so the numbers are
   the same whoever asks and however the data was changed. */
export default withAuth(async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("project");

  try {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (!projectId) return json({ error: "A project is required." }, 400);

    const { data, error } = await db.rpc("gis_bom", { p_project: Number(projectId) });
    if (error) throw error;
    return json({ rows: data || [] });
  } catch (e) { return fail(e, 400); }
});

export const config = { path: "/api/gis-bom" };
