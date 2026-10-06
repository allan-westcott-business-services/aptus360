/* ── A link box's input node wears the colour of the cable on it ──
 *
 *   node checklinkboxinput.mjs
 *   node checklinkboxinput.mjs path/to/drawing.json
 *
 * ── Why this exists, and why checklinkbox.mjs did not catch it ──
 *
 * Reported from drawing 35: "the input node of Link Box B1 is not
 * picking up the colour of the cable on its input."
 *
 * Two link boxes, one per circuit, standing 1.73 m apart at the end of
 * the POC trench. The canvas settled which cable was on a box's input
 * by walking the mains and taking the FIRST whose end fell within
 * SNAP_TOL — 12 metres — of the box, excluding only that box's own
 * outputs. At 1.73 m apart, each box's circle holds the other box's
 * input cable and the other box's output as well as its own, so the
 * walk returned whichever came first by id: cable A1 (57970) before
 * cable B1 (57982). Box A1 was right by luck. Box B1 drew its input in
 * circuit 1's green with circuit 2's orange cable on it.
 *
 * checklinkbox.mjs does assert on this dot — three times. All three are
 * regexes over GISCanvasPage.jsx: that the dot call reads
 * `dot(p.x - ux * half, p.y - uy * half, inInk);`, that
 * `feederPlan.get(Number(line.Feature_ID))?.colour` appears, and that
 * `Link_Way != null) continue;` appears "so an output's cable cannot be
 * taken as the input". Every one passed throughout. They pinned the
 * source text of a routine that was choosing the wrong cable — and the
 * third one was pinning the very line whose narrowness was the fault,
 * because it tested Link_Way against THIS box only.
 *
 * So these tests resolve the answer instead. The choice now lives in
 * inputCableOf() in linkWays.js, outside the canvas, for exactly that
 * reason.
 */

import { readFileSync, existsSync } from "node:fs";
import { inputCableOf } from "./src/features/gis/linkWays.js";

let pass = 0;
const fails = [];
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; return; }
  fails.push(`${name}${extra ? ` — ${extra}` : ""}`);
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ── 1. Two boxes side by side: drawing 35's shape ────────────────── */
//
// Reduced to the four cables and two boxes that matter, at the real
// coordinates and the real ids, so the ordering accident is reproduced
// rather than described.

const main = (id, cct, from, to, extra = {}) => ({
  Feature_ID: id, Feature_Type: "line", Layer_Key: "electric",
  Label: extra.Label ?? null, Geometry: [from, to],
  Attributes: { Line_Type: "elec_main", Circuit_ID: cct, ...extra },
});
const box = (id, cct, at, extra = {}) => ({
  Feature_ID: id, Feature_Type: "point", Layer_Key: "electric",
  Feature_Role: "linkbox", Geometry: [at],
  Attributes: { Circuit_ID: cct, Link_Ways: 2, ...extra },
});

const POC1 = [157.47, 187.90];
const POC2 = [159.54, 188.04];
const BOX_A = [199.24, 157.37];
const BOX_B = [199.24, 155.64];           // 1.73 m from BOX_A

{
  const boxA = box(57960, 1, BOX_A, { Span_Label: "A1", Connects: [57970, 57971] });
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1", Connects: [57982, 57983] });
  const world = [
    boxB, boxA,
    main(57970, 1, POC1, BOX_A, { Label: "A1", Connects: [57960] }),
    main(57971, 1, BOX_A, [172.8, 121.6], { Label: "A2", Link_Box_ID: 57960, Link_Way: 1 }),
    main(57982, 2, POC2, BOX_B, { Label: "B1", Connects: [57959] }),
    main(57983, 2, BOX_B, [66.4, 71.2], { Label: "B2", Link_Box_ID: 57959, Link_Way: 1 }),
  ];

  /* THE FAULT. Cable A1 sorts first and sits 1.73 m from box B. */
  eq("box B1 takes the cable on its own input, not the neighbour's",
     inputCableOf(boxB, world)?.Label, "B1");
  eq("box A1 still takes its own",
     inputCableOf(boxA, world)?.Label, "A1");

  /* And with the list in the other order, in case the answer is only
     ever the first or only ever the last. */
  const flipped = [...world].reverse();
  eq("box B1 is right whichever order the features come in",
     inputCableOf(boxB, flipped)?.Label, "B1");
  eq("box A1 too",
     inputCableOf(boxA, flipped)?.Label, "A1");
}

/* ── 2. Each filter on its own ────────────────────────────────────── */

