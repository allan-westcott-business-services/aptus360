/* A menu item that cannot do anything says so, and says why.

   Almost everything on these menus works on the dig: routing a circuit,
   laying a service, placing span nodes, checking the joins. On a
   drawing with no trench they can only report finding nothing — and a
   check that reports nothing reads as a PASS, which is worse than being
   unavailable. "Check Services Reach the Mains" on a drawing with no
   service trenches says every service reaches the mains.

   So the ones that need a trench are disabled without one, and the ones
   that need a service trench are disabled without one of those.

   ── And the hint says which ──

   Disabling on its own is a dead end: the item is grey and nothing
   explains it, so somebody clicks around looking for what they did
   wrong. Every guard here names the missing thing, and the app already
   does this for Build LV Network with no circuits. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* The two facts, computed once so every menu agrees. */
for (const [name, why] of [
  ["hasTrench", "whether the drawing has any trench"],
  ["hasServiceTrench", "whether it has a service trench"],
]) {
  if (!canvas.includes(`const ${name} = useMemo(`)) {
    fail(`${name} is not computed, so each item tests ${why} for itself and `
      + "they will disagree");
  }
}

/* Each guarded item: disabled on the fact, and a hint naming it. */
const items = [
  ["Check Services Reach the Mains", "hasServiceTrench",
    "it reports which service trenches fail to reach a main, so with none "
    + "drawn it reports a pass"],
  ["Place Span Nodes", "hasTrench",
    "nodes go at the junctions and ends of the trench network"],
  ["Check Trench Connectivity", "hasTrench", "there is no dig to be connected"],
  ["Check Trench Joins", "hasTrench", "there are no ends to be unjoined"],
  ["Auto Lay Service Trench", "hasTrench",
    "it runs services off the mains trench"],
];
for (const [label, fact, why] of items) {
  /* The MENU ITEM, not the first mention. Every one of these labels
     appears in a comment somewhere above the menus, and taking the
     first occurrence measured a paragraph of prose instead of an
     element \u2014 which reported three guards missing that were there. */
  let item = "";
  for (let i = canvas.indexOf(label); i >= 0; i = canvas.indexOf(label, i + 1)) {
    const from = canvas.lastIndexOf("<MenuItem", i);
    const to = canvas.indexOf("/>", i);
    if (from < 0 || to < 0 || i - from > 400) continue;
    item = canvas.slice(from, to);
    break;
  }
  if (!item) { fail(`"${label}" is not on any menu`); continue; }
  if (!item.includes(fact)) {
    fail(`"${label}" is offered with no ${fact} \u2014 ${why}`);
  }
  if (!/hint=\{/.test(item)) {
    fail(`"${label}" is disabled with no reason on it, which is a dead end`);
  }
}

/* Build LV Network needs both a circuit and a dig, and names them
   separately — they are fixed in different places. */
{
  let item = "";
  /* Renamed: it is one of four ways to get a feeder cable, so it reads
     as the automatic one. */
  for (let i = canvas.indexOf('"Auto Build LV Network"'); i >= 0;
    i = canvas.indexOf('"Auto Build LV Network"', i + 1)) {
    const from = canvas.lastIndexOf("<MenuItem", i);
    const to = canvas.indexOf("/>", i);
    if (from < 0 || to < 0 || i - from > 400) continue;
    item = canvas.slice(from, to);
    break;
  }
  if (!item.includes("hasTrench") || !item.includes("circuitsFrom")) {
    fail("Auto Build LV Network does not require both a trench to route "
      + "along and a circuit to route");
  }
  if (!/No trench drawn yet/.test(item)) {
    fail("Auto Build LV Network blames the circuits when the trench is what "
      + "is missing");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Menu guards behave (nothing offered that can only report nothing).");
process.exit(bad ? 1 : 0);
