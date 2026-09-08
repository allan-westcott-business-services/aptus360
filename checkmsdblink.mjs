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
import { circuitMembership, circuitBuildParts, circuitTraceParts } from "./src/features/gis/feeder.js";
import { levelsForParts } from "./src/features/gis/voltDrop.js";
import { distancesFrom, originMissing } from "./src/features/gis/electric.js";
import { isTrenchType } from "./src/features/gis/snapping.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const raw = JSON.parse(readFileSync("./fixtures/drawing-6-msdb-link.json", "utf8"));
const f = raw.features;
const boards = f.filter((x) => x.Feature_Role === "msdb");
/* Found by what it IS, not by a row number: the fixture is refreshed
   from real drawings and the ids change every time. */
const link = f.find((x) => x.Attributes?.MSDB_Link_A_ID != null)
  ?? f.find((x) => x.Feature_Type === "line"
    && /main/i.test(String(x.Attributes?.Line_Type ?? ""))
    && stampLink(x.Geometry, boards));

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
  /* A cable that is not board to board is not a link. Its own geometry,
     so the test does not depend on which drawing the fixture is. */
  const away = [[900, 900], [940, 900]];
  if (stampLink(away, boards)) {
    fail("an ordinary main was stamped as a board-to-board link");
  }
}

// 2. Recognised by the stamp first, by its ends as a fallback.
//
//    The fallback is exactly as good as the drawing: it covers cables
//    drawn before the stamp existed, and never overrules a stamp.
{
  /* Built here rather than taken from the fixture: a drawing refreshed
     from the app carries a real stamp, and this is the case for one
     that does not. */
  const bare = { Feature_Type: "line", Attributes: { Line_Type: "elec_main" },
    Geometry: link.Geometry };
  const byEnds = linkEnds(bare, boards);
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

  /* ── And ACROSS parts, which is where it actually showed ──

     `seen` keyed on the exact centimetre, which dedupes a mark two
     parts found at the same NODE and nothing else. A part rooted at a
     board walks its own trench with its own numbering, so its far end
     and the trunk's end-of-line land near one cable end without being
     the same point: 0.88 m apart on one drawing, 2.39 m on the next.
     Raising a within-part threshold could never have fixed it. */
  if (/const key = `\$\{Math\.round\(m\.point\[0\] \* 100\)\}/.test(canvas)) {
    fail("stops are deduped across parts by an exact position key, so two "
      + "marks a metre apart are both written");
  }
  if (!/walked\.some\(\(w\) => Math\.hypot\(w\.point\[0\] - m\.point\[0\]/.test(canvas)) {
    fail("nothing compares a stop against the ones already placed");
  }
  /* Two stops within two and a half metres on one circuit is not a
     design: a span is tens of metres. Wide enough for both reported
     gaps, far short of anything real. */
  if (!/\) <= 2\.5\)\) continue;/.test(canvas)) {
    fail("the across-parts distance is not the one this was written for");
  }
}

// 10. A part rooted at a board starts AT that board.
//
//     Every other part's root is already a stop by the time it is
//     walked: a link box is marked by the trunk arriving at it, and the
//     origin is the origin. Nothing arrives at the far side of a
//     board-to-board link \u2014 that is the whole point of it \u2014 so its root
//     was marked by nobody. No feeder point at the board, no figure,
//     and no levels for its flats.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/if \(pt\.board && pt\.model\?\.nodes\?\.\[pt\.model\.S\]\)/.test(canvas)) {
    fail("the board a part is rooted at is never marked, so it gets no "
      + "feeder point and no level");
  }
  /* Stamped with the board it stands on, so the drag carries it and
     the editor can find its figure. */
  if (!/atFeatureId: pt\.board\.Feature_ID/.test(canvas)) {
    fail("the stop at a board does not say which board it stands on");
  }
  /* And it must survive the across-parts dedupe: on the reported
     drawing the nearest other stop is fourteen metres away. */
  if (!/marks\.push\(\{ index: pt\.model\.S/.test(canvas)) {
    fail("the root mark is not added to this part's own marks, so the "
      + "ordering pass never sees it");
  }
}

// 11. The board a part begins at gets a figure of its own.
//
//     Every figure is set from a leg's END. That is right for a trunk
//     and for an output: their roots are already stops that something
//     else arrived at, and the leg that arrived set the figure.
//
//     A part rooted at the far side of a link has no such leg \u2014 nothing
//     arrives there, which is the whole point of the link. So the board
//     sat with a feeder point on it and NO figure against it, and every
//     flat on it showed a dash.
{
  const vd = readFileSync("./src/features/gis/voltDrop.js", "utf8");
  if (!/if \(part\.board && from\) \{/.test(vd)) {
    fail("only leg ends get figures, so a board that a part BEGINS at "
      + "never gets one");
  }
  if (!/out\.set\(Number\(stop\.Feature_ID\), figureAt\(part, part\.model\?\.S/.test(vd)) {
    fail("the board's own figure is not the part's starting figure");
  }
  /* Not overwritten where a leg does end there, which is the ordinary
     case for every other kind of part. */
  if (!/!out\.has\(Number\(stop\.Feature_ID\)\)/.test(vd)) {
    fail("the starting figure overwrites one a leg had already set");
  }

  /* End to end, with the stop the build now places at the board. */
  const boards2 = f.filter((x) => x.Feature_Role === "msdb");
  const b2 = boards2.find((b) => b.Label === "MSDB 2") ?? boards2[1];
  const stop = { Feature_ID: 999001, Feature_Type: "point",
    Feature_Role: "feederpoint", Layer_Key: "electric",
    Geometry: [[...b2.Geometry[0]]],
    Attributes: { Circuit_ID: 2, Span_Seq: 6, Span_Label: "B6",
      Span_Kind: "junction", Span_Anchor: [...b2.Geometry[0]],
      At_Joint_ID: b2.Feature_ID, Generated: true } };
  const world = [...f, stop];
  const origin2 = world.find((x) => x.Feature_Role === "feederpoint"
    && Number(x.Attributes?.Circuit_ID) === 2 && Number(x.Attributes?.Span_Seq) === 0);
  const sub = world.find((x) => x.Feature_Role === "substation");
  if (origin2 && sub) {
    const dd = distancesFrom(world, sub.Feature_ID);
    const ls = [];
    for (const line of world) {
      const e = linkEnds(line, boards2);
      if (!e) continue;
      const o = linkOrder(e, (b) => dd.get(Number(b.Feature_ID)));
      if (o) ls.push({ ...o, link: line });
    }
    const mem = circuitMembership(world, 2);
    const parts = circuitTraceParts(world, origin2.Feature_ID, {
      lineTypes: raw.lineTypes || [], circuitId: 2, plotById: () => null,
      nrsById: () => null, seedIds: mem.seedIds, meterIds: mem.meterIds,
      stopAt: "spannodes", msdbLinks: ls });
    for (const p of parts) if (p.fromBoard) p.acrossLink = { ohms: 0.04, pct: 0.831 };
    const figs = levelsForParts(parts, { features: world, base: {
      cables: [{ Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 }],
      limits: {}, transformer: { Loop_Impedance_Ohm: 0.02 }, voltageV: 400,
      startPct: 3.5 } });
    const got = figs.get(999001);
    if (!got) fail("the stop at the second board still has no figure");
    else if (!(got.pct > 3.5)) {
      fail(`the second board reads ${got.pct}%, no worse than the first \u2014 the `
        + "link and the risers cost nothing");
    }
  }
}

// 12. A trench between the boards makes the link part unnecessary.
//
//     A link part exists because the second board's trench is an
//     ISLAND: the dig stops at the first board and starts again at the
//     second, with only a cable between them.
//
//     Dig a mains trench between the two and there is no island. The
//     ordinary routing reaches the second board by itself, and a link
//     part on top of that would lay a second cable over the first and
//     stand a second stop beside its stop.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/if \(byDig\.has\(Number\(order\.second\.Feature_ID\)\)\) continue;/.test(canvas)) {
    fail("a link part is made even where the dig already reaches the second "
      + "board, so the cable and the stop are laid twice");
  }
  /* Measured over TRENCHES alone, because that is what the routing
     walks. Measuring over cables as well would call every board
     reachable the moment somebody drew the link \u2014 which is the case
     this exists for. */
  if (!/isTrenchType\(x\.Attributes\?\.Line_Type, lineTypes\)/.test(canvas)) {
    fail("reachability is measured over cables as well as trenches, so the "
      + "link switches itself off the moment it is drawn");
  }

  /* And it behaves that way on the fixture, both with and without. */
  const boards2 = f.filter((x) => x.Feature_Role === "msdb");
  const sub = f.find((x) => x.Feature_Role === "substation");
  if (boards2.length === 2 && sub) {
    const [b1, b2] = boards2;
    const trench = { Feature_ID: 999900, Feature_Type: "line",
      Feature_Role: "shape", Layer_Key: "trench",
      Geometry: [[...b1.Geometry[0]], [...b2.Geometry[0]]],
      Attributes: { Line_Type: "trench_main", Carries_LV: true } };
    const digOf = (world) => world.filter((x) => x.Feature_Type !== "line"
      || isTrenchType(x.Attributes?.Line_Type, raw.lineTypes || []));
    const before = distancesFrom(digOf(f), sub.Feature_ID);
    const after = distancesFrom(digOf([...f, trench]), sub.Feature_ID);
    const island = boards2.find((b) => !before.has(Number(b.Feature_ID)));
    if (!island) {
      fail("the fixture has no board the dig cannot reach, so the case this "
        + "was written for is untested");
    } else if (!after.has(Number(island.Feature_ID))) {
      fail("a mains trench drawn between the boards does not make the far "
        + "one reachable, so the link part would still be made");
    }
  }
}

// 13. A trench between two boards is a trench, not a link.
//
//     "trench_main" matches /main/, so a mains trench drawn board to
//     board was stamped as a link AND given a circuit \u2014 a dig belongs
//     to no circuit. The build then had a link to route around a dig
//     that had already joined them, and laid the whole run a second
//     time: on the reported drawing B5 covered B2 and B3 end to end,
//     83 m of duplicate cable.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/isTrenchType\(lineType, lineTypes\) \? \{\} : \(stampLink/.test(canvas)) {
    fail("a trench drawn between two boards is stamped as a link and given a "
      + "circuit");
  }

  const src = readFileSync("./src/features/gis/msdb.js", "utf8");
  if (!/if \(\/trench\/i\.test\(type\) \|\| line\.Layer_Key === "trench"\) return null;/
    .test(src)) {
    fail("a trench already carrying a link stamp is still read as a link, so "
      + "the fault survives on drawings that have one");
  }

  /* On the drawing where it happened: a mains trench now joins the
     boards, and nothing on it should read as a link. */
  const withTrench = JSON.parse(
    readFileSync("./fixtures/drawing-6-msdb-trench.json", "utf8"));
  const wf = withTrench.features;
  const wb = wf.filter((x) => x.Feature_Role === "msdb");
  const stamped = wf.filter((x) => x.Attributes?.MSDB_Link_A_ID != null);
  if (!stamped.length) {
    fail("the fixture has no stamped line, so the case this was written for "
      + "is untested");
  }
  const stillLinks = wf.filter((x) => linkEnds(x, wb));
  if (stillLinks.length) {
    fail(`${stillLinks.length} line(s) still read as a link on a drawing where `
      + "a trench joins the boards");
  }
}

// 14. A trench never shows a circuit label.
//
//     Two circuits commonly share one trench, so a trench naming one of
//     them is saying something untrue about the other. It could only
//     ever be there by mistake \u2014 as it was when a mains trench drawn
//     between two boards came back stamped with a link and a circuit \u2014
//     and a label drawn from a mistake is how the mistake gets
//     believed.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const circuit = isTrenchType\(a\.Line_Type, lineTypes\)\s*\n?\s*\? null : a\.Circuit_Letter;/
    .test(canvas)) {
    fail("a trench carrying a stray circuit still draws a circuit label, so "
      + "a drawing that has one keeps showing it");
  }

  /* Refused at the point of DRAWING, not only at the point of writing:
     the reported drawing already carries the stray circuit, and it must
     stop showing without anybody editing the trench. */
  const wt = JSON.parse(readFileSync("./fixtures/drawing-6-msdb-trench.json", "utf8"));
  const stray = wt.features.find((x) => /trench/i.test(String(x.Attributes?.Line_Type))
    && x.Attributes?.Circuit_Letter != null);
  if (!stray) {
    fail("the fixture has no trench carrying a circuit, so the case this was "
      + "written for is untested");
  }
}

// 15. A board breaks the run.
//
//     `isBreak` was the origin, a fork, or an end. A board sitting
//     mid-run has exactly one child, so it was none of those and the
//     cable ran straight THROUGH it: one 60 m section from B1 past two
//     MSDBs to B4, where the ground holds three cables with a board
//     between each pair.
//
//     `jointMarks` has treated a board as a stop since it was added, so
//     the point was placed and the cable was not cut at it \u2014 and the
//     note above isBreak says those two are meant to be the same place.
{
  const src = readFileSync("./src/features/gis/feeder.js", "utf8");
  if (!/const isBreak = \(u\) => u === S \|\| loadChildren\(u\)\.length !== 1 \|\| breakAt\.has\(u\);/
    .test(src)) {
    fail("a board mid-run does not break the cable, so one section runs "
      + "through it");
  }
  /* A straight joint too: it was in the same position, marked as a stop
     and never breaking a section. */
  if (!/Joint_Type \?\? ""\)\.toLowerCase\(\) === "straight"/.test(src.slice(
    src.indexOf("const breakAt = new Set();")))) {
    fail("a straight joint does not break the run either");
  }

  /* On the drawing where it was reported. */
  const bd = JSON.parse(readFileSync("./fixtures/drawing-6-board-breaks.json", "utf8"));
  const bf = bd.features;
  const boards3 = bf.filter((x) => x.Feature_Role === "msdb");
  const ids3 = boards3.flatMap((b) => b.Attributes.MSDB_Plot_IDs || []);
  const world = withAssumedMeters(bf, {
    plotList: ids3.map((id, i) => ({ plot_id: id, plot_number: `F${i + 1}`,
      Property_Config_ID: 500, Heat_Source_ID: 2 })),
    configs: [{ Property_Config_ID: 500, Bedrooms: 1, Property_Type_ID: 7 }],
    propertyTypes: [{ Property_Type_ID: 7, Property_Type: "Flat" }],
    consumption: [{ Bedrooms: 1, Heat_Source_ID: 2, Consumption_kVA: 2.2 }],
  });
  const originId3 = bf.find((x) => x.Feature_Role === "substation")?.Feature_ID;
  const mem3 = circuitMembership(world, 2);
  const parts3 = circuitBuildParts(world, { lineTypes: bd.lineTypes || [],
    circuitId: 2, plotById: () => null, nrsById: () => null,
    seedIds: mem3.seedIds, meterIds: mem3.meterIds, originId: originId3 });
  const secs = parts3.flatMap((p) => p.sections || []);
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  /* Every board must be the end of one section and the start of
     another: that is what "the cable is broken at the board" means. */
  for (const b of boards3) {
    const ends = secs.filter((sx) => near(sx.pts[sx.pts.length - 1], b.Geometry[0]) <= 2);
    const starts = secs.filter((sx) => near(sx.pts[0], b.Geometry[0]) <= 2);
    if (!ends.length || !starts.length) {
      fail(`${b.Label} is not where a cable ends and another begins `
        + `(${ends.length} in, ${starts.length} out)`);
    }
  }
  /* And no section runs straight PAST a board.

     Tested against the board a section does not already end at: a dense
     polyline has vertices a metre short of its own end, and at the
     tolerance the ends are matched on those read as interior points.
     The question is whether a board lies inside a section that carries
     on beyond it, not whether a point near the end is near the end. */
  const through = secs.filter((sx) => boards3.some((b) => {
    const at = b.Geometry[0];
    if (near(sx.pts[0], at) <= 2 || near(sx.pts[sx.pts.length - 1], at) <= 2) return false;
    return sx.pts.some((p) => near(p, at) <= 2);
  }));
  if (through.length) {
    fail(`${through.length} section(s) run through a board without stopping`);
  }
}

// 16. The build's own cable is not a link.
//
//     A link is a feeder somebody drew BY HAND through a building where
//     no trench goes. Once the dig reaches both boards the build lays
//     its own sections between them, and those END on two boards — so
//     they matched, and the next build made a link part for each,
//     laying the run again. Three runs, three lots of cable, each build
//     feeding the next.
{
  const src = readFileSync("./src/features/gis/msdb.js", "utf8");
  if (!/if \(line\.Attributes\?\.Generated\) return null;/.test(src)) {
    fail("a cable the build laid between two boards is read as a link, so "
      + "every rebuild lays the run again");
  }

  /* On a drawing where the build has run: nothing it laid is a link,
     and a hand-drawn cable still is. */
  const built = JSON.parse(readFileSync("./fixtures/drawing-6-board-breaks.json", "utf8"));
  const bf = built.features;
  const bb = bf.filter((x) => x.Feature_Role === "msdb");
  if (bb.length >= 2) {
    const generated = bf.filter((x) => x.Attributes?.Generated && linkEnds(x, bb));
    if (generated.length) {
      fail(`${generated.length} cable(s) the build laid are still read as links`);
    }
    const hand = { Feature_Type: "line", Attributes: { Line_Type: "elec_main" },
      Geometry: [bb[0].Geometry[0], bb[1].Geometry[0]] };
    if (!linkEnds(hand, bb)) {
      fail("a hand-drawn cable between two boards is no longer a link, which "
        + "is the case the whole mechanism exists for");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Board-to-board links behave (stamped, ordered, and routed on from).");
process.exit(bad ? 1 : 0);
