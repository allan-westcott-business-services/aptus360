/* Subtotalling the mains on the bill.

   Its own file rather than sitting inside BomModal, because these are
   two plain functions of a row and a plain function can be checked
   without a browser — and the rule they encode is a string match, which
   is exactly the kind of thing that wants checking.
*/

/* Which rows are a main run, and what its subtotal is called.

   ── Why a subtotal at all ──

   A main split across three sizes is three rows, and how much main
   there is takes adding them up by hand — which is the first thing
   anybody does with this sheet. So the sheet does it.

   ── Matched on the item text ──

   gis_bom returns the item as a name, not as a line type key: "Water
   Main — 63mm", "Gas Main — 180mm", "Electric Main — Wavecon 95". There
   is no key to match on, so this reads the name.

   That is honest about what it can do. It matches "main" as a word,
   which is what every mains line type in the register is called, and it
   requires the row to be measured in metres — so a Meter, which
   contains the letters of neither, and a point count cannot be added to
   a length. A line type renamed to something without "main" in it drops
   out of the subtotal rather than being counted wrongly, which is the
   safe direction. */
export const isMainRun = (r) => r?.unit === "m" && /\bmains?\b/i.test(r.item || "");

/* What the trade calls the thing being totalled.

   "LV Cable" on electric rather than "Electric Main", because that is
   what it is called by the people reading this. Gas and water are
   already named the way they are spoken. */
export const mainName = (utility) => {
  const u = String(utility || "").toLowerCase();
  if (u.startsWith("elec")) return "LV Cable";
  if (u.startsWith("gas")) return "Gas Main";
  if (u.startsWith("water")) return "Water Main";
  return `${utility} Main`;
};
