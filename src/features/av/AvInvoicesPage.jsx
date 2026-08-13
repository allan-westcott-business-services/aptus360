import { useState, useEffect, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import Banner from "../../components/Banner.jsx";
import ColumnsMenu from "../../components/ColumnsMenu.jsx";
import { useTableLayout } from "../../lib/useTableLayout.js";
import { getAvRegister, setAvInvoiceStatus } from "../../api/avRegister.js";

/* Asset value invoices.

   A port of the original's AV Invoices screen, which is not a list of
   invoices but a reconciliation: every plot that has earned an asset
   value payment, beside the invoice line that claimed it — or nothing,
   where none has been raised.

   Hence the two filters at the top and their defaults. Asset value is
   earned when the meter goes in, so "metered" and "not invoiced"
   together are the list of money owed and not yet asked for. That is the
   screen's reason to exist; everything else is a way of getting to it.

   Rows are grouped by project, collapsed, exactly as the original groups
   by AP number — a hundred plots on one site is one line until you want
   the detail. */

const STATUSES = ["Draft", "Issued", "Exported", "Paid", "Cancelled"];

const COLS = [
  { key: "sel",      label: "Select",    width: 38,  type: "none", fixed: true },
  { key: "project",  label: "Project",   width: 110, type: "text", fixed: true },
  { key: "site",     label: "Site",      width: 170, type: "text" },
  { key: "plot",     label: "Plot",      width: 80,  type: "text", fixed: true },
  { key: "utility",  label: "Utility",   width: 100, type: "text" },
  { key: "conn",     label: "Connected", width: 112, type: "date" },
  { key: "meter",    label: "Meter",     width: 130, type: "text" },
  /* The date the claim rides on. Connected and Meter stay as context —
     they explain why a card is or isn't in — but this is the one that
     decides whether a plot can be billed. */
  { key: "sc",       label: "SC submitted", width: 122, type: "date" },
  { key: "invoice",  label: "Invoice",   width: 130, type: "text" },
  { key: "invdate",  label: "Inv. date", width: 112, type: "date" },
  { key: "status",   label: "Status",    width: 110, type: "text" },
  { key: "idno",     label: "IDNO",      width: 150, type: "text" },
  { key: "type",     label: "Agreement", width: 140, type: "text" },
  { key: "value",    label: "Net",       width: 100, type: "num", align: "right" },
];

const money = (v) => (v == null || v === ""
  ? "\u2014"
  : Number(v).toLocaleString(undefined, { style: "currency", currency: "GBP" }));
const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "\u2014");

