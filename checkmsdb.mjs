/* A block of flats is not forty-five points on a drawing.

   One cable arrives at a board in a riser cupboard, one leaves it for
   the next, and the dwellings hang off tails of a metre or two inside
   the building. Drawn as forty-five service points it is unreadable,
   unmovable, and wrong about what is actually in the ground.

   So the board is one object and the flats are a TABLE on it: the
   drawing carries what is buried, the table carries what is in the
   building. */
import { readFileSync } from "node:fs";
import {
  FLOORS, apartmentLoad, msdbLoad, apartmentLevels, worstApartment, msdbText,
  flatsFromPlots, servedFlats, isFlatType,
} from "./src/features/gis/msdb.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

const consumption = [
  { Bedrooms: 1, Heat_Source_ID: 2, Consumption_kVA: 1.5 },
  { Bedrooms: 2, Heat_Source_ID: 2, Consumption_kVA: 2.0 },
  { Bedrooms: 3, Heat_Source_ID: 2, Consumption_kVA: 2.5 },
  /* The same bedrooms on a different heat source draw differently \u2014
     which is why the lookup is on both. */
  { Bedrooms: 2, Heat_Source_ID: 5, Consumption_kVA: 6.0 },
];
const cable = { Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 };

/* ── The flats come from the Plots tab ──

   A dwelling is a plot: it has a number, a house type and a bedroom
   count recorded against it already. Asking for those again on the
   board would be a second place to say one thing, with no way to tell
   which was right when they disagreed. The board holds only what the
   Plots tab cannot know: which flats hang off THIS board, and how far
   each is from it. */
const propertyTypes = [
  { Property_Type_ID: 1, Property_Type: "Detached" },
  { Property_Type_ID: 2, Property_Type: "Flat" },
];
const configs = [
  { Property_Config_ID: 10, Bedrooms: 4, Property_Type_ID: 1 },
  { Property_Config_ID: 20, Bedrooms: 1, Property_Type_ID: 2 },
  { Property_Config_ID: 21, Bedrooms: 2, Property_Type_ID: 2 },
  { Property_Config_ID: 22, Bedrooms: 3, Property_Type_ID: 2 },
  { Property_Config_ID: 23, Bedrooms: 9, Property_Type_ID: 2 },
];
const plotList = [
  { plot_id: 1, plot_number: "1", Property_Config_ID: 10 },
  { plot_id: 2, plot_number: "201", Property_Config_ID: 20 },
  { plot_id: 3, plot_number: "202", Property_Config_ID: 21 },
  { plot_id: 4, plot_number: "203", Property_Config_ID: 22 },
  { plot_id: 5, plot_number: "204", Property_Config_ID: 23 },
];
const flats = flatsFromPlots({ plotList, configs, propertyTypes });

const board = (attrs = {}) => ({
  Feature_Role: "msdb", Feature_Type: "point", Layer_Key: "electric",
  Attributes: {
    MSDB_Location: "Core B riser", MSDB_Floor: "2nd", MSDB_Heat_Source_ID: 2,
    MSDB_Plot_IDs: [2, 3, 4],
    MSDB_Distances: { 2: 4, 3: 9, 4: 18 },
    ...attrs,
  },
});
const served = (b) => servedFlats(b, flats);

// 1. The load comes from the consumption table, on both keys.
{
  const l = msdbLoad(board(), served(board()), consumption);
  if (!near(l.kva, 6)) fail(`three flats came to ${l.kva} kVA, wanted 6`);
  if (l.count !== 3) fail(`counted ${l.count} flats, wanted 3`);

  /* Heat source is part of the key. A board that says gas and one that
     says a heat pump do not draw the same. */
  const hpBoard = board({ MSDB_Heat_Source_ID: 5, MSDB_Plot_IDs: [3],
    MSDB_Distances: { 3: 5 } });
  const hp = msdbLoad(hpBoard, served(hpBoard), consumption);
  if (!near(hp.kva, 6)) {
    fail("the heat source is not part of the load lookup, so every board "
      + "draws the same whatever it is heated by");
  }
}

