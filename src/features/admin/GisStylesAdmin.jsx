import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  buildSubjects, sectionsOf, inheritedStyle, overriddenFields, subjectKeyOf,
  isVariation,
} from "./styleSubjects.js";
import {
  toCriteria, fromCriteria, fieldOptions, valuesFor, isColumnField, changeField,
  preservedScope, labelFor, PRESERVED, OTHER,
} from "./styleCriteria.js";
import { statusFieldFor, statusFieldForTypes } from "../gis/buildStatus.js";
import Banner from "../../components/Banner.jsx";
import { listGisStyles, saveGisStyle, deleteGisStyle } from "../../api/gis.js";
import { getLookups } from "../../api/lookups.js";
import { appearance, symbolPath, STROKE_ONLY, SYMBOLS, explainStyle } from "../../lib/gisStyle.js";
import { GROUP_FIELD } from "../../lib/styleGroups.js";

/* Styling rules for the GIS canvas.

   A rule says what something looks like and when. Its scope is whatever
   you fill in — leave a field on "Any" and it stops narrowing. Rules
   cascade rather than replace, so an operator's rule can set a colour
   and inherit everything else from the rule beneath it.

   The preview is drawn by the same functions the canvas uses, at the
   zoom you pick. A swatch that lies about what you'll get on the plan
   would be worse than no swatch. */

/* The canvas zoom readout, from a pixels-per-metre figure.

   The canvas prints Math.round(scale * 25) + "%", so this has to use the
   same 25 — and if that ever changes, both have to change together or
   the admin quietly starts lying. One number, one expression, for that
   reason. */
const PCT_PER_PX_PER_M = 25;
const asPct = (v) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) || n <= 0
    ? ""
    : `\u2248 ${Math.round(n * PCT_PER_PX_PER_M)}% zoom`;
};

/* ── A switch that can also say "not set" ──

   Dashed, the two draw-to-scale switches and the marker's rotation were
   checkboxes, and a checkbox has two states where the cascade has
   three: on, off, and nothing — where nothing means "whatever the style
   beneath me says".

   That is not a nicety. `BLANK` started them at false and `resolveStyle`
   overrides on anything that is not null, so every rule written on this
   screen was setting Dashed = false explicitly. A dashed default with a
   variation over it could never stay dashed: the variation said solid
   without anybody choosing solid. Exactly the case that was asked
   about — "if the build status changes from Planned to Live then the
   line type may change to Continuous" — with the change happening
   whether or not it was wanted. */
function TriState({ id, label, value, onChange, inherited, yes, no }) {
  const unset = value === "" || value == null;
  const inheritedAs = inherited == null ? null : (inherited ? yes : no);
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={unset ? "" : (value ? "y" : "n")}
        onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value === "y")}>
        <option value="">
          {inheritedAs ? `Inherits \u2014 ${inheritedAs}` : "Inherits"}
        </option>
        <option value="y">{yes}</option>
        <option value="n">{no}</option>
      </select>
    </div>
  );
}

const BLANK = {
  Style_Name: "", Layer_Key: "", Line_Type: "", Feature_Role: "",
  Supply_Type: "", Utility_ID: "", Organisation_ID: "", Site: "",
  /* "" and not false: see TriState. false is a decision and overrides
     the style beneath; "" is the absence of one. */
  /* Colour starts blank for the same reason the switches do. It was
     "#64748b", so every style written here set slate grey explicitly —
     and a variation that changed only the dash repainted the cable with
     it. The picker shows what would be inherited instead, and Clear is
     the way back. */
  Colour: "", Label_Colour: "", Dashed: "", Dash_Pattern: "", Symbol: "",
  Width_Px: "", Width_M: "", Scale_Width: "",
  Min_Width_Px: "", Max_Width_Px: "", Symbol_Size_Px: "",
  Symbol_Size_M: "", Scale_Symbol: "", Min_Symbol_Px: "", Max_Symbol_Px: "",
  Min_Scale: "", Max_Scale: "", Label_Min_Scale: "",
  Marker_Text: "", Marker_Symbol: "", Marker_Interval_M: "", Marker_Size_Px: "",
  Marker_Colour: "", Marker_Rotate: "", Marker_Offset_Px: "", Marker_Min_Gap_Px: "",
  Sort_Order: 0, Is_Active: true, Notes: "",
  /* Not null: the builder edits a list, and a rule that starts as null
     would need every caller to remember that. Empty and null are the
     same thing to the cascade.

     While a rule is open this holds the whole criteria list, Operator
     and Site included — see styleCriteria.js. `fromCriteria` puts those
     back in their columns on save, and it is the only thing that writes
     a rule back. */
  Conditions: [],
};

/* Every role a feature can hold, with the name it goes by.

   It was five of them — plot, meter, joint, source — and the register
   has grown to twelve since. Anything missing here cannot be styled at
   all: there was no way to scope a row to a service valve, a POC or a
   span node, so those drew in their layer's colour and nothing could
   say otherwise.

   The list matches the CHECK constraint on GIS_Feature."Feature_Role",
   last set by migration 0165. A role added there wants adding here too,
   or it arrives on the drawing with no way to style it — which is
   exactly what happened to the service valve and the pumping station,
   both added to the drawing and left unstylable until somebody
   noticed.

   ── One entry that is not a role ──

   The property boundary point. It is not a feature at all: it is
   Boundary_At on the plot seed, painted in a pass of its own, and it
   presents this scope to the style cascade so it can be sized, coloured
   and switched off like everything else (0166).

   It is here because this is where somebody looks for it. A screen that
   styles every symbol except one, for a reason about how that symbol
   happens to be stored, is a screen that is wrong about its own job. */
/* The kinds of supply a point can be, where the role does not say it.

   Written out rather than derived: it is matched against
   GIS_Feature.Attributes.Supply_Type, which is written by the canvas
   when a non-residential supply is placed, and the only value the
   application writes is 'nrs' (0194). A second one wants adding here
   and to whatever writes it, in the same change.

   "Any" is null, which matches everything and narrows nothing — so the
   plain Meter rule goes on covering house meters and non-residential
   supplies alike, and this one beats it only where it applies. */
const SUPPLY_TYPES = [
  ["", "Any"],
  ["nrs", "Non-residential supply"],
];

const ROLES = [
  ["", "Any"],
  ["plot", "Plot seed"],
  ["nrs", "Non-residential supply"],
  ["boundary", "Property boundary point"],
  ["meter", "Meter"],
  ["joint", "Joint"],
  ["source", "Source"],
  ["poc", "POC"],
  ["substation", "Substation"],
  ["governor", "Gas governor"],
  ["servicevalve", "Service valve"],
  ["washout", "Wash out"],
  ["hvtt", "Gas top tee"],
  ["reducer", "Gas reducer"],
  ["pumping", "Pumping station"],
  ["spannode", "Span node"],
  ["feederpoint", "Feeder end point"],
  ["linkbox", "Link box"],
  /* A board carries its own symbol \u2014 a square with DB in it, drawn by
     the canvas \u2014 but its size and its fallback colour are set here like
     everything else. A role the canvas draws and this list omits is a
     thing nobody can restyle, which is what checkboundarystyle catches. */
  ["msdb", "MSDB"],
  ["hdcutout", "Heavy duty cut-out"],
  ["column", "Lighting column"],
  ["shape", "Shape"],
];

