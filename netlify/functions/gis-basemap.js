import { supabase, json, fail } from "./_supabase.js";

const B = [
  "Basemap_ID","Project_ID","File_Name","Storage_Path","Image_Url",
  "Image_Width","Image_Height","Metres_Per_Pixel","Stated_Scale",
  "Cal_Point_A","Cal_Point_B","Cal_Distance_M",
  "Origin_X","Origin_Y","Rotation_Deg","Opacity","Locked",
  "Ref_Canvas_X","Ref_Canvas_Y","Ref_Easting","Ref_Northing",
].join(",");

const W = new Set(B.split(",").filter((x) => !["Basemap_ID", "Project_ID"].includes(x)));
const pick = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => W.has(k)).map(([k, v]) => [k, v === "" ? null : v]));

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("GIS_Basemap")
        .select(B).eq("Project_ID", projectId).maybeSingle();
      if (error) throw error;
      return json(data || null);
    }

    /* One basemap per project, so upsert rather than making the caller
       know whether it's a create or an update. */
    if (req.method === "PUT") {
      const body = pick(await req.json());
      const { data, error } = await db.from("GIS_Basemap")
        .upsert({ ...body, Project_ID: Number(projectId) }, { onConflict: "Project_ID" })
        .select(B).single();
      if (error) throw error;

      if (data && data.Ref_Easting == null) {
        await db.rpc("gis_seed_reference", { p_project: Number(projectId) });
        const { data: fresh } = await db.from("GIS_Basemap")
          .select(B).eq("Project_ID", projectId).single();
        return json(fresh || data);
      }
      return json(data);
    }

    if (req.method === "DELETE") {
      const { data: existing } = await db.from("GIS_Basemap")
        .select("Storage_Path").eq("Project_ID", projectId).maybeSingle();
      if (existing?.Storage_Path) {
        await db.storage.from("basemaps").remove([existing.Storage_Path]);
      }
      const { error } = await db.from("GIS_Basemap").delete().eq("Project_ID", projectId);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/basemap" };
