/* Which meters are somebody else's to connect.

   A plot can be self-lay on one utility and ours on another — a site
   where the water is laid by an SLP and the electric is not is ordinary.
   So the flag that matters is `Plot_Utility.Self_Lay_Provider`, one row
   per plot per utility, and NOT `Plot.Self_Lay_Provider`, which is the
   plot-level flag the Plots tab shows.

   Both exist, both are real, and 0066 says so in the view that carries
   them side by side: `pu."Self_Lay_Provider"` is per utility, `is_slp`
   is the plot's own. Reading the wrong one here would mark every meter
   on a plot that is self-lay for water alone, which is three crosses
   where one belongs.

   ── Why nothing new is fetched ──

   /projects/:id/connections already returns these rows with the column
   on them. No migration, no endpoint, no column list to keep in step —
   which matters, because a column added to the database and not to a
   function's select list is recurring fault 4 and has bitten three
   times.

   ── What absence means ──

   A Plot_Utility row is created when connections are generated. Before
   that a plot has no row for any utility, so nothing is marked. That is
   the right way round: no row means nobody has said this connection is
   self-lay, which is not the same as it being ours, but marking on
   silence would put a cross on every meter of every project that has
   not reached that stage yet. */

const key = (plotId, utilityId) => `${Number(plotId)}:${Number(utilityId)}`;

/* The set of plot-and-utility pairs somebody else lays.

   A set rather than a scan, because this is asked once per meter per
   frame and a drawing has hundreds of meters on it. */
export function selfLaySet(connections = []) {
  const out = new Set();
  for (const c of connections || []) {
    if (!c?.Self_Lay_Provider) continue;
    if (c.Plot_ID == null || c.Utility_ID == null) continue;
    out.add(key(c.Plot_ID, c.Utility_ID));
  }
  return out;
}

/* The supplies somebody else lays, by NRS_ID.

   A set for the same reason the pairs above are one: this is asked once
   per meter per frame. It also keeps a lookup function out of the
   drawing loop, and out of the canvas's `nrsById` call sites — those
   are counted by checknrs, because a feeder model built without one
   reports a supply carrying no load. Nothing here builds a model, and a
   thirteenth call site would have made that count read as a fault. */
export function selfLayNrsSet(rows = []) {
  const out = new Set();
  for (const r of rows || []) {
    if (r?.Self_Lay_Provider && r.NRS_ID != null) out.add(Number(r.NRS_ID));
  }
  return out;
}

/* Which utility a drawing layer is.

   Through the layer's own Utility_ID rather than by matching the layer
   key against a utility name. The keys are 'electric', 'gas', 'water'
   and the utilities are named "Electric", "Gas", "Water", so a name
   match would work today and break the first time a layer is renamed —
   and the canvas already resolves isolation, pipe sizes and design
   scopes through Utility_ID for exactly that reason. */
export function utilityIdForLayer(layerKey, layers = []) {
  if (!layerKey) return null;
  const layer = (layers || []).find((l) => l.Layer_Key === layerKey);
  const id = layer?.Utility_ID;
  return id == null ? null : Number(id);
}

/* Whether this meter is a self-lay connection.

   Two routes in, because a meter belongs either to a plot or to a
   non-residential supply, and those hold the fact in different places.

   A plot's meter asks Plot_Utility, per utility. A supply's asks its own
   record, which carries a single Self_Lay_Provider covering the whole
   supply — a pumping station is let to one provider, not utility by
   utility. Where a supply ever gains a per-utility flag this is the one
   place to change.

   Anything that is not a meter is not marked. The cross says "this
   connection is not ours to make", which is a statement about a
   connection; a trench or a joint drawn on a self-lay plot is still
   ours if we drew it. */
/* Whether a given connection is somebody else's to lay.

   Asked of a plot (or supply) and a drawing layer, which is the form
   both callers actually have: the canvas draws a meter and knows its
   layer, and Auto Service is deciding which main to run a utility to
   and knows the same. Written once so the cross on the drawing and the
   main the cable goes to cannot disagree — a meter marked self-lay
   while its cable runs to our main is worse than either fault alone,
   because the drawing then argues with itself.

   `record` is the seed or the plot: anything carrying a Plot_ID, or an
   NRS_ID in its attributes. */
export function isSelfLayFor(record, layerKey, { connections = [], layers = [], nrs = [],
  slp = null, slpNrs = null } = {}) {
  const nrsId = record?.Attributes?.NRS_ID ?? record?.NRS_ID;
  if (nrsId != null) return (slpNrs || selfLayNrsSet(nrs)).has(Number(nrsId));

  const plotId = record?.Plot_ID;
  if (plotId == null) return false;
  const utilityId = utilityIdForLayer(layerKey, layers);
  if (utilityId == null) return false;

  /* The prepared set where the caller has one — the canvas builds it
     once per load rather than per meter per frame. Falling back to the
     rows keeps this callable with nothing prepared, which is what makes
     it testable. */
  return (slp || selfLaySet(connections)).has(key(plotId, utilityId));
}

export function isSelfLayMeter(feature, opts = {}) {
  if (feature?.Feature_Role !== "meter") return false;
  return isSelfLayFor(feature, feature.Layer_Key, opts);
}
