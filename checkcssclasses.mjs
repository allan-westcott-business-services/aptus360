/* A class name used in JSX, with no rule anywhere to style it.

   ── The fault ──

   "In the style editor, some of the fields are cramped together."

   Six classes had shipped with no rules at all — `gs-subject`,
   `gs-subject-h`, `gs-subject-d`, `gs-tabs`, `gs-tab`, `gs-nodef`. The
   header and the tab row fell back to the browser's own margins and ran
   into each other and into the form below. Nothing threw, the build
   passed, and the whole suite passed: `checkcss` asserts that a
   stylesheet is not EMPTY, which is a different question, and a
   rendered check can drive a control it cannot see the shape of.

   It is an easy one to make. The markup is written first and the
   stylesheet is a template literal four hundred lines below it, so the
   class exists, reads plausibly, and does nothing.

   ── How this asks it ──

   Per file, and only about that file's own prefixes. A component whose
   stylesheet defines `.gs-item` owns the `gs-` prefix, so every `gs-`
   class in its markup must be defined somewhere. Classes from the
   shared stylesheet — `fld`, `btn`, `hint`, `panel-label` — have no
   prefix defined here and are left alone, which is what keeps this from
   being a wall of false positives.

   Run: node checkcssclasses.mjs */

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Every rule in the project's stylesheets, wherever it lives: a
   component may use a class another file defines, and a prefix owned in
   one place is owned everywhere. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk("src");
if (files.length < 100) fail(`only ${files.length} source files found — wrong directory?`);

/* A class is DEFINED by a selector mentioning it. Matched loosely on
   purpose: `.gs-tab.on`, `.gs-tab:hover` and `.gs-detail .gs-tab` all
   define `gs-tab`, and a stricter reading would report them missing. */
const defined = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\.([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b/gi)) {
    defined.add(m[1]);
  }
}

/* Which prefixes a stylesheet in this project owns. A prefix is owned
   once two or more classes carry it: one could be a coincidence in
   prose, two is a naming scheme. */
const prefixCount = new Map();
for (const c of defined) {
  const p = c.slice(0, c.indexOf("-"));
  prefixCount.set(p, (prefixCount.get(p) ?? 0) + 1);
}
const owned = new Set([...prefixCount].filter(([, n]) => n >= 2).map(([p]) => p));
if (!owned.has("gs")) fail("the styles screen's own prefix is not recognised as one");

/* ── The ones that were already there ──

   Found by this check the day it was written: twenty-four class names
   in twenty-one files with no rule anywhere. Every one is on a plain
   wrapper `<div>`, where no rule means no styling rather than broken
   styling, so none of them is a fault to fix in a change about the
   spacing on one screen. They are listed rather than ignored, because a
   check that quietly tolerates a category stops testing it.

   One of them is worth somebody's attention and is not this change's to
   take: **`admin-pane` is almost certainly a typo for `admin-panel`**,
   which AdminPage uses and which IS styled. Four admin screens carry
   the misspelling and have been unstyled panels ever since.

   A name removed from here must be either styled or dropped from the
   markup. Adding one needs the same justification as these: that the
   element is a bare wrapper and wants no styling at all. */
const ALREADY_THERE = new Set([
  "admin-pane",     // a typo for admin-panel — see above
  "admin-wait", "gs-insp", "tm-detail", "ph-head", "asg-day-lbl", "asg-saved",
  /* "modal-back" was here until Human Resources was removed. It is used
     by the canvas and styled nowhere, but it was only ever VISIBLE to
     this check because hrStyles.js defined .modal-md, .modal-overlay,
     .modal-sm and .modal-tab, and that is what gave the `modal-` prefix
     an owner. With HR gone nothing owns the prefix, the class stopped
     being checked, and the entry went stale — which this check refuses,
     rightly, because a stale entry hides the next real one. */
  "pts-btn", "jf-narrow", "jf-pcat", "cpick-name", "cpick-sub",
  "fe-err", "ap-block", "ap-opts", "detail-body", "scope-group", "w-btn",
  "vy-table",
]);

let checked = 0;
const missing = new Map();

for (const f of files) {
  if (!/\.jsx?$/.test(f)) continue;
  const src = readFileSync(f, "utf8");

  /* Only className strings. A class named in a comment, or built at run
     time from a variable, is not something this can or should judge. */
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{"([^"]*)"\})/g)) {
    for (const cls of (m[1] ?? m[2] ?? "").split(/\s+/).filter(Boolean)) {
      const dash = cls.indexOf("-");
      if (dash < 0) continue;                       // no prefix to own it
      if (!owned.has(cls.slice(0, dash))) continue; // somebody else's
      checked += 1;
      if (!defined.has(cls)) {
        if (!missing.has(f)) missing.set(f, new Set());
        missing.get(f).add(cls);
      }
    }
  }

  /* The same question of a className built by a ternary or a join,
     which is how half of them are written here. The strings inside are
     class names all the same. */
  for (const m of src.matchAll(/className=\{([\s\S]{0,400}?)\}/g)) {
    for (const lit of m[1].matchAll(/"([a-z][a-z0-9]*(?:-[a-z0-9]+)+(?:\s+[a-z0-9-]+)*)"/gi)) {
      for (const cls of lit[1].split(/\s+/).filter(Boolean)) {
        const dash = cls.indexOf("-");
        if (dash < 0) continue;
        if (!owned.has(cls.slice(0, dash))) continue;
        checked += 1;
        if (!defined.has(cls)) {
          if (!missing.has(f)) missing.set(f, new Set());
          missing.get(f).add(cls);
        }
      }
    }
  }
}

/* ── Collected first, judged second ──

   Everything with no rule goes into `missing`, the known ones included,
   and the split happens here. That is what makes the predicate test
   itself: break it and the grandfathered names stop being FOUND, which
   the loop below turns into twenty failures rather than a silent green.
   Filtering them out at the point of collection hid exactly that — a
   mutation replacing the test with `if (false)` passed. */
const known = new Set([...missing.values()].flatMap((set) => [...set]));

for (const [f, set] of missing) {
  const fresh = [...set].filter((c) => !ALREADY_THERE.has(c)).sort();
  if (!fresh.length) continue;
  fail(`${f} uses ${fresh.map((c) => `.${c}`).join(", ")} — `
    + `no rule anywhere styles ${fresh.length > 1 ? "them" : "it"}, so the markup `
    + `falls back to the browser's own margins`);
}

/* And a grandfathered name that is no longer found unstyled has been
   styled or dropped, and must leave the list — otherwise it grows into
   a place a real fault can hide behind an old entry. */
for (const c of ALREADY_THERE) {
  if (!known.has(c)) {
    fail(`.${c} is on the already-there list and is not found unstyled — `
      + `style it and drop it from the list, or it hides the next one`);
  }
}

if (!checked) fail("no prefixed class names were checked — did the parser break?");

console.log(bad ? `\n${bad} problem(s)`
  : `Every one of the ${checked} prefixed class names in the markup has a rule.`);
process.exit(bad ? 1 : 0);
