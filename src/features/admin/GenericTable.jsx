import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import Select from "../../components/Select.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

/* One editor for every simple lookup, driven by the field definitions in
   adminTables.js. Adding a reference table becomes a registry entry rather
   than a new screen. */
/* JSON held as text while being edited, so a half-typed object doesn't
   throw on every keystroke — parsed on the way out, and refusing to save
   while it's invalid. */
function JsonField({ value, onChange }) {
  const [text, setText] = useState(() =>
    value ? JSON.stringify(value, null, 2) : "{\n  \n}");
  const [bad, setBad] = useState("");

  function edit(next) {
    setText(next);
    try {
      onChange(JSON.parse(next || "{}"));
      setBad("");
    } catch (e) {
      setBad(e.message);
    }
  }

  return (
    <div className="json-field">
      <textarea
        rows={10}
        spellCheck={false}
        value={text}
        onChange={(e) => edit(e.target.value)}
        className={bad ? "bad" : ""}
      />
      {bad
        ? <p className="json-err">{bad}</p>
        : <p className="json-ok">Valid JSON</p>}
    </div>
  );
}

export default function GenericTable({ table }) {
  const [rows, setRows] = useState([]);
  /* Rows of other tables, for fields that point at one. A cable size
     belongs to a cable type, and the alternative to fetching it is
     denormalising the type's name onto every size — which then has to be
     corrected in as many places as there are sizes when it is renamed. */
  const [refRows, setRefRows] = useState({});
  const [draft, setDraft] = useState({});
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      /* Anything this table points at, alongside the table itself. */
      const refs = [...new Set((table.fields || [])
        .filter((f) => f.type === "lookup" && f.table).map((f) => f.table))];
      if (refs.length) {
        const loaded = await Promise.all(refs.map((t) =>
          adminList(t).then((r) => [t, r.rows || []]).catch(() => [t, []])));
        setRefRows(Object.fromEntries(loaded));
      }
      const res = await adminList(table.key);
      setRows(res.rows || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setDraft({});
    setEditing(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.key]);

  const value = (row, f) => (editing === row?.[table.pk] ? draft[f.col] : row[f.col]);

  async function save() {
    const missing = table.fields.filter((f) => f.required && !draft[f.col]).map((f) => f.label);
    if (missing.length) return setError(`Required: ${missing.join(", ")}`);
    try {
      if (editing) await adminUpdate(table.key, editing, draft);
      else await adminCreate(table.key, draft);
      setDraft({});
      setEditing(null);
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(row) {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await adminDelete(table.key, row[table.pk], table.pk);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="loading">Loading&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">{table.label}</h2>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="add-panel">
        <p className="panel-label">{editing ? "Edit entry" : "Add new entry"}</p>
        <div className="gen-grid">
          {table.fields.map((f) => (
            <div className="fld" key={f.col}>
              <label>
                {f.label}
                {f.required && <span className="req"> *</span>}
              </label>
              {f.type === "json" ? (
                <JsonField
                  value={draft[f.col]}
                  onChange={(v) => setDraft((d) => ({ ...d, [f.col]: v }))}
                />
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  className="cb"
                  checked={!!draft[f.col]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.col]: e.target.checked }))}
                />
              ) : f.type === "colour" ? (
                /* Swatch and hex together: the picker is quick, and the
                   text box is how a brand colour gets pasted in. Blank
                   is allowed and means "no colour", which is different
                   from white. */
                <div className="col-field">
                  <input type="color" value={draft[f.col] || "#ffffff"}
                    aria-label={`${f.label} swatch`}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.col]: e.target.value }))} />
                  <input type="text" value={draft[f.col] ?? ""} placeholder="none"
                    onChange={(e) => setDraft((d) => ({ ...d, [f.col]: e.target.value }))} />
                  {draft[f.col] && (
                    <button type="button" className="col-clear"
                      onClick={() => setDraft((d) => ({ ...d, [f.col]: null }))}>Clear</button>
                  )}
                </div>
              ) : f.type === "lookup" ? (
                <Select
                  value={draft[f.col] ?? ""}
                  onChange={(v) => setDraft((d) => ({ ...d, [f.col]: v ? Number(v) : null }))}
                >
                  <option value="">&mdash;</option>
                  {(refRows[f.table] || []).map((o) => (
                    <option key={o[f.value]} value={o[f.value]}>{o[f.text]}</option>
                  ))}
                </Select>
              ) : f.type === "select" ? (
                <Select
                  value={draft[f.col] ?? ""}
                  onChange={(v) => setDraft((d) => ({ ...d, [f.col]: v }))}
                >
                  <option value="">&mdash;</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={draft[f.col] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.col]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <div className="gen-actions">
            {editing && (
              <button className="btn ghost" onClick={() => { setEditing(null); setDraft({}); }}>
                Cancel
              </button>
            )}
            <button className="btn accent" onClick={save}>
              {editing ? "Save" : "+ Add"}
            </button>
          </div>
        </div>
      </div>

      <p className="panel-label">
        {rows.length} entr{rows.length === 1 ? "y" : "ies"}
      </p>

      {rows.length === 0 ? (
        <div className="empty">Nothing here yet. Add one above.</div>
      ) : (
        <div className="gen-table-wrap">
          <table className="gen-table">
            <thead>
              <tr>
                {table.fields.map((f) => (
                  <th key={f.col}>{f.label}</th>
                ))}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[table.pk]}>
                  {table.fields.map((f) => (
                    <td key={f.col}>
                      {f.type === "colour"
                        ? (r[f.col]
                            ? <span className="col-chip">
                                <span className="col-dot" style={{ background: r[f.col] }} />
                                {r[f.col]}
                              </span>
                            : <span className="col-none">none</span>)
                        : f.type === "checkbox"
                        ? r[f.col] ? <span className="tick">&#10003;</span> : ""
                        : f.type === "json"
                          ? <span className="json-cell">
                              {Object.keys(r[f.col] || {}).length} setting(s)
                            </span>
                        /* Show what it points at, not the id it points
                           with — a column of numbers is unreadable. */
                        : f.type === "lookup"
                          ? ((refRows[f.table] || [])
                              .find((o) => String(o[f.value]) === String(r[f.col]))?.[f.text]
                              ?? "")
                          : r[f.col] ?? ""}
                    </td>
                  ))}
                  <td className="row-actions">
                    <button onClick={() => { setEditing(r[table.pk]); setDraft({ ...r }); }}>Edit</button>
                    <button className="del" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = `
.json-field textarea { width: 100%; font: 12px ui-monospace, Menlo, monospace;
  line-height: 1.5; padding: 9px 11px; resize: vertical; }
.json-field textarea.bad { border-color: #fca5a5; background: #fef2f2; }
.json-err { margin: 4px 0 0; font-size: 11px; color: #b91c1c; font-weight: 600; }
.json-ok { margin: 4px 0 0; font-size: 11px; color: var(--ok-text); }
.json-cell { font-size: 11.5px; color: var(--muted); }

.gen-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; align-items: end; }
.gen-actions { display: flex; gap: 8px; }
.gen-actions .btn { flex: 1; }
.cb { width: auto; height: 17px; }
.gen-table-wrap { border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; max-height: 58vh; }
.gen-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.gen-table th {
  position: sticky; top: 0; background: var(--accent); color: #fff; text-align: left;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; padding: 8px 10px;
}
.gen-table td { padding: 7px 10px; border-top: 1px solid var(--border); }
.gen-table tbody tr:nth-child(even) { background: #fafbfc; }
.row-actions { text-align: right; white-space: nowrap; }
.row-actions button {
  background: none; border: none; cursor: pointer; font: 600 11.5px inherit;
  color: var(--accent); padding: 2px 6px; border-radius: 4px;
}
.row-actions button:hover { background: var(--accent-light); }
.row-actions .del { color: #ef4444; }
.row-actions .del:hover { background: #fef2f2; }
.col-field { display: flex; align-items: center; gap: 7px; }
.col-field input[type=color] { width: 40px; height: 30px; padding: 2px; flex: none; cursor: pointer; }
.col-field input[type=text] { flex: 1; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.col-clear { background: none; border: none; cursor: pointer; color: var(--muted);
  font: 600 11px inherit; padding: 2px 6px; }
.col-clear:hover { color: var(--text); }
.col-chip { display: inline-flex; align-items: center; gap: 7px;
  font: 12px ui-monospace, Menlo, monospace; }
.col-dot { width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--border); }
.col-none { color: var(--muted); font-style: italic; font-size: 12px; }
.tick { color: #059669; font-weight: 700; }
`;
