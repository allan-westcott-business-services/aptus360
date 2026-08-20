/* The jointing work instruction, as it is asked on site.

   ── Why this is its own module ──

   The generic instruction in WorkInstruction.jsx asks four sections
   about a dig. A jointing visit is a different job and a different
   record: a checklist marked off task by task, and a row per plot
   carrying its termination, its outcome and its test results. Answering
   "length dug" against a jointing visit is not a smaller version of
   this — it is the wrong question.

   Kept as data rather than markup so the shape can be checked without
   a browser, and so the office reading a submitted payload and the
   tablet writing it are reading one definition.

   ── One document, no picker ──

   The original app offered a Document Template dropdown on the
   assignment, backed by a Jointing_Document_Template table. There is
   none here: this is the document for an Electric Service call-off,
   always. A dropdown with one entry is a question with one answer.

   The original's two templates differed in exactly one field — the
   three-phase one adds Phase (L1/L2/L3) to the per-plot tests. That is
   carried here as a field on the plot row rather than as a second
   template, so a three-phase service is recorded by filling it in and a
   single-phase one by leaving it blank. See the note on TESTS.

   ── What is deliberately not here yet ──

   Photographs, the drawn signature and the joint location sketch. All
   three need a canvas and somewhere to put an image, which is the same
   piece of work, and it follows this one. The declaration below is the
   tap the existing form already uses; it is not a signature and does
   not pretend to be. */

/* The checklist, marked C / I / NR against each task.

   Complete, Incomplete, Not Required. Left blank until the gang marks
   it, because an unanswered task and a task marked Not Required are
   different facts and defaulting one to the other would put something
   untrue in the record.

   Word for word from the original form. These are the tasks the
   business checks against, and paraphrasing them here would mean two
   wordings of one instruction. */
export const CHECKLIST = [
  "Check Outside Viewing Cabinets fitted securely",
  "Fix Pre Assembled meter board(s) \u2014 [ includes cut out ]",
  "Complete IR Test and Continuity Test on Service Cables and document",
  "Insert 100A fuses (80A fuses if apartments)",
  "Check Loop Impedance and Polarity and document \u2014 apply seals",
  "Complete dimensions for joints terminations",
];

/* The three marks, and nothing else. Blank is the fourth state and
   means "not yet". */
export const MARKS = ["C", "I", "NR"];

/* What happened at a plot.

   Independent per plot: a gang can complete four and abort the fifth
   because a meter box was not fitted, and one outcome for the visit
   would lose which. Dead Jointed is its own answer rather than a note
   on Completed — the joint is made and the service is not live, and
   the difference is what the next visit is for. */
export const OUTCOMES = ["Completed", "Aborted", "Dead Jointed"];

/* The tests recorded against each plot.

   Phase is asked of every plot rather than switched on by a template.
   The original had two documents differing only in whether this field
   appeared, which meant the office had to know the phasing before the
   gang arrived — and a single-phase service booked as three-phase
   showed a field nobody could answer, while the reverse hid one they
   needed. Left blank it says single phase, which is what a blank there
   has always meant on paper.

   `unit` is part of the label rather than a suffix drawn beside it: a
   number recorded without its unit is the fault this form exists to
   stop, and a unit that lives in the layout is one an export can
   lose. */
export const TESTS = [
  { key: "ir", label: "IR Test (M\u03a9)", type: "number" },
  { key: "eli", label: "ELI Test (\u03a9)", type: "number" },
  { key: "polarity", label: "Polarity", type: "choice", options: ["999", "N/A"] },
  { key: "phase", label: "Phase", type: "choice", options: ["", "L1", "L2", "L3"] },
  { key: "voltage", label: "Voltage (V)", type: "number" },
];

/* The job details the office already knows.

   Read-only on the tablet. Every one of these is on the call-off
   already, and asking a gang to retype what the office holds is how a
   plot number gets transposed on the one document that carries the
   test results.

   Network Owner / Ref, the Aptus and site contacts and the issue dates
   are deliberately absent: they are office-entered fields on the
   original and are being left until the office side is built. A field
   shown here with nothing behind it reads as something the gang forgot
   to fill in. */
export const JOB_FIELDS = [
  { key: "apNumber", label: "Aptus Job No" },
  { key: "siteName", label: "Project / Site" },
  { key: "siteAddress", label: "Address" },
  { key: "startDate", label: "Date Required" },
];

/* Whether this job takes the jointing form.

   Read off the phase the assignment is booked against, which is the
   only thing that says what the visit is for. Not off the call-off's
   work type: a service call-off has jointing and energisation on it,
   and the energisation visit is not a jointing visit.

   Matched on the task type's name, as everything else that has to
   recognise a phase does — there is no flag saying "this is the
   jointing one". */
