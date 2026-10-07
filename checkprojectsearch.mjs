/* The Projects list must find a project by the references it is known
   by outside this app.

   An AP number is what the network operator calls the project and a
   tender reference is what the client calls it. Both are selected by
   projects.js and both were absent from the search, so typing AP0121
   returned nothing — which reads as "no such project", not as "you
   cannot search by that".

   This asserts the haystack names them. It is deliberately a source
   check rather than a render: the filter is a useMemo inside a 900-line
   component with lookups, column filters and sort state, and standing
   all that up to test one array costs more than it proves. What can go
   wrong here is somebody rewriting the haystack and dropping a field,
   and a source check catches exactly that. */

import { readFileSync } from "node:fs";

const FILE = "src/features/projects/ProjectsList.jsx";
const src = readFileSync(FILE, "utf8");

/* Collapse whitespace first. The array spans several lines, and a
   pattern written as one line silently matches nothing against a
   wrapped one — which is how checkbommeasured.mjs passed vacuously
   this morning. */
const flat = src.replace(/\s+/g, " ");

const m = flat.match(/const hay = \[(.*?)\]\s*\.join\(" "\)\.toLowerCase\(\);/);
if (!m) {
  console.error(`FAIL  ${FILE}: could not find the search haystack.`);
  console.error("      If it was renamed or restructured, update this check —");
  console.error("      do not delete it.");
  process.exit(1);
}

const hay = m[1];
const REQUIRED = [
  ["p.AP_Number", "the AP number the network operator uses"],
  ["p.Tender_Ref", "the tender reference the client uses"],
  ["p.Project_Ref", "this app's own reference"],
  ["p.Display_Ref", "the reference shown in the list"],
  ["p.Site_Name", "the site name"],
  ["p.Postcode", "the postcode"],
];

const missing = REQUIRED.filter(([f]) => !hay.includes(f));
if (missing.length) {
  console.error(`FAIL  ${FILE}: the project search cannot match on:`);
  for (const [f, why] of missing) console.error(`        ${f} — ${why}`);
  console.error("      Searching for one of these returns no results, which");
  console.error("      looks like the project does not exist.");
  process.exit(1);
}

console.log(`ok    project search matches on ${REQUIRED.length} fields, AP_Number among them`);
