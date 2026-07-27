import { supabase, json, fail } from "./_supabase.js";

const D = "Project_Developer_ID,Project_ID,Customer_ID,Branch_ID,Is_Main,Developer_Code,Plot_From,Plot_To,Notes";
const W = new Set(D.split(",").filter((x) => x !== "Project_Developer_ID"));
const pick = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => W.has(k)).map(([k, v]) => [k, v === "" ? null : v]));

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("Project_Developer")
        .select(D).eq("Project_ID", projectId).order("Is_Main", { ascending: false });
      if (error) throw error;

      // Plot counts per developer, so the screen can show who has what
      const { data: plots } = await db.from("Plot")
        .select("Plot_ID,Project_Developer_ID").eq("Project_ID", projectId);
      const counts = {};
      let unassigned = 0;
      (plots || []).forEach((p) => {
        if (p.Project_Developer_ID) counts[p.Project_Developer_ID] = (counts[p.Project_Developer_ID] || 0) + 1;
        else unassigned++;
      });
      return json({ rows: data || [], counts, unassigned });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await db.from("Project_Developer")
        .insert(pick({ ...body, Project_ID: Number(projectId) })).select(D).single();
      if (error && error.code === "23505") {
        return json({ error: "That developer and branch is already on this project." }, 409);
      }
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const body = pick(await req.json());
      /* Only one main developer. The partial unique index would reject a
         second, so clear the current one first rather than failing. */
      if (body.Is_Main === true) {
        await db.from("Project_Developer").update({ Is_Main: false })
          .eq("Project_ID", projectId).neq("Project_Developer_ID", id);
      }
      const { data, error } = await db.from("Project_Developer")
        .update(body).eq("Project_Developer_ID", id).select(D).single();
      if (error) throw error;
      return json(data);
    }

    /* Assign plots in bulk — the reason this table exists. */
    if (req.method === "PUT") {
      const { plot_ids = [], developer_id = null } = await req.json();
      if (!plot_ids.length) return json({ error: "No plots selected" }, 400);
      const { data, error } = await db.from("Plot")
        .update({ Project_Developer_ID: developer_id ? Number(developer_id) : null })
        .in("Plot_ID", plot_ids).eq("Project_ID", projectId).select("Plot_ID");
      if (error) throw error;
      return json({ updated: data?.length ?? 0 });
    }

    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from("Project_Developer")
        .delete().eq("Project_Developer_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/developers" };
