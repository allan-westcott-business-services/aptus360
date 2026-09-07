/* Two boards in one building, joined by a hand-drawn feeder.

   The dig runs up to the first board and starts again at the second, so
   the second board's trench is an ISLAND: unreachable from the source,
   because the only thing joining them is a cable and the routing graph
   is built from trenches. Left alone, everything past the second board
   is never routed at all. */
import { readFileSync } from "node:fs";
import {
  stampLink, linkEnds, linkOrder, withAssumedMeters,
} from "./src/features/gis/msdb.js";
import { circuitMembership, circuitBuildParts } from "./src/features/gis/feeder.js";
import { distancesFrom, originMissing } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const raw = JSON.parse(readFileSync("./fixtures/drawing-6-msdb-link.json", "utf8"));
const f = raw.features;
const boards = f.filter((x) => x.Feature_Role === "msdb");
const link = f.find((x) => x.Feature_ID === 47622);

// 1. Stamped when drawn, from the boards it joins.
{
  const st = stampLink(link.Geometry, boards);
  if (!st) fail("a cable drawn end to end between two boards is not recognised");
  else {
    if (st.MSDB_Link_A_ID == null || st.MSDB_Link_B_ID == null) {
      fail("the stamp does not name both boards");
    }
    /* The circuit comes from the boards, which is the only place it is
       stated. */
    if (Number(st.Circuit_ID) !== 2) {
      fail(`the link was stamped with circuit ${st.Circuit_ID}, not the `
        + "circuit its boards are on");
    }
  }

  /* Two boards on DIFFERENT circuits is a thing to be told about, not
     stamped with whichever end was read first. */
  const split = boards.map((b, i) => ({ ...b,
    Attributes: { ...b.Attributes, Circuit_ID: i === 0 ? 2 : 3 } }));
  const st2 = stampLink(link.Geometry, split);
  if (st2?.Circuit_ID != null) {
    fail("a link between boards on two circuits was stamped with one of them");
  }
  if (st2?.MSDB_Link_A_ID == null) {
    fail("a link between boards on two circuits is not recognised as a link "
      + "at all, so the build cannot route past it");
  }

  /* A cable that is not board to board is not a link. */
  const other = f.find((x) => x.Attributes?.Line_Type === "elec_main"
    && x.Feature_ID !== 47622);
  if (other && stampLink(other.Geometry, boards)) {
    fail("an ordinary main was stamped as a board-to-board link");
  }
}

// 2. Recognised by the stamp first, by its ends as a fallback.
//
//    The fallback is exactly as good as the drawing: it covers cables
//    drawn before the stamp existed, and never overrules a stamp.
{
  const byEnds = linkEnds(link, boards);
  if (!byEnds) fail("an unstamped link is not recognised by its ends");
  else if (byEnds.stamped) fail("an unstamped link claims to be stamped");

  const stamped = { ...link, Attributes: { ...link.Attributes,
    MSDB_Link_A_ID: boards[0].Feature_ID, MSDB_Link_B_ID: boards[1].Feature_ID } };
  const byStamp = linkEnds(stamped, boards);
  if (!byStamp?.stamped) fail("a stamped link is not read from its stamp");

  /* A stamp naming a board that has been deleted is not a link any
     more, and says so by returning nothing rather than half a pair. */
  const orphan = { ...link, Attributes: { ...link.Attributes,
    MSDB_Link_A_ID: boards[0].Feature_ID, MSDB_Link_B_ID: 999999 } };
  if (linkEnds(orphan, boards)) {
    fail("a stamp naming a board that no longer exists is still a link");
  }
}

// 3. First is the board NEARER the source along the network.
//
//    Not the direction the cable happens to be drawn in.
{
  const poc = f.find((x) => x.Feature_Role === "poc");
  const d = distancesFrom(f, poc.Feature_ID);
  const order = linkOrder(linkEnds(link, boards), (b) => d.get(Number(b.Feature_ID)));
  if (!order) fail("the order of the two boards cannot be settled");
  else {
    if (order.firstM > order.secondM) fail("the further board was called first");
    if (order.first.Label !== "MSDB 1") {
      fail(`${order.first.Label} was called first; MSDB 1 is nearer the source`);
    }
  }
  /* Unmeasurable is not a reason to pick one. */
  if (linkOrder(linkEnds(link, boards), () => NaN)) {
    fail("an order was settled with no distance to settle it by");
  }
}

