import { supabase, json, fail } from "./_supabase.js";

const B = [
  "Basemap_ID","Project_ID","File_Name","Storage_Path","Image_Url",
  "Source_Kind","Pdf_Page","Page_Width","Page_Height",
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

    /* Update when a row exists, insert when it doesn't.

       Not upsert: Supabase replaces the whole conflicting row, so saving
       just the calibration would null the image URL and everything else
       the caller didn't happen to send. Each step of the setup sends only
       its own fields, which is the right shape for the UI and the wrong
       shape for upsert. */
    if (req.method === "PUT") {
      const body = pick(await req.json());
      const { data: existing } = await db.from("GIS_Basemap")
        .select("Basemap_ID").eq("Project_ID", projectId).maybeSingle();

      let data, error;
      if (existing) {
        ({ data, error } = await db.from("GIS_Basemap")
          .update(body).eq("Project_ID", projectId).select(B).single());
      } else {
        if (!body.Image_Url) {
          return json({ error: "Import a plan before setting the scale." }, 400);
        }
        ({ data, error } = await db.from("GIS_Basemap")
          .insert({ ...body, Project_ID: Number(projectId) }).select(B).single());
      }
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
