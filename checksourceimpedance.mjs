/* Where the volt drop starts from.

   Volt drop starts at an impedance, not at zero. On a scheme we build
   that is the transformer's, looked up from the size chosen on the
   substation. On a connection to an existing network there is no
   transformer: the DNO declares an impedance at the point of
   connection, and that is the same number playing the same part.

   The check read it only from a substation. On a POC-fed network it
   found none, started from zero, and reported volt drop and loop
   impedance for the cable alone — every figure lower than the truth by
   the same missing amount, so a marginal run read as passing. */
import { readFileSync } from "node:fs";
import {
  sourceImpedance, NO_SOURCE_NOTE, workingVoltage, voltageOf,
  upstreamVoltDropPct, ampsFor,
} from "./src/features/gis/electric.js";
import {
  cumulativeToNode, legVoltDrop, ampsOf,
} from "./src/features/gis/voltDrop.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const SIZES = [
  { Transformer_Size_ID: 3, Loop_Impedance_Ohm: 0.021 },
  { Transformer_Size_ID: 5, Loop_Impedance_Ohm: 0.014 },
];

const sub = (attrs = {}) => ({ Feature_Role: "substation", Attributes: attrs });
const poc = (attrs = {}) => ({
  Feature_Role: "poc", Layer_Key: "electric", Attributes: attrs,
});

// 1. A substation supplies it through its transformer size.
{
  const got = sourceImpedance(sub({ VD_Transformer_Size_ID: 3 }), SIZES);
  if (got?.Loop_Impedance_Ohm !== 0.021) {
    fail(`a substation gave ${got?.Loop_Impedance_Ohm}`);
  }
  /* And the right one of several. */
  if (sourceImpedance(sub({ VD_Transformer_Size_ID: 5 }), SIZES)
    ?.Loop_Impedance_Ohm !== 0.014) {
    fail("the wrong transformer size was picked");
  }
}

// 2. A POC supplies it directly.
//
//    There is no catalogue of somebody else's network to look it up in:
//    the figure is whatever the DNO declared at the point we touch it.
{
  const got = sourceImpedance(poc({ Source_Loop_Impedance_Ohm: 0.035 }), SIZES);
  if (got?.Loop_Impedance_Ohm !== 0.035) fail(`a POC gave ${got?.Loop_Impedance_Ohm}`);

  /* In the shape the volt drop already reads, so the two origins are
     one path from there on rather than two. */
  if (!("Loop_Impedance_Ohm" in (got || {}))) {
    fail("the POC's figure is not in the shape the calculation reads");
  }
}

// 3. Nothing where nothing was set.
//
//    The calculation already knows what to do with null — it starts
//    from zero and says it did. Inventing a figure here would replace a
//    stated unknown with a wrong answer nobody can see.
{
  if (sourceImpedance(sub({}), SIZES) !== null) fail("a substation with no size gave one");
  if (sourceImpedance(poc({}), SIZES) !== null) fail("a POC with no figure gave one");
  if (sourceImpedance(null, SIZES) !== null) fail("no origin gave an impedance");
  /* A blank or nonsense entry is not a figure. Zero especially: a loop
     impedance of nothing is not a measurement, it is an empty box. */
  for (const z of ["", 0, -1, "abc", null]) {
    if (sourceImpedance(poc({ Source_Loop_Impedance_Ohm: z }), SIZES) !== null) {
      fail(`a POC reading ${JSON.stringify(z)} was taken as a figure`);
    }
  }
  /* A transformer size naming a row that is not there. */
  if (sourceImpedance(sub({ VD_Transformer_Size_ID: 99 }), SIZES) !== null) {
    fail("an unknown transformer size gave an impedance");
  }
}

