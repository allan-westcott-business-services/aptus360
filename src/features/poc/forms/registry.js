import { isEnw, isNged, isNpg, isMua } from "./matching.js";
import { buildEnwDocument } from "./enw.js";

/* One row per operator form.

   A fifth operator is a row here, not another branch somewhere. `ready`
   marks the ones that have a replica built; the others are recognised
   and listed so the register can say the form is coming rather than
   pretending the operator is unsupported. */
export const FORMS = [
  {
    type: "ENW", label: "ENW form", title: "Electricity North West",
    matches: isEnw, build: buildEnwDocument, ready: true,
  },
  {
    type: "NGED", label: "NGED form", title: "National Grid Electricity Distribution",
    matches: isNged, build: null, ready: false,
  },
  {
    type: "NPG", label: "NPg form", title: "Northern Powergrid",
    matches: isNpg, build: null, ready: false,
  },
  /* Keyed on the adopting IDNO rather than the distributor. */
  {
    type: "MUA", label: "MUA form", title: "MUA Group",
    matches: isMua, build: null, ready: false,
  },
];

/* Every form that applies to this application.

   A list rather than the first hit: a POC naming a DNO for the
   connection and an IDNO to adopt the network legitimately needs both
   forms, and returning one would silently hide the other. */
export const formsFor = (poc, lookups) =>
  (poc ? FORMS.filter((f) => f.matches(poc, lookups)) : []);
