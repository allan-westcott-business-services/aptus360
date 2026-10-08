/* src/shared/design-calc must stay pure arithmetic.

   ── Why this check exists at all ──

   These fifteen modules are the ones both the GIS canvas and the
   business app need: trench contents and sizes, dig and joint rates,
   the electric graph, build status, DXF layer meanings. They produce
   the figures that go on a call-off and get invoiced, which is why
   they cannot be allowed to exist twice — a GIS app and a business app
   disagreeing about how many dig days a trench is worth is a fault
   nobody notices until a customer does.

   When GIS moves to its own repository this directory becomes a
   package both sides depend on. A package can only be lifted out if it
   depends on nothing around it. The day one of these files imports a
   React hook, an API client or a lookup table, that stops being true —
   and it stops being true quietly, because everything still builds.

   So this asserts the boundary now, while it holds, rather than
   discovering it has gone on the day of the split.

   It also asserts the directory still has files in it. A check that
   passes over an empty directory is worse than no check: it reports
   success for a package that has been dismantled. */

import { readdirSync, readFileSync } from "node:fs";

const DIR = "src/shared/design-calc";

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`FAIL  ${DIR} does not exist.`);
  console.error("      It holds the calculation modules shared between the GIS");
  console.error("      canvas and the business app. If it moved, update this check.");
  process.exit(1);
}

if (files.length < 10) {
  console.error(`FAIL  ${DIR} holds only ${files.length} modules.`);
  console.error("      It had fifteen. Either several were moved out, or this");
  console.error("      check is now pointing at the wrong directory — and a");
  console.error("      check that passes over an empty package proves nothing.");
  process.exit(1);
}

/* A bare specifier is a node_modules package; "./x.js" is a sibling.
   Anything else — "../", "src/", an alias — reaches outside. */
const IMPORT = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+["']([^"']+)["']/g;

/* Allowed bare specifiers. Nothing today; listed so that adding one is
   a deliberate edit to this line rather than a silent new dependency.
   React, the Supabase client and anything under src/api or src/lib are
   the ones that would make the package unliftable. */
const ALLOWED_PACKAGES = new Set([]);

const problems = [];
for (const f of files) {
  const src = readFileSync(`${DIR}/${f}`, "utf8");
  for (const m of src.matchAll(IMPORT)) {
    const spec = m[1];
    if (spec.startsWith("./")) continue;                 // sibling: fine
    if (!spec.startsWith(".") && ALLOWED_PACKAGES.has(spec)) continue;
    problems.push([f, spec]);
  }
}

if (problems.length) {
  console.error(`FAIL  ${DIR} reaches outside itself:`);
  for (const [f, spec] of problems) console.error(`        ${f} imports ${spec}`);
  console.error("      This package has to be liftable into the GIS repository");
  console.error("      on its own. Either the import belongs in the caller, or");
  console.error("      what it needs should be passed in as an argument.");
  process.exit(1);
}

console.log(`ok    design-calc: ${files.length} modules, no imports outside the package`);
