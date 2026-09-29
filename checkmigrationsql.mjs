/* Things Postgres will not accept, found before it is asked.

   0240 shipped with this in it:

     CHECK ("Conditions" IS NULL OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements("Conditions") AS e WHERE ...))

   which reads perfectly and is illegal: a CHECK constraint may only use
   immutable expressions, and a subquery is never one. Postgres says
   `0A000: cannot use subquery in check constraint`, and it says it when
   the migration is RUN — so the first person to find out was the person
   running it against their own database, with the earlier statements in
   the file already applied.

   A migration is the one kind of code here that gets no second chance:
   it is handed over and pasted into a SQL editor. So the point of this
   check is not to know SQL — it is to catch the handful of things that
   cannot possibly work, so they are caught by the suite rather than by
   the user.

   Each rule below is one Postgres refuses outright, not a style
   preference. If a rule here ever argues with Postgres, Postgres wins
   and the rule goes. */

import { readFileSync, readdirSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const DIR = "supabase/migrations";

/* Comments hide nothing and explain plenty — including, in 0240, the
   illegal constraint quoted as the reason it was replaced. Matching them
   is how a check comes to report history as a fault.

   Literals are carried through whole here, because a `--` inside one is
   not a comment and because the jsonpath 0240 turns on IS one. Blanking
   them is a separate pass, for the scan that must not read the word
   select out of a message. */
function stripComments(sql) {
  let out = "", i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;            // keep the newline
    } else if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += " ";
    } else if (sql[i] === "'") {
      const [lit, next] = literalAt(sql, i);
      out += lit;
      i = next;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/* Where the literal starting at i ends, '' counted as an escape and not
   as the end of one. */
function literalAt(sql, i) {
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
    else if (sql[j] === "'") { j += 1; break; }
    else j += 1;
  }
  return [sql.slice(i, j), j];
}

