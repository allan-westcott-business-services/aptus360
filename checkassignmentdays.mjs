/* Defaulting an assignment's end date from the dig estimate.

   The estimate is worked out in digDays.js and checked there. This
   checks what Planning does with it: that a length of work becomes an
   end date the calendar agrees with, that only the trenching phases get
   one, and that not knowing produces no date rather than a wrong one. */
import { endAfterHalves, workedDaysIn } from "./src/features/calloffs/assignments.js";
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

console.log(bad ? `\n${bad} problem(s)`
  : "Assignment end dates behave (per run, laid around weekends, dig phases only).");
process.exit(bad ? 1 : 0);
