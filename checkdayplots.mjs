/* A plot belongs to one day of a booking.

   Split a booking by day and each day carries its own plots: four on
   the Tuesday, the rest on the Wednesday. A plot ticked on both is the
   booking saying the same work happens twice — and the day rows are
   what go out to the field, so it is either two gangs at one plot or
   one gang doing it twice and billing twice.

   Nothing stopped it. The pills were drawn from the booking's plot list
   with no notion that a neighbouring day had already claimed one, and
   the page folds the days into a set before validation sees them, so
   the duplicate was gone by the time anything could object.

   Checked in two places for the reason the utility split gives: the
   panel greys the pill, and validate refuses the save. A disabled pill
   is a hint, and a booking saved before this rule existed still has to
   be able to say what is wrong with it. */
import {
  plotDayOwner, plotDayClashes, validate,
} from "./src/features/calloffs/assignments.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const TUE = "2026-08-18";
const WED = "2026-08-19";
const THU = "2026-08-20";

// 1. A booking that divides its plots properly has no owner clash.
{
  const clean = { [TUE]: ["18", "19", "20"], [WED]: ["21", "22"] };
  if (plotDayClashes(clean).length) {
    fail(`a properly divided booking reported ${plotDayClashes(clean).length} clash(es)`);
  }
  const owner = plotDayOwner(clean);
  if (owner.get("19") !== TUE) fail(`plot 19 was owned by ${owner.get("19")}`);
  if (owner.get("22") !== WED) fail(`plot 22 was owned by ${owner.get("22")}`);
  if (owner.has("35")) fail("a plot nobody ticked came out owned");
}

// 2. The screenshot: plot 22 on the Wednesday and the Thursday.
{
  const doubled = { [WED]: ["18", "19", "20", "21", "22"], [THU]: ["22", "35"] };
  const clashes = plotDayClashes(doubled);
  if (clashes.length !== 1) fail(`${clashes.length} clashes reported, wanted 1`);
  if (clashes[0]?.plot !== "22") fail(`the clash was reported on plot ${clashes[0]?.plot}`);
  if (clashes[0]?.days.join(",") !== `${WED},${THU}`) {
    fail(`the clash named days ${clashes[0]?.days.join(", ")}`);
  }
  /* The earlier day keeps it, so the pill that stays lit is the one
     already being worked towards. */
  if (plotDayOwner(doubled).get("22") !== WED) {
    fail("the later day took ownership of the doubled plot");
  }
}

// 3. Three days on one plot is still one clash, naming all three.
//
//    Counted by plot rather than by pair: a planner fixes it by
//    untickng two pills, and being told the same plot three times over
//    is one fault read as three.
{
  const thrice = { [TUE]: ["7"], [WED]: ["7"], [THU]: ["7"] };
  const clashes = plotDayClashes(thrice);
  if (clashes.length !== 1) fail(`one plot on three days reported ${clashes.length} clashes`);
  if (clashes[0]?.days.length !== 3) {
    fail(`three days were named as ${clashes[0]?.days.length}`);
  }
}

// 4. Order in, order out.
//
//    The days are read in date order rather than in whatever order the
//    object happens to iterate, so which day is called the owner does
//    not depend on the order somebody ticked them.
{
  const late = { [THU]: ["9"], [TUE]: ["9"] };
  if (plotDayOwner(late).get("9") !== TUE) {
    fail("ownership followed the order the days were ticked");
  }
  if (plotDayClashes(late)[0]?.days.join(",") !== `${TUE},${THU}`) {
    fail("the clash named its days out of date order");
  }
}

// 5. Nothing to go on produces nothing.
for (const empty of [undefined, null, {}, { [TUE]: [] }, { [TUE]: null }]) {
  if (plotDayClashes(empty).length) fail("an empty booking reported a clash");
  if (plotDayOwner(empty).size) fail("an empty booking reported an owner");
}

// 6. Validate refuses the save, and names the plot and both days.
{
  const draft = {
    Team_ID: 5, Task_Type_ID: 2, Plot_Range: "18-22,35",
    Start_Date: WED, End_Date: THU,
  };
  const opts = {
    phases: [], assignments: [], today: TUE,
    dayPlots: { [WED]: ["18", "19", "20", "21", "22"], [THU]: ["22", "35"] },
  };
  const said = validate(draft, opts).join(" | ");
  if (!/more than one day/.test(said)) {
    fail(`a doubled plot was allowed through: ${said}`);
  }
  if (!/22/.test(said)) fail("the message did not name the plot");
  /* Both days, formatted the way the panel prints dates — a message
     that named one day would leave the planner hunting the grid for
     the other. */
  if (!/19-Aug-2026/.test(said) || !/20-Aug-2026/.test(said)) {
    fail(`the message did not name both days: ${said}`);
  }
}

// 7. And says nothing when the days divide the plots properly.
{
  const draft = {
    Team_ID: 5, Task_Type_ID: 2, Plot_Range: "18-22,35",
    Start_Date: WED, End_Date: THU,
  };
  const said = validate(draft, {
    phases: [], assignments: [], today: TUE,
    dayPlots: { [WED]: ["18", "19", "20"], [THU]: ["21", "22", "35"] },
  }).join(" | ");
  if (/more than one day/.test(said)) fail(`a proper split was refused: ${said}`);
}

// 8. A booking that is not split by day is not tested.
//
//    The page passes the day plots only where the days carry their own.
//    The same plots every day is the ordinary booking, and reading a
//    stale list left over from a tick somebody unticked would refuse it
//    on the strength of a split it no longer has.
{
  const draft = {
    Team_ID: 5, Task_Type_ID: 2, Plot_Range: "18-22",
    Start_Date: WED, End_Date: THU,
  };
  const said = validate(draft, { phases: [], assignments: [], today: TUE }).join(" | ");
  if (/more than one day/.test(said)) {
    fail(`an unsplit booking was tested against day plots: ${said}`);
  }
}

// 9. The rule does not swallow the others.
//
//    A draft with a doubled plot and no team should still be told about
//    the team. Rules that return early hide the second fault until the
//    first is fixed, which is two trips through the form.
{
  const said = validate({
    Task_Type_ID: 2, Plot_Range: "18,22", Start_Date: WED, End_Date: THU,
  }, {
    phases: [], assignments: [], today: TUE,
    dayPlots: { [WED]: ["22"], [THU]: ["22"] },
  }).join(" | ");
  if (!/Choose a team/.test(said)) fail(`the team rule was lost: ${said}`);
  if (!/more than one day/.test(said)) fail(`the day rule was lost: ${said}`);
}

console.log(bad ? `\n${bad} problem(s)`
  : "Day plots behave (a plot belongs to one day of a booking, and the save says which).");
process.exit(bad ? 1 : 0);