export default function GisStylesAdmin() {
  const [rows, setRows] = useState([]);
  const [layers, setLayers] = useState([]);
  const [lineTypes, setLineTypes] = useState([]);
  const [utilities, setUtilities] = useState([]);
  const [operators, setOperators] = useState([]);
  const [voltageRatings, setVoltageRatings] = useState([]);
  const [selected, setSelected] = useState(null);
  /* `selected` is a FEATURE, because that is what the left-hand list
     holds now. `editId` says which of its styles is in the form — the
     default, one of its variations, or a new one not yet saved. Two
     pieces of state rather than one, because "which feature" outlives
     "which of its rules": moving between a default and its variations
     must not lose the feature. */
  const [editId, setEditId] = useState(null);
  const [editKind, setEditKind] = useState("default");
  const [draft, setDraft] = useState(BLANK);
  const [previewScale, setPreviewScale] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const canvasRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await listGisStyles();
      setRows(r.rows || []);
      /* The catalogue, so the left-hand list can name things nobody has
         styled yet. An older deployment returns neither, and the effect
         below falls back to naming what the rules themselves mention —
         which is all this screen could ever do before. */
      setLayers(r.layers || []);
      setLineTypes(r.lineTypes || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    getLookups()
      .then((lk) => {
        setUtilities(lk.utilities || []);
        setOperators([...new Map((lk.orgOperators || [])
          .map((o) => [o.Organisation_ID, o])).values()]);
        /* LV, HV, HV+, EHV, from the table that owns them. Typed by
           hand until now, which meant a rule could say "hv" or "11kV"
           or anything else and match nothing — the catalogue is the
           only thing that knows the spelling. */
        setVoltageRatings(lk.voltageRatings || []);
      })
      .catch((e) => setError(e.message));
  }, [load]);

  /* Where the catalogue could not be read, the rules are the only
     evidence of what exists. Keys rather than rows, which is what the
     datalists want and what this held before the endpoint served the
     real thing. */
  useEffect(() => {
    if (!lineTypes.length && rows.length) {
      setLineTypes([...new Set(rows.map((r) => r.Line_Type).filter(Boolean))]
        .map((k) => ({ Type_Key: k })));
    }
  }, [rows, lineTypes.length]);

  const layerKeys = useMemo(
    () => (layers.length
      ? layers.map((l) => l.Layer_Key ?? l).filter(Boolean)
      : [...new Set(rows.map((r) => r.Layer_Key).filter(Boolean))]),
    [layers, rows],
  );
  const typeKeys = useMemo(
    () => lineTypes.map((t) => t.Type_Key ?? t).filter(Boolean),
    [lineTypes],
  );

  const isNew = editId === "new";
  const editing = editId != null;

  /* ── The inspector: the question people actually bring here ──

     The preview below draws ONE rule in isolation, which answers "what
     would this rule look like" and cannot answer "why does the drawing
     look like THAT" — a question about the whole cascade. A rule can
     preview perfectly and match nothing (a mistyped line-type key), or
     match and lose every field to a more specific row (an operator's
     rule under a chosen standard, at weight 32). Both read as "the
     canvas ignores my style", and both cost a support round trip that
     this panel answers in one look.

     Describes a subject the way the canvas would (subjectOf builds the
     same shape from a feature) and asks explainStyle — which narrates
     the very cascadeOf that resolveStyle folds, so this cannot
     disagree with what the canvas draws. */
  const [inspOpen, setInspOpen] = useState(false);
  const [insp, setInsp] = useState({
    Layer_Key: "", Line_Type: "", Feature_Role: "",
    Utility_ID: "", Organisation_ID: "", Site: "", Supply_Type: "",
  });
  const setInspField = (col) => (e) =>
    setInsp((d) => ({ ...d, [col]: e.target.value }));

  const inspected = useMemo(() => {
    if (!inspOpen) return null;
    const v = (x) => (x === "" ? null : x);
    const subject = {
      Layer_Key: v(insp.Layer_Key),
      Line_Type: v(insp.Line_Type),
      Feature_Role: v(insp.Feature_Role),
      Site: v(insp.Site),
      Supply_Type: v(insp.Supply_Type),
      Utility_ID: v(insp.Utility_ID),
    };
    return explainStyle(subject, rows,
      { organisationId: v(insp.Organisation_ID) });
  }, [inspOpen, insp, rows]);


  /* What the preview draws: the row being edited on its own, since the
     cascade it sits in depends on which feature it lands on. */
  /* ── The left-hand list is FEATURES ──

     "The Add Rule button should not be in the left hand pane as these
     are the Features that I want to apply the styles to. The left hand
     pane should not contain rules."

     So it is built from the CATALOGUE — every line type and every role
     the drawing can hold — and the rules are hung off them. A feature
     nobody has styled is listed, with no default style yet, which is
     the point: it was previously unreachable on the one screen that
     exists to style it.

     Layers and the drawing itself are not features, and appear only
     where a rule already names one: they are real and in use, and this
     keeps them editable without inviting more of them. */
  const subjects = useMemo(
    () => buildSubjects({
      rows,
      lineTypes,
      layers,
      roles: ROLES.filter(([k]) => k).map(([key, label]) => ({ key, label })),
    }),
    [rows, lineTypes, layers],
  );
  const tree = useMemo(
    () => sectionsOf(subjects, {
      layerLabels: Object.fromEntries(
        layers.map((l) => [l.Layer_Key, l.Label]).filter(([, v]) => v)),
    }),
    [subjects, layers],
  );
  const subjectOfKey = useCallback(
    (key) => subjects.find((x) => x.key === key) ?? null, [subjects]);

  const subject = subjectOfKey(selected);

  /* ── The feature, as the drawing would hold one ──

     Enough of a feature for the editor's own rules to answer questions
     about it: which stages it can be at, and what its status field is
     called. Reported from the criteria builder, which offered "Build
     status" and the general stage list for an electric main — whose
     editor says "Status" and offers Planned, As-Laid and Live.

     Not cosmetic. A main stores `aslaid` and the general list writes
     `asbuilt`, so a criterion built the old way matched nothing at all
     and nothing said so. */
  const asFeature = useMemo(() => (subject && {
    Feature_Type: subject.Feature_Role ? "point" : "line",
    Feature_Role: subject.Feature_Role ?? null,
    Layer_Key: subject.Layer_Key ?? null,
    Attributes: subject.Line_Type ? { Line_Type: subject.Line_Type } : {},
  }) || null, [subject]);

  /* The group this feature is, or null. One value, read by the criteria
     list, the status list and the save path, so the three cannot
     disagree about whether a group is open. */
  const groupKey = subject?.kind === "group" ? subject.detail : null;

  const statusField = useMemo(() => {
    /* ── A group's stages are every stage any member can be at ──

       Asked of the member TYPES rather than of one made-up feature. A
       group spans our cables and the incumbent's, whose lists do not
       overlap — planned / aslaid / live against existing / remove — so
       describing the group as a single feature would offer whichever
       list that one feature happened to land on and silently drop the
       other two stages. "A mains cable can be Planned, Existing
       (incumbent), To be Removed or Live" is all of them. */
    if (groupKey) return statusFieldForTypes(subject?.members ?? [], lineTypes);
    return asFeature ? statusFieldFor(asFeature, lineTypes) : null;
  }, [groupKey, subject, asFeature, lineTypes]);
  /* One object through all three: the field list, a field's name and the
     values it takes are the same question asked of the same feature. */
  const fieldCtx = useMemo(
    () => ({ operators, statusField, group: groupKey, voltageRatings }),
    [operators, statusField, groupKey, voltageRatings]);

  /* ── What this style is derived from ──

     Not "the default rule", which would be a guess: a variation on an
     electric main also sits under whatever the electric layer says and
     under anything site-wide. `inheritedStyle` asks what the canvas
     would draw for this feature if this rule did not exist, over every
     other rule — so the answer on screen is the answer on the drawing.

     Computed for the default too. It usually inherits nothing, and
     where it does — a layer rule beneath it — saying so is the point. */
  const inherits = useMemo(
    () => (subject
      ? inheritedStyle(subject, {
        rows,
        excludeId: isNew ? null : editId,
        criteria: Array.isArray(draft.Conditions) ? draft.Conditions : [],
      })
      : {}),
    [subject, rows, isNew, editId, draft.Conditions],
  );
  /* The inherited value, or null where nothing beneath sets one. */
  const inh = (f) => (inherits[f] == null || inherits[f] === "" ? null : inherits[f]);
  const inhText = (f, fallback) => {
    const v = inh(f);
    return v == null ? fallback : `inherits ${v}`;
  };

  const preview = useMemo(() => {
    const num = (v) => (v === "" || v == null ? null : Number(v));
    /* ── The preview draws what the canvas would ──

       "A swatch that lies about what you'll get on the plan would be
       worse than no swatch", says the top of this file, and a variation
       that sets only a colour would otherwise preview as a thin solid
       line — because everything it inherits reads as blank here.

       So the inherited style goes underneath the draft, field by field,
       exactly as the cascade folds it. What is drawn below is what the
       drawing will show. */
    const d = { ...inherits };
    for (const [k, v] of Object.entries(draft)) {
      if (v !== "" && v != null) d[k] = v;
    }
    return appearance({
      Colour: d.Colour || null,
      /* Blank means inherit, so it is stored as null rather than as an
         empty string — the cascade tests for null and "" is a value. */
      Label_Colour: d.Label_Colour || null,
      Dashed: !!d.Dashed,
      Dash_Pattern: d.Dash_Pattern || null,
      Symbol: d.Symbol || null,
      Width_Px: num(d.Width_Px),
      Width_M: num(d.Width_M),
      Scale_Width: !!d.Scale_Width,
      Min_Width_Px: num(d.Min_Width_Px),
      Max_Width_Px: num(d.Max_Width_Px),
      Symbol_Size_Px: num(d.Symbol_Size_Px),
      Symbol_Size_M: num(d.Symbol_Size_M),
      Scale_Symbol: !!d.Scale_Symbol,
      Min_Symbol_Px: num(d.Min_Symbol_Px),
      Max_Symbol_Px: num(d.Max_Symbol_Px),
      Min_Scale: num(d.Min_Scale),
      Max_Scale: num(d.Max_Scale),
      Label_Min_Scale: num(d.Label_Min_Scale),
      /* The preview has to see these or it shows a plain line while the
         canvas shows a lettered one. */
      Marker_Text: d.Marker_Text || null,
      Marker_Symbol: d.Marker_Symbol || null,
      Marker_Interval_M: num(d.Marker_Interval_M),
      Marker_Size_Px: num(d.Marker_Size_Px),
      Marker_Colour: d.Marker_Colour || null,
      Marker_Rotate: !!d.Marker_Rotate,
      Marker_Offset_Px: num(d.Marker_Offset_Px),
      Marker_Min_Gap_Px: num(d.Marker_Min_Gap_Px),
    }, previewScale);
  }, [draft, inherits, previewScale]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !editing) return;
    const ctx = cv.getContext("2d");
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, h);

    if (!preview.visible) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Hidden at this zoom", w / 2, h / 2 + 4);
      return;
    }

    if (draft.Symbol || inherits.Symbol) {
      ctx.beginPath();
      symbolPath(ctx, preview.symbol, w / 2, h / 2, preview.symbolPx);
      if (STROKE_ONLY.has(preview.symbol)) {
        ctx.strokeStyle = preview.colour;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = preview.colour;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(18, h / 2);
      ctx.lineTo(w - 18, h / 2);
      ctx.strokeStyle = preview.colour;
      ctx.lineWidth = preview.widthPx;
      ctx.setLineDash(preview.dash);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [preview, draft.Symbol, inherits.Symbol, editing]);

  /* ── What is open ──

     `selected` is a FEATURE, because that is what the left-hand list
     holds now. `editId` says which of its styles is in the form: the
     default, one of its variations, or a new one not yet saved. Two
     pieces of state rather than one, because "which feature" outlives
     "which of its rules" — moving between a default and its variations
     must not lose the feature. */

  const asDraft = (row) => toCriteria({
    ...BLANK,
    ...Object.fromEntries(Object.entries(row ?? {})
      .map(([k, v]) => [k, v == null ? "" : v])),
  });

  /* A style that names this feature and nothing else. The scope columns
     come from the SUBJECT rather than from a form, which is what makes
     it that feature's style: there is no longer a box to name a
     different one in. */
  const blankFor = (sub, kind) => asDraft({
    ...BLANK,
    /* A group carries the layer its members live on, which is the only
       scope column a group rule has: the group condition does the rest
       and `fromCriteria` writes it. */
    Layer_Key: sub?.kind === "layer" || sub?.kind === "group"
      ? (sub.Layer_Key ?? "") : "",
    Line_Type: sub?.Line_Type ?? "",
    Feature_Role: sub?.Feature_Role ?? "",
    Style_Name: kind === "variation"
      ? `${sub?.label ?? "Style"} \u2014 variation`
      : (sub?.label ?? ""),
  });

  function openRule(row, kind) {
    setEditId(row?.GIS_Style_ID ?? "new");
    setEditKind(kind);
    setDraft(row ? asDraft(row) : blankFor(subjectOfKey(selected), kind));
    setError("");
  }

  function openSubject(key) {
    const sub = subjectOfKey(key);
    setSelected(key);
    setEditKind("default");
    setEditId(sub?.dflt?.GIS_Style_ID ?? "new");
    setDraft(sub?.dflt ? asDraft(sub.dflt) : blankFor(sub, "default"));
    setError("");
  }

  /* Opening a rule from the inspector, which names rules and not
     features: find the feature it belongs to, then the rule within it. */
  function openStyleRow(row) {
    const key = subjectKeyOf(row);
    setSelected(key);
    setEditKind(isVariation(row) ? "variation" : "default");
    setEditId(row.GIS_Style_ID);
    setDraft(asDraft(row));
    setError("");
  }

  const set = (col) => (e) =>
    setDraft((d) => ({ ...d, [col]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save() {
    if (!draft.Style_Name.trim()) return setError("A style needs a name.");
    /* A variation that narrows nothing is the default wearing another
       name, and the cascade would apply whichever has the higher id —
       so it would quietly replace the default it was meant to vary. */
    if (editKind === "variation"
        && !criteria.some((c) => c && String(c.field ?? "").trim() !== "")) {
      return setError("A variation needs at least one criterion. "
        + "Without one it is the default style, not a variation of it.");
    }
    try {
      /* Operator and Site come back out of the criteria list and into
         their own columns, and a criterion naming no field is dropped —
         somebody pressed Add and changed their mind, and the database
         refuses a condition that names nothing (0240), correctly, since
         it would be scored for and never match.

         A criterion on Operator left sitting in Conditions is the one
         thing that must not happen: conditions are matched against the
         feature's Attributes, which carry no Organisation_ID, so it
         would save cleanly, look right and match nothing. */
      /* `groupKey` puts the group's own condition back on the rule. It
         was kept out of the editable list so nobody could point it at
         another value, and a group rule saved without it would be a
         rule about the whole electric layer — every service included. */
      const { GIS_Style_ID, ...body } = fromCriteria(draft, { group: groupKey });
      await saveGisStyle({
        ...body,
        Style_Name: body.Style_Name.trim(),
      }, isNew ? undefined : editId);
      await load();
      setStatus("Saved");
      setTimeout(() => setStatus(""), 4000);
    } catch (e) { setError(e.message); }
  }

  /* Deleting the rule that is OPEN, which is `editId` and has not been
     `selected` since the rebuild — `selected` became the feature key
     ("lt:elec_hv"), and no style's id has ever equalled one. So the
     button handed this `undefined` and the line below threw on
     `row.Style_Name` instead of deleting anything: the screen's only
     way to remove a rule, unreachable, while the rule went on styling
     the drawing.

     Guarded as well as fixed. A delete button that finds no row has
     been handed the wrong id, and saying so beats throwing in a
     handler nobody is catching. */
  async function remove(row) {
    if (!row) {
      setError("That rule could not be found, so nothing was deleted. "
        + "Reload the screen and try again.");
      return;
    }
    if (!window.confirm(`Delete "${row.Style_Name}"? Objects it styled fall back to the rule beneath it.`)) return;
    try {
      await deleteGisStyle(row.GIS_Style_ID);
      /* Back to the feature list rather than to the feature, which may
         not survive the delete: a layer or a whole drawing is listed
         only where a rule already names one, so removing the last rule
         about it removes the thing from the list — and a right-hand
         pane headed by a feature the left-hand list no longer offers is
         a screen arguing with itself. Clearing both means the list is
         what somebody sees next, refreshed. */
      setEditId(null);
      setSelected(null);
      await load();
    } catch (e) { setError(e.message); }
  }


  /* A variation of the feature that is open: the same scope columns, and
     a criteria list to fill in. It is not saved until somebody does. */
  function addVariation() {
    setEditKind("variation");
    setEditId("new");
    setDraft(blankFor(subject, "variation"));
    setError("");
  }

  /* A variation named by what it applies to, which is the only thing
     that tells two of them apart. Its Style_Name is a label somebody
     typed and is often the feature's name repeated. */
  const criteriaLine = (row) => {
    const parts = [
      row.Organisation_ID && opName(row.Organisation_ID),
      row.Site,
      row.Supply_Type
        && (SUPPLY_TYPES.find(([k]) => k === row.Supply_Type)?.[1] ?? row.Supply_Type),
      ...(Array.isArray(row.Conditions) ? row.Conditions : [])
        /* The group's own condition is left out. It is the rule's
           SCOPE — which feature this is about — and every variation of
           that feature carries it, so putting it on the pill adds
           "Line_Type_Group = elec_cable_main" to all of them and says
           nothing that tells one from another. The same reason
           `Line_Type` has never been on a pill: it is what the
           left-hand list already chose. */
        .filter((c) => c && c.field && c.field !== GROUP_FIELD)
        /* By the name the value goes by, not its key. A tab reading
           "Status = asbuilt" is the stored spelling, and the whole point
           of asking the feature what its stages are called is that a
           person should not have to know it. */
        .map((c) => {
          const vals = valuesFor(c.field, fieldCtx);
          const name = vals?.find(([k]) => String(k) === String(c.value))?.[1];
          return `${labelFor(c.field, fieldCtx)} = ${name ?? c.value ?? ""}`;
        }),
    ].filter(Boolean);
    return parts.length ? parts.join(" \u00b7 ") : (row.Style_Name || "Variation");
  };

  /* The rule's criteria, edited as one list — Operator and Site
     included. Held on the draft like every other field so Save carries
     them without a second path. */
  const criteria = Array.isArray(draft.Conditions) ? draft.Conditions : [];
  const putCriteria = (next) => setDraft((d) => ({ ...d, Conditions: next }));
  const addCriterion = () => putCriteria([...criteria, { field: "", value: "" }]);
  const removeCriterion = (i) => putCriteria(criteria.filter((_, j) => j !== i));
  const setCriterion = (i, patch) => putCriteria(
    criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)),
  );

  /* Changing the field clears the value, and choosing "Something else"
     marks the row so it shows a box to type a key into. The rule is in
     styleCriteria.js, where a check can reach it without a browser. */
  const pickField = (i, choice) => putCriteria(changeField(criteria, i, choice));

  const opName = (id) => operators.find((o) => String(o.Organisation_ID) === String(id))?.Name;
  const utName = (id) => utilities.find((u) => String(u.Utility_ID) === String(id))?.Utility;
  const roleName = (k) => ROLES.find(([r]) => r === k)?.[1] ?? k;

  /* What still narrows this rule that the screen no longer has a box
     for. Empty for almost every rule; said out loud for the ones 0051
     seeded against a layer or a role, because a rule that only applies
     on the plot layer is doing that whether or not there is a control
     for it. */
  /* Scope with no control on the screen — but NOT the columns the
     feature itself is named from. A rule on the Meter role carries
     Feature_Role because that is which feature it is, and reporting
     that as a limit somebody should consider removing would put the
     notice on every rule and empty it of meaning. */
  const hidden = editing && subject
    ? preservedScope(
      Object.fromEntries(Object.entries(draft).map(([k, v]) => [
        k,
        (k === "Feature_Role" && subject.Feature_Role)
          || (k === "Line_Type" && subject.Line_Type)
          /* A group's layer is which feature it is, exactly as a role's
             column is on a role rule, so it is not reported as a limit
             somebody might want to lift. */
          || (k === "Layer_Key"
            && (subject.kind === "layer" || subject.kind === "group")) ? "" : v,
      ])),
      { roleName, utilityName: utName },
    )
    : [];
  const clearHidden = () => setDraft((d) => {
    const next = { ...d };
    for (const k of PRESERVED) next[k] = "";
    return next;
  });

  if (loading) return <div className="loading">Loading styles&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">GIS Styles</h2>
      <p className="gs-note">
        Pick a feature on the left, set its default style, and add a variation for
        each case that differs. A variation sets only what changes &mdash; leave a
        field blank and it comes from the default, which is what the canvas does
        too: styles stack, and the most specific match wins field by field.
      </p>
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}
      {status && <Banner kind="ok">{status}</Banner>}

      {/* Both panes offer these, so they are rendered once here rather
          than inside the rule pane — where they used to be, which meant
          the inspector's own suggestions only worked while a rule
          happened to be open. */}
      <datalist id="gs-lts">
        {typeKeys.map((t) => <option key={t} value={t} />)}
      </datalist>
      <datalist id="gs-layers">
        {layerKeys.map((l) => <option key={l} value={l} />)}
      </datalist>

      <div className="gs-insp" style={{ margin: "10px 0 14px" }}>
        <button className="btn ghost" onClick={() => setInspOpen((o) => !o)}>
          {inspOpen ? "Hide the inspector" : "Why does it look like that?"}
        </button>
        {inspOpen && (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8,
            padding: "10px 12px", marginTop: 8 }}>
            <p className="hint" style={{ marginTop: 0 }}>
              Describe the object as it is on the drawing and every rule that
              applies is listed in the order they stack &mdash; the value that
              survives each field is the one the canvas draws. A rule missing
              from this list does not match that object, however right its own
              preview looks.
            </p>
            <div className="gs-grid">
              <div className="fld">
                <label htmlFor="gsi-layer">Layer key</label>
                <input id="gsi-layer" list="gs-layers" value={insp.Layer_Key}
                  onChange={setInspField("Layer_Key")} placeholder="e.g. water" />
              </div>
              <div className="fld">
                <label htmlFor="gsi-lt">Line type key</label>
                <input id="gsi-lt" list="gs-lts" value={insp.Line_Type}
                  onChange={setInspField("Line_Type")} placeholder="e.g. water_main" />
              </div>
              <div className="fld">
                <label htmlFor="gsi-role">Point role</label>
                <select id="gsi-role" value={insp.Feature_Role}
                  onChange={setInspField("Feature_Role")}>
                  {ROLES.map(([r, name]) => (
                    <option key={r} value={r}>{r ? name : "None"}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="gsi-util">Utility</label>
                <select id="gsi-util" value={insp.Utility_ID}
                  onChange={setInspField("Utility_ID")}>
                  <option value="">None</option>
                  {utilities.map((u) => (
                    <option key={u.Utility_ID} value={u.Utility_ID}>{u.Utility}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="gsi-op">Operator standard in force</label>
                <select id="gsi-op" value={insp.Organisation_ID}
                  onChange={setInspField("Organisation_ID")}>
                  <option value="">House style (none)</option>
                  {operators.map((o) => (
                    <option key={o.Organisation_ID} value={o.Organisation_ID}>{o.Name}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="gsi-site">Site</label>
                <select id="gsi-site" value={insp.Site} onChange={setInspField("Site")}>
                  <option value="">Any</option>
                  <option value="On-site">On-site</option>
                  <option value="Off-site">Off-site</option>
                </select>
              </div>
            </div>

            {inspected && (inspected.rows.length === 0 ? (
              <p className="hint">
                <strong>No rule matches this object.</strong> It draws in the
                line type&rsquo;s own colour and width &mdash; check the keys above
                against the drawing: a key is <code>water_main</code>, not the
                label &ldquo;Water Main&rdquo;.
              </p>
            ) : (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse",
                  fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#475569" }}>
                      <th style={{ padding: "4px 6px" }}>Applied</th>
                      <th style={{ padding: "4px 6px" }}>Rule</th>
                      <th style={{ padding: "4px 6px" }}>Specificity</th>
                      <th style={{ padding: "4px 6px" }}>Sets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspected.rows.map(({ style: s, score, sets }, i) => (
                      <tr key={s.GIS_Style_ID}
                        style={{ borderTop: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "4px 6px", color: "#94a3b8" }}>
                          {i + 1}{i === inspected.rows.length - 1 ? " (wins ties)" : ""}
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          <button className="btn ghost" style={{ padding: "1px 6px" }}
                            onClick={() => openStyleRow(s)}>{s.Style_Name}</button>
                        </td>
                        <td style={{ padding: "4px 6px" }}>{score}</td>
                        <td style={{ padding: "4px 6px" }}>
                          {Object.entries(sets).map(([k, v2]) => {
                            const kept = inspected.wonBy[k] === s.GIS_Style_ID;
                            return (
                              <span key={k} style={{ marginRight: 10,
                                textDecoration: kept ? "none" : "line-through",
                                color: kept ? "#0f172a" : "#94a3b8" }}
                                title={kept ? "this value is drawn"
                                  : "overridden by a later rule"}>
                                {k} = {String(v2)}
                                {k === "Colour" && (
                                  <span style={{ display: "inline-block", width: 10,
                                    height: 10, marginLeft: 4, borderRadius: 2,
                                    background: String(v2), verticalAlign: "middle" }} />
                                )}
                              </span>
                            );
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                  <strong>Drawn as:</strong>{" "}
                  {inspected.resolved.Colour && (
                    <span style={{ display: "inline-block", width: 12, height: 12,
                      borderRadius: 2, background: inspected.resolved.Colour,
                      verticalAlign: "middle", marginRight: 4 }} />
                  )}
                  {inspected.resolved.Colour ?? "line type's own colour"}
                  {", "}{inspected.resolved.Width_Px != null
                    ? `${inspected.resolved.Width_Px} px`
                    : "line type's own width"}
                  {", "}{inspected.resolved.Dashed ? "dashed" : "solid"}
                  {inspected.resolved.Min_Scale != null
                    && ` \u2014 hidden below ${inspected.resolved.Min_Scale} px/m`}
                  {inspected.resolved.Max_Scale != null
                    && ` \u2014 hidden above ${inspected.resolved.Max_Scale} px/m`}
                </p>
              </>
            ))}
          </div>
        )}
      </div>

      <div className="gs-split">
        {/* ── Features, not rules ──

            No "Add a rule" here: a feature is a thing the drawing can
            hold, and you do not add one from a styles screen. Adding a
            style belongs beside the styles, in the pane that shows
            them. */}
        <div className="gs-list">
          {tree.length === 0 && (
            <p className="gs-empty">
              Nothing to style. Run migration 0051 to seed the line types.
            </p>
          )}
          {tree.map((section) => (
            <div className="gs-sec" key={section.key}>
              <p className="gs-sec-h">{section.label}</p>
              {section.subjects.map((sub) => {
                const swatch = sub.dflt ?? sub.variations[0] ?? null;
                return (
                  <button key={sub.key}
                    className={selected === sub.key ? "gs-item on" : "gs-item"}
                    onClick={() => openSubject(sub.key)}>
                    <span className="gs-sw" style={{
                      background: swatch?.Colour || "#e2e8f0",
                      height: Math.max(2, Math.min(10, Number(swatch?.Width_Px) || 3)),
                    }} />
                    <span className="gs-nm">{sub.label}</span>
                    {/* On the line below the name, not beside it: most
                        features have no default yet, and a badge next to
                        every name wrapped the long ones round it —
                        "Property boundary point" and "Heavy duty
                        cut-out" both broke in two. A blank swatch on its
                        own reads as a rule somebody has not finished
                        rather than one nobody has written, so it is
                        still said. */}
                    <span className="gs-scope">
                      {!sub.dflt && <span className="gs-nodef">no default</span>}
                      {sub.detail}
                      {sub.variations.length > 0
                        && ` \u00b7 ${sub.variations.length} variation`
                        + (sub.variations.length > 1 ? "s" : "")}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="gs-detail">
          {!subject ? (
            <div className="gs-pick">Choose a feature on the left.</div>
          ) : (
            <>
              {/* ── The feature, then its styles ──

                  "In the styles pane, I need to be able to set a DEFAULT
                  style and every other style variation should be derived
                  from the default style."

                  So the pane is headed by the thing being styled — which
                  is not editable here, because it is what the left-hand
                  list chose — and then its default style, with each
                  variation beside it. Adding a style happens here, where
                  the styles are, rather than above the feature list. */}
              <div className="gs-subject">
                <div>
                  <p className="gs-subject-h">{subject.label}</p>
                  <p className="gs-subject-d">
                    {subject.kind === "group"
                      ? `${subject.members?.length ?? 0} cable types · `
                        + `${(subject.members ?? []).join(", ")}`
                      : subject.kind === "lt" ? `Line type ${subject.detail}`
                        : subject.kind === "role" ? `Point role ${subject.detail}`
                          : subject.kind === "layer" ? `Every feature on the ${subject.detail} layer`
                            : "Every feature on the drawing"}
                    {subject.unlisted && " \u00b7 not in the current catalogue"}
                  </p>
                </div>
                <button className="btn accent" type="button" onClick={addVariation}>
                  + Add a variation
                </button>
              </div>

              <div className="gs-tabs" role="tablist">
                <button role="tab" type="button"
                  aria-selected={editKind === "default"}
                  className={editKind === "default" ? "gs-tab on" : "gs-tab"}
                  onClick={() => openRule(subject.dflt, "default")}>
                  Default style
                  {!subject.dflt && <span className="gs-nodef">not set</span>}
                </button>
                {subject.variations.map((v) => (
                  <button key={v.GIS_Style_ID} role="tab" type="button"
                    aria-selected={editId === v.GIS_Style_ID}
                    className={editId === v.GIS_Style_ID ? "gs-tab on" : "gs-tab"}
                    onClick={() => openRule(v, "variation")}>
                    {criteriaLine(v)}
                  </button>
                ))}
                {editKind === "variation" && isNew && (
                  <button role="tab" type="button" aria-selected className="gs-tab on">
                    New variation
                  </button>
                )}
              </div>

              {/* A feature can carry more than one rule that narrows
                  nothing. The cascade applies them in id order and the
                  last wins field by field, so the last IS the default —
                  and the others are named rather than hidden, because a
                  rule this screen does not show is one nobody can edit
                  while it goes on styling the drawing. */}
              {/* ── Rules about ONE cable type, which outrank all of this ──

                  A rule naming `elec_hv` scores Line_Type = 8; a group
                  default scores the layer plus the group condition = 5.
                  So an older per-type rule beats the default somebody
                  has just written here, and a screen that did not say
                  so would be the screen the report is about: a style
                  set, and the drawing ignoring it.

                  Named, openable and deletable rather than hidden or
                  quietly folded in, because clearing them is the only
                  way to make this feature's default actually win. */}
              {(subject.typeRules?.length ?? 0) > 0 && (
                <p className="gs-hidden gs-outranks">
                  <strong>Outranks everything below:</strong>{" "}
                  {subject.typeRules.length === 1 ? "one rule names" : "these rules name"}
                  {" "}a single cable type, which is a narrower claim than this
                  feature and wins wherever they disagree.
                  {subject.typeRules.map((r) => (
                    <button key={r.GIS_Style_ID} className="btn ghost sm" type="button"
                      onClick={() => openRule(r, isVariation(r) ? "variation" : "default")}>
                      {r.Style_Name || r.Line_Type} ({r.Line_Type})
                    </button>
                  ))}
                </p>
              )}

              {subject.alsoDefault.length > 0 && (
                <p className="gs-hidden">
                  <strong>Also applies with no criteria:</strong>{" "}
                  {subject.alsoDefault.map((r) => r.Style_Name).join(", ")}.
                  {" "}The default above wins wherever they disagree.
                  {subject.alsoDefault.map((r) => (
                    <button key={r.GIS_Style_ID} className="btn ghost sm" type="button"
                      onClick={() => openRule(r, "default")}>
                      Open {r.Style_Name}
                    </button>
                  ))}
                </p>
              )}

              <div className="fld">
                <label htmlFor="gs-name">Style name</label>
                <input id="gs-name" value={draft.Style_Name} onChange={set("Style_Name")}
                  placeholder={subject.label} />
              </div>

              {/* Criteria belong to a variation. A default is what the
                  feature looks like when nothing else applies, and a
                  default with a criterion on it is a variation wearing
                  the wrong name — so the builder is not offered here,
                  rather than offered and then argued with. */}
              {editKind === "variation" ? (
                <>
                  <p className="panel-label">Applies when</p>
                  <p className="hint gs-hint">
                    Every criterion has to hold. Everything this variation does
                    not set comes from the default above it.
                  </p>
                  <div className="gs-conds">
                    {criteria.map((c, i) => {
                      const opts = fieldOptions(criteria, i, fieldCtx);
                      const vals = valuesFor(c.field, fieldCtx);
                      const typing = !!c.other && !c.field;
                      return (
                        <div className="gs-cond" key={i}>
                          {typing ? (
                            <input aria-label={`Criterion ${i + 1} field`} autoFocus
                              value={c.field ?? ""} placeholder="Field name, as the feature holds it"
                              onChange={(e) => setCriterion(i, { field: e.target.value })} />
                          ) : (
                            <select aria-label={`Criterion ${i + 1} field`}
                              value={c.field ?? ""}
                              onChange={(e) => pickField(i, e.target.value)}>
                              <option value="">Choose a field&hellip;</option>
                              {opts.map((f) => (
                                <option key={f.field} value={f.field}>{f.label}</option>
                              ))}
                              <option value={OTHER}>Something else&hellip;</option>
                            </select>
                          )}
                          <span className="gs-cond-eq">=</span>
                          {vals ? (
                            <select aria-label={`Criterion ${i + 1} value`}
                              value={c.value ?? ""}
                              onChange={(e) => setCriterion(i, { value: e.target.value })}>
                              <option value="">Choose&hellip;</option>
                              {vals.map(([k, name]) => (
                                <option key={k} value={k}>{name}</option>
                              ))}
                            </select>
                          ) : (
                            <input aria-label={`Criterion ${i + 1} value`}
                              value={c.value ?? ""} placeholder="Value"
                              onChange={(e) => setCriterion(i, { value: e.target.value })} />
                          )}
                          <button className="gs-cond-x" type="button"
                            aria-label={`Remove criterion ${i + 1}`}
                            onClick={() => removeCriterion(i)}>&times;</button>
                          {c.field && !isColumnField(c.field) && (
                            <span className="gs-cond-note">
                              read from the feature&rsquo;s {labelFor(c.field, fieldCtx)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <button className="gs-cond-add" type="button" onClick={addCriterion}>
                      + Add a criterion
                    </button>
                    {criteria.length === 0 && (
                      <p className="gs-cond-none">
                        A variation with no criteria is the default. Name at least one,
                        or this will not save.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="hint gs-hint">
                  What this feature looks like when nothing more specific applies.
                  Every variation starts from here and changes only what differs.
                </p>
              )}

              {/* Scope the screen no longer offers a box for, and which
                  is still narrowing the rule. */}
              {hidden.length > 0 && (
                <p className="gs-hidden">
                  <strong>Also limited to</strong> {hidden.join(" \u00B7 ")}.
                  {" "}This is how the seeded rules were written and it still
                  narrows this one.
                  <button className="btn ghost sm" type="button" onClick={clearHidden}>
                    Remove that limit
                  </button>
                </p>
              )}
              <p className="panel-label">Looks like</p>
              <div className="gs-grid">
                {/* Blank inherits, here as everywhere. A colour input
                    has no empty state, so the swatch shows what would
                    be drawn and Clear is the way back to inheriting —
                    without which a variation that only changes the dash
                    would silently carry a colour too. */}
                <div className="fld gs-colfld">
                  <label htmlFor="gs-col">Colour</label>
                  <div className="gs-colrow">
                    <input id="gs-col" type="color"
                      value={draft.Colour || inh("Colour") || "#64748b"}
                      onChange={set("Colour")} />
                    <input value={draft.Colour} onChange={set("Colour")}
                      placeholder={inhText("Colour", "#64748b")} />
                    <button className="btn ghost sm" type="button"
                      onClick={() => setDraft((d) => ({ ...d, Colour: "" }))}>
                      Clear
                    </button>
                  </div>
                </div>

                {/* The text drawn for whatever this row matches.

                    Its own field rather than following the line's
                    colour: a label has to read against the drawing it
                    sits on, and the thing it names is often the wrong
                    colour for that.

                    Blank inherits — from a less specific row, and from
                    the canvas default when nothing sets one. The Clear
                    button is how it gets back to blank once a picker
                    has been used, since a colour input has no empty. */}
                <div className="fld gs-colfld">
                  <label htmlFor="gs-lblcol">Label colour</label>
                  <div className="gs-colrow">
                    <input id="gs-lblcol" type="color"
                      value={draft.Label_Colour || "#0f172a"}
                      onChange={set("Label_Colour")} />
                    <input value={draft.Label_Colour} onChange={set("Label_Colour")}
                      placeholder={inhText("Label_Colour", "inherits")} />
                    <button className="btn ghost sm"
                      onClick={() => setDraft((d) => ({ ...d, Label_Colour: "" }))}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="fld">
                  <label htmlFor="gs-sym">Symbol (points)</label>
                  <select id="gs-sym" value={draft.Symbol} onChange={set("Symbol")}>
                    <option value="">{inhText("Symbol", "Not a point")}</option>
                    {SYMBOLS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <TriState id="gs-dashed" label="Line" value={draft.Dashed}
                  onChange={(v) => setDraft((d) => ({ ...d, Dashed: v }))}
                  inherited={inherits.Dashed} yes="Dashed" no="Continuous" />
                <div className="fld">
                  <label htmlFor="gs-dash">Dash pattern</label>
                  <input id="gs-dash" value={draft.Dash_Pattern} onChange={set("Dash_Pattern")}
                    placeholder={inhText("Dash_Pattern", "9,6")}
                    disabled={!(draft.Dashed === "" ? inherits.Dashed : draft.Dashed)} />
                </div>
              </div>

              {/* Symbol size, the same shape as Width below it.

                  A point drawn at a fixed pixel size is the same dot at
                  10% and at 800%, so zooming in grows the drawing around
                  it until a meter is smaller than the cable it sits on.
                  Drawing it to scale fixes that, and the clamps are what
                  stop it vanishing at site level or covering the plot at
                  full zoom. */}
              <p className="panel-label">Symbol size</p>
              <div className="gs-grid">
                <TriState id="gs-scalesym" label="Size" value={draft.Scale_Symbol}
                  onChange={(v) => setDraft((d) => ({ ...d, Scale_Symbol: v }))}
                  inherited={inherits.Scale_Symbol}
                  yes={"To scale \u2014 grows with the zoom"} no="Fixed pixels" />
                <div className="fld">
                  <label htmlFor="gs-symsize">Fixed size (px)</label>
                  <input id="gs-symsize" type="number" step="1" value={draft.Symbol_Size_Px}
                    onChange={set("Symbol_Size_Px")} placeholder={inhText("Symbol_Size_Px", "6")}
                    disabled={!!(draft.Scale_Symbol === "" ? inherits.Scale_Symbol : draft.Scale_Symbol)} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-symm">Real size (m)</label>
                  <input id="gs-symm" type="number" step="0.05" value={draft.Symbol_Size_M}
                    onChange={set("Symbol_Size_M")} placeholder={inhText("Symbol_Size_M", "0.6")}
                    disabled={!(draft.Scale_Symbol === "" ? inherits.Scale_Symbol : draft.Scale_Symbol)} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-minsym">Never smaller than (px)</label>
                  <input id="gs-minsym" type="number" step="0.5" value={draft.Min_Symbol_Px}
                    onChange={set("Min_Symbol_Px")} placeholder={inhText("Min_Symbol_Px", "3")}
                    disabled={!(draft.Scale_Symbol === "" ? inherits.Scale_Symbol : draft.Scale_Symbol)} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-maxsym">Never larger than (px)</label>
                  <input id="gs-maxsym" type="number" step="1" value={draft.Max_Symbol_Px}
                    onChange={set("Max_Symbol_Px")} placeholder={inhText("Max_Symbol_Px", "18")}
                    disabled={!(draft.Scale_Symbol === "" ? inherits.Scale_Symbol : draft.Scale_Symbol)} />
                </div>
              </div>

              <p className="panel-label">Width</p>
              <div className="gs-grid">
                <TriState id="gs-scalew" label="Width" value={draft.Scale_Width}
                  onChange={(v) => setDraft((d) => ({ ...d, Scale_Width: v }))}
                  inherited={inherits.Scale_Width}
                  yes={"To scale \u2014 the real width on the ground"} no="Fixed pixels" />
                <div className="fld">
                  <label htmlFor="gs-wpx">Fixed width (px)</label>
                  <input id="gs-wpx" type="number" step="0.5" value={draft.Width_Px}
                    onChange={set("Width_Px")} disabled={!!(draft.Scale_Width === "" ? inherits.Scale_Width : draft.Scale_Width)} 
                    placeholder={inhText("Width_Px", "inherits")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-wm">Real width (m)</label>
                  <input id="gs-wm" type="number" step="0.05" value={draft.Width_M}
                    onChange={set("Width_M")} disabled={!(draft.Scale_Width === "" ? inherits.Scale_Width : draft.Scale_Width)} 
                    placeholder={inhText("Width_M", "inherits")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-minw">Never thinner than (px)</label>
                  <input id="gs-minw" type="number" step="0.5" value={draft.Min_Width_Px}
                    onChange={set("Min_Width_Px")} 
                    placeholder={inhText("Min_Width_Px", "inherits")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-maxw">Never thicker than (px)</label>
                  <input id="gs-maxw" type="number" step="1" value={draft.Max_Width_Px}
                    onChange={set("Max_Width_Px")} 
                    placeholder={inhText("Max_Width_Px", "inherits")} />
                </div>
              </div>

              <p className="panel-label">Visible between</p>
              {/* The canvas shows a percentage; these are pixels per
                  metre. They are the same quantity — the readout is
                  scale &times; 25 — but the hint used to claim they were
                  the same number, so a value read off the canvas as 21%
                  and typed in here as 21 meant something eighty times
                  larger and the feature vanished for good.

                  The conversion is shown live under each box rather than
                  explained, because arithmetic in a hint is arithmetic
                  someone has to do. */}
              <p className="hint gs-hint">
                Zoom is canvas pixels per metre. The canvas readout is a percentage of
                the same thing &mdash; 4 here is the 100% view, 0.84 is 21%. Leave blank
                for no limit.
              </p>
              <div className="gs-grid">
                <div className="fld">
                  <label htmlFor="gs-min">Hide below</label>
                  <input id="gs-min" type="number" step="0.5" value={draft.Min_Scale}
                    onChange={set("Min_Scale")} placeholder={inhText("Min_Scale", "no limit")} />
                  <span className="gs-pct">{asPct(draft.Min_Scale)}</span>
                </div>
                <div className="fld">
                  <label htmlFor="gs-max">Hide above</label>
                  <input id="gs-max" type="number" step="0.5" value={draft.Max_Scale}
                    onChange={set("Max_Scale")} placeholder={inhText("Max_Scale", "no limit")} />
                  <span className="gs-pct">{asPct(draft.Max_Scale)}</span>
                </div>
                <div className="fld">
                  <label htmlFor="gs-lbl">Drop the label below</label>
                  <input id="gs-lbl" type="number" step="0.5" value={draft.Label_Min_Scale}
                    onChange={set("Label_Min_Scale")} placeholder={inhText("Label_Min_Scale", "always show")} />
                  <span className="gs-pct">{asPct(draft.Label_Min_Scale)}</span>
                </div>
                <div className="gs-span">
                  <p className="panel-label">Markers along the line</p>
                  <p className="hint">
                    A letter or symbol repeated at a set interval &mdash; an E every
                    ten metres, a tick along a ducted run. Leave both empty for a plain
                    line. Only applies to lines.
                  </p>
                </div>
                <div className="fld">
                  <label htmlFor="gs-mtext">Letter or number</label>
                  <input id="gs-mtext" maxLength={3} value={draft.Marker_Text}
                    onChange={set("Marker_Text")} placeholder={inhText("Marker_Text", "E")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-msym">Or a symbol</label>
                  <select id="gs-msym" value={draft.Marker_Symbol} onChange={set("Marker_Symbol")}>
                    <option value="">&mdash; none &mdash;</option>
                    {SYMBOLS.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="gs-mint">Every (m)</label>
                  <input id="gs-mint" type="number" step="0.5" min="0.5"
                    value={draft.Marker_Interval_M}
                    onChange={set("Marker_Interval_M")} placeholder={inhText("Marker_Interval_M", "10")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-msize">Size (px)</label>
                  <input id="gs-msize" type="number" value={draft.Marker_Size_Px}
                    onChange={set("Marker_Size_Px")} placeholder={inhText("Marker_Size_Px", "11")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-mcol">Marker colour</label>
                  <input id="gs-mcol" value={draft.Marker_Colour}
                    onChange={set("Marker_Colour")}
                    placeholder={inhText("Marker_Colour", "follows the line")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-moff">Offset from the line (px)</label>
                  <input id="gs-moff" type="number" value={draft.Marker_Offset_Px}
                    onChange={set("Marker_Offset_Px")} placeholder={inhText("Marker_Offset_Px", "0")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-mgap">Thin out below (px apart)</label>
                  <input id="gs-mgap" type="number" value={draft.Marker_Min_Gap_Px}
                    onChange={set("Marker_Min_Gap_Px")} placeholder={inhText("Marker_Min_Gap_Px", "28")} />
                  <p className="hint">
                    Zoomed out, markers this close together become a smear, so the
                    interval doubles rather than crowding.
                  </p>
                </div>
                <TriState id="gs-mrot" label="Marker angle" value={draft.Marker_Rotate}
                  onChange={(v) => setDraft((d) => ({ ...d, Marker_Rotate: v }))}
                  inherited={inherits.Marker_Rotate}
                  yes="Turned along the line" no="Upright" />

                <div className="fld">
                  <label htmlFor="gs-sort">Sort order</label>
                  <input id="gs-sort" type="number" value={draft.Sort_Order} onChange={set("Sort_Order")} />
                </div>
              </div>

              <p className="panel-label">Preview</p>
              <div className="gs-preview">
                <canvas ref={canvasRef} width={360} height={70} />
                <div className="gs-slider">
                  <label htmlFor="gs-zoom">Zoom: {previewScale} px/m</label>
                  <input id="gs-zoom" type="range" min="0.5" max="30" step="0.5"
                    value={previewScale}
                    onChange={(e) => setPreviewScale(Number(e.target.value))} />
                  <span className="hint">
                    {preview.visible
                      ? `drawn at ${preview.widthPx.toFixed(1)} px`
                      : "hidden at this zoom"}
                  </span>
                </div>
              </div>

              <div className="fld">
                <label htmlFor="gs-notes">Notes</label>
                <textarea id="gs-notes" value={draft.Notes} onChange={set("Notes")}
                  placeholder="Why this rule exists — which standard it came from" />
              </div>

              <div className="gs-foot">
                <label className="gs-check">
                  <input type="checkbox" checked={draft.Is_Active !== false}
                    onChange={set("Is_Active")} />
                  Active
                </label>
                <span className="gs-spacer" />
                {!isNew && (
                  <button className="btn ghost danger"
                    onClick={() => remove(rows.find(
                      (r) => String(r.GIS_Style_ID) === String(editId)))}>
                    Delete
                  </button>
                )}
                <button className="btn ghost" onClick={() => setSelected(null)}>Cancel</button>
                <button className="btn accent" onClick={save}>Save rule</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.gs-note { font-size: 12.5px; color: var(--muted); margin: -10px 0 14px; max-width: 82ch; }
.gs-split { display: grid; grid-template-columns: 300px 1fr; gap: 18px; align-items: start; }
.gs-list { border: 1px solid var(--border); border-radius: var(--radius); padding: 9px;
  max-height: 78vh; overflow-y: auto; }
.gs-new { width: 100%; background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 7px; margin-bottom: 8px; cursor: pointer; font: 600 12.5px inherit; color: var(--accent); }
.gs-new:hover { background: var(--accent-light); }
.gs-empty { font-size: 11.5px; color: var(--muted); font-style: italic; padding: 0 4px; }
.gs-item { display: grid; grid-template-columns: 22px 1fr auto; gap: 4px 8px; width: 100%;
  text-align: left; background: none; border: 1px solid transparent; border-radius: 6px;
  padding: 7px 9px; cursor: pointer; font: inherit; color: var(--text); margin-bottom: 1px;
  align-items: center; }
.gs-item:hover { background: var(--bg); }
.gs-item.on { background: var(--accent-light); border-color: var(--accent); }
.gs-sw { width: 22px; border-radius: 2px; }
.gs-nm { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.gs-off { font-size: 9px; font-weight: 700; text-transform: uppercase; background: var(--bg);
  border: 1px solid var(--border); color: var(--muted); border-radius: 3px; padding: 0 4px; }
.gs-scope { grid-column: 2 / 3; font-size: 10.5px; color: var(--muted); }
.gs-zoom { grid-row: 1 / 3; grid-column: 3; font: 700 9.5px ui-monospace, Menlo, monospace;
  background: var(--bg); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px;
  color: var(--muted); }
.gs-sec { margin-bottom: 10px; }
.gs-sec-h { margin: 8px 6px 4px; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); }
.gs-sec:first-child .gs-sec-h { margin-top: 2px; }
.gs-grp { margin-bottom: 1px; }
/* The item line: the thing, and how many rules are folded under it. */
.gs-head { display: grid; grid-template-columns: 22px 1fr auto 12px; gap: 8px; width: 100%;
  align-items: center; text-align: left; background: none; border: 1px solid transparent;
  border-radius: 6px; padding: 6px 9px; cursor: pointer; font: inherit; color: var(--text); }
.gs-head:hover { background: var(--bg); }
.gs-head.open { background: var(--bg); }
.gs-count { font-size: 10px; color: var(--muted); white-space: nowrap; }
.gs-chev { color: var(--muted); font-weight: 700; font-size: 13px; text-align: center; }
/* A rule inside an item, stepped in far enough to read as belonging to
   it and not so far that the swatches stop lining up. */
.gs-in { padding-left: 22px; }
.gs-conds { margin-bottom: 16px; }
.gs-cond { display: grid; grid-template-columns: 1fr 14px 1fr 26px; gap: 5px 8px;
  align-items: center; margin-bottom: 10px; }
.gs-cond input, .gs-cond select { width: 100%; font-size: 12.5px; }
/* Which half of the cascade this criterion is asked of, on its own line
   so the row above it stays three boxes wide. */
.gs-cond-note { grid-column: 1 / -1; font-size: 10.5px; color: var(--muted); }
/* Scope with no control left on the screen. Loud enough to be read,
   since it changes what the rule matches. */
.gs-hidden { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 11.5px; color: var(--text); background: var(--bg);
  border: 1px solid var(--border); border-radius: 6px; padding: 7px 10px;
  margin: 0 0 12px; }
/* A rule that beats everything on this pane. Warmer than the plain
   notice above, because it is not describing the rule being edited —
   it is saying the rule being edited will lose. */
.gs-outranks { border-color: #fcd34d; background: #fffbeb; }
.gs-cond-eq { text-align: center; color: var(--muted); font-weight: 700; }
.gs-cond-x { border: 1px solid var(--border); background: var(--white); border-radius: 5px;
  width: 26px; height: 26px; cursor: pointer; color: var(--muted); font-size: 15px;
  line-height: 1; }
.gs-cond-x:hover { border-color: #b91c1c; color: #b91c1c; }
.gs-cond-add { background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 5px 10px; cursor: pointer; font: 600 12px inherit; color: var(--accent); }
.gs-cond-add:hover { background: var(--accent-light); }
.gs-cond-none { font-size: 11.5px; color: var(--muted); font-style: italic; margin: 0 0 6px; }
.gs-detail { border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px 20px;
  min-height: 420px; }

/* ── The feature being styled, and its styles ──

   These six classes shipped with no rules at all, which is what "some
   of the fields are cramped together" was: the header, the tab row and
   the badges fell back to the browser's own margins and ran into each
   other and into the form below. */
.gs-subject { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; flex-wrap: wrap; padding-bottom: 14px; margin-bottom: 16px;
  border-bottom: 1px solid var(--border); }
.gs-subject-h { margin: 0 0 3px; font-size: 15px; font-weight: 700; color: var(--text); }
.gs-subject-d { margin: 0; font-size: 11.5px; color: var(--muted); }
/* The default and its variations, as one row of tabs. Wrapping rather
   than scrolling: a feature with six variations should show six, and a
   tab somebody cannot see is a style nobody will edit. */
.gs-tabs { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 18px; }
.gs-tab { display: inline-flex; align-items: center; gap: 6px; background: var(--white);
  border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px;
  cursor: pointer; font: 600 12px inherit; color: var(--muted); }
.gs-tab:hover { border-color: var(--accent); color: var(--text); }
.gs-tab.on { background: var(--accent-light); border-color: var(--accent); color: var(--accent); }
/* "No default" on the list, "not set" on the tab: the same fact, and
   it has to read as a state rather than as part of the name. */
.gs-nodef { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  background: var(--bg); border: 1px solid var(--border); color: var(--muted);
  border-radius: 3px; padding: 1px 4px; white-space: nowrap; }
/* Before the key on the list, after the name on a tab. */
.gs-scope .gs-nodef { margin-right: 6px; }
.gs-tab .gs-nodef { margin-left: 2px; }
.gs-tab.on .gs-nodef { background: var(--white); }
.gs-pick { color: var(--muted); font-size: 13px; text-align: center; padding: 150px 20px; }
/* A column wider than 160px, and more air between rows than between
   columns: a label sits directly above its box, so rows need the gap
   that tells one field from the next. */
.gs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 18px 16px; margin-bottom: 4px; }
.gs-colrow { display: flex; gap: 8px; align-items: center; }
/* Two columns wide. A colour field is a swatch, a value and a way back
   to inheriting, and in one column "inherits #facc15" was cut off at
   "inherits #fac" — which is a box that says nothing. */
.gs-colfld { grid-column: span 2; }
@media (max-width: 900px) { .gs-colfld { grid-column: span 1; } }
.gs-colrow input[type=color] { width: 40px; padding: 2px; flex: none; }
/* A heading and its note spanning the whole form grid, so a group of
   related fields reads as a group rather than as more of the same. */
.gs-span { grid-column: 1 / -1; margin-top: 10px; }
/* Each heading starts a group, and a group needs to look like one. The
   first in the pane keeps its place. */
/* Every heading starts a group and needs the air to say so. Not
   first-of-type: the style-name field is a div, so the FIRST heading is
   also the first p.panel-label among its siblings and lost its gap,
   which put "Applies when" hard against the box above it.

   No backticks in here. This stylesheet is a template literal and one
   of them ends it early, which is the fault checkcss was written for —
   and which this comment caused on its first draft. */
.gs-detail .panel-label { margin-top: 26px; margin-bottom: 9px; }
.gs-detail .gs-span .panel-label { margin-top: 0; }
.gs-detail .hint { margin-top: 0; }
.gs-span .panel-label { margin-bottom: 2px; }
.gs-check { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 14px 0 0; }

.gs-pct { font-size: 10.5px; color: var(--muted); margin-top: 3px; display: block; }
.gs-hint { margin: -4px 0 8px; max-width: 76ch; }
.gs-preview { display: flex; gap: 18px; align-items: center; flex-wrap: wrap;
  border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
.gs-preview canvas { border-radius: 4px; }
.gs-slider { flex: 1; min-width: 190px; }
.gs-slider label { margin-bottom: 5px; }
.gs-foot { display: flex; align-items: center; gap: 9px; margin-top: 16px; padding-top: 13px;
  border-top: 1px solid var(--border); }
.gs-spacer { flex: 1; }
@media (max-width: 1040px) { .gs-split { grid-template-columns: 1fr; } }
`;
