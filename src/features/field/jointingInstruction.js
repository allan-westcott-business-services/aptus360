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

/* The office's parser, not a second one. See bookedJointsOf. */
import { parseNodes } from "../calloffs/assignments.js";

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
/* The job details, as the paper form lays them out.

   Two columns, read down: the left is the job, the right is who to ring
   about it. Network Owner / Ref and both contact pairs sit on one line
   as a wide box and a narrow one, which is how they are printed.

   `wide` is the pair — the second field rides beside the first at half
   its width. `office` marks the ones the office fills in before the
   pack is issued; the tablet shows them and does not let a gang change
   them, because they are what the office holds and retyping them on
   site is how a job number gets transposed onto the one document that
   carries the test results. */
export const JOB_FIELDS = [
  { key: "developer", label: "Developer", office: true },
  { key: "address", label: "Project Title / Address", office: true },
  { key: "jobNo", label: "Aptus Job No", office: true },
  {
    key: "networkOwner",
    label: "Network Owner / Network Ref",
    office: true,
    wide: { key: "networkRef", placeholder: "Network Ref" },
  },
  { key: "plots", label: "Plot Number(s)", office: true },
  {
    key: "aptusContact",
    label: "Aptus Contact / Tel",
    office: true,
    wide: { key: "aptusTel", placeholder: "Tel No." },
  },
  { key: "dateRequired", label: "Date Required", type: "date", office: true },
  {
    key: "siteContact",
    label: "Site Contact / Tel",
    office: true,
    wide: { key: "siteTel", placeholder: "Tel No." },
  },
];

/* What a cut out is unless somebody says otherwise. The overwhelming
   majority of services, and typed identically onto every sheet before
   this was prefilled. */
export const DEFAULT_CUTOUT = "2c x 35 sq mm CNE";

/* The three photographs asked for at every joint.

   By purpose rather than a single pile: the office looking at a
   remedial claim wants the remedial shots, and "photo 7 of 19" is not
   an answer. */
export const PHOTO_KINDS = [
  { key: "joint", label: "Joint" },
  { key: "cutout", label: "Cut Out" },
  { key: "remedial", label: "Remedial" },
];

/* The marks a checklist task carries. Blank is the fourth state and
   means "not reached", which is a real answer. */
export const CINR = ["", "C", "I", "NR"];

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

/* ── The joints this team is booked to make ──

   Different from breechesFor above, and both belong on the form.

   breechesFor answers "what is on the way back from plot 22" — traced
   from the drawing when the call-off was raised, listed under the plot
   it serves. bookedJointsOf answers "what is this gang here to do",
   which is what the office put on the booking. A jointing visit can be
   booked the joints and no plots at all, and on that visit the per-plot
   lists are empty and the whole section vanished.

   Parsed with parseNodes — the same function the call-off page writes
   the range with. Not a copy: three screens now agree on what "A1, A2"
   means because they all ask one function, and the day a node is called
   "1-3" a second parser would turn one joint into three.

   Where the drawing knows the joint, its traced entry is used, so the
   label reads the same on the instruction as on the call-off. Where it
   does not — a joint booked by hand, or a drawing redrawn since — the
   node name still shows rather than the line being dropped. */
export function bookedJointsOf(job) {
  const names = parseNodes(job?.nodeRange);
  if (!names.length) return [];

  const traced = new Map();
  for (const j of job?.breech?.joints || []) {
    if (j?.node != null) traced.set(String(j.node), j);
  }

  return names.map((n) => traced.get(String(n))
    /* A stable key for the tick box. Not the bare name: the payload is
       keyed by featureId everywhere else, and a joint that later gains
       a feature would otherwise be ticked twice under two keys. */
    ?? { featureId: `node:${n}`, node: n, label: null, jointType: null });
}

/* ── Every breech joint on this visit, one entry each ──

   Listed in its own right, the way the plots are. A breech joint is a
   hole in the ground with a gang in it: it has a from spec, a to spec,
   an outcome and a sketch, and nesting it under a plot made it read as
   a detail of that plot. It is not — one joint commonly feeds several,
   and the same joint appearing under three plots is one connection
   drawn three times.

   ── Where they come from ──

   Two sources, and the booking wins. The office books joints onto the
   assignment by node (A1, A2); the drawing separately traced what lies
   on the way back from each plot when the call-off was raised. Where
   the office has booked, that is the job. Where it has not, the traced
   joints are shown so a gang is not sent out blind on a call-off raised
   before joints were bookable.

   Deduplicated on the node, because the two sources describe the same
   holes and listing A1 twice is how a joint gets dug twice. */
export function breechJointsOf(job) {
  const booked = bookedJointsOf(job);
  if (booked.length) return booked;

  const traced = (job?.breech?.joints || []).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const j of traced) {
    const k = j.node != null ? `node:${j.node}` : `id:${j.featureId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(j);
  }
  return out;
}

/* A stable key for a joint's answers and its sketch.

   featureId where the drawing knows it, the node name where it does
   not. Not the position in the list: a joint added or removed would
   shuffle every sketch after it onto the wrong hole. */
export const jointKey = (j) =>
  `breech:${j?.featureId ?? j?.node ?? "unknown"}`;
export const plotKey = (plot) => `plot:${plot}`;

/* ── Everything that needs a sketch ──

   A sketch each, for the plot joints and the breech joints alike. Both
   are joints somebody has to find again — the difference is what is in
   the hole, not whether its location matters.

   One list rather than two, so the sketch page can be a straight map
   over it and the count on the tab is the count of holes on the job. */
export function sketchTargets(job) {
  const out = plotsOf(job?.plots).map((p) => ({
    key: plotKey(p),
    kind: "plot",
    title: `Plot ${p}`,
    subtitle: "Service joint and cut out",
  }));

  for (const j of breechJointsOf(job)) {
    out.push({
      key: jointKey(j),
      kind: "breech",
      title: jointLabelOf(j),
      subtitle: j.plots?.length
        ? `Serves plot${j.plots.length === 1 ? "" : "s"} ${j.plots.join(", ")}`
        : "Breech joint",
    });
  }
  return out;
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

   Imported rather than written again. Three screens show these joints
   now — the call-off dialog before raising, the call-off page after,
   and this form — and three spellings of one name is the fault this
   repo keeps finding. Re-exported so the form's own importers are not
   made to know where it lives. */
export { jointLabel } from "../gis/serviceBreech.js";

/* The same function, bound locally so this module can call it too. A
   bare re-export is not in scope in the file that writes it. */
import { jointLabel as jointLabelOf } from "../gis/serviceBreech.js";

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
export function missingFrom(payload = {}, plots = [], job = null) {
  const out = [];
  for (const p of plots) {
    if (!payload?.plots?.[p]?.outcome) out.push(`Outcome for plot ${p}`);
  }

  /* Each breech joint answered in its own right. A joint left blank is
     a hole nobody has said anything about, and it is the one the office
     is asked about six weeks later. */
  for (const j of breechJointsOf(job)) {
    const a = payload?.breech?.[jointKey(j)];
    if (!a?.done) out.push(`Completion for ${jointLabelOf(j)}`);
  }

  if (!payload?.declaration) out.push("The declaration");
  return out;
}
