import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { lineLength, isTrenchType } from "./snapping.js";
import { statusesFor } from "./buildStatus.js";

/* Editing a whole selection at once.

   Every field starts at "leave alone" rather than at the current value.
   A bulk form pre-filled with one feature's values is how you silently
   overwrite the other eleven — so nothing is sent unless it was
   deliberately changed, and the form says how many it will touch.

   Only fields that mean the same thing across the selection are here.
   Way and circuit are not: they're assigned by tracing and are meant to
   differ per run. */
export default function BulkEditor({
  features, lineTypes, surfaceTypes = [], layers,
  configs = [], propertyTypes = [], onApply, onClose,
}) {
  const typeName = (id) =>
    propertyTypes.find((t) => t.Property_Type_ID === id)?.Property_Type ?? "";
  const [label, setLabel] = useState("");
  const [lineType, setLineType] = useState("");
  const [size, setSize] = useState("");
  const [depth, setDepth] = useState("");
  const [surface, setSurface] = useState("");
  const [clearSize, setClearSize] = useState(false);
  const [config, setConfig] = useState("");
  /* Build status. Kept out of the allLines / allTrenches / allSeeds
     branching below because it is the one field EVERY feature carries —
     which makes it the only thing a mixed selection can be offered, and
     mixed is exactly when somebody is setting a status across the
     service trenches and the cables and the joints at once. */
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lines = features.filter((f) => f.Feature_Type === "line");

  /* Plot seeds carry a house type, and it is the thing most often
     changed across a run of them — a phase respecified from four beds to
     three is one decision and forty plots.

     It does not live on the feature. The seed marks where the plot is;
     the house type is on the plot record, and changing it moves the
     load, the bedroom count and the colour with it. So this is written
     through the plot rather than through the feature, and the two are
     kept apart below rather than pretending one write does both. */
  const seeds = features.filter((f) => f.Feature_Role === "plot" && f.Plot_ID != null);
  const allSeeds = seeds.length === features.length && seeds.length > 0;
  const allLines = lines.length === features.length && lines.length > 0;
  /* The selection is already one class to get here, so the first line
     settles it for all of them. */
  const allTrenches = allLines && isTrenchType(lines[0]?.Attributes?.Line_Type, lineTypes);
  const totalM = lines.reduce((t, f) => t + lineLength(f.Geometry || []), 0);

  const first = features[0];
  const currentType = lineTypes.find((t) => t.Type_Key === first?.Attributes?.Line_Type);
  const layer = layers.find((l) => l.Layer_Key === first?.Layer_Key);

  /* Which statuses to offer.

     The union across the selection, not the intersection: a main runs
     through more stages than a service, and offering only what they all
     share would hide Live from a selection that is mostly mains. One a
     given feature cannot hold is skipped for that feature when applied,
     and the count says so — better than a control that hides the option
     somebody is looking for.

     Deduplicated by key, in the order they were first met, so the
     sequence still reads planned -> as-laid -> live rather than
     alphabetically or by whichever feature came first in the array. */
  const statusOptions = useMemo(() => {
    const seen = new Map();
    for (const f of features) {
      for (const st of statusesFor(f, lineTypes)) {
        if (!seen.has(st.key)) seen.set(st.key, st);
      }
    }
    return [...seen.values()];
  }, [features, lineTypes]);

  /* What the chosen status would actually change, and what it cannot.

     Counted before applying rather than reported after, because "Apply
     to 12" that quietly writes 9 is worse than saying which 3 will be
     left and why. */
  const statusSkips = useMemo(() => {
    if (!status) return [];
    return features.filter((f) =>
      !statusesFor(f, lineTypes).some((st) => st.key === status));
  }, [features, lineTypes, status]);

  const changes = [
    status && "build status",
    allSeeds && config && "house type",
    label.trim() && "name",
    lineType && "type",
    !allTrenches && (size.trim() || clearSize) && "size",
    depth.trim() && "depth",
    allTrenches && surface && "surface",
  ].filter(Boolean);

  async function apply() {
    if (!changes.length) return setError("Nothing to apply — change a field first.");
    setBusy(true);
    try {
      /* Built per feature and merged into that feature's own Attributes,
         so Length_m, Way, Circuit and Connects survive. The endpoint
         replaces the column rather than merging into it. */
      const updates = features.map((f) => {
        const attrs = { ...(f.Attributes || {}) };
        if (lineType) attrs.Line_Type = lineType;
        if (!allTrenches) {
          if (clearSize) attrs.Size = null;
          else if (size.trim()) attrs.Size = size.trim();
        }
        if (depth.trim()) attrs.Depth_m = Number(depth);
        if (allTrenches && surface) attrs.Surface_Type = surface === "__none" ? null : surface;
        /* Only where this feature has that stage. A joint has no
           As-Laid, and writing one would put a value on the drawing
           that nothing else in the app reads back. */
        if (status && statusesFor(f, lineTypes).some((st) => st.key === status)) {
          attrs.Build_Status = status;
        }

        const u = { Feature_ID: f.Feature_ID, Attributes: attrs };
        if (label.trim()) u.Label = label.trim();
        /* A line type belongs to a layer. Changing one without the other
           leaves a trench sitting on the electric layer, where hiding
           the layer hides the wrong things. */
        if (lineType) {
          const t = lineTypes.find((x) => x.Type_Key === lineType);
          if (t?.Layer_Key) u.Layer_Key = t.Layer_Key;
        }
        return u;
      });
      /* Two writes, because they go to two places: the features carry
         the drawing, the plots carry the house type. Handed over
         together so the caller can do both in one undo step rather than
         leaving a drawing half changed. */
      await onApply(updates, allSeeds && config
        ? { plotIds: seeds.map((f) => f.Plot_ID), Property_Config_ID: config }
        : null);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const drag = useDragHandle();

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="fe" onClick={(e) => e.stopPropagation()} style={drag.panelStyle} role="dialog"
        aria-label="Edit selected features">
        <style>{CSS}</style>

        <div className="fe-head" {...drag.handleProps}
          /* Merged, not replaced: a bare style prop after the spread
             would drop the grab cursor the handle sets. */
          style={{ ...drag.handleProps.style, borderTopColor: layer?.Colour }}>
          <div>
            <h3>Edit {features.length} selected</h3>
            <p className="fe-sub">
              {currentType?.Label || layer?.Label || "Features"}
              {allLines && <> &middot; {totalM.toFixed(1)} m total</>}
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="fe-body">
          {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

          <p className="be-note">
            Blank fields are left as they are. Only what you fill in is written.
          </p>

          <div className="fld">
            <label htmlFor="be-label">Name</label>
            <input id="be-label" value={label} placeholder="Leave blank to keep each name"
              onChange={(e) => setLabel(e.target.value)} />
            <p className="hint">Applied to all {features.length} &mdash; they will share it.</p>
          </div>

          {allLines && (
            <>
              <div className="fld">
                <label htmlFor="be-type">Line type</label>
                <select id="be-type" value={lineType} onChange={(e) => setLineType(e.target.value)}>
                  <option value="">Leave unchanged</option>
                  {lineTypes.map((t) => (
                    <option key={t.Type_Key} value={t.Type_Key}>{t.Label}</option>
                  ))}
                </select>
              </div>

              {allTrenches && (
                <div className="fld">
                  <label htmlFor="be-surface">Surface</label>
                  <select id="be-surface" value={surface} onChange={(e) => setSurface(e.target.value)}>
                    <option value="">Leave unchanged</option>
                    {surfaceTypes.map((x) => (
                      <option key={x.Surface_Key} value={x.Surface_Key}>{x.Label}</option>
                    ))}
                    <option value="__none">&mdash; Clear it &mdash;</option>
                  </select>
                </div>
              )}
              <div className="be-row">
                {!allTrenches && (
                  <div className="fld">
                    <label htmlFor="be-size">Size</label>
                    <input id="be-size" value={size} disabled={clearSize}
                      placeholder="Leave blank to keep"
                      onChange={(e) => setSize(e.target.value)} />
                  </div>
                )}
                <div className="fld">
                  <label htmlFor="be-depth">Depth (m)</label>
                  <input id="be-depth" type="number" step="0.05" value={depth}
                    placeholder="Leave blank to keep"
                    onChange={(e) => setDepth(e.target.value)} />
                </div>
              </div>

              {!allTrenches && (
                <label className="be-check">
                  <input type="checkbox" checked={clearSize}
                    onChange={(e) => setClearSize(e.target.checked)} />
                  Clear the size on all {features.length}
                </label>
              )}
            </>
          )}

          {allSeeds && (
            <div className="fld">
              <label htmlFor="be-config">House type</label>
              <select id="be-config" value={config}
                onChange={(e) => setConfig(e.target.value)}>
                <option value="">Leave each as it is</option>
                {/* Labelled the way the single-plot editor labels them,
                    so the same house type reads the same in both. There
                    is no Description column on Property_Config — an
                    earlier version of this used one and every option
                    would have read as just its code. */}
                {configs.map((c) => (
                  <option key={c.Property_Config_ID} value={c.Property_Config_ID}>
                    {c.Code} &mdash; {c.Bedrooms} Bed {typeName(c.Property_Type_ID)}
                  </option>
                ))}
              </select>
              {/* Said before it is done: the house type is not only a
                  label. The load comes from bedrooms and heat source
                  together, so changing the type moves the kVA on every
                  plot and with it anything already worked out from it. */}
              <p className="fe-tip">
                Applied to all {seeds.length}. This changes the connected load,
                so any levels check will need re-running.
              </p>
            </div>
          )}

          {/* Build status, on any selection.

              Above the mixed-selection note on purpose: that note used
              to be the whole answer for a mixed selection, and putting
              a working field under it read as though the field did not
              apply. */}
          {statusOptions.length > 0 && (
            <div className="fld">
              <label htmlFor="be-status">Build status</label>
              <select id="be-status" value={status}
                onChange={(e) => setStatus(e.target.value)}>
                <option value="">Leave as they are</option>
                {statusOptions.map((st) => (
                  <option key={st.key} value={st.key}>{st.label}</option>
                ))}
              </select>
              <p className="hint">
                {statusSkips.length === 0
                  ? `Applied to all ${features.length}.`
                  : `${features.length - statusSkips.length} of ${features.length} `
                    + `\u2014 ${statusSkips.length} ha${statusSkips.length === 1 ? "s" : "ve"} `
                    + "no such stage and will be left as they are."}
              </p>
            </div>
          )}

          {!allLines && !allSeeds && (
            <p className="fe-tip">
              Mixed or non-line features &mdash; name and build status only.
            </p>
          )}

          <p className="be-summary">
            {changes.length
              ? <>Will change <strong>{changes.join(", ")}</strong> on {features.length} feature
                {features.length === 1 ? "" : "s"}. Lengths and geometry are untouched.</>
              : <span className="be-idle">No changes yet.</span>}
          </p>
        </div>

        <div className="fe-foot">
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={busy || !changes.length} onClick={apply}>
            {busy ? "Applying\u2026" : `Apply to ${features.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.be-note { font-size: 12px; color: var(--muted); margin: 0 0 12px; }
.be-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.be-check { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 10px 0 0; }

.be-summary { font-size: 12px; color: var(--text); margin: 14px 0 0; padding-top: 11px;
  border-top: 1px solid var(--border); }
.be-idle { color: var(--muted); font-style: italic; }
`;