// 4. The check reads it from the origin the trace started at.
//
//    Looking for a substation directly is what made a POC-fed network
//    report cable-only figures, and it would go on doing so however the
//    POC was filled in.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("function runLevelsCheck");
  const body = at < 0 ? "" : canvas.slice(at, at + 9000);

  if (!body) fail("runLevelsCheck has gone");
  if (/const station = src\.find\(\(f\) => f\.Feature_Role === "substation"\)/.test(body)) {
    fail("the levels check still looks for a substation directly");
  }
  if (!/lvOrigin\(src\)/.test(body)) fail("the levels check does not use the origin");
  /* Per circuit now: each part reads the origin its own model rooted
     at, so a two-POC site reads two sets of source figures. */
  if (!/sourceImpedance\(origin/.test(body)) {
    fail("the levels check does not take its impedance from the circuit's own origin");
  }
}

// 5. And says so when it ran without one.
//
//    An unqualified pass is worse than no check at all, because
//    somebody acts on it. The note names both places the figure can
//    come from, so it is useful on either kind of drawing.
{
  if (!/transformer/i.test(NO_SOURCE_NOTE)) fail("the note does not mention the substation route");
  if (!/POC/.test(NO_SOURCE_NOTE)) fail("the note does not mention the POC route");
  if (!/read better/i.test(NO_SOURCE_NOTE)) {
    fail("the note does not say which way the figures are wrong");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/NO_SOURCE_NOTE/.test(canvas)) fail("the note is never shown");
  /* The old wording sent somebody with a POC looking for a substation
     they deliberately have not got. */
  if (/"Set a transformer on the substation"/.test(canvas)) {
    fail("the warning still names the substation only");
  }

  /* ── The drawing shows the same figure as the panel ──

     The node labels drew the cumulative percentage always, so a
     designer working in "From E0" read one number in the panel and a
     different one on the drawing for the same node, with nothing saying
     why they differed. */
  if (!/const shownPct = vdBasis === "own" && vd\.pctOwn != null/.test(canvas)) {
    fail("the node labels ignore the basis the levels check is showing");
  }
  /* And the canvas repaints when it is switched. A memo that does not
     list it keeps painting the old figure until something else moves. */
  const deps = /\}, \[visible, selected, view[^\]]*\]\);/.exec(canvas);
  if (deps && !/vdBasis/.test(deps[0])) {
    fail("the drawing does not repaint when the basis is switched, so the"
      + " labels keep the old figure until something else moves");
  }
  /* Impedance is not switchable: there is no upstream/own split for it.
     The source impedance is a baseline the whole run sits on. */
  if (/ohmsOwn/.test(canvas)) {
    fail("impedance is being split into own and cumulative");
  }
}

// 6. The POC has somewhere to put it.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/Source_Loop_Impedance_Ohm/.test(editor)) {
    fail("the POC has no field for the declared impedance");
  }
  /* Electric only: a gas POC has nothing to say about volt drop. */
  if (!/Feature_Role === "poc" && feature\.Layer_Key === "electric"/.test(editor)) {
    fail("the field is offered on every POC, not only the electric one");
  }
}

// 7. The voltage comes from the origin, and says when it did not.
//
//    Every amp and every percentage is worked out against it: amps are
//    kVA over root-three times V, and a volt drop is a proportion of
//    it. It was a literal in five places, each reading a field only a
//    substation has \u2014 so on a POC-fed network all five found nothing
//    and all five fell back to 400, stated nowhere.
{
  if (voltageOf({ Attributes: { Output_V: 415 } }) !== 415) {
    fail("a stated voltage was ignored");
  }
  if (workingVoltage({ Attributes: { Output_V: 415 } }).assumed) {
    fail("a stated voltage was reported as assumed");
  }

  /* 400 where nothing says otherwise \u2014 that is what an LV network runs
     at, and refusing to calculate would help nobody. What matters is
     that the caller can tell it was assumed. */
  for (const origin of [null, undefined, { Attributes: {} },
    { Attributes: { Output_V: "" } }, { Attributes: { Output_V: 0 } },
    { Attributes: { Output_V: -5 } }, { Attributes: { Output_V: "abc" } }]) {
    const got = workingVoltage(origin);
    if (got.volts !== 400) fail(`a missing voltage gave ${got.volts}`);
    if (!got.assumed) fail("a fallback voltage was not reported as assumed");
  }
}

