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

  /* ── kW per Pump ──

     "Use the kVA value that is shown in the Plot table." That column is
     the PLOT's load, not the heat pump's own rating — on an air source
     plot 0097 composes it as the gas base plus half the fitted unit —
     and it is what was asked for.

     Only where every plot with a pump carries the same figure. A single
     number in a box that is right for forty plots and wrong for twenty
     five reads as definitive and is not, so where they differ the box
     is left blank and the comment says what the spread is. The engineer
     reading it can ask; a wrong number they do not know is wrong, they
     cannot. */
  const pumpKvas = [...new Set(pumps.map(kvaOf).filter((n) => n != null))];
  const heatPumpKva = pumpKvas.length === 1 ? round2(pumpKvas[0]) : "";

  /* The form asks "Number of Pumps" against "per property" in the table
     above it: one property, one pump. The number of PROPERTIES goes in
     the comment, where it is not mistaken for a per-property figure. */
  const heatPumpCount = pumps.length ? 1 : "";

  const bits = [];
  const say = (n, what) => `${n} ${n === 1 ? "plot" : "plots"} ${what}`;
  if (pumps.length) bits.push(say(pumps.length, "on an air source heat pump"));
  if (kinds.gas.length) bits.push(say(kinds.gas.length, "on gas"));
  if (kinds.electric.length) bits.push(say(kinds.electric.length, "electrically heated"));
  if (kinds.other.length) bits.push(say(kinds.other.length, "on another heat source"));
  if (kinds.unset.length) bits.push(say(kinds.unset.length, "with no heat source set"));

  if (pumps.length && pumpKvas.length > 1) {
    const lo = round2(Math.min(...pumpKvas));
    const hi = round2(Math.max(...pumpKvas));
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
