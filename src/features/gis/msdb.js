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

/* ── How many dwellings a board serves ──

   One answer, because the board has held its flats two ways: as plots
   PICKED onto it (`MSDB_Plot_IDs`, the current mechanism — the flats
   are rows on the Plots tab, ticked on in the board's editor) and as
   a manual table (`MSDB_Apartments`, the original one). The picked
   plots win where both exist, since they are what the load, the
   levels and the bill are worked from.

   Written for the substation's way rows, which counted the flats from
   the manual table alone — so a way feeding a board of picked plots
   read "0 meters" while carrying the board's whole kVA, a count and a
   figure disagreeing about the same object on the same line. */
export function boardFlatCount(feature) {
  const picked = feature?.Attributes?.MSDB_Plot_IDs;
  if (Array.isArray(picked) && picked.length) return picked.length;
  const rows = feature?.Attributes?.MSDB_Apartments;
  return Array.isArray(rows) ? rows.length : 0;
}

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

/* ── The run back down, and what leaves the board ──

   A board on the fourth floor is reached by a cable running up to it,
   and the feeder that carries on to plots elsewhere runs back DOWN to
   ground before it goes anywhere. Two vertical runs, not one, and they
   are not the same length: the outgoing cable may drop a different
   shaft.

   ── Which carries what ──

   The run UP carries everything the board draws: its own flats and
   whatever is fed onward through it. The run DOWN carries only what is
   downstream, because the flats are already taken off at the board.
   Sizing the down-run for the flats as well would be sizing it for load
   that never travels it.

   ── And the board's own figure does not move ──

   The drop down affects what LEAVES the board, not the board. Its flats
   hang off the board and are unaffected by a cable that runs away from
   them.

   Null where the board records no run down. A board nothing continues
   past has no cable going back to ground, and an empty field says that
   where a nought would claim a run of no length. */
