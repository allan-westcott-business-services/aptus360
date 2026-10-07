/* Does the connections endpoint read the whole table?

   This one query has been wrong three times, each differently, and
   every version looked fine on a small table:

     1. `.limit(2000)` with no ORDER BY. Whichever rows came back
        first, nothing saying the rest existed. A project with 238
        connections showed one of them and the badge beside it read 1.

     2. A sequential page-by-page loop. Honest, and 34 round trips for
        33,150 rows, which a Netlify function does not have time for.
        The page sat on "Loading connections" and timed out.

     3. Parallel ranges on a fixed stride of 1,000 — which SKIPS rows
        wherever PostgREST's own max-rows is lower, because the range
        after it starts past what came back. Silent loss again, and
        harder to see than the first version.

   What it is now: count, probe the first page to learn the real
   stride, then fetch the rest concurrently, and report `truncated`
   rather than present a short list as the whole of it.

   None of those three failures is visible on a table that fits in one
   page, which is why this check runs the real function against stub
   servers that behave the awkward ways a real one does: a server that
   caps pages below what was asked for, a table of seven rows, a table
   of exactly one page, an empty table, and a count that claims more
   rows than can be fetched.

   The function is read out of the endpoint source rather than copied
   here. A copy would go on passing after the endpoint changed, which
   is the failure mode a check is supposed to not have. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const SRC = "./netlify/functions/connections-all.js";
const src = readFileSync(SRC, "utf8");
const from = src.indexOf("async function readAll");
const to = src.indexOf("/* Every connection across every project.");

if (from < 0 || to < 0 || to < from) {
  fail(`${SRC} no longer defines readAll where this check can reach it`);
} else {
  const readAll = new Function(`${src.slice(from, to)}; return readAll;`)();

  /* A server that returns at most `serverMax` rows however many are
     asked for, which is what a PostgREST max-rows below the page size
     looks like from here. */
  const stub = (totalRows, serverMax, { countLies = 0 } = {}) => {
    const ALL = Array.from({ length: totalRows }, (_, i) => ({ id: i + 1 }));
    let requests = 0;
    const api = {
      requests: () => requests,
      from: () => api,
      select: (_c, opts) => (opts && opts.head
        ? Promise.resolve({ count: ALL.length + countLies, error: null }) : api),
      order: () => api,
      range: (a, b) => {
        requests++;
        return Promise.resolve({
          data: ALL.slice(a, a + Math.min(b - a + 1, serverMax)), error: null });
      },
    };
    return api;
  };

  const cases = [
    ["a full-size server",            33150, 1000, {}, 33150, false],
    ["a server capping pages at 500", 33150,  500, {}, 33150, false],
    ["fewer rows than one page",          7, 1000, {},     7, false],
    ["exactly one page",               1000, 1000, {},  1000, false],
    ["an empty table",                    0, 1000, {},     0, false],
    /* The count says 550 and only 500 can be fetched. Something was
       deleted while this ran, or a range came back short. Either way
       the page must not show 500 as though it were all of them. */
    ["a count larger than the rows",    500, 1000, { countLies: 50 }, 500, true],
  ];

  for (const [name, rows, max, opts, wantLen, wantTrunc] of cases) {
    const db = stub(rows, max, opts);
    const { rows: got, truncated } = await readAll(db, "T", "id", "id");
    const ids = got.map((r) => r.id);
    if (ids.length !== wantLen) {
      fail(`${name}: got ${ids.length} rows, expected ${wantLen}`);
    } else if (new Set(ids).size !== ids.length) {
      fail(`${name}: a row came back twice — the ranges overlap`);
    } else if (!ids.every((v, i) => v === i + 1)) {
      fail(`${name}: rows are out of order or a range was skipped`);
    } else if (truncated !== wantTrunc) {
      fail(wantTrunc
        ? `${name}: returned a short list without admitting it`
        : `${name}: claimed truncation on a complete read`);
    }
  }
}

console.log(bad
  ? `checkconnectionspaging: ${bad} FAILED`
  : "checkconnectionspaging: all passed");
process.exit(bad ? 1 : 0);
