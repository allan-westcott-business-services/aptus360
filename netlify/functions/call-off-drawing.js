import { supabase, withAuth, json, fail } from "./_supabase.js";

/* The design drawing the office attaches to a call-off.

   The sheet the gang works from. Rendered behind the sketch page of
   every jointing work instruction raised from this call-off, so joint
   positions are marked against the actual design rather than a blank
   page — and, because it is the original PDF rather than a picture of
   one, it stays sharp however far a gang zooms in.

   ── Why the file comes through here ──

   The same reason the as-laid drawing and the span pictures do:
   everything in this application reaches the database through a
   function holding the service-role key, and the browser's anon key
   has no policies and can write nothing.

   That is also the answer to the credentials question the old
   standalone form raised. It posted straight to Supabase with an
   insert-only token compiled into the page — a token anybody holding
   the file can use for as long as it lasts. Nothing here needs one.

   ── One per call-off, replaced rather than versioned ──

   Attaching again overwrites. A history of drawings would be a list
   nobody has asked to see, and the reason to attach another is that
   the last one was superseded. The file name is kept so somebody can
   see which revision is on there without opening it — these are named
   like AP2228.APT.LV.XX.DR.Y.110001 REV02, and the revision is the
   thing that matters. */

const BUCKET = "call-off-drawing";

/* What may be attached.

   PDF first, because that is what a design is issued as and what stays
   sharp at any zoom. PNG and JPEG accepted because a drawing office
   that exports one of those should not be blocked at the door — they
   pixelate, which is the gang's problem to see rather than this
   endpoint's to prevent.

   Checked by signature, not by the name or the declared type. A file
   called .pdf is not a PDF, and storing whatever arrives under a .pdf
   name is how a storage bucket becomes a file host. */
const KINDS = [
  { ext: "pdf", type: "application/pdf", sig: [0x25, 0x50, 0x44, 0x46] },
  { ext: "png", type: "image/png", sig: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", type: "image/jpeg", sig: [0xff, 0xd8, 0xff] },
];

const MAX_BYTES = 25 * 1024 * 1024;

function fileFrom(dataUrl) {
  const s = String(dataUrl || "");
  const comma = s.indexOf(",");
  if (!s.startsWith("data:") || comma < 0) return null;

  let bytes;
  try {
    bytes = Buffer.from(s.slice(comma + 1), "base64");
  } catch {
    return null;
  }
  /* A construction drawing is a few megabytes. Twenty-five is roomy
     enough for a big multi-sheet set and small enough that nobody
     stores a site photo album here. */
  if (!bytes.length || bytes.length > MAX_BYTES) return null;

  for (const k of KINDS) {
    if (bytes.length < k.sig.length) continue;
    let ok = true;
    for (let i = 0; i < k.sig.length; i++) if (bytes[i] !== k.sig[i]) { ok = false; break; }
    if (ok) return { bytes, ...k };
  }
  return null;
}

/* The file name, made safe and kept recognisable.

   Not used as the storage path — that is fixed per call-off so
   attaching again overwrites — but shown on the call-off and on the
   work instruction, so a planner can see the revision. */
const tidyName = (name) => String(name || "")
  .replace(/[\r\n\t]/g, " ")
  .replace(/[^\w .()\-]/g, "")
  .trim()
  .slice(0, 160) || null;

export default withAuth(async function handler(req) {
  const db = supabase();

  try {
    if (req.method === "POST") {
      const body = await req.json();
      const submissionId = Number(body?.submissionId);
      if (!submissionId) return json({ error: "Which call-off?" }, 400);

      const file = fileFrom(body?.dataUrl);
      if (!file) {
        return json({
          error: "That is not a drawing. Attach a PDF, PNG or JPEG "
            + "under 25 MB.",
        }, 400);
      }

      /* The call-off, so an id that does not exist is refused before
         anything is written. */
      const { data: sub, error: sErr } = await db
        .from("Mains_Call_Off_Submission")
        .select("Submission_ID")
        .eq("Submission_ID", submissionId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!sub) return json({ error: "No such call-off." }, 404);

      /* One path per call-off, by kind. Attaching a PDF over a PNG
         leaves the old one behind, which is why the remove below
         clears every kind rather than the one the row names. */
      const path = `${submissionId}/drawing.${file.ext}`;

      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(path, file.bytes, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      /* The row last. A file with no row is invisible and can be swept
         up; a row pointing at a file that was never written is a broken
         drawing in a work instruction. */
      const { error: rowErr } = await db
        .from("Mains_Call_Off_Submission")
        .update({
          Drawing_Path: path,
          Drawing_Name: tidyName(body?.name),
          Drawing_Uploaded_At: new Date().toISOString(),
        })
        .eq("Submission_ID", submissionId);
      if (rowErr) throw rowErr;

      return json({
        submissionId,
        path,
        name: tidyName(body?.name),
        url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
      });
    }

    if (req.method === "GET") {
      /* ── Why the office asks here rather than reading the call-off ──

         calloffs.js keeps an explicit column list and deliberately
         leaves the drawing columns out of it. That is not an oversight:
         listing As_Laid_Captured_At there once broke raising a call-off
         outright on an instance where the migration had not reached the
         running database, and PostgREST held the old schema besides.

         The rule the endpoint states is that a column belongs in an
         explicit list where that endpoint reads or writes it, and
         nowhere else. This endpoint owns these three columns, so this
         is where they are read — and a database without 0188 gets a
         "no drawing" answer rather than a call-off page that will not
         load. */
      const submissionId = Number(new URL(req.url).searchParams.get("submissionId"));
      if (!submissionId) return json({ error: "Which call-off?" }, 400);

      const { data, error } = await db
        .from("Mains_Call_Off_Submission")
        .select("Submission_ID,Drawing_Path,Drawing_Name,Drawing_Uploaded_At")
        .eq("Submission_ID", submissionId)
        .maybeSingle();
      /* A database without 0188 answers with a missing-column error.
         Reported as no drawing, because that is true of it. */
      if (error) return json({ submissionId, drawing: null });
      if (!data?.Drawing_Path) return json({ submissionId, drawing: null });

      return json({
        submissionId,
        drawing: {
          name: data.Drawing_Name ?? null,
          at: data.Drawing_Uploaded_At ?? null,
          url: db.storage.from(BUCKET).getPublicUrl(data.Drawing_Path).data.publicUrl,
        },
      });
    }

    if (req.method === "DELETE") {
      const body = await req.json();
      const submissionId = Number(body?.submissionId);
      if (!submissionId) return json({ error: "Which call-off?" }, 400);

      /* Every kind removed, not just the one the row names. A PDF
         attached over an earlier PNG leaves the PNG in the bucket, and
         a remove that cleared only the current one would leave the
         older file readable by URL after somebody had removed it. */
      await db.storage.from(BUCKET)
        .remove(KINDS.map((k) => `${submissionId}/drawing.${k.ext}`))
        .catch(() => null);

      const { error: rowErr } = await db
        .from("Mains_Call_Off_Submission")
        .update({
          Drawing_Path: null, Drawing_Name: null, Drawing_Uploaded_At: null,
        })
        .eq("Submission_ID", submissionId);
      if (rowErr) throw rowErr;

      return json({ submissionId, removed: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/call-off-drawing" };
