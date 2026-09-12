/* A block of flats is not forty-five points on a drawing.

   One cable arrives at a board in a riser cupboard, one leaves it for
   the next, and the dwellings hang off tails of a metre or two inside
   the building. Drawn as forty-five service points it is unreadable,
   unmovable, and wrong about what is actually in the ground.

   So the board is one object and the flats are a TABLE on it: the
   drawing carries what is buried, the table carries what is in the
   building. */
import { readFileSync } from "node:fs";
import { cumulativeToNode, serviceVoltDrop, kvaOf } from "./src/features/gis/voltDrop.js";
import {
  FLOORS, apartmentLoad, msdbLoad, apartmentLevels, worstApartment, msdbText,
  flatsFromPlots, servedFlats, isFlatType, shortType, riserDrop, outputDrop,
  assumedMeters, msdbSupply, withAssumedMeters,
  landlordSupplies, isLandlordSupply, nrsAsSeeds, nrsOnBoards,
} from "./src/features/gis/msdb.js";
import { circuitsFrom, circuitReport } from "./src/features/gis/electric.js";
import { circuitMembership, spanTrace } from "./src/features/gis/feeder.js";
import { jointMarks } from "./src/features/gis/feederPoints.js";

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
/* The heat source is the PLOT's, set on the Plots tab with everything
   else about the dwelling. A block where one flat is heated differently
   \u2014 a ground-floor commercial unit among them \u2014 could not be described
   by one field on the board at all. */
const plotList = [
  { plot_id: 1, plot_number: "1", Property_Config_ID: 10, Heat_Source_ID: 2 },
  { plot_id: 2, plot_number: "201", Property_Config_ID: 20, Heat_Source_ID: 2 },
  { plot_id: 3, plot_number: "202", Property_Config_ID: 21, Heat_Source_ID: 2 },
  { plot_id: 4, plot_number: "203", Property_Config_ID: 22, Heat_Source_ID: 2 },
  { plot_id: 5, plot_number: "204", Property_Config_ID: 23, Heat_Source_ID: 2 },
  /* Same flat, different heat source: the one case a board-wide field
     could never express. */
  { plot_id: 6, plot_number: "205", Property_Config_ID: 21, Heat_Source_ID: 5 },
];
const flats = flatsFromPlots({ plotList, configs, propertyTypes });

const board = (attrs = {}) => ({
  /* An id, because the assumed meters carry it back to their board and
     a fixture without one tests something no real board is. */
  Feature_ID: 900,
  Geometry: [[120, 80]],
  Feature_Role: "msdb", Feature_Type: "point", Layer_Key: "electric",
  Attributes: {
    MSDB_Location: "Core B riser", MSDB_Floor: "2nd",
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
  /* Plots 202 and 205 are both two-bed flats; 205 is heated differently
     and draws three times as much. Read from the plot, they differ. */
  const a = board({ MSDB_Plot_IDs: [3], MSDB_Distances: { 3: 5 } });
  const b = board({ MSDB_Plot_IDs: [6], MSDB_Distances: { 6: 5 } });
  const la = msdbLoad(a, served(a), consumption);
  const lb = msdbLoad(b, served(b), consumption);
  if (near(la.kva, lb.kva)) {
    fail("two identical flats on different heat sources draw the same, so "
      + "the heat source is not being read from the plot");
  }
  if (!near(lb.kva, 6)) fail(`the heat-pump flat came to ${lb.kva} kVA, wanted 6`);
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

// 10. Named the way a designer writes it.
//
//     "1 bed Flat" is four words for a thing that appears forty-five
//     times in one table.
{
  for (const [beds, type, want] of [
    [1, "Flat", "1BF"], [2, "Apartment", "2BA"], [3, "Maisonette", "3BM"],
  ]) {
    if (shortType(beds, type) !== want) {
      fail(`${beds} bed ${type} reads "${shortType(beds, type)}", wanted ${want}`);
    }
  }
  /* A type nobody anticipated reads as itself rather than being forced
     into F, A or M. */
  if (shortType(2, "Bungalow") !== "2BB") fail("an unexpected type loses its initial");
  /* Missing pieces show as a question rather than a wrong letter. */
  if (!/\?/.test(shortType(0, "Flat")) || !/\?/.test(shortType(2, ""))) {
    fail("a flat with no bedrooms or no type reads as though it had them");
  }

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/flat\.short/.test(editor)) fail("the table does not use the short label");
  /* The same bedroom palette as the placement panel and the property
     admin, so a one-bed is the same colour wherever somebody meets it. */
  if (!/bedColour\(flat\.bedrooms\)/.test(editor)) {
    fail("the pill has a colour of its own rather than the bedroom palette");
  }
  /* And the full description survives on hover: the pill is short, not
     a replacement for knowing what it means. */
  if (!/title=\{\s*`\$\{flat\.bedrooms\} bed \$\{flat\.typeName\}`\}/.test(editor)) {
    fail("the pill does not say what it stands for on hover");
  }
  /* No heat source on the board: it is the plot's. */
  if (/MSDB_Heat_Source_ID/.test(editor)) {
    fail("the board still asks for a heat source, which is set on the plot");
  }
}

// 11. The riser between the boundary and the board.
//
//     The drawing stops at the boundary. A board on the fourth floor is
//     fifteen metres further on, up a riser nobody has drawn and nobody
//     can, and that cable drops volts like any other.
//
//     Left out, every flat in the block reads better than it is \u2014 by
//     the same amount, on every board, in the same direction. A figure
//     wrong the same way every time is the hardest kind to notice.
{
  const at = { ohms: 0.20, pct: 4.90 };
  const none = riserDrop(board({ MSDB_Riser_M: 0 }), { at, cable, kva: 24 });
  const some = riserDrop(board({ MSDB_Riser_M: 15 }), { at, cable, kva: 24 });

  if (!near(none.pct, at.pct)) {
    fail("a board at the boundary reads differently from the boundary");
  }
  if (!(some.pct > at.pct)) {
    fail("fifteen metres of riser costs nothing, so a fourth-floor board "
      + "reads the same as one in the car park");
  }
  /* It carries the WHOLE board's load: every flat is fed through it. */
  const light = riserDrop(board({ MSDB_Riser_M: 15 }), { at, cable, kva: 6 });
  if (!(some.pct > light.pct)) {
    fail("the riser drop does not depend on the load through it");
  }

  /* And the flats sit on top of the board's figure, not the
     boundary's. */
  const b = board({ MSDB_Riser_M: 15 });
  const onBoundary = apartmentLevels(b, served(b), { at, cable, consumption });
  const onBoard = apartmentLevels(b, served(b),
    { at: riserDrop(b, { at, cable, kva: 6 }), cable, consumption });
  if (!(onBoard[0].pct > onBoundary[0].pct)) {
    fail("a flat is measured from the boundary rather than from the board "
      + "it hangs off, so the riser is missing from every one of them");
  }

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/MSDB_Riser_M/.test(editor)) {
    fail("there is no way to record the distance from the boundary");
  }
  if (!/at: msdbAt\?\.pct == null \? null : msdbAt/.test(editor)) {
    fail("the flats are measured from the boundary figure rather than from "
      + "the board's");
  }
}

// 12. The consumption table is the one the app actually has.
//
//     `lookups.consumption` does not exist \u2014 it is
//     `houseTypeConsumption`, which is what the future-allowance panel
//     three hundred lines below has always used. The guess returned an
//     empty table, so every flat reported "no consumption figure" and
//     the message blamed the specs.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (/lookups\?\.consumption\b/.test(editor)) {
    fail("the MSDB reads lookups.consumption, which does not exist \u2014 every "
      + "flat then reports no figure and the message blames the specs");
  }
  if (!/lookups\?\.houseTypeConsumption/.test(editor)) {
    fail("the MSDB does not read the consumption table at all");
  }
}

