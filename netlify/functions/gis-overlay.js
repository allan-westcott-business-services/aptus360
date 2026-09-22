/* OS tiles over a drawing, and the link from the drawing to the grid.

     GET    /api/projects/:projectId/overlays            every overlay, and the link
     POST   /api/projects/:projectId/overlays            add one (linework already read)
     PATCH  /api/projects/:projectId/overlays?id=N       visibility, opacity, hidden layers
     DELETE /api/projects/:projectId/overlays?id=N       remove one
     PUT    /api/projects/:projectId/overlays?what=link  save the grid link
     DELETE /api/projects/:projectId/overlays?what=link  forget it

   The DXF is read in the browser (osTile.js) and arrives here as
   linework in grid metres. Checked again here all the same, because a
   body is a body: coordinates must be National Grid, and the size is
   capped so one bad file cannot fill a row. */
import { supabase, json, fail, withAuth, whoIs } from "./_supabase.js";

const O = [
  "Overlay_ID", "Project_ID", "Kind", "File_Name", "Linework",
  "Min_E", "Min_N", "Max_E", "Max_N", "Hidden_Layers", "Visible", "Opacity",
  "Created_At", "Created_By",
].join(",");
const L = [
  "Project_ID", "A", "B", "TX", "TY", "Scale", "Rotation_Deg", "RMS_M",
  "Points", "Updated_At", "Updated_By",
].join(",");

/* 5 MB of JSON. Netlify refuses a function body over 6 MB before this
   code ever runs, so the limit has to sit under that to be the one
   that answers — with a message somebody can act on rather than a
   bare 413. A tile is typically well under 1 MB. */
const MAX_BYTES = 5 * 1024 * 1024;

const onGrid = (e, n) => Number.isFinite(e) && Number.isFinite(n)
  && e > 1000 && e < 700000 && n > 0 && n < 1300000;

export default withAuth(async function handler(req, context, user) {
  const db = supabase();
  const projectId = Number(context?.params?.projectId);
  const url = new URL(req.url);
  const what = url.searchParams.get("what");
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(projectId)) return json({ error: "Which project?" }, 400);

  try {
    if (req.method === "GET") {
      const [ov, ln] = await Promise.all([
        db.from("GIS_Overlay").select(O).eq("Project_ID", projectId).order("Overlay_ID"),
        db.from("GIS_Grid_Link").select(L).eq("Project_ID", projectId).maybeSingle(),
      ]);
      if (ov.error) throw ov.error;
      if (ln.error) throw ln.error;
      return json({ overlays: ov.data || [], link: ln.data || null });
    }

    /* ── The link ── */
    if (what === "link") {
      if (req.method === "DELETE") {
        const { error } = await db.from("GIS_Grid_Link").delete().eq("Project_ID", projectId);
        if (error) throw error;
        return json({ deleted: true });
      }
      if (req.method === "PUT") {
        const b = await req.json();
        const nums = ["A", "B", "TX", "TY"].map((k) => Number(b?.[k]));
        if (!nums.every(Number.isFinite)) return json({ error: "The link is incomplete." }, 400);
        /* A scale nowhere near 1 is a matched pair on the wrong
           feature, not a PDF a few percent out. Refused rather than
           saved, because everything drawn would read wrong. */
        const scale = Math.hypot(nums[0], nums[1]);
        if (!(scale > 0.5 && scale < 2)) {
          return json({ error: `That fit makes the drawing ${scale.toFixed(2)} times the size of `
            + "the OS map. A pair is matched to the wrong feature — check the points." }, 400);
        }
        const row = {
          Project_ID: projectId, A: nums[0], B: nums[1], TX: nums[2], TY: nums[3],
          Scale: Number(b.Scale) || scale, Rotation_Deg: Number(b.Rotation_Deg) || 0,
          RMS_M: Number.isFinite(Number(b.RMS_M)) ? Number(b.RMS_M) : null,
          Points: Array.isArray(b.Points) ? b.Points.slice(0, 50) : [],
          Updated_At: new Date().toISOString(),
          Updated_By: await whoIs(user),
        };
        const { data, error } = await db.from("GIS_Grid_Link")
          .upsert(row, { onConflict: "Project_ID" }).select(L).single();
        if (error) throw error;
        return json(data);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    /* ── Overlays ── */
    if (req.method === "POST") {
      const raw = await req.text();
      if (raw.length > MAX_BYTES) {
        return json({ error: "That tile is too large to keep. Order a smaller area." }, 400);
      }
      const b = JSON.parse(raw || "{}");
      const polylines = Array.isArray(b?.Linework?.polylines) ? b.Linework.polylines : [];
      const texts = Array.isArray(b?.Linework?.texts) ? b.Linework.texts : [];
      if (!polylines.length) return json({ error: "The tile has no linework." }, 400);
      /* Checked on the median, like the reader, so one stray entity
         does not decide. */
      const pts = polylines.flatMap((p) => p.pts || []);
      const mid = pts[Math.floor(pts.length / 2)] || [];
      if (!onGrid(Number(mid[0]), Number(mid[1]))) {
        return json({ error: "The tile is not on the National Grid." }, 400);
      }
      const kind = b.Kind === "cad" ? "cad" : "os_tile";
      const { data, error } = await db.from("GIS_Overlay").insert({
        Project_ID: projectId,
        Kind: kind,
        File_Name: String(b.File_Name || "").slice(0, 200) || null,
        Linework: { polylines, texts },
        Min_E: Number(b.Min_E), Min_N: Number(b.Min_N),
        Max_E: Number(b.Max_E), Max_N: Number(b.Max_N),
        Hidden_Layers: Array.isArray(b.Hidden_Layers) ? b.Hidden_Layers.map(String) : [],
        Visible: true,
        Opacity: 0.8,
        Created_By: await whoIs(user),
      }).select(O).single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH" && Number.isFinite(id)) {
      const b = await req.json();
      const patch = {};
      if (typeof b.Visible === "boolean") patch.Visible = b.Visible;
      if (Number.isFinite(Number(b.Opacity))) {
        patch.Opacity = Math.max(0.05, Math.min(1, Number(b.Opacity)));
      }
      if (Array.isArray(b.Hidden_Layers)) patch.Hidden_Layers = b.Hidden_Layers.map(String);
      const { data, error } = await db.from("GIS_Overlay").update(patch)
        .eq("Overlay_ID", id).eq("Project_ID", projectId).select(O).single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE" && Number.isFinite(id)) {
      const { error } = await db.from("GIS_Overlay").delete()
        .eq("Overlay_ID", id).eq("Project_ID", projectId);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects/:projectId/overlays" };
