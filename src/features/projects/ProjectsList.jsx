import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listProjects, setPriority, deleteProject, resurrectProject } from "../../api/projects.js";
import BurgerMenu, { BURGER_CSS } from "../../components/BurgerMenu.jsx";
import CreateRevisionModal from "./CreateRevisionModal.jsx";
import { UTILITIES } from "../../lib/utilities.js";

/* Projects table.

   Each column declares a type, and the filter row picks the control to
   match: free text, a date range with a "blank only" option, or a
   checkbox list for anything that resolves to a lookup. Widths are
   drag-resizable and persist alongside column order and visibility. */

const COLUMNS = [
  { key: "menu",     label: "",              width: 44,  type: "none", raw: () => "" },
  { key: "ref",      label: "Project Ref",   width: 118, type: "text",  raw: (p) => p.Project_Ref },
  { key: "rev",      label: "Rev",           width: 56,  type: "text",  align: "center", raw: (p) => (p.Revision ? `r${p.Revision}` : "") },
  { key: "sitename", label: "Site Name",     width: 200, type: "text",  raw: (p) => p.Site_Name },
  { key: "date",     label: "Date Received", width: 130, type: "date",  raw: (p) => p.Date_Received },
  { key: "kpi",      label: "KPI Date",      width: 130, type: "date",  raw: (p) => p.KPI_Date },
  { key: "cust",     label: "Customer",      width: 180, type: "multi", src: "customers", idKey: "Customer_ID", labelKey: "Customer_Name", raw: (p) => p.Customer_ID },
  { key: "region",   label: "Region",        width: 120, type: "multi", src: "regions", idKey: "Region_ID", labelKey: "Region", raw: (p) => p.Region_ID },
  { key: "qt",       label: "Quote Type",    width: 120, type: "multi", src: "quoteTypes", idKey: "Quote_Type_ID", labelKey: "Quote_Type", raw: (p) => p.Quote_Type_ID },
  { key: "plots",    label: "Plots",         width: 76,  type: "num",   align: "right", raw: (p) => p.Plot_Count ?? 0 },
  { key: "status",   label: "Status",        width: 150, type: "multi", src: "projectStatuses", idKey: "Project_Status_ID", labelKey: "Status", raw: (p) => p.Project_Status_ID },
  { key: "scopes",   label: "Outline Designs",        width: 120, type: "num",   raw: (p) => (p.scopes || []).length },
  { key: "points",   label: "Points",        width: 84,  type: "num",   align: "right", raw: (p) => p.Tender_Total_Points ?? null },
  { key: "bdd",      label: "BDD / KAM",     width: 140, type: "multi", src: "people", idKey: "Person_ID", labelKey: "Person_Name", raw: (p) => p.BDD_KAM_ID },
  { key: "est",      label: "Estimator",     width: 140, type: "multi", src: "people", idKey: "Person_ID", labelKey: "Person_Name", raw: (p) => p.Estimator_ID },
  { key: "iandc",    label: "I & C",         width: 70,  type: "bool",  align: "center", raw: (p) => !!p.I_and_C },
  { key: "g2g",      label: "Good to Go",    width: 130, type: "date",  raw: (p) => p.Good_To_Go },
  { key: "secured",  label: "Secured Date",  width: 130, type: "date",  raw: (p) => p.Secured_Date },
];

const PREFS_KEY = "aptus_projectColumnPrefs_v2";
const DEFAULTS = () => ({
  order: COLUMNS.map((c) => c.key),
  hidden: [],
  widths: Object.fromEntries(COLUMNS.map((c) => [c.key, c.width])),
});

function loadPrefs() {
  const def = DEFAULTS();
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw);
    const valid = new Set(def.order);
    const order = (p.order || []).filter((k) => valid.has(k));
    def.order.forEach((k) => !order.includes(k) && order.push(k));
    return {
      order,
      hidden: (p.hidden || []).filter((k) => valid.has(k)),
      widths: { ...def.widths, ...(p.widths || {}) },
    };
  } catch {
    return def;
  }
}
const savePrefs = (p) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
};

