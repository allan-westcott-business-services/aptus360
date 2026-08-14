/* Half-days of excavation and lay on a mains call-off section.

   The hours come from digRate.js and are checked there. This checks
   what happens on top of them: that hours become the unit a planner
   books in, that a run crossing two trenches is two digs rather than an
   average of them, and that a section the drawing cannot answer for
   says so instead of reading as no work. */
import {
  sectionEstimate, callOffEstimate, halfDaysFor, halfDaysText, HALF_DAY_HOURS,
} from "./src/features/calloffs/digDays.js";
import { pathBetween, trenchGraph } from "./src/features/gis/mainsCallOff.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* A trench with a gas main and an electric cable routed along it, drawn
   between two points. Enough for contentsOf to find contents, which is
   what gives the trench a size. */
const line = (id, geom, attrs = {}) => ({
  Feature_ID: id, Feature_Type: "line", Geometry: geom,
  Layer_Key: attrs.Layer_Key ?? "trench",
  Attributes: { Line_Type: "trench_joint", ...attrs },
});

const LINE_TYPES = [
  { Type_Key: "trench_joint", Label: "Joint trench", Layer_Key: "trench" },
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas" },
  { Type_Key: "elec_main", Label: "Electric main", Layer_Key: "electric" },
];

/* Two trenches end to end, 100m each, with gas and electric routed the
   whole way along both. The second is a carriageway. */
function site({ secondSurface = "unmade" } = {}) {
  return [
    line(1, [[0, 0], [100, 0]], { Surface_Type: "unmade" }),
    line(2, [[100, 0], [200, 0]], { Surface_Type: secondSurface }),
    line(10, [[0, 0], [200, 0]], { Line_Type: "gas_main", Layer_Key: "gas", Size: "180mm" }),
    line(11, [[0, 0], [200, 0]], { Line_Type: "elec_main", Layer_Key: "electric" }),
  ];
}

const opts = (features) => ({ features, lineTypes: LINE_TYPES, surfaceTypes: [] });

function runOf(features, from, to) {
  const trenches = features.filter((f) => f.Attributes?.Line_Type === "trench_joint");
  const graph = trenchGraph(trenches, []);
  const near = (pt) => {
    let best = null;
    graph.points.forEach((q, i) => {
      const d = Math.hypot(q.at[0] - pt[0], q.at[1] - pt[1]);
      if (!best || d < best.d) best = { i, d };
    });
    return best.i;
  };
  return pathBetween(graph, near(from), near(to));
}

// 1. Hours become half-days, rounded up — a gang cannot be sent for a
//    third of one.
{
  if (halfDaysFor(HALF_DAY_HOURS) !== 1) fail("exactly half a day was not one half-day");
  if (halfDaysFor(HALF_DAY_HOURS + 0.1) !== 2) fail("a shade over half a day did not round up");
  if (halfDaysFor(HALF_DAY_HOURS * 2) !== 2) fail("a full day was not two half-days");
  /* Nothing to dig is no booking, not a minimum charge nobody agreed. */
  if (halfDaysFor(0) !== 0) fail("no work consumed a half-day");
}

// 2. Half-days read as days.
{
  if (halfDaysText(1) !== "\u00bd day") fail(`one half read as "${halfDaysText(1)}"`);
  if (halfDaysText(2) !== "1 day") fail(`two halves read as "${halfDaysText(2)}"`);
  if (halfDaysText(4) !== "2 days") fail(`four halves read as "${halfDaysText(4)}"`);
  if (!/2\u00bd days/.test(halfDaysText(5))) fail(`five halves read as "${halfDaysText(5)}"`);
  if (halfDaysText(0) !== "\u2014") fail("nothing did not read as a dash");
}

