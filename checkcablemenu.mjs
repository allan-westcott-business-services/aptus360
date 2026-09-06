/* What the cable menus offer, and in what order.

   Three dropdowns ask this — the mains editor, the service editor and
   Edit by kind — and each had its own copy of the answer. They agreed
   on the naming by accident and disagreed everywhere one of them had
   been corrected: the service editor filtered by usage, the mains
   editor read the raw catalogue (HV cores, earth, pilot and 20 kV
   triplex offered to somebody choosing an LV feeder), Edit by kind
   filtered but never sorted, and none of them ordered the list.

   `cableMenu.js` is the one answer. Driven here rather than matched in
   the source, so what is tested is the rule and not the text. */
import { readFileSync } from "node:fs";
import { cableMenu, cableMenuName, sortCablesByName } from "./src/features/gis/cableMenu.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const types = [
  { Cable_Type_ID: 1, Cable_Type: "3c WAVE", Usage_Type: "Mains" },
  { Cable_Type_ID: 2, Cable_Type: "Single Phase Service CNE", Usage_Type: "Service" },
  { Cable_Type_ID: 3, Cable_Type: "3 Core HV", Usage_Type: "HV" },
  /* A type saying nothing fits anywhere — a catalogue with no usage set
     still has to work. */
  { Cable_Type_ID: 4, Cable_Type: "LSZH MAINS", Usage_Type: "" },
  { Cable_Type_ID: 5, Cable_Type: "Retired Cable", Usage_Type: "Mains", Is_Active: false },
];
const sizes = [
  { Cable_Size_ID: 1, Cable_Type_ID: 1, Size_Label: "300", Rating_Amps: 435 },
  { Cable_Size_ID: 2, Cable_Type_ID: 1, Size_Label: "95", Rating_Amps: 235 },
  { Cable_Size_ID: 3, Cable_Type_ID: 1, Size_Label: "185", Rating_Amps: 335 },
  { Cable_Size_ID: 4, Cable_Type_ID: 2, Size_Label: "35", Rating_Amps: 174 },
  { Cable_Size_ID: 5, Cable_Type_ID: 3, Size_Label: "95", Rating_Amps: 200 },
  /* Rated zero, which is how an unfinished row reads in this catalogue
     rather than as a blank. */
  { Cable_Size_ID: 6, Cable_Type_ID: 1, Size_Label: "400", Rating_Amps: 0 },
  { Cable_Size_ID: 7, Cable_Type_ID: 4, Size_Label: "95" },
  { Cable_Size_ID: 8, Cable_Type_ID: 5, Size_Label: "95", Rating_Amps: 100 },
];
const names = (r) => r.list.map((c) => cableMenuName(c, types));

// 1. Alphabetical, with numbers as numbers. The catalogue's own order is
//    the order rows were entered: 300 above 95, HV among the mains.
{
  const got = names(cableMenu(sizes, types, { usage: "mains" }));
  const mains = got.filter((n) => n.startsWith("3c WAVE"));
  const want = ["3c WAVE 95", "3c WAVE 185", "3c WAVE 300", "3c WAVE 400"];
  if (JSON.stringify(mains) !== JSON.stringify(want)) {
    fail(`mains came out ${mains.join(", ")} — wanted ${want.join(", ")}`);
  }
  const inOrder = [...got].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  if (inOrder.join("|") !== got.join("|")) {
    fail(`the menu is not in name order: ${got.join(", ")}`);
  }
}

// 2. Usage decides the kind, and a type naming none fits anywhere.
{
  const got = names(cableMenu(sizes, types, { usage: "mains" }));
  if (got.some((n) => n.startsWith("3 Core HV"))) {
    fail("an HV cable is offered for a main");
  }
  if (got.some((n) => n.startsWith("Single Phase Service"))) {
    fail("a service cable is offered for a main");
  }
  if (!got.some((n) => n.startsWith("LSZH MAINS"))) {
    fail("a cable whose type names no usage was excluded — a catalogue "
      + "with no usage set would then offer nothing at all");
  }
  const svc = names(cableMenu(sizes, types, { usage: "service" }));
  if (!svc.some((n) => n.startsWith("Single Phase Service"))
    || svc.some((n) => n.startsWith("3c WAVE"))) {
    fail(`the service menu is wrong: ${svc.join(", ")}`);
  }
}

