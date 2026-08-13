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

console.log(bad ? `\n${bad} problem(s)`
  : "Trench contents behave (silence means everything, LV and HV apart).");
process.exit(bad ? 1 : 0);