const iso = (d) => (d ? String(d).slice(0, 10) : "");
const fmtDate = (d) => (d ? iso(d).split("-").reverse().join("/") : "");
const kpiReached = (d) => d && iso(d) <= new Date().toISOString().slice(0, 10);

const blankFilter = (type) =>
  type === "date" ? { from: "", to: "", blank: false }
  : type === "multi" ? []
  : type === "num" ? { min: "", max: "" }
  : "";

const isActive = (f, type) => {
  if (f == null) return false;
  if (type === "date") return !!(f.from || f.to || f.blank);
  if (type === "multi") return f.length > 0;
  if (type === "num") return f.min !== "" || f.max !== "";
  return f !== "";
};

export default function ProjectsList({ onOpen, onNew, onRefresh }) {
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [prefs, setPrefs] = useState(loadPrefs);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState(null);
  const [revising, setRevising] = useState(null);
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [utilFilter, setUtilFilter] = useState([]);
  const [filters, setFilters] = useState(() =>
    Object.fromEntries(COLUMNS.map((c) => [c.key, blankFilter(c.type)]))
  );
  const drag = useRef(null);

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
    return () => { live = false; };
  }, []);

  /* ── column resize ── */
  useEffect(() => {
    const move = (e) => {
      if (!drag.current) return;
      const { key, startX, startW } = drag.current;
      const w = Math.max(56, startW + (e.clientX - startX));
      setPrefs((p) => ({ ...p, widths: { ...p.widths, [key]: w } }));
    };
    const up = () => {
      if (drag.current) {
        drag.current = null;
        setPrefs((p) => { savePrefs(p); return p; });
        document.body.classList.remove("resizing");
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  function startResize(e, key) {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { key, startX: e.clientX, startW: prefs.widths[key] || 120 };
    document.body.classList.add("resizing");
  }

  /* ── display values ── */
  const nameOf = (src, idKey, labelKey, id) =>
    lookups?.[src]?.find((x) => x[idKey] === id)?.[labelKey] ?? "";

  const display = useMemo(() => {
    if (!lookups) return {};
    const d = {};
    COLUMNS.forEach((c) => {
      d[c.key] =
        c.type === "date" ? (p) => fmtDate(c.raw(p))
        : c.type === "multi" ? (p) => nameOf(c.src, c.idKey, c.labelKey, c.raw(p))
        : c.type === "bool" ? (p) => (c.raw(p) ? "Y" : "")
        : (p) => c.raw(p);
    });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups]);

  const optionsFor = (c) => {
    const list = lookups?.[c.src] || [];
    if (c.key !== "status") return list;
    return list.map((s) => ({ ...s, Status: `${s.Stage} · ${s.Status}` }));
  };

  /* ── filtering ── */
  /* Finished work clutters the list without adding anything — the
     original hid these by default and offered a way back. Driven by the
     status table rather than a hardcoded list, so adding a terminal
     status doesn't need a code change. */
  const hiddenStatusIds = useMemo(() => {
    const ids = new Set();
    (lookups?.projectStatuses || []).forEach((st) => {
      if (st.Is_Terminal || ["Complete", "Superseded"].includes(st.Status)) {
        ids.add(st.Project_Status_ID);
      }
    });
    return ids;
  }, [lookups]);

  const hiddenStatusNames = useMemo(
    () => (lookups?.projectStatuses || [])
      .filter((st) => hiddenStatusIds.has(st.Project_Status_ID))
      .map((st) => st.Status),
    [lookups, hiddenStatusIds]
  );

  const filtered = useMemo(() => {
    if (!lookups) return [];
    const q = search.trim().toLowerCase();

    let out = rows.filter((p) => {
      if (priorityOnly && !p.Is_Priority) return false;
      if (!showHidden && hiddenStatusIds.has(p.Project_Status_ID)) return false;
      if (utilFilter.length) {
        const on = (p.scopes || []).map((x) => x.Utility_ID);
        if (!utilFilter.some((u) => on.includes(u))) return false;
      }
      for (const c of COLUMNS) {
        const f = filters[c.key];
        if (!isActive(f, c.type)) continue;
        const v = c.raw(p);

        if (c.type === "date") {
          const val = iso(v);
          if (f.blank) { if (val) return false; continue; }
          if (!val) return false;
          if (f.from && val < f.from) return false;
          if (f.to && val > f.to) return false;
        } else if (c.type === "multi") {
          if (f.includes("__blank__")) {
            if (v == null && f.length === 1) continue;
            if (v == null) continue;
          }
          if (!f.includes(String(v))) return false;
        } else if (c.type === "num") {
          const n = Number(v);
          if (f.min !== "" && n < Number(f.min)) return false;
          if (f.max !== "" && n > Number(f.max)) return false;
        } else if (c.type === "bool") {
          if (f === "y" && !v) return false;
          if (f === "n" && v) return false;
        } else {
          if (!String(v ?? "").toLowerCase().includes(String(f).toLowerCase())) return false;
        }
      }
      if (!q) return true;
      const hay = [p.Project_Ref, p.Site_Name, p.Site_Address, p.Postcode,
        display.cust?.(p), display.region?.(p), display.bdd?.(p), display.est?.(p), display.status?.(p)]
        .join(" ").toLowerCase();
      return hay.includes(q);
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    const col = COLUMNS.find((c) => c.key === sort.key);
    out = [...out].sort((a, b) => {
      const va = col ? col.raw(a) : "";
      const vb = col ? col.raw(b) : "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      if (col?.type === "multi") {
        return String(display[col.key](a)).localeCompare(String(display[col.key](b))) * dir;
      }
      return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true }) * dir;
    });

    return [...out.filter((p) => p.Is_Priority), ...out.filter((p) => !p.Is_Priority)];
  }, [rows, search, sort, filters, display, lookups, priorityOnly, showHidden, utilFilter, hiddenStatusIds]);

  const visible = prefs.order
    .filter((k) => !prefs.hidden.includes(k))
    .map((k) => COLUMNS.find((c) => c.key === k))
    .filter(Boolean);

  const activeCount = COLUMNS.filter((c) => isActive(filters[c.key], c.type)).length;
  const hiddenCount = rows.filter((p) => hiddenStatusIds.has(p.Project_Status_ID)).length;

  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val }));
  const clearAll = () => {
    setFilters(Object.fromEntries(COLUMNS.map((c) => [c.key, blankFilter(c.type)])));
    setSearch("");
    setPriorityOnly(false);
    setUtilFilter([]);
  };

  async function togglePriority(p) {
    try {
      await setPriority(p.Project_ID, !p.Is_Priority);
      setRows((r) => r.map((x) => (x.Project_ID === p.Project_ID ? { ...x, Is_Priority: !p.Is_Priority } : x)));
    } catch (e) { setError(e.message); }
  }

  /* A superseded project is locked. Without this a revision created by
     mistake would leave the original unreachable for good. */
  async function resurrect(p) {
    if (!window.confirm(
      `Unlock ${p.Project_Ref} r${p.Revision ?? 0}?\n\n` +
      "It goes back to Tendering. Any later revision stays as it is, so " +
      "you'll have two live revisions of the same reference."
    )) return;
    try {
      const res = await resurrectProject(p.Project_ID);
      onRefresh && onRefresh();
      const list = await listProjects({ limit: 500 });
      setRows(list.rows || []);
      if (res.later_revisions > 0) {
        setError(`Unlocked. ${res.later_revisions} later revision${
          res.later_revisions === 1 ? "" : "s"} still exist for this reference.`);
      }
    } catch (e) { setError(e.message); }
  }

  async function removeProject(p) {
    if (!window.confirm(`Delete project ${p.Project_Ref}? This cannot be undone.`)) return;
    try {
      await deleteProject(p.Project_ID);
      setRows((r) => r.filter((x) => x.Project_ID !== p.Project_ID));
      onRefresh && onRefresh();
    } catch (e) { setError(e.message); }
  }

  /* Mirrors the tender row menu in the original: jump straight to a tab,
     flag priority, then history/comments, then delete. Revisions and the
     history/comment logs aren't migrated yet, so they're shown disabled
     rather than hidden — the menu doubles as a to-do list. */
  /* A secured project has a contract behind it. Re-quoting that isn't a
     revision, it's a variation — so the option is closed off. */
  const isTender = (p) =>
    (lookups?.projectStatuses || [])
      .find((s) => s.Project_Status_ID === p.Project_Status_ID)?.Stage === "Tender";

  const menuFor = (p) => {
    const siblings = rows.filter((x) => x.Project_Ref === p.Project_Ref);
    const highestRev = Math.max(...siblings.map((x) => x.Revision ?? 0));
    const isHighest = (p.Revision ?? 0) === highestRev;
    const statusName = (lookups?.projectStatuses || [])
      .find((s) => s.Project_Status_ID === p.Project_Status_ID)?.Status;
    const superseded = statusName === "Superseded";
    const tender = isTender(p);

    return [
      superseded
        ? { icon: "\u267B\uFE0F", label: "Resurrect (unlock)", fn: () => resurrect(p) }
        : isHighest
          ? { icon: "\u270F\uFE0F", label: "Edit Project", fn: () => onOpen(p, "details") }
          : { icon: "\uD83D\uDD12", label: `Locked \u2014 rev ${highestRev} exists`, disabled: true },

      isHighest && !superseded && (tender
        ? { icon: "\uD83D\uDD04", label: "Create New Revision", fn: () => setRevising(p) }
        : { icon: "\uD83D\uDD04", label: "Revision \u2014 Tender stage only", disabled: true }),

      { divider: true },
      { icon: "\uD83C\uDFE0", label: "Plots", fn: () => onOpen(p, "plots") },
      { icon: "\uD83C\uDFED", label: "Non-Res Supplies", fn: () => onOpen(p, "nrs") },
      { icon: "\uD83D\uDD0C", label: "POC Applications", fn: () => onOpen(p, "poc") },
      { icon: "\uD83D\uDCD0", label: "Outline Designs", fn: () => onOpen(p, "designs") },
      { icon: "\uD83D\uDCB0", label: "Asset Value", fn: () => onOpen(p, "av") },
      { icon: "\uD83E\uDD1D", label: "Stakeholders", fn: () => onOpen(p, "stakeholder") },

      { divider: true },
      { icon: "\uD83D\uDCCB", label: "Change History", fn: () => onOpen(p, "history") },
      { icon: "\uD83D\uDCAC", label: "Comments", fn: () => onOpen(p, "comments") },
      { icon: "\uD83D\uDCCA", label: "Progress Report", disabled: true },

      { divider: true },
      isHighest && !superseded && {
        icon: p.Is_Priority ? "\u2B50" : "\u2606",
        label: p.Is_Priority ? "Remove Priority" : "Set Priority",
        fn: () => togglePriority(p),
      },
      { icon: "\uD83D\uDDD1\uFE0F", label: "Delete Project", danger: true, fn: () => removeProject(p) },
    ];
  };

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
    const def = DEFAULTS();
    setPrefs(def);
    savePrefs(def);
  }

  if (loading) return <div className="loading">Loading projects&hellip;</div>;
  if (error) return <Banner kind="error">Couldn&rsquo;t load projects: {error}</Banner>;

  return (
    <div onClick={() => { setOpenFilter(null); setMenuOpen(false); }}>
      <style>{CSS}</style>

      {revising && (
        <CreateRevisionModal
          project={revising}
          onClose={() => setRevising(null)}
          onCreated={(created) => {
            setRevising(null);
            onRefresh && onRefresh();
            if (created && onOpen) onOpen(created, "details");
          }}
        />
      )}

      <div className="list-head">
        <div>
          <h2>
            Projects <span className="ph-count">({filtered.length} of {rows.length})</span>
          </h2>
          <p className="page-sub">
            {activeCount > 0 && `${activeCount} column filter${activeCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="list-tools" onClick={(e) => e.stopPropagation()}>
          <input className="search" value={search} aria-label="Search projects" placeholder="Search all columns&hellip;"
            onChange={(e) => setSearch(e.target.value)} />
          <button
            className={priorityOnly ? "btn toggle on" : "btn toggle"}
            onClick={() => setPriorityOnly((v) => !v)}
            aria-pressed={priorityOnly}
            title="Show only projects flagged as priority"
          >
            Priority
          </button>
          <button
            className={showHidden ? "btn toggle on" : "btn toggle"}
            onClick={() => setShowHidden((v) => !v)}
            aria-pressed={showHidden}
            title={showHidden
              ? "Hide projects at a closed status again"
              : "Also show projects at a closed status"}
          >
            {/* The caption is the action, not the state: while they are
                hidden it offers to show them, and once shown it offers
                to hide them again. A toggle labelled the same in both
                positions makes you click it to find out. */}
            {showHidden ? "Hide Closed" : `Show Closed${hiddenCount > 0 ? ` (${hiddenCount})` : ""}`}
          </button>
          {/* Every part of this guard must be a boolean. React renders
              0 as text — only false, null and undefined disappear — so a
              bare .length printed a stray 0 where this button sits
              whenever no utility chips were ticked. */}
          {(activeCount > 0 || !!search || priorityOnly || utilFilter.length > 0) && (
            <button className="btn ghost" onClick={clearAll}>Clear filters</button>
          )}
          <div className="col-menu-wrap">
            <button className="btn ghost" onClick={() => setMenuOpen((o) => !o)}>Columns</button>
            {menuOpen && (
              <div className="col-menu">
                <div className="col-menu-head">
                  <span>Show columns</span>
                  <button onClick={resetColumns}>Reset</button>
                </div>
                {COLUMNS.map((c) => (
                  <label key={c.key} className="col-opt">
                    <input type="checkbox" checked={!prefs.hidden.includes(c.key)}
                      onChange={() => toggleColumn(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {onNew && <button className="btn accent" onClick={onNew}>+ New project</button>}
        </div>
      </div>

      {!showHidden && hiddenCount > 0 && (
        <div className="hidden-note">
          <span className="hn-icon" aria-hidden="true">&#8505;</span>
          Projects at <strong>{hiddenStatusNames.join(", ")}</strong> are hidden by default.
          Use <strong>Show Closed</strong> to reveal them.
          <span className="hn-count">{hiddenCount}</span>
        </div>
      )}

      <div className="util-filter">
        <span className="uf-label">Filter by outline design type</span>
        {UTILITIES.map((u) => {
          const on = utilFilter.includes(u.id);
          return (
            <label key={u.id} className={on ? "uf on" : "uf"}>
              <input type="checkbox" checked={on}
                onChange={() => setUtilFilter((f) =>
                  f.includes(u.id) ? f.filter((x) => x !== u.id) : [...f, u.id])} />
              <span className="uf-dot" style={{ background: u.colour }} />
              {u.name}
            </label>
          );
        })}
        {utilFilter.length > 0 && (
          <button className="uf-clear" onClick={() => setUtilFilter([])}>Clear</button>
        )}
      </div>

      <div className="proj-table-wrap">
        <table className="proj-table">
          <colgroup>
            {visible.map((c) => <col key={c.key} style={{ width: prefs.widths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr className="head-row">
              {visible.map((c) => (
                <th key={c.key} style={{ textAlign: c.align || "left" }}
                    onClick={() => c.type !== "none" && toggleSort(c.key)}>
                  <span className="th-label">{c.label}</span>
                  {sort.key === c.key && <span className="arrow">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                  <span className="resizer" onMouseDown={(e) => startResize(e, c.key)} />
                </th>
              ))}
            </tr>
            <tr className="filter-row" onClick={(e) => e.stopPropagation()}>
              {visible.map((c) => (
                <th key={c.key}>
                  {c.type !== "none" && <FilterControl
                    col={c}
                    value={filters[c.key]}
                    onChange={(v) => setFilter(c.key, v)}
                    options={c.type === "multi" ? optionsFor(c) : null}
                    open={openFilter === c.key}
                    setOpen={(o) => setOpenFilter(o ? c.key : null)}
                  />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={visible.length} className="no-rows">No projects match these filters.</td></tr>
            ) : filtered.map((p) => (
              <tr key={p.Project_ID} onClick={() => onOpen && onOpen(p, "details")} className={p.Is_Priority ? "priority" : ""}>
                {visible.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || "left" }}>
                    {c.key === "ref" && p.Is_Priority && <span className="pri" title="Priority">&#9733;</span>}
                    {c.key === "menu" ? <BurgerMenu items={menuFor(p)} />
                      : c.key === "status" ? <span className="pill">{display.status(p)}</span>
                      : c.key === "scopes" ? <ScopeDots scopes={p.scopes} />
                      : c.key === "points" ? (
                          p.Tender_Total_Points != null
                            ? <span className="pts-pill" title={`Base ${p.Tender_Base_Points ?? "\u2014"}`}>
                                {p.Tender_Total_Points}
                              </span>
                            : "\u2014"
                        )
                      : c.key === "kpi" ? (<>{display.kpi(p)}{kpiReached(p.KPI_Date) && <span className="clock" title="KPI date reached">&#9200;</span>}</>)
                      : display[c.key](p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── one control per column type ── */
/* Popups are rendered position:fixed against the trigger's bounding rect.
   The table wrapper has overflow:auto, which clips absolutely-positioned
   children no matter how high the z-index goes. */
function usePopupPos(open) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    const width = 220;
    setPos({
      top: r.bottom + 3,
      left: Math.min(r.left, window.innerWidth - width - 12),
      minWidth: Math.max(r.width, 180),
    });
  }, [open]);
  return [ref, pos];
}

function FilterControl({ col, value, onChange, options, open, setOpen }) {
  const [trigger, pos] = usePopupPos(open);

  if (col.type === "date") {
    const on = isActive(value, "date");
    return (
      <div className="fc">
        <button ref={trigger} className={on ? "fc-btn on" : "fc-btn"} onClick={() => setOpen(!open)}>
          {value.blank ? "Blank only" : value.from || value.to
            ? `${value.from ? fmtDate(value.from) : "\u2190"} \u2013 ${value.to ? fmtDate(value.to) : "\u2192"}`
            : "All dates"}
        </button>
        {open && pos && (
          <div className="fc-pop" style={pos}>
            <label className="fc-lbl">From</label>
            <input type="date" value={value.from} disabled={value.blank}
              onChange={(e) => onChange({ ...value, from: e.target.value })} />
            <label className="fc-lbl">To</label>
            <input type="date" value={value.to} disabled={value.blank}
              onChange={(e) => onChange({ ...value, to: e.target.value })} />
            <label className="fc-check">
              <input type="checkbox" checked={value.blank}
                onChange={(e) => onChange({ from: "", to: "", blank: e.target.checked })} />
              Blank only
            </label>
            <button className="fc-clear" onClick={() => { onChange(blankFilter("date")); setOpen(false); }}>
              Clear
            </button>
          </div>
        )}
      </div>
    );
  }

  if (col.type === "multi") {
    const on = value.length > 0;
    const label = !on ? "All"
      : value.length === 1
        ? (options.find((o) => String(o[col.idKey]) === value[0])?.[col.labelKey] ?? "1 selected")
        : `${value.length} selected`;
    const toggle = (id) =>
      onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    return (
      <div className="fc">
        <button ref={trigger} className={on ? "fc-btn on" : "fc-btn"} onClick={() => setOpen(!open)}>
          <span className="fc-trunc">{label}</span>
          <span className="fc-caret">&#9662;</span>
        </button>
        {open && pos && (
          <div className="fc-pop wide" style={pos}>
            <div className="fc-actions">
              <button onClick={() => onChange(options.map((o) => String(o[col.idKey])))}>All</button>
              <button onClick={() => onChange([])}>None</button>
            </div>
            <div className="fc-opts">
              <label className={value.includes("__blank__") ? "fc-opt on" : "fc-opt"}>
                <input type="checkbox" checked={value.includes("__blank__")}
                  onChange={() => toggle("__blank__")} />
                <em>(Blank)</em>
              </label>
              {options.map((o) => {
                const id = String(o[col.idKey]);
                return (
                  <label className={value.includes(id) ? "fc-opt on" : "fc-opt"} key={id}>
                    <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} />
                    {o[col.labelKey]}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (col.type === "num") {
    return (
      <div className="fc num">
        <input type="number" placeholder="min" value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })} />
        <input type="number" placeholder="max" value={value.max}
          onChange={(e) => onChange({ ...value, max: e.target.value })} />
      </div>
    );
  }

  if (col.type === "bool") {
    return (
      <select className="fc-sel" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        <option value="y">Yes</option>
        <option value="n">No</option>
      </select>
    );
  }

  return (
    <input className="fc-text" value={value} placeholder="Contains&hellip;"
      onChange={(e) => onChange(e.target.value)} />
  );
}

function ScopeDots({ scopes = [] }) {
  if (!scopes.length) return <span className="muted-dash">&mdash;</span>;
  return (
    <span className="dots">
      {scopes.map((s, i) => {
        const u = UTILITIES.find((x) => x.id === s.Utility_ID);
        return <span key={i} className="dot" style={{ background: u?.colour ?? "#94a3b8" }} title={u?.name ?? "Scope"} />;
      })}
    </span>
  );
}

const CSS = BURGER_CSS + `
body.resizing { cursor: col-resize; user-select: none; }
.list-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.list-head h2 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -.01em; }
.ph-count { font-size: 14px; font-weight: 600; color: var(--muted); }
.btn.toggle { background: var(--white); border: 1px solid var(--border); color: var(--text); }
.btn.toggle.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.hidden-note { display: flex; align-items: center; gap: 8px; font-size: 12.5px;
  background: var(--accent-light); border: 1px solid #bfdbfe; border-radius: var(--radius);
  padding: 9px 13px; margin-bottom: 10px; color: var(--text); }
.hn-icon { color: var(--accent); font-size: 13px; }
.hn-count { margin-left: auto; font-weight: 700; background: var(--accent); color: #fff;
  border-radius: 999px; padding: 1px 9px; font-size: 11px; }
.util-filter { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.uf-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); margin-right: 4px; }
.uf { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); background: var(--white);
  border: 1px solid var(--border); border-radius: 6px; padding: 5px 11px; margin: 0; cursor: pointer; }
