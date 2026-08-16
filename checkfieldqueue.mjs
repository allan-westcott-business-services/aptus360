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
  /* The work email, not the personal one: the login is a work account
     and a private address is not a credential. */
  if (!/Work_Email/.test(src)) fail("the queue does not match on the work email");
  if (/Personal_Email/.test(src)) fail("the queue accepts a personal email as a login");
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

console.log(bad ? `\n${bad} problem(s)`
  : "The field queue behaves (one job open, released by submit or abort).");
process.exit(bad ? 1 : 0);
