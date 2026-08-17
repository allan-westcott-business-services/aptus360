import { useState, useMemo, useCallback } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { BUILD_STATUSES, MAIN_STATUSES, isMainFeature } from "./buildStatus.js";
import FutureAllowance from "./FutureAllowance.jsx";
import { utilityById } from "../../lib/utilities.js";
import {
  lineLength, isTrenchType, isTrenchFeature, classLabel,
} from "./snapping.js";
import { EASEMENT_KEY } from "./easement.js";
import { contentsOf } from "./trenchContents.js";
import { UTILITIES } from "../../lib/utilities.js";
import { trenchSize, concurrentCount, dominantOf } from "./trenchSize.js";
import { digEstimate, hoursText } from "./digRate.js";
import { TRENCH_CARRIES } from "./trenchCarries.js";
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
  /* Excavation and lay rates. Defaulted rather than required: the
     editor is opened from several places and an estimate that vanished
     because one of them forgot a prop would look like a trench with no
     duration rather than like a wiring mistake. digRate.js falls back
     to its own figures on empty. */
  digRates = [], digDepthFactors = [], digLayRates = {},
  /* The whole drawing, so a meter can be offered the circuits that
     already exist on it. */
  allFeatures = [],
  /* Told when a gas main is sized by hand, so the canvas can offer to
     bring the pipes between here and the POC up to match. */
  onUpstreamSize,
  /* Told when a cable is sized by hand, so the canvas can put the same
     size on the span node the run feeds. */
  onCableSized,
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
  /* The layer, not just the line type: a trench drawn onto the trench
     layer has no type until somebody picks one, and asking the type
     alone hid every trench-only control on exactly those sections. */
  const isTrench = isTrenchFeature({ ...feature, Attributes: f.Attributes }, lineTypes);
  /* Read from the edited attributes rather than the saved feature, so
     changing a line's type to a main shows the field without saving
     first. */
  const isMain = isMainFeature({ ...feature, Attributes: f.Attributes }, lineTypes);
  /* Whether this edit changed the cable, so the span node it feeds can
     be brought with it once the change is saved. */
  const [cableChanged, setCableChanged] = useState(false);
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
  /* Main or service, off the line type — the same test the network
     builder uses, so the editor offers what the build would choose. */
  const isServiceLine = /service/i.test(f.Attributes?.Line_Type || "");

  /* How wide and deep this length has to be dug, from what is in it.

     Read only, and worked out rather than stored: adding a cable to a
     trench widens it, and a figure somebody typed once would go stale
     the moment the drawing changed. NJUG spacing, ordinary case \u2014 see
     trenchSize.js for what that assumes and where to change it. */
  /* What is routed along this trench, as sizes.

     Read from the same contentsOf the dimensions come from, so the two
     cannot disagree about what is in it. */
  const trenchContents = useMemo(() => {
    if (!isTrench || feature.Feature_Type !== "line") return [];
    const serviceLineTypes = new Set(lineTypes
      .filter((t) => t.Layer_Key !== "trench" && /service/i.test(t.Type_Key))
      .map((t) => t.Type_Key));
    const serviceTrenchTypes = new Set(["trench_service", ...lineTypes
      .filter((t) => t.Layer_Key === "trench" && /service/i.test(t.Type_Key))
      .map((t) => t.Type_Key)]);

    const res = contentsOf(feature, allFeatures, {
      serviceLineTypes,
      serviceTrenchTypes,
      isTrench: (x) => x.Feature_Type === "line"
        && isTrenchType(x.Attributes?.Line_Type, lineTypes),
      /* The size, which is what somebody wants \u2014 a cable's label is
         its circuit and way, which says which run it is and nothing
         about what was laid. */
      labelOf: (x) => {
        const sizeId = x.Attributes?.Cable_Size_ID ?? x.Attributes?.VD_Cable_Size_ID;
        const size = sizeId != null
          ? (lookups?.cableSizes || []).find((c) =>
            String(c.Cable_Size_ID) === String(sizeId))?.Size_Label
          : null;
        if (size) return size;
        const pipe = String(x.Attributes?.Size ?? "").trim();
        if (pipe) return pipe;
        return lineTypes.find((t) => t.Type_Key === x.Attributes?.Line_Type)?.Label
          ?? x.Label ?? null;
      },
    });
    if (res.error) return [];

    /* One row per size, with a count.

       A row per feature reads as duplicates: three plots' services in
       one stretch of main are three separate cables that happen to be
       the same size, and "63mm, 63mm, 63mm" looks like the list is
       broken rather than like three services. Grouped, it says what is
       actually there \u2014 3 x 63mm.

       Grouped after the utility is resolved, not before: a 63mm water
       service and a 63mm gas service are not the same thing however
       alike their labels look. */
    const rows = (res.contents || []).map((c, i) => {
      const layer = (layers || []).find((l) => l.Layer_Key === c.utility);
      /* The same icon the Plot Connections page uses.

         Matched on the layer's name against the shared utility list, so
         the bolt, the flame and the droplet mean the same thing
         wherever they appear. A dot needs the legend held in your head,
         and green for gas against blue for water is the pair most often
         got the wrong way round. */
      const name = layer?.Label ?? c.utility ?? "";
      const known = UTILITIES.find((u) =>
        u.name.toLowerCase() === String(name).toLowerCase());
      return {
        key: c.feature?.Feature_ID ?? i,
        /* The layer, kept alongside the display name. The three named
           size fields look their utility up by key, and "Electric" is a
           label somebody could rename. */
        layerKey: c.utility,
        label: c.label || "\u2014",
        icon: known?.icon ?? "\u25CF",
        utility: known?.name ?? name,
        withinM: c.withinM,
      };
    });

    /* Counted across the trench, not along it.

       Nothing joins a trench part way along its length, so several
       features of the same size in one section are consecutive runs of
       one pipe rather than several laid together. Counting them gave
       "3 x 95" for a single cable that the build had split into three
       runs at the junctions — and the count grew every rebuild, because
       a maturing design splits the network further.

       concurrentCount is the same rule the width uses, so the list and
       the dimension beside it cannot disagree about how many things are
       in the trench. */
    const grouped = [];
    for (const r of rows) {
      const held = grouped.find((g) => g.utility === r.utility);
      if (held) held.runs.push(r);
      else grouped.push({ ...r, runs: [r] });
    }
    return grouped.map((g) => {
      /* Named by the run that covers most of the trench.

         A build cuts a main wherever the calculated size steps, so one
         pipe comes back as 180mm for most of a run and 90mm past the
         point the load drops. Listing both read as two pipes; naming
         the longer says what is mostly in the ground, which is what
         somebody looking at a trench wants. The width is dug for the
         widest either way — see crossSection. */
      const main = dominantOf(g.runs) ?? g;
      const sizes = [...new Set(g.runs.map((r) => r.label))].filter(Boolean);
      return {
        ...g,
        label: main.label ?? g.label,
        count: concurrentCount(g.runs, res.trenchM),
        /* The other sizes it is drawn in, for the tooltip. Not shown as
           separate entries — they are the same pipe — but a length that
           steps size is worth being able to see. */
        alsoSizes: sizes.filter((x) => x !== (main.label ?? g.label)),
        runCount: g.runs.length,
      };
    });
  }, [isTrench, feature, allFeatures, lineTypes, layers, lookups]);

  const trenchDims = useMemo(() => {
    if (!isTrench || feature.Feature_Type !== "line") return null;
    const serviceLineTypes = new Set(lineTypes
      .filter((t) => t.Layer_Key !== "trench" && /service/i.test(t.Type_Key))
      .map((t) => t.Type_Key));
    const serviceTrenchTypes = new Set(["trench_service", ...lineTypes
      .filter((t) => t.Layer_Key === "trench" && /service/i.test(t.Type_Key))
      .map((t) => t.Type_Key)]);

    const res = contentsOf(feature, allFeatures, {
      serviceLineTypes,
      serviceTrenchTypes,
      isTrench: (x) => x.Feature_Type === "line"
        && isTrenchType(x.Attributes?.Line_Type, lineTypes),
    });
    if (res.error) return null;

    const items = (res.contents || []).map((c) => {
      const mm = Number(String(c.feature?.Attributes?.Size ?? "")
        .replace(/[^0-9.]/g, ""));
      return {
        utility: c.utility,
        outsideDiameterMM: mm > 0 ? mm : null,
        /* Where along the trench it runs. Without this a trench with
           three consecutive gas runs along it is sized as three gas
           pipes side by side. */
        withinM: c.withinM,
      };
    });

    /* The utility of each thing laid, carried along with the size.

       The estimate needs one entry per lay and trenchSize returns only
       a count, so the list is kept here rather than contentsOf being
       walked a second time — a second walk is a second chance for the
       duration and the dimensions to be talking about different
       contents. */
    return {
      ...trenchSize(items, { trenchM: res.trenchM }),
      utilityKeys: items.map((x) => x.utility),
    };
  }, [isTrench, feature, allFeatures, lineTypes]);

  /* Gas, by the same test as water. */
  const isGas = feature.Feature_Type === "line" && !isTrench && (() => {
    const t = lineTypes.find((x) => x.Type_Key === f.Attributes?.Line_Type);
    return t ? t.Layer_Key === "gas" : feature.Layer_Key === "gas";
  })();

  /* The gas sizes, one row per actual pipe.

     Gas_Pipe_Size is a table of sizing rules, not a catalogue: 63mm
     appears once per capacity band and again for each operator with its
     own ceiling. Listed as they come, the picker showed "63mm PE" five
     times over with nothing to tell the rows apart \u2014 five identical
     choices is worse than one, because it makes somebody wonder which
     is right.

     Grouped by bore, which is what a pipe size is. The id kept is the
     first rule for that bore; nothing outside this field reads it, and
     the bore \u2014 which the levels check does read \u2014 is the same
     whichever rule it came from.

     Low pressure only, matching the assumption the build makes; nothing
     in the schema records a scheme's tier yet. Sorted by bore rather
     than by label, because "125" sorts before "63" as text. */
  const gasPipeChoices = (() => {
    const byBore = new Map();
    for (const x of lookups?.gasPipeSizes || []) {
      if ((x.Pressure_Tier ?? "LP") !== "LP") continue;
      const bore = Number(x.Diameter_mm);
      if (!(bore > 0)) continue;
      const held = byBore.get(bore);
      /* The largest ceiling for the bore, so the note under the field
         reads as what the pipe can carry rather than the tightest rule
         that happens to mention it. */
      if (!held || Number(x.Max_kW || 0) > Number(held.Max_kW || 0)) {
        byBore.set(bore, x);
      }
    }
    return [...byBore.values()].sort((a, b) =>
      Number(a.Diameter_mm) - Number(b.Diameter_mm));
  })();

  /* Which option is showing, matched on bore rather than on the id.

     The picker keeps one rule per bore and the build stores whichever
     rule the load happened to select \u2014 the same 63mm pipe, a different
     row. Comparing ids meant the stored value matched no option, so the
     browser fell back to the first one and every built main read "Sized
     by the build" however it had been sized. */
  /* An id, resolved to the one option offered for its bore.

     The picker keeps one row per bore and the build stores whichever
     rule its load selected, so comparing ids directly matches nothing
     \u2014 which is what made every built main read as unsized. */
  const gasOptionFor = (id) => {
    if (id == null) return "";
    const stored = (lookups?.gasPipeSizes || [])
      .find((x) => Number(x.Gas_Pipe_Size_ID) === Number(id));
    if (!stored) return "";
    const match = gasPipeChoices
      .find((x) => Number(x.Diameter_mm) === Number(stored.Diameter_mm));
    return match ? String(match.Gas_Pipe_Size_ID) : "";
  };

  const manualGasValue = gasOptionFor(f.Attributes?.Manual_Gas_Pipe_Size_ID);

  const gasPipeValue = (() => {
    const id = f.Attributes?.Gas_Pipe_Size_ID;
    if (id == null) return "";
    const stored = (lookups?.gasPipeSizes || [])
      .find((x) => Number(x.Gas_Pipe_Size_ID) === Number(id));
    if (!stored) return "";
    const match = gasPipeChoices
      .find((x) => Number(x.Diameter_mm) === Number(stored.Diameter_mm));
    return match ? String(match.Gas_Pipe_Size_ID) : "";
  })();
  const pipeChoices = (lookups?.waterPipeSizes || [])
    .filter((x) => (x.Pipe_Kind ?? "main") === (isServiceLine ? "service" : "main"));

  const isPoly = feature.Feature_Type === "polygon";
  const isSeed = feature.Feature_Role === "plot";
  const isMeter = feature.Feature_Role === "meter";
  const isValve = feature.Feature_Role === "servicevalve";

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

  /* A cable size as it is written on the drawing. Three places wanted
     the same three lines: the run's read-only system field, and now the
     span node's system field and its "what the trace reads" line. */
  const cableLabel = useCallback((id) => {
    if (id == null) return "";
    const c = (lookups?.cableSizes || [])
      .find((x) => Number(x.Cable_Size_ID) === Number(id));
    if (!c) return "";
    const t = (lookups?.cableTypes || [])
      .find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    return [t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ");
  }, [lookups]);

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

  /* How long this length takes to open and to lay.

     Downstream of the size, and below `length` rather than beside the
     size it reads: the memo depends on the measured length, and a hook
     placed above the const that declares it throws before the panel can
     render. checkhooks.mjs is what says so.

     Re-run when the surface picker changes as well, because that is a
     multiplier of better than two to one between a verge and a 3/4
     carriageway — a duration that did not move when somebody answered
     the surface question would be the wrong number sitting next to the
     right answer. */
  const trenchEstimate = useMemo(() => {
    if (!trenchDims?.items) return null;
    return digEstimate({
      lengthM: length,
      size: trenchDims,
      surfaceKey: f.Attributes?.Surface_Type ?? null,
      /* An existing trench is not this job's to dig, but its pipes and
         cables still have to be laid. Read from the live field rather
         than the saved feature, so changing the status moves the
         duration while the panel is open. */
      existing: f.Attributes?.Build_Status === "existing",
      utilities: trenchDims.utilityKeys ?? [],
      rates: digRates,
      depthBands: digDepthFactors,
      layRates: digLayRates,
      surfaceTypes,
    });
  }, [trenchDims, length, f.Attributes?.Surface_Type,
    digRates, digDepthFactors, digLayRates, surfaceTypes]);

  /* What this actually is, at the top of the panel.

     Every line said "Line", which is the one thing the panel does not
     need to tell you — you right-clicked it. The line type's own label
     says whether it is a gas main or an electric service, which is what
     somebody with four of these open needs to read at a glance.

     The configured label, not a name built here from the key: renaming
     a type in admin should rename it everywhere, and a second spelling
     invented in this file would be the one that stops matching. */
  const kind = isSeed ? "Plot seed"
    : isMeter ? "Meter"
    /* A span node is what the whole network is measured between, and
       "Point" told somebody nothing they did not already know. */
    : feature.Feature_Role === "spannode" ? "Span node"
    : isPoly ? "Area"
    : isLine ? (classLabel(f, lineTypes) || "Line")
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

      /* The span node this run feeds, brought with it.

         After the save rather than on the dropdown: pushing at the
         moment of choosing read the drawing as it was before the edit
         landed, so the node was given the old size or nothing at all. */
      if (cableChanged) await onCableSized?.(feature);

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
            {/* No point count and no length. The count is a fact about
                the geometry rather than about the dig, and the length
                is a field of its own on a trench \u2014 said twice, it was
                two places to read the same number from. */}
            {plot && <p className="fe-sub">plot {plot.plot_number}</p>}
            {/* ── The feature's own id ──

                Nothing on screen said which feature this was, so the
                only way to name one when something on a drawing needed
                investigating was to describe where it sat and hope.

                Selectable, and in a monospace face, because the thing
                somebody does with it is copy it into a query. Quiet,
                because it is for the times something is wrong rather
                than a fact about the dig. */}
            {feature.Feature_ID != null && (
              <p className="fe-id mono" title="Feature ID">
                {`#${feature.Feature_ID}`}
              </p>
            )}
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
          {/* ── Turning a service valve ──

              The bar is drawn square to the pipe, so what is edited is
              the pipe's bearing rather than the bar's — the same fact
              the placement takes off the main it snapped to.

              Here because it cannot always be worked out: a valve
              dropped where no main has been drawn yet has no angle to
              take, and one on a main that has since been redrawn keeps
              the old one. Ninety degrees at a time covers nearly every
              case, and the box is there for the rest. */}
          {isValve && (
            <div className="fld">
              <label htmlFor="fe-angle">Angle of the main (degrees)</label>
              <div className="fe-angle">
                <input id="fe-angle" type="number" step="1"
                  value={f.Attributes.Angle_Deg ?? ""}
                  placeholder="0"
                  onChange={(e) => setAttr("Angle_Deg")(
                    e.target.value === "" ? null : Number(e.target.value))} />
                <button className="btn ghost sm"
                  onClick={() => setAttr("Angle_Deg")(
                    (((Number(f.Attributes.Angle_Deg) || 0) + 90) % 360 + 360) % 360)}>
                  Rotate 90&deg;
                </button>
              </div>
              <p className="hint">
                {f.Attributes.Angle_Deg == null
                  ? "No main was found under this valve, so it is drawn square to the screen."
                  : "Taken from the main it sits on. The valve is drawn across it."}
              </p>
            </div>
          )}

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
          {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

          {/* A trench lays these out in two rows of three, with its own
              fields, rather than a column of eight boxes — the modal was
              taller than the screen on a laptop and everything below the
              fold had to be scrolled for.

              Everything else keeps the stacked form, where there are
              fewer fields and the extra width buys nothing. */}
          {isTrench ? (
            /* No layer: a trench is on the trench layer, and offering a
               dropdown that only ever holds one right answer is a way to
               get it wrong. */
            <div className="fe-row">
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

              {/* On or off site, and whether it crosses an easement.

                  A dropdown rather than a checkbox: "Off site" unticked
                  reads as "not yet decided" as readily as "on site", and
                  the two are a different rate and a different permit. */}
              <div className="fld">
                <label htmlFor="fe-offsite">On-site or Off-site</label>
                <select id="fe-offsite"
                  value={f.Attributes.Off_Site === true ? "off" : "on"}
                  onChange={(e) => setAttr("Off_Site")(
                    e.target.value === "off" ? true : null)}>
                  <option value="on">On site</option>
                  <option value="off">Off site</option>
                </select>
              </div>

              <div className="fld">
                <label className="fe-check">
                  <input type="checkbox"
                    checked={!!f.Attributes[EASEMENT_KEY]}
                    onChange={(e) => setAttr(EASEMENT_KEY)(e.target.checked)} />
                  Easement
                </label>
              </div>
            </div>
          ) : (
            <>
              <div className="fld">
                <label htmlFor="fe-label">Label</label>
                <input id="fe-label" value={f.Label}
                  onChange={(e) => setF((p) => ({ ...p, Label: e.target.value }))} />
              </div>

              {/* Not on a span node.

                  Its layer is decided when it is placed and there is no
                  right answer to change it to — moving one to another
                  layer does not move the network it is measured along,
                  it just hides it from the utility that owns it.

                  The line type dropdown that used to appear beside this
                  came from somewhere else: a span node sits on the
                  trench layer, and isTrenchFeature answered yes to
                  anything on that layer whether or not it was a line —
                  so the editor gave a point the whole trench form. That
                  is fixed at the source, in snapping.js. */}
              {feature.Feature_Role !== "spannode" && (
                <div className="fld">
                  <label htmlFor="fe-layer">Layer</label>
                  <select id="fe-layer" value={f.Layer_Key}
                    onChange={(e) => setF((p) => ({ ...p, Layer_Key: e.target.value }))}>
                    {layers.map((l) => (
                      <option key={l.Layer_Key} value={l.Layer_Key}>{l.Label}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* A span node, as the original shows it. Two quite different
              cases: one that belongs to a circuit is numbered from the
              substation and cannot be renamed, because the number is its
              position in a sequence and editing it would break the
              schedule it appears on. A standalone one is a named waypoint
              and the letter is the whole point of it. */}
          {/* ── Plots that are not drawn yet ──

              A phase two of fifty gets fed from a node on phase one.
              Nothing sizes for it, so the main laid today is sized for
              today — and when phase two arrives the answer is to dig
              the road up again.

              Described rather than typed as a load, where the mix is
              known: twenty three-bed on gas reads the same consumption
              figures a drawn three-bed on gas reads, so the allowance
              and the real plot size identically and recalibrating that
              table moves both.

              A plain figure as well, because on a phase nobody has
              designed the mix usually is not known. */}
          {feature.Feature_Role === "spannode" && (
            <FutureAllowance
              value={f.Attributes.Future_Allowance ?? null}
              consumption={lookups?.houseTypeConsumption || []}
              heatSources={lookups?.heatSources || []}
              onChange={setAttr("Future_Allowance")}
            />
          )}

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
          {/* ── Only on a node that is part of an electric circuit ──

              This pair is the size of the cable feeding the node, which
              feeder.js reads to work out volt drop and the levels label
              shows beside it. Real, and worth keeping where it means
              something.

              It means nothing on a gas or water span node, or on a
              standalone one. Those have no cable feeding them and no
              volt drop to compute, so the fields sat there offering an
              override of a figure that does not exist — which is what
              "No cable set" was saying, in a box asking to change it.

              Gated on the circuit rather than on the geometry: every
              span node is a point, and the ones that do need this are
              points too. */}
          {feature.Feature_Role === "spannode"
            && f.Attributes.Circuit_ID != null
            && Number(f.Attributes.Span_Seq) !== 0 && (
            <>
              {/* The build's answer and the override, the same pair the
                  drawn run carries.

                  This was a single select bound to VD_Cable_Size_ID.
                  Every other reader in the app — cableIdOf, sizeIdFor,
                  sizeLabelOf, the levels report, the BOM, and the cable
                  editor itself — takes the override first and falls back
                  to the calculated size. This one field read the system
                  size alone, so a node fed by an overridden run showed 95
                  while its label and the trace both said 300 — and saving
                  it wrote the system field while leaving the override
                  standing, so the control could not correct what it was
                  displaying. */}
              <div className="fld">
                <label htmlFor="fe-cable-sys">System calculated</label>
                <input id="fe-cable-sys" readOnly
                  value={cableLabel(f.Attributes.VD_Cable_Size_ID)} />
              </div>

              <div className="fld">
                <label htmlFor="fe-cable">Manually set</label>
                <select id="fe-cable"
                  value={f.Attributes.Manual_VD_Cable_Size_ID ?? ""}
                  onChange={(e) => setAttr("Manual_VD_Cable_Size_ID")(
                    e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Not overridden</option>
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
                {/* What the trace will actually read, spelled out. Two
                    fields with a precedence rule between them is exactly
                    the arrangement nobody should have to hold in their
                    head while checking a volt drop. */}
                <p className="hint">
                  {(f.Attributes.Manual_VD_Cable_Size_ID
                    ?? f.Attributes.VD_Cable_Size_ID) == null
                    ? "No cable set — everything beyond this point is unknowable rather than merely approximate."
                    : `The trace reads ${cableLabel(f.Attributes.Manual_VD_Cable_Size_ID
                      ?? f.Attributes.VD_Cable_Size_ID)}. Normally set by the run feeding this point; overriding it here parts the two.`}
                </p>
                {!(lookups?.cableSizes || []).length && (
                  <p className="hint">
                    No cable sizes yet &mdash; add them in Admin &rsaquo; Cable Sizes.
                  </p>
                )}
              </div>
            </>
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
            <div className="fe-row">
              <div className="fld">
                <label htmlFor="fe-poc">Agreed output ({pocUnit(f.Layer_Key)})</label>
                <input id="fe-poc" type="number" step="0.1"
                  value={f.Attributes.Output ?? ""}
                  onChange={(e) => setAttr("Output")(e.target.value)} />
                <p className="hint">
                  What the operator has agreed to supply here. Circuits are
                  checked against it.
                </p>
              </div>

              {/* Gas is agreed on two things, not one: how much, and at
                  what pressure. The output above is the capacity; this
                  is where the network starts from, and every span node
                  pressure is this less what the pipe to it costs.

                  Only on gas \u2014 electricity has no equivalent, and an
                  empty pressure box on an electric POC is a question
                  with no answer. */}
              {f.Layer_Key === "gas" && (
                <div className="fld">
                  <label htmlFor="fe-poc-p">Output pressure (mbar)</label>
                  <input id="fe-poc-p" type="number" step="0.1" min="0"
                    value={f.Attributes.Output_Pressure_mBar ?? ""}
                    onChange={(e) => setAttr("Output_Pressure_mBar")(e.target.value)} />
                  <p className="hint">
                    The pressure offered at the connection. The gas levels
                    check starts here.
                  </p>
                </div>
              )}
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
                  {/* Dug size, from the drawing rather than typed: the
                      length is measured off the line, and the width and
                      depth follow from what is routed in it. */}
                  <div className="fld">
                    <label htmlFor="fe-tl">Length (m)</label>
                    <input id="fe-tl" readOnly
                      value={length > 0 ? length.toFixed(1) : ""} />
                  </div>

                  <div className="fld">
                    <label htmlFor="fe-tw">Width (m)</label>
                    <input id="fe-tw" readOnly
                      value={trenchDims?.items ? trenchDims.widthM.toFixed(2) : ""}
                      title={trenchDims?.items
                        ? `${trenchDims.contentWidthM}m of pipe and cable`
                          + ` + ${trenchDims.separationWidthM}m between them`
                          + ` + ${trenchDims.marginWidthM}m working room`
                        : undefined} />
                  </div>

                  <div className="fld">
                    <label htmlFor="fe-td">Depth (m)</label>
                    <input id="fe-td" readOnly
                      value={trenchDims?.items ? trenchDims.depthM.toFixed(2) : ""} />
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
                  <>
                  {/* What Build LV Network worked out, read only. The
                      override sits beside it: a rebuild cannot wipe a
                      decision, and a decision cannot hide what the build
                      said. */}
                  <div className="fld">
                    <label htmlFor="fe-cable-sys">System calculated</label>
                    <input id="fe-cable-sys" readOnly
                      value={(() => {
                        const c = (lookups?.cableSizes || []).find((x) =>
                          Number(x.Cable_Size_ID)
                            === Number(f.Attributes.VD_Cable_Size_ID));
                        if (!c) return "";
                        const t = (lookups?.cableTypes || [])
                          .find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
                        return [t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ");
                      })()} />
                  </div>

                  <div className="fld">
                    <label htmlFor="fe-cablesize">Manually set</label>
                    <select id="fe-cablesize"
                      value={f.Attributes.Manual_VD_Cable_Size_ID ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        setAttr("Manual_VD_Cable_Size_ID")(id);
                        /* Marked, not pushed.

                           The span node fed by this run carries the
                           cable the trace reads, so the two have to move
                           together. But pushing here read the drawing as
                           it was before this edit was saved \u2014 the node
                           was given the old size, or nothing changed at
                           all. It goes out on save instead. */
                        setCableChanged(true);
                      }}>
                      <option value="">Not overridden</option>
                      {/* The cable and nothing else. The material and
                          the missing-figures warning were on every
                          option and turned a list of sizes into a list
                          of sentences \u2014 both are below, about the one
                          actually chosen. */}
                      {cableChoices.list.map((c) => {
                        const t = (lookups?.cableTypes || [])
                          .find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
                        return (
                          <option key={c.Cable_Size_ID} value={c.Cable_Size_ID}>
                            {[t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ")}
                          </option>
                        );
                      })}
                    </select>
                    {(() => {
                      /* What was lost from the options, said once about
                         the cable selected.

                         The warning matters and must not go: a cable
                         with no impedance or volt drop figure computes
                         nothing, so a levels check on it silently
                         reports no drop at all rather than a wrong one. */
                      const c = (lookups?.cableSizes || []).find((x) =>
                        Number(x.Cable_Size_ID) === Number(f.Attributes.VD_Cable_Size_ID));
                      if (!c) return null;
                      const usable = c.Loop_Impedance_Ohm != null || c.Volt_Drop_Base != null;
                      return (
                        <p className={usable ? "hint" : "fe-warn"}>
                          {c.Material ? `${c.Material}. ` : ""}
                          {usable ? "" : "No impedance or volt drop figures \u2014 "
                            + "a levels check cannot compute a drop for this cable."}
                        </p>
                      );
                    })()}
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
                  </>
                ) : isGas ? (
                  <>
                  {/* The build's answer, read only.

                      Kept beside the override rather than replaced by
                      it: with one field, rebuilding wiped every
                      override without saying so, and overriding made
                      the calculated size unrecoverable. Both are
                      recorded, and the Sizes toggle on the Gas menu
                      says which one the drawing and the levels check
                      read. */}
                  <div className="fld">
                    <label htmlFor="fe-gas-sys">System calculated</label>
                    <input id="fe-gas-sys" readOnly
                      value={(() => {
                        const v = gasOptionFor(f.Attributes?.Gas_Pipe_Size_ID);
                        const row = gasPipeChoices
                          .find((x) => String(x.Gas_Pipe_Size_ID) === v);
                        return row
                          ? (row.Size_Label || `${Number(row.Diameter_mm)}mm`)
                          : "";
                      })()} />
                  </div>

                  <div className="fld">
                    <label htmlFor="fe-gas-pipe">Manually set</label>
                    {/* A list, not a box to type in. The build writes a
                        Gas_Pipe_Size_ID and the levels check reads that
                        row's bore \u2014 a size typed as free text is a label
                        nothing can look up, so the pressure calculation
                        would be left guessing at the pipe. */}
                    {/* Writes the override, never the system size \u2014
                        that is the build's to set, and overwriting it
                        here is what lost it before. */}
                    <select id="fe-gas-pipe"
                      value={manualGasValue}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        const row = gasPipeChoices
                          .find((x) => Number(x.Gas_Pipe_Size_ID) === id);
                        setAttr("Manual_Gas_Pipe_Size_ID")(id);
                        /* Upstream cannot be narrower than what it
                           feeds. Offered rather than done silently: it
                           changes lengths of main nobody selected, and
                           a rule that rewrites the drawing without
                           saying so is one nobody trusts. */
                        if (id != null && row) onUpstreamSize?.(feature, row);
                        /* The label travels with the id so the drawing
                           reads without a lookup, the same as water. */
                        setAttr("Size")(row
                          ? (row.Size_Label || `${Number(row.Diameter_mm)}mm`)
                          : "");
                      }}>
                      <option value="">Not overridden</option>
                      {gasPipeChoices.map((x) => (
                        <option key={x.Gas_Pipe_Size_ID} value={x.Gas_Pipe_Size_ID}>
                          {x.Size_Label || `${Number(x.Diameter_mm)}mm`}
                        </option>
                      ))}
                    </select>
                    {!gasPipeChoices.length ? (
                      <p className="hint">
                        No low pressure gas pipe sizes yet &mdash; add them in
                        Admin &rsaquo; Gas Pipe Sizes.
                      </p>
                    ) : (() => {
                      /* What this length carries, so a size changed by
                         hand is changed against a figure rather than a
                         hunch. */
                      const row = gasPipeChoices.find((x) =>
                        String(x.Gas_Pipe_Size_ID) === gasPipeValue);
                      const bits = [];
                      if (row?.Max_kW) bits.push(`Rated to ${Number(row.Max_kW)} kW`);
                      if (f.Attributes.Load_kW != null) {
                        bits.push(`carrying ${Number(f.Attributes.Load_kW)} kW`);
                      }
                      if (f.Attributes.Supplies != null) {
                        bits.push(`${f.Attributes.Supplies} supplies beyond`);
                      }
                      return bits.length
                        ? <p className="hint">{bits.join(" \u00b7 ")}</p>
                        : null;
                    })()}
                  </div>
                  </>
                ) : isWater ? (
                  <>
                  {/* Water sizes from the table, not from typing.

                      Build Water Network sets this on every run it draws
                      — the smallest pipe that carries the plots beyond
                      that length — and this is where it is seen and
                      overridden. A length somebody sizes up by hand
                      because of a future phase is a real decision, and
                      the drawing should be able to hold it.

                      In braces. It was a plain block comment, which was
                      correct while it sat in the parentheses of a
                      conditional — a JavaScript position. Wrapping this
                      branch in a fragment to fit the label control in
                      made it a child of that fragment, so JSX read it
                      as text and printed it in the modal. */}
                  {/* What the build worked out, read only. The override
                      sits beside it rather than replacing it, so a
                      rebuild cannot wipe a decision and a decision
                      cannot hide what the build said. */}
                  <div className="fld">
                    <label htmlFor="fe-water-sys">System calculated</label>
                    <input id="fe-water-sys" readOnly
                      value={(() => {
                        const row = (lookups?.waterPipeSizes || []).find((x) =>
                          Number(x.Water_Pipe_Size_ID)
                            === Number(f.Attributes.Water_Pipe_Size_ID));
                        return row
                          ? (row.Size_Label || `${Number(row.Diameter_mm)}mm`)
                          : "";
                      })()} />
                  </div>

                  <div className="fld">
                    <label htmlFor="fe-pipe">Manually set</label>
                    <select id="fe-pipe"
                      value={f.Attributes.Manual_Water_Pipe_Size_ID ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        const row = (lookups?.waterPipeSizes || [])
                          .find((x) => Number(x.Water_Pipe_Size_ID) === id);
                        /* The override, never the build's own answer. */
                        setAttr("Manual_Water_Pipe_Size_ID")(id);
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
                      <option value="">Not overridden</option>
                      {/* The size and nothing else.

                          The capacity and the operators were on each
                          option and made a dropdown of six read like a
                          paragraph. What is being chosen is a size, so
                          that is what the options say; the rule behind
                          the one selected is spelled out below, where
                          it can be read once rather than seven times. */}
                      {/* Only the rules for this kind of pipe.

                          A service spur was offered the mains diameters
                          and a main the service ones — and picking from
                          the wrong set writes a size the build would
                          never have chosen, which then reads on the
                          drawing as though it had. Judged by the line
                          type, which is what says main or service. */}
                      {pipeChoices.map((x) => (
                        <option key={x.Water_Pipe_Size_ID} value={x.Water_Pipe_Size_ID}>
                          {x.Size_Label || `${Number(x.Diameter_mm)}mm`}
                        </option>
                      ))}
                    </select>
                    {!pipeChoices.length ? (
                      <p className="hint">
                        No {isServiceLine ? "service" : "mains"} pipe sizes yet &mdash;
                        add them in Admin &rsaquo; Water Pipe Sizes.
                      </p>
                    ) : (() => {
                      /* The rule behind the chosen size, and what the
                         build counted here. Said once, under the field,
                         rather than repeated on every option: a size
                         overridden by hand should be overridden against
                         a number rather than a hunch, but the number
                         belongs to the one chosen. */
                      const row = (lookups?.waterPipeSizes || []).find((x) =>
                        Number(x.Water_Pipe_Size_ID) === Number(f.Attributes.Water_Pipe_Size_ID));
                      const named = row
                        ? (lookups?.waterPipeSizeOperators || [])
                          .filter((o) =>
                            Number(o.Water_Pipe_Size_ID) === Number(row.Water_Pipe_Size_ID))
                          .map((o) => (lookups?.operators || []).find((p) =>
                            Number(p.Organisation_ID) === Number(o.Organisation_ID))?.Name)
                          .filter(Boolean)
                        : [];
                      const bits = [];
                      if (row) {
                        bits.push(`Carries up to ${row.Max_Meters} plots`);
                        bits.push(named.length
                          ? (named.length <= 2 ? `for ${named.join(" and ")}`
                            : `for ${named.length} operators`)
                          : "for any operator");
                      }
                      if (f.Attributes.Meters != null) {
                        bits.push(`\u2014 feeds ${f.Attributes.Meters} plot(s) beyond this length`);
                      }
                      return bits.length ? <p className="hint">{bits.join(" ")}</p> : null;
                    })()}
                  </div>
                  {/* ── The label on the pipe ──

                      It runs along the pipe by default and sits just
                      off it. Dragging it on the canvas moves it; this
                      turns it.

                      Blank means follow the pipe, which is not the same
                      as zero: zero is a decision to keep it horizontal
                      and have it stay horizontal when the run is
                      redrawn at a different angle. */}
                  <div className="fld">
                    <label htmlFor="fe-langle">Label angle</label>
                    <div className="fe-angle">
                      <input id="fe-langle" type="number" step="5"
                        value={f.Attributes.Label_Angle ?? ""}
                        placeholder="follows the pipe"
                        onChange={(e) => setAttr("Label_Angle")(
                          e.target.value === "" ? null : Number(e.target.value))} />
                      <button className="btn ghost sm"
                        onClick={() => setAttr("Label_Angle")(
                          ((((Number(f.Attributes.Label_Angle) || 0) + 90) % 360) + 360) % 360)}>
                        Rotate 90&deg;
                      </button>
                      {f.Attributes.Label_Angle != null && (
                        <button className="btn ghost sm"
                          onClick={() => setAttr("Label_Angle")(null)}>
                          Follow the pipe
                        </button>
                      )}
                    </div>
                    <p className="hint">
                      Drag the label on the drawing to move it.
                    </p>
                  </div>
                  </>
                ) : (
                  <div className="fld">
                    <label htmlFor="fe-size">Size</label>
                    <input id="fe-size" value={f.Attributes.Size ?? ""}
                      placeholder="e.g. 185mm² WF"
                      onChange={(e) => setAttr("Size")(e.target.value)} />
                  </div>
                )}
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

          {/* What is laid in it.

              Shown, not offered behind a button: it is what the width
              and depth are worked out from, so a reader looking at
              1.26m wants to see the three things that made it 1.26m.
              Sizes only \u2014 lengths, shares and what runs past belong to
              the inspect panel, and repeating them here would be a
              second version of that panel in a smaller box. */}
          {isTrench && !!trenchContents.length && (
            <>
              <div className="fe-inside-head">In this trench</div>
              <div className="fe-row">
                {/* A field per utility, in the order they are read on a
                    drawing. Named rather than listed, so the row lines
                    up with the dimensions above it and an empty one
                    says "no gas in this length" — which the old list
                    could only say by leaving a gap nobody could see.

                    Read-only: the sizes are what is drawn in the
                    trench, and a field that let you type a different
                    one would only be a way to disagree with the
                    drawing. */}
                {[
                  ["electric", "Electric Cable Size"],
                  ["gas", "Gas Pipe Size"],
                  ["water", "Water Pipe Size"],
                ].map(([key, label]) => {
                  const c = trenchContents.find((x) => x.layerKey === key);
                  return (
                    <div className="fld" key={key}>
                      <label htmlFor={`fe-in-${key}`}>{label}</label>
                      <input id={`fe-in-${key}`} readOnly
                        value={c
                          ? (c.count > 1 ? `${c.count} \u00d7 ${c.label}` : c.label)
                          : ""}
                        title={c?.alsoSizes?.length
                          ? `Also drawn as ${c.alsoSizes.join(", ")} along part of it`
                          : undefined} />
                    </div>
                  );
                })}
              </div>

              {/* Anything else laid in it.

                  Three named fields cover what a joint trench normally
                  carries, but not street lighting or telecoms — and a
                  utility with no field of its own would vanish from the
                  panel while still widening the trench. Shown only when
                  there is something to show. */}
              {!!trenchContents.filter((c) =>
                !["electric", "gas", "water"].includes(c.layerKey)).length && (
                <div className="fe-row">
                  {trenchContents
                    .filter((c) => !["electric", "gas", "water"].includes(c.layerKey))
                    .map((c) => (
                      <div className="fld" key={c.key}>
                        <label htmlFor={`fe-in-${c.layerKey}`}>{`${c.utility} Size`}</label>
                        <input id={`fe-in-${c.layerKey}`} readOnly
                          value={c.count > 1 ? `${c.count} \u00d7 ${c.label}` : c.label} />
                      </div>
                    ))}
                </div>
              )}

              {/* Surface, stage and duration.

                  Below the contents rather than beside the dimensions,
                  because two of the three follow from what is in the
                  trench: the surface multiplies the dig and the
                  duration is worked out from the size above it. The
                  order reads the way the work happens — what it is dug
                  through, where it has got to, how long it takes. */}
              <div className="fe-row">
                <div className="fld">
                  <label htmlFor="fe-surface">Surface</label>
                  <select id="fe-surface" value={f.Attributes.Surface_Type ?? ""}
                    onChange={(e) => setAttr("Surface_Type")(e.target.value)}>
                    <option value="">&mdash; None &mdash;</option>
                    {surfaceTypes.map((x) => (
                      <option key={x.Surface_Key} value={x.Surface_Key}>{x.Label}</option>
                    ))}
                  </select>
                </div>

                {/* What stage this length is at. The same list the
                    canvas marks with, so the two cannot drift. */}
                <div className="fld">
                  <label htmlFor="fe-build">Build status</label>
                  {/* Planned where nothing is set, matching what a
                      trench is created as. A blank here read as a
                      question nobody had answered, when the answer for
                      a trench on a drawing is nearly always the same
                      one. */}
                  <select id="fe-build" value={f.Attributes.Build_Status ?? "planned"}
                    /* Null rather than undefined for "not set".
                       undefined survives in state and then vanishes
                       when the row is serialised, so what is stored
                       depends on a JSON quirk rather than on what was
                       chosen. */
                    onChange={(e) => setAttr("Build_Status")(e.target.value || null)}>
                    {BUILD_STATUSES.map((bs) => (
                      <option key={bs.key} value={bs.key}>{bs.label}</option>
                    ))}
                  </select>
                </div>

                {/* Read-only like the dimensions, and for the same
                    reason: it follows the drawing, and a duration
                    somebody typed once would go stale the moment a
                    cable was added. */}
                <div className="fld">
                  <label htmlFor="fe-tt">Dig &amp; lay</label>
                  <input id="fe-tt" readOnly
                    value={trenchEstimate?.ok ? hoursText(trenchEstimate.totalHours) : ""}
                    title={trenchEstimate?.ok
                      ? `${trenchEstimate.volumeM3}m\u00b3`
                        + ` at ${trenchEstimate.baseRateM3Hr}m\u00b3/hr`
                        + ` (${trenchEstimate.machine})`
                      : undefined} />
                </div>
              </div>
            </>
          )}

          {/* What made the duration, and what kind of number it is.

              The width and depth above are NJUG and the same on every
              job. This is a rate, and it says so: the last line reports
              whether it came from recorded work or from a planning
              estimate. Shown rather than hidden behind the field's
              tooltip, because a duration on a programme gets questioned
              and a tooltip is not an answer somebody can check.

              Reinstatement is not in it. The surface multiplier prices
              breaking out, not making good, and a trench under a
              carriageway costs far more to close than to open. */}
          {isTrench && trenchEstimate?.ok && (
            <div className="fld">
              <label>How that was worked out</label>
              <p className="fe-derived fe-dig">
                {`${trenchEstimate.volumeM3}m\u00b3 dug`}
                {` \u00b7 ${hoursText(trenchEstimate.digHours)} digging`}
                {trenchEstimate.setupHours
                  ? ` + ${hoursText(trenchEstimate.setupHours)} setting up` : ""}
                {trenchEstimate.layHours
                  ? ` + ${hoursText(trenchEstimate.layHours)} laying`
                    + (trenchEstimate.jointFactor !== 1
                      ? ` (\u00d7${trenchEstimate.jointFactor}, joint trench)` : "")
                  : ""}
                {`. ${trenchEstimate.machine} at ${trenchEstimate.baseRateM3Hr}m\u00b3/hr`}
                {trenchEstimate.depthFactor !== 1
                  ? `, \u00d7${trenchEstimate.depthFactor} for depth`
                    + (trenchEstimate.depthBandNote
                      ? ` (${trenchEstimate.depthBandNote.toLowerCase()})` : "")
                  : ""}
                {trenchEstimate.surfaceFactor !== 1
                  ? `, \u00d7${trenchEstimate.surfaceFactor} for ${trenchEstimate.surfaceLabel}`
                  : ""}
                {"."}
                {/* The surface is a multiplier of better than two to one
                    across the six, so a trench with it unanswered is the
                    one worth saying something about. Said here rather
                    than as a warning: it is a missing answer, not a
                    fault. */}
                {trenchEstimate.surfaceAssumed
                  ? " No surface set \u2014 estimated as unmade ground." : ""}
                <em className="fe-dig-basis">{trenchEstimate.basis}</em>
              </p>
            </div>
          )}

          {/* Its own row, under the fields rather than wedged between
              two of them: four tickboxes in one column's width made the
              row four lines deep and left everything beside it floating
              against a tall empty box. */}
          {/* A length of trench, not anything on the trench layer.

              A span node carries Layer_Key "trench" \u2014 it belongs to the
              dig \u2014 so isTrenchFeature says yes to it, and the tickboxes
              appeared on a node where they mean nothing. What a trench
              carries is a fact about a length, so the question is asked
              only of a line. */}
          {isTrench && feature.Feature_Type === "line" && (
            <div className="fe-row fe-carry-block">
              {/* What this length will take.

                  A dig is not always for everything: water may run
                  as a closed loop where electric never would, and
                  the length closing that loop carries water alone.
                  Ticked here so a build knows not to walk it.

                  Nothing ticked means everything, which is what a
                  trench drawn before this existed says \u2014 and what
                  somebody means by not answering. */}
              <div className="fld fe-carries">
                <label>Carries</label>
                <div className="fe-carry-row">
                  {TRENCH_CARRIES.map(({ key, label }) => (
                    <label key={key} className="fe-check">
                      <input type="checkbox"
                        checked={f.Attributes?.[key] ?? true}
                        onChange={(e) => {
                          /* The first tick writes all four, so the
                             trench states its whole answer rather
                             than one flag against three silences \u2014
                             which would read as "carries only this"
                             the moment anything was unticked. */
                          const now = TRENCH_CARRIES.reduce((o, x) => ({
                            ...o, [x.key]: f.Attributes?.[x.key] ?? true,
                          }), {});
                          now[key] = e.target.checked;
                          setF((prev) => ({
                            ...prev,
                            Attributes: { ...prev.Attributes, ...now },
                          }));
                        }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── What stage a main is at ──

              Its own, not the trench's. On a lay-only project the
              developer digs and we lay, so a trench is As-Built or
              Existing before anything is in it — and reading the pipe's
              stage from the hole around it would call every one of
              those mains laid on the day the trench was finished.

              Live is the one that matters most and belongs to nothing
              else: a trench is dug or it is not, while a main is
              charged or energised separately, often weeks later. A gang
              sent to connect a plot off a main nobody has made live has
              been sent to do something that cannot be done. */}
          {isMain && (
            <div className="fld">
              <label htmlFor="fe-main-status">Status</label>
              <select id="fe-main-status"
                value={f.Attributes.Build_Status ?? "planned"}
                onChange={(e) => setAttr("Build_Status")(e.target.value || null)}>
                {MAIN_STATUSES.map((ms) => (
                  <option key={ms.key} value={ms.key}>{ms.label}</option>
                ))}
              </select>
              {/* fe-sub, which already exists for exactly this — a line
                  of explanation under a field. A new class would have
                  been a second name for one thing. */}
              <p className="fe-sub">
                {f.Attributes.Build_Status === "live"
                  ? "Plots can be connected off this main."
                  : "Until this is Live, plots fed from it cannot be "
                    + "called off for connection."}
              </p>
            </div>
          )}

          <div className="fld">
            <label htmlFor="fe-notes">Notes</label>
            <textarea id="fe-notes" rows={2} value={f.Attributes.Notes ?? ""}
              onChange={(e) => setAttr("Notes")(e.target.value)} />
          </div>

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
/* .fe-backdrop lives in src/styles.css. RaiseInvoiceModal uses it
   too, and a class defined here only exists while the canvas is
   mounted — which on the invoices tab it never is. */
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
/* The feature's id, for naming one in a query. Selectable and quiet. */
.fe-id { margin: 2px 0 0; font-size: 10.5px; color: var(--muted);
  user-select: all; cursor: text; }
.fe-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
/* .fe-x lives in src/styles.css. */
.fe-body { padding: 14px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 11px; }
/* The one tick box in this editor, so it gets a rule of its own rather
   than borrowing a field's. */
/* Carries takes a row of its own, under the fields rather than wedged
   between two of them.

   It was a field in the same row as Surface and Length, so four
   tickboxes had to stack vertically inside one column's width \u2014 which
   pushed the row to four lines tall and left the controls beside it
   floating against a tall empty box.

   Full width and ordered last, so it sits under everything on the row
   whatever order the fields appear in. The tickboxes then have the
   whole width and sit on one line. */
/* Carries is a row of its own now, not a field in the row above.

   CSS alone could not do it: full width and an order put the box on the
   same line whenever the row had space, and four tickboxes stacked in
   one column's width is what made the row four lines deep. Moving the
   markup is what actually says "this belongs under the others". */
.fe-carry-block { margin-top: -2px; }
.fe-carries { flex: 1 1 100%; }
.fe-carry-row {
  display: flex; flex-wrap: wrap; gap: 6px 18px; padding-top: 3px;
  align-items: center;
}
/* Level with each other rather than each box sitting on its own
   baseline, which is what made the column look ragged. */
.fe-carry-row .fe-check { margin: 0; white-space: nowrap; }

/* The heading over the three size fields. Styled as a field label
   rather than as a section header: it names the row under it, which is
   what a label does. */
.fe-inside-head { font: 600 10.5px inherit; letter-spacing: .04em;
  text-transform: uppercase; color: var(--muted); margin: 2px 0 5px; }

.fe-check { display: flex; align-items: center; gap: 7px; font-size: 12.5px;
  font-weight: 600; color: var(--text); cursor: pointer; margin: 2px 0 10px; }
.fe-check input { width: 15px; height: 15px; accent-color: var(--accent);
  cursor: pointer; }

.fe-row { display: flex; gap: 11px; }
.fe-row .fld { flex: 1; min-width: 0; }
.fe-derived { margin: 0; font-size: 11.5px; color: var(--muted); background: var(--bg);
  border-radius: var(--radius); padding: 8px 10px; line-height: 1.5; }
.fe-derived strong { color: var(--text); }
/* The working behind the duration. Same box as any other derived
   figure, because that is what it is — worked out from the fields
   above rather than entered. */
.fe-dig { line-height: 1.6; }
/* Where the rate came from, on its own line and never hidden. The one
   screen where an estimate gets believed is the one where nobody can
   see it was an estimate. */
.fe-dig-basis { display: block; margin-top: 5px; font-size: 10.5px;
  font-style: italic; opacity: .85; }
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
.fe-angle { display: flex; gap: 8px; align-items: center; }
.fe-angle input { flex: 1; min-width: 0; }
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
/* .fe-foot and .fe-spacer live in src/styles.css, with .fe-x and
   .fe-backdrop, for the reason given there. */
.btn.ghost.danger { color: #b91c1c; }
.mono { font-family: ui-monospace, Menlo, monospace; }
`;
