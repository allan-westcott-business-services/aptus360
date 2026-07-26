import Banner from "../../components/Banner.jsx";

/* Placeholder. Invoices need a schema before this can be real — see the
   note below. Kept visible rather than hidden so the gap is obvious. */
export default function InvoicesTab({ projectRef }) {
  return (
    <div>
      <style>{CSS}</style>
      <div className="tab-head">
        <div>
          <h3>Invoices</h3>
          <p className="tab-sub">
            Invoice lines imported from Audacia, matched to this project by contract number.
          </p>
        </div>
      </div>

      <Banner kind="muted">
        Not built yet &mdash; there&rsquo;s no invoice table in the database.
      </Banner>

      <div className="inv-plan">
        <p className="panel-label">What this needs</p>
        <ul>
          <li>
            <strong>An <code>Invoice_Line</code> table</strong> keyed to
            <code> Project_ID</code>, holding value, date, description and the
            Audacia line reference.
          </li>
          <li>
            <strong>The CVR import.</strong> The original matched column B of the
            Audacia CVR report against <code>AP_Number</code> &mdash; now
            <code> Project.Contract_Number</code>. That&rsquo;s the join, and it&rsquo;s why
            the number has to keep matching Audacia exactly.
          </li>
          <li>
            <strong>Somewhere to run it.</strong> The import walks thousands of rows,
            so it belongs in a Postgres function called via RPC rather than a Netlify
            function with a 10-second limit.
          </li>
        </ul>
        <p className="inv-foot">
          Until then, invoices for {projectRef || "this project"} live in Audacia.
        </p>
      </div>
    </div>
  );
}

const CSS = `
.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 70ch; }
.inv-plan { border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg); padding: 18px 22px; }
.inv-plan ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 9px; }
.inv-plan li { font-size: 12.5px; line-height: 1.55; color: var(--text); }
.inv-plan code { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px;
  background: var(--white); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
.inv-foot { margin: 16px 0 0; font-size: 12px; color: var(--muted); }
`;
