/* Whether the main feeding a plot has been made live.

   ── Why it matters at the moment of picking ──

   A service call-off sends a gang to connect plots. If the main feeding
   them has not been energised or charged, there is nothing to connect
   to — the gang arrives, finds a dead main, and the visit is wasted.

   The drawing knows: a main carries its own stage, and a service
   records the main it tees into. So the question can be answered before
   the call-off is raised rather than on site.

   ── How a plot reaches its main ──

   Plot, then the service serving it, then the main that service meets.

   The service records what it touches in Connects, written when it was
   laid — so the link is read rather than recomputed, and a service
   somebody dragged is followed to wherever it now goes. Where Connects
   is missing, which is true of anything drawn before that was recorded,
   the geometry answers instead.

   ── Silence is not a yes ──

   A plot whose main cannot be found is reported as unknown rather than
   live. The whole point is to stop a gang being sent to a dead main,
   and an unanswerable question is not a reason to send them. */

import { isMainFeature, statusOf } from "./buildStatus.js";

const NEAR_M = 0.75;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Every line of one utility that ends at or near a point. */
function linesAt(point, features, utility) {
  if (!point) return [];
  return features.filter((f) => {
    if (f.Feature_Type !== "line") return false;
    if (f.Layer_Key !== utility) return false;
    const g = f.Geometry || [];
    if (g.length < 2) return false;
    return dist(g[0], point) <= NEAR_M
      || dist(g[g.length - 1], point) <= NEAR_M;
  });
}

/* The main a service runs back to.

   Connects first, because it is what the service recorded when it was
   laid. Geometry second, for anything drawn before that. */
function mainBehind(service, features, lineTypes) {
  const ids = Array.isArray(service?.Attributes?.Connects)
    ? service.Attributes.Connects : [];

  for (const id of ids) {
    const f = features.find((x) => Number(x.Feature_ID) === Number(id));
    if (f && isMainFeature(f, lineTypes)) return f;
  }

  /* Nothing recorded, or what it recorded is not a main. Both ends
     tried: a service is drawn from the main to the plot as often as the
     other way round. */
  const g = service?.Geometry || [];
  if (g.length < 2) return null;

  for (const end of [g[0], g[g.length - 1]]) {
    const hit = features.find((f) =>
      isMainFeature(f, lineTypes) && touches(end, f.Geometry || []));
    if (hit) return hit;
  }
  return null;
}

/* Whether a point sits on a line, anywhere along it.

   Along it, not at a vertex. A service tees into the middle of a main
   far more often than at one of its ends, and checking vertices alone
   found nothing for the ordinary case — the same mistake that made a
   staggered junction look like it had no tee. */
function touches(point, geometry) {
  for (let i = 0; i + 1 < geometry.length; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    if (!l2) {
      if (dist(a, point) <= NEAR_M) return true;
      continue;
    }
    let u = ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / l2;
    u = Math.max(0, Math.min(1, u));
    if (dist([a[0] + vx * u, a[1] + vy * u], point) <= NEAR_M) return true;
  }
  return false;
}

/* The closest main of a utility to a point, within reach.

   Reach matters: without it the answer is always some main somewhere,
   and a plot on a site with one gas main a quarter of a mile away would
   be judged against it. Sixty metres is further than any plot sits from
   the road it faces and closer than the next street. */
const REACH_M = 60;

function nearestMain(point, features, utility, lineTypes) {
  let best = null;
  for (const f of features) {
    if (f.Layer_Key !== utility) continue;
    if (!isMainFeature(f, lineTypes)) continue;
    const d = distanceToLine(point, f.Geometry || []);
    if (d == null || d > REACH_M) continue;
    if (!best || d < best.d) best = { d, f };
  }
  return best?.f ?? null;
}

/* How far a point is from a line, measured to the line rather than to
   its vertices — a plot opposite the middle of a long straight feeder
   is inches from it and a hundred metres from either end. */
function distanceToLine(point, geometry) {
  let best = null;
  for (let i = 0; i + 1 < geometry.length; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    let u = l2 ? ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    const d = dist([a[0] + vx * u, a[1] + vy * u], point);
    if (best == null || d < best) best = d;
  }
  return best;
}

/* Whether one plot can be connected for one utility.

   `anchor` is where the plot's supply arrives — its meter, or its
   boundary point where there is no meter. Both are passed in rather
   than looked up here, because which one a utility uses is the caller's
   business and this should not have a second opinion about it. */
export function plotSupplyState({
  anchor, utility, features = [], lineTypes = [],
}) {
  const services = linesAt(anchor, features, utility)
    .filter((f) => !isMainFeature(f, lineTypes));

  /* ── Before the services are laid ──

     A service call-off is raised to get the services put in, so at the
     moment somebody is picking plots there is usually no service cable
     to follow. Answering "unknown" then meant the whole rule never
     fired for the case it was written for.

     So where nothing runs to the plot yet, the nearest main of that
     utility is used instead. On a housing estate the feeder runs along
     the road the plot faces, and the nearest one is the one that will
     feed it — not a certainty, but a far better answer than none, and
     the plot is marked with what it found so anybody can see the
     verdict rather than take it on trust. */
  if (!services.length) {
    const main = nearestMain(anchor, features, utility, lineTypes);
    if (!main) {
      return { state: "unknown", why: "No main of this utility reaches this plot." };
    }
    const stage = statusOf(main);
    if (stage === "live") return { state: "live", main, viaNearest: true };
    return {
      state: stage ? "dead" : "unknown",
      main,
      viaNearest: true,
      why: stage
        ? "The Feeder Main is not yet live."
        : "The main nearest this plot has no status set.",
    };
  }

  /* Any live main is enough. A plot fed from two directions — rare, but
     it happens where a run has been split — can be worked as soon as
     one of them is charged. */
  let best = null;
  for (const sv of services) {
    const main = mainBehind(sv, features, lineTypes);
    if (!main) { best = best ?? { state: "unknown", main: null }; continue; }
    const stage = statusOf(main);
    if (stage === "live") return { state: "live", main };
    best = { state: stage ? "dead" : "unknown", main, stage };
  }

  if (!best || best.state === "unknown") {
    return {
      state: "unknown",
      main: best?.main ?? null,
      why: best?.main
        ? "The main feeding this plot has no status set."
        : "Cannot tell which main feeds this plot.",
    };
  }

  return {
    state: "dead",
    main: best.main,
    /* The words the office asked for, exactly. A message somebody has
       agreed is a message they will recognise on site. */
    why: "The Feeder Main is not yet live.",
  };
}

/* The same question asked of a list, for a panel that has to say which
   of the picked plots cannot be worked. */
export function deadPlots(plots = [], anchorOf, utilities = [], opts = {}) {
  const out = [];
  for (const plot of plots) {
    for (const utility of utilities) {
      const anchor = anchorOf(plot, utility);
      if (!anchor) continue;
      const r = plotSupplyState({ ...opts, anchor, utility });
      if (r.state === "dead") out.push({ plot, utility, why: r.why });
    }
  }
  return out;
}
