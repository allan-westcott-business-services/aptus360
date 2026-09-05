/* One feature, built once.

   The measured-length prompt was built TWICE across separate changes:
   two effects writing the same state in two different shapes, and two
   dialogs reading it. The producer that survived set a single feature;
   the consumer expected a list of rows. Whichever dialog rendered,
   answering it would have thrown on `ask.rows` and taken the canvas
   down — and it shipped, because nothing fails while nobody redraws a
   measured line.

   Nothing in the suite could see it: both halves were syntactically
   fine, the build passed, and every check tested the half it knew
   about.

   So: a piece of state gets ONE dialog and ONE producer. Two of either
   means the same thing was built twice, and the two will disagree. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* Each dialog state renders once. */
for (const st of ["measuredAsk", "jointPick", "circuitPick", "trenchCheck"]) {
  const renders = canvas.split(`{${st} && (`).length - 1;
  if (renders > 1) {
    fail(`${st} is rendered ${renders} times — the same dialog built twice, `
      + "and the two will read the state differently");
  }
}

/* And the producer and the consumer agree about its shape. */
{
  const producers = (canvas.match(/setMeasuredAsk\(\{(?!\s*\.\.\.measuredAsk)/g) || []).length;
  if (producers > 1) {
    fail(`${producers} places create the measured-length state — one of them `
      + "is a second implementation, and only one matches the consumer");
  }
  const fnAt = canvas.indexOf("async function answerMeasured");
  const fn = fnAt < 0 ? "" : canvas.slice(fnAt, fnAt + 1400);
  const wantsRows = /ask\.rows/.test(fn);
  const makesRows = /setMeasuredAsk\(\{[^}]*rows:/s.test(canvas);
  if (wantsRows && !makesRows) {
    fail("answerMeasured reads ask.rows and nothing writes rows — answering "
      + "the prompt throws and takes the canvas down");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "No feature is built twice (one dialog and one producer per state).");
process.exit(bad ? 1 : 0);