// 3. Retired rows stay out, by the type or by the size.
{
  if (names(cableMenu(sizes, types, { usage: "mains" }))
    .some((n) => n.startsWith("Retired"))) {
    fail("a retired cable type is still offered");
  }
  const one = cableMenu(
    [{ Cable_Size_ID: 9, Cable_Type_ID: 1, Size_Label: "50", Rating_Amps: 100,
      Is_Active: false }], types, { usage: "mains" },
  );
  if (one.filtered) fail("a retired SIZE is still offered");
}

// 4. requireRating, where the caller asks for it. A row with no rating —
//    or a zero — is a name somebody typed and never finished, and
//    choosing it sets a size the network cannot be checked against.
{
  const off = names(cableMenu(sizes, types, { usage: "mains" }));
  const on = names(cableMenu(sizes, types, { usage: "mains", requireRating: true }));
  if (!off.includes("3c WAVE 400")) {
    fail("the unrated cable is dropped even where no rating was asked for");
  }
  if (on.includes("3c WAVE 400")) {
    fail("a cable rated 0 is offered where a rating was required");
  }
  if (on.includes("LSZH MAINS 95")) {
    fail("a cable with no rating at all is offered where one was required");
  }
  if (!on.includes("3c WAVE 95")) fail("a rated cable was dropped");
}

// 5. Never an empty menu, and it says which happened. Somebody facing an
//    empty dropdown cannot tell a filtered list from a broken one.
{
  /* Every type here names a usage, so nothing can fall through on the
     "fits anywhere" rule — with the LSZH row in, `gas` still matched it
     and the menu was narrowed after all. */
  const strict = types.filter((t) => t.Usage_Type);
  /* And only sizes whose type survives. A size whose type is missing
     altogether reads as "no usage" too and fits anywhere — which is the
     right answer for an orphaned row, and would have made this case
     pass for the wrong reason. */
  const kept = sizes.filter((c) =>
    strict.some((t) => t.Cable_Type_ID === c.Cable_Type_ID));
  const r = cableMenu(kept, strict, { usage: "gas" });
  if (!r.list.length) fail("a usage nothing matches leaves an empty menu");
  if (r.filtered) fail("an unnarrowed menu claims to be narrowed");
  if (!cableMenu(sizes, types, { usage: "mains" }).filtered) {
    fail("a narrowed menu does not say so");
  }
}

// 6. The catalogue is not reordered under everything else reading it.
{
  const before = sizes.map((c) => c.Cable_Size_ID).join(",");
  sortCablesByName(sizes, types);
  if (sizes.map((c) => c.Cable_Size_ID).join(",") !== before) {
    fail("sorting reorders the lookups array in place");
  }
}

// 7. A size whose type has gone still reads as something.
{
  if (!cableMenuName({ Cable_Size_ID: 99, Size_Label: "95" }, types)) {
    fail("a size whose type has gone comes out blank in the menu");
  }
}

