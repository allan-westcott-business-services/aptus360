/* What the Plot Connections dashboard counts, and what it must not.

   Every card is a number with nothing beside it to argue with. A
   predicate that is subtly wrong produces a count that looks exactly
   as authoritative as a right one, and somebody chases 412 plots that
   were never a problem — or worse, does not chase the ones that were.
   So the predicates are checked against rows built to sit either side
   of each boundary.

   Ported from the original Aptus360, where these rules lived inside an
   8 MB index.html alongside the markup that drew them. The rules are
   here in a module of their own so this file can reach them.

   ── Dates are frozen ──

   `buildCtx` takes `today`, so every case below runs against Wednesday
   7 October 2026. Without that the "more than five working days ago"
   cases would pass or fail depending on the day of the week the suite
   happened to run, which is a test that reports the calendar rather
   than the code. */
import {
  SECTIONS, METRICS, KPIS, metricsFor, buildCtx, computeMetrics,
  computeKpis, workingDaysAgo, workingDaysBetween, prevWeekRange,
  isoDate, dateBefore, isBlank, packByTeam,
} from "./src/features/connections/dashboardMetrics.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Wednesday. Chosen so that "five working days ago" crosses a weekend
   and a Monday — the arithmetic nobody gets right by accident. */
const TODAY = new Date("2026-10-07T09:00:00");

const UTIL = { 1: "Electric", 2: "Gas", 3: "Water" };
const OUTCOME = { 1: "Completed", 2: "Aborted", 3: "Dead Jointed" };
const PACK = { 1: "Pack Not Submitted", 2: "Pack In Progress", 3: "Submitted",
  4: "Accepted", 5: "Rejected", 6: "Returned", 7: "Issued", 8: "IT Issues" };

const ctx = buildCtx({
  utility: (id) => UTIL[id],
  outcome: (id) => OUTCOME[id],
  packStatus: (id) => PACK[id],
  today: TODAY,
});

let nextId = 1;
const row = (o = {}) => ({ Plot_Utility_ID: nextId++, Utility_ID: 1, ...o });

