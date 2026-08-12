/* Ordering items by the size in their name.

   "125mm" sorts before "63mm" as text, so a bill read 125, 180, 63, 90
   \u2014 which is the order nothing is ever ordered in, and makes a reader
   check whether a size is missing rather than read down the column.

   The number is taken from the item text because that is where it is:
   the bill is rows of names and quantities, not features, and by the
   time it reaches here the catalogue row that produced "63mm" is gone.

   First number wins, so "185mm\u00b2 WF" sorts on 185 and "3 x 300mm"
   sorts on 3 rather than on 300 \u2014 which is right, because that is a
   cable with three cores and belongs with the small ones.

   Items with no number in them keep their names in order and sit after
   the sized ones: "Excavation" and "Reinstatement" are not sizes and
   have no place in a numeric run. */
export function sizeIn(text) {
  const m = String(text ?? "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function byItemSize(a, b) {
  const x = sizeIn(a);
  const y = sizeIn(b);
  if (x != null && y != null && x !== y) return x - y;
  if (x != null && y == null) return -1;
  if (x == null && y != null) return 1;
  return String(a ?? "").localeCompare(String(b ?? ""));
}
