/* What follows a joint when it is dragged, and what the panel shows
   after a suggestion is applied.

   ── A breech is several cables ──

   "A joint sits ON one cable" is true of a service joint, which is a
   fitting let into a run, and false of a breech: a breech is where a
   run ENDS and others begin. On a live drawing three feeders meet at
   one — the incoming cable's last vertex and two outgoing cables'
   first. The drag picked the nearest single feeder, so one of the three
   followed and two stayed put: dragging the joint tore the cable apart
   at the very fitting that joins it.

   The narrowing exists for a real reason — two circuits' mains share a
   trench, so a service joint at a tee could otherwise drag both — and
   it stays for joints that sit on a run.

   ── And the panel keeps its shape ──

   Applying a suggestion re-ran a SINGLE-NODE trace, whatever had
   produced the panel. The levels check traces every circuit and returns
   parts; the re-run returned one node's legs. So the circuit picker
   disappeared, the other circuits with it, and the volt drop columns
   went with the `levels` flag that was no longer set. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* The drag rule. */
{
  /* To a marker, not a character count. A fixed window cut the block
     in half — these functions carry more comment than code, and 6000
     characters covered barely a hundred lines of it. */
  const at = canvas.indexOf("const jointFeeder = (() => {");
  const end = canvas.indexOf("drag.current.rubber.push(", at);
  const drag = at < 0 || end < 0 ? "" : canvas.slice(at, end);
  if (!drag) fail("the joint drag rule has gone");
  else {
    if (!/const isBreech = String\(pt\.Attributes\?\.Joint_Type \?\? ""\)/.test(drag)) {
      fail("a breech is not told apart from a joint that sits on a run");
    }
    if (!/isFeeder && !isBreech\s*\n\s*&& Number\(line\.Feature_ID\) !== Number\(jointFeeder/.test(drag)) {
      fail("a breech still moves only one of the cables that meet it — "
        + "dragging it tears the joint apart");
    }
    /* The narrowing must survive for everything else, or a service
       joint at a shared tee drags two circuits' mains again. */
    if (!/jointFeeder !== undefined && isFeeder/.test(drag)) {
      fail("the single-feeder rule has gone entirely — a service joint at "
        + "a shared tee will drag both circuits' cables");
    }
    /* And a breech takes ends, not every vertex: offering it interior
       points would let it claim a cable that merely passes close. */
    if (!/isJoint && isFeeder && !isBreech/.test(drag)) {
      fail("a breech is offered every vertex of a passing cable");
    }
  }
}

/* The panel after a change. */
{
  const at = canvas.indexOf("async function applyScenario(suggestion)");
  const fn = at < 0 ? "" : canvas.slice(at, at + 4500);
  if (!fn) fail("applyScenario has gone");
  else {
    if (!/const wasLevels = !!trace\?\.levels;/.test(fn)) {
      fail("applying a suggestion does not notice which run made the panel");
    }
    if (!/runLevelsCheck\(\{\s*\n\s*srcFeatures: after,/.test(fn)) {
      fail("a levels panel is re-run as a single-node trace, so the circuit "
        + "picker and the other circuits disappear");
    }
    if (!/stopAt: wasAdvanced \? "junctions" : "spannodes"/.test(fn)) {
      fail("the re-run does not keep the depth the check was run at");
    }
    if (!/if \(wasShowing\) setTraceCircuit\(wasShowing\)/.test(fn)) {
      fail("the circuit being read is not kept, so a change made on the "
        + "third circuit drops the reader back to the first");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Breech drag and scenario re-run behave (every cable follows its "
  + "breech; the levels panel stays a levels panel).");
process.exit(bad ? 1 : 0);
