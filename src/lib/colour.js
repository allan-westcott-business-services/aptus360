/* Translucent variants of an area colour.

   The app's existing idiom is an eight-digit hex — `${colour}1a` — set
   from JavaScript, because the colour is data and a stylesheet cannot
   concatenate. `color-mix()` would do this in CSS, but it appears
   nowhere else in the app and the older browsers on site plant would
   drop the declaration entirely, taking the tile background with it.
   Eight-digit hex has been understood everywhere for years.

   Named by what they are for rather than by their opacity, so a tile
   that looks too strong is retuned in one place. */

const HEX = /^#[0-9a-f]{6}$/i;

/* `pct` is 0–100. Anything that is not a plain six-digit hex is handed
   back untouched: a caller passing a CSS variable or a named colour
   should get a usable colour rather than a broken one. */
export function alpha(colour, pct) {
  if (!HEX.test(String(colour))) return colour;
  const a = Math.round(Math.min(100, Math.max(0, pct)) * 2.55)
    .toString(16).padStart(2, "0");
  return `${colour}${a}`;
}

/* The set an area tile needs, as custom properties ready to spread into
   a style prop. One call means the square, its glyph and its focus ring
   cannot drift on to different tints of the same colour. */
export const areaVars = (colour) => ({
  "--sq": colour,
  "--sq-wash": alpha(colour, 6),
  "--sq-tint": alpha(colour, 16),
  "--sq-glow": alpha(colour, 26),
  "--sq-ring": alpha(colour, 55),
});
