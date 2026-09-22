/* What the bill of materials counts, and what it does not.

   A bill is read by people ordering against it. Three kinds of point on
   these drawings are not things anybody orders:

     - a **plot seed** says where a plot is (excluded by 0058);
     - a **span node** is a numbered point on the dig that measurements
       are taken from (0075);
     - a **feeder end point** is where the build breaks a run — the
       origin, a junction, a leaf end, the place a cable count changes.
       Made and deleted by Build LV Network on every run (0204).

   And one that is not a measurement but WRITING:

     - a **text note** is words somebody put on the plan (0228),
       excluded by 0229.

   All of them say WHERE something is measured, or SAY something about
   the job, rather than naming WHAT is to be bought.

   ── The cross-section mark is counted, and that is not settled ──

   A `sectionmark` (0214) is annotation by exactly the same argument,
   on the same annotation layer, and it IS on the bill — every project
   where somebody placed one reads "Sectionmark 2 no." beside the
   ducting.

   Not asserted here, because taking it off changes bills that have
   already been issued: rows disappear and totals drop. That is a
   decision for whoever owns the commercial side, and a check is the
   wrong place to make one on their behalf — a case that fails until
   somebody does what it wants is a case that gets the migration
   written to silence it. Recorded instead, so nobody has to rediscover
   it, and 0229's own head carries the one-line change and the query
   for seeing what it would affect. Everything physical stays: a link box is a chamber with fuses
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

/* The definition the database would have if the folder were replayed.
   Hoisted so every case below reads the same one \u2014 working it out
   twice is two chances to read a different migration. */
const newest = defining[defining.length - 1];
const sql = newest ? readFileSync(`${dir}/${newest}`, "utf8") : "";

if (!defining.length) fail("no migration defines gis_bom");
else {

  /* The exclusion list, as the newest definition has it. */
  /* The clause, not the comment above it explaining why NULL NOT IN
     (...) is NULL — which is the first `NOT IN (` in the file and
     captured "..." as the list of roles. */
  const m = sql.match(/"Feature_Role" NOT IN \(([^)]*)\)/);
  if (!m) fail(`${newest} defines gis_bom with no role exclusions at all`);
  else {
    const roles = m[1].split(",").map((x) => x.trim().replace(/'/g, ""));
    /* `nrs` joined them: a non-residential supply is a record of a
       connection somebody asked for, and it read "Nrs" on the sheet —
       initcap on an acronym, naming a line item nobody would
       recognise. */
    /* `textnote` joined them at 0229: a note is words on a drawing, and
       nobody orders words. `sectionmark` is the same kind of thing and
       is deliberately NOT here — see the head of this file. */
    for (const role of ["plot", "spannode", "feederpoint", "nrs",
      "textnote"]) {
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

/* ── Named the way the trade names them ──

   The point items are named from a list rather than from initcap,
   because there is no rule that turns 'poc' into "POC" and
   'servicevalve' into "Service Valve": those are facts about the trade,
   not about the string. initcap is the fallback, so a role added later
   reads as something rather than blank.

   The trouble with a fallback that works is that nobody notices it.
   'hdcutout' fell through and the bill said "Hdcutout" — the role key
   wearing a capital letter, and not the name of anything. Reported
   from a real bill.

   So every role that reaches the bill is checked against the list.
   A role naming itself acceptably through initcap is fine; one whose
   real name is an acronym or two words is not, and this says which. */
{
  const named = (role) => new RegExp(`WHEN '${role}'\\s*THEN`).test(sql);

  /* The ones whose names initcap cannot reach. An acronym or a
     two-word name has to be written down. */
  for (const [role, want] of [
    ["hdcutout", "HDCO"],
    ["msdb", "MSDB"],
    ["poc", "POC"],
    ["servicevalve", "Service Valve"],
    ["linkbox", "Link Box"],
    ["column", "Lighting Column"],
    ["governor", "Gas Governor"],
  ]) {
    if (!named(role)) {
      fail(`the bill has no name for '${role}', so initcap gives it one \u2014 `
        + `it should read "${want}"`);
      continue;
    }
    if (!new RegExp(`WHEN '${role}'\\s*THEN '${want}'`).test(sql)) {
      fail(`'${role}' is named on the bill, but not as "${want}"`);
    }
  }

  /* And the fallback is still there, so a role added tomorrow reads as
     something rather than as a blank cell. */
  if (!/ELSE initcap\(/.test(sql)) {
    fail("the fallback name has gone, so a role nobody has listed yet would "
      + "come out blank on the bill");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The bill counts what is bought (markers left off, plant kept on).");
process.exit(bad ? 1 : 0);
