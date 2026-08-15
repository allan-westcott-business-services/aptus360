/* The two endpoints that serve a call-off must agree on its shape.

   A call-off is read in two places: the project's own Call-offs tab
   (calloffs.js, one project) and the Call-offs page (calloffs-all.js,
   every project). They are separate functions over the same tables, and
   a field added to one and not the other produces a screen that quietly
   knows less than its neighbour.

   That happened with utility_ids. The project tab fetched them; the
   call-offs page did not, so every call-off arrived with none recorded
   and the assignment panel offered all three utilities whatever the
   call-off was actually for. Nothing failed — the page just showed a
   worse answer than the other one.

   This checks the fields that matter are read in both. It is text
   matching, not execution, so it cannot prove the values are right; it
   proves neither endpoint has quietly stopped asking. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const ONE = readFileSync("netlify/functions/calloffs.js", "utf8");
const ALL = readFileSync("netlify/functions/calloffs-all.js", "utf8");

/* What a call-off carries beyond its own columns, and how to spot each
   being read. */
const SHARED = [
  ["the utilities it covers", /Call_Off_Utility/, /utility_ids/],
  ["its trench sections", /Mains_Call_Off_Span/, /items/],
  ["its plots", /Service_Call_Off_Plot/, /items/],
];

/* Columns both endpoints must select.

   The same failure as utility_ids and caught the same way: the
   Call-offs page reads calloffs-all.js, so an estimate saved by one
   endpoint and not selected by the other is an end date that never
   defaults — with nothing failing anywhere to say why. Added when
   0159 and 0160 went in, because that is exactly what happened. */
const COLUMNS = [
  ["how long the dig takes (0159)", "Estimated_Half_Days"],
  ["what is laid along a section (0160)", "Contents"],
];

for (const [what, col] of COLUMNS) {
  for (const [name, src] of [["calloffs.js", ONE], ["calloffs-all.js", ALL]]) {
    /* Named anywhere in the select, however the string is broken up —
       both endpoints build their column lists differently. */
    if (!new RegExp(`\\b${col}\\b`).test(src)) {
      fail(`${name} does not select ${what}`);
    }
  }
}

for (const [what, fetches, attaches] of SHARED) {
  for (const [name, src] of [["calloffs.js", ONE], ["calloffs-all.js", ALL]]) {
    if (!fetches.test(src)) fail(`${name} does not fetch ${what}`);
    if (!attaches.test(src)) fail(`${name} does not attach ${what} to its rows`);
  }
}

/* And both must survive the table being absent, since a database that
   has not had every migration run should still list its call-offs. */
for (const [name, src] of [["calloffs.js", ONE], ["calloffs-all.js", ALL]]) {
  const at = src.indexOf("Call_Off_Utility");
  if (at < 0) continue;
  const around = src.slice(Math.max(0, at - 400), at + 400);
  if (!/catch|\|\| \[\]|=> \(\{ data: \[\] \}\)/.test(around)) {
    fail(`${name} does not tolerate Call_Off_Utility being absent`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Call-off endpoints agree (${SHARED.length} shared fields, `
    + `${COLUMNS.length} shared columns, both readers).`);
process.exit(bad ? 1 : 0);
