/* Defaulting an assignment's end date from the dig estimate.

   The estimate is worked out in digDays.js and checked there. This
   checks what Planning does with it: that a length of work becomes an
   end date the calendar agrees with, that only the trenching phases get
   one, and that not knowing produces no date rather than a wrong one. */
import { readFileSync } from "node:fs";
import { jointEstimate, reinstateEstimate } from "./src/features/gis/jointRate.js";
import { digEstimate } from "./src/features/gis/digRate.js";
import {
  endAfterHalves, workedDaysIn, layHalves, laySchedule, daysBetween,
  bookedParts, freeParts, dayTotal,
} from "./src/features/calloffs/assignments.js";
import { isDigTask, digTaskIds, toItems } from "./src/features/calloffs/rules.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* 14 August 2026 is a Friday, 17 August the Monday after. */
const FRI = "2026-08-14";
const MON = "2026-08-17";

// 1. Half-days become an end date, laid around the weekend.
//
//    Four halves from a Friday are Friday and Monday, not Friday and
//    Saturday. Adding days to a date gets this wrong, which is why it
//    walks the calendar.
{
  if (endAfterHalves(FRI, 1) !== FRI) fail("half a day from Friday did not finish that Friday");
  if (endAfterHalves(FRI, 2) !== FRI) fail("a full Friday did not finish that Friday");
  if (endAfterHalves(FRI, 3) !== MON) fail("three halves from Friday did not run to Monday");
  if (endAfterHalves(FRI, 4) !== MON) fail("four halves from Friday did not finish on Monday");
  if (endAfterHalves(FRI, 5) !== "2026-08-18") {
    fail(`five halves from Friday finished ${endAfterHalves(FRI, 5)}`);
  }
  /* A working week from a Monday finishes that Friday. */
  if (endAfterHalves(MON, 10) !== "2026-08-21") {
    fail(`ten halves from Monday finished ${endAfterHalves(MON, 10)}`);
  }
}

// 2. The end is never before the start, and longer work never finishes
//    earlier.
{
  let last = FRI;
  for (let n = 1; n <= 40; n++) {
    const end = endAfterHalves(MON, n);
    if (!end) { fail(`${n} half-days produced no end date`); break; }
    if (end < MON) fail(`${n} half-days finished before it started`);
    if (end < last) fail(`${n} half-days finished before ${n - 1} did`);
    last = end;
  }
}

// 3. The days between the two hold the work.
//
//    The point of the default: a planner accepting it gets a booking
//    long enough. Two halves to a worked day, and the last day may be a
//    single half — so the days available must be at least the halves
//    needed, and never more than one day over.
{
  for (const n of [1, 2, 3, 7, 10, 11, 21]) {
    const end = endAfterHalves(MON, n);
    const days = workedDaysIn(MON, end, {}).length;
    if (days * 2 < n) fail(`${n} half-days were given only ${days} working day(s)`);
    if ((days - 1) * 2 >= n) fail(`${n} half-days were given a spare day`);
  }
}

// 4. Not knowing produces no date.
//
//    A call-off raised before the estimate existed, or one whose ends
//    are not all on the trench network. Empty says nobody knows;
//    defaulting to the start date would say the work takes no time.
{
  if (endAfterHalves(MON, null) !== null) fail("an unknown estimate produced an end date");
  if (endAfterHalves(MON, 0) !== null) fail("no work produced an end date");
  if (endAfterHalves(MON, undefined) !== null) fail("a missing estimate produced an end date");
  if (endAfterHalves("", 5) !== null) fail("no start date produced an end date");
}

// 5. Only the trenching phases are defaulted.
//
//    A jointing or reinstatement booking is not the dig, and giving it
//    the dig's length would put a fortnight against half a day's work.
{
  for (const n of ["Excavation", "Excavate and lay", "Lay", "Lay & backfill", "  excavation  "]) {
    if (!isDigTask({ Task_Type_Name: n })) fail(`"${n}" was not recognised as the dig`);
  }
  for (const n of ["Jointing", "Reinstatement", "Survey", "Energise", "Pre-lay survey", ""]) {
    if (isDigTask({ Task_Type_Name: n })) fail(`"${n}" was treated as the dig`);
  }
  if (isDigTask(undefined)) fail("a missing task type was treated as the dig");

  const ids = digTaskIds([
    { Task_Type_ID: 1, Task_Type_Name: "Excavation" },
    { Task_Type_ID: 2, Task_Type_Name: "Jointing" },
    { Task_Type_ID: 3, Task_Type_Name: "Lay" },
  ]);
  if (ids.size !== 2 || !ids.has(1) || !ids.has(3)) {
    fail(`the dig phases came out as ${[...ids].join(", ")}`);
  }
}

