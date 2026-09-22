import { useState, useEffect, useMemo } from "react";
import Select from "../../components/Select.jsx";
import Toggle from "../../components/Toggle.jsx";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listPlots, createPlots } from "../../api/plots.js";
import { sourceTakesHeatPump } from "../../lib/heatPump.js";
import { checkBatch } from "./plotRanges.js";

/* ── Adding plots, a house type per row ──

   One row per house type: its prefix, its plot numbers typed as ranges
   and single numbers ("1-10, 17, 20, 24, 31-40"), its heat source and
   PV. ADD HOUSE TYPE adds a row. The count beside each field and the
   total underneath update as you type.

   It replaced a form that took one house type at a time, with a From
   and To box and a separate list for single numbers, and a preview
   that silently dropped repeats and plots already on the project. Here
   nothing is dropped: a plot typed twice in one row, a plot under two
   house types, or a plot already on the project is named under its row
   and the batch will not save until it is sorted out. The rules are in
   plotRanges.js.

   Self-lay is not asked. It is set per utility on the Plots tab, against
   the plots this creates — a plot can be self-lay for water and ours for
   electric, and one tick here could not say which. */

let rowSeq = 0;
const newRow = (heatSourceId = "") => ({
  key: ++rowSeq, configId: "", prefix: "", text: "", heatSourceId: heatSourceId || "", pv: false,
});

