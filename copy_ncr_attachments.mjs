/* Copy the 98 NCR attachment files from the original system's storage
   into this project's ncr-attachments bucket.

   ── Why a script and not the dashboard ──

   97 folders, one per NCR, and the paths have to match exactly:
   NCR_Attachment."Storage_Path" already holds them, so a file that
   lands anywhere else is a broken link in the application. Clicking
   through 98 downloads and 98 uploads is both slow and the kind of
   thing that goes wrong on file 60 without anybody noticing.

   ── Driven by the export, not by listing the bucket ──

   The manifest is NCR_Attachment_rows.csv. That means the set copied
   is exactly the set the rows refer to: nothing extra, and anything
   missing is reported by name rather than silently skipped. Listing
   the bucket instead would copy whatever happens to be there, which
   is a different question from what the application will ask for.

   ── Running it ──

     cd <the folder with NCR_Attachment_rows.csv in it>
     node copy_ncr_attachments.mjs --check    # reads only, writes nothing
     node copy_ncr_attachments.mjs            # copies

   That is the whole thing. It asks for what it needs: the two project
   refs, the old bucket's name, and the two service role keys, which
   are typed invisibly.

   ── Why it asks rather than reading the environment ──

   It did read the environment, and handing somebody five export lines
   to paste cost three rounds of failure before a single file moved.
   A space after an `=` gave "export: not valid in this context"; a
   block paste ran the line holding a placeholder before it could be
   edited, because every newline in a paste is an Enter; and a long
   line arrived truncated mid-URL, leaving an open quote and a zsh
   dquote> prompt that swallowed everything typed after it.

   None of that is the shell being awkward. It is a script asking to
   be configured in the one place a terminal is worst at editing.

   The environment still works, for CI or a second run:

     OLD_REF=<old project ref>  OLD_KEY=...  OLD_BUCKET=...
     NEW_REF=<this project ref> NEW_KEY=...  [NEW_BUCKET=ncr-attachments]

   Either way the keys are never printed and never written down. They
   bypass row level security entirely, so they belong in a terminal
   that closes — not in a file, and not in a chat window.

   ── What it checks ──

   Every file is compared against the size the export recorded, after
   upload, by asking the new bucket rather than trusting the response.
   A file that arrives truncated is worse than one that never arrives:
   the link works and the document is wrong.
*/

import { readFileSync, existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check") || args.has("--dry-run");

/* ── Asking, with the typing hidden where it should be ──

   readline writes back whatever it reads, which is how a terminal
   echoes. For a service role key that is 200-odd characters across
   somebody's screen, so _writeToOutput is replaced for the duration:
   the prompt is written once and everything after it is swallowed.

   Not a TTY — a pipe, CI, a test — means no prompting at all. A
   script that blocks on a question nobody can see is a script that
   looks like it has hung. */
async function ask(label, { hidden = false, fallback = "", name, env } = {}) {
  if (!process.stdin.isTTY) {
    /* A value with a default needs no terminal — asking for it when
       there is nobody to answer turned a working environment-variable
       run into a refusal over NEW_BUCKET, which already had its
       answer. Only the things with no sensible default stop here. */
    if (fallback) return fallback;
    console.error(`No ${name || "value"} given, and there is nobody to ask: `
      + `input is not a terminal. Set ${env || "it"} in the environment, or `
      + "run this from a Terminal window.");
    process.exit(2);
  }
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout,
    terminal: true });
  if (hidden) {
    let shown = false;
    rl._writeToOutput = (chunk) => {
      if (!shown) { rl.output.write(label); shown = true; }
    };
  }
  const answer = await new Promise((done) => rl.question(label, done));
  rl.close();
  if (hidden) process.stdout.write("\n");
  return (answer || "").trim() || fallback;
}

/* A project ref or a whole URL, because people have both to hand: the
   dashboard URL carries the ref and the API settings page carries the
   URL. "mkibzgmgbikptawkbhxu" and
   "https://mkibzgmgbikptawkbhxu.supabase.co" both arrive here. */
