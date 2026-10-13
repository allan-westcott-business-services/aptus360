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

   ── Credentials ──

   Both service role keys are read from the environment and never
   printed. They bypass row level security entirely, so they belong in
   a shell that closes, not in a file and not in a chat window.

     export OLD_URL=https://<old-project>.supabase.co
     export OLD_KEY=<old service role key>
     export OLD_BUCKET=<the old bucket's name>
     export NEW_URL=https://<this project>.supabase.co
     export NEW_KEY=<this project's service role key>

     node copy_ncr_attachments.mjs --check    # reads only, writes nothing
     node copy_ncr_attachments.mjs            # copies

   NEW_BUCKET defaults to ncr-attachments, which 0263 creates.

   ── What it checks ──

   Every file is compared against the size the export recorded, after
   upload, by asking the new bucket rather than trusting the response.
   A file that arrives truncated is worse than one that never arrives:
   the link works and the document is wrong.
*/

import { readFileSync, existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check") || args.has("--dry-run");

const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is not set. See the header of this file.`);
    process.exit(2);
  }
  return v.replace(/\/+$/, "");
};

const OLD_URL = need("OLD_URL");
const OLD_KEY = need("OLD_KEY");
const OLD_BUCKET = need("OLD_BUCKET");
const NEW_URL = need("NEW_URL");
const NEW_KEY = need("NEW_KEY");
const NEW_BUCKET = (process.env.NEW_BUCKET || "ncr-attachments").replace(/\/+$/, "");

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
const fatal = (what, body) => {
  console.error(`\n${what}: ${body.slice(0, 200)}`);
  console.error("Nothing has been copied. Check the bucket names.");
  process.exit(2);
};

async function download(path) {
  const r = await fetch(obj(OLD_URL, OLD_BUCKET, path), {
    headers: { Authorization: `Bearer ${OLD_KEY}` },
  });
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
  const r = await fetch(obj(NEW_URL, NEW_BUCKET, path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NEW_KEY}`,
      "Content-Type": type,
      "x-upsert": "true",
    },
    body: bytes,
  });
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
  const r = await fetch(obj(NEW_URL, NEW_BUCKET, path), {
    method: "HEAD",
    headers: { Authorization: `Bearer ${NEW_KEY}` },
  });
  if (!r.ok) return null;
  const n = Number(r.headers.get("content-length"));
  return Number.isFinite(n) ? n : null;
}

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
