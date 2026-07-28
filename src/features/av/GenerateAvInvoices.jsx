import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import * as XLSX from "xlsx";
import { getLookups } from "../../api/lookups.js";
import { adminList } from "../../api/admin.js";
import { resolveContracts, generateInvoices } from "../../api/avInvoices.js";
import {
  parseAvFile, groupByContract, resolveGroups, parseInvoiceReport,
} from "./parseAvFile.js";

/* Generate AV Invoices.

   The operator's export decides everything: which sites are being paid
   for, which plots, and how much. There is no project picker — the
   contract reference in the file is matched against Aptus, and one
   invoice is produced per contract and network number.

   Two steps in, then a preview. Nothing is written until the preview is
   confirmed. */

const money = (n) =>
  n == null ? "—" : `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

export default function GenerateAvInvoices() {
  const [phase, setPhase] = useState("idle");   // idle | preview | done
  const [mappings, setMappings] = useState([]);
  const [mappingId, setMappingId] = useState("");
  const [lookups, setLookups] = useState({});
  const [file, setFile] = useState(null);
  const [reportFile, setReportFile] = useState(null);
  const [report, setReport] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [groups, setGroups] = useState([]);
  const [excludedGroups, setExcludedGroups] = useState([]);
  const [excludedLines, setExcludedLines] = useState([]);
  const [expanded, setExpanded] = useState([]);
  const [assignNumbers, setAssignNumbers] = useState(true);
  const [raisedBy, setRaisedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    getLookups().then(setLookups).catch(() => {});
    adminList("IDNO_Source_Mapping")
      .then((r) => setMappings((r.rows || []).filter((m) => m.Is_Active !== false)))
      .catch((e) => setError(`Couldn't load source mappings: ${e.message}`));
  }, []);

  const mapping = mappings.find(
    (m) => String(m.IDNO_Source_Mapping_ID) === String(mappingId)
  );
  const config = mapping?.Config || {};
  const canProcess = !!mappingId && !!file;

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(""); }
  }

  async function pickReport(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setReport(await parseInvoiceReport(f));
      setReportFile(f);
      setError("");
    } catch (e2) { setError(`Couldn't read the invoice report: ${e2.message}`); }
    finally { e.target.value = ""; }
  }

  async function process() {
    setBusy(true);
    setError("");
    try {
      const p = await parseAvFile(file, config);
      if (!p.rows.length) throw new Error("No usable rows — check the mapping's filters.");

      const raw = groupByContract(p.rows);
      const contracts = [...new Set(raw.map((g) => g.contract).filter(Boolean))];
      if (!contracts.length) {
        throw new Error(
          `No contract reference found. The mapping reads it from "${
            config.ap_number || "(not set)"}" — check that column exists.`
        );
      }

      const res = await resolveContracts(contracts);
      const resolved = resolveGroups(raw, res.projects, res.plots, res.invoiced);

      setParsed(p);
      setGroups(resolved);
      /* Groups with no project can't be invoiced, so they start excluded
         and the counts on the button are the counts that will be written. */
      setExcludedGroups(resolved.filter((g) => !g.project).map((g) => g.key));
      setExcludedLines(
        resolved.flatMap((g) => g.lines
          .filter((l) => !l.matched || l.billedOn)
          .map((l) => `${g.key}|${l.sourceRow}`))
      );
      setExpanded(resolved.length === 1 ? [resolved[0].key] : []);
      setPhase("preview");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const lineState = (g, l) => {
    if (!g.project) return { key: "noproject", label: "No matching contract", tone: "bad" };
    if (!l.matched) return { key: "unmatched", label: "No matching plot", tone: "bad" };
    if (l.billedOn) return { key: "billed", label: `On ${l.billedOn}`, tone: "warn" };
    if (l.partlyBilled) return { key: "part", label: "Some plots already billed", tone: "warn" };
    if (l.unmatchedRefs?.length) {
      return { key: "part", label: `${l.unmatchedRefs.length} plot(s) not found`, tone: "warn" };
    }
    if (excludedLines.includes(`${g.key}|${l.sourceRow}`)) {
      return { key: "excluded", label: "Excluded", tone: "muted" };
    }
    return { key: "ok", label: "Ready", tone: "ok" };
  };

  const included = useMemo(() => groups
    .filter((g) => g.project && !excludedGroups.includes(g.key))
    .map((g) => ({ ...g, use: g.lines.filter((l) => ["ok", "part"].includes(lineState(g, l).key)) }))
    .filter((g) => g.use.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, excludedGroups, excludedLines]);

  const totalLines = included.reduce((s, g) => s + g.use.length, 0);
  const totalValue = included.reduce(
    (s, g) => s + g.use.reduce((t, l) => t + l.value, 0), 0);

  const toggleGroup = (k) =>
    setExcludedGroups((x) => (x.includes(k) ? x.filter((v) => v !== k) : [...x, k]));
  const toggleLine = (k) =>
    setExcludedLines((x) => (x.includes(k) ? x.filter((v) => v !== k) : [...x, k]));
  const toggleExpand = (k) =>
    setExpanded((x) => (x.includes(k) ? x.filter((v) => v !== k) : [...x, k]));

  const utilityIdFor = (g) => {
    const name = (g.use?.[0]?.service || g.lines?.[0]?.service || "").toLowerCase();
    if (/elec/.test(name)) return 1;
    if (/gas/.test(name)) return 2;
    if (/water/.test(name)) return 3;
    return config.utility_id ?? null;
  };

  async function generate() {
    if (!included.length) return setError("Nothing to invoice.");
    setBusy(true);
    try {
      const res = await generateInvoices({
        assign_numbers: assignNumbers && !config.no_invoice_number,
        raised_by: raisedBy || null,
        source_file: file?.name || null,
        groups: included.map((g) => ({
          key: g.key,
          project_id: g.project.Project_ID,
          utility_id: utilityIdFor(g),
          idno_id: mapping?.IDNO_ID || null,
          agreement_type_id: mapping?.AV_Agreement_Type_ID || null,
          contract_number: g.contract,
          vat_rate: config.default_vat_rate ?? 20,
          lines: g.use.map((l) => ({
            plot_id: l.plot.Plot_ID,
            plot_ref: l.plot.Plot_Ref || l.plotRef,
            description: l.description || null,
            net_value: l.value,
            source_row: l.sourceRow,
          })),
        })),
      });
      setResult(res);
      setPhase("done");
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function downloadBulk() {
    const byContract = new Map();
    (result?.created || []).forEach((i) => byContract.set(i.Contract_Number, i));
    const rows = included.flatMap((g) => {
      const inv = byContract.get(g.contract);
      return g.use.map((l) => ({
        "Invoice Number": inv?.Invoice_Number || "",
        "Contract Number": g.contract,
        "Client Name": config.client_short_name
          || lookups.idnos?.find((i) => i.IDNO_ID === mapping?.IDNO_ID)?.IDNO_Name || "",
        "Raised By": raisedBy || "",
        "Date Raised": inv?.Invoice_Date || new Date().toISOString().slice(0, 10),
        "Invoice Type": config.invoice_subtype || "Asset Value",
        "Plot": l.plot.Plot_Number,
        "Plot Value": l.value,
        "Comments": [config.comments_prefix, `plot ${l.plot.Plot_Number}`]
          .filter(Boolean).join(" — "),
      }));
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Bulk Upload");
    XLSX.writeFile(wb, `AV Bulk Upload ${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function reset() {
    setPhase("idle"); setFile(null); setParsed(null); setGroups([]);
    setExcludedGroups([]); setExcludedLines([]); setResult(null); setError("");
    setReport(null); setReportFile(null);
  }

  return (
    <div className="gav">
      <style>{CSS}</style>
      {error && <Banner kind="error">{error}</Banner>}

      {phase === "idle" && (
        <div className="gav-card">
          <p className="gav-step">1 of 2 &mdash; Source mapping</p>
          <p className="gav-lede">
            Pick the IDNO and agreement type you&rsquo;re invoicing for. The mapping tells
            us how to read the source file.
          </p>
          <select className="gav-select" value={mappingId}
            aria-label="Source mapping" onChange={(e) => setMappingId(e.target.value)}>
            <option value="">&mdash; Select a source mapping &mdash;</option>
            {mappings.map((m) => (
              <option key={m.IDNO_Source_Mapping_ID} value={m.IDNO_Source_Mapping_ID}>
                {m.Mapping_Name}
              </option>
            ))}
          </select>
          {mappings.length === 0 && (
            <p className="gav-warn">
              No mappings set up &mdash; add them in Admin &rarr; IDNO Source Mapping.
            </p>
          )}
          {mapping && (
            <p className="gav-fine">
              Reads <strong>{config.plot || "?"}</strong> as the plot,{" "}
              <strong>{config.value || "?"}</strong> as the value and{" "}
              <strong>{config.ap_number || "?"}</strong> as the contract, from row{" "}
              {config.header_row || 1}.
              {config.status_filter && <> Only rows marked &ldquo;{config.status_filter}&rdquo;.</>}
              {config.no_invoice_number && <> These aren&rsquo;t given invoice numbers.</>}
            </p>
          )}

          <p className="gav-step">2 of 2 &mdash; Source export</p>
          <p className="gav-lede">
            Upload the .xlsx from the IDNO (e.g. ESP&rsquo;s &ldquo;Available to Invoice
            Connections&rdquo; report).
          </p>
          <div className="gav-file">
            <label className="gav-choose">
              Choose file&hellip;
              <input type="file" accept=".xlsx,.xls,.csv" onChange={pickFile} />
            </label>
            <span className="gav-fname">{file ? file.name : "No file selected"}</span>
          </div>

          <details className="gav-more">
            <summary>Invoice report (optional)</summary>
            <p className="gav-lede">
              Your finance export, read only to continue invoice numbering from the
              highest number already issued.
            </p>
            <div className="gav-file">
              <label className="gav-choose alt">
                Choose file&hellip;
                <input type="file" accept=".xlsx,.xls,.csv" onChange={pickReport} />
              </label>
              <span className="gav-fname">
                {report
                  ? `${reportFile?.name} — ${Object.keys(report.highestByContract).length} contract(s)`
                  : "No file selected"}
              </span>
            </div>
          </details>

          <div className="gav-foot">
            <button className="btn ghost" onClick={reset}>Reset</button>
            <button className="btn accent" disabled={!canProcess || busy} onClick={process}>
              {busy ? "Processing\u2026" : "Process \u2192"}
            </button>
          </div>
        </div>
      )}

      {phase === "preview" && (
        <>
          <div className="gav-summary">
            <span className="gp">{groups.length} contract{groups.length === 1 ? "" : "s"} in file</span>
            <span className="gp ok">{included.length} to invoice</span>
            <span className="gp bad">
              {groups.filter((g) => !g.project).length} unmatched contract(s)
            </span>
            <span className="gp">{totalLines} plots</span>
            <span className="gav-total">{money(totalValue)} net</span>
          </div>

          <p className="gav-fine">
            Read sheet <strong>{parsed.sheetName}</strong>, headings row {parsed.headerRow}
            {" \u2014 "}<strong>{parsed.columns.plot}</strong> as the plot,{" "}
            <strong>{parsed.columns.value}</strong> as the value.
            {parsed.headerRowMoved && (
              <span className="gav-moved">
                {" "}The mapping expected row {parsed.headerRowMoved}; worth updating it.
              </span>
            )}
            {parsed.skipped.length > 0 && (
              <> {parsed.skipped.length} row(s) skipped by the mapping&rsquo;s filters.</>
            )}
          </p>

          <div className="gav-groups">
            {groups.map((g) => {
              const off = excludedGroups.includes(g.key) || !g.project;
              const open = expanded.includes(g.key);
              const ready = g.lines.filter((l) => lineState(g, l).key === "ok").length;
              return (
                <div className={off ? "gg off" : "gg"} key={g.key}>
                  <div className="gg-head">
                    <input type="checkbox" disabled={!g.project}
                      checked={!off} onChange={() => toggleGroup(g.key)} />
                    <button className="gg-toggle" onClick={() => toggleExpand(g.key)}>
                      {open ? "\u25BE" : "\u25B8"}
                    </button>
                    <span className="gg-ap mono">{g.contract || "(no contract)"}</span>
                    {g.network && <span className="gg-net">network {g.network}</span>}
                    <span className="gg-site">
                      {g.project
                        ? g.project.Site_Name || g.project.Project_Ref
                        : <span className="gg-miss">not in Aptus</span>}
                    </span>
                    <span className="gg-count">{ready} of {g.lines.length} plots</span>
                    <span className="gg-val">
                      {money(g.lines.filter((l) => lineState(g, l).key === "ok")
                        .reduce((s, l) => s + l.value, 0))}
                    </span>
                  </div>

                  {open && (
                    <table className="gg-table">
                      <thead>
                        <tr>
                          <th className="mid">Use</th><th>Row</th><th>In file</th>
                          <th>Plot</th><th className="num">Value</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.lines.map((l) => {
                          const st = lineState(g, l);
                          const usable = g.project && l.matched && !l.billedOn;
                          const key = `${g.key}|${l.sourceRow}`;
                          return (
                            <tr key={key} className={st.key}>
                              <td className="mid">
                                <input type="checkbox" disabled={!usable}
                                  checked={usable && !excludedLines.includes(key)}
                                  onChange={() => toggleLine(key)} />
                              </td>
                              <td className="muted">{l.sourceRow}</td>
                              <td className="mono">{l.plotRef}</td>
                              <td className="mono">{l.plotLabel ?? "\u2014"}</td>
                              <td className="num">{money(l.value)}</td>
                              <td><span className={`gav-pill ${st.tone}`}>{st.label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

          <div className="gav-foot wide">
            <label className="gav-check">
              <input type="checkbox" checked={assignNumbers && !config.no_invoice_number}
                disabled={!!config.no_invoice_number}
                onChange={(e) => setAssignNumbers(e.target.checked)} />
              {config.no_invoice_number
                ? "This mapping doesn't use invoice numbers"
                : "Generate invoice numbers"}
            </label>
            <input className="gav-by" value={raisedBy} placeholder="Raised by"
              aria-label="Raised by" onChange={(e) => setRaisedBy(e.target.value)} />
            <span className="gav-spacer" />
            <button className="btn ghost" onClick={reset}>Start again</button>
            <button className="btn accent" disabled={busy || !included.length} onClick={generate}>
              {busy ? "Generating\u2026"
                : `Create ${included.length} invoice${included.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}

      {phase === "done" && result && (
        <div className="gav-card">
          {result.created?.length > 0 ? (
            <>
              <Banner kind="ok">
                {result.created.length} invoice{result.created.length === 1 ? "" : "s"} created.
              </Banner>
              <table className="gg-table done">
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
          ) : <Banner kind="error">No invoices were created.</Banner>}

          {result.failed?.length > 0 && (
            <Banner kind="warn">
              {result.failed.length} failed &mdash;{" "}
              {result.failed.map((f) => `${f.group}: ${f.error}`).join("; ")}
            </Banner>
          )}

          <div className="gav-foot">
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
.gav-card { border: 1px solid var(--border); border-radius: 12px; padding: 22px 24px;
  max-width: 720px; margin: 0 auto; background: var(--white); }
.gav-step { font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--accent); margin: 0 0 6px; }
.gav-step:not(:first-child) { margin-top: 22px; }
.gav-lede { margin: 0 0 10px; font-size: 12.5px; color: var(--text); line-height: 1.55; }
.gav-select { width: 100%; font-size: 13px; }
.gav-moved { color: var(--warn-text); font-weight: 600; }
.gav-fine { font-size: 11.5px; color: var(--muted); margin: 8px 0 0; line-height: 1.55; }
.gav-warn { font-size: 11.5px; color: var(--warn-text); font-weight: 600; margin: 8px 0 0; }
.gav-file { display: flex; align-items: center; gap: 12px; }
.gav-choose { display: inline-block; background: var(--accent); color: #fff; border-radius: 7px;
  padding: 9px 18px; font-size: 11.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; cursor: pointer; }
.gav-choose.alt { background: var(--muted); }
.gav-choose input { display: none; }
.gav-fname { font-size: 12.5px; color: var(--muted); }
.gav-more { margin-top: 18px; }
.gav-more summary { font-size: 12px; font-weight: 600; color: var(--accent); cursor: pointer; }
.gav-more > * { margin-top: 10px; }
.gav-foot { display: flex; align-items: center; gap: 9px; margin-top: 24px;
  padding-top: 16px; border-top: 1px solid var(--border); justify-content: flex-end; }
.gav-foot.wide { justify-content: flex-start; }
.gav-spacer { flex: 1; }
.gav-summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.gp { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 13px;
  background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
.gp.ok { background: var(--ok-bg); border-color: var(--ok-border); color: var(--ok-text); }
.gp.bad { background: var(--err-bg); border-color: var(--err-border); color: var(--err-text); }
.gav-total { margin-left: auto; font-size: 16px; font-weight: 700; color: var(--accent); }
.gav-groups { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; }
.gg { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.gg.off { opacity: .55; }
.gg-head { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: var(--white); }
.gg-toggle { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px; }
.gg-ap { font-weight: 700; font-size: 13px; }
.gg-net { font-size: 10px; font-weight: 700; background: var(--accent-light); color: var(--accent);
  border-radius: 4px; padding: 1px 7px; }
.gg-site { flex: 1; font-size: 12.5px; color: var(--muted); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-miss { color: var(--err-text); font-weight: 600; }
.gg-count { font-size: 11.5px; color: var(--muted); }
.gg-val { font-size: 13px; font-weight: 700; min-width: 92px; text-align: right; }
.gg-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.gg-table th { background: var(--bg); text-align: left; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 6px 10px; }
.gg-table td { padding: 5px 10px; border-top: 1px solid var(--border); }
.gg-table tr.unmatched td, .gg-table tr.noproject td { background: #fef2f2; }
.gg-table tr.billed td { background: #fffbeb; }
.gg-table tr.excluded td { opacity: .5; }
.gg-table .num { text-align: right; }
.gg-table .mid { text-align: center; }
.gg-table .muted { color: var(--muted); }
.gg-table .strong { font-weight: 700; }
.gav-pill { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px; white-space: nowrap; }
.gav-pill.ok { background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border); }
.gav-pill.warn { background: var(--warn-bg); color: var(--warn-text); border: 1px solid var(--warn-border); }
.gav-pill.bad { background: var(--err-bg); color: var(--err-text); border: 1px solid var(--err-border); }
.gav-pill.muted { background: var(--bg); color: var(--muted); border: 1px solid var(--border); }
.gav-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0; cursor: pointer; }
.gav-by { width: 150px; font-size: 12.5px; }
.mono { font-family: ui-monospace, Menlo, monospace; }
`;
