/* A circuit without a lasso.

   A block of flats fed from an MSDB has no seeds on the drawing and no
   drawn meters — the dwellings are a table on the board — so there is
   nothing for Link to Circuit to draw round. The circuit is started on
   a spare LV way in the substation's editor instead, offered by the
   board's picker while it still holds nothing, and membered the moment
   the board saves onto it. From there the flats' ASSUMED meters carry
   it into the build and the report exactly as drawn meters would.

   Three rules hold that up, and each is tested where it lives:
   circuitsFrom counts a board as a member; nextCircuitId will not
   reissue a number a way allocation holds; and circuitChoices offers
   the way-only circuit — with the origin whose board it was taken on,
   because on a two-origin drawing that IS the answer to "fed from". */
import { readFileSync } from "node:fs";
import {
  circuitsFrom, circuitChoices, nextCircuitId, nextCircuitName,
} from "./src/features/gis/electric.js";
import { withAssumedMeters, boardFlatCount } from "./src/features/gis/msdb.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

let nid = 1;
const sub = (attrs = {}) => ({ Feature_ID: nid++, Feature_Type: "point",
  Feature_Role: "substation", Layer_Key: "electric",
  Geometry: [[0, 0]], Attributes: attrs });
const board = (attrs = {}) => ({ Feature_ID: nid++, Feature_Type: "point",
  Feature_Role: "msdb", Layer_Key: "electric",
  Geometry: [[50, 0]], Attributes: attrs });
const meter = (cid, plotId) => ({ Feature_ID: nid++, Feature_Type: "point",
  Feature_Role: "meter", Layer_Key: "electric", Plot_ID: plotId,
  Geometry: [[9, 9]], Attributes: { Circuit_ID: cid, Circuit_Name: `Circuit ${cid}`,
    Circuit_Letter: "A" } });

// 1. A board is a member in its own right: the circuit exists with no
//    drawn meter anywhere, which is the whole flats-only case.
{
  nid = 1;
  const b = board({ Circuit_ID: 3, Circuit_Name: "Block A",
    Circuit_Letter: "C" });
  const cs = circuitsFrom([sub(), b]);
  if (cs.length !== 1) fail("a board on a circuit does not make the circuit exist");
  else {
    if (cs[0].id !== 3 || cs[0].name !== "Block A" || cs[0].letter !== "C") {
      fail("the board's circuit loses its name or letter on the way through");
    }
    if (cs[0].boards.length !== 1 || cs[0].meters.length !== 0) {
      fail("the board is not counted where members are counted");
    }
  }
  /* And the gate the build menu reads is this same list, so the
     flats-only design can build at all. */
  if (!circuitsFrom([b]).length) {
    fail("the build gate would still read zero circuits on a flats-only design");
  }
}

// 2. A meter-borne circuit keeps its own name when a board joins it —
//    one fact, first spelling wins.
{
  nid = 1;
  const m = meter(2, 7);
  m.Attributes.Circuit_Name = "Front Street";
  const b = board({ Circuit_ID: 2, Circuit_Name: "Circuit 2" });
  const cs = circuitsFrom([m, b]);
  if (cs.length !== 1 || cs[0].name !== "Front Street") {
    fail("a board joining a named circuit renames it");
  }
  if (cs[0].meters.length !== 1 || cs[0].boards.length !== 1) {
    fail("members of two kinds are not both counted");
  }
}

// 3. The number a spare way holds is not reissued.
{
  nid = 1;
  const s = sub({ Way_Circuits: { 1: 1, 3: 2 } });
  if (nextCircuitId([s]) !== 3) {
    fail("a way allocation does not hold its number, so the next lasso "
      + "would put two circuits behind one id");
  }
  /* Meters and ways together: the lowest free number, counting both. */
  if (nextCircuitId([s, meter(3, 1)]) !== 4) {
    fail("ways and members are not counted together for the next id");
  }
}