// 13. What feeds the board, and the flats' assumed meters.
//
//     A board sits on a feeder like any other fitting. Until it says
//     which one, nothing can size the cable reaching it or count its
//     flats against a circuit's load.
//
//     And every flat has a meter. It is not drawn \u2014 forty-five points
//     in a riser cupboard is what this object exists to avoid \u2014 but a
//     meter is how this application knows a load exists: `circuitsFrom`
//     builds the circuit list out of meters carrying a Circuit_ID.
{
  const fed = board({ Circuit_ID: 3, Circuit_Name: "Circuit 3",
    Circuit_Letter: "C", Link_Box_ID: 44563, Link_Way: 2 });
  const rows = served(fed).map((r) => ({ ...r, kva: 1.5 }));
  const meters = assumedMeters(fed, rows);

  if (meters.length !== rows.length) fail("not every flat has a meter");

  /* They must look like meters to the thing that builds circuits, or
     the flats are a load nothing counts. */
  const cs = circuitsFrom(meters);
  if (cs.length !== 1 || cs[0].meters.length !== rows.length) {
    fail("the assumed meters are not recognised as meters, so the circuit "
      + "never sees the flats' load");
  }

  /* One circuit, from the board: they are fed through it. A flat on a
     different circuit from the board feeding it would be a different
     building. */
  if (meters.some((m) => Number(m.Attributes.Circuit_ID) !== 3
    || Number(m.Attributes.Link_Way) !== 2)) {
    fail("a flat's meter does not take the board's circuit and output");
  }

  /* Marked as assumed and tied back to their board, or something will
     eventually try to save them as drawn features. */
  if (meters.some((m) => !m.Attributes.Assumed || m.Attributes.MSDB_ID == null)) {
    fail("an assumed meter does not say it is assumed, or which board it "
      + "belongs to");
  }
  if (meters.some((m) => m.Feature_ID != null)) {
    fail("an assumed meter carries a Feature_ID, which invites something to "
      + "save it as a real one");
  }

  /* At the board: that is where their cable actually arrives. */
  const at = fed.Geometry?.[0];
  if (at && meters.some((m) => m.Geometry[0][0] !== at[0])) {
    fail("an assumed meter is somewhere other than its board");
  }

  /* A board with nothing set says so rather than claiming a circuit. */
  if (msdbSupply(board()).named) fail("a board with no circuit claims one");

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/fe-msdb-circuit/.test(editor)) fail("there is no way to set the circuit");
  /* The output only where the circuit runs through a box: a circuit
     with no box has no output to choose. */
  if (!/msdbBox && \(/.test(editor)) {
    fail("the output is offered on circuits that have no link box");
  }
  /* A two-way box has ONE output; the input is not one, and offering it
     would put a board on the cable feeding the box. */
  if (!/length: n - 1/.test(editor)) {
    fail("the box's input is offered as an output");
  }
}

// 14. Build LV Network routes to a board.
//
//     The build routes to METERS: it scans the features for them,
//     attaches each to the nearest node on the dig, and sizes cable by
//     what it finds. A board's flats are not features, so the build did
//     not know they existed \u2014 no cable was routed to a board and no
//     stop was placed at it.
{
  const b = board({ Circuit_ID: 3, Circuit_Name: "Circuit 3" });
  const world = withAssumedMeters([b], {
    plotList, configs, propertyTypes, consumption,
  });
  const added = world.filter((x) => x.Attributes?.Assumed);

  if (added.length !== served(b).length) {
    fail(`the build is given ${added.length} meters for a board serving `
      + `${served(b).length} flats`);
  }
  /* Load, so the cable to the board is sized for what it feeds. */
  if (added.some((m) => m.Attributes.Assumed_kVA == null)) {
    fail("an assumed meter carries no load, so the cable to the board is "
      + "sized for nothing");
  }
  /* At the board: that is where the run has to reach. */
  const at = b.Geometry[0];
  if (added.some((m) => m.Geometry[0][0] !== at[0] || m.Geometry[0][1] !== at[1])) {
    fail("an assumed meter is somewhere other than its board, so the cable "
      + "is routed to the wrong place");
  }

  /* ── Ids that cannot be mistaken for rows ──
     The build keys meters by Feature_ID, so these need one. Negative,
     because no row has a negative id: anything that tries to save one
     or look one up fails loudly rather than quietly writing a meter
     nobody placed. */
  if (added.some((m) => !(m.Feature_ID < 0))) {
    fail("an assumed meter carries an id a real row could have");
  }
  if (new Set(added.map((m) => m.Feature_ID)).size !== added.length) {
    fail("two assumed meters share an id, so the build sees one of them");
  }

  /* A board with no circuit is a board nothing can route to. Left out
     rather than routed to a circuit picked for it. */
  const loose = withAssumedMeters([board({ Circuit_ID: null })], {
    plotList, configs, propertyTypes, consumption,
  });
  if (loose.some((x) => x.Attributes?.Assumed)) {
    fail("a board with no circuit was given meters anyway, which routes it "
      + "to a circuit nobody chose");
  }

  /* A drawing with no boards comes back untouched: no copy, no cost. */
  const plain = [{ Feature_Role: "meter", Layer_Key: "electric" }];
  if (withAssumedMeters(plain, {}) !== plain) {
    fail("a drawing with no boards is copied for nothing");
  }

  /* And the build asks for them at the one place its view of the
     drawing is decided. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const src = withAssumedMeters\(srcFeatures \|\| features, \{/.test(canvas)) {
    fail("Build LV Network does not see the boards' flats, so no cable is "
      + "routed to a board and no stop is placed at it");
  }
}

// 15. A flat is a member of its circuit.
//
//     A meter joins a circuit through its plot SEED. A board's flats
//     have no seed on the drawing \u2014 nobody places forty-five of them in
//     a riser cupboard, which is what the board exists to avoid \u2014 so
//     they carry a Plot_ID with no plot feature to find, missed both
//     routes, and joined neither set.
//
//     The circuit then did not know they existed and nothing was ever
//     routed to the board, however much trench ran to it.
{
  const b = board({ Circuit_ID: 3 });
  const world = withAssumedMeters([b], {
    plotList, configs, propertyTypes, consumption,
  });
  const m = circuitMembership(world, 3);

  if (m.seedIds.size + m.meterIds.size === 0) {
    fail("the board's flats belong to no circuit, so Build LV Network never "
      + "routes a cable to it");
  }
  if (m.meterIds.size !== served(b).length) {
    fail(`${m.meterIds.size} of ${served(b).length} flats are members`);
  }

  /* A drawn meter still joins through its seed: this adds a route, it
     does not replace one. */
  const drawn = [
    { Feature_ID: 1, Feature_Role: "meter", Layer_Key: "electric",
      Plot_ID: 7, Attributes: { Circuit_ID: 3 } },
    { Feature_ID: 2, Feature_Role: "plot", Plot_ID: 7 },
  ];
  const d = circuitMembership(drawn, 3);
  if (d.seedIds.size !== 1 || d.meterIds.size !== 0) {
    fail("a drawn meter no longer joins its circuit through its plot seed");
  }
}

// 16. The build says what happened to each board.
//
//     A board is routed to because its flats are load on the network.
//     Several things have to be true for that \u2014 a circuit named, flats
//     ticked, the board within reach of the dig \u2014 and when it does not
//     happen the build said nothing and the drawing simply had no cable
//     to it. Three rounds were spent guessing at which condition had
//     failed.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/board\(s\) reached/.test(canvas)) {
    fail("the build does not say whether it reached the boards");
  }
  /* A count answers "did it work". The reason answers "what do I
     change", which is the question somebody has when it did not. */
  for (const [why, re] of [
    ["no circuit set", /no circuit set/],
    ["no flats ticked", /no flats on it/],
    ["not on the dig", /is it on the trench\?/],
  ]) {
    if (!re.test(canvas)) fail(`the build cannot report "${why}"`);
  }
  if (!/boardSaid\.join\("; "\)/.test(canvas)) {
    fail("the reasons are worked out and never shown");
  }
  /* Measured against the drawing as re-read, not against a tally kept
     alongside: what was laid is what is there. */
  if (!/const boards = all\.filter/.test(canvas)) {
    fail("the check reads the pre-build features, so a board reached by "
      + "this very build still reports as missed");
  }
}

