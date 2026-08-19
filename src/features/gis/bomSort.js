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

/* ── Type before size ──

   Sorting on the number alone interleaves everything that has one. A
   gas section came out as 63mm main, 90mm main, a 90/63 reducer, a
   125mm main, a 125/90 reducer, a 125mm tee — sizes ascending and the
   types shuffled through each other, so a reader looking for what a
   scheme needs in the way of tees had to pick them out of the run of
   pipe.

   The order is the order somebody reads a bill in: where the gas comes
   in, the plant at the entry, the main itself smallest to largest with
   its total, then the fittings on that main, then what leaves it, then
   what it ends at.

   ── Matched on the name, like everything else here ──

   By the time a row reaches this it is a name and a quantity: the
   feature that produced it is gone, and so is its role. So these are
   patterns, ordered most specific first — "Main Tee" has to be tested
   before "Main", or every tee sorts as a length of pipe.

   Anything unrecognised sorts last rather than first. A row this does
   not know about is better at the foot of its section than wedged
   between the mains and their total, and it stays visible instead of
   looking like a kind of pipe. */
const TYPE_ORDER = [
  [/\bPOC\b/i, 10],
  [/\bgovernor\b/i, 20],
  [/\bsubstation\b/i, 20],
  [/\bpumping\b/i, 20],
  [/\bservice (joint|valve)\b/i, 55],
  [/\btop tee\b|\bHVTT\b/i, 56],
  [/\bmain tee\b/i, 40],
  [/\breducer\b/i, 45],
  [/\bjoint\b/i, 50],
  [/\bservice\b/i, 60],
  [/\bmeter\b/i, 70],
  [/\bspan node\b/i, 75],
  [/\bmains?\b/i, 30],
];

export function typeRank(item) {
  const text = String(item ?? "");
  for (const [re, rank] of TYPE_ORDER) if (re.test(text)) return rank;
  return 90;
}

/* The comparator the bill is sorted with: type, then size within it.

   byItemSize does the second half, so the two cannot disagree about
   what a size is — and a section with one type in it sorts exactly as
   it did before. */
export function byTypeThenSize(a, b) {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  return byItemSize(a, b);
}