const toUrl = (v) => {
  const t = String(v || "").trim().replace(/\/+$/, "");
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z0-9]{16,}$/i.test(t)) return `https://${t}.supabase.co`;
  return `https://${t}`;
};

const OLD_URL = toUrl(process.env.OLD_URL || process.env.OLD_REF
  || await ask("The ORIGINAL system's project ref or URL: ",
       { name: "project ref for the original system", env: "OLD_REF" }));
const OLD_BUCKET = (process.env.OLD_BUCKET
  || await ask("The bucket the files are in now (Storage, in that project): ",
       { name: "source bucket name", env: "OLD_BUCKET" })).trim();
const NEW_URL = toUrl(process.env.NEW_URL || process.env.NEW_REF
  || await ask("THIS Aptus360 project's ref or URL: ",
       { name: "project ref for this Aptus360", env: "NEW_REF" }));
const NEW_BUCKET = (process.env.NEW_BUCKET
  || await ask("The bucket to copy into [ncr-attachments]: ",
       { fallback: "ncr-attachments", name: "destination bucket name",
         env: "NEW_BUCKET" })).trim().replace(/\/+$/, "");
const OLD_KEY = process.env.OLD_KEY
  || await ask("The ORIGINAL system's service role key (hidden): ",
       { hidden: true, name: "service role key for the original system",
         env: "OLD_KEY" });
const NEW_KEY = process.env.NEW_KEY
  || await ask("THIS project's service role key (hidden): ",
       { hidden: true, name: "service role key for this project",
         env: "NEW_KEY" });

for (const [name, v] of [["the original project", OLD_URL], ["the old bucket", OLD_BUCKET],
  ["this project", NEW_URL], ["the destination bucket", NEW_BUCKET],
  ["the original key", OLD_KEY], ["this project's key", NEW_KEY]]) {
  if (!v) { console.error(`\nNothing given for ${name}. Nothing has been copied.`); process.exit(2); }
}
if (OLD_URL === NEW_URL && OLD_BUCKET === NEW_BUCKET) {
  console.error("\nThe source and the destination are the same bucket in the "
    + "same project. Nothing has been copied.");
  process.exit(2);
}

const CSV = process.argv.find((a) => a.endsWith(".csv"))
  || "NCR_Attachment_rows.csv";

if (!existsSync(CSV)) {
  console.error(`Cannot find ${CSV}. Pass its path as an argument, or run this `
    + "from the folder it is in.");
  process.exit(2);
}

/* A real parser rather than a split on commas. The attachment export
   has no quoted fields today, and a file name with a comma in it would
   turn a split into silent nonsense — one wrong path out of 98 is
   exactly the failure this script exists to avoid. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  const head = rows.shift().map((h) => h.replace(/^﻿/, "").trim());
  return rows.map((r) => Object.fromEntries(head.map((h, n) => [h, r[n] ?? ""])));
}

const rows = parseCsv(readFileSync(CSV, "utf8"));
const files = rows
  .map((r) => ({
    id: (r.NCR_Attachment_ID || "").trim(),
    ncr: (r.NCR_ID || "").trim(),
    path: (r.Storage_Path || "").trim(),
    name: (r.File_Name || "").trim(),
    type: (r.Mime_Type || "").trim() || "application/octet-stream",
    size: (r.File_Size || "").trim() === "" ? null : Number(r.File_Size),
  }))
  .filter((f) => f.path !== "");

if (!files.length) {
  console.error(`${CSV} has no Storage_Path values. Wrong file?`);
  process.exit(2);
}

const dupes = files.filter((f, n) => files.findIndex((g) => g.path === f.path) !== n);
if (dupes.length) {
  console.error(`${dupes.length} rows share a Storage_Path with another row, so `
    + "one would overwrite the other:");
  for (const d of dupes) console.error(`  ${d.path}`);
  process.exit(2);
}

const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const obj = (url, bucket, path) => `${url}/storage/v1/object/${bucket}/${enc(path)}`;

/* A bucket that does not exist is not 98 missing files.

   Supabase answers a bad bucket name with 400 "Bucket not found" and a
   missing object with 404. Treating both as "missing" made a single
   typo in OLD_BUCKET print 98 lines of "NOT IN THE OLD BUCKET" and
   then advise against running 4.1 — true, and no help at all in
   finding the cause. A wrong bucket stops the run on the first file. */
