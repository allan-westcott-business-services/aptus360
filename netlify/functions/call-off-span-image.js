import { supabase, withAuth, json, fail } from "./_supabase.js";

/* The picture of one span, stored against it.

   ── Why the file comes through here ──

   Everything in this application reaches the database through a
   function holding the service-role key; the browser's anon key has no
   policies and can read and write nothing. Storage is no different. So
   the canvas sends the image it drew and this writes it, rather than
   the browser uploading and posting a path — which is how
   connection-photos does it, and which only works because that bucket
   has policies of its own.

   ── Drawn by the canvas ──

   Because the canvas is the only thing that knows how to draw this
   network. There is no renderer on this side and building one would be
   a second drawing engine, kept in step by hand, disagreeing with the
   first the week after somebody changes a style.

   ── One span at a time ──

   A call-off has a handful, and each arrives as its own request. A
   single call carrying six images would be a megabyte of base64 in one
   body, and one failure would lose all six rather than one. */

const BUCKET = "call-off-spans";

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
    /* Two megabytes is far more than a 640x420 line drawing needs, and
       far less than a photograph. */
    if (bytes.length > 2 * 1024 * 1024) return null;
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
    const spanId = Number(body?.spanId);
    if (!spanId) return json({ error: "Which span?" }, 400);

    const bytes = pngFrom(body?.dataUrl);
    if (!bytes) return json({ error: "That is not a span drawing." }, 400);

    /* The span, so the path can carry its submission — and so a span id
       that does not exist is refused before anything is written. */
    const { data: span, error: sErr } = await db
      .from("Mains_Call_Off_Span")
      .select("Span_ID,Submission_ID,Span_Image_Path")
      .eq("Span_ID", spanId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!span) return json({ error: "No such span." }, 404);

    /* Named for what it is, so a file found on its own says which
       call-off and which span it belongs to. */
    const path = `${span.Submission_ID}/${spanId}.png`;

    const { error: upErr } = await db.storage
      .from(BUCKET)
      /* Overwrites, so raising a call-off twice over the same span —
         or a retry after a half-finished attempt — replaces rather than
         accumulating. */
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw upErr;

    /* The row last. A file with no row is invisible and can be swept up;
       a row pointing at a file that was never written is a broken
       picture in a work instruction. */
    const { error: rowErr } = await db
      .from("Mains_Call_Off_Span")
      .update({ Span_Image_Path: path })
      .eq("Span_ID", spanId);
    if (rowErr) throw rowErr;

    return json({
      spanId,
      path,
      url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    });
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/call-off-span-image" };
