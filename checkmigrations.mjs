/* The migration folder, read as the record it actually is.

   There is no migration runner. A schema change exists once somebody
   has pasted it into the Supabase SQL editor, and `supabase/migrations`
   is the only description of the database anybody can read. Three
   things go wrong with a folder in that position, and all three have
   gone wrong here.

   ── 1. A file is run and never committed ──

   0138, 0163 and 0182 were pasted in and never landed in the repo. Two
   checks fail because of it, a rebuild from this folder would silently
   come up short, and nothing reported any of it at the time. A gap in
   the numbering is the only symptom there is.

   Absences are recorded below rather than merely counted, because a
   check that reports twenty known holes every run teaches everyone to
   skim it — and the run where it reports twenty-one looks exactly the
   same. So a NEW gap fails, and a recorded gap that has been filled
   also fails, which is what stops the list itself going stale.

   ── 2. A seeded style can never be inserted ──

   0194 added Supply_Type to GIS_Style, added a black triangle rule for
   non-residential supplies, and reported success. The column arrived.
   The rule did not: the uniqueness of a style scope is defined by
   gis_style_scope_uniq, Supply_Type was not in it, and the new row was
   therefore the same scope as the plain Meter rule already seeded in
   0051. ON CONFLICT DO NOTHING did what it says.

   Three supplies were placed on live drawings and drawn as ordinary
   meters. Nothing anywhere reported a fault, because nothing was
   faulty except a row that was never there — recurring fault 22, and
   the reason this section reads the index definition out of the
   migrations rather than carrying its own copy of the rule. A check
   holding its own idea of what makes a scope unique would have agreed
   with 0194 and passed.

   ── 3. A column is added to a table and not to the endpoint ──

   Every function selects an explicit column list. Supply_Type went into
   GIS_Style and not into the list in gis-styles.js, so the GIS Styles
   admin screen — the screen that exists to manage exactly this — could
   neither show it nor set it. Recurring fault 4, same migration, and
   invisible for the same reason: nothing errors, the column is simply
   never returned.

   Run: node checkmigrations.mjs */
import { readFileSync, readdirSync } from "node:fs";

const fails = [];
const fail = (m) => fails.push(m);

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => /^\d{4}.*\.sql$/.test(f)).sort();
const numberOf = (f) => Number(f.slice(0, 4));
const present = new Set(files.map(numberOf));
const sqlOf = (f) => readFileSync(`${DIR}/${f}`, "utf8");

/* ── 1. Numbering ──────────────────────────────────────────────── */

/* The absences, as a baseline the folder is held to.

   Every number here is a change that exists in the live database and
   nowhere else. There are eighty-five of them across 0001–0195, which
   is four times what HANDOVER used to say and worth knowing before
   anybody plans a rebuild from this folder.

   ── Why a baseline rather than a report ──

   A check that prints eighty-five known holes every run is a check
   nobody reads, and the run where it prints eighty-six looks exactly
   the same as the run before it. That is the same failure as a check
   that never runs, by a slower route.

   So the list below is what is missing TODAY, and the check fails on
   any difference in either direction: a number that goes missing next
   week, or one of these that gets recovered and filled. The second
   direction is what stops the list itself rotting — a hand-kept list
   nothing polices is fault 23, and this one cannot silently disagree
   with the folder.

   Only three of them are understood. The rest are recorded, not
   explained; nobody now knows what was in them, which is precisely the
   problem and precisely why a new one must not join them quietly. */
const ABSENT_RANGES = [
  /* 0002–0049 are absent as a block. The folder begins in earnest at
     0050, and whatever came between the first migration and there was
     either squashed or never kept. */
  [2, 49],
  [52, 52], [55, 55], [60, 60], [74, 74], [83, 89], [91, 92], [94, 94],
  [108, 108], [110, 110], [112, 113], [122, 122], [124, 124], [130, 131],
  [135, 135], [137, 140], [144, 145], [152, 152], [155, 155], [162, 163],
  [171, 171], [174, 174], [176, 176], [182, 182],
];

/* The three something reads, named so a recovery says what it recovered
   rather than just going quiet. */
const NAMED_ABSENT = new Map([
  [138, "project tabs seed — read by checkprojecttabs.mjs"],
  [163, "BOM bottle-end joint name — read by checkbottleends.mjs"],
  [182, "nothing reads it yet"],
]);

const KNOWN_ABSENT = new Set();
for (const [a, b] of ABSENT_RANGES) for (let n = a; n <= b; n += 1) KNOWN_ABSENT.add(n);

{
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const gaps = [];
  for (let n = lo; n <= hi; n += 1) if (!present.has(n)) gaps.push(n);

  for (const n of gaps) {
    if (!KNOWN_ABSENT.has(n)) {
      fail(`migration ${String(n).padStart(4, "0")} is absent and not in the `
        + "baseline — it was run against the database and never committed, and "
        + "this folder is the only record the schema has");
    }
  }
  for (const n of KNOWN_ABSENT) {
    if (present.has(n)) {
      const why = NAMED_ABSENT.get(n);
      fail(`migration ${String(n).padStart(4, "0")} is in the folder but still `
        + `listed as absent${why ? ` (${why})` : ""} — recovered, so take it out `
        + "of ABSENT_RANGES");
    }
  }
  /* Duplicated numbers are the other way the sequence stops being one:
     two files claiming 0170 run in an order nobody chose. */
  const seen = new Map();
  for (const f of files) {
    const n = numberOf(f);
    if (seen.has(n)) fail(`migrations ${seen.get(n)} and ${f} share a number`);
    seen.set(n, f);
  }
}

/* ── 2. Seeded style scopes ────────────────────────────────────── */

