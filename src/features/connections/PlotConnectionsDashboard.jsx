/* The Plot Connections dashboard.

   Ported from the original Aptus360. Three parent dashboards —
   Jointing, Admin, Project Manager — each holding cards that count
   rows of Plot_Utility in a state they should not be in. Underneath
   the parents sit the KPIs and a breakdown of missing job packs by
   team.

   The rules are in dashboardMetrics.js and checked by
   checkconnectionsdashboard.mjs. Nothing in here decides what a card
   counts; this file decides what it looks like. A card showing 412 is
   as convincing when the predicate is wrong as when it is right, which
   is why the two are kept apart and only one of them is tested.

   ── What is NOT ported ──

   The original's Admin section also carries a Service Cards card
   reading a WI_Submission table, and the toolbar offers a water
   invoicing report. Neither exists in this system yet, so neither is
   drawn — an empty card promising a report nobody can run is worse
   than its absence. */
import { useState, useEffect, useMemo } from "react";
import { getLookups } from "../../api/lookups.js";
import { utilityById } from "../../lib/utilities.js";
import { listDashboardConnections } from "../../api/connections.js";
import {
  SECTIONS, KPIS, metricsFor, buildCtx, computeMetrics, computeKpis,
  packByTeam, fmtRange,
} from "./dashboardMetrics.js";

const fmtDate = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "");

