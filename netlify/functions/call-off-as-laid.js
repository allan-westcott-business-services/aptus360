import { supabase, withAuth, json, fail } from "./_supabase.js";

/* The as-laid drawing of an Electric Service call-off.

   The electric design over the plots being connected, taken when the
   call-off is raised, and drawn under the sketch tab of every jointing
   work instruction raised from it. A gang marking joint positions marks
   them against the run as laid rather than on a blank page.

   ── Why the file comes through here ──

   The same reason the span pictures do: everything in this application
   reaches the database through a function holding the service-role key,
   and the browser's anon key has no policies and can write nothing.
   Storage is no different. The canvas sends the image it drew and this
   writes it.

   That is also the answer to the credentials question the old
   standalone form raised. It posted straight to Supabase with an
   insert-only token compiled into the page, which is a token anybody
   holding the file can use for as long as it lasts. Nothing here needs
   one: the drawing is written by a function, and read from a public
   bucket by URL.

   ── One per call-off, replaced rather than versioned ──

   Raising the same call-off's drawing twice overwrites. A history of
   drawings would be a list nobody has asked to see, and the reason to
   take it again is that the last one was wrong.

   ── Taken now, not when the instruction opens ──

   Same argument as spanImage makes. If the drawing moves afterwards the
   gang still sees what was called off, which is the point of a record.
   `As_Laid_Captured_At` is what lets a planner see how old it is and
   decide to take it again. */

const BUCKET = "call-off-as-laid";

/* A data URL as bytes.

   Only PNG, and only what the canvas produces. Anything else is not
   something this endpoint made, and decoding whatever arrives is how a
   storage bucket becomes a file host. */
function pngFrom(dataUrl) {
  const s = String(dataUrl || "");
  const prefix = "data:image/png;base64,";
  if (!s.startsWith(prefix)) return null;

  const b64 = s.slice(prefix.length);
  if (!b64) return null;

  try {
    const bytes = Buffer.from(b64, "base64");
    /* A PNG starts with a fixed eight-byte signature. Checking it costs
       nothing and stops a base64 string of anything at all being stored
       under a .png name. */
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 8) return null;
    for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
    /* Roomier than the span pictures allow, because this one covers a
       whole call-off's plots rather than one span and is drawn larger.
       Still far below a photograph. */
    if (bytes.length > 6 * 1024 * 1024) return null;
    return bytes;
  } catch {
    return null;
  }
}

export default withAuth(async function handler(req) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = supabase();

  try {
    const body = await req.json();
    const submissionId = Number(body?.submissionId);
    if (!submissionId) return json({ error: "Which call-off?" }, 400);

    const bytes = pngFrom(body?.dataUrl);
    if (!bytes) return json({ error: "That is not an as-laid drawing." }, 400);

    /* The call-off, so an id that does not exist is refused before
       anything is written. */
    const { data: sub, error: sErr } = await db
      .from("Mains_Call_Off_Submission")
      .select("Submission_ID,As_Laid_Path")
      .eq("Submission_ID", submissionId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sub) return json({ error: "No such call-off." }, 404);

    /* Named for what it is, so a file found on its own says which
       call-off it belongs to. */
    const path = `${submissionId}/as-laid.png`;

    const { error: upErr } = await db.storage
      .from(BUCKET)
      /* Overwrites, so taking the drawing again after the design
         changed replaces rather than accumulating. */
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw upErr;

    /* The row last. A file with no row is invisible and can be swept
       up; a row pointing at a file that was never written is a broken
       picture in a work instruction. */
    const { error: rowErr } = await db
      .from("Mains_Call_Off_Submission")
      .update({
        As_Laid_Path: path,
        As_Laid_Captured_At: new Date().toISOString(),
      })
      .eq("Submission_ID", submissionId);
    if (rowErr) throw rowErr;

    return json({
      submissionId,
      path,
      url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    });
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/call-off-as-laid" };