function blankLiterals(sql) {
  let out = "", i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      const [, next] = literalAt(sql, i);
      out += " '' ";
      i = next;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/* The parenthesised expression after each CHECK, balanced rather than
   regex-matched, because ours spans ten lines and four nested calls. */
function checkExpressions(sql) {
  const found = [];
  const re = /\bCHECK\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    let depth = 0, i = m.index + m[0].length - 1, start = i;
    for (; i < sql.length; i += 1) {
      if (sql[i] === "(") depth += 1;
      else if (sql[i] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) {
      found.push({ text: sql.slice(start), unbalanced: true });
    } else {
      found.push({ text: sql.slice(start, i + 1), unbalanced: false });
    }
  }
  return found;
}

/* Set-returning functions are as illegal in a constraint as a subquery,
   and are the shape somebody reaches for when the subquery is refused.
   jsonb_path_query_array is the scalar one and is what 0240 uses. */
const SET_RETURNING = [
  "jsonb_array_elements", "jsonb_array_elements_text",
  "json_array_elements", "json_array_elements_text",
  "jsonb_each", "jsonb_each_text", "json_each", "json_each_text",
  "jsonb_object_keys", "json_object_keys",
  "jsonb_path_query", "json_path_query",
  "unnest", "generate_series", "regexp_split_to_table",
];

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
if (files.length < 50) fail(`only ${files.length} migrations found — wrong directory?`);

let checked = 0;
for (const f of files) {
  const raw = readFileSync(`${DIR}/${f}`, "utf8");
  const sql = blankLiterals(stripComments(raw));

  for (const { text, unbalanced } of checkExpressions(sql)) {
    checked += 1;
    const one = text.replace(/\s+/g, " ");
    const show = one.length > 90 ? one.slice(0, 90) + "…" : one;

    if (unbalanced) {
      fail(`${f}: a CHECK ( never closes — ${show}`);
      continue;
    }
    if (/\bSELECT\b/i.test(text)) {
      fail(`${f}: a CHECK constraint contains a subquery, which Postgres `
        + `refuses with 0A000 — ${show}`);
    }
    for (const fn of SET_RETURNING) {
      /* jsonb_path_query_array is fine and starts the same way. */
      if (new RegExp(`\\b${fn}\\s*\\(`, "i").test(text)) {
        fail(`${f}: a CHECK constraint calls ${fn}(), a set-returning `
          + `function, which Postgres refuses in a constraint — ${show}`);
      }
    }
  }
}

if (!checked) fail("no CHECK constraints found in any migration — did the parser break?");

/* ── The two the user had to run by hand ──

   Both were pasted into the Supabase SQL editor, which shows the
   Messages pane and not much else, so a migration that decides not to
   act has to say so. Asserted because a later edit that quietly drops
   the notice leaves a migration that cannot be told from one that
   worked. */
{
  const sep = readFileSync(`${DIR}/0239_retire_separate_trench.sql`, "utf8");
  /* Literals blanked for everything structural. 0239's notice hands the
     user a query to run, and that query names GIS_Feature — so "does it
     look at what was drawn" asked of the text alone is answered by the
     message rather than by the code, which is a check that passes on the
     fault. Found by mutating it. */
  const body = blankLiterals(stripComments(sep));
  if (!/RAISE NOTICE/.test(body)) fail("0239 no longer says what it did");
  /* Three outcomes, three things said: not there, in use, retired. */
  const notices = (body.match(/RAISE NOTICE/g) || []).length;
  if (notices < 3) {
    fail(`0239 has ${notices} notice(s) — it has three outcomes and each `
      + `must name itself`);
  }
  /* And it must still refuse to hide a type somebody has drawn with:
     counted from GIS_Feature, and the count has to decide something. */
  if (!/count\(\*\)\s+INTO\s+n_drawn\s+FROM\s+"GIS_Feature"/i.test(body)) {
    fail("0239 no longer counts what was drawn with trench_sep");
  }
  if (!/IF\s+n_drawn\s*>\s*0\s+THEN[\s\S]{0,400}?RETURN\s*;/i.test(body)) {
    fail("0239 counts what was drawn and then carries on regardless");
  }
  if (!/IS DISTINCT FROM false/.test(body)) {
    fail("0239 no longer guards the update, so re-running it reports work it did not do");
  }
  /* Deactivating, not deleting: a DELETE from GIS_Line_Type would take
     the type away from drawings that reference it. */
  if (/DELETE\s+FROM\s+"GIS_Line_Type"/i.test(body)) {
    fail("0239 deletes the line type — it is meant to deactivate it");
  }
  /* The style rules it removes are the ones that name nothing else. */
  const del = body.match(/DELETE\s+FROM\s+"GIS_Style"[\s\S]*?;/i)?.[0] ?? "";
  for (const col of ["Feature_Role", "Site", "Supply_Type", "Organisation_ID"]) {
    if (!del.includes(col)) {
      fail(`0239 removes style rules without checking ${col} is empty, so it `
        + `would throw away somebody's scoped rule`);
    }
  }
}

{
  const cond = readFileSync(`${DIR}/0240_gis_style_conditions.sql`, "utf8");
  const body = stripComments(cond);
  if (!/ADD COLUMN IF NOT EXISTS "Conditions" jsonb/i.test(body)) {
    fail("0240 no longer adds Conditions, or no longer tolerates being run twice");
  }
  /* Both constraints guarded, or a second run fails on duplicate_object
     and the user cannot tell that from a real fault. */
  const guards = (body.match(/FROM pg_constraint/g) || []).length;
  if (guards < 2) {
    fail(`0240 guards ${guards} constraint(s) against already existing — `
      + `both must be, or re-running it errors`);
  }
  /* strict, or a nested array reads as a well-formed condition. */
  if (!/strict \$\[\*\]/.test(body)) {
    fail("0240's jsonpath is not strict — in lax mode [[{\"field\":\"a\"}]] "
      + "counts as a condition");
  }
  /* The array-length comparison is the whole test: without it the path
     finds the good entries and nothing asks how many there were. */
  if (!/jsonb_array_length[\s\S]{0,400}=\s*jsonb_array_length/.test(body)) {
    fail("0240 no longer compares how many conditions are well formed with "
      + "how many there are, so a malformed one passes");
  }
  /* jsonb_array_length throws on a scalar, and which constraint runs
     first is not ours to decide. */
  if (!/jsonb_typeof\("Conditions"\)\s*<>\s*'array'/.test(body)) {
    fail("0240's field check is not guarded against a non-array, so writing "
      + "a scalar raises a type error instead of a constraint violation");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Migrations: ${checked} CHECK constraint(s), none of them illegal; `
    + `0239 and 0240 still say what they did and still guard what they guard.`);
process.exit(bad ? 1 : 0);
