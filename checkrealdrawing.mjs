/* A real drawing, and the answers it is known to give.

   Every other check in this suite is built from a fixture written to
   show one rule. That is the right way to test a rule, and it has a
   gap: a fixture only contains what its author thought of. The faults
   found on screen this session — a leg reporting another output's
   cable, an origin duplicated because its marker had been dragged, a
   phantom stop at a bend, two outputs counted as two circuits — were
   all invisible to fixtures because none of them held a link box with
   three outputs down one trench, or a node somebody had nudged.

   So: a real site, saved as it was, and the answers recorded. Not to
   prove them right — several were wrong when this was written, and the
   values here are today's, not a specification — but to make CHANGE
   visible. If a figure below moves, something has changed for every
   drawing shaped like this one, and whoever moved it gets to say
   whether they meant to.

   **A failure here is not necessarily a fault.** It is a question:
   did you mean to change this? Where the new answer is better, update
   the numbers and say so in the commit. Where it is not, you have
   caught a regression before it reached a designer's screen — which is
   the entire point, and is what nothing in this suite could do before.

   The drawing is `fixtures/drawing-2202-043.json`, a Download Drawing
   export of project 20 with the styles stripped. */
import { readFileSync } from "node:fs";
import { circuitTraceParts } from "./src/features/gis/feeder.js";
import { originNodeFor, circuitsFrom } from "./src/features/gis/electric.js";
import { sizesAt } from "./src/features/gis/cableSizes.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const raw = JSON.parse(readFileSync("./fixtures/drawing-2202-043.json", "utf8"));
const features = raw.features;
const lineTypes = raw.lineTypes || [];

/* Cable ids as this catalogue numbers them: 1 = 3c WAVE 95,
   2 = 3c WAVE 185, 4 = 3c WAVE 300. */
const SIZE = { 1: "95", 2: "185", 4: "300" };
const nameOf = (id) => SIZE[id] ?? String(id);

/* ── The shape of the site ── */
{
  const circuits = circuitsFrom(features);
  if (circuits.length !== 2) {
    fail(`${circuits.length} circuits, expected 2 — a circuit is its meters, `
      + "so this moving means meters gained or lost a Circuit_ID");
  }
  const boxes = features.filter((f) => f.Feature_Role === "linkbox");
  if (boxes.length !== 1) fail(`${boxes.length} link boxes, expected 1`);
}

/* ── Circuit 1: trunk to the box, then three outputs ── */
{
  const origin = originNodeFor(features, 1);
  if (!origin) { fail("circuit 1 has no origin"); }
  else {
    const parts = circuitTraceParts(features, origin.Feature_ID, {
      lineTypes, circuitId: 1, plotById: () => ({ kva_load: 2.5 }),
    });
    const vias = parts.map((p) => p.via);
    const want = ["trunk", "way 1", "way 2", "way 3"];
    if (JSON.stringify(vias) !== JSON.stringify(want)) {
      fail(`parts came out ${vias.join(", ")} — expected ${want.join(", ")}`);
    }
    for (const p of parts) if (p.error) fail(`${p.via}: ${p.error}`);

    const legs = parts.flatMap((p) => (p.legs || [])
      .map((l) => `${p.via}|${l.from}->${l.to}|${l.metres}|${nameOf(l.cableSizeId)}`));

    /* Today's answers. The trunk one is the fault that prompted this
       check: it read 185, an output's cable, because the leg took its
       size from a copy mirrored onto the link box node where four runs
       meet. */
    const expected = [
      "trunk|A0->A1|639.2|300",
      "way 1|A1->A7|69.9|95",
      "way 1|A7->A9|74.8|95",
      "way 1|A7->A8|20.9|95",
      "way 2|A1->A2|61.3|95",
      "way 2|A2->A6|46|95",
      "way 3|A1->A2|61.3|185",
      "way 3|A2->A3|28.7|185",
      "way 3|A3->A4|58.1|95",
      "way 3|A3->A5|73.9|95",
    ];
    for (const e of expected) {
      if (!legs.includes(e)) {
        const [via, leg] = e.split("|");
        const got = legs.find((l) => l.startsWith(`${via}|${leg}|`));
        fail(`${via} ${leg}: expected ${e.split("|").slice(2).join(" m, ")}, `
          + `got ${got ? got.split("|").slice(2).join(" m, ") : "no such leg"}`);
      }
    }
    if (legs.length !== expected.length) {
      fail(`${legs.length} legs, expected ${expected.length}`);
    }

    /* Each output carries only its own plots — the double count that
       collapsing two cables into one trench leg produced. */
    for (const p of parts) {
      if (p.via === "trunk") continue;
      const own = (p.legs || []).reduce((n, l) =>
        n + (l.distribution || 0) + (l.terminal || 0), 0);
      if (own <= 0) fail(`${p.via} carries no load at all`);
    }
  }
}

