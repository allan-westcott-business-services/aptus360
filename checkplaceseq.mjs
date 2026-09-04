/* Where a newly placed point goes in the sequence.

   A0 is the origin. A1 is the first stop reached from it, A2 the next,
   and so on outward — the number IS the position on the run, which is
   why the editor refuses to let anyone type it.

   Placement did not do that. It took the highest number on the circuit
   and added one, so a link box put on the cable just past the POC —
   the first stop there is — came out A10 on a circuit that already had
   nine points. The drawing then read A0, A10, A2, A3: a jump over A1,
   with the first thing reached after the POC carrying the last number
   in the schedule. Nobody reading that drawing can tell what order the
   cable runs in, which is the one thing the numbering is for.

   "Max plus one" is a count of how many points exist. It was being
   written into a field that means position. The two agree only when
   every point is placed in order from the origin outward and none is
   ever added in the middle, which is not how anybody draws.

   So placement inserts: it works out how far along the circuit's cable
   the new point stands, finds where that falls among the points already
   numbered, takes that number, and moves the ones beyond it up. The
   existing ORDER is left alone — it came from the build's own walk, and
   re-deriving it here would be a second writer of one fact. All this
   decides is which slot the new point drops into. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

let fp = {};
try { fp = await import("./src/features/gis/feederPoints.js"); }
catch { /* named below */ }

const { planInsertion } = fp;