// 6. The per-section estimate is carried onto the row, and absence
//    stays absent.
//
//    Null rather than zero throughout: a section the drawing could not
//    answer for is unknown, and zero would book a team for no time.
{
  const rows = toItems([
    { From_Plot: "12", To_Plot: "16", Estimated_Half_Days: 5 },
    { From_Plot: "1", To_Plot: "2" },
    { From_Plot: "3", To_Plot: "4", Estimated_Half_Days: 0 },
    { From_Plot: "5", To_Plot: "6", Estimated_Half_Days: "" },
    /* Rounded up before it is stored — a gang cannot be sent for part
       of a half-day. */
    { From_Plot: "7", To_Plot: "8", Estimated_Half_Days: 3.4 },
  ], "Span");

  if (rows[0].Estimated_Half_Days !== 5) fail("a section's estimate was not carried through");
  if (rows[1].Estimated_Half_Days !== null) fail("a section with no estimate was not null");
  if (rows[2].Estimated_Half_Days !== null) fail("a zero estimate was stored rather than null");
  if (rows[3].Estimated_Half_Days !== null) fail("an empty estimate was not null");
  if (!Number.isInteger(rows[4].Estimated_Half_Days)) {
    fail("a fractional estimate was stored as a fraction");
  }
}

// 7. A run's own estimate is what its booking is defaulted from.
//
//    The choice being made in the form is which runs go to which team.
//    Opening on one run of six and showing the length of all six is the
//    number a planner would accept without reading, having just told
//    the form it is doing a sixth of the work.
{
  const call = {
    Estimated_Half_Days: 24,
    items: [
      { Span_ID: 1, Plots: "Plot 12 to Plot 16", Estimated_Half_Days: 4 },
      { Span_ID: 2, Plots: "Plot 16 to Plot 22", Estimated_Half_Days: 20 },
      { Span_ID: 3, Plots: "Plot 22 to Span Node A4" },
    ],
  };
  /* The same lookup the form does: a run where one is chosen, the whole
     call-off where none is. */
  const halvesFor = (spanId) => (spanId
    ? call.items.find((it) => Number(it.Span_ID) === Number(spanId))?.Estimated_Half_Days
    : call.Estimated_Half_Days);

  const short = endAfterHalves(MON, halvesFor(1));
  const long = endAfterHalves(MON, halvesFor(2));
  const all = endAfterHalves(MON, halvesFor(""));

  if (!(short < long)) fail("a four-half run did not finish before a twenty-half one");
  if (!(long <= all)) fail("one run finished later than the whole call-off");
  if (short !== "2026-08-18") fail(`a four-half run from Monday finished ${short}`);

  /* A run the drawing could not answer for gets no date, even though
     the call-off as a whole has one. Empty says nobody knows; borrowing
     the total would book one run for the length of six. */
  if (endAfterHalves(MON, halvesFor(3)) !== null) {
    fail("a run with no estimate borrowed a date from somewhere");
  }
}

