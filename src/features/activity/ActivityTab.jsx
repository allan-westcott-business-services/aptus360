import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getActivity, addComment, deleteComment } from "../../api/activity.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { getLookups } from "../../api/lookups.js";

/* Change history and comments. History rows are written by a database
   trigger, so anything that edits a project is logged — including bulk
   updates and changes made directly in Supabase. */

const FIELD_LABELS = {
  Project_Status_ID: "Status", Customer_ID: "Customer", Branch_ID: "Branch",
  Region_ID: "Region", Sub_Region_ID: "Sub region", BDD_KAM_ID: "BDD / KAM",
  Estimator_ID: "Estimator", Quote_Type_ID: "Quote type", Project_Manager_ID: "Project manager",
  Fire_Service_ID: "Fire authority", Heat_Pump_Model_ID: "Heat pump model",
  Default_Heat_Source_ID: "Default heat source", Site_Name: "Site name",
  Site_Address: "Site address", Date_Received: "Date received", KPI_Date: "KPI date",
  Date_Sent: "Date sent", Secured_Date: "Secured date", Date_Signed: "Date signed",
  Contract_Number: "Contract number", Is_Priority: "Priority", I_and_C: "I & C",
  Lay_Only_MU: "Lay only", Project_Ref: "Project ref", Revision: "Revision",
  Minimum_Service_Call_Off: "Min. call off", Audacia_Plot_Count: "Audacia plot count",
  Site_Contact: "Site contact", Notes: "Notes", Postcode: "Postcode",
  Eastings: "Eastings", Northings: "Northings", Option_Letter: "Option",
};

const LOOKUP_FOR = {
  Project_Status_ID: ["projectStatuses", "Project_Status_ID", "Status"],
  Customer_ID: ["customers", "Customer_ID", "Customer_Name"],
  Branch_ID: ["branches", "Branch_ID", "Branch_Dropdown"],
  Region_ID: ["regions", "Region_ID", "Region"],
  Sub_Region_ID: ["subRegions", "Sub_Region_ID", "Sub_Region"],
  Quote_Type_ID: ["quoteTypes", "Quote_Type_ID", "Quote_Type"],
  BDD_KAM_ID: ["people", "Person_ID", "Person_Name"],
  Estimator_ID: ["people", "Person_ID", "Person_Name"],
  Project_Manager_ID: ["people", "Person_ID", "Person_Name"],
  Fire_Service_ID: ["fireServices", "Fire_Service_ID", "Fire_Service_Name"],
  Heat_Pump_Model_ID: ["heatPumpModels", "Heat_Pump_Model_ID", "Model"],
  Default_Heat_Source_ID: ["heatSources", "Heat_Source_ID", "Heat_Source"],
};