if (typeof planInsertion !== "function") {
  fail("feederPoints.js does not export planInsertion — placement still "
    + "writes the count where the position goes");
} else {
  const circuit = { id: 1, name: "Circuit 1", letter: "A" };

  /* A straight main east from the POC at the origin, with stops at 50,
     100 and 150 numbered by the last build. */
  const main = (a, b) => ({
    Feature_ID: 900 + a[0], Feature_Type: "line", Layer_Key: "electric",
    Geometry: [a, b],
    Attributes: { Line_Type: "elec_main", Circuit_ID: 1 },
  });
  const fep = (id, x, seq) => ({
    Feature_ID: id, Feature_Role: "feederpoint", Feature_Type: "point",
    Layer_Key: "electric", Label: `Point A${seq}`, Geometry: [[x, 0]],
    Attributes: { Circuit_ID: 1, Circuit_Letter: "A", Span_Seq: seq,
      Span_Label: `A${seq}`, Span_Anchor: [x, 0] },
  });
  const origin = {
    Feature_ID: 10, Feature_Role: "feederpoint", Feature_Type: "point",
    Layer_Key: "electric", Label: "Point A0", Geometry: [[0, 0]],
    Attributes: { Circuit_ID: 1, Circuit_Letter: "A", Span_Seq: 0,
      Span_Label: "A0", Span_Anchor: [0, 0] },
  };
  const world = [
    origin, fep(11, 50, 1), fep(12, 100, 2), fep(13, 150, 3),
    main([0, 0], [50, 0]), main([50, 0], [100, 0]), main([100, 0], [150, 0]),
    /* The main laid on past the last stop, which is where a designer
       runs it \u2014 and the only place a new point can go beyond A3. */
    main([150, 0], [200, 0]),
  ];
  const seqOf = (r, id) => {
    const w = (r.writes || []).find((x) => Number(x.Feature_ID) === Number(id));
    return w ? Number(w.Attributes.Span_Seq) : null;
  };

  // 1. The fault itself: a box on the cable just past the POC is the
  //    first stop, so it is A1 — not A4 because three points exist.
  {
    const r = planInsertion({ features: world, circuit, at: [25, 0] });
    if (r.seq !== 1 || r.label !== "A1") {
      fail(`a point placed before every other stop came out ${r.label} `
        + `(seq ${r.seq}), wanted A1`);
    }
    /* And the ones beyond it move up rather than being left with a
       duplicate number between them. */
    if (seqOf(r, 11) !== 2 || seqOf(r, 12) !== 3 || seqOf(r, 13) !== 4) {
      fail("the points beyond the new one were not moved up");
    }
    if (seqOf(r, 10) !== null) fail("the origin was renumbered");
  }

  // 2. Their names go with their numbers, or the drawing reads the old
  //    order with the new one written beside it.
  {
    const r = planInsertion({ features: world, circuit, at: [25, 0] });
    const w = (r.writes || []).find((x) => x.Feature_ID === 11);
    if (!w || w.Attributes.Span_Label !== "A2" || w.Label !== "Point A2") {
      fail("a point moved up the sequence keeps its old name");
    }
  }

  // 3. Placed at the far end it is simply the next one, and nothing
  //    else is touched — the common case must stay cheap.
  {
    const r = planInsertion({ features: world, circuit, at: [175, 0] });
    if (r.seq !== 4) fail(`a point past the last stop came out ${r.seq}, wanted 4`);
    if ((r.writes || []).length) {
      fail(`${r.writes.length} point(s) rewritten to add one at the end`);
    }
  }

  // 4. In the middle, between A1 and A2.
  {
    const r = planInsertion({ features: world, circuit, at: [75, 0] });
    if (r.seq !== 2) fail(`a point between A1 and A2 came out ${r.seq}, wanted 2`);
    if (seqOf(r, 11) !== null) fail("the point before it was disturbed");
    if (seqOf(r, 12) !== 3 || seqOf(r, 13) !== 4) {
      fail("the points beyond it did not move up");
    }
  }

  // 5. Distance ALONG THE CABLE, not across the site. A stop up a long
  //    branch is further out than one close by in a straight line, and
  //    a schedule ordered by how the crow flies describes no route
  //    anybody drives.
  {
    const branch = [
      origin,
      fep(21, 50, 1),
      { ...fep(22, 0, 2), Geometry: [[10, 90]],
        Attributes: { Circuit_ID: 1, Circuit_Letter: "A", Span_Seq: 2,
          Span_Label: "A2", Span_Anchor: [10, 90] } },
      main([0, 0], [50, 0]),
      /* The long way round to a point that is near the origin on paper. */
      main([50, 0], [50, 90]), main([50, 90], [10, 90]),
    ];
    const r = planInsertion({ features: branch, circuit, at: [30, 0] });
    if (r.seq !== 1) {
      fail(`a point 30 m along the cable came out ${r.seq} \u2014 measured `
        + "across the site rather than along the run");
    }
  }

  // 6. A branched circuit, which is where comparing distances alone
  //    falls over. The build walks one branch to its end before
  //    starting the next, so the numbers are NOT in distance order
  //    across the drawing: A2 can be 150 m down one branch while A3 is
  //    60 m up another. A point 70 m up the second branch goes after
  //    A3, because A3 is what the cable passes to reach it — not after
  //    A1, which is what its raw distance would suggest.
  {
    const branched = [
      origin,
      fep(31, 50, 1),
      fep(32, 150, 2),
      { ...fep(33, 0, 3), Geometry: [[0, 60]],
        Attributes: { Circuit_ID: 1, Circuit_Letter: "A", Span_Seq: 3,
          Span_Label: "A3", Span_Anchor: [0, 60] } },
      main([0, 0], [50, 0]), main([50, 0], [150, 0]),
      main([0, 0], [0, 60]), main([0, 60], [0, 120]),
    ];
    const r = planInsertion({ features: branched, circuit, at: [0, 70] });
    if (r.seq !== 4) {
      fail(`a point up the second branch came out ${r.label} \u2014 numbered `
        + "against a point on the other branch rather than against what "
        + "the cable passes to reach it");
    }
    if ((r.writes || []).length) {
      fail("it renumbered points that are not beyond it");
    }
    /* And back down the first branch, past A1: it goes at A2 and the
       rest move up, including the other branch's. */
    const r2 = planInsertion({ features: branched, circuit, at: [100, 0] });
    if (r2.seq !== 2) fail(`mid first branch came out ${r2.label}, wanted A2`);
  }

  // 7. No cable to measure along: a box placed in open ground before
  //    the feeders are drawn. It gets no number rather than a guessed
  //    one — the build gives it one when a run reaches it.
  {
    const r = planInsertion({ features: [origin], circuit, at: [25, 0] });
    if (r.seq != null || r.label != null) {
      fail(`a point with no cable under it was given ${r.label}`);
    }
    if ((r.writes || []).length) fail("it renumbered the circuit anyway");
  }

  // 8. A circuit with nothing on it yet: the first stop is A1.
  {
    const bare = [origin, main([0, 0], [50, 0])];
    const r = planInsertion({ features: bare, circuit, at: [25, 0] });
    if (r.seq !== 1) fail(`the first stop on a bare circuit came out ${r.seq}`);
  }
}

/* And placement uses it, rather than counting. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/planInsertion\(/.test(canvas)) {
    fail("placement does not insert the point into the sequence");
  }
  /* The counting form, in either of the two places it was written.

     One survives, deliberately, as a fallback: a drawing from before
     feeder points existed has no Seq-0 point to measure from, and
     putting the new one last is the answer this always gave. It is
     only allowed BEHIND the insertion \u2014 `ins.seq ?? (1 + features`.
     A bare counter is the fault. */
  const counters = canvas.match(
    /1 \+ features\s*\n?\s*\.filter\(\(f\) => \(?f\.Feature_Role === "(feederpoint|linkbox)"/g,
  ) || [];
  const guarded = canvas.match(/ins\.seq \?\? \(1 \+ features/g) || [];
  if (counters.length > guarded.length) {
    fail(`${counters.length - guarded.length} placement(s) still number a `
      + "point by counting how many exist");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Placement sequencing behaves (a point takes the number of the place "
  + "it stands, and the ones beyond it move up).");
process.exit(bad ? 1 : 0);