{
  /* No Connects anywhere, so proximity has to carry it — and must take
     the NEAREST rather than the first inside the tolerance. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1" });
  const world = [
    boxB, box(57960, 1, BOX_A, { Span_Label: "A1" }),
    main(57970, 1, POC1, BOX_A, { Label: "A1" }),
    main(57982, 2, POC2, BOX_B, { Label: "B1" }),
  ];
  eq("with nothing recorded, the nearest end wins, not the first found",
     inputCableOf(boxB, world)?.Label, "B1");
}
{
  /* ── This case exists because a mutation survived ──

     Reverting nearest-end to first-found changed nothing above: the
     decoy there is on another circuit, so the circuit filter removed
     it before the distance was ever compared. Two cables on the SAME
     circuit, both unstamped, both inside the tolerance, with the
     nearer one listed SECOND — now only the nearest rule can answer. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1" });
  const world = [
    boxB,
    main(57970, 2, POC1, [199.24, 160.0], { Label: "4.4 m away, listed first" }),
    main(57982, 2, POC2, BOX_B, { Label: "B1" }),
  ];
  eq("the nearest end wins over the first one inside the tolerance",
     inputCableOf(boxB, world)?.Label, "B1");
}
{
  /* ── And this one ──

     Narrowing the output test back to "this box's own outputs", which
     is what the canvas did and what checklinkbox.mjs pinned, also
     survived: the neighbour's output was 1.73 m out and the real input
     0 m, so the nearest rule covered for it. Put the neighbour's
     output exactly ON this box and the real input further off, with
     nothing recorded, and only the wider exclusion can answer. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1" });
  const world = [
    boxB,
    main(57971, 2, BOX_B, [172.8, 121.6],
         { Label: "neighbour's output, right on top of this box",
           Link_Box_ID: 57960, Link_Way: 1 }),
    main(57982, 2, POC2, [199.24, 158.0], { Label: "B1" }),
  ];
  eq("a cable carrying ANY box's way is excluded, however close it is",
     inputCableOf(boxB, world)?.Label, "B1");
}
{
  /* Circuit alone is enough, even with the cable 0 m away on the wrong
     circuit and listed first. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1" });
  const world = [
    boxB,
    main(57970, 1, POC1, BOX_B, { Label: "A1 (wrong circuit, exactly here)" }),
    main(57982, 2, POC2, BOX_B, { Label: "B1" }),
  ];
  eq("a cable on another circuit is not this box's input",
     inputCableOf(boxB, world)?.Label, "B1");
}
{
  /* The neighbour's OUTPUT, 1.73 m away and on the same circuit. The
     old test only excluded this box's own outputs. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1" });
  const world = [
    boxB,
    main(57971, 2, BOX_A, [172.8, 121.6],
         { Label: "someone else's output", Link_Box_ID: 57960, Link_Way: 1 }),
    main(57982, 2, POC2, BOX_B, { Label: "B1" }),
  ];
  eq("another box's output is not this box's input",
     inputCableOf(boxB, world)?.Label, "B1");
}
{
  /* ── A cable that declares itself the input outranks everything ──

     Every main on drawing 35 carries a Link_Connections claim — the
     inputs say `way: "in"` and name their box, the outputs say their
     way number. That is the drawing stating the answer outright, and it
     was being settled by Connects and proximity instead.

     Here the decoy is nearer AND in the box's Connects, so only the
     declaration can give the right answer. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1", Connects: [57970, 57982] });
  const world = [
    boxB,
    main(57970, 2, POC1, BOX_B, { Label: "nearer, and in the box's Connects" }),
    main(57982, 2, POC2, [199.24, 160.0], {
      Label: "B1", Link_Connections: { end: { box: 57959, way: "in" } },
    }),
  ];
  eq("a cable declaring itself this box's input beats Connects and distance",
     inputCableOf(boxB, world)?.Label, "B1");
}
{
  /* And a declaration naming ANOTHER box is not this box's input. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1" });
  const world = [
    boxB,
    main(57970, 2, POC1, BOX_B, {
      Label: "declares itself the OTHER box's input",
      Link_Connections: { end: { box: 57960, way: "in" } },
    }),
    main(57982, 2, POC2, BOX_B, {
      Label: "B1", Link_Connections: { end: { box: 57959, way: "in" } },
    }),
  ];
  eq("a declaration naming another box is not this box's input",
     inputCableOf(boxB, world)?.Label, "B1");
}
{
  /* A way claimed through Link_Connections, which is the editor's
     route. "in" is the input naming itself and must NOT be excluded. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1" });
  const claimedOut = main(57971, 2, BOX_B, [172.8, 121.6], {
    Label: "claims output 2", Link_Connections: { start: { box: 57959, way: 2 } },
  });
  const claimedIn = main(57982, 2, POC2, BOX_B, {
    Label: "B1", Link_Connections: { end: { box: 57959, way: "in" } },
  });
  eq("a way claimed through Link_Connections is an output too",
     inputCableOf(boxB, [boxB, claimedOut, claimedIn])?.Label, "B1");
  eq("and a Link_Connections way of \"in\" is the input, not excluded",
     inputCableOf(boxB, [boxB, claimedIn])?.Label, "B1");
}
{
  /* Connects beats proximity: the right cable is further away. */
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1", Connects: [57982] });
  const world = [
    boxB,
    main(57970, 2, POC1, [199.3, 155.7], { Label: "nearer but unrelated" }),
    main(57982, 2, POC2, [205.0, 160.0], { Label: "B1" }),
  ];
  eq("a cable the box names beats a nearer one it does not",
     inputCableOf(boxB, world)?.Label, "B1");
}
{
  /* Span_Anchor is preferred over Geometry[0] where it exists. */
  const boxB = box(57959, 2, [0, 0], { Span_Label: "B1", Span_Anchor: BOX_B });
  const world = [boxB, main(57982, 2, POC2, BOX_B, { Label: "B1" })];
  eq("the anchor is used where the box has one",
     inputCableOf(boxB, world)?.Label, "B1");
}