export default function AddPlotsForm({
  projectId, projectRef = "", existingNumbers = null,
  defaultHeatSourceId = null, defaultHeatPumpModelId = null, onDone,
}) {
  const [lookups, setLookups] = useState(null);
  const [existing, setExisting] = useState([]);
  const [rows, setRows] = useState([newRow(defaultHeatSourceId)]);
  const [expected, setExpected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);

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
    return () => { live = false; };
  }, [projectId]);

  const typeName = (id) =>
    (lookups?.propertyTypes || []).find((t) => t.Property_Type_ID === id)?.Property_Type ?? "";
  const configName = (id) => {
    const c = (lookups?.propertyConfigs || []).find((x) => String(x.Property_Config_ID) === String(id));
    return c ? `${c.Bedrooms} Bed ${typeName(c.Property_Type_ID)}` : "";
  };

  /* Every row checked against every other and against the project,
     on every keystroke. Cheap: a few hundred labels. */
  const check = useMemo(() => checkBatch(
    rows.map((r, i) => ({
      key: r.key, prefix: r.prefix, text: r.text,
      name: configName(r.configId) || `row ${i + 1}`,
    })),
    existing,
  ), [rows, existing, lookups]);
  const resultOf = (key) => check.rows.find((x) => x.key === key);

  const setRow = (key, patch) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /* A row with nothing in it is ignored rather than refused: the form
     starts with one, and ADD HOUSE TYPE may leave a spare. A row with
     plots but no house type is refused — a plot with no type has no
     load, and the levels check would read it as nothing. */
  const unnamed = rows.filter((r) => resultOf(r.key)?.count && !r.configId);
  const canSave = check.ok && !unnamed.length && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const payload = [];
      for (const r of rows) {
        const res = resultOf(r.key);
        if (!res?.count) continue;
        /* The project's heat pump model where this row's heat source
           takes one — the row has no model field of its own, and a heat
           pump plot with no model has no load figure. Changeable per
           plot on the Plots tab. */
        const pump = r.heatSourceId
          && sourceTakesHeatPump(r.heatSourceId, lookups.heatSources || [])
          ? (defaultHeatPumpModelId ? Number(defaultHeatPumpModelId) : null) : null;
        for (const label of res.plots) {
          payload.push({
            Plot_Number: label,
            Property_Config_ID: Number(r.configId),
            Heat_Source_ID: r.heatSourceId ? Number(r.heatSourceId) : null,
            Heat_Pump_Model_ID: pump,
            PV: !!r.pv,
            KVA_Load: null,
          });
        }
      }
      const res = await createPlots(projectId, payload, projectRef);
      /* The plots are in either way. What may not be is their utility
         rows, and a plot with none takes part in nothing — so it is
         said, not swallowed. */
      if (res?.utility_error) {
        setError(`${payload.length} plot(s) added, but their utilities were not: `
          + `${res.utility_error}. Generate connections on the Plots tab to fill them in.`);
      }
      setExisting((p) => [...p, ...payload.map((x) => x.Plot_Number)]);
      setDone(payload.length);
      setRows([newRow(defaultHeatSourceId)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !lookups) return <Banner kind="error">Couldn&rsquo;t load: {error}</Banner>;
  if (!lookups) return <div className="loading">Loading&hellip;</div>;

  const expectedN = Number(expected) || 0;

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>Add plots</h3>
          <p className="tab-sub">
            A row per house type. Type plot numbers as ranges and single numbers:
            <code> 1-20, 24, 26, 48-52</code>.
            {existing.length > 0 && ` ${existing.length} plot${existing.length === 1 ? "" : "s"} already on this project.`}
          </p>
        </div>
        <div className="ap-head-actions">
          <button className="btn accent" onClick={() => setRows((rs) => [...rs, newRow(defaultHeatSourceId)])}>
            Add house type
          </button>
          {onDone && (
            <button className="btn ghost" onClick={onDone}>&larr; Back to plots</button>
          )}
        </div>
      </div>

      {done > 0 && (
        <Banner kind="ok">
          {done} plot{done === 1 ? "" : "s"} added. Add more below, or go back to the list.
        </Banner>
      )}
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      <div className="ap-grid" role="table">
        <div className="ap-row ap-headrow" role="row">
          <span>House type</span>
          <span>Prefix (optional)</span>
          <span>Plots</span>
          <span className="ap-n" title="Plots in this row">&Sigma;</span>
          <span>Heat source</span>
          <span className="ap-c">PV</span>
          <span />
        </div>

        {rows.map((r) => {
          const res = resultOf(r.key) || { count: 0, problems: [] };
          const troubled = res.problems.length > 0;
          return (
            <div key={r.key} className="ap-block">
              <div className="ap-row" role="row">
                <Select value={r.configId} onChange={(v) => setRow(r.key, { configId: v })}
                  aria-label="House type">
                  <option value="">&mdash; house type &mdash;</option>
                  {(lookups.propertyConfigs || []).map((c) => (
                    <option key={c.Property_Config_ID} value={c.Property_Config_ID}>
                      {c.Bedrooms} Bed {typeName(c.Property_Type_ID)}
                    </option>
                  ))}
                </Select>
                <input value={r.prefix} aria-label="Prefix"
                  placeholder="e.g. K"
                  onChange={(e) => setRow(r.key, { prefix: e.target.value.replace(/[^A-Za-z0-9]/g, "") })} />
                <input value={r.text} aria-label="Plot numbers"
                  className={troubled ? "ap-bad" : ""}
                  placeholder="1-10, 17, 20, 24, 31-40"
                  onChange={(e) => setRow(r.key, { text: e.target.value })} />
                <span className="ap-n">{res.count || ""}</span>
                <Select value={r.heatSourceId} onChange={(v) => setRow(r.key, { heatSourceId: v })}
                  aria-label="Heat source">
                  <option value="">&mdash;</option>
                  {(lookups.heatSources || []).map((h) => (
                    <option key={h.Heat_Source_ID} value={h.Heat_Source_ID}>{h.Heat_Source}</option>
                  ))}
                </Select>
                <span className="ap-c">
                  <Toggle checked={r.pv} onChange={(v) => setRow(r.key, { pv: v })} />
                </span>
                <span className="ap-c">
                  {rows.length > 1 && (
                    <button type="button" className="ap-x" title="Remove this row"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>&times;</button>
                  )}
                </span>
              </div>
              {(troubled || (res.count > 0 && !r.configId)) && (
                <ul className="ap-problems">
                  {res.count > 0 && !r.configId && <li>Choose a house type for these plots.</li>}
                  {res.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="ap-foot">
        <p className="ap-total">
          <strong>{check.total}</strong>
          {expectedN > 0 ? <> of <strong>{expectedN}</strong></> : null}
          {" "}plot{check.total === 1 && !expectedN ? "" : "s"} entered
          {expectedN > 0 && check.total + existing.length !== expectedN && (
            <span className="ap-muted">
              {" "}&middot; {Math.abs(expectedN - check.total - existing.length)}{" "}
              {expectedN > check.total + existing.length ? "still to enter" : "more than expected"}
              {existing.length > 0 ? ", counting those already on the project" : ""}
            </span>
          )}
        </p>
        {/* For the running check only — nothing on a project records how
            many plots a scheme is meant to have, so it is not saved. */}
        <label className="ap-expected">
          Plots on the scheme
          <input type="number" min="0" value={expected} placeholder="optional"
            onChange={(e) => setExpected(e.target.value)} />
        </label>
        <button className="btn accent" disabled={!canSave} onClick={save}>
          {saving ? "Adding…" : check.total ? `Add ${check.total} plot${check.total === 1 ? "" : "s"}` : "Add plots"}
        </button>
      </div>
    </div>
  );
}

const CSS = `
.ap-head-actions { display: flex; gap: 8px; align-items: flex-start; }
.ap-grid { display: grid; gap: 4px; margin-top: 10px; }
.ap-row { display: grid; grid-template-columns: 2.2fr 1fr 3.6fr 48px 1.8fr 64px 28px;
  gap: 10px; align-items: center; }
.ap-headrow { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
  color: var(--muted); padding: 0 2px; }
.ap-n { text-align: center; font-variant-numeric: tabular-nums; font-weight: 600; }
.ap-c { display: flex; justify-content: center; }
.ap-bad { border-color: #dc2626 !important; box-shadow: 0 0 0 1px #dc2626 inset; }
.ap-problems { margin: 2px 0 6px; padding: 0 0 0 18px; color: #b91c1c; font-size: 13px; }
.ap-problems li { margin: 1px 0; }
.ap-x { border: 0; background: none; font-size: 20px; line-height: 1; color: var(--muted); cursor: pointer; }
.ap-x:hover { color: #b91c1c; }
.ap-foot { display: flex; align-items: center; gap: 16px; margin-top: 18px; flex-wrap: wrap; }
.ap-total { margin: 0; font-size: 18px; flex: 1; }
.ap-muted { color: var(--muted); font-size: 13px; }
.ap-expected { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.ap-expected input { width: 90px; }
@media (max-width: 900px) {
  .ap-row { grid-template-columns: 1fr 1fr; }
  .ap-headrow { display: none; }
}
`;
