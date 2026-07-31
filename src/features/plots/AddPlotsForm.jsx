import { useState, useEffect, useMemo } from "react";
import Field from "../../components/Field.jsx";
import Section from "../../components/Section.jsx";
import Select from "../../components/Select.jsx";
import Toggle from "../../components/Toggle.jsx";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listPlots, createPlots } from "../../api/plots.js";
import HeatPumpPicker from "../../components/HeatPumpPicker.jsx";

/* Mirrors the "Add Plots to Tender" flow from the original app:
   shared attributes, two ways to enter numbers, a preview that flags
   duplicates, then one batch insert. */

const MAX_RANGE = 1000;

/* "10" sorts after "9", not before — plot numbers are text because of
   43A and B1, so compare numeric prefixes when both have them. */
function naturalCompare(a, b) {
  const re = /^(\d+)(.*)$/;
  const ma = re.exec(a);
  const mb = re.exec(b);
  if (ma && mb) {
    const diff = Number(ma[1]) - Number(mb[1]);
    return diff !== 0 ? diff : ma[2].localeCompare(mb[2]);
  }
  return a.localeCompare(b, undefined, { numeric: true });
}

export default function AddPlotsForm({ projectId, projectRef = "", existingNumbers = null, onDone }) {
  const [lookups, setLookups] = useState(null);
  const [existing, setExisting] = useState([]);
  const [pending, setPending] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);

  // attributes applied to every plot in this batch
  const [attrs, setAttrs] = useState({
    Property_Config_ID: "",
    PV: false,
    Heat_Pump_Model_ID: "",
    KVA_Load: "",
    Self_Lay_Provider: false,
  });

  const [individual, setIndividual] = useState("");
  const [range, setRange] = useState({ from: "1", to: "", prefix: "" });

  useEffect(() => {
    let live = true;
    const plotsPromise = existingNumbers
      ? Promise.resolve({ rows: existingNumbers.map((n) => ({ Plot_Number: n })) })
      : listPlots(projectId);
    Promise.all([getLookups(), plotsPromise])
      .then(([lk, res]) => {
        if (!live) return;
        setLookups(lk);
        setExisting((res.rows || []).map((p) => String(p.Plot_Number)));
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [projectId]);

  const existingSet = useMemo(() => new Set(existing), [existing]);
  const fresh = pending.filter((p) => !existingSet.has(p));
  const dupes = pending.filter((p) => existingSet.has(p));

  const setAttr = (k) => (v) => setAttrs((p) => ({ ...p, [k]: v }));

  const typeName = (id) =>
    (lookups?.propertyTypes || []).find((t) => t.Property_Type_ID === id)?.Property_Type ?? "";

  function addIndividual() {
    const vals = individual
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!vals.length) return;
    setPending((p) => [...new Set([...p, ...vals])].sort(naturalCompare));
    setIndividual("");
    setError("");
  }

  function addRange() {
    const from = parseInt(range.from, 10) || 1;
    const to = parseInt(range.to, 10);
    if (!to) return setError("Enter a To value.");
    if (from > to) return setError("From must be less than or equal to To.");
    if (to - from >= MAX_RANGE) return setError(`Range too large (max ${MAX_RANGE}).`);
    const labels = [];
    for (let i = from; i <= to; i++) labels.push(`${range.prefix}${i}`);
    setPending((p) => [...new Set([...p, ...labels])].sort(naturalCompare));
    setError("");
  }

  const removePlot = (label) => setPending((p) => p.filter((x) => x !== label));

  async function save() {
    if (!fresh.length) return setError("Nothing new to save.");
    setSaving(true);
    setError("");
    try {
      const payload = fresh.map((label) => ({
        Plot_Number: label,
        Property_Config_ID: attrs.Property_Config_ID ? Number(attrs.Property_Config_ID) : null,
        PV: !!attrs.PV,
        Heat_Pump_Model_ID: attrs.Heat_Pump_Model_ID ? Number(attrs.Heat_Pump_Model_ID) : null,
        KVA_Load: attrs.KVA_Load === "" ? null : Number(attrs.KVA_Load),
        Self_Lay_Provider: !!attrs.Self_Lay_Provider,
      }));
      await createPlots(projectId, payload, projectRef);
      setExisting((p) => [...p, ...fresh]);
      setDone(fresh.length);
      setPending([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !lookups) return <Banner kind="error">Couldn&rsquo;t load: {error}</Banner>;
  if (!lookups) return <div className="loading">Loading&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>Add plots</h3>
          <p className="tab-sub">
            Build the list first &mdash; nothing is saved until you commit the batch.
            {existing.length > 0 && ` ${existing.length} plot${existing.length === 1 ? "" : "s"} already on this project.`}
          </p>
        </div>
        {onDone && (
          <button className="btn ghost" onClick={onDone}>
            &larr; Back to plots
          </button>
        )}
      </div>

      {done > 0 && (
        <Banner kind="ok">
          {done} plot{done === 1 ? "" : "s"} added. Add more below, or go back to the list.
        </Banner>
      )}
      {error && <Banner kind="error">{error}</Banner>}

      <Section title="Applied to every plot in this batch">
        <div className="grid6">
          <Field label="House type" span={3} hint="Bedrooms and property type, configured in Admin">
            <Select value={attrs.Property_Config_ID} onChange={setAttr("Property_Config_ID")}>
              <option value="">&mdash; optional &mdash;</option>
              {(lookups.propertyConfigs || []).map((c) => (
                <option key={c.Property_Config_ID} value={c.Property_Config_ID}>
                  {c.Code} &mdash; {c.Bedrooms} Bed {typeName(c.Property_Type_ID)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="KVA load">
            <input
              type="number"
              step="0.1"
              min="0"
              value={attrs.KVA_Load}
              onChange={(e) => setAttr("KVA_Load")(e.target.value)}
            />
          </Field>
          <Field label="Heat pump model" span={2}>
            <HeatPumpPicker
              models={lookups.heatPumpModels || []}
              value={attrs.Heat_Pump_Model_ID}
              onChange={setAttr("Heat_Pump_Model_ID")}
            />
          </Field>
          <Field label="Options" span={6}>
            <div className="toggle-row">
              <Toggle checked={attrs.PV} onChange={setAttr("PV")} label="PV" />
              <Toggle
                checked={attrs.Self_Lay_Provider}
                onChange={setAttr("Self_Lay_Provider")}
                label="Self lay provider"
              />
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Add individual plots">
        <div className="inline-add">
          <div className="inline-grow">
            <input
              value={individual}
              placeholder="e.g. 42, 43A, B1 &mdash; separate with commas"
              onChange={(e) => setIndividual(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addIndividual()}
            />
            <p className="hint">Enter plot numbers separated by commas, then press Enter or click Add.</p>
          </div>
          <button className="btn accent" onClick={addIndividual}>
            Add
          </button>
        </div>
      </Section>

      <Section title="Add a range">
        <div className="grid6">
          <Field label="From" span={2}>
            <input
              type="number"
              min="1"
              value={range.from}
              onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
            />
          </Field>
          <Field label="To" span={2}>
            <input
              type="number"
              min="1"
              value={range.to}
              onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))}
            />
          </Field>
          <Field label="Prefix (optional)" span={2} hint="e.g. B gives B1, B2, B3">
            <input
              value={range.prefix}
              onChange={(e) => setRange((p) => ({ ...p, prefix: e.target.value }))}
            />
          </Field>
        </div>
        <button className="btn ghost" onClick={addRange}>
          + Add range
        </button>
      </Section>

      {pending.length > 0 && (
        <Section title="Preview">
          <div className="preview-box">
            <p className="preview-count">
              {fresh.length} new plot{fresh.length === 1 ? "" : "s"} to add
              {dupes.length > 0 && (
                <span className="dupe-note">
                  {dupes.length} duplicate{dupes.length === 1 ? "" : "s"} will be skipped
                </span>
              )}
            </p>
            <div className="chips">
              {pending.map((label) => {
                const dupe = existingSet.has(label);
                return (
                  <span className={dupe ? "chip dupe" : "chip"} key={label}>
                    {label}
                    {!dupe && (
                      <button onClick={() => removePlot(label)} aria-label={`Remove plot ${label}`}>
                        &#10005;
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      <div className="actions">
        {pending.length > 0 && (
          <button className="btn ghost" onClick={() => setPending([])}>
            Clear list
          </button>
        )}
        <button className="btn accent" onClick={save} disabled={saving || !fresh.length}>
          {saving
            ? "Saving\u2026"
            : `Save ${fresh.length} plot${fresh.length === 1 ? "" : "s"} to project`}
        </button>
      </div>
    </div>
  );
}

const CSS = `
.inline-add { display: flex; gap: 8px; align-items: flex-start; }
.inline-grow { flex: 1; min-width: 0; }
.preview-box { border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
.preview-count { margin: 0 0 10px; font-size: 12.5px; font-weight: 700; }
.dupe-note { color: #ef4444; font-size: 11.5px; font-weight: 600; margin-left: 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; max-height: 260px; overflow-y: auto; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px;
  border-radius: 5px; font-size: 12px; font-family: ui-monospace, Menlo, monospace;
  background: var(--accent-light); border: 1px solid #bfdbfe; color: var(--accent);
}
.chip.dupe { background: #fef2f2; border-color: #fca5a5; color: #ef4444; }
.chip button {
  background: none; border: none; cursor: pointer; color: inherit;
  font-size: 10px; padding: 0; line-height: 1;
}
.tab-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 14px;
}
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 68ch; }
`;