const fatal = (what, body, advice = "Check the bucket names.") => {
  console.error(`\n${what}: ${String(body).slice(0, 200)}`);
  console.error(`Nothing has been copied. ${advice}`);
  process.exit(2);
};

/* ── A host that cannot be reached is not a failed file ──

   fetch throws rather than returning a status when DNS does not
   resolve or nothing answers, and an uncaught throw here printed
   thirty lines of Node internals ending in ENOTFOUND. A mistyped
   project ref is the likeliest way somebody meets that, and the stack
   trace says nothing about project refs.

   Fatal rather than counted: if the host is wrong it is wrong for all
   98, and grinding through them proves nothing. */
async function reach(url, init, what) {
  try {
    return await fetch(url, init);
  } catch (e) {
    /* Node reports a refused connection as an AggregateError inside
       `cause` when a host has both an A and an AAAA record — one
       failure per address — so the code is a level deeper than
       cause.code. Read both, or ECONNREFUSED falls through to the
       catch-all and reads "fetch failed", which says nothing. */
    const code = e?.cause?.code || e?.code
      || e?.cause?.errors?.find((x) => x?.code)?.code || "";
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    const net = "Check the project ref and that you are online.";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      fatal(`Cannot find ${host} — check the ${what} project ref`, code, net);
    }
    if (code === "ECONNREFUSED" || code === "ECONNRESET"
      || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
      fatal(`Cannot reach ${host}`, `${code} — the address resolves but nothing `
        + "is answering there", net);
    }
    fatal(`Could not talk to ${host}`, e?.message || String(e), net);
  }
  return undefined;
}

async function download(path) {
  const r = await reach(obj(OLD_URL, OLD_BUCKET, path), {
    headers: { Authorization: `Bearer ${OLD_KEY}` },
  }, "original system's");
  if (r.ok) return { bytes: Buffer.from(await r.arrayBuffer()) };
  const body = await r.text();
  if (/bucket not found/i.test(body)) {
    fatal(`The source bucket "${OLD_BUCKET}" does not exist on `
      + `${new URL(OLD_URL).host}`, body);
  }
  if (r.status === 401 || r.status === 403) {
    fatal("The source key was refused", body);
  }
  if (r.status === 404 || r.status === 400) return { missing: true };
  return { error: `${r.status} ${body.slice(0, 160)}` };
}

