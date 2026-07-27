import { supabase, json, fail } from "./_supabase.js";

/* Network operations. Each is a graph walk or a distance search across
   the whole drawing, so they run in the database rather than as a
   sequence of calls over HTTP. */
export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const op = new URL(req.url).searchParams.get("op");

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (op === "joints") {
      const { data, error } = await db.rpc("gis_place_joints", {
        p_project: Number(projectId), p_tol: 0.3,
      });
      if (error) throw error;
      return json({ placed: data ?? 0 });
    }

    if (op === "trace") {
      const { source_feature_id } = await req.json();
      if (!source_feature_id) return json({ error: "A source is needed to trace from" }, 400);
      const { data, error } = await db.rpc("gis_trace_network", {
        p_project: Number(projectId), p_source_feature: Number(source_feature_id),
      });
      if (error) throw error;
      return json({ traced: data ?? 0 });
    }

    if (op === "meters") {
      const { max_m = 30 } = await req.json().catch(() => ({}));
      const { data, error } = await db.rpc("gis_assign_meters", {
        p_project: Number(projectId), p_max_m: Number(max_m),
      });
      if (error) throw error;
      return json({ assigned: data ?? 0 });
    }

    if (op === "source") {
      const body = await req.json();
      const { data, error } = await db.from("GIS_Source")
        .insert({ ...body, Project_ID: Number(projectId) }).select().single();
      if (error) throw error;
      return json(data, 201);
    }

    return json({ error: `Unknown operation "${op}"` }, 400);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/gis-network" };
