/* The colours a status pill is drawn in.

   A status carries a background colour chosen in admin. The text colour
   is worked out from it rather than asked for, because the answer is
   forced: black on amber, white on dark green, and anybody made to pick
   would pick the same. Text_Colour overrides it for the one case the
   automatic answer gets legibly but unattractively right — a pale green
   pill whose text reads better in dark green than in black.

   The choice is made by contrast ratio, not by a brightness threshold.

   A threshold was tried first — light background, dark text — and it put
   white on amber, which is the less legible of the two pairs by a factor
   of four. The reason is that the relationship is not linear: at the
   midpoint both options are poor, and where the crossover actually falls
   depends on the text colours in play. Comparing the two candidates
   against the background answers the question directly instead of
   approximating it, and it is two more lines. */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/* #abc and #aabbcc both, since a colour picker writes one and a person
   pasting a brand colour may write either. */
export function parseHex(colour) {
  const m = HEX.exec(String(colour || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/* 0 is black, 1 is white. */
export function luminance(colour) {
  const rgb = parseHex(colour);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* Not pure black and white: text at full contrast on a coloured pill
   glares, and the app's own ink is #1f2937 everywhere else. */
const DARK = "#1f2937";
const LIGHT = "#ffffff";

/* How readable one colour is on another. 1 is invisible, 21 is black on
   white. The WCAG formula, because the question it answers — which of
   these two is easier to read — is exactly the question here. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* The style for a pill, given what admin recorded.

   A status with no colour set gets the neutral pill rather than nothing:
   a status somebody added and did not colour should still look like a
   status, and an unstyled span in a row of pills reads as a fault. */
export function pillStyle(colour, textColour) {
  const bg = parseHex(colour) ? String(colour).trim() : null;
  if (!bg) return { background: "#e5e7eb", color: "#374151" };

  const fg = parseHex(textColour)
    ? String(textColour).trim()
    : (contrast(bg, DARK) >= contrast(bg, LIGHT) ? DARK : LIGHT);

  return { background: bg, color: fg };
}