// 4. The picker offers the newborn circuit, and names the origin whose
//    board it was taken on.
{
  nid = 1;
  const s = sub({ Way_Circuits: { 2: 5 } });
  const choices = circuitChoices([s]);
  if (choices.length !== 1) {
    fail("a circuit born on a spare way is not offered anywhere");
  } else {
    const c = choices[0];
    if (!c.wayOnly || c.way !== 2 || Number(c.originId) !== Number(s.Feature_ID)) {
      fail("the way-only entry does not say which way and which origin hold it");
    }
    if (c.id !== 5 || !c.letter) {
      fail("the way-only entry has no usable id or letter");
    }
  }
  /* Once the board saves onto it the circuit is membered, and the
     way-only entry gives way to the real one rather than doubling it. */
  const b = board({ Circuit_ID: 5 });
  const after = circuitChoices([s, b]);
  if (after.length !== 1 || after[0].wayOnly) {
    fail("a membered circuit is still offered as way-only, or offered twice");
  }
}

// 4b. Born named, and named in sequence.
{
  nid = 1;
  /* Circuits 1 and 2 exist; the next id is 3 and its name is Circuit 3 —
     the two rules are one rule on an unrenamed drawing. */
  const world = [meter(1, 1), meter(2, 2)];
  const id = nextCircuitId(world);
  if (id !== 3) fail("with circuits 1 and 2, the next id is not 3");
  if (nextCircuitName(id, world) !== "Circuit 3") {
    fail("with Circuit 1 and Circuit 2 on the drawing, the newborn is not Circuit 3");
  }

  /* A hand rename stands, and the newborn walks past it rather than
     arriving as a duplicate: id 3 is free, but somebody has called
     another circuit "Circuit 3", so the name moves on to Circuit 4. */
  const renamed = [meter(1, 1), meter(2, 2)];
  renamed[1].Attributes.Circuit_Name = "Circuit 3";
  if (nextCircuitName(nextCircuitId(renamed), renamed) !== "Circuit 4") {
    fail("a newborn arrives wearing a name somebody already gave another circuit");
  }

  /* A custom name frees nothing and blocks nothing: "Front Street" on
     circuit 1 leaves the numbers alone. */
  const custom = [meter(1, 1), meter(2, 2)];
  custom[0].Attributes.Circuit_Name = "Front Street";
  if (nextCircuitName(nextCircuitId(custom), custom) !== "Circuit 3") {
    fail("a custom name disturbs the sequence");
  }

  /* Two circuits started before one save: the draft's unsaved names
     ride along as extras, so they cannot share a name. */
  if (nextCircuitName(4, world, ["Circuit 3", "Circuit 4"]) !== "Circuit 5") {
    fail("a second unsaved newborn shares the first one's name");
  }

  /* The substation stores the birth name, and the picker reads it —
     a memberless circuit has no member to carry its name. */
  nid = 1;
  const s = sub({ Way_Circuits: { 1: 3 }, Circuit_Names: { 3: "Circuit 3" } });
  const c = circuitChoices([s]).find((x) => x.id === 3);
  if (!c || c.name !== "Circuit 3") {
    fail("the stored birth name is not the name the picker offers");
  }
  /* And a stored rename travels the same road. */
  s.Attributes.Circuit_Names[3] = "Block A risers";
  const r = circuitChoices([s]).find((x) => x.id === 3);
  if (!r || r.name !== "Block A risers") {
    fail("renaming a memberless circuit on the board does not reach the picker");
  }
}

// 5. The board's flats reach the build as meters on the circuit — the
//    membership means what membership means.
{
  nid = 1;
  const b = board({
    Circuit_ID: 4, Circuit_Name: "Block B", Circuit_Letter: "D",
    MSDB_Apartments: [
      { id: "a1", ref: "1", bedrooms: 2, distanceM: 5 },
      { id: "a2", ref: "2", bedrooms: 1, distanceM: 8 },
    ],
    MSDB_Plot_IDs: [101, 102],
  });
  const world = withAssumedMeters([sub(), b], {
    /* The shapes the real lists have: a plot names its config, the
       config names its type and bedrooms, and only a type reading as
       a flat is a flat — a board cannot serve a detached house. */
    plotList: [
      { plot_id: 101, Property_Config_ID: 1, Heat_Source_ID: 1 },
      { plot_id: 102, Property_Config_ID: 2, Heat_Source_ID: 1 },
    ],
    configs: [
      { Property_Config_ID: 1, Property_Type_ID: 9, Bedrooms: 2, Code: "2BF" },
      { Property_Config_ID: 2, Property_Type_ID: 9, Bedrooms: 1, Code: "1BF" },
    ],
    propertyTypes: [{ Property_Type_ID: 9, Property_Type: "Flat" }],
    consumption: [],
  });
  const cs = circuitsFrom(world);
  const c4 = cs.find((c) => c.id === 4);
  if (!c4) fail("the assumed world loses the board's circuit");
  else if (c4.meters.length !== 2) {
    fail(`two flats should stand as two assumed meters on the circuit; got ${c4.meters.length}`);
  }
}

