/* ── Tests for project reference allocation ──
 *
 *   node checkprojectref.mjs
 *
 * The faults these cover were all live on 6 Oct:
 *
 *   1. allocateRef ordered references as TEXT, so one odd-width
 *      reference in the month made it hand out a number already taken.
 *   2. The reference was allocated on form mount and written on save,
 *      with nothing catching a collision in between.
 *   3. isRefConflict must retry a reference collision and must NOT
 *      retry any other unique violation on the same table.
 *
 * The error objects in these tests are not invented. They are the exact
 * message and detail text Postgres 16 produced against the real schema
 * with 0254 applied, copied from the migration test run.
 */

import { allocateRef, isRefConflict, monthOf, refPrefix } from
  "./netlify/functions/_refs.js";

let pass = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) { pass++; return; }
  fails.push(`${name}${extra ? ` — ${extra}` : ""}`);
}
function eq(name, got, want) {
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

/* A stand-in for the PostgREST client, just the calls _refs.js makes. */
function fakeDb(refs, { onInsert } = {}) {
  const calls = { selects: 0, inserts: 0, likes: [] };
  const db = {
    from() { return db; },
    select() { return db; },
    like(_col, pattern) {
      calls.likes.push(pattern);
      calls.selects++;
      const prefix = pattern.replace(/\.%$/, "");
      return Promise.resolve({
        data: refs.filter((r) => String(r).startsWith(`${prefix}.`))
                  .map((r) => ({ Project_Ref: r })),
        error: null,
      });
    },
    insert(row) {
      calls.inserts++;
      const res = onInsert(row, calls.inserts);
      return {
        select() { return this; },
        single() { return Promise.resolve(res); },
      };
    },
    calls,
  };
  return db;
}

/* The real thing, from the 0254 test run. */
const realRefConflict = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "Project_Ref_Revision_Option_UQ"',
  details: 'Key ("Project_Ref", "Revision", "Option_Letter")=(2610.004, 0, null) already exists.',
};
const oldNameConflict = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "Project_Project_Ref_Revision_Option_Letter_key"',
  details: 'Key ("Project_Ref", "Revision", "Option_Letter")=(2601.001, 0, ) already exists.',
};

/* ── 1. refPrefix and monthOf ───────────────────────────────────── */
eq("refPrefix pads the month",
   refPrefix(new Date(2026, 0, 15)), "2601");
eq("refPrefix takes two digits of the year",
   refPrefix(new Date(2026, 9, 6)), "2610");
eq("monthOf reads the month out of a reference",
   monthOf("2610.004"), "2610");
eq("monthOf on a hand-typed reference is null",
   monthOf("PROJ-7"), null);
eq("monthOf on nothing is null", monthOf(null), null);
/* A reference that keeps a project in its own month rather than today's
   is the whole reason monthOf exists: a form opened on 31 Oct and saved
   on 1 Nov must not jump to 2611. */
eq("monthOf ignores an option suffix it should never see",
   monthOf("2610.004(B)"), null);

/* ── 2. allocateRef takes the NUMERIC maximum ───────────────────── */
{
  const db = fakeDb(["2610.001", "2610.002", "2610.003"]);
  eq("next after 003", await allocateRef(db, "2610"), "2610.004");
}
{
  /* THE FAULT. Ordered as text, '2610.9' sorts above '2610.012', the
     tail parses as 9, and the next reference is 2610.010 - which is
     already in use. */
  const db = fakeDb(["2610.001", "2610.012", "2610.9"]);
  eq("an odd-width reference does not drag the next number down",
     await allocateRef(db, "2610"), "2610.013");
}
{
  const db = fakeDb(["2610.001", "2610.233"]);
  eq("numeric max across a wide gap",
     await allocateRef(db, "2610"), "2610.234");
}
{
  /* Past 999 the padding stops mattering but the arithmetic must not. */
  const db = fakeDb(["2610.998", "2610.999", "2610.1000"]);
  eq("past a thousand in one month",
     await allocateRef(db, "2610"), "2610.1001");
}
{
  const db = fakeDb([]);
  eq("an empty month starts at 001", await allocateRef(db, "2610"), "2610.001");
}
{
  /* The reference field is free text. Something unparseable must be
     skipped, not treated as zero and not crashed on. The old code
     parsed NaN and silently restarted the month at 001. */
  const db = fakeDb(["2610.007", "2610.TBC", "2610."]);
  eq("a reference nobody can parse is skipped, not counted",
     await allocateRef(db, "2610"), "2610.008");
}
{
  const db = fakeDb(["2610.0007"]);
  eq("leading zeros do not multiply the number",
     await allocateRef(db, "2610"), "2610.008");
}
{
  const db = fakeDb(["2610.004", "2611.900"]);
  eq("another month is not counted",
     await allocateRef(db, "2610"), "2610.005");
  eq("and the LIKE asked for the right month only",
     db.calls.likes[0], "2610.%");
}

/* ── 3. isRefConflict is specific ───────────────────────────────── */
ok("the real 0254 conflict is retried", isRefConflict(realRefConflict));
ok("the pre-0254 constraint name is retried too",
   isRefConflict(oldNameConflict));