export function isJointingJob(job) {
  return /joint/i.test(String(job?.task || ""));
}

/* The plots on this job, in order.

   `Plot_Range` is the stored form — "18-22, 35" — and the field queue
   hands it over as it is. Parsed here rather than by the caller so the
   form and the check agree on what "18-22, 35" means.

   Deliberately tolerant. A range nobody can parse yields an empty list
   and the form says so, rather than throwing and leaving a gang on a
   road with a blank screen. */
export function plotsOf(range) {
  const out = [];
  const seen = new Set();
  for (const part of String(range || "").split(",")) {
    const s = part.trim();
    if (!s) continue;
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(s);
    if (m) {
      const from = Number(m[1]);
      const to = Number(m[2]);
      /* Written backwards is still a range. Refusing it would lose four
         plots over a typo nobody can correct from site. */
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      /* A guard, not a limit anybody will meet: "1-99999" typed by
         accident must not make a hundred thousand rows. */
      if (hi - lo > 500) continue;
      for (let n = lo; n <= hi; n++) {
        if (!seen.has(String(n))) { seen.add(String(n)); out.push(String(n)); }
      }
      continue;
    }
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

/* The breech joints on this plot's route back to the origin.

   Traced when the call-off was raised and carried on the job — the gang
   does not work them out on site, and could not: the route from a plot
   back to the substation or POC is whatever the network tracing says,
   and on an estate it is not the route anybody would pick by eye.

   Matched on the plot number as printed, because that is what both
   sides have: the queue sends the number the drawing carries and the
   form is drawing rows keyed on it. Loose equality on the string form,
   since "12" from a range and 12 from a plot record are the same plot.

   An empty list where the run is clear. A plot with no breech on the
   way is the ordinary case and shows nothing rather than an empty
   heading. */
export function breechesFor(job, plot) {
  const rows = job?.breech?.plots;
  if (!Array.isArray(rows)) return [];
  const want = String(plot);
  const hit = rows.find((r) => String(r.plot) === want);
  return Array.isArray(hit?.joints) ? hit.joints : [];
}

/* Whether the trace could not reach this plot at all.

   Worth saying loudly on the form. A plot with no route back to the
   origin is a fault in the drawing, and the gang standing at it is the
   first person in a position to notice — but only if the form admits
   the route was never found, rather than showing it as a plot with no
   joints, which is what a clear run looks like. */
export function routeUnknownFor(job, plot) {
  const rows = job?.breech?.plots;
  if (!Array.isArray(rows)) return false;
  const hit = rows.find((r) => String(r.plot) === String(plot));
  return !!hit && hit.reachable === false;
}

/* What a joint is called on the form.

   "Breech Joint at Node A5". The node is how the drawing, the levels
   check and the call-off all name that place, so it is how a gang finds
   it — a breech joint is placed exactly where a span node is, because
   both mark the same event on the network: the point the feeder
   divides. "Breech joint 4812" is a database id and means nothing to
   anybody standing in a hole.

   ── When there is no node ──

   Said, not papered over. A breech with no span node on it means Place
   Span Nodes has not been run since the joint went in — so the levels
   check is not measuring to it either, and the omission is worth more
   than the name. Falling back to a database id would hide that behind a
   number nobody can act on.

   The drawing's own label is used where it has one, since that is what
   is printed on the plan they are holding. */
export function jointLabel(j) {
  if (j?.node) return `Breech Joint at Node ${j.node}`;
  if (j?.label) return `Breech Joint ${j.label} — not on a node`;
  return "Breech Joint — not on a node";
}

/* An empty answer set for a plot, so a row that has been opened and not
   filled in is distinguishable from one never reached. */
export const emptyPlot = () => ({
  cutout: "",
  outcome: "",
  ...Object.fromEntries(TESTS.map((t) => [t.key, ""])),
});

/* What has to be answered before it can be sent.

   Every plot needs an outcome, and the declaration has to be made.
   Nothing else — a longer list guessed at here is a list somebody types
   anything into at five o'clock to get home, and then the record says
   something untrue rather than nothing.

   The checklist is not required. A task left blank is a task nobody got
   to, which is a real answer and one the office would rather see than
   six C's entered to make a button light up. */
export function missingFrom(payload = {}, plots = []) {
  const out = [];
  for (const p of plots) {
    if (!payload?.plots?.[p]?.outcome) out.push(`Outcome for plot ${p}`);
  }
  if (!payload?.declaration) out.push("The declaration");
  return out;
}
