import { useState } from "react";
import Banner from "../../components/Banner.jsx";
import { utilityById } from "../../lib/utilities.js";
import { lineLength } from "./snapping.js";

/* Editing whatever you right-clicked.

   One panel for every kind of feature, because they mostly share the
   same fields — what it's called, which layer it's on, what it's made
   of. The parts that differ appear only when they apply. */
export default function FeatureEditor({
  feature, layers, lineTypes, plotList, lookups, onSave, onSavePlot, onDelete, onClose,
}) {
  const [f, setF] = useState({
    Label: feature.Label || "",
    Layer_Key: feature.Layer_Key,
    Attributes: { ...(feature.Attributes || {}) },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isLine = feature.Feature_Type === "line";
  const isPoly = feature.Feature_Type === "polygon";
  const isSeed = feature.Feature_Role === "plot";
  const isMeter = feature.Feature_Role === "meter";

  const setAttr = (k) => (v) =>
    setF((p) => ({ ...p, Attributes: { ...p.Attributes, [k]: v === "" ? null : v } }));

  const plot = plotList.find((p) => p.plot_id === feature.Plot_ID);

  /* A plot seed edits the plot record, not the drawing — the house type
     belongs to the plot and shows on the Plots tab too. */
  const [plotFields, setPlotFields] = useState({
    Property_Config_ID: plot?.property_config_id ?? "",
    Heat_Source_ID: plot?.heat_source_id ?? "",
    Heat_Pump_Model_ID: plot?.heat_pump_model_id ?? "",
  });
  const setPlotField = (k) => (v) => setPlotFields((p) => ({ ...p, [k]: v }));

  const heatSource = (lookups?.heatSources || [])
    .find((h) => String(h.Heat_Source_ID) === String(plotFields.Heat_Source_ID));
  /* Only ask for a model when the source is a pump — a gas boiler has no
     model to choose from this list. */
  const needsPump = /pump|ashp|gshp|wshp/i.test(heatSource?.Heat_Source || "");

  const typeName = (id) =>
    (lookups?.propertyTypes || []).find((t) => t.Property_Type_ID === id)?.Property_Type ?? "";
  const layer = layers.find((l) => l.Layer_Key === f.Layer_Key);
  const length = (isLine || isPoly) ? lineLength(feature.Geometry || []) : 0;
  const vertices = (feature.Geometry || []).length;

  const kind = isSeed ? "Plot seed"
    : isMeter ? "Meter"
    : isPoly ? "Area"
    : isLine ? "Line"
    : "Point";

  async function save() {
    setBusy(true);
    try {
      if (isSeed && feature.Plot_ID) {
        const config = (lookups?.propertyConfigs || [])
          .find((c) => String(c.Property_Config_ID) === String(plotFields.Property_Config_ID));

        await onSavePlot(feature.Plot_ID, {
          Property_Config_ID: plotFields.Property_Config_ID || null,
          Heat_Source_ID: plotFields.Heat_Source_ID || null,
          // Clearing the pump when the source isn't one, so a stale model
          // can't sit against a gas plot
          Heat_Pump_Model_ID: needsPump ? (plotFields.Heat_Pump_Model_ID || null) : null,
        }, {
          Bedrooms: config?.Bedrooms ?? null,
          Config: config?.Code ?? null,
        });
      }

      await onSave(feature.Feature_ID, {
        Label: f.Label || null,
        Layer_Key: f.Layer_Key,
        Attributes: isSeed
          ? { ...f.Attributes, ...seedAttributes() }
          : f.Attributes,
      });
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  /* Keep the drawing's cached bedroom count in step, or the seed keeps
     its old colour until the next reload. */
  function seedAttributes() {
    const config = (lookups?.propertyConfigs || [])
      .find((c) => String(c.Property_Config_ID) === String(plotFields.Property_Config_ID));
    return { Bedrooms: config?.Bedrooms ?? null, Config: config?.Code ?? null };
  }

  async function remove() {
    if (!window.confirm(`Delete this ${kind.toLowerCase()}?`)) return;
    setBusy(true);
    try { await onDelete(feature.Feature_ID); onClose(); }
    catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="fe" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit feature">
        <style>{CSS}</style>

        <div className="fe-head" style={{ borderTopColor: layer?.Colour }}>
          <div>
            <h3>{kind}</h3>
            <p className="fe-sub">
              {vertices} point{vertices === 1 ? "" : "s"}
              {length > 0 && <> &middot; {length.toFixed(1)} m</>}
              {plot && <> &middot; plot {plot.plot_number}</>}
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="fe-body">
          {error && <Banner kind="error">{error}</Banner>}

          <div className="fld">
            <label htmlFor="fe-label">Label</label>
            <input id="fe-label" value={f.Label}
              onChange={(e) => setF((p) => ({ ...p, Label: e.target.value }))} />
          </div>

          <div className="fld">
            <label htmlFor="fe-layer">Layer</label>
            <select id="fe-layer" value={f.Layer_Key}
              onChange={(e) => setF((p) => ({ ...p, Layer_Key: e.target.value }))}>
              {layers.map((l) => (
                <option key={l.Layer_Key} value={l.Layer_Key}>{l.Label}</option>
              ))}
            </select>
          </div>

          {isLine && (
            <>
              <div className="fld">
                <label htmlFor="fe-type">Line type</label>
                <select id="fe-type" value={f.Attributes.Line_Type ?? ""}
                  onChange={(e) => setAttr("Line_Type")(e.target.value)}>
                  <option value="">&mdash; None &mdash;</option>
                  {lineTypes.map((t) => (
                    <option key={t.Type_Key} value={t.Type_Key}>{t.Label}</option>
                  ))}
                </select>
              </div>
              <div className="fe-row">
                <div className="fld">
                  <label htmlFor="fe-size">Size</label>
                  <input id="fe-size" value={f.Attributes.Size ?? ""}
                    placeholder="e.g. 185mm² WF"
                    onChange={(e) => setAttr("Size")(e.target.value)} />
                </div>
                <div className="fld">
                  <label htmlFor="fe-depth">Depth (m)</label>
                  <input id="fe-depth" type="number" step="0.05"
                    value={f.Attributes.Depth_m ?? ""}
                    onChange={(e) => setAttr("Depth_m")(e.target.value)} />
                </div>
              </div>
              {(f.Attributes.Way || f.Attributes.Circuit) && (
                <p className="fe-derived">
                  Way <strong>{f.Attributes.Way ?? "\u2014"}</strong>,
                  circuit <strong>{f.Attributes.Circuit ?? "\u2014"}</strong>
                  <span> &mdash; set by tracing, not edited here</span>
                </p>
              )}
            </>
          )}

          {isMeter && (
            <div className="fld">
              <label htmlFor="fe-mpan">Meter reference</label>
              <input id="fe-mpan" className="mono" value={f.Attributes.Meter_Ref ?? ""}
                onChange={(e) => setAttr("Meter_Ref")(e.target.value)} />
            </div>
          )}

          {isSeed && (
            <>
              <div className="fld">
                <label htmlFor="fe-config">House type</label>
                <select id="fe-config" value={plotFields.Property_Config_ID}
                  onChange={(e) => setPlotField("Property_Config_ID")(e.target.value)}>
                  <option value="">&mdash; None &mdash;</option>
                  {(lookups?.propertyConfigs || []).map((c) => (
                    <option key={c.Property_Config_ID} value={c.Property_Config_ID}>
                      {c.Code} &mdash; {c.Bedrooms} Bed {typeName(c.Property_Type_ID)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fld">
                <label htmlFor="fe-heat">Heating source</label>
                <select id="fe-heat" value={plotFields.Heat_Source_ID}
                  onChange={(e) => setPlotField("Heat_Source_ID")(e.target.value)}>
                  <option value="">&mdash; None &mdash;</option>
                  {(lookups?.heatSources || []).map((h) => (
                    <option key={h.Heat_Source_ID} value={h.Heat_Source_ID}>{h.Heat_Source}</option>
                  ))}
                </select>
              </div>

              {needsPump && (
                <div className="fld">
                  <label htmlFor="fe-pump">Heat pump model</label>
                  <select id="fe-pump" value={plotFields.Heat_Pump_Model_ID}
                    onChange={(e) => setPlotField("Heat_Pump_Model_ID")(e.target.value)}>
                    <option value="">&mdash; None &mdash;</option>
                    {(lookups?.heatPumpModels || []).map((m) => (
                      <option key={m.Heat_Pump_Model_ID} value={m.Heat_Pump_Model_ID}>
                        {m.Model}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="fe-derived">
                These belong to the plot, so they change on the Plots tab too.
              </p>
            </>
          )}

          <div className="fld">
            <label htmlFor="fe-notes">Notes</label>
            <textarea id="fe-notes" rows={2} value={f.Attributes.Notes ?? ""}
              onChange={(e) => setAttr("Notes")(e.target.value)} />
          </div>

          {(isLine || isPoly) && (
            <p className="fe-tip">
              Close this and drag the white handles to reshape it.
            </p>
          )}
        </div>

        <div className="fe-foot">
          <button className="btn ghost danger" disabled={busy} onClick={remove}>Delete</button>
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={busy} onClick={save}>
            {busy ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.fe-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.34); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 24px; }
.fe { background: var(--white); border-radius: 12px; width: min(420px, 92vw);
  max-height: 88vh; display: flex; flex-direction: column;
  box-shadow: 0 18px 46px rgba(15,23,42,.3); }
.fe-head { display: flex; align-items: flex-start; justify-content: space-between;
  padding: 15px 18px 12px; border-bottom: 1px solid var(--border);
  border-top: 3px solid var(--muted); border-radius: 12px 12px 0 0; }
.fe-head h3 { margin: 0; font-size: 15px; font-weight: 700; }
.fe-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.fe-x { border: none; background: none; font-size: 21px; cursor: pointer; color: var(--muted);
  line-height: 1; padding: 0 3px; }
.fe-body { padding: 14px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 11px; }
.fe-row { display: flex; gap: 11px; }
.fe-row .fld { flex: 1; min-width: 0; }
.fe-derived { margin: 0; font-size: 11.5px; color: var(--muted); background: var(--bg);
  border-radius: var(--radius); padding: 8px 10px; line-height: 1.5; }
.fe-derived strong { color: var(--text); }
.fe-tip { margin: 0; font-size: 11px; color: var(--muted); font-style: italic; }
.fe-foot { display: flex; align-items: center; gap: 8px; padding: 13px 18px;
  border-top: 1px solid var(--border); }
.fe-spacer { flex: 1; }
.btn.ghost.danger { color: #b91c1c; }
.mono { font-family: ui-monospace, Menlo, monospace; }
`;