const when = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function ActivityTab({ projectId, view = "history" }) {
  const [lookups, setLookups] = useState(null);
  const [history, setHistory] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [author, setAuthor] = useState("");
  const { user, authEnabled } = useAuth() || {};

  /* The signed-in person, matched on email — the only thing an auth
     session and a Person row have in common, and Person.Email is unique.

     Typing your own name into every comment is a field that can only be
     got wrong: misspelled, someone else's, or left blank. Where the
     session resolves to a person, the box goes away.

     It stays when it can't: with auth switched off there is no session
     to read, and a signed-in address with no matching Person row would
     otherwise leave comments with no author at all. Falling back to the
     address is better than nothing, but a named person is the point. */
  const people = lookups?.people || [];
  /* Trimmed as well as lower-cased: an address pasted into either the
     Person record or the login carries whitespace often enough to be
     worth handling, and it fails invisibly when it does. */
  const norm = (e) => String(e || "").trim().toLowerCase();
  const me = people.find((p) => p.Email && user?.email && norm(p.Email) === norm(user.email));

  /* Two quite different reasons the match can fail, and saying which
     saves guessing. If not one person in the list carries an Email at
     all, the lookups endpoint predates the field — that's a deploy, not
     a data problem. If they do, the address genuinely isn't on an active
     Person row. */
  const lookupHasEmail = people.some((p) => Object.hasOwn(p, "Email"));
  const whyNoMatch = !people.length ? null
    : !lookupHasEmail ? "the people lookup isn\u2019t returning email yet"
    : "no active person has this email";
  const knownAuthor = me?.Person_Name || (user?.email ?? null);
  const [posting, setPosting] = useState(false);

  async function load() {
    try {
      const [lk, act] = await Promise.all([getLookups(), getActivity(projectId)]);
      setLookups(lk);
      setHistory(act.history || []);
      setComments(act.comments || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  /* IDs are meaningless in a history log — resolve them to names where
     the field points at a lookup. */
  const resolve = useMemo(() => (field, value) => {
    if (value == null || value === "") return <em className="empty-val">empty</em>;
    const map = LOOKUP_FOR[field];
    if (map && lookups) {
      const [src, idKey, labelKey] = map;
      const hit = (lookups[src] || []).find((x) => String(x[idKey]) === String(value));
      if (hit) return hit[labelKey];
    }
    if (value === "true") return "Yes";
    if (value === "false") return "No";
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return String(value).slice(0, 10).split("-").reverse().join("/");
    return String(value);
  }, [lookups]);

  async function post() {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      /* Send the typed name only where there is one to send. Otherwise
         the email goes and the server names it from the Person table —
         which knows, whatever this page's cached lookups think. */
      const c = await addComment(projectId, draft.trim(),
        me?.Person_Name || author.trim() || null, user?.email || null);
      setComments((x) => [c, ...x]);
      setDraft("");
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  }

  async function remove(c) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteComment(projectId, c.Comment_ID);
      setComments((x) => x.filter((y) => y.Comment_ID !== c.Comment_ID));
    } catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      {error && <Banner kind="error">{error}</Banner>}

      {view === "comments" ? (
        <>
          <div className="tab-head">
            <div>
              <h3>Comments <span className="count">{comments.length}</span></h3>
              <p className="tab-sub">Notes visible to anyone working on this project.</p>
            </div>
          </div>

          <div className="cmt-compose">
            <textarea rows={3} value={draft} placeholder="Add a comment&hellip;"
              onChange={(e) => setDraft(e.target.value)} />
            <div className="cmt-compose-foot">
              {knownAuthor ? (
                <span className="cmt-as" title={me ? `Matched to ${me.Person_Name} by email` : user?.email}>
                  as <strong>{knownAuthor}</strong>
                  {/* Not an error: the server resolves the name from the
                      Person table when it saves, so an out-of-date
                      lookup here changes what is shown, not what is
                      stored. */}
                  {!me && whyNoMatch && <em> &mdash; name resolved on save</em>}
                </span>
              ) : (
                <input className="cmt-author" value={author}
                  placeholder={authEnabled ? "Your name" : "Your name (optional)"}
                  onChange={(e) => setAuthor(e.target.value)} />
              )}
              <button className="btn accent" disabled={!draft.trim() || posting} onClick={post}>
                {posting ? "Posting\u2026" : "Post comment"}
              </button>
            </div>
          </div>

          {comments.length === 0 ? (
            <div className="empty"><p className="empty-title">No comments yet</p></div>
          ) : (
            <ul className="cmt-list">
              {comments.map((c) => (
                <li key={c.Comment_ID}>
                  <div className="cmt-meta">
                    <strong>{c.Author || "Unattributed"}</strong>
                    <span>{when(c.Created_At)}</span>
                    <button className="cmt-del" onClick={() => remove(c)} title="Delete">&#10005;</button>
                  </div>
                  <p className="cmt-body">{c.Comment}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="tab-head">
            <div>
              <h3>Change history <span className="count">{history.length}</span></h3>
              <p className="tab-sub">
                Recorded by the database, so every change is captured &mdash; including bulk
                edits and changes made outside this app.
              </p>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="empty">
              <p className="empty-title">No changes recorded</p>
              <p>History starts from the first edit after logging was enabled.</p>
            </div>
          ) : (
            <div className="dt-wrap">
              {/* The shared table spec, plus a modifier for the two ways
                  this one differs. Scoping overrides as .dt.hist rather
                  than .dt keeps them here — a bare .dt rule in a
                  component style block would reach every table in the
                  app the moment this screen rendered. */}
              <table className="dt hist">
                <thead>
                  <tr className="head-row">
                    <th>When</th><th>Field</th><th>From</th><th>To</th><th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.History_ID}>
                      <td className="hist-when">{when(h.Changed_At)}</td>
                      <td className="hist-field">{FIELD_LABELS[h.Field] || h.Field}</td>
                      <td className="hist-old">{resolve(h.Field, h.Old_Value)}</td>
                      <td className="hist-new">{resolve(h.Field, h.New_Value)}</td>
                      <td className="hist-by">{h.Changed_By || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.cmt-compose { border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin-bottom: 16px; }
.cmt-compose textarea { resize: vertical; min-height: 62px; }
.cmt-compose-foot { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
.cmt-author { max-width: 220px; }
.cmt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.cmt-list li { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; background: var(--white); }
.cmt-meta { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--muted); margin-bottom: 5px; }
.cmt-meta strong { color: var(--text); font-size: 12.5px; }
.cmt-del { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--muted); font-size: 10px; padding: 2px 5px; border-radius: 4px; }
.cmt-del:hover { background: #fef2f2; color: #ef4444; }
.cmt-body { margin: 0; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }

/* Refinements on the shared spec in styles.css. A history value is prose
   and has to wrap — the shared spec clips to one line, which is right for
   a data grid and wrong for a change log. */
.dt.hist { width: 100%; table-layout: auto; }
.dt.hist th, .dt.hist td { white-space: normal; overflow: visible; }
.dt.hist td { vertical-align: top; }
/* Header, cell padding and row striping all come from .dt. */
.cmt-as { font-size: 12px; color: var(--muted); align-self: center; }
.cmt-as strong { color: var(--text); }
.cmt-as em { font-style: normal; color: #b45309; }
.hist-when { white-space: nowrap; color: var(--muted); font-size: 11.5px; }
.hist-field { font-weight: 600; white-space: nowrap; }
.hist-old { color: var(--muted); text-decoration: line-through; }
.hist-new { color: var(--ok-text); font-weight: 600; }
.hist-by { color: var(--muted); font-size: 11.5px; }
.empty-val { color: var(--muted); font-style: italic; text-decoration: none; }
.empty { text-align: center; padding: 44px 20px; border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-head .count { font-size: 11px; font-weight: 700; background: var(--accent-light); color: var(--accent);
  border-radius: 20px; padding: 2px 8px; margin-left: 6px; vertical-align: middle; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 70ch; }
`;
