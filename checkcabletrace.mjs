/* A boxed circuit is traced along the cable, not along the dig.

   The drawing this was written from: a link box on circuit 1, output 2
   running to one group of plots and output 3 to another, both cables
   leaving the box down the SAME trench for about 60 m before parting
   company. Output 3 was set to 185 mm by hand; output 2 is on 95.

   Traced as one circuit, the levels sheet said:

     A1 → A2   60.8 m   3c WAVE 95
     A2 → A3   28.3 m   3c WAVE 185
     A2 → A6   46.0 m   3c WAVE 95

   Three things wrong in three rows. The 90 m output-3 cable was cut in
   two at A2 — a point where nothing electrical happens, only the dig
   forking. Its first 61 m was reported as 95 mm, the OTHER output's
   cable, because two runs pass that node and the node kept whichever
   was written last. And the load on the shared stretch was the two
   outputs added together, so every plot was on a leg carrying its
   neighbour's current.

   The cause is that the walk follows the TRENCH. Two cables in one
   trench are one path to it, so it has one leg to give them, one cable
   size to choose and one load to carry.

   `circuitTraceParts` runs the walk once per cable instead: the trunk
   from the origin to the box carrying everything beyond it, then each
   output rooted at the box and pruned to its own plots. The shared
   trench is then walked twice, once per output, each time carrying only
   its own load — which is what makes it honest rather than doubled.

   Deleting the stop at A2 on its own would NOT have fixed this, and is
   worth recording as the trap: with A2 gone the walk still passes the
   shared stretch on the way to both ends, so the plots teeing off it
   would be counted on BOTH legs. One error traded for a worse one. */
import { circuitTraceParts, spanTrace } from "./src/features/gis/feeder.js";
import { marksOnPart } from "./src/features/gis/feederPoints.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
  { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
];

let id = 1;
/* A service trench names the seed it runs to, as they do on a real
   drawing — the trace anchors a meter's load at the FOOT of its service
   (where it meets the mains) rather than at the dwelling, and finds
   that foot through Seed_Feature_ID. A fixture without it anchors every
   meter at the far end of its own spur, which the walk skips, and the
   whole thing reports no load anywhere. */
const trench = (pts, key = "trench", seedId = null) => ({
  Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
  Geometry: pts,
  Attributes: { Line_Type: key, ...(seedId != null ? { Seed_Feature_ID: seedId } : {}) },
});
const plot = (n, at) => ({
  Feature_ID: id++, Feature_Role: "plot", Feature_Type: "point",
  Plot_ID: n, Geometry: [at], Attributes: {},
});
const meter = (p, at, extra = {}) => ({
  Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
  Layer_Key: "electric", Plot_ID: p.Plot_ID, Geometry: [at],
  Attributes: { Seed_Feature_ID: p.Feature_ID, Circuit_ID: 1, ...extra },
});

const poc = { Feature_ID: id++, Feature_Role: "poc", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {} };
const f0 = { Feature_ID: id++, Feature_Role: "feederpoint", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[0, 0]],
  Attributes: { Circuit_ID: 1, Span_Seq: 0, Span_Label: "A0", Span_Anchor: [0, 0] } };

/* The box, 40 m out from the origin. */
const box = { Feature_ID: id++, Feature_Role: "linkbox", Feature_Type: "point",
  Layer_Key: "electric", Label: "Link Box 1", Geometry: [[40, 0]],
  Attributes: { Link_Ways: 4, Way_Fuse_A: {}, Circuit_ID: 1,
    Span_Seq: 1, Span_Label: "A1", Span_Anchor: [40, 0] } };

/* Output 2's plot is off to the west at the far end; output 3's is
   south. Both are reached down the SAME trench from the box to [100,0]
   before the dig forks. One plot tees off that shared stretch on each
   output, which is what makes the double count visible. */
const p2a = plot(201, [70, 8]);       // output 2, tees off the shared run
const p2b = plot(202, [150, 8]);      // output 2, past the fork
const p3a = plot(301, [70, -8]);      // output 3, tees off the shared run
const p3b = plot(302, [100, -68]);    // output 3, past the fork

const world = [
  poc, f0, box,
  p2a, p2b, p3a, p3b,
  meter(p2a, [70, 8], { Link_Box_ID: box.Feature_ID, Link_Way: 2 }),
  meter(p2b, [150, 8], { Link_Box_ID: box.Feature_ID, Link_Way: 2 }),
  meter(p3a, [70, -8], { Link_Box_ID: box.Feature_ID, Link_Way: 3 }),
  meter(p3b, [100, -68], { Link_Box_ID: box.Feature_ID, Link_Way: 3 }),
  trench([[0, 0], [40, 0]]),
  /* The shared stretch: 60 m of one dig carrying both outputs. */
  trench([[40, 0], [70, 0], [100, 0]]),
  /* Then they part company. */
  trench([[100, 0], [150, 0]]),
  trench([[100, 0], [100, -60]]),
  trench([[70, 0], [70, 8]], "service_trench", p2a.Feature_ID),
  trench([[150, 0], [150, 8]], "service_trench", p2b.Feature_ID),
  trench([[70, 0], [70, -8]], "service_trench", p3a.Feature_ID),
  trench([[100, -60], [100, -68]], "service_trench", p3b.Feature_ID),
];