// 17. Reached is not the same as served.
//
//     A leg can run to a board and carry nothing: the routing reaches
//     it because its flats are members, and the flats then fail to
//     ATTACH to the dig. The report showed B2 -> B3 at 0.0 A with a
//     terminal count of zero, and it looked like the board had been
//     served.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/attachedFlats/.test(canvas)) {
    fail("the build counts boards reached but not flats attached, so a "
      + "cable running to a board that carries nothing reads as a success");
  }
  if (!/none of its \$\{carried\} flat\(s\) `/.test(canvas)) {
    fail("a board whose flats did not attach is not named");
  }
  /* Counted from what the MODEL attached: it is the only thing that
     knows which meters landed on the dig. */
  if (!/for \(const m of \(pt\.attached \|\| \[\]\)\)/.test(canvas)) {
    fail("the tally is guessed rather than read from what was attached");
  }

  /* And the board's own level is read off the STOP standing on it. The
     levels are keyed on stops; a board is not one, so looking it up by
     the board's id found nothing and every flat showed a dash. */
  if (!/const levelsAtBoard = useCallback/.test(canvas)) {
    fail("the board's level is looked up by the board's own id, which the "
      + "levels are not keyed on");
  }
  if (/elecLevelsAt\?\.get\?\.\(Number\(editing\.Feature_ID\)\)/.test(canvas)) {
    fail("the editor still looks the level up by the board's id");
  }
}

// 18. The whole chain, on the drawing it failed on.
//
//     Everything above tests a piece. This runs the real model over the
//     real site and asks the one question that matters: does the leg to
//     the board carry its flats.
//
//     Three rounds were lost to a harness that read `attached` off the
//     wrong object \u2014 spanTrace returns it inside `model`, and reading
//     `r.attached` gave zero for every meter on the drawing, which
//     looked like a total failure and was a typo in the test.
{
  const file = "./fixtures/drawing-2202-043-msdb.json";
  let raw = null;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch { /* below */ }
  if (!raw) fail(`${file} is missing \u2014 the MSDB drawing this was proved on`);
  else {
    const f = raw.features;
    const b = f.find((x) => x.Feature_Role === "msdb");
    if (!b) fail("the fixture has no board on it");
    else {
      const ids = b.Attributes.MSDB_Plot_IDs || [];
      /* ── Nothing but the drawing ──

         No plot list, no house types, no consumption table, no
         synthesised meters. The board says how many flats it has; the
         routing counts them. Everything this used to depend on is the
         reason it failed silently for four rounds. */
      const src = f;
      const { seedIds, meterIds } = circuitMembership(src, 2);
      const origin = f.find((x) => x.Feature_Role === "feederpoint"
        && Number(x.Attributes?.Circuit_ID) === 2
        && Number(x.Attributes?.Span_Seq) === 0);
      const r = spanTrace(src, origin.Feature_ID,
        { lineTypes: raw.lineTypes || [], circuitId: 2, seedIds, meterIds });

      /* `attached` lives on the MODEL, not on the result. */
      const M = r.model || {};
      if (!Array.isArray(M.attached)) {
        fail("spanTrace no longer reports what it attached, on the model");
      }
      /* The board itself is what attached: its flats are counted off it
         rather than synthesised into meters. */
      if (!(M.attached || []).includes(Number(b.Feature_ID))) {
        fail("the board did not attach to the dig, so its flats are counted "
          + "nowhere");
      }
      /* ── Load, not a customer ──

         `metersAt` feeds the service-tail machinery: for each entry it
         looks for that customer's own service cable. A board has none —
         its flats hang off it inside the building — so pushing it in
         would make a well-served leg report "no service". */
      const inTees = (M.metersAt || []).some((list) => (list || [])
        .some((x) => x?.meter?.Feature_Role === "msdb"));
      if (inTees) {
        fail("the board is listed as a customer with a service tee, so the "
          + "levels will report a leg with no service");
      }

      /* ── A cable may leave the board to serve plots beyond it ──

         The board is counted BEFORE the roll-up, so its flats and
         everything downstream of it both reach the legs above. If the
         count moved after the roll-up, the flats would vanish from
         every leg upstream. */
      const upstream = (r.legs || []).find((l) => l.from === "B0");
      const withoutBoard = (r.legs || [])
        .filter((l) => l.to !== "B3")
        .reduce((n, l) => n + (l.to === "B1" ? 0 : 0), 0);
      if (upstream && upstream.terminal <= ids.length) {
        fail(`the first leg carries ${upstream.terminal} meters, which is no `
          + "more than the board's flats alone — the rest of the circuit has "
          + "been lost");
      }

      /* And the leg that ends at the board carries them. */
      const at = b.Attributes?.Span_Anchor ?? b.Geometry[0];
      const stop = f.find((x) => x.Feature_Role === "feederpoint"
        && Math.hypot((x.Geometry[0][0]) - at[0], (x.Geometry[0][1]) - at[1]) <= 1);
      const leg = (r.legs || []).find((l) => l.to === stop?.Attributes?.Span_Label);
      if (!leg) fail("no leg ends at the board");
      else if (leg.terminal !== ids.length) {
        fail(`the leg to the board reports ${leg.terminal} terminal meters for `
          + `${ids.length} flats \u2014 TERM reads 0 on the levels sheet`);
      }
    }
  }
}

// 19. A board mid-run is still a stop.
//
//     While a board sat at the end of a spur it got a stop for free:
//     the end of a run is always marked. Run a cable onward from it to
//     serve plots beyond and it becomes a point mid-span, which nothing
//     marked \u2014 no stop, so no figure, so no level at the board and a
//     dash against every flat.
//
//     The drawing looked right and the numbers silently stopped.
{
  const model = { nodes: [[0, 0], [50, 0], [100, 0]] };
  const sections = [{ pts: [[0, 0], [50, 0], [100, 0]] }];
  const board = { Feature_ID: 900, Feature_Role: "msdb", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[50, 0]], Attributes: { Circuit_ID: 2 } };

  const marks = jointMarks([board], model, sections);
  if (!marks.length) {
    fail("a board part way along a run is offered no stop, so it has no "
      + "level and every flat on it shows a dash");
  }

  /* A straight joint still gets one: this adds a case, it does not
     replace one. */
  const joint = { Feature_ID: 901, Feature_Role: "joint", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[50, 0]],
    Attributes: { Joint_Type: "straight" } };
  if (!jointMarks([joint], model, sections).length) {
    fail("a straight joint no longer gets a stop");
  }
  /* And something that is neither does not. */
  const other = { Feature_ID: 902, Feature_Role: "joint", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[50, 0]],
    Attributes: { Joint_Type: "service" } };
  if (jointMarks([other], model, sections).length) {
    fail("a service joint is marked as a stop, which it is not");
  }
  /* A board nowhere near the run is not on it. */
  const away = { ...board, Geometry: [[50, 40]] };
  if (jointMarks([away], model, sections).length) {
    fail("a board forty metres off the run was given a stop on it");
  }
}

// 20. Dragging a board takes its cables and its stop with it.
//
//     One cable arrives at a board and one leaves. Dragging it left
//     both where they were, so the board came away from the cables it
//     sits on \u2014 the same fault a joint had, and the same rule fixes it.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* `isJoint` is the drag's name for "a fitting the cable follows". */
  if (!/pt\.Feature_Role === "joint"\s*\n?\s*\|\| pt\.Feature_Role === "msdb"/.test(canvas)) {
    fail("the cables do not follow a board when it is dragged");
  }
  /* And the stop standing on it. */
  if (!/f\?\.Feature_Role === "joint" \|\| f\?\.Feature_Role === "msdb"/.test(canvas)) {
    fail("the feeder point on a board does not follow it, so the leader is "
      + "left pointing at nothing");
  }

  /* ── Stated, not guessed ──

     The anchor followed by PROXIMITY where a stop carried no link: a
     third of a metre out and it stayed behind. The build now stamps the
     fitting a stop stands on, so the drag reads a record. */
  const marks = readFileSync("./src/features/gis/feederPoints.js", "utf8");
  if (!/atFeatureId: f\.Feature_ID \?\? null/.test(marks)) {
    fail("a stop does not record which fitting asked for it");
  }
  if (!/At_Joint_ID: Number\(nd\.atFeatureId\)/.test(marks)) {
    fail("the fitting's id is carried on the mark and dropped when the point "
      + "is written, so the drag has nothing to read");
  }
}

// 21. The dig follows the board too.
//
//     A joint follows nothing off its own layer: it sits ON a cable
//     inside a trench, so pulling the dig about because a fitting moved
//     is wrong. A board is the other way round \u2014 the trench RUNS TO it,
//     the way a plot's service ends at a meter \u2014 so moving one without
//     the other leaves a dig stopping in open ground.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/if \(isJoint && !isBoard && line\.Layer_Key !== pt\.Layer_Key\) continue;/
    .test(canvas)) {
    fail("a board follows nothing off its own layer, so the trench running "
      + "to it stays behind");
  }
  /* Ends only. A trench passing THROUGH a board is still not dragged
     out of shape: that is what the joint rule protects and it is right. */
  if (!/: \[0, g\.length - 1\];/.test(canvas)) {
    fail("every vertex of a trench follows, so dragging a board pulls the "
      + "dig out of shape");
  }
  /* ── And it keeps working after a cable is connected ──
     `Joint_Cables` is what a fitting says it HOLDS, and holding is
     about conductors. Without this exception the trench followed until
     somebody connected a cable in the editor, which writes the record,
     and then silently stopped. */
  if (!/const isDig = isBoard && line\.Layer_Key !== pt\.Layer_Key;/.test(canvas)) {
    fail("connecting a cable to a board stops its trench following it");
  }
}

// 22. A board's flats appear on the circuit report.
//
//     The report lists a circuit's meters with their plot, house type,
//     distance and load. Left out, a block of dwellings was missing
//     from the one sheet that says who is on which feeder.
{
  const raw = JSON.parse(readFileSync("./fixtures/drawing-2202-043-msdb.json", "utf8"));
  const f = raw.features;
  const bd = f.find((x) => x.Feature_Role === "msdb");
  const pids = bd?.Attributes?.MSDB_Plot_IDs || [];
  const view = withAssumedMeters(f, {
    plotList: pids.map((id, i) => ({ plot_id: id, plot_number: `10${i + 1}`,
      Property_Config_ID: 500, Heat_Source_ID: 2 })),
    configs: [{ Property_Config_ID: 500, Bedrooms: 1, Property_Type_ID: 7 }],
    propertyTypes: [{ Property_Type_ID: 7, Property_Type: "Flat" }],
    consumption: [{ Bedrooms: 1, Heat_Source_ID: 2, Consumption_kVA: 2.2 }],
  });
  const rep = circuitReport(view, { lineTypes: raw.lineTypes || [] });
  const c2 = (rep.circuits || []).find((c) => Number(c.id) === 2);
  if (!c2) fail("circuit 2 is not on the report");
  else {
    const flats = (c2.meters || []).filter((m) => Number(m.id) < 0);
    if (flats.length !== pids.length) {
      fail(`${flats.length} of the board's ${pids.length} flats are on the `
        + "circuit report");
    }
    /* ── With their own figures ──
       There is no plot FEATURE behind a flat and nothing in the plot
       list keyed the way the report expects, so a meter that knew its
       own load reported nothing and read as a dwelling drawing zero. */
    if (flats.some((m) => !(Number(m.kva) > 0))) {
      fail("a flat on the report shows no load, which reads as a dwelling "
        + "drawing nothing");
    }
    if (flats.some((m) => !m.plot)) {
      fail("a flat on the report has no plot number, so the column a reader "
        + "scans first is blank");
    }
    /* ── Where it hangs is said by the grouping, not by this column ──

       This asserted the House Type column read "Flat on MSDB", so a
       reader who could not find the plot on the drawing knew why. The
       report now groups a board's flats under a heading carrying the
       board's name, which says the same thing once for the whole
       block and in the place somebody looks for it.

       That frees the column to answer the question it asks. Every
       other row gives a three-letter code, and a sentence in the
       middle of a column being scanned for 2BF against 3BF is the
       column lying about what it holds.

       So the rule is now: the code here, and the board on the row for
       the grouping to use. */
    if (flats.some((m) => /MSDB/i.test(String(m.houseType ?? "")))) {
      fail("a flat's house type still says where it hangs, in a column every "
        + "other row answers with a three-letter code");
    }
    if (flats.some((m) => m.msdbId == null)) {
      fail("a flat does not say which board it hangs from, so the report "
        + "cannot group it under one and the reader is told nowhere");
    }

    /* ── Each flat's own distance ──

       An ordinary meter joins the network at its own point, so the
       distance column already covers that customer's run. Every flat on
       a board stands AT the board, so without its own way in they all
       reported one number and the tails the designer recorded \u2014 fifteen
       to twenty-eight metres apart \u2014 counted for nothing. */
    const spread = new Set(flats.map((m) => m.distM));
    if (spread.size === 1 && flats.length > 1) {
      fail("every flat on the board reports the same distance, so the tails "
        + "recorded against them count for nothing");
    }
    /* The riser is on every flat's route and on none of the network:
       the drawing stops at the boundary and the board is up a shaft
       nobody has drawn. Left out, every flat is short by the same
       amount. */
    const riser = Number(bd.Attributes?.MSDB_Riser_M) || 0;
    const tails = bd.Attributes?.MSDB_Distances || {};
    const nearest = Math.min(...Object.values(tails).map(Number).filter(Number.isFinite));
    const closest = Math.min(...flats.map((m) => m.distM));
    const board = closest - riser - nearest;
    if (riser > 0 && !(closest > board + riser - 0.01)) {
      fail("the riser is missing from the flats' distances");
    }
    for (const m of flats) {
      if (!(m.distM >= board + riser + nearest - 0.01)) {
        fail(`a flat reports ${m.distM} m, nearer than the board plus the `
          + "shortest tail on it");
      }
    }
  }

  /* And the report is given the same view the build works from: two
     counts of one circuit is fault 27. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/circuitReport\(withAssumedMeters\(features, \{/.test(canvas)) {
    fail("the report reads the drawing without the boards' flats, so it and "
      + "the routing disagree about what is on a circuit");
  }
}

// 23. The board's label carries the worst flat.
//
//     The figure at a board is the figure at the bottom of the riser,
//     where nobody lives. On the live drawing the stop reads 4.42% and
//     the top flat is at 5.63% \u2014 over the limit, behind a label saying
//     everything is fine.
{
  const raw = JSON.parse(readFileSync("./fixtures/drawing-2202-043-msdb.json", "utf8"));
  const bd = raw.features.find((x) => x.Feature_Role === "msdb");
  const pids = bd.Attributes.MSDB_Plot_IDs || [];
  const cable = { Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 };
  const cons = [{ Bedrooms: 1, Heat_Source_ID: 2, Consumption_kVA: 2.2 }];
  const flats = servedFlats(bd, flatsFromPlots({
    plotList: pids.map((id, i) => ({ plot_id: id, plot_number: `10${i + 1}`,
      Property_Config_ID: 500, Heat_Source_ID: 2 })),
    configs: [{ Property_Config_ID: 500, Bedrooms: 1, Property_Type_ID: 7 }],
    propertyTypes: [{ Property_Type_ID: 7, Property_Type: "Flat" }],
  })).map((r) => ({ ...r, kva: 2.2 }));

  const vd = { pct: 4.42, ohms: 0.159 };
  const kva = flats.reduce((t, r) => t + r.kva, 0);
  const atBoard = riserDrop(bd, { at: vd, cable, kva });
  const worst = worstApartment(apartmentLevels(bd, flats,
    { at: atBoard, cable, consumption: cons }));

  if (!worst) fail("no worst flat could be worked out for the board");
  else {
    /* Worse than the stop, or the label adds nothing. */
    if (!(worst.pct > vd.pct)) {
      fail("the worst flat reads no worse than the stop below it, so the "
        + "riser and the tails are not in the figure");
    }
    /* The riser is in it: the board is up a shaft the drawing stops
       short of, and every flat is beyond it. */
    if (!(atBoard.pct > vd.pct)) {
      fail("the figure at the board equals the figure at the stop, so the "
        + "riser counts for nothing");
    }
    /* And it is the WORST, not just any. */
    const all = apartmentLevels(bd, flats, { at: atBoard, cable, consumption: cons });
    if (all.some((r) => r.pct > worst.pct + 1e-9)) {
      fail("a flat reads worse than the one the label names");
    }
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const worst = worstFlatAt\(f\);/.test(canvas)) {
    fail("the stop's label does not carry the worst flat on the board");
  }
  /* Worked from the same functions the editor uses, so the drawing and
     the panel cannot disagree. */
  if (!/riserDrop\(board, \{ at: vd, cable, kva, voltageV \}\)/.test(canvas)) {
    fail("the label works the board's figure out its own way rather than "
      + "the way the editor does");
  }
  /* Matched by the id the build stamps, not by position alone. */
  if (!/Number\(f\.Feature_ID\) === Number\(stamped\)/.test(canvas)) {
    fail("the stop is matched to its board by position only");
  }
}

