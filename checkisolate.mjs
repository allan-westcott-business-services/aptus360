/* What an isolate is allowed to take away.

   Opening a utility menu isolates that layer: every feature whose keys
   are not kept gets hidden. That is the point of it — and twice now it
   has taken something with it that the isolate was never about.

   The survey and the span nodes were the first two, and each earned an
   exception on the same argument: a utility shown without the ground it
   runs over is half a drawing.

   The plot seeds and the trench are the same case and a stronger one.
   The seeds say which house each service goes to; the trench says where
   the ground is open. Everything on a utility layer lies in that dig,
   so hiding it shows the cable and not the hole.

   Their own H still hides them. This is only about an isolate taking
   them away as a side effect of asking for something else. */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* ── The sweep ──

   From applyShown to the line that writes the hidden set. Both bounds
   are strings that appear once, and it fails loudly if either moves —
   an earlier version of this file used a boundary that matched
   somewhere else, so the slice ended before the code it was checking
   and every assertion passed with the fix taken out. A check that
   cannot see the fault is worse than no check, because it reports all
   clear. */
{
  const from = canvas.indexOf("const applyShown = useCallback");
  const to = canvas.indexOf("setHidden([...all].filter((k) => !keep.has(k)));");
  if (from < 0 || to < 0 || to <= from) {
    fail("could not find the isolate sweep \u2014 the assertions below are not being made");
  } else {
    const sweep = canvas.slice(from, to);

    // 1. Plot seeds survive.
    if (!/k === "role:plot"/.test(sweep)) {
      fail("isolating a utility hides the plot seeds");
    }
    /* Both spellings. A feature goes if ANY of its keys is hidden, so a
       seed placed on the trench carries the narrower key too — keeping
       only the plain one leaves it hidden by the other and takes the
       seed with it. That was exactly the span node bug. */
    if (!/endsWith\(":role:plot"\)/.test(sweep)) {
      fail("only the plain plot key is kept \u2014 a seed on the trench is still hidden");
    }

    // 2. And the trench.
    if (!/k === "trench"/.test(sweep)) {
      fail("isolating a utility hides the trench layer");
    }
    if (!/startsWith\("lt:trench/.test(sweep)) {
      fail("the trench line types are not kept \u2014 the dig disappears under an isolate");
    }
  }
}

/* ── What is being placed stays on screen ──

   A seed hidden while seeds are being placed means tapping the plan and
   watching nothing appear. The work looks like it failed, so it gets
   done twice — and the second seed is real.

   Only while a placement is waiting for a click. Everything else stays
   hidden as it was, and when the queue is done the layer goes back to
   whatever the drawing said. */
{
  const vFrom = canvas.indexOf("const visible = useMemo");
  const vTo = canvas.indexOf("if (outsideCircuit(f, isolatedCircuit)) return false;");
  if (vFrom < 0 || vTo < 0 || vTo <= vFrom) {
    fail("could not find the visibility filter \u2014 the assertions below are not being made");
  } else {
    const vis = canvas.slice(vFrom, vTo);

    if (!/awaitingClick/.test(vis)) {
      fail("a seed being placed can still be hidden by an isolate");
    }
    /* Above the hidden test, or it never runs: the filter returns false
       on a hidden key before it would reach the guard. */
    const guard = vis.indexOf("awaitingClick");
    const hide = vis.indexOf("hidden.includes(k)");
    if (guard >= 0 && hide >= 0 && guard > hide) {
      fail("the placement guard sits below the hidden test, so it never runs");
    }
  }

  /* Declared above its first use.

     `visible` is a memo that runs during render, so reading a const
     declared below it throws — and that takes the whole canvas out
     rather than losing a layer. This is how it was first written, and
     it is recurring fault 2. */
  const declared = canvas.indexOf("const awaitingClick =");
  const usedAt = canvas.indexOf("const visible = useMemo");
  if (declared < 0) fail("awaitingClick is not declared at all");
  else if (declared > usedAt) {
    fail("awaitingClick is declared after `visible` reads it \u2014 the canvas will not render");
  }
  const placingAt = canvas.indexOf("const placing =");
  if (placingAt < 0 || placingAt > declared) {
    fail("placing is declared after awaitingClick reads it");
  }
}

console.log(bad === 0
  ? "  ok  Isolate behaves (plots and the dig stay; what is being placed stays)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
