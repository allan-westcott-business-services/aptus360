import { supabase, json, fail } from "./_supabase.js";

const F = "Feature_ID,Project_ID,Layer_Key,Feature_Type,Geometry,Label,Attributes,Plot_ID,Feature_Role";
const W = new Set(F.split(",").filter((x) => x !== "Feature_ID"));
const pick = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => W.has(k)));

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const [f, l, t] = await Promise.all([
        db.from("GIS_Feature").select(F).eq("Project_ID", projectId).order("Feature_ID"),
        db.from("GIS_Layer").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("GIS_Line_Type").select("*").eq("Is_Active", true).order("Sort_Order"),
      ]);
      for (const r of [f, l, t]) if (r.error) throw r.error;
      return json({ features: f.data || [], layers: l.data || [], lineTypes: t.data || [] });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await db.from("GIS_Feature")
        .insert(pick({ ...body, Project_ID: Number(projectId) })).select(F).single();
      if (error) throw error;
      return json(data, 201);
    }

    /* Dragging produces a stream of positions. Sending the whole moved
       set in one call keeps it to a single request per drag. */
    if (req.method === "PATCH" && !id) {
      const { updates = [] } = await req.json();
      if (!updates.length) return json({ updated: 0 });
      const results = await Promise.all(updates.map((u) =>
        db.from("GIS_Feature").update({ Geometry: u.Geometry })
          .eq("Feature_ID", u.Feature_ID).eq("Project_ID", projectId)
      ));
      const bad = results.find((r) => r.error);
      if (bad) throw bad.error;
      return json({ updated: updates.length });
    }

    if (req.method === "PATCH" && id) {
      const { data, error } = await db.from("GIS_Feature")
        .update(pick(await req.json())).eq("Feature_ID", id).select(F).single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE") {
      const ids = url.searchParams.get("ids");
      if (!ids) return json({ error: "ids required" }, 400);
      const { error } = await db.from("GIS_Feature")
        .delete().in("Feature_ID", ids.split(",").map(Number)).eq("Project_ID", projectId);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/gis" };
