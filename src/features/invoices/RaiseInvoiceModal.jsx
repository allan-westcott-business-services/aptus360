import { useState, useEffect, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { getAvRegister, raiseAvInvoice } from "../../api/avRegister.js";
import { listPlots } from "../../api/plots.js";
import { listAgreements } from "../../api/av.js";
import { getLookups } from "../../api/lookups.js";
import { useAuth } from "../../lib/AuthContext.jsx";

/* Raising an asset value invoice.

   It opens on the plots that have earned one and haven't been billed —
   the same rule the register uses, so it can never offer a plot that has
   already been claimed. Picking from a list beats typing plot numbers:
   it is the difference between an invoice that reconciles and one that
   has to be chased.

   A plot is absent for one of three reasons, and the note at the top
   says which: already invoiced, connected but with no meter date, or no
   connection record at all. The last is the one that looks like a bug
   and isn't — the register is built from connection records, so a plot
   the connections screen has never seen cannot appear here.

   Raised By is the signed-in person, resolved server-side from their
   email against the Person table. It is not a field to fill in: whoever
   raised it is a fact the app already knows, and a typed name is one
   that can be wrong. */
const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "today");

export default function RaiseInvoiceModal({ projectId, projectRef, onClose, onRaised }) {
  const { user } = useAuth() || {};
  const [agreements, setAgreements] = useState([]);
  const [register, setRegister] = useState([]);   // every plot-utility on the project
  const [plots, setPlots] = useState([]);         // every plot, connected or not
  const [mode, setMode] = useState("ready");      // ready | connected
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
    /* The plot list as well as the register: a plot with no connection
       record at all is absent from the register entirely, and "it isn't
       in the list" is a much worse answer than "it has no connection
       record yet". */
    Promise.all([
      getAvRegister(projectId), getLookups(), listPlots(projectId), listAgreements(projectId),
    ])
      .then(([reg, lk, pl, ag]) => {
        if (!live) return;
        setRegister(reg.rows || []);
        setPlots(pl.rows || pl || []);
        setAgreements(ag.rows || []);
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

  /* Ready means the service card has been submitted and nothing has
     been claimed against it yet. The service card is what the claim
     rides on — a meter in the ground with no card submitted is work
     done, not money owed.

     Connected widens it to every plot with a connection record, so one
     can be billed ahead of its card deliberately. Already-claimed rows
     are never offered under either: that is a double invoice, not a
     judgement call. */
  const candidates = useMemo(() => {
    const base = register.filter((r) => !r.claimed);
    return mode === "ready" ? base.filter((r) => r.billable) : base;
  }, [register, mode]);

  const forUtility = useMemo(
    () => (utilityId ? candidates.filter((r) => String(r.utility_id) === String(utilityId)) : candidates),
    [candidates, utilityId]
  );

  /* Counts worth showing rather than leaving to be inferred from a short
     list. */
  const readyCount = register.filter((r) => r.billable).length;
  const connectedNotReady = register.filter((r) => !r.claimed && !r.billable).length;
  const meteredNoCard = register.filter(
    (r) => !r.sc_submitted && (r.connection_date || r.meter_number)).length;
  const claimedCount = register.filter((r) => r.claimed).length;
  const connectedPlotIds = new Set(register.map((r) => r.plot_id));
  const unconnected = plots.filter((p) => !connectedPlotIds.has(p.Plot_ID));

  /* The agreement for this type, if the project has one. It names the
     operator, so the invoice does not ask — an invoice raised against
     the wrong operator is a credit note and an apology. */
  /* agreement holds the chosen type's id; this is the project's actual
     agreement for it, if one exists. */
  const activeAgreement = agreements.find(
    (a) => agreement && String(a.AV_Agreement_Type_ID) === String(agreement));

  /* Operators are organisations holding an IDNO or DNO role. Only asked
     for when no agreement covers the chosen type — otherwise the
     agreement decides and the field is read-only. */
  const operators = useMemo(
    () => [...new Map((lookups?.orgOperators || [])
      .map((o) => [o.Organisation_ID, o])).values()],
    [lookups]
  );
  /* From the agreement where there is one, otherwise whatever was
     picked. Shaped the same either way so the VAT rule below doesn't
     care which it got. */
  const fromAgreement = activeAgreement?.idno_organisation_id
    ? {
        Organisation_ID: activeAgreement.idno_organisation_id,
        Name: activeAgreement.idno_organisation_name || activeAgreement.IDNO_Name,
        VAT_Registered: activeAgreement.idno_vat_registered,
        VAT_Rate: activeAgreement.idno_vat_rate,
      }
    : null;
  const chosenOperator = fromAgreement
    || operators.find((o) => String(o.Organisation_ID) === String(operator));

  /* The standard rate in force on the invoice date, from the VAT_Rate
     table rather than a constant. It has been 17.5, 15, 17.5 and 20
     inside twenty years, so a credit against an old invoice has to be
     able to reach the rate that invoice was raised at.

     Rates come back newest first, so the first one that started on or
     before the date is the one that was in force. */
  const standardRate = useMemo(() => {
    const on = invoiceDate || new Date().toISOString().slice(0, 10);
    const hit = (lookups?.vatRates || [])
      .find((r) => r.Label === "Standard" && String(r.Effective_From).slice(0, 10) <= on);
    return hit ? Number(hit.Rate) : null;
  }, [lookups, invoiceDate]);

  /* Not registered means no VAT, which is a different fact from a rate
     that happens to be zero. Registered with no rate of their own takes
     the standard one for the day. */
  const vatRate = !chosenOperator ? (standardRate ?? 0)
    : !chosenOperator.VAT_Registered ? 0
    : (chosenOperator.VAT_Rate ?? standardRate ?? 0);

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
        IDNO_Organisation_ID: chosenOperator?.Organisation_ID || null,
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

  const drag = useDragHandle();

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="ri" onClick={(e) => e.stopPropagation()} style={drag.panelStyle} role="dialog"
        aria-label="Raise an asset value invoice">
        <style>{CSS}</style>

        <div className="ri-head" {...drag.handleProps}>
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
          {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}
          {loading && <p className="ri-empty">Finding billable plots&hellip;</p>}

          {!loading && (
            <div className="ri-why">
              <label className="ri-mode">
                <span>Show</span>
                <select value={mode} onChange={(e) => { setMode(e.target.value); setPicked({}); }}>
                  <option value="ready">Ready to bill ({readyCount})</option>
                  <option value="connected">
                    Any connected plot ({readyCount + connectedNotReady})
                  </option>
                </select>
              </label>
              <span className="ri-why-note">
                {meteredNoCard > 0 && (
                  <>{meteredNoCard} connected with no service card submitted. </>
                )}
                {claimedCount > 0 && <>{claimedCount} already invoiced. </>}
                {unconnected.length > 0 && (
                  <strong>
                    {unconnected.length} plot(s) have no connection record at all &mdash;
                    add one on Plot Connections before they can be billed.
                  </strong>
                )}
              </span>
            </div>
          )}

          {!loading && !candidates.length && (
            <p className="ri-empty">
              {readyCount === 0 && connectedNotReady === 0
                ? "No plot on this project has a connection record yet."
                : readyCount === 0
                  ? "No plot has a service card submitted yet, so nothing can be invoiced."
                  : "Nothing left to bill under this filter."}
            </p>
          )}

          {!loading && candidates.length > 0 && (
            <>
              <div className="ri-grid">
                <div className="fld">
                  <label htmlFor="ri-agr">Agreement type</label>
                  <select id="ri-agr" value={agreement}
                    onChange={(e) => { setAgreement(e.target.value); setPicked({}); }}>
                    <option value="">&mdash;</option>
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
                  {fromAgreement ? (
                    /* Read-only: the agreement for this type says who it
                       is with, and letting the invoice differ from its own
                       agreement is how one gets raised against the wrong
                       operator. */
                    <p className="ri-fixed">
                      {fromAgreement.Name}
                      <span>
                        from the {activeAgreement.agreement_type} agreement
                        {activeAgreement.IDNO_Reference ? ` \u00B7 ${activeAgreement.IDNO_Reference}` : ""}
                      </span>
                    </p>
                  ) : (
                    <>
                      <select id="ri-op" value={operator} onChange={(e) => setOperator(e.target.value)}>
                        <option value="">&mdash;</option>
                        {operators.map((o) => (
                          <option key={o.Organisation_ID} value={o.Organisation_ID}>
                            {o.Name}{o.Code ? ` (${o.Code})` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="hint">
                        {agreement
                          ? "No agreement for this type \u2014 add one on the Asset Value tab."
                          : "Choose an agreement type, or pick an operator."}
                      </p>
                    </>
                  )}
                </div>
                <div className="fld">
                  <label>VAT rate</label>
                  {/* Read from the operator, not entered. Change it on the
                      organisation in Admin, where it applies to every
                      invoice raised against them. */}
                  <p className="ri-vat">
                    {vatRate}%
                    <span>
                      {standardRate == null && (!chosenOperator || chosenOperator.VAT_Rate == null)
                        ? "no standard rate set for this date"
                        : !chosenOperator ? `standard on ${fmtDate(invoiceDate)}`
                        : !chosenOperator.VAT_Registered ? `${chosenOperator.Name} isn\u2019t VAT registered`
                        : chosenOperator.VAT_Rate == null ? `standard on ${fmtDate(invoiceDate)}`
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
                        {/* The date the claim rides on, not the meter date. */}
                        <span className="ri-conn">
                          {r.sc_submitted
                            ? String(r.sc_submitted).slice(0, 10).split("-").reverse().join("/")
                            : <em className="ri-nodate">no service card</em>}
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
.ri-fixed { margin: 0; font-size: 13px; font-weight: 600; display: flex; flex-direction: column; }
.ri-fixed span { font-size: 10.5px; font-weight: 500; color: var(--muted); }
.ri-why { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
  padding: 7px 10px; background: var(--bg); border-radius: 7px; }
.ri-mode { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 11px;
  font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.ri-mode select { width: auto; font-size: 12px; }
.ri-why-note { font-size: 11.5px; color: var(--muted); flex: 1; }
.ri-why-note strong { color: #92400e; font-weight: 600; }
.ri-nodate { color: #b45309; font-style: normal; }
.ri-by { margin-left: auto; }
`;
