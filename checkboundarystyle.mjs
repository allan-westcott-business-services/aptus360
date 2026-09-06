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
import { readFileSync, readdirSync } from "node:fs";
import { resolveStyle, appearance } from "./src/lib/gisStyle.js";

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
  /* `vs` inside the draw body: the same number, named so the routine
     can be given a different one when it draws a sheet of paper rather
     than the screen. */
  if (!/vs > boundaryStyle\.minScale/.test(canvas)) {
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
  /* Read from the newest migration that states the constraint, not a
     named one: 0165 stated it, 0168 restated it, and a check pinned to
     the older file would compare the screen against a list that is no
     longer in force. */
  const latest = readdirSync("./supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(`./supabase/migrations/${f}`, "utf8")
      .includes('CHECK ("Feature_Role" IN'))
    .sort()
    .at(-1);
  if (!latest) fail("no migration states the role constraint");
  const constraintSql = readFileSync(`./supabase/migrations/${latest}`, "utf8");
  const check = constraintSql.match(/CHECK \("Feature_Role" IN\s*\(([^)]*)\)/s);
  if (!check) fail("cannot read the role constraint to compare against");
  else {
    for (const m of check[1].matchAll(/'([a-z]+)'/g)) {
      if (!new RegExp(`\\["${m[1]}",`).test(list)) {
        fail(`${m[1]} can be drawn but not styled — missing from the GIS Styles list`);
      }
    }
  }
}

// 9. Given a span node's settings, it behaves like a span node.
//
//    Symbol_Size_Px is one of five fields the sizing uses, and it is the
//    one that applies only when Draw to scale is off. With it on, the
//    size is Symbol_Size_M times the zoom, held between Min_Symbol_Px
//    and Max_Symbol_Px.
//
//    Reading Symbol_Size_Px straight off the row ignored four of them,
//    so a boundary point set up exactly like a span node stayed one
//    fixed size at every zoom. appearance is the function that knows all
//    five, and using it is what makes the two agree.
{
  const settings = {
    Scale_Symbol: true, Symbol_Size_M: 1.5,
    Min_Symbol_Px: 3, Max_Symbol_Px: 20, Symbol_Size_Px: 16,
  };
  const node = { GIS_Style_ID: 1, Feature_Role: "spannode", ...settings };
  const point = {
    GIS_Style_ID: 2, Layer_Key: "plot", Feature_Role: "boundary", ...settings,
  };

  for (const scale of [0.5, 1, 3, 6, 12, 20, 40]) {
    const a = appearance(resolveStyle({ Feature_Role: "spannode" }, [node]),
      scale, { symbolPx: 6 });
    const b = appearance(
      resolveStyle({ Layer_Key: "plot", Feature_Role: "boundary" }, [point]),
      scale, { symbolPx: 9 });
    if (Number(a.symbolPx) !== Number(b.symbolPx)) {
      fail(`at zoom ${scale} a span node is ${a.symbolPx}px `
        + `and a boundary point on the same settings is ${b.symbolPx}px`);
    }
  }

  /* The clamps do their work at the ends, or the comparison above would
     pass on a size that never changes. */
  const small = appearance(
    resolveStyle({ Layer_Key: "plot", Feature_Role: "boundary" }, [point]),
    0.5, { symbolPx: 9 });
  const large = appearance(
    resolveStyle({ Layer_Key: "plot", Feature_Role: "boundary" }, [point]),
    40, { symbolPx: 9 });
  if (Number(small.symbolPx) !== 3) fail(`the lower clamp gave ${small.symbolPx}px, wanted 3`);
  if (Number(large.symbolPx) !== 20) fail(`the upper clamp gave ${large.symbolPx}px, wanted 20`);

  /* And the canvas goes through appearance rather than reading the field
     itself, which is the whole of the fix. */
  if (!/const look = appearance\(resolved, view\.scale/.test(canvas)) {
    fail("the boundary point is not sized through appearance");
  }
  if (/radiusPx: Number\(resolved\.Symbol_Size_Px\)/.test(canvas)) {
    fail("the boundary point still reads Symbol_Size_Px directly");
  }
  /* Re-resolved as the zoom changes, or a scaled symbol would size
     itself once and stay there. */
  if (!/\[styles, standard, view\.scale\]/.test(canvas)) {
    fail("the boundary point does not re-size when the zoom changes");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The boundary point is styled (size, zoom, ink and off, and it touches "
    + "nothing else).");
process.exit(bad ? 1 : 0);
