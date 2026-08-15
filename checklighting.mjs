/* Lighting columns.

   A street lighting design is columns. The lantern was briefly an object
   of its own — placed onto a column and linked back to it — and is now
   fields on the column instead.

   The argument for two objects was that a lantern is changed on a
   column that stays where it is. True, and not worth what it cost: a
   lantern sits at its column's point, is placed at the same moment and
   is read on the same row, so the second object bought an association
   to keep honest and little else.

   So much of this file is about the lantern staying gone. A removed
   object leaves a shape behind, and half-removing one — a role nothing
   can place, a style nothing wears, a menu item that does nothing — is
   worse than either keeping it or being rid of it. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const sql = readFileSync(
  "./supabase/migrations/0168_lantern_fields_on_column.sql", "utf8");
const admin = readFileSync("./src/features/admin/GisStylesAdmin.jsx", "utf8");

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

// 1. A column is placed where it is clicked.
//
//    placeNode puts a thing in the middle of the view, which is right
//    for one substation and wrong for a hundred columns.
{
  const at = canvas.indexOf("async function placeLightingColumn");
  if (at < 0) fail("nothing places a lighting column");
  else {
    const body = canvas.slice(at, canvas.indexOf("\n  async function", at + 10));
    if (!/Geometry: \[point\]/.test(body)) fail("a column is not placed where it is clicked");
    if (!/Feature_Role: "column"/.test(body)) fail("a column is not written as a column");
    if (!/Layer_Key: "lighting"/.test(body)) fail("a column is not on the lighting layer");

    /* The column's own fields, and the lantern's, on one object. */
    for (const attr of ["Column_Ref", "Height_m", "Material", "Bracket_Length_m",
      "Lantern_Type", "Wattage_W", "Mounting"]) {
      if (!body.includes(attr)) fail(`a column has nowhere to record ${attr}`);
    }
    /* Blank, not guessed. A height nobody entered is not 6m, and a
       drawing that invents one is worse than one admitting it does not
       know. */
    if (/(Height_m|Wattage_W): [0-9]/.test(body)) {
      fail("a column's measurements are guessed rather than left blank");
    }
  }
}

// 2. The lantern is gone from the drawing.
{
  /* Comments explaining why the lantern went are fine, and worth
     keeping — so they are stripped before the scan rather than filtered
     out line by line. Filtering by line missed the middle of a block
     comment, whose lines start with ordinary text, and the check went
     red over its own explanation. */
  const code = canvas
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const live = code.split("\n")
    .filter((l) => /lantern/i.test(l))
    .filter((l) => !/Lantern_Type/.test(l));
  if (live.length) {
    fail(`the canvas still does something with lanterns: ${live[0].trim().slice(0, 60)}`);
  }
  if (/placeLantern/.test(code)) fail("the lantern placer is still there");
  if (/Column_Feature_ID/.test(code)) fail("the lantern's link to its column survives");
  if (/role:lantern/.test(code)) fail("the Layers menu still lists lanterns");
  if (/lantern/i.test(admin)) fail("the GIS Styles screen still offers a lantern");
}

// 3. And gone from the database.
{
  if (!/DELETE FROM "GIS_Feature" WHERE "Feature_Role" = 'lantern'/.test(sql)) {
    fail("existing lanterns are left on the drawing");
  }
  if (!/DELETE FROM "GIS_Style" WHERE "Feature_Role" = 'lantern'/.test(sql)) {
    fail("the lantern style row is left behind");
  }
  /* Deleted before the constraint is restated, or the ALTER refuses a
     role that rows still carry. */
  const del = sql.indexOf('DELETE FROM "GIS_Feature"');
  const alter = sql.indexOf("ADD CONSTRAINT");
  if (del < 0 || alter < 0 || del > alter) {
    fail("the constraint is restated before the lanterns are deleted");
  }
}