// 5b. The way row's flat count reads the board the way the board reads
//     itself. The screenshot that caught this: a board of one PICKED
//     plot on Circuit 3, its 1.5 kVA arriving on the way while the
//     count beside it read "0 meters" — the count was taken from the
//     manual apartment table alone, and this board keeps its flats as
//     picked plots.
{
  const picked = { Attributes: { MSDB_Plot_IDs: [19], MSDB_Total_kVA: 1.5 } };
  if (boardFlatCount(picked) !== 1) {
    fail("a board of one picked plot does not count as one flat");
  }
  const table = { Attributes: { MSDB_Apartments: [
    { id: "a1" }, { id: "a2" }, { id: "a3" },
  ] } };
  if (boardFlatCount(table) !== 3) {
    fail("a board on the original manual table loses its count");
  }
  /* Both present: the picked plots win, because they are what the
     load, the levels and the bill are worked from. */
  const both = { Attributes: {
    MSDB_Plot_IDs: [19, 20], MSDB_Apartments: [{ id: "a1" }],
  } };
  if (boardFlatCount(both) !== 2) {
    fail("with both mechanisms present the count does not follow the picked plots");
  }
  if (boardFlatCount({ Attributes: {} }) !== 0) {
    fail("an empty board does not count zero");
  }
}

// 6. The pieces are wired in, not just written.
{
  const editor = readFileSync("src/features/gis/FeatureEditor.jsx", "utf8");
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/\+ New circuit/.test(editor)) {
    fail("the substation editor offers no way to start a circuit on a spare way");
  }
  if (!/nextCircuitName\(id,/.test(editor)) {
    fail("the newborn is not named at birth, so it arrives as a bare number");
  }
  if (!/Circuit_Names: \{\s*\n?\s*\.\.\.\(prev\.Attributes\.Circuit_Names \|\| \{\}\),\s*\n?\s*\[id\]: name,/.test(editor)) {
    fail("the birth name is not stored on the substation's map, so it has no home until a member carries it");
  }
  if (!/flats \+= boardFlatCount\(b\)/.test(editor)) {
    fail("the way rows count flats their own way instead of the board's way, "
      + "which is how a board of picked plots read 0 meters against a real kVA");
  }
  if (!/choices\.map\(\(c\) => \(/.test(editor)) {
    fail("the board's picker still reads only membered circuits, so a newborn one cannot be assigned");
  }
  if (!/Circuit_Origin_ID: c\.originId/.test(editor)) {
    fail("picking a way-only circuit on a two-origin drawing does not carry who feeds it");
  }
  /* The spare-way button writes the DRAFT, like the free button beside
     it: written straight to the database the row would not move, and
     Save would put the old map back over it. Way and name land in one
     update — a way with no name is the state this exists to remove. */
  if (!/Way_Circuits: \{\s*\n?\s*\.\.\.\(prev\.Attributes\.Way_Circuits \|\| \{\}\),\s*\n?\s*\[way\]: id,/.test(editor)) {
    fail("the new circuit is not written to the draft's way map");
  }
  /* Saving the board completes the circuit: node A0 and the LV way are
     the canvas's half, ensured rather than assumed. */
  if (!/savedCid/.test(canvas) || !/originNodeFor\(world, cid\)/.test(canvas)) {
    fail("saving a board onto a circuit does not ensure the origin node");
  }
  if (!/const wayHeld = origins\.some/.test(canvas)) {
    fail("saving a board onto a circuit does not ensure the way is booked");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A circuit can be born on a spare way and membered by a board (flats-only designs build).");
process.exit(bad ? 1 : 0);
