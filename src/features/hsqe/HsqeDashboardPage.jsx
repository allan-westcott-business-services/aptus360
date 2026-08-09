import { useState, useEffect, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList } from "../../api/admin.js";
import { StatusPill } from "./NcrListPage.jsx";
import {
  AGING, PALETTE, UNASSIGNED, agingCounts, auditorLabel,
  nextLevel, applyDrill, aggregate, levelValue, DRILL_LEVELS, trimStr, matchesText,
} from "./ncr.js";

/* The HSQE dashboard.

   Four counts, an aging bar, a drill-down breakdown, regions, and the
   reports themselves. Ported from the original app.

   ── The drill-down is the point ──

   The breakdown chart is not a picture of the data, it is a way through
   it: click a slice and everything below narrows to it, including the
   table at the foot. Status, then region, then business unit — but only
   the levels not already used, so somebody who starts by clicking a
   region still has status and business unit ahead of them.

   ── Drawn rather than charted ──

   The original used Chart.js for the donut. That library is already a
   dependency, but only Human Resources pulls it in, and adding it here
   would put 200 kB behind a screen whose chart is twelve slices and a
   click handler. Plain SVG does the same job, and the arithmetic is
   visible rather than configured. */

const size = 240, radius = 92, thickness = 34;

/* A donut segment, as an SVG path. Angles run clockwise from the top,
   which is where somebody expects a chart to start. */
function arc(cx, cy, r, from, to) {
  const p = (a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
  const [x1, y1] = p(from), [x2, y2] = p(to);
  return { x1, y1, x2, y2, large: to - from > Math.PI ? 1 : 0 };
}

function Donut({ slices, onSlice }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) return <p className="hq-none">Nothing to break down.</p>;

  const cx = size / 2, cy = size / 2;
  let angle = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="hq-donut" role="img"
      aria-label={`Breakdown of ${total} reports`}>
      {slices.map((s, i) => {
        const sweep = (s.value / total) * Math.PI * 2;
        const from = angle;
        const to = angle + sweep;
        angle = to;
        const colour = PALETTE[i % PALETTE.length];

        /* A single slice covering everything cannot be drawn as an arc
           — start and end land on the same point and the path
           collapses. Drawn as a ring instead. */
        if (slices.length === 1) {
          return (
            <circle key={s.label} cx={cx} cy={cy} r={radius - thickness / 2}
              fill="none" stroke={colour} strokeWidth={thickness}
              className={onSlice ? "hq-slice" : ""}
              onClick={onSlice ? () => onSlice(s.label) : undefined}>
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
        }

        const outer = arc(cx, cy, radius, from, to);
        const inner = arc(cx, cy, radius - thickness, to, from);
        const d = [
          `M ${outer.x1} ${outer.y1}`,
          `A ${radius} ${radius} 0 ${outer.large} 1 ${outer.x2} ${outer.y2}`,
          `L ${inner.x1} ${inner.y1}`,
          `A ${radius - thickness} ${radius - thickness} 0 ${outer.large} 0 ${inner.x2} ${inner.y2}`,
          "Z",
        ].join(" ");
        return (
          <path key={s.label} d={d} fill={colour}
            className={onSlice ? "hq-slice" : ""}
            onClick={onSlice ? () => onSlice(s.label) : undefined}>
            <title>{`${s.label}: ${s.value}`}</title>
          </path>
        );
      })}
      <text x={cx} y={cy - 4} className="hq-donut-n">{total.toLocaleString("en-GB")}</text>
      <text x={cx} y={cy + 15} className="hq-donut-l">reports</text>
    </svg>
  );
}

