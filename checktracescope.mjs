/* One Trace, and it still stays on one network.

   Trace from a Point used to live on each utility menu, and the menu it
   was started from was how it knew whether "the pipe" meant gas or
   water. It is one item on Tools & Reporting now, so it starts with no
   utility named at all — `layerKey: null`.

   That opens a door this check exists to keep shut. A gas main and an
   LV cable share a trench and are STORED with the same geometry; the
   separation on screen is display offset. So a walk that follows "every
   line near the point" rather than "every line of this utility near the
   point" would step off the cable onto the pipe at the first shared
   vertex and report a network that does not exist — plausibly, with
   lengths and branch counts, which is the worst kind of wrong.

   The rule: null means ANY while the question is still open — the
   dialog lists what is under the click and asks which one — and the
   WALK is run with the layer of the line that was picked. Never null,
   never crossing.

   The functions are re-implemented here rather than imported, because
   they are closures inside a 32,000-line component. The source is read
   as well, so a re-implementation that drifts from it is caught. */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const SRC = "src/features/gis/GISCanvasPage.jsx";
const src = readFileSync(SRC, "utf8");

/* ── A trench sharing its route with everything in it ── */
const lineTypes = [
  { Type_Key: "trench_main", Is_Trench: true },
  { Type_Key: "elec_main", Is_Trench: false },
  { Type_Key: "gas_main", Is_Trench: false },
  { Type_Key: "water_main", Is_Trench: false },
];
const isTrenchType = (key, types) =>
  !!types.find((t) => t.Type_Key === key)?.Is_Trench;

const features = [
  { Feature_ID: 1, Feature_Type: "line", Layer_Key: "trench", Attributes: { Line_Type: "trench_main" } },
  { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric", Attributes: { Line_Type: "elec_main" } },
  { Feature_ID: 3, Feature_Type: "line", Layer_Key: "gas", Attributes: { Line_Type: "gas_main" } },
  { Feature_ID: 4, Feature_Type: "line", Layer_Key: "water", Attributes: { Line_Type: "water_main" } },
  { Feature_ID: 5, Feature_Type: "point", Layer_Key: "electric", Feature_Role: "substation" },
  { Feature_ID: 6, Feature_Type: "point", Layer_Key: "gas", Feature_Role: "governor" },
  { Feature_ID: 7, Feature_Type: "point", Layer_Key: "water", Feature_Role: "poc" },
  { Feature_ID: 8, Feature_Type: "point", Layer_Key: "electric", Feature_Role: "meter" },
];

const traceFollow = (layerKey, kind) => {
  if (kind === "trench") {
    return features.filter((f) => f.Feature_Type === "line"
      && isTrenchType(f.Attributes?.Line_Type, lineTypes));
  }
  return features.filter((f) => f.Feature_Type === "line"
    && (layerKey == null || f.Layer_Key === layerKey)
    && !isTrenchType(f.Attributes?.Line_Type, lineTypes));
};

const traceSources = (layerKey, kind) => {
  if (kind === "trench") return [];
  const roles = new Set(["poc", "substation", "source", "governor", "primary"]);
  return features.filter((f) => f.Feature_Type === "point"
    && (layerKey == null || f.Layer_Key === layerKey)
    && roles.has(f.Feature_Role));
};

const ids = (rows) => rows.map((f) => f.Feature_ID).sort((a, b) => a - b).join(",");

// ─── 1. Null offers every utility's lines, and never a trench ───
{
  const any = traceFollow(null, "cable");
  if (ids(any) !== "2,3,4") {
    fail(`an unnamed utility offers ${ids(any)}, expected the three mains 2,3,4`);
  }
  if (any.some((f) => isTrenchType(f.Attributes?.Line_Type, lineTypes))) {
    fail("a cable trace offered a trench");
  }
}

// ─── 2. A named utility is still only its own ───
{
  for (const [key, want] of [["electric", "2"], ["gas", "3"], ["water", "4"]]) {
    const got = ids(traceFollow(key, "cable"));
    if (got !== want) fail(`tracing ${key} offers ${got}, expected ${want}`);
  }
}

// ─── 3. The trench kind ignores the utility, as it always did ───
{
  if (ids(traceFollow(null, "trench")) !== "1") fail("an unnamed trench trace is wrong");
  if (ids(traceFollow("electric", "trench")) !== "1") {
    fail("a trench trace stopped following trenches when a utility was named");
  }
  if (traceSources(null, "trench").length) fail("a trench trace grew sources");
}

// ─── 4. Sources follow the same rule ───
{
  if (ids(traceSources(null, "cable")) !== "5,6,7") {
    fail(`an unnamed trace's sources are ${ids(traceSources(null, "cable"))}, expected 5,6,7`);
  }
  if (ids(traceSources("gas", "cable")) !== "6") fail("gas sources are not gas's alone");
  /* A meter is a place on the network, not a source of it. */
  if (traceSources(null, "cable").some((f) => f.Feature_Role === "meter")) {
    fail("a meter was offered as a source");
  }
}

// ─── 5. The walk is never run with the question still open ───
{
  /* What the dialog does: the picked line decides the layer, and that
     is what runTrace is given. */
  const resolve = (picked, started) => picked?.Layer_Key ?? started;

  for (const [id, want] of [[2, "electric"], [3, "gas"], [4, "water"]]) {
    const line = features.find((f) => f.Feature_ID === id);
    const got = resolve(line, null);
    if (got !== want) fail(`picking line ${id} traced "${got}", expected ${want}`);
    /* And having resolved it, the walk sees one utility only. */
    if (ids(traceFollow(got, "cable")) !== String(id)) {
      fail(`the walk after picking line ${id} still saw other utilities`);
    }
  }
  /* Nothing under the click: the layer stays whatever it started as,
     rather than becoming undefined. A trace started from a utility
     keeps it. */
  if (resolve(undefined, "gas") !== "gas") fail("a named utility was lost when nothing was picked");
  if (resolve(undefined, null) !== null) fail("an unnamed trace resolved to something");
}

// ─── 6. The source says the same as the model above ───
{
  const bit = (re, what) => { if (!re.test(src)) fail(what); };
  bit(/\(layerKey == null \|\| f\.Layer_Key === layerKey\)[\s\S]{0,200}isTrenchType/,
    "traceFollow no longer admits an unnamed utility");
  bit(/traceSources[\s\S]{0,700}\(layerKey == null \|\| f\.Layer_Key === layerKey\)/,
    "traceSources no longer admits an unnamed utility");
  /* The resolve, and the fact that the walk gets it rather than the
     open question. */
  bit(/const followLayer = chosen\?\.line\?\.Layer_Key \?\? tracePick\.layerKey/,
    "the dialog no longer works out which network was picked");
  bit(/runTrace\(p\.at, \{\s*layerKey: followLayer/,
    "the walk is still run with the utility the trace started with, not the one picked");
  if (/runTrace\(p\.at, \{\s*layerKey: p\.layerKey/.test(src)) {
    fail("the walk is run with the unresolved layer");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "One Trace for every utility: any network until you pick, one network once you have.");
process.exit(bad ? 1 : 0);
