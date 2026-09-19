/* What a link box's input carries.

   The trunk is the cable from the circuit's origin to the box, and it
   carries everything the box serves. Its load was worked out by
   adding up the meter counts of every section on every output — and a
   section's count is CUMULATIVE, so each customer was counted once
   for every section they sit behind.

   On project 20 the trunk into Link Box 1 read **82** customers where
   circuit 1 has **41**. The two way roots are 27 and 14, which is the
   answer; 27 + 14 + 6 + 6 + 6 + 16 + 1 + 6 is what was being added.

   ── Why it survived ──

   It reads as plausible from every direction. The trunk is genuinely
   the heaviest cable on the drawing, so a big number against it looks
   right. Nothing fails and nothing throws. And the only way to catch
   it by eye is to add a circuit's meters up by hand and compare.

   What it cost: the trunk is 327 m of 300 mm, so the volt drop
   charged 41 customers that do not exist, weighted at a half, to the
   longest run in the scheme — about 2.5 points out of 11. It also
   sized the input cable against double the load, which is the
   harmless direction, and is why nobody noticed. */
import { readFileSync } from "node:fs";
import { feederSections } from "./src/features/gis/feeder.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
  { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
];
let id = 1;
const trench = (pts, key = "trench") => ({
  Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
  Geometry: pts, Attributes: { Line_Type: key },
});
const plot = (n, at) => ({
  Feature_ID: id++, Feature_Role: "plot", Feature_Type: "point",
  Plot_ID: n, Geometry: [at], Attributes: {},
});
const meter = (p, at) => ({
  Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
  Layer_Key: "electric", Plot_ID: p.Plot_ID, Geometry: [at],
  Attributes: { Seed_Feature_ID: p.Feature_ID, Circuit_ID: 1 },
});
const sub = {
  Feature_ID: id++, Feature_Role: "substation", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
};

// 1. A section's count is cumulative, and the sections do not add up.
{
  /* A run that FORKS, because that is what makes sections. Three
     customers: one out along the east branch, two up the north. The
     walk reports a root section of 3 and branches of 1 and 2, which
     sums to 6 — double the customers on the drawing, and exactly the
     shape of the trunk fault. */
  const drawing = [
    sub,
    trench([[0, 0], [40, 0]]),
    trench([[40, 0], [80, 0]]),
    trench([[40, 0], [40, 40]]),
  ];
  const at = (n, pt) => {
    const p = plot(n, pt);
    drawing.push(trench([[pt[0], pt[1] - 10], pt], "service_trench"), p,
      meter(p, pt));
  };
  at(1, [80, 10]);
  at(2, [40, 50]);
  at(3, [40, 50.0001]);

  const r = feederSections(drawing, { lineTypes, plotById: () => ({ kva_load: 2.9 }) });
  if (r.error) fail(`the walk refused: ${r.error}`);
  else {
    if (r.totalMeters !== 3) {
      fail(`the run serves ${r.totalMeters} customers, wanted 3`);
    }
    const summed = r.sections.reduce((t, s) => t + (s.meters || 0), 0);
    if (r.sections.length < 2) {
      fail("the fixture produced one section, so it no longer shows the "
        + "difference between a section's count and a run's total");
    } else if (summed <= r.totalMeters) {
      fail(`the sections sum to ${summed} against a total of ${r.totalMeters}, `
        + "so this case has stopped demonstrating the difference between a "
        + "cumulative figure and a total \u2014 which is the whole fault");
    }
  }
}

// 2. And the trunk reads the total, not the sum.
{
  /* Source, because reaching the box path needs a drawing with ways
     assigned and seeds split across them, and the fixture for that is
     a session's work on its own. Named here so it is not forgotten:
     this case proves the call site reads the right field, and a
     behavioural one over a real link box is still wanted. */
  const src = readFileSync("./src/features/gis/feeder.js", "utf8");
  const at = src.indexOf("const tally = servedBy.get(Number(box.Feature_ID));");
  if (at < 0) fail("the trunk no longer tallies what its box serves");
  else {
    const block = src.slice(at, at + 400);
    if (/for \(const sec of r\.sections\)/.test(block)) {
      fail("the trunk adds up its outputs' SECTIONS again \u2014 those counts are "
        + "cumulative, so every customer is counted once per section they "
        + "sit behind, and a link box's input reads double");
    }
    if (!/r\.totalMeters/.test(block) || !/r\.totalKva/.test(block)) {
      fail("the trunk does not read totalMeters and totalKva, which are the "
        + "counts at each output's root \u2014 every customer once");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A link box's input carries what it serves, each customer once.");
process.exit(bad ? 1 : 0);
