/* ── A cut-out the network has to reach ──

   0209 placed a heavy duty cut-out by splicing it into an LV feeder:
   a fitting the cable passes THROUGH, no loss, no break, no feeder end
   point. Every rule that makes a fitting matter names the roles it
   acts on, and none of them named this one, so it was passive by
   construction. That is still right for a cut-out spliced into a run
   that already exists.

   It is not the whole of what one is for. A cut-out is also placed at
   the END of a mains trench, before any cable is drawn, as the thing
   the run terminates in — a supply taken off the end of the network
   with no dwelling behind it. Nothing had to be assigned to it, and
   that is precisely why the build could not see it: the router walks
   toward LOAD, and a cut-out with no plots is a branch worth nothing,
   so the cable stopped at the last plot and the trench past it stayed
   empty.

   ── What changes, and what deliberately does not ──

   One idea only: a branch holding a cut-out is worth cabling even when
   it carries no meters. The cut-out DEMANDS a cable; it does not
   pretend to be load.

   Everything else falls out of rules that already exist rather than
   being added:

     - At the end of a dig it becomes the last node the walk reaches,
       so the section ends there, so the end-of-line pass marks it, so
       a feeder end point lands on it. The same three steps that put a
       point at any other end.
     - Spliced mid-run it still has load flowing past it, is still not
       a break, and still gets no point of its own. Nothing here adds
       it to `breakAt`, and that is a decision rather than an omission:
       0209's passivity is a promise about a fitting a cable runs
       through, and this must not quietly withdraw it.

   ── Which circuit ──

   Its own, stated. A cut-out spliced into a feeder inherits the
   cable's circuit at placement; one placed on a bare trench has no
   cable to inherit from, so its editor asks. A cut-out on no circuit
   is reached by nobody — the same as a meter on no circuit, and said
   the same way by the build's blockers. */

export const HDCO_ROLE = "hdcutout";

/* Where it stands: the anchor the walk adopted, its geometry before
   that. The same reading every other fitting gets, so a cut-out that
   has been through a build is found where the build left it. */
export function hdcoAt(f) {
  const a = f?.Attributes?.Span_Anchor;
  if (Array.isArray(a) && a.length === 2) return a;
  return (f?.Geometry || [])[0] ?? null;
}

/* The cut-outs one walk should reach.

   `circuitId` null means every cut-out on the drawing, which is right
   for a trace of the whole network and never happens on a circuit
   walk. `linkWay` narrows it again where an output is being traced:
   two outputs of one box are two independent runs, and a cut-out on
   one is not the other's to reach. The same shape as the board rule,
   because it is the same question. */
export function hdCutoutsOn(features = [], circuitId = null, linkWay = null) {
  return (features || []).filter((f) => {
    if (f?.Feature_Role !== HDCO_ROLE) return false;
    if (f.Layer_Key !== "electric") return false;
    if (circuitId != null
      && Number(f.Attributes?.Circuit_ID) !== Number(circuitId)) return false;
    if (linkWay != null
      && f.Attributes?.Link_Way != null
      && Number(f.Attributes.Link_Way) !== Number(linkWay)) return false;
    return true;
  });
}

/* What a cut-out draws, where somebody has said.

   Zero by default and zero on every one placed before this existed: a
   cut-out is a termination, not a customer, and inventing a figure for
   it would size the cable to it for a load nobody has agreed. Where a
   designer DOES state one — a builder's supply, a pump, a future
   connection the run is being sized for now — it is load like any
   other, and the run to it is sized for it.

   Not a meter count. `metersAt` is what the service-tail machinery
   reads, and a cut-out has no service to find; counted as a customer
   it would report a leg with no service on a leg that is perfectly
   well terminated. The same distinction the board draws. */
export function hdcoKva(f) {
  const v = Number(f?.Attributes?.Supply_kVA);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/* Whether this model's walk ended at the cut-out rather than running
   past it — the difference between a terminal and a fitting spliced
   into a through run. Read from the model rather than from the
   drawing, because it is a fact about where the cable stops. */
export function isTerminal(model, index) {
  if (!model || index == null || index < 0) return false;
  const { parent = [], parSvc = [], cum = [], cumDemand = [] } = model;
  const carries = (i) => (cum[i] || 0) > 0 || (cumDemand[i] || 0) > 0;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] !== index || parSvc[i]) continue;
    if (carries(i)) return false;
  }
  return true;
}
