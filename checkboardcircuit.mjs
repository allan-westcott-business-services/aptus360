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
  circuitsFrom, circuitChoices, nextCircuitId, nextCircuitNumber, circuitReport,
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
  /* The stated rule: Circuit 1 and Circuit 2 exist, so the new one is
     Circuit 3 — and the id, the name and the letter are one number. */
  const world = [meter(1, 1), meter(2, 2)];
  if (nextCircuitNumber(world) !== 3) {
    fail("with Circuit 1 and Circuit 2 on the drawing, the newborn is not Circuit 3");
  }

  /* The screenshot's drawing: Circuit 2 and Circuit 3 in use, 1 free.
     The gap rule would name this Circuit 1 and list it UNDER them; the
     sequence rule gives Circuit 4. This is the fault the sequence rule
     exists to fix, so it is named here rather than left implied. */
  nid = 1;
  const gappy = [
    sub({ Way_Circuits: { 1: 2 } }),
    meter(2, 7),
    board({ Circuit_ID: 3 }),
  ];
  if (nextCircuitId(gappy) !== 1) {
    fail("the lasso's gap-filling rule has changed, which was not intended");
  }
  if (nextCircuitNumber(gappy) !== 4) {
    fail("with circuits 2 and 3 in use the newborn is not Circuit 4 \u2014 "
      + "the gap rule would call it Circuit 1 and list it underneath them");
  }

  /* A number claimed only by a NAME counts too: a circuit renamed by
     hand to "Circuit 9" pushes the next one to 10, so no newborn
     arrives wearing a name already on the drawing. */
  nid = 1;
  const renamed = [meter(1, 1)];
  renamed[0].Attributes.Circuit_Name = "Circuit 9";
  if (nextCircuitNumber(renamed) !== 10) {
    fail("a hand rename to a higher number does not push the sequence past it");
  }

  /* A custom name claims no number: "Front Street" on circuit 1 leaves
     the sequence at 2. */
  nid = 1;
  const custom = [meter(1, 1)];
  custom[0].Attributes.Circuit_Name = "Front Street";
  if (nextCircuitNumber(custom) !== 2) {
    fail("a custom name disturbs the sequence");
  }

  /* Two circuits started before one save: the draft's unsaved names
     ride along, so they cannot collide. */
  if (nextCircuitNumber(world, ["Circuit 3"]) !== 4) {
    fail("a second unsaved newborn collides with the first");
  }

  /* An empty drawing starts at 1. */
  if (nextCircuitNumber([]) !== 1) fail("the first circuit is not Circuit 1");

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
  /* The name and the letter agree, because they are one number. */
  if (r.letter !== "C") {
    fail("the way-only circuit's letter does not follow its number");
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

/* ── A circuit held by a board appears in the report ──

   Reported: "I can no longer delete circuits." The report groups by
   drawn METERS, so a circuit whose members are boards and cut-outs
   did not appear in it at all \u2014 and the report is the only place a
   circuit is deleted, so it could not be deleted either.

   Same shape as the levels check before it: `circuitsFrom` was taught
   that a board is a member, and this reader was not. Third time this
   session that one reader of the drawing knew and another did not. */
{
  nid = 1;
  const s = sub({ Ways: 4, Way_Circuits: { 1: 2 } });
  const b = board({ Circuit_ID: 2, Circuit_Name: "Circuit 2",
    MSDB_Plot_IDs: [11, 12, 13], MSDB_Total_kVA: 9 });
  const cut = { Feature_ID: 90, Feature_Type: "point", Feature_Role: "hdcutout",
    Layer_Key: "electric", Geometry: [[9, 9]],
    Attributes: { Circuit_ID: 2, Supply_kVA: 5 } };
  /* One ordinary meter on no circuit, so the report has something to
     open with and the drawing is not a special case. */
  const m = { Feature_ID: 95, Feature_Role: "meter", Layer_Key: "electric",
    Plot_ID: 7, Geometry: [[1, 1]], Attributes: {} };

  const r = circuitReport([s, b, cut, m], { plotById: () => ({ kva_load: 2 }) });
  if (r.error) fail(`the report refuses the drawing: ${r.error}`);
  else {
    const c2 = r.circuits.find((c) => Number(c.id) === 2);
    if (!c2) {
      fail("a circuit whose members are a board and a cut-out is missing from "
        + "the report, so there is nothing to press Delete on");
    } else {
      if (c2.boards !== 1) fail(`the circuit shows ${c2.boards} board(s)`);
      if (c2.flats !== 3) fail(`the circuit shows ${c2.flats} flat(s)`);
      if (c2.cutouts !== 1) fail(`the circuit shows ${c2.cutouts} cut-out(s)`);
      /* And its load, or it reads as an empty circuit beside a Delete
         button that looks safe to press. */
      if (c2.boardKva !== 9) fail(`the board's kVA is reported as ${c2.boardKva}`);
    }
  }

  /* A drawing with NO drawn meters at all still opens: the flats-only
     case, where the report matters most. */
  const flatsOnly = circuitReport([s, b], { plotById: () => null });
  if (flatsOnly.error) {
    fail(`a flats-only drawing cannot open the report: ${flatsOnly.error}`);
  }

  /* Deleting has to take the board off the circuit too, or the circuit
     comes back the moment anything reads the drawing again. */
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const held = features\.filter\(\(f\) =>\s*\n\s*\(f\.Feature_Role === "msdb" \|\| f\.Feature_Role === "hdcutout"\) && mine\(f\)\)/.test(canvas)) {
    fail("deleting a circuit unassigns only its meters, so a board keeps "
      + "naming it and the circuit returns");
  }
  if (!/\[\.\.\.meters, \.\.\.held\]\.map/.test(canvas)) {
    fail("the boards are found but not actually unassigned");
  }
}

// 6. The pieces are wired in, not just written.
{
  const editor = readFileSync("src/features/gis/FeatureEditor.jsx", "utf8");
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/\+ New circuit/.test(editor)) {
    fail("the substation editor offers no way to start a circuit on a spare way");
  }
  if (!/nextCircuitNumber\(/.test(editor)) {
    fail("the newborn is not named at birth, so it arrives as a bare number");
  }
  if (!/Circuit_Names: \{\s*\n?\s*\.\.\.\(prev\.Attributes\.Circuit_Names \|\| \{\}\),\s*\n?\s*\[id\]: name,/.test(editor)) {
    fail("the birth name is not stored on the substation's map, so it has no home until a member carries it");
  }
  if (!/flats \+= boardFlatCount\(b\)/.test(editor)) {
    fail("the way rows count flats their own way instead of the board's way, "
      + "which is how a board of picked plots read 0 meters against a real kVA");
  }

  /* ── The name box has to be wide enough to read ──

     A memberless circuit puts "nothing linked" and "Clear this way"
     in the same flex cell as the name input. With `width: 100%` and
     nothing to stop it shrinking, the input was the only thing that
     could give — and it collapsed to about thirty pixels, so a
     newborn circuit looked as though it had no name at all. The value
     was right the whole time; the box was too narrow to show it.

     Held here because it is not visible in any test that reads
     values: jsdom computes no layout, and the harness that clicked
     the button reported "Circuit 4" from a box nobody could read. */
  if (!/\.fe-cname \{[^}]*min-width:/.test(editor)) {
    fail("the circuit name box can be crushed to nothing by the memberless "
      + "extras beside it, which reads as a circuit with no name");
  }
  if (!/\.fe-cwrap \{[^}]*flex-wrap: wrap/.test(editor)) {
    fail("the way row cannot wrap, so anything added beside the name box "
      + "comes out of the name box's width");
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