// 4. The role constraint still allows everything the app writes.
//
//    Restated in full each time a role changes, so each migration
//    carries a copy of every role before it — and the copy is only as
//    good as the one it was taken from. 0165 took its list from 0105 and
//    dropped servicevalve and pumping, which had been writing rows for
//    months.
{
  const latest = readdirSync("./supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join("./supabase/migrations", f), "utf8")
      .includes('CHECK ("Feature_Role" IN'))
    .sort()
    .at(-1);
  const check = readFileSync(join("./supabase/migrations", latest), "utf8")
    .match(/CHECK \("Feature_Role" IN\s*\(([^)]*)\)/s);

  if (!check) fail("the newest migration does not state the role constraint");
  else {
    /* Read from the source: every role written onto a feature. Scanning
       every mention would be too broad — the boundary point presents a
       style subject shaped like a feature and writes nothing. */
    const used = new Set(["shape"]);
    for (const f of ["src", "netlify"].flatMap(filesUnder)) {
      const t = readFileSync(f, "utf8");
      for (const m of t.matchAll(/createFeature\(/g)) {
        const open = t.indexOf("{", m.index);
        if (open < 0) continue;
        let depth = 0;
        let end = open;
        for (let i = open; i < t.length; i++) {
          if (t[i] === "{") depth += 1;
          else if (t[i] === "}") { depth -= 1; if (!depth) { end = i; break; } }
        }
        for (const r of t.slice(open, end + 1).matchAll(/Feature_Role:\s*"([a-z]+)"/g)) {
          used.add(r[1]);
        }
      }
    }
    if (used.size < 5) {
      fail(`only ${used.size} role(s) found in the source — the scan is broken`);
    }
    for (const role of [...used].sort()) {
      if (!check[1].includes(`'${role}'`)) {
        fail(`${role} is written by the app but missing from the role constraint`);
      }
    }
    /* The two that 0165 restored are still in it. */
    for (const role of ["servicevalve", "pumping"]) {
      if (!check[1].includes(`'${role}'`)) fail(`${role} was dropped again`);
    }
    if (check[1].includes("'lantern'")) fail("the lantern role is still allowed");
  }
}

// 5. A column connects to a feeder by a service cable and a joint.
//
//    Two features, because there are two things: a cable in the ground
//    and a joint on the main. Both are ordered, both are installed, and
//    both belong on the bill — the joint is not a property of the cable
//    any more than a tee is a property of a pipe.
{
  const at = canvas.indexOf("async function connectColumnToFeeder");
  if (at < 0) fail("nothing connects a column to a feeder");
  else {
    const body = canvas.slice(at, canvas.indexOf("\n  async function", at + 10));

    /* The joint, on the electric layer where the feeder is. */
    if (!/Feature_Role: "joint"/.test(body)) fail("no joint is made on the feeder");
    if (!/Joint_Type: "service"/.test(body)) fail("the joint is not a service joint");
    if (!/Layer_Key: "electric"/.test(body)) {
      fail("the joint is not on the electric layer");
    }
    /* Marked as the lighting one, so a bill can be split by who pays. */
    if (!/For_Lighting: true/.test(body)) {
      fail("the joint cannot be told from a house service joint");
    }

    /* The cable, on the lighting layer, as a lighting service. */
    if (!/Line_Type: "light_service"/.test(body)) {
      fail("the connection is not drawn as a lighting service");
    }
    if (!/Layer_Key: "lighting"/.test(body)) {
      fail("the service cable is not on the lighting layer");
    }

    /* From the tee to the column, and the tee is a perpendicular drop
       rather than wherever the second click landed. */
    if (!/nearestOnPolyline\(at, g\)/.test(body)) {
      fail("the tee is not the nearest point on the feeder");
    }
    if (!/Geometry: \[foot\.q, at\]/.test(body)) {
      fail("the service does not run from the tee to the column");
    }

    /* The joint before the cable. A cable running to a main it is not
       jointed into looks finished; a joint with nothing coming off it
       is visible and can be deleted. */
    /* Compared on the creation, not on any mention: the guard above
       reads light_service to see whether one already exists, and
       matching that made this fire on correct code. */
    if (body.indexOf('Feature_Role: "joint"')
      > body.indexOf('Line_Type: "light_service"')) {
      fail("the cable is created before the joint it tees off");
    }

    /* Nothing written to say which feeder feeds the column: the service
       ends on it, and Connects is computed from geometry. A second
       record of the same fact is a second thing to keep true. */
    if (/Feeder_Feature_ID|Column_Feature_ID/.test(body)) {
      fail("the connection is recorded twice — in the geometry and in a field");
    }

    /* Not sized. A lighting service is not worked out from a load the
       way a feeder is, and a number here would be one nothing had
       calculated. */
    if (/Size: ["0-9]/.test(body)) fail("the service cable is given a guessed size");

    /* Connected twice is said, not drawn. Two services to one column
       look identical on the drawing and are a second cable somebody has
       to explain. */
    if (!/already connected/i.test(body)) {
      fail("a column can be connected twice without being told");
    }
  }

  /* It only offers itself when there is something to connect. */
  const menu = canvas.slice(canvas.indexOf('label="Street Lighting"'));
  const head = menu.slice(0, menu.indexOf('<MenuGroup label="Show or Hide" />'));
  if (!/Connect Column to Feeder/.test(head)) {
    fail("the Street Lighting menu does not offer the connection");
  }
  if (!/classCount\["role:column"\]/.test(head)) {
    fail("the connect item is offered with no columns to connect");
  }
}

// 6. The mode can be left, and does not fight the other one.
{
  if (!/const \[lightingPlace, setLightingPlace\] = useState\(null\)/.test(canvas)) {
    fail("there is no column placement mode");
  }
  if (!/e\.key === "Escape" && lightingPlace/.test(canvas)) {
    fail("Escape does not leave the column placement mode");
  }
  /* And drops a half-finished pair. A column picked but no feeder
     chosen would otherwise be waiting the next time the mode is
     entered, and connect itself to the first line clicked. */
  const esc = canvas.slice(canvas.indexOf('e.key === "Escape" && lightingPlace'));
  if (!/setConnectColumn\(null\)/.test(esc.slice(0, 200))) {
    fail("Escape leaves a column waiting for a feeder");
  }
  const menu = canvas.slice(canvas.indexOf('label="Street Lighting"'));
  const head = menu.slice(0, menu.indexOf('<MenuGroup label="Show or Hide" />'));
  if (!/setMeterCatchUp\(null\)/.test(head)) {
    fail("entering column placement does not clear the meter mode");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Lighting columns behave (placed where clicked, lantern fields on them).");
process.exit(bad ? 1 : 0);
