import { supabase, currentUser, json, fail } from "./_supabase.js";

/* The undo journal: reading the history back, adding to it, and moving
   the pointer.

   Its own file, for the branch-ordering reason set out in gis-restore.js.
   Applying a delta to the drawing is not done here — that is
   gis-restore.js and the existing gis.js — because this endpoint owning
   both would make a failed write and a moved pointer the same request.
   Kept apart, the canvas writes the features first and only records the
   move once that has worked.

   Per project and per user. currentUser is verified against Supabase
   rather than trusted, and may be null while auth is unenforced; the
   journal folds null to the nil uuid so a signed-out session gets its
   own history rather than sharing everyone else's. */

const C = "Undo_ID,Project_ID,User_ID,Seq,Label,Delta,Undone,Created_At";
const LIMIT = 25;

export default async function handler(req, context) {
  const db = supabase();
  const projectId = Number(context?.params?.projectId);
  const user = await currentUser(req);
  const userId = user?.id ?? null;

  try {
    if (req.method === "GET") {
      const q = db.from("GIS_Undo").select(C)
        .eq("Project_ID", projectId)
        .order("Seq", { ascending: true });
      const { data, error } = userId
        ? await q.eq("User_ID", userId)
        : await q.is("User_ID", null);
      if (error) throw error;

      /* Split here rather than in the browser so the two sides cannot
         drift: past is what can be undone, oldest first; future is what
         has been undone and can be redone, with the next one to redo
         last so the canvas can pop from the end of both. */
      const rows = data || [];
      return json({
        past: rows.filter((r) => !r.Undone),
        future: rows.filter((r) => r.Undone).reverse(),
        limit: LIMIT,
      });
    }

    /* A new action. Anything already undone stops being redoable — it no
       longer follows from what is on the screen, and a redo that quietly
       does something other than what it says is worse than no redo. */
    if (req.method === "POST") {
      const { label, delta } = await req.json();
      if (!label || !delta) return json({ error: "label and delta required" }, 400);

      const delQ = db.from("GIS_Undo").delete()
        .eq("Project_ID", projectId).eq("Undone", true);
      const { error: delErr } = userId
        ? await delQ.eq("User_ID", userId)
        : await delQ.is("User_ID", null);
      if (delErr) throw delErr;

      /* Numbered in the database rather than read-then-insert here,
         which two quick actions can interleave and land on the same
         number. */
      const { data: seq, error: seqErr } = await db
        .rpc("next_gis_undo_seq", { p_project: projectId, p_user: userId });
      if (seqErr) throw seqErr;

      const { data, error } = await db.from("GIS_Undo")
        .insert({
          Project_ID: projectId, User_ID: userId,
          Seq: seq, Label: label, Delta: delta, Undone: false,
        })
        .select(C).single();
      if (error) throw error;

      const { data: pruned } = await db
        .rpc("prune_gis_undo", { p_project: projectId, p_user: userId, p_keep: LIMIT });

      return json({ entry: data, pruned: pruned ?? 0 }, 201);
    }

    /* Moving the pointer, after the features have already been written.
       Takes the ids it moved rather than a direction, so a partial
       failure on the canvas cannot leave the pointer claiming more than
       actually happened. */
    if (req.method === "PATCH") {
      const { ids = [], undone } = await req.json();
      if (!ids.length) return json({ updated: 0 });
      if (typeof undone !== "boolean") {
        return json({ error: "undone must be true or false" }, 400);
      }
      const q = db.from("GIS_Undo").update({ Undone: undone })
        .eq("Project_ID", projectId).in("Undo_ID", ids.map(Number));
      const { error } = userId ? await q.eq("User_ID", userId) : await q.is("User_ID", null);
      if (error) throw error;
      return json({ updated: ids.length });
    }

    if (req.method === "DELETE") {
      const q = db.from("GIS_Undo").delete().eq("Project_ID", projectId);
      const { error } = userId ? await q.eq("User_ID", userId) : await q.is("User_ID", null);
      if (error) throw error;
      return json({ cleared: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/gis-undo" };