// 2. A missing figure is reported, never zero.
//
//    A zero here reads as a flat that draws nothing, which is a flat
//    nobody sizes a cable for.
{
  /* Plot 204 is a nine-bedroom flat: nothing in the consumption table
     matches it, which is the case this is about. */
  const odd = board({ MSDB_Plot_IDs: [5], MSDB_Distances: { 5: 5 } });
  const l = msdbLoad(odd, served(odd), consumption);
  if (l.missing.length !== 1) {
    fail("a bedroom count with no row in the consumption table was not reported");
  }
  if (l.kva !== 0) fail("a flat with no figure contributed a load anyway");

  const one = apartmentLoad({ bedrooms: 9 }, 2, consumption);
  if (!one.missing || one.kva !== 0) fail("apartmentLoad invented a figure");
}

// 3. The level at a flat is the board's figure plus its own tail —
//    exactly how a plot meter's cut-out figure is reached.
{
  const at = { ohms: 0.2, pct: 4.9 };
  const rows = apartmentLevels(board(), served(board()), { at, cable, consumption });

  if (rows.some((r) => r.pct == null)) fail("a flat with everything known has no level");
  /* Further along its tail is worse, all else equal. */
  const byDist = [...rows].sort((a, b) => a.distanceM - b.distanceM);
  for (let i = 1; i < byDist.length; i++) {
    if (byDist[i].pct < byDist[i - 1].pct) {
      fail(`a flat ${byDist[i].distanceM} m away reads better than one `
        + `${byDist[i - 1].distanceM} m away on the same board`);
    }
  }
  /* And every one of them is worse than the board itself: a tail can
     only add. */
  if (rows.some((r) => r.pct <= at.pct)) {
    fail("a flat reads no worse than the board feeding it");
  }

  const w = worstApartment(rows);
  if (w?.ref !== "203") fail(`the worst flat came out as ${w?.ref}, wanted 203`);
}

// 4. What is not known is said, not guessed.
{
  /* No levels check yet. The tail alone is not a level \u2014 a figure that
     leaves out everything before the board looks passable when it is
     not. */
  const noCheck = apartmentLevels(board(), served(board()), { cable, consumption });
  if (noCheck.some((r) => r.pct != null)) {
    fail("a flat reports a level with no figure for the board it hangs off");
  }
  /* No cable named for the tails. */
  const noCable = apartmentLevels(board(), served(board()), { at: { ohms: 0, pct: 4 }, consumption });
  if (noCable.some((r) => r.pct != null)) {
    fail("a flat reports a level with no cable specified for its tail");
  }
  if (!noCable.every((r) => r.missingSpec)) {
    fail("a missing tail cable is not reported");
  }
  /* A flat with no load figure gets no level either: a drop computed
     from a load nobody knows is a number with nothing behind it. */
  const oddB = board({ MSDB_Plot_IDs: [5], MSDB_Distances: { 5: 5 } });
  const noLoad = apartmentLevels(oddB, served(oddB),
    { at: { ohms: 0, pct: 4 }, cable, consumption });
  if (noLoad[0].pct != null) fail("a flat with no load figure was given a level");
}

// 5. The shape of a row, and of the board.
{
  /* A board naming no flats serves none. Every flat on every board
     would double count on a scheme with two, and a board that quietly
     claimed the lot would size its cable for the whole block. */
  if (servedFlats({ Attributes: {} }, flats).length !== 0) {
    fail("a board naming no flats serves some anyway");
  }
  if (servedFlats({ Attributes: { MSDB_Plot_IDs: "nonsense" } }, flats).length !== 0) {
    fail("a malformed list of flats throws or serves some");
  }
  /* A house is not a flat, whatever else is on the Plots tab. */
  if (flats.some((x) => x.ref === "1")) {
    fail("a detached house was pulled in as a flat");
  }
  if (!isFlatType("Maisonette") || isFlatType("Detached")) {
    fail("what counts as a flat is wrong");
  }
  /* The bedroom count comes from the plot, not from the board. */
  if (flats.find((x) => x.ref === "202")?.bedrooms !== 2) {
    fail("a flat's bedrooms are not read from its plot's house type");
  }
  if (!FLOORS.includes("Ground")) fail("there is no ground floor");

  if (!/2nd floor/.test(msdbText(board(), served(board()), consumption))) {
    fail("the board does not say where it is");
  }
}

