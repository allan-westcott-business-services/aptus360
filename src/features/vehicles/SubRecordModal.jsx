import { useState } from "react";

/* One form for all five histories, shaped by the kind's field list.

   ── The bug this does not carry over ──

   The original built its payload like this:

       if(raw === '' || raw == null){ payload[f.id] = null; continue; }
       ...
       if(f.required && (raw === '' || raw == null)){ ...error...; return; }

   The `continue` on an empty value jumps past the required check, so the
   check only ever ran on values that were present — which is to say it
   never ran at all. Every field marked required in that file (MOT test
   and expiry dates, insurance start and end, maintenance date, mileage
   reading date and reading) could be saved blank.

   That matters most for the mileage reading, which is NOT NULL in the
   database: an empty one is a constraint violation surfacing as an HTTP
   error rather than as "Mileage is required". Required fields are
   checked here before anything is assigned. */

export default function SubRecordModal({ meta, record, people, busy, onSave, onClose }) {
  const isNew = !record;
  const [form, setForm] = useState(() => {
    const out = {};
    for (const f of meta.fields) {
      const v = record?.[f.id];
      out[f.id] = v != null ? String(v).slice(0, f.type === "date" ? 10 : undefined)
        : (isNew && typeof f.default === "function" ? f.default() : "");
    }
    return out;
  });
  const [msg, setMsg] = useState("");

  const set = (id) => (e) => setForm((f) => ({ ...f, [id]: e.target.value }));

  function submit() {
    /* Checked before anything is built, so a missing required field is
       reported rather than quietly sent as null. */
    for (const f of meta.fields) {
      if (f.required && String(form[f.id] ?? "").trim() === "") {
        setMsg(`${f.label} is required.`);
        return;
      }
    }
    const payload = {};
    for (const f of meta.fields) {
      const raw = String(form[f.id] ?? "").trim();
      if (raw === "") { payload[f.id] = null; continue; }
      if (f.type === "number" || f.type === "person") {
        const n = Number(raw);
        if (!Number.isFinite(n)) { setMsg(`${f.label} has to be a number.`); return; }
        payload[f.id] = n;
      } else {
        payload[f.id] = raw;
      }
    }
    setMsg("");
    onSave(payload, (m) => setMsg(m));
  }

  return (
    <div className="vh-backdrop" onClick={onClose}>
      <div className="vh-modal vh-modal-sm" role="dialog"
        aria-label={`${isNew ? "Add" : "Edit"} ${meta.one}`}
        onClick={(e) => e.stopPropagation()}>
        <div className="vh-modal-head">
          <h2>{isNew ? `Add ${meta.one}` : `Edit ${meta.one}`}</h2>
          <button className="vh-close" onClick={onClose} aria-label="Close">
            {"\u00d7"}
          </button>
        </div>

        <div className="vh-grid vh-grid-2">
          {meta.fields.map((f) => (
            <label key={f.id}
              className={f.span === 2 ? "vh-fld vh-span2" : "vh-fld"}>
              <span>{f.label}{f.required ? " *" : ""}</span>

              {f.type === "select" ? (
                <select value={form[f.id]} onChange={set(f.id)}>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o || "\u2014"}</option>
                  ))}
                </select>
              ) : f.type === "person" ? (
                <select value={form[f.id]} onChange={set(f.id)}>
                  <option value="">{"\u2014 Unassigned \u2014"}</option>
                  {people.map((p) => (
                    <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea rows="2" value={form[f.id]} onChange={set(f.id)} />
              ) : (
                <input type={f.type}
                  step={f.type === "number" ? "any" : undefined}
                  placeholder={f.placeholder}
                  value={form[f.id]} onChange={set(f.id)} />
              )}
            </label>
          ))}
        </div>

        {msg && <p className="vh-msg">{msg}</p>}

        <div className="vh-modal-foot">
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button className="btn edit sm" disabled={busy} onClick={submit}>
            {busy ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
