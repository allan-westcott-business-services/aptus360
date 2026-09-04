/* What the cable menus offer.

   The mains editor's "Manually set" listed the WHOLE catalogue, in the
   order rows were entered: HV cores, earth cable, pilot cable and 20 kV
   triplex, jumbled among the LV mains, for a designer choosing a feeder
   size. The service editor had been narrowed already — by Usage, and by
   the active flags — and the mains one was still reading the raw
   lookups.

   Three rules, one list, so the two menus cannot drift:

   - Usage decides the KIND of cable, as it already did;
   - `Rating_Amps` decides whether the catalogue has actually specified
     it. A row without one is a name somebody typed and never finished,
     and choosing it sets a size the network cannot be checked against;
   - alphabetical on the label as it reads on screen, numbers compared
     as numbers so 95 sorts before 185.

   Never an empty menu: where nothing survives, the whole catalogue is
   offered and the panel says so, because a designer facing an empty
   dropdown cannot tell a filtered list from a broken one. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");

const memo = (() => {
  const at = editor.indexOf("const cableChoices = useMemo(");
  return at < 0 ? "" : editor.slice(at, editor.indexOf("}, [lookups, cableUsage]);", at));
})();

if (!memo) fail("cableChoices has gone");
else {
  if (!/c\.Rating_Amps == null \|\| Number\(c\.Rating_Amps\) <= 0/.test(memo)) {
    fail("cables with no rating are still offered — a size the network "
      + "cannot be checked against");
  }
  if (!/localeCompare\(/.test(memo) || !/numeric: true/.test(memo)) {
    fail("the menu is not sorted by name, or sorts 185 before 95");
  }
  if (!/\[\.\.\.fits\]\.sort\(/.test(memo)) {
    fail("the sort is in place on an array from lookups — sort() mutates, "
      + "and that array is shared with everything else reading the catalogue");
  }
  if (!/byName\.length \? byName : sizes/.test(memo)) {
    fail("a catalogue with nothing rated leaves an empty menu, which reads "
      + "as broken rather than as filtered");
  }
  if (!/u === cableUsage/.test(memo)) {
    fail("Usage no longer decides which kind of cable is offered");
  }
}

/* Both menus, one list. */
{
  const menus = (editor.match(/cableChoices\.list\.map\(/g) || []).length;
  if (menus !== 2) {
    fail(`${menus} menu(s) read the filtered list, expected the mains and `
      + "the service editor");
  }
  if (/\{\(lookups\?\.cableSizes \|\| \[\]\)\.map\(\(c\) => \{/.test(editor)) {
    fail("a cable menu still reads the raw catalogue");
  }
}

/* And it says what was narrowed, naming both reasons — a catalogue with
   no Usage set and one with no ratings want different answers. */
if (!/with a Rating A, so the whole catalogue is/.test(editor)) {
  fail("an unnarrowed menu blames Usage alone, when a missing rating is "
    + "just as likely");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Cable menus behave (mains cables, rated, in alphabetical order).");
process.exit(bad ? 1 : 0);