/* ── The cable a breech joint is cut into, which the jointing sheet
      reads ──

   Downstream of the box three runs of one circuit share a trench, and
   which one a joint sits on was decided by array order. Checked at a
   real breech rather than through a plot: the services on this drawing
   carry no Plot_ID, so `sizesForPlot` finds nothing for any of them —
   see the note in the handover, which is a separate question from this
   check. */
{
  const breech = features.find((f) => f.Feature_Role === "joint"
    && String(f.Attributes?.Joint_Type ?? "") === "breech");
  if (!breech) fail("no breech joint on the drawing to check");
  else {
    const at = breech.Geometry?.[0];
    const r = sizesAt(features, at, 0.35, {
      way: breech.Attributes?.Link_Way ?? null,
      box: breech.Attributes?.Link_Box_ID ?? null,
    });

    /* ── Recorded as it is, which is WRONG, and deliberately recorded
          anyway ──

       `sizeOf` looks for `Size`, `Cable_Size` or `Size_Label`. The
       build writes neither: a run carries `VD_Cable_Size_ID`, an id
       into the cable catalogue. So on a real drawing every joint's
       cable in and cable out come back null, and the jointing sheet
       goes to the gang blank. Fifteen mains on this site and not one of
       them carries a field `sizeOf` reads.

       It is not fixed here because fixing it needs a decision this file
       cannot make: `cableSizes` is called with no catalogue, and the
       call-off it feeds is built for a tablet that has the drawing as a
       picture and no lookups at all. Somebody has to say where the name
       comes from.

       So the null is recorded as today's answer. **When this starts
       reporting a cable, this check will fail** — and that failure is
       the fix arriving, not a regression. Update the line and say so.
       A check that records only what is right cannot tell you when
       something wrong gets better. */
    if (r?.in != null) {
      fail(`the breech now reports "${r.in}" as its cable in, where it read `
        + "nothing before. If that is the sizeOf/VD_Cable_Size_ID fault "
        + "being fixed, update this line — it is the good kind of failure");
    }
  }
}

/* ── The same site after the box was moved ──

   The redesign put the link box at the far end of the network rather
   than in the middle of it, because the original position was not
   feasible on the ground. That one change broke an assumption nothing
   had ever stated: the trunk's terminus was only ever numbered because
   a box that sits on a trench junction happens to be a junction the
   model already knows about. Mid-span it is neither a fork of the dig
   nor an end of one, so no stop was offered, the box was never adopted,
   and it kept the number placement gave it — C10 on a circuit with nine
   points, the sequence starting at ten.

   Kept as a second fixture precisely because it is the awkward one. */
{
  const moved = JSON.parse(
    readFileSync("./fixtures/drawing-2202-043-box-moved.json", "utf8"));
  const box = moved.features.find((f) => f.Feature_Role === "linkbox");
  if (!box) fail("the moved-box fixture has no link box");
  else {
    const at = box.Attributes?.Span_Anchor ?? box.Geometry?.[0];
    /* Where it stands. If this moves, the fixture was re-exported and
       the answers below are about a different drawing. */
    if (Math.abs(at[0] - 59.1) > 0.5 || Math.abs(at[1] - 233.3) > 0.5) {
      fail(`the box has moved to [${at.map((n) => n.toFixed(1))}] — the `
        + "figures recorded here are for a box at [59.1, 233.3]");
    }

    const origin = originNodeFor(moved.features, 3);
    const parts = circuitTraceParts(moved.features, origin.Feature_ID, {
      lineTypes: moved.lineTypes || [], circuitId: 3,
      plotById: () => ({ kva_load: 2.5 }),
    });

    /* The trunk carries the 300 somebody set by hand on it. It reported
       185 — an output's cable — because the leg took its size from a
       copy mirrored onto the box, where three runs meet. */
    const trunk = parts.find((p) => p.via === "trunk");
    const first = trunk?.legs?.[0];
    if (!first) fail("no trunk leg on the moved-box drawing");
    else if (Number(first.cableSizeId) !== 4) {
      fail(`the trunk reports cable id ${first.cableSizeId}, expected 4 — the `
        + "300 set by hand on the run itself");
    }

    /* Both outputs leave the box and run the same stretch back before
       they part company. Two cables in one trench: two legs, not a
       duplicate. */
    const backLegs = parts.filter((p) => p.via !== "trunk")
      .flatMap((p) => (p.legs || []).filter((l) => l.metres > 200));
    if (backLegs.length !== 2) {
      fail(`${backLegs.length} long legs out of the box, expected one per `
        + "output — each output runs its own cable back to the load");
    }
  }
}

console.log(bad ? `\n${bad} problem(s) — see the note at the top: a failure `
  + "here is a question, not necessarily a fault"
  : "The real drawing still gives the answers recorded for it.");
process.exit(bad ? 1 : 0);
