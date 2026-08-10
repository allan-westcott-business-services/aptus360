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

console.log(bad ? `\n${bad} problem(s)`
  : "Assign form behaves (dates before team, any-day availability, full days named).");
process.exit(bad ? 1 : 0);
