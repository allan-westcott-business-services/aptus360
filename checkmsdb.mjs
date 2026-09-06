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
  FLOORS, TYPICAL_MAX, apartmentRows, blankApartment, apartmentLoad,
  msdbLoad, apartmentLevels, worstApartment, msdbText,
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

const board = (attrs = {}) => ({
  Feature_Role: "msdb", Feature_Type: "point", Layer_Key: "electric",
  Attributes: {
    MSDB_Location: "Core B riser", MSDB_Floor: "2nd", MSDB_Heat_Source_ID: 2,
    MSDB_Apartments: [
      { id: "a1", ref: "201", bedrooms: 1, distanceM: 4 },
      { id: "a2", ref: "202", bedrooms: 2, distanceM: 9 },
      { id: "a3", ref: "203", bedrooms: 3, distanceM: 18 },
    ],
    ...attrs,
  },
});

// 1. The load comes from the consumption table, on both keys.
{
  const l = msdbLoad(board(), consumption);
  if (!near(l.kva, 6)) fail(`three flats came to ${l.kva} kVA, wanted 6`);
  if (l.count !== 3) fail(`counted ${l.count} flats, wanted 3`);

  /* Heat source is part of the key. A board that says gas and one that
     says a heat pump do not draw the same. */
  const hp = msdbLoad(board({ MSDB_Heat_Source_ID: 5,
    MSDB_Apartments: [{ id: "a1", ref: "1", bedrooms: 2, distanceM: 5 }] }), consumption);
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
  const l = msdbLoad(board({ MSDB_Apartments: [
    { id: "a1", ref: "1", bedrooms: 9, distanceM: 5 },
  ] }), consumption);
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
  const rows = apartmentLevels(board(), { at, cable, consumption });

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
  const noCheck = apartmentLevels(board(), { cable, consumption });
  if (noCheck.some((r) => r.pct != null)) {
    fail("a flat reports a level with no figure for the board it hangs off");
  }
  /* No cable named for the tails. */
  const noCable = apartmentLevels(board(), { at: { ohms: 0, pct: 4 }, consumption });
  if (noCable.some((r) => r.pct != null)) {
    fail("a flat reports a level with no cable specified for its tail");
  }
  if (!noCable.every((r) => r.missingSpec)) {
    fail("a missing tail cable is not reported");
  }
  /* A flat with no load figure gets no level either: a drop computed
     from a load nobody knows is a number with nothing behind it. */
  const noLoad = apartmentLevels(board({ MSDB_Apartments: [
    { id: "a1", ref: "1", bedrooms: 9, distanceM: 5 },
  ] }), { at: { ohms: 0, pct: 4 }, cable, consumption });
  if (noLoad[0].pct != null) fail("a flat with no load figure was given a level");
}

// 5. The shape of a row, and of the board.
{
  if (apartmentRows({}).length !== 0) fail("a board with no table reports rows");
  if (apartmentRows({ Attributes: { MSDB_Apartments: "nonsense" } }).length !== 0) {
    fail("a malformed table throws or reports rows");
  }
  const b = blankApartment(4);
  if (b.bedrooms == null || b.distanceM == null) {
    fail("a new row is missing the two things a row is asked for");
  }
  if (!FLOORS.includes("Ground")) fail("there is no ground floor");
  if (TYPICAL_MAX !== 45) fail(`the expected maximum is ${TYPICAL_MAX}, not 45`);
  if (!/2nd floor/.test(msdbText(board(), consumption))) {
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
    ["bedrooms", /bedrooms: Number\(e\.target\.value\)/],
    ["distance", /distanceM: Number\(e\.target\.value\)/],
  ]) {
    if (!re.test(editor)) fail(`a row cannot record its ${what}`);
  }
  if (!/Location/.test(editor) || !/Floor/.test(editor)) {
    fail("the board's location and floor are not asked for");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The MSDB behaves (flats on a table, load and levels derived).");
process.exit(bad ? 1 : 0);
