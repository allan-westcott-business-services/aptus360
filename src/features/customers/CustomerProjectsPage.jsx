import { useState, useEffect, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { listProjects } from "../../api/projects.js";
import { getLookups } from "../../api/lookups.js";
import ProjectDetail from "../projects/ProjectDetail.jsx";

/* Customer branches, with their projects underneath.

   Grouped by branch rather than customer, because that is the level work
   is actually placed at: Anwyl Homes Lancashire and Anwyl Homes Wales
   run separate programmes with separate contacts, and rolling them
   together answers a question nobody asks.

   Collapsed by default. A branch with forty projects is one line until
   you want the detail, which is the point of grouping at all. */

const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "\u2014");

export default function CustomerProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState({});
  const [search, setSearch] = useState("");
  const [hideClosed, setHideClosed] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      /* Everything, not a page: the point is a complete picture per
         customer, and a truncated list would quietly under-report. */
      const [p, lk] = await Promise.all([listProjects({ limit: 5000 }), getLookups()]);
      setProjects(p.rows || []);
      setLookups(lk);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusById = useCallback(
    (id) => (lookups?.projectStatuses || []).find((s) => s.Project_Status_ID === id),
    [lookups]
  );
  const personName = useCallback(
    (id) => (lookups?.people || []).find((p) => p.Person_ID === id)?.Person_Name ?? "\u2014",
    [lookups]
  );

  const groups = useMemo(() => {
    if (!lookups) return [];
    const branches = lookups.branches || [];
    const customers = lookups.customers || [];
    const q = search.trim().toLowerCase();

    const rows = projects.filter((p) =>
      !(hideClosed && statusById(p.Project_Status_ID)?.Is_Terminal));

    const byBranch = new Map();
    for (const p of rows) {
      const key = p.Branch_ID ?? 0;
      if (!byBranch.has(key)) byBranch.set(key, []);
      byBranch.get(key).push(p);
    }

    /* Every branch, including those with nothing on. A branch absent from
       the list reads as "no such branch" rather than "no live work", and
       the two matter differently to whoever is asking.

       Branch_Dropdown already reads "Anwyl Homes (Wales)" — it is
       maintained by a trigger, so it follows a customer rename without
       anything here having to join. */
    const custName = (id) =>
      customers.find((c) => c.Customer_ID === id)?.Customer_Name ?? "";
    const out = branches.map((b) => ({
      id: b.Branch_ID,
      name: b.Branch_Dropdown || `${custName(b.Customer_ID)} (${b.Branch_Name})`,
      customer: custName(b.Customer_ID),
      projects: (byBranch.get(b.Branch_ID) || [])
        .sort((a, b2) => String(b2.Project_Ref).localeCompare(String(a.Project_Ref))),
    }));

    const orphans = byBranch.get(0) || [];
    if (orphans.length) out.push({ id: 0, name: "No branch set", customer: "", projects: orphans });

    return out
      .filter((g) => !q
        || g.name.toLowerCase().includes(q)
        || g.customer.toLowerCase().includes(q)
        || g.projects.some((p) => `${p.Project_Ref} ${p.Site_Name}`.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, lookups, search, hideClosed, statusById]);

  const totals = useMemo(() => ({
    branches: groups.length,
    withWork: groups.filter((g) => g.projects.length > 0).length,
    projects: groups.reduce((t, g) => t + g.projects.length, 0),
  }), [groups]);

  if (selected) {
    return (
      <ProjectDetail
        project={selected}
        onBack={() => { setSelected(null); load(); }}
        onOpenOption={(o) => setSelected({ ...selected, ...o })}
      />
    );
  }

  if (loading) return <div className="loading">Loading customers&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>

      <div className="ph-head">
        <div>
          <h2 className="admin-title">Customer branches &amp; projects</h2>
          <p className="tab-sub">
            {totals.withWork} of {totals.branches} branches with{" "}
            {totals.projects} project{totals.projects === 1 ? "" : "s"}
            {hideClosed ? " open" : ""}. Open one to see them.
          </p>
        </div>
        <div className="ph-actions">
          <input className="cp-search" value={search} placeholder="Branch, customer, ref or site&hellip;"
            onChange={(e) => setSearch(e.target.value)} />
          <label className={hideClosed ? "cp-chk on" : "cp-chk"}>
            <input type="checkbox" checked={hideClosed}
              onChange={(e) => setHideClosed(e.target.checked)} />
            Open only
          </label>
          <button className="btn ghost"
            onClick={() => setOpen(groups.reduce((a, g) => ({ ...a, [g.id]: true }), {}))}>
            Expand all
          </button>
          <button className="btn ghost" onClick={() => setOpen({})}>Collapse all</button>
          <button className="btn ghost" onClick={() => { setLoading(true); load(); }}>
            &#8635; Refresh
          </button>
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {groups.length === 0 && (
        <p className="cp-none">No customer matches that.</p>
      )}

      <div className="cp-list">
        {groups.map((g) => {
          const isOpen = !!open[g.id];
          const secured = g.projects.filter((p) => p.Secured_Date).length;
          return (
            <div className={isOpen ? "cp-cust open" : "cp-cust"} key={g.id}>
              <button className="cp-head"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
                <span className="cp-caret">{isOpen ? "\u25BE" : "\u25B8"}</span>
                <span className="cp-name">{g.name}</span>
                {g.projects.length === 0 ? (
                  <span className="cp-empty">nothing {hideClosed ? "open" : "recorded"}</span>
                ) : (
                  <>
                    <span className="cp-n">{g.projects.length}</span>
                    {secured > 0 && <span className="cp-sec">{secured} secured</span>}
                  </>
                )}
              </button>

              {isOpen && g.projects.length > 0 && (
                <div className="dt-wrap cp-wrap">
                  <table className="dt cp">
                    <thead>
                      <tr className="head-row">
                        <th style={{ width: 110 }}>Ref</th>
                        <th style={{ width: 46 }}>Rev</th>
                        <th>Site</th>
                        <th style={{ width: 130 }}>Status</th>
                        <th style={{ width: 110 }}>Received</th>
                        <th style={{ width: 110 }}>Secured</th>
                        <th style={{ width: 140 }}>BDD / KAM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.projects.map((p) => {
                        const st = statusById(p.Project_Status_ID);
                        return (
                          <tr key={p.Project_ID} className="cp-row"
                            onClick={() => setSelected(p)}
                            /* The status colour set in Admin, same as the
                               projects list, so a row means the same thing
                               on both screens. */
                            style={st?.Row_Colour ? { background: st.Row_Colour } : undefined}>
                            <td className="mono strong">{p.Project_Ref}</td>
                            <td className="mono">{p.Revision ?? 0}</td>
                            <td>{p.Site_Name || <span className="cp-dim">unnamed</span>}</td>
                            <td>{st?.Status ?? "\u2014"}</td>
                            <td>{fmt(p.Date_Received)}</td>
                            <td>{fmt(p.Secured_Date)}</td>
                            <td>{personName(p.BDD_KAM_ID)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CSS = `
/* Height, alignment and spacing come from .ph-actions in styles.css.
   Only the width and the chip styling are this screen's business. */
.cp-search { width: 230px; }
.cp-chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--muted); margin: 0; cursor: pointer;
  border: 1px solid var(--border); border-radius: 20px; padding: 0 14px; }
.cp-chk.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
.cp-none { color: var(--muted); font-size: 13px; padding: 30px; text-align: center; }
.cp-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.cp-cust { border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
  background: var(--white); }
.cp-cust.open { border-color: var(--accent); }
.cp-head { display: flex; align-items: center; gap: 10px; width: 100%; background: none;
  border: none; cursor: pointer; padding: 11px 14px; font: inherit; text-align: left; }
.cp-head:hover { background: var(--bg); }
.cp-caret { color: var(--accent); font-size: 12px; }
.cp-name { font-weight: 700; font-size: 14px; }
.cp-n { background: var(--accent); color: #fff; border-radius: 20px; padding: 1px 10px;
  font-size: 11px; font-weight: 700; }
.cp-sec { color: var(--ok-text); font-size: 11.5px; font-weight: 600; }
.cp-empty { color: var(--muted); font-size: 11.5px; font-style: italic; }
.cp-wrap { border: none; border-top: 1px solid var(--border); border-radius: 0; max-height: none; }
.dt.cp tbody tr.cp-row { cursor: pointer; }
.dt.cp tbody tr.cp-row:hover { background: var(--accent-light) !important; }
.cp-dim { color: var(--muted); font-style: italic; }
`;
