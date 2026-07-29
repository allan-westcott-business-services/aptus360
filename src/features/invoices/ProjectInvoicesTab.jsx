import { useState, useEffect, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import {
  getProjectInvoices, saveAvInvoice, saveAvInvoiceLine,
  deleteAvInvoice, deleteAvInvoiceLine,
} from "../../api/avRegister.js";
import { useTableLayout } from "../../lib/useTableLayout.js";
import ColumnsMenu from "../../components/ColumnsMenu.jsx";
import RaiseInvoiceModal from "./RaiseInvoiceModal.jsx";

/* Asset value invoices for one project.

   A port of the original's contract-page section: invoice rows that open
   to the plot lines they are made of. Project and site are not columns —
   the page header already says which project this is, and repeating it
   on every row costs width the plot lines need.

   The line's connected date comes from the plot's connection record
   rather than the line, so it reads the same figure the connections
   screen shows. That date is the line's justification: it is why the
   money was earned. */

const STATUSES = ["Draft", "Issued", "Exported", "Paid", "Cancelled"];
const DOC_TYPES = ["Invoice", "Credit"];

/* Columns as data, so header, widths, filters and cells all read one
   list and a dragged column takes its data with it. */
const COLS = [
  { key: "open",      label: "",              width: 34,  fixed: true },
  { key: "date",      label: "Invoice date",  width: 120 },
  { key: "number",    label: "Invoice number", width: 140, fixed: true },
  { key: "d365",      label: "D365 no.",      width: 120 },
  { key: "sub",       label: "Sub total",     width: 110, align: "right" },
  { key: "vat",       label: "VAT",           width: 100, align: "right" },
  { key: "total",     label: "Invoice total", width: 118, align: "right" },
  { key: "raised",    label: "Raised by",     width: 130 },
  { key: "doc",       label: "Type",          width: 96 },
  { key: "agreement", label: "Agreement",     width: 130 },
  { key: "status",    label: "Status",        width: 110 },
  { key: "act",       label: "Actions",       width: 120, align: "right", fixed: true },
];

const money = (v) => (v == null || v === ""
  ? "\u2014"
  : Number(v).toLocaleString(undefined, { style: "currency", currency: "GBP" }));
const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "\u2014");
const iso = (d) => (d ? String(d).slice(0, 10) : "");

/* A blank filter matches everything; "blank" matches only empties. The
   two are different questions and the original gives each its own
   control, because "show me the ones with no D365 number" is how you
   find what finance hasn't picked up. */
const textHit = (v, f) => !f || String(v ?? "").toLowerCase().includes(f.toLowerCase());
const numHit = (v, f, op) => {
  if (f === "" || f == null) return true;
  const n = Number(v ?? 0), t = Number(f);
  return op === "lte" ? n <= t : n >= t;
};