export function outputDrop(feature, {
  at = null,
  cable = null,
  kva = 0,
  voltageV = 400,
} = {}) {
  const raw = feature?.Attributes?.MSDB_Down_M;
  if (raw == null || raw === "") return null;
  const lengthM = Number(raw) || 0;
  const tail = serviceVoltDrop({ cable, lengthM, kva, voltageV });
  if (!at) return { ohms: null, pct: null, lengthM, missingSpec: tail.missingSpec };
  return {
    lengthM,
    missingSpec: tail.missingSpec,
    ohms: (Number(at.ohms) || 0) + tail.ohms,
    pct: (Number(at.pct) || 0) + tail.pct,
    downOhms: tail.ohms,
    downPct: tail.pct,
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
      /* The riser, boundary to board. It is on every flat's route and
         on none of the network: the drawing stops at the boundary and
         the board is fifteen metres up a shaft nobody has drawn. A
         distance to a flat that leaves it out is short by the same
         amount for every flat in the block. */
      Assumed_Riser_M: Number(a.MSDB_Riser_M) || 0,
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

/* ── The boards, as the build sees them ──

   `buildLvNetwork` routes to METERS: it scans the features for them,
   attaches each to the nearest node on the dig, and sizes the cable by
   what it finds. A board's flats are not features, so the build did not
   know they existed \u2014 no cable was routed to the board and no stop was
   placed at it.

   So the features handed to the build include the boards' assumed
   meters. Everything downstream then works unchanged: the routing
   reaches the board because there is load there, the cable is sized for
   the flats it feeds, and a feeder end point lands at the board because
   that is where a run carrying load ends.

   ── Ids that cannot be mistaken for rows ──

   The build keys meters by `Feature_ID`, so these need one. They are
   NEGATIVE, derived from the board and the plot: no row has a negative
   id, so anything that tries to save one, look one up, or compare one
   against the drawing fails loudly rather than quietly writing a meter
   nobody placed.

   Never persisted. This is a view of the drawing for the length of one
   build, not an edit to it. */
export function assumedMeterId(msdbId, plotId) {
  return -(Math.abs(Number(msdbId) || 0) * 100000 + (Math.abs(Number(plotId)) || 0));
}

export function withAssumedMeters(features = [], {
  plotList = [], configs = [], propertyTypes = [], consumption = [],
} = {}) {
  const boards = (features || []).filter((f) => f.Feature_Role === "msdb");
  if (!boards.length) return features;

  const flats = flatsFromPlots({ plotList, configs, propertyTypes });
  const extra = [];
  for (const b of boards) {
    /* A board with no circuit is a board nothing can route to. Left out
       rather than routed to a circuit picked for it. */
    if (b.Attributes?.Circuit_ID == null) continue;
    const rows = servedFlats(b, flats).map((r) => ({
      ...r,
      kva: apartmentLoad(r, r.heatSourceId, consumption).kva,
    }));
    for (const m of assumedMeters(b, rows)) {
      extra.push({ ...m, Feature_ID: assumedMeterId(b.Feature_ID, m.assumedFor) });
    }
  }
  return extra.length ? [...features, ...extra] : features;
}

/* ── A cable from one board to another ──

   Two boards in one building, joined by a feeder somebody drew by hand
   through the structure. The dig stops at the first board and starts
   again at the second; between them the cable runs where no trench
   goes, and no routine could have laid it.

   ── Stamped, not deduced ──

   The cable records the two boards it joins, the way a POC route
   records its POC and its substation. The build then reads a fact
   instead of inferring one from shape: without it, dragging a board
   onto the end of an ordinary run would turn that run into a link with
   nothing said.

   `linkEnds` falls back to the ends' positions for cables drawn before
   the stamp existed. That fallback is exactly as good as the drawing —
   it disappears as cables are redrawn, and it never overrules a stamp. */
export const MSDB_LINK_REACH_M = 2;

export function stampLink(geometry = [], boards = []) {
  const g = geometry || [];
  if (g.length < 2) return null;
  const at = (p) => boards.find((b) => {
    const q = b.Attributes?.Span_Anchor ?? b.Geometry?.[0];
    return Array.isArray(q) && Array.isArray(p)
      && Math.hypot(q[0] - p[0], q[1] - p[1]) <= MSDB_LINK_REACH_M;
  });
  const a = at(g[0]);
  const b = at(g[g.length - 1]);
  if (!a || !b || Number(a.Feature_ID) === Number(b.Feature_ID)) return null;

  /* The circuit comes from the boards, which is the only place it is
     stated. Where they disagree it is left alone: a cable joining two
     circuits is a thing to be told about rather than stamped with
     whichever end was read first. */
  const ca = a.Attributes?.Circuit_ID;
  const cb = b.Attributes?.Circuit_ID;
  const agreed = ca != null && cb != null && Number(ca) === Number(cb)
    ? Number(ca) : null;

  return {
    MSDB_Link_A_ID: Number(a.Feature_ID),
    MSDB_Link_B_ID: Number(b.Feature_ID),
    ...(agreed != null ? {
      Circuit_ID: agreed,
      Circuit_Name: a.Attributes?.Circuit_Name ?? b.Attributes?.Circuit_Name ?? null,
      Circuit_Letter: a.Attributes?.Circuit_Letter ?? b.Attributes?.Circuit_Letter ?? null,
    } : {}),
  };
}

/* The two boards a cable joins, by the stamp where it has one and by
   its ends where it does not. Null for everything else, which is every
   cable on a drawing with no boards on it. */
export function linkEnds(line, boards = []) {
  if (line?.Feature_Type !== "line") return null;
  const type = String(line.Attributes?.Line_Type ?? "");
  if (!/main/i.test(type)) return null;
  /* ── A trench is never a link ──

     "trench_main" matches /main/, so a mains trench drawn between two
     boards was read as a link \u2014 and one already stamped as such keeps
     being read that way however the stamp got there.

     A link is a CABLE through a building where no trench goes. Where
     there IS a trench the routing walks it and needs no link at all,
     which is the whole reason this refuses. */
  if (/trench/i.test(type) || line.Layer_Key === "trench") return null;
  /* ── The build's own cable is not a link ──

     A link is a feeder somebody drew BY HAND through a building where
     no trench goes. Once the dig reaches both boards the build lays its
     own sections between them, and those sections end on two boards \u2014
     so they matched, and the next build made a link part for each,
     laying the run again. Three runs, three lots of cable, each build
     feeding the next.

     `Generated` is what the build stamps on everything it lays, and it
     is the discriminator the rebuild already uses to know what is
     its. */
  if (line.Attributes?.Generated) return null;

  const byId = (id) => boards.find((b) => Number(b.Feature_ID) === Number(id));
  const sa = line.Attributes?.MSDB_Link_A_ID;
  const sb = line.Attributes?.MSDB_Link_B_ID;
  if (sa != null && sb != null) {
    const a = byId(sa);
    const b = byId(sb);
    /* A stamp naming a board that has been deleted is not a link any
       more. Said by returning nothing rather than by half a pair. */
    return a && b ? { a, b, stamped: true } : null;
  }

  const guess = stampLink(line.Geometry, boards);
  if (!guess) return null;
  return { a: byId(guess.MSDB_Link_A_ID), b: byId(guess.MSDB_Link_B_ID), stamped: false };
}

/* ── Which board the network reaches first ──

   Measured back along the network to the source, not by the direction
   somebody happened to draw the cable in. The build runs UP TO the
   nearer board and resumes FROM the further one.

   `distanceTo` is asked of the caller, because only the canvas knows
   how far anything is from the substation. Absent for either board, the
   order cannot be settled and this says so instead of picking. */
export function linkOrder(ends, distanceTo) {
  if (!ends?.a || !ends?.b) return null;
  const da = distanceTo(ends.a);
  const db = distanceTo(ends.b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return da <= db
    ? { first: ends.a, second: ends.b, firstM: da, secondM: db }
    : { first: ends.b, second: ends.a, firstM: db, secondM: da };
}

/* ── What has to be settled before the network is built ──

   Build LV Network lays cable to the meters a circuit owns, along the
   trenches somebody has dug. Two things it cannot invent, and neither
   of which it complains about:

   A meter with no `Circuit_ID` belongs to no circuit, so no walk ever
   reaches it and no cable is run toward it. The build says nothing —
   the plot simply is not there as far as it is concerned, and the first
   anybody knows is a stretch of drawing with no cable on it. That is
   how "why is there no cable between node 2 and node 5" came to be a
   question: three plots past node 5 had no circuit, and the trench
   joining them was fine.

   A meter with no service trench has nothing for its tail to run along.
   The main can still be laid past it, so this one is quieter still: the
   feeder looks right and the plot is not connected to it.

   ── Except a flat on a board ──

   A flat is fed from its board's tails, which are recorded in the
   board's own table and never drawn as a trench. Asking for one would
   be asking somebody to draw a thing that does not exist. */
export function buildBlockers(features = [], opts = {}) {
  const {
    plotLabel = (id) => String(id),
    /* ── A self-lay plot is fed from somebody else's network ──

       It is not on one of our circuits and must never be: the
       incumbent's main feeds it, we dig to their tee and lay nothing
       past it. The build counted its meter among those "not on a
       circuit" and refused to run — 214 of 231, with the 17 short
       being exactly the 17 self-lay plots, none of which could ever
       be made to pass.

       Asked of the caller rather than worked out here, because the
       answer lives in `Plot_Utility.Self_Lay_Provider` — a table this
       module has no business loading. Defaulting to "no" keeps every
       existing caller reading as it did. */
    isSelfLay = () => false,
  } = opts;

  const meters = features.filter((f) => f.Feature_Role === "meter"
    && f.Layer_Key === "electric"
    && !isSelfLay(f));

  /* Flats sit on a board's table, by plot id. */
  const onABoard = new Set();
  for (const b of features) {
    if (b.Feature_Role !== "msdb") continue;
    for (const id of b.Attributes?.MSDB_Plot_IDs || []) onABoard.add(Number(id));
  }

  /* ── Which plots have a service trench ──

     A trench dug by Auto Lay Service names the seed it was dug for, and
     that link is exact where proximity is a guess: two plots on one
     drive are metres apart and either trench is "near" both.

     But a trench somebody DREW carries no stamp, and neither does a
     meter that was never placed by the same pass. On the reported
     drawing not one meter had a `Seed_Feature_ID`, so a rule built on
     the stamp alone flagged every plot on the site \u2014 including ten with
     a service trench plainly running to them.

     So the stamp where there is one and the ground where there is not.
     A blocker that cries wolf is worse than no blocker: it is the one
     everybody learns to click past. */
  const serviceLines = features.filter((f) => f.Feature_Type === "line"
    && /service/i.test(String(f.Attributes?.Line_Type ?? ""))
    && (f.Geometry || []).length > 1);

  /* ── And the dig it can reach without one ──

     A supply standing IN the mains trench needs no service trench of
     its own: the cable is teed where it already runs, and the build
     walks the trench graph to it exactly as it walks to anything else.
     Two EV charge points drawn on the mains route — 0.1 m off it —
     were flagged as unreachable on a drawing the model attached them
     both from, skipping nothing. That is the blocker crying wolf, and
     its own note above says why that is the worst way for it to be
     wrong.

     So the second question is the BUILD's question, at the build's own
     tolerance: is this meter on the trench network at all. Mains
     trenches are read at MAINS_REACH_M rather than the eight metres a
     service line gets, because the two facts are different — a
     service trench near a plot is somebody's intent to serve it, while
     a mains trench merely passing nearby is not. Standing on it is. */
  const mainsTrenches = features.filter((f) => f.Feature_Type === "line"
    && /trench/i.test(String(f.Attributes?.Line_Type ?? ""))
    && !/service/i.test(String(f.Attributes?.Line_Type ?? ""))
    && (f.Geometry || []).length > 1);

  const servedSeeds = new Set();
  for (const t of serviceLines) {
    const sid = t.Attributes?.Seed_Feature_ID;
    if (sid != null) servedSeeds.add(Number(sid));
  }

  /* ── How near counts as served ──

     A service trench commonly stops at the plot boundary with the meter
     several metres inside it, so a tight radius condemns plots whose
     trench is plainly there. Two metres flagged four of them.

     Eight, and deliberately generous. This blocker exists to catch the
     OBVIOUS omission \u2014 a plot with no service dug at all \u2014 and the two
     ways of being wrong are not equal: a plot wrongly let through gets
     a build somebody can see and re-run, while a plot wrongly flagged
     stops the work and teaches everybody to distrust the message. */
  const SERVICE_REACH_M = 8;
  /* Standing in the dig, not merely beside it. Two metres is a symbol
     dropped on a trench somebody drew, and narrower than the gap to
     the next trench along on any layout this has been read against. */
  const MAINS_REACH_M = 2;
  const within = (at, lines, reach) => {
    if (!Array.isArray(at)) return false;
    for (const t of lines) {
      const g = t.Geometry;
      for (let i = 1; i < g.length; i++) {
        const [ax, ay] = g[i - 1];
        const [bx, by] = g[i];
        const vx = bx - ax; const vy = by - ay;
        const l2 = vx * vx + vy * vy;
        let u = l2 ? ((at[0] - ax) * vx + (at[1] - ay) * vy) / l2 : 0;
        u = Math.max(0, Math.min(1, u));
        if (Math.hypot(at[0] - (ax + vx * u), at[1] - (ay + vy * u)) <= reach) {
          return true;
        }
      }
    }
    return false;
  };
  const nearAService = (at) => within(at, serviceLines, SERVICE_REACH_M);
  const inTheMainsDig = (at) => within(at, mainsTrenches, MAINS_REACH_M);

  const noCircuit = [];
  const noService = [];
  /* ── What to call a thing that has no plot number ──

     A non-residential supply is not a plot: no Plot_ID, no dwelling
     behind it, and nothing for plotLabel to turn into a number. It was
     still labelled through plotLabel(null), so the message came out as
     "2 plots with no service trench: , ." — two commas where the names
     should be, naming nothing and calling them the wrong kind of thing
     into the bargain.

     The supply's own name, from its seed where the drawing has one and
     from the meter's label otherwise. `isSupply` travels with it so
     the message can say "supply" rather than "plot". */
  const supplyName = (m) => {
    const nrs = m.Attributes?.NRS_ID;
    if (nrs != null) {
      const seed = features.find((f) => f.Feature_Role === "nrs"
        && Number(f.Attributes?.NRS_ID) === Number(nrs));
      if (seed?.Label) return String(seed.Label);
    }
    /* The meter's label less the "Electric Meter " it is built from,
       so a supply drawn before seeds carried names still says EVC 1
       rather than "Electric Meter EVC 1" in a list of things that are
       all meters. */
    const own = String(m.Label ?? "").replace(/^\s*(electric\s+)?meter\s+/i, "");
    return own || (nrs != null ? `Supply ${nrs}` : "");
  };
  for (const m of meters) {
    const plot = m.Plot_ID ?? m.Attributes?.Plot_ID ?? null;
    /* An NRS supply is not a plot and has no plot number to show. */
    if (plot == null && m.Attributes?.NRS_ID == null) continue;
    const isSupply = plot == null;
    const label = isSupply ? supplyName(m) : plotLabel(plot);

    if (m.Attributes?.Circuit_ID == null) {
      noCircuit.push({ id: m.Feature_ID, plot, label, isSupply });
    }

    if (plot != null && onABoard.has(Number(plot))) continue;
    /* ── The stamp is evidence FOR, never against ──

       A trench dug by Auto Lay Service names the seed it was dug for,
       and where that matches there is nothing more to ask.

       Where it does NOT match, it says nothing at all. A meter stamped
       by one pass and a trench drawn by hand, or by an older pass, or
       re-dug after the meter moved \u2014 all leave a stamp that pairs with
       nothing while a service trench runs to the plot in plain sight.
       Reading a mismatch as "no trench" flagged four plots whose
       trenches were on the drawing, which is the blocker crying wolf:
       the one everybody learns to click past.

       So: the stamp can prove a plot served and cannot prove it
       unserved. Anything the stamp does not settle falls to the
       ground. */
    const seed = m.Attributes?.Seed_Feature_ID;
    const served = (seed != null && servedSeeds.has(Number(seed)))
      || nearAService(m.Geometry?.[0])
      || inTheMainsDig(m.Geometry?.[0]);
    if (!served) noService.push({ id: m.Feature_ID, plot, label, isSupply });
  }

  return { noCircuit, noService, ok: !noCircuit.length && !noService.length };
}

/* ── A plot number belongs to a seed or to a flat, never both ──

   A seed is a plot on the ground with its own service; a flat is a
   dwelling fed from a board's tails. The same plot cannot be both, and
   nothing stopped somebody allocating it twice: the MSDB editor offered
   every flat-typed plot on the project, and Place Plots offered every
   plot number that was not already a seed.

   Allocated twice, the load is counted twice \\u2014 once at the seed and
   once on the board \\u2014 and the two are metres apart on the drawing.

   One function, so the two lists cannot disagree about who owns what:
   whichever screen is asked, a plot already spoken for is not on
   offer. */
export function plotsOnBoards(features = [], opts = {}) {
  const { except = null } = opts;
  const out = new Set();
  for (const b of features) {
    if (b.Feature_Role !== "msdb") continue;
    /* The board being edited is excluded, so its own flats stay in its
       own list \\u2014 otherwise opening the editor would empty it. */
    if (except != null && Number(b.Feature_ID) === Number(except)) continue;
    for (const id of b.Attributes?.MSDB_Plot_IDs || []) out.add(Number(id));
  }
  return out;
}

/* The plots already placed as a seed on the drawing. A seed carries its
   Plot_ID; a meter placed on one carries the same. */
export function plotsAsSeeds(features = []) {
  const out = new Set();
  for (const f of features) {
    const role = String(f.Feature_Role ?? "");
    if (role !== "seed" && role !== "plot" && role !== "meter") continue;
    const id = f.Plot_ID ?? f.Attributes?.Plot_ID ?? null;
    if (id != null) out.add(Number(id));
  }
  return out;
}
