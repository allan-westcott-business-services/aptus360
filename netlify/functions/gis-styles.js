import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Styles are admin data, so they get their own endpoint rather than
   riding on the canvas one — a separate file per endpoint, as the rest
   of this folder does. */
/* Every column the screen reads or writes, named explicitly.

   Supply_Type was missing from this list for the whole of 0194's life.
   The canvas was unaffected — it loads styles with select("*") — so the
   black triangle rule worked on the drawing and was invisible on the
   screen that exists to manage it: the non-residential rule showed as a
   second, identical Meter rule with nothing to tell them apart, and a
   new rule could not be scoped to a supply type at all.

   Recurring fault 4, and the reason checkmigrations.mjs now reads this
   list against the migrations. A column added to the table and not to
   the list is neither returned nor saved, and nothing says so. */
const S = "GIS_Style_ID,Style_Name,Layer_Key,Line_Type,Feature_Role,Site,Supply_Type,Utility_ID,Organisation_ID,Colour,Label_Colour,Dashed,Dash_Pattern,Symbol,Width_Px,Width_M,Scale_Width,Min_Width_Px,Max_Width_Px,Symbol_Size_Px,Symbol_Size_M,Scale_Symbol,Min_Symbol_Px,Max_Symbol_Px,Min_Scale,Max_Scale,Label_Min_Scale,Marker_Text,Marker_Symbol,Marker_Interval_M,Marker_Size_Px,Marker_Colour,Marker_Rotate,Marker_Offset_Px,Marker_Min_Gap_Px,Sort_Order,Is_Active,Notes,Conditions";

const W = new Set(S.split(",").slice(1));
/* Empty string means "any" from a select, which is NULL here, not "".
   A "" Layer_Key would match nothing and the style would never apply. */
const pick = (o) => Object.fromEntries(
  Object.entries(o)
    .filter(([k]) => W.has(k))
    .map(([k, v]) => [k, v === "" ? null : v])
);

export default withAuth(async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      /* ── The rules, and the things they can be written about ──

         The screen lists FEATURES and hangs styles off them, so it needs
         to know what can be drawn — not merely what somebody has already
         styled. It used to derive both lists from the rules themselves
         (`[...new Set(rows.map(r => r.Layer_Key))]`), which can only ever
         name the things that already have a rule: a line type nobody has
         styled was invisible on the one screen that exists to style it,
         and there was no way to reach it.

         The catalogue is served by the canvas endpoint too, but that one
         takes a project and this screen has none — the styles are the
         organisation's, not a project's. Two small tables, fetched
         beside the rules rather than on a second round trip.

         Active only, and in the drawing's own order, so the list reads
         the same here as it does on the canvas menus. */
      const [st, ly, lt] = await Promise.all([
        db.from("GIS_Style").select(S).order("Sort_Order").order("GIS_Style_ID"),
        db.from("GIS_Layer").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("GIS_Line_Type").select("*").eq("Is_Active", true).order("Sort_Order"),
      ]);
      if (st.error) throw st.error;
      /* A catalogue that cannot be read is not a reason to withhold the
         rules: the screen falls back to naming the subjects the rules
         themselves mention, which is what it did before this existed. */
      return json({
        rows: st.data || [],
        layers: ly.data || [],
        lineTypes: lt.data || [],
      });
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
});

export const config = { path: "/api/gis-styles" };
