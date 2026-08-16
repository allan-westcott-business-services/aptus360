/* Defaulting an assignment's end date from the dig estimate.

   The estimate is worked out in digDays.js and checked there. This
   checks what Planning does with it: that a length of work becomes an
   end date the calendar agrees with, that only the trenching phases get
   one, and that not knowing produces no date rather than a wrong one. */
import { readFileSync } from "node:fs";
import {
  endAfterHalves, workedDaysIn, layHalves, laySchedule, daysBetween,
  bookedParts, freeParts,
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

console.log(bad ? `\n${bad} problem(s)`
  : "Assignment end dates behave (per run, laid around weekends, dig phases only).");
process.exit(bad ? 1 : 0);