ok("a renamed constraint is still caught by its key columns",
   isRefConflict({ code: "23505",
     message: 'duplicate key value violates unique constraint "something_else"',
     details: 'Key ("Project_Ref", "Revision", "Option_Letter")=(2610.004, 0, null) already exists.' }));
/* ── These two exist because a mutation survived without them ──
 *
 * Dropping the old constraint name from REF_CONSTRAINTS changed
 * nothing, because every test for it also carried the full key list
 * and the fallback caught it. PostgREST does not always pass `details`
 * through - it is absent on some versions and when the database is
 * configured to withhold it - and then the name is all there is. A
 * database that has not run 0254 yet is the live case. */
ok("the pre-0254 name alone is enough, with no details to fall back on",
   isRefConflict({ code: "23505",
     message: 'duplicate key value violates unique constraint "Project_Project_Ref_Revision_Option_Letter_key"' }));
ok("the 0254 name alone is enough too",
   isRefConflict({ code: "23505",
     message: 'duplicate key value violates unique constraint "Project_Ref_Revision_Option_UQ"' }));
/* And loosening the fallback to "Project_Ref" alone also survived. A
 * constraint over the reference AND something else would match it, and
 * a new reference does nothing about a duplicate AP number - the
 * insert would be retried six times and fail anyway. */
ok("a unique constraint over the reference AND another column is not retried",
   !isRefConflict({ code: "23505",
     message: 'duplicate key value violates unique constraint "Project_Ref_AP_Number_UQ"',
     details: 'Key ("Project_Ref", "AP_Number")=(2610.004, AP1938) already exists.' }));

/* These must NOT be retried. Renumbering the project would hide a
   problem that belongs back to the user. */
ok("a duplicate contract number is NOT a reference conflict",
   !isRefConflict({ code: "23505",
     message: 'duplicate key value violates unique constraint "Project_Contract_Number_key"',
     details: 'Key ("Contract_Number")=(C-9001) already exists.' }));
ok("a duplicate legacy contract key is NOT a reference conflict",
   !isRefConflict({ code: "23505",
     message: 'duplicate key value violates unique constraint "Project_Legacy_Contract_UQ"',
     details: 'Key ("Legacy_Contract_ID")=(380) already exists.' }));
ok("a not-null violation is not a reference conflict",
   !isRefConflict({ code: "23502",
     message: 'null value in column "Project_Status_ID" violates not-null constraint' }));
ok("no error is not a conflict", !isRefConflict(null));
ok("an error with no code is not a conflict",
   !isRefConflict({ message: "network down" }));
/* Display_Ref contains "Project_Ref" as a substring, so a loose check
   on that alone would retry a Display_Ref violation forever. */
ok("Display_Ref alone is not a reference conflict",
   !isRefConflict({ code: "23505",
     message: 'duplicate key value violates unique constraint "project_display_ref_idx"',
     details: 'Key ("Display_Ref")=(2610.004) already exists.' }));

/* ── 4. The retry, as projects.js runs it ───────────────────────── */
//
// Rebuilt here rather than imported, because projects.js is a Netlify
// handler wrapped in withAuth and cannot be called without a request.
// Kept to the same shape, and section 5 below asserts the real file
// still matches it.
async function insertWithRetry(db, row) {
  let reassignedFrom = null;
  if (!row.Project_Ref) row.Project_Ref = await allocateRef(db);
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await db.from("Project").insert(row)
      .select("x").single();
    if (!error) return { created: data, reassignedFrom };
    if (attempt >= 5 || !isRefConflict(error)) throw error;
    const taken = row.Project_Ref;
    row.Project_Ref = await allocateRef(db, monthOf(taken) ?? refPrefix());
    if (reassignedFrom === null) reassignedFrom = taken;
  }
}

