/* What is on the street lighting drawing.

   ── Lighting is not a utility of its own ──

   Its columns run off the LV network, so the drawing somebody wants
   when they open the menu is the lighting plus the electric it hangs
   from — and deliberately not all of the electric.

   Shown: the lighting, the substation it comes from, the LV mains, the
   breech joints where a feeder divides, and the span nodes the levels
   are read on.

   Not shown: the services to plots, the service joints and the plot
   meters. Those are the house connections. They are the bulk of an
   electric drawing by count, and none of them has anything to do with a
   column. Nor the trench: the lighting cable runs in it, but a lighting
   drawing is not a dig drawing.

   ── Why this is not an ordinary isolate ──

   The canvas hides by class key, and a breech joint and a service joint
   carry the same ones — role:joint and electric:role:joint. Joint_Type
   is not a key at all. So no combination of keys can show one and hide
   the other, and no amount of pressing H and S would produce this
   drawing.

   Adding joint kinds to classKeys would fix that, and would change what
   every menu, every H and S button and the remembered layer state can
   see, to solve one drawing's problem. This is the narrower answer, and
   the circuit isolate sets the precedent: a rule the key sweep cannot
   express belongs in the filter rather than in the keys.

   ── Its own file ──

   Because it is a plain function of one feature, and a plain function
   of one feature can be checked. It lived in the canvas first, and the
   check that covered it had to keep a copy — which passed while the
   real one was broken, twice, before this was pulled out. */

import { isBreechJoint } from "./joints.js";

export function inLightingView(f) {
  /* The lighting itself, whatever is on that layer. */
  if (f?.Layer_Key === "lighting") return true;

  /* The points the levels are read on. They survive every other isolate
     too, by their own rule — the levels are read against a utility, and
     losing them when you look at one loses them exactly when they are
     wanted. */
  if (f?.Feature_Role === "spannode") return true;

  /* Where the supply comes from. Not gated on the layer below: a
     substation is a substation whichever layer somebody drew it on. */
  if (f?.Feature_Role === "substation") return true;

  if (f?.Layer_Key !== "electric") return false;

  /* The LV network, and nothing else drawn on the electric layer. A
     service is a house connection. */
  if (f?.Attributes?.Line_Type === "elec_main") return true;

  /* Breech joints only — where a feeder divides. A service joint is
     where one leaves for a plot, which is the part being left out. */
  if (f?.Feature_Role === "joint") return isBreechJoint(f);

  return false;
}
