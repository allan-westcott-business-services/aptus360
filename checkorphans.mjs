/* Modules nothing imports.

   A stale copy of a file is not an error: it builds, it lints, and it
   sits in the tree looking maintained. Changes go into whichever copy
   was opened, and land or do not land depending on which one the app
   actually loads.

   That has happened twice here — calloffs-FUNCTION.js beside
   calloffs.js in the functions folder, and calloffs-API.js beside
   calloffs.js in the api one. Both were the older version, and one of
   them received a day's work that never ran.

   Entry points and Netlify functions are not imported by anything and
   are not the problem this looks for. */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ENTRY = new Set(["src/main.jsx", "src/App.jsx"]);

/* Built, not yet wired in.

   These are not stale copies — they are finished pieces waiting for a
   call site, and deleting them would throw the work away. Listed so a
   new orphan still fails: the thing this guard is for is the stale
   duplicate that quietly receives edits nobody sees, and that only
   shows up as a name arriving here unexpectedly.

   Anything on this list should either get wired in or get deleted; it
   is a queue, not a permanent home. */
const PENDING = new Set([
  "src/features/gis/BulkEdit.jsx",      // bulkEdit.js does the work; this is the panel
  "src/features/gis/styleTouch.js",     // set a style by looking at the drawing
  "src/features/gis/zOrder.js",         // which feature draws over which
  "src/features/projects/EditContractForm.jsx",
  /* The gas pressure calculation, validated against a real GASWorkS
     model but not yet on a screen. Waiting on how fittings are to be
     supplied \u2014 they are the largest term and are not on the drawing. */
  "src/features/gis/gasPressure.js",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(name)) out.push(full.replace(/\\/g, "/"));
  }
  return out;
}

const files = walk("src");
const imported = new Set();

for (const f of files) {
  const src = readFileSync(f, "utf8");
  /* Static imports and dynamic ones. Pages are lazy loaded through
     import("./features/..."), and a scan that only saw `from` would
     report every screen in the application as unreachable. */
  const specs = [
    ...[...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
  ];
  for (const spec of specs) {
    if (!spec.startsWith(".")) continue;
    const dir = f.slice(0, f.lastIndexOf("/"));
    const parts = `${dir}/${spec}`.split("/");
    const stack = [];
    for (const p of parts) {
      if (p === "." || p === "") continue;
      if (p === "..") stack.pop();
      else stack.push(p);
    }
    imported.add(stack.join("/"));
  }
}

let bad = 0;
let pending = 0;
for (const f of files) {
  if (ENTRY.has(f)) continue;
  if (imported.has(f)) continue;
  if (PENDING.has(f)) { pending++; continue; }
  console.log(`  FAIL ${relative(".", f)} is imported by nothing`);
  bad++;
}

console.log(bad ? `\n${bad} module(s) nothing imports`
  : `Every module is reachable (${files.length} files`
    + `${pending ? `, ${pending} built but not wired in` : ""}).`);
process.exit(bad ? 1 : 0);