.uf.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }
.uf-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.uf-clear { background: none; border: none; color: var(--accent); font: 600 11.5px inherit; cursor: pointer; }
/* One row deep, all of them. align-items was flex-start, so each control
   sized to its own content and a two-word caption wrapped rather than
   widening — which is what put "Show Hidden (1)" on three lines.

   A single height on both the buttons and the input is what makes them
   line up: the shared .btn has more vertical padding than the shared
   input rule, so left to themselves they differ by about 4px. */
.list-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.list-tools .btn,
.list-tools .search {
  height: 36px;
  padding-top: 0; padding-bottom: 0;
  white-space: nowrap;
}
.list-tools .btn { display: inline-flex; align-items: center; }
.search { width: 230px; }
.col-menu-wrap { position: relative; }
.col-menu {
  position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 40;
  background: var(--white); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 6px 20px rgba(0,0,0,.12); padding: 8px; width: 190px; max-height: 340px; overflow-y: auto;
}
.col-menu-head {
  display: flex; justify-content: space-between; align-items: center; font-size: 10.5px;
  font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--muted);
  padding: 2px 4px 8px; border-bottom: 1px solid var(--border); margin-bottom: 6px;
}
.col-menu-head button { background: none; border: none; cursor: pointer; color: var(--accent); font: inherit; }
.col-opt { display: flex; align-items: center; gap: 7px; font-size: 12.5px; padding: 4px;
  text-transform: none; letter-spacing: 0; color: var(--text); font-weight: 400; margin: 0; cursor: pointer; }


