/* The drawing the office attaches to a call-off.

   ── Why this exists ──

   The sketch page of a jointing work instruction is drawn over the
   electric design. Three rounds went into deriving that backdrop from
   the GIS canvas, and it had three faults stacked in it — the site plan
   drawn at NaN, no way to re-take a drawing captured wrongly, and a
   raster that fell apart when a gang zoomed in. None of them was
   visible from the office, because a drawing with no plan under it
   looks exactly like a drawing whose project has no plan.

   The office already holds the design as a PDF. Attaching that is one
   step, cannot go stale against a revision nobody told the canvas
   about, and renders sharp at any zoom. This is what the original
   application did.

   The derived picture stays as the fallback, for every call-off raised
   before this and for anyone who has not attached one. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const endpoint = readFileSync("./netlify/functions/call-off-drawing.js", "utf8");
const queue = readFileSync("./netlify/functions/field-queue.js", "utf8");
const office = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
const backdrop = readFileSync("./src/features/field/SketchBackdrop.jsx", "utf8");
const sql = readFileSync("./supabase/migrations/0188_call_off_drawing.sql", "utf8");

/* The endpoint's file test, run for real. */
const { fileFrom, tidyName } = (() => {
  const body = endpoint.slice(endpoint.indexOf("const KINDS"),
    endpoint.indexOf("export default"));
  // eslint-disable-next-line no-new-func
  return new Function("Buffer", `${body}; return { fileFrom, tidyName };`)(Buffer);
})();