/* ── 3. What it must NOT find ─────────────────────────────────────── */

{
  const boxB = box(57959, 2, BOX_B, { Span_Label: "B1" });
  ok("no cable at all gives null, so the dot keeps its default",
     inputCableOf(boxB, [boxB]) === null);
  ok("a cable far away gives null rather than the nearest thing anywhere",
     inputCableOf(boxB, [boxB, main(57982, 2, POC2, [40, 40], {})]) === null);
  ok("a service cable is not an input",
     inputCableOf(boxB, [boxB, {
       Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
       Geometry: [POC2, BOX_B], Attributes: { Line_Type: "elec_service", Circuit_ID: 2 },
     }]) === null);
  ok("a trench is not an input",
     inputCableOf(boxB, [boxB, {
       Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
       Geometry: [POC2, BOX_B], Attributes: { Line_Type: "trench_main" },
     }]) === null);
  ok("no box gives null rather than throwing", inputCableOf(null, []) === null);
  /* Hidden layers: the canvas passes `visible`, so a box whose mains
     are switched off must keep its default rather than name a cable
     nobody can see. Expressed as "an empty list finds nothing". */
  ok("an empty world finds nothing", inputCableOf(boxB, []) === null);
}
{
  /* A box with no circuit set must still work — the circuit filter is
     skipped where either side does not know. */
  const bare = box(57959, undefined, BOX_B, { Span_Label: "B1" });
  delete bare.Attributes.Circuit_ID;
  eq("a box with no circuit falls back to geometry rather than finding nothing",
     inputCableOf(bare, [bare, main(57982, 2, POC2, BOX_B, { Label: "B1" })])?.Label,
     "B1");
}

/* ── 4. The real drawing ──────────────────────────────────────────── */
//
// The point of the whole exercise: every link box on a saved drawing
// must find an input cable on its own circuit.

const path = process.argv[2]
  ?? ["fixtures/drawing-2202-043.json", "fixtures/drawing-2607-002-two-pocs.json"]
       .find((p) => existsSync(p));

if (path && existsSync(path)) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const features = raw.features ?? raw;
  const boxes = features.filter((f) => f.Feature_Role === "linkbox");

  const wrong = [];
  const none = [];
  for (const b of boxes) {
    const got = inputCableOf(b, features);
    const label = b.Attributes?.Span_Label ?? b.Label ?? b.Feature_ID;
    if (!got) { none.push(label); continue; }
    const bc = b.Attributes?.Circuit_ID;
    const gc = got.Attributes?.Circuit_ID;
    if (bc != null && gc != null && Number(bc) !== Number(gc)) {
      wrong.push(`${label} (circuit ${bc}) picked up a circuit ${gc} cable`);
    }
  }

  console.log(`${path}\n    ${boxes.length} link box(es), `
    + `${boxes.length - none.length} with an input cable found`);

  ok(`${path}: no box takes a cable from another circuit`,
     wrong.length === 0, wrong.join("; "));
  /* Not a failure on its own — a box drawn before its feed is legitimate
     — so this is stated as a count rather than a pass/fail. */
  if (none.length) {
    console.log(`    note: ${none.length} box(es) have no input cable yet: `
      + none.join(", "));
  }
} else {
  console.log("    (no drawing fixture found — unit checks only)");
}

/* ── Result ───────────────────────────────────────────────────────── */
if (fails.length) {
  console.log(`\n${fails.length} problem(s), ${pass} passed\n`);
  for (const f of fails) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
console.log(`\nA link box's input takes its own cable's colour (${pass} checks): `
  + `the drawing before the ruler, the circuit respected, and two boxes `
  + `1.73 m apart told apart.\n`);
