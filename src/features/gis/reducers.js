/* ── Reducers on a gas main ──

   Where the main steps down a size, the joint between the two bores is a
   reducer, and it is drawn as a triangle in line with the pipe pointing
   the way the gas goes.

   ── One triangle per step of the ladder ──

   A reducer joins one bore to the next one down: 180 to 125, 125 to 90,
   90 to 63. There is no such thing as a 125/63 reducer, so a main that
   goes from 125 straight to 63 does not need one fitting, it needs two —
   a 125/90 and a 90/63, laid nose to tail. Two triangles, two lines on
   the bill, and the drawing says what would actually be dug in.

   The ladder comes from the configured pipe sizes rather than from a
   list written here. A scheme that carries a bore this file has never
   heard of still steps through the sizes that exist.

   ── Downstream, and only downstream ──

   A main narrows as it goes because there is less demand beyond each
   tee. Which way that is comes from the POC — the same walk outward the
   gas build makes — so the triangle points away from the POC along the
   pipe, and a size that grows going downstream is not a reducer at all.

   That case is already handled elsewhere: raising a size downstream
   rewrites everything upstream of it back to the POC to match, so by
   the time this reads the drawing there is nothing to find. Nothing
   here refuses it or draws anything for it.

   ── Pure ──

   Features in, positions out. The canvas turns these into features and
   the placing routine decides which are missing. */

import { gasMains } from "./topTees.js";

/* How far along, and how big.

   The first reducer sits 1.5 m from the centre of the tee — clear of
   the fitting rather than under it — and each further one follows nose
   to tail, its back against the point of the one before. So the nth
   triangle starts at 1.5 + (n-1) x its own length.

   Metres of ground, like everything else drawn to scale. The drawing
   shows a triangle about as long as a tee is wide, which is what these
   are set to; change them here and every reducer follows. */
export const REDUCER_FIRST_M = 1.5;
export const REDUCER_LEN_M = 1.1;
export const REDUCER_HALF_W_M = 0.55;

/* And never smaller than this on screen, for the reason the tees have
   the same floor: a fitting a metre long at a site-wide zoom is three
   pixels and cannot be seen against the pipe it sits on. */
export const REDUCER_MIN_PX = 14;

/* How close two pipes have to be to count as joined. The 0.25 m the
   drawing treats as connected everywhere else. */
export const REDUCER_JOIN_M = 0.25;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* The bore of a pipe, in millimetres.

   From the size in force — a hand-typed override where there is one,
   the built size otherwise — which is the same reading sizeMode makes
   and the same one the bill was corrected to use in 0167. A pipe with
   no size has no bore and takes part in nothing here: a reducer
   invented between a known size and an unknown one is a fitting nobody
   ordered. */
export function boreOf(f, sizes = []) {
  const a = f?.Attributes || {};
  const id = a.Manual_Gas_Pipe_Size_ID ?? a.Gas_Pipe_Size_ID ?? null;
  if (id != null) {
    const row = sizes.find((x) => Number(x.Gas_Pipe_Size_ID) === Number(id));
    if (row && Number(row.Diameter_mm) > 0) return Number(row.Diameter_mm);
  }
  /* Typed before the size became a choice from a table. Read as the
     number in it, so an older drawing still steps correctly. */
  const said = String(a.Manual_Size ?? a.Size ?? "");
  const n = Number(said.replace(/[^\d.]/g, ""));
  return n > 0 ? n : null;
}

/* The sizes a scheme can step through, largest first.

   Low pressure only, matching the build, and one entry per bore: the
   size table holds a rule per capacity band, so 63mm appears several
   times and a ladder built from the rows would step 63 to 63. */
export function sizeLadder(sizes = []) {
  const bores = new Set();
  for (const x of sizes) {
    if ((x.Pressure_Tier ?? "LP") !== "LP") continue;
    const d = Number(x.Diameter_mm);
    if (d > 0) bores.add(d);
  }
  return [...bores].sort((a, b) => b - a);
}

/* The steps between two bores, as pairs.

   125 to 63 on a ladder of 180/125/90/63 is [[125,90],[90,63]] — the
   two fittings that actually make that reduction. A drop to a bore that
   is not on the ladder gives the one step that was asked for rather
   than nothing: the size is real even where the table does not describe
   it, and drawing no reducer at a visible change of bore would be the
   drawing hiding something. */
export function stepsBetween(from, to, ladder = []) {
  if (!(from > 0) || !(to > 0) || to >= from) return [];

  const between = ladder.filter((d) => d < from && d > to).sort((a, b) => b - a);
  const chain = [from, ...between, to];
  const out = [];
  for (let i = 0; i + 1 < chain.length; i++) out.push([chain[i], chain[i + 1]]);
  return out;
}

/* A point a given distance along a polyline, starting from whichever
   end is at `from`, with the direction it is travelling there. */
