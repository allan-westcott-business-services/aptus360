import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { BUILD_STATUSES } from "./buildStatus.js";
import { utilityById } from "../../lib/utilities.js";
import { lineLength, isTrenchType } from "./snapping.js";
import { heatPumpLabel, sourceTakesHeatPump, kvaSourceText } from "../../lib/heatPump.js";
import { circuitColours, feederColourAt } from "./feederColour.js";
import { servedPlots, JOINT_KINDS } from "./joints.js";
import {
  pocUnit, circuitLetter, circuitsFrom, SUB_DEFAULTS, ampsFor,
  moveCircuitToWay, compactWays,
} from "./electric.js";

/* Editing whatever you right-clicked.

   One panel for every kind of feature, because they mostly share the
   same fields — what it's called, which layer it's on, what it's made
   of. The parts that differ appear only when they apply. */
export default function FeatureEditor({
  feature, layers, lineTypes, surfaceTypes = [], plotList, lookups,
  /* The whole drawing, so a meter can be offered the circuits that
     already exist on it. */
  allFeatures = [],
  onSave, onSavePlot, onDelete, onClose, onRenameCircuits,
  onIsolateCircuit, circuitIsolated,
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
  /* A water line picks its pipe from the configured sizes, by the same
     test and for the same reason: the size is a row in a table, not
     text, because the build reads it back to decide what a length
     carries and "63" typed by hand matches nothing. */
  const isWater = feature.Feature_Type === "line" && !isTrench && (() => {
    const t = lineTypes.find((x) => x.Type_Key === f.Attributes?.Line_Type);
    return t ? t.Layer_Key === "water" : feature.Layer_Key === "water";
  })();
  const isPoly = feature.Feature_Type === "polygon";
  const isSeed = feature.Feature_Role === "plot";
  const isMeter = feature.Feature_Role === "meter";

  /* The circuits already on this drawing, with how many meters each
     holds — the count is what tells one circuit from another when the
     names are all "Circuit 1", "Circuit 2". */
  const circuits = useMemo(() => circuitsFrom(allFeatures || []), [allFeatures]);

  /* Circuits sitting on ways beyond the count now typed.

     Worked out from the draft, so the warning appears as the number is
     being changed rather than after saving. */
  const cutOffCircuits = useMemo(() => {
    const n = Number(f.Attributes?.Ways ?? SUB_DEFAULTS.Ways) || 0;
    const map = f.Attributes?.Way_Circuits || {};
    return Object.entries(map)
      .filter(([way, cid]) => Number(way) > n && cid != null)
      .map(([way, cid]) => ({
        way: Number(way),
        name: circuits.find((c) => Number(c.id) === Number(cid))?.name ?? `Circuit ${cid}`,
      }))
      .sort((x, y) => x.way - y.way);
  }, [f.Attributes?.Ways, f.Attributes?.Way_Circuits, circuits]);

  /* ── The LV board ──
     Circuit names and colours are edited here but belong in two
     different places: the name is stamped on every meter and node of the
     circuit, the colour on the substation. Both are held locally until
     Save so a half-typed name is not written on sixty features. */
  const [circuitNames, setCircuitNames] = useState({});
  const setCircuitName = (cid, v) =>
    setCircuitNames((m) => ({ ...m, [cid]: v }));

  const [circuitColoursDraft, setCircuitColoursDraft] = useState(null);
  /* Null until something is changed, so an untouched board writes
     nothing and cannot overwrite a colour set from elsewhere. */
  const chosenColours = circuitColoursDraft
    ?? (feature.Attributes?.Circuit_Colours || {});
  const setCircuitColour = (cid, v) =>
    setCircuitColoursDraft({ ...chosenColours, [cid]: v });

  /* The colour a circuit is drawn in: the chosen one, or its place in
     the palette. The same resolution the canvas uses, from the same
     module, so the swatch cannot show one colour while the drawing
     shows another. */
  const circuitPalette = useMemo(
    () => circuitColours(allFeatures || [], chosenColours),
    [allFeatures, chosenColours],
  );
  const colourFor = (cid) =>
    /* A colour chosen on this board comes first.

       circuitColours works from the feeder mains, so before Build LV
       Network has run it returns nothing and this fell through to the
       palette — quietly ignoring a colour someone had just picked. The
       swatch showed the palette colour, the picker showed the chosen
       one, and saving kept the choice that was never displayed. */
    chosenColours?.[cid] ?? chosenColours?.[String(cid)]
    ?? circuitPalette.get(Number(cid))
    ?? feederColourAt(circuits.findIndex((c) => Number(c.id) === Number(cid)));

  /* What a way is carrying. Amps against its fuse, since that is what
     decides whether the way is viable, with the load and meter count
     behind it. */
  const wayFuse = Number(feature.Attributes?.Way_Fuse_A ?? SUB_DEFAULTS.Way_Fuse_A) || 0;
  const outputV = Number(feature.Attributes?.Output_V ?? SUB_DEFAULTS.Output_V) || 400;
  const rating = Number(feature.Attributes?.Rating_kVA ?? 0) || 0;

  const wayLoad = (cid) => {
    const c = circuits.find((x) => Number(x.id) === Number(cid));
    if (!c) return null;
    const kva = c.meters.reduce((t, m) => {
      const p = plotList.find((x) => x.plot_id === m.Plot_ID);
      const v = p?.kva_load ?? p?.KVA_Load;
      return t + (v != null && v !== "" ? Number(v) : 0);
    }, 0);
    const amps = ampsFor(kva, outputV);
    return {
      meters: c.meters.length,
      kva: Math.round(kva * 10) / 10,
      amps: Math.round(amps),
      pct: wayFuse > 0 ? Math.round((amps / wayFuse) * 100) : 0,
      over: wayFuse > 0 && amps > wayFuse,
    };
  };

  const boardKva = Math.round(circuits.reduce((t, c) =>
    t + (wayLoad(c.id)?.kva ?? 0), 0) * 10) / 10;

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

  /* The cables that belong on this run.

     A service cable and a mains cable are different items and the
     catalogue says which is which, on Usage_Type. Offering the whole
     list meant a service could be given a mains cable — which sizes,
     costs and volt-drops as something it is not, and nothing on the
     drawing would say so.

     Judged from the line's own type: elec_service takes service cables,
     everything else on the electric layer takes mains. Matched loosely,
     because the value is free text in a lookup someone maintains and
     "Service" and "service" are the same answer.

     Two deliberate leniencies. A cable type with no usage recorded stays
     available — an unfilled field is not a statement that the cable is
     the wrong kind. And if filtering would empty the list entirely, the
     full list is shown instead: a picker with nothing in it stops the
     work, and that is worse than one offering too much. */
  const cableUsage = f.Attributes?.Line_Type === "elec_service" ? "service" : "mains";

  /* The plots a joint serves.

     A joint records how many services leave the feeder at its point but
     not which, so this is worked out from position: the service cables
     ending there. Read-only, because the answer follows from where
     things are drawn — a field that let you type a different one would
     only be a way to disagree with the drawing. */
  const isJoint = feature.Feature_Role === "joint";
  const served = useMemo(
    () => (isJoint
      ? servedPlots(feature, allFeatures || [], {
        plotById: (id) => (plotList || []).find((p) => p.plot_id === id),
      })
      : []),
    [isJoint, feature, allFeatures, plotList],
  );

  const cableChoices = useMemo(() => {
    const sizes = lookups?.cableSizes || [];
    const types = lookups?.cableTypes || [];
    const usageOf = (c) => String(
      types.find((t) => t.Cable_Type_ID === c.Cable_Type_ID)?.Usage_Type ?? "",
    ).trim().toLowerCase();

    const fits = sizes.filter((c) => {
      const u = usageOf(c);
      return !u || u === cableUsage;
    });
    return { list: fits.length ? fits : sizes, filtered: fits.length > 0 };
  }, [lookups, cableUsage]);

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

      /* Circuit colours ride along on the substation's own attributes,
         so the board saves in the same write as everything else on it.
         Only when something was actually changed — an untouched board
         must not overwrite a colour set from somewhere else. */
      const subAttrs = circuitColoursDraft
        ? { ...f.Attributes, Circuit_Colours: circuitColoursDraft }
        : f.Attributes;

      await onSave(feature.Feature_ID, {
        Label: f.Label || null,
        Layer_Key: f.Layer_Key,
        Attributes: isSeed
          ? { ...f.Attributes, ...seedAttributes() }
          : subAttrs,
      });

      /* A circuit's name is stamped on every meter, span node and cable
         section that belongs to it, so renaming one is a bulk write
         across the drawing rather than a field on this feature. Done
         after the substation save and only for names that actually
         changed. */
      const renames = Object.entries(circuitNames)
        .map(([cid, name]) => ({
          circuitId: Number(cid),
          name: String(name).trim(),
          was: circuits.find((c) => Number(c.id) === Number(cid))?.name,
        }))
        .filter((r) => r.name && r.name !== r.was);
      if (renames.length) await onRenameCircuits?.(renames);

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
      {/* Wider for a trench, which lays its fields out three across.

          420px was right when everything was stacked in one column. Three
          dropdowns in that width leaves each about 130px, which truncates
          "To be Removed" and "On-site or Off-site" to the point of
          guessing. A plot seed still has few enough fields that the
          narrow form is the better shape. */}
      <div className={isTrench ? "fe fe-wide" : "fe"}
        onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Edit feature">
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
          {/* What this joint is and which plots it serves.

              A joint is placed by what meets at its point, and nothing on
              screen said what that was: a service joint and a breech
              joint looked identical once drawn, and neither said whose
              service it made. Both matter when someone is checking a
              schedule against the ground. */}
          {isJoint && (
            <div className="fe-joint">
              <div className="fe-joint-h">
                <strong>
                  {JOINT_KINDS[feature.Attributes?.Joint_Type]?.label
                    ?? "Joint"}
                </strong>
                {(feature.Attributes?.Joint_Reasons || []).length > 1 && (
                  <span className="fe-joint-why">
                    also {(feature.Attributes.Joint_Reasons || [])
                      .filter((r) => r !== feature.Attributes?.Joint_Type)
                      .join(", ")}
                  </span>
                )}
              </div>
              <div className="fe-joint-p">
                <span>Serves</span>
                {served.length
                  ? (
                    <strong>
                      {served.length === 1 ? "plot " : "plots "}
                      {served.map((p) => p.number).join(", ")}
                    </strong>
                  )
                  /* No service ending here is not a fault in itself — a
                     breech or a straight joint serves none — but on a
                     service joint it means the cable that should reach it
                     does not. */
                  : <em>{feature.Attributes?.Joint_Type === "service"
                      ? "no service cable reaches this point"
                      : "no plots \u2014 this joins the feeder to itself"}</em>}
              </div>
            </div>
          )}

          {/* Which circuit this belongs to, and a way to see it on its
              own. Offered for anything carrying a Circuit_ID — a span
              node, a feeder section, a meter, a joint — because the
              question "what else is on this circuit" is the same one
              whichever of them you happened to click.

              Electric only, matching what the isolate acts on. Absent on
              a trench: a trench serves every circuit that runs through it
              and belongs to none, so there is nothing to isolate from
              it. */}
          {feature.Layer_Key === "electric"
            && feature.Attributes?.Circuit_ID != null && (
            <div className="fe-circuit">
              <span>
                <strong>
                  {feature.Attributes.Circuit_Name
                    || `Circuit ${feature.Attributes.Circuit_ID}`}
                </strong>
                {feature.Attributes.Circuit_Letter && (
                  <span className="fe-cl">{feature.Attributes.Circuit_Letter}</span>
                )}
              </span>
              <button type="button" className="fe-iso"
                title={circuitIsolated
                  ? "Bring back the circuits that were hidden"
                  : "Hide every other circuit. Trenches, plots and the other utilities stay."}
                onClick={() => onIsolateCircuit?.(feature.Attributes.Circuit_ID)}>
                {circuitIsolated ? "Show all circuits" : "Isolate this circuit"}
              </button>
            </div>
          )}
          {error && <Banner kind="error">{error}</Banner>}

          {/* A trench lays these out in two rows of three, with its own
              fields, rather than a column of eight boxes — the modal was
              taller than the screen on a laptop and everything below the
              fold had to be scrolled for.

              Everything else keeps the stacked form, where there are
              fewer fields and the extra width buys nothing. */}
          {isTrench ? (
            <div className="fe-row">
              <div className="fld">
                <label htmlFor="fe-layer">Layer</label>
                <select id="fe-layer" value={f.Layer_Key}
                  onChange={(e) => setF((p) => ({ ...p, Layer_Key: e.target.value }))}>
                  {layers.map((l) => (
                    <option key={l.Layer_Key} value={l.Layer_Key}>{l.Label}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="fe-label">Label</label>
                <input id="fe-label" value={f.Label}
                  onChange={(e) => setF((p) => ({ ...p, Label: e.target.value }))} />
              </div>
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
            </div>
          ) : (
            <>
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
            </>
          )}

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
                  {/* Reducing the count deletes ways off the end, and a
                      way carrying a circuit taken off the board leaves
                      that circuit fed by nothing — with no sign of it
                      anywhere, because the row it was on has gone.

                      Said rather than prevented: a board really can be
                      changed for a smaller one, and the answer is then
                      to move the circuit first, which is a decision
                      rather than an error. */}
                  {cutOffCircuits.length > 0 && (
                    <p className="fe-warn">
                      {cutOffCircuits.length === 1
                        ? `Way ${cutOffCircuits[0].way} carries ${cutOffCircuits[0].name}`
                        : `${cutOffCircuits.length} ways past this carry circuits`}
                      {" \u2014 move "}
                      {cutOffCircuits.length === 1 ? "it" : "them"}
                      {" to a lower way first, or it will be fed by nothing."}
                    </p>
                  )}
                </div>
                <div className="fld">
                  <label htmlFor="fe-fuse">Way fuse (A)</label>
                  <input id="fe-fuse" type="number" step="1"
                    placeholder={String(SUB_DEFAULTS.Way_Fuse_A)}
                    value={f.Attributes.Way_Fuse_A ?? ""}
                    onChange={(e) => setAttr("Way_Fuse_A")(e.target.value)} />
                </div>
              </div>
              <p className="hint fe-board-hint">
                <span>
                  One circuit per way. Defining a circuit takes the next free one.
                </span>
                {/* Closing the gaps in one press.

                    A spare way in the middle is not wrong, but it reads
                    as though something is missing and it makes the next
                    allocation a decision rather than a habit. Offered
                    only when there is a gap to close, so a tidy board
                    carries no button telling it to tidy itself. */}
                {compactWays(f.Attributes.Way_Circuits || {}).changed && (
                  <button type="button" className="fe-free"
                    title="Move the circuits up so the spare ways sit at the end"
                    onClick={() => {
                      const r = compactWays(f.Attributes.Way_Circuits || {});
                      if (r.changed) setAttr("Way_Circuits")(r.map);
                    }}>
                    Close the gaps
                  </button>
                )}
              </p>

              {/* Every way on the board, not only the ones in use. A list
                  showing one entry against a drawing labelled 1B and 2A
                  reads as a contradiction; showing all four says plainly
                  that two are spare.

                  A row per way rather than a chip, because a way carries
                  more than a letter: what it feeds, how hard, and what
                  colour that circuit is drawn in. */}
              <div className="fe-board">
                <div className="fe-board-h">
                  <span>Way</span><span>Circuit</span><span>Loading</span><span>Line</span>
                </div>
                {Array.from(
                  { length: Number(f.Attributes.Ways ?? SUB_DEFAULTS.Ways) || 0 },
                  (_, i) => i + 1,
                ).map((way) => {
                  const cid = (f.Attributes.Way_Circuits || {})[way];
                  const circuit = cid != null
                    ? circuits.find((c) => Number(c.id) === Number(cid)) : null;
                  const load = cid != null ? wayLoad(cid) : null;
                  return (
                    <div className={cid != null ? "fe-board-r" : "fe-board-r spare"} key={way}>
                      {/* The way number, and a way to change it.

                          A circuit is tied to a way by where it sits on
                          this board, and until now the only way to move
                          one was to delete it and make it again. Ways
                          are physical positions on a fuse board, and
                          which circuit is on which is a real decision —
                          usually made after the fact, when the spare
                          turns out to be in the wrong place. */}
                      {cid == null ? (
                        <span className="fe-way-n">{way}</span>
                      ) : (
                        <select className="fe-way-n fe-way-sel" value={way}
                          aria-label={`Way for circuit ${cid}`}
                          title="Move this circuit to another way"
                          onChange={(e) => {
                            const r = moveCircuitToWay(
                              f.Attributes.Way_Circuits || {}, cid, e.target.value);
                            if (r.changed) setAttr("Way_Circuits")(r.map);
                          }}>
                          {Array.from(
                            { length: Number(f.Attributes.Ways ?? SUB_DEFAULTS.Ways) || 0 },
                            (_, k) => k + 1,
                          ).map((w) => (
                            <option key={w} value={w}>{w}</option>
                          ))}
                        </select>
                      )}
                      {cid == null
                        ? <span className="fe-spare">Spare</span>
                        : (
                          <span className="fe-cwrap">
                            <input className="fe-cname"
                              aria-label={`Name of the circuit on way ${way}`}
                              value={circuitNames[cid] ?? circuit?.name ?? `Circuit ${cid}`}
                              onChange={(e) => setCircuitName(cid, e.target.value)} />
                            {/* A way allocated to a circuit that has no
                                meters on it.

                                Emptying a circuit — removing its last
                                meter, or deleting the plots — leaves the
                                way allocation behind, so the board shows
                                a circuit the report has never heard of
                                and a way that is not free but is not
                                carrying anything either.

                                Said rather than hidden: the way is
                                genuinely taken, and someone counting
                                spare ways needs to know why. */}
                            {!circuit && (
                              <>
                                <span className="fe-empty"
                                  title="No meters are on this circuit">
                                  nothing linked
                                </span>
                                {/* Freeing it here, because there is
                                    nowhere else to do it: the circuit
                                    report lists circuits by their
                                    meters, and one with none never
                                    appears in it. The way was stuck
                                    allocated with no way to release it.

                                    Safe precisely because it is empty —
                                    nothing is linked, so nothing is
                                    lost. A way carrying meters is
                                    deleted from the report, which asks
                                    what should happen to them. */}
                                {/* Changed on the draft, then saved with
                                    everything else on this board.

                                    Writing straight to the database
                                    looked like doing nothing: the editor
                                    holds its own copy of Attributes, so
                                    the row on screen did not move — and
                                    pressing Save afterwards would have
                                    written the old map back over it,
                                    restoring the way.

                                    Editing the draft is also how every
                                    other field here behaves, so it saves
                                    and cancels with the rest. */}
                                <button type="button" className="fe-free"
                                  title={`Clear way ${way} — nothing is linked to it`}
                                  onClick={() => {
                                    const map = { ...(f.Attributes.Way_Circuits || {}) };
                                    delete map[way];
                                    /* By key and by value: the way is
                                       keyed by number in some drawings
                                       and by string in others, and a
                                       circuit could in principle hold
                                       two ways. */
                                    for (const k of Object.keys(map)) {
                                      if (Number(map[k]) === Number(cid)) delete map[k];
                                    }
                                    setAttr("Way_Circuits")(map);
                                  }}>
                                  Clear this way
                                </button>
                              </>
                            )}
                          </span>
                        )}
                      {load
                        ? <span className="fe-load">
                            <span className={load.over ? "fe-amps over" : "fe-amps"}>
                              {load.amps} A &middot; {load.pct}%
                            </span>
                            <span className="fe-bar">
                              <i style={{
                                width: `${Math.min(100, load.pct)}%`,
                                background: load.over ? "#dc2626"
                                  : load.pct > 80 ? "#d97706" : "#15803d",
                              }} />
                            </span>
                            <span className="fe-meters">
                              &#9889; {load.meters} meter{load.meters === 1 ? "" : "s"}
                              {" \u00B7 "}{load.kva} kVA
                            </span>
                          </span>
                        : <span />}
                      {cid == null
                        ? <span />
                        : <label className="fe-swatch"
                            title={`Colour of ${circuit?.name ?? `circuit ${cid}`} on the drawing`}>
                            <input type="color" value={colourFor(cid)}
                              aria-label={`Line colour for circuit ${cid}`}
                              onChange={(e) => setCircuitColour(cid, e.target.value)} />
                            <span style={{ background: colourFor(cid) }} />
                          </label>}
                    </div>
                  );
                })}
              </div>

              {/* What the board is carrying against what it can. The one
                  figure that turns a list of ways into a decision. */}
              <div className="fe-demand">
                <div className="fe-demand-h">
                  <span>Connected demand</span>
                  {rating > 0 && (
                    <span className="fe-demand-sp">
                      {Math.round((boardKva / rating) * 100)}% &middot;
                      {" "}{Math.round((rating - boardKva) * 10) / 10} kVA spare
                    </span>
                  )}
                </div>
                <p className="fe-demand-n">
                  <strong>{boardKva}</strong> kVA{rating > 0 && ` of ${rating} kVA`}
                </p>
                {rating > 0 && (
                  <span className="fe-bar big">
                    <i style={{
                      width: `${Math.min(100, (boardKva / rating) * 100)}%`,
                      background: boardKva > rating ? "#dc2626" : "#334155",
                    }} />
                  </span>
                )}
                {/* Said plainly rather than left to be discovered. A
                    figure summed without diversity is not what a network
                    draws, and anyone reading a percentage off this needs
                    to know which it is. */}
                <p className="hint">
                  Demand is summed without a diversity factor.
                </p>
              </div>

              <p className="hint">
                Cable labels read way then circuit, so <strong>2A</strong> is
                circuit A on way 2. The colour is how that circuit&rsquo;s LV
                feeder is drawn, from the substation to its far end.
              </p>
            </>
          )}

          {isLine && (
            <>
              {/* Line type is in the row above for a trench, alongside
                  the layer and the label. */}
              {!isTrench && (
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
              )}
              <div className="fe-row">
                {isTrench ? (
                  <>
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

                  {/* What stage this length is at. The same list the
                      canvas marks with, so the two cannot drift. */}
                  <div className="fld">
                    <label htmlFor="fe-build">Build status</label>
                    <select id="fe-build" value={f.Attributes.Build_Status ?? ""}
                      /* Null rather than undefined for "not set".
                         undefined survives in state and then vanishes
                         when the row is serialised, so what is stored
                         depends on a JSON quirk rather than on what was
                         chosen. */
                      onChange={(e) => setAttr("Build_Status")(e.target.value || null)}>
                      <option value="">&mdash; Not set &mdash;</option>
                      {BUILD_STATUSES.map((bs) => (
                        <option key={bs.key} value={bs.key}>{bs.label}</option>
                      ))}
                    </select>
                    <p className="hint">Marking part of a run splits it on the canvas.</p>
                  </div>

                  {/* On or off site.

                      A dropdown rather than a checkbox: "Off site"
                      unticked reads as "not yet decided" as readily as
                      "on site", and the two are a different rate and a
                      different permit. Naming both leaves nothing to
                      infer. */}
                  <div className="fld">
                    <label htmlFor="fe-offsite">On-site or Off-site</label>
                    <select id="fe-offsite"
                      value={f.Attributes.Off_Site === true ? "off" : "on"}
                      onChange={(e) => setAttr("Off_Site")(
                        e.target.value === "off" ? true : null)}>
                      <option value="on">On site</option>
                      <option value="off">Off site</option>
                    </select>
                    <p className="hint">Off site carries a different rate and notice.</p>
                  </div>
                  </>
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
                      {cableChoices.list.map((c) => {
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
                    {cableChoices.filtered ? (
                      <p className="hint">
                        {cableUsage === "service"
                          ? "Service cables only \u2014 set by Usage on the cable type."
                          : "Mains cables only \u2014 set by Usage on the cable type."}
                      </p>
                    ) : (
                      <p className="hint">
                        No cable type is marked as
                        {cableUsage === "service" ? " Service" : " Mains"},
                        so the whole catalogue is shown. Set Usage in
                        Admin &rsaquo; Electric Specs to narrow it.
                      </p>
                    )}
                    {f.Attributes.Generated && (
                      <p className="hint">
                        Drawn by Build LV Network. Changing it here is kept;
                        rebuilding will not overwrite a cable you have chosen.
                      </p>
                    )}
                  </div>
                ) : isWater ? (
                  /* Water sizes from the table, not from typing.

                     Build Water Network sets this on every run it draws
                     \u2014 the smallest pipe that carries the plots beyond
                     that length \u2014 and this is where it is seen and
                     overridden. A length somebody sizes up by hand
                     because of a future phase is a real decision, and
                     the drawing should be able to hold it. */
                  <div className="fld">
                    <label htmlFor="fe-pipe">Pipe</label>
                    <select id="fe-pipe" value={f.Attributes.Water_Pipe_Size_ID ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        const row = (lookups?.waterPipeSizes || [])
                          .find((x) => Number(x.Water_Pipe_Size_ID) === id);
                        setAttr("Water_Pipe_Size_ID")(id);
                        /* Size follows the choice rather than being a
                           second field to keep in step. Everything that
                           already shows a pipe reads Size \u2014 trench
                           contents labels one with it \u2014 so the two are
                           written together, here and in the build, and
                           there is nowhere for them to drift apart. */
                        setAttr("Size")(row
                          ? (row.Size_Label || `${Number(row.Diameter_mm)}mm`)
                          : null);
                      }}>
                      <option value="">&mdash; not set &mdash;</option>
                      {(lookups?.waterPipeSizes || []).map((x) => {
                        /* Whose rule it is, where it is somebody's.

                           The same diameter can appear more than once —
                           one NAV allows twenty plots on 63mm and
                           another sixteen — and two options reading
                           "63mm" with different plot counts are
                           indistinguishable until the operator is on
                           them. The build picks the right rule on its
                           own; this list is for overriding by hand, and
                           an override should be made knowingly. */
                        const op = x.IDNO_ID != null
                          ? (lookups?.idnos || []).find((i) =>
                            Number(i.IDNO_ID) === Number(x.IDNO_ID))?.IDNO_Name
                          : x.DNO_ID != null
                            ? (lookups?.dnos || []).find((d) =>
                              Number(d.DNO_ID) === Number(x.DNO_ID))?.DNO_Name
                            : null;
                        return (
                          <option key={x.Water_Pipe_Size_ID} value={x.Water_Pipe_Size_ID}>
                            {x.Size_Label || `${Number(x.Diameter_mm)}mm`}
                            {` \u2014 up to ${x.Max_Meters} plots`}
                            {op ? ` (${op})` : ""}
                          </option>
                        );
                      })}
                    </select>
                    {!(lookups?.waterPipeSizes || []).length ? (
                      <p className="hint">
                        No pipe sizes yet &mdash; add them in
                        Admin &rsaquo; Water Pipe Sizes.
                      </p>
                    ) : f.Attributes.Meters != null ? (
                      /* What the build counted, kept beside the choice:
                         a size overridden by hand should be overridden
                         against a number rather than a hunch. */
                      <p className="hint">
                        Feeds {f.Attributes.Meters} plot(s) beyond this length.
                      </p>
                    ) : null}
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
                        {/* The reason, not just the absence. An air source plot
                            with no unit chosen and a plot with no heating
                            source at all are different jobs. */}
                        {plot?.kva_source === "no heat pump"
                          ? "No load \u2014 choose a heat pump model"
                          : plot?.kva_source === "no gas base"
                            ? "No load \u2014 no gas figure for this house type"
                            : "No load \u2014 set a heating source, or enter one on the Plots tab"}
                      </span>
                    : <>
                        <strong>{Number(plot.kva_load).toFixed(1)} kVA</strong>
                        <span className="fe-kva-src">{kvaSourceText(plot.kva_source)}</span>
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
          <button className="btn delete" disabled={busy} onClick={remove}>Delete</button>
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
/* Half again as wide, so three controls in a row have room for their
   longest option rather than truncating it. */
.fe.fe-wide { width: min(630px, 94vw); }
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
.fe-board { display: grid; gap: 2px; margin: 6px 0; }
.fe-board-h, .fe-board-r { display: grid; grid-template-columns: 34px 1fr 150px 40px;
  gap: 8px; align-items: center; }
.fe-board-h { font: 700 10px inherit; text-transform: uppercase; letter-spacing: .05em;
  color: var(--muted); padding: 0 2px 4px; border-bottom: 1px solid var(--border); }
.fe-board-r { padding: 5px 2px; border-bottom: 1px solid var(--bg); }
.fe-board-r.spare { opacity: .55; }
.fe-way-n { display: inline-grid; place-items: center; width: 22px; height: 22px;
  border-radius: 50%; background: var(--bg); font: 700 11px inherit; }
.fe-cname { border: 1px solid var(--border); border-radius: 6px; font: 600 12px inherit;
  padding: 4px 8px; width: 100%; }
.fe-cwrap { flex: 1; display: flex; align-items: center; gap: 7px; }
.fe-board-hint { display: flex; align-items: center; gap: 10px; }
.fe-board-hint > span { flex: 1; }
.fe-way-sel { border: 1px solid var(--border); border-radius: 5px; cursor: pointer;
  font: 600 11px inherit; padding: 1px 3px; background: var(--white); }
.fe-warn { margin: 5px 0 0; font-size: 10.5px; font-weight: 600; color: #b45309; }
.fe-free { background: none; border: 1px solid var(--border); border-radius: 5px;
  cursor: pointer; font: 600 10px inherit; padding: 2px 7px; color: var(--accent); }
.fe-free:hover { border-color: var(--accent); background: var(--bg); }
.fe-empty { font-size: 10px; font-weight: 600; color: #b45309; white-space: nowrap; }
.fe-spare { font-size: 11.5px; color: var(--muted); }
.fe-load { display: grid; gap: 2px; }
.fe-amps { font: 700 11.5px inherit; color: #15803d; }
.fe-amps.over { color: #b91c1c; }
.fe-meters { font-size: 10.5px; color: var(--muted); }
.fe-bar { display: block; height: 5px; border-radius: 3px; background: var(--bg); overflow: hidden; }
.fe-bar i { display: block; height: 100%; }
.fe-bar.big { height: 8px; margin: 4px 0 6px; }
.fe-swatch { position: relative; display: block; width: 34px; height: 24px; cursor: pointer; }
.fe-swatch input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%;
  cursor: pointer; }
.fe-swatch span { display: block; width: 100%; height: 100%; border-radius: 5px;
  border: 1.5px solid var(--white); box-shadow: 0 0 0 1px var(--border); }
.fe-demand { background: var(--bg); border-radius: var(--radius); padding: 11px 13px; margin: 10px 0; }
.fe-demand-h { display: flex; justify-content: space-between; font-size: 11.5px;
  color: var(--muted); }
.fe-demand-sp { font-weight: 600; }
.fe-demand-n { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
.fe-demand-n strong { font-size: 24px; color: var(--text); }
.fe-joint { background: var(--bg); border-radius: var(--radius); padding: 9px 12px;
  margin-bottom: 10px; display: grid; gap: 4px; }
.fe-joint-h { display: flex; align-items: baseline; gap: 8px; }
.fe-joint-h strong { font-size: 12.5px; }
.fe-joint-why { font-size: 11px; color: var(--muted); }
.fe-joint-p { display: flex; gap: 8px; font-size: 12px; }
.fe-joint-p > span { color: var(--muted); }
.fe-joint-p em { color: #b45309; font-style: normal; font-size: 11.5px; }
.fe-circuit { display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: var(--bg); border-radius: var(--radius); padding: 8px 11px; margin-bottom: 12px; }
.fe-circuit strong { font-size: 12.5px; }
.fe-cl { background: var(--accent); color: #fff; border-radius: 5px; padding: 0 6px;
  font-size: 10.5px; margin-left: 6px; }
.fe-iso { background: var(--white); border: 1px solid var(--border); border-radius: 6px;
  cursor: pointer; font: 600 11px inherit; padding: 4px 10px; color: var(--accent); }
.fe-iso:hover { border-color: var(--accent); }
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
