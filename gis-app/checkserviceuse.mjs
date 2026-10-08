/* No request handler may bypass row-level security without saying why.
 *
 * ── What this is protecting ──
 *
 * Every endpoint in Aptus360 runs on the service role key, which
 * bypasses RLS entirely. The database never sees the signed-in user,
 * so every check lives in JavaScript and a forgotten filter returns
 * somebody else's rows.
 *
 * The GIS app is sold to several customers, so that is no longer a
 * bug class anyone can live with. Migration 0001 puts the filtering in
 * the database, and `asUser(req)` is what lets it work.
 *
 * None of that survives one handler quietly switching to asService()
 * because something was easier that way — and it WILL be easier, the
 * day someone needs a row they cannot see. The point of this check is
 * that taking the easy route has to be deliberate and has to be
 * explained in the file.
 *
 * ── The escape hatch ──
 *
 * A file may use asService() if it carries a line saying
 *
 *     SERVICE KEY OK: <reason>
 *
 * Two jobs genuinely need it: creating the first Account, before
 * anybody is a member of it and so before any policy can match; and
 * anything run on a schedule, where there is no signed-in person at
 * all. Both are rare and both are worth a sentence.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "functions");

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`FAIL  ${DIR} does not exist. If the functions moved,`);
  console.error("      update this check rather than deleting it.");
  process.exit(1);
}

if (files.length === 0) {
  console.error(`FAIL  no functions found in ${DIR}.`);
  console.error("      A check that passes over an empty directory is worse");
  console.error("      than no check: it reports success for nothing.");
  process.exit(1);
}

const problems = [];
let allowed = 0;

for (const f of files) {
  const src = readFileSync(join(DIR, f), "utf8");

  /* _supabase.js defines asService, so it names it without using it.
     Strip comments before looking, or every mention in the header
     above counts as a use. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const uses = /\basService\s*\(/.test(code);
  if (!uses) continue;
  if (f === "_supabase.js") continue;        // where it is defined

  const reason = src.match(/SERVICE KEY OK:\s*(.+)/);
  if (reason) { allowed += 1; continue; }

  problems.push(f);
}

if (problems.length) {
  console.error("FAIL  these handlers bypass row-level security with no reason given:");
  for (const f of problems) console.error(`        functions/${f}`);
  console.error("");
  console.error("      asService() uses the service role key, which ignores every");
  console.error("      policy in 0001. One account's drawings become readable by");
  console.error("      another the moment a filter is forgotten.");
  console.error("");
  console.error("      Use asUser(req). If this genuinely cannot — creating the");
  console.error("      first Account, or a scheduled job with no signed-in person —");
  console.error("      say so in the file:");
  console.error("");
  console.error("          SERVICE KEY OK: <why>");
  process.exit(1);
}

/* The other half: a handler that never reaches for a client at all is
   not safe, it is broken in a way that looks safe to the rule above. */
const noClient = files.filter((f) => {
  if (f.startsWith("_")) return false;
  const src = readFileSync(join(DIR, f), "utf8");
  return !/\bwithAuth\b|\basUser\s*\(|\basService\s*\(/.test(src);
});
if (noClient.length) {
  console.error("FAIL  these handlers reach the database by no route this check knows:");
  for (const f of noClient) console.error(`        functions/${f}`);
  console.error("      Either they use withAuth/asUser/asService, or they have found");
  console.error("      a third way in that nothing is checking.");
  process.exit(1);
}

const n = files.filter((f) => !f.startsWith("_")).length;
console.log(`ok    ${n} handlers, all on the caller's own token`
  + (allowed ? ` (${allowed} with a stated service-key reason)` : ""));
