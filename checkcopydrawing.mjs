/* A copied project gets its own drawing.

   Create Option and Create Revision copied the project and its plots
   as new rows and left the drawing behind. A carried-forward design
   opened on a blank canvas, and `Carried_Forward` was set by the
   revision flow and read by nothing.

   ── Why a copy is not INSERT ... SELECT ──

   A drawing refers to itself: cables to their joints, meters to
   their seeds and their plots, everything to its box and its origin.
   On one real drawing that is five kinds of attribute across a few
   hundred features, plus a Plot_ID column on 249 of them. Copied as
   they stand, every one of those ids still names the SOURCE, and the
   new drawing is a set of lines that do not know each other.

   The SQL cannot be run here. What can be held is the shape of it
   \u2014 that it refuses to merge, maps plots by number, rewrites the
   references by the rule the drawing actually uses, and copies every
   basemap column the app reads \u2014 and that both endpoints call it. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

let sql = "";
try { sql = readFileSync("./supabase/migrations/0232_copy_project_drawing.sql", "utf8"); }
catch { /* reported below */ }
const body = sql.replace(/--[^\n]*/g, "");

// 1. The function exists and refuses to merge.
{
  if (!sql) fail("0232 is missing, so a copied project still has no drawing");
  else {
    if (!/CREATE OR REPLACE FUNCTION copy_project_drawing\(p_from bigint, p_to bigint\)/.test(body)) {
      fail("copy_project_drawing is not declared with (from, to)");
    }
    /* A copy onto a drawing somebody has started is a merge, and
       this is not one. Silently adding to it would double every
       feature already there. */
    if (!/RAISE EXCEPTION 'copy_project_drawing: project % already has % feature\(s\)/.test(body)) {
      fail("the copy does not refuse a destination that already has features");
    }
    if (!/p_from = p_to/.test(body)) {
      fail("a project can be copied onto itself");
    }
  }
}

// 2. Plots are matched by number, and a missing one gives null.
{
  if (sql) {
    if (!/n\."Plot_Number" = o\."Plot_Number"/.test(body)) {
      fail("plots are not matched on Plot_Number, which is what the option "
        + "and revision copies preserve");
    }
    /* LEFT JOIN, so a plot the destination does not have leaves the
       feature with no Plot_ID rather than the source's. */
    if (!/LEFT JOIN plot_map pm ON pm\.old_id = f\."Plot_ID"/.test(body)) {
      fail("a feature whose plot was not copied keeps the source project's "
        + "Plot_ID, which is a meter on somebody else's plot");
    }
  }
}

// 3. Every reference the drawing carries is rewritten.
{
  if (sql) {
    /* By the rule the drawing uses \u2014 keys ending in _ID and the two
       list keys \u2014 not by a fixed list of names, so a referencing
       attribute added later is caught. */
    if (!/e\.key LIKE '%\\_ID'/.test(body)) {
      fail("scalar references are matched by a fixed list rather than by "
        + "the _ID rule, so the next referencing attribute is missed");
    }
    if (!/e\.key IN \('Connects', 'Joint_Cables'\)/.test(body)) {
      fail("Connects and Joint_Cables are not rewritten \u2014 those are the two "
        + "lists, 346 references on one drawing");
    }
    /* Only an id that IS a feature of the source is rewritten. An id
       pointing outside the drawing \u2014 NRS_ID, Cable_Size_ID \u2014 must pass
       through, or a copied meter's cable size becomes a feature id. */
    if (!/EXISTS \(SELECT 1 FROM feature_map m WHERE m\.old_id = \(e\.value #>> '\{\}'\)::bigint\)/.test(body)) {
      fail("a scalar is rewritten without checking it names a feature of the "
        + "source, so Cable_Size_ID and NRS_ID are corrupted");
    }
    /* Old to new by insertion order against ORDER BY Feature_ID:
       the only pairing available when RETURNING gives back new ids
       alone. Both sides must be ordered the same way. */
    if (!/ORDER BY f\."Feature_ID"/.test(body) || !/row_number\(\) OVER \(ORDER BY "Feature_ID"\)/.test(body)) {
      fail("old and new ids are paired by position but not both ordered by "
        + "Feature_ID, so the map is scrambled");
    }
  }
}

// 4. The basemap comes across, every column the app reads.
{
  if (sql) {
    const app = readFileSync("./netlify/functions/gis-basemap.js", "utf8");
    const cols = (app.match(/const B = \[([\s\S]*?)\]/) || ["", ""])[1]
      .match(/"([A-Za-z_]+)"/g).map((x) => x.replace(/"/g, ""))
      .filter((c) => c !== "Basemap_ID" && c !== "Project_ID");
    for (const c of cols) {
      if (!new RegExp(`"${c}"`).test(body)) {
        fail(`the basemap copy leaves out ${c}, which gis-basemap.js reads \u2014 the `
          + "copied drawing's backdrop would be uncalibrated");
      }
    }
    if (!/AND NOT EXISTS \(SELECT 1 FROM "GIS_Basemap" WHERE "Project_ID" = p_to\)/.test(body)) {
      fail("a destination that already has a basemap gets a second row");
    }
  }
}

// 5. Both routes call it.
{
  const opt = readFileSync("./netlify/functions/project-options.js", "utf8");
  const rev = readFileSync("./netlify/functions/project-revision.js", "utf8");

  if (!/rpc\("copy_project_drawing"/.test(opt)) {
    fail("Create Option does not copy the drawing");
  }
  /* The live database's own p_copy_gis flag is of unknown body \u2014 its
     migration is not in the folder \u2014 so it stays off. Two copies
     would be a doubled drawing. */
  if (!/p_copy_gis: false/.test(opt)) {
    fail("Create Option passes p_copy_gis, whose body nobody has read, and "
      + "may copy the drawing twice");
  }
  if (!/copy_gis = true/.test(opt)) {
    fail("an option copies its drawing only when asked \u2014 the option "
      + "without one is the surprising case now");
  }

  if (!/rpc\("copy_project_drawing"/.test(rev)) {
    fail("Create Revision does not copy the drawing for a carried-forward "
      + "design \u2014 Carried_Forward is still a promise the copy does not keep");
  }
  /* Carried designs only, and only with plots: a redraw that starts
     from the old drawing is not a redraw, and a drawing whose meters
     have no plots to point at is half a drawing. */
  if (!/carry_scope_ids\.length > 0 && copy_plots !== false/.test(rev)) {
    fail("the revision copies the drawing regardless of whether any design "
      + "is carried forward or the plots came across");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A copied project gets its own drawing, every id remapped.");
process.exit(bad ? 1 : 0);
