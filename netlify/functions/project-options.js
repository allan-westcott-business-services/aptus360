import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Options on a project: parallel versions of the same enquiry, quoted
   differently. Its own endpoint rather than a branch on /projects,
   because that one already has an unconditional GET and a conditional
   one below it could never run. */
export default withAuth(async function handler(req, context, user) {
  const db = supabase();
  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get("project"));

  try {
    if (!projectId) return json({ error: "A project is required." }, 400);

    if (req.method === "GET") {
      const { data: base } = await db.from("Project")
        .select("Project_Ref,Revision").eq("Project_ID", projectId).maybeSingle();
      if (!base) return json({ error: "No such project." }, 404);
      const { data, error } = await db.from("Project")
        .select("Project_ID,Project_Ref,Revision,Option_Letter,Display_Ref,Project_Status_ID")
        .eq("Project_Ref", base.Project_Ref).eq("Revision", base.Revision)
        .order("Option_Letter", { nullsFirst: true });
      if (error) throw error;
      return json({ rows: data || [] });
    }

    if (req.method === "POST") {
      /* count lets a new project be given its options in one call. Each
         is copied from the one before rather than all from the original,
         which makes no difference now and keeps working if copying ever
         becomes incremental. */
      const { count = 1, copy_gis = true } = await req.json().catch(() => ({}));
      const wanted = Math.max(1, Math.min(Number(count) || 1, 26));
      const made = [];
      for (let i = 0; i < wanted; i++) {
        /* The drawing comes only when asked (0188). An option raised for
           a commercial variation does not want several thousand
           features duplicated, and copying is much the heaviest part of
           the operation \u2014 so the default is off and the caller says. */
        const { data, error } = await db.rpc("create_project_option", {
          p_project: projectId,
          /* Left off, deliberately. The live function takes this flag
             but the migration that added it is not in the repo, so
             what it does with Connects, Joint_Cables, Seed_Feature_ID
             and the plots is unknown. The copy below is the one whose
             body can be read. */
          p_copy_gis: false,
        });
        if (error) throw error;
        made.push(data);

        /* ── The drawing, as its own instance ──

           An option is a different design of the same scheme: it may
           have a different number of plots, different heat sources,
           or a different layout of roads. It gets its own plots for
           that reason and its own drawing for the same one. The copy
           remaps every id the drawing carries \u2014 cables to their
           joints, meters to their seeds and their plots \u2014 or the new
           drawing would be a set of lines that do not know each
           other (0232).

           On by default and switched off by the caller, which is the
           opposite of the flag above: an option without its drawing
           is the surprising case now. */
        if (copy_gis !== false) {
          const { error: gErr } = await db.rpc("copy_project_drawing", {
            p_from: projectId, p_to: data,
          });
          if (gErr) throw gErr;
        }
      }
      return json({ created: made }, 201);
    }

    if (req.method === "DELETE") {
      const id = Number(url.searchParams.get("option"));
      if (!id) return json({ error: "Which option?" }, 400);

      const { data: opt } = await db.from("Project")
        .select("Project_Ref,Revision,Option_Letter").eq("Project_ID", id).maybeSingle();
      if (!opt) return json({ error: "No such option." }, 404);

      const { count } = await db.from("Project")
        .select("Project_ID", { count: "exact", head: true })
        .eq("Project_Ref", opt.Project_Ref).eq("Revision", opt.Revision);

      /* Refusing to delete the last one: removing it would delete the
         project itself, which is a different decision made from a
         different screen with a different confirmation. */
      if ((count ?? 0) <= 1) {
        return json({ error: "That's the only option — delete the project instead." }, 400);
      }

      const { error } = await db.from("Project").delete().eq("Project_ID", id);
      if (error) throw error;

      /* Back down to one, so drop the letter: a lone project is not
         "option A of one". */
      if ((count ?? 0) === 2) {
        await db.from("Project").update({ Option_Letter: null })
          .eq("Project_Ref", opt.Project_Ref).eq("Revision", opt.Revision);
      }
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) { return fail(e, 400); }
});

export const config = { path: "/api/project-options" };
