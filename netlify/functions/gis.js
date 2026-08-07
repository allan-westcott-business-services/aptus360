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
      const [f, l, t, st, su, ut] = await Promise.all([
        db.from("GIS_Feature").select(F).eq("Project_ID", projectId).order("Feature_ID"),
        db.from("GIS_Layer").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("GIS_Line_Type").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("GIS_Style").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("GIS_Surface_Type").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("Utility").select("Utility_ID,Colour"),
      ]);
      for (const r of [f, l, t, st, su, ut]) if (r.error) throw r.error;

      /* The utility's colour, filled in wherever nothing overrides it.

         Done here rather than in the canvas because of how many places
         read a colour: the drawing, the layer menus, the line type
         menus, the legend, the swatch beside a feature in the editor.
         Every one of them takes Colour off the layer or the line type
         and would have needed the same three-step fallback written
         again, and the one that got missed would be the one drawing in
         grey.

         Filled, not overridden, for line types: one that carries its
         own colour is a deliberate departure — a brown trench on the
         electric layer — and keeps it. Null means "the utility's",
         which is what 0123 left behind everywhere the colour was merely
         a copy.

         Layers are the other way round: the utility wins over what the
         layer stores. GIS_Layer."Colour" is NOT NULL so it cannot say
         "inherit", and a layer stands one-to-one with its utility — the
         electric layer is the electric utility — so a colour there is
         the same fact written twice rather than an override worth
         honouring. Nothing in the application edits it.

         A layer with no utility, which is what trench is, comes back
         exactly as it is stored. */
      const byUtility = new Map((ut.data || [])
        .filter((u) => u.Colour)
        .map((u) => [Number(u.Utility_ID), u.Colour]));

      const layers = (l.data || []).map((x) => ({
        ...x,
        Colour: byUtility.get(Number(x.Utility_ID)) ?? x.Colour ?? null,
      }));
      const layerColour = new Map(layers.map((x) => [x.Layer_Key, x.Colour]));

      const lineTypes = (t.data || []).map((x) => ({
        ...x,
        Colour: x.Colour ?? layerColour.get(x.Layer_Key) ?? null,
      }));

      /* Style rows are left alone. A null colour there already means
         "inherit", and the cascade in gisStyle.js resolves it against
         the line type and the layer — which now carry the utility's. */
      return json({
        features: f.data || [], layers,
        lineTypes, styles: st.data || [],
        surfaceTypes: su.data || [],
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await db.from("GIS_Feature")
        .insert(pick({ ...body, Project_ID: Number(projectId) })).select(F).single();
      if (error) throw error;
      return json(data, 201);
    }

    /* Dragging produces a stream of positions. Sending the whole moved
       set in one call keeps it to a single request per drag.

       Each update carries whatever it wants changed, filtered through
       the same writable list as a single PATCH — a drag sends Geometry
       alone, a bulk edit sends Attributes and Label. Attributes is
       replaced wholesale, not merged, so the caller sends the merged
       object; that is deliberate, because a partial merge here would
       have no way to remove a key. */
    if (req.method === "PATCH" && !id) {
      const { updates = [] } = await req.json();
      if (!updates.length) return json({ updated: 0 });
      const results = await Promise.all(updates.map((u) =>
        db.from("GIS_Feature").update(pick(u))
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