// 3. A section is estimated from the trench it crosses, and a longer
//    one takes longer.
{
  const f = site();
  const short = sectionEstimate(runOf(f, [0, 0], [100, 0]), opts(f));
  const long = sectionEstimate(runOf(f, [0, 0], [200, 0]), opts(f));
  if (!short.ok) fail(`a drawn section was not estimated: ${short.note}`);
  if (!(long.hours > short.hours)) fail("twice the run did not take longer");
  if (long.trenches !== 2) fail(`the long run crossed ${long.trenches} trenches, wanted 2`);
  if (short.trenches !== 1) fail(`the short run crossed ${short.trenches} trenches, wanted 1`);
}

// 4. A run crossing two surfaces is two digs, not an average.
//
//    This is the reason the estimate is per edge. A run leaving a verge
//    for a carriageway costs the carriageway rate on the carriageway
//    half, and flattening that would under-price every crossing on the
//    site.
{
  const soft = site({ secondSurface: "unmade" });
  const hard = site({ secondSurface: "carriageway_34" });
  const a = sectionEstimate(runOf(soft, [0, 0], [200, 0]), opts(soft));
  const b = sectionEstimate(runOf(hard, [0, 0], [200, 0]), opts(hard));
  if (!(b.hours > a.hours)) fail("crossing into a carriageway cost no more than unmade ground");

  /* And only the second half is dearer. If the whole run had been
     charged at the carriageway rate the difference would be far larger
     than the difference between the two halves. */
  const wholeHard = site({ secondSurface: "carriageway_34" })
    .map((x) => (x.Attributes?.Line_Type === "trench_joint"
      ? { ...x, Attributes: { ...x.Attributes, Surface_Type: "carriageway_34" } } : x));
  const c = sectionEstimate(runOf(wholeHard, [0, 0], [200, 0]), opts(wholeHard));
  if (!(c.hours > b.hours)) {
    fail("a run wholly in carriageway cost no more than one half in it");
  }
}

// 5. No route is no estimate, and says why.
{
  const f = site();
  const none = sectionEstimate(null, opts(f));
  if (none.ok) fail("a section with no route was given a duration");
  if (!none.note) fail("a section with no route did not say why");
  if (none.halfDays !== 0) fail("a section with no route consumed half-days");
}

// 6. A trench with nothing routed in it is reported, not counted as
//    instant. This is the case a call-off raised before the design.
{
  const bare = [line(1, [[0, 0], [100, 0]], { Surface_Type: "unmade" })];
  const r = sectionEstimate(runOf(bare, [0, 0], [100, 0]), opts(bare));
  if (r.ok) fail("a trench with nothing in it was given a duration");
  if (!r.note) fail("an unsized trench did not say why");
}

// 7. The call-off total is the sum of the rows as they read on screen.
//
//    Summed from the rounded rows, not recomputed from the hours. A
//    total below the sum of what is displayed looks like an error in
//    the rows rather than in the total.
{
  const f = site();
  const rows = [
    sectionEstimate(runOf(f, [0, 0], [100, 0]), opts(f)),
    sectionEstimate(runOf(f, [100, 0], [200, 0]), opts(f)),
    sectionEstimate(null, opts(f)),
  ];
  const t = callOffEstimate(rows);
  if (t.sections !== 2) fail(`${t.sections} sections counted, wanted 2`);
  if (t.unestimated !== 1) fail("the section with no route was not reported");
  if (t.halfDays !== rows[0].halfDays + rows[1].halfDays) {
    fail("the total is not the sum of the half-days on the rows");
  }
}

// 8. A run that leaves a trench and returns is one leg, so it is set up
//    once rather than twice.
{
  const f = site();
  const whole = sectionEstimate(runOf(f, [0, 0], [200, 0]), opts(f));
  const legIds = whole.legs.map((l) => l.trench?.Feature_ID);
  if (new Set(legIds).size !== legIds.length) {
    fail("a trench appeared as more than one leg, so it was set up twice");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Call-off dig estimates behave (${HALF_DAY_HOURS}hr half-days, `
    + "priced per trench crossed).");
process.exit(bad ? 1 : 0);
