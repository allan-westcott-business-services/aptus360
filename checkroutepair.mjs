/* Two POCs and two substations: which one connects to which?

   `routePocToSubstation` took the FIRST of each. On a site with one of
   each that is the only pair there is, so nobody noticed; with two of
   each it silently routed POC 1 to Substation 1 and there was no way to
   ask for anything else. */
import { readFileSync } from "node:fs";
import { routePocToSubstation } from "./src/features/gis/route.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const poc = (id, l) => ({ Feature_ID: id, Feature_Role: "poc",
  Layer_Key: "electric", Label: l, Geometry: [[id, 0]] });
const sub = (id, l) => ({ Feature_ID: id, Feature_Role: "substation",
  Layer_Key: "electric", Label: l, Geometry: [[id, 10]] });

// 1. One of each: no question to ask.
{
  const r = routePocToSubstation([poc(1, "POC 1"), sub(9, "Substation 1")], {});
  if (r.needsChoice) {
    fail("a drawing with one POC and one substation is asked which pair, "
      + "which is a step that answers itself");
  }
}

// 2. Two of each: asked, not guessed.
{
  const world = [poc(1, "POC 1"), poc(2, "POC 2"),
    sub(9, "Substation 1"), sub(10, "Substation 2")];
  const r = routePocToSubstation(world, {});
  if (!r.needsChoice) {
    fail("with two of each it picks a pair itself, which is wrong half the "
      + "time and cannot be corrected");
  }
  /* Both lists, even where only one side is ambiguous: the PAIR is what
     somebody is choosing, and half a pair reads as a trick question. */
  if (r.pocs?.length !== 2 || r.substations?.length !== 2) {
    fail("the choice does not offer both sides");
  }
  if (!r.pocs.every((o) => o.id != null && o.label)) {
    fail("an option has no label, so the choice is between two blanks");
  }

  /* One side ambiguous is still a question. */
  const oneSide = routePocToSubstation(
    [poc(1, "POC 1"), poc(2, "POC 2"), sub(9, "Substation 1")], {});
  if (!oneSide.needsChoice) fail("two POCs and one substation is not asked about");
}

// 3. A named pair proceeds, and a stale id is said plainly.
{
  const world = [poc(1, "POC 1"), poc(2, "POC 2"),
    sub(9, "Substation 1"), sub(10, "Substation 2")];
  const r = routePocToSubstation(world, { pocId: 2, substationId: 10 });
  if (r.needsChoice) fail("a pair was named and it asked anyway");

  const gone = routePocToSubstation(world, { pocId: 99, substationId: 10 });
  if (!/no longer on the drawing/.test(gone.error || "")) {
    fail("a POC that has been deleted since the choice is not reported");
  }
}

// 4. Routing the second pair does not delete the first.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* A second route was almost always a mistake rather than a design
     with two incomers, so an existing one was replaced. On a site with
     two of each it IS the design. */
  if (!/Poc_Route_Poc_ID: r\.poc\.Feature_ID/.test(canvas)) {
    fail("a route does not record which pair it is for, so the second one "
      + "drawn deletes the first");
  }
  if (!/Number\(p\) === Number\(r\.poc\.Feature_ID\)/.test(canvas)) {
    fail("every route is replaced rather than this pair's, so the feature "
      + "appears not to work twice");
  }
  /* A route drawn before this existed carries neither id: on those
     drawings there was only ever one, so it is still replaced. */
  if (!/if \(p == null && sb == null\) return true;/.test(canvas)) {
    fail("an older route is left behind forever, because it names no pair");
  }
  /* And the canvas asks. */
  if (!/if \(r\.needsChoice\) \{ setRoutePick\(r\); return; \}/.test(canvas)) {
    fail("the canvas ignores the question and routes something");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Routing a supply asks which pair (and keeps the other one).");
process.exit(bad ? 1 : 0);
