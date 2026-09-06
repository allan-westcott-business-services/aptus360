import { serviceVoltDrop } from "./voltDrop.js";

/* A Multi Service Distribution Board.

   A block of flats is not forty-five plots on a drawing. One cable
   arrives at a board in a riser cupboard, one leaves it for the next
   board, and the dwellings hang off it on tails of a metre or two. Drawn
   as forty-five service points it is unreadable, unmovable, and wrong
   about what is actually in the ground.

   So the board is one object, and the dwellings are a TABLE on it. The
   drawing carries what is buried; the table carries what is in the
   building.

   ── What a row has to say ──

   Bedrooms, because that is what the load is looked up by, and a
   distance, because that is what the drop along its tail is worked out
   from. Everything else about a flat is derived: its load from the
   consumption table, its level from the board's level plus its own
   tail.

   Nothing here invents a figure. A bedroom count with no matching row
   in the consumption table contributes nothing and is REPORTED, the
   same way an unplaced plot's allowance is: a missing figure is a table
   somebody has to fill in, not a zero. */

export const FLOORS = [
  "Basement", "Ground", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th",
  "8th", "9th", "10th",
];

/* The most a board is expected to serve. Not a hard limit on the data —
   a drawing that already holds more should still open — but the point
   past which somebody has probably meant two boards. */
export const TYPICAL_MAX = 45;

export function apartmentRows(feature) {
  const raw = feature?.Attributes?.MSDB_Apartments;
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => ({
    id: r?.id ?? `a${i + 1}`,
    ref: r?.ref ?? "",
    bedrooms: Number(r?.bedrooms) || 0,
    distanceM: Number(r?.distanceM) || 0,
  }));
}

/* A blank row, so adding one from the editor and reading one from the
   drawing agree about what a row is. */
export function blankApartment(n) {
  return { id: `a${n}`, ref: String(n), bedrooms: 1, distanceM: 0 };
}

/* ── The load of one dwelling ──

   From `House_Type_Consumption`, keyed on bedrooms and heat source,
   which is the same table and the same columns a plot's allowance uses.
   Reading anything else here would be a second answer to a question the
   scheme has already answered. */
export function apartmentLoad(row, heatSourceId, consumption = []) {
  const hit = (consumption || []).find((c) =>
    Number(c.Bedrooms) === Number(row?.bedrooms)
    && Number(c.Heat_Source_ID) === Number(heatSourceId));
  const kva = Number(hit?.Consumption_kVA);
  return Number.isFinite(kva) && kva > 0
    ? { kva, missing: false }
    : { kva: 0, missing: true };
}

/* What the board draws, and what it could not work out.

   The sum is BEFORE diversity: the board's own connected load, which is
   what a designer checks against the fuse and what the network model
   then diversifies along with everything else. Applying diversity here
   as well would apply it twice. */
export function msdbLoad(feature, rows = [], consumption = []) {
  let kva = 0;
  const missing = [];
  for (const r of rows) {
    /* Each flat's own, from its plot. */
    const l = apartmentLoad(r, r.heatSourceId, consumption);
    if (l.missing) missing.push(r);
    else kva += l.kva;
  }
  return {
    count: rows.length,
    kva: Math.round(kva * 100) / 100,
    missing,
  };
}

/* ── The riser, from the boundary to the board ──

   The drawing stops at the boundary. A board on the fourth floor is
   fifteen metres further on, up a riser nobody has drawn and nobody
   can, and that cable drops volts like any other.

   Left out, every flat in the block reads better than it is \u2014 by the
   same amount, on every board, in the same direction. A figure that is
   wrong the same way every time is the hardest kind to notice.

   Added to the board's own level BEFORE the tails, because that is
   where it is: the levels check gives the figure at the boundary, this
   carries it up to the board, and each flat's tail carries it on from
   there.

   The load it carries is the whole board's, since every flat is fed
   through it. */
export function riserDrop(feature, {
  at = null,
  cable = null,
  kva = 0,
  voltageV = 400,
} = {}) {
  const lengthM = Number(feature?.Attributes?.MSDB_Riser_M) || 0;
  const tail = serviceVoltDrop({ cable, lengthM, kva, voltageV });
  if (!at) return { ohms: null, pct: null, lengthM, missingSpec: tail.missingSpec };
  return {
    lengthM,
    missingSpec: tail.missingSpec,
    ohms: (Number(at.ohms) || 0) + tail.ohms,
    pct: (Number(at.pct) || 0) + tail.pct,
    riserOhms: tail.ohms,
    riserPct: tail.pct,
  };
}