export default function PlotConnectionsDashboard({ onOpenRows }) {
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [section, setSection] = useState("home");
  const [region, setRegion] = useState("");
  const [drill, setDrill] = useState(null);
  /* Kept across visits: a KPI window somebody set is a thing about
     how they work, not about this page load. */
  const [kpiStart, setKpiStart] = useState(() => {
    try { return localStorage.getItem("pcDashKpiStart") || ""; } catch { return ""; }
  });

  async function load() {
    setLoading(true);
    try {
      const [lk, res] = await Promise.all([getLookups(), listDashboardConnections()]);
      setLookups(lk);
      setRows(res.connections || []);
      setTruncated(!!res.truncated);
      setLoadedAt(new Date());
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  /* The resolvers that turn this system's ids into the words the
     predicates read. Matching on the word rather than the id is
     deliberate — see dashboardMetrics.js. */
  const ctx = useMemo(() => {
    const byId = (list, idKey, nameKey) => (id) =>
      (list || []).find((x) => String(x[idKey]) === String(id))?.[nameKey];
    return buildCtx({
      /* The utility comes from lib/utilities.js, not from the lookups
         payload — that is where the rest of the app reads it and the
         file says it was confirmed against the database rather than
         inferred. A second source for the same six names is how a
         dashboard ends up disagreeing with the table beside it. */
      utility: (id) => utilityById(id)?.name,
      outcome: byId(lookups?.visitOutcomes, "Visit_Outcome_ID", "Visit_Outcome"),
      packStatus: byId(lookups?.packStatuses, "Pack_Status_ID", "Pack_Status"),
    });
  }, [lookups]);

  const scoped = useMemo(() => (region
    ? rows.filter((r) => String(r._regionId ?? "") === String(region))
    : rows), [rows, region]);

  const metrics = useMemo(() => computeMetrics(scoped, ctx), [scoped, ctx]);
  const kpis = useMemo(() => computeKpis(scoped, ctx, kpiStart), [scoped, ctx, kpiStart]);
  const packs = useMemo(() => packByTeam(scoped, ctx,
    (id) => (lookups?.teams || []).find((t) => t.Team_ID === id)?.Team_Name),
  [scoped, ctx, lookups]);

  const current = SECTIONS.find((s) => s.id === section);

  function setStart(v) {
    setKpiStart(v);
    try { if (v) localStorage.setItem("pcDashKpiStart", v); else localStorage.removeItem("pcDashKpiStart"); }
    catch { /* a browser refusing storage is not a reason to fail */ }
  }

  const regionNote = region
    ? ` Showing ${(lookups?.regions || []).find((x) => String(x.Region_ID) === String(region))?.Region || "one region"} only.`
    : "";

  if (loading) return <div className="pcd-wait">Loading the dashboard…</div>;

  return (
    <div className="pcd">
      <div className="pcd-bar">
        {section === "home"
          ? <button className="btn ghost" onClick={() => onOpenRows?.(null)}>← Back to Plot Connections</button>
          : <button className="btn ghost" onClick={() => { setSection("home"); setDrill(null); }}>← Back to Dashboard</button>}
        <h2>{current ? current.title : "Plot Connections Dashboard"}</h2>
        <span className="pcd-asof">
          {loadedAt ? `as of ${loadedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
        <select className="in" value={region} onChange={(e) => setRegion(e.target.value)}
          aria-label="Region">
          <option value="">All regions</option>
          {(lookups?.regions || []).map((r) => (
            <option key={r.Region_ID} value={r.Region_ID}>{r.Region}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn ghost" onClick={load}>↻ Refresh</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {truncated && (
        <div className="pcd-warn" role="status">
          Not every connection reached this page, so these counts are
          incomplete.
        </div>
      )}

      <div className="pcd-body">
        {section === "home" ? (
          <>
            <p className="pcd-lead">Choose a dashboard to see its cards.{regionNote}</p>
            <div className="pcd-grid">
              {SECTIONS.map((s) => {
                const kids = metricsFor(s.id);
                const total = kids.reduce((n, m) => n + (metrics[m.id]?.count || 0), 0);
                return (
                  <Card key={s.id} icon={s.icon} title={s.title} count={total}
                    accent={s.accent} enabled={kids.length > 0}
                    description={`${s.description} ${kids.length} card${kids.length !== 1 ? "s" : ""}.`}
                    cta="Open dashboard →" onClick={() => setSection(s.id)} />
                );
              })}
            </div>

            <div className="pcd-kpihead">
              <div>
                <p className="pcd-h">Key Performance Indicators</p>
                <p className="pcd-sub">
                  Lead times in calendar days; on-time and previous-week measures
                  use working days (Mon–Fri).{" "}
                  {kpiStart
                    ? <>Counting only plots dated on or after <strong>{fmtDate(kpiStart)}</strong>.</>
                    : "Counting all available history."}
                </p>
              </div>
              <div className="pcd-kpidate">
                <label htmlFor="pcd-start">KPIs from</label>
                <input id="pcd-start" className="in" type="date" value={kpiStart}
                  onChange={(e) => setStart(e.target.value)} />
                <button className="btn ghost" disabled={!kpiStart}
                  onClick={() => setStart("")}>Clear</button>
              </div>
            </div>
            <div className="pcd-grid">
              {KPIS.map((k) => {
                const v = kpis[k.id] || {};
                return (
                  <div key={k.id} className="pcd-card pcd-static">
                    <div className="pcd-top">
                      <span className="pcd-icon" style={{ color: k.accent }}>{k.icon}</span>
                      <span className="pcd-title">{k.title}</span>
                    </div>
                    <div className="pcd-count" style={{ color: v.empty ? "#9ca3af" : k.accent }}>
                      {v.display}{v.unit ? <span className="pcd-unit"> {v.unit}</span> : null}
                    </div>
                    <div className="pcd-desc">{k.description}</div>
                    {v.sub ? <div className="pcd-note">{v.sub}</div> : null}
                  </div>
                );
              })}
            </div>

            <p className="pcd-h" style={{ marginTop: 28 }}>Missing job packs by team</p>
            <p className="pcd-sub">
              Programmed more than two working days ago and still Issued or Pack
              In Progress. Worst first.
            </p>
            {packs.length === 0
              ? <p className="pcd-none">No job packs outstanding.</p>
              : (
                <table className="pcd-table">
                  <thead>
                    <tr><th>Team</th><th>Electric</th><th>Gas</th><th>Water</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {packs.map((t) => (
                      <tr key={t.team}>
                        <td>{t.team}</td><td>{t.electric}</td><td>{t.gas}</td>
                        <td>{t.water}</td><td><strong>{t.total}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </>
        ) : (
          <>
            <p className="pcd-lead">
              Click a card to see the rows behind it.{regionNote}
            </p>
            <div className="pcd-grid">
              {metricsFor(section).map((m) => {
                const d = metrics[m.id] || { count: 0 };
                return (
                  <Card key={m.id} icon={m.icon} title={m.title} count={d.count}
                    accent={m.accent} description={m.description}
                    enabled={d.count > 0} cta="See the rows →"
                    onClick={() => setDrill(drill?.id === m.id ? null : { id: m.id, def: m })} />
                );
              })}
            </div>
            {drill && <Drill metric={drill.def} rows={metrics[drill.id]?.rows || []}
              ctx={ctx} onOpenRows={onOpenRows} onClose={() => setDrill(null)} />}
          </>
        )}
      </div>

      <style>{CSS}</style>
    </div>
  );
}

function Card({ icon, title, count, description, accent, cta, onClick, enabled = true }) {
  const inner = (
    <>
      <div className="pcd-top">
        <span className="pcd-icon" style={{ color: accent }}>{icon}</span>
        <span className="pcd-title">{title}</span>
      </div>
      <div className="pcd-count" style={{ color: enabled ? accent : "#9ca3af" }}>
        {count === null ? "—" : count.toLocaleString()}
      </div>
      <div className="pcd-desc">{description}</div>
      {enabled && cta ? <div className="pcd-cta" style={{ color: accent }}>{cta}</div> : null}
    </>
  );
  /* A card with nothing behind it is not a button. Clicking through to
     an empty list is a worse answer than a card that plainly has
     nothing to show. */
  if (!enabled) return <div className="pcd-card pcd-off">{inner}</div>;
  return (
    <button className="pcd-card" onClick={onClick}
      style={{ "--pcd-accent": accent }}>{inner}</button>
  );
}

/* The rows behind a card. Capped, because "Daily Plot Connections"
   can run to thousands and this page has already been frozen once by
   a table that rendered everything it had. */
const DRILL_MAX = 200;

function Drill({ metric, rows, ctx, onOpenRows, onClose }) {
  const shown = rows.slice(0, DRILL_MAX);
  return (
    <div className="pcd-drill">
      <div className="pcd-drillbar">
        <strong>{metric.title}</strong>
        <span className="pcd-sub">{rows.length.toLocaleString()} rows</span>
        <div style={{ flex: 1 }} />
        {onOpenRows && (
          <button className="btn ghost"
            onClick={() => onOpenRows(rows.map((r) => r.Plot_Utility_ID))}>
            Open in Plot Connections →
          </button>
        )}
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <table className="pcd-table">
        <thead>
          <tr>
            <th>AP number</th><th>Project</th><th>Plot</th><th>Utility</th>
            <th>Programmed</th><th>Connected</th><th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.Plot_Utility_ID}>
              <td>{r._apNumber || "—"}</td>
              <td>{r._projectRef || "—"}</td>
              <td>{r._plotNumber || "—"}</td>
              {/* The proper name, not ctx.utilityOf — that one is
                  lower-cased for matching and reads as "electric" in a
                  column every other screen spells "Electric". */}
              <td>{utilityById(r.Utility_ID)?.name || "—"}</td>
              <td>{fmtDate(r.Programmed_Date) || "—"}</td>
              <td>{fmtDate(r.Connection_Date) || "—"}</td>
              <td>{ctx.outcomeOf(r) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > DRILL_MAX && (
        <p className="pcd-note" style={{ padding: "8px 12px" }}>
          Showing the first {DRILL_MAX} of {rows.length.toLocaleString()}.
          Open them in Plot Connections to work through the rest.
        </p>
      )}
    </div>
  );
}

const CSS = `
.pcd { display:flex; flex-direction:column; min-height:0; }
.pcd-wait { padding:60px; text-align:center; color:var(--muted); }
.pcd-bar { display:flex; flex-wrap:wrap; gap:12px; align-items:center; padding:4px 0 14px; }
.pcd-bar h2 { margin:0; flex:none; font-size:18px; }
.pcd-asof { font-size:12px; color:var(--muted); }
/* The app's .in is full width, which made the region picker eat the
   toolbar and push Refresh onto a line of its own. */
.pcd-bar .in { padding:6px 10px; font-size:13px; width:auto; min-width:160px; flex:none; }
.pcd-kpidate .in { width:auto; }
.pcd-warn { margin:0 0 12px; padding:8px 12px; border-radius:6px;
  background:#fff4e5; border:1px solid #f0c48a; color:#6b4a16; font-size:13px; }
.pcd-body { padding:4px 0 40px; }
.pcd-lead { margin:0 0 16px; font-size:13px; color:var(--muted); }
.pcd-h { margin:0 0 4px; font-size:15px; font-weight:700; }
.pcd-sub { margin:0; font-size:12px; color:var(--muted); }
.pcd-none { font-size:13px; color:var(--muted); padding:12px 0; }
.pcd-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
.pcd-card { text-align:left; background:#fff; border:2px solid var(--border);
  border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:10px;
  min-height:170px; box-shadow:0 1px 3px rgba(0,0,0,.04); transition:.15s;
  font:inherit; color:inherit; }
button.pcd-card { cursor:pointer; }
button.pcd-card:hover { border-color:var(--pcd-accent); box-shadow:0 4px 14px rgba(0,0,0,.08); }
.pcd-off { background:#f9fafb; border-style:dashed; }
.pcd-static { cursor:default; }
.pcd-top { display:flex; align-items:center; gap:8px; }
.pcd-icon { font-size:24px; line-height:1; }
.pcd-title { font-size:13px; font-weight:700; line-height:1.3; }
.pcd-count { font-size:36px; font-weight:700; line-height:1; }
.pcd-unit { font-size:15px; font-weight:600; }
.pcd-desc { font-size:11px; color:var(--muted); line-height:1.4; flex:1; }
.pcd-note { font-size:11px; color:var(--muted); }
.pcd-cta { font-size:11px; font-weight:600; }
.pcd-kpihead { display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px; margin:28px 0 14px; }
.pcd-kpihead > div:first-child { flex:1; min-width:240px; }
.pcd-kpidate { display:flex; align-items:center; gap:8px; }
.pcd-kpidate label { font-size:12px; font-weight:600; white-space:nowrap; text-transform:none; letter-spacing:0; }
.pcd-kpidate .in { padding:6px 10px; font-size:13px; width:auto; }
.pcd-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:10px; }
.pcd-table th { text-align:left; padding:8px 10px; background:#1e3a5f; color:#fff;
  font-weight:600; font-size:11px; letter-spacing:.04em; }
.pcd-table td { padding:7px 10px; border-bottom:1px solid var(--border); }
.pcd-drill { margin-top:20px; border:1px solid var(--border); border-radius:10px; overflow:hidden; }
.pcd-drillbar { display:flex; align-items:center; gap:10px; padding:10px 12px; background:#f0f4f8; }
.pcd-drill .pcd-table { margin:0; }
`;