// 10. The day rows match the estimate, half for half.
//
//     The form lays the booking out day by day under the dates. Those
//     rows measured a new booking in calendar days, which is right for
//     dates somebody typed and wrong for dates derived from an estimate:
//     a day and a half from a Saturday finishes Tuesday morning, and the
//     calendar span of that is four days. Laying four worked days from
//     the Saturday gave Monday to Thursday — four full days against an
//     estimate of one and a half.
{
  const laid = (start, n) =>
    layHalves(start, false, Array.from({ length: n }, () => ({})), {});

  /* Three halves from a Saturday: Monday whole, Tuesday morning. */
  const r = laid("2026-08-15", 3);
  if (r.days.length !== 2) fail(`three halves laid over ${r.days.length} days, wanted 2`);
  if (r.days[0].part !== "Full") fail("the first day of three halves was not a full day");
  if (r.days[1].part !== "AM") fail(`the odd half showed as ${r.days[1].part}, wanted AM`);
  if (r.end !== "2026-08-18") fail(`three halves from Saturday ended ${r.end}`);

  /* One half is one morning, not a whole day. */
  const one = laid("2026-08-15", 1);
  if (one.days.length !== 1 || one.days[0].part !== "AM") {
    fail("half a day was not laid as a single morning");
  }

  /* The rows and the end date come from the same walk, so they cannot
     disagree about where a booking finishes. */
  for (const [start, n] of [["2026-08-15", 3], ["2026-08-14", 3],
    ["2026-08-17", 8], ["2026-08-17", 1], ["2026-08-21", 5]]) {
    const rows = laid(start, n);
    if (rows.end !== endAfterHalves(start, n)) {
      fail(`${n} halves from ${start}: rows end ${rows.end}, date says ` +
        `${endAfterHalves(start, n)}`);
    }
    /* And the rows hold exactly the halves asked for. */
    const halves = rows.days.reduce((t, d) => t + (d.part === "Full" ? 2 : 1), 0);
    if (halves !== n) fail(`${n} halves from ${start} were laid as ${halves}`);
  }

  /* The old measure is what went wrong, and it is still right for dates
     somebody typed — so this pins the difference rather than the bug. */
  const typed = laySchedule("2026-08-15",
    daysBetween("2026-08-15", "2026-08-18").length, {});
  if (typed.days.length !== 4) {
    fail("a typed date range no longer lays out by calendar span");
  }
}

// 11. The end date is where the day rows end, however the form got
//     there.
//
//     Moving the start, changing the run, working the weekend: each
//     changes where the work finishes, and each was correcting the date
//     its own way. Sliding the end by the same calendar days the start
//     moved kept the span and lost the length — two days of work read as
//     the 17th to the 20th while the rows showed the 17th and 18th.
//
//     One rule now: the rows are laid from the estimate, and the field
//     says where they end. This checks the two can never part company.
{
  const laid = (start, n, weekend = {}) =>
    layHalves(start, false, Array.from({ length: n }, () => ({})), weekend);

  const starts = ["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-21"];
  for (const start of starts) {
    for (let n = 1; n <= 12; n++) {
      const rows = laid(start, n);
      if (rows.end !== endAfterHalves(start, n)) {
        fail(`${n} halves from ${start}: rows end ${rows.end}, `
          + `field would say ${endAfterHalves(start, n)}`);
      }
    }
  }

  /* Moving the start does not stretch the booking. Two days of work is
     two days of work wherever it begins. */
  for (const start of starts) {
    const rows = laid(start, 4);
    const halves = rows.days.reduce((t, d) => t + (d.part === "Full" ? 2 : 1), 0);
    if (halves !== 4) fail(`two days from ${start} was laid as ${halves / 2}`);
    if (rows.days.length > 2) {
      fail(`two days from ${start} spread over ${rows.days.length} days`);
    }
  }

  /* And working the weekend shortens it rather than leaving the field
     behind — the case that made one rule worth having instead of four. */
  const weekend = { Sat: "Full", Sun: "Full" };
  const overWeekend = laid("2026-08-15", 4, weekend);
  const noWeekend = laid("2026-08-15", 4);
  if (!(overWeekend.end <= noWeekend.end)) {
    fail("working the weekend did not finish the booking sooner");
  }
}

