/* Committing plots to a circuit.

   Link to Circuit lassoes plot seeds and asks which circuit they belong
   to. The dialog listed the circuits on the drawing and clicking one WAS
   the commit — it assigned the meters and closed.

   That reads well enough on a drawing that already has circuits. The
   first circuit on a site has none, so the list was empty and the only
   thing that would commit was a dashed "+ New circuit" sitting under a
   "Fed from" picker, above a Cancel button. It looked like a form with
   no OK, and people cancelled out of it believing nothing had been
   assigned — which was true, because nothing had.

   A row is a choice now and the action row commits. What must hold:

   - one commit control, not two. A dialog where the row assigns AND a
     button assigns is the duplicated control of fault 18, and the two
     drift;
   - the button says what it will do, so it and the chosen row cannot
     disagree;
   - a site's first circuit needs no tick before the button lights: with
     nothing to choose between, the choice carries no decision;
   - the "fed from" rule still answers on press, with its reason. A
     button that will not move and does not say why is the same dead end
     in a different place. */
import { readFileSync } from "node:fs";
import { circuitsFrom } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

const dialog = (() => {
  const at = canvas.indexOf("{circuitPick && (");
  return at < 0 ? "" : canvas.slice(at, canvas.indexOf("{trenchCheck && (", at));
})();

if (!dialog) fail("the circuit picker has gone");

/* The rows choose. */
if (!/onClick=\{\(\) => setCircuitPick\(\{ \.\.\.circuitPick, target: c\.id/.test(dialog)) {
  fail("clicking a circuit still commits rather than choosing it");
}
if (!/target: "new"/.test(dialog)) {
  fail("+ New circuit is not a choice like the others");
}

/* And exactly one thing commits. */
const commits = (dialog.match(/finishCircuitPick\(/g) || []).length;
if (commits !== 1) {
  fail(`${commits} controls commit the dialog, expected the one button `
    + "— two ways to assign is two things to keep in step");
}
if (!/disabled=\{circuitPick\.target == null\}/.test(dialog)) {
  fail("the commit button is live before anything has been chosen");
}
if (!/Create circuit/.test(dialog) || !/Add to \$\{/.test(dialog)) {
  fail("the button does not say which of the two it will do");
}

/* A site's first circuit: nothing to choose between, so it is chosen. */
if (!/target: circuits\.length \? null : "new"/.test(canvas)) {
  fail("the first circuit on a site still needs a tick before the button "
    + "will light, on a list with one option");
}

/* The fed-from rule still answers on press. */
{
  const fn = canvas.slice(canvas.indexOf("async function finishCircuitPick"),
    canvas.indexOf("async function createCircuitFromMeters"));
  if (!/Say which POC feeds the new circuit first/.test(fn)) {
    fail("a new circuit on a two-POC drawing no longer says who feeds it");
  }
  if (!/setCircuitPick\(\{ \.\.\.pick,\s*\n\s*note:/.test(fn)) {
    fail("the fed-from refusal closes the dialog instead of saying why");
  }
}

/* The chosen row is visibly chosen, or the button names something the
   eye cannot find. */
if (!/\.cpick-item\.on \{/.test(canvas)) {
  fail("a chosen circuit is not marked, so nothing on screen says which "
    + "one the button will use");
}

/* ── A box naming a circuit that is gone ──

   A circuit exists while meters name it — `circuitsFrom` derives the
   list from the meters, so the last meter leaving takes the circuit with
   it. The box's Circuit_ID is a second record of the same fact and
   nothing clears it, so a box that was on Circuit 1 goes on saying so
   afterwards. The lasso measured against that stamp and refused
   everything: "Nothing in that outline is on Circuit 1" — about a
   circuit not in the report, which reads as the app caching something.

   The meters are the fact and the stamp is a copy. A copy naming
   something that is not there is dropped. */
{
  const lasso = canvas.slice(canvas.indexOf("async function finishLinkWayAssign"),
    canvas.indexOf("async function moveToLinkWay"));
  if (!lasso) fail("the link-way lasso has gone");
  else {
    if (!/const live = circuitsFrom\(features\);/.test(lasso)) {
      fail("the lasso does not check that the box's circuit still exists");
    }
    if (!/const claimed = stale \? null : stamped;/.test(lasso)) {
      fail("a box still governs the lasso with a circuit that has no "
        + "meters left on it");
    }
    /* And it says so, rather than changing the box's circuit quietly. */
    if (!/which no longer has any meters on it/.test(lasso)) {
      fail("the box changes circuit silently when its old one has gone");
    }
  }

  /* The rule the above rests on: a circuit is its meters. If
     circuitsFrom ever starts reporting circuits from something else,
     "no longer exists" stops meaning what this assumes. */
  const gone = circuitsFrom([
    { Feature_ID: 1, Feature_Role: "linkbox", Feature_Type: "point",
      Layer_Key: "electric", Geometry: [[0, 0]],
      Attributes: { Circuit_ID: 1, Circuit_Name: "Circuit 1" } },
  ]);
  if (gone.length) {
    fail("a link box alone now makes a circuit exist — the staleness test "
      + "in the lasso rests on it not doing that");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The circuit picker behaves (rows choose, one button commits, and it "
  + "says what it will do).");
process.exit(bad ? 1 : 0);