.proj-table-wrap { border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; max-height: 68vh; }
.proj-table { border-collapse: separate; border-spacing: 0; font-size: 12.5px; table-layout: fixed; }
.proj-table th, .proj-table td {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.head-row th {
  position: sticky; top: 0; z-index: 3; background: var(--accent); color: #fff;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  padding: 8px 10px; cursor: pointer; user-select: none; position: sticky;
}
.head-row th:hover { background: var(--accent-dark); }
.arrow { margin-left: 4px; font-size: 8px; }
.resizer {
  position: absolute; right: 0; top: 0; height: 100%; width: 7px;
  cursor: col-resize; z-index: 4;
}
.resizer:hover { background: rgba(255,255,255,.35); }
.filter-row th {
  position: sticky; top: 30px; z-index: 2; background: #eef0f4;
  border-bottom: 1px solid var(--border); padding: 4px 5px; overflow: visible;
}
.proj-table td { padding: 7px 10px; border-top: 1px solid var(--border); }
.proj-table td:has(.burger-wrap) { padding: 3px 6px; overflow: visible; }
.proj-table tbody tr { cursor: pointer; }
.proj-table tbody tr:nth-child(even) { background: #fafbfc; }
.proj-table tbody tr:hover { background: var(--accent-light); }
.proj-table tbody tr.priority td { background: #fffbeb; }
.proj-table tbody tr.priority:hover td { background: #fef3c7; }
.no-rows { text-align: center; padding: 40px; color: var(--muted); white-space: normal; }
.pri { color: #d97706; margin-right: 4px; }
.pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px; background: var(--accent-light); color: var(--accent); border: 1px solid #bfdbfe; }
.clock { margin-left: 5px; font-size: 12px; }
.pts-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 8px;
  border-radius: 20px; background: var(--accent); color: #fff; }
.dots { display: inline-flex; gap: 3px; }
.dots .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.muted-dash { color: var(--muted); }

.fc { position: relative; }
.fc-btn, .fc-text, .fc-sel {
  width: 100%; font-size: 11.5px; padding: 3px 6px; border-radius: 5px;
  border: 1px solid var(--border); background: var(--white); font-family: inherit;
  color: var(--text); text-align: left; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: 4px;
}
.fc-text, .fc-sel { cursor: text; display: block; }
.fc-sel { cursor: pointer; }
.fc-btn.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }
.fc-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fc-caret { font-size: 8px; flex: none; }
.fc.num { display: flex; gap: 3px; }
.fc.num input { width: 50%; font-size: 11.5px; padding: 3px 5px; border-radius: 5px; }

.fc-pop {
  position: fixed; z-index: 900; min-width: 180px;
  background: var(--white); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0,0,0,.16); padding: 9px;
}
.fc-pop.wide { min-width: 210px; max-width: 260px; }
.fc-lbl { display: block; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); margin: 0 0 3px; }
.fc-pop input[type=date] { font-size: 11.5px; padding: 4px 6px; margin-bottom: 7px; }
.fc-check { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 4px 0 8px; cursor: pointer; }

.fc-clear { width: 100%; background: var(--bg); border: 1px solid var(--border);
  border-radius: 5px; padding: 4px; font: 600 11.5px inherit; color: var(--muted); cursor: pointer; }
.fc-actions { display: flex; gap: 5px; margin-bottom: 6px; }
.fc-actions button { flex: 1; background: var(--bg); border: 1px solid var(--border);
  border-radius: 5px; padding: 3px; font: 600 11px inherit; color: var(--accent); cursor: pointer; }
.fc-opts { max-height: 220px; overflow-y: auto; }
.fc-opt { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 400;
  text-transform: none; letter-spacing: 0; color: var(--text); padding: 4px 5px; margin: 0;
  cursor: pointer; white-space: normal; border-radius: 4px; }
.fc-opt:hover { background: var(--bg); }
.fc-opt.on { background: var(--accent-light); color: var(--accent); font-weight: 600; }

.fc-opt em { font-style: italic; color: var(--muted); }
`;
