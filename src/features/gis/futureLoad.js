/* Plots that are not on the drawing yet, allowed for in the sizing.

   ── The problem ──

   A phase two of fifty plots gets fed from an end span node on phase
   one. Nobody has drawn it, so nothing sizes for it — and the main laid
   today is sized for what is on the drawing today. When phase two
   arrives the main is too small and the answer is to dig the road up
   again.

   So a node can carry an allowance: this many plots, of these kinds,
   will one day be fed from here.

   ── Two ways to say it ──

   A breakdown — twenty three-bed on gas, ten four-bed on air source —
   which reads its loads from House_Type_Consumption, the same table
   every drawn plot reads. A future allowance and a real plot of the
   same description then size identically, and recalibrating that table
   moves both together.

   Or a plain figure per utility, for when the mix is not known, which
   on a phase nobody has designed is most of the time.

   Per utility, because one figure cannot serve three. What each wants
   is not the same shape either, which the schema already decided:

     gas       kW, from House_Type_Consumption.Gas_PID_kW
     electric  kVA, from House_Type_Consumption.Consumption_kVA
     water     nothing — water mains size by how many plots are beyond
               a point, not by load, so the count is the whole answer

   Both gas and electric read the same table every drawn plot reads, so
   a future allowance and a real plot of the same description size
   identically, and recalibrating that table moves both together.

   ── It reaches back to the point of connection ──

   Not just the leg it sits on. The main that feeds that node carries
   the future load too, and so does everything between it and the POC —
   which is the whole point, and also why one node's allowance can widen
   pipe across a site. Said on the drawing and in the sizing report
   rather than left to be discovered.

   ── It is not built, so it is not billed ──

   The bill lists what is being laid now. A bigger pipe costs more and
   that shows up as a larger diameter against the same metres, not as
   fifty plots nobody is connecting. */

export const ALLOWANCE_KEY = "Future_Allowance";

/* What a node is carrying, or null.

   Shaped so an empty allowance and no allowance are the same thing:
   somebody who opens the field, changes nothing and closes it has not
   made a claim about the future. */
export function allowanceOf(feature) {
  const a = feature?.Attributes?.[ALLOWANCE_KEY];
  if (!a || typeof a !== "object") return null;

  const rows = Array.isArray(a.rows)
    ? a.rows.filter((r) => Number(r?.count) > 0)
    : [];
  const manual = a.manual && typeof a.manual === "object" ? a.manual : {};
  const anyManual = ["gas", "electric"].some((u) => Number(manual[u]) > 0);

  if (!rows.length && !anyManual) return null;
  return { rows, manual, note: a.note ?? null };
}

/* How many supplies the allowance adds.

   Only from a breakdown. A manual figure is a load and says nothing
   about how many plots produce it — and the count is not decoration:
   gas reads its diversity factor against the number of supplies beyond
   a point, so a load with no count would be diversified as though one
   enormous house drew it.

   Which is the argument for the breakdown over the figure, and the
   reason a manual entry says what it cannot do. */
export function allowanceSupplies(allowance) {
  if (!allowance?.rows?.length) return 0;
  return allowance.rows.reduce((t, r) => t + (Number(r.count) || 0), 0);
}

/* The load an allowance adds for one utility.

   `consumption` is House_Type_Consumption as the lookups return it:
   a row per bedroom count and heat source. A breakdown row that finds
   no matching row contributes nothing and is reported rather than
   guessed at — a missing consumption figure is a table somebody has to
   fill in, not a zero. */
export function allowanceLoad(allowance, utility, consumption = []) {
  if (!allowance) return { value: 0, unmatched: [] };

  /* A typed figure wins for the utility it was typed against. Somebody
     who has written a number has answered this question, and a
     breakdown beside it is context rather than a contradiction. */
  /* Water takes no load figure at all — a number typed against it
     would be a quantity nothing reads. */
  const typed = utility === "water" ? 0 : Number(allowance.manual?.[utility]);
  if (typed > 0) return { value: typed, unmatched: [], fromManual: true };

  /* The columns as the schema has them, not as they might sensibly
     have been named. gis_unplaced_plots reads both of these to work out
     what a drawn plot draws, and reading anything else here would be a
     second answer to the same question.

     Water has no entry: its mains size on how many plots lie beyond a
     point rather than on a load, so allowanceSupplies is its whole
     contribution and there is nothing to look up. */
  const column = {
    gas: "Gas_PID_kW",
    electric: "Consumption_kVA",
  }[utility];
  if (!column) return { value: 0, unmatched: [] };

  let total = 0;
  const unmatched = [];

  for (const r of allowance.rows) {
    const row = consumption.find((c) =>
      Number(c.Bedrooms) === Number(r.bedrooms)
      && Number(c.Heat_Source_ID) === Number(r.heatSourceId));

    const per = Number(row?.[column]);
    if (!(per > 0)) {
      unmatched.push({ ...r, utility });
      continue;
    }
    total += per * (Number(r.count) || 0);
  }

  return { value: Math.round(total * 100) / 100, unmatched };
}

/* Said the way somebody would, for the drawing and the editor. */
export function allowanceText(allowance) {
  if (!allowance) return "";
  const n = allowanceSupplies(allowance);
  if (n) {
    return `${n} future plot${n === 1 ? "" : "s"} allowed for`;
  }
  const typed = ["gas", "electric"]
    .filter((u) => Number(allowance.manual?.[u]) > 0);
  return typed.length
    ? `future load allowed for (${typed.join(", ")})`
    : "";
}
