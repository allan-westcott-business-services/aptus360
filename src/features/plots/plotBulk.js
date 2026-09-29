/* What a bulk change to a selection of plots actually writes.

   ── Why this is its own file ──

   It was twenty lines inside `applyBulk`, between the API call and the
   error handling, and it holds three rules that decide what a plot
   draws — which is the figure every circuit, every main and every bill
   upstream is sized from. A rule that cannot be run without a browser
   is a rule nobody checks.

   ── The fault this was pulled out for ──

   "When I change the Heat Source or the ASHP model, the kVA value in
   the Plot table is not updating."

   Nothing was wrong with the page. `Plot.KVA_Load` is an OVERRIDE, and
   `gis_unplaced_plots` resolves a load as
   `COALESCE(pl."KVA_Load", <worked out from the house type and heat
   source>)` — so an entered figure wins over everything, for ever.
   Migration 0080 wrote 2.2 into every plot that had none AND set it as
   the column default, so every plot created since carries one. The
   calculated half of that COALESCE has therefore never been reached,
   and no heat source or heat pump model can move the number.

   0080 said so itself: "Reference data replacing this should drop the
   default as well as backfilling the rows — otherwise it quietly
   reappears on the next plot created." 0095 to 0097 brought the
   reference data and did neither.

   Clearing the placeholder is 0241 and is somebody's decision about
   live data. The part that belongs here is that the bulk bar could set
   an override and had NO WAY TO REMOVE ONE: blank meant "change
   nothing", so a plot could depart from the calculated figure and never
   come back. The heat source has had `__default` for exactly this
   reason since it was asked for. Now the two loads do too. */

import { takesHeatPump } from "../../lib/heatPump.js";

/* "Use the figure worked out for this plot" — the way back from an
   entered one, and distinct from "" which means "leave it alone".

   A sentinel rather than a second field, because the bulk bar holds one
   value per column and a pair of them would let somebody ask for a
   figure and its removal in the same apply. */
export const CALCULATED = "__calc";

/* The same idea on the heat source, which has had it longer: clear the
   plot's own so it follows the project default again. */
export const PROJECT_DEFAULT = "__default";

/* Both loads behave identically — "they are the same decision asked
   twice, what this plot draws, on each utility" — so neither gets the
   rule the other does not. */
export const LOAD_FIELDS = ["KVA_Load", "Gas_Load_kW"];

export const isCalculated = (v) => v === CALCULATED;

/* What to write to the Plot rows, from the state of the bulk bar.

   Only keys that are being changed: the PATCH updates exactly what it
   is handed, so a key present and empty would write an empty over
   whatever a plot had. */
export function planBulkChanges(bulk = {}, { heatSources = [] } = {}) {
  const changes = {};

  if (bulk.Property_Config_ID) {
    changes.Property_Config_ID = Number(bulk.Property_Config_ID);
  }

  if (bulk.Heat_Source_ID === PROJECT_DEFAULT) {
    /* A plot needs a way back to inheriting, not just a way to depart
       from it. The model goes with it: a heat pump on a plot whose
       source is unknown is a cost with nothing asking for it. */
    changes.Heat_Source_ID = null;
    changes.Heat_Pump_Model_ID = null;
  } else if (bulk.Heat_Source_ID) {
    changes.Heat_Source_ID = Number(bulk.Heat_Source_ID);
    /* A heat pump model only means anything on a heat pump plot.
       Switching to gas and leaving the model behind is how a plot ends
       up costed for both.

       Asked through `takesHeatPump`, which is the same test the picker,
       the GIS editor and 0097's own regex use. This used to be a fourth
       spelling of the question, `/pump|ashp|gshp|wshp/i`, written here
       and nowhere else — so a bulk change to GSHP kept a heat pump
       model that 0097 would never read, and the plot carried a model
       that no load was ever composed from. */
    const hs = heatSources.find(
      (h) => String(h.Heat_Source_ID) === String(bulk.Heat_Source_ID));
    if (!takesHeatPump(hs?.Heat_Source)) changes.Heat_Pump_Model_ID = null;
  }

  /* After the source, so choosing a model and a source together keeps
     the model — and so clearing it above still wins on a source that
     takes none. */
  if (bulk.Heat_Pump_Model_ID && changes.Heat_Pump_Model_ID !== null) {
    changes.Heat_Pump_Model_ID = Number(bulk.Heat_Pump_Model_ID);
  }

  for (const f of LOAD_FIELDS) {
    const v = bulk[f];
    if (isCalculated(v)) changes[f] = null;     // back to the worked-out figure
    else if (v !== "" && v != null) changes[f] = Number(v);
  }

  if (bulk.PV) changes.PV = bulk.PV === "y";

  /* Self-lay is deliberately NOT here. It writes Plot_Utility, one row
     per plot per utility, while everything above writes Plot — two
     tables, so two calls. Folding it in would make `changes` a bag that
     sometimes means a different table depending on which key is in it,
     and the updated count would mean two things. */
  return changes;
}