/* And all three menus go through it. */
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  const bulk = readFileSync("./src/features/gis/BulkEditor.jsx", "utf8");
  if (!/cableMenu\(/.test(editor)) fail("the feature editor builds its own menu");
  if (!/cableMenu\(/.test(bulk)) fail("Edit by kind builds its own menu");
  if (/\{\(lookups\?\.cableSizes \|\| \[\]\)\.map\(\(c\) => \{/.test(editor)) {
    fail("a cable menu still reads the raw catalogue");
  }
  /* The rating rule differs between them on purpose — see the note in
     BulkEditor. Held so it stays a decision somebody made rather than
     drifting further apart. */
  if (!/requireRating: true/.test(editor)) {
    fail("the feature editor no longer requires a rating");
  }
  /* The code, not the word: it appears in the note above the call that
     explains why the two differ. */
  if (/requireRating:/.test(bulk)) {
    fail("Edit by kind has gained a rating rule without the note saying "
      + "why the two menus differ");
  }
}

/* ── High voltage is not a usage ──

   `Usage_Type` says mains or service. Both HV and LV mains are "Mains",
   so a menu filtered on usage alone offered 3c WAVE 95, 185 and 300 to
   somebody sizing an HV cable — LV mains cable for a run at eleven
   kilovolts, which is not a mistake the catalogue should make
   possible.

   The catalogue has carried the answer since the seed:
   `Voltage_Rating_ID` on the cable type, LV / HV / HV+ / EHV. */
{
  const types = [
    { Cable_Type_ID: 1, Cable_Type: "3c WAVE", Usage_Type: "Mains", Voltage_Rating_ID: 1 },
    { Cable_Type_ID: 16, Cable_Type: "Triplex 11KV", Usage_Type: "Mains", Voltage_Rating_ID: 2 },
    { Cable_Type_ID: 18, Cable_Type: "Triplex 20KV", Usage_Type: "Mains", Voltage_Rating_ID: 3 },
    /* An earth cable has no voltage recorded at all. */
    { Cable_Type_ID: 13, Cable_Type: "Earth Cable", Usage_Type: "Mains", Voltage_Rating_ID: null },
  ];
  const ratings = [
    { Voltage_Rating_ID: 1, Voltage_Rating: "LV" },
    { Voltage_Rating_ID: 2, Voltage_Rating: "HV" },
    { Voltage_Rating_ID: 3, Voltage_Rating: "HV+" },
  ];
  const sizes = types.map((t, i) => ({ Cable_Size_ID: i + 1,
    Cable_Type_ID: t.Cable_Type_ID, Size_Label: "95", Rating_Amps: 200 }));
  const nameOf = (c) => types.find((t) => t.Cable_Type_ID === c.Cable_Type_ID).Cable_Type;

  const hv = cableMenu(sizes, types, { usage: "mains", requireRating: true,
    voltages: ["hv", "hv+", "ehv"], voltageRatings: ratings }).list.map(nameOf);
  if (hv.includes("3c WAVE")) {
    fail("an HV run is offered LV mains cable, which is what the catalogue "
      + "exists to prevent");
  }
  if (!hv.includes("Triplex 11KV") || !hv.includes("Triplex 20KV")) {
    fail("an HV run is not offered HV cable \u2014 a run at one voltage may be "
      + "laid in cable rated for a higher one");
  }
  /* A type with no voltage recorded is not offered where a voltage was
     asked for: putting an earth cable on an HV list because nobody
     filled the column in is the same fault as offering LV. */
  if (hv.includes("Earth Cable")) {
    fail("a cable with no voltage recorded is offered on an HV list");
  }

  const lv = cableMenu(sizes, types, { usage: "mains", requireRating: true,
    voltages: ["lv"], voltageRatings: ratings }).list.map(nameOf);
  if (!lv.includes("3c WAVE") || lv.includes("Triplex 11KV")) {
    fail("an LV run is not offered LV cable, or is offered HV");
  }

  /* ── Filtered only where the ratings are known ──

     The names reach the client with the rest of the lookups. Where that
     list is absent, every type fails the test and the dropdown comes up
     EMPTY — a worse answer than an unfiltered one, because an empty
     list looks like a catalogue with nothing in it and gives no way to
     carry on. */
  const noRatings = cableMenu(sizes, types, { usage: "mains", requireRating: true,
    voltages: ["hv"], voltageRatings: [] }).list;
  if (!noRatings.length) {
    fail("with no voltage ratings loaded the dropdown comes up empty rather "
      + "than unfiltered");
  }

  /* And the HV editor asks for it. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/Line_Type === "elec_hv"\s*\n?\s*\? \["hv", "hv\+", "ehv"\]/.test(editor)) {
    fail("the HV cable editor does not ask for HV cable");
  }
  if (!/voltageRatings: lookups\?\.voltageRatings/.test(editor)) {
    fail("the editor asks for a voltage without supplying the ratings to "
      + "match it against, so nothing is ever filtered");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Cable menus behave (one rule, right usage, name order).");
process.exit(bad ? 1 : 0);
