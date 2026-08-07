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

   ── Which operators are offered ──

   Those working in water, from Operator_Utility — the view 0069 built
   for exactly this question. Not the IDNO and DNO tables: neither knows
   which utility anybody covers, so the list was every operator on the
   system including the electric and gas ones, and a DNO set up the
   modern way as an organisation with a role had no row in "DNO" at all
   and was simply absent.

   An operator with no utilities assigned is hidden, and the screen says
   how many and where to fix it. Hiding without saying is what the old
   list did, and being told a name is missing beats wondering why.

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
  const [operators, setOperators] = useState([]);
  const [utilities, setUtilities] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blank());

  async function load() {
    try {
      const [w, o, ops, u] = await Promise.all([
        adminList("Water_Pipe_Size"),
        adminList("Water_Pipe_Size_Operator").catch(() => ({ rows: [] })),
        adminList("Operator_Utility"),
        adminList("Utility"),
      ]);
      setSizes(w.rows || []);
      setLinks(o.rows || []);
      setOperators(ops.rows || []);
      setUtilities(u.rows || []);
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

  const nameOf = (l) => operators.find((o) =>
    Number(o.Organisation_ID) === Number(l.Organisation_ID))?.Name
    ?? "unknown operator";

  /* Water, by name rather than by a hard-coded id — the ids differ
     between databases and the Utility table is the only thing that
     knows. Every water utility, since a NAV covering clean and waste
     is on both and either makes it a water operator. */
  const waterIds = useMemo(() => utilities
    .filter((u) => /water/i.test(String(u.Utility || "")))
    .map((u) => Number(u.Utility_ID)), [utilities]);

  const covers = (o, ids) => (o.utility_ids || []).some((x) => ids.includes(Number(x)));

  const waterOperators = useMemo(() => operators
    .filter((o) => covers(o, waterIds))
    .sort((a, b) => String(a.Name).localeCompare(String(b.Name))),
  [operators, waterIds]);

  /* Assigned to nothing at all, so nobody can say whether they do
     water. Counted rather than listed: the fix is one screen away and
     the number is enough to send somebody there. */
  const unassigned = operators.filter((o) => !(o.utility_ids || []).length).length;

  const roleOf = (o) => {
    const keys = o.role_keys || [];
    const has = (k) => keys.some((x) => String(x).toLowerCase() === k);
    return has("idno") && has("dno") ? "IDNO / DNO"
      : has("idno") ? "IDNO" : has("dno") ? "DNO" : null;
  };

  const labelOf = (s) => s.Size_Label || `${Number(s.Diameter_mm)}mm`;

  /* ── Ticking an operator ──

     Written straight through rather than gathered and saved: one
     checkbox is one row, and a Save button over a grid of them invites
     changes that are lost by navigating away. */
  async function toggle(organisationId) {
    if (!current) return;
    const held = links.find((l) =>
      Number(l.Water_Pipe_Size_ID) === Number(current.Water_Pipe_Size_ID)
      && Number(l.Organisation_ID) === Number(organisationId));
    setBusy(`op:${organisationId}`);
    try {
      if (held) {
        await adminDelete("Water_Pipe_Size_Operator", held.Water_Pipe_Size_Operator_ID);
        setLinks((xs) => xs.filter((x) =>
          x.Water_Pipe_Size_Operator_ID !== held.Water_Pipe_Size_Operator_ID));
      } else {
        const made = await adminCreate("Water_Pipe_Size_Operator", {
          Water_Pipe_Size_ID: current.Water_Pipe_Size_ID,
          Organisation_ID: organisationId,
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
                <span className="wp-ops-note">Water operators only.</span>
              </h4>

              {!waterOperators.length ? (
                <p className="wp-none">
                  No operator is marked as working in water. Assign utilities to
                  them in Admin &rsaquo; Organisations, then they appear here.
                </p>
              ) : (
                <div className="wp-grid">
                  {waterOperators.map((o) => {
                    const on = !!links.find((l) =>
                      Number(l.Water_Pipe_Size_ID) === Number(current.Water_Pipe_Size_ID)
                      && Number(l.Organisation_ID) === Number(o.Organisation_ID));
                    return (
                      <label key={o.Organisation_ID} className={on ? "wp-op on" : "wp-op"}>
                        <input type="checkbox" checked={on}
                          disabled={busy === `op:${o.Organisation_ID}`}
                          onChange={() => toggle(o.Organisation_ID)} />
                        <span className="wp-op-name">{o.Name}</span>
                        {roleOf(o) && <span className="wp-role">{roleOf(o)}</span>}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Said, not silently dropped. An operator missing from
                  this list because nobody recorded which utilities it
                  works in looks exactly like an operator that does not
                  exist. */}
              {unassigned > 0 && (
                <p className="wp-hidden">
                  {unassigned} operator(s) are not shown because no utilities are
                  assigned to them. Set those in Admin &rsaquo; Organisations.
                </p>
              )}
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
.wp-op-name { flex: 1; }
.wp-role { font: 700 9.5px inherit; letter-spacing: .04em; color: var(--muted);
  background: var(--bg); border-radius: 4px; padding: 2px 6px; }
.wp-op.on .wp-role { background: #dbeafe; color: var(--accent); }
.wp-hidden { margin: 12px 0 0; font-size: 11.5px; color: #b45309; font-weight: 600; }
.wp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px; }
.wp-op { display: flex; align-items: center; gap: 8px; font-size: 12.5px;
  padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px;
  cursor: pointer; }
.wp-op.on { background: #eff6ff; border-color: var(--accent); font-weight: 600; }
.wp-foot { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border); }
`;
