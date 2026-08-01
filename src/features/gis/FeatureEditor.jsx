import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { utilityById } from "../../lib/utilities.js";
import { lineLength, isTrenchType } from "./snapping.js";
import { heatPumpLabel, sourceTakesHeatPump } from "../../lib/heatPump.js";
import { pocUnit, circuitLetter, circuitsFrom, SUB_DEFAULTS } from "./electric.js";

/* Editing whatever you right-clicked.

   One panel for every kind of feature, because they mostly share the
   same fields — what it's called, which layer it's on, what it's made
   of. The parts that differ appear only when they apply. */
export default function FeatureEditor({
  feature, layers, lineTypes, surfaceTypes = [], plotList, lookups,
  /* The whole drawing, so a meter can be offered the circuits that
     already exist on it. */
  allFeatures = [],
  onSave, onSavePlot, onDelete, onClose,
}) {
  const [f, setF] = useState({
    Label: feature.Label || "",
    Layer_Key: feature.Layer_Key,
    Attributes: { ...(feature.Attributes || {}) },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isLine = feature.Feature_Type === "line";
  /* Read from the draft, not the saved row, so switching a cable to a
     trench swaps the fields immediately rather than after a save. */
  const isTrench = isTrenchType(f.Attributes?.Line_Type, lineTypes);
  /* An electric line picks its cable from the catalogue. Judged by the
     layer its type belongs to rather than by the key's spelling, so a
     type added later lands in the right branch without a code change. */
  const isElectric = feature.Feature_Type === "line" && !isTrench && (() => {
    const t = lineTypes.find((x) => x.Type_Key === f.Attributes?.Line_Type);
    return t ? t.Layer_Key === "electric" : feature.Layer_Key === "electric";
  })();
  const isPoly = feature.Feature_Type === "polygon";
  const isSeed = feature.Feature_Role === "plot";
  const isMeter = feature.Feature_Role === "meter";

  /* The circuits already on this drawing, with how many meters each
     holds — the count is what tells one circuit from another when the
     names are all "Circuit 1", "Circuit 2". */
  const circuits = useMemo(() => circuitsFrom(allFeatures || []), [allFeatures]);

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

  /* Whether the plot record carried a heat pump model at all. Absent is
     not the same as empty: a record without the property tells us
     nothing about the plot, whereas null tells us there is no model. */
  const pumpKnown = plot != null && "heat_pump_model_id" in plot;
  const [pumpTouched, setPumpTouched] = useState(false);

  /* Whether the fields the load is derived from have been changed but
     not yet saved. Compared as strings because the selects hand back
     strings and the plot record holds numbers, so a straight !== reports
     every plot as edited the moment the modal opens. */
  const plotDirty = isSeed && (
    String(plotFields.Property_Config_ID ?? "") !== String(plot?.property_config_id ?? "")
    || String(plotFields.Heat_Source_ID ?? "") !== String(plot?.heat_source_id ?? "")
  );

  /* Only ask for a model when the source takes one.

     The shared rule rather than a regex of this file's own. The local
     one matched gshp and wshp as well, but the register is the MCS list
     of air source units — offering it against a ground source pump lists
     models that cannot be fitted, and the picker sitting there implies
     otherwise. */
  const needsPump = sourceTakesHeatPump(plotFields.Heat_Source_ID, lookups?.heatSources || []);

  /* The unit actually chosen, so its figures can be shown rather than
     just its name. */
  const pump = (lookups?.heatPumpModels || [])
    .find((m) => String(m.Heat_Pump_Model_ID) === String(plotFields.Heat_Pump_Model_ID));

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

        /* Only the fields this editor actually loaded.

           A plot record that arrives without heat_pump_model_id — as it
           did before the column was added to gis_unplaced_plots — gives
           the picker an empty value indistinguishable from "no model
           chosen". Sending that back cleared the model from every plot
           whose seed was opened and saved, silently, with the editor
           showing exactly what it had just destroyed.

           So a field absent from the record is left alone unless someone
           has touched it. Belt and braces alongside the migration: the
           next column added to that function should not be able to do
           this again. */
        const changes = {
          Property_Config_ID: plotFields.Property_Config_ID || null,
          Heat_Source_ID: plotFields.Heat_Source_ID || null,
        };
        if (pumpKnown || pumpTouched) {
          // Clearing the pump when the source isn't one, so a stale model
          // can't sit against a gas plot
          changes.Heat_Pump_Model_ID = needsPump
            ? (plotFields.Heat_Pump_Model_ID || null)
            : null;
        }

        await onSavePlot(feature.Plot_ID, changes, {
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

  const drag = useDragHandle();

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="fe" onClick={(e) => e.stopPropagation()} style={drag.panelStyle} role="dialog" aria-label="Edit feature">
        <style>{CSS}</style>

        <div className="fe-head" {...drag.handleProps}
          /* Merged, not replaced: a bare style prop after the spread
             would drop the grab cursor the handle sets. */
          style={{ ...drag.handleProps.style, borderTopColor: layer?.Colour }}>
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

          {/* A span node, as the original shows it. Two quite different
              cases: one that belongs to a circuit is numbered from the
              substation and cannot be renamed, because the number is its
              position in a sequence and editing it would break the
              schedule it appears on. A standalone one is a named waypoint
              and the letter is the whole point of it. */}
          {feature.Feature_Role === "spannode" && (
            <div className="fld">
              {f.Attributes.Circuit_ID != null ? (
                <>
                  <label>Span node</label>
                  <p className="sn-code">{f.Attributes.Span_Label}</p>
                  <p className="hint">
                    Point {f.Attributes.Span_Seq} on {f.Attributes.Circuit_Name}
                    {Number(f.Attributes.Span_Seq) === 0
                      ? " \u2014 the origin, at the substation."
                      : ", numbered from the substation."}
                    {" "}Not editable: the number is its place in the sequence.
                  </p>
                </>
              ) : (
                <>
                  <label htmlFor="fe-span">Node letter</label>
                  <input id="fe-span" maxLength={2} value={f.Attributes.Span_Label ?? ""}
                    className="sn-input"
                    onChange={(e) => setAttr("Span_Label")(e.target.value.toUpperCase())} />
                  <p className="hint">
                    Used as a span endpoint in call-offs &mdash; A&ndash;4, 6&ndash;B.
                  </p>
                </>
              )}
            </div>
          )}

          {/* The cable feeding this point — the run from the previous
              span node to this one, which is why it belongs on the node
              rather than on a cable. Volt drop is totalled span by span,
              so a node without one makes everything beyond it unknowable
              rather than merely approximate.

              Not offered on the origin: nothing feeds the substation. */}
          {feature.Feature_Role === "spannode"
            && Number(f.Attributes.Span_Seq) !== 0 && (
            <div className="fld">
              <label htmlFor="fe-cable">Cable feeding this point</label>
              <select id="fe-cable" value={f.Attributes.VD_Cable_Size_ID ?? ""}
                onChange={(e) => setAttr("VD_Cable_Size_ID")(
                  e.target.value ? Number(e.target.value) : null)}>
                <option value="">&mdash; not set &mdash;</option>
                {(lookups?.cableSizes || []).map((c) => {
                  const t = (lookups?.cableTypes || [])
                    .find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
                  /* Most of the catalogue is names only. Saying so here
                     is the difference between choosing a cable and
                     wondering later why the leg reports nothing. */
                  const usable = c.Loop_Impedance_Ohm != null || c.Volt_Drop_Base != null;
                  return (
                    <option key={c.Cable_Size_ID} value={c.Cable_Size_ID}>
                      {[t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ")}
                      {c.Material ? ` (${c.Material})` : ""}
                      {usable ? "" : " — no figures"}
                    </option>
                  );
                })}
              </select>
              {!(lookups?.cableSizes || []).length && (
                <p className="hint">
                  No cable sizes yet &mdash; add them in Admin &rsaquo; Cable Sizes.
                </p>
              )}
            </div>
          )}

          {feature.Feature_Role === "substation" && (
            <div className="fld">
              <label htmlFor="fe-tx">Transformer</label>
              <select id="fe-tx" value={f.Attributes.VD_Transformer_Size_ID ?? ""}
                onChange={(e) => setAttr("VD_Transformer_Size_ID")(
                  e.target.value ? Number(e.target.value) : null)}>
                <option value="">&mdash; not set &mdash;</option>
                {(lookups?.transformerSizes || []).map((x) => (
                  <option key={x.Transformer_Size_ID} value={x.Transformer_Size_ID}>
                    {x.Label || `${x.Rating_kVA} kVA`}
                    {x.Label && x.Rating_kVA ? ` · ${x.Rating_kVA} kVA` : ""}
                  </option>
                ))}
              </select>
              <p className="hint">
                Sets the baseline loop impedance every downstream figure adds to.
              </p>
            </div>
          )}

          {feature.Feature_Role === "poc" && (
            <div className="fld">
              <label htmlFor="fe-poc">Agreed output ({pocUnit(f.Layer_Key)})</label>
              <input id="fe-poc" type="number" step="0.1"
                value={f.Attributes.Output ?? ""}
                onChange={(e) => setAttr("Output")(e.target.value)} />
              <p className="hint">
                What the DNO has agreed to supply here. Circuits are checked against it.
              </p>
            </div>
          )}

          {feature.Feature_Role === "substation" && (
            <>
              <div className="fe-row">
                <div className="fld">
                  <label htmlFor="fe-rating">Rating (kVA)</label>
                  <input id="fe-rating" type="number" step="1"
                    value={f.Attributes.Rating_kVA ?? ""}
                    onChange={(e) => setAttr("Rating_kVA")(e.target.value)} />
                </div>
                <div className="fld">
                  <label htmlFor="fe-outv">Output (V)</label>
                  <input id="fe-outv" type="number" step="1"
                    placeholder={String(SUB_DEFAULTS.Output_V)}
                    value={f.Attributes.Output_V ?? ""}
                    onChange={(e) => setAttr("Output_V")(e.target.value)} />
                </div>
              </div>
              <div className="fe-row">
                <div className="fld">
                  <label htmlFor="fe-ways">LV ways</label>
                  <input id="fe-ways" type="number" min="1" max="24" step="1"
                    placeholder={String(SUB_DEFAULTS.Ways)}
                    value={f.Attributes.Ways ?? ""}
                    onChange={(e) => setAttr("Ways")(e.target.value)} />
                </div>
                <div className="fld">
                  <label htmlFor="fe-fuse">Way fuse (A)</label>
                  <input id="fe-fuse" type="number" step="1"
                    placeholder={String(SUB_DEFAULTS.Way_Fuse_A)}
                    value={f.Attributes.Way_Fuse_A ?? ""}
                    onChange={(e) => setAttr("Way_Fuse_A")(e.target.value)} />
                </div>
              </div>
              <p className="hint">
                One circuit per way. Defining a circuit takes the next free one.
              </p>
              {/* Every way on the board, not only the ones in use. A list
                  showing one entry against a drawing labelled 1B and 2A
                  reads as a contradiction; showing all four says plainly
                  that two are spare. */}
              <div className="fe-ways">
                {Array.from(
                  { length: Number(f.Attributes.Ways ?? SUB_DEFAULTS.Ways) || 0 },
                  (_, i) => i + 1,
                ).map((way) => {
                  const cid = (f.Attributes.Way_Circuits || {})[way];
                  return (
                    <span className={cid != null ? "fe-way" : "fe-way spare"} key={way}>
                      Way {way}
                      <strong>{cid != null ? circuitLetter(cid) : "\u2014"}</strong>
                    </span>
                  );
                })}
              </div>
              <p className="hint">
                Which circuit sits on each way. A dash is a spare way.
                Cable labels read way then circuit, so <strong>2A</strong> is
                circuit A on way 2.
              </p>
            </>
          )}

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
                {isTrench ? (
                  <div className="fld">
                    <label htmlFor="fe-surface">Surface</label>
                    <select id="fe-surface" value={f.Attributes.Surface_Type ?? ""}
                      onChange={(e) => setAttr("Surface_Type")(e.target.value)}>
                      <option value="">&mdash; None &mdash;</option>
                      {surfaceTypes.map((x) => (
                        <option key={x.Surface_Key} value={x.Surface_Key}>{x.Label}</option>
                      ))}
                    </select>
                    <p className="hint">What it is dug through. Drives reinstatement.</p>
                  </div>
                ) : isElectric ? (
                  /* Electric lines pick from the catalogue rather than
                     typing a size. The free-text field was fine when
                     nothing read it, but a cable now carries impedance
                     and volt drop figures, and "185mm² WF" typed by hand
                     matches no row and calculates nothing.

                     Build LV Network sets this on every run it draws, so
                     a generated feeder arrives with a cable already on
                     it — this is where you see and change it. */
                  <div className="fld">
                    <label htmlFor="fe-cablesize">Cable</label>
                    <select id="fe-cablesize" value={f.Attributes.VD_Cable_Size_ID ?? ""}
                      onChange={(e) => setAttr("VD_Cable_Size_ID")(
                        e.target.value ? Number(e.target.value) : null)}>
                      <option value="">&mdash; not set &mdash;</option>
                      {(lookups?.cableSizes || []).map((c) => {
                        const t = (lookups?.cableTypes || [])
                          .find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
                        const usable = c.Loop_Impedance_Ohm != null || c.Volt_Drop_Base != null;
                        return (
                          <option key={c.Cable_Size_ID} value={c.Cable_Size_ID}>
                            {[t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ")}
                            {c.Material ? ` (${c.Material})` : ""}
                            {usable ? "" : " \u2014 no figures"}
                          </option>
                        );
                      })}
                    </select>
                    {f.Attributes.Generated && (
                      <p className="hint">
                        Drawn by Build LV Network. Changing it here is kept;
                        rebuilding will not overwrite a cable you have chosen.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="fld">
                    <label htmlFor="fe-size">Size</label>
                    <input id="fe-size" value={f.Attributes.Size ?? ""}
                      placeholder="e.g. 185mm² WF"
                      onChange={(e) => setAttr("Size")(e.target.value)} />
                  </div>
                )}
              </div>
              {f.Attributes.Site && (
                <p className="fe-derived">
                  <strong>{f.Attributes.Site}</strong>
                  <span> &mdash; from the site boundary when this was drawn.
                    Redraw it to reclassify.</span>
                </p>
              )}
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

          {/* Which circuit this meter is on.

              Link to Circuit lassoes seeds and always makes a new
              circuit, which is right when setting a scheme out and wrong
              when one plot is added afterwards — there was no way to put
              a single meter onto a circuit that already exists. This is
              that way.

              Changing it moves the load: the circuit gains a plot and
              the one it left loses one, so both totals and both traces
              change. Rebuild the LV network afterwards to redraw the
              cable that now has to reach it. */}
          {isMeter && feature.Layer_Key === "electric" && (
            <div className="fld">
              <label htmlFor="fe-circuit">Circuit</label>
              <select id="fe-circuit" value={f.Attributes.Circuit_ID ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const c = circuits.find((x) => Number(x.id) === id);
                  setF((prev) => ({
                    ...prev,
                    Attributes: {
                      ...prev.Attributes,
                      Circuit_ID: id,
                      Circuit_Name: c?.name ?? null,
                      Circuit_Letter: c?.letter ?? null,
                    },
                  }));
                }}>
                <option value="">&mdash; not on a circuit &mdash;</option>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {/* meters is the array of meter features, not a
                        count — rendering it directly put objects into the
                        DOM. */}
                    {c.name} ({c.letter}) &middot; {c.meters.length} meter(s)
                  </option>
                ))}
              </select>
              {circuits.length === 0 && (
                <p className="hint">
                  No circuits yet. Use Electric &rsaquo; Link to Circuit to make the first one.
                </p>
              )}
              {f.Attributes.Circuit_ID !== feature.Attributes?.Circuit_ID && (
                <p className="hint">
                  Rebuild the LV network after saving, so the cable reaches it.
                </p>
              )}
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
                    onChange={(e) => {
                      setPumpTouched(true);
                      setPlotField("Heat_Pump_Model_ID")(e.target.value);
                    }}>
                    <option value="">&mdash; None &mdash;</option>
                    {(lookups?.heatPumpModels || []).map((m) => (
                      <option key={m.Heat_Pump_Model_ID} value={m.Heat_Pump_Model_ID}>
                        {/* The full label, not the model name alone. 150
                            make-and-model pairs repeat in the register and
                            91 of those carry different loads, so a list of
                            bare model names asks someone to choose between
                            identical-looking options that size a supply
                            differently. */}
                        {heatPumpLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* The model is on the plot but this screen was not given
                  it — the plot list does not carry the column yet. Said
                  plainly rather than shown as "None", which is the same
                  thing the picker says about a plot that genuinely has
                  no model. */}
              {needsPump && !pumpKnown && (
                <p className="fe-derived fe-kva-stale">
                  This screen can&rsquo;t read the heat pump model yet &mdash; check the
                  Plots tab. Saving here won&rsquo;t change it.
                </p>
              )}

              {/* What the chosen unit is, from the register. Read-only —
                  these belong to the model, not to this plot, and are
                  shown because a register number and a rated load are
                  what someone checks a selection against. */}
              {needsPump && pump && (
                <div className="fe-derived fe-pump">
                  <div><span>Make</span><strong>{pump.Make || "\u2014"}</strong></div>
                  <div><span>Model</span><strong>{pump.Model || "\u2014"}</strong></div>
                  {pump.Model_Reference && pump.Model_Reference !== pump.Model && (
                    <div><span>Reference</span><strong>{pump.Model_Reference}</strong></div>
                  )}
                  <div><span>MCS register</span><strong>{pump.Register_Number || "\u2014"}</strong></div>
                  <div>
                    <span>Rated power</span>
                    <strong>
                      {pump.Rated_Power_kVA != null
                        ? `${Number(pump.Rated_Power_kVA)} kVA`
                        : "\u2014"}
                    </strong>
                  </div>
                </div>
              )}

              {/* What the plot draws, which is worked out rather than
                  entered: the house type's figure, looked up on bedrooms
                  and heating source together, unless someone has put a
                  figure on the plot itself.

                  Read-only here on purpose. The three fields above are
                  its inputs, and showing the answer beneath them is what
                  makes it obvious that a plot reading nothing is missing
                  a heating source rather than broken — which is not
                  obvious at all when the number only appears on the
                  circuit report. */}
              <div className="fld">
                <label>Load</label>
                <div className="fe-kva">
                  {plot?.kva_load == null
                    ? <span className="fe-kva-unset">
                        No load &mdash; set a heating source, or enter one on the Plots tab
                      </span>
                    : <>
                        <strong>{Number(plot.kva_load).toFixed(1)} kVA</strong>
                        <span className="fe-kva-src">
                          {plot.kva_source === "entered"
                            ? "entered on this plot"
                            : "from the house type"}
                        </span>
                      </>}
                </div>
              </div>

              {/* The figure above is the saved one. Changing a field it
                  depends on does not move it until the change has been
                  written and read back, and a number that silently
                  disagrees with the fields above it is worse than one
                  that says it is waiting. */}
              {plotDirty && (
                <p className="fe-derived fe-kva-stale">
                  The load will update when you save.
                </p>
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
.fe-kva { display: flex; align-items: baseline; gap: 8px; padding: 6px 2px; }
.fe-kva strong { font-size: 15px; }
.fe-kva-src { font-size: 11px; color: var(--muted); }
.fe-kva-unset { font-size: 11.5px; color: #b45309; font-weight: 600; }
.fe-kva-stale { background: #fffbeb; color: #92400e; }
.fe-pump { display: grid; gap: 3px; }
.fe-pump div { display: flex; justify-content: space-between; gap: 12px; }
.fe-pump span { color: var(--muted); }
.fe-pump strong { text-align: right; }
.sn-code { margin: 0; font: 800 26px ui-monospace, Menlo, monospace; color: var(--accent);
  line-height: 1.1; }
.sn-input { width: 78px; text-transform: uppercase; font-size: 20px; font-weight: 800;
  text-align: center; font-family: ui-monospace, Menlo, monospace; }
/* A way with nothing on it reads lighter, so the ones in use stand out
   without having to count. */
.fe-way.spare { opacity: .5; }
.fe-ways { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.fe-way { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
  background: var(--bg); border: 1px solid var(--border); border-radius: 20px; padding: 2px 10px;
  color: var(--muted); }
.fe-way strong { color: var(--accent); font-size: 12px; }
.fe-tip { margin: 0; font-size: 11px; color: var(--muted); font-style: italic; }
.fe-foot { display: flex; align-items: center; gap: 8px; padding: 13px 18px;
  border-top: 1px solid var(--border); }
.fe-spacer { flex: 1; }
.btn.ghost.danger { color: #b91c1c; }
.mono { font-family: ui-monospace, Menlo, monospace; }
`;
