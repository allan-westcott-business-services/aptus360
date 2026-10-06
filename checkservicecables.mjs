/* ── A drawing's service cables must actually be on it ──
 *
 *   node checkservicecables.mjs                  # the fixtures
 *   node checkservicecables.mjs path/to/drawing.json   # any export
 *
 * ── Why this exists ──
 *
 * Drawing 35, 6 Oct, after a day's work: 10 LV mains correctly routed
 * POC -> link box -> network, 41 service trenches, 47 joints, 41 plot
 * meters, and ZERO service cables. All 47 joints named Joint_Cables ids
 * that were not on the drawing. All 41 meters connected to no cable.
 *
 * Nothing in the suite could see it. Every service check — autoservice,
 * servicejoint, servicejoints, servicetee, servicemoved, servicesizes,
 * servicetail — works on the pure planner's return value or on a
 * fixture that already contains the cable. Not one asserts that a cable
 * ROW exists on a saved drawing, or that a joint's Joint_Cables resolve
 * to anything. The build was judged on what it planned, never on what
 * survived.
 *
 * The cause was one word: the duplicate-trench sweep in Auto Service
 * iterated `mine` (every line stamped to the seed — trenches AND
 * cables) while keeping one id out of `drawn` (trenches only), so every
 * cable on the plot went into `copies` and was deleted. Section 3 below
 * holds that line still.
 *
 * It then hid, which is the part worth guarding against for good:
 * isServed() returns true the moment any trench is stamped to the seed
 * and never looks at the cables, so a stripped plot reports "already
 * has a service trench" and the next run lays nothing. A drawing can
 * sit in that state indefinitely looking finished.
 *
 * These are invariants about a FINISHED drawing, so a drawing that is
 * part-built fails them honestly. That is the point: the figures say
 * which part.
 */

import { readFileSync, existsSync } from "node:fs";