export default function ProjectInvoicesTab({ projectId, projectRef }) {
  const [invoices, setInvoices] = useState([]);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState({});
  const [editing, setEditing] = useState(null);   // invoice id
  const [draft, setDraft] = useState({});
  const [editLine, setEditLine] = useState(null); // line id
  const [lineDraft, setLineDraft] = useState({});
  const [raising, setRaising] = useState(false);
  const layout = useTableLayout("project-invoices", COLS);

  const [f, setF] = useState({
    dateFrom: "", dateBlank: false,
    number: "", d365: "", d365Blank: false,
    sub: "", subOp: "gte", subBlank: false,
    vat: "", vatOp: "gte", vatBlank: false,
    total: "", totalOp: "gte", totalBlank: false,
    raised: "", doc: "", agreement: "",
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    try {
      const r = await getProjectInvoices(projectId);
      setInvoices(r.invoices || []);
      setLines(r.lines || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const linesOf = useCallback(
    (id) => lines.filter((l) => l.AV_Invoice_ID === id),
    [lines]
  );

  const shown = useMemo(() => invoices.filter((i) => {
    if (f.dateBlank ? i.Invoice_Date : (f.dateFrom && iso(i.Invoice_Date) < f.dateFrom)) return false;
    if (!textHit(i.Invoice_Number, f.number)) return false;
    if (f.d365Blank ? i.D365_Number : !textHit(i.D365_Number, f.d365)) return false;
    if (f.subBlank ? i.Net_Value != null : !numHit(i.Net_Value, f.sub, f.subOp)) return false;
    if (f.vatBlank ? i.VAT_Value != null : !numHit(i.VAT_Value, f.vat, f.vatOp)) return false;
    if (f.totalBlank ? i.Gross_Value != null : !numHit(i.Gross_Value, f.total, f.totalOp)) return false;
    if (f.raised && i.Raised_By !== f.raised) return false;
    if (f.doc && i.Document_Type !== f.doc) return false;
    if (f.agreement && i.AV_Agreement_Type !== f.agreement) return false;
    return true;
  }), [invoices, f]);

  const totals = useMemo(() => ({
    count: shown.length,
    gross: shown.reduce((t, i) => t + Number(i.Gross_Value || 0), 0),
  }), [shown]);

  const raisedBy = useMemo(
    () => [...new Set(invoices.map((i) => i.Raised_By).filter(Boolean))].sort(),
    [invoices]
  );
  const agreements = useMemo(
    () => [...new Set(invoices.map((i) => i.AV_Agreement_Type).filter(Boolean))].sort(),
    [invoices]
  );

  async function saveInvoice() {
    try {
      await saveAvInvoice({ AV_Invoice_ID: editing, ...draft });
      setEditing(null);
      await load();
      setStatus("Invoice saved");
      setTimeout(() => setStatus(""), 4000);
    } catch (e) { setError(e.message); }
  }

  async function saveLine() {
    try {
      await saveAvInvoiceLine({ AV_Invoice_Line_ID: editLine, ...lineDraft });
      setEditLine(null);
      await load();
      setStatus("Line saved");
      setTimeout(() => setStatus(""), 4000);
    } catch (e) { setError(e.message); }
  }

  async function removeInvoice(i) {
    const n = linesOf(i.AV_Invoice_ID).length;
    if (!window.confirm(
      `Delete ${i.Invoice_Number || "this invoice"}${n ? ` and its ${n} line(s)` : ""}?`
    )) return;
    try { await deleteAvInvoice(i.AV_Invoice_ID); await load(); }
    catch (e) { setError(e.message); }
  }

  async function removeLine(l) {
    if (!window.confirm(`Remove plot ${l.Plot_Ref} from this invoice?`)) return;
    try { await deleteAvInvoiceLine(l.AV_Invoice_Line_ID); await load(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading invoices&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <div className="tab-head">
        <div>
          <h3>
            Asset value invoices{" "}
            <span className="pi-count">
              {totals.count} invoice{totals.count === 1 ? "" : "s"} &middot; {money(totals.gross)}
            </span>
          </h3>
          <p className="tab-sub">
            Raised against {projectRef}. Open one to see the plots it bills for.
          </p>
        </div>
        <div className="pi-actions">
          <ColumnsMenu columns={COLS} hidden={layout.hidden}
            onToggle={layout.toggleColumn} onReset={layout.reset} />
          <button className="btn ghost"
            onClick={() => setOpen(shown.reduce((a, i) => ({ ...a, [i.AV_Invoice_ID]: true }), {}))}>
            Expand all
          </button>
          <button className="btn ghost" onClick={() => setOpen({})}>Collapse all</button>
          <button className="btn ghost" onClick={() => { setLoading(true); load(); }}>
            &#8635; Refresh
          </button>
          <button className="btn accent" onClick={() => setRaising(true)}>+ Raise invoice</button>
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {status && <Banner kind="ok">{status}</Banner>}

      {raising && (
        <RaiseInvoiceModal
          projectId={projectId}
          projectRef={projectRef}
          onClose={() => setRaising(false)}
          onRaised={async (inv) => {
            await load();
            setStatus(`Invoice raised for ${inv.line_count} plot(s) \u2014 Draft`);
            setTimeout(() => setStatus(""), 6000);
          }}
        />
      )}

      <div className="dt-wrap">
        <table className="dt pi">
          <colgroup>
            {layout.visible.map((c) => (
              <col key={c.key} style={{ width: layout.widths[c.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr className="head-row">
              {layout.visible.map((c) => (
                <th key={c.key} {...layout.reorderProps(c.key)}>
                  {c.label}
                  <span className="resizer" draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onMouseDown={(e) => layout.startResize(e, c.key)} />
                </th>
              ))}
            </tr>
            <tr className="filter-row">
              {layout.visible.map((c) => (
                <th key={c.key}>
                  {c.key === "date" ? (<>
                    <input type="date" value={f.dateFrom} disabled={f.dateBlank}
                      aria-label="Invoice date on or after"
                      onChange={(e) => set("dateFrom")(e.target.value)} />
                    <Blank on={f.dateBlank} onChange={set("dateBlank")} />
                  </>)
                  : c.key === "number" ? (
                    <input value={f.number} placeholder="Filter"
                      onChange={(e) => set("number")(e.target.value)} />)
                  : c.key === "d365" ? (<>
                    <input value={f.d365} placeholder="Filter" disabled={f.d365Blank}
                      onChange={(e) => set("d365")(e.target.value)} />
                    <Blank on={f.d365Blank} onChange={set("d365Blank")} />
                  </>)
                  : c.key === "sub" ? (
                    <NumFilter v={f.sub} op={f.subOp} blank={f.subBlank}
                      onV={set("sub")} onOp={set("subOp")} onBlank={set("subBlank")} />)
                  : c.key === "vat" ? (
                    <NumFilter v={f.vat} op={f.vatOp} blank={f.vatBlank}
                      onV={set("vat")} onOp={set("vatOp")} onBlank={set("vatBlank")} />)
                  : c.key === "total" ? (
                    <NumFilter v={f.total} op={f.totalOp} blank={f.totalBlank}
                      onV={set("total")} onOp={set("totalOp")} onBlank={set("totalBlank")} />)
                  : c.key === "raised" ? (
                    <select value={f.raised} onChange={(e) => set("raised")(e.target.value)}>
                      <option value="">&mdash; All &mdash;</option>
                      {raisedBy.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>)
                  : c.key === "doc" ? (
                    <select value={f.doc} onChange={(e) => set("doc")(e.target.value)}>
                      <option value="">&mdash; All &mdash;</option>
                      {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>)
                  : c.key === "agreement" ? (
                    <select value={f.agreement} onChange={(e) => set("agreement")(e.target.value)}>
                      <option value="">&mdash; All &mdash;</option>
                      {agreements.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>)
                  : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={layout.visible.length} className="no-rows">No invoices match these filters.</td></tr>
            )}
            {shown.map((i) => {
              const rows = linesOf(i.AV_Invoice_ID);
              const isOpen = !!open[i.AV_Invoice_ID];
              const isEditing = editing === i.AV_Invoice_ID;
              return (
                <FragmentInvoice key={i.AV_Invoice_ID}
                  cols={layout.visible} inv={i} rows={rows} isOpen={isOpen} isEditing={isEditing}
                  draft={draft} setDraft={setDraft}
                  onToggle={() => setOpen((o) => ({ ...o, [i.AV_Invoice_ID]: !o[i.AV_Invoice_ID] }))}
                  onEdit={() => {
                    setEditing(i.AV_Invoice_ID);
                    setDraft({
                      Invoice_Number: i.Invoice_Number ?? "", D365_Number: i.D365_Number ?? "",
                      Invoice_Date: iso(i.Invoice_Date), Document_Type: i.Document_Type ?? "Invoice",
                      Status: i.Status, Raised_By: i.Raised_By ?? "",
                      Net_Value: i.Net_Value ?? 0, VAT_Value: i.VAT_Value ?? 0,
                      Gross_Value: i.Gross_Value ?? 0,
                    });
                  }}
                  onCancel={() => setEditing(null)}
                  onSave={saveInvoice}
                  onDelete={() => removeInvoice(i)}
                  editLine={editLine} lineDraft={lineDraft} setLineDraft={setLineDraft}
                  onEditLine={(l) => {
                    setEditLine(l.AV_Invoice_Line_ID);
                    setLineDraft({ Plot_Ref: l.Plot_Ref ?? "", Net_Value: l.Net_Value ?? 0,
                      Notes: l.Notes ?? "" });
                  }}
                  onCancelLine={() => setEditLine(null)}
                  onSaveLine={saveLine}
                  onDeleteLine={removeLine}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Blank = ({ on, onChange }) => (
  <label className="pi-blank">
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
    Blank
  </label>
);

const NumFilter = ({ v, op, blank, onV, onOp, onBlank }) => (
  <th>
    <div className="pi-num">
      <select value={op} disabled={blank} onChange={(e) => onOp(e.target.value)}
        aria-label="Comparison">
        <option value="gte">&ge;</option>
        <option value="lte">&le;</option>
      </select>
      <input type="number" step="0.01" value={v} placeholder="&pound;" disabled={blank}
        onChange={(e) => onV(e.target.value)} />
    </div>
    <Blank on={blank} onChange={onBlank} />
  </th>
);

function FragmentInvoice({
  cols, inv, rows, isOpen, isEditing, draft, setDraft, onToggle, onEdit, onCancel, onSave, onDelete,
  editLine, lineDraft, setLineDraft, onEditLine, onCancelLine, onSaveLine, onDeleteLine,
}) {
  const d = (k) => (e) => setDraft((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <tr className={isOpen ? "pi-inv open" : "pi-inv"}>
        {/* Per column, so a dragged heading carries its data with it. */}
        {cols.map((c) => (
          <td key={c.key}
            className={c.key === "open" ? "mid"
              : c.key === "number" ? "mono strong"
              : c.key === "d365" ? "mono"
              : c.align === "right" ? "num nowrap" : undefined}
            onClick={c.key === "open" ? onToggle : undefined}
            style={c.key === "open" ? { cursor: "pointer" } : undefined}>

            {c.key === "open" ? <span className="pi-caret">{isOpen ? "\u25BE" : "\u25B8"}</span>

            : isEditing && c.key === "date" ? (
              <input type="date" value={draft.Invoice_Date} onChange={d("Invoice_Date")} />)
            : isEditing && c.key === "number" ? (
              <input value={draft.Invoice_Number} onChange={d("Invoice_Number")} />)
            : isEditing && c.key === "d365" ? (
              <input value={draft.D365_Number} onChange={d("D365_Number")} />)
            : isEditing && c.key === "sub" ? (
              <input type="number" step="0.01" className="num"
                value={draft.Net_Value} onChange={d("Net_Value")} />)
            : isEditing && c.key === "vat" ? (
              <input type="number" step="0.01" className="num"
                value={draft.VAT_Value} onChange={d("VAT_Value")} />)
            : isEditing && c.key === "total" ? (
              <input type="number" step="0.01" className="num"
                value={draft.Gross_Value} onChange={d("Gross_Value")} />)
            : isEditing && c.key === "raised" ? (
              <input value={draft.Raised_By} onChange={d("Raised_By")} />)
            : isEditing && c.key === "doc" ? (
              <select value={draft.Document_Type} onChange={d("Document_Type")}>
                {DOC_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>)
            : isEditing && c.key === "status" ? (
              <select value={draft.Status} onChange={d("Status")}>
                {STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>)
            : isEditing && c.key === "act" ? (<>
              <button className="btn accent sm" onClick={onSave}>Save</button>
              <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
            </>)

            : c.key === "date"   ? fmt(inv.Invoice_Date)
            : c.key === "number" ? (inv.Invoice_Number
                || <span className="pi-none">not numbered</span>)
            : c.key === "d365"   ? (inv.D365_Number || "\u2014")
            : c.key === "sub"    ? money(inv.Net_Value)
            : c.key === "vat"    ? money(inv.VAT_Value)
            : c.key === "total"  ? money(inv.Gross_Value)
            : c.key === "raised" ? (inv.Raised_By || "\u2014")
            : c.key === "doc"    ? (inv.Document_Type || "Invoice")
            : c.key === "agreement" ? (inv.AV_Agreement_Type || "\u2014")
            : c.key === "status" ? (
              <span className={`av-st av-${String(inv.Status || "").toLowerCase()}`}>
                {inv.Status}
              </span>)
            : c.key === "act" ? (<>
              <button className="row-edit" onClick={onEdit}>Edit</button>
              <button className="row-del" onClick={onDelete}>&#10005;</button>
            </>)
            : null}
          </td>
        ))}
      </tr>

      {/* The header carries a total and so do the lines. When they
          disagree the invoice is wrong somewhere, and saying so is more
          use than quietly showing one of them. */}
      {inv.totals_disagree && (
        <tr className="pi-warn">
          <td colSpan={cols.length}>
            Header sub total {money(inv.Net_Value)} doesn&rsquo;t match its lines
            ({money(inv.lines_total)} across {inv.line_count}).
          </td>
        </tr>
      )}

      {isOpen && (
        <tr className="pi-lines">
          <td colSpan={cols.length}>
            <table className="dt pil">
              <thead>
                <tr className="head-row">
                  <th style={{ width: 110 }}>Plot</th>
                  <th style={{ width: 120, textAlign: "right" }}>Line value</th>
                  <th style={{ width: 130 }}>Connected date</th>
                  <th>Line notes</th>
                  <th style={{ width: 110, textAlign: "right" }} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="no-rows">No lines on this invoice.</td></tr>
                )}
                {rows.map((l) => (
                  editLine === l.AV_Invoice_Line_ID ? (
                    <tr key={l.AV_Invoice_Line_ID}>
                      <td><input value={lineDraft.Plot_Ref}
                        onChange={(e) => setLineDraft((x) => ({ ...x, Plot_Ref: e.target.value }))} /></td>
                      <td><input type="number" step="0.01" className="num" value={lineDraft.Net_Value}
                        onChange={(e) => setLineDraft((x) => ({ ...x, Net_Value: e.target.value }))} /></td>
                      <td>{fmt(l.Connection_Date)}</td>
                      <td><input value={lineDraft.Notes}
                        onChange={(e) => setLineDraft((x) => ({ ...x, Notes: e.target.value }))} /></td>
                      <td className="num nowrap">
                        <button className="btn accent sm" onClick={onSaveLine}>Save</button>
                        <button className="btn ghost sm" onClick={onCancelLine}>Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={l.AV_Invoice_Line_ID}>
                      <td className="mono strong">{l.Plot_Number || l.Plot_Ref}</td>
                      <td className="num">{money(l.Net_Value)}</td>
                      {/* Read from the plot's connection record, so it can't
                          drift from what the connections screen shows. */}
                      <td className={l.Connection_Date ? "" : "pi-none"}>
                        {l.Connection_Date ? fmt(l.Connection_Date) : "no connection record"}
                      </td>
                      <td>{l.Notes || <span className="pi-none">&mdash;</span>}</td>
                      <td className="num nowrap">
                        <button className="row-edit" onClick={() => onEditLine(l)}>Edit</button>
                        <button className="row-del" onClick={() => onDeleteLine(l)}>&#10005;</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

const CSS = `
.pi-count { font-size: 12.5px; font-weight: 500; color: var(--muted); margin-left: 8px; }
.pi-actions { display: flex; gap: 8px; align-items: center; }
.dt.pi td { padding: 5px 8px; }
.dt.pi tbody tr.pi-inv.open { background: var(--accent-light); }
.pi-caret { color: var(--accent); font-size: 12px; }
.pi-none { color: var(--muted); font-style: italic; }
.dt.pi tbody tr.pi-warn td { background: #fffbeb; color: #92400e; font-size: 11.5px;
  padding: 5px 12px 5px 42px; border-top: none; }
.dt.pi tbody tr.pi-lines > td { padding: 0 0 10px 42px; background: #fbfcfe; }
.dt.pil { width: 100%; }
.dt.pil td { padding: 4px 8px; }
.pi-blank { display: flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 3px 0 0; }
.pi-num { display: flex; gap: 3px; }
.pi-num select { width: 42px; flex: none; padding: 3px 2px; }
.av-st { font-size: 10.5px; font-weight: 700; border-radius: 20px; padding: 1px 9px;
  background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
.av-st.av-issued { background: #dbeafe; border-color: #93c5fd; color: #1e40af; }
.av-st.av-paid { background: #d1fae5; border-color: #6ee7b7; color: #065f46; }
.av-st.av-cancelled { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
`;
