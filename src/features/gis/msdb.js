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
export function msdbLoad(feature, consumption = []) {
  const heatSourceId = feature?.Attributes?.MSDB_Heat_Source_ID ?? null;
  const rows = apartmentRows(feature);
  let kva = 0;
  const missing = [];
  for (const r of rows) {
    const l = apartmentLoad(r, heatSourceId, consumption);
    if (l.missing) missing.push(r);
    else kva += l.kva;
  }
  return {
    count: rows.length,
    kva: Math.round(kva * 100) / 100,
    missing,
    heatSourceId,
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
export function apartmentLevels(feature, {
  at = null,
  cable = null,
  consumption = [],
  voltageV = 400,
} = {}) {
  const heatSourceId = feature?.Attributes?.MSDB_Heat_Source_ID ?? null;
  return apartmentRows(feature).map((r) => {
    const load = apartmentLoad(r, heatSourceId, consumption);
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
export function msdbText(feature, consumption = []) {
  const { count, kva } = msdbLoad(feature, consumption);
  const where = feature?.Attributes?.MSDB_Location;
  const floor = feature?.Attributes?.MSDB_Floor;
  const bits = [];
  if (where) bits.push(where);
  if (floor) bits.push(`${floor} floor`);
  bits.push(`${count} flat${count === 1 ? "" : "s"}`);
  if (kva > 0) bits.push(`${kva} kVA`);
  return bits.join(" \u00b7 ");
}
