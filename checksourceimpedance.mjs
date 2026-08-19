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
} from "./src/features/gis/electric.js";

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
  if (!/sourceImpedance\(station/.test(body)) {
    fail("the levels check does not take its impedance from the origin");
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

console.log(bad ? `\n${bad} problem(s)`
  : "Source impedance behaves (from the substation or the POC, and said plainly when absent).");
process.exit(bad ? 1 : 0);
