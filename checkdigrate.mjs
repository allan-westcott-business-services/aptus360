/* How long a trench takes to dig and to lay.

   The figures are a planning model, not a measurement and not NJUG —
   NJUG sets depths and says nothing about durations. So this checks the
   arithmetic and the honesty around them rather than the rates
   themselves: that a bigger hole takes longer, that the multipliers
   compose in the right direction, that a missing answer is reported as
   missing rather than guessed silently, and that a figure never claims
   to be measured when it was estimated. */
import {
  digEstimate, digEstimateTotal, depthFactorFor, surfaceFactorFor,
  rateFor, defaultRate, layRateFor, hoursText,
  DEFAULT_DIG_RATES, DEFAULT_DEPTH_FACTORS, DEFAULT_SURFACE_FACTORS,
  DEFAULT_LAY_RATES, JOINT_LAY_FACTOR, HOURS_PER_DAY,
} from "./src/features/gis/digRate.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const size = (w, d) => ({ widthM: w, depthM: d });
const base = { lengthM: 10, size: size(0.45, 0.45), surfaceKey: "unmade" };

// 1. The volume is the drawing, not an opinion.
{
  const r = digEstimate({ ...base, size: size(0.45, 0.90) });
  const want = 10 * 0.45 * 0.90;
  if (Math.abs(r.volumeM3 - want) > 0.011) {
    fail(`10m x 0.45 x 0.90 came to ${r.volumeM3}m3, wanted ${want.toFixed(2)}`);
  }
}

// 2. More hole is more time, in each dimension independently.
{
  const small = digEstimate(base);
  for (const [what, bigger] of [
    ["length", digEstimate({ ...base, lengthM: 20 })],
    ["width", digEstimate({ ...base, size: size(0.60, 0.45) })],
    ["depth", digEstimate({ ...base, size: size(0.45, 0.75) })],
  ]) {
    if (!(bigger.digHours > small.digHours)) fail(`doubling the ${what} did not take longer`);
  }
}

// 3. Setup is once per trench, not per cubic metre.
//
//    Ten metres and a hundred metres are one move of the machine each.
//    If setup scaled, splitting a run in the drawing would change how
//    long the same dig takes.
{
  const ten = digEstimate(base);
  const hundred = digEstimate({ ...base, lengthM: 100 });
  if (Math.abs(ten.setupHours - hundred.setupHours) > 0.001) {
    fail("setup time scaled with the length of the trench");
  }
}

// 4. A bigger machine is quicker, and the default is one of the listed.
{
  const mini = digEstimate({ ...base, machineKey: "mini_3t" });
  const thirteen = digEstimate({ ...base, machineKey: "excavator_13t" });
  if (!(thirteen.digHours < mini.digHours)) fail("a 13t machine was not quicker than a 3t");

  const d = defaultRate();
  if (!DEFAULT_DIG_RATES.some((r) => r.key === d.key)) {
    fail("the default rate is not one of the rates");
  }
  /* Exactly one default, matching the unique index in 0158. Two would
     make the assumed machine depend on row order. */
  const defaults = DEFAULT_DIG_RATES.filter((r) => r.isDefault);
  if (defaults.length !== 1) fail(`${defaults.length} rates are flagged default, wanted 1`);
}

// 5. An unknown machine falls back to the default rather than to nothing.
{
  if (rateFor("hovercraft").key !== defaultRate().key) {
    fail("an unrecognised machine did not fall back to the default");
  }
}

// 6. The depth bands meet with no gap and no overlap, and the last has
//    no ceiling. A depth landing in no band, or in two, is a duration
//    that depends on the order the table was written in.
{
  for (let i = 1; i < DEFAULT_DEPTH_FACTORS.length; i++) {
    if (DEFAULT_DEPTH_FACTORS[i].fromM !== DEFAULT_DEPTH_FACTORS[i - 1].toM) {
      fail(`depth bands ${i - 1} and ${i} do not meet`);
    }
  }
  if (DEFAULT_DEPTH_FACTORS.at(-1).toM !== null) {
    fail("the deepest band has a ceiling, so a deeper trench matches nothing");
  }
  /* Half open: a trench at exactly a boundary takes the shallower band. */
  if (depthFactorFor(0.60).factor !== 1.15) fail("0.60m did not take the band starting at 0.60");
  if (depthFactorFor(0.599).factor !== 1.00) fail("0.599m did not take the band below 0.60");
  if (!(depthFactorFor(4).factor > 1)) fail("an unusually deep trench got no depth penalty");
}