async function upload(path, bytes, type) {
  const r = await reach(obj(NEW_URL, NEW_BUCKET, path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NEW_KEY}`,
      "Content-Type": type,
      "x-upsert": "true",
    },
    body: bytes,
  }, "this Aptus360");
  if (r.ok) return {};
  const body = await r.text();
  if (/bucket not found/i.test(body)) {
    fatal(`The destination bucket "${NEW_BUCKET}" does not exist on `
      + `${new URL(NEW_URL).host}. Migration 0263 creates it`, body);
  }
  if (r.status === 401 || r.status === 403) {
    fatal("The destination key was refused", body);
  }
  return { error: `${r.status} ${body.slice(0, 160)}` };
}

/* Asked of the destination, not taken from the upload's reply. The
   reply says what the server accepted; this says what is now there. */
async function sizeThere(path) {
  const r = await reach(obj(NEW_URL, NEW_BUCKET, path), {
    method: "HEAD",
    headers: { Authorization: `Bearer ${NEW_KEY}` },
  }, "this Aptus360");
  if (!r.ok) return null;
  const n = Number(r.headers.get("content-length"));
  return Number.isFinite(n) ? n : null;
}

/* ── Both ends, before the first file ──

   --check stops before uploading, so it never spoke to the
   destination at all: it reported "98 would copy" into a bucket that
   may not exist, and the first thing the real run would have said is
   "Bucket not found" after the user had already been told everything
   was fine.

   A HEAD on a path that cannot exist answers the only question that
   matters — is the bucket there and does the key work — and writes
   nothing, so it is honest in check mode too. */
async function probeDestination() {
  const r = await reach(obj(NEW_URL, NEW_BUCKET, ".probe-does-not-exist"), {
    method: "HEAD",
    headers: { Authorization: `Bearer ${NEW_KEY}` },
  }, "this Aptus360");
  /* 404 is the right answer: the bucket is there, the path is not.
     400 is how a missing bucket comes back, and 401/403 is the key.
     HEAD carries no body, so the status is all there is to read. */
  if (r.status === 400) {
    fatal(`The destination bucket "${NEW_BUCKET}" does not exist on `
      + `${new URL(NEW_URL).host}`,
      "migration 0263 creates it — run that first");
  }
  if (r.status === 401 || r.status === 403) {
    fatal("The destination key was refused", `HTTP ${r.status}`,
      "Check it is the service role key for this project, not the anon key.");
  }
}
await probeDestination();

const tally = { copied: 0, already: 0, missing: [], failed: [], wrongSize: [] };

console.log(`${files.length} attachments listed in ${CSV}`);
console.log(`  from  ${OLD_BUCKET} on ${new URL(OLD_URL).host}`);
console.log(`  into  ${NEW_BUCKET} on ${new URL(NEW_URL).host}`);
console.log(CHECK ? "  --check: reading only, nothing will be written\n" : "");

for (const [n, f] of files.entries()) {
  const label = `${String(n + 1).padStart(3)}/${files.length} ${f.path}`;

  const got = await download(f.path);
  if (got.missing) {
    tally.missing.push(f);
    console.log(`${label}\n      NOT IN THE OLD BUCKET`);
    continue;
  }
  if (got.error) {
    tally.failed.push({ ...f, why: got.error });
    console.log(`${label}\n      could not read it: ${got.error}`);
    continue;
  }
  if (f.size != null && got.bytes.length !== f.size) {
    /* Worth saying but not worth stopping for: the export's size is a
       note taken at the time, and the file is the thing being copied. */
    console.log(`${label}\n      note: ${got.bytes.length} bytes, the export `
      + `recorded ${f.size}`);
  }

  if (CHECK) {
    tally.copied += 1;
    console.log(`${label}  ${got.bytes.length} bytes, would copy`);
    continue;
  }

  const put = await upload(f.path, got.bytes, f.type);
  if (put.error) {
    tally.failed.push({ ...f, why: put.error });
    console.log(`${label}\n      could not write it: ${put.error}`);
    continue;
  }

  const now = await sizeThere(f.path);
  if (now != null && now !== got.bytes.length) {
    tally.wrongSize.push({ ...f, got: got.bytes.length, now });
    console.log(`${label}\n      WROTE ${got.bytes.length} BUT ${now} IS THERE`);
    continue;
  }
  tally.copied += 1;
  console.log(`${label}  ${got.bytes.length} bytes`);
}

console.log("\n────────────────────────────────────────");
console.log(CHECK ? `${tally.copied} would copy` : `${tally.copied} copied`);
if (tally.missing.length) {
  console.log(`${tally.missing.length} not in the old bucket:`);
  for (const f of tally.missing) console.log(`   NCR ${f.ncr}  ${f.name}`);
}
if (tally.failed.length) {
  console.log(`${tally.failed.length} failed:`);
  for (const f of tally.failed) console.log(`   ${f.path}\n     ${f.why}`);
}
if (tally.wrongSize.length) {
  console.log(`${tally.wrongSize.length} arrived the wrong size:`);
  for (const f of tally.wrongSize) console.log(`   ${f.path} — sent ${f.got}, there ${f.now}`);
}

const bad = tally.missing.length + tally.failed.length + tally.wrongSize.length;
if (bad === 0 && !CHECK) {
  console.log("\nEvery file the rows refer to is in the bucket. Run part 4.1 of "
    + "import_legacy_ncrs.sql to put the rows in.");
} else if (bad > 0) {
  console.log("\nDo NOT run part 4.1 yet: a row whose file is not there is a "
    + "broken link in the application.");
}
process.exit(bad ? 1 : 0);
