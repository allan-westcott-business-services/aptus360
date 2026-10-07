/* How many rows the connections table actually builds.

   The legacy import took this page from a couple of thousand
   connections to 33,150. Each is a row of seventeen cells, so
   rendering them all is half a million DOM nodes and Chrome puts up
   "Page Unresponsive" — which is what it did.

   Two things keep it under control: groups start collapsed on a large
   table, and `planRows` shares a budget across whatever is open. The
   budget is the part worth checking, because its failure mode is a
   table that quietly shows fewer rows than it has — exactly the fault
   that let the endpoint's 2,000-row cap survive unnoticed for months.

   So: never more than the budget, never more than one group's share,
   never fewer than it could have shown, and a collapsed group gives
   its share back rather than wasting it. */
import { planRows } from "./src/features/connections/rowBudget.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const group = (label, n) => [label, Array.from({ length: n }, (_, i) => ({ i }))];
const sum = (plan) => [...plan.values()].reduce((t, n) => t + n, 0);

/* 1. The total is never exceeded, however many groups there are. */
{
  const groups = Array.from({ length: 1900 }, (_, i) => group(`p${i}`, 20));
  const plan = planRows(groups, {}, { perGroup: 1000, total: 2500 });
  if (sum(plan) > 2500) fail(`1,900 groups of 20 built ${sum(plan)} rows, over the 2,500 budget`);
  if (sum(plan) !== 2500) fail(`the budget was not spent: ${sum(plan)} of 2,500`);
}

/* 2. One enormous group cannot take the lot. */
{
  const groups = [group("huge", 30000), group("small", 50)];
  const plan = planRows(groups, {}, { perGroup: 1000, total: 2500 });
  if (plan.get("huge") !== 1000) fail(`one group built ${plan.get("huge")} rows, past its 1,000 ceiling`);
  if (plan.get("small") !== 50) fail("a small group after a huge one was starved");
}

/* 3. A small table is shown in full — the guard must not cost anything
      on the tables this page had before the import. */
{
  const groups = [group("a", 30), group("b", 12)];
  const plan = planRows(groups, {}, { perGroup: 1000, total: 2500 });
  if (plan.get("a") !== 30 || plan.get("b") !== 12) fail("a small table was trimmed for no reason");
}

/* 4. Collapsing frees the budget rather than wasting it. */
{
  const groups = [group("shut", 2000), group("open", 2000)];
  const plan = planRows(groups, { shut: true }, { perGroup: 1000, total: 1000 });
  if (plan.get("shut") !== 0) fail("a collapsed group was given rows to build");
  if (plan.get("open") !== 1000) fail(`the collapsed group's share was not passed on: open got ${plan.get("open")}`);
}

/* 5. Nothing negative, and no group promised more than it holds. */
{
  const groups = [group("a", 5), group("b", 0), group("c", 4000)];
  const plan = planRows(groups, {}, { perGroup: 1000, total: 10 });
  for (const [label, n] of plan) {
    const list = groups.find((g) => g[0] === label)[1];
    if (n < 0) fail(`${label} was planned ${n} rows`);
    if (n > list.length) fail(`${label} was planned ${n} rows but holds ${list.length}`);
  }
  if (sum(plan) > 10) fail(`a tight budget was overspent: ${sum(plan)}`);
}

console.log(bad ? `checkconnectionsrender: ${bad} FAILED`
                : "checkconnectionsrender: all passed");
process.exit(bad ? 1 : 0);