// 7. Depth costs more than the extra volume alone.
//
//    The multiplier is applied after the volume, so a trench twice as
//    deep is more than twice the dig — that is the whole point of the
//    band table, and it is the thing most easily lost by moving the
//    factor into the rate.
{
  const shallow = digEstimate({ ...base, size: size(0.45, 0.50) });
  const deep = digEstimate({ ...base, size: size(0.45, 1.00) });
  if (!(deep.digHours > shallow.digHours * 2)) {
    fail("doubling the depth cost only its own volume, so the band table is doing nothing");
  }
}

// 8. Unmade ground is the baseline the rates were written for.
//
//    Every other surface is a multiplier off it, so if this drifts from
//    1.0 the published figures quietly stop meaning what they say.
{
  if (DEFAULT_SURFACE_FACTORS.unmade !== 1.0) {
    fail(`unmade ground is ${DEFAULT_SURFACE_FACTORS.unmade}, not the 1.0 baseline`);
  }
  if (!(DEFAULT_SURFACE_FACTORS.carriageway_34 > DEFAULT_SURFACE_FACTORS.footway)) {
    fail("a carriageway was not harder to dig than a footway");
  }
  if (!(DEFAULT_SURFACE_FACTORS.carriageway_34 > DEFAULT_SURFACE_FACTORS.carriageway_12)) {
    fail("a 3/4 carriageway was not harder to dig than a 1/2");
  }
  if (!(DEFAULT_SURFACE_FACTORS.verge < DEFAULT_SURFACE_FACTORS.unmade)) {
    fail("a verge was not easier to dig than unmade ground");
  }

  /* The keys are the ones GIS_Surface_Type actually holds, confirmed
     against the database rather than inferred from the labels. A key
     that does not exist there is not a typo that shows up as an error —
     it silently falls back to 1.0 and estimates a carriageway as unmade
     ground, which is the largest quiet error the model can make. */
  const SURFACE_KEYS = ["footway", "carriageway_12", "carriageway_34",
    "unmade", "verge", "agricultural"];
  for (const k of SURFACE_KEYS) {
    if (!(DEFAULT_SURFACE_FACTORS[k] > 0)) fail(`no fallback factor for surface "${k}"`);
  }
  for (const k of Object.keys(DEFAULT_SURFACE_FACTORS)) {
    if (!SURFACE_KEYS.includes(k)) fail(`"${k}" is not a surface GIS_Surface_Type holds`);
  }
}

// 9. A surface row's own factor wins over the constant, which is what
//    makes the column in 0158 worth having.
{
  const rows = [{ Surface_Key: "footway", Label: "Footway", Dig_Factor: 3.0 }];
  if (surfaceFactorFor("footway", rows).factor !== 3.0) {
    fail("GIS_Surface_Type.Dig_Factor was ignored in favour of the fallback");
  }
  /* A row with no column yet — an unmigrated database — falls back
     rather than to zero, which would make every trench instant. */
  const old = [{ Surface_Key: "footway", Label: "Footway" }];
  if (surfaceFactorFor("footway", old).factor !== DEFAULT_SURFACE_FACTORS.footway) {
    fail("a surface row without the column did not fall back to the constant");
  }
}

// 10. No surface set is estimated as unmade, and says so.
//
//     The spread across the six is better than two to one, so an
//     assumption made silently here is the largest single error the
//     model can make without anybody noticing.
{
  const r = digEstimate({ ...base, surfaceKey: null });
  if (!r.surfaceAssumed) fail("a trench with no surface did not report that one was assumed");
  if (r.surfaceFactor !== 1.0) fail("an unanswered surface was not estimated as unmade ground");

  const answered = digEstimate({ ...base, surfaceKey: "unmade" });
  if (answered.surfaceAssumed) fail("a trench with a surface set claimed one was assumed");
}