/* Does exactly this set of metrics fire for this row? */
function firesFor(r) {
  const m = computeMetrics([r], ctx);
  return Object.entries(m).filter(([, v]) => v.count === 1).map(([k]) => k).sort();
}
function expectFires(label, r, expected) {
  const got = firesFor(r);
  const want = [...expected].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${label}\n       fired: ${got.join(", ") || "(none)"}\n       want:  ${want.join(", ") || "(none)"}`);
  }
}

/* ── The dates the cards turn on ─────────────────────────────────── */
{
  if (isoDate(workingDaysAgo(5, TODAY)) !== "2026-09-30") {
    fail(`five working days before Wed 7 Oct is 30 Sep, got ${isoDate(workingDaysAgo(5, TODAY))}`);
  }
  if (isoDate(workingDaysAgo(2, TODAY)) !== "2026-10-05") {
    fail(`two working days before Wed 7 Oct is Mon 5 Oct, got ${isoDate(workingDaysAgo(2, TODAY))}`);
  }
  const pw = prevWeekRange(TODAY);
  if (pw.start !== "2026-09-28" || pw.end !== "2026-10-02") {
    fail(`previous working week should be Mon 28 Sep – Fri 2 Oct, got ${pw.start} – ${pw.end}`);
  }
  /* A Sunday belongs to the week that began the previous Monday, not
     to the one starting the next day. Off-by-one here would shift
     every previous-week figure by seven days, once a week. */
  const sun = prevWeekRange(new Date("2026-10-11T09:00:00"));
  if (sun.start !== "2026-09-28") {
    fail(`from Sunday 11 Oct the previous week should still start 28 Sep, got ${sun.start}`);
  }
  if (workingDaysBetween("2026-10-02", "2026-10-05") !== 1) {
    fail("Friday to Monday is one working day");
  }
  if (workingDaysBetween("2026-10-05", "2026-10-07") !== 2) {
    fail("Monday to Wednesday is two working days");
  }
  /* The weekend is why this is not calendar days. A visit on Friday
     jointed on Monday is one day late, not three. */
  if (dateBefore("2026-09-30", workingDaysAgo(5, TODAY))) {
    fail("a date exactly five working days ago counts as MORE than five");
  }
  if (!dateBefore("2026-09-29", workingDaysAgo(5, TODAY))) {
    fail("a date six working days ago is not being counted as late");
  }
}

/* ── Blankness ───────────────────────────────────────────────────── */
{
  for (const v of [null, undefined, "", "   "]) {
    if (!isBlank(v)) fail(`${JSON.stringify(v)} should count as not set — imported rows carry empty strings`);
  }
  if (isBlank("2026-01-01")) fail("a real date is being treated as blank");
  if (isBlank(0)) fail("zero is a value, not a blank");
}

/* ── Each card, either side of its boundary ──────────────────────── */

/* Late visit, no service card. */
/* No outcome yet, so the jointing cards stay out of it: those want a
   visit that has actually happened. */
expectFires("a visit programmed six working days ago with no service card",
  row({ Programmed_Date: "2026-09-29" }),
  ["late_no_card", "prog_not_closed_out"]);

expectFires("the same visit programmed only four working days ago",
  row({ Programmed_Date: "2026-10-01" }),
  ["prog_not_closed_out"]);

/* ── The boundary itself, through the real context ──

   Wed 30 Sep is EXACTLY five working days before Wed 7 Oct, and the
   card says "more than 5", so it must not fire. Without this case the
   line could be moved to four working days and every assertion above
   would still pass — which it did, when I tried it. A check that
   survives the mutation it exists to catch is decoration. */
expectFires("a visit programmed exactly five working days ago",
  row({ Programmed_Date: "2026-09-30" }),
  ["prog_not_closed_out"]);

/* And the same boundary on the as-laid card, which shares the line. */
expectFires("a service card submitted exactly five working days ago",
  row({ Service_Card_Submission_Date: "2026-09-30" }),
  []);

/* Two working days before Wed 7 Oct is Mon 5 Oct, so a pack programmed
   that day is not yet missing. Pins the other clock the same way. */
expectFires("a pack Issued exactly two working days ago",
  row({ Programmed_Date: "2026-10-05", Pack_Status_ID: 7 }),
  ["prog_not_closed_out"]);

/* Aborted and Dead Jointed are excluded — they will never gain a card,
   and left in they would sit on the dashboard forever. */
/* Aborted drops off late_no_card but IS a jointing candidate — an
   aborted electric visit still needs its joint programming. */
expectFires("an ABORTED late visit",
  row({ Programmed_Date: "2026-09-29", Visit_Outcome_ID: 2 }),
  ["jointing_to_programme"]);

expectFires("a DEAD JOINTED late visit",
  row({ Programmed_Date: "2026-09-29", Visit_Outcome_ID: 3 }),
  ["prog_not_closed_out"]);

/* Gas paperwork, both ways round. */
expectFires("gas with a service card and no meter card",
  row({ Utility_ID: 2, Service_Card_Submission_Date: "2026-10-06" }),
  ["gas_sc_no_mc"]);

expectFires("the same gas plot when it is self-lay",
  row({ Utility_ID: 2, Service_Card_Submission_Date: "2026-10-06", Self_Lay_Provider: true }),
  []);

expectFires("gas with a meter card and no service card",
  row({ Utility_ID: 2, Meter_Card_Submission_Date: "2026-10-06" }),
  ["gas_mc_no_sc"]);

/* Those two are mutually exclusive by construction. If a row ever fires
   both, one of the predicates has lost its negation. */
{
  const both = computeMetrics([row({ Utility_ID: 2,
    Service_Card_Submission_Date: "2026-10-06",
    Meter_Card_Submission_Date: "2026-10-06" })], ctx);
  if (both.gas_sc_no_mc.count || both.gas_mc_no_sc.count) {
    fail("a gas plot with BOTH cards in is still on a missing-card list");
  }
}

/* As-laid, and the water exception. */
expectFires("as-laid recorded on electric with no service card",
  row({ Utility_ID: 1, As_Laid_Date: "2026-10-01" }),
  ["aslaid_no_sc"]);

expectFires("as-laid recorded on WATER with no service card — water needs none",
  row({ Utility_ID: 3, As_Laid_Date: "2026-10-01" }),
  []);

expectFires("a service card submitted six working days ago with no as-laid",
  row({ Service_Card_Submission_Date: "2026-09-29" }),
  ["late_no_aslaid"]);

/* Job packs. The status is matched on the word, through the lookup. */
/* Friday 2 Oct is past the two-working-day line (Mon 5 Oct) but not
   the five-day one (Wed 30 Sep), so the pack is missing and the
   service card is not yet late. The two cards have different clocks
   and this is the row that proves it. */
expectFires("a pack still Issued three working days after the visit",
  row({ Programmed_Date: "2026-10-02", Pack_Status_ID: 7 }),
  ["missing_job_packs", "prog_not_closed_out"]);

expectFires("a pack already Submitted",
  row({ Programmed_Date: "2026-10-02", Pack_Status_ID: 3 }),
  ["prog_not_closed_out"]);

/* Jointing, Electric only. Gas and water have no jointing columns at
   all, so without the scope every one of them would match. */
expectFires("a completed GAS plot with no planned jointing date",
  row({ Utility_ID: 2, Visit_Outcome_ID: 1, Connection_Date: "2026-10-01" }),
  []);

expectFires("a completed ELECTRIC plot with no planned jointing date",
  row({ Utility_ID: 1, Visit_Outcome_ID: 1, Connection_Date: "2026-10-01" }),
  ["jointing_to_programme"]);

expectFires("an electric plot planned but not confirmed",
  row({ Utility_ID: 1, Visit_Outcome_ID: 1, Connection_Date: "2026-10-01",
    Planned_Jointing_Date: "2026-10-09" }),
  ["jointing_confirmation_of_works"]);

/* ── The shape the cards are arranged in ─────────────────────────── */
{
  for (const m of METRICS) {
    if (!SECTIONS.some((s) => s.id === m.group)) {
      fail(`metric ${m.id} belongs to section "${m.group}", which does not exist — it would never be shown`);
    }
    if (!m.title || !m.description) fail(`metric ${m.id} has no title or no description`);
  }
  const ids = METRICS.map((m) => m.id);
  if (new Set(ids).size !== ids.length) fail("two metrics share an id");
  for (const s of SECTIONS) {
    if (!metricsFor(s.id).length) fail(`section ${s.id} has no cards and would render empty`);
  }
}

/* ── The KPIs ────────────────────────────────────────────────────── */
{
  const rows = [
    /* Jointed the next working day, and two working days later. */
    row({ Utility_ID: 1, Visit_Outcome_ID: 1, Programmed_Date: "2026-09-28", Actual_Jointing_Date: "2026-09-29" }),
    row({ Utility_ID: 1, Visit_Outcome_ID: 1, Programmed_Date: "2026-09-28", Actual_Jointing_Date: "2026-09-30" }),
    /* Jointed a fortnight later — on time by no measure. */
    row({ Utility_ID: 1, Visit_Outcome_ID: 1, Programmed_Date: "2026-09-14", Actual_Jointing_Date: "2026-09-28" }),
    /* Gas completed in the previous working week. */
    row({ Utility_ID: 2, Visit_Outcome_ID: 1, Programmed_Date: "2026-09-29", Service_Card_Submission_Date: "2026-10-01" }),
  ];
  const k = computeKpis(rows, ctx, "");

  const within = k.jointed_within_2_working_days;
  /* Two of the three jointed plots are inside two working days. */
  if (within.display !== "66.7") {
    fail(`two of three jointed within 2 working days is 66.7%, got ${within.display}`);
  }
  const gw = k.gw_connections_prev_week;
  if (gw.display !== "1") fail(`one gas plot completed in the previous week, got ${gw.display}`);

  /* An empty set must read "—" rather than 0: nobody jointed anything
     is a different fact from everybody jointed it on the day. */
  const none = computeKpis([], ctx, "");
  if (none.jointing_lead_time.display !== "—" || !none.jointing_lead_time.empty) {
    fail("a KPI with no rows should read — rather than a number");
  }

  /* The start date is judged on each KPI's own anchor. */
  const cut = computeKpis(rows, ctx, "2026-09-20");
  if (cut.jointed_within_2_working_days.display !== "100.0") {
    fail(`with a 20 Sep cut-off only the two on-time plots remain, so 100%, got ${cut.jointed_within_2_working_days.display}`);
  }

  for (const kpi of KPIS) {
    if (!k[kpi.id]) fail(`KPI ${kpi.id} produced nothing`);
    if (!kpi.anchor) fail(`KPI ${kpi.id} has no anchor date, so a start date cannot narrow it`);
  }
}

/* ── Missing packs by team ───────────────────────────────────────── */
{
  const rows = [
    row({ Utility_ID: 1, Pack_Status_ID: 7, Programmed_Date: "2026-09-29", Team_ID: 1 }),
    row({ Utility_ID: 2, Pack_Status_ID: 2, Programmed_Date: "2026-09-29", Team_ID: 1 }),
    row({ Utility_ID: 3, Pack_Status_ID: 7, Programmed_Date: "2026-09-29", Team_ID: 2 }),
    /* Returned, so not missing. */
    row({ Utility_ID: 1, Pack_Status_ID: 6, Programmed_Date: "2026-09-29", Team_ID: 1 }),
  ];
  const by = packByTeam(rows, ctx, (id) => ({ 1: "MU Team Yorkshire", 2: "MU Team North East" })[id]);
  const york = by.find((b) => b.team === "MU Team Yorkshire");
  if (!york || york.total !== 2 || york.electric !== 1 || york.gas !== 1) {
    fail(`Yorkshire should hold 2 missing packs, 1 electric and 1 gas — got ${JSON.stringify(york)}`);
  }
  if (by[0].total < by[by.length - 1].total) fail("teams are not sorted worst-first");
  const rowsWithNoTeam = packByTeam([row({ Utility_ID: 1, Pack_Status_ID: 7, Programmed_Date: "2026-09-29" })],
    ctx, () => null);
  if (rowsWithNoTeam[0]?.team !== "No team") fail("a pack with no team is dropped rather than shown");
}

/* ── One bad row must not take the dashboard down ────────────────── */
{
  const poison = { Plot_Utility_ID: 99, get Utility_ID() { throw new Error("bad row"); } };
  let counts;
  try { counts = computeMetrics([poison, row({ Programmed_Date: "2026-09-29" })], ctx); }
  catch (e) { fail(`one unreadable row threw and took every card with it: ${e.message}`); }
  if (counts && counts.late_no_card.count !== 1) {
    fail("a good row beside a bad one was lost");
  }
}

console.log(bad ? `checkconnectionsdashboard: ${bad} FAILED`
                : "checkconnectionsdashboard: all passed");
process.exit(bad ? 1 : 0);