// 8. One copy of the fallback, not five.
//
//    Five copies is how a POC-fed check and the schematic drawn from it
//    came to disagree with each other about the same network \u2014 the
//    same duplication that produced two delete lists in the LV rebuild
//    and two transformer lookups in this very function.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const left = (canvas.match(/Output_V\) \|\| 400/g) || []).length;
  if (left) fail(`${left} copy(ies) of the voltage fallback remain in the canvas`);
  if (!/voltageOf\(/.test(canvas)) fail("the canvas does not use the shared voltage");

  /* Including the schematic, which had its own substation lookup, so a
     POC-fed drawing was drawn at 400 whatever the check had used. */
  if (/Feature_Role === "substation"\)\s*\n?\s*\?\.Attributes\?\.Output_V/.test(canvas)) {
    fail("the schematic still reads the voltage from a substation");
  }

  /* And it is said where the figures are read. */
  if (!/voltageAssumed/.test(canvas)) fail("nothing says when the voltage was assumed");

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/fe-poc-v/.test(editor)) fail("the POC has no field for its output voltage");
}

/* ── What the feeding network already used ──

   A site connecting to an existing network does not start at zero. The
   DNO's cable has spent some of the permitted volt drop before it
   reaches the POC, and a design checked from E0 as though it began
   there reads better than it is — by exactly the amount somebody else
   already spent.

   Declared on the POC in percent, on the same argument the loop
   impedance beside it is already declared. */
{
  const poc = (v) => ({
    Feature_Role: "poc", Layer_Key: "electric",
    Attributes: v === undefined ? {} : { Source_Volt_Drop_Pct: v },
  });

  if (upstreamVoltDropPct(poc(2.5)) !== 2.5) fail("a declared upstream drop was not read");
  if (upstreamVoltDropPct(poc()) !== 0) fail("a POC with nothing declared is not zero");

  /* Guarded, not trusted. This is typed into a box, and a wrong figure
     here has one direction it must not go: making every downstream
     reading better than the truth. */
  for (const junk of [-1, "", null, "abc", NaN, undefined]) {
    if (upstreamVoltDropPct(poc(junk)) !== 0) {
      fail(`${JSON.stringify(junk)} was accepted as an upstream volt drop`);
    }
  }

  /* A substation IS the start of the network. Its own contribution is
     impedance and sourceImpedance already handles it; there is nothing
     upstream of it to account for. */
  const sub = {
    Feature_Role: "substation",
    Attributes: { Source_Volt_Drop_Pct: 9 },
  };
  if (upstreamVoltDropPct(sub) !== 0) {
    fail("a substation reported an upstream volt drop \u2014 it is the origin");
  }
  if (upstreamVoltDropPct(null) !== 0) fail("no origin produced an upstream drop");
}