// 11. Laying is per thing in the trench, not per trench.
{
  const one = digEstimate({ ...base, utilities: ["gas"] });
  const three = digEstimate({ ...base, utilities: ["gas", "electric", "water"] });
  if (!(three.layHours > one.layHours)) fail("three utilities took no longer to lay than one");
  if (one.jointFactor !== 1) fail("a single utility was given the joint trench allowance");
  if (three.jointFactor !== JOINT_LAY_FACTOR) fail("a joint trench was not given the allowance");

  /* Two of the same utility are two lays. Two gas mains in one trench
     are laid one after the other however alike they are. */
  const twoGas = digEstimate({ ...base, utilities: ["gas", "gas"] });
  if (!(twoGas.layHours > one.layHours)) fail("a second gas main was laid for free");
}

// 12. An unnamed utility lays at the fallback rate rather than at nothing.
{
  if (layRateFor("district_heating") !== DEFAULT_LAY_RATES.other) {
    fail("an unrecognised utility did not take the fallback lay rate");
  }
  const r = digEstimate({ ...base, utilities: ["district_heating"] });
  if (!(r.layHours > 0)) fail("an unrecognised utility took no time to lay");
}

// 13. The parts add up to the total, or the working shown on screen is
//     not the working.
{
  const r = digEstimate({ ...base, size: size(0.60, 1.35), utilities: ["gas", "electric"] });
  const sum = r.digHours + r.setupHours + r.layHours;
  if (Math.abs(sum - r.totalHours) > 0.021) {
    fail(`the working comes to ${sum.toFixed(2)}hr but the total is ${r.totalHours}hr`);
  }
}

// 14. Nothing laid is no estimate, not a zero.
//
//     A trench with nothing routed in it has no width and no depth yet.
//     "0 hours" reads as a finished job rather than an unanswered
//     question, which is the same reason trenchSize returns no
//     dimensions for it.
{
  const empty = digEstimate({ lengthM: 10, size: { widthM: 0, depthM: 0 } });
  if (empty.ok) fail("a trench with nothing in it was given a duration");
  if (!empty.note) fail("a trench with no estimate did not say why");

  const noLength = digEstimate({ lengthM: 0, size: size(0.45, 0.45) });
  if (noLength.ok) fail("a trench with no length was given a duration");
  if (noLength.note === empty.note) {
    fail("no length and no contents gave the same reason, so the panel cannot say which");
  }
}

// 15. An estimate never claims to be measured.
//
//     Source and Sample_Size exist so a rate can be replaced by what
//     actually happened. Until it is, the figure has to say so on every
//     screen that shows it.
{
  const shipped = digEstimate(base);
  if (!/estimate/i.test(shipped.basis)) {
    fail(`a seeded rate reported "${shipped.basis}" rather than an estimate`);
  }
  const measured = digEstimate({
    ...base,
    rates: [{ key: "mini_3t", label: "3t mini", baseRateM3Hr: 5.2,
      setupMinutes: 15, isDefault: true, source: "measured", sampleSize: 31 }],
  });
  if (!/31/.test(measured.basis)) {
    fail(`a calibrated rate did not report its sample: "${measured.basis}"`);
  }
}

// 16. Empty tables fall back to the figures in the module.
//
//     This is what makes the screens work on mock data and against a
//     database that has not had 0158 applied. An empty array must mean
//     "use the defaults", never "no rate".
{
  const none = digEstimate({ ...base, rates: [], depthBands: [], layRates: {}, utilities: ["gas"] });
  const full = digEstimate({ ...base, utilities: ["gas"] });
  if (!none.ok) fail("empty rate tables produced no estimate at all");
  if (Math.abs(none.totalHours - full.totalHours) > 0.001) {
    fail("empty rate tables did not fall back to the module's own figures");
  }
}

