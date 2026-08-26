import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import CategoryPicker from "./CategoryPicker.jsx";
import { lineLength } from "./snapping.js";
import { statusesFor } from "./buildStatus.js";
import { bulkDeleteCategories, idsForKeys } from "./bulkDelete.js";
import { classesIn, fieldsForMany, planBulkEditOn, CLEAR } from "./bulkEdit.js";

/* Editing many features at once, by selecting them or by naming them.

   Every field starts at "leave alone" rather than at the current value.
   A bulk form pre-filled with one feature's values is how you silently
   overwrite the other eleven — so nothing is sent unless it was
   deliberately changed, and the form says how many it will touch.

   ── Two ways in ──

   The selection is the obvious one and the smaller one. "Set every
   service trench to As Laid" is a single decision about four hundred
   features that nobody is going to rubber-band, and until now the only
   way to make it was to draw round them.

   So the kinds mode names them instead, from the same category list
   bulk delete names what it removes — the sentence is "all the service
   trenches" either way, and having learnt where that list is for one
   job you know where it is for the other.

   ── Which fields ──

   Not decided here. `fieldsForMany` in bulkEdit.js answers what can
   honestly be said about a set spanning several classes, and this draws
   the controls for whatever it returns. That matters most in kinds
   mode, where the ticked set is mixed far more often than a selection
   is: the panel used to settle "are these trenches?" by looking at the
   first line in the array, which is an answer that depends on the order
   the drawing loaded in.

   Two exceptions, both deliberate and both stated on screen rather than
   left as an absence:

   - the cable field is not drawn, because the span node a run feeds
     mirrors its size and only the canvas can keep the two together;
   - the house type is not a feature field at all. It lives on the plot,
     so it goes back through a second write. */