let pass = 0;
const fails = [];
const notes = [];
function ok(name, cond, extra = "") {
  if (cond) { pass++; return; }
  fails.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

/* ── 1. The invariants, against any drawing ─────────────────────────── */

const isLine = (f) => f.Feature_Type === "line";
const typeOf = (f) => String(f.Attributes?.Line_Type ?? "");
const isTrench = (f) => isLine(f) && /^trench_/.test(typeOf(f));
const isServiceCable = (f) => isLine(f) && /_service$/.test(typeOf(f)) && !isTrench(f);
const isMain = (f) => isLine(f) && /_main$/.test(typeOf(f)) && !isTrench(f);

export function auditDrawing(features) {
  const ids = new Set(features.map((f) => Number(f.Feature_ID)));
  const joints = features.filter((f) => f.Feature_Role === "joint");
  const meters = features.filter((f) => f.Feature_Role === "meter");
  const serviceTrenches = features.filter((f) => isTrench(f) && /_service$/.test(typeOf(f)));

  /* Every id a joint names must be on the drawing. This is the one that
     catches a deletion after the fact: the ids stay in the joint, so a
     dangling one is proof the cable was written and then removed. */
  const danglingJointCables = [];
  for (const j of joints) {
    for (const c of j.Attributes?.Joint_Cables ?? []) {
      if (!ids.has(Number(c))) danglingJointCables.push({ joint: Number(j.Feature_ID), cable: Number(c) });
    }
  }

  /* Likewise anything else pointing at a feature that is gone. Connects
     is rebuilt on every run, so a dangling entry there is a different
     and lesser problem — reported separately rather than mixed in. */
  const danglingConnects = [];
  for (const f of features) {
    for (const c of f.Attributes?.Connects ?? []) {
      if (!ids.has(Number(c))) danglingConnects.push({ from: Number(f.Feature_ID), to: Number(c) });
    }
  }

  /* A meter no cable names is not fed. Checked through Connects rather
     than by distance: a cable running past a meter is not the same as
     one serving it.

     ── Read from the CABLE's side ──

     The first version of this read the meter's own Connects, and the
     healthy fixture failed it on all 84 meters: in drawing-2202-043
     every meter's Connects is [] and the cable carries the link —
     cable 44416 names meter 44306, not the other way about. A test
     that a known-good drawing fails is measuring the wrong thing, and
     it would have made this whole file worthless the moment it was
     green on drawing 35's successor.

     Both directions are accepted because the two drawings disagree:
     35's meters do carry Connects (to their trenches), the fixture's
     do not. Whichever end holds the link, a cable naming the meter or
     a meter naming a cable both mean fed. */
  const feedsOf = new Map();          // meter id -> cable ids
  for (const f of features) {
    if (!isServiceCable(f) && !isMain(f)) continue;
    for (const c of f.Attributes?.Connects ?? []) {
      if (!feedsOf.has(Number(c))) feedsOf.set(Number(c), []);
      feedsOf.get(Number(c)).push(Number(f.Feature_ID));
    }
  }
  const unfedMeters = meters.filter((m) => {
    if (feedsOf.has(Number(m.Feature_ID))) return false;
    const cs = (m.Attributes?.Connects ?? []).map(Number);
    return !cs.some((id) => {
      const f = features.find((x) => Number(x.Feature_ID) === id);
      return f && (isServiceCable(f) || isMain(f));
    });
  });

  /* A service trench with nothing laid in it. Matched on the trench's
     own id appearing in a cable's Connects, which is how the lay
     routine links the two. */
  const emptyServiceTrenches = serviceTrenches.filter((t) => {
    const tid = Number(t.Feature_ID);
    return !features.some((f) => isServiceCable(f)
      && (f.Attributes?.Connects ?? []).map(Number).includes(tid));
  });

  return {
    features: features.length,
    mains: features.filter(isMain).length,
    serviceCables: features.filter(isServiceCable).length,
    serviceTrenches: serviceTrenches.length,
    joints: joints.length,
    serviceJoints: joints.filter((j) => /service/i.test(String(j.Label ?? ""))
      || String(j.Attributes?.Joint_Type ?? "") === "service").length,
    meters: meters.length,
    danglingJointCables,
    danglingConnects,
    unfedMeters: unfedMeters.map((m) => m.Label ?? m.Feature_ID),
    emptyServiceTrenches: emptyServiceTrenches.map((t) => t.Label ?? t.Feature_ID),
  };
}

/* ── 2. Run it ──────────────────────────────────────────────────────── */

const arg = process.argv[2];
const targets = arg
  ? [arg]
  : ["fixtures/drawing-2202-043.json"].filter((p) => existsSync(p));

for (const path of targets) {
  if (!existsSync(path)) { fails.push(`${path} — no such file`); continue; }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const features = raw.features ?? raw;
  const a = auditDrawing(features);

  notes.push(`${path}
    ${a.features} features — ${a.mains} main(s), ${a.serviceCables} service cable(s), `
    + `${a.serviceTrenches} service trench(es), ${a.joints} joint(s) `
    + `(${a.serviceJoints} service), ${a.meters} meter(s)`);

  ok(`${path}: no joint names a cable that is not on the drawing`,
     a.danglingJointCables.length === 0,
     a.danglingJointCables.length
       ? `${a.danglingJointCables.length} dangling: `
         + a.danglingJointCables.slice(0, 5)
             .map((d) => `joint ${d.joint} -> cable ${d.cable}`).join(", ")
         + (a.danglingJointCables.length > 5 ? " ..." : "")
       : "");

  /* A drawing with service joints must have cables for them to hold.
     Stated as a floor rather than an equality: one cable can pass
     through more than one joint, and a bottle end holds one cable. */
  ok(`${path}: service joints have cables to hold`,
     a.serviceJoints === 0 || a.serviceCables > 0,
     `${a.serviceJoints} service joint(s) and ${a.serviceCables} service cable(s)`);

  ok(`${path}: every meter is fed by a cable`,
     a.unfedMeters.length === 0,
     a.unfedMeters.length
       ? `${a.unfedMeters.length} unfed: ${a.unfedMeters.slice(0, 6).join(", ")}`
         + (a.unfedMeters.length > 6 ? " ..." : "")
       : "");

  ok(`${path}: no service trench is empty`,
     a.emptyServiceTrenches.length === 0,
     a.emptyServiceTrenches.length
       ? `${a.emptyServiceTrenches.length} dug with nothing in: `
         + a.emptyServiceTrenches.slice(0, 4).join(", ")
         + (a.emptyServiceTrenches.length > 4 ? " ..." : "")
       : "");
}

/* ── 3. The line that caused it ─────────────────────────────────────── */
//
// The sweep is inline in a 24,000-line component and cannot be imported,
// so this reads it. Narrow on purpose: it asserts the shape of the one
// statement, because that is what was wrong.

const src = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const sweep = /const keep = Number\(drawn\[rightOne\]\.Feature_ID\);([\s\S]{0,400}?)\n\s*\}\n/.exec(src);

ok("the duplicate-trench sweep is still in GISCanvasPage.jsx", Boolean(sweep),
   "the regex no longer finds it — if the sweep moved, move this check with it");

if (sweep) {
  const body = sweep[1];
  ok("the sweep iterates `drawn` (the trenches), not `mine` (every stamped line)",
     /for \(const \w+ of drawn\)/.test(body) && !/for \(const \w+ of mine\)/.test(body),
     `body was: ${body.replace(/\s+/g, " ").trim().slice(0, 120)}`);
  ok("and it still keeps one of them",
     /!==\s*keep/.test(body));
}

/* isServed is what let it hide. Not changed — it is load-bearing for
   deciding a re-lay — but pinned, so anyone making a plot's served-ness
   depend on cables has to come past this comment and read the above. */
const served = readFileSync("./src/features/gis/autoService.js", "utf8");
ok("isServed still judges by trench alone (the blind spot, recorded not fixed)",
   /export function isServed[\s\S]{0,900}?Seed_Feature_ID\) === sid\) return true;/.test(served),
   "if this changed, re-read checkservicecables.mjs — the hiding mechanism moved");

/* ── Result ─────────────────────────────────────────────────────────── */
for (const n of notes) console.log(n);
if (fails.length) {
  console.log(`\n${fails.length} problem(s), ${pass} passed\n`);
  for (const f of fails) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
console.log(`\nService cables behave (${pass} checks): every joint's cable is on the `
  + `drawing, every meter is fed, no trench dug for nothing.\n`);
