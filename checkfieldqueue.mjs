/* A team leader's queue.

   One job open at a time, in the order the office planned, released by
   submitting or aborting the one before it.

   The rules are small and the consequences are not: release the wrong
   job and somebody drives to the wrong site; release too many and the
   ordering the process depends on is decoration; release too few and a
   van stands still. So they are checked here rather than trusted to
   read correctly. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const src = readFileSync("./netlify/functions/field-queue.js", "utf8");
const sql = readFileSync("./supabase/migrations/0169_field_queue.sql", "utf8");

/* The release rule, read out of the endpoint rather than copied.

   A copy here would pass while the real one was wrong — which it did:
   adding "In Progress" to the endpoint's list released the next job
   while somebody was still on site, and this file did not notice
   because it was checking its own list. */
const listed = src.match(/const FINISHED = \[([^\]]*)\]/);
if (!listed) fail("the endpoint no longer states which states finish a job");
const FINISHED = listed
  ? [...listed[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  : [];
const openIndexOf = (statuses) =>
  statuses.findIndex((s) => !FINISHED.includes(s));

// 1. The first unfinished job is the open one.
{
  const cases = [
    [["Scheduled", "Scheduled", "Scheduled"], 0, "a fresh queue opens at the first"],
    [["Submitted", "Scheduled", "Scheduled"], 1, "submitting releases the next"],
    [["Aborted", "Scheduled", "Scheduled"], 1, "aborting releases the next"],
    [["Complete", "Submitted", "Scheduled"], 2, "approved and submitted both count as done"],
    [["Submitted", "Submitted", "Scheduled"], 2, "two with the office still releases the third"],
    [["Complete", "Complete", "Complete"], -1, "a finished queue opens nothing"],
    [["Submitted", "Aborted", "Submitted"], -1, "nothing left to do opens nothing"],
    [["Scheduled", "Complete", "Scheduled"], 0,
      "a job done out of order does not release past the one before it"],
  ];
  for (const [statuses, want, what] of cases) {
    const got = openIndexOf(statuses);
    if (got !== want) fail(`${what}: opened ${got}, wanted ${want}`);
  }
}

// 2. Exactly one job is ever released.
//
//    The whole process rests on it. Two released is a queue somebody can
//    work in any order; none released with work outstanding is a van
//    standing still.
{
  const shapes = [
    ["Scheduled", "Scheduled"],
    ["Submitted", "Scheduled"],
    ["Complete", "Aborted", "Scheduled", "Scheduled"],
    ["In Progress", "Scheduled"],
  ];
  for (const statuses of shapes) {
    const open = openIndexOf(statuses);
    const released = statuses.map((_, i) => i === open).filter(Boolean).length;
    if (released !== 1) {
      fail(`${statuses.join(",")} released ${released} job(s), wanted 1`);
    }
  }
  /* And none where there is genuinely nothing outstanding. */
  const done = ["Complete", "Submitted"];
  if (openIndexOf(done) !== -1) fail("a queue with nothing outstanding released a job");
}

// 3. In Progress is not finished.
//
//    It is the state a job is in while it is being worked, so treating
//    it as done would release the next one while somebody is still on
//    site with this one.
{
  if (FINISHED.includes("In Progress")) fail("In Progress counts as finished");
  if (openIndexOf(["In Progress", "Scheduled"]) !== 0) {
    fail("a job in progress does not stay open");
  }
}

// 4. The endpoint takes the caller from the session, not the request.
//
//    A team id in the URL would let anybody with an account read
//    anybody's work — and a tablet is a thing that gets lost.
{
  if (!/withAuth\(async function handler\(req, context, user\)/.test(src)) {
    fail("the queue does not take the signed-in caller");
  }
  if (!/user\?\.email/.test(src)) fail("the queue does not identify the caller by email");
  /* Nothing about the team comes from the request. */
  if (/context\?\.params|req\.url.*[Tt]eam|searchParams/.test(src)) {
    fail("the queue reads a team from the request");
  }
  /* The column the Person table actually has, matched the way the rest
     of the app matches it.

     This first read Work_Email — a column added by a migration that had
     never been applied — because I read the migration rather than the
     two endpoints already answering the same question. So the check now
     asks those endpoints what the column is called, instead of holding
     an opinion of its own. */
  const others = ["connection-photos.js", "av-register.js"]
    .map((f) => readFileSync(`./netlify/functions/${f}`, "utf8"))
    .join("\n");
  const column = others.match(/\.ilike\("([A-Za-z_]+)", email\)/);
  if (!column) fail("nothing else in the app looks a person up by email any more");
  else if (!new RegExp(`ilike\\("${column[1]}", email\\)`).test(src)) {
    fail(`the queue does not match on ${column[1]}, which is what the rest of the app uses`);
  }

  /* Active people only. A leaver keeps their login until an
     administrator gets to it, and the flag is what says they no longer
     work here — a queue is exactly the thing they should stop seeing. */
  if (!/eq\("Is_Active", true\)/.test(src)) {
    fail("a leaver still gets a queue until their login is removed");
  }
}

// 5. Only a leader gets a queue, and only of one team.
{
  /* The flag has to be filtered on, not merely selected: selecting it
     and ignoring it reads the same to a search for the name, and gives
     every member of a team their leader's queue. */
  if (!/filter\(\(m\) => m\.Is_Team_Leader\)/.test(src)) {
    fail("anyone on a team can see its queue");
  }
  if (!/leading\.length > 1/.test(src)) {
    fail("leading two teams is not handled, so the next job would be ambiguous");
  }
  /* Refusals say which of the three it is. "No work today" and "this
     account is not linked to anybody" look identical on a tablet, and
     only one is worth phoning the office about. */
  for (const phrase of ["not linked to anyone", "not set up as a team leader",
    "more than one team"]) {
    if (!src.includes(phrase)) fail(`there is no distinct message for: ${phrase}`);
  }
}

// 6. The waiting jobs give away nothing to work from.
//
//    A queue listing every address is a list somebody can work from in
//    any order, on paper, which is the thing the ordering exists to
//    prevent.
{
  for (const field of ["siteAddress", "plots", "projectId", "apNumber"]) {
    const line = src.split("\n").find((l) => l.trim().startsWith(`${field}:`));
    if (!line) { fail(`the queue no longer returns ${field}`); continue; }
    if (!/released \?/.test(line)) {
      fail(`${field} is sent for jobs that are not released`);
    }
  }
  /* The site name stays, so a waiting job can be seen to exist. */
  const nameLine = src.split("\n").find((l) => l.trim().startsWith("siteName:"));
  if (nameLine && /released \?/.test(nameLine)) {
    fail("a waiting job does not even show which site it is");
  }
}

// 7. Corrections come back outside the queue.
//
//    A returned form's place in the order is behind the team by the time
//    it comes back, so it cannot be a queue position without stopping
//    everything that has moved past it.
{
  if (!/corrections/.test(src)) fail("returned forms are not sent to the tablet");
  if (!/Review_Outcome === "returned"/.test(src)) {
    fail("corrections are not filtered to the ones actually returned");
  }
  /* The latest version only: an old returned version answered by a
     later submission is not outstanding. */
  if (!/latest/.test(src)) {
    fail("every returned version is listed, including ones already answered");
  }
}

// 8. The two new statuses exist and are not closed.
{
  for (const name of ["Submitted", "Aborted"]) {
    if (!sql.includes(`'${name}'`)) fail(`${name} is not added as a status`);
  }
  /* Neither closed: Submitted because the office has not looked, Aborted
     because the work still has to be rescheduled. A closed status drops
     out of the lists that exist to be worked through. */
  const insert = sql.slice(sql.indexOf('INSERT INTO "Call_Off_Status"'));
  const values = insert.slice(0, insert.indexOf("WHERE NOT EXISTS"));
  if (/true/.test(values)) fail("one of the new statuses is marked closed");
}

// 9. A submission is versioned, and a review has an author.
{
  if (!/UNIQUE \("Assignment_ID", "Version"\)/.test(sql)) {
    fail("submissions are not versioned per assignment");
  }
  /* Returned and revisit are separated: they look identical when
     clicked and cost two minutes against a day. */
  for (const outcome of ["approved", "returned", "revisit"]) {
    if (!sql.includes(`'${outcome}'`)) fail(`there is no ${outcome} outcome`);
  }
  if (!/\("Review_Outcome" IS NULL\) = \("Reviewed_At" IS NULL\)/.test(sql)) {
    fail("a review can be recorded with nobody and no time against it");
  }
  /* An assignment is aborted once — a second row would be a second
     reason for one event. */
  if (!/UNIQUE \("Assignment_ID"\)/.test(sql)) {
    fail("an assignment can be aborted twice");
  }
}

/* ── The tablet screen ── */
const app = readFileSync("./src/features/field/FieldApp.jsx", "utf8");
const shell = readFileSync("./src/App.jsx", "utf8");

// 10. Today's run is shown, the rest is behind a tap.
//
//     The whole queue visible invites arguing with the order, and a lock
//     on every one of seven rows makes the app's main message "no". One
//     job alone tells somebody nothing about their day — they cannot see
//     that tomorrow is on a site they will drive past this afternoon.
{
  const FIN = ["Submitted", "Complete", "Aborted"];
  const q = (p, status, startDate, released) => ({ position: p, status, startDate, released: !!released });
  const split = (queue) => {
    const current = queue.find((x) => x.released) ?? null;
    const todays = current
      ? queue.filter((x) => !x.released && !FIN.includes(x.status)
        && x.startDate === current.startDate) : [];
    const later = queue.filter((x) => !x.released && !FIN.includes(x.status)
      && !todays.includes(x));
    return { today: todays.map((x) => x.position), later: later.map((x) => x.position) };
  };

  const week = [q(1, "Scheduled", "2026-08-17", true), q(2, "Scheduled", "2026-08-17"),
    q(3, "Scheduled", "2026-08-19"), q(4, "Scheduled", "2026-08-20")];
  const r = split(week);
  if (r.today.join() !== "2") fail(`today's run came out as ${r.today.join()}`);
  if (r.later.join() !== "3,4") fail(`the rest came out as ${r.later.join()}`);

  /* Anchored on the open job's date, not the actual date. A queue that
     has slipped a day would otherwise show nothing at all, which is the
     moment somebody most needs to see what is next. */
  const slipped = [q(1, "Submitted", "2026-08-17"), q(2, "Aborted", "2026-08-17"),
    q(3, "Scheduled", "2026-08-19", true), q(4, "Scheduled", "2026-08-20")];
  if (split(slipped).later.join() !== "4") {
    fail("a slipped queue does not show what is still to come");
  }
  if (!/q\.startDate === current\.startDate/.test(app)) {
    fail("the screen does not group today's run by the open job's date");
  }
  if (/new Date\(\)[^;]*startDate|startDate === today/.test(app)) {
    fail("the screen groups by the actual date, so a slipped queue shows nothing");
  }
}

// 11. Nothing on screen can be worked from out of order.
//
//     A waiting job shows its task, site and date. The address, plots
//     and AP number are withheld by the endpoint — so a queue cannot be
//     photographed and worked through in whatever order suits.
{
  const waiting = app.slice(app.indexOf("function Waiting"), app.indexOf("function dateText"));
  for (const field of ["siteAddress", "plots", "apNumber"]) {
    if (waiting.includes(field)) fail(`a locked job shows its ${field}`);
  }
  /* And says it is locked in words. A padlock alone reads as an error to
     somebody who has not been told the rule. */
  if (!/Locked/.test(waiting)) fail("a locked job is not said to be locked");
}

// 12. Nothing open is three situations, not one.
//
//     Everything submitted and waiting on the office, and nothing booked
//     at all, mean different things — and only one of them means go
//     home.
{
  if (!/awaitingReview > 0/.test(app)) {
    fail("submitted-and-waiting reads the same as no work at all");
  }
  if (!/No work assigned/.test(app)) fail("an empty queue says nothing");
  /* The endpoint's own refusals are shown as written — they are the ones
     that tell somebody to ring the office. */
  if (!/setError\(e\.message\)/.test(app)) {
    fail("the screen replaces the endpoint's refusals with something general");
  }
}

// 13. The field app is its own surface, always behind a login.
{
  if (!/pathname[^;]*"\/field"/.test(shell)) fail("/field does not reach the field app");
  if (!/field \? <FieldApp \/> : <Shell \/>/.test(shell)) {
    fail("the field app renders inside the office shell");
  }
  /* The sample-data escape lets the office app run with no backend. A
     field queue with no backend is an empty screen either way, and
     leaving the door open on the surface that will be on the most
     devices is not worth the convenience. */
  const gate = shell.slice(shell.indexOf("function Gate()"));
  const body = gate.slice(0, gate.indexOf("\n}"));
  if (body.indexOf("field && !authEnabled") > body.indexOf("if (!authEnabled) return <Shell")) {
    fail("the field app runs without auth when the backend is unconfigured");
  }
}

/* ── Refusing a job ── */
const abort = readFileSync("./netlify/functions/field-abort.js", "utf8");
const reasonsSql = readFileSync("./supabase/migrations/0170_abort_reasons.sql", "utf8");

// 14. Only your own released job can be refused.
//
//     Two rules, and both matter. Without the first, anybody with an
//     account could abort anybody's work by guessing an id. Without the
//     second, a leader could clear four jobs at once and the ordering
//     would be decoration.
{
  /* Scoped where the queue is read, not merely somewhere in the file:
     the update below carries the same text, so a search across the
     whole function passed while the query that finds the job had lost
     its filter — and an unfiltered query finds anybody's job. */
  const query = abort.slice(abort.indexOf('from("Call_Off_Assignment")'));
  if (!/eq\("Team_ID", teamId\)/.test(query.slice(0, 300))) {
    fail("a job belonging to another team can be aborted");
  }
  if (!/That job is not yours/.test(abort)) {
    fail("nothing refuses a job on somebody else's team");
  }
  /* Not found on this team reads the same as not existing — telling
     somebody an id belongs to another team is telling them the ids are
     worth guessing. */
  const abortCode = abort
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  if (/belongs to (another|a different) team/i.test(abortCode)) {
    fail("the refusal says the id exists on another team");
  }

  if (!/Number\(open\?\.Assignment_ID\) !== assignmentId/.test(abort)) {
    fail("a job further down the queue can be aborted");
  }
  if (!/already finished/.test(abort)) {
    fail("a finished job can be aborted again");
  }
  /* And the update is scoped to the team as well as the id, so a race
     cannot write to somebody else's row. */
  const update = abort.slice(abort.indexOf('update({ Status: "Aborted" })'));
  if (!/eq\("Team_ID", teamId\)/.test(update.slice(0, 260))) {
    fail("the status change is not scoped to the caller's team");
  }
}

// 15. The reason is from the list, and the list has rules of its own.
{
  if (!/from\("Field_Abort_Reason"\)/.test(abort)) {
    fail("any reason string is accepted");
  }
  /* Office-only reasons are the office's to give: a gang on a doorstep
     does not discover that a call-off has been withdrawn. */
  if (!/reason\.Office_Only/.test(abort)) {
    fail("an operative can record a reason meant for the office");
  }
  /* "Other" without a note looks like an answer and says nothing. */
  if (!/reason\.Needs_Note && !note/.test(abort)) {
    fail("a reason that needs a note can be given without one");
  }
  /* Enforced on the server, not only on the tablet — a screen is not a
     permission. */
  const list = readFileSync("./netlify/functions/field-reasons.js", "utf8");
  if (!/eq\("Office_Only", false\)/.test(list)) {
    fail("the tablet is offered reasons it is not allowed to use");
  }

  /* The list is a table, so the office can change it without a deploy —
     the same argument 0116 makes about the statuses. */
  if (!/CREATE TABLE IF NOT EXISTS "Field_Abort_Reason"/.test(reasonsSql)) {
    fail("the reasons are not a table");
  }
  if (!/ON UPDATE CASCADE/.test(reasonsSql)) {
    fail("renaming a reason code would orphan the aborts holding it");
  }
  /* At least one reason demands a note, or Needs_Note is decoration. */
  if (!/'other',\s*'Something else',\s*false,\s*true/.test(reasonsSql)) {
    fail("the vaguest reason does not require a note");
  }
}

// 16. It is written as one thing, and says who called it.
{
  /* The reason before the status. A job aborted with no reason is one
     nobody can act on; a reason attached to a job still open is visible
     and the next attempt says so. */
  if (abort.indexOf('from("Field_Abort").insert')
    > abort.indexOf('update({ Status: "Aborted" })')) {
    fail("the job is aborted before the reason is recorded");
  }
  /* A second tap on a slow connection is not an error: the job is in
     the state they asked for. */
  if (!/duplicate key/i.test(abort)) {
    fail("aborting twice reports a failure for something that worked");
  }
  if (!/By_Office: false/.test(abort)) {
    fail("a self-abort is not distinguished from an office one");
  }
  if (!/Aborted_By/.test(abort)) fail("nothing records who refused the job");
}

console.log(bad ? `\n${bad} problem(s)`
  : "The field queue behaves (one job open, today visible, the rest a tap away).");
process.exit(bad ? 1 : 0);
