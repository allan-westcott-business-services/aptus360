import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

/* Gas diversity factors.

   ── What this table is for ──

   Forty boilers do not draw forty times one boiler. The pipe tables are
   keyed on the diversified figure, so something has to sit between "the
   load beyond this point" and "the number the table is read with", and
   this is it.

   ── Why it starts empty, and why that is not a bug ──

   The rule belongs to IGE/GL/1, a purchased standard this application
   does not contain. Guessing at it would be worse than having nothing:
   a factor wrong in the unsafe direction undersizes a gas main, and the
   drawing looks equally confident either way.

   So the gas build refuses to size a main while this is empty, and the
   empty state here says what to get and where to put it rather than
   showing a blank list. It is the one screen in Admin whose emptiness
   is load-bearing.

   ── The curve ──

   Diversity falls as the count rises. A table where it does not is a
   typo, and a typo here is invisible in a list of numbers — 0.45 and
   0.54 read the same at a glance and mean very different mains.

   So the rules are drawn as well as listed. The line is not decoration:
   it makes the one failure mode this table has visible without reading
   anything, and the rows that cause it are named underneath. Nothing is
   corrected automatically, because which of two rows is the typo is not
   knowable from here. */

const blank = () => ({
  Max_Supplies: "", Factor: "", Notes: "",
  Display_Order: 100, Is_Active: true,
});

