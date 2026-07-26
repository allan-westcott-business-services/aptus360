import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listProjects } from "../../api/projects.js";
import { UTILITIES } from "../../lib/utilities.js";

/* Projects table, modelled on the Tenders page of the original app:
   configurable columns, global search, sortable headers, priority rows
   pinned to the top, and a clock once the KPI date has passed. */

const COLUMNS = [
  { key: "ref",      label: "Project Ref", width: 110 },
  { key: "rev",      label: "Rev",         width: 46,  align: "center" },
  { key: "sitename", label: "Site Name",   width: 190 },
  { key: "date",     label: "Date Received", width: 108 },
  { key: "kpi",      label: "KPI Date",    width: 108 },
  { key: "cust",     label: "Customer",    width: 170 },
  { key: "region",   label: "Region",      width: 100 },
  { key: "qt",       label: "Quote Type",  width: 100 },
  { key: "plots",    label: "Plots",       width: 60,  align: "right" },
  { key: "status",   label: "Status",      width: 130 },
  { key: "scopes",   label: "Scopes",      width: 130 },
  { key: "bdd",      label: "BDD / KAM",   width: 130 },
  { key: "est",      label: "Estimator",   width: 130 },
  { key: "iandc",    label: "I & C",       width: 54,  align: "center" },
  { key: "g2g",      label: "Good to Go",  width: 108 },
  { key: "secured",  label: "Secured Date", width: 108 },
];

const PREFS_KEY = "aptus_projectColumnPrefs";

function loadPrefs() {
  const def = { order: COLUMNS.map((c) => c.key), hidden: [] };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    const valid = new Set(def.order);
    const order = (parsed.order || []).filter((k) => valid.has(k));
    // Append columns added since the user last customised their layout.
    def.order.forEach((k) => !order.includes(k) && order.push(k));
    return { order, hidden: (parsed.hidden || []).filter((k) => valid.has(k)) };
  } catch {
    return def;
  }
}

const savePrefs = (p) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private browsing — prefs just won't persist */
  }
};

const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const today = () => new Date().toISOString().slice(0, 10);
const kpiReached = (d) => d && String(d).slice(0, 10) <= today();

