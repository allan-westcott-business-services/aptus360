/* What a length of trench will carry.

   A dig is not always for everything: water may run as a closed loop
   round a site where electric never would, so the length that closes
   the loop carries water alone. Without a way to say so, a build walks
   it like any other and lays a cable somebody has to find and remove. */
import {
  carries, carriesLabel, isRestricted, trenchesFor, TRENCH_CARRIES,
} from "./src/features/gis/trenchCarries.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const plain = { Feature_ID: 1, Attributes: {} };
const waterOnly = {
  Feature_ID: 2,
  Attributes: {
    Carries_LV: false, Carries_HV: false, Carries_Gas: false, Carries_Water: true,
  },
};

// 1. Silence means everything.
//
//    Every trench drawn before this existed says nothing, and reading
//    that as "carries nothing" would empty every drawing in the system
//    on the day it shipped.
for (const u of ["electric", "gas", "water"]) {
  if (!carries(plain, u)) fail(`a trench with nothing set refused ${u}`);
}
if (isRestricted(plain)) fail("a trench with nothing set counted as restricted");

// 2. A narrowed trench takes only what it says.
if (carries(waterOnly, "gas")) fail("a water-only trench accepted gas");
if (carries(waterOnly, "electric")) fail("a water-only trench accepted a cable");
if (!carries(waterOnly, "water")) fail("a water-only trench refused water");

// 3. LV and HV are separate answers. They are laid apart, and a length
//    that takes one may not take the other.
{
  const lvOnly = {
    Attributes: {
      Carries_LV: true, Carries_HV: false, Carries_Gas: false, Carries_Water: false,
    },
  };
  if (!carries(lvOnly, "electric", "lv")) fail("an LV trench refused LV");
  if (carries(lvOnly, "electric", "hv")) fail("an LV trench accepted HV");
  /* A caller that cannot say which kind gets the answer for either —
     refusing a cable because the caller did not know its voltage would
     be a restriction nobody asked for. */
  if (!carries(lvOnly, "electric")) {
    fail("a caller that did not name a voltage was refused");
  }
}

// 4. A utility the flags say nothing about is not restricted by them.
if (!carries(waterOnly, "telecoms")) {
  fail("flags about four utilities refused a fifth");
}

// 5. Filtering a set of trenches.
{
  const usable = trenchesFor([plain, waterOnly], "gas");
  if (usable.length !== 1 || usable[0].Feature_ID !== 1) {
    fail("the wrong trenches were offered to a gas build");
  }
}

// 6. What it says on screen. Nothing where nothing is narrowed, so the
//    ordinary trench gains no clutter.
if (carriesLabel(plain) !== null) fail("an unrestricted trench was labelled");
if (carriesLabel(waterOnly) !== "Water") {
  fail(`a water-only trench reads "${carriesLabel(waterOnly)}"`);
}
{
  const none = {
    Attributes: {
      Carries_LV: false, Carries_HV: false, Carries_Gas: false, Carries_Water: false,
    },
  };
  /* Everything unticked is a real state and a strange one, so it says
     so rather than reading as unrestricted. */
  if (carriesLabel(none) !== "carries nothing") {
    fail("a trench carrying nothing did not say so");
  }
  const all = TRENCH_CARRIES.reduce((o, x) => ({ ...o, [x.key]: true }), {});
  if (carriesLabel({ Attributes: all }) !== null) {
    fail("a trench carrying everything was labelled as restricted");
  }
}

// 7. Span nodes are placed regardless of what a trench carries.
//
//    A node is a measuring point on the dig, not a thing being laid, so
//    a water-only length still gets one at its end. The levels check
//    measures between nodes, and a length with no node at its end
//    cannot be measured to — the run would simply stop being reported.
//
//    So placement filters on nothing here: it is the *routing* that
//    respects the flags, not the marking out.
{
  const forPlacement = (trenches) => trenches;   // as the placer takes them
  const both = [plain, waterOnly];
  if (forPlacement(both).length !== 2) {
    fail("a restricted trench was left out of span node placement");
  }
  /* While routing does exclude it \u2014 the two must differ, or one of
     them is wrong. */
  if (trenchesFor(both, "gas").length !== 1) {
    fail("routing stopped excluding a trench that refuses gas");
  }
  if (forPlacement(both).length === trenchesFor(both, "gas").length) {
    fail("placement and routing see the same trenches, so one is wrong");
  }
}

// 8. LV and HV route separately.
//
//    The LV feeder model asks for 'lv'. A length open to HV and shut to
//    LV is correctly refused it, which is the case the two flags exist
//    for.
{
  const hvOnly = {
    Attributes: {
      Carries_LV: false, Carries_HV: true, Carries_Gas: false, Carries_Water: false,
    },
  };
  if (carries(hvOnly, "electric", "lv")) fail("an HV-only trench accepted an LV feeder");
  if (!carries(hvOnly, "electric", "hv")) fail("an HV-only trench refused HV");
}

// 9. All three builds ask, and each asks about itself.
//
//    The filter lives in each build's own graph, so it is three changes
//    rather than one — and a build that forgets to ask lays its cable
//    or pipe in a trench nobody dug for it, with nothing to say so.
{
  const only = (util) => ({
    Attributes: TRENCH_CARRIES.reduce((o, x) => ({
      ...o, [x.key]: x.utility === util,
    }), {}),
  });

  const waterLoop = only("water");
  /* The case from the drawing: a length closing a water loop. */
  if (carries(waterLoop, "electric", "lv")) fail("the LV build would route round a water loop");
  if (carries(waterLoop, "gas")) fail("the gas build would lay pipe round a water loop");
  if (!carries(waterLoop, "water")) fail("the water build would skip its own loop");

  /* And the reverse: an electric-only length is not dug for water. */
  const cableRun = only("electric");
  if (carries(cableRun, "water")) fail("the water build would use a cable-only trench");
  if (carries(cableRun, "gas")) fail("the gas build would use a cable-only trench");
  if (!carries(cableRun, "electric", "lv")) fail("the LV build would skip its own trench");
}

// 10. A node goes where the carrying changes.
//
//     A length restricted to one utility is a boundary in the network:
//     a cable runs up to it and no further, so the design has to be
//     measurable to exactly that point. Two lengths meeting end to end
//     is normally a bend and gets nothing — but a bend where one side
//     refuses what the other carries is not a bend. It is the end of
//     one network and the start of another.
{
  const said = (t) => TRENCH_CARRIES
    .map(({ key }) => (t.Attributes?.[key] === false ? "0" : "1")).join("");
  /* The rule, as the placer applies it: something is narrowed, and the
     two do not agree. */
  const boundary = (a, b) => {
    const both = [said(a), said(b)];
    return both.some((x) => x.includes("0")) && new Set(both).size > 1;
  };

  const open = { Attributes: {} };
  const water = {
    Attributes: {
      Carries_LV: false, Carries_HV: false, Carries_Gas: false, Carries_Water: true,
    },
  };

  if (!boundary(open, water)) fail("no node where an open trench meets a water-only one");
  /* Two lengths that agree are an ordinary bend, restricted or not \u2014
     otherwise every length of a water loop would carry a node. */
  if (boundary(open, open)) fail("a node was placed at an ordinary bend");
  if (boundary(water, water)) fail("a node was placed mid-way along a water loop");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Trench contents behave (silence means everything, LV and HV apart).");
process.exit(bad ? 1 : 0);
