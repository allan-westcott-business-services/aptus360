import { supabase, json, fail } from "./_supabase.js";

/* Change history and comments for a project. History is written by a
   database trigger, so this endpoint only reads it. */
export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;

  try {
    if (req.method === "GET") {
      const [{ data: history, error: hErr }, { data: comments, error: cErr }] = await Promise.all([
        db.from("Project_History")
          .select("History_ID,Field,Old_Value,New_Value,Changed_By,Changed_At")
          .eq("Project_ID", projectId).order("Changed_At", { ascending: false }).limit(500),
        db.from("Project_Comment")
          .select("Comment_ID,Comment,Author,Created_At")
          .eq("Project_ID", projectId).order("Created_At", { ascending: false }),
      ]);
      if (hErr) throw hErr;
      if (cErr) throw cErr;
      return json({ history: history || [], comments: comments || [] });
    }

    if (req.method === "POST") {
      const { Comment, Author } = await req.json();
      if (!Comment || !Comment.trim()) return json({ error: "Comment is required" }, 400);
      const { data, error } = await db.from("Project_Comment")
        .insert({ Project_ID: Number(projectId), Comment: Comment.trim(), Author: Author || null })
        .select().single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "DELETE") {
      const commentId = new URL(req.url).searchParams.get("comment_id");
      if (!commentId) return json({ error: "comment_id required" }, 400);
      const { error } = await db.from("Project_Comment").delete().eq("Comment_ID", commentId);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/activity" };
