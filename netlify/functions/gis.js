import { supabase, json, fail, withAuth } from "./_supabase.js";

const F = "Feature_ID,Project_ID,Layer_Key,Feature_Type,Geometry,Label,Attributes,Plot_ID,Feature_Role";
const W = new Set(F.split(",").filter((x) => x !== "Feature_ID"));
const pick = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => W.has(k)));

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const [f, l, t, st, su, ut, dr, df, lr] = await Promise.all([
        db.from("GIS_Feature").select(F).eq("Project_ID", projectId).order("Feature_ID"),
        db.from("GIS_Layer").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("GIS_Line_Type").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("GIS_Style").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("GIS_Surface_Type").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("Utility").select("Utility_ID,Colour"),
        /* Excavation and lay rates (0158). Fetched with the rest rather
           than on their own endpoint: they are read at the same moment
           as the surfaces they multiply, and a second round trip to get
           three small lookup tables would make the canvas draw its
           trenches before it could say how long they take. */
        db.from("Dig_Rate").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("Dig_Depth_Factor").select("*").order("Depth_From_M"),
        db.from("Dig_Lay_Rate").select("*").eq("Is_Active", true),
      ]);
      for (const r of [f, l, t, st, su, ut]) if (r.error) throw r.error;

      /* The rate tables are allowed to be missing.

         They arrive in 0158, and an instance that has not been migrated
         yet should still draw. digRate.js carries the same figures as
         its fallback, so an empty array here means the estimates come
         from the code rather than that they disappear — which is what
         the canvas wants, and is not true of the tables above it. */
      for (const r of [dr, df, lr]) {
        if (r.error && !/does not exist/i.test(r.error.message ?? "")) throw r.error;
      }

      /* The utility's colour, applied to what reads it.

         Done here rather than in the canvas because of how many places
         read a colour: the drawing, the layer menus, the line type
         menus, the legend, the swatch beside a feature in the editor.
         Every one takes Colour off the layer or the line type and would
         have needed the same fallback written again — and the one that
         got missed would be the one drawing in grey.

         This used to be a correction: the rows held a stale palette
         from 0051 and this overlaid the right colour on the way past.
         0183 deleted those copies, so it is an inheritance now — the
         column is nullable and NULL on every layer a utility owns, and
         there is nothing left to overwrite. The coalesce stays because
         an instance that has not run 0183 must still draw correctly,
         and because it is what makes the colour optional rather than
         absent: a layer with no utility keeps its own.

         A layer takes its utility's colour outright. It stands
         one-to-one with the utility — the electric layer is the
         electric utility — so what it stores is the same fact written
         twice, not an override.

         A line type takes it only where its own colour is the layer's.
         That is the seeded case, where the copy means nothing. A type
         coloured differently from its layer was somebody drawing a
         distinction, and it keeps it.

         A layer with no utility, which is what trench is, comes back
         exactly as it is stored. */
      const same = (a, b) => !!a && !!b
        && String(a).toLowerCase() === String(b).toLowerCase();

      const byUtility = new Map((ut.data || [])
        .filter((u) => u.Colour)
        .map((u) => [Number(u.Utility_ID), u.Colour]));

      const storedLayer = new Map((l.data || []).map((x) => [x.Layer_Key, x.Colour]));

      const layers = (l.data || []).map((x) => ({
        ...x,
        Colour: byUtility.get(Number(x.Utility_ID)) ?? x.Colour ?? null,
      }));
      const layerColour = new Map(layers.map((x) => [x.Layer_Key, x.Colour]));

      const lineTypes = (t.data || []).map((x) => {
        const wasTheLayers = x.Colour == null
          || same(x.Colour, storedLayer.get(x.Layer_Key));
        return {
          ...x,
          Colour: wasTheLayers
            ? (layerColour.get(x.Layer_Key) ?? x.Colour ?? null)
            : x.Colour,
        };
      });

      /* Style rows are left alone. A null colour there already means
         "inherit", and the cascade in gisStyle.js resolves it against
         the line type and the layer — which now carry the utility's. */
      /* Renamed on the way out rather than in the canvas.

         digRate.js is a plain model with no database in it — it is
         tested on its own and carries its own defaults — so it takes
         plain keys. Mapping here means the shape it receives is the
         same whether the rows came from Postgres, from the mocks, or
         from the fallback inside the module itself. */
      const digRates = (dr.data || []).map((r) => ({
        key: r.Machine_Key,
        label: r.Label,
        baseRateM3Hr: Number(r.Base_Rate_M3_Hr),
        setupMinutes: Number(r.Setup_Minutes),
        isDefault: !!r.Is_Default,
        source: r.Source,
        sampleSize: Number(r.Sample_Size) || 0,
      }));
      const digDepthFactors = (df.data || []).map((r) => ({
        fromM: Number(r.Depth_From_M),
        toM: r.Depth_To_M == null ? null : Number(r.Depth_To_M),
        factor: Number(r.Factor),
        note: r.Note,
      }));
      const digLayRates = Object.fromEntries((lr.data || [])
        .map((r) => [r.Utility_Key, Number(r.Rate_M_Hr)]));

      return json({
        features: f.data || [], layers,
        lineTypes, styles: st.data || [],
        surfaceTypes: su.data || [],
        digRates, digDepthFactors, digLayRates,
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
});

export const config = { path: "/api/projects/:projectId/gis" };
