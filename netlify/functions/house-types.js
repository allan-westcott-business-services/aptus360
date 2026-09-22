/* A development's plot breakdown: its named house types and their
   floor plans.

     GET    /api/house-types?project=N              the breakdown
     POST   /api/house-types                        add one
     PATCH  /api/house-types?id=N                   change name, code, type
     DELETE /api/house-types?id=N                   retire it
     POST   /api/house-types?what=upload&id=N       a signed slot for a floor plan
     PATCH  /api/house-types?what=attach&id=N       record the uploaded plan
     GET    /api/house-types?what=file&id=N         a signed link to open it

   Floor plans go straight to storage on a slot minted here, so a large
   PDF never passes through a function (6 MB limit) and the bucket needs
   no storage policies. The path is composed here and checked on the way
   back, so a caller cannot attach another project's file. */
import { supabase, json, fail, withAuth, whoIs } from "./_supabase.js";

const BUCKET = "house-types";
const C = [
  "House_Type_ID", "Project_ID", "Name", "Code", "Property_Config_ID",
  "Storage_Path", "File_Name", "Sort_Order", "Is_Active", "Created_At", "Created_By",
].join(",");

const clean = (s, n = 120) => {
  const t = String(s ?? "").trim().slice(0, n);
  return t || null;
};

export default withAuth(async function handler(req, context, user) {
  const db = supabase();
  const url = new URL(req.url);
  const what = url.searchParams.get("what");
  const id = Number(url.searchParams.get("id"));

  /* The row, and so its project, for anything addressed by id. */
  const rowOf = async () => {
    const { data, error } = await db.from("Project_House_Type").select(C)
      .eq("House_Type_ID", id).single();
    if (error) throw error;
    return data;
  };

  /* A duplicate code is refused with the house it clashes with, rather
     than the unique index's bare message. */
  const codeTaken = async (projectId, code, exceptId = null) => {
    if (!code) return null;
    let q = db.from("Project_House_Type").select("House_Type_ID,Name,Code")
      .eq("Project_ID", projectId).eq("Is_Active", true).ilike("Code", code);
    if (exceptId) q = q.neq("House_Type_ID", exceptId);
    const { data } = await q.limit(1);
    return data?.[0] || null;
  };

  try {
    if (req.method === "GET" && what === "file" && Number.isFinite(id)) {
      const r = await rowOf();
      if (!r.Storage_Path) return json({ error: "No floor plan attached." }, 404);
      const { data, error } = await db.storage.from(BUCKET)
        .createSignedUrl(r.Storage_Path, 300, { download: r.File_Name || true });
      if (error) throw error;
      return json({ url: data?.signedUrl ?? null });
    }

    if (req.method === "GET") {
      const projectId = Number(url.searchParams.get("project"));
      if (!Number.isFinite(projectId)) return json({ error: "Which project?" }, 400);
      const [ht, pl] = await Promise.all([
        db.from("Project_House_Type").select(C)
          .eq("Project_ID", projectId).eq("Is_Active", true)
          .order("Sort_Order").order("Name"),
        db.from("Plot").select("House_Type_ID")
          .eq("Project_ID", projectId).not("House_Type_ID", "is", null),
      ]);
      if (ht.error) throw ht.error;
      /* How many plots are each house — counted here so the plots list's
         own query does not have to name the new column. */
      const counts = {};
      for (const p of pl.data || []) counts[p.House_Type_ID] = (counts[p.House_Type_ID] || 0) + 1;
      return json({ rows: ht.data || [], counts });
    }

    if (req.method === "POST" && what === "upload" && Number.isFinite(id)) {
      const r = await rowOf();
      const b = await req.json().catch(() => ({}));
      const name = String(b?.fileName || "plan").slice(0, 160);
      const safe = name.replace(/[^A-Za-z0-9._-]+/g, "-");
      const token = Math.random().toString(36).slice(2, 10);
      const path = `project-${r.Project_ID}/${r.House_Type_ID}/${Date.now()}-${token}-${safe}`;
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) {
        throw new Error(/not found/i.test(error.message)
          ? `The "${BUCKET}" storage bucket is missing — run migration 0236.`
          : error.message);
      }
      return json({ url: data?.signedUrl ?? null, path });
    }

    if (req.method === "PATCH" && what === "attach" && Number.isFinite(id)) {
      const r = await rowOf();
      const b = await req.json();
      const path = String(b?.Storage_Path || "");
      /* Only a path this endpoint would have issued for THIS row. */
      if (!path.startsWith(`project-${r.Project_ID}/${r.House_Type_ID}/`)) {
        return json({ error: "That file does not belong to this house type." }, 400);
      }
      /* The plan being replaced is removed, or every re-upload leaves
         one more orphan in the bucket. After the row is updated, so a
         failed update never leaves the row pointing at nothing. */
      const old = r.Storage_Path;
      const { data, error } = await db.from("Project_House_Type")
        .update({ Storage_Path: path, File_Name: clean(b.File_Name, 200) })
        .eq("House_Type_ID", id).select(C).single();
      if (error) throw error;
      if (old && old !== path) await db.storage.from(BUCKET).remove([old]);
      return json(data);
    }

    if (req.method === "POST") {
      const b = await req.json();
      const projectId = Number(b?.Project_ID);
      const name = clean(b?.Name);
      if (!Number.isFinite(projectId) || !name) return json({ error: "A name is needed." }, 400);
      const code = clean(b?.Code, 20);
      const clash = await codeTaken(projectId, code);
      if (clash) {
        return json({ error: `The code ${clash.Code} is already the ${clash.Name}.` }, 400);
      }
      const { data, error } = await db.from("Project_House_Type").insert({
        Project_ID: projectId, Name: name, Code: code,
        Property_Config_ID: b?.Property_Config_ID ? Number(b.Property_Config_ID) : null,
        Sort_Order: Number(b?.Sort_Order) || 0,
        Created_By: await whoIs(user),
      }).select(C).single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH" && Number.isFinite(id)) {
      const r = await rowOf();
      const b = await req.json();
      const patch = {};
      if ("Name" in b) {
        const n = clean(b.Name);
        if (!n) return json({ error: "A house type needs a name." }, 400);
        patch.Name = n;
      }
      if ("Code" in b) {
        patch.Code = clean(b.Code, 20);
        const clash = await codeTaken(r.Project_ID, patch.Code, id);
        if (clash) {
          return json({ error: `The code ${clash.Code} is already the ${clash.Name}.` }, 400);
        }
      }
      if ("Property_Config_ID" in b) {
        patch.Property_Config_ID = b.Property_Config_ID ? Number(b.Property_Config_ID) : null;
      }
      const { data, error } = await db.from("Project_House_Type").update(patch)
        .eq("House_Type_ID", id).select(C).single();
      if (error) throw error;
      return json(data);
    }

    /* Retired, not deleted: plots point at it by id, and a plot whose
       house type vanished would lose the name it was built as. */
    if (req.method === "DELETE" && Number.isFinite(id)) {
      const { error } = await db.from("Project_House_Type")
        .update({ Is_Active: false }).eq("House_Type_ID", id);
      if (error) throw error;
      return json({ retired: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/house-types" };
