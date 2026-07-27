import { useState, useEffect } from "react";
import Banner from "./Banner.jsx";
import { getEntityNotes, addEntityRow, deleteEntityRow } from "../api/entity.js";

/* Comments, attachments and change history for one record. Reusable
   because the tables behind it are keyed on (Entity_Type, Entity_ID)
   rather than belonging to a particular owner. */

const when = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const TABS = [
  { id: "comments", label: "Comments" },
  { id: "attachments", label: "Attachments" },
  { id: "history", label: "History" },
];

export default function EntityNotes({ entityType, entityId, labelFor }) {
  const [tab, setTab] = useState("comments");
  const [data, setData] = useState({ comments: [], attachments: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [author, setAuthor] = useState("");
  const [att, setAtt] = useState({ File_Name: "", File_Url: "", Uploaded_By: "" });

  async function load() {
    try {
      setData(await getEntityNotes(entityType, entityId));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [entityType, entityId]);

  async function postComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await addEntityRow(entityType, entityId, "comment",
        { Comment: comment.trim(), Author: author.trim() || null });
      setComment("");
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function postAttachment() {
    if (!att.File_Name.trim() || !att.File_Url.trim()) {
      return setError("A name and a link are both needed.");
    }
    setBusy(true);
    try {
      await addEntityRow(entityType, entityId, "attachment", {
        File_Name: att.File_Name.trim(),
        File_Url: att.File_Url.trim(),
        Uploaded_By: att.Uploaded_By.trim() || null,
      });
      setAtt({ File_Name: "", File_Url: "", Uploaded_By: "" });
      setError("");
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(kind, id) {
    if (!window.confirm("Delete this?")) return;
    try { await deleteEntityRow(entityType, entityId, kind, id); await load(); }
    catch (e) { setError(e.message); }
  }

  const counts = {
    comments: data.comments.length,
    attachments: data.attachments.length,
    history: data.history.length,
  };

  return (
    <div className="en">
      <style>{CSS}</style>

      <div className="en-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "en-tab on" : "en-tab"} onClick={() => setTab(t.id)}>
            {t.label}
            {counts[t.id] > 0 && <span className="en-count">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {loading ? (
        <p className="en-none">Loading&hellip;</p>
      ) : tab === "comments" ? (
        <>
          <div className="en-compose">
            <textarea rows={2} value={comment} placeholder="Add a comment&hellip;"
              onChange={(e) => setComment(e.target.value)} />
            <div className="en-compose-foot">
              <input className="en-author" value={author} placeholder="Your name"
                onChange={(e) => setAuthor(e.target.value)} />
              <button className="btn accent sm" disabled={busy || !comment.trim()} onClick={postComment}>
                {busy ? "Posting\u2026" : "Post"}
              </button>
            </div>
          </div>
          {data.comments.length === 0 ? (
            <p className="en-none">No comments yet.</p>
          ) : (
            <ul className="en-list">
              {data.comments.map((c) => (
                <li key={c.Comment_ID}>
                  <div className="en-meta">
                    <strong>{c.Author || "Unattributed"}</strong>
                    <span>{when(c.Created_At)}</span>
                    <button className="en-x" onClick={() => remove("comment", c.Comment_ID)}>&#10005;</button>
                  </div>
                  <p className="en-body">{c.Comment}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : tab === "attachments" ? (
        <>
          <div className="en-compose">
            <div className="en-att-grid">
              <input placeholder="Document name" value={att.File_Name}
                onChange={(e) => setAtt((a) => ({ ...a, File_Name: e.target.value }))} />
              <input placeholder="Link (SharePoint, Drive, email\u2026)" value={att.File_Url}
                onChange={(e) => setAtt((a) => ({ ...a, File_Url: e.target.value }))} />
              <input placeholder="Added by" value={att.Uploaded_By}
                onChange={(e) => setAtt((a) => ({ ...a, Uploaded_By: e.target.value }))} />
              <button className="btn accent sm" disabled={busy} onClick={postAttachment}>+ Add</button>
            </div>
            <p className="en-hint">
              Links for now &mdash; file upload needs a Supabase Storage bucket, which isn&rsquo;t
              set up yet.
            </p>
          </div>
          {data.attachments.length === 0 ? (
            <p className="en-none">No attachments.</p>
          ) : (
            <ul className="en-list flat">
              {data.attachments.map((a) => (
                <li key={a.Attachment_ID}>
                  <span className="en-file">&#128206;</span>
                  <a href={a.File_Url} target="_blank" rel="noreferrer" className="en-link">{a.File_Name}</a>
                  <span className="en-sub">
                    {a.Uploaded_By ? `${a.Uploaded_By} \u00B7 ` : ""}{when(a.Uploaded_At)}
                  </span>
                  <button className="en-x" onClick={() => remove("attachment", a.Attachment_ID)}>&#10005;</button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : data.history.length === 0 ? (
        <p className="en-none">No changes recorded yet.</p>
      ) : (
        <table className="en-hist">
          <thead><tr><th>When</th><th>Field</th><th>From</th><th>To</th></tr></thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.History_ID}>
                <td className="en-when">{when(h.Changed_At)}</td>
                <td className="en-field">{labelFor ? labelFor(h.Field) : h.Field}</td>
                <td className="en-old">{h.Old_Value ?? <em>empty</em>}</td>
                <td className="en-new">{h.New_Value ?? <em>empty</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const CSS = `
.en { border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin-top: 10px; background: var(--white); }
.en-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.en-tab { background: none; border: none; border-bottom: 2px solid transparent; padding: 6px 12px;
  margin-bottom: -1px; cursor: pointer; font: 600 12px inherit; color: var(--muted);
  display: inline-flex; align-items: center; gap: 6px; }
.en-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.en-count { background: var(--accent-light); color: var(--accent); border-radius: 20px;
  padding: 0 6px; font-size: 10px; font-weight: 700; }
.en-tab.on .en-count { background: var(--accent); color: #fff; }
.en-none { font-size: 12.5px; color: var(--muted); font-style: italic; margin: 6px 0; }
.en-compose { background: var(--bg); border-radius: var(--radius); padding: 10px; margin-bottom: 10px; }
.en-compose textarea { resize: vertical; min-height: 46px; font-size: 12.5px; }
.en-compose-foot { display: flex; gap: 7px; margin-top: 7px; }
.en-author { max-width: 180px; font-size: 12px; }
.en-att-grid { display: grid; grid-template-columns: 1.1fr 1.7fr 0.9fr auto; gap: 7px; }
.en-att-grid input { font-size: 12px; }
.en-hint { font-size: 11px; color: var(--muted); margin: 7px 0 0; }
.btn.sm { padding: 5px 12px; font-size: 12px; }
.en-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.en-list li { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 11px; }
.en-list.flat li { display: flex; align-items: center; gap: 10px; }
.en-meta { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--muted); margin-bottom: 4px; }
.en-meta strong { color: var(--text); font-size: 12px; }
.en-body { margin: 0; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; }
.en-file { font-size: 13px; }
.en-link { flex: 1; font-size: 12.5px; color: var(--accent); text-decoration: none; font-weight: 600; }
.en-link:hover { text-decoration: underline; }
.en-sub { font-size: 11px; color: var(--muted); }
.en-x { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 10px; padding: 2px 5px; border-radius: 4px; }
.en-x:hover { background: #fef2f2; color: #ef4444; }
.en-hist { width: 100%; border-collapse: collapse; font-size: 12px; }
.en-hist th { text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); padding: 4px 7px; border-bottom: 1px solid var(--border); }
.en-hist td { padding: 5px 7px; border-bottom: 1px solid var(--border); vertical-align: top; }
.en-hist tr:last-child td { border-bottom: none; }
.en-when { white-space: nowrap; color: var(--muted); font-size: 11px; }
.en-field { font-weight: 600; white-space: nowrap; }
.en-old { color: var(--muted); text-decoration: line-through; }
.en-new { color: var(--ok-text); font-weight: 600; }
.en-hist em { font-style: italic; color: var(--muted); text-decoration: none; }
`;