const opts = { lineTypes, circuitId: 1, plotById: () => ({ kva_load: 3 }) };
const parts = circuitTraceParts(world, f0.Feature_ID, opts);
const of = (via) => parts.find((x) => x.via === via);

// 1. The shape: a trunk and one part per output.
{
  for (const via of ["trunk", "way 2", "way 3"]) {
    const p = of(via);
    if (!p) fail(`no ${via} part — the circuit is still traced as one network`);
    else if (p.error) fail(`${via} refused: ${p.error}`);
  }
}

// 2. The trunk stops at the box. Legs past it are the merged walk this
//    replaces, and reporting both would name every plot twice.
{
  const t = of("trunk");
  if (t && !t.error) {
    const ends = (t.legs || []).map((l) => l.to);
    if (!ends.includes("A1")) fail(`the trunk does not reach the box (${ends})`);
    if (ends.length !== 1) {
      fail(`the trunk reports ${ends.length} legs (${ends}) — it should stop `
        + "at the box, or every plot beyond is counted twice");
    }
  }
}

// 3. Each output carries only its own load. This is the double count:
//    two plots per output, so 2 terminal meters each and not 4.
{
  for (const via of ["way 2", "way 3"]) {
    const p = of(via);
    if (!p || p.error) continue;
    const term = (p.legs || []).reduce((m, l) => m + (l.terminal || 0), 0);
    const dist = (p.legs || []).reduce((m, l) => m + (l.distribution || 0), 0);
    if (term + dist !== 2) {
      fail(`${via} accounts for ${term + dist} meter(s), expected its own 2 `
        + "— the shared trench is carrying both outputs' plots");
    }
  }
}

// 4. And the whole circuit is still accounted for exactly once.
{
  const total = parts.filter((p) => !p.error && p.via !== "trunk")
    .reduce((m, p) => m + (p.legs || [])
      .reduce((n, l) => n + (l.terminal || 0) + (l.distribution || 0), 0), 0);
  if (total !== 4) {
    fail(`the outputs account for ${total} meters between them, expected 4`);
  }
}

// 5. An output is rooted at the box, so its first leg leaves the box
//    rather than the POC — which is what makes its length the length of
//    its own cable.
{
  const p = of("way 3");
  if (p && !p.error) {
    const first = (p.legs || [])[0];
    if (!first) fail("way 3 produced no legs");
    else if (first.from !== "A1" && first.from !== box.Label) {
      fail(`way 3's first leg starts from ${first.from}, not the box`);
    }
  }
}

// 6. A circuit with no box traces exactly as it always did — the same
//    legs, through the same function, so nothing without a link box
//    changes.
{
  const plain = world.filter((f) => f.Feature_Role !== "linkbox").map((f) => {
    if (f.Feature_Role !== "meter") return f;
    const a = { ...f.Attributes };
    delete a.Link_Box_ID; delete a.Link_Way;
    return { ...f, Attributes: a };
  });
  const one = circuitTraceParts(plain, f0.Feature_ID, opts);
  const direct = spanTrace(plain, f0.Feature_ID, opts);
  if (one.length !== 1 || one[0].via !== "origin") {
    fail("a circuit with no link box is no longer traced in one part");
  } else if (JSON.stringify((one[0].legs || []).map((l) => [l.from, l.to, l.metres]))
    !== JSON.stringify((direct.legs || []).map((l) => [l.from, l.to, l.metres]))) {
    fail("a circuit with no link box traces differently through the parts");
  }
}

// 7. And the build stops MAKING the phantom stop.
//
//    The trunk's model is the whole circuit's, so its junctions include
//    every fork of the dig — including the one where two outputs part
//    company, which no cable divides at. Marking off that model put a
//    numbered point in the middle of an output's run. A part marks only
//    what stands on the cable it lays.
{
  const trunkSections = [{ pts: [[0, 0], [40, 0]] }];
  const marks = [
    { point: [40, 0], index: 1, kind: "end" },        // the box: on the trunk
    { point: [100, 0], index: 2, kind: "junction" },  // the dig's fork, beyond it
    { point: [150, 0], index: 3, kind: "end" },       // an output's far end
  ];
  const kept = marksOnPart(marks, trunkSections);
  if (kept.length !== 1 || kept[0].index !== 1) {
    fail(`the trunk marks ${kept.length} node(s) — it should mark only the `
      + "box its cable ends at, not every fork of the dig beyond it");
  }

  /* A bend on an output's own cable is still not a stop: it is on the
     section, but nothing about it is a junction or an end, so it was
     never a mark to begin with. What this must not do is drop a mark
     that IS on the part. */
  const waySections = [{ pts: [[40, 0], [100, 0], [150, 0]] }];
  if (marksOnPart(marks, waySections).length !== 3) {
    fail("a mark standing on the output's own cable was dropped");
  }

  /* Tolerance, not exactness: a node is a graph vertex and a section is
     drawn from the same points, but both go through rounding. */
  if (!marksOnPart([{ point: [100, 0.2], index: 9 }], waySections).length) {
    fail("a mark 200 mm off its own cable was dropped");
  }
  if (marksOnPart([{ point: [100, 8] }], waySections).length) {
    fail("a mark eight metres off the cable was kept");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A boxed circuit traces along the cable (trunk to the box, then each "
  + "output on its own, each carrying only its own load).");
process.exit(bad ? 1 : 0);