/* ── And it reaches every figure downstream ── */
{
  const model = {
    nodes: [[0, 0], [100, 0]], parent: [-1, 0],
    cum: [0, 1], cumKva: [10, 10], meterKva: [0, 0], meterCount: [0, 1], S: 0,
  };
  const cable = { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.6, Volt_Drop_Base: 1.1 };
  const base = {
    model, targetIdx: 1, spanNodes: [{ index: 1, cableSizeId: 1 }],
    cableById: () => cable, voltageV: 400, settings: { maxVoltDropPct: 6 },
  };

  const plain = cumulativeToNode(base);
  const withUp = cumulativeToNode({ ...base, startPct: 2.5 });

  /* The design's own drop is untouched by what happened upstream — it
     is the only part a cable change moves, and a designer works in it. */
  if (Math.abs(withUp.pctOwn - plain.pctOwn) > 1e-9) {
    fail("declaring an upstream drop changed this design's own figure");
  }
  /* And the cumulative one carries it. */
  if (Math.abs(withUp.pct - (plain.pctOwn + 2.5)) > 1e-9) {
    fail(`the cumulative figure is ${withUp.pct}, not the design's plus 2.5`);
  }
  if (withUp.upstreamPct !== 2.5) fail("the upstream share is not reported separately");

  /* `pct` stays the cumulative one, so every existing reader — the
     panel, the CSV, the node labels, the scenario search — judges
     against the right figure without being changed. */
  if (withUp.pct <= withUp.pctOwn) {
    fail("pct is not the cumulative figure \u2014 existing readers would"
      + " judge against the design's share alone");
  }

  /* The limit is judged on the cumulative figure. A run that passes on
     its own and fails once the feeding network is counted is a run that
     fails, and a display switch must never be able to hide that. */
  /* Pitched off this fixture's own drop rather than at a fixed 5.99:
     the leg here drops about a thousandth of a percent, so a fixed
     figure left the total just under the limit and the assertion passed
     for the wrong reason. Just enough upstream to cross it. */
  const justOver = 6 - plain.pctOwn + 0.001;
  const over = cumulativeToNode({ ...base, startPct: justOver });
  if (over.pctOwn >= 6) fail("the fixture is wrong \u2014 its own drop already fails");
  if (over.pct <= 6) fail("the fixture is wrong \u2014 the total does not exceed the limit");
  if (!over.overPct) {
    fail("a run inside its own limit but over once upstream is counted"
      + " was not marked over");
  }

  /* Zero upstream leaves the two equal, which is why nothing had to
     distinguish them before. */
  if (plain.pct !== plain.pctOwn || plain.upstreamPct !== 0) {
    fail("with nothing upstream the two figures disagree");
  }
}

