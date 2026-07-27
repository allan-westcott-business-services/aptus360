import { useState, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { bedColour } from "../../lib/bedColours.js";
import { parsePlotRange, MAX_PLOTS } from "./plotRange.js";

/* Add Plots by Range, as the original.

   The range is both a set of plots to create and a set to place — on a
   new site they're the same thing, which is why house type and heat
   source are asked for here rather than in a separate screen. Plots that
   already exist are left as they are. */
export default function AddPlotsModal({
  existing, lookups, developers, contractNumber, utilities, onStart, onClose,
}) {
  const [range, setRange] = useState("");
  const [prefix, setPrefix] = useState(contractNumber ? `${contractNumber}-` : "");
  const [configId, setConfigId] = useState("");
  const [heatId, setHeatId] = useState("");
  const [developerId, setDeveloperId] = useState(
    developers.length === 1 ? String(developers[0].Project_Developer_ID) : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = useMemo(() => parsePlotRange(range), [range]);
  const known = useMemo(() => {
    const m = {};
    existing.forEach((p) => { m[String(p.plot_number)] = p; });
    return m;
  }, [existing]);

  const toCreate = parsed.numbers.filter((n) => !known[n]);
  const toPlace = parsed.numbers.filter((n) => known[n] && !known[n].placed);
  const alreadyPlaced = parsed.numbers.filter((n) => known[n]?.placed);
  const total = toCreate.length + toPlace.length;

  const config = (lookups.propertyConfigs || []).find(
    (c) => String(c.Property_Config_ID) === String(configId)
  );
  const typeName = (id) =>
    (lookups.propertyTypes || []).find((t) => t.Property_Type_ID === id)?.Property_Type ?? "";

  async function start() {
    if (!total) return setError("Nothing to add or place from that range.");
    if (toCreate.length && !configId) {
      return setError(`${toCreate.length} plots would be created — choose a house type for them.`);
    }
    setBusy(true);
    try {
      await onStart({
        numbers: parsed.numbers,
        property_config_id: configId || null,
        heat_source_id: heatId || null,
        developer_id: developerId || null,
        ref_prefix: prefix || null,
      });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="ap-backdrop" onClick={onClose}>
      <div className="ap" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add plots by range">
        <style>{CSS}</style>

        <div className="ap-head">
          <span className="ap-icon">&#8853;</span>
          <h3>Add Plots by Range</h3>
          <button className="ap-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="ap-body">
          {error && <Banner kind="error">{error}</Banner>}

          <div className="fld">
            <label htmlFor="ap-range">Plot range <span className="req">*</span></label>
            <input id="ap-range" className="ap-range" value={range} autoComplete="off"
              placeholder="e.g. 1-50  or  1,2,5-10,22-30"
              onChange={(e) => setRange(e.target.value)} />
            <p className="hint">
              Numbers separated by commas, hyphens for ranges. Up to {MAX_PLOTS} at once.
            </p>
          </div>

          <div className="fld">
            <label htmlFor="ap-prefix">Plot ref prefix <span className="opt">(optional)</span></label>
            <input id="ap-prefix" value={prefix} autoComplete="off"
              placeholder={contractNumber ? `${contractNumber}-…` : "(e.g. AP1045-)"}
              onChange={(e) => setPrefix(e.target.value)} />
            <p className="hint">
              Plot ref becomes <em>prefix</em> + plot number. Leave blank for the number alone.
            </p>
          </div>

          <div className="ap-row">
            <div className="fld">
              <label htmlFor="ap-type">
                House type {toCreate.length > 0 && <span className="req">*</span>}
              </label>
              <select id="ap-type" value={configId} onChange={(e) => setConfigId(e.target.value)}>
                <option value="">&mdash; Select &mdash;</option>
                {(lookups.propertyConfigs || []).map((c) => (
                  <option key={c.Property_Config_ID} value={c.Property_Config_ID}>
                    {c.Code} &mdash; {c.Bedrooms} Bed {typeName(c.Property_Type_ID)}
                  </option>
                ))}
              </select>
              {config && (
                <span className="ap-swatch" style={{
                  background: bedColour(config.Bedrooms).bg,
                  color: bedColour(config.Bedrooms).fg,
                }}>
                  {config.Code}
                </span>
              )}
            </div>

            <div className="fld">
              <label htmlFor="ap-heat">Heating source</label>
              <select id="ap-heat" value={heatId} onChange={(e) => setHeatId(e.target.value)}>
                <option value="">&mdash; None &mdash;</option>
                {(lookups.heatSources || []).map((h) => (
                  <option key={h.Heat_Source_ID} value={h.Heat_Source_ID}>{h.Heat_Source}</option>
                ))}
              </select>
            </div>
          </div>

          {developers.length > 1 && (
            <div className="fld">
              <label htmlFor="ap-dev">Developer</label>
              <select id="ap-dev" value={developerId} onChange={(e) => setDeveloperId(e.target.value)}>
                <option value="">&mdash; None &mdash;</option>
                {developers.map((d) => (
                  <option key={d.Project_Developer_ID} value={d.Project_Developer_ID}>
                    {d.label}
                  </option>
                ))}
              </select>
              <p className="hint">Plot numbers repeat across developers, so this decides whose these are.</p>
            </div>
          )}

          {range.trim() && (
            <div className="ap-preview">
              {total > 0 ? (
                <>
                  <p className="ap-sum">
                    <strong>{total}</strong> plot{total === 1 ? "" : "s"} to place
                    {toCreate.length > 0 && <> &middot; {toCreate.length} newly created</>}
                    {alreadyPlaced.length > 0 && (
                      <span className="ap-note"> &middot; {alreadyPlaced.length} already on the canvas</span>
                    )}
                  </p>
                  <div className="ap-chips">
                    {parsed.numbers.filter((n) => !known[n]?.placed).slice(0, 14).map((n) => (
                      <span key={n} className={known[n] ? "ap-chip" : "ap-chip new"}>{n}</span>
                    ))}
                    {total > 14 && <span className="ap-more">+{total - 14}</span>}
                  </div>
                </>
              ) : (
                <p className="ap-sum bad">Nothing to add or place from that range.</p>
              )}
              {parsed.bad.length > 0 && (
                <p className="ap-sum bad">Couldn&rsquo;t read: {parsed.bad.join(", ")}</p>
              )}
            </div>
          )}

          {utilities.length > 0 && total > 0 && (
            <p className="ap-flow">
              Then two clicks each: where the plot sits, then which side its{" "}
              {utilities.map((u) => u.utility.toLowerCase()).join(", ")} meters go.
            </p>
          )}
        </div>

        <div className="ap-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={busy || !total} onClick={start}>
            {busy ? "Preparing\u2026" : `Add & place ${total || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ap-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.34); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 24px; }
.ap { background: var(--white); border-radius: 14px; width: min(480px, 92vw);
  max-height: 90vh; display: flex; flex-direction: column;
  box-shadow: 0 18px 50px rgba(15,23,42,.32); }
.ap-head { display: flex; align-items: center; gap: 10px; padding: 18px 20px 14px; }
.ap-head h3 { margin: 0; font-size: 16px; font-weight: 700; flex: 1; }
.ap-icon { font-size: 19px; color: var(--accent); }
.ap-x { border: none; background: none; font-size: 22px; cursor: pointer; color: var(--muted);
  line-height: 1; padding: 0 4px; }
.ap-body { padding: 0 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.ap-range { font-size: 14px !important; font-weight: 600; }
.ap-row { display: flex; gap: 12px; }
.ap-row .fld { flex: 1; min-width: 0; }
.opt { font-weight: 400; text-transform: none; color: var(--muted); }
.ap-swatch { display: inline-block; margin-top: 5px; font: 700 11px ui-monospace, Menlo, monospace;
  border-radius: 5px; padding: 2px 8px; }
.ap-preview { border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg); padding: 10px 12px; }
.ap-sum { margin: 0 0 7px; font-size: 12.5px; }
.ap-sum:last-child { margin-bottom: 0; }
.ap-sum.bad { color: var(--warn-text); font-weight: 600; }
.ap-note { color: var(--muted); }
.ap-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.ap-chip { font: 700 10px ui-monospace, Menlo, monospace; border-radius: 4px; padding: 2px 6px;
  background: var(--white); border: 1px solid var(--border); color: var(--muted); }
.ap-chip.new { background: var(--accent-light); border-color: var(--accent); color: var(--accent); }
.ap-more { font-size: 10px; font-weight: 700; color: var(--muted); align-self: center; }
.ap-flow { font-size: 11.5px; color: var(--muted); margin: 0; line-height: 1.5; }
.ap-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px 18px; }
`;