export default function GasDiversityAdmin() {
  const [rules, setRules] = useState([]);
  const [links, setLinks] = useState([]);
  const [operators, setOperators] = useState([]);
  const [utilities, setUtilities] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blank());
  /* A count somebody types to see what it would resolve to. The whole
     point of the table is a number nobody can check by eye, so it is
     worth being able to ask it directly. */
  const [probe, setProbe] = useState("");

  async function load() {
    try {
      const [d, o, ops, u] = await Promise.all([
        adminList("Gas_Diversity"),
        adminList("Gas_Diversity_Operator").catch(() => ({ rows: [] })),
        adminList("Operator_Utility"),
        adminList("Utility"),
      ]);
      setRules(d.rows || []);
      setLinks(o.rows || []);
      setOperators(ops.rows || []);
      setUtilities(u.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const current = rules.find((r) =>
    Number(r.Gas_Diversity_ID) === Number(selected)) || null;

  const ordered = useMemo(() => [...rules]
    .sort((a, b) => Number(a.Max_Supplies) - Number(b.Max_Supplies)), [rules]);

  const active = useMemo(() => ordered.filter((r) => r.Is_Active !== false), [ordered]);

  /* A larger count diversifying less than a smaller one. Same test the
     build runs, so the two cannot disagree about what is wrong. */
  const inversions = useMemo(() => {
    const bad = [];
    for (let i = 1; i < active.length; i++) {
      if (Number(active[i].Factor) > Number(active[i - 1].Factor)) {
        bad.push([active[i - 1], active[i]]);
      }
    }
    return bad;
  }, [active]);

  const factorFor = (n) => active.find((r) => Number(r.Max_Supplies) >= n) || null;

  const probed = probe !== "" && Number(probe) > 0 ? factorFor(Number(probe)) : null;

  const linksFor = (id) => links.filter((l) =>
    Number(l.Gas_Diversity_ID) === Number(id));

  const nameOf = (l) => operators.find((o) =>
    Number(o.Organisation_ID) === Number(l.Organisation_ID))?.Name
    ?? "unknown operator";

  const gasIds = useMemo(() => utilities
    .filter((u) => /gas/i.test(String(u.Utility || "")))
    .map((u) => Number(u.Utility_ID)), [utilities]);

  const gasOperators = useMemo(() => operators
    .filter((o) => (o.utility_ids || []).some((x) => gasIds.includes(Number(x))))
    .sort((a, b) => String(a.Name).localeCompare(String(b.Name))),
  [operators, gasIds]);

  const unassigned = operators.filter((o) => !(o.utility_ids || []).length).length;

  /* ── The curve ──

     Plotted against the rank of each rule rather than against the
     supply count itself, so a table of 5, 20 and 500 does not squash
     its first two rows into the left edge. What is being read here is
     the shape — does it only ever fall — and rank preserves that while
     an unevenly spaced axis hides it. */
  const curve = useMemo(() => {
    if (active.length < 2) return null;
    const w = 260;
    const h = 64;
    const pad = 6;
    const fs = active.map((r) => Number(r.Factor));
    const top = Math.max(...fs, 1);
    const bottom = Math.min(...fs, 0);
    const span = top - bottom || 1;
    const pts = active.map((r, i) => {
      const x = pad + (i / (active.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (Number(r.Factor) - bottom) / span) * (h - pad * 2);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    return { w, h, pts, top, bottom };
  }, [active]);

  async function toggle(organisationId) {
    if (!current) return;
    const held = links.find((l) =>
      Number(l.Gas_Diversity_ID) === Number(current.Gas_Diversity_ID)
      && Number(l.Organisation_ID) === Number(organisationId));
    setBusy(`op:${organisationId}`);
    try {
      if (held) {
        await adminDelete("Gas_Diversity_Operator", held.Gas_Diversity_Operator_ID);
        setLinks((xs) => xs.filter((x) =>
          x.Gas_Diversity_Operator_ID !== held.Gas_Diversity_Operator_ID));
      } else {
        const made = await adminCreate("Gas_Diversity_Operator", {
          Gas_Diversity_ID: current.Gas_Diversity_ID,
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
      await adminUpdate("Gas_Diversity", current.Gas_Diversity_ID, changes);
      setRules((xs) => xs.map((x) =>
        Number(x.Gas_Diversity_ID) === Number(current.Gas_Diversity_ID)
          ? { ...x, ...changes } : x));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function addRule() {
    const n = Number(draft.Max_Supplies);
    const f = Number(draft.Factor);
    if (!n || !f) {
      return setError("A rule needs a supply count and a factor.");
    }
    /* Checked here as well as by the database, so the message names the
       field rather than quoting a constraint. */
    if (f <= 0 || f > 1) {
      return setError("A factor is between 0 and 1 \u2014 it shrinks the summed "
        + "peak, so 0.4 means forty per cent of it. Above 1 would make the load "
        + "larger than the sum of its parts.");
    }
    setBusy("add");
    try {
      const made = await adminCreate("Gas_Diversity", {
        ...draft,
        Max_Supplies: n,
        Factor: f,
        Notes: draft.Notes || null,
        Display_Order: Number(draft.Display_Order) || 100,
      });
      setRules((xs) => [...xs, made]);
      setSelected(made.Gas_Diversity_ID);
      setAdding(false);
      setDraft(blank());
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function removeRule(r) {
    if (!window.confirm(`Delete the rule for up to ${r.Max_Supplies} supplies?`
      + "\n\nAny drawn main keeps the size already written on it.")) return;
    setBusy(`del:${r.Gas_Diversity_ID}`);
    try {
      await adminDelete("Gas_Diversity", r.Gas_Diversity_ID);
      setRules((xs) => xs.filter((x) =>
        Number(x.Gas_Diversity_ID) !== Number(r.Gas_Diversity_ID)));
      if (Number(selected) === Number(r.Gas_Diversity_ID)) setSelected(null);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  if (loading) return <p className="gd-empty">Loading&hellip;</p>;

  return (
    <div>
      <style>{CSS}</style>
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      <div className="gd-head">
        <h3>Gas Diversity</h3>
        <p className="gd-sub">
          What the summed peak demand is multiplied by before a mains size is
          read off the pipe tables. Each rule is a ceiling: rows of 5, 20 and 100
          mean thirty supplies take the 100 rule. A rule with no operators ticked
          is the standard and applies everywhere.
        </p>
      </div>

      {/* The empty state does the work here. It is the reason gas mains
          cannot be sized, and a blank list would look like a screen
          nobody had got round to rather than a decision waiting to be
          made. */}
      {!rules.length ? (
        <div className="gd-blank">
          <h4>No factors are set, so gas mains cannot be sized.</h4>
          <p>
            The gas build lays the main and reports its lengths, but leaves every
            pipe without a diameter. It will keep doing that until there is a
            factor to apply.
          </p>
          <p>
            The figures come from <strong>IGE/GL/1, Appendix A5</strong> &mdash;
            the Institution of Gas Engineers guide to planning distribution
            systems &mdash; or from whatever standard the adopting operator
            designs to. They are not shipped with this application, and they are
            not something to estimate: a factor that is too generous undersizes a
            main, and the drawing looks the same either way.
          </p>
          <p className="gd-blank-how">
            Add one rule per supply-count band. For a band covering up to twenty
            supplies at forty per cent of summed peak, that is
            <strong> 20</strong> and <strong>0.4</strong>.
          </p>
          <button className="btn accent sm" onClick={() => setAdding(true)}>
            + Rule
          </button>
          {adding && (
            <div className="gd-new gd-new-wide">
              <input placeholder="Up to how many supplies" inputMode="numeric"
                value={draft.Max_Supplies}
                onChange={(e) => setDraft((d) => ({ ...d, Max_Supplies: e.target.value }))} />
              <input placeholder="Factor, e.g. 0.4" inputMode="decimal"
                value={draft.Factor}
                onChange={(e) => setDraft((d) => ({ ...d, Factor: e.target.value }))} />
              <input placeholder="Where it came from (optional)"
                value={draft.Notes}
                onChange={(e) => setDraft((d) => ({ ...d, Notes: e.target.value }))} />
              <div className="gd-new-act">
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
        </div>
      ) : (
        <>
          {inversions.length > 0 && (
            <Banner kind="warning">
              {inversions.length} rule(s) diversify less at a higher supply count
              than at a lower one, which is the wrong way round:{" "}
              {inversions.map(([a, b]) =>
                `${a.Max_Supplies} at ${a.Factor} then ${b.Max_Supplies} at ${b.Factor}`
              ).join("; ")}. Nothing is corrected automatically &mdash; which of
              the two is the typo is not something this screen can tell.
            </Banner>
          )}

          <div className="gd-split">
            <div className="gd-list">
              <div className="gd-list-head">
                <button className="btn accent sm"
                  onClick={() => { setAdding(true); setSelected(null); }}>
                  + Rule
                </button>
              </div>

              {adding && (
                <div className="gd-new">
                  <input placeholder="Up to how many supplies" inputMode="numeric"
                    value={draft.Max_Supplies}
                    onChange={(e) => setDraft((d) => ({ ...d, Max_Supplies: e.target.value }))} />
                  <input placeholder="Factor, e.g. 0.4" inputMode="decimal"
                    value={draft.Factor}
                    onChange={(e) => setDraft((d) => ({ ...d, Factor: e.target.value }))} />
                  <input placeholder="Where it came from (optional)"
                    value={draft.Notes}
                    onChange={(e) => setDraft((d) => ({ ...d, Notes: e.target.value }))} />
                  <div className="gd-new-act">
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

              {ordered.map((r) => {
                const mine = linksFor(r.Gas_Diversity_ID);
                return (
                  <button key={r.Gas_Diversity_ID}
                    className={Number(selected) === Number(r.Gas_Diversity_ID)
                      ? "gd-item on" : "gd-item"}
                    onClick={() => { setSelected(r.Gas_Diversity_ID); setAdding(false); }}>
                    <span className="gd-item-name">
                      up to {r.Max_Supplies} supplies
                      {r.Is_Active === false && <span className="gd-off">INACTIVE</span>}
                    </span>
                    <span className="gd-item-meta">
                      &times; {r.Factor}
                      {" \u00b7 "}
                      {mine.length ? `${mine.length} operator(s)` : "all operators"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div>
              {/* The shape, and a way to ask the table a question. Both
                  sit above the selected rule because both are about the
                  table as a whole, and a factor only makes sense
                  alongside the ones either side of it. */}
              <div className="gd-shape">
                {curve ? (
                  <svg className="gd-curve" viewBox={`0 0 ${curve.w} ${curve.h}`}
                    role="img"
                    aria-label={`Diversity factor across ${active.length} rules, `
                      + `from ${active[0].Factor} down to `
                      + `${active[active.length - 1].Factor}`}>
                    <polyline points={curve.pts.map((p) => p.join(",")).join(" ")}
                      fill="none" stroke="var(--accent)" strokeWidth="1.5"
                      strokeLinejoin="round" />
                    {curve.pts.map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r="2.5"
                        fill={i > 0 && Number(active[i].Factor) > Number(active[i - 1].Factor)
                          ? "#b91c1c" : "var(--accent)"} />
                    ))}
                  </svg>
                ) : (
                  <p className="gd-none">
                    One rule so far. The shape appears once there are two.
                  </p>
                )}

                <div className="gd-probe">
                  <label>
                    <span>What would this many supplies get?</span>
                    <input value={probe} inputMode="numeric" placeholder="e.g. 42"
                      onChange={(e) => setProbe(e.target.value)} />
                  </label>
                  {probe !== "" && (
                    <p className="gd-probe-out">
                      {probed
                        ? <>Factor <strong>{probed.Factor}</strong>, from the rule
                          for up to {probed.Max_Supplies} supplies.</>
                        : <span className="gd-over">
                            Above every rule in the table &mdash; a main feeding
                            this many supplies cannot be sized. Add a rule that
                            covers it.
                          </span>}
                    </p>
                  )}
                </div>
              </div>

              {!current ? (
                <p className="gd-empty">Pick a rule, or add one.</p>
              ) : (
                <div>
                  <div className="gd-detail-head">
                    <h3>Up to {current.Max_Supplies} supplies</h3>
                    <p className="gd-sub">
                      Summed peak demand &times; {current.Factor}
                      {linksFor(current.Gas_Diversity_ID).length
                        ? ` for ${linksFor(current.Gas_Diversity_ID).map(nameOf).join(", ")}.`
                        : " on any project \u2014 no operator is named, so this is the standard."}
                    </p>
                  </div>

                  <div className="gd-fields">
                    <label>
                      <span>Up to how many supplies</span>
                      <input defaultValue={current.Max_Supplies} inputMode="numeric"
                        key={`s${current.Gas_Diversity_ID}`}
                        onBlur={(e) => Number(e.target.value) !== Number(current.Max_Supplies)
                          && saveDetails({ Max_Supplies: Number(e.target.value) })} />
                    </label>
                    <label>
                      <span>Factor</span>
                      <input defaultValue={current.Factor} inputMode="decimal"
                        key={`f${current.Gas_Diversity_ID}`}
                        onBlur={(e) => Number(e.target.value) !== Number(current.Factor)
                          && saveDetails({ Factor: Number(e.target.value) })} />
                    </label>
                    <label className="gd-wide">
                      <span>Where it came from</span>
                      <input defaultValue={current.Notes ?? ""}
                        key={`n${current.Gas_Diversity_ID}`}
                        placeholder="e.g. IGE/GL/1 A5.1.5, gas central heating"
                        onBlur={(e) => e.target.value !== (current.Notes ?? "")
                          && saveDetails({ Notes: e.target.value || null })} />
                    </label>
                    <label>
                      <span>Order</span>
                      <input defaultValue={current.Display_Order ?? 100} inputMode="numeric"
                        key={`o${current.Gas_Diversity_ID}`}
                        onBlur={(e) => Number(e.target.value) !== Number(current.Display_Order)
                          && saveDetails({ Display_Order: Number(e.target.value) })} />
                    </label>
                    <label className="gd-check">
                      <input type="checkbox" checked={current.Is_Active !== false}
                        onChange={(e) => saveDetails({ Is_Active: e.target.checked })} />
                      <span>Active</span>
                    </label>
                  </div>

                  <div className="gd-ops">
                    <h4>
                      Applies to
                      <span className="gd-ops-note">
                        {linksFor(current.Gas_Diversity_ID).length
                          ? "only the operators ticked"
                          : "every operator \u2014 tick some to make this rule theirs alone"}
                      </span>
                      <span className="gd-ops-note">Gas operators only.</span>
                    </h4>

                    {!gasOperators.length ? (
                      <p className="gd-none">
                        No operator is marked as working in gas. Assign utilities
                        to them in Admin &rsaquo; Organisations, then they appear
                        here.
                      </p>
                    ) : (
                      <div className="gd-grid">
                        {gasOperators.map((o) => {
                          const on = !!links.find((l) =>
                            Number(l.Gas_Diversity_ID) === Number(current.Gas_Diversity_ID)
                            && Number(l.Organisation_ID) === Number(o.Organisation_ID));
                          return (
                            <label key={o.Organisation_ID} className={on ? "gd-op on" : "gd-op"}>
                              <input type="checkbox" checked={on}
                                disabled={busy === `op:${o.Organisation_ID}`}
                                onChange={() => toggle(o.Organisation_ID)} />
                              <span className="gd-op-name">{o.Name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {unassigned > 0 && (
                      <p className="gd-hidden">
                        {unassigned} operator(s) are not shown because no utilities
                        are assigned to them. Set those in Admin &rsaquo;
                        Organisations.
                      </p>
                    )}
                  </div>

                  <div className="gd-foot">
                    <button className="btn delete sm"
                      disabled={busy === `del:${current.Gas_Diversity_ID}`}
                      onClick={() => removeRule(current)}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.gd-head { margin-bottom: 14px; }
.gd-head h3 { margin: 0; font-size: 16px; }
.gd-sub { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); max-width: 70ch; }
.gd-split { display: grid; grid-template-columns: 240px 1fr; gap: 18px; }
.gd-list { border-right: 1px solid var(--border); padding-right: 16px; }
.gd-list-head { margin-bottom: 10px; }

.gd-blank { border: 1px dashed var(--border); border-radius: var(--radius);
  background: var(--bg); padding: 20px 24px; max-width: 74ch; }
.gd-blank h4 { margin: 0 0 8px; font-size: 14px; font-weight: 700; }
.gd-blank p { margin: 0 0 9px; font-size: 12.5px; line-height: 1.6; color: var(--text); }
.gd-blank-how { color: var(--muted) !important; }

.gd-new { display: flex; flex-direction: column; gap: 6px; margin: 10px 0;
  padding: 10px; background: var(--bg); border-radius: 8px; }
.gd-new-wide { max-width: 340px; background: var(--white);
  border: 1px solid var(--border); }
.gd-new input { font: 500 12px inherit; padding: 6px 9px;
  border: 1px solid var(--border); border-radius: 6px; }
.gd-new-act { display: flex; gap: 6px; }

.gd-item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  width: 100%; background: none; border: none; cursor: pointer; text-align: left;
  padding: 7px 9px; border-radius: 7px; }
.gd-item:hover { background: var(--bg); }
.gd-item.on { background: #eff6ff; }
.gd-item-name { font: 600 12.5px inherit; }
.gd-item-meta { font-size: 10.5px; color: var(--muted); }
.gd-off { font-size: 9.5px; font-weight: 700; color: #b91c1c; margin-left: 6px; }
.gd-none { font-size: 12px; color: var(--muted); margin: 8px 0; }
.gd-empty { color: var(--muted); font-size: 13px; padding: 30px 0; text-align: center; }

.gd-shape { display: flex; gap: 22px; align-items: flex-start; flex-wrap: wrap;
  padding-bottom: 14px; margin-bottom: 4px; border-bottom: 1px solid var(--border); }
.gd-curve { width: 260px; height: 64px; flex: none; }
.gd-probe label { display: flex; flex-direction: column; gap: 4px;
  font: 600 11px inherit; color: var(--muted); }
.gd-probe input { font: 500 12.5px inherit; padding: 6px 9px; width: 130px;
  border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
.gd-probe-out { margin: 7px 0 0; font-size: 12px; max-width: 44ch; line-height: 1.5; }
.gd-over { color: #b45309; font-weight: 600; }

.gd-detail-head { padding: 14px 0 12px; border-bottom: 1px solid var(--border); }
.gd-detail-head h3 { margin: 0; font-size: 16px; }
.gd-fields { display: flex; flex-wrap: wrap; gap: 12px 16px; margin: 14px 0 18px; }
.gd-fields label { display: flex; flex-direction: column; gap: 4px;
  font: 600 11px inherit; color: var(--muted); }
.gd-fields input { font: 500 12.5px inherit; padding: 6px 9px; width: 130px;
  border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
.gd-wide input { width: 280px; }
.gd-check { flex-direction: row !important; align-items: center; align-self: end;
  padding-bottom: 7px; }
.gd-check input { width: auto; }
.gd-ops h4 { margin: 0 0 2px; font-size: 12.5px; display: flex; gap: 8px;
  align-items: baseline; flex-wrap: wrap; }
.gd-ops-note { font: 500 11px inherit; color: var(--muted); }
.gd-op-name { flex: 1; }
.gd-hidden { margin: 12px 0 0; font-size: 11.5px; color: #b45309; font-weight: 600; }
.gd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px; }
.gd-op { display: flex; align-items: center; gap: 8px; font-size: 12.5px;
  padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px;
  cursor: pointer; }
.gd-op.on { background: #eff6ff; border-color: var(--accent); font-weight: 600; }
.gd-foot { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border); }
`;
