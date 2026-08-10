/* The assign form's ordering rules, and how a booking reads back.

   Both of these have been lost once already, so they are written down
   here rather than only in the markup:

     The dates come before the team, and the team dropdown is disabled
     until both are set. The dates decide which teams there are, so
     asking for a team first asks a question whose answer changes as
     soon as the next one is answered.

     A team booked on ANY day the booking falls on is unavailable, not
     only one booked across the whole stretch.

     Every day of a breakdown names how much of it is worked, full days
     included: "11-Aug-2026" beside "10-Aug-2026 (AM)" reads as an
     omission rather than as a full day. */
import { readFileSync } from "node:fs";

const FILE = "src/features/calloffs/CallOffsPage.jsx";
const src = readFileSync(FILE, "utf8");

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// 1. Dates first, team second.
const atDate = src.indexOf('className="asg-date"');
const atTeam = src.indexOf('className="asg-team-sel"');
if (atDate < 0 || atTeam < 0) fail("the date or team control is missing");
else if (atDate > atTeam) fail("the team dropdown comes before the dates");

// 2. And disabled until both dates are in.
if (!/disabled=\{!draft\.Start_Date \|\| !draft\.End_Date\}/.test(src)) {
  fail("the team dropdown is not disabled until both dates are set");
}
if (!src.includes("Dates first")) fail("the dropdown does not say why it is disabled");

// 3. Busy on any day, not every day. `every` here is the regression:
//    it offers a team that is out on one day of three.
const busy = src.slice(src.indexOf("const busyAcross"), src.indexOf("const busyAcross") + 900);
if (/days\.every\(/.test(busy)) {
  fail("availability uses days.every — a team out on one day is still offered");
}
if (!/days\.some\(/.test(busy)) fail("availability does not check every day of the range");

// 4. Full days are named on the breakdown.
if (/part: d\.Part && d\.Part !== "Full" \? d\.Part : null/.test(src)) {
  fail("full days are left unnamed on the day breakdown");
}
if (!src.includes('"Full day"')) fail("the breakdown never says Full day");

// 5. One tick per thing.
//
//    Restoring lost work put a second "split by utility" tick on the
//    form while the first was still there, so the same checkbox
//    appeared twice with different wording. Two controls setting one
//    flag is not a cosmetic problem: whichever is nearer gets clicked,
//    and the other is left looking wrong.
for (const [what, pattern] of [
  ["split by utility", /className="asg-split-tick"/g],
  ["different plots each day", /className="asg-byday"/g],
]) {
  const n = (src.match(pattern) || []).length;
  if (n > 1) fail(`the ${what} tick appears ${n} times`);
  if (n === 0) fail(`the ${what} tick is missing`);
}

// 6. The per-day tick is not offered on a one-day booking, and the
//    flag it sets is derived rather than read raw.
//
//    Both halves matter. Without the first, the form asks whether the
//    plots differ between days when there is one day. Without the
//    second, narrowing a three-day booking to one leaves the flag set
//    with the tick gone, and plots save against days no longer in it.
{
  const tick = src.indexOf('className="asg-byday"');
  const before = src.slice(Math.max(0, tick - 400), tick);
  if (!/schedule\.days\.length > 1/.test(before)) {
    fail("the per-day tick is shown on a one-day booking");
  }
  if (!/const splitByDay = !!draft\.byDay && schedule\.days\.length > 1/.test(src)) {
    fail("splitByDay is not derived from the number of days");
  }
  /* And nothing reads the raw flag except the tick and that derivation,
     or the two views come apart again. */
  const raw = (src.match(/draft\.byDay/g) || []).length;
  if (raw > 2) fail(`draft.byDay is read raw in ${raw} places; use splitByDay`);
}

// 7. The summary lists its days; it never shows a range.
//
//    "10-Aug to 12-Aug" says a gang is on site continuously between two
//    dates. A booking that is a Monday morning and a Wednesday
//    afternoon is not that, and reads as three days of work when it is
//    one. This has been asked for, built, and lost to a reset once
//    already, which is why it is written down here.
if (/\{fmt\(a\.Start_Date\)\} to \{fmt\(a\.End_Date\)\}/.test(src)) {
  fail('the summary still shows "start to end" as a range');
}
if (!/const whenOf/.test(src)) fail("the day list helper is missing");
if (/className="asg-part-tag"/.test(src)) {
  fail("the separate part tag is back; parts belong on their dates");
}
// And the plots are named as plots.
if (!/`Plots \$\{a\.Plot_Range\}`/.test(src)) {
  fail("the summary does not label the plot range");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Assign form behaves (dates before team, any-day availability, full days named).");
process.exit(bad ? 1 : 0);
