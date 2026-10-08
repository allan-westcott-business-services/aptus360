import { json, fail, withAuth, accountOfProject } from "./_supabase.js";

/* The drawing: read it, add to it, change it, remove from it.
   /api/projects/:projectId/gis

   ── What is different from Aptus360's gis.js ──

   That one runs on the service key and gates writes in JavaScript,
   through denyUnlessMenu(user, "gis-canvas"). Its GET is deliberately
   left open to any signed-in account, because the call-offs list and
   the call-offs tab read features too, and gating the read would break
   two screens that have nothing to do with drawing.

   Here the database decides both. `withAuth` hands this a client
   carrying the caller's token, so 0001's policies filter the rows:
   read what your account owns, write it only if your role is owner or
   member. A viewer's INSERT is refused by Postgres, not by an `if`.

   The practical consequence is that this file has no permission logic
   in it at all, and cannot forget any.

   ── Account_ID is never read from the body ──

   It is looked up from the project. A caller who could name their own
   account could file a drawing under another company; 0001's composite
   foreign keys would reject most of that, but the field simply is not
   accepted. Same for Project_ID on an update: a feature does not move
   between projects, and allowing it would be a way to move a drawing
   across the wall one feature at a time. */

/* The columns a caller may write. Anything else in the body is
   dropped rather than rejected, because a browser sending a stale
   extra field should not fail the save — but a body naming
   Account_ID, Feature_ID, Created_At or Updated_At is silently
   ignored rather than honoured. */
const WRITABLE = new Set([
  "Layer_Key", "Feature_Type", "Geometry", "Label", "Attributes",
  "Plot_ID", "Feature_Role",
]);

const pick = (body) => Object.fromEntries(
  Object.entries(body || {})
    .filter(([k]) => WRITABLE.has(k))
    .map(([k, v]) => [k, v === "" ? null : v]));

const SELECT = "Feature_ID,Project_ID,Layer_Key,Feature_Type,Geometry,Label,"
  + "Attributes,Plot_ID,Feature_Role,Created_At,Updated_At";

export default withAuth(async function handler(req, context, db) {
  const projectId = Number(context?.params?.projectId);
  const id = new URL(req.url).searchParams.get("id");

  if (!Number.isFinite(projectId)) {
    return json({ error: "A project is required" }, 400);
  }

  /* One read, used by every method: it answers both "does this project
     exist" and "may this caller see it" in a single question, because
     RLS makes those the same question. */
  const account = await accountOfProject(db, projectId);
  if (account === null) return json({ error: "Not found" }, 404);

  try {
    if (req.method === "GET") {
      const { data, error } = await db
        .from("GIS_Feature").select(SELECT)
        .eq("Project_ID", projectId)
        .order("Feature_ID", { ascending: true });
      if (error) throw error;
      return json({ features: data || [] });
    }

    if (req.method === "POST") {
      const body = await req.json();

      /* A bulk insert, because placing a run of plots or pasting a
         copied selection is one gesture and should be one round trip.
         An array of 400 features inserted one at a time is 400
         requests and a visible pause. */
      const rows = (Array.isArray(body) ? body : [body])
        .map((f) => ({ ...pick(f), "Project_ID": projectId, "Account_ID": account }));

      if (!rows.length) return json({ error: "Nothing to add" }, 400);
      for (const r of rows) {
        if (!r.Geometry) return json({ error: "A feature needs geometry" }, 400);
        if (!r.Feature_Type) return json({ error: "A feature needs a type" }, 400);
      }

      const { data, error } = await db
        .from("GIS_Feature").insert(rows).select(SELECT);
      if (error) throw error;
      return json({ features: data || [] }, 201);
    }

    if (req.method === "PATCH") {
      const body = await req.json();

      /* Two shapes. An array of {Feature_ID, ...changes} is a bulk
         edit — the style pane applying a change to a selection. A
         single object with ?id= is one feature.

         The bulk form updates one feature per call rather than
         building a single statement, because the changes differ per
         row. The Project_ID filter on each is not redundant with RLS:
         RLS stops another account's feature, this stops another
         PROJECT's feature within the same account, which policies
         have no opinion about. */
      if (Array.isArray(body)) {
        const out = [];
        for (const item of body) {
          const fid = Number(item?.Feature_ID);
          if (!Number.isFinite(fid)) continue;
          const changes = pick(item);
          if (!Object.keys(changes).length) continue;
          const { data, error } = await db
            .from("GIS_Feature").update(changes)
            .eq("Feature_ID", fid).eq("Project_ID", projectId)
            .select(SELECT);
          if (error) throw error;
          if (data?.length) out.push(data[0]);
        }
        return json({ features: out });
      }

      if (!id) return json({ error: "Which feature?" }, 400);
      const changes = pick(body);
      if (!Object.keys(changes).length) {
        return json({ error: "Nothing to change" }, 400);
      }
      const { data, error } = await db
        .from("GIS_Feature").update(changes)
        .eq("Feature_ID", id).eq("Project_ID", projectId)
        .select(SELECT).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Not found" }, 404);
      return json(data);
    }

    if (req.method === "DELETE") {
      /* ?id=1,2,3 as well as ?id=1. Deleting a selection is one
         gesture. */
      const ids = (id || "").split(",")
        .map((x) => Number(x.trim())).filter(Number.isFinite);
      if (!ids.length) return json({ error: "Which feature?" }, 400);

      const { data, error } = await db
        .from("GIS_Feature").delete()
        .in("Feature_ID", ids).eq("Project_ID", projectId)
        .select("Feature_ID");
      if (error) throw error;

      /* What was actually removed, not what was asked for. A caller
         whose selection included something they may not touch should
         see that fewer went than they sent, rather than a cheerful
         "deleted" covering a silent refusal. */
      return json({ deleted: (data || []).map((r) => r.Feature_ID) });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) { return fail(e); }
});

export const config = { path: "/api/projects/:projectId/gis" };
