import { useState } from "react";
import Banner from "../../components/Banner.jsx";
import { lineLength, isTrenchType } from "./snapping.js";

/* Editing a whole selection at once.

   Every field starts at "leave alone" rather than at the current value.
   A bulk form pre-filled with one feature's values is how you silently
   overwrite the other eleven — so nothing is sent unless it was
   deliberately changed, and the form says how many it will touch.

   Only fields that mean the same thing across the selection are here.
   Way and circuit are not: they're assigned by tracing and are meant to
   differ per run. */
export default function BulkEditor({ features, lineTypes, surfaceTypes = [], layers, onApply, onClose }) {
  const [label, setLabel] = useState("");
  const [lineType, setLineType] = useState("");
  const [size, setSize] = useState("");
  const [depth, setDepth] = useState("");
  const [surface, setSurface] = useState("");
  const [clearSize, setClearSize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lines = features.filter((f) => f.Feature_Type === "line");
  const allLines = lines.length === features.length && lines.length > 0;
  /* The selection is already one class to get here, so the first line
     settles it for all of them. */
  const allTrenches = allLines && isTrenchType(lines[0]?.Attributes?.Line_Type, lineTypes);
  const totalM = lines.reduce((t, f) => t + lineLength(f.Geometry || []), 0);

  const first = features[0];
  const currentType = lineTypes.find((t) => t.Type_Key === first?.Attributes?.Line_Type);
  const layer = layers.find((l) => l.Layer_Key === first?.Layer_Key);

  const changes = [
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
      await onApply(updates);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="fe" onClick={(e) => e.stopPropagation()} role="dialog"
        aria-label="Edit selected features">
        <style>{CSS}</style>

        <div className="fe-head" style={{ borderTopColor: layer?.Colour }}>
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
          {error && <Banner kind="error">{error}</Banner>}

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

          {!allLines && (
            <p className="fe-tip">
              Mixed or non-line features &mdash; only the name can be set in bulk.
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
