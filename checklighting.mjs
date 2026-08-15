/* Columns and lanterns.

   A street lighting design is two objects. They are bought, installed
   and replaced separately — a lantern is changed on a column that stays
   where it is — so they are two features and two rows on the bill.

   The rule between them is one-directional and this file is mostly
   about it: a lantern must have a column, a column need not have a
   lantern, and the lantern sits on top rather than being connected to
   it. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const filesUnder = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
};

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const sql = readFileSync("./supabase/migrations/0165_lanterns.sql", "utf8");
const lighting = readFileSync("./src/features/gis/lightingView.js", "utf8");

// 1. The role exists in the database.
//
//    Feature_Role is constrained, so a lantern written without this
//    fails on insert rather than appearing and behaving oddly.
{
  const check = sql.match(/CHECK \("Feature_Role" IN\s*\(([^)]*)\)/s);
  if (!check) fail("the migration does not restate the role constraint");
  else {
    /* Every role the application writes, read out of the source rather
       than listed here.

       The constraint is restated in full each time a role is added, so
       each migration carries a copy of every role before it — and the
       copy is only as good as the one it was taken from. This one was
       taken from 0105, which predates servicevalve and pumping, and
       dropping them failed the ALTER against rows that had been legal
       for months.

       Reading the roles from the code is what makes that a test rather
       than a second list to keep in step. */
    const src = ["src", "netlify"].flatMap((d) => filesUnder(d));
    const used = new Set(["shape"]);
    for (const f of src) {
      const t = readFileSync(f, "utf8");
      for (const m of t.matchAll(/Feature_Role:\s*"([a-z]+)"/g)) used.add(m[1]);
      for (const m of t.matchAll(/Feature_Role === "([a-z]+)"/g)) used.add(m[1]);
    }
    for (const role of [...used].sort()) {
      if (!check[1].includes(`'${role}'`)) {
        fail(`${role} is written by the app but missing from the role constraint`);
      }
    }
    if (!check[1].includes("'lantern'")) fail("lantern is missing from the role constraint");
  }
  /* And a symbol of its own. A lantern is drawn at its column's point,
     so one taking the column's circle would be invisible under it. */
  if (!/'lantern'/.test(sql) || !/GIS_Style/.test(sql)) {
    fail("the lantern has no symbol of its own");
  }
}

// 2. A lantern is placed onto a column, and cannot be placed anywhere
//    else.
//
//    The click that says which column is the click that places it, so
//    there is no way to make an orphan and no field to forget.
{
  const fn = canvas.slice(canvas.indexOf("async function placeLantern"));
  const body = fn.slice(0, fn.indexOf("\n  async function"));

  if (!/Column_Feature_ID: Number\(column\.Feature_ID\)/.test(body)) {
    fail("a lantern is not linked to the column it was placed on");
  }
  /* The column's point, not the click's. One thing on the ground has
     one position. */
  if (!/const at = \(column\.Geometry \|\| \[\]\)\[0\]/.test(body)
    || !/Geometry: \[at\]/.test(body)) {
    fail("a lantern does not take its column's position");
  }
  /* Deliberately not the network graph. A lantern on a column is not an
     electrical junction, and putting it in Connects would send the
     circuit trace up the column and back down. */
  if (/Connects/.test(body)) {
    fail("a lantern writes into Connects, which is the network graph");
  }

  /* The click handler refuses anything that is not a column. */
  const click = canvas.slice(canvas.indexOf("if (lightingPlace) {"));
  const branch = click.slice(0, click.indexOf("if (meterCatchUp"));
  if (!/hit\?\.Feature_Role === "column"/.test(branch)) {
    fail("a lantern can be placed on something that is not a column");
  }
  if (!/Click a lighting column/.test(branch)) {
    fail("clicking the wrong thing in lantern mode says nothing");
  }
}

// 3. A column is placed where it is clicked.
//
//    placeNode puts a thing in the middle of the view, which is right
//    for one substation and wrong for a hundred columns.
{
  const fn = canvas.slice(canvas.indexOf("async function placeLightingColumn"));
  const body = fn.slice(0, fn.indexOf("\n  async function"));
  if (!/Geometry: \[point\]/.test(body)) fail("a column is not placed where it is clicked");
  if (!/Feature_Role: "column"/.test(body)) fail("a column is not written as a column");
  if (!/Layer_Key: "lighting"/.test(body)) fail("a column is not on the lighting layer");

  /* Something to record against each, left blank. A height nobody
     entered is not 6m, and a drawing that invents one is worse than one
     admitting it does not know. */
  for (const attr of ["Height_m", "Material", "Column_Ref"]) {
    if (!body.includes(attr)) fail(`a column has nowhere to record ${attr}`);
  }
  if (/Height_m: [0-9]/.test(body)) fail("a column's height is guessed rather than left blank");
}

// 4. Deleting a column takes its lanterns.
//
//    The one place the rule is easiest to break: they sit at the same
//    point, so an orphaned lantern looks exactly like the column that is
//    no longer there.
{
  const fn = canvas.slice(canvas.indexOf("async function removeSelected"));
  const body = fn.slice(0, fn.indexOf("\n  // keyboard"));

  if (!/Feature_Role === "lantern"/.test(body) || !/goneColumns/.test(body)) {
    fail("deleting a column leaves its lanterns behind");
  }
  /* Said out loud. Taking something the person did not select is worth
     a sentence, even when it is the only sensible thing to do. */
  if (!/window\.confirm/.test(body) || !/lantern\(s\) sit on the column/.test(body)) {
    fail("lanterns are deleted with their column without saying so");
  }
  /* And the extra ids actually reach the delete, rather than only the
     selection. */
  if (!/deleteFeatures\(projectId, ids\)/.test(body)) {
    fail("the orphaned lanterns are named but not deleted");
  }
  /* The undo record covers them too, or they cannot come back. */
  if (!/const rows = features\.filter\((\(f\)) => ids\.includes/.test(body)) {
    fail("the undo record does not cover the lanterns taken with the column");
  }
}

// 5. Both show on the street lighting drawing.
//
//    They are on the lighting layer, which that view keeps whole — but
//    it is the drawing they exist for, so it is worth pinning.
{
  if (!/f\?\.Layer_Key === "lighting"\) return true/.test(lighting)) {
    fail("the lighting drawing no longer keeps its own layer");
  }
}

// 6. The modes cannot both be on, and Escape leaves them.
{
  if (!/const \[lightingPlace, setLightingPlace\] = useState\(null\)/.test(canvas)) {
    fail("column and lantern placement are not one mode");
  }
  /* Entering either clears the meter mode, or a click would do whichever
     was checked first. */
  const menu = canvas.slice(canvas.indexOf('label="Street Lighting"'));
  const head = menu.slice(0, menu.indexOf('<MenuGroup label="Show or Hide" />'));
  if ((head.match(/setMeterCatchUp\(null\)/g) || []).length < 2) {
    fail("entering a lighting mode does not clear the meter mode");
  }
  if (!/e\.key === "Escape" && lightingPlace/.test(canvas)) {
    fail("Escape does not leave the lighting placement mode");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Columns and lanterns behave (a lantern has a column, takes its point, "
    + "and goes with it).");
process.exit(bad ? 1 : 0);
