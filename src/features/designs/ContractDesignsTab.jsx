import Banner from "../../components/Banner.jsx";

/* Placeholder. Detailed designs need a modelling decision first — see
   below. Kept visible rather than hidden so the gap stays obvious. */
export default function ContractDesignsTab({ projectRef }) {
  return (
    <div>
      <style>{CSS}</style>
      <div className="tab-head">
        <div>
          <h3>Detailed designs</h3>
          <p className="tab-sub">
            The detailed design produced after award, as distinct from the outline
            design done at tender stage.
          </p>
        </div>
      </div>

      <Banner kind="muted">
        Not built yet &mdash; one modelling question to settle first.
      </Banner>

      <div className="cd-plan">
        <p className="panel-label">Where should a detailed design live?</p>

        <div className="cd-opt">
          <h4>Columns on <code>Project_Scope</code></h4>
          <p>
            A detailed design is the same scope carried forward, so
            <code> CD_Designer_ID</code>, <code>CD_Design_Status_ID</code>,
            <code> CD_Target_Date</code> and so on sit alongside the outline fields.
            One row per utility covers both stages, and the Outline and Detailed
            tabs are two views of the same row.
          </p>
          <p className="cd-when">
            Right if a detailed design always follows its outline design one-for-one.
          </p>
        </div>

        <div className="cd-opt">
          <h4>Its own <code>Detailed_Design</code> table</h4>
          <p>
            Keyed on <code>Project_ID</code> and <code>Utility_ID</code>, with its own
            revisions and dates. A scope can then carry several detailed designs, or
            one where no outline design existed.
          </p>
          <p className="cd-when">
            Right if detailed designs revise independently, or exist without a matching
            outline design.
          </p>
        </div>

        <p className="cd-foot">
          The original app kept these as separate log screens &mdash; Outline Design Log
          and Detailed Design Log &mdash; but both read from
          <code> Utility_Outline_Design</code>, which suggests one row served both. Worth
          confirming against how your designers actually work before I build it.
        </p>
      </div>
    </div>
  );
}

const CSS = `
.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 70ch; }
.cd-plan { border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg); padding: 18px 22px; }
.cd-opt { border-left: 3px solid var(--accent); padding-left: 14px; margin-bottom: 18px; }
.cd-opt h4 { margin: 0 0 5px; font-size: 13.5px; font-weight: 700; }
.cd-opt p { margin: 0 0 5px; font-size: 12.5px; line-height: 1.55; max-width: 74ch; }
.cd-when { color: var(--muted); font-style: italic; }
.cd-plan code { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px;
  background: var(--white); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
.cd-foot { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.55; max-width: 74ch; }
`;
