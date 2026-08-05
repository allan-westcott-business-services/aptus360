import { useState, useEffect, useMemo } from "react";
import { listAllCallOffs, setCallOffStatus } from "../../api/calloffs.js";
import { remember, recall } from "../../lib/session.js";

/* Call-offs across the business.

   The project tab answers "what is on this project"; this answers "what
   is coming up" — every site, filtered by status, searched by reference,
   site, customer or contact.

   Clicking one opens it, where the work is scheduled and the status
   moved. */

export const STATUSES = [
  "Pending Review", "Reviewed", "Scheduled", "In Progress",
  "Complete", "Withdrawn (Customer)", "Withdrawn (Aptus)",
];

/* Statuses that mean the job is done with, one way or another. Kept
   apart because the default view is work still to do, and a list that
   opens with three years of completed call-offs is a list nobody reads. */
const CLOSED = new Set(["Complete", "Withdrawn (Customer)", "Withdrawn (Aptus)"]);

const fmt = (d) => {
  if (!d) return "\u2014";
  const [y, m, dd] = String(d).split("-");
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return M ? `${dd}-${M}-${String(y).slice(2)}` : d;
};

export default function CallOffsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(() => recall("callOffStatus", "open"));
  const [openId, setOpenId] = useState(null);

  useEffect(() => remember("callOffStatus", status), [status]);

  async function load() {
    setLoading(true);
    try {
      /* Everything, filtered here — the status control includes "open",
         which is several statuses rather than one and cannot be asked
         for as a single equality. */
      const res = await listAllCallOffs({});
      setRows(res.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && CLOSED.has(r.Status)) return false;
      if (status !== "open" && status !== "all" && r.Status !== status) return false;
      if (!t) return true;
      /* Everything somebody might have in front of them: the reference
         off an email, the site off a drawing, the name of whoever rang. */
      return [r.AP_Number, r.Site_Name, r.Site_Address, r.Customer_Name,
        r.Contact_Name, r.Project_Ref, r.Work_Type?.Work_Type_Name]
        .some((v) => String(v ?? "").toLowerCase().includes(t));
    });
  }, [rows, q, status]);

  const open = openId != null
    ? rows.find((r) => Number(r.Submission_ID) === Number(openId))
    : null;

  async function move(id, next) {
    try {
      await setCallOffStatus(id, next);
      setRows((rs) => rs.map((r) =>
        Number(r.Submission_ID) === Number(id) ? { ...r, Status: next } : r));
      setError("");
    } catch (e) { setError(e.message); }
  }

  if (open) {
    return <CallOffDetail row={open} onBack={() => setOpenId(null)} onMove={move} />;
  }

  return (
    <div className="page co-page">
      <style>{CSS}</style>

      <div className="co-bar">
        <h2>
          Call-offs
          <span className="co-of">
            {loading ? "" : `(${shown.length} of ${rows.length})`}
          </span>
        </h2>
        <input className="co-search" value={q} placeholder="Search reference, site, customer, contact…"
          onChange={(e) => setQ(e.target.value)} />
        <select className="co-status-sel" value={status}
          onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open call-offs</option>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(q || status !== "open") && (
          <button className="btn ghost sm" onClick={() => { setQ(""); setStatus("open"); }}>
            Clear
          </button>
        )}
      </div>

      {error && <p className="co-err">{error}</p>}
      {loading && <p className="hint">Loading…</p>}

      {!loading && !shown.length && (
        <p className="hint co-none">
          {rows.length
            ? "Nothing matches that."
            : "No call-offs yet. They are raised from a project's Call-offs tab."}
        </p>
      )}

      {!!shown.length && (
        <table className="co-tbl">
          <thead>
            <tr>
              <th>Submitted</th><th>Reference</th><th>Site</th>
              <th>Customer</th><th>Work Type</th><th>Contact</th>
              <th>Preferred</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              /* The whole row opens it: the target is bigger and there is
                 nothing else on a row to click. */
              <tr key={r.Submission_ID} onClick={() => setOpenId(r.Submission_ID)}>
                <td className="co-dim">{fmt(String(r.Created_At || "").slice(0, 10))}</td>
                <td><strong>{r.AP_Number || `#${r.Submission_ID}`}</strong></td>
                <td>{r.Site_Name || "\u2014"}</td>
                <td>{r.Customer_Name || "\u2014"}</td>
                <td>
                  <span className="co-wt-pill">
                    {r.Work_Type?.Work_Type_Name || "\u2014"}
                  </span>
                </td>
                <td>{r.Contact_Name || "\u2014"}</td>
                <td>{fmt(r.Preferred_Date)}</td>
                <td>
                  <span className={`co-st s-${String(r.Status || "").replace(/\W+/g, "").toLowerCase()}`}>
                    {r.Status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* One call-off: what was asked for, and where it has got to. */
function CallOffDetail({ row, onBack, onMove }) {
  const mode = row.Selection_Mode;
  const heading = mode === "ColumnList" ? "Columns"
    : mode === "Span" ? "Trench sections" : "Service plots";

  return (
    <div className="page co-page">
      <style>{CSS}</style>

      <div className="co-head-bar">
        <button className="btn ghost sm" onClick={onBack}>&larr; Back</button>
        <div>
          <p className="co-kicker">
            Call-off &middot; {row.Work_Type?.Work_Type_Name || "\u2014"}
          </p>
          <h2>
            {row.AP_Number || `#${row.Submission_ID}`}
            {row.Site_Name ? ` \u00b7 ${row.Site_Name}` : ""}
          </h2>
        </div>
        <span className={`co-st big s-${String(row.Status || "").replace(/\W+/g, "").toLowerCase()}`}>
          {row.Status}
        </span>
      </div>

      <div className="co-card">
        <h3>Request</h3>
        <div className="co-facts">
          {[
            ["Customer", row.Customer_Name],
            ["Branch", row.Branch_Name],
            ["Site address", row.Site_Address],
            ["Contact", row.Contact_Name],
            ["Company", row.Contact_Company],
            ["Phone", row.Contact_Phone],
            ["Preferred date", fmt(row.Preferred_Date)],
            ["Alternative date", fmt(row.Alternative_Date)],
            ["Obstruction free", row.Obstruction_Free],
            ["Ground unmade", row.Ground_Unmade],
            ["Line and level required", row.Line_Level_Required],
            ["Raised by", row.Created_By],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div className="co-fact" key={k}>
              <span>{k}</span><strong>{v}</strong>
            </div>
          ))}
        </div>
        {row.Notes && <p className="co-notes">{row.Notes}</p>}
      </div>

      <div className="co-card">
        <h3>{heading} <span className="co-dim">&middot; {row.items?.length ?? 0}</span></h3>
        {!row.items?.length ? (
          <p className="hint">Nothing listed on this call-off.</p>
        ) : (
          <table className="co-tbl flat">
            <thead>
              <tr>
                <th>{mode === "ColumnList" ? "Column" : mode === "Span" ? "Section" : "Plot"}</th>
                {mode === "Span" && <><th>D/P</th><th>Length</th></>}
                <th>Energisation date</th>
              </tr>
            </thead>
            <tbody>
              {row.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <strong>
                      {mode === "PlotList" ? it.Plot
                        : mode === "ColumnList" ? it.Street_Light_ID
                          : it.Plots}
                    </strong>
                  </td>
                  {mode === "Span" && (
                    <>
                      <td>{it.D_or_P || "\u2014"}</td>
                      <td>{it.Estimated_Length_m ? `${it.Estimated_Length_m} m` : "\u2014"}</td>
                    </>
                  )}
                  <td>{fmt(it.Energisation_Date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="co-card">
        <h3>Status</h3>
        <p className="hint">Move this call-off through its workflow.</p>
        <div className="co-steps">
          {STATUSES.map((s) => (
            <button key={s}
              className={s === row.Status ? "co-step on" : "co-step"}
              onClick={() => onMove(row.Submission_ID, s)}>
              {s === row.Status && <span className="co-dot" />}
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Said plainly rather than shown as an empty panel.

          Team assignments need Task_Type, Team, Craft, Team_Craft and the
          work-type-to-phase mapping, none of which exist in this
          application yet. An empty "Team Assignments" card would read as
          something broken rather than something not yet built. */}
      <div className="co-card co-todo">
        <h3>Team assignments</h3>
        <p>
          Not built yet. Scheduling teams onto phases needs the task
          types, teams and crafts tables, which this application does not
          have — see the note with this release.
        </p>
      </div>
    </div>
  );
}

const CSS = `
.co-page { padding: 18px 22px 40px; }
/* Wrapping is the last resort rather than the first.

   A flex item shrinks by default, and the title was the one part not
   told otherwise — so on a narrow window it gave up its width first and
   broke "Call-offs (1 of 1)" across two lines, which reads as a fault
   rather than a layout. It now keeps its width and the row wraps as a
   whole if there is genuinely not enough room. */
.co-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
  flex-wrap: wrap; }
/* The title keeps its own line rather than wrapping mid-phrase — "Call-offs
   (1 of" then "1)" on the next line reads as a fault. */
.co-bar h2 { margin: 0; font-size: 18px; white-space: nowrap; flex: 0 0 auto; }
.co-of { font: 600 12px inherit; color: var(--muted); margin-left: 8px; }
/* The search takes the room going spare, but not below a width a site
   name fits in. Without the basis it collapsed to nothing beside the
   dropdown, which had no width of its own and grew to fill the bar. */
.co-search { flex: 1 1 260px; min-width: 200px; max-width: 380px;
  font: 500 12.5px inherit; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 7px; }
/* Sized to fit its longest option — "Withdrawn (Customer)" — and no
   wider. A dropdown of nine short statuses has no reason to take a third
   of the bar, but one narrow enough to clip its own options is worse
   than one that is too wide. */
.co-status-sel { flex: 0 0 auto; width: 182px; font: 500 12.5px inherit;
  padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px;
  background: var(--white); }
.co-err { color: #b91c1c; font: 600 12.5px inherit; margin: 0 0 12px; }
.co-none { margin: 24px 0; }
.co-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px;
  background: var(--white); border: 1px solid var(--border); border-radius: 9px;
  overflow: hidden; }
.co-tbl th { background: #2c3455; color: #fff; text-align: left; padding: 9px 12px;
  font: 700 11.5px inherit; }
.co-tbl td { padding: 9px 12px; border-top: 1px solid var(--border); }
.co-tbl tbody tr { cursor: pointer; }
.co-tbl tbody tr:hover { background: var(--bg); }
.co-tbl.flat tbody tr { cursor: default; }
.co-tbl.flat tbody tr:hover { background: none; }
.co-dim { color: var(--muted); }
.co-wt-pill { font: 700 11px inherit; padding: 2px 9px; border-radius: 5px;
  background: #f3e8ff; color: #7c3aed; }
.co-st { font: 700 10.5px inherit; padding: 2px 9px; border-radius: 20px;
  background: var(--bg); color: var(--muted); white-space: nowrap; }
.co-st.big { font-size: 12px; padding: 5px 14px; margin-left: auto; }
.co-st.s-pendingreview { background: #fef3c7; color: #92400e; }
.co-st.s-reviewed { background: #dbeafe; color: #1e40af; }
.co-st.s-scheduled { background: #e0e7ff; color: #3730a3; }
.co-st.s-inprogress { background: #ccfbf1; color: #0f766e; }
.co-st.s-complete { background: #dcfce7; color: #166534; }
.co-st.s-withdrawncustomer, .co-st.s-withdrawnaptus {
  background: #fee2e2; color: #991b1b; }
.co-head-bar { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.co-head-bar h2 { margin: 0; font-size: 18px; }
.co-kicker { margin: 0 0 2px; font: 700 10.5px inherit; color: var(--muted);
  letter-spacing: .06em; text-transform: uppercase; }
.co-card { background: var(--white); border: 1px solid var(--border);
  border-radius: 11px; padding: 16px 20px; margin-bottom: 14px; }
.co-card h3 { margin: 0 0 10px; font-size: 14px; }
.co-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px 18px; }
.co-fact { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; }
.co-fact > span { font: 700 10.5px inherit; color: var(--muted);
  letter-spacing: .04em; text-transform: uppercase; }
.co-notes { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--border);
  font-size: 12.5px; white-space: pre-wrap; }
.co-steps { display: flex; flex-wrap: wrap; gap: 7px; }
.co-step { background: var(--white); border: 1px solid var(--border);
  border-radius: 20px; cursor: pointer; font: 600 11.5px inherit; padding: 5px 14px; }
.co-step:hover { border-color: var(--accent); }
.co-step.on { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
.co-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%;
  background: currentColor; margin-right: 6px; vertical-align: middle; }
.co-todo { border-style: dashed; }
.co-todo p { margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.6; }
`;
