/* One function per route.

   Netlify picks a handler by the `config.path` each function exports.
   Two files exporting the same path is not an error anywhere: the build
   succeeds, the site deploys, and one of them serves the route while
   the other sits there looking maintained. Changes go into whichever
   file was opened, and land or do not land depending on which one won.

   That happened here: calloffs.js and calloffs-FUNCTION.js both claimed
   /api/projects/:projectId/calloffs, and the older copy was missing the
   span node columns and Off_Site. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "netlify/functions";
const byPath = new Map();
let checked = 0;

for (const name of readdirSync(DIR)) {
  if (!name.endsWith(".js")) continue;
  const src = readFileSync(join(DIR, name), "utf8");
  for (const m of src.matchAll(/path:\s*["'`]([^"'`]+)["'`]/g)) {
    checked++;
    const p = m[1];
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(name);
  }
}

let bad = 0;
for (const [p, files] of byPath) {
  if (files.length > 1) {
    console.log(`  FAIL ${p}`);
    console.log(`       claimed by ${files.join(" and ")}`);
    bad++;
  }
}

console.log(bad ? `\n${bad} route(s) claimed more than once`
  : `Every route has one function (${checked} routes, ${byPath.size} distinct).`);
process.exit(bad ? 1 : 0);
