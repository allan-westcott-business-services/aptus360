/* The property boundary point, styled.

   Its size, the zoom it appears at, its colour and whether it is drawn
   at all were four numbers written into the canvas. They are now a row
   on GIS_Style, edited on the GIS Styles screen with every other
   symbol.

   The awkward part is that it is not a feature: it is Boundary_At, an
   attribute of the plot seed, painted in a pass of its own. So there is
   nothing for the cascade to resolve against and a subject is presented
   for it — which is fine so long as nothing else can present the same
   one, and that is most of what is checked here. */
import { readFileSync } from "node:fs";
import { resolveStyle } from "./src/lib/gisStyle.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const sql = readFileSync(
  "./supabase/migrations/0166_boundary_point_style.sql", "utf8");

/* The row as the migration seeds it. */
const SEEDED = {
  GIS_Style_ID: 1,
  Layer_Key: "plot",
  Feature_Role: "boundary",
  Symbol: "circle",
  Symbol_Size_Px: 9,
  Min_Scale: 3,
  Colour: "#334155",
  Is_Active: true,
};
const SUBJECT = { Layer_Key: "plot", Feature_Role: "boundary" };
const resolve = (styles, ctx = {}) => resolveStyle(SUBJECT, styles, ctx);

// 1. Seeded at what the canvas already drew.
//
//    A migration that quietly redraws every plot on every project is not
//    one anybody would thank you for. Applying it should change nothing
//    until somebody edits the row.
{
  const r = resolve([SEEDED]);
  if (Number(r.Symbol_Size_Px) !== 9) fail(`seeded radius is ${r.Symbol_Size_Px}, was 9`);
  if (Number(r.Min_Scale) !== 3) fail(`seeded zoom is ${r.Min_Scale}, was 3`);
  if (r.Colour !== "#334155") fail(`seeded ink is ${r.Colour}, was #334155`);

  /* And the migration seeds those same numbers, rather than this file
     agreeing with itself. */
  for (const v of ["9", "3", "#334155"]) {
    if (!sql.includes(v)) fail(`the migration does not seed ${v}`);
  }
}

// 2. Editing the row changes the drawing.
{
  const r = resolve([{ ...SEEDED, Symbol_Size_Px: 14, Min_Scale: 6 }]);
  if (Number(r.Symbol_Size_Px) !== 14) fail("editing the size does not reach the drawing");
  if (Number(r.Min_Scale) !== 6) fail("editing the zoom does not reach the drawing");
}

// 3. Turning the row off turns the point off.
//
//    An inactive row resolves to nothing at all, which is the same
//    result as a database that has never had the migration. The two are
//    told apart by asking the styles directly, or an unmigrated project
//    would lose its boundary points.
{
  if (Object.keys(resolve([{ ...SEEDED, Is_Active: false }])).length) {
    fail("an inactive row still resolves");
  }
  if (!/Is_Active === false/.test(canvas)) {
    fail("the canvas cannot tell an inactive row from an absent one");
  }
  if (!/boundaryStyle\.off/.test(canvas)) {
    fail("turning the row off does not stop the point being drawn");
  }
}

// 4. Not seeded is not broken.
//
//    A project whose database has not had 0166 applied looks exactly as
//    it did.
{
  if (Object.keys(resolve([])).length) fail("an empty style list resolves to something");
  if (!/: 9;/.test(canvas) && !/\? Number\(resolved\.Symbol_Size_Px\) : 9/.test(canvas)) {
    fail("the canvas has no fallback radius");
  }
  if (!/: 3;/.test(canvas) && !/Number\(resolved\.Min_Scale\) : 3/.test(canvas)) {
    fail("the canvas has no fallback zoom");
  }
}

// 5. The row cannot touch a real feature.
//
//    This is the whole risk of styling something that is not a feature.
//    A plot seed carries the role 'plot', so the cascade sorting one
//    never reaches this row — widen the scope and every seed on every
//    drawing becomes a boundary point.
{
  const seed = { Layer_Key: "plot", Feature_Role: "plot" };
  if (Object.keys(resolveStyle(seed, [SEEDED])).length) {
    fail("the boundary row also styles the plot seed");
  }
  /* And nothing on another layer. */
  for (const f of [
    { Layer_Key: "electric", Feature_Role: "meter" },
    { Layer_Key: "lighting", Feature_Role: "column" },
    { Layer_Key: "trench", Line_Type: "trench_main" },
  ]) {
    if (Object.keys(resolveStyle(f, [SEEDED])).length) {
      fail(`the boundary row also styles ${f.Layer_Key}`);
    }
  }
  /* The scope in the migration is the narrow one. */
  if (!/"Layer_Key" = 'plot' AND "Feature_Role" = 'boundary'/.test(sql)) {
    fail("the migration does not scope the row to the boundary point");
  }
}

// 6. An operator's own standard overrides it, like every other style.
{
  const org = { ...SEEDED, GIS_Style_ID: 2, Organisation_ID: 7, Symbol_Size_Px: 20 };
  if (Number(resolve([SEEDED, org], { organisationId: 7 }).Symbol_Size_Px) !== 20) {
    fail("an operator's own size does not win when drawing to its standard");
  }
  if (Number(resolve([SEEDED, org], {}).Symbol_Size_Px) !== 9) {
    fail("an operator's size applies with no standard chosen");
  }
}

// 7. The canvas reads the row rather than its own numbers.
{
  if (!/const boundaryStyle = useMemo/.test(canvas)) {
    fail("the canvas does not resolve a style for the boundary point");
  }
  if (!/view\.scale > boundaryStyle\.minScale/.test(canvas)) {
    fail("the zoom threshold is still written into the canvas");
  }
  if (!/const r = boundaryStyle\.radiusPx/.test(canvas)) {
    fail("the radius is still written into the canvas");
  }
  if (!/ctx\.strokeStyle = boundaryStyle\.ink/.test(canvas)) {
    fail("the ink is still written into the canvas");
  }
  /* And repaints when the row is edited — a style change that needs a
     reload is a style screen nobody trusts. */
  if (!/boundaryStyle, waterColour/.test(canvas)) {
    fail("the drawing does not repaint when the style changes");
  }
}

// 8. It can be found on the GIS Styles screen.
//
//    The scope dropdown there is a fixed list, so a row whose role is
//    not in it lists but cannot be created or properly edited. That list
//    had already fallen behind the drawing three times — the service
//    valve, the pumping station and the lantern were all placeable and
//    unstylable.
{
  const admin = readFileSync("./src/features/admin/GisStylesAdmin.jsx", "utf8");
  const roles = admin.slice(admin.indexOf("const ROLES = ["));
  const list = roles.slice(0, roles.indexOf("];"));

  if (!/\["boundary", "Property boundary point"\]/.test(list)) {
    fail("the boundary point is not offered on the GIS Styles screen");
  }

  /* And every role the constraint allows, so the list cannot fall
     behind again. Read from the migration rather than written out
     twice. */
  const lanterns = readFileSync("./supabase/migrations/0165_lanterns.sql", "utf8");
  const check = lanterns.match(/CHECK \("Feature_Role" IN\s*\(([^)]*)\)/s);
  if (!check) fail("cannot read the role constraint to compare against");
  else {
    for (const m of check[1].matchAll(/'([a-z]+)'/g)) {
      if (!new RegExp(`\\["${m[1]}",`).test(list)) {
        fail(`${m[1]} can be drawn but not styled — missing from the GIS Styles list`);
      }
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The boundary point is styled (size, zoom, ink and off, and it touches "
    + "nothing else).");
process.exit(bad ? 1 : 0);
