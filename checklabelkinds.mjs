/* Which labels a drawing writes on itself.

   "Labels" was one switch over everything: plot numbers, joint names,
   the tag on every cable and pipe, the levels beside a span node. The
   tags are what crowds a drawing, and a main's tag and a service's tag
   are wanted at different times — so each kind has its own switch and
   the old one is the master over the rest.

   The rule that sorts a line into a kind is the part worth checking. It
   reads the configured line type rather than the key alone, because a
   type can be renamed in admin, and because `trench_main` is a trench:
   the version of this rule that lived in the canvas called that a main,
   directly under a comment promising it was not. */
import {
  LABEL_KINDS, DEFAULT_LABEL_KINDS, lineLabelKind, lineLabelShown,
} from "./src/features/gis/labelKinds.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* The types a drawing actually carries, as seeded by 0050 and 0072. */
const TYPES = [
  { Type_Key: "elec_main", Label: "LV cable", Layer_Key: "electric" },
  { Type_Key: "elec_hv", Label: "HV cable", Layer_Key: "electric" },
  { Type_Key: "elec_feeder", Label: "LV feeder", Layer_Key: "electric" },
  { Type_Key: "elec_service", Label: "Electric service", Layer_Key: "electric" },
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas" },
  { Type_Key: "gas_service", Label: "Gas service", Layer_Key: "gas" },
  { Type_Key: "water_main", Label: "Water main", Layer_Key: "water" },
  { Type_Key: "water_service", Label: "Water service", Layer_Key: "water" },
  { Type_Key: "light_main", Label: "Lighting cable", Layer_Key: "lighting" },
  { Type_Key: "light_service", Label: "Lighting service", Layer_Key: "lighting" },
  { Type_Key: "trench_main", Label: "Mains trench", Layer_Key: "trench" },
  { Type_Key: "trench_service", Label: "Service trench", Layer_Key: "trench" },
];

const line = (key, layer = null) => ({
  Feature_Type: "line",
  Layer_Key: layer ?? TYPES.find((t) => t.Type_Key === key)?.Layer_Key ?? null,
  Attributes: { Line_Type: key },
});

const kind = (key) => lineLabelKind(line(key), TYPES);

// 1. Every mains cable and pipe is a main, on all four carrying layers.
for (const key of ["elec_main", "gas_main", "water_main", "light_main"]) {
  if (kind(key) !== "mains") fail(`${key} sorted as ${kind(key)}, wanted mains`);
}

// 2. And every service is a service.
for (const key of ["elec_service", "gas_service", "water_service", "light_service"]) {
  if (kind(key) !== "services") fail(`${key} sorted as ${kind(key)}, wanted services`);
}

// 3. A trench is neither.
//
//    It is not a cable or a pipe, so it keeps the master switch — which
//    is where somebody turning off "the labels" would look for it. The
//    rule this replaced matched `_main$` on the key and called
//    trench_main a main.
for (const key of ["trench_main", "trench_service"]) {
  if (kind(key) !== null) fail(`${key} sorted as ${kind(key)}, wanted neither`);
}

// 4. HV and the feeders are mains, though nothing in either key says so.
//
//    `elec_hv` is an HV cable and `elec_feeder` an LV feeder. Neither
//    ends `_main` nor says "main" in its label, so the build-status
//    test this rule first borrowed let both fall through to the master
//    switch — a mains switch that worked on most of a drawing.
for (const key of ["elec_hv", "elec_feeder"]) {
  if (kind(key) !== "mains") fail(`${key} sorted as ${kind(key)}, wanted mains`);
}

// 5. A type renamed in admin still lands on the right switch.
{
  const renamed = TYPES.map((t) => (t.Type_Key === "gas_service"
    ? { ...t, Label: "Gas connection" } : t));
  const got = lineLabelKind(line("gas_service"), renamed);
  if (got !== "services") fail(`a renamed gas service sorted as ${got}`);
}