// 17. A total is the sum of its parts, and says what it left out.
{
  const rows = [
    digEstimate({ ...base, utilities: ["gas"] }),
    digEstimate({ ...base, lengthM: 25, utilities: ["electric"] }),
    digEstimate({ lengthM: 10, size: { widthM: 0, depthM: 0 } }),   // nothing in it
  ];
  const t = digEstimateTotal(rows);
  if (t.trenches !== 2) fail(`${t.trenches} trenches counted, wanted 2`);
  if (t.skipped !== 1) fail("the trench with no estimate was not reported as skipped");
  if (Math.abs(t.totalHours - (rows[0].totalHours + rows[1].totalHours)) > 0.021) {
    fail("the total is not the sum of the trenches in it");
  }
  /* Setup counted once per trench, because each is a separate move of
     the machine. */
  if (Math.abs(t.setupHours - (rows[0].setupHours + rows[1].setupHours)) > 0.001) {
    fail("setup was not counted once per trench in the total");
  }
}

// 18. Hours read as something a person can plan against.
{
  if (!/min/.test(hoursText(0.5))) fail("half an hour was not shown in minutes");
  if (!/hr/.test(hoursText(3))) fail("three hours was not shown in hours");
  if (!/day/.test(hoursText(HOURS_PER_DAY * 2))) fail("two days was not shown in days");
  if (hoursText(0) !== "\u2014") fail("no time did not show as a dash");
  /* One day is singular. A grammatical wart on a screen reads as a bug
     in the number beside it. */
  if (!/1 day$/.test(hoursText(HOURS_PER_DAY))) {
    fail(`one day showed as "${hoursText(HOURS_PER_DAY)}"`);
  }
}

// 19. The worked example the reference table was built from.
//
//     10m of joint trench, 0.45m wide and 0.90m deep, unmade ground,
//     3t mini: about an hour of digging. Pinned so that a change to any
//     of the seeded numbers has to be a deliberate one — this is the
//     figure the migration's own check query reproduces in SQL.
{
  const r = digEstimate({
    lengthM: 10, size: size(0.45, 0.90), surfaceKey: "unmade", machineKey: "mini_3t",
  });
  if (Math.abs(r.digHours - 1.04) > 0.02) {
    fail(`the worked example came to ${r.digHours}hr of digging, wanted about 1.04`);
  }
}

// 20. An existing trench is laid but not dug.
//
//     A run reusing a length somebody else opened is ordinary — a duct
//     through an existing route, a section shared with an earlier phase
//     — and charging the excavation twice puts days against a hole
//     nobody digs. The laying is untouched: the pipe goes in whether or
//     not this job made the trench.
{
  const args = { ...base, size: size(0.45, 0.90), utilities: ["gas", "electric"] };
  const fresh = digEstimate(args);
  const old = digEstimate({ ...args, existing: true });

  if (old.digHours !== 0) fail(`an existing trench was charged ${old.digHours}hr of digging`);
  if (old.layHours !== fresh.layHours) fail("an existing trench changed the laying");
  if (!(old.totalHours < fresh.totalHours)) {
    fail("an existing trench took as long as digging a new one");
  }
  if (Math.abs(old.totalHours - fresh.layHours) > 0.021) {
    fail("an existing trench came to something other than its laying");
  }

  /* Setup goes with the dig, not the lay: it is the machine being moved
     and matted, and there is no machine. */
  if (old.setupHours !== 0) fail("an existing trench was charged for setting up a machine");

  /* The hole is still that size — it just is not this job's to make.
     Dropping the volume would make an existing section look like an
     empty one. */
  if (old.volumeM3 !== fresh.volumeM3) fail("an existing trench lost its volume");
  if (!old.existing) fail("an existing trench did not report itself as one");
  if (!/existing/i.test(old.basis)) {
    fail(`an existing trench reported "${old.basis}" rather than saying why`);
  }

  /* And a trench with nothing laid in it is still no estimate, existing
     or not — "0 hours" would read as a finished job. */
  if (digEstimate({ ...base, size: { widthM: 0, depthM: 0 }, existing: true }).ok) {
    fail("an existing trench with nothing in it was given a duration");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Dig and lay estimates behave "
    + `(${DEFAULT_DIG_RATES.length} machines, ${DEFAULT_DEPTH_FACTORS.length} depth bands, `
    + `unmade ground the baseline).`);
process.exit(bad ? 1 : 0);
