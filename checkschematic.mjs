/* A schematic is a drawing of ONE network.

   A levels check covering several circuits puts all their legs in one
   list, and the schematic drew the lot as one tree. `treeFromLegs`
   takes the first root it finds, so ONE circuit came out as a hierarchy
   and every other circuit's nodes — unreachable from that root — landed
   at a single depth: a straight line of boxes across the page.

   Reported as "circuit 2 looks fine and circuit 3 is a straight line",
   which is exactly what it was. Circuit 2 held the root. */
import { readFileSync } from "node:fs";
import { treeFromLegs, layoutTree } from "./src/features/gis/schematic.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Two circuits, each a tree of its own, in one list. */
const c2 = [
  { from: "B0", to: "B1", circuitName: "Circuit 2" },
  { from: "B1", to: "B2", circuitName: "Circuit 2" },
  { from: "B1", to: "B3", circuitName: "Circuit 2" },
];
const c3 = [
  { from: "C0", to: "C1", circuitName: "Circuit 3" },
  { from: "C1", to: "C2", circuitName: "Circuit 3" },
  { from: "C2", to: "C3", circuitName: "Circuit 3" },
  { from: "C2", to: "C6", circuitName: "Circuit 3" },
];
const all = [...c2, ...c3];

/* The fault, so the fix is measured against something real: drawn
   together, the second circuit flattens. */
{
  const lay = layoutTree(treeFromLegs(all, "B0"), {});
  const cNodes = (lay.nodes || []).filter((n) => String(n.key ?? n.label).startsWith("C"));
  const depths = new Set(cNodes.map((n) => n.y));
  if (depths.size > 1) {
    fail("the fixture no longer reproduces the fault \u2014 two circuits in one "
      + "tree used to flatten the one without the root, and this check "
      + "proves nothing until it does");
  }
}

/* Drawn one at a time, each keeps its shape. */
for (const [name, want] of [["Circuit 2", 4], ["Circuit 3", 5]]) {
  const legs = all.filter((l) => l.circuitName === name);
  /* The root has to belong to the circuit being drawn: `trace.from` is
     the check's origin, which on a multi-circuit check is one circuit's
     and not the others'. */
  const from = legs.some((l) => l.from === "B0") ? "B0" : null;
  const lay = layoutTree(treeFromLegs(legs, from), {});
  const n = (lay.nodes || []).length;
  if (n !== want) fail(`${name} drew ${n} nodes, wanted ${want}`);
  const depths = new Set((lay.nodes || []).map((x) => x.y));
  if (depths.size < 2) {
    fail(`${name} came out at one depth \u2014 a straight line of boxes rather `
      + "than a hierarchy");
  }
}

/* And the modal does it: one circuit drawn, the others offered rather
   than dropped. */
{
  const src = readFileSync("./src/features/gis/SchematicModal.jsx", "utf8");
  if (!/l\.circuitName \?\? null\) === drawn/.test(src)) {
    fail("the schematic draws every checked circuit as one tree");
  }
  if (!/legs\.some\(\(l\) => l\.from === trace\?\.from\) \? trace\.from : null/.test(src)) {
    fail("the root is taken from the check rather than from the circuit "
      + "being drawn, so a circuit that does not contain it is rootless");
  }
  if (!/circuits\.length > 1 && \(/.test(src)) {
    fail("with several circuits checked there is no way to see the others, "
      + "which trades a wrong drawing for a missing one");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The schematic draws one circuit (and says which).");
process.exit(bad ? 1 : 0);