// 6. Points and unknowns fall through rather than guessing.
{
  if (lineLabelKind({ Feature_Type: "point", Attributes: { Line_Type: "gas_main" } },
    TYPES) !== null) fail("a point was sorted as a line");
  if (lineLabelKind(null, TYPES) !== null) fail("a missing feature was sorted");
  if (lineLabelKind({ Feature_Type: "line", Attributes: {} }, TYPES) !== null) {
    fail("a line with no type was sorted");
  }
  /* A type nobody has configured, on a layer that carries pipe. Sorted
     by its key alone, which is all there is to go on. */
  if (lineLabelKind(line("gas_main", "gas"), []) !== "mains") {
    fail("an unconfigured gas main was not sorted by its key");
  }
}

// 7. Mains and services start off, levels on.
//
//    A drawing opens to be read, and several hundred tags is not a
//    drawing being read. The levels only exist once a check has run.
{
  const want = { mains: false, services: false, levels: true };
  for (const [k, v] of Object.entries(want)) {
    if (DEFAULT_LABEL_KINDS[k] !== v) {
      fail(`${k} defaults to ${DEFAULT_LABEL_KINDS[k]}, wanted ${v}`);
    }
  }
  if (LABEL_KINDS.length !== 3) fail(`${LABEL_KINDS.length} kinds offered, wanted 3`);
  /* The menu reads this list, so every key it offers has to be one the
     default knows about — a switch with no default is a switch that
     does nothing until it is pressed twice. */
  for (const k of LABEL_KINDS) {
    if (!(k.key in DEFAULT_LABEL_KINDS)) fail(`${k.key} is offered with no default`);
    if (!k.label) fail(`${k.key} is offered with no label`);
  }
}

// 8. Both switches have to agree.
{
  const gasMain = line("gas_main");
  const gasSvc = line("gas_service");
  const trench = line("trench_main");
  const shown = (f, kinds, showLabels = true) =>
    lineLabelShown(f, { lineTypes: TYPES, showLabels, kinds });

  const off = { mains: false, services: false, levels: true };
  const mainsOnly = { mains: true, services: false, levels: true };
  const both = { mains: true, services: true, levels: true };

  if (shown(gasMain, off)) fail("a main was labelled with mains labels off");
  if (shown(gasSvc, off)) fail("a service was labelled with service labels off");
  /* The trench is neither, so it follows the master alone and is still
     labelled while both are off. */
  if (!shown(trench, off)) fail("a trench lost its label to the mains switch");

  if (!shown(gasMain, mainsOnly)) fail("a main was not labelled with mains labels on");
  if (shown(gasSvc, mainsOnly)) fail("a service was labelled by the mains switch");
  if (!shown(gasSvc, both)) fail("a service was not labelled with service labels on");

  // The master still hides everything.
  for (const f of [gasMain, gasSvc, trench]) {
    if (shown(f, both, false)) fail("the master switch left a label on screen");
  }

  // And selection overrides both, so clicking always answers.
  for (const f of [gasMain, gasSvc, trench]) {
    if (!lineLabelShown(f, {
      lineTypes: TYPES, showLabels: false, kinds: off, selected: true,
    })) fail("a selected line was not labelled");
  }
}

// 9. A saved preference from before a kind existed does not hide it.
//
//    The canvas spreads the defaults under whatever was remembered, so
//    a fourth kind added later is on for somebody with a stored value
//    rather than silently absent. Checked here because the merge is the
//    reason lineLabelShown treats an unknown kind as shown.
{
  const stored = { mains: true };
  const merged = { ...DEFAULT_LABEL_KINDS, ...stored };
  if (merged.levels !== true) fail("an old stored preference hid the levels");
  if (merged.mains !== true) fail("a stored preference was lost to the defaults");
  /* And a kind missing from the object entirely still draws. */
  if (!lineLabelShown(line("gas_main"), { lineTypes: TYPES, kinds: {} })) {
    fail("a kind with no setting at all was hidden");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Label kinds behave (mains, services and levels switch separately; trenches follow the master).");
process.exit(bad ? 1 : 0);
