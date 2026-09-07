/* A trench that refuses LV is not a way through.

   `Carries_LV` off is deliberate isolation: two circuits that must not
   meet, drawn to meet nowhere. The routing honoured it — no cable is
   laid across such a trench — but every DISTANCE walked straight over
   it, so a meter on one circuit was measured back to the substation
   through the other circuit's dig, and the two networks were one as far
   as anything measured was concerned.

   The cause: `networkFrom` declares a LOCAL `carries` that asks which
   LAYER a line is on, shadowing the module's own `carries`, which asks
   what a trench has been told to hold. Two functions of one name
   answering different questions, and only the wrong one was ever
   consulted. */
import { readFileSync } from "node:fs";
import { distancesFrom } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const src = readFileSync("./src/features/gis/electric.js", "utf8");

// 1. The real rule is consulted, under a name that cannot shadow.
{
  if (!/import \{ carries as carriesUtility \}/.test(src)) {
    fail("the module's own carries is not imported, so nothing reads what a "
      + "trench has been told to hold");
  }
  if (!/carriesUtility\(f, "electric", "lv"\)/.test(src)) {
    fail("distances do not ask whether a trench carries LV");
  }
  /* A cable is still a way through whatever a trench says: a cable that
     exists is a fact, and the flag is about where cable may be LAID. */
  if (!/!isTrenchLine\(f\) \|\| carriesUtility/.test(src)) {
    fail("the flag is applied to cables as well as trenches, so an existing "
      + "cable stops being a route");
  }
}

// 2. On a drawing with a deliberate gap.
{
  const raw = JSON.parse(readFileSync("./fixtures/drawing-6-msdb-link.json", "utf8"));
  const f = raw.features;
  const gap = f.find((x) => x.Attributes?.Carries_LV === false
    && /trench/i.test(String(x.Attributes?.Line_Type ?? "")));
  if (!gap) {
    fail("the fixture has no trench with LV switched off, so this case is "
      + "untested");
  } else {
    /* Each circuit reaches all of its own meters from its own origin \u2014
       isolating the two must not cut either in half. */
    for (const cid of [1, 2]) {
      const ms = f.filter((x) => x.Feature_Role === "meter"
        && Number(x.Attributes?.Circuit_ID) === cid);
      if (!ms.length) continue;
      const oid = ms.map((m) => m.Attributes?.Circuit_Origin_ID).find((x) => x != null);
      if (oid == null) continue;
      const d = distancesFrom(f, oid);
      const got = ms.filter((m) => d.has(Number(m.Feature_ID))).length;
      if (got !== ms.length) {
        fail(`circuit ${cid} reaches ${got} of its ${ms.length} meters from its `
          + "own origin \u2014 the isolation has cut a circuit in half");
      }
    }

    /* And neither circuit reaches the other's meters. */
    const c1 = f.filter((x) => x.Feature_Role === "meter"
      && Number(x.Attributes?.Circuit_ID) === 1);
    const o2 = f.filter((x) => x.Feature_Role === "meter"
      && Number(x.Attributes?.Circuit_ID) === 2)
      .map((m) => m.Attributes?.Circuit_Origin_ID).find((x) => x != null);
    if (o2 != null && c1.length) {
      const d = distancesFrom(f, o2);
      const crossed = c1.filter((m) => d.has(Number(m.Feature_ID))).length;
      if (crossed) {
        fail(`${crossed} of circuit 1's meters are measured from circuit 2's `
          + "origin, so the isolating trench is being walked across");
      }
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A trench that refuses LV is not walked across.");
process.exit(bad ? 1 : 0);
