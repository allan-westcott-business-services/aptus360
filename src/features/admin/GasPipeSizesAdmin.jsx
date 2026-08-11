import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

/* Gas pipe sizes, and whose rule each one is.

   The water screen's sibling, and deliberately close to it: the same
   master-and-detail, the same operator checkboxes, the same "no
   operators means everybody". Somebody who has configured one should
   not have to learn the other.

   ── What is different, and why ──

   Gas is keyed on load rather than on a plot count, because the
   published tables are: a four-bed with a boiler and a hob is not the
   same demand as a flat with a combi, and the commercial unit at the
   end of the road is neither.

   And a service rule carries a length as well. The same 65 kW takes
   32mm over thirty metres and 63mm over fifty, because what runs out is
   pressure and pressure drops along the pipe. A mains rule has no
   length — a main is cut where its size changes, not where it gets long
   — so the field is hidden rather than shown empty on mains rules.

   ── The tier is part of the key ──

   Not a filter applied afterwards. The same load takes different pipe
   on low and medium pressure, and a rule that did not say which it
   meant would be picked for both. Two rows of tabs rather than one,
   because kind and tier are independent: there are mains rules and
   service rules at every tier.

   ── Where the seeded rules came from ──

   Cadent CAD/SP/NP/14E, Tables A.4, A.5 and A.7, loaded by 0130 as the
   standard. They are Cadent's figures and not the industry's — an
   operator working to different ones gets rules named to them, at which
   point theirs win those bands and the seeded ones stop applying to
   their projects. Said on the screen, because a table that arrives
   pre-filled reads as authoritative unless something says whose it is. */

const KINDS = [
  ["main", "Mains"],
  ["service", "Service"],
];

/* Low, medium, intermediate. IP is offered with nothing seeded behind
   it: it exists on real schemes and the published tables here do not
   cover it, so the tab is empty and says so rather than being absent
   and leaving somebody wondering where to put the rule. */
const TIERS = [
  ["LP", "Low pressure", "up to 75 mbar"],
  ["MP", "Medium pressure", "75 mbar to 2 bar"],
  ["IP", "Intermediate", "2 to 7 bar"],
];

const blank = (kind = "main", tier = "LP") => ({
  Pipe_Kind: kind,
  Pressure_Tier: tier,
  Diameter_mm: "", Size_Label: "", Max_kW: "", Max_Length_m: "",
  Display_Order: 100, Is_Active: true,
});