const asData = (type, bytes) =>
  `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;

// 1. What may be attached is decided by the bytes, not the name.
//
//    A file called .pdf is not a PDF, and storing whatever arrives
//    under a .pdf name is how a storage bucket becomes a file host.
{
  const pdf = fileFrom(asData("application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]));
  if (pdf?.ext !== "pdf") fail("a real PDF was refused");
  if (pdf?.type !== "application/pdf") fail(`a PDF was stored as ${pdf?.type}`);

  const png = fileFrom(asData("image/png", [0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));
  if (png?.ext !== "png") fail("a real PNG was refused");
  const jpg = fileFrom(asData("image/jpeg", [0xff, 0xd8, 0xff, 1, 2, 3]));
  if (jpg?.ext !== "jpg") fail("a real JPEG was refused");

  /* The ones that matter. */
  if (fileFrom(asData("application/pdf", [0x3c, 0x3f, 0x70, 0x68, 0x70]))) {
    fail("a PHP file declaring itself a PDF was accepted");
  }
  if (fileFrom(asData("application/pdf", [0x50, 0x4b, 0x03, 0x04]))) {
    fail("a zip declaring itself a PDF was accepted");
  }
  if (fileFrom("data:application/pdf;base64,")) fail("an empty file was accepted");
  if (fileFrom("https://example.test/plan.pdf")) fail("a bare URL was accepted");
  if (fileFrom(null)) fail("nothing at all was accepted");

  /* Bounded. A construction drawing is a few megabytes; a bucket is not
     a place to put an issue set or a photo album. */
  const huge = Buffer.alloc(26 * 1024 * 1024);
  huge[0] = 0x25; huge[1] = 0x50; huge[2] = 0x44; huge[3] = 0x46;
  if (fileFrom(asData("application/pdf", huge))) fail("a 26 MB file was accepted");
}

// 2. The name is kept, and made safe.
//
//    Kept because these are named like AP2228.APT.LV.XX.DR.Y.110001
//    REV02 and the revision is the thing a planner needs to see without
//    opening the file.
{
  const real = "AP2228.APT.LV.XX.DR.Y.110001 REV02.pdf";
  if (tidyName(real) !== real) fail(`a drawing number was mangled: ${tidyName(real)}`);
  const nasty = tidyName("../../etc/passwd\n<script>alert(1)</script>");
  if (/[/\\<>\n]/.test(nasty)) fail(`a hostile name survived: ${JSON.stringify(nasty)}`);
  if (tidyName("") !== null) fail("an empty name became something other than nothing");
  if (String(tidyName("x".repeat(500))).length > 160) fail("a name was not bounded");
}

// 3. Attach, replace and remove are all there.
{
  for (const [verb, what] of [
    ["POST", "attaching"], ["GET", "reading what is attached"], ["DELETE", "removing"],
  ]) {
    if (!new RegExp(`req\\.method === "${verb}"`).test(endpoint)) {
      fail(`the endpoint has no way of ${what}`);
    }
  }
  /* Overwrites rather than versions: the reason to attach another is
     that the last one was superseded. */
  if (!/upsert: true/.test(endpoint)) fail("attaching again does not replace");

  /* Every kind removed, not just the one the row names. A PDF attached
     over an earlier PNG leaves the PNG in the bucket, and a remove that
     cleared only the current one would leave the older file readable by
     URL after somebody had removed it. */
  if (!/KINDS\.map\(\(k\) => `\$\{submissionId\}\/drawing\.\$\{k\.ext\}`\)/.test(endpoint)) {
    fail("removing leaves files of other kinds behind, still readable by URL");
  }

  /* The row is written after the file. A file with no row is invisible
     and can be swept up; a row pointing at a file that was never
     written is a broken drawing in a work instruction. */
  const up = endpoint.indexOf(".upload(path");
  const row = endpoint.indexOf("Drawing_Path: path");
  if (up < 0 || row < 0 || up > row) fail("the row is written before the file");
}

// 4. The office asks the endpoint that owns the columns.
//
//    calloffs.js keeps an explicit column list and leaves these out on
//    purpose: naming a column the running database might not have broke
//    the raise path outright once, on an instance where the migration
//    had been applied but PostgREST still held the old schema.
{
  const co = readFileSync("./netlify/functions/calloffs.js", "utf8");
  const cols = co.slice(co.indexOf("const SUB_COLS"), co.indexOf("].join"));
  if (/"Drawing_Path"|"Drawing_Name"/.test(cols)) {
    fail("the drawing columns were added to SUB_COLS — this is what broke raising before");
  }
  if (!/getCallOffDrawing/.test(office)) {
    fail("the office screen does not ask what is attached");
  }
  /* And a database without 0188 gets an answer, not a broken screen. */
  if (!/if \(error\) return json\(\{ submissionId, drawing: null \}\)/.test(endpoint)) {
    fail("a database without 0188 makes the call-off page fail rather than say 'no drawing'");
  }
}

// 5. It reaches the tablet, and wins over the derived picture.
{
  if (!/Drawing_Path,Drawing_Name/.test(queue)) {
    fail("the field queue does not select the attached drawing");
  }
  if (!/drawing: released && s\.Drawing_Path/.test(queue)) {
    fail("the attached drawing is not handed to the tablet");
  }
  /* Released jobs only, as everything else on the queue is. */
  if (/drawing: s\.Drawing_Path/.test(queue)) {
    fail("the drawing is sent for jobs that have not been released");
  }

  /* The office's sheet is the issued design at the revision the office
     chose. The derived one is a guess that has been wrong three times. */
  const wins = backdrop.indexOf("if (drawing?.url)");
  const derived = backdrop.indexOf("if (!vector)");
  if (wins < 0) fail("the attached drawing is not preferred");
  else if (derived >= 0 && wins > derived) {
    fail("the derived picture is checked before the office's attachment");
  }

  /* Rendered from the PDF at the zoom being shown — the whole reason to
     send a PDF rather than a picture of one. */
  if (!/getViewport\(\{ scale: s \}\)/.test(backdrop)) {
    fail("the attached PDF is not rendered at the zoom being shown");
  }
  if (!/Math\.min\(size \/ base\.width, size \/ base\.height\)/.test(backdrop)) {
    fail("the sheet is stretched to the pane rather than fitted — its dimensions would lie");
  }
}

// 6. The migration is additive and re-runnable.
//
//    Migrations are pasted in by hand here, so one that fails halfway
//    through on a second run leaves a database nobody can reason about.
{
  if (!/ADD COLUMN IF NOT EXISTS "Drawing_Path"/.test(sql)) {
    fail("0188 does not add Drawing_Path safely");
  }
  for (const c of ["Drawing_Name", "Drawing_Uploaded_At"]) {
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS "${c}"`).test(sql)) {
      fail(`0188 does not add ${c} safely`);
    }
  }
  if (/DROP COLUMN|ALTER COLUMN .* SET NOT NULL/.test(sql)) {
    fail("0188 drops or tightens a column — it should only add");
  }
  /* The bucket, guarded, because the file has nowhere to go without it. */
  if (!/storage\.buckets/.test(sql)) fail("0188 does not create the bucket");
  if (!/WHERE NOT EXISTS/.test(sql)) fail("0188 cannot be run twice");
  /* As_Laid_Path is not dropped: it is the fallback and what the office
     prints. */
  if (/As_Laid_Path/.test(sql) && /DROP/.test(sql)) {
    fail("0188 removes the rendered drawing, which is still the fallback");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The office attaches the drawing (checked by its bytes, sharp at any zoom).");
process.exit(bad ? 1 : 0);