// 6. Drawn as a square with DB in it, and shown as MSDB everywhere else.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");

  if (!/f\.Feature_Role === "msdb"/.test(canvas)) fail("the board has no symbol");
  if (!/ctx\.fillText\("DB"/.test(canvas)) {
    fail("the symbol does not carry the letters DB");
  }
  /* A square, upright: it is a thing in a building, and a building does
     not lean with the trench. */
  if (!/ctx\.rect\(p\.x - half, p\.y - half, half \* 2, half \* 2\)/.test(canvas)) {
    fail("the symbol is not a square");
  }
  if (!/\+ MSDB/.test(canvas)) fail("there is no way to place one");
  if (!/isMsdb && \(/.test(editor)) fail("the board has no editor panel");
  /* The two things a row is asked for, and the two it is not. */
  for (const [what, re] of [
    ["which flats are on it", /MSDB_Plot_IDs/],
    ["how far each one is", /MSDB_Distances/],
  ]) {
    if (!re.test(editor)) fail(`the board cannot record ${what}`);
  }
  /* Read from the DRAFT. The panel edits `f`, and reading `feature`
     made every change invisible \u2014 Add flat appeared to do nothing at
     all, because it wrote to one object and the table read another. */
  if (/feature\.Attributes\?\.MSDB_/.test(editor)) {
    fail("the panel reads the saved feature rather than the draft, so every "
      + "edit is written and immediately invisible");
  }
  /* And the flats are not typed in twice. */
  /* Matched on CODE, not prose: the first version of this looked for
     the words "Add flat" and found them in the comment explaining why
     the button had gone. A check that reads a comment reports on the
     documentation. */
  if (/onClick=\{\(\) => \{\s*const rows = apartmentRows/.test(editor)
    || /blankApartment\(/.test(editor)) {
    fail("flats are still entered by hand here as well as on the Plots tab");
  }
  if (!/Location/.test(editor) || !/Floor/.test(editor)) {
    fail("the board's location and floor are not asked for");
  }
}

// 7. On the bill of materials \u2014 the board, and the tails in it.
//
//    A board's flats are rows in an attribute, not lines on the
//    drawing, so nothing counted the cable inside the building: the
//    take-off was short by however many metres of riser the block
//    needs.
{
  const sql = readFileSync("./supabase/migrations/0205_bom_msdb.sql", "utf8");
  const prev = readFileSync(
    "./supabase/migrations/0204_bom_exclude_feederpoints.sql", "utf8");

  /* ── Rebuilt from the working function, not from memory ──

     gis_bom is one function and there is no replacing half of it, so
     0205 carries the whole thing. An earlier attempt wrote it out from
     memory and lost the site, utility and developer columns, the
     surface handling and most of the water pipe cases. Everything 0204
     had, 0205 has. */
  for (const kept of ["Water_Pipe", "developer_name", "surface", "devs AS (",
    "Electric_Joint", "GIS_Line_Type"]) {
    const before = prev.split(kept).length - 1;
    const after = sql.split(kept).length - 1;
    if (after < before) {
      fail(`0205 mentions ${kept} ${after} times where 0204 had ${before} \u2014 `
        + "the rebuild dropped part of the working function");
    }
  }

  /* The board is named rather than initcapped: "Msdb" is not what it is
     called anywhere else in the app. */
  if (!/WHEN 'msdb' +THEN 'MSDB'/.test(sql)) {
    fail("the board falls through to initcap and reads Msdb on the sheet");
  }

  /* The tails are counted, and as their own line: they are ordered with
     the service cable but cut, pulled and terminated differently. */
  if (!/tails AS \(/.test(sql)) fail("the tails inside a board are not counted");
  if (!/'MSDB tails'/.test(sql)) {
    fail("the tails are folded into another line, so nobody can tell how "
      + "much of the cable is in the risers");
  }
  if (!/UNION ALL SELECT \* FROM tails/.test(sql)) {
    fail("the tails are worked out and never joined to the bill");
  }
  /* A board somebody has half filled in must not take the whole bill
     down with it. */
  if (!/jsonb_typeof\(f\."Attributes" -> 'MSDB_Apartments'\) = 'array'/.test(sql)) {
    fail("a malformed apartment table throws instead of contributing nothing");
  }
  /* A length nobody has specified a cable for is still a length
     somebody has to buy. */
  if (!/\(cable not set\)/.test(sql)) {
    fail("a board with no tail cable named contributes nothing, which makes "
      + "the take-off quietly short");
  }

  /* And the field exists to set it, or it can never be anything but
     the default. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/MSDB_Tail_Cable_ID/.test(editor)) {
    fail("there is no way to say what the tails are wired in");
  }
}

// 8. The database will accept one.
//
//    `Feature_Role` is a CHECK constraint listing every role by name,
//    so a new one is refused until it is added \u2014 placing a board
//    returned "violates check constraint GIS_Feature_Feature_Role_check"
//    until 0206. The constraint is doing its job: an unknown role is a
//    typo far more often than it is a new feature.
{
  const role = readFileSync("./supabase/migrations/0206_msdb_role.sql", "utf8");
  const prev = readFileSync("./supabase/migrations/0201_feeder_end_points.sql", "utf8");
  const listed = (src) => {
    const m = src.match(/CHECK \("Feature_Role" IN\s*\(([^)]+)\)\)/);
    return m ? m[1].split(",").map((x) => x.trim().replace(/'/g, "")) : [];
  };
  const before = listed(prev);
  const after = listed(role);

  if (!after.includes("msdb")) fail("the database still refuses an MSDB");
  /* ── Carried whole ──
     Postgres has no ADD VALUE for a CHECK, so the list is dropped and
     rewritten. A role left out here makes every existing feature of
     that role unwritable, and the rows sit there looking fine until
     somebody edits one. */
  const lost = before.filter((r) => !after.includes(r));
  if (lost.length) {
    fail(`rewriting the role list dropped ${lost.join(", ")} \u2014 every existing `
      + "feature of those roles becomes unwritable");
  }
  if (!/GIS_Style/.test(role) || !/'msdb'/.test(role)) {
    fail("the role has no style row, so anything reading the style table "
      + "rather than the canvas draws a default");
  }
}

// 9. The bill migration uses columns the table has.
//
//    The first version filtered on a "Deleted" column, which is a habit
//    from other schemas rather than a fact about this one. The error
//    only appears when the function is created, so it cost a round
//    trip to find.
{
  const sql = readFileSync("./supabase/migrations/0205_bom_msdb.sql", "utf8");
  const prev = readFileSync(
    "./supabase/migrations/0204_bom_exclude_feederpoints.sql", "utf8");
  const cols = (src) => [...src.matchAll(/f\."(\w+)"/g)].map((m) => m[1]);
  const known = new Set([...cols(prev), "Feature_ID"]);
  const invented = [...new Set(cols(sql))].filter((c) => !known.has(c));
  if (invented.length) {
    fail(`0205 reads ${invented.join(", ")} on GIS_Feature, which 0204 never `
      + "does \u2014 a column this schema may not have");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The MSDB behaves (flats on a table, load and levels derived).");
process.exit(bad ? 1 : 0);