/* ── The switch shows one or the other, and hides neither failure ── */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/vdBasis === "own" \? l\.vd\.pctOwn : l\.vd\.pct/.test(canvas)) {
    fail("the panel does not draw whichever basis is chosen");
  }
  /* The over-limit mark reads the cumulative figure whichever number is
     drawn. Tying it to the basis would let a display switch hide a
     failing run, which is the worst thing this switch could do. */
  if (!/className=\{l\.vd\.overPct \? "num vd-over" : "num"\}/.test(canvas)) {
    fail("the over-limit mark follows the display switch");
  }
  /* Offered only where something upstream exists — a switch between one
     number and the same number teaches somebody it does nothing. */
  if (!/tracePlan\.some\(\(x\) => x\.leg\?\.vd\?\.upstreamPct > 0\)/.test(canvas)) {
    fail("the basis switch is offered on schemes with nothing upstream");
  }
  /* ── Every path that computes levels reads it ──

     There are three, and one was missed for a fortnight: the report
     modal had it, the advanced check had it, and levelsByNode — which
     draws the label beside each span node on the canvas — did not. So
     every node label had upstreamPct 0 and pctOwn equal to pct, and the
     Cumulative / From E0 switch moved between two identical numbers.

     It read as the switch not being wired to the drawing. It was; the
     drawing had nothing to switch. Counted rather than merely present,
     because two of three passing is exactly what that looked like. */
  /* Any way of supplying it, not one spelling. Three sites read it from
     the origin directly and one takes it off the shared ctx, and a
     check that counted only the first form failed on correct code. */
  const wired = [...canvas.matchAll(/startPct:/g)].length;
  const paths = [...canvas.matchAll(/cumulativeToNode\(/g)].length;
  /* And at least one still reads it from the origin, or every site
     could be passing a zero to itself. */
  if (!/startPct: upstreamVoltDropPct\(/.test(canvas)) {
    fail("nothing reads the upstream drop off the POC");
  }
  if (wired < paths) {
    fail(`${paths} paths compute levels and only ${wired} read the upstream`
      + " drop \u2014 the ones that do not show a figure that cannot be switched");
  }
}

/* ── One current formula, in two modules ──

   The levels check reported 25.0 A where the substation way-fuse
   comparison reported 43.3 A for the same 30 kVA at 400 V \u2014 low by
   exactly √3, on the figure a designer sizes a cable against.

   Not a modelling difference. `kVA × 1000 ÷ 3 ÷ V` is a correct
   per-phase form and wants the PHASE voltage; it was handed `Output_V`,
   which is the substation's line voltage and defaults to 400. A
   per-phase power divided by a line voltage.

   Both now use I = kVA × 1000 ÷ (√3 × V). Written once in each module
   rather than shared, because voltDrop.js imports nothing and tying it
   to electric.js to borrow four lines of arithmetic would cost more
   than it saves. This is what keeps them honest instead. */
{
  /* Across the range, not at one point: two formulas differing by a
     constant agree at zero and nowhere else, and one differing by a
     factor agrees nowhere. A single sample proves neither. */
  for (const [kva, volts] of [
    [30, 400], [100, 400], [75, 415], [1, 230], [0, 400], [250, 400],
  ]) {
    const a = ampsOf(kva, volts);
    const b = ampsFor(kva, volts);
    if (Math.abs(a - b) > 1e-9) {
      fail(`${kva} kVA at ${volts} V: the levels check says ${a.toFixed(2)} A`
        + ` and the fuse comparison says ${b.toFixed(2)} A`);
    }
  }

  /* And the value is right, not merely consistent. Two copies of one
     wrong formula agree perfectly. */
  const want = 30 * 1000 / (Math.sqrt(3) * 400);
  if (Math.abs(ampsOf(30, 400) - want) > 1e-9) {
    fail(`30 kVA at 400 V gives ${ampsOf(30, 400).toFixed(2)} A,`
      + ` not the ${want.toFixed(2)} A a three-phase line carries`);
  }
  /* The old form, named so it cannot come back unnoticed. */
  if (Math.abs(ampsOf(30, 400) - (30 * 1000 / 3 / 400)) < 1e-9) {
    fail("the levels check is back to dividing a per-phase power by the"
      + " line voltage \u2014 42% under on every current it reports");
  }

  /* No output voltage recorded is a drawing that has not been finished.
     Zero says that; infinity says nothing. */
  for (const bad of [0, -1, null, undefined, "", "abc"]) {
    if (ampsOf(30, bad) !== 0) {
      fail(`${JSON.stringify(bad)} volts produced ${ampsOf(30, bad)} A`);
    }
  }

  /* ── And nothing else moved ──

     Volt drop and loop impedance are worked out from kVA and length and
     never from current, so correcting this must leave every existing
     result exactly where it was. */
  const cable = { Loop_Impedance_Ohm: 0.32, Volt_Drop_Base: 0.41 };
  const leg = legVoltDrop({
    cable, lengthM: 100, terminalKva: 30, voltageV: 400,
  });
  if (Math.abs(leg.ohms - 0.032) > 1e-9) {
    fail(`loop impedance moved: ${leg.ohms} for 100 m of 0.32 Ω/km`);
  }
  if (Math.abs(leg.pct - (30 * 0.41e-6 * 100)) > 1e-12) {
    fail(`volt drop moved: ${leg.pct} for 30 kVA over 100 m`);
  }
  /* The reported current did move, and by √3 \u2014 which is the whole
     point of the change. */
  if (Math.abs(leg.amps - want) > 1e-9) {
    fail(`the leg reports ${leg.amps.toFixed(2)} A, not ${want.toFixed(2)}`);
  }
}

/* ── What a plot connection costs ──

   A service joint is not free: cutting a main and jointing a service
   onto it puts resistance in the run that undisturbed cable does not
   have. Nothing counted it — the word "joint" appeared nowhere in the
   calculation.

   Charged as an equivalent length of the joint's OWN cable, three
   metres by default (0187), because the cost depends on the cable it is
   in and because length moves the volt drop and the loop impedance
   together without a second constant that could disagree. */
{
  const cable = { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.32, Volt_Drop_Base: 0.41 };

  /* One leg, 100 m, four connections on it. */
  const leg = (jointEquivM, jointCount) => legVoltDrop({
    cable, lengthM: 100, distributedKva: 30, meterCount: 4,
    voltageV: 400, jointEquivM, jointCount,
  });

  const off = leg(0, 4);
  const on = leg(3, 4);

  /* 112 m charged for 100 laid. Both figures move, and by the same
     proportion, because both are computed from length. */
  for (const [what, a, b] of [["volt drop", off.pct, on.pct],
    ["loop impedance", off.ohms, on.ohms]]) {
    if (Math.abs(b / a - 1.12) > 1e-9) {
      fail(`the allowance moved the ${what} by ${(b / a).toFixed(4)}, not the`
        + " 1.12 that four three-metre joints on a 100 m leg come to");
    }
  }
  if (on.jointAllowM !== 12) {
    fail(`the leg reports ${on.jointAllowM}m of joint allowance, not 12`);
  }

  /* Zero gives the calculation this app had before, which is the way
     back if a design was submitted on the old numbers. */
  if (leg(0, 4).pct !== off.pct) fail("zero is not the same as no allowance");
  /* And a setting that is not a number is not a licence to guess. */
  for (const junk of [-5, "x", null, undefined, NaN]) {
    if (leg(junk, 4).jointAllowM !== 0) {
      fail(`a setting of ${JSON.stringify(junk)} charged an allowance`);
    }
  }

  /* ── Charged once, on the leg the connection is on ──

     `meterCount` counts the customers on the section AND everything
     downstream, because the unbalanced correction wants the lot. Using
     it for the allowance would charge one plot's joint once per leg all
     the way back to the origin — a run of ten legs would charge the
     last plot ten times. */
  const model = {
    nodes: [[0, 0], [100, 0], [200, 0]], parent: [-1, 0, 1],
    cum: [0, 1, 2], cumKva: [30, 30, 15],
    meterKva: [0, 15, 15], meterCount: [0, 1, 1], S: 0,
  };
  const walk = (jointEquivM, targetIdx) => cumulativeToNode({
    model, targetIdx, cableById: () => cable, voltageV: 400,
    spanNodes: [{ index: 1, cableSizeId: 1 }, { index: 2, cableSizeId: 1 }],
    settings: jointEquivM ? { jointEquivM } : {},
  });

  /* Two legs of 100 m, one connection at the end of each: 206 m. */
  if (Math.abs(walk(3, 2).ohms / walk(0, 2).ohms - 206 / 200) > 1e-9) {
    fail("two connections over two legs are not charged as six metres");
  }
  /* And the first leg alone is 103, not 106 — the second connection is
     not charged on a leg it is not on. */
  if (Math.abs(walk(3, 1).ohms / walk(0, 1).ohms - 103 / 100) > 1e-9) {
    fail("a connection downstream is charged on the legs above it too");
  }

  /* ── The connection at a node counts ──

     `distCount` alone counts only meters tapped BETWEEN span nodes, and
     on a real drawing a service tees in where Place Span Nodes puts a
     node — so the connection is at a node, distCount is zero, and the
     allowance fired nowhere. It showed up only in a fixture with meters
     deliberately placed mid-leg. */
  if (walk(3, 2).ohms <= walk(0, 2).ohms) {
    fail("a connection made at a span node is charged nothing \u2014 which is"
      + " every connection on a real drawing");
  }

  /* ── And every settings object carries it ──

     This file builds the settings for the calculation THREE times: once
     for the canvas node labels, once for the levels check report, once
     for the advanced check. The field went into one of them, so the
     labels moved and the report did not — and the report is where
     anybody would look.

     The same shape as startPct, missed the same way, one release apart.
     So it is counted against the objects rather than looked for: every
     one that sets a distributed load factor is a settings object for
     this calculation, and every one of them needs the allowance. */
  const canvasSrc = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const objects = [...canvasSrc.matchAll(/distributedLoadFactor:/g)].length;
  const carrying = [...canvasSrc.matchAll(/jointEquivM:/g)].length;
  if (carrying < objects) {
    fail(`${objects} settings objects feed the calculation and only`
      + ` ${carrying} carry the joint allowance — the ones that do not`
      + " show figures with no allowance in them");
  }
  if (!/Joint_Equivalent_M/.test(canvasSrc)) {
    fail("the allowance is never read from Electric_VD_Setting");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Source impedance behaves (from the substation or the POC, and said plainly when absent).");
process.exit(bad ? 1 : 0);