export default function GasPipeSizesAdmin() {
  const [sizes, setSizes] = useState([]);
  const [limits, setLimits] = useState([]);
  const [links, setLinks] = useState([]);
  const [operators, setOperators] = useState([]);
  const [utilities, setUtilities] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("main");
  const [tier, setTier] = useState("LP");
  const [draft, setDraft] = useState(blank());

  async function load() {
    try {
      /* Named in step with the list below it \u2014 this destructure is
         positional, and a query added in the middle without a name here
         shifts every result after it. */
      const [g, lim, o, ops, u] = await Promise.all([
        adminList("Gas_Pipe_Size"),
        /* Tolerated missing: a database without 0148 has no limits
           table, and a sizes screen that refused to open because of
           that would be worse than one without the panel. */
        adminList("Gas_Pressure_Setting").catch(() => ({ rows: [] })),
        adminList("Gas_Pipe_Size_Operator").catch(() => ({ rows: [] })),
        adminList("Operator_Utility"),
        adminList("Utility"),
      ]);
      setSizes(g.rows || []);
      setLimits(lim.rows || []);
      setLinks(o.rows || []);
      setOperators(ops.rows || []);
      setUtilities(u.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const current = sizes.find((s) =>
    Number(s.Gas_Pipe_Size_ID) === Number(selected)) || null;

  const isService = (s) => (s.Pipe_Kind ?? "main") === "service";

  /* Ascending diameter, because that is what the sizing minimises: two
     rows can both carry a load and the smaller pipe is the answer.
     Water sorts by capacity, which is right for a single-keyed table
     and wrong here — a length-banded service rule with a lower ceiling
     can be the larger pipe, and the list would read as out of order. */
  const ordered = useMemo(() => sizes
    .filter((s) => (s.Pipe_Kind ?? "main") === kind
      && (s.Pressure_Tier ?? "LP") === tier)
    .sort((a, b) => Number(a.Diameter_mm) - Number(b.Diameter_mm)
      || Number(a.Max_kW) - Number(b.Max_kW)
      || (Number(a.Max_Length_m) || Infinity) - (Number(b.Max_Length_m) || Infinity)),
  [sizes, kind, tier]);

  const countOf = (k, t) => sizes.filter((s) =>
    (s.Pipe_Kind ?? "main") === k && (s.Pressure_Tier ?? "LP") === t).length;

  const linksFor = (id) => links.filter((l) =>
    Number(l.Gas_Pipe_Size_ID) === Number(id));

  const nameOf = (l) => operators.find((o) =>
    Number(o.Organisation_ID) === Number(l.Organisation_ID))?.Name
    ?? "unknown operator";

  /* Gas operators, by name rather than a hard-coded id — the ids differ
     between databases and the Utility table is the only thing that
     knows. */
  const gasIds = useMemo(() => utilities
    .filter((u) => /gas/i.test(String(u.Utility || "")))
    .map((u) => Number(u.Utility_ID)), [utilities]);

  const gasOperators = useMemo(() => operators
    .filter((o) => (o.utility_ids || []).some((x) => gasIds.includes(Number(x))))
    .sort((a, b) => String(a.Name).localeCompare(String(b.Name))),
  [operators, gasIds]);

  const unassigned = operators.filter((o) => !(o.utility_ids || []).length).length;

  const roleOf = (o) => {
    const keys = o.role_keys || [];
    const has = (k) => keys.some((x) => String(x).toLowerCase() === k);
    return has("idno") && has("dno") ? "IDNO / DNO"
      : has("idno") ? "IDNO" : has("dno") ? "DNO" : null;
  };

  const labelOf = (s) => s.Size_Label || `${Number(s.Diameter_mm)}mm`;

  const bandOf = (s) => `up to ${Number(s.Max_kW)} kW`
    + (s.Max_Length_m ? ` over ${Number(s.Max_Length_m)} m` : "");

  async function toggle(organisationId) {
    if (!current) return;
    const held = links.find((l) =>
      Number(l.Gas_Pipe_Size_ID) === Number(current.Gas_Pipe_Size_ID)
      && Number(l.Organisation_ID) === Number(organisationId));
    setBusy(`op:${organisationId}`);
    try {
      if (held) {
        await adminDelete("Gas_Pipe_Size_Operator", held.Gas_Pipe_Size_Operator_ID);
        setLinks((xs) => xs.filter((x) =>
          x.Gas_Pipe_Size_Operator_ID !== held.Gas_Pipe_Size_Operator_ID));
      } else {
        const made = await adminCreate("Gas_Pipe_Size_Operator", {
          Gas_Pipe_Size_ID: current.Gas_Pipe_Size_ID,
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
      await adminUpdate("Gas_Pipe_Size", current.Gas_Pipe_Size_ID, changes);
      setSizes((xs) => xs.map((x) =>
        Number(x.Gas_Pipe_Size_ID) === Number(current.Gas_Pipe_Size_ID)
          ? { ...x, ...changes } : x));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function addRule() {
    if (!draft.Diameter_mm || !draft.Max_kW) {
      return setError("A rule needs a diameter and a maximum load in kW.");
    }
    setBusy("add");
    try {
      const made = await adminCreate("Gas_Pipe_Size", {
        ...draft,
        /* The set being viewed, so a rule added while looking at the MP
           service list is an MP service rule without anybody choosing
           either twice. */
        Pipe_Kind: kind,
        Pressure_Tier: tier,
        Diameter_mm: Number(draft.Diameter_mm),
        Max_kW: Number(draft.Max_kW),
        /* Null on a mains rule whatever was typed. The database refuses
           a length on one, and a form that can send a value the schema
           rejects is a form that produces an error nobody can act on. */
        Max_Length_m: kind === "service" && draft.Max_Length_m
          ? Number(draft.Max_Length_m) : null,
        Display_Order: Number(draft.Display_Order) || 100,
      });
      setSizes((xs) => [...xs, made]);
      setSelected(made.Gas_Pipe_Size_ID);
      setAdding(false);
      setDraft(blank(kind, tier));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function removeRule(s) {
    if (!window.confirm(`Delete the ${labelOf(s)} rule, ${bandOf(s)}?`
      + "\n\nAny drawn pipe keeps the size already written on it.")) return;
    setBusy(`del:${s.Gas_Pipe_Size_ID}`);
    try {
      await adminDelete("Gas_Pipe_Size", s.Gas_Pipe_Size_ID);
      setSizes((xs) => xs.filter((x) =>
        Number(x.Gas_Pipe_Size_ID) !== Number(s.Gas_Pipe_Size_ID)));
      if (Number(selected) === Number(s.Gas_Pipe_Size_ID)) setSelected(null);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  const switchTo = (k, t) => {
    if (k != null) setKind(k);
    if (t != null) setTier(t);
    setSelected(null);
    setAdding(false);
  };

  if (loading) return <p className="gp-empty">Loading&hellip;</p>;

  /* The limits the levels check judges against.

     Here rather than on a screen of their own: a designer changing what
     a pipe may carry and a designer changing what pressure it must
     hold are the same person doing the same job, and two screens is one
     more place to look. Same reasoning as the electric specs screen,
     which keeps its volt drop limits beside its cable sizes. */
  const limit = limits[0] || null;

  async function saveLimit(field, value) {
    if (!limit) return;
    try {
      await adminUpdate("Gas_Pressure_Setting",
        limit.Gas_Pressure_Setting_ID, { [field]: value === "" ? null : Number(value) });
      await load();
      setError("");
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <style>{CSS}</style>
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      {limit && (
        <div className="gp-limits">
          <h3>Pressure limits</h3>
          <p className="gp-sub">
            What the gas levels check judges a design against. A node below the
            minimum is reported in red; one within the amber band passes but
            has little left to give.
          </p>
          <div className="gp-limit-row">
            <label className="gp-limit">
              <span>Minimum pressure (mbar)</span>
              <input type="number" step="0.1" min="0"
                defaultValue={limit.Min_Pressure_mBar ?? ""}
                onBlur={(e) => saveLimit("Min_Pressure_mBar", e.target.value)} />
              <em>19 is the usual low-pressure floor at the meter</em>
            </label>
            <label className="gp-limit">
              <span>Amber at (%)</span>
              <input type="number" step="1" min="0" max="100"
                defaultValue={limit.Amber_Pct ?? ""}
                onBlur={(e) => saveLimit("Amber_Pct", e.target.value)} />
              <em>how far toward the minimum before it is worth flagging</em>
            </label>
            {/* A multiple of the pipe's own bore, so one figure covers
                every size \u2014 a tee on a big main resists more than the
                same tee on a small one. A flat metre figure was tried
                and under-stated the larger pipes by up to 13%. */}
            <label className="gp-limit">
              <span>Service tee allowance</span>
              <div className="gp-limit-unit">
                <input type="number" step="1" min="0"
                  defaultValue={limit.Tee_Diameters ?? ""}
                  onBlur={(e) => saveLimit("Tee_Diameters", e.target.value)} />
                <span>&times; bore</span>
              </div>
              <em>
                {`A tee costs this many pipe-widths of extra length. `}
                {`At ${Number(limit.Tee_Diameters ?? 60)}, that is `}
                {`${((Number(limit.Tee_Diameters ?? 60) * 52) / 1000).toFixed(1)}m on a `}
                {`63mm main and `}
                {`${((Number(limit.Tee_Diameters ?? 60) * 169) / 1000).toFixed(1)}m on a 180mm.`}
              </em>
            </label>
            <label className="gp-limit">
              <span>Pipe efficiency</span>
              <input type="number" step="0.01" min="0" max="1"
                defaultValue={limit.Efficiency ?? ""}
                onBlur={(e) => saveLimit("Efficiency", e.target.value)} />
              <em>0.95 &mdash; worth about 10% of every drop</em>
            </label>
            <label className="gp-limit">
              <span>Gas temperature (&deg;C)</span>
              <input type="number" step="1"
                defaultValue={limit.Temperature_C ?? ""}
                onBlur={(e) => saveLimit("Temperature_C", e.target.value)} />
              <em>5 &mdash; winter ground; worth under 2%</em>
            </label>
          </div>
        </div>
      )}

      <div className="gp-head">
        <h3>Gas Pipe Sizes</h3>
        <p className="gp-sub">
          A main is sized by the diversified load beyond it; a service by the
          load it feeds and how far it runs. The smallest rule that covers both
          wins. A rule with no operators ticked is the standard and applies
          everywhere; one that names an operator is used for them instead.
        </p>
        <p className="gp-sub">
          The rules loaded with this screen are Cadent&rsquo;s, from their design
          specification for systems below 7&nbsp;bar. They are a starting point,
          not the industry standard &mdash; tick operators onto rules that are
          genuinely theirs, and add rules for anyone who works to different
          figures.
        </p>

        <div className="gp-tabs">
          <div className="gp-kinds">
            {KINDS.map(([k, name]) => (
              <button key={k} className={kind === k ? "gp-kind on" : "gp-kind"}
                onClick={() => switchTo(k, null)}>
                {name}
                <em>{countOf(k, tier)}</em>
              </button>
            ))}
          </div>
          <div className="gp-kinds">
            {TIERS.map(([t, name, range]) => (
              <button key={t} className={tier === t ? "gp-kind on" : "gp-kind"}
                title={range} onClick={() => switchTo(null, t)}>
                {name}
                <em>{countOf(kind, t)}</em>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="gp-split">
        <div className="gp-list">
          <div className="gp-list-head">
            <button className="btn accent sm"
              onClick={() => { setAdding(true); setSelected(null); setDraft(blank(kind, tier)); }}>
              + Rule
            </button>
          </div>

          {adding && (
            <div className="gp-new">
              <input placeholder="Diameter, e.g. 90" inputMode="decimal"
                value={draft.Diameter_mm}
                onChange={(e) => setDraft((d) => ({ ...d, Diameter_mm: e.target.value }))} />
              <input placeholder="Label (optional)"
                value={draft.Size_Label}
                onChange={(e) => setDraft((d) => ({ ...d, Size_Label: e.target.value }))} />
              <input placeholder="Max load (kW)" inputMode="decimal"
                value={draft.Max_kW}
                onChange={(e) => setDraft((d) => ({ ...d, Max_kW: e.target.value }))} />
              {kind === "service" && (
                <input placeholder="Max length (m)" inputMode="decimal"
                  value={draft.Max_Length_m}
                  onChange={(e) => setDraft((d) => ({ ...d, Max_Length_m: e.target.value }))} />
              )}
              <div className="gp-new-act">
                <button className="btn accent sm" disabled={busy === "add"} onClick={addRule}>
                  Add
                </button>
                <button className="btn ghost sm"
                  onClick={() => { setAdding(false); setDraft(blank(kind, tier)); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!ordered.length && (
            <p className="gp-none">
              No {kind === "service" ? "service" : "mains"} rules at{" "}
              {TIERS.find(([t]) => t === tier)?.[1].toLowerCase()} yet.
              {tier === "IP" && " None were supplied \u2014 the published tables "
                + "this screen was seeded from stop at medium pressure."}
            </p>
          )}

          {ordered.map((s) => {
            const mine = linksFor(s.Gas_Pipe_Size_ID);
            return (
              <button key={s.Gas_Pipe_Size_ID}
                className={Number(selected) === Number(s.Gas_Pipe_Size_ID)
                  ? "gp-item on" : "gp-item"}
                onClick={() => { setSelected(s.Gas_Pipe_Size_ID); setAdding(false); }}>
                <span className="gp-item-name">
                  {labelOf(s)}
                  {s.Is_Active === false && <span className="gp-off">INACTIVE</span>}
                </span>
                <span className="gp-item-meta">
                  {bandOf(s)}
                  {" \u00b7 "}
                  {mine.length ? `${mine.length} operator(s)` : "all operators"}
                </span>
              </button>
            );
          })}
        </div>

        {!current ? (
          <p className="gp-empty">Pick a rule, or add one.</p>
        ) : (
          <div>
            <div className="gp-detail-head">
              <h3>{labelOf(current)}</h3>
              <p className="gp-sub">
                {isService(current) ? "Service pipe. " : "Mains pipe. "}
                {TIERS.find(([t]) => t === (current.Pressure_Tier ?? "LP"))?.[1]}.
                {" "}Carries up to {Number(current.Max_kW)} kW
                {current.Max_Length_m
                  ? ` over runs of up to ${Number(current.Max_Length_m)} m`
                  : ""}
                {linksFor(current.Gas_Pipe_Size_ID).length
                  ? ` for ${linksFor(current.Gas_Pipe_Size_ID).map(nameOf).join(", ")}.`
                  : " on any project \u2014 no operator is named, so this is the standard."}
              </p>
            </div>

            <div className="gp-fields">
              <label>
                <span>Diameter (mm)</span>
                <input defaultValue={current.Diameter_mm} inputMode="decimal"
                  key={`d${current.Gas_Pipe_Size_ID}`}
                  onBlur={(e) => Number(e.target.value) !== Number(current.Diameter_mm)
                    && saveDetails({ Diameter_mm: Number(e.target.value) })} />
              </label>
              <label>
                <span>Label</span>
                <input defaultValue={current.Size_Label ?? ""}
                  key={`l${current.Gas_Pipe_Size_ID}`}
                  placeholder={`${Number(current.Diameter_mm)}mm`}
                  onBlur={(e) => e.target.value !== (current.Size_Label ?? "")
                    && saveDetails({ Size_Label: e.target.value || null })} />
              </label>
              <label>
                <span>Max load (kW)</span>
                <input defaultValue={current.Max_kW} inputMode="decimal"
                  key={`k${current.Gas_Pipe_Size_ID}`}
                  onBlur={(e) => Number(e.target.value) !== Number(current.Max_kW)
                    && saveDetails({ Max_kW: Number(e.target.value) })} />
              </label>

              {/* Services only. A mains rule carries no length band, and
                  the database refuses one — showing the field on a main
                  would offer a change that cannot be saved. */}
              {isService(current) && (
                <label>
                  <span>Max length (m)</span>
                  <input defaultValue={current.Max_Length_m ?? ""} inputMode="decimal"
                    key={`n${current.Gas_Pipe_Size_ID}`}
                    placeholder="any length"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v !== (current.Max_Length_m == null
                        ? null : Number(current.Max_Length_m))) {
                        saveDetails({ Max_Length_m: v });
                      }
                    }} />
                </label>
              )}

              <label>
                <span>Order</span>
                <input defaultValue={current.Display_Order ?? 100} inputMode="numeric"
                  key={`o${current.Gas_Pipe_Size_ID}`}
                  onBlur={(e) => Number(e.target.value) !== Number(current.Display_Order)
                    && saveDetails({ Display_Order: Number(e.target.value) })} />
              </label>
              <label className="gp-check">
                <input type="checkbox" checked={current.Is_Active !== false}
                  onChange={(e) => saveDetails({ Is_Active: e.target.checked })} />
                <span>Active</span>
              </label>
            </div>

            <div className="gp-ops">
              <h4>
                Applies to
                <span className="gp-ops-note">
                  {linksFor(current.Gas_Pipe_Size_ID).length
                    ? "only the operators ticked"
                    : "every operator \u2014 tick some to make this rule theirs alone"}
                </span>
                <span className="gp-ops-note">Gas operators only.</span>
              </h4>

              {!gasOperators.length ? (
                <p className="gp-none">
                  No operator is marked as working in gas. Assign utilities to
                  them in Admin &rsaquo; Organisations, then they appear here.
                </p>
              ) : (
                <div className="gp-grid">
                  {gasOperators.map((o) => {
                    const on = !!links.find((l) =>
                      Number(l.Gas_Pipe_Size_ID) === Number(current.Gas_Pipe_Size_ID)
                      && Number(l.Organisation_ID) === Number(o.Organisation_ID));
                    return (
                      <label key={o.Organisation_ID} className={on ? "gp-op on" : "gp-op"}>
                        <input type="checkbox" checked={on}
                          disabled={busy === `op:${o.Organisation_ID}`}
                          onChange={() => toggle(o.Organisation_ID)} />
                        <span className="gp-op-name">{o.Name}</span>
                        {roleOf(o) && <span className="gp-role">{roleOf(o)}</span>}
                      </label>
                    );
                  })}
                </div>
              )}

              {unassigned > 0 && (
                <p className="gp-hidden">
                  {unassigned} operator(s) are not shown because no utilities are
                  assigned to them. Set those in Admin &rsaquo; Organisations.
                </p>
              )}
            </div>

            <div className="gp-foot">
              <button className="btn delete sm"
                disabled={busy === `del:${current.Gas_Pipe_Size_ID}`}
                onClick={() => removeRule(current)}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.gp-limits { border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--white); padding: 14px 16px; margin-bottom: 16px; }
.gp-limits h3 { margin: 0 0 4px; }
.gp-limit-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; }
.gp-limit { display: flex; flex-direction: column; gap: 3px; min-width: 190px; }
.gp-limit > span { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.gp-limit input { font: 600 13px inherit; padding: 7px 10px; border-radius: 7px;
  border: 1px solid var(--border); background: var(--white); }
/* Prose, not another label: the hint inherited the uppercase tracking
   from the field name above it and shouted louder than the field. */
.gp-limit-unit { display: flex; align-items: center; gap: 6px; }
.gp-limit-unit input { flex: 1; min-width: 0; }
/* A unit, not a second label: it inherited the uppercase tracking from
   the field name above and shouted louder than the value beside it. */
.gp-limit-unit > span { font: 500 12px inherit; color: var(--muted);
  text-transform: none; letter-spacing: 0; white-space: nowrap; }

.gp-limit em { font-style: normal; font: 400 11px inherit; color: var(--muted);
  text-transform: none; letter-spacing: 0; }
.gp-limit { flex: 1 1 190px; max-width: 260px; }

.gp-head { margin-bottom: 14px; }
.gp-head h3 { margin: 0; font-size: 16px; }
.gp-sub { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); max-width: 70ch; }
.gp-split { display: grid; grid-template-columns: 260px 1fr; gap: 18px; }
.gp-tabs { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.gp-kinds { display: flex; gap: 6px; flex-wrap: wrap; }
.gp-kind { display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  background: none; border: 1px solid var(--border); border-radius: 999px;
  padding: 5px 14px; font: 700 11.5px inherit; color: var(--muted); }
.gp-kind em { font-style: normal; font-weight: 600; opacity: .7; }
.gp-kind.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.gp-list { border-right: 1px solid var(--border); padding-right: 16px; }
.gp-list-head { margin-bottom: 10px; }
.gp-new { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;
  padding: 10px; background: var(--bg); border-radius: 8px; }
.gp-new input { font: 500 12px inherit; padding: 6px 9px;
  border: 1px solid var(--border); border-radius: 6px; }
.gp-new-act { display: flex; gap: 6px; }
.gp-item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  width: 100%; background: none; border: none; cursor: pointer; text-align: left;
  padding: 7px 9px; border-radius: 7px; }
.gp-item:hover { background: var(--bg); }
.gp-item.on { background: #eff6ff; }
.gp-item-name { font: 600 12.5px inherit; }
.gp-item-meta { font-size: 10.5px; color: var(--muted); }
.gp-off { font-size: 9.5px; font-weight: 700; color: #b91c1c; margin-left: 6px; }
.gp-none { font-size: 12px; color: var(--muted); margin: 8px 0; line-height: 1.5; }
.gp-empty { color: var(--muted); font-size: 13px; padding: 40px 0; text-align: center; }
.gp-detail-head { padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.gp-detail-head h3 { margin: 0; font-size: 16px; }
.gp-fields { display: flex; flex-wrap: wrap; gap: 12px 16px; margin: 14px 0 18px; }
.gp-fields label { display: flex; flex-direction: column; gap: 4px;
  font: 600 11px inherit; color: var(--muted); }
.gp-fields input { font: 500 12.5px inherit; padding: 6px 9px; width: 130px;
  border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
.gp-check { flex-direction: row !important; align-items: center; align-self: end;
  padding-bottom: 7px; }
.gp-check input { width: auto; }
.gp-ops h4 { margin: 0 0 2px; font-size: 12.5px; display: flex; gap: 8px;
  align-items: baseline; flex-wrap: wrap; }
.gp-ops-note { font: 500 11px inherit; color: var(--muted); }
.gp-op-name { flex: 1; }
.gp-role { font: 700 9.5px inherit; letter-spacing: .04em; color: var(--muted);
  background: var(--bg); border-radius: 4px; padding: 2px 6px; }
.gp-op.on .gp-role { background: #dbeafe; color: var(--accent); }
.gp-hidden { margin: 12px 0 0; font-size: 11.5px; color: #b45309; font-weight: 600; }
.gp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px; }
.gp-op { display: flex; align-items: center; gap: 8px; font-size: 12.5px;
  padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px;
  cursor: pointer; }
.gp-op.on { background: #eff6ff; border-color: var(--accent); font-weight: 600; }
.gp-foot { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border); }
`;
