import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

/* Water pipe sizes, and whose rule each one is.

   ── Why this is not the generic editor ──

   Everything else about a size rule — the diameter, the plots it
   carries, the order — is four fields the generic editor handles
   perfectly well. The operators are not: a rule may name any number of
   them, and the generic editor can render a column that points at one
   thing and has no way to render one that points at several.

   Master and detail, as Teams does for crafts and regions. The list is
   the rules; the panel is one rule's numbers and a row of checkboxes.

   ── No operators means everybody ──

   The thing this screen has to make obvious, because it is the default
   and it is invisible: a rule with nothing ticked is the house standard
   and applies to every project. It is stated on the rule in the list, on
   the panel, and in the checkbox section's own heading, because a
   blank list of ticks otherwise reads as "not set up yet".

   ── Most specific wins, per diameter ──

   Where a project's operator has their own 63mm rule they get it, and
   still inherit the 90 and the 125 from the standard. Said here as well
   as in the code, since this is the screen where somebody decides
   whether to add a rule or edit one. */

const blank = () => ({
  Diameter_mm: "", Size_Label: "", Max_Meters: "",
  Display_Order: 100, Is_Active: true,
});

export default function WaterPipeSizesAdmin() {
  const [sizes, setSizes] = useState([]);
  const [links, setLinks] = useState([]);
  const [idnos, setIdnos] = useState([]);
  const [dnos, setDnos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blank());

  async function load() {
    try {
      const [w, o, i, d] = await Promise.all([
        adminList("Water_Pipe_Size"),
        adminList("Water_Pipe_Size_Operator").catch(() => ({ rows: [] })),
        adminList("IDNO"),
        adminList("DNO").catch(() => ({ rows: [] })),
      ]);
      setSizes(w.rows || []);
      setLinks(o.rows || []);
      setIdnos(i.rows || []);
      setDnos((d.rows || []).filter((x) => x.Is_Active !== false));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const current = sizes.find((s) =>
    Number(s.Water_Pipe_Size_ID) === Number(selected)) || null;

  /* Sorted by what they carry rather than by diameter, which is the
     order the sizing reads them in — so the list on screen is the list
     the build walks. */
  const ordered = useMemo(() => [...sizes].sort((a, b) =>
    Number(a.Max_Meters) - Number(b.Max_Meters)
    || Number(a.Diameter_mm) - Number(b.Diameter_mm)), [sizes]);

  const linksFor = (id) => links.filter((l) =>
    Number(l.Water_Pipe_Size_ID) === Number(id));

  const nameOf = (l) => (l.IDNO_ID != null
    ? idnos.find((x) => Number(x.IDNO_ID) === Number(l.IDNO_ID))?.IDNO_Name
    : dnos.find((x) => Number(x.DNO_ID) === Number(l.DNO_ID))?.DNO_Name)
    ?? "unknown operator";

  const labelOf = (s) => s.Size_Label || `${Number(s.Diameter_mm)}mm`;

  /* ── Ticking an operator ──

     Written straight through rather than gathered and saved: one
     checkbox is one row, and a Save button over a grid of them invites
     changes that are lost by navigating away. */
  async function toggle(field, value) {
    if (!current) return;
    const key = `${field}:${value}`;
    const held = links.find((l) =>
      Number(l.Water_Pipe_Size_ID) === Number(current.Water_Pipe_Size_ID)
      && Number(l[field]) === Number(value));
    setBusy(key);
    try {
      if (held) {
        await adminDelete("Water_Pipe_Size_Operator", held.Water_Pipe_Size_Operator_ID);
        setLinks((xs) => xs.filter((x) =>
          x.Water_Pipe_Size_Operator_ID !== held.Water_Pipe_Size_Operator_ID));
      } else {
        const made = await adminCreate("Water_Pipe_Size_Operator", {
          Water_Pipe_Size_ID: current.Water_Pipe_Size_ID, [field]: value,
        });
        setLinks((xs) => [...xs, made]);
      }
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function saveDetails(changes) {
    if (!current) return;
    setBusy("details");
    try {
      await adminUpdate("Water_Pipe_Size", current.Water_Pipe_Size_ID, changes);
      setSizes((xs) => xs.map((x) =>
        Number(x.Water_Pipe_Size_ID) === Number(current.Water_Pipe_Size_ID)
          ? { ...x, ...changes } : x));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function addRule() {
    if (!draft.Diameter_mm || !draft.Max_Meters) {
      return setError("A rule needs a diameter and a maximum number of meters.");
    }
    setBusy("add");
    try {
      const made = await adminCreate("Water_Pipe_Size", {
        ...draft,
        Diameter_mm: Number(draft.Diameter_mm),
        Max_Meters: Number(draft.Max_Meters),
        Display_Order: Number(draft.Display_Order) || 100,
      });
      setSizes((xs) => [...xs, made]);
      setSelected(made.Water_Pipe_Size_ID);
      setAdding(false);
      setDraft(blank());
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function removeRule(s) {
    if (!window.confirm(`Delete the ${labelOf(s)} rule?`
      + "\n\nAny drawn pipe keeps the size already written on it.")) return;
    setBusy(`del:${s.Water_Pipe_Size_ID}`);
    try {
      await adminDelete("Water_Pipe_Size", s.Water_Pipe_Size_ID);
      setSizes((xs) => xs.filter((x) =>
        Number(x.Water_Pipe_Size_ID) !== Number(s.Water_Pipe_Size_ID)));
      if (Number(selected) === Number(s.Water_Pipe_Size_ID)) setSelected(null);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  if (loading) return <p className="wp-empty">Loading&hellip;</p>;

  return (
    <div>
      <style>{CSS}</style>
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      <div className="wp-head">
        <h3>Water Pipe Sizes</h3>
        <p className="wp-sub">
          A pipe is sized by counting the water meters beyond it and taking the
          smallest rule that carries them. A rule with no operators ticked is the
          standard and applies everywhere; one that names an operator is used for
          them instead, for that diameter alone.
        </p>
      </div>

      <div className="wp-split">
        <div className="wp-list">
          <div className="wp-list-head">
            <button className="btn accent sm" onClick={() => { setAdding(true); setSelected(null); }}>
              + Rule
            </button>
          </div>

          {adding && (
            <div className="wp-new">
              <input placeholder="Diameter, e.g. 90" inputMode="decimal"
                value={draft.Diameter_mm}
                onChange={(e) => setDraft((d) => ({ ...d, Diameter_mm: e.target.value }))} />
              <input placeholder="Label (optional)"
                value={draft.Size_Label}
                onChange={(e) => setDraft((d) => ({ ...d, Size_Label: e.target.value }))} />
              <input placeholder="Max water meters" inputMode="numeric"
                value={draft.Max_Meters}
                onChange={(e) => setDraft((d) => ({ ...d, Max_Meters: e.target.value }))} />
              <div className="wp-new-act">
                <button className="btn accent sm" disabled={busy === "add"} onClick={addRule}>
                  Add
                </button>
                <button className="btn ghost sm"
                  onClick={() => { setAdding(false); setDraft(blank()); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!ordered.length && <p className="wp-none">No rules yet.</p>}
          {ordered.map((s) => {
            const mine = linksFor(s.Water_Pipe_Size_ID);
            return (
              <button key={s.Water_Pipe_Size_ID}
                className={Number(selected) === Number(s.Water_Pipe_Size_ID)
                  ? "wp-item on" : "wp-item"}
                onClick={() => { setSelected(s.Water_Pipe_Size_ID); setAdding(false); }}>
                <span className="wp-item-name">
                  {labelOf(s)}
                  {s.Is_Active === false && <span className="wp-off">INACTIVE</span>}
                </span>
                <span className="wp-item-meta">
                  up to {s.Max_Meters} plots
                  {" \u00b7 "}
                  {mine.length ? `${mine.length} operator(s)` : "all operators"}
                </span>
              </button>
            );
          })}
        </div>

        {!current ? (
          <p className="wp-empty">Pick a rule, or add one.</p>
        ) : (
          <div>
            <div className="wp-detail-head">
              <h3>{labelOf(current)}</h3>
              <p className="wp-sub">
                Carries up to {current.Max_Meters} water meters
                {linksFor(current.Water_Pipe_Size_ID).length
                  ? ` for ${linksFor(current.Water_Pipe_Size_ID).map(nameOf).join(", ")}.`
                  : " on any project \u2014 no operator is named, so this is the standard."}
              </p>
            </div>

            <div className="wp-fields">
              <label>
                <span>Diameter (mm)</span>
                <input defaultValue={current.Diameter_mm} inputMode="decimal"
                  key={`d${current.Water_Pipe_Size_ID}`}
                  onBlur={(e) => Number(e.target.value) !== Number(current.Diameter_mm)
                    && saveDetails({ Diameter_mm: Number(e.target.value) })} />
              </label>
              <label>
                <span>Label</span>
                <input defaultValue={current.Size_Label ?? ""}
                  key={`l${current.Water_Pipe_Size_ID}`}
                  placeholder={`${Number(current.Diameter_mm)}mm`}
                  onBlur={(e) => e.target.value !== (current.Size_Label ?? "")
                    && saveDetails({ Size_Label: e.target.value || null })} />
              </label>
              <label>
                <span>Max water meters</span>
                <input defaultValue={current.Max_Meters} inputMode="numeric"
                  key={`m${current.Water_Pipe_Size_ID}`}
                  onBlur={(e) => Number(e.target.value) !== Number(current.Max_Meters)
                    && saveDetails({ Max_Meters: Number(e.target.value) })} />
              </label>
              <label>
                <span>Order</span>
                <input defaultValue={current.Display_Order ?? 100} inputMode="numeric"
                  key={`o${current.Water_Pipe_Size_ID}`}
                  onBlur={(e) => Number(e.target.value) !== Number(current.Display_Order)
                    && saveDetails({ Display_Order: Number(e.target.value) })} />
              </label>
              <label className="wp-check">
                <input type="checkbox" checked={current.Is_Active !== false}
                  onChange={(e) => saveDetails({ Is_Active: e.target.checked })} />
                <span>Active</span>
              </label>
            </div>

            <div className="wp-ops">
              <h4>
                Applies to
                <span className="wp-ops-note">
                  {linksFor(current.Water_Pipe_Size_ID).length
                    ? "only the operators ticked"
                    : "every operator \u2014 tick some to make this rule theirs alone"}
                </span>
              </h4>

              <p className="wp-group">IDNO / NAV</p>
              <div className="wp-grid">
                {!idnos.length && <p className="wp-none">None configured.</p>}
                {idnos.map((o) => {
                  const on = !!links.find((l) =>
                    Number(l.Water_Pipe_Size_ID) === Number(current.Water_Pipe_Size_ID)
                    && Number(l.IDNO_ID) === Number(o.IDNO_ID));
                  return (
                    <label key={`i${o.IDNO_ID}`} className={on ? "wp-op on" : "wp-op"}>
                      <input type="checkbox" checked={on}
                        disabled={busy === `IDNO_ID:${o.IDNO_ID}`}
                        onChange={() => toggle("IDNO_ID", o.IDNO_ID)} />
                      <span>{o.IDNO_Name}</span>
                    </label>
                  );
                })}
              </div>

              <p className="wp-group">DNO</p>
              <div className="wp-grid">
                {!dnos.length && <p className="wp-none">None configured.</p>}
                {dnos.map((o) => {
                  const on = !!links.find((l) =>
                    Number(l.Water_Pipe_Size_ID) === Number(current.Water_Pipe_Size_ID)
                    && Number(l.DNO_ID) === Number(o.DNO_ID));
                  return (
                    <label key={`d${o.DNO_ID}`} className={on ? "wp-op on" : "wp-op"}>
                      <input type="checkbox" checked={on}
                        disabled={busy === `DNO_ID:${o.DNO_ID}`}
                        onChange={() => toggle("DNO_ID", o.DNO_ID)} />
                      <span>{o.DNO_Name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="wp-foot">
              <button className="btn delete sm"
                disabled={busy === `del:${current.Water_Pipe_Size_ID}`}
                onClick={() => removeRule(current)}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.wp-head { margin-bottom: 14px; }
.wp-head h3 { margin: 0; font-size: 16px; }
.wp-sub { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); max-width: 70ch; }
.wp-split { display: grid; grid-template-columns: 260px 1fr; gap: 18px; }
.wp-list { border-right: 1px solid var(--border); padding-right: 16px; }
.wp-list-head { margin-bottom: 10px; }
.wp-new { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;
  padding: 10px; background: var(--bg); border-radius: 8px; }
.wp-new input { font: 500 12px inherit; padding: 6px 9px;
  border: 1px solid var(--border); border-radius: 6px; }
.wp-new-act { display: flex; gap: 6px; }
.wp-item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  width: 100%; background: none; border: none; cursor: pointer; text-align: left;
  padding: 7px 9px; border-radius: 7px; }
.wp-item:hover { background: var(--bg); }
.wp-item.on { background: #eff6ff; }
.wp-item-name { font: 600 12.5px inherit; }
.wp-item-meta { font-size: 10.5px; color: var(--muted); }
.wp-off { font-size: 9.5px; font-weight: 700; color: #b91c1c; margin-left: 6px; }
.wp-none { font-size: 12px; color: var(--muted); margin: 8px 0; }
.wp-empty { color: var(--muted); font-size: 13px; padding: 40px 0; text-align: center; }
.wp-detail-head { padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.wp-detail-head h3 { margin: 0; font-size: 16px; }
.wp-fields { display: flex; flex-wrap: wrap; gap: 12px 16px; margin: 14px 0 18px; }
.wp-fields label { display: flex; flex-direction: column; gap: 4px;
  font: 600 11px inherit; color: var(--muted); }
.wp-fields input { font: 500 12.5px inherit; padding: 6px 9px; width: 130px;
  border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
.wp-check { flex-direction: row !important; align-items: center; align-self: end;
  padding-bottom: 7px; }
.wp-check input { width: auto; }
.wp-ops h4 { margin: 0 0 2px; font-size: 12.5px; display: flex; gap: 8px;
  align-items: baseline; flex-wrap: wrap; }
.wp-ops-note { font: 500 11px inherit; color: var(--muted); }
.wp-group { margin: 14px 0 6px; font: 700 10.5px inherit; color: var(--muted);
  letter-spacing: .04em; text-transform: uppercase; }
.wp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px; }
.wp-op { display: flex; align-items: center; gap: 8px; font-size: 12.5px;
  padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px;
  cursor: pointer; }
.wp-op.on { background: #eff6ff; border-color: var(--accent); font-weight: 600; }
.wp-foot { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border); }
`;
