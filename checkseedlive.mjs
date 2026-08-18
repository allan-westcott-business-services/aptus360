/* Why did deleting a plot seed leave its service behind?

   Run this against a drawing rather than against a fixture. It reports,
   for one seed, what the cascade finds and — more usefully — what it
   rejected and on what grounds. A rule that quietly returns nothing is
   impossible to argue with; this makes it say why.

   ── Getting the data ──

   With the GIS canvas open on the project, in the browser console:

     copy(JSON.stringify(await (await fetch(
       `/api/gis?project=${new URLSearchParams(location.search).get("project")
        || sessionStorage.getItem("gisProject")?.replace(/"/g,"")}`
     )).json()))

   Paste into a file, then:

     node checkseedlive.mjs drawing.json <Feature_ID of the seed>

   The Feature_ID is on the feature editor when the seed is open, or is
   the id the delete was called with.

   Nothing here writes anything. It is a reading of the drawing. */

import { readFileSync } from "node:fs";
import {
  seedCascade, servicePartOf, belongsToSeed, METER_REACH_M, JOINT_NEAR_M,
} from "./src/features/gis/seedCascade.js";

const [file, seedArg] = process.argv.slice(2);
if (!file) {
  console.log("usage: node checkseedlive.mjs <drawing.json> [seed Feature_ID]");
  process.exit(2);
}

const raw = JSON.parse(readFileSync(file, "utf8"));
const features = raw.features || raw.Features || (Array.isArray(raw) ? raw : []);
const lineTypes = raw.lineTypes || raw.line_types || raw.lookups?.lineTypes || [];

console.log(`${features.length} feature(s), ${lineTypes.length} line type(s) loaded.\n`);

if (!lineTypes.length) {
  console.log("!! No line types in this file. isTrenchFeature falls back to the");
  console.log("   layer and the name, so a service trench may be read as a cable.");
  console.log("   That affects only the wording, not whether it is deleted.\n");
}

const seeds = features.filter((f) => f.Feature_Role === "plot");
console.log(`${seeds.length} plot seed(s) on the drawing.`);
if (!seeds.length) {
  console.log("!! Nothing has Feature_Role === \"plot\". That alone would stop the");
  console.log("   cascade dead: it looks the seeds up by role before anything else.");
  console.log("   Roles present:",
    [...new Set(features.map((f) => f.Feature_Role).filter(Boolean))].join(", ") || "(none)");
  process.exit(1);
}

const seed = seedArg
  ? seeds.find((s) => String(s.Feature_ID) === String(seedArg))
  : seeds[0];

if (!seed) {
  console.log(`!! No seed with Feature_ID ${seedArg}. Ids present:`,
    seeds.slice(0, 20).map((s) => s.Feature_ID).join(", "));
  process.exit(1);
}

console.log(`\nSeed ${seed.Feature_ID}`
  + `${seed.Label ? ` (${seed.Label})` : ""}`
  + ` — Plot_ID ${seed.Plot_ID ?? "(none)"}`
  + `, at ${JSON.stringify((seed.Geometry || [])[0] ?? null)}\n`);

const result = seedCascade([seed.Feature_ID], features, lineTypes);
console.log(`Cascade found ${result.all.length}: ${result.summary || "(nothing)"}\n`);

if (result.all.length) {
  for (const f of result.all) {
    console.log(`   takes ${f.Feature_ID} ${servicePartOf(f, lineTypes)}`
      + ` ${f.Attributes?.Line_Type || f.Feature_Role || ""}`);
  }
  console.log("\nThe rule works on this drawing. If the app still leaves them,");
  console.log("the build being served is older than this code.");
  process.exit(0);
}

/* Nothing found. Say what was considered and why each was refused. */
console.log("Nothing matched. Looking at what was on offer:\n");

const candidates = features.filter((f) => servicePartOf(f, lineTypes, true));
console.log(`${candidates.length} feature(s) look like part of some service.`);

const stamped = candidates.filter((f) => {
  const s = f.Attributes?.Seed_Feature_ID;
  return s != null && s !== "";
});
console.log(`   ${stamped.length} carry a Seed_Feature_ID`);
console.log(`   ${candidates.filter((f) => f.Plot_ID != null).length} carry a Plot_ID`);

const mine = candidates.filter((f) => belongsToSeed(f, seed));
console.log(`   ${mine.length} link to THIS seed\n`);

if (stamped.length) {
  const ids = [...new Set(stamped.map((f) => Number(f.Attributes.Seed_Feature_ID)))];
  console.log(`Stamps point at seed ids: ${ids.slice(0, 12).join(", ")}`);
  const live = new Set(seeds.map((s) => Number(s.Feature_ID)));
  const dangling = ids.filter((x) => !live.has(x));
  if (dangling.length) {
    console.log(`!! ${dangling.length} of those seed ids no longer exist:`
      + ` ${dangling.slice(0, 12).join(", ")}`);
    console.log("   That is service left over from seeds deleted earlier —");
    console.log("   orphans this rule cannot reach, because the seed they name");
    console.log("   has already gone. They need clearing separately.");
  }
  console.log("");
}

/* Distances, which is what the positional fallback turns on. */
const p0 = (seed.Geometry || [])[0];
if (p0) {
  const d = (q) => (q ? Math.hypot(q[0] - p0[0], q[1] - p0[1]) : Infinity);
  const meters = candidates.filter((f) => f.Feature_Role === "meter")
    .map((f) => ({ f, m: d((f.Geometry || [])[0]) }))
    .sort((a, b) => a.m - b.m)
    .slice(0, 6);

  console.log(`Nearest meters to the seed (reach is ${METER_REACH_M} m):`);
  for (const { f, m } of meters) {
    console.log(`   ${m.toFixed(2)} m  id ${f.Feature_ID}`
      + `  Plot_ID ${f.Plot_ID ?? "-"}`
      + `  stamp ${f.Attributes?.Seed_Feature_ID ?? "-"}`
      + (m > METER_REACH_M ? "   << beyond reach" : ""));
  }
  if (meters.length && meters[0].m > METER_REACH_M) {
    console.log(`\n!! The closest meter is ${meters[0].m.toFixed(2)} m away.`);
    console.log("   If the drawing is not in metres — a survey imported in feet,");
    console.log("   or in a projected grid — every distance here is wrong and the");
    console.log("   positional fallback cannot work. Tell me the number and I");
    console.log("   will scale the tolerances, or key off something else.");
  }
  console.log("");
}

console.log(`Joint tolerance is ${JOINT_NEAR_M} m from a cable end.`);
console.log("\nSend this output and I can say which of these it is.");
process.exit(1);