function alongFrom(geom, from, metres) {
  const g = dist(geom[0], from) <= dist(geom[geom.length - 1], from)
    ? geom : [...geom].reverse();

  let left = metres;
  for (let i = 1; i < g.length; i++) {
    const seg = dist(g[i - 1], g[i]);
    if (seg <= 0) continue;
    if (left <= seg) {
      const t = left / seg;
      return {
        at: [g[i - 1][0] + (g[i][0] - g[i - 1][0]) * t,
          g[i - 1][1] + (g[i][1] - g[i - 1][1]) * t],
        dir: [(g[i][0] - g[i - 1][0]) / seg, (g[i][1] - g[i - 1][1]) / seg],
      };
    }
    left -= seg;
  }

  /* Past the end. The pipe is shorter than the fittings it needs, which
     is worth seeing rather than hiding: the last of them is put at the
     far end pointing the way the pipe runs, and it will visibly crowd. */
  const n = g.length;
  const seg = Math.max(1e-9, dist(g[n - 2], g[n - 1]));
  return {
    at: [g[n - 1][0], g[n - 1][1]],
    dir: [(g[n - 1][0] - g[n - 2][0]) / seg, (g[n - 1][1] - g[n - 2][1]) / seg],
    beyond: true,
  };
}

const ends = (f) => [f.Geometry[0], f.Geometry[f.Geometry.length - 1]];

/* Every reducer a gas drawing should have.

   Walked outward from the POC over the pipes themselves, so each pipe
   has an upstream neighbour and the direction of flow is a fact rather
   than a guess. Without a POC there is no downstream and nothing is
   returned — the same answer serviceValves gives to the same question,
   and for the same reason: valves appearing at every junction in both
   directions would be worse than none. */
export function reducersFor(features = [], opts = {}) {
  const {
    lineTypes = [], gasPipeSizes = [], joinM = REDUCER_JOIN_M,
    firstM = REDUCER_FIRST_M, lenM = REDUCER_LEN_M,
  } = opts;

  const mains = gasMains(features, lineTypes).filter((f) => (f.Geometry || []).length >= 2);
  if (mains.length < 2) return { reducers: [], unreached: [] };

  const poc = features.find((f) => f.Feature_Role === "poc" && f.Layer_Key === "gas"
    && (f.Geometry || []).length);
  if (!poc) return { reducers: [], unreached: [] };

  const ladder = sizeLadder(gasPipeSizes);

  /* Pipes as the graph, joined where their ends meet. Walking pipes
     rather than points because what is wanted is which pipe feeds
     which, and a junction is only the place that happens. */
  const touching = mains.map(() => []);
  for (let i = 0; i < mains.length; i++) {
    for (let j = i + 1; j < mains.length; j++) {
      for (const a of ends(mains[i])) {
        for (const b of ends(mains[j])) {
          if (dist(a, b) <= joinM) {
            touching[i].push({ other: j, at: a });
            touching[j].push({ other: i, at: b });
          }
        }
      }
    }
  }

  const at0 = poc.Geometry[0];
  const seen = new Array(mains.length).fill(false);
  const queue = [];
  for (let i = 0; i < mains.length; i++) {
    if (ends(mains[i]).some((e) => dist(e, at0) <= joinM * 8)) {
      seen[i] = true;
      queue.push(i);
    }
  }

  const reducers = [];
  while (queue.length) {
    const u = queue.shift();
    for (const { other: v, at } of touching[u]) {
      if (seen[v]) continue;
      seen[v] = true;
      queue.push(v);

      /* u feeds v, and the junction is `at`. A step down is a reducer
         per rung of the ladder between the two bores. */
      const from = boreOf(mains[u], gasPipeSizes);
      const to = boreOf(mains[v], gasPipeSizes);
      const steps = stepsBetween(from, to, ladder);
      if (!steps.length) continue;

      for (const [i, [a, b]] of steps.entries()) {
        const spot = alongFrom(mains[v].Geometry, at, firstM + i * lenM);
        reducers.push({
          at: spot.at,
          dir: spot.dir,
          from: a,
          to: b,
          /* Which pipe it sits on and where it tees off, so a later
             pass can tell whose it is without measuring. */
          pipe: mains[v].Feature_ID,
          upstream: mains[u].Feature_ID,
          junction: [at[0], at[1]],
          step: i + 1,
          of: steps.length,
          ...(spot.beyond ? { beyond: true } : {}),
        });
      }
    }
  }

  const unreached = mains
    .filter((_, i) => !seen[i])
    .map((f) => f.Feature_ID);

  return { reducers, unreached };
}

/* Which of those are not on the drawing yet.

   Matched on position and on the pair of bores, so a 125/90 is not
   taken for the 90/63 sitting a metre further along. One nudged by hand
   is still that step's fitting and stays nudged. */
export function missingReducers(features = [], reducers = [], nearM = REDUCER_LEN_M / 2) {
  const placed = features.filter((f) => f.Feature_Role === "reducer"
    && (f.Geometry || []).length);

  const same = (f, r) =>
    Number(f.Attributes?.From_mm) === r.from
    && Number(f.Attributes?.To_mm) === r.to
    && dist(f.Geometry[0], r.at) <= nearM;

  return {
    missing: reducers.filter((r) => !placed.some((f) => same(f, r))),
    orphans: placed.filter((f) => !reducers.some((r) => same(f, r))),
  };
}

export function angleOf(dir) {
  return Math.round((Math.atan2(dir[1], dir[0]) * 180) / Math.PI * 10) / 10;
}