// 4. The build routes on from the second board.
{
  const ids = boards.flatMap((b) => b.Attributes.MSDB_Plot_IDs || []);
  const src = withAssumedMeters(f, {
    plotList: ids.map((id, i) => ({ plot_id: id, plot_number: `F${i + 1}`,
      Property_Config_ID: 500, Heat_Source_ID: 2 })),
    configs: [{ Property_Config_ID: 500, Bedrooms: 1, Property_Type_ID: 7 }],
    propertyTypes: [{ Property_Type_ID: 7, Property_Type: "Flat" }],
    consumption: [{ Bedrooms: 1, Heat_Source_ID: 2, Consumption_kVA: 2.2 }],
  });
  const poc = f.find((x) => x.Feature_Role === "poc");
  const d = distancesFrom(f, poc.Feature_ID);
  const order = linkOrder(linkEnds(link, boards), (b) => d.get(Number(b.Feature_ID)));
  const { seedIds, meterIds } = circuitMembership(src, 2);
  const opts = { lineTypes: raw.lineTypes || [], circuitId: 2,
    plotById: () => null, nrsById: () => null, seedIds, meterIds,
    originId: poc.Feature_ID };

  const without = circuitBuildParts(src, opts);
  const with_ = circuitBuildParts(src, { ...opts, msdbLinks: [{ ...order, link }] });

  if (with_.length <= without.length) {
    fail("the build makes no part for the far side of the link, so nothing "
      + "past the second board is ever routed");
  }
  const far = with_.find((p) => /^from /.test(String(p.via)));
  if (!far) fail("no part is rooted at the second board");
  else if (far.error) fail(`the part rooted at the second board failed: ${far.error}`);
  else if (!(far.totalMeters > 0)) {
    fail("the part rooted at the second board reaches nothing");
  }
}

// 5. The build never lays or removes the link itself.
{
  if (link.Attributes?.Generated) {
    fail("the link is marked Generated, so a rebuild would delete it");
  }
  const feeder = readFileSync("./src/features/gis/feeder.js", "utf8");
  /* A part rooted at a board must not root further parts at the same
     boards, which would walk in a circle. */
  if (!/msdbLinks: \[\],/.test(feeder)) {
    fail("a link part passes the links on to itself, so the walk recurses");
  }
}

// 6. The levels chain across the link.
//
//    The second board's dig is an island, so no leg ends on it and it
//    had no figure at all. A part rooted at it gives it one, started
//    from the FIRST board's figure carried across.
{
  const feeder = readFileSync("./src/features/gis/feeder.js", "utf8");
  const vd = readFileSync("./src/features/gis/voltDrop.js", "utf8");
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* Both exits of BOTH parts functions. The early return for a circuit
     with no link box is the ordinary case, and it is where two boards
     in one building sit \u2014 the same omission was made on each path. */
  const traceFn = feeder.slice(feeder.indexOf("export function circuitTraceParts"),
    feeder.indexOf("export function serviceTrenchCheck"));
  if ((traceFn.match(/msdbLinkParts/g) || []).length < 2) {
    fail("the levels path makes link parts on only one of its exits, so a "
      + "circuit with no link box leaves the second board with no figure");
  }

  /* A board part starts from the first board's figure, the way an
     output starts from the figure at its box. */
  if (!/part\.fromBoard \? boardFigure\(part\.fromBoard\) : null/.test(vd)) {
    fail("a board part starts from the circuit's baseline rather than from "
      + "the board that feeds it");
  }
  if (!/const across = part\.acrossLink;/.test(vd)) {
    fail("nothing is added between the two boards, so the link and the "
      + "risers cost nothing");
  }

  /* ── The three lengths, in the order the cable runs them ──

     The figure at the first board's stop is at GROUND. From there the
     cable goes UP that board's riser, ALONG the link, and DOWN the
     second board's run to the dig it starts from. The reverse was
     tried first and read both risers as nought on the reported
     drawing, because each board records only the one it has. */
  if (!/part\.fromBoard\.Attributes\?\.MSDB_Riser_M\) \|\| 0, upCable/.test(canvas)) {
    fail("the first board's riser is not on the path between the boards");
  }
  if (!/part\.board\.Attributes\?\.MSDB_Down_M\) \|\| 0, downCable/.test(canvas)) {
    fail("the second board's run down is not on the path between the boards");
  }
  if (/fromBoard\.Attributes\?\.MSDB_Down_M/.test(canvas)) {
    fail("the first board's run DOWN is used, which is the reverse of the "
      + "way the cable runs");
  }

  /* And the arithmetic, against the reported drawing. */
  const boards2 = f.filter((x) => x.Feature_Role === "msdb");
  const poc2 = f.find((x) => x.Feature_Role === "poc");
  const d2 = distancesFrom(f, poc2.Feature_ID);
  const l2 = f.find((x) => linkEnds(x, boards2));
  const o2 = linkOrder(linkEnds(l2, boards2), (b) => d2.get(Number(b.Feature_ID)));
  const up = Number(o2.first.Attributes.MSDB_Riser_M) || 0;
  const down = Number(o2.second.Attributes.MSDB_Down_M) || 0;
  if (!(up > 0) || !(down > 0)) {
    fail("the fixture no longer has a riser at each end of the link, so the "
      + "reversal this check exists for would not show");
  }
}