/* ── The level at a dwelling ──

   The board's own figure plus that dwelling's tail, which is exactly
   how a plot meter's cut-out figure is reached: the drop to the point
   on the main, plus the service that leaves it.

   `at` is the board's figure — ohms and percent — as the levels check
   produces for any stop. Absent, the rows still report their tails, and
   say that the rest is not known rather than reporting the tail as
   though it were the whole. */
export function apartmentLevels(feature, rows = [], {
  at = null,
  cable = null,
  consumption = [],
  voltageV = 400,
} = {}) {
  return (rows || []).map((r) => {
    const load = apartmentLoad(r, r.heatSourceId, consumption);
    const tail = serviceVoltDrop({
      cable,
      lengthM: r.distanceM,
      kva: load.kva,
      voltageV,
    });
    const known = at && !tail.missingSpec && !load.missing;
    return {
      ...r,
      kva: load.kva,
      missingLoad: load.missing,
      tailOhms: tail.ohms,
      tailPct: tail.pct,
      missingSpec: !!tail.missingSpec,
      /* Null rather than the tail on its own: a figure that looks like
         a level but leaves out everything before the board is worse
         than a blank, because it looks passable. */
      ohms: known ? (Number(at.ohms) || 0) + tail.ohms : null,
      pct: known ? (Number(at.pct) || 0) + tail.pct : null,
    };
  });
}

/* The worst dwelling on the board, which is the one that has to pass. */
export function worstApartment(levels = []) {
  let worst = null;
  for (const l of levels) {
    if (l.pct == null) continue;
    if (!worst || l.pct > worst.pct) worst = l;
  }
  return worst;
}

/* Said the way somebody would, for the drawing and a list. */
export function msdbText(feature, rows = [], consumption = []) {
  const { count, kva } = msdbLoad(feature, rows, consumption);
  const where = feature?.Attributes?.MSDB_Location;
  const floor = feature?.Attributes?.MSDB_Floor;
  const bits = [];
  if (where) bits.push(where);
  if (floor) bits.push(`${floor} floor`);
  bits.push(`${count} flat${count === 1 ? "" : "s"}`);
  if (kva > 0) bits.push(`${kva} kVA`);
  return bits.join(" \u00b7 ");
}

/* ── The flats come from the Plots tab ──

   A dwelling is a plot. It has a number, a house type, and a bedroom
   count already recorded against it, and asking for those again on the
   board would be a second place to say one thing — with no way to tell
   which was right when they disagreed.

   So the board holds only what the Plots tab cannot know: which flats
   hang off THIS board, and how far each is from it. Everything else is
   read from the plot.

   A property type is a flat when it says so. Matched on the type's NAME
   rather than an id, because the ids are per-scheme and the names are
   what somebody typed into Admin \u2014 and a scheme with no flat type at
   all should show an empty list rather than every house on the site. */
/* ── What a flat is called in a pill ──

   "1 bed Flat" is four words for a thing that appears forty-five times
   in one table. "1BF" is what a designer writes on a drawing, and the
   colour does the rest of the work \u2014 the same bedroom palette the
   placement panel and the property admin use, so a one-bed is the same
   colour wherever somebody meets it.

   The letter is the type's initial: F for a flat, A for an apartment, M
   for a maisonette. Anything else keeps its own initial rather than
   being forced into one of those, because a type nobody anticipated
   should read as itself. */
export function shortType(bedrooms, typeName) {
  const initial = String(typeName ?? "").trim().charAt(0).toUpperCase();
  return `${bedrooms || "?"}B${initial || "?"}`;
}

export function isFlatType(typeName) {
  return /\b(flat|apartment|maisonette|duplex)\b/i.test(String(typeName ?? ""));
}