// 25. Two vertical runs, not one.
//
//     A board on the fourth floor is reached by a cable running UP to
//     it, and the feeder that carries on to plots elsewhere runs back
//     DOWN to ground before it goes anywhere. Not the same length: the
//     outgoing cable may drop a different shaft.
{
  const cable = { Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 };
  const at = { ohms: 0.20, pct: 4.42 };
  const both = board({ MSDB_Riser_M: 15, MSDB_Down_M: 15 });
  const flatsOnly = board({ MSDB_Riser_M: 15 });

  /* Up carries EVERYTHING the board draws: its flats and whatever is
     fed onward through it. */
  const atBoard = riserDrop(both, { at, cable, kva: 62 });
  if (!(atBoard.pct > at.pct)) fail("the run up costs nothing");

  /* Down carries ONLY what is downstream \u2014 the flats are taken off at
     the board, and sizing this for them would size it for load that
     never travels it. */
  const leaving = outputDrop(both, { at: atBoard, cable, kva: 40 });
  if (!leaving) fail("a board with a run down reports no output level");
  else {
    if (!(leaving.pct > atBoard.pct)) {
      fail("the outgoing cable starts at the board's own figure, so the run "
        + "back down to ground counts for nothing");
    }
    /* Carrying less costs less: the proof that the two runs are not
       given the same load. */
    const heavier = outputDrop(both, { at: atBoard, cable, kva: 62 });
    if (!(heavier.pct > leaving.pct)) {
      fail("the run down does not depend on the load through it");
    }
  }

  /* ── The board's own figure does not move ──
     The drop down affects what LEAVES the board, not the board. Its
     flats hang off the board and are unaffected by a cable running away
     from them. */
  const withoutDown = riserDrop(flatsOnly, { at, cable, kva: 62 });
  if (Math.abs(withoutDown.pct - atBoard.pct) > 1e-9) {
    fail("recording a run back down changed the figure at the board, so "
      + "every flat moved with it");
  }

  /* ── Nothing continues past it ──
     A board at the end of the line has no cable going back to ground,
     and a blank says that where a nought would claim a run of no
     length. */
  if (outputDrop(flatsOnly, { at: atBoard, cable, kva: 0 }) !== null) {
    fail("a board with no run recorded reports an output level anyway");
  }
  if (outputDrop(board({ MSDB_Down_M: 0 }), { at: atBoard, cable, kva: 0 }) === null) {
    fail("a run explicitly recorded as zero is treated as no run at all");
  }

  /* And the field is asked for, under the name it was asked for. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  /* Headed for where the cable comes FROM. It was "Boundary to MSDB",
     then "Ground to MSDB", now "Previous floor to MSDB" — the field has
     always been the length of the run arriving at the board, and only
     the wording of where it starts has moved. */
  if (!/Previous floor to MSDB \(m\)/.test(editor)) {
    fail("the run up is not headed Previous floor to MSDB");
  }
  if (!/MSDB to ground \(m\)/.test(editor)) fail("there is no field for the run down");
  if (!/MSDB_Down_M/.test(editor)) fail("the run down is not recorded");
  /* Only the downstream load, read off what the levels found still
     travelling past the stop. */
  /* From what the levels found passing through, LESS the board's own
     flats: they are taken off at the board and never travel the run
     down. The bare `ampsThrough` was used until a board's flats became
     assumed meters standing on that very stop, at which point "through"
     stopped being a fact to rely on. */
  /* The panel no longer costs the run down at all \u2014 it reads what the
     cascade charged. Asserted as the absence of its old arithmetic,
     because "does not compute this" has no positive form. */
  if (/kvaOf\(Number\(levelsAt\?\.ampsThrough\) \|\| 0, voltageV\)/.test(editor)) {
    fail("the panel is costing the run down itself again");
  }
}

