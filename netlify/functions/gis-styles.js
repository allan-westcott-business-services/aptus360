import { supabase, json, fail } from "./_supabase.js";

/* Styles are admin data, so they get their own endpoint rather than
   riding on the canvas one — a separate file per endpoint, as the rest
   of this folder does. */
const S = "GIS_Style_ID,Style_Name,Layer_Key,Line_Type,Feature_Role,Site,Utility_ID,Organisation_ID,Colour,Dashed,Dash_Pattern,Symbol,Width_Px,Width_M,Scale_Width,Min_Width_Px,Max_Width_Px,Symbol_Size_Px,Min_Scale,Max_Scale,Label_Min_Scale,Marker_Text,Marker_Symbol,Marker_Interval_M,Marker_Size_Px,Marker_Colour,Marker_Rotate,Marker_Offset_Px,Marker_Min_Gap_Px,Sort_Order,Is_Active,Notes";

const W = new Set(S.split(",").slice(1));
/* Empty string means "any" from a select, which is NULL here, not "".
   A "" Layer_Key would match nothing and the style would never apply. */
const pick = (o) => Object.fromEntries(
  Object.entries(o)
    .filter(([k]) => W.has(k))
    .map(([k, v]) => [k, v === "" ? null : v])
);

export default async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("GIS_Style").select(S)
        .order("Sort_Order").order("GIS_Style_ID");
      if (error) throw error;
      return json({ rows: data || [] });
    }

    if (req.method === "POST") {
      const { data, error } = await db.from("GIS_Style")
        .insert(pick(await req.json())).select(S).single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH" && id) {
      const { data, error } = await db.from("GIS_Style")
        .update(pick(await req.json())).eq("GIS_Style_ID", id).select(S).single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE" && id) {
      const { error } = await db.from("GIS_Style").delete().eq("GIS_Style_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    if (e?.code === "23505") {
      return json({
        error: "A style already covers that exact combination. Edit that one instead.",
      }, 409);
    }
    return fail(e, 400);
  }
}

export const config = { path: "/api/gis-styles" };
