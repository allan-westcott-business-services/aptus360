/* Runs every check and reports all of them.

   ── What this replaces ──

   `npm test` was eighty-three `node checkX.mjs` calls chained with `&&`
   inside a JSON string. Two things were wrong with that, and both had
   already cost a session each.

   **It stopped at the first failure.** Sixty checks after the first
   red one never ran, and nothing said so. A run that died on step
   twenty looked exactly like a run that died on step eighty-three: one
   error, then the shell prompt. Knowing whether a change broke one
   thing or forty meant running the scripts by hand, which the handover
   told people to do.

   Worse, a *crash* is indistinguishable from a *failure* in an `&&`
   chain. checkprojecttabs.mjs read a migration that is not in the repo
   and threw ENOENT on load; the suite reported a missing-file error and
   stopped. That read as one broken script, and it went unnoticed long
   enough for the handover to record that `npm test` "does not currently
   run" as a standing fact about the repo.

   **The list was hand-kept.** A script on disk and not in the chain
   never runs, and nothing notices — which is the same fault as the
   `ALL_VIEWS` array the README describes, a second place to remember
   something. checklazy.mjs was in the chain and not on disk for weeks.

   So the list is derived from the folder here, and anything deliberately
   left out has to say why, below.

   ── Usage ──

     node checkall.mjs              every .mjs check
     node checkall.mjs --py         those, plus the Python source checks
     node checkall.mjs --only span  only checks whose name contains "span"
     node checkall.mjs --quiet      one line per check, output only on failure

   Exits non-zero if anything failed, so it still works as a gate. */
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";

/* Not suite checks. Each needs a reason: an empty exclusion list is the
   honest default, and a name parked here without one is how a check
   stops running and nobody remembers agreeing to it. */
const NOT_A_SUITE_CHECK = {
  "checkseedlive.mjs":
    "a diagnostic — takes a drawing JSON and a Feature_ID and reports why "
    + "a seed cascade rejected something. Nothing to assert without an argument.",
};

const args = process.argv.slice(2);
const withPy = args.includes("--py");
const quiet = args.includes("--quiet");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const here = readdirSync(".");
const mjs = here.filter((f) => /^check.*\.mjs$/.test(f))
  .filter((f) => f !== "checkall.mjs")
  .filter((f) => !NOT_A_SUITE_CHECK[f])
  .sort();
const py = withPy ? here.filter((f) => /^check.*\.py$/.test(f)).sort() : [];

const jobs = [...mjs.map((f) => ["node", f]), ...py.map((f) => ["python3", f])]
  .filter(([, f]) => !only || f.includes(only));

if (!jobs.length) {
  console.log(only ? `No check matches "${only}".` : "No checks found.");
  process.exit(1);
}

const run = (cmd, file) => new Promise((resolve) => {
  const started = Date.now();
  const p = spawn(cmd, [file], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { out += d; });
  /* A script that cannot be spawned at all — removed between the
     listing and the run, or an interpreter that is not installed. */
  p.on("error", (e) => resolve({ file, code: 1, out: String(e.message), ms: 0, crashed: true }));
  p.on("close", (code) => resolve({
    file, code, out, ms: Date.now() - started,
    /* Told apart from a failure. A check that reports "3 problem(s)"
       found something; one that throws never got to look, and the
       difference is what the && chain could not express. */
    crashed: code !== 0 && /^\s*(\w*Error|Traceback)/m.test(out),
  }));
});

const pad = Math.max(...jobs.map(([, f]) => f.length));
const results = [];

for (const [cmd, file] of jobs) {
  const r = await run(cmd, file);
  results.push(r);
  const mark = r.code === 0 ? "  ok  " : r.crashed ? "CRASH " : "FAIL  ";
  const secs = `${(r.ms / 1000).toFixed(1)}s`;
  console.log(`${mark}${file.padEnd(pad)}  ${secs.padStart(6)}`);
  if (r.code !== 0 || !quiet) {
    const body = r.out.trimEnd();
    if (body) console.log(body.split("\n").map((l) => `        ${l}`).join("\n"));
  }
}

const failed = results.filter((r) => r.code !== 0);
const crashed = failed.filter((r) => r.crashed);
const total = (results.reduce((s, r) => s + r.ms, 0) / 1000).toFixed(1);

console.log(`\n${"─".repeat(pad + 16)}`);
if (!failed.length) {
  console.log(`All ${results.length} checks pass (${total}s).`);
} else {
  console.log(`${results.length - failed.length} of ${results.length} pass, `
    + `${failed.length} failed${crashed.length ? `, ${crashed.length} of those crashed` : ""}`
    + ` (${total}s):`);
  for (const r of failed) {
    console.log(`  ${r.crashed ? "CRASH" : "FAIL "}  ${r.file}`);
  }
}
const skipped = Object.entries(NOT_A_SUITE_CHECK).filter(([f]) => here.includes(f));
if (skipped.length && !only) {
  console.log(`\nNot run: ${skipped.map(([f]) => f).join(", ")} — see NOT_A_SUITE_CHECK.`);
}

process.exit(failed.length ? 1 : 0);
