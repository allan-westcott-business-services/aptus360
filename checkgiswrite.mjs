/* Writing a feature: the write is what matters, not the row that comes
   back.

   Reported on a text note: saving answered "cannot coerce the result to
   a single JSON object". That message is PostgREST's for "I was asked
   for exactly one row and got none". The same row inserted by hand in
   SQL went in without complaint, and the schema checks all passed — the
   role is allowed, the annotation layer exists, notes exist on other
   projects. So the insert itself was fine and only the REPRESENTATION
   was missing, and the endpoint turned that into a failure.

   Several things can leave a write with no representation, and none of
   them mean the row was not written. A genuine refusal still arrives as
   an error, which is why this can be relaxed safely. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const api = readFileSync("./netlify/functions/gis.js", "utf8");

// 1. Neither write insists on exactly one row.
{
  const post = api.slice(api.indexOf('if (req.method === "POST")'),
    api.indexOf("/* Dragging produces a stream"));
  const patch = api.slice(api.indexOf('if (req.method === "PATCH" && id)'),
    api.indexOf('if (req.method === "DELETE")'));
  if (/\.single\(\)/.test(post)) fail("creating a feature still demands a single row back");
  if (/\.single\(\)/.test(patch)) fail("saving a feature still demands a single row back");

  // 2. A real error is still an error.
  if (!/if \(error\) throw error;/.test(post) || !/if \(error\) throw error;/.test(patch)) {
    fail("a refusal by the database is swallowed — the relaxation must only cover "
      + "a missing representation, never a failed write");
  }

  // 3. Where nothing came back, the row is looked for.
  if (!/order\("Feature_ID", \{ ascending: false \}\)/.test(post)) {
    fail("a created feature with no representation is reported as a failure, when "
      + "the row may well be there");
  }
  /* `.eq(col, null)` asks for the text "null" and matches nothing; a
     plain shape has no role, and that is exactly the row this lookup
     would then never find. */
  if (!/q = val == null \? q\.is\(col, null\) : q\.eq\(col, val\)/.test(post)) {
    fail("the lookup uses .eq for a null layer or role, which matches nothing");
  }
  if (!/const \{ data: after \} = await db\.from\("GIS_Feature"\)\.select\(F\)\.eq\("Feature_ID", id\)/.test(patch)) {
    fail("a saved feature with no representation is reported as a failure without "
      + "checking whether the row is there");
  }

  // 4. And when the row really is absent, it says so in words.
  if (!/is not on this drawing/.test(patch)) {
    fail("a feature deleted while open gives the database's own message rather than "
      + "a sentence anybody can act on");
  }
  if (!/was not written to the/.test(post)) {
    fail("a create that truly wrote nothing gives no usable message");
  }

  // 5. An update with nothing writable in it is its own answer.
  if (!/Nothing to save on that feature/.test(patch)) {
    fail("an update whose fields are all filtered out reports the same coercion "
      + "error as a missing row — two faults wearing one message");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A feature write stands on the write, not on the row that comes back.");
process.exit(bad ? 1 : 0);
