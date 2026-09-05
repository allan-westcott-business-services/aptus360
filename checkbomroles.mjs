/* What the bill of materials counts, and what it does not.

   A bill is read by people ordering against it. Three kinds of point on
   these drawings are not things anybody orders:

     - a **plot seed** says where a plot is (excluded by 0058);
     - a **span node** is a numbered point on the dig that measurements
       are taken from (0075);
     - a **feeder end point** is where the build breaks a run — the
       origin, a junction, a leaf end, the place a cable count changes.
       Made and deleted by Build LV Network on every run (0204).

   All three say WHERE something is measured rather than WHAT is to be
   bought. Everything physical stays: a link box is a chamber with fuses
   in it and is counted, even when it stands exactly where a feeder end
   point would be, because it is a `linkbox` and not a `feederpoint`.

   `gis_bom` is one SQL function, so changing any of it means replacing
   the whole of it. This check reads the newest definition in the
   migrations folder — the one the database would have if the folder
   were replayed — rather than any particular file, so it keeps working
   when the next rewrite lands. */
import { readFileSync, readdirSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const dir = "./supabase/migrations";
const defining = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => readFileSync(`${dir}/${f}`, "utf8")
    .includes("CREATE OR REPLACE FUNCTION gis_bom"))
  .sort();

if (!defining.length) fail("no migration defines gis_bom");
else {
  const newest = defining[defining.length - 1];
  const sql = readFileSync(`${dir}/${newest}`, "utf8");

  /* The exclusion list, as the newest definition has it. */
  /* The clause, not the comment above it explaining why NULL NOT IN
     (...) is NULL — which is the first `NOT IN (` in the file and
     captured "..." as the list of roles. */
  const m = sql.match(/"Feature_Role" NOT IN \(([^)]*)\)/);
  if (!m) fail(`${newest} defines gis_bom with no role exclusions at all`);
  else {
    const roles = m[1].split(",").map((x) => x.trim().replace(/'/g, ""));
    for (const role of ["plot", "spannode", "feederpoint"]) {
      if (!roles.includes(role)) {
        fail(`${newest} counts ${role}s on the bill \u2014 nobody orders one`);
      }
    }
    /* And nothing physical has been swept in with them. A link box
       standing where a feeder point would be is still a chamber. */
    for (const role of ["linkbox", "joint", "meter", "poc", "substation", "column"]) {
      if (roles.includes(role)) {
        fail(`${newest} excludes ${role}s from the bill \u2014 those are bought`);
      }
    }
  }

  /* The null guard, which cost a whole class of joints once: NULL NOT IN
     (...) is NULL, not true, so every point with no role vanished. */
  if (!/"Feature_Role" IS NULL\s*\n\s*OR "Feature_Role" NOT IN/.test(sql)
    && !/f\."Feature_Role" IS NULL\s*\n\s*OR f\."Feature_Role" NOT IN/.test(sql)) {
    fail(`${newest} drops every point with no role \u2014 NULL NOT IN (...) is `
      + "NULL, which is not true, and the older joints have no role");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The bill counts what is bought (markers left off, plant kept on).");
process.exit(bad ? 1 : 0);
