import { useState, useMemo, useRef, useEffect } from "react";
import { heatPumpLabel } from "../lib/heatPump.js";

/* Choosing one heat pump from 1,255.

   A flat dropdown of that length is a scroll bar, so there are two ways
   in and they suit different starting points.

   Someone holding a datasheet knows the register number and wants to
   type it. Someone specifying a scheme knows the make, then narrows.
   Neither is a fallback for the other, so both are offered at once
   rather than behind a mode switch.

   The third step — model reference — appears only when it changes the
   answer. 150 make-and-model pairs have more than one register entry and
   91 of those differ in load, so for those it is the whole point; for the
   rest it would be a select with one option in it. */

export default function HeatPumpPicker({ models = [], value, onChange, allowNone = true }) {
  const chosen = models.find((m) => String(m.Heat_Pump_Model_ID) === String(value)) || null;

  const [reg, setReg] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const regRef = useRef(null);

  /* Opening on something already chosen should show where it sits, not a
     blank set of dropdowns. */
  useEffect(() => {
    if (chosen) { setMake(chosen.Make || ""); setModel(chosen.Model || ""); }
  }, [chosen?.Heat_Pump_Model_ID]);   // eslint-disable-line react-hooks/exhaustive-deps

  const makes = useMemo(
    () => [...new Set(models.map((m) => m.Make).filter(Boolean))].sort(),
    [models]
  );
  const modelsOf = useMemo(
    () => [...new Set(models.filter((m) => m.Make === make).map((m) => m.Model))].sort(),
    [models, make]
  );
  /* Sorted by load, not by reference. Daikin list 234 units under
     "Altherma" with 25 distinct loads between them, and nobody knows
     which reference they want — they know what the supply has to carry.
     Ordering by kVA turns an unreadable list into a scale. */
  const entries = useMemo(
    () => models
      .filter((m) => m.Make === make && m.Model === model)
      .sort((a, b) => (Number(a.Rated_Power_kVA) || 0) - (Number(b.Rated_Power_kVA) || 0)),
    [models, make, model]
  );

  /* Matches on register number first, then anywhere in the name — someone
     half-remembering "4101" or "aroTHERM" gets the same box. */
  const hits = useMemo(() => {
    const q = reg.trim().toLowerCase();
    if (q.length < 2) return [];
    const byReg = models.filter((m) => (m.Register_Number || "").toLowerCase().includes(q));
    if (byReg.length) return byReg.slice(0, 8);
    return models.filter((m) =>
      `${m.Make} ${m.Model} ${m.Model_Reference}`.toLowerCase().includes(q)).slice(0, 8);
  }, [models, reg]);

  const pick = (m) => {
    onChange(m ? String(m.Heat_Pump_Model_ID) : "");
    setReg("");
  };

  return (
    <div className="hpp">
      <style>{CSS}</style>

      {chosen ? (
        <div className="hpp-has">
          <span className="hpp-reg">{chosen.Register_Number}</span>
          <span className="hpp-name">{heatPumpLabel(chosen)}</span>
          {allowNone && (
            <button className="hpp-x" onClick={() => pick(null)} aria-label="Clear">&times;</button>
          )}
        </div>
      ) : (
        <>
          <div className="hpp-search">
            <input ref={regRef} value={reg} placeholder="Register number, or any part of the name"
              aria-label="Find a heat pump by register number"
              onChange={(e) => setReg(e.target.value)} />
            {hits.length > 0 && (
              <ul className="hpp-hits" role="listbox">
                {hits.map((m) => (
                  <li key={m.Heat_Pump_Model_ID}>
                    <button onClick={() => pick(m)}>
                      <span className="hpp-reg">{m.Register_Number}</span>
                      {heatPumpLabel(m)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {reg.trim().length >= 2 && hits.length === 0 && (
              <p className="hpp-none">Nothing matches that.</p>
            )}
          </div>

          <p className="hpp-or">or narrow it down</p>

          <div className="hpp-cascade">
            <select value={make} aria-label="Make"
              onChange={(e) => { setMake(e.target.value); setModel(""); }}>
              <option value="">Make&hellip;</option>
              {makes.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>

            <select value={model} disabled={!make} aria-label="Model"
              onChange={(e) => {
                const v = e.target.value;
                setModel(v);
                /* One entry under this name, so there is nothing to
                   disambiguate and the third step would be a formality. */
                const only = models.filter((m) => m.Make === make && m.Model === v);
                if (only.length === 1) pick(only[0]);
              }}>
              <option value="">{make ? "Model\u2026" : "\u2014"}</option>
              {modelsOf.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>

            {entries.length > 1 && (
              <select value="" aria-label="Model reference"
                onChange={(e) => {
                  const m = entries.find((x) => String(x.Heat_Pump_Model_ID) === e.target.value);
                  if (m) pick(m);
                }}>
                <option value="">
                  {entries.length} entries, by load&hellip;
                </option>
                {entries.map((m) => (
                  <option key={m.Heat_Pump_Model_ID} value={m.Heat_Pump_Model_ID}>
                    {Number(m.Rated_Power_kVA)} kVA &middot; {m.Model_Reference}
                  </option>
                ))}
              </select>
            )}
          </div>

          {entries.length > 1 && (
            <p className="hpp-note">
              {entries.length} entries under this name
              {new Set(entries.map((m) => m.Rated_Power_kVA)).size > 1
                && `, from ${Number(entries[0].Rated_Power_kVA)} to `
                   + `${Number(entries[entries.length - 1].Rated_Power_kVA)} kVA`}.
              The reference is what tells them apart.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.hpp { display: flex; flex-direction: column; gap: 6px; min-width: 250px; }
.hpp-has { display: flex; align-items: center; gap: 7px; border: 1px solid var(--accent);
  background: var(--accent-light); border-radius: 7px; padding: 5px 8px; font-size: 12px; }
.hpp-name { flex: 1; font-weight: 600; }
.hpp-reg { font: 700 10.5px ui-monospace, Menlo, monospace; background: var(--white);
  border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; }
.hpp-x { background: none; border: none; cursor: pointer; font-size: 15px; color: var(--muted);
  line-height: 1; }
.hpp-search { position: relative; }
.hpp-search input { width: 100%; }
.hpp-hits { position: absolute; z-index: 40; left: 0; right: 0; top: 100%; margin: 2px 0 0;
  padding: 4px; list-style: none; background: var(--white); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 8px 22px rgba(15,23,42,.16); max-height: 240px;
  overflow-y: auto; }
.hpp-hits button { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left;
  background: none; border: none; border-radius: 5px; cursor: pointer; padding: 5px 7px;
  font: 500 12px inherit; }
.hpp-hits button:hover { background: var(--bg); }
.hpp-none { margin: 3px 0 0; font-size: 11px; color: var(--muted); }
.hpp-or { margin: 0; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); }
.hpp-cascade { display: flex; flex-direction: column; gap: 5px; }
.hpp-note { margin: 0; font-size: 10.5px; color: #92400e; }
`;
