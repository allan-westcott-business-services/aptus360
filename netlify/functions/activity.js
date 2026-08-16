import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Change history and comments for a project. History is written by a
   database trigger, so this endpoint only reads it. */
export default withAuth(async function handler(req, context) {
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
      const { Comment, Author, Author_Email } = await req.json();
      if (!Comment || !Comment.trim()) return json({ error: "Comment is required" }, 400);

      /* Who wrote it is settled here rather than in the browser.

         The Person table is right there, so the name doesn't depend on
         what the client happens to have in its lookups payload — which
         is cached for the session and can easily be a build or two
         behind. A comment stored with the right name matters more than
         one displayed with it.

         ilike with no wildcards is an exact match that ignores case, so
         a login of Me@… still finds a record stored as me@…. */
      let author = (Author || "").trim() || null;
      const email = (Author_Email || "").trim();
      if (!author && email) {
        const { data: person } = await db.from("Person")
          .select("Person_Name")
          .ilike("Email", email)
          .eq("Is_Active", true)
          .maybeSingle();
        /* The address is a poor name but a real one — better than a
           comment nobody can trace. */
        author = person?.Person_Name || email;
      }

      const { data, error } = await db.from("Project_Comment")
        .insert({ Project_ID: Number(projectId), Comment: Comment.trim(), Author: author })
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
});

export const config = { path: "/api/projects/:projectId/activity" };
