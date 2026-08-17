import { useState } from "react";
import {
  allowanceOf, allowanceSupplies, allowanceLoad, ALLOWANCE_KEY,
} from "./futureLoad.js";

/* What a span node is asked to allow for.

   ── Two ways, because both are true at different times ──

   Where the mix is known, describing it is better than typing a load:
   twenty three-bed on gas reads the same consumption figures a drawn
   three-bed on gas reads, so the allowance and the real plot size
   identically, and recalibrating that table moves both. It also gives
   gas and electric from one description, where a typed number gives
   one.

   Where the mix is not known — which on a phase nobody has designed is
   most of the time — a figure is the honest answer, and refusing to
   take one would mean the allowance never gets recorded at all.

   ── Both at once is allowed, and says which won ──

   Somebody may describe what they expect and then override the gas
   figure because the transporter has asked for something. The typed
   number wins for its own utility and the panel says so, rather than
   silently using one and displaying the other.

   ── Water takes no figure ──

   Water mains size on how many plots lie beyond a point, not on a
   load. The count from a breakdown is its whole contribution, and a kW
   box against water would be a number nothing reads. */

const BEDROOMS = [1, 2, 3, 4, 5];

export default function FutureAllowance({
  value, consumption = [], heatSources = [], onChange,
}) {
  const [open, setOpen] = useState(false);

  const current = allowanceOf({ Attributes: { [ALLOWANCE_KEY]: value } });
  const rows = value?.rows ?? [];
  const manual = value?.manual ?? {};

  const write = (patch) => onChange({ rows, manual, note: value?.note ?? null, ...patch });

  const setRow = (i, patch) => write({
    rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
  });

  const supplies = allowanceSupplies(current);
  const gas = allowanceLoad(current, "gas", consumption);
  const elec = allowanceLoad(current, "electric", consumption);

  /* Rows whose description has no consumption row behind it. Said
     rather than counted as nothing: a missing figure is a table
     somebody has to fill in, and a silent zero would size the main for
     fewer plots than were asked for. */
  const missing = [...gas.unmatched, ...elec.unmatched];

  return (
    <div className="fa">
      <style>{CSS}</style>

      <div className="fa-head">
        <label>Future expansion</label>
        <button type="button" className="fa-toggle"
          onClick={() => setOpen((o) => !o)}>
          {open ? "Done" : current ? "Change" : "Allow for future plots"}
        </button>
      </div>

      {/* What it comes to, whether or not the editor is open — a node
          carrying an allowance is materially different from one that is
          not, and it should say so without being opened. */}
      {current && (
        <p className="fa-sum">
          {supplies
            ? `${supplies} future plot${supplies === 1 ? "" : "s"}`
            : "future load"}
          {gas.value ? ` \u00b7 ${gas.value} kW gas` : ""}
          {elec.value ? ` \u00b7 ${elec.value} kVA electric` : ""}
          {gas.fromManual || elec.fromManual ? " (typed)" : ""}
        </p>
      )}

      {open && (
        <div className="fa-body">
          <p className="fa-why">
            Sized for, not built. The main feeding this node and
            everything back to the point of connection is sized to carry
            these as well &mdash; they do not appear on the bill.
          </p>

          {rows.map((r, i) => (
            <div className="fa-row" key={i}>
              <input type="number" min="1" className="fa-n"
                aria-label="How many"
                value={r.count ?? ""}
                onChange={(e) => setRow(i, { count: Number(e.target.value) || 0 })} />
              <span className="fa-x">&times;</span>
              <select value={r.bedrooms ?? ""} aria-label="Bedrooms"
                onChange={(e) => setRow(i, { bedrooms: Number(e.target.value) })}>
                <option value="">Bedrooms</option>
                {BEDROOMS.map((b) => (
                  <option key={b} value={b}>{`${b} bed`}</option>
                ))}
              </select>
              <select value={r.heatSourceId ?? ""} aria-label="Heat source"
                onChange={(e) => setRow(i, { heatSourceId: Number(e.target.value) })}>
                <option value="">Heat source</option>
                {heatSources.map((h) => (
                  <option key={h.Heat_Source_ID} value={h.Heat_Source_ID}>
                    {h.Heat_Source}
                  </option>
                ))}
              </select>
              <button type="button" className="fa-del"
                onClick={() => write({ rows: rows.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          ))}

          <button type="button" className="fa-add"
            onClick={() => write({ rows: [...rows, { count: 1 }] })}>
            + Add a house type
          </button>

          {!!missing.length && (
            <p className="fa-warn">
              {`${missing.length} of these have no consumption figure set, `}
              {"so they are sized as nothing. Set them in Admin \u203a House "}
              {"Type Consumption, or type a load below instead."}
            </p>
          )}

          {/* The typed figures. Under the breakdown, because describing
              is the better answer where it is available and this is the
              fallback rather than the first thing offered. */}
          <div className="fa-manual">
            <label className="fa-fld">
              <span>Gas kW</span>
              <input type="number" min="0" step="0.1"
                value={manual.gas ?? ""}
                onChange={(e) => write({
                  manual: { ...manual, gas: Number(e.target.value) || 0 },
                })} />
            </label>
            <label className="fa-fld">
              <span>Electric kVA</span>
              <input type="number" min="0" step="0.1"
                value={manual.electric ?? ""}
                onChange={(e) => write({
                  manual: { ...manual, electric: Number(e.target.value) || 0 },
                })} />
            </label>
            <p className="fa-note">
              {/* Said, because a breakdown and a figure together look
                  like a contradiction until somebody knows which one
                  the sizing used. */}
              A typed figure is used instead of the breakdown for that
              utility. Water needs none &mdash; it sizes on how many
              plots lie beyond, which the breakdown gives.
            </p>
          </div>

          {current && (
            <button type="button" className="fa-clear"
              onClick={() => onChange(null)}>
              Remove the allowance
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const CSS = `
.fa { margin: 10px 0 0; padding: 9px 0 0; border-top: 1px solid var(--border); }
.fa-head { display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; }
.fa-head label { font: 700 9.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .05em; }
.fa-toggle { background: none; border: none; cursor: pointer;
  font: 600 11px inherit; color: var(--accent); }
/* What it comes to, shown whether or not the editor is open. */
.fa-sum { margin: 4px 0 0; font-size: 11.5px; font-weight: 700; }
.fa-body { margin-top: 8px; }
.fa-why { margin: 0 0 8px; font-size: 11px; color: var(--muted); line-height: 1.6; }
.fa-row { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; }
.fa-n { width: 56px; }
.fa-x { color: var(--muted); font-size: 11px; }
.fa-row select, .fa-row input { font: 500 12px inherit; padding: 4px 6px;
  border: 1px solid var(--border); border-radius: 6px; }
.fa-row select { flex: 1; min-width: 0; }
.fa-del, .fa-add, .fa-clear { background: none; border: none; cursor: pointer;
  font: 600 11px inherit; color: var(--muted); padding: 2px 4px; }
.fa-del:hover, .fa-clear:hover { color: #b91c1c; }
.fa-add { color: var(--accent); }
/* A described plot with no consumption figure behind it. Amber: the
   allowance is fine, the table is missing a row. */
.fa-warn { margin: 6px 0 0; padding: 7px 9px; border-radius: 7px;
  background: #fef3e2; border: 1px solid #f2d675; font-size: 11px;
  color: #7c4a03; line-height: 1.6; }
.fa-manual { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;
  padding-top: 8px; border-top: 1px dashed var(--border); }
.fa-fld { display: flex; flex-direction: column; gap: 2px; }
.fa-fld > span { font: 700 9px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .05em; }
.fa-fld input { width: 90px; font: 500 12px inherit; padding: 4px 6px;
  border: 1px solid var(--border); border-radius: 6px; }
.fa-note { flex: 1 1 100%; margin: 2px 0 0; font-size: 10.5px;
  color: var(--muted); line-height: 1.6; }
`;