export default function AvInvoicesPage({ projectId, embedded = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  /* The defaults are the point of the screen: what has been earned and
     not yet claimed. */
  const [meterFilter, setMeterFilter] = useState("with");     // with | without | all — service card
  const [claimFilter, setClaimFilter] = useState("unclaimed"); // unclaimed | claimed | all
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [bulkStatus, setBulkStatus] = useState("");

  /* A separate saved layout when embedded: the project and site columns
     are redundant inside a project, and someone who hides them there
     shouldn't lose them on the full register. */
  const layout = useTableLayout(embedded ? "av-register-project" : "av-register", COLS);

  const load = useCallback(async () => {
    try {
      const r = await getAvRegister(projectId);
      setRows(r.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => rows.filter((r) => {
    if (meterFilter === "with" && !r.can_invoice) return false;
    if (meterFilter === "without" && r.can_invoice) return false;
    if (claimFilter === "unclaimed" && r.claimed) return false;
    if (claimFilter === "claimed" && !r.claimed) return false;
    if (statusFilter && r.invoice_status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = [r.project_ref, r.site_name, r.plot_number, r.invoice_number,
        r.meter_number, r.idno_name].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, meterFilter, claimFilter, statusFilter, search]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const r of shown) {
      const key = r.project_ref || "\u2014";
      if (!m.has(key)) m.set(key, { key, site: r.site_name, rows: [] });
      m.get(key).rows.push(r);
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [shown]);

  const totals = useMemo(() => ({
    lines: shown.length,
    billable: shown.filter((r) => r.billable).length,
    claimed: shown.filter((r) => r.claimed).length,
    value: shown.reduce((t, r) => t + Number(r.net_value || 0), 0),
  }), [shown]);

  /* Selection is by invoice, not by row: the status being changed lives
     on the invoice, and a plot with no invoice has nothing to change. */
  const selectableIds = useMemo(
    () => [...new Set(shown.filter((r) => r.av_invoice_id).map((r) => r.av_invoice_id))],
    [shown]
  );

  async function applyStatus() {
    if (!bulkStatus || !selected.length) return;
    setBusy(true);
    try {
      const r = await setAvInvoiceStatus(selected, bulkStatus);
      await load();
      setSelected([]);
      setBulkStatus("");
      setStatus(`${r.updated} invoice(s) set to ${bulkStatus}`);
      setTimeout(() => setStatus(""), 6000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function exportXlsx() {
    const stamp = new Date().toISOString().slice(0, 10);
    /* Values stay numeric and dates stay ISO. A column of "£1,234.00"
       is text, and every sum built on it downstream returns zero. */
    const data = shown.map((r) => ({
      Project: r.project_ref,
      Site: r.site_name,
      Plot: r.plot_number,
      Utility: r.utility,
      Connected: r.connection_date || "",
      Meter: r.meter_number || "",
      "SC submitted": r.sc_submitted || "",
      Invoice: r.invoice_number || "",
      "Invoice date": r.invoice_date || "",
      Status: r.invoice_status || "",
      IDNO: r.idno_name || "",
      Agreement: r.agreement_type || "",
      Net: r.net_value == null ? null : Number(r.net_value),
      Billable: r.billable ? "Yes" : "No",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "AV register");
    XLSX.writeFile(wb, `AV register ${stamp}.xlsx`);
  }

  const cell = (r, key) => {
    switch (key) {
      case "project": return r.project_ref;
      case "site":    return r.site_name;
      case "plot":    return r.plot_number;
      case "utility": return r.utility;
      case "conn":    return fmt(r.connection_date);
      case "meter":   return r.meter_number || "\u2014";
      case "sc":      return r.sc_submitted
        ? fmt(r.sc_submitted)
        : <span className="av-none">not submitted</span>;
      case "invoice": return r.invoice_number
        || <span className="av-none">not raised</span>;
      case "invdate": return fmt(r.invoice_date);
      case "status":  return r.invoice_status
        ? <span className={`av-st av-${r.invoice_status.toLowerCase()}`}>{r.invoice_status}</span>
        : "\u2014";
      case "idno":    return r.idno_name || "\u2014";
      case "type":    return r.agreement_type || "\u2014";
      case "value":   return money(r.net_value);
      default:        return null;
    }
  };

  if (loading) return <div className="loading">Loading the register&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <div className="ph-head">
        <div>
          {/* In a tab the heading is already above it, so only the
              explanation is worth repeating. */}
          {!embedded && <h2 className="admin-title">Asset value invoices</h2>}
          <p className="tab-sub">
            One row per plot per utility: what can be claimed, and what has been claimed
            against it. {embedded ? "Shows" : "Opens on"} the work outstanding &mdash;
            service card submitted, not yet invoiced.
          </p>
        </div>
        <div className="ph-actions">
          <ColumnsMenu columns={COLS} hidden={layout.hidden}
            onToggle={layout.toggleColumn} onReset={layout.reset} />
          <button className="btn ghost" onClick={() => { setLoading(true); load(); }}>
            &#8635; Refresh
          </button>
          <button className="btn accent" disabled={!shown.length} onClick={exportXlsx}>
            Export to Excel
          </button>
        </div>
      </div>

      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}
      {status && <Banner kind="ok">{status}</Banner>}

      <div className="av-cards">
        <div className="av-card av-bill">
          <span className="ac-l">Claimable, not claimed</span>
          <span className="ac-n">{totals.billable}</span>
        </div>
        <div className="av-card">
          <span className="ac-l">Claimed</span>
          <span className="ac-n">{totals.claimed}</span>
        </div>
        <div className="av-card">
          <span className="ac-l">Net on shown rows</span>
          <span className="ac-n">{money(totals.value)}</span>
        </div>
      </div>

      <div className="av-bar">
        <label className="av-f">
          <span>Service card</span>
          <select value={meterFilter} onChange={(e) => setMeterFilter(e.target.value)}>
            <option value="with">Submitted</option>
            <option value="without">Not submitted</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="av-f">
          <span>Claim</span>
          <select value={claimFilter} onChange={(e) => setClaimFilter(e.target.value)}>
            <option value="unclaimed">Not invoiced</option>
            <option value="claimed">Invoiced</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="av-f">
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <input className="av-search" value={search} placeholder="Search&hellip;"
          onChange={(e) => setSearch(e.target.value)} />
        <span className="av-count">{shown.length} of {rows.length}</span>
      </div>

      {selected.length > 0 && (
        <div className="bulk-bar">
          <strong>{selected.length} invoice(s)</strong>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            <option value="">Set status&hellip;</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn accent sm" disabled={!bulkStatus || busy} onClick={applyStatus}>
            {busy ? "Applying\u2026" : "Apply"}
          </button>
          <button className="btn ghost sm" onClick={() => setSelected([])}>Clear</button>
          <span className="hint">
            Cancelled releases the plot back to the outstanding list rather than
            writing it off.
          </span>
        </div>
      )}

      <div className="dt-wrap">
        <table className="dt av">
          <colgroup>
            {layout.visible.map((c) => (
              <col key={c.key} style={{ width: layout.widths[c.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr className="head-row">
              {layout.visible.map((c) => (
                <th key={c.key}
                  {...layout.reorderProps(c.key)}>
                  {c.key === "sel" ? (
                    <input type="checkbox"
                      checked={selectableIds.length > 0 && selected.length === selectableIds.length}
                      onChange={(e) => setSelected(e.target.checked ? selectableIds : [])} />
                  ) : c.label}
                  <span className="resizer" draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onMouseDown={(e) => layout.startResize(e, c.key)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={layout.visible.length} className="no-rows">
                  Nothing matches these filters. With Submitted and Not invoiced set,
                  an empty table means everything claimable has been billed.
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <FragmentGroup key={g.key} group={g} collapsed={!!collapsed[g.key]}
                onToggle={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                cols={layout.visible} cell={cell}
                selected={selected} setSelected={setSelected} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* A project and its plots. Collapsed by default in the original because
   a hundred plots on one site is one line until you want the detail. */
function FragmentGroup({ group, collapsed, onToggle, cols, cell, selected, setSelected }) {
  const billable = group.rows.filter((r) => r.billable).length;
  const value = group.rows.reduce((t, r) => t + Number(r.net_value || 0), 0);
  return (
    <>
      <tr className="av-grp" onClick={onToggle}>
        <td colSpan={cols.length}>
          <span className="av-caret">{collapsed ? "\u25B8" : "\u25BE"}</span>
          <strong>{group.key}</strong>
          <span className="av-grp-site">{group.site}</span>
          <span className="av-grp-n">{group.rows.length} plot(s)</span>
          {billable > 0 && <span className="av-grp-b">{billable} to invoice</span>}
          <span className="av-grp-v">{money(value)}</span>
        </td>
      </tr>
      {!collapsed && group.rows.map((r) => (
        <tr key={r.plot_utility_id} className={r.billable ? "av-billable" : ""}>
          {cols.map((c) => (
            <td key={c.key} className={c.align === "right" ? "num" : undefined}>
              {c.key === "sel" ? (
                r.av_invoice_id ? (
                  <input type="checkbox"
                    checked={selected.includes(r.av_invoice_id)}
                    onChange={() => setSelected((s) => s.includes(r.av_invoice_id)
                      ? s.filter((x) => x !== r.av_invoice_id)
                      : [...s, r.av_invoice_id])} />
                ) : null
              ) : cell(r, c.key)}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

const CSS = `
.av-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px; margin: 12px 0; }
.av-card { border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px;
  display: flex; flex-direction: column; gap: 2px; }
.av-card.av-bill { border-color: var(--accent); background: var(--accent-light); }
.ac-l { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); }
.ac-n { font-size: 19px; font-weight: 700; }
.av-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.av-f { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 0; }
.av-f select { width: auto; font-size: 12px; }
.av-search { width: 190px; flex: none; font-size: 12px; }
.av-count { font-size: 11.5px; color: var(--muted); margin-left: auto; }
.av-none { color: var(--muted); font-style: italic; }
.av-st { font-size: 10.5px; font-weight: 700; border-radius: 20px; padding: 1px 9px;
  background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
.av-st.av-issued { background: #dbeafe; border-color: #93c5fd; color: #1e40af; }
.av-st.av-paid { background: #d1fae5; border-color: #6ee7b7; color: #065f46; }
.av-st.av-cancelled { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
.dt.av tbody tr.av-billable td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
.dt.av tbody tr.av-grp { background: var(--bg); cursor: pointer; }
.dt.av tbody tr.av-grp:hover { background: var(--accent-light); }
.dt.av tbody tr.av-grp td { font-size: 12.5px; }
.av-caret { color: var(--accent); margin-right: 7px; }
.av-grp-site { color: var(--muted); margin-left: 10px; }
.av-grp-n { color: var(--muted); margin-left: 10px; font-size: 11.5px; }
.av-grp-b { margin-left: 10px; font-size: 10.5px; font-weight: 700; background: var(--accent);
  color: #fff; border-radius: 20px; padding: 1px 9px; }
.av-grp-v { float: right; font-weight: 700; font-variant-numeric: tabular-nums; }
`;
