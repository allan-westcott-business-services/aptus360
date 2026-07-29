import { supabase, json, fail } from "./_supabase.js";

/* Photographs against a connection. The file itself lives in Supabase
   storage; these rows hold the path and who put it there. */
const BUCKET = "connection-photos";

export default async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const id = url.searchParams.get("connection");
      if (!id) return json({ error: "A connection is required." }, 400);
      const { data, error } = await db.from("Plot_Utility_Photo")
        .select("*").eq("Plot_Utility_ID", Number(id)).order("Uploaded_At");
      if (error) throw error;
      /* The public URL is derived rather than stored, so moving or
         renaming the bucket doesn't strand every row. */
      const rows = (data || []).map((r) => ({
        ...r,
        url: db.storage.from(BUCKET).getPublicUrl(r.Storage_Path).data.publicUrl,
      }));
      return json({ rows });
    }

    if (req.method === "POST") {
      const b = await req.json();
      if (!b.Plot_Utility_ID || !b.Storage_Path) {
        return json({ error: "A connection and a stored file are both required." }, 400);
      }
      let by = (b.Uploaded_By || "").trim() || null;
      const email = (b.Uploaded_By_Email || "").trim();
      if (!by && email) {
        const { data: person } = await db.from("Person")
          .select("Person_Name").ilike("Email", email).eq("Is_Active", true).maybeSingle();
        by = person?.Person_Name || email;
      }
      const { data, error } = await db.from("Plot_Utility_Photo").insert({
        Plot_Utility_ID: Number(b.Plot_Utility_ID),
        Storage_Path: b.Storage_Path,
        Caption: b.Caption || null,
        Uploaded_By: by,
      }).select("*").single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Which photo?" }, 400);
      const { data: row } = await db.from("Plot_Utility_Photo")
        .select("Storage_Path").eq("Photo_ID", Number(id)).maybeSingle();
      const { error } = await db.from("Plot_Utility_Photo").delete().eq("Photo_ID", Number(id));
      if (error) throw error;
      /* The row goes first. A file left behind is wasted space; a row
         pointing at a file that no longer exists is a broken image on
         screen, which is worse. */
      if (row?.Storage_Path) await db.storage.from(BUCKET).remove([row.Storage_Path]);
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) { return fail(e, 400); }
}

export const config = { path: "/api/connection-photos" };
