/* How the properties on a site are heated, as an operator's form asks it.

   ── What was asked for ──

   "The data for the Heating Type section of the ENW POC Application
   form can be derived from the Project > Plots data where every plot
   has its Heat Source and kVA value. This can be rolled up to tick the
   relevant check box and fill in the table."

   The three boxes were `box(false, …)` — hard-coded unticked — and the
   pump row printed `heatPumpCount`, which `gather.js` set to `""` in
   the block for "fields the form wants and this database has nowhere to
   keep". It has somewhere: every plot carries a heat source, and the
   ones on a heat pump carry a model.

   ── Classified by name, like everything else here ──

   `Heat_Source` is a lookup somebody can rename in Admin, so the ids
   are whatever the table happened to be seeded with. 0097 matches on
   the name for exactly that reason — `ILIKE '%gas%'` for the gas boiler
   and a regex for air source — and `takesHeatPump` in lib/heatPump.js
   does the same. These are the same two rules, plus one for the
   electric sources that are not heat pumps.

   Anything unrecognised ticks **Other**, deliberately. The form's own
   note says what Other is for — "i.e. oil, off peak we storage,
   instantaneous wet central heating, etc" — and a heat source this file
   has never heard of is far likelier to be one of those than to be gas.
   Guessing it into Electric would put a load on the wrong infrastructure
   on a document a network operator sizes a connection from.

   More than one box can be ticked, because more than one can be true: a
   site part gas and part air source is an ordinary thing and the
   question is "how will your property/ies be heated", plural. */

import { takesHeatPump } from "../../../lib/heatPump.js";

/* The gas rule, as 0097 spells it. */
const isGas = (name) => /gas/i.test(String(name || ""));

/* Electric and NOT a heat pump: panel heaters, storage heaters, an
   immersion. The pumps are counted separately because the form counts
   them separately. */
const isPlainElectric = (name) => /electr|storage\s*heater|panel\s*heater/i
  .test(String(name || ""));

export function classifyHeatSource(name) {
  if (takesHeatPump(name)) return "heatpump";
  if (isGas(name)) return "gas";
  if (isPlainElectric(name)) return "electric";
  return "other";
}

/* The load a plot actually draws.

   `KVA_Resolved` is what the endpoint works out from the house type and
   the heat source; `KVA_Load` is the override somebody typed. The plots
   page reads exactly this pair for its kVA column, and that column is
   the one the figures here were asked to come from. */
const kvaOf = (p) => {
  const v = p?.KVA_Resolved ?? p?.KVA_Load;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n) => Math.round(n * 100) / 100;

export function heatingSummary({ plots = [], heatSources = [] } = {}) {
  const nameOf = (id) => heatSources
    .find((h) => String(h.Heat_Source_ID) === String(id))?.Heat_Source ?? "";

  const kinds = { heatpump: [], gas: [], electric: [], other: [], unset: [] };
  for (const p of plots) {
    if (p?.Heat_Source_ID == null || p.Heat_Source_ID === "") {
      kinds.unset.push(p);
      continue;
    }
    kinds[classifyHeatSource(nameOf(p.Heat_Source_ID))].push(p);
  }

  const pumps = kinds.heatpump;

  /* ── How many pumps, and what they come to ──

     Reported: "I have updated ten plots to have ASHP as their heating
     source but the ENW POC Application form is only showing one and it
     is not calculating the sum of the ASHP load."

     Both were decisions taken here, and both were wrong. The count was
     pinned to 1 because the table ABOVE this one is headed "Number per
     property", and that heading was read across to a table that says
     only "Number of Pumps" — an inference about somebody else's form,
     made from an adjacent heading, when the answer wanted was the plain
     one: ten plots on heat pumps is ten pumps.

     And the load is the SUM across them, not a per-plot figure. Asking
     for the maximum power required is asking what the site draws.

     Summing also disposes of the problem the old version had to work
     around. A single per-plot figure is only true when every plot
     carries the same one, so mixed models left the box blank; a total
     is correct whatever the mix. The spread still goes in the comment,
     because a reader may want to know the ten are not identical. */
  const pumpKvas = pumps.map(kvaOf).filter((n) => n != null);
  const heatPumpKva = pumpKvas.length
    ? round2(pumpKvas.reduce((a, n) => a + n, 0))
    : "";

  const heatPumpCount = pumps.length || "";

  const bits = [];
  const say = (n, what) => `${n} ${n === 1 ? "plot" : "plots"} ${what}`;
  if (pumps.length) bits.push(say(pumps.length, "on an air source heat pump"));
  if (kinds.gas.length) bits.push(say(kinds.gas.length, "on gas"));
  if (kinds.electric.length) bits.push(say(kinds.electric.length, "electrically heated"));
  if (kinds.other.length) bits.push(say(kinds.other.length, "on another heat source"));
  if (kinds.unset.length) bits.push(say(kinds.unset.length, "with no heat source set"));

  /* The spread, where there is one. Asked of the DISTINCT figures: the
     list is no longer deduplicated now that it is summed, so ten
     identical plots would otherwise read "between 3.4 and 3.4 kVA
     each", which is a sentence about nothing. */
  const distinctKvas = [...new Set(pumpKvas)];
  if (distinctKvas.length > 1) {
    const lo = round2(Math.min(...distinctKvas));
    const hi = round2(Math.max(...distinctKvas));
    bits.push(`heat pump plots draw between ${lo} and ${hi} kVA each`);
  }

  return {
    /* A heat pump is an electric heat source, so it ticks Electric. The
       pump table below is where it says so in detail; the box above is
       about what the heating runs on. */
    electric: pumps.length > 0 || kinds.electric.length > 0,
    gas: kinds.gas.length > 0,
    other: kinds.other.length > 0,
    heatPumpCount,
    heatPumpKva,
    heatPumpProperties: pumps.length,
    counts: {
      heatpump: pumps.length,
      gas: kinds.gas.length,
      electric: kinds.electric.length,
      other: kinds.other.length,
      unset: kinds.unset.length,
    },
    note: bits.join("; "),
  };
}
