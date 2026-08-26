import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { listPlots } from "../../api/plots.js";
import { getQuotationPlots, setQuotationPlots } from "../../api/quotationPlots.js";
import { getLookups } from "../../api/lookups.js";

/* Assigning plots to a quotation, following the original's rules:

   1. Exclusive within the option — a plot taken by a sibling quotation is
      shown but not selectable. Across options it may repeat, because
      options are competing proposals for the same site.
   2. Self-lay plots are excluded FOR THIS APPLICATION'S UTILITY: the
      customer lays those themselves, so they aren't part of what we're
      asking this operator to quote. Per utility, because a plot whose
      water is self-lay is still ours to connect for electric and
      belongs on an electric application.
   3. Range select — click one plot, then shift-click another, and
      everything between is taken (skipping anything ineligible).
   4. Live kVA total, flagging plots with no load figure. */

const nat = (a, b) => {
  const re = /^(\d+)(.*)$/;
  const ma = re.exec(String(a)), mb = re.exec(String(b));
  if (ma && mb) {
    const d = Number(ma[1]) - Number(mb[1]);
    return d !== 0 ? d : ma[2].localeCompare(mb[2]);
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};

export default function PlotAssignment({ projectId, quotationId, optionId, utilityId = null, siblingQuotations = [], onClose, onSaved }) {
  const [plots, setPlots] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [selected, setSelected] = useState([]);
  const [taken, setTaken] = useState({});      // Plot_ID -> sibling quote ref
  const [anchor, setAnchor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [lk, pRes, mine] = await Promise.all([
          getLookups(), listPlots(projectId), getQuotationPlots(quotationId),
        ]);
        if (!live) return;
        setLookups(lk);
        setPlots(pRes.rows || []);
        setSelected((mine.rows || []).map((r) => r.Plot_ID));

        // Plots held by other quotations in this same option
        const map = {};
        for (const q of siblingQuotations) {
          if (q.Quotation_ID === quotationId) continue;
          const res = await getQuotationPlots(q.Quotation_ID);
          (res.rows || []).forEach((r) => { map[r.Plot_ID] = q.Quotation_Ref || `#${q.Quotation_ID}`; });
        }
        if (live) setTaken(map);
      } catch (e) { live && setError(e.message); }
      finally { live && setLoading(false); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, quotationId]);

  const ordered = useMemo(
    () => [...plots].sort((a, b) => nat(a.Plot_Number, b.Plot_Number)),
    [plots]
  );

  const configFor = (id) =>
    (lookups?.propertyConfigs || []).find((c) => c.Property_Config_ID === id) || null;

  /* ── Self-lay, for THIS application's utility ──

     A quotation is for one utility. A plot that is self-lay for water
     and ours for electric belongs on an electric application and not on
     a water one — and the plot-level flag, one boolean for the whole
     plot, could only say "keep it off all of them".

     Off SLP_Utility_IDs, which listPlots already returns: no extra
     fetch, and the same set the Plots tab draws its chips from, so the
     two cannot disagree about the same plot.

     Where no utility was passed, nothing is excluded on that ground.
     Guessing would be the plot-level flag again by another route, and
     an application whose utility is not known is a thing to notice
     rather than to filter on. */
  /* Named, so the count and the hover say WHICH utility. "3 self-lay
     plots excluded" on an application for water, about plots whose gas
     is somebody else's, is a sentence that sends somebody looking in
     the wrong place. */
  const utilName = (lookups?.utilities || [])
    .find((u) => Number(u.Utility_ID) === Number(utilityId))?.Utility || null;

  const selfLayHere = (p) => utilityId != null
    && (p.SLP_Utility_IDs || []).some((u) => Number(u) === Number(utilityId));

  const eligible = (p) => !taken[p.Plot_ID] && !selfLayHere(p);

  function click(p, e) {
    if (!eligible(p)) return;
    const id = p.Plot_ID;

    if (e.shiftKey && anchor != null) {
      const a = ordered.findIndex((x) => x.Plot_ID === anchor);
      const b = ordered.findIndex((x) => x.Plot_ID === id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = ordered.slice(lo, hi + 1).filter(eligible).map((x) => x.Plot_ID);
        setSelected((s) => [...new Set([...s, ...range])]);
      }
      setAnchor(null);
      return;
    }

    setAnchor(id);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const selectableIds = ordered.filter(eligible).map((p) => p.Plot_ID);
  const kva = selected.reduce((sum, id) => {
    const p = plots.find((x) => x.Plot_ID === id);
    return sum + (Number(p?.KVA_Load) || 0);
  }, 0);
  const unmapped = selected.filter((id) => {
    const p = plots.find((x) => x.Plot_ID === id);
    return !p || p.KVA_Load == null || p.KVA_Load === "";
  }).length;
  const selfLayCount = ordered.filter(selfLayHere).length;

  async function save() {
    setSaving(true);
    try {
      await setQuotationPlots(quotationId, selected, optionId);
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="pa-loading">Loading plots&hellip;</div>;

  return (
    <div className="pa">
      <style>{CSS}</style>

      <div className="pa-head">
        <span className="pa-title">Assign plots</span>
        <span className="pa-kva">
          {selected.length} plot{selected.length === 1 ? "" : "s"} &middot; {kva.toFixed(1)} kVA
          {unmapped > 0 && <span className="pa-warn" title="No kVA load recorded on these plots">{unmapped} unmapped</span>}
        </span>
        <span className="pa-tools">
          <button onClick={() => setSelected(selectableIds)}>All</button>
          <button onClick={() => setSelected([])}>None</button>
        </span>
      </div>

      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      {plots.length === 0 ? (
        <p className="pa-none">No plots on this project yet.</p>
      ) : (
        <>
          <p className="pa-hint">
            Click to toggle. Shift-click a second plot to take everything between.
            {selfLayCount > 0 && ` ${selfLayCount} plot${selfLayCount === 1 ? " is" : "s are"} `
              + `self-lay for ${utilName || "this utility"}.`}
          </p>
          <div className="pa-grid">
            {ordered.map((p) => {
              const on = selected.includes(p.Plot_ID);
              const takenBy = taken[p.Plot_ID];
              const self = selfLayHere(p);
              const cfg = configFor(p.Property_Config_ID);
              const cls = ["pa-plot", on ? "on" : "", takenBy ? "taken" : "", self ? "selflay" : ""]
                .filter(Boolean).join(" ");
              const why = takenBy ? `Assigned to ${takenBy}` : self ? `Self-lay for ${utilName || "this utility"}` : cfg ? `${cfg.Code} · ${p.KVA_Load ?? "?"} kVA` : "";
              return (
                <button key={p.Plot_ID} className={cls} title={why}
                  onClick={(e) => click(p, e)} disabled={!eligible(p)}>
                  {p.Plot_Number}
                  {takenBy && <span className="pa-lock">&#128274;</span>}
                  {self && <span className="pa-lock">SL</span>}
                </button>
              );
            })}
          </div>
          <div className="pa-legend">
            <span><i className="sw on" /> assigned</span>
            <span><i className="sw taken" /> in another quotation</span>
            <span><i className="sw selflay" /> self-lay</span>
          </div>
        </>
      )}

      <div className="pa-actions">
        <button className="btn accent sm" disabled={saving} onClick={save}>
          {saving ? "Saving\u2026" : `Save ${selected.length} plot${selected.length === 1 ? "" : "s"}`}
        </button>
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

const CSS = `
.pa { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 12px; margin-top: 9px; }
.pa-loading { padding: 14px; font-size: 12.5px; color: var(--muted); }
.pa-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.pa-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--accent); }
.pa-kva { font-size: 12px; font-weight: 700; background: #dbeafe; border: 1px solid #93c5fd;
  color: #1e3a8a; border-radius: 20px; padding: 3px 11px; }
.pa-warn { margin-left: 8px; font-size: 11px; color: #a16207; }
.pa-tools { margin-left: auto; display: flex; gap: 5px; }
.pa-tools button { background: var(--bg); border: 1px solid var(--border); border-radius: 5px;
  padding: 3px 10px; font: 600 11px inherit; color: var(--accent); cursor: pointer; }
.pa-hint { font-size: 11.5px; color: var(--muted); margin: 0 0 8px; }
.pa-none { font-size: 12.5px; color: var(--muted); font-style: italic; margin: 0; }
.pa-grid { display: flex; flex-wrap: wrap; gap: 4px; max-height: 230px; overflow-y: auto;
  padding: 8px; background: var(--bg); border-radius: var(--radius); }
.pa-plot { min-width: 46px; padding: 5px 8px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--border); background: var(--white); font: 600 11.5px ui-monospace, Menlo, monospace;
  color: var(--text); display: inline-flex; align-items: center; gap: 4px; }
.pa-plot:hover:not(:disabled) { border-color: var(--accent); }
.pa-plot.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.pa-plot.taken { background: #f3f4f6; color: #9ca3af; border-style: dashed; cursor: not-allowed; }
.pa-plot.selflay { background: #fef3c7; color: #92400e; border-color: #fde68a; cursor: not-allowed; }
.pa-lock { font-size: 8px; }
.pa-legend { display: flex; gap: 14px; margin-top: 8px; font-size: 10.5px; color: var(--muted); }
.pa-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px;
  margin-right: 4px; vertical-align: middle; border: 1px solid var(--border); }
.pa-legend .sw.on { background: var(--accent); border-color: var(--accent); }
.pa-legend .sw.taken { background: #f3f4f6; border-style: dashed; }
.pa-legend .sw.selflay { background: #fef3c7; border-color: #fde68a; }
.pa-actions { display: flex; gap: 7px; margin-top: 10px; }
`;