// 26. The board's own name, first and unnamed by default.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* What it is called is the first thing somebody sets and the first
     thing they read. The shared Label field sits at the FOOT of the
     panel, past forty flats. */
  const labelAt = editor.indexOf('htmlFor="fe-msdb-label"');
  const locAt = editor.indexOf('htmlFor="fe-msdb-loc"');
  if (labelAt < 0) fail("the board has no Label field of its own");
  else if (!(labelAt < locAt)) fail("the Label field is below Location");

  /* And one box for one value: the shared field is hidden for a board,
     because two boxes writing one thing is two places to wonder which
     won. */
  if (!/\{!isMsdb && \(/.test(editor)) {
    fail("a board shows two Label fields writing the same value");
  }
  /* The same Label the rest of the editor writes, not a second name. */
  if (!/id="fe-msdb-label"[^]{0,200}Label: e\.target\.value/.test(editor)) {
    fail("the board's Label field writes somewhere other than Label");
  }

  /* ── No default name ──
     It fell through to the POC branch and came out called "Electric
     POC 2" \u2014 not merely unhelpful, but the name of a different kind of
     thing. */
  if (!/role === "msdb" \? ""/.test(canvas)) {
    fail("a placed board is given a default name, which somebody has to "
      + "notice is wrong");
  }
}

// 27. What leaves the board is READ, not recomputed.
//
//     The panel used to work the figure out itself: its own load, its
//     own cable, its own arithmetic. That could be made to agree with
//     the cascade and never guaranteed to \u2014 and for a while it did not,
//     the panel saying 0.17% while the stop beyond read 0.10%.
//
//     The cascade charges the run down as the first metres of the leg
//     leaving the board and reports its share on the board's own
//     figure. The panel reads that. One number, and the panel and the
//     drawing cannot drift.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (/const onward = Math\.max\(0, through - ownFlats\);/.test(editor)) {
    fail("the panel still works out its own load for the run down, so it can "
      + "disagree with the levels");
  }
  if (!/if \(levelsAt\?\.leavingPct == null\) return null;/.test(editor)) {
    fail("the panel does not read what leaves the board from the levels");
  }
  if (/outputDrop\(f, \{/.test(editor)) {
    fail("the panel still calls outputDrop, which is a second arithmetic for "
      + "the same figure");
  }

  const vd = readFileSync("./src/features/gis/voltDrop.js", "utf8");
  if (!/here\.leavingPct = here\.pct \+ \(beyond\.pct - here\.pct\) \* share;/.test(vd)) {
    fail("the cascade does not report what leaves a board, so the panel has "
      + "nothing to read");
  }
  /* As a PROPORTION of the leg it is part of \u2014 no second choice of
     load, no second cable lookup, nothing to drift. */
  if (!/const share = Math\.min\(1, down \/ chargedM\);/.test(vd)) {
    fail("the run down's share is recomputed rather than taken from the leg "
      + "it is part of");
  }
}

// 28. Everything beyond a board starts from what LEAVES it.
//
//     A board on the third floor is reached by a cable running up to
//     it; the feeder carrying on runs back DOWN before it goes
//     anywhere. The figure at the board is where the flats hang.
//     Everything past it starts from the board's OUTPUT.
//
//     The run down was read from `MSDB_Down_M` on the stop's own
//     feature. A stop at a board is a FEEDER POINT — the board is a
//     separate feature in the same place, and the point carries
//     `At_Joint_ID` naming it. So the lookup found nothing on every
//     drawing and added nothing: B4 read 0.08% from B3 while B3's own
//     panel said 0.17% leaving.
{
  const feeder = readFileSync("./src/features/gis/feeder.js", "utf8");
  const vd = readFileSync("./src/features/gis/voltDrop.js", "utf8");

  if (!/downM: boardDownAt\(f\),/.test(feeder)) {
    fail("a stop does not carry the run down of the board it stands on");
  }
  if (!/const named = f\?\.Attributes\?\.At_Joint_ID;/.test(feeder)) {
    fail("the board is not resolved from the point's At_Joint_ID");
  }
  if (/Number\(sn\.feature\?\.Attributes\?\.MSDB_Down_M\)/.test(vd)) {
    fail("the run down is read from the stop's own feature, which is a "
      + "feeder point and never carries it");
  }
  /* ── Charged as METRES on the leg leaving the board ──

     The first attempt bolted an extra ohms-and-percent onto the total.
     That moved the figure while `Leg charged (m)` still read the drawn
     length \u2014 18.4 m on the export for a run that is 27.4 m of
     conductor. A number that changes with nothing on the sheet to
     explain it is worse than one that is wrong, because it cannot be
     argued with.

     As metres, the length, the impedance, the drop and the export all
     agree, and the load is right without being chosen: the leg leaving
     a board carries what leaves the board. */
  /* Charged only where the walk CARRIES ON: at the board the run down
     has not been travelled, and leaving the metres on the counter
     charged them to the board's own figure as a remainder \u2014 B3 read
     0.821% against B4's 0.771%, the board worse than the stop beyond
     it, which cannot happen. */
  if (!/legLenM = cur === targetIdx \? 0 : \(Number\(sn\.downM\) \|\| 0\);/.test(vd)) {
    fail("the run down is not charged as metres on the leg leaving the "
      + "board, so the export's charged length cannot show it");
  }
  if (/const beyond = onwardIdx/.test(vd)) {
    fail("the run down is still added as a separate drop as well, so it is "
      + "counted twice");
  }

  /* And the arithmetic: the board's own figure must not move, and
     everything past it must. */
  const model = { nodes: [[0, 0], [50, 0], [100, 0]], S: 0, parent: [-1, 0, 1],
    cum: [3, 3, 3], cumKva: [30, 30, 30] };
  const cable = { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 };
  const stopsWith = (down) => [
    { index: 1, feature: { Attributes: { Span_Label: "board" } }, cableSizeId: 1, downM: down },
    { index: 2, feature: { Attributes: { Span_Label: "beyond" } }, cableSizeId: 1 },
  ];
  const pctAt = (target, down) => cumulativeToNode({ model, targetIdx: target,
    stops: stopsWith(down), cableById: () => cable, voltageV: 400,
    transformer: { Loop_Impedance_Ohm: 0.02 } }).pct;

  if (Math.abs(pctAt(1, 9) - pctAt(1, null)) > 1e-9) {
    fail("the run down changed the figure AT the board, where the flats hang");
  }
  if (!(pctAt(2, 9) > pctAt(2, null))) {
    fail("the run down costs nothing beyond the board, so a stop past it "
      + "reads the board's arriving figure");
  }
  /* Nothing flowing past means nothing dropping: a board at the end of
     a circuit is not charged for a cable carrying no load. */
  const idle = { ...model, cumKva: [30, 30, 30], cum: [3, 3, 3] };
  const zero = cumulativeToNode({ model: idle, targetIdx: 2,
    stops: [{ index: 1, feature: { Attributes: {} }, cableSizeId: 1, downM: 9 },
      { index: 2, feature: { Attributes: {} }, cableSizeId: 1 }],
    cableById: () => cable, voltageV: 400, ampsThroughOverride: 0,
    transformer: { Loop_Impedance_Ohm: 0.02 } });
  if (!Number.isFinite(zero.pct)) fail("the figure past a board is not a number");
}

// 29. A stop beyond a board is never better than what leaves it.
//
//     The invariant somebody spotted from the screen: if 0.17% leaves
//     the board, a stop downstream cannot read 0.10%. It held only if
//     the panel and the cascade cost the run down from the SAME load,
//     and they did not — the cascade used `ampsThrough`, which is the
//     load at whichever node the call happens to be measuring.
{
  /* Four nodes, and the load KEEPS dropping past the board: 10 kVA of
     flats at the board, 30 leaving it, 10 by the far end.

     Three nodes could not tell the two rules apart \u2014 the load at the
     target and the load leaving the board were the same number, so
     costing the riser from either gave the same answer and a wrong
     rule passed. */
  const model = { nodes: [[0, 0], [50, 0], [100, 0], [150, 0]], S: 0,
    parent: [-1, 0, 1, 2], cum: [4, 4, 3, 1], cumKva: [40, 40, 30, 10] };
  const cable = { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 };
  const stops = [
    { index: 1, feature: { Attributes: {} }, cableSizeId: 1, downM: 9 },
    { index: 2, feature: { Attributes: {} }, cableSizeId: 1 },
    { index: 3, feature: { Attributes: {} }, cableSizeId: 1 },
  ];
  const go = (t) => cumulativeToNode({ model, targetIdx: t, stops,
    cableById: () => cable, voltageV: 400,
    transformer: { Loop_Impedance_Ohm: 0.02 } });

  const atBoard = go(1);
  const beyond = go(3);          /* the far end, past the board */

  /* The panel's route to the onward load: what the levels found at the
     board, less the board's own flats. The cascade's route: `cumKva` at
     the child. They must be the same number. */
  const through = kvaOf(atBoard.ampsThrough, 400);
  const panelOnward = Math.max(0, through - 10);
  if (Math.abs(panelOnward - model.cumKva[2]) > 1e-6) {
    fail(`the panel costs the run down for ${panelOnward} kVA and the cascade `
      + `for ${model.cumKva[2]} \u2014 the two disagree about what leaves the board`);
  }

  const down = serviceVoltDrop({ cable, lengthM: 9, kva: panelOnward,
    voltageV: 400 }).pct;
  const leaving = atBoard.pct + down;
  if (!(beyond.pct >= leaving - 1e-9)) {
    fail(`a stop beyond the board reads ${beyond.pct.toFixed(3)}% against `
      + `${leaving.toFixed(3)}% leaving it \u2014 downstream cannot be better than `
      + "the figure it starts from");
  }
  /* ── Costed for the load LEAVING the board, and nothing else ──

     The invariant above holds under either rule once the legs are
     added, so it cannot tell them apart on its own. This can: change
     the load at the FAR end and the riser must not care; change the
     load leaving the board and it must.

     Under the old rule \u2014 `ampsThrough`, the load at whichever node was
     being measured \u2014 both moved it. */
  const vary = (kvaAtEnd, kvaLeaving) => cumulativeToNode({
    model: { ...model, cumKva: [40, 40, kvaLeaving, kvaAtEnd] },
    targetIdx: 3, stops, cableById: () => cable, voltageV: 400,
    transformer: { Loop_Impedance_Ohm: 0.02 },
  }).pct;

  /* Same load leaving the board, different load at the end. The legs
     move, so compare the difference the RISER makes: with the riser
     against without it. */
  const riserCost = (kvaAtEnd, kvaLeaving) => {
    const withRiser = vary(kvaAtEnd, kvaLeaving);
    const without = cumulativeToNode({
      model: { ...model, cumKva: [40, 40, kvaLeaving, kvaAtEnd] },
      targetIdx: 3, stops: [{ ...stops[0], downM: null }, stops[1], stops[2]],
      cableById: () => cable, voltageV: 400,
      transformer: { Loop_Impedance_Ohm: 0.02 },
    }).pct;
    return withRiser - without;
  };

  if (Math.abs(riserCost(10, 30) - riserCost(25, 30)) > 1e-9) {
    fail("the run down costs a different amount when only the load at the "
      + "FAR END changes \u2014 it is being costed for where the call is "
      + "measuring rather than for what leaves the board");
  }
  if (!(riserCost(10, 30) > riserCost(10, 15))) {
    fail("the run down costs the same whatever leaves the board, so it is "
      + "not costed for its own load at all");
  }

  /* And the board's own figure is not charged the run down. */
  const noDown = cumulativeToNode({ model, targetIdx: 1,
    stops: [{ ...stops[0], downM: null }, stops[1]],
    cableById: () => cable, voltageV: 400,
    transformer: { Loop_Impedance_Ohm: 0.02 } });
  if (Math.abs(noDown.pct - atBoard.pct) > 1e-9) {
    fail("the run down was charged to the board's own figure, where the "
      + "flats hang");
  }
}

/* ── A landlord supply belongs on the board ──

   A block's stair lighting, lift, door entry or pumps are fed from the
   board, off the riser, metered in the cupboard \u2014 exactly as the
   flats beside them. It is not a dwelling, so it is not in the plot
   list at all: it is a non-residential supply with a stated kVA.

   Only landlord supplies. A shop on the ground floor takes its own
   service from the network, and a board that could claim any supply
   would let a retail unit onto a domestic riser by mistake. */
{
  const board = { Feature_ID: 50, Feature_Role: "msdb", Layer_Key: "electric",
    Label: "MSDB 1", Geometry: [[0, 0]],
    Attributes: { Circuit_ID: 1, MSDB_Plot_IDs: [17], MSDB_NRS_IDs: [9] } };
  const opts = {
    plotList: [{ plot_id: 17, plot_number: "17", Property_Config_ID: 1,
      Heat_Source_ID: 2 }],
    configs: [{ Property_Config_ID: 1, Property_Type_ID: 9, Bedrooms: 2, Code: "2BF" }],
    propertyTypes: [{ Property_Type_ID: 9, Property_Type: "Flat" }],
    consumption: [{ Bedrooms: 2, Heat_Source_ID: 2, Consumption_kVA: 1.5 }],
    nrsList: [
      { NRS_ID: 9, Supply_Ref: "Landlord A", NRS_Sub_Type_ID: 3, Requested_kVA: 4 },
      { NRS_ID: 10, Supply_Ref: "Corner shop", NRS_Sub_Type_ID: 4, Requested_kVA: 20 },
    ],
    nrsSubTypes: [{ NRS_Sub_Type_ID: 3, Label: "Landlord Supply" },
      { NRS_Sub_Type_ID: 4, Label: "Retail" }],
  };

  /* Only the landlord one is offered at all. */
  const offered = landlordSupplies(opts);
  if (offered.length !== 1 || Number(offered[0].nrsId) !== 9) {
    fail(`${offered.length} supplies offered to a board; only the landlord `
      + "supply should be");
  }
  /* Matched loosely on case and spacing, because a project types its
     own sub-type labels. */
  const spaced = landlordSupplies({ ...opts,
    nrsSubTypes: [{ NRS_Sub_Type_ID: 3, Label: "  landlord supply " }] });
  if (spaced.length !== 1) fail("the sub-type match is too strict about case or spacing");

  /* It reaches the build, the levels and the report as an assumed
     meter \u2014 the readers that were told about flats and not about
     supplies. */
  const world = withAssumedMeters([board], opts);
  const made = world.filter((f) => f.Attributes?.Assumed);
  if (made.length !== 2) {
    fail(`${made.length} assumed meters for a board of one flat and one `
      + "landlord supply, where 2 were expected");
  }
  const supply = made.find((f) => f.Attributes?.NRS_ID != null);
  if (!supply) fail("the landlord supply never becomes a meter, so nothing "
    + "downstream counts it");
  else {
    /* Its own stated load, not a dwelling's figure from the
       consumption table. */
    if (Number(supply.Attributes.Assumed_kVA) !== 4) {
      fail(`the supply's load reads ${supply.Attributes.Assumed_kVA} kVA, not `
        + "the figure stated on its record");
    }
    /* Named as itself: calling it a flat would have somebody looking
       for a dwelling that is not there. */
    if (!/Landlord A/.test(String(supply.Label))) {
      fail(`the supply is labelled "${supply.Label}"`);
    }
    if (supply.Plot_ID != null) {
      fail("the supply carries a plot id, which is a number from another table");
    }
    /* On the board's circuit, because it is fed through the board. */
    if (Number(supply.Attributes.Circuit_ID) !== 1) {
      fail("the supply is not on the board's circuit");
    }
  }

  /* A supply ticked onto one board is not served by another. */
  const other = { ...board, Feature_ID: 51,
    Attributes: { Circuit_ID: 1, MSDB_Plot_IDs: [], MSDB_NRS_IDs: [] } };
  const two = withAssumedMeters([board, other], opts)
    .filter((f) => f.Attributes?.NRS_ID === 9);
  if (two.length !== 1) {
    fail(`${two.length} boards claim the same landlord supply`);
  }

  /* And a caller that has not been told about supplies still gets its
     flats, exactly as before. */
  const old = withAssumedMeters([board], { ...opts, nrsList: undefined,
    nrsSubTypes: undefined });
  if (old.filter((f) => f.Attributes?.Assumed).length !== 1) {
    fail("a caller passing no supplies changed behaviour");
  }
}

/* ── A landlord supply is placed once ──

   Either it is a seed on the drawing with its own meter, or it is fed
   from a board's riser. Never both, any more than a flat can have a
   plot seed AND be on a board. Two copies is a supply counted twice
   by everything that adds up load, and a board sized for a lift that
   is also drawn across the site.

   The flats have this rule in both directions already \u2014
   `plotsAsSeeds` keeps a seeded plot off the boards, `plotsOnBoards`
   keeps a board's flat out of Place Plots. These are the same pair
   for the other table. */
{
  const board = (id, nrs) => ({ Feature_ID: id, Feature_Role: "msdb",
    Layer_Key: "electric", Geometry: [[0, 0]],
    Attributes: { Circuit_ID: 1, MSDB_NRS_IDs: nrs } });
  const seed = (nrsId) => ({ Feature_ID: 900 + nrsId, Feature_Role: "nrs",
    Layer_Key: "plot", Geometry: [[5, 5]], Attributes: { NRS_ID: nrsId } });

  if (!nrsAsSeeds([seed(9)]).has(9)) {
    fail("a supply drawn as a seed is not seen as placed");
  }
  /* Seeds only. A supply's METERS carry its NRS_ID too, so counting
     them would call a supply placed on the strength of a meter whose
     seed had been deleted \u2014 the same distinction the placement menu
     draws. */
  const meterOnly = { Feature_ID: 800, Feature_Role: "meter",
    Layer_Key: "electric", Geometry: [[5, 5]], Attributes: { NRS_ID: 12 } };
  if (nrsAsSeeds([meterOnly]).has(12)) {
    fail("a meter with no seed behind it counts as a placed supply");
  }

  if (!nrsOnBoards([board(50, [7])]).has(7)) {
    fail("a supply on a board is not seen as taken");
  }
  /* The board being edited is excluded, or opening its editor would
     empty its own list. */
  if (nrsOnBoards([board(50, [7])], { except: 50 }).has(7)) {
    fail("a board's own supplies are counted against it");
  }

  /* And the two filters are applied where they matter: the board's
     list, and the placement menu. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/!drawn\.has\(Number\(r\.NRS_ID\)\)/.test(editor)) {
    fail("a board still offers a supply that is already drawn on the plan");
  }
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* That the list is FILTERED by it, not merely that it was computed.
     An earlier version of this asserted the declaration, and deleting
     the filter while leaving the variable in place passed \u2014 which is
     the same false confidence that shipped the snap bug. */
  if (!/!onBoards\.has\(Number\(n\.NRS_ID\)\)/.test(canvas)) {
    fail("the placement menu still offers a supply that a board already feeds");
  }
}

/* ── The board's panel, laid out as asked ──

   Label and Layer on one row; Location and Floor; Circuit with its
   prefix letter and the isolate button; Fed from with the output; each
   run beside the level it produces; then the service cable, the flats
   and the notes.

   Asserted on the markup rather than by rendering, because what
   matters here is which fields share a row \u2014 and a row is a `fe-row`
   holding two fields, which the source says plainly. The rendering was
   checked by hand at the time and reported the rows above in order. */
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  const at = editor.indexOf("{isMsdb && (");
  const body = editor.slice(at, editor.indexOf("fe-msdb-h", at));

  const rowOf = (id) => {
    /* The fe-row that holds this field, if any. */
    const i = body.indexOf(`htmlFor="${id}"`);
    if (i < 0) return null;
    const before = body.lastIndexOf('className="fe-row', 0 + i);
    const closed = body.lastIndexOf("</div>\n\n", i);
    return before > closed ? before : null;
  };
  const sameRow = (a, b) => {
    const ra = rowOf(a);
    const rb = rowOf(b);
    return ra != null && ra === rb;
  };

  for (const [a, b, what] of [
    ["fe-msdb-label", "fe-msdb-layer", "the name and the layer"],
    ["fe-msdb-loc", "fe-msdb-floor", "the location and the floor"],
    ["fe-msdb-riser", "fe-msdb-down", null],
  ]) {
    if (what && !sameRow(a, b)) fail(`${what} are not on one row`);
  }
  /* The two runs must NOT share a row: each pairs with its own level
     instead, which is the point of the change. */
  if (sameRow("fe-msdb-riser", "fe-msdb-down")) {
    fail("the two runs share a row again, so neither sits beside the level "
      + "it produces");
  }

  /* The circuit row carries the letter and the isolate button. */
  const circuitRow = body.slice(body.indexOf('htmlFor="fe-msdb-circuit"'));
  const rowEnd = circuitRow.indexOf('className="fe-row"');
  const inRow = rowEnd > 0 ? circuitRow.slice(0, rowEnd) : circuitRow;
  if (!/fe-msdb-letter/.test(inRow)) {
    fail("the circuit's prefix letter is not beside the circuit");
  }
  if (!/fe-msdb-iso/.test(inRow)) {
    fail("the isolate button is not beside the circuit it isolates");
  }

  /* Renamed, because it is the service into the building rather than
     a tail off a cut-out. */
  if (/Tail cable/.test(body)) fail("the tail cable was not renamed");
  if (!/Service cable/.test(body)) fail("there is no service cable field");

  /* One box per value: the shared Layer, Fed from and circuit strip
     are all suppressed for a board, which places its own. */
  for (const [re, what] of [
    [/\{feature\.Feature_Role !== "spannode" && !isMsdb && \(/, "the layer"],
    [/\{!isMsdb && feature\.Layer_Key === "electric"\s*\n\s*&& feature\.Attributes\?\.Circuit_ID != null\s*\n\s*&& onSetCircuitOrigin/, "fed from"],
    [/\{!isMsdb && feature\.Layer_Key === "electric"\s*\n\s*&& feature\.Attributes\?\.Circuit_ID != null && \(/, "the circuit strip"],
  ]) {
    if (!re.test(editor)) {
      fail(`${what} is rendered twice for a board \u2014 two boxes writing one `
        + "value is two places to wonder which won");
    }
  }

  /* ── A label that is not a <label> still looks like one ──

     The level at a board and the circuit's prefix have nothing to
     label, so they carry a span \u2014 which inherits body type and put
     "At the board" on screen in the size of a heading beside fields
     whose names are small grey capitals. */
  const css = readFileSync("./src/styles.css", "utf8");
  if (!/\.fe-lab \{[^}]*text-transform: uppercase/.test(css)) {
    fail("the figure labels are not set like the field labels beside them");
  }

  /* Entering, not At: it pairs with "Leaving the board" below it, and
     the two read as the two ends of the board. */
  if (/fe-lab">At the board/.test(body)) {
    fail('"At the board" was not renamed');
  }
  if (!/fe-lab">Entering the board/.test(body)) {
    fail("there is no entering-the-board level");
  }

  /* ── The way is the SUBSTATION's way ──

     Which LV way carries this circuit, which is what somebody standing
     at the board wants to know: which fuse to pull. Not the link box
     output, which is a different thing and still asked for where there
     is a box. Read off the origin's way map rather than copied onto
     the board, or it goes stale the moment the circuit is moved to
     another way in the substation's editor. */
  if (!/const msdbWayNo = useMemo/.test(editor)) {
    fail("the board does not work out which way at the substation feeds it");
  }
  if (!/Number\(v\) === Number\(cid\)\) return Number\(way\)/.test(editor)) {
    fail("the way is not read from the origin's way map");
  }
  if (!/<span className="fe-lab">Way<\/span>/.test(body)) {
    fail("the way is not shown on the board");
  }

  /* The flats table's first column asks what it does. */
  if (!/<th>Assign<\/th>/.test(editor)) {
    fail("the flats table still heads its tick column On");
  }

  /* Half as wide again, because a board carries more per row than
     anything else in this editor. */
  if (!/\.fe\.fe-msdb-panel \{ width: min\(630px/.test(editor)) {
    fail("the board's panel is not widened, so its rows wrap");
  }
  if (!/"fe fe-msdb-panel"/.test(editor)) {
    fail("the board's panel never gets the class");
  }
  /* ── And the class it gets is its own ──

     `fe-board` was already the substation's way table, which is
     `display: grid`. The panel wearing that name became a grid, `.fe`'s
     flex column stopped applying, and the footer was carried out of the
     white box \u2014 with nothing failing anywhere. */
  if (/"fe fe-board"/.test(editor)) {
    fail("the board's panel reuses the way table's class, which makes the "
      + "panel a grid and drops its footer off the bottom");
  }
  if (!/\.fe-msdb-loc-row \.fld:first-child \{ flex: 3/.test(editor)) {
    fail("the location does not take three quarters of its row");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The MSDB behaves (flats on a table, load and levels derived).");
process.exit(bad ? 1 : 0);
