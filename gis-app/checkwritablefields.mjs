/* A request body may not choose which account it is filed under.
 *
 * Every write handler filters the incoming body through a WRITABLE
 * set. Account_ID is not in it, and Project_ID is not in it: both are
 * derived from the URL's project and the account that owns it.
 *
 * Adding either to that set would be a one-word change that reads as
 * a convenience and is actually a way to write a feature into another
 * company's drawing — or, on an update, to walk a feature across the
 * wall one save at a time.
 *
 * Migration 0001's composite foreign keys would reject the worst of
 * it, and that is the point of having two walls rather than one. This
 * check is the first wall: the field is not accepted at all.
 *
 * Feature_ID and the timestamps are here for a duller reason. The
 * database owns them, and a body that could set Created_At is a body
 * that can backdate a change in a history somebody relies on.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "functions");
const FORBIDDEN = ["Account_ID", "Project_ID", "Feature_ID", "Created_At", "Updated_At"];

const files = readdirSync(DIR).filter((f) => f.endsWith(".js") && !f.startsWith("_"));
if (!files.length) {
  console.error(`FAIL  no handlers in ${DIR} — nothing was checked.`);
  process.exit(1);
}

let checked = 0;
const problems = [];

for (const f of files) {
  const src = readFileSync(join(DIR, f), "utf8");
  const flat = src.replace(/\s+/g, " ");

  const m = flat.match(/const WRITABLE = new Set\(\[(.*?)\]\)/);
  if (!m) {
    /* A handler with no WRITABLE set is either read-only or is taking
       the body unfiltered. The first is fine; the second is the thing
       this check exists for, and they are not distinguishable from
       here — so say so rather than passing quietly. */
    if (/\b(insert|update|upsert)\s*\(/.test(flat)) {
      problems.push([f, "writes to the database but has no WRITABLE set"]);
    }
    continue;
  }

  checked += 1;
  for (const field of FORBIDDEN) {
    if (m[1].includes(`"${field}"`) || m[1].includes(`'${field}'`)) {
      problems.push([f, `lets a request body set ${field}`]);
    }
  }
}

if (problems.length) {
  console.error("FAIL  a request body can choose things it must not:");
  for (const [f, why] of problems) console.error(`        functions/${f} — ${why}`);
  console.error("");
  console.error("      Account_ID and Project_ID come from the URL's project and");
  console.error("      the account that owns it, never from the caller. Accepting");
  console.error("      them is how a feature gets written into another company's");
  console.error("      drawing, or walked across the wall one save at a time.");
  process.exit(1);
}

console.log(`ok    ${checked} write handler(s), none accepts an account or a parent from the body`);
