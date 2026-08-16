import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Comments, attachments and history for any entity. The allow-list is the
   security boundary: without it an arbitrary Entity_Type in the URL could
   attach notes to anything. */
const ALLOWED = new Set([
  "POC_Application", "POC_Option", "POC_Quotation",
  "AV_Application", "AV_Quotation", "Project_Scope", "Plot_Utility",
]);

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const { type, id } = context?.params || {};
  if (!ALLOWED.has(type)) return json({ error: `Unknown entity type "${type}"` }, 404);

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "comment";
  const rowId = url.searchParams.get("row_id");

  try {
    if (req.method === "GET") {
      const [c, a, h] = await Promise.all([
        db.from("Entity_Comment").select("*").eq("Entity_Type", type).eq("Entity_ID", id)
          .order("Created_At", { ascending: false }),
        db.from("Entity_Attachment").select("*").eq("Entity_Type", type).eq("Entity_ID", id)
          .order("Uploaded_At", { ascending: false }),
        db.from("Entity_History").select("*").eq("Entity_Type", type).eq("Entity_ID", id)
          .order("Changed_At", { ascending: false }).limit(200),
      ]);
      for (const r of [c, a, h]) if (r.error) throw r.error;
      return json({ comments: c.data || [], attachments: a.data || [], history: h.data || [] });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const table = kind === "attachment" ? "Entity_Attachment" : "Entity_Comment";
      const row = { ...body, Entity_Type: type, Entity_ID: Number(id) };
      const { data, error } = await db.from(table).insert(row).select().single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "DELETE") {
      if (!rowId) return json({ error: "row_id required" }, 400);
      const table = kind === "attachment" ? "Entity_Attachment" : "Entity_Comment";
      const pk = kind === "attachment" ? "Attachment_ID" : "Comment_ID";
      const { error } = await db.from(table).delete().eq(pk, rowId);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/entity/:type/:id" };