export default function BulkEditor({
  features = [], allFeatures = [], lineTypes, surfaceTypes = [], layers,
  configs = [], propertyTypes = [], mode: openWith = "selection", onApply, onClose,
}) {
  const typeName = (id) =>
    propertyTypes.find((t) => t.Property_Type_ID === id)?.Property_Type ?? "";

  const [mode, setMode] = useState(features.length > 1 ? openWith : "kinds");
  const [keys, setKeys] = useState([]);
  const [draft, setDraft] = useState({});
  const [clearSize, setClearSize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  /* The categories, counted over the whole drawing rather than over the
     selection — the point of this mode is to reach what is not
     selected. */
  const cats = useMemo(
    () => bulkDeleteCategories(allFeatures, { lineTypes, layers }),
    [allFeatures, lineTypes, layers]
  );

  /* What was ticked, as features.

     Through the ids rather than through the classes: a category can be
     narrower than the class of the things inside it — service joints
     are a category, "electric joints" is their class, and that class is
     also the breeches and the straights. Planning from the class would
     edit four times what was ticked and look entirely correct doing
     it. */
  const picked = useMemo(() => {
    if (mode !== "kinds") return [];
    const ids = new Set(idsForKeys(cats, keys));
    return allFeatures.filter((f) => ids.has(f.Feature_ID));
  }, [mode, cats, keys, allFeatures]);

  const targets = mode === "kinds" ? picked : features;

  /* The fields, from the classes present. */
  const classes = useMemo(
    () => classesIn(targets, { lineTypes, layers }),
    [targets, lineTypes, layers]
  );
  const shared = useMemo(() => fieldsForMany(classes, { lineTypes }), [classes, lineTypes]);
  const field = (k) => shared.find((f) => f.key === k);

  const lines = targets.filter((f) => f.Feature_Type === "line");
  const allLines = lines.length === targets.length && lines.length > 0;
  const totalM = lines.reduce((t, f) => t + lineLength(f.Geometry || []), 0);

  /* The house type lives on the plot, not on the seed that marks it, so
     it is kept out of the feature patch and written separately below. */
  const seeds = targets.filter((f) => f.Feature_Role === "plot" && f.Plot_ID != null);
  const houseType = field("Property_Config_ID") ? draft.Property_Config_ID || "" : "";

  /* Which statuses to offer.

     The union across the set, not the intersection: a main runs through
     more stages than a service, and offering only what they all share
     would hide Live from a set that is mostly mains. One a given feature
     cannot hold is skipped for that feature when applied, and the count
     says so — better than a control that hides the option somebody is
     looking for.

     Deduplicated by key, in the order they were first met, so the
     sequence still reads planned -> as-laid -> live rather than
     alphabetically or by whichever feature came first in the array. */
  const statusOptions = useMemo(() => {
    const seen = new Map();
    for (const f of targets) {
      for (const st of statusesFor(f, lineTypes)) {
        if (!seen.has(st.key)) seen.set(st.key, st);
      }
    }
    return [...seen.values()];
  }, [targets, lineTypes]);

  /* What will actually be written, worked out before the button is
     pressed rather than reported after it. "Apply to 12" that quietly
     writes 9 is worse than saying which 3 will be left and why. */
  const plan = useMemo(() => {
    /* Only fields that are offered for THIS set.

       The draft outlives the set it was filled in against — switch mode,
       or untick one category and tick another, and a surface typed for a
       hundred trenches is still sitting in state while the panel now
       holds a hundred meters. Filtering here rather than clearing the
       draft on every change keeps a half-filled form through a mistaken
       tick, which is the commoner case by far.

       The house type goes out with them: it is not a feature field, and
       the planner would write it into Attributes where nothing reads
       it. It is handed over separately below. */
    const offered = new Set(shared.map((f) => f.key)
      .filter((k) => k !== "Property_Config_ID"));
    const featureDraft = Object.fromEntries(
      Object.entries(draft).filter(([k]) => offered.has(k)));
    return planBulkEditOn(targets, featureDraft, { lineTypes, statusesFor });
  }, [targets, draft, shared, lineTypes]);

  const plotChange = houseType && seeds.length
    ? { plotIds: seeds.map((f) => f.Plot_ID), Property_Config_ID: houseType }
    : null;

  const changes = Object.keys(plan.patch)
    .map((k) => (field(k)?.label ?? k).toLowerCase())
    .concat(plotChange ? ["house type"] : []);

  /* The stripe across the head is the layer's colour, and only where
     the set is all one layer. A mixed set given the first one's colour
     says the panel is about that layer, which it is not. */
  const oneLayer = targets.length > 0
    && targets.every((f) => f.Layer_Key === targets[0].Layer_Key);
  const layer = oneLayer
    ? layers.find((l) => l.Layer_Key === targets[0].Layer_Key)
    : null;
  const currentType = lineTypes.find((t) => t.Type_Key === targets[0]?.Attributes?.Line_Type);

  async function apply() {
    if (!plan.rows.length && !plotChange) {
      return setError("Nothing to apply \u2014 change a field first.");
    }
    setBusy(true);
    try {
      /* Two writes, because they go to two places: the features carry
         the drawing, the plots carry the house type. Handed over
         together so the caller can do both in one undo step rather than
         leaving a drawing half changed. */
      await onApply(plan.rows, plotChange);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const drag = useDragHandle();
  const n = targets.length;

  /* One control per field kind. Drawn from what fieldsForMany returned,
     so a field appears here when it can honestly be set on everything
     in the set and never otherwise. */
  function control(f) {
    if (f.kind === "status") {
      if (!statusOptions.length) return null;
      const skips = draft.Build_Status
        ? targets.filter((x) =>
          !statusesFor(x, lineTypes).some((st) => st.key === draft.Build_Status))
        : [];
      return (
        <div className="fld" key={f.key}>
          <label htmlFor="be-status">{f.label}</label>
          <select id="be-status" value={draft.Build_Status || ""}
            onChange={(e) => set("Build_Status", e.target.value)}>
            <option value="">Leave as they are</option>
            {statusOptions.map((st) => (
              <option key={st.key} value={st.key}>{st.label}</option>
            ))}
          </select>
          <p className="hint">
            {skips.length === 0
              ? `Applied to all ${n}.`
              : `${n - skips.length} of ${n} \u2014 ${skips.length} `
                + `ha${skips.length === 1 ? "s" : "ve"} no such stage `
                + "and will be left as they are."}
          </p>
        </div>
      );
    }

    if (f.kind === "lineType") {
      return (
        <div className="fld" key={f.key}>
          <label htmlFor="be-type">{f.label}</label>
          <select id="be-type" value={draft.Line_Type || ""}
            onChange={(e) => set("Line_Type", e.target.value)}>
            <option value="">Leave unchanged</option>
            {lineTypes.map((t) => (
              <option key={t.Type_Key} value={t.Type_Key}>{t.Label}</option>
            ))}
          </select>
          {f.note && <p className="hint">{f.note}.</p>}
        </div>
      );
    }

    if (f.kind === "surface") {
      return (
        <div className="fld" key={f.key}>
          <label htmlFor="be-surface">{f.label}</label>
          <select id="be-surface" value={draft.Surface_Type || ""}
            onChange={(e) => set("Surface_Type", e.target.value)}>
            <option value="">Leave unchanged</option>
            {surfaceTypes.map((x) => (
              <option key={x.Surface_Key} value={x.Surface_Key}>{x.Label}</option>
            ))}
            <option value={CLEAR}>&mdash; Clear it &mdash;</option>
          </select>
        </div>
      );
    }

    if (f.kind === "choice") {
      return (
        <div className="fld" key={f.key}>
          <label htmlFor={`be-${f.key}`}>{f.label}</label>
          <select id={`be-${f.key}`} value={draft[f.key] || ""}
            onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Leave unchanged</option>
            {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {f.note && <p className="hint">{f.note}.</p>}
        </div>
      );
    }

    if (f.kind === "number") {
      return (
        <div className="fld" key={f.key}>
          <label htmlFor={`be-${f.key}`}>{f.label}</label>
          <input id={`be-${f.key}`} type="number" step={f.step || "0.05"}
            value={draft[f.key] ?? ""} placeholder="Leave blank to keep"
            onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
      );
    }

    if (f.kind === "houseType") {
      return (
        <div className="fld" key={f.key}>
          <label htmlFor="be-config">{f.label}</label>
          <select id="be-config" value={houseType}
            onChange={(e) => set("Property_Config_ID", e.target.value)}>
            <option value="">Leave each as it is</option>
            {/* Labelled the way the single-plot editor labels them, so
                the same house type reads the same in both. There is no
                Description column on Property_Config — an earlier
                version of this used one and every option would have
                read as just its code. */}
            {configs.map((c) => (
              <option key={c.Property_Config_ID} value={c.Property_Config_ID}>
                {c.Code} &mdash; {c.Bedrooms} Bed {typeName(c.Property_Type_ID)}
              </option>
            ))}
          </select>
          {/* Said before it is done: the house type is not only a label.
              The load comes from bedrooms and heat source together, so
              changing the type moves the kVA on every plot and with it
              anything already worked out from it. */}
          <p className="fe-tip">Applied to all {seeds.length}. {f.note}.</p>
        </div>
      );
    }

    /* Cable. Not drawn, and said rather than left absent.

       A run's size is held twice — on the run and on the span node it
       feeds, because the volt drop sum reads it from the node — and
       only the canvas can write both. A bulk write of one of them from
       here would leave a drawing where the cable says 300 and the sum
       says 95, each true to whichever reader looked. */
    if (f.kind === "cable") {
      return (
        <p className="fe-tip" key={f.key}>
          Cable size is set on the run itself, not here &mdash; the span node
          it feeds carries a copy, and the two have to move together.
        </p>
      );
    }

    /* Text: the name, and a size where the layer has no catalogue. */
    const isSize = f.key === "Size";
    return (
      <div className="fld" key={f.key}>
        <label htmlFor={`be-${f.key}`}>{f.label}</label>
        <input id={`be-${f.key}`} value={draft[f.key] === CLEAR ? "" : draft[f.key] ?? ""}
          disabled={isSize && clearSize}
          placeholder={isSize ? "Leave blank to keep" : "Leave blank to keep each name"}
          onChange={(e) => set(f.key, e.target.value)} />
        {f.note && <p className="hint">{f.note} &mdash; applied to all {n}.</p>}
        {isSize && (
          <label className="be-check">
            <input type="checkbox" checked={clearSize}
              onChange={(e) => {
                setClearSize(e.target.checked);
                set("Size", e.target.checked ? CLEAR : "");
              }} />
            Clear the size on all {n}
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="fe" onClick={(e) => e.stopPropagation()} style={drag.panelStyle} role="dialog"
        aria-label="Bulk edit">
        <style>{CSS}</style>

        <div className="fe-head" {...drag.handleProps}
          /* Merged, not replaced: a bare style prop after the spread
             would drop the grab cursor the handle sets. */
          style={{ ...drag.handleProps.style, borderTopColor: layer?.Colour }}>
          <div>
            <h3>{mode === "kinds" ? "Edit by kind" : `Edit ${features.length} selected`}</h3>
            <p className="fe-sub">
              {mode === "kinds"
                ? (n === 0 ? "Nothing named yet" : `${n} feature${n === 1 ? "" : "s"}`)
                : (currentType?.Label || layer?.Label || "Features")}
              {allLines && <> &middot; {totalM.toFixed(1)} m total</>}
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="fe-body">
          {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

          {/* The switch. Both ways in are the same edit against a
              different set, so it is one panel with a mode rather than
              two panels sharing a form by copy. */}
          <div className="be-mode" role="tablist">
            <button role="tab" aria-selected={mode === "selection"}
              className={mode === "selection" ? "on" : ""}
              disabled={features.length < 2}
              title={features.length < 2 ? "Select two or more features first" : undefined}
              onClick={() => setMode("selection")}>
              The selection{features.length > 1 ? ` (${features.length})` : ""}
            </button>
            <button role="tab" aria-selected={mode === "kinds"}
              className={mode === "kinds" ? "on" : ""}
              onClick={() => setMode("kinds")}>
              Named kinds
            </button>
          </div>

          {mode === "kinds" && (
            <>
              <p className="be-note">
                Tick what to change. Counts are of the whole drawing, not the selection.
              </p>
              <div className="be-cats">
                <CategoryPicker categories={cats} keys={keys} onChange={setKeys}
                  disabled={busy} />
              </div>
            </>
          )}

          <p className="be-note">
            Blank fields are left as they are. Only what you fill in is written.
          </p>

          {n === 0 && (
            <p className="fe-tip">
              {mode === "kinds"
                ? "Nothing ticked yet, so there is nothing to change."
                : "Nothing selected."}
            </p>
          )}

          {n > 0 && shared.map(control)}

          {n > 0 && shared.length <= 2 && (
            <p className="fe-tip">
              Mixed kinds &mdash; only what they all carry can be set on them together.
            </p>
          )}

          <p className="be-summary">
            {changes.length && (plan.rows.length || plotChange)
              ? <>Will change <strong>{changes.join(", ")}</strong> on {plan.rows.length} feature
                {plan.rows.length === 1 ? "" : "s"}
                {plan.rows.length < n && n > 0
                  ? <> of {n} &mdash; the rest already hold it</> : null}
                . Lengths and geometry are untouched.</>
              : changes.length
                ? <span className="be-idle">
                  They already hold that. Nothing would be written.
                </span>
                : <span className="be-idle">No changes yet.</span>}
          </p>
        </div>

        <div className="fe-foot">
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent"
            disabled={busy || (!plan.rows.length && !plotChange)} onClick={apply}>
            {busy ? "Applying\u2026" : `Apply to ${plotChange && !plan.rows.length
              ? seeds.length : plan.rows.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.be-note { font-size: 12px; color: var(--muted); margin: 0; }
.be-check { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 10px 0 0; }

/* The picker in a 420px panel: one column, and bounded so the fields it
   decides the shape of stay on screen beneath it. */
.be-cats { max-height: 230px; overflow-y: auto; border: 1px solid var(--border);
  border-radius: 8px; padding: 2px 6px 8px; }

.be-mode { display: flex; gap: 4px; padding: 3px; background: var(--bg, #f8fafc);
  border-radius: 8px; }
.be-mode button { flex: 1; border: none; background: none; border-radius: 6px; padding: 6px 8px;
  font: inherit; font-size: 12px; font-weight: 600; color: var(--muted); cursor: pointer; }
.be-mode button.on { background: var(--white); color: var(--text);
  box-shadow: 0 1px 3px rgba(15,23,42,.14); }
.be-mode button:disabled { opacity: .45; cursor: default; }

.be-summary { font-size: 12px; color: var(--text); margin: 14px 0 0; padding-top: 11px;
  border-top: 1px solid var(--border); }
.be-idle { color: var(--muted); font-style: italic; }
`;
