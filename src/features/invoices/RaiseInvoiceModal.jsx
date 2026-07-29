import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getAvRegister, raiseAvInvoice } from "../../api/avRegister.js";
import { getLookups } from "../../api/lookups.js";
import { useAuth } from "../../lib/AuthContext.jsx";

/* Raising an asset value invoice.

   It opens on the plots that have earned one and haven't been billed —
   the same "billable" rule the register uses, so this can't offer a plot
   the register says is already claimed. Picking from a list beats typing
   plot numbers: it is the difference between an invoice that reconciles
   and one that has to be chased.

   Raised By is the signed-in person, resolved server-side from their
   email against the Person table. It is not a field to fill in: whoever
   raised it is a fact the app already knows, and a typed name is one
   that can be wrong. */
export default function RaiseInvoiceModal({ projectId, projectRef, onClose, onRaised }) {
  const { user } = useAuth() || {};
  const [billable, setBillable] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [picked, setPicked] = useState({});      // plot_utility_id -> value
  const [agreement, setAgreement] = useState("");
  const [operator, setOperator] = useState("");
  const [docType, setDocType] = useState("Invoice");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [each, setEach] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([getAvRegister(projectId), getLookups()])
      .then(([reg, lk]) => {
        if (!live) return;
        setBillable((reg.rows || []).filter((r) => r.billable));
        setLookups(lk);
        setError("");
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [projectId]);

  /* The agreement type carries the utility, so choosing one narrows the
     plots without a second question. Electric, Gas, Water, Water NAV
     Clean and Water NAV Waste all name a utility; the last two both
     mean water. Asking for the utility as well would let the two
     disagree, and then the invoice would have to pick one. */
  const agreementTypes = lookups?.avAgreementTypes || [];
  const chosenAgreement = agreementTypes
    .find((a) => String(a.AV_Agreement_Type_ID) === String(agreement));
  const utilityId = chosenAgreement?.Utility_ID ?? null;

  const forUtility = useMemo(
    () => (utilityId ? billable.filter((r) => String(r.utility_id) === String(utilityId)) : billable),
    [billable, utilityId]
  );

  /* Operators are organisations holding an IDNO or DNO role. The VAT
     position travels with them, so picking one settles the rate rather
     than leaving it to be typed. */
  const operators = useMemo(
    () => [...new Map((lookups?.orgOperators || [])
      .map((o) => [o.Organisation_ID, o])).values()],
    [lookups]
  );
  const chosenOperator = operators
    .find((o) => String(o.Organisation_ID) === String(operator));

  /* Not registered means no VAT, which is different from a zero rate
     that happens to be zero. Registered with no rate set takes the
     standard one. */
  const STANDARD_VAT = 20;
  const vatRate = !chosenOperator ? STANDARD_VAT
    : !chosenOperator.VAT_Registered ? 0
    : (chosenOperator.VAT_Rate ?? STANDARD_VAT);

  const chosen = forUtility.filter((r) => picked[r.plot_utility_id] !== undefined);
  const net = chosen.reduce((t, r) => t + Number(picked[r.plot_utility_id] || 0), 0);
  const vat = Math.round(net * Number(vatRate || 0)) / 100;

  const toggle = (r) => setPicked((p) => {
    const next = { ...p };
    if (next[r.plot_utility_id] !== undefined) delete next[r.plot_utility_id];
    else next[r.plot_utility_id] = each === "" ? 0 : Number(each);
    return next;
  });

  const applyEach = (v) => {
    setEach(v);
    setPicked((p) => Object.fromEntries(Object.keys(p).map((k) => [k, v === "" ? 0 : Number(v)])));
  };

  async function submit() {
    if (!chosen.length) return setError("Pick at least one plot.");
    setBusy(true);
    try {
      const res = await raiseAvInvoice({
        Project_ID: projectId,
        Utility_ID: utilityId || chosen[0]?.utility_id || null,
        AV_Agreement_Type_ID: agreement || null,
        IDNO_Organisation_ID: operator || null,
        Invoice_Number: invoiceNumber.trim() || null,
        Invoice_Date: invoiceDate,
        Document_Type: docType,
        VAT_Rate: vatRate,
        /* The server resolves the name from the Person table. Sending the
           address rather than a name keeps this working whatever the
           browser's cached lookups happen to hold. */
        Raised_By_Email: user?.email || null,
        lines: chosen.map((r) => ({
          Plot_ID: r.plot_id,
          Plot_Ref: r.plot_number || r.plot_ref,
          Description: `${r.utility} asset value`,
          Net_Value: Number(picked[r.plot_utility_id] || 0),
        })),
      });
      onRaised?.(res);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="ri" onClick={(e) => e.stopPropagation()} role="dialog"
        aria-label="Raise an asset value invoice">
        <style>{CSS}</style>

        <div className="ri-head">
          <div>
            <h3>Raise an invoice</h3>
            <p className="ri-sub">
              {projectRef} &middot; plots that have earned an asset value payment and
              haven&rsquo;t been billed
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="ri-body">
          {error && <Banner kind="error">{error}</Banner>}
          {loading && <p className="ri-empty">Finding billable plots&hellip;</p>}

          {!loading && !billable.length && (
            <p className="ri-empty">
              Nothing to bill. Every plot with a meter on this project has already been
              invoiced.
            </p>
          )}

          {!loading && billable.length > 0 && (
            <>
              <div className="ri-grid">
                <div className="fld">
                  <label htmlFor="ri-agr">Agreement type</label>
                  <select id="ri-agr" value={agreement}
                    onChange={(e) => { setAgreement(e.target.value); setPicked({}); }}>
                    <option value="">All ({billable.length} plots)</option>
                    {agreementTypes.map((a) => (
                      <option key={a.AV_Agreement_Type_ID} value={a.AV_Agreement_Type_ID}>
                        {a.AV_Agreement_Type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="ri-date">Invoice date</label>
                  <input id="ri-date" type="date" value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)} />
                </div>
                <div className="fld">
                  <label htmlFor="ri-num">Invoice number</label>
                  <input id="ri-num" value={invoiceNumber} placeholder="Leave blank to number later"
                    onChange={(e) => setInvoiceNumber(e.target.value)} />
                </div>
                <div className="fld">
                  <label htmlFor="ri-doc">Type</label>
                  <select id="ri-doc" value={docType} onChange={(e) => setDocType(e.target.value)}>
                    <option>Invoice</option>
                    <option>Credit</option>
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="ri-op">IDNO / DNO</label>
                  <select id="ri-op" value={operator} onChange={(e) => setOperator(e.target.value)}>
                    <option value="">&mdash;</option>
                    {operators.map((o) => (
                      <option key={o.Organisation_ID} value={o.Organisation_ID}>
                        {o.Name}{o.Code ? ` (${o.Code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label>VAT rate</label>
                  {/* Read from the operator, not entered. Change it on the
                      organisation in Admin, where it applies to every
                      invoice raised against them. */}
                  <p className="ri-vat">
                    {vatRate}%
                    <span>
                      {!chosenOperator ? "standard \u2014 no operator chosen"
                        : !chosenOperator.VAT_Registered ? `${chosenOperator.Name} isn\u2019t VAT registered`
                        : chosenOperator.VAT_Rate == null ? "standard rate"
                        : `set on ${chosenOperator.Name}`}
                    </span>
                  </p>
                </div>
                <div className="fld">
                  <label htmlFor="ri-each">Value per plot</label>
                  <input id="ri-each" type="number" step="0.01" value={each}
                    placeholder="Sets every picked plot"
                    onChange={(e) => applyEach(e.target.value)} />
                </div>
              </div>

              <div className="ri-picker">
                <div className="ri-picker-head">
                  <span>{chosen.length} of {forUtility.length} picked</span>
                  <button onClick={() => setPicked(Object.fromEntries(
                    forUtility.map((r) => [r.plot_utility_id, each === "" ? 0 : Number(each)])))}>
                    Pick all
                  </button>
                  <button onClick={() => setPicked({})}>Clear</button>
                </div>
                <div className="ri-list">
                  {forUtility.map((r) => {
                    const on = picked[r.plot_utility_id] !== undefined;
                    return (
                      <label key={r.plot_utility_id} className={on ? "ri-row on" : "ri-row"}>
                        <input type="checkbox" checked={on} onChange={() => toggle(r)} />
                        <span className="ri-plot">{r.plot_number}</span>
                        <span className="ri-util">{r.utility}</span>
                        <span className="ri-conn">
                          {r.connection_date
                            ? String(r.connection_date).slice(0, 10).split("-").reverse().join("/")
                            : <em>no date</em>}
                        </span>
                        <input type="number" step="0.01" className="ri-val" disabled={!on}
                          value={on ? picked[r.plot_utility_id] : ""}
                          aria-label={`Value for plot ${r.plot_number}`}
                          onChange={(e) => setPicked((p) => ({
                            ...p, [r.plot_utility_id]: e.target.value,
                          }))} />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="ri-totals">
                <span>Net <strong>{net.toFixed(2)}</strong></span>
                <span>VAT <strong>{vat.toFixed(2)}</strong></span>
                <span>Gross <strong>{(net + vat).toFixed(2)}</strong></span>
                <span className="ri-by">
                  Raised by {user?.email ? <strong>you</strong> : <em>unknown &mdash; not signed in</em>}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="fe-foot">
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={busy || !chosen.length} onClick={submit}>
            {busy ? "Raising\u2026" : `Raise for ${chosen.length} plot(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ri { background: var(--white); border-radius: 12px; width: min(760px, 95vw); max-height: 90vh;
  display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.ri-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.ri-head > div { flex: 1; }
.ri-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
.ri-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); }
.ri-body { padding: 15px 18px; overflow-y: auto; flex: 1; }
.ri-empty { color: var(--muted); font-size: 13px; text-align: center; padding: 40px 20px; }
.ri-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 11px;
  margin-bottom: 14px; }
.ri-picker { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.ri-picker-head { display: flex; align-items: center; gap: 10px; padding: 6px 10px;
  background: var(--bg); font-size: 11.5px; color: var(--muted); }
.ri-picker-head button { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11.5px inherit; }
.ri-list { max-height: 260px; overflow-y: auto; }
.ri-row { display: grid; grid-template-columns: 20px 70px 1fr 100px 110px; gap: 10px;
  align-items: center; padding: 5px 10px; border-top: 1px solid var(--border);
  font-size: 12.5px; font-weight: 500; text-transform: none; letter-spacing: 0;
  color: var(--text); margin: 0; cursor: pointer; }
.ri-row:hover { background: var(--bg); }
.ri-row.on { background: var(--accent-light); }
.ri-plot { font-weight: 700; font-family: ui-monospace, Menlo, monospace; }
.ri-util, .ri-conn { color: var(--muted); font-size: 11.5px; }
.ri-val { width: 100%; text-align: right; font-size: 12px; padding: 3px 6px; }
.ri-totals { display: flex; gap: 18px; align-items: center; margin-top: 12px; padding-top: 11px;
  border-top: 1px solid var(--border); font-size: 12.5px; color: var(--muted); }
.ri-totals strong { color: var(--text); font-variant-numeric: tabular-nums; }
.ri-vat { margin: 0; font-size: 14px; font-weight: 700; display: flex; flex-direction: column; }
.ri-vat span { font-size: 10.5px; font-weight: 500; color: var(--muted); }
.ri-by { margin-left: auto; }
`;
