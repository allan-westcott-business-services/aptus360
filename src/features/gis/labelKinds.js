/* ── Which labels are on ──

   "Labels" was one switch. Everything the drawing writes on itself went
   off together: plot numbers, joint names, the tags along every cable
   and pipe, the levels beside a span node. On a site with a hundred
   services that is the only usable setting, because the service tags
   alone cover the geometry — so the switch was used as an off switch,
   and the plot numbers went with them.

   The tags are the part that crowds a drawing, and they crowd it in two
   distinguishable ways. Mains labels are read while designing the
   network; service labels are read while checking a plot. Somebody
   doing one does not want the other, and neither wants both at the zoom
   where a service tag is wider than the service.

   So the mains tags, the service tags and the levels beside a span node
   each get their own switch, and the old one stays as the master over
   everything else.

   ── Why mains and services start off ──

   A drawing opens to be read, and the geometry is what is read first.
   The tags are looked up: somebody asks what size that main is, and
   turns them on. Opening with several hundred of them on means the
   first act on every drawing is turning them off, which is the switch
   being used backwards.

   The joint labels start off with them, and for the same reason. There
   is a fitting at every plot on a feeder, each one named — "Service
   Joint" written down the road as many times as there are houses. That
   is the drawing's index, useful when somebody asks what is at a point
   and noise the rest of the time.

   The levels are the exception, and start on. They are a result rather
   than a property — they only appear once a check has been run, and a
   designer who has just run one is looking for exactly that number.
   There is nothing on screen to hide until they ask for it.

   ── Why this is a module and not four lines in the canvas ──

   It was four lines in the canvas: state, a setter and a rule, added
   with the plot seed icon fix and never wired to anything. The rule
   read the line type key alone, so `trench_main` was a main — while the
   comment under it said a trench follows the master switch. Nothing
   called it, so nothing disagreed with it yet.

   Out here it is checked by checklabelkinds.mjs against the type list
   the drawing actually uses. */

/* The layers whose lines carry a cable or a pipe.

   A trench is not a cable, so `trench_main` and `trench_service` are
   not governed by these switches — they keep the master Labels one,
   which is where somebody turning off "the labels" would look for them.

   Lighting is here because `light_service` is a service cable in every
   sense that matters to somebody reading a drawing. */
const CARRYING_LAYERS = ["electric", "gas", "water", "lighting"];

/* The switches, in the order the menu offers them.

   One list, read by the menu and by the default, so adding a fourth
   kind is a row here rather than a row here and a key somewhere else. */
export const LABEL_KINDS = [
  { key: "mains", label: "Mains labels", on: false },
  { key: "services", label: "Service labels", on: false },
  { key: "joints", label: "Joint labels", on: false },
  { key: "levels", label: "Span node levels", on: true },
];

export const DEFAULT_LABEL_KINDS = Object.fromEntries(
  LABEL_KINDS.map((x) => [x.key, x.on]),
);

/* Which switch a line's label answers to: "mains", "services", or null
   for a line that is neither and follows the master switch alone.

   By the line type rather than the layer, for the reason isMainType
   gives: a gas main and a gas service are both gas, so a rule that
   matched on layer would put every service tag under the mains switch.

   ── Why mains is the fallback and not a test of its own ──

   It was `isMainType`, which asks whether the key ends `_main` or the
   label says "main". That is the right question for a build status,
   where a main carries a stage and nothing else does — but it is the
   wrong one here. `elec_hv` is an HV cable and `elec_feeder` is an LV
   feeder: both are mains cables, neither says so, and both fell through
   to the master switch while every other cable on the drawing obeyed
   the mains one. The switch would have worked on most of a drawing.

   On a layer that carries cable or pipe there is no third thing. A line
   is a service or it is a main, so service is tested and mains is what
   is left. The list of carrying layers is what keeps that honest —
   anything outside it never reaches the fallback.

   The configured type is consulted for its layer and its label, so a
   type renamed in admin still lands on the right switch. */
export function labelKindOf(f, lineTypes = []) {
  if (!f) return null;

  /* Joints are points, not lines, and they are named rather than
     measured: "Service Joint", "Breech Joint", one against every
     fitting on the feeder. On a drawing with a joint at every plot that
     is a column of words down the road, and the geometry underneath it
     is what somebody is trying to read.

     Every kind of joint together. The type matters when deciding what a
     delete may remove; for reading a drawing they are one sort of
     writing on it, and offering four switches to silence one row of
     labels is four decisions to make the one you wanted. */
  if (f.Feature_Role === "joint") return "joints";

  if (f.Feature_Type !== "line") return null;

  const key = String(f.Attributes?.Line_Type ?? "");
  if (!key) return null;

  const t = lineTypes.find((x) => x.Type_Key === key);
  const layer = t?.Layer_Key ?? f.Layer_Key;
  if (!CARRYING_LAYERS.includes(layer)) return null;

  if (/service/i.test(key) || /service/i.test(t?.Label ?? "")) return "services";
  return "mains";
}

/* Whether to write a feature's own label.

   Both switches have to agree: the master says whether the drawing is
   labelled at all, and the kind's own switch says whether this sort of
   label is wanted. Turning the master off hides the lot, which is what
   it did before and what somebody reaching for it expects.

   Selection overrides both. Clicking a cable and being told nothing
   about it is the drawing refusing a direct question — the same reason
   the point labels have always drawn on selection whatever the Labels
   layer says.

   An unknown kind is shown rather than hidden. A drawing that quietly
   stops labelling something because a type was renamed is a fault
   nobody can see; one that labels too much is a fault somebody can. */
export function labelShown(f, {
  lineTypes = [], showLabels = true, kinds = DEFAULT_LABEL_KINDS,
  selected = false,
} = {}) {
  if (selected) return true;
  if (!showLabels) return false;

  const kind = labelKindOf(f, lineTypes);
  if (!kind) return true;              // not a cable or pipe: master only
  return kinds?.[kind] !== false;
}

/* The names these two went by before joints were added.

   `lineLabelKind` and `lineLabelShown` were accurate while only lines
   had a switch of their own. A joint is a point, so the rule had to
   cover points too and the old names stopped being true.

   Renaming an export is safe in a repo where every file moves at once.
   This one is hand-copied a file at a time, so for one deploy the
   canvas asked for a name this module had stopped exporting and the
   build stopped dead — a rename is not worth a broken deploy, and the
   two names cost nothing standing side by side.

   Kept rather than removed later: anything still importing the old name
   keeps working, and there is no version of this file that only one
   half of a pair of files can load. */
export { labelKindOf as lineLabelKind, labelShown as lineLabelShown };
