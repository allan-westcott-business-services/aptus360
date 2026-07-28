/* Plot range parsing, as the original: "1-50" or "1,2,5-10,22-30".

   Numbers are kept as text because plot numbers aren't always numeric —
   12A exists — but ranges only expand where both ends are plain numbers,
   since "12A-15B" has no meaningful sequence. */

import { symbolPath } from "../../lib/gisStyle.js";

export const MAX_PLOTS = 500;

export function parsePlotRange(input) {
  const out = [];
  const seen = new Set();
  const bad = [];

  String(input || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((part) => {
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        let [a, b] = [Number(m[1]), Number(m[2])];
        if (a > b) [a, b] = [b, a];
        if (b - a > MAX_PLOTS) { bad.push(part); return; }
        for (let n = a; n <= b; n++) {
          const v = String(n);
          if (!seen.has(v)) { seen.add(v); out.push(v); }
        }
        return;
      }
      if (/^[\w.]+$/.test(part)) {
        if (!seen.has(part)) { seen.add(part); out.push(part); }
        return;
      }
      bad.push(part);
    });

  return { numbers: out.slice(0, MAX_PLOTS), bad, truncated: out.length > MAX_PLOTS };
}

/* Which way the second click was from the seed. Whichever axis moved
   furthest wins, so a roughly-north click reads as north. */
export function directionFromDelta(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "E" : "W";
  return dy >= 0 ? "S" : "N";
}

export const DIRECTION_NAME = { N: "north", S: "south", E: "east", W: "west" };

/* Meter positions for a seed: a row on the chosen side, 2m out and 1.4m
   apart, centred on the seed. Same figures as the original. */
export const METER_OFFSET_M = 2.0;
export const METER_SPACING_M = 1.4;

export function meterPositions(seed, direction, count) {
  const [x, y] = seed;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i - (count - 1) / 2) * METER_SPACING_M;
    if (direction === "N") out.push([x + a, y - METER_OFFSET_M]);
    else if (direction === "S") out.push([x + a, y + METER_OFFSET_M]);
    else if (direction === "E") out.push([x + METER_OFFSET_M, y + a]);
    else out.push([x - METER_OFFSET_M, y + a]);
  }
  return out;
}

/* A small house outline, in metres, centred on the seed. Drawn as a path
   rather than a circle so a plot reads as a plot at a glance. */
/* Kept for callers that think in overall width. The shape itself lives
   in gisStyle.js so the canvas and the Admin preview can't drift apart —
   size here is the width across, twice the radius the symbol system
   uses, so existing call sites read the same. */
export function housePath(ctx, cx, cy, size) {
  symbolPath(ctx, "house", cx, cy, size / 2);
}