export default function HsqeDashboardPage() {
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState({
    statuses: [], regions: [], businessUnits: [], projects: [], dnos: [], idnos: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drill, setDrill] = useState([]);
  const [tableFilter, setTableFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const soft = (t) => adminList(t).catch(() => ({ rows: [] }));
      const [n, st, reg, bu, proj, dno, idno] = await Promise.all([
        adminList("NCR"), soft("NCR_Status"), soft("Region"),
        soft("Business_Unit"), soft("Project"), soft("DNO"), soft("IDNO"),
      ]);
      setRows(n.rows || []);
      setLookups({
        statuses: st.rows || [], regions: reg.rows || [], businessUnits: bu.rows || [],
        projects: proj.rows || [], dnos: dno.rows || [], idnos: idno.rows || [],
      });
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const names = useMemo(() => {
    const by = (list, idKey, nameKey) => {
      const map = new Map((list || []).map((x) => [Number(x[idKey]), x[nameKey]]));
      return (id) => (id == null ? null : map.get(Number(id)) ?? null);
    };
    return {
      status: by(lookups.statuses, "NCR_Status_ID", "NCR_Status"),
      region: by(lookups.regions, "Region_ID", "Region"),
      bu: by(lookups.businessUnits, "Business_Unit_ID", "Business_Unit"),
      dno: by(lookups.dnos, "DNO_ID", "DNO_Name"),
      idno: by(lookups.idnos, "IDNO_ID", "IDNO_Name"),
    };
  }, [lookups]);

  const projectById = useMemo(
    () => new Map((lookups.projects || []).map((p) => [Number(p.Project_ID), p])),
    [lookups.projects]);

  const drilled = useMemo(() => applyDrill(rows, drill, names), [rows, drill, names]);
  const level = nextLevel(drill);
  const slices = useMemo(
    () => (level ? aggregate(drilled, level, names) : []), [drilled, level, names]);

  /* The headline counts are of everything, not of the current drill.
     They are the state of the register, and a "Total" that moved every
     time somebody clicked a slice would be a different measure wearing
     the same label. */
  const byStatus = useMemo(() => {
    const c = {};
    for (const r of rows) {
      const s = names.status(r.NCR_Status_ID) || UNASSIGNED;
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows, names]);

  const total = rows.length;
  const open = byStatus.Open ?? 0;
  const onHold = byStatus["On Hold"] ?? 0;
  const closed = byStatus.Closed ?? 0;
  const aging = useMemo(() => agingCounts(rows, names.status), [rows, names]);

  const regionBars = useMemo(() => aggregate(rows, "region", names).slice(0, 12),
    [rows, names]);

  const tableRows = useMemo(() => {
    const q = tableFilter.trim();
    return drilled.filter((r) => {
      if (!q) return true;
      const project = projectById.get(Number(r.Project_ID));
      return [r.NCR_Reference, project?.Project_Ref, project?.Site_Name,
        names.status(r.NCR_Status_ID), names.region(r.Region_ID), r.Description]
        .some((v) => matchesText(v, q));
    }).slice(0, 200);
  }, [drilled, tableFilter, names, projectById]);

  if (loading) return <p className="hint">Loading HSQE dashboard…</p>;

  const levelLabel = DRILL_LEVELS.find((l) => l.key === level)?.label ?? "";

  return (
    <div className="hq">
      <style>{CSS}</style>

      <div className="hq-head">
        <div>
          <h2>HSQE Dashboard<span className="hq-count">({total.toLocaleString("en-GB")} NCRs)</span></h2>
          <p className="hq-sub">
            The state of the non-compliance register. Click a slice or a region to
            narrow everything below it.
          </p>
        </div>
        <button className="btn sm" onClick={load}>Refresh</button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {!total ? (
        <p className="hq-none">
          No non-compliance reports yet. They appear here as soon as one is raised.
        </p>
      ) : (
        <>
          <div className="hq-kpis">
            <Kpi label="Total NCRs" value={total} note="In the register" colour="#3b82f6" />
            <Kpi label="Open" value={open} colour="#dc2626"
              note={total ? `${Math.round(open / total * 100)}% of all` : ""} />
            <Kpi label="On Hold" value={onHold} colour="#d97706"
              note={total ? `${Math.round(onHold / total * 100)}% of all` : ""} />
            <Kpi label="Closed" value={closed} colour="#059669"
              note={total ? `${Math.round(closed / total * 100)}% resolved` : ""} />
          </div>

          <div className="card hq-aging">
            <div className="hq-card-head">
              <h3>Open NCR aging <span className="hq-note">days since received</span></h3>
              <span className="hq-note">{open.toLocaleString("en-GB")} open</span>
            </div>
            {!open ? (
              <p className="hq-none">No open NCRs to age.</p>
            ) : (
              <>
                <div className="hq-bar">
                  {AGING.map((b) => (aging[b.key] ? (
                    <span key={b.key} style={{ flex: aging[b.key], background: b.colour }}
                      title={`${b.label} days: ${aging[b.key]}`}>{aging[b.key]}</span>
                  ) : null))}
                </div>
                <div className="hq-legend">
                  {AGING.map((b) => (
                    <span key={b.key}>
                      <i style={{ background: b.colour }} />{b.label} days
                      <strong>{aging[b.key]}</strong>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="hq-two">
            <div className="card">
              <div className="hq-card-head">
                <div>
                  <h3>{level ? `By ${levelLabel.toLowerCase()}` : "Fully narrowed"}</h3>
                  <p className="hq-crumbs">
                    <button className="hq-crumb" onClick={() => setDrill([])}>
                      All reports
                    </button>
                    {drill.map((d, i) => (
                      <span key={`${d.level}-${d.label}`}>
                        <span className="hq-sep">{"\u203A"}</span>
                        <button className="hq-crumb"
                          onClick={() => setDrill(drill.slice(0, i + 1))}>{d.label}</button>
                      </span>
                    ))}
                  </p>
                </div>
                {drill.length > 0 && (
                  <button className="btn sm" onClick={() => setDrill(drill.slice(0, -1))}>
                    Back
                  </button>
                )}
              </div>
              {level ? (
                <div className="hq-donut-wrap">
                  <Donut slices={slices}
                    onSlice={(label) => setDrill([...drill, { level, label }])} />
                  <ul className="hq-keys">
                    {slices.map((s, i) => (
                      <li key={s.label}>
                        <button onClick={() => setDrill([...drill, { level, label: s.label }])}>
                          <i style={{ background: PALETTE[i % PALETTE.length] }} />
                          <span className="hq-key-label">{s.label}</span>
                          <strong>{s.value}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="hq-none">
                  Every level applied &mdash; {drilled.length} report
                  {drilled.length === 1 ? "" : "s"} below.
                </p>
              )}
            </div>

            <div className="card">
              <div className="hq-card-head">
                <h3>By region <span className="hq-note">click to narrow</span></h3>
              </div>
              {!regionBars.length ? <p className="hq-none">No region data.</p> : (
                <div className="hq-regions">
                  {regionBars.map((r, i) => {
                    const max = regionBars[0].value || 1;
                    const on = drill.some((d) => d.level === "region" && d.label === r.label);
                    return (
                      <button key={r.label} className={on ? "hq-region on" : "hq-region"}
                        onClick={() => setDrill([
                          ...drill.filter((d) => d.level !== "region"),
                          { level: "region", label: r.label },
                        ])}>
                        <span className="hq-region-label">{r.label}</span>
                        <span className="hq-region-track">
                          <span style={{
                            width: `${(r.value / max) * 100}%`,
                            background: PALETTE[i % PALETTE.length],
                          }} />
                        </span>
                        <strong>{r.value}</strong>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="hq-card-head">
              <h3>
                Reports
                <span className="hq-note">
                  {drilled.length === rows.length
                    ? `all ${rows.length}`
                    : `${drilled.length} of ${rows.length}`}
                  {tableRows.length === 200 ? ", showing the first 200" : ""}
                </span>
              </h3>
              <input className="hq-search" value={tableFilter} placeholder="Search…"
                onChange={(e) => setTableFilter(e.target.value)} />
            </div>
            <div className="hq-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ref</th><th>Project</th><th>Site</th><th>Status</th>
                    <th>Region</th><th>Business Unit</th><th>Auditor</th><th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {!tableRows.length && (
                    <tr><td className="hq-empty" colSpan={8}>No reports match.</td></tr>
                  )}
                  {tableRows.map((r) => {
                    const project = projectById.get(Number(r.Project_ID));
                    return (
                      <tr key={r.NCR_ID}>
                        <td className="hq-ref">{r.NCR_Reference}</td>
                        <td>{project?.Project_Ref ?? dash()}</td>
                        <td>{project?.Site_Name ?? dash()}</td>
                        <td><StatusPill status={names.status(r.NCR_Status_ID) ?? ""} /></td>
                        <td>{names.region(r.Region_ID) ?? dash()}</td>
                        <td>{names.bu(r.Business_Unit_ID) ?? dash()}</td>
                        <td>{auditorLabel(r, { dnoName: names.dno, idnoName: names.idno })}</td>
                        <td>{trimStr(r.Date_Received) || dash()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const dash = () => <span className="hq-dash">{"\u2014"}</span>;

function Kpi({ label, value, note, colour }) {
  return (
    <div className="card hq-kpi" style={{ "--kpi": colour }}>
      <div className="hq-kpi-label">{label}</div>
      <div className="hq-kpi-value">{value.toLocaleString("en-GB")}</div>
      <div className="hq-kpi-note">{note}</div>
    </div>
  );
}

const CSS = `
.hq-head { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.hq-head h2 { margin: 0; font-size: 18px; }
.hq-count { font-size: 12px; font-weight: 500; color: var(--muted); margin-left: 8px; }
.hq-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 76ch; }
.hq-note { font-size: 11.5px; font-weight: 500; color: var(--muted); margin-left: 8px; }
.hq-none { padding: 30px; text-align: center; color: var(--muted); font-size: 12.5px;
  font-style: italic; margin: 0; }
.hq-card-head { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.hq-card-head h3 { margin: 0; font-size: 14px; font-weight: 700; }

.hq-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px; margin-bottom: 14px; }
.hq-kpi { padding: 15px 17px; border-left: 4px solid var(--kpi); }
.hq-kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; color: var(--muted); }
.hq-kpi-value { font-size: 26px; font-weight: 700; margin-top: 4px; color: var(--kpi);
  letter-spacing: -.02em; }
.hq-kpi-note { font-size: 11.5px; color: var(--muted); }

.hq-aging { margin-bottom: 14px; }
.hq-bar { display: flex; height: 36px; gap: 2px; margin-bottom: 10px; }
.hq-bar span { display: flex; align-items: center; justify-content: center; color: #fff;
  font-weight: 700; font-size: 12px; border-radius: 5px; min-width: 22px; }
.hq-legend { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 11.5px;
  color: var(--muted); }
.hq-legend span { display: flex; align-items: center; gap: 5px; }
.hq-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.hq-legend strong { color: var(--text); }

.hq-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(390px, 1fr));
  gap: 14px; margin-bottom: 14px; }
.hq-crumbs { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.7; }
.hq-crumb { background: none; border: none; padding: 0; cursor: pointer; font: inherit;
  color: var(--accent); }
.hq-crumb:hover { text-decoration: underline; }
.hq-sep { margin: 0 5px; }

.hq-donut-wrap { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
.hq-donut { width: 200px; height: 200px; flex: none; }
.hq-slice { cursor: pointer; transition: opacity .12s; }
.hq-slice:hover { opacity: .8; }
.hq-donut-n { text-anchor: middle; font-size: 26px; font-weight: 700; fill: var(--text); }
.hq-donut-l { text-anchor: middle; font-size: 11px; fill: var(--muted); }
.hq-keys { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 150px;
  max-height: 200px; overflow-y: auto; }
.hq-keys button { display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; padding: 5px 6px; cursor: pointer; font: inherit;
  font-size: 12.5px; text-align: left; border-radius: 6px; }
.hq-keys button:hover { background: var(--bg); }
.hq-keys i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.hq-key-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.hq-regions { display: flex; flex-direction: column; gap: 5px; }
.hq-region { display: flex; align-items: center; gap: 10px; background: none;
  border: 1px solid transparent; border-radius: 7px; padding: 5px 8px; cursor: pointer;
  font: inherit; font-size: 12.5px; text-align: left; }
.hq-region:hover { background: var(--bg); }
.hq-region.on { background: var(--accent-light); border-color: #bfdbfe; }
.hq-region-label { width: 120px; flex: none; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.hq-region-track { flex: 1; height: 14px; background: var(--bg); border-radius: 7px;
  overflow: hidden; }
.hq-region-track span { display: block; height: 100%; border-radius: 7px; }

.hq-search { font: 500 12.5px inherit; padding: 6px 10px; border: 1px solid var(--border);
  border-radius: 7px; min-width: 180px; }
.hq-scroll { overflow: auto; max-height: 460px; border: 1px solid var(--border);
  border-radius: var(--radius); }
.hq-scroll table { border-collapse: separate; border-spacing: 0; width: 100%;
  font-size: 12.5px; }
.hq-scroll th { position: sticky; top: 0; background: var(--bg); text-align: left;
  padding: 8px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .03em; color: var(--muted); border-bottom: 1px solid var(--border); }
.hq-scroll td { padding: 7px 10px; border-bottom: 1px solid #f1f3f6; }
.hq-scroll tbody tr:hover td { background: var(--accent-light); }
.hq-ref { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; font-weight: 600; }
.hq-dash { color: var(--muted); }
.hq-empty { text-align: center; padding: 32px; color: var(--muted); font-style: italic; }
`;
