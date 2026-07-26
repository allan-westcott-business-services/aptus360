/* Bedroom colour palette, shared by the plot summary, the plot badges and
   the House Types admin screen — the same three places the original app
   used it. Three-bed carries black text: the yellow is too light for white. */
export const BED_COLORS = {
  1: { bg: "#7c3aed", fg: "#fff" },
  2: { bg: "#65a30d", fg: "#fff" },
  3: { bg: "#eab308", fg: "#000" },
  4: { bg: "#dc2626", fg: "#fff" },
  5: { bg: "#0ea5e9", fg: "#fff" },
  6: { bg: "#39467B", fg: "#fff" },
};

export const BED_FALLBACK = { bg: "#6b7280", fg: "#fff" };

export const bedColour = (beds) => BED_COLORS[Number(beds)] || BED_FALLBACK;