export function flatsFromPlots({
  plotList = [], configs = [], propertyTypes = [],
} = {}) {
  const typeOf = (id) => (propertyTypes || [])
    .find((t) => Number(t.Property_Type_ID) === Number(id))?.Property_Type ?? "";
  const cfgOf = (id) => (configs || [])
    .find((c) => Number(c.Property_Config_ID) === Number(id));

  return (plotList || [])
    .map((p) => {
      const cfg = cfgOf(p.Property_Config_ID ?? p.property_config_id);
      const typeName = typeOf(cfg?.Property_Type_ID);
      return {
        plotId: p.plot_id ?? p.Plot_ID,
        ref: String(p.plot_number ?? p.Plot_Number ?? p.plot_id ?? ""),
        bedrooms: Number(cfg?.Bedrooms) || 0,
        typeName,
        code: cfg?.Code ?? "",
        /* ── The heat source is the plot's ──

           It is set against the plot on the Plots tab, along with the
           house type and everything else about the dwelling. Asking for
           it again on the board would be a second answer to a question
           already answered, and a block where two flats are heated
           differently \u2014 which happens, a ground-floor commercial unit
           among them \u2014 could not be described at all by one field on
           the board. */
        heatSourceId: p.Heat_Source_ID ?? p.heat_source_id ?? null,
        short: shortType(Number(cfg?.Bedrooms) || 0, typeName),
      };
    })
    .filter((p) => isFlatType(p.typeName));
}

/* What this board serves: the flats it has been given, in the order the
   Plots tab lists them, with the distance the board records for each.

   A board that names none serves none. Every flat on every board would
   be double counting on a scheme with two boards, and a board that
   quietly claimed the lot would size its cable for the whole block. */
export function servedFlats(feature, flats = []) {
  const picked = feature?.Attributes?.MSDB_Plot_IDs;
  const chosen = new Set(
    (Array.isArray(picked) ? picked : []).map(Number),
  );
  const dist = feature?.Attributes?.MSDB_Distances || {};
  return (flats || [])
    .filter((f) => chosen.has(Number(f.plotId)))
    .map((f) => ({
      ...f,
      id: `p${f.plotId}`,
      distanceM: Number(dist[String(f.plotId)]) || 0,
    }));
  /* `...f` carries heatSourceId and short through: the row the levels
     work on is the flat, not a copy of it with fields dropped. */
}

/* ── The flats' assumed meters ──

   Every flat has a meter. It is not drawn: forty-five points in a riser
   cupboard is what this object exists to avoid, and none of them would
   be anywhere the drawing could show them honestly.

   But a meter is how this application knows a load exists. `circuitsFrom`
   builds the circuit list out of meters carrying a Circuit_ID; the
   feeder model sizes cable by the meters a run reaches. A flat with no
   meter is a flat nothing counts.

   So the board's flats are meters that are ASSUMED rather than placed:
   real records, carrying the same attributes a drawn meter carries, at
   the board's own position because that is where their cable actually
   arrives.

   ── One circuit, from the board ──

   They take the board's circuit and output, because they are fed
   through the board. A flat on a different circuit from the board that
   feeds it would be a different building. Where somebody needs that,
   the answer is a second board.

   Not written to the drawing. These are derived on demand from the
   board and the Plots tab, so there is one place that says which flats
   exist and one that says which board they hang off \u2014 a copy written
   into the features would be a third, and it would go stale the moment
   somebody edited either. */
export function assumedMeters(feature, rows = []) {
  const a = feature?.Attributes || {};
  const at = a.Span_Anchor ?? feature?.Geometry?.[0] ?? null;
  const circuitId = a.Circuit_ID ?? null;
  return (rows || []).map((r) => ({
    /* Not a Feature_ID: these are not features, and giving them one
       that looks like a row's id invites something to try to save
       them. */
    assumedFor: Number(r.plotId),
    Feature_Role: "meter",
    Feature_Type: "point",
    Layer_Key: "electric",
    Plot_ID: r.plotId,
    Label: r.ref ? `Flat ${r.ref}` : "Flat",
    Geometry: at ? [[at[0], at[1]]] : [],
    Attributes: {
      Assumed: true,
      MSDB_ID: feature?.Feature_ID ?? null,
      Meter_Utility: "electric",
      Circuit_ID: circuitId,
      Circuit_Name: a.Circuit_Name ?? null,
      Circuit_Letter: a.Circuit_Letter ?? null,
      Link_Box_ID: a.Link_Box_ID ?? null,
      Link_Way: a.Link_Way ?? null,
      /* What it draws and how far its tail runs, so anything reading
         these does not have to go back to the consumption table. */
      Assumed_kVA: r.kva ?? null,
      Assumed_Tail_M: r.distanceM ?? 0,
    },
  }));
}

/* Whether the board has been told what feeds it. Two questions, and the
   second only applies where the circuit runs through a box: a circuit
   with no link box has no output to choose. */
export function msdbSupply(feature) {
  const a = feature?.Attributes || {};
  return {
    circuitId: a.Circuit_ID ?? null,
    boxId: a.Link_Box_ID ?? null,
    way: a.Link_Way ?? null,
    named: a.Circuit_ID != null,
  };
}
