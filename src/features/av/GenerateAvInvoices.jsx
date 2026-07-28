import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import * as XLSX from "xlsx";
import { listProjects } from "../../api/projects.js";
import { listPlots } from "../../api/plots.js";
import { getLookups } from "../../api/lookups.js";
import { checkInvoiced, generateInvoices } from "../../api/avInvoices.js";
import { parseAvFile, matchRowsToPlots, groupByContract, parseInvoiceReport } from "./parseAvFile.js";
import { adminList } from "../../api/admin.js";
import { utilityById, RESIDENTIAL_UTILITIES } from "../../lib/utilities.js";

/* Generate AV Invoices.

   The operator's schedule arrives as a spreadsheet of plots and values.
   This matches it against our plots, groups it into an invoice per
   contract and utility, and shows what will happen before anything is
   written. Nothing is created until the preview is confirmed. */

const money = (n) =>
  n == null ? "—" : `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

const STEPS = ["Source mapping", "Preview", "Done"];

export default function GenerateAvInvoices() {
  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [utilityId, setUtilityId] = useState("");
  const [idnoId, setIdnoId] = useState("");
  const [lookups, setLookups] = useState({});
  const [mappings, setMappings] = useState([]);
  const [mappingId, setMappingId] = useState("");
  const [reportFile, setReportFile] = useState(null);
  const [report, setReport] = useState(null);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [matched, setMatched] = useState([]);
  const [alreadyBilled, setAlreadyBilled] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [assignNumbers, setAssignNumbers] = useState(true);
  const [raisedBy, setRaisedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    listProjects({ limit: 500 }).then((r) => setProjects(r.rows || [])).catch(() => {});
    getLookups().then(setLookups).catch(() => {});
    adminList("IDNO_Source_Mapping")
      .then((r) => setMappings((r.rows || []).filter((m) => m.Is_Active !== false)))
      .catch((e) => setError(`Couldn't load source mappings: ${e.message}`));
  }, []);

  const mapping = mappings.find(
    (m) => String(m.IDNO_Source_Mapping_ID) === String(mappingId)
  );
  const config = mapping?.Config || {};

  const project = projects.find((p) => String(p.Project_ID) === String(projectId));

  async function onReportFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await parseInvoiceReport(f);
      setReportFile(f);
      setReport(r);
      setError("");
    } catch (e2) { setError(`Couldn't read the invoice report: ${e2.message}`); }
    finally { e.target.value = ""; }
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!mappingId) return setError("Pick a source mapping — it says how to read the file.");
    if (!projectId) return setError("Choose a project first — plots are matched against it.");
    if (!utilityId) return setError("Choose which utility this schedule is for.");

    setBusy(true);
    setError("");
    try {
      const p = await parseAvFile(f, config);
      const plotsRes = await listPlots(projectId);
      const rows = matchRowsToPlots(p.rows, plotsRes.rows || []);
      const billed = await checkInvoiced(projectId, utilityId);

      setFile(f);
      setParsed(p);
      setMatched(rows);
      setAlreadyBilled(billed.invoiced || []);
      /* Start with the unusable rows already excluded, so the count on
         the button is the count that will actually be written. */
      const billedIds = new Set((billed.invoiced || []).map((b) => b.plot_id));
      setExcluded(rows
        .filter((r) => !r.matched || billedIds.has(r.plot?.Plot_ID))
        .map((r) => r.sourceRow));
      setStep(1);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const billedByPlot = useMemo(() => {
    const m = new Map();
    alreadyBilled.forEach((b) => m.set(b.plot_id, b));
    return m;
  }, [alreadyBilled]);

  const rowState = (r) => {
    if (!r.matched) return { key: "unmatched", label: "No matching plot", tone: "bad" };
    const b = billedByPlot.get(r.plot.Plot_ID);
    if (b) return { key: "billed", label: `Already on ${b.invoice_number || "an invoice"}`, tone: "warn" };
    if (excluded.includes(r.sourceRow)) return { key: "excluded", label: "Excluded", tone: "muted" };
    return { key: "ok", label: "Ready", tone: "ok" };
  };

  const included = matched.filter((r) => rowState(r).key === "ok");
  const total = included.reduce((s, r) => s + r.value, 0);

  const toggle = (row) =>
    setExcluded((x) => (x.includes(row) ? x.filter((v) => v !== row) : [...x, row]));

  async function generate() {
    if (!included.length) return setError("Nothing to invoice.");
    setBusy(true);
    try {
      const res = await generateInvoices({
        assign_numbers: assignNumbers && !config.no_invoice_number,
        raised_by: raisedBy || null,
        source_file: file?.name || null,
        groups: [{
          key: `${projectId}-${utilityId}`,
          project_id: Number(projectId),
          utility_id: Number(utilityId),
          idno_id: idnoId ? Number(idnoId) : null,
          contract_number: project?.Contract_Number || null,
          agreement_type_id: mapping?.AV_Agreement_Type_ID || null,
          vat_rate: config.default_vat_rate ?? 20,
          lines: included.map((r) => ({
            plot_id: r.plot.Plot_ID,
            plot_ref: r.plot.Plot_Ref || r.plotRef,
            description: r.description || null,
            net_value: r.value,
            source_row: r.sourceRow,
          })),
        }],
      });
      setResult(res);
      setStep(2);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  /* The finance system's bulk upload. Column names are theirs, so they're
     spelled out rather than generated from ours. */
  function downloadBulk() {
    const inv = result?.created?.[0];
    const rows = included.map((r) => ({
      "Invoice Number": inv?.Invoice_Number || "",
      "Contract Number": project?.Contract_Number || "",
      "Client Name": lookups.idnos?.find((i) => String(i.IDNO_ID) === String(idnoId))?.IDNO_Name || "",
      "Raised By": raisedBy || "",
      "Date Raised": inv?.Invoice_Date || new Date().toISOString().slice(0, 10),
      "Invoice Type": "Asset Value",
      "Plot": r.plot.Plot_Number,
      "Plot Value": r.value,
      "Comments": [config.comments_prefix, r.description || `plot ${r.plot.Plot_Number}`]
        .filter(Boolean).join(" — "),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bulk Upload");
    XLSX.writeFile(wb, `AV Bulk Upload ${inv?.Invoice_Number || "draft"}.xlsx`.replace(/\//g, "-"));
  }

  function reset() {
    setStep(0); setFile(null); setParsed(null); setMatched([]); setReport(null); setReportFile(null);
    setExcluded([]); setResult(null); setError("");
  }

  return (
    <div className="gav">
      <style>{CSS}</style>

      <div className="gav-steps">
        {STEPS.map((s, i) => (
          <span key={s} className={i === step ? "gs on" : i < step ? "gs done" : "gs"}>
            <span className="gs-n">{i < step ? "\u2713" : i + 1}</span>{s}
          </span>
        ))}
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {step === 0 && (
        <div className="gav-panel">
          <p className="gav-step-title">1 of 3 &mdash; Source mapping</p>
          <p className="gav-lede">
            Pick the operator and agreement type you&rsquo;re invoicing for. The mapping says
            how to read their export &mdash; which columns hold the plot and the value, and
            which rows to keep.
          </p>
          <div className="fld">
            <label htmlFor="gav-mapping">Source mapping <span className="req">*</span></label>
            <select id="gav-mapping" value={mappingId} onChange={(e) => setMappingId(e.target.value)}>
              <option value="">&mdash; Select a source mapping &mdash;</option>
              {mappings.map((m) => (
                <option key={m.IDNO_Source_Mapping_ID} value={m.IDNO_Source_Mapping_ID}>
                  {m.Mapping_Name}
                </option>
              ))}
            </select>
            {mappings.length === 0 && (
              <p className="hint warn">
                No mappings set up. Add them in Admin &rarr; IDNO Source Mapping.
              </p>
            )}
            {mapping && (
              <p className="hint">
                Reads <strong>{config.plot || "?"}</strong> as the plot and{" "}
                <strong>{config.value || "?"}</strong> as the value, from row{" "}
                {config.header_row || 1}.
                {config.status_filter && <> Only rows marked &ldquo;{config.status_filter}&rdquo;.</>}
                {config.no_invoice_number && <> These aren&rsquo;t given invoice numbers.</>}
              </p>
            )}
          </div>

          <p className="gav-step-title">2 of 3 &mdash; Where it belongs</p>
          <div className="gav-row">
            <div className="fld grow">
              <label htmlFor="gav-project">Project <span className="req">*</span></label>
              <select id="gav-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">&mdash; Select &mdash;</option>
                {projects.map((p) => (
                  <option key={p.Project_ID} value={p.Project_ID}>
                    {p.Project_Ref} &mdash; {p.Site_Name || "Unnamed site"}
                    {p.Contract_Number ? ` (${p.Contract_Number})` : ""}
                  </option>
                ))}
              </select>
              {project && !project.Contract_Number && !config.no_invoice_number && (
                <p className="hint warn">
                  No contract number &mdash; invoices can&rsquo;t be numbered without one.
                </p>
              )}
            </div>
            <div className="fld">
              <label htmlFor="gav-utility">Utility <span className="req">*</span></label>
              <select id="gav-utility" value={utilityId} onChange={(e) => setUtilityId(e.target.value)}>
                <option value="">&mdash; Select &mdash;</option>
                {RESIDENTIAL_UTILITIES.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="gav-idno">Operator</label>
              <select id="gav-idno" value={idnoId || mapping?.IDNO_ID || ""}
                onChange={(e) => setIdnoId(e.target.value)}>
                <option value="">&mdash; None &mdash;</option>
                {(lookups.idnos || []).map((i) => (
                  <option key={i.IDNO_ID} value={i.IDNO_ID}>{i.IDNO_Name}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="gav-step-title">3 of 3 &mdash; Source export</p>
          <p className="gav-lede">
            The spreadsheet from the operator &mdash; ESP&rsquo;s &ldquo;Available to Invoice
            Connections&rdquo; report, or whatever this mapping expects.
          </p>
          <div className="gav-row">
            <div className="fld grow">
              <label htmlFor="gav-file">Source export <span className="req">*</span></label>
              <input id="gav-file" type="file" accept=".xlsx,.xls,.csv"
                disabled={busy || !mappingId || !projectId || !utilityId} onChange={onFile} />
            </div>
            <div className="fld grow">
              <label htmlFor="gav-report">Invoice report <span className="opt">(optional)</span></label>
              <input id="gav-report" type="file" accept=".xlsx,.xls,.csv" onChange={onReportFile} />
              <p className="hint">
                {report
                  ? `Read ${reportFile?.name} — highest numbers found for ${
                      Object.keys(report.highestByContract).length} contract(s).`
                  : "Used to continue invoice numbering from what finance already holds."}
              </p>
            </div>
          </div>
        </div>
      )}

      {step === 1 && parsed && (
        <>
          <div className="gav-summary">
            <span className="gs-pill">{matched.length} rows read</span>
            <span className="gs-pill ok">{included.length} to invoice</span>
            <span className="gs-pill warn">
              {matched.filter((r) => rowState(r).key === "billed").length} already billed
            </span>
            <span className="gs-pill bad">
              {matched.filter((r) => !r.matched).length} unmatched
            </span>
            <span className="gs-total">{money(total)} net</span>
          </div>

          <p className="gav-cols">
            Read <strong>{parsed.columns.plotRef}</strong> as the plot and{" "}
            <strong>{parsed.columns.value}</strong> as the value, from sheet{" "}
            <strong>{parsed.sheetName}</strong>.
            {parsed.skipped.length > 0 && (
              <span className="gav-skip"> {parsed.skipped.length} row(s) skipped: {
                parsed.skipped.slice(0, 3).map((s) => `${s.plotRef} (${s.reason})`).join("; ")
              }</span>
            )}
          </p>

          <div className="gav-table-wrap">
            <table className="gav-table">
              <thead>
                <tr>
                  <th className="mid">Use</th><th>Row</th><th>In file</th><th>Plot</th>
                  <th>Description</th><th className="num">Value</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {matched.map((r) => {
                  const st = rowState(r);
                  const usable = r.matched && !billedByPlot.has(r.plot?.Plot_ID);
                  return (
                    <tr key={r.sourceRow} className={st.key}>
                      <td className="mid">
                        <input type="checkbox" disabled={!usable}
                          checked={usable && !excluded.includes(r.sourceRow)}
                          onChange={() => toggle(r.sourceRow)} />
                      </td>
                      <td className="muted">{r.sourceRow}</td>
                      <td className="mono">{r.plotRef}</td>
                      <td className="mono">{r.plot?.Plot_Number ?? "\u2014"}</td>
                      <td>{r.description || "\u2014"}</td>
                      <td className="num">{money(r.value)}</td>
                      <td><span className={`gav-pill ${st.tone}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="gav-actions">
            <label className="gav-check">
              <input type="checkbox" checked={assignNumbers && !config.no_invoice_number}
                disabled={!!config.no_invoice_number}
                onChange={(e) => setAssignNumbers(e.target.checked)} />
              {config.no_invoice_number
                ? "This mapping doesn't use invoice numbers"
                : "Assign an invoice number"}
              {project?.Contract_Number && (
                <span className="gav-next"> &mdash; next is {project.Contract_Number}/…</span>
              )}
            </label>
            <input className="gav-by" value={raisedBy} placeholder="Raised by"
              aria-label="Raised by" onChange={(e) => setRaisedBy(e.target.value)} />
            <span className="gav-spacer" />
            <button className="btn ghost" onClick={reset}>Start again</button>
            <button className="btn accent" disabled={busy || !included.length} onClick={generate}>
              {busy ? "Generating\u2026" : `Create invoice for ${included.length} plots`}
            </button>
          </div>
        </>
      )}

      {step === 2 && result && (
        <div className="gav-panel">
          {result.created?.length > 0 ? (
            <>
              <Banner kind="ok">
                {result.created.length} invoice{result.created.length === 1 ? "" : "s"} created.
              </Banner>
              <table className="gav-table done">
                <thead>
                  <tr><th>Number</th><th>Contract</th><th className="num">Net</th>
                    <th className="num">VAT</th><th className="num">Gross</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {result.created.map((inv) => (
                    <tr key={inv.AV_Invoice_ID}>
                      <td className="mono strong">{inv.Invoice_Number || "not numbered"}</td>
                      <td className="mono">{inv.Contract_Number || "\u2014"}</td>
                      <td className="num">{money(inv.Net_Value)}</td>
                      <td className="num">{money(inv.VAT_Value)}</td>
                      <td className="num strong">{money(inv.Gross_Value)}</td>
                      <td>{inv.Status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <Banner kind="error">No invoices were created.</Banner>
          )}

          {result.failed?.length > 0 && (
            <Banner kind="warn">
              {result.failed.length} failed: {result.failed.map((f) => f.error).join("; ")}
            </Banner>
          )}

          <div className="gav-actions">
            <button className="btn ghost" onClick={downloadBulk}>Download bulk upload</button>
            <span className="gav-spacer" />
            <button className="btn accent" onClick={reset}>Do another</button>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.gav-steps { display: flex; gap: 6px; margin-bottom: 14px; }
.gs { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600;
  color: var(--muted); padding: 6px 13px; border: 1px solid var(--border); border-radius: 999px; }
.gs.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
.gs.done { color: var(--ok-text); border-color: var(--ok-border); background: var(--ok-bg); }
.gs-n { width: 17px; height: 17px; border-radius: 50%; background: var(--bg);
  display: flex; align-items: center; justify-content: center; font-size: 10px; }
.gav-panel { border: 1px solid var(--border); border-radius: var(--radius);
  padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.gav-step-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--accent); margin: 4px 0 0; }
.opt { font-weight: 400; text-transform: none; color: var(--muted); }
.gav-lede { margin: 0; font-size: 12.5px; color: var(--muted); max-width: 76ch; line-height: 1.55; }
.gav-row { display: flex; gap: 12px; }
.gav-row .fld.grow { flex: 1; }
.hint.warn { color: var(--warn-text); font-weight: 600; }
.gav-summary { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.gs-pill { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 13px;
  background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
.gs-pill.ok { background: var(--ok-bg); border-color: var(--ok-border); color: var(--ok-text); }
.gs-pill.warn { background: var(--warn-bg); border-color: var(--warn-border); color: var(--warn-text); }
.gs-pill.bad { background: var(--err-bg); border-color: var(--err-border); color: var(--err-text); }
.gs-total { margin-left: auto; font-size: 15px; font-weight: 700; color: var(--accent); }
.gav-cols { font-size: 11.5px; color: var(--muted); margin: 0 0 10px; line-height: 1.5; }
.gav-skip { color: var(--warn-text); }
.gav-table-wrap { border: 1px solid var(--border); border-radius: var(--radius);
  overflow: auto; max-height: 54vh; }
.gav-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.gav-table th { position: sticky; top: 0; background: var(--accent); color: #fff; text-align: left;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 8px 10px; }
.gav-table td { padding: 6px 10px; border-top: 1px solid var(--border); }
.gav-table tr.unmatched td { background: #fef2f2; }
.gav-table tr.billed td { background: #fffbeb; }
.gav-table tr.excluded td { opacity: .5; }
.gav-table .num { text-align: right; }
.gav-table .mid { text-align: center; }
.gav-table .muted { color: var(--muted); }
.gav-table .strong { font-weight: 700; }
.gav-table.done { border: 1px solid var(--border); border-radius: var(--radius); }
.gav-pill { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px;
  white-space: nowrap; }
.gav-pill.ok { background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border); }
.gav-pill.warn { background: var(--warn-bg); color: var(--warn-text); border: 1px solid var(--warn-border); }
.gav-pill.bad { background: var(--err-bg); color: var(--err-text); border: 1px solid var(--err-border); }
.gav-pill.muted { background: var(--bg); color: var(--muted); border: 1px solid var(--border); }
.gav-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.gav-spacer { flex: 1; }
.gav-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0; cursor: pointer; }
.gav-next { color: var(--muted); }
.gav-by { width: 150px; font-size: 12.5px; }
.mono { font-family: ui-monospace, Menlo, monospace; }
`;