{
  /* The 6 Oct case: the form carried 2610.004, the import took it. */
  const db = fakeDb(["2610.004", "2610.233"], {
    onInsert: (row) => row.Project_Ref === "2610.004"
      ? { data: null, error: realRefConflict }
      : { data: { Project_Ref: row.Project_Ref }, error: null },
  });
  const out = await insertWithRetry(db, { Project_Ref: "2610.004" });
  eq("the stale reference is replaced with the next free one",
     out.created.Project_Ref, "2610.234");
  eq("and the form is told what it was", out.reassignedFrom, "2610.004");
  eq("two inserts, no more", db.calls.inserts, 2);
}
{
  /* An ordinary create must not pay for any of this. */
  const db = fakeDb(["2610.233"], {
    onInsert: (row) => ({ data: { Project_Ref: row.Project_Ref }, error: null }),
  });
  const out = await insertWithRetry(db, { Project_Ref: "2610.234" });
  eq("a free reference is written as sent", out.created.Project_Ref, "2610.234");
  eq("nothing is reported as reassigned", out.reassignedFrom, null);
  eq("one insert", db.calls.inserts, 1);
  eq("and no reference was allocated at all", db.calls.selects, 0);
}
{
  /* The month in the reference wins over today's month, so a form
     opened on 31 Oct and saved on 1 Nov stays in October. */
  const db = fakeDb(["2610.004", "2610.050"], {
    onInsert: (row, n) => n === 1
      ? { data: null, error: realRefConflict }
      : { data: { Project_Ref: row.Project_Ref }, error: null },
  });
  const out = await insertWithRetry(db, { Project_Ref: "2610.004" });
  eq("reallocation stays in the reference's own month",
     out.created.Project_Ref, "2610.051");
}
{
  /* A collision on something else is the user's to see. */
  const other = { code: "23505",
    message: 'duplicate key value violates unique constraint "Project_Contract_Number_key"',
    details: 'Key ("Contract_Number")=(C-9001) already exists.' };
  const db = fakeDb([], { onInsert: () => ({ data: null, error: other }) });
  let threw = null;
  try { await insertWithRetry(db, { Project_Ref: "2610.004" }); }
  catch (e) { threw = e; }
  ok("a non-reference violation is thrown, not retried", threw === other);
  eq("and it was not retried", db.calls.inserts, 1);
}
{
  /* Six attempts, then the real error - not a loop. */
  const db = fakeDb(["2610.001"], {
    onInsert: () => ({ data: null, error: realRefConflict }),
  });
  let threw = null;
  try { await insertWithRetry(db, { Project_Ref: "2610.004" }); }
  catch (e) { threw = e; }
  ok("an endless collision gives up with the real error",
     threw === realRefConflict);
  eq("after six attempts", db.calls.inserts, 6);
}
{
  /* No reference sent at all: allocate before trying. Project_Ref is
     NOT NULL, so the alternative is a 23502 the user cannot act on. */
  const db = fakeDb(["2610.009"], {
    onInsert: (row) => ({ data: { Project_Ref: row.Project_Ref }, error: null }),
  });
  const out = await insertWithRetry(db, {});
  eq("a missing reference is allocated, not rejected",
     out.created.Project_Ref, "2610.010");
}

/* ── 5. The real files still say what sections 1-4 tested ───────── */
//
// Section 4 rebuilds the retry, so it proves the logic and not the
// deployed code. These read the files.
import { readFileSync } from "node:fs";

const stripped = (p) => readFileSync(p, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
  .replace(/^\s*\/\/.*$/gm, " ");      // line comments

const proj = stripped("./netlify/functions/projects.js");
const refs = stripped("./netlify/functions/_refs.js");
const next = stripped("./netlify/functions/next-ref.js");
const mig  = stripped("./supabase/migrations/0254_project_ref_unique_nulls.sql");

ok("projects.js imports the allocator",
   /import\s*\{[^}]*\ballocateRef\b[^}]*\}\s*from\s*["']\.\/_refs\.js["']/.test(proj));
ok("projects.js imports isRefConflict",
   /import\s*\{[^}]*\bisRefConflict\b[^}]*\}\s*from\s*["']\.\/_refs\.js["']/.test(proj));
ok("the POST retries rather than inserting once",
   /isRefConflict\(error\)/.test(proj) && /allocateRef\(db,\s*monthOf\(/.test(proj));
ok("the retry is bounded",
   /attempt\s*>=\s*5/.test(proj));
ok("the POST reports a reassigned reference to the form",
   /Ref_Reassigned_From/.test(proj));
/* The old single-shot insert must be gone, not merely bypassed. */
ok("the unguarded insert is gone",
   !/\.insert\(onlyColumns\(nullEmpty\(project\)\)\)/.test(proj));

ok("allocateRef reads every reference in the month",
   !/\.order\(\s*["']Project_Ref["']/.test(refs),
   "it is ordering by Project_Ref again, which is the text-sort fault");
ok("allocateRef has no limit(1)",
   !/\.limit\(\s*1\s*\)/.test(refs));
ok("next-ref.js no longer does its own arithmetic",
   /allocateRef/.test(next) && !/padStart\(3/.test(next));

ok("0254 uses NULLS NOT DISTINCT",
   /UNIQUE\s+NULLS\s+NOT\s+DISTINCT\s*\(\s*"Project_Ref"\s*,\s*"Revision"\s*,\s*"Option_Letter"\s*\)/i
     .test(mig));
ok("0254 drops the 0001 constraint",
   /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+"Project_Project_Ref_Revision_Option_Letter_key"/i.test(mig));
ok("0254 refuses while a duplicate exists",
   /RAISE\s+EXCEPTION/i.test(mig) && /HAVING\s+count\(\*\)\s*>\s*1/i.test(mig));
ok("0254 normalises an empty option letter",
   /SET\s+"Option_Letter"\s*=\s*NULL/i.test(mig)
     && /btrim\(\s*"Option_Letter"\s*\)\s*=\s*''/i.test(mig));
ok("0254 names the constraint projects.js matches on",
   /"Project_Ref_Revision_Option_UQ"/.test(mig)
     && /Project_Ref_Revision_Option_UQ/.test(refs));

/* ── Result ──────────────────────────────────────────────────────── */
if (fails.length) {
  console.log(`\n${fails.length} FAILED, ${pass} passed\n`);
  for (const f of fails) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
console.log(`\nAll ${pass} checks passed.\n`);