// 7. The circuit's context comes from its ORIGIN part.
//
//    Everything is computed against one part: the transformer, the
//    working voltage, the upstream drop, and the test for a POC that
//    has not been declared.
//
//    "The first part without an error" was fine while every part began
//    at the substation. A part rooted at an MSDB does not \u2014 its model's
//    origin is the BOARD, which has no transformer and no declared
//    output voltage, so `originMissing` reports it as undeclared and
//    the whole circuit is skipped, taking every feeder point's level
//    with it.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (/const r = parts\.find\(\(x\) => !x\.error\) \|\| parts\[0\]/.test(canvas)) {
    fail("the circuit's context is taken from whichever part has no error, "
      + "which can now be a part rooted at a board");
  }
  if (!/x\.via === "origin" \|\| x\.via === "trunk"/.test(canvas)) {
    fail("the origin part is not named, so a board part can supply the "
      + "transformer and voltage for the whole circuit");
  }

  /* A board is not a declared origin, and never will be. */
  const board = f.find((x) => x.Feature_Role === "msdb");
  if (!originMissing(board, []).length) {
    fail("a board reads as a fully declared origin, so this could not have "
      + "been caught by the guard that skips undeclared ones");
  }
}

// 8. The build LAYS cable past the second board.
//
//    The two callers want different things from a part. The levels want
//    legs, which `spanTrace` gives. The build wants SECTIONS \u2014 the
//    cable it is about to lay \u2014 which only `feederSections` gives.
//
//    Using spanTrace for both produced a part that reached the meters
//    beyond the second board and laid nothing: one leg, no sections, no
//    cable on the drawing.
{
  const feeder = readFileSync("./src/features/gis/feeder.js", "utf8");
  const fn = feeder.slice(feeder.indexOf("function msdbLinkParts"),
    feeder.indexOf("export function circuitBuildParts"));
  if (!/const r = walk\(features, \{/.test(fn)) {
    fail("the link part walks one way for both callers, so one of them gets "
      + "the wrong shape of answer");
  }

  /* The build's calls use feederSections; the levels' use spanTrace. */
  const buildFn = feeder.slice(feeder.indexOf("export function circuitBuildParts"));
  if (!/msdbLinkParts\(features, opts, \(fs, o\) => feederSections\(fs, o\)\)/.test(buildFn)) {
    fail("the build walks a link part with spanTrace, which yields legs and "
      + "no cable to lay");
  }
  const traceFn = feeder.slice(feeder.indexOf("export function circuitTraceParts"),
    feeder.indexOf("export function serviceTrenchCheck"));
  if (!/spanTrace\(fs, nodeId, o\)/.test(traceFn)) {
    fail("the levels walk a link part with feederSections, which yields no "
      + "legs and so no figures");
  }

  /* And on the reported drawing it lays something. */
  const boards2 = f.filter((x) => x.Feature_Role === "msdb");
  const originId = 46907;
  const dd = distancesFrom(f, originId);
  const ls = [];
  for (const line of f) {
    const e = linkEnds(line, boards2);
    if (!e) continue;
    const o = linkOrder(e, (b) => dd.get(Number(b.Feature_ID)));
    if (o) ls.push({ ...o, link: line });
  }
  if (ls.length) {
    const ids2 = boards2.flatMap((b) => b.Attributes.MSDB_Plot_IDs || []);
    const src2 = withAssumedMeters(f, {
      plotList: ids2.map((id, i) => ({ plot_id: id, plot_number: `F${i + 1}`,
        Property_Config_ID: 500, Heat_Source_ID: 2 })),
      configs: [{ Property_Config_ID: 500, Bedrooms: 1, Property_Type_ID: 7 }],
      propertyTypes: [{ Property_Type_ID: 7, Property_Type: "Flat" }],
      consumption: [{ Bedrooms: 1, Heat_Source_ID: 2, Consumption_kVA: 2.2 }],
    });
    const mem = circuitMembership(src2, 2);
    const parts = circuitBuildParts(src2, { lineTypes: raw.lineTypes || [],
      circuitId: 2, plotById: () => null, nrsById: () => null,
      seedIds: mem.seedIds, meterIds: mem.meterIds, originId, msdbLinks: ls });
    const far = parts.find((p) => /^from /.test(String(p.via)));
    if (!far) fail("no part is rooted at the second board");
    else if (!(far.sections?.length > 0)) {
      fail("the part past the second board lays no cable at all");
    }
  }
}

// 9. One stop at one cable end.
//
//    Marks are deduped by node INDEX, which is right while the far end
//    of a part is the same node the end-of-line pass found. On a part
//    rooted at a board it is not: that walk has its own node numbering,
//    so the two land a metre apart and both are kept \u2014 two feeder end
//    points at the end of one cable, 0.88 m apart on the reported
//    drawing.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const sameSpot = \(a, b\) => Math\.hypot/.test(canvas)) {
    fail("the far-end mark is deduped by index alone, so a part rooted at a "
      + "board adds a second stop beside the first");
  }
  if (!/m\.index === term\.index \|\| sameSpot\(m, term\)/.test(canvas)) {
    fail("the position test is worked out and not used");
  }
  /* At the distance somebody would call the same place. Two genuine
     stops within a metre and a half of each other on one feeder is not
     a design. */
  if (!/\) <= 1\.5;/.test(canvas)) {
    fail("the same-place distance is not the one this was written for");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Board-to-board links behave (stamped, ordered, and routed on from).");
process.exit(bad ? 1 : 0);
