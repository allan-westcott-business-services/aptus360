import { supabase, json, fail } from "./_supabase.js";

const C = "Project_Contact_ID,Project_ID,Contact_Name,Job_Title,Telephone,Email,Is_Primary,Notes";
const W = new Set(C.split(",").filter((x) => x !== "Project_Contact_ID"));
const pick = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => W.has(k)).map(([k, v]) => [k, v === "" ? null : v]));

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const id = new URL(req.url).searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("Project_Contact")
        .select(C).eq("Project_ID", projectId).order("Is_Primary", { ascending: false });
      if (error) throw error;
      return json({ rows: data || [] });
    }
    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await db.from("Project_Contact")
        .insert(pick({ ...body, Project_ID: Number(projectId) })).select(C).single();
      if (error) throw error;
      return json(data, 201);
    }
    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const { data, error } = await db.from("Project_Contact")
        .update(pick(await req.json())).eq("Project_Contact_ID", id).select(C).single();
      if (error) throw error;
      return json(data);
    }
    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from("Project_Contact").delete().eq("Project_Contact_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) { return fail(e, 400); }
}

export const config = { path: "/api/projects/:projectId/contacts" };