/* What makes a style scope unique, taken from the LAST definition of
   the index in the folder rather than from a copy kept here.

   This is the whole point of the section. The rule changed in 0195 —
   Supply_Type joined it — and a check carrying its own list would have
   gone on applying the old one, agreed with 0194, and reported nothing.
   Read the schema; do not restate it. */
function scopeColumns() {
  let cols = null;
  for (const f of files) {
    const sql = sqlOf(f);
    const re = /CREATE\s+UNIQUE\s+INDEX[^;]*?gis_style_scope_uniq[^(]*\(([\s\S]*?)\);/gi;
    let m;
    while ((m = re.exec(sql))) {
      const found = [...m[1].matchAll(/COALESCE\s*\(\s*"([^"]+)"/gi)].map((x) => x[1]);
      if (found.length) cols = found;
    }
  }
  return cols;
}

/* The VALUES rows of an INSERT INTO "GIS_Style", as objects.

   Only inserts naming their columns and supplying literal rows. The
   ones seeded from a SELECT over GIS_Line_Type or GIS_Layer are skipped
   — one row per line type is not something to evaluate here, and their
   scopes cannot collide with a hand-written rule anyway, since each
   names a line type or a layer of its own. */
function seededStyles(sql, file) {
  const out = [];
  const re = /INSERT\s+INTO\s+"GIS_Style"\s*\(([^)]*)\)\s*VALUES([\s\S]*?)(?:ON\s+CONFLICT|;)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const cols = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    /* Each parenthesised row. Values are string literals, numbers, NULL
       or an expression; anything that is not a plain literal is read as
       "not a scope value we can judge" and left null, which errs
       towards saying nothing rather than towards a false report. */
    for (const row of m[2].matchAll(/\(([^()]*)\)/g)) {
      const vals = row[1].split(",").map((v) => v.trim());
      if (vals.length !== cols.length) continue;
      const obj = {};
      cols.forEach((c, i) => {
        const v = vals[i];
        if (/^null$/i.test(v)) obj[c] = null;
        else if (/^'(.*)'$/s.test(v)) obj[c] = v.slice(1, -1);
        else if (/^-?[\d.]+$/.test(v)) obj[c] = v;
        else obj[c] = null;
      });
      out.push({ ...obj, __file: file });
    }
  }
  return out;
}

{
  const cols = scopeColumns();
  if (!cols) {
    fail("no definition of gis_style_scope_uniq found — a style scope is "
      + "unique by something, and this check cannot say what");
  } else {
    const rows = files.flatMap((f) => seededStyles(sqlOf(f), f));
    /* The key the index would build. Non-scope columns are irrelevant,
       and a column the insert did not name is null, which is what the
       database would store. */
    const keyOf = (r) => cols.map((c) => String(r[c] ?? "\u0000")).join("|");

    const byKey = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      const first = byKey.get(k);
      if (!first) { byKey.set(k, r); continue; }
      /* Same name is a deliberate re-seed: a migration re-running an
         earlier row so a fresh database ends up the same as an old one,
         which is what ON CONFLICT DO NOTHING is for and is not a fault.
         A DIFFERENT name at the same scope is two rules that cannot
         both exist, and the second one will never be written. */
      if (String(first.Style_Name) === String(r.Style_Name)) continue;
      fail(`"${r.Style_Name}" (${r.__file}) has the same style scope as `
        + `"${first.Style_Name}" (${first.__file}) — it will be rejected by `
        + `gis_style_scope_uniq and swallowed by ON CONFLICT DO NOTHING. `
        + `Scope is ${cols.join(", ")}`);
    }
  }
}

/* ── 3. Columns against the endpoints ──────────────────────────── */

/* A table, the file that serves it, and the constant naming the columns
   it will read and write. Every one of these is an explicit list, which
   is the house pattern and also recurring fault 4: a column added to
   the database and not to the list is neither saved nor returned, and
   the screen shows nothing rather than an error. */
const ENDPOINTS = [
  ["GIS_Style", "netlify/functions/gis-styles.js", "S"],
];

for (const [table, file, constant] of ENDPOINTS) {
  let src;
  /* A check that reads a file it does not own degrades to a named
     failure rather than throwing, or it takes the rest of the suite
     down with it. */
  try { src = readFileSync(file, "utf8"); }
  catch { fail(`${file} is missing, so ${table}'s column list cannot be checked`); continue; }

  const m = src.match(new RegExp(`const\\s+${constant}\\s*=\\s*"([^"]+)"`));
  if (!m) { fail(`no ${constant} column list found in ${file}`); continue; }
  const listed = new Set(m[1].split(","));

  /* Every column the migrations add to that table. The CREATE TABLE
     body is not read: those columns predate every endpoint and are the
     ones least likely to have been missed. ADD COLUMN is where the
     drift happens, because it happens one column at a time, months
     apart, in a migration about something else. */
  const added = new Set();
  for (const f of files) {
    const sql = sqlOf(f);
    const re = new RegExp(`ALTER\\s+TABLE\\s+"${table}"([\\s\\S]*?);`, "gi");
    let a;
    while ((a = re.exec(sql))) {
      for (const c of a[1].matchAll(/ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"/gi)) {
        added.add(c[1]);
      }
    }
  }

  for (const c of added) {
    if (!listed.has(c)) {
      fail(`${table}."${c}" was added by a migration but is not in ${constant} `
        + `in ${file} — it is neither returned nor saved`);
    }
  }
}

console.log(fails.length
  ? "FAIL\n - " + fails.join("\n - ")
  : `Migrations behave (${files.length} files, ${KNOWN_ABSENT.size} recorded absences, `
    + "no colliding style scopes, endpoint column lists complete).");
process.exit(fails.length ? 1 : 0);
