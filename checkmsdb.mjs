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
  flatsFromPlots, servedFlats, isFlatType, shortType, riserDrop,
  assumedMeters, msdbSupply, withAssumedMeters,
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
    if (flats.some((m) => m.houseType !== "Flat on MSDB")) {
      fail("a flat does not say where it hangs from, so a reader looks for "
        + "it on the drawing and cannot find it");
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

console.log(bad ? `\n${bad} problem(s)`
  : "The MSDB behaves (flats on a table, load and levels derived).");
process.exit(bad ? 1 : 0);
