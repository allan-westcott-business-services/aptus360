/* How long the jointing takes.

   ── Why it is not the dig estimate ──

   A jointing booking is not the trenching. isDigTask exists precisely
   because giving jointing the trench's duration would put a fortnight
   against half a day's work — so it has always been left blank, and
   somebody typed a guess into the end date.

   Jointing is counted, not measured, and on a service call-off what is
   counted is the plots: one plot is one connection, and a connection
   takes about two hours. Twelve plots is three days, rather than
   however long the trench happened to be.

   ── Service call-offs only ──

   A mains call-off's jointing is a different job — tees, live
   insertions, transition pieces — and how long it takes does not follow
   from a plot count, because a mains run may serve no plots at all.
   Nobody has given a figure for it, so nothing is estimated: an empty
   end date says nobody knows, which is true, where a number worked out
   from the wrong thing would not be.

   ── Why the rate is here and not in a table ──

   For now. Dig_Rate is a table because it varies by machine, surface
   and depth, and because somebody calibrates it from real jobs. Two
   hours a joint varies by none of those in a way anybody has measured
   yet.

   When it does — a mains tee against a service joint, a live insertion
   against a straight — it wants a table like the dig rates, with the
   same admin screen and the same calibration. Until then a named
   constant says what the number is and where it came from, and does not
   pretend to a precision nobody has.

   ── Rounded up to half a day ──

   Because a gang is booked in half days. Three joints is six hours,
   which is a day: you cannot send half a jointer home at two o'clock,
   and booking six hours means the next job starts in the middle of an
   afternoon that was never free. */

import { HOURS_PER_DAY } from "./digRate.js";

/* Hours to connect one plot. The trade's figure, not a measurement —
   see above for when this should stop being a constant. */
export const HOURS_PER_JOINT = 2;

/* Whether a phase is the jointing.

   Matched on the name, the same way isDigTask matches the trenching:
   that is how phases have always been told apart here, and a second
   method would be a second thing to update when one is renamed. */
export function isJointTask(taskType) {
  const n = String(taskType?.Task_Type_Name || "").toLowerCase().trim();
  return n.startsWith("joint");
}

export function jointTaskIds(taskTypes = []) {
  return new Set(taskTypes.filter(isJointTask).map((t) => Number(t.Task_Type_ID)));
}

/* How long a number of joints takes.

   Returns half-days, the unit assignments are booked in, alongside the
   hours it came from so a screen can show the working rather than a
   number nobody can check. */
export function jointEstimate({
  plots = 0,
  hoursPerPlot = HOURS_PER_JOINT,
  /* The gang's pace, as everywhere else. An experienced team connects a
     plot faster than an apprentice one, and a plan giving both the same
     duration is wrong for both. */
  efficiency = 1,
} = {}) {
  const n = Math.max(0, Math.floor(Number(plots) || 0));
  const hoursPerJoint = hoursPerPlot;
  const eff = Number(efficiency);
  const factor = Number.isFinite(eff) && eff >= 0.25 && eff <= 3 ? eff : 1;
  if (!n) {
    /* No joints is not half a day of jointing. Said as not-ok rather
       than zero, so a caller shows nothing instead of "0 days", which
       reads as an answer. */
    return {
      ok: false, plots: 0, hours: 0, halfDays: 0,
      why: "No plots on this call-off.",
    };
  }

  const hours = (n * hoursPerJoint) / factor;
  /* Up to the next half day, because a gang is booked in half days. */
  const halfDays = Math.max(1, Math.ceil(hours / (HOURS_PER_DAY / 2)));

  return {
    ok: true,
    plots: n,
    hours: Math.round(hours * 100) / 100,
    halfDays,
    hoursPerJoint,
    efficiency: factor,
    why: `${n} plot${n === 1 ? "" : "s"} at ${hoursPerJoint} hr each`,
  };
}

/* ── Reinstatement ──

   Area and surface. A hundred metres of carriageway is a different job
   from a hundred metres of verge, and the difference is the surface
   rather than the length — so the rate is square metres an hour, per
   surface, and the area is the trench's own length by its width.

   ── No rate, no estimate ──

   Not a zero and not a guess. There is no free source for these: SROH
   and the council standard details specify materials and depths and say
   nothing about durations, and the recognised output rates are in a
   commercial price book.

   So an unrated surface answers "nobody has said", which is what a
   blank end date already means — and is honest in a way a number
   invented here would not be. */
export function reinstateEstimate({
  lengthM = 0,
  widthM = 0,
  surface = null,
  efficiency = 1,
} = {}) {
  const L = Number(lengthM) || 0;
  const W = Number(widthM) || 0;
  const rate = Number(surface?.Reinstate_M2_Hr) || 0;

  if (!(L > 0) || !(W > 0)) {
    return { ok: false, why: "This trench has no measured area to reinstate." };
  }
  if (!(rate > 0)) {
    return {
      ok: false,
      why: `No reinstatement rate set for ${surface?.Label ?? "this surface"}.`,
      needsRate: true,
    };
  }

  const eff = Number(efficiency);
  const factor = Number.isFinite(eff) && eff >= 0.25 && eff <= 3 ? eff : 1;

  const areaM2 = L * W;
  /* The work, quickened or slowed by the gang. */
  const workHours = (areaM2 / rate) / factor;
  /* Setting up is not: signing and guarding take what they take, and a
     quick gang does not put out cones faster. */
  const setupHours = (Number(surface?.Reinstate_Setup_Minutes) || 0) / 60;

  const hours = workHours + setupHours;
  const halfDays = Math.max(1, Math.ceil(hours / (HOURS_PER_DAY / 2)));

  return {
    ok: true,
    areaM2: Math.round(areaM2 * 10) / 10,
    ratePerHour: rate,
    hours: Math.round(hours * 100) / 100,
    setupHours: Math.round(setupHours * 100) / 100,
    halfDays,
    efficiency: factor,
    surfaceLabel: surface?.Label ?? null,
    why: `${Math.round(areaM2 * 10) / 10} m\u00b2 of `
      + `${surface?.Label ?? "surface"} at ${rate} m\u00b2/hr`,
  };
}

/* The same, said the way a person would. */
export function jointEstimateText(est) {
  if (!est?.ok) return est?.why ?? "";
  const days = est.halfDays / 2;
  const d = days === Math.floor(days) ? String(days) : days.toFixed(1);
  return `${est.why} \u2014 about ${d} day${days === 1 ? "" : "s"}`;
}
