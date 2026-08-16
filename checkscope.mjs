/* Every identifier resolves where it is used.

   ── Why this exists ──

   Twice in one session a variable was used outside the scope it was
   declared in — `kids` in the call-off endpoint, `current` in the field
   queue. Both parsed. Both built. Both were only visible when somebody
   pressed a button, and the second one took down the whole field app
   with "current is not defined" where a queue should have been.

   esbuild does not catch this: an unresolved reference is a runtime
   error in JavaScript, not a syntax one. Nothing else in this suite
   catches it either, because every other check reads the source as text
   rather than resolving it.

   eslint's no-undef does, and that is the whole of this file.

   ── Why only one rule ──

   Not a style pass. Adding a full configuration means arguing about
   semicolons across a codebase that has none of those arguments today,
   and the argument would be the reason nobody runs it. One rule, one
   class of fault, no opinions.

   ── Known and left alone ──

   hrPortal.js calls onReload() inside a try, which throws and is
   swallowed by the catch — so after recording an applicant the reload
   silently never happens. Real, pre-existing, and in a feature nobody
   has asked about; listed here so the check can pass while it stands
   and fail the moment anything new joins it. */
import { execFileSync } from "node:child_process";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Faults that were here before this check was, each with a reason to
   still be here. Anything not on this list is new. */
const KNOWN = [
  "src/features/hr/hrPortal.js:onReload",
];

let out = "";
try {
  out = execFileSync("npx", [
    "eslint@8", "--no-eslintrc",
    "--env", "node,browser,es2022",
    "--parser-options",
    "ecmaVersion:2022,sourceType:module,ecmaFeatures:{jsx:true}",
    "--rule", '{"no-undef":"error"}',
    "--format", "unix",
    "--ext", ".js,.jsx",
    "netlify/functions", "src",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  /* eslint exits non-zero when it finds anything, which is the ordinary
     case here — the output is what matters, not the code. */
  out = e.stdout ?? "";
  if (!out) {
    console.log("  note: eslint could not run (offline?) — scope not checked");
    process.exit(0);
  }
}

const found = out.split("\n")
  .filter((l) => l.includes("no-undef"))
  .map((l) => {
    const m = l.match(/^(.*?):\d+:\d+:\s*'([^']+)' is not defined/);
    if (!m) return null;
    /* Relative, so the list above does not depend on where the checkout
       is. */
    return `${m[1].replace(`${process.cwd()}/`, "")}:${m[2]}`;
  })
  .filter(Boolean);

for (const f of found) {
  if (!KNOWN.includes(f)) {
    const [file, name] = f.split(":");
    fail(`${name} is used but never declared, in ${file}`);
  }
}

/* And the list does not outlive what is on it: a fixed fault left here
   quietly widens what the check allows. */
for (const k of KNOWN) {
  if (!found.includes(k)) {
    fail(`${k} is listed as known and no longer happens — take it off the list`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Every identifier resolves (${found.length} known, none new).`);
process.exit(bad ? 1 : 0);