export default function ProjectsList({ onOpen }) {
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [prefs, setPrefs] = useState(loadPrefs);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", region: "", quoteType: "" });

  useEffect(() => {
    let live = true;
    Promise.all([getLookups(), listProjects({ limit: 500 })])
      .then(([lk, res]) => {
        if (!live) return;
        setLookups(lk);
        setRows(res.rows || []);
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const name = (list, idKey, nameKey, id) =>
    list?.find((x) => x[idKey] === id)?.[nameKey] ?? "";

  const cell = useMemo(() => {
    if (!lookups) return {};
    const l = lookups;
    return {
      ref: (p) => p.Project_Ref,
      rev: (p) => (p.Revision ? `r${p.Revision}` : ""),
      sitename: (p) => p.Site_Name,
      date: (p) => fmtDate(p.Date_Received),
      kpi: (p) => fmtDate(p.KPI_Date),
      cust: (p) => name(l.customers, "Customer_ID", "Customer_Name", p.Customer_ID),
      region: (p) => name(l.regions, "Region_ID", "Region", p.Region_ID),
      qt: (p) => name(l.quoteTypes, "Quote_Type_ID", "Quote_Type", p.Quote_Type_ID),
      plots: (p) => p.Plot_Count ?? 0,
      status: (p) => name(l.projectStatuses, "Project_Status_ID", "Status", p.Project_Status_ID),
      scopes: (p) => (p.scopes || []).length,
      bdd: (p) => name(l.people, "Person_ID", "Person_Name", p.BDD_KAM_ID),
      est: (p) => name(l.people, "Person_ID", "Person_Name", p.Estimator_ID),
      iandc: (p) => (p.I_and_C ? "Y" : ""),
      g2g: (p) => fmtDate(p.Good_To_Go),
      secured: (p) => fmtDate(p.Secured_Date),
    };
  }, [lookups]);

  const visible = prefs.order
    .filter((k) => !prefs.hidden.includes(k))
    .map((k) => COLUMNS.find((c) => c.key === k))
    .filter(Boolean);

  const filtered = useMemo(() => {
    if (!lookups) return [];
    const q = search.trim().toLowerCase();
    let out = rows.filter((p) => {
      if (filters.status && String(p.Project_Status_ID) !== filters.status) return false;
      if (filters.region && String(p.Region_ID) !== filters.region) return false;
      if (filters.quoteType && String(p.Quote_Type_ID) !== filters.quoteType) return false;
      if (!q) return true;
      const hay = [
        p.Project_Ref, p.Site_Name, p.Site_Address, p.Postcode,
        cell.cust?.(p), cell.region?.(p), cell.bdd?.(p), cell.est?.(p), cell.status?.(p),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    const get = cell[sort.key] || (() => "");
    out = [...out].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });

    // Priority rows sit above everything, as in the original.
    return [...out.filter((p) => p.Is_Priority), ...out.filter((p) => !p.Is_Priority)];
  }, [rows, search, sort, filters, cell, lookups]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function toggleColumn(key) {
    setPrefs((p) => {
      const hidden = p.hidden.includes(key) ? p.hidden.filter((k) => k !== key) : [...p.hidden, key];
      const next = { ...p, hidden };
      savePrefs(next);
      return next;
    });
  }

  function resetColumns() {
    const def = { order: COLUMNS.map((c) => c.key), hidden: [] };
    setPrefs(def);
    savePrefs(def);
  }

  if (loading) return <div className="loading">Loading projects&hellip;</div>;
  if (error) return <Banner kind="error">Couldn&rsquo;t load projects: {error}</Banner>;

  return (
    <div>
      <style>{CSS}</style>

      <div className="list-head">
        <div>
          <h2>Projects</h2>
          <p className="page-sub">
            {filtered.length} of {rows.length} shown
          </p>
        </div>
        <div className="list-tools">
          <input
            className="search"
            value={search}
            placeholder="Search ref, site, customer, person&hellip;"
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="col-menu-wrap">
            <button className="btn ghost" onClick={() => setMenuOpen((o) => !o)}>
              Columns
            </button>
            {menuOpen && (
              <div className="col-menu">
                <div className="col-menu-head">
                  <span>Show columns</span>
                  <button onClick={resetColumns}>Reset</button>
                </div>
                {COLUMNS.map((c) => (
                  <label key={c.key} className="col-opt">
                    <input
                      type="checkbox"
                      checked={!prefs.hidden.includes(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="filter-row">
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {(lookups.projectStatuses || []).map((s) => (
            <option key={s.Project_Status_ID} value={s.Project_Status_ID}>
              {s.Stage} &middot; {s.Status}
            </option>
          ))}
        </select>
        <select value={filters.region} onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value }))}>
          <option value="">All regions</option>
          {(lookups.regions || []).map((r) => (
            <option key={r.Region_ID} value={r.Region_ID}>{r.Region}</option>
          ))}
        </select>
        <select value={filters.quoteType} onChange={(e) => setFilters((f) => ({ ...f, quoteType: e.target.value }))}>
          <option value="">All quote types</option>
          {(lookups.quoteTypes || []).map((q) => (
            <option key={q.Quote_Type_ID} value={q.Quote_Type_ID}>{q.Quote_Type}</option>
          ))}
        </select>
        {(filters.status || filters.region || filters.quoteType || search) && (
          <button className="clear-filters" onClick={() => { setFilters({ status: "", region: "", quoteType: "" }); setSearch(""); }}>
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No projects match</p>
          <p>Try clearing the search or filters.</p>
        </div>
      ) : (
        <div className="proj-table-wrap">
          <table className="proj-table">
            <thead>
              <tr>
                {visible.map((c) => (
                  <th
                    key={c.key}
                    style={{ minWidth: c.width, textAlign: c.align || "left" }}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    {sort.key === c.key && <span className="arrow">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.Project_ID} onClick={() => onOpen && onOpen(p)} className={p.Is_Priority ? "priority" : ""}>
                  {visible.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align || "left" }}>
                      {c.key === "ref" && p.Is_Priority && <span className="pri" title="Priority">&#9733;</span>}
                      {c.key === "status" ? (
                        <span className="pill">{cell.status(p)}</span>
                      ) : c.key === "scopes" ? (
                        <ScopeDots scopes={p.scopes} />
                      ) : c.key === "kpi" ? (
                        <>
                          {cell.kpi(p)}
                          {kpiReached(p.KPI_Date) && (
                            <span className="clock" title="KPI date reached">&#9200;</span>
                          )}
                        </>
                      ) : (
                        cell[c.key](p)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScopeDots({ scopes = [] }) {
  if (!scopes.length) return <span className="muted-dash">&mdash;</span>;
  return (
    <span className="dots">
      {scopes.map((s, i) => {
        const u = UTILITIES.find((x) => x.id === s.Utility_ID);
        return (
          <span key={i} className="dot" style={{ background: u?.colour ?? "#94a3b8" }} title={u?.name ?? "Scope"} />
        );
      })}
    </span>
  );
}

const CSS = `
.list-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.list-head h2 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
.list-tools { display: flex; gap: 8px; align-items: flex-start; }
.search { width: 260px; }

.col-menu-wrap { position: relative; }
.col-menu {
  position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 25;
  background: var(--white); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 6px 20px rgba(0,0,0,.12); padding: 8px; width: 190px; max-height: 340px; overflow-y: auto;
}
.col-menu-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  color: var(--muted); padding: 2px 4px 8px; border-bottom: 1px solid var(--border); margin-bottom: 6px;
}
.col-menu-head button { background: none; border: none; cursor: pointer; color: var(--accent); font: inherit; }
.col-opt { display: flex; align-items: center; gap: 7px; font-size: 12.5px; padding: 4px;
  text-transform: none; letter-spacing: 0; color: var(--text); font-weight: 400; margin: 0; cursor: pointer; }
.col-opt input { width: auto; }

.filter-row { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
.filter-row select { width: auto; min-width: 150px; }
.clear-filters { background: none; border: none; color: var(--accent); font: 600 12.5px inherit; cursor: pointer; }

.proj-table-wrap { border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; max-height: 68vh; }
.proj-table { width: 100%; border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
.proj-table th {
  position: sticky; top: 0; z-index: 1; background: var(--accent); color: #fff;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  padding: 8px 10px; cursor: pointer; user-select: none; text-align: left;
}
.proj-table th:hover { background: var(--accent-dark); }
.arrow { margin-left: 4px; font-size: 8px; }
.proj-table td { padding: 7px 10px; border-top: 1px solid var(--border); }
.proj-table tbody tr { cursor: pointer; }
.proj-table tbody tr:nth-child(even) { background: #fafbfc; }
.proj-table tbody tr:hover { background: var(--accent-light); }
.proj-table tbody tr.priority td { background: #fffbeb; }
.proj-table tbody tr.priority:hover td { background: #fef3c7; }
.pri { color: #d97706; margin-right: 4px; }
.pill {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px; background: var(--accent-light); color: var(--accent); border: 1px solid #bfdbfe;
}
.clock { margin-left: 5px; font-size: 12px; }
.dots { display: inline-flex; gap: 3px; }
.dots .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.muted-dash { color: var(--muted); }
.empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