// 12. An aborted job gives the team's time back.
//
//     The gang arrived, could not get on, and the rest of the day is
//     theirs — which is the whole reason an abort exists rather than the
//     job being marked complete.
//
//     Without this the office could see the abort on the assignment and
//     still not book the team anything else, because the day was full
//     according to a job nobody did. That is the state the field app put
//     them in the first time somebody used it.
{
  const team = 1;
  const asg = [
    { Assignment_ID: 1, Team_ID: 1, Status: "Aborted" },
    { Assignment_ID: 2, Team_ID: 1, Status: "Complete" },
    { Assignment_ID: 3, Team_ID: 1, Status: "Scheduled" },
    { Assignment_ID: 4, Team_ID: 1, Status: "Submitted" },
  ];
  const days = [
    { Assignment_ID: 1, Work_Date: "2026-08-20", Part: "AM" },
    { Assignment_ID: 2, Work_Date: "2026-08-19", Part: "Full" },
    { Assignment_ID: 3, Work_Date: "2026-08-21", Part: "PM" },
    { Assignment_ID: 4, Work_Date: "2026-08-18", Part: "Full" },
  ];
  const booked = bookedParts(team, asg, days);

  if (booked.get("2026-08-20")) {
    fail("an aborted job still holds the team's day");
  }
  if (!freeParts(booked.get("2026-08-20")).includes("Full")) {
    fail("the day an abort freed cannot be booked");
  }

  /* Complete does not give time back. A finished job used the day, and a
     planner looking at a full Tuesday should see a full Tuesday. */
  if (!booked.get("2026-08-19")?.has("Full")) {
    fail("a completed job stopped holding its day");
  }
  /* Nor does submitted — the work happened, the office simply has not
     approved the record yet. */
  if (!booked.get("2026-08-18")?.has("Full")) {
    fail("a submitted job stopped holding its day");
  }
  /* And an ordinary booking still holds its half. */
  if (!booked.get("2026-08-21")?.has("PM")) {
    fail("a scheduled job stopped holding its day");
  }
  if (freeParts(booked.get("2026-08-21")).join() !== "AM") {
    fail("a half-booked day no longer offers the other half");
  }

  /* Only the states that mean the work did not happen. A list that grew
     to include Complete would empty the planner of everything finished. */
  const src = readFileSync("./src/features/calloffs/assignments.js", "utf8");
  const set = src.match(/const GIVES_TIME_BACK = new Set\(\[([^\]]*)\]\)/);
  if (!set) fail("nothing says which states give a team's time back");
  else {
    const names = [...set[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (!names.includes("Aborted")) fail("Aborted does not give time back");
    for (const n of ["Complete", "Submitted", "Scheduled", "In Progress"]) {
      if (names.includes(n)) fail(`${n} gives the team's time back, which it should not`);
    }
  }
}

// 13. Booking less time than the work needs is said, not refused.
//
//     A gang given the morning for a day's dig is ordinary — the rest
//     may go to another team, or to this one later in the week. What is
//     not ordinary is nobody noticing until somebody is on site.
{
  const total = (parts) => Object.values(parts)
    .reduce((t, v) => t + (v === "Full" ? 1 : 0.5), 0);
  const shortfall = (halves, parts) => {
    if (!(halves > 0)) return null;
    const booked = total(parts);
    const needed = halves / 2;
    return booked >= needed
      ? null : { booked, needed, short: Math.round((needed - booked) * 10) / 10 };
  };

  /* The case that raised it: a day's work, a morning booked. */
  const half = shortfall(2, { a: "AM" });
  if (!half) fail("half a day booked against a full day's work says nothing");
  else if (half.short !== 0.5) fail(`the shortfall came out as ${half.short}, wanted 0.5`);

  if (shortfall(2, { a: "Full" })) fail("a booking that matches the estimate warns");
  if (shortfall(4, { a: "Full", b: "Full" })) fail("two days for two days' work warns");
  if (!shortfall(4, { a: "Full" })) fail("one day for two days' work says nothing");

  /* More time than the estimate is not a warning. The estimate is a
     planning figure, and a foreman who knows the ground is slow is not
     making a mistake. */
  if (shortfall(3, { a: "Full", b: "Full" })) fail("booking more than the estimate warns");

  /* No estimate, no warning. A call-off raised before 0159, or one whose
     ends are not both on the trench network, has none — and a warning
     that fires on every one of those is a warning nobody reads. */
  if (shortfall(0, { a: "AM" })) fail("a call-off with no estimate warns anyway");
  if (shortfall(null, { a: "AM" })) fail("a missing estimate warns anyway");

  /* Shown beside the pills that caused it, and asked once on save.
     A warning that can be ignored silently is one that will be. */
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  if (!/className="asg-short"/.test(page)) {
    fail("nothing shows the shortfall while the days are being chosen");
  }
  /* The assignment's save, not the energisation one — there are two
     functions of that name in the file, and slicing from the first
     found a save that has nothing to do with bookings and reported the
     prompt missing while it was there. Identified by what it does
     rather than by its name. */
  const saves = [...page.matchAll(/async function save\(\)/g)].map((m) => m.index);
  const saveAt = saves.find((i) => page.slice(i, i + 1200).includes("allProblems"));
  if (saveAt == null) fail("cannot find the assignment's save");
  const saveFn = saveAt == null ? "" : page.slice(saveAt);
  if (!/shortfall && !window\.confirm/.test(saveFn.slice(0, 900))) {
    fail("a short booking saves without asking");
  }
  /* The sentence reads as one sentence, and pluralises on each number
     rather than on the first. "you have booked 1 days" is the kind of
     thing that makes a warning look automated and get ignored. */
  const say = (needed, booked) => {
    const short = Math.round((needed - booked) * 10) / 10;
    return `This is estimated at ${needed} day${needed === 1 ? "" : "s"}`
      + ` and you have booked ${booked} day${booked === 1 ? "" : "s"}`
      + `, meaning ${short} day${short === 1 ? "" : "s"}`
      + " would be left for another team or another visit.";
  };
  if (!/booked 1 day,/.test(say(2, 1))) fail("one day booked reads as \"1 days\"");
  if (!/1\.5 days,/.test(say(2, 1.5))) fail("a half day booked is not pluralised");
  if (!/at 1 day and/.test(say(1, 0.5))) fail("a one-day estimate reads as \"1 days\"");
  if (/\. [0-9]/.test(say(2, 1.5))) fail("the sentence is still broken in two");

  /* And the page says it the same way. */
  if (!/, meaning \$\{shortfall\.short\} day/.test(page)) {
    fail("the warning does not read as one sentence");
  }
  if (!/booked \$\{shortfall\.booked\} day/.test(page)) {
    fail("the booked figure is not given its unit");
  }
  if (!/shortfall\.booked === 1 \? "" : "s"/.test(page)) {
    fail("the booked figure is not pluralised on itself");
  }

  /* And both answers are offered as legitimate, because they are. */
  if (!/another team or/.test(saveFn.slice(0, 900))) {
    fail("the question does not say that saving it short is a real option");
  }
  /* Not a blocker: the estimate is a planning figure, not a rule. The
     guard is a question that can be answered yes, rather than a return
     nothing gets past. */
  const guard = saveFn.slice(0, 900);
  if (/if \(shortfall\) return/.test(guard)) {
    fail("a short booking is refused rather than questioned");
  }

  /* The comparison, read from the page rather than from the copy above.

     The copy passed while the page was wrong: changing >= to === made
     every booking that exceeded the estimate warn, and this file did not
     notice because it was checking its own arithmetic. */
  const memo = page.slice(page.indexOf("const shortfall = useMemo("));
  const rule = memo.slice(0, memo.indexOf("}, ["));
  if (!/booked >= needed/.test(rule)) {
    fail("booking more than the estimate is treated as a shortfall");
  }
  if (!/!\(halves > 0\)/.test(rule)) {
    fail("a call-off with no estimate is compared against zero");
  }
}

// 14. Jointing on a service call-off is counted, not measured.
//
//     One plot is one connection and a connection takes about two
//     hours. Twelve plots is three days, where the trench length says
//     nothing about it — which is why isDigTask left jointing blank and
//     somebody typed a guess into the end date.
{
  const round = (n) => Math.max(1, Math.ceil(n * 2 / (8 / 2)));
  for (const [plots, want] of [[1, 1], [2, 1], [3, 2], [4, 2], [12, 6], [13, 7]]) {
    if (round(plots) !== want) {
      fail(`${plots} plots came to ${round(plots)} half-days, wanted ${want}`);
    }
  }

  const est = jointEstimate({ plots: 12 });
  if (est.halfDays !== 6) fail(`12 plots estimated at ${est.halfDays} half-days`);
  if (!/12 plots at 2 hr each/.test(est.why)) {
    fail("the estimate does not show its working");
  }
  /* Rounded up to a half day, because a gang is booked in half days:
     three plots is six hours, and you cannot send half a jointer home
     at two o'clock. */
  if (jointEstimate({ plots: 3 }).halfDays !== 2) {
    fail("six hours is not rounded up to a day");
  }
  /* No plots is not half a day of jointing — said as not-ok, so a
     screen shows nothing rather than "0 days", which reads as an
     answer. */
  if (jointEstimate({ plots: 0 }).ok) fail("no plots produced an estimate");

  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");

  /* Service call-offs only. A mains call-off's jointing is tees and
     live insertions, which does not follow from a plot count — a mains
     run may serve no plots at all. Nothing is estimated there, and an
     empty end date says nobody knows. */
  const at = page.indexOf("if (isJointTask(phaseType)) {");
  const block = at < 0 ? "" : page.slice(at, at + 400);
  if (!block) fail("jointing gets no estimate at all");
  if (!/row\.Selection_Mode !== "PlotList"/.test(block)) {
    fail("a mains call-off's jointing is estimated from a plot count");
  }
  if (!/jointEstimate\(\{ plots:/.test(block)) {
    fail("the jointing estimate is not worked out from the plots");
  }

  /* And the working is shown. A number nobody can check is a number
     somebody overrides on a hunch. */
  if (!/jointEstimateText\(est\)/.test(page)) {
    fail("the estimate is shown without saying where it came from");
  }
}

// 15. A gang's pace changes every phase, not just the digging.
//
//     An experienced team delivers up to half again what an apprentice
//     one manages, and a plan that gives both the same duration is
//     wrong for both.
{
  const dig = (eff) => digEstimate({
    lengthM: 100, size: { widthM: 1.19, depthM: 0.96 },
    surfaceKey: "footway", utilities: ["gas", "water", "electric"],
    machineKey: "mini_3t", efficiency: eff,
  });
  const fast = dig(1.5);
  const base = dig(1);
  if (!(fast.totalHours < base.totalHours)) {
    fail("a faster gang does not dig faster");
  }
  /* Half again on the work — the ratio is not exact because setup does
     not move. */
  if (!(fast.digHours < base.digHours * 0.7)) {
    fail(`a 1.5x gang dug in ${fast.digHours}h against ${base.digHours}h`);
  }
  /* Setting up is the machine being moved and matted, and a quick gang
     does not unload faster. */
  if (fast.setupHours !== base.setupHours) {
    fail("the gang's pace was applied to setting up");
  }

  /* Jointing too: connecting a plot is work like any other. */
  if (jointEstimate({ plots: 12, efficiency: 1.5 }).hours
    >= jointEstimate({ plots: 12 }).hours) {
    fail("a faster gang does not joint faster");
  }

  /* And reinstatement. */
  const surface = { Label: "Footway", Reinstate_M2_Hr: 3, Reinstate_Setup_Minutes: 30 };
  const r1 = reinstateEstimate({ lengthM: 100, widthM: 1.19, surface });
  const r2 = reinstateEstimate({ lengthM: 100, widthM: 1.19, surface, efficiency: 1.5 });
  if (!(r2.hours < r1.hours)) fail("a faster gang does not reinstate faster");
  if (r2.setupHours !== r1.setupHours) {
    fail("the gang's pace was applied to signing and guarding");
  }

  /* Out of range is treated as unstated rather than obeyed: a team
     entered at 0 would take no time at all, and one at 10 would finish
     a street in an afternoon. */
  for (const bad_ of [0, 10, -1, NaN, "fast"]) {
    if (dig(bad_).totalHours !== base.totalHours) {
      fail(`an efficiency of ${bad_} was obeyed`);
    }
  }
}

// 16. Reinstatement: area and surface, and nothing invented.
{
  const rated = { Label: "Footway", Reinstate_M2_Hr: 3, Reinstate_Setup_Minutes: 30 };
  const e = reinstateEstimate({ lengthM: 100, widthM: 1.19, surface: rated });
  if (!e.ok) fail("a rated surface produced no estimate");
  if (e.areaM2 !== 119) fail(`the area came out as ${e.areaM2}, wanted 119`);
  /* Shown, so the figure can be argued with rather than overridden on a
     hunch. */
  if (!/119 m² of Footway at 3 m²\/hr/.test(e.why)) {
    fail("the estimate does not show its working");
  }
  /* Rounded up to the half-day a gang is booked in. */
  if (e.halfDays !== Math.ceil(e.hours / 4)) fail("the hours are not rounded to half days");

  /* No rate, no estimate — not a zero and not a guess. There is no free
     source for these figures, and one invented here would be worse than
     the blank end date reinstatement has now. */
  const unrated = reinstateEstimate({
    lengthM: 100, widthM: 1.19, surface: { Label: "Carriageway 1/2" },
  });
  if (unrated.ok) fail("an unrated surface produced an estimate anyway");
  if (!unrated.needsRate) fail("an unrated surface does not say a rate is missing");
  if (!/Carriageway 1\/2/.test(unrated.why)) {
    fail("the message does not name the surface that needs a rate");
  }

  /* And no area is a different answer from no rate. */
  const noArea = reinstateEstimate({ lengthM: 0, widthM: 1.19, surface: rated });
  if (noArea.ok || noArea.needsRate) {
    fail("a trench with no area is reported as a missing rate");
  }
}

// 17. A team's machine and pace, and a call-off's machine.
//
//     Every estimate assumed the same machine at the same pace, so a
//     fortnight booked for one gang was a fortnight booked for any
//     gang.
{
  const sql = readFileSync("./supabase/migrations/0178_team_machine.sql", "utf8");
  const teams = readFileSync("./src/features/admin/TeamsAdmin.jsx", "utf8");
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  for (const col of ["Dig_Rate_ID", "Efficiency"]) {
    if (!sql.includes(col)) fail(`a team cannot record its ${col}`);
  }
  /* Bounded, because the field is typed by hand: a team at 0 takes no
     time at all and one at 10 finishes a street in an afternoon. */
  if (!/"Efficiency" >= 0\.25 AND "Efficiency" <= 3/.test(sql)) {
    fail("a team's pace is not bounded");
  }
  /* Default 1, so every existing team keeps working exactly as it did
     until somebody sets one. */
  if (!/"Efficiency" numeric NOT NULL DEFAULT 1/.test(sql)) {
    fail("existing teams do not default to the rates' own pace");
  }

  /* The screen writes both, and the machine list comes from the rate
     table rather than a second list to keep in step. */
  if (!/Dig_Rate_ID: e\.target\.value/.test(teams)) {
    fail("the teams screen cannot set a machine");
  }
  if (!/adminList\("Dig_Rate"\)/.test(teams)) {
    fail("the machine list is not read from the rate table");
  }
  /* Saved on blur, not on every keystroke: typing 1.5 passes through
     "15" on the way, and saving that writes a team at fifteen times the
     rate. */
  if (!/onBlur=\{\(e\) => \{/.test(teams)) {
    fail("a pace is saved on every keystroke");
  }
  /* And what a pace means is said, because "1.15" is not a claim
     anybody can check. */
  if (!/function paceNote/.test(teams)) {
    fail("nothing says what a team's pace means");
  }

  /* The call-off carries its own machine: it is raised before a team is
     assigned, so it cannot inherit one. */
  if (!/"Mains_Call_Off_Submission"[\s\S]{0,200}"Dig_Rate_ID"/.test(sql)) {
    fail("a call-off cannot record the machine it was estimated on");
  }
  if (!/setCallOffMachine/.test(canvas)) fail("the machine cannot be chosen");
  /* Fed into the estimate, or the picker changes a label and nothing
     else. */
  if (!/machineKey: callOffMachine/.test(canvas)) {
    fail("choosing a machine does not change the estimate");
  }
  /* And kept with the call-off: a span's half-days mean nothing without
     the machine behind them, and the office cannot ask the drawing
     later. */
  if (!/Dig_Rate_ID: callOffMachine \?\? null/.test(canvas)) {
    fail("the machine is not saved with the call-off");
  }
  /* Only on the mains one — a service call-off has no dig estimate. */
  if ((canvas.match(/Dig_Rate_ID: callOffMachine/g) || []).length !== 1) {
    fail("the machine is sent on a call-off that has no dig to estimate");
  }
}

// 18. An estimate's odd half can be moved to the afternoon.
//
//     A gang finishing at lunchtime and one starting after it are both
//     ordinary. The form refused the second, because the last half of
//     an odd estimate and a Saturday morning arrived looking identical
//     — both were a row whose part was "AM" — and the weekend rule's
//     "you cannot change this" was applied to both.
{
  const halves = Array.from({ length: 23 }, () => ({}));
  const laid = layHalves("2026-08-17", false, halves, {});

  if (laid.days.length !== 12) {
    fail(`11.5 days laid across ${laid.days.length} dates`);
  }
  const last = laid.days[laid.days.length - 1];
  if (last.part !== "AM") fail("the odd half no longer lands in the morning");
  /* Movable: it is where the halves happened to land, not a rule. */
  if (last.fixed) fail("the estimate's own odd half is treated as fixed");

  /* Every full day is unfixed too, or the buttons on eleven of these
     twelve rows would stop working. */
  if (laid.days.some((d) => d.part === "Full" && d.fixed)) {
    fail("a full day is marked as fixed");
  }

  /* A weekend half is fixed, because the rule above the form put it
     there and the form must not contradict it. */
  const sat = layHalves("2026-08-22", false, [{}, {}], { Sat_AM: true });
  if (!sat.days[0]?.fixed) fail("a Saturday morning can be moved to the afternoon");

  /* And moving it does not change what was booked. */
  const asLaid = Object.fromEntries(laid.days.map((d) => [d.date, d.part]));
  const moved = { ...asLaid, [last.date]: "PM" };
  if (dayTotal(asLaid) !== dayTotal(moved)) {
    fail(`moving the half changed the total from ${dayTotal(asLaid)} to ${dayTotal(moved)}`);
  }
  if (dayTotal(asLaid) !== 11.5) fail(`23 halves came to ${dayTotal(asLaid)} days`);

  /* The screen reads the flag rather than inferring from the part. */
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  /* The row's own flag, whatever the variable is called — it was `d`
     and is now `d0`, and pinning the name failed on correct code. */
  if (!/const fixed = \w+\.fixed && opt !== allowed/.test(page)) {
    fail("the buttons still treat any half day as fixed");
  }
  if (!/const partFor = \(\{ date, part: allowed, fixed \}/.test(page)) {
    fail("the chosen part is still overridden by any half day");
  }
}

// 19. The row reaches partFor whole.
//
//     `fixed` was added to the schedule rows and threaded through
//     partFor, and the one place that calls it rebuilt `{ date, part }`
//     from two of the fields — so `fixed` was always undefined, every
//     half day read as though the weekend rule had set it, and the
//     buttons on the odd half at the end of an estimate did nothing.
//
//     The fix looked right in the module and in the schedule for weeks.
//     It was never connected.
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");

  if (/partFor\(\{ date: d, part: allowed \}, draft\)/.test(page)) {
    fail("the schedule row is rebuilt before partFor sees it, losing fixed");
  }
  if (!/const part = partFor\(d0, draft\);/.test(page)) {
    fail("partFor is not given the row it is meant to read");
  }
  if (!/const fixed = d0\.fixed && opt !== allowed;/.test(page)) {
    fail("the buttons no longer read the row's own fixed flag");
  }

  /* The behaviour, as partFor computes it. */
  const partOf = ({ date, part: allowed, fixed }, draft) =>
    (fixed ? allowed : (draft.parts?.[date] || allowed || "Full"));
  const odd = { date: "2026-08-19", part: "AM", fixed: false };
  if (partOf(odd, {}) !== "AM") fail("the odd half no longer defaults to the morning");
  if (partOf(odd, { parts: { "2026-08-19": "PM" } }) !== "PM") {
    fail("the odd half cannot be moved to the afternoon");
  }
  /* And a whole day, for booking more time than the estimate asked
     for — which is somebody who knows the site saying the figure is
     light. */
  if (partOf(odd, { parts: { "2026-08-19": "Full" } }) !== "Full") {
    fail("a half day cannot be made a whole one");
  }
  /* A weekend half still cannot be argued with. */
  const sat = { date: "2026-08-22", part: "AM", fixed: true };
  if (partOf(sat, { parts: { "2026-08-22": "PM" } }) !== "AM") {
    fail("a Saturday morning can be moved to the afternoon");
  }

  /* And the totals follow: moving the half keeps the estimate, making
     it whole adds to it. */
  const laid = { "2026-08-18": "Full", "2026-08-19": "AM" };
  if (dayTotal(laid) !== 1.5) fail(`the estimate laid out as ${dayTotal(laid)} days`);
  if (dayTotal({ ...laid, "2026-08-19": "PM" }) !== 1.5) {
    fail("moving the half changed the total");
  }
  if (dayTotal({ ...laid, "2026-08-19": "Full" }) !== 2) {
    fail("making the last day whole did not add half a day");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Assignment end dates behave (per run, laid around weekends, dig phases only).");
process.exit(bad ? 1 : 0);
