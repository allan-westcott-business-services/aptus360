import { useState, useEffect, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import { UTILITIES, trimStr } from "./ncr.js";

/* Raising and working a non-compliance report.

   The finding itself, then the two things that happen to it: corrective
   actions and comments. Both are only offered once the report exists,
   because they hang off its id — a form that let somebody type an
   action before saving would have to hold it somewhere and hope.

   ── The reference is not typed ──

   NCRxxxxx is allocated by the database (0139), so the field is shown
   read-only and empty on a new report. The original allocated it in the
   browser and retried up to five times on a collision; there is nothing
   to collide with now, and nothing for this form to do about it. */

const AUDITOR_TYPES = [
  { value: "", label: "Aptus Utilities (internal)" },
  { value: "DNO", label: "DNO" },
  { value: "IDNO", label: "IDNO" },
];

const BLANK = {
  Description: "", Date_Received: "", Close_Date: "",
  Region_ID: "", Sub_Region_ID: "", Business_Unit_ID: "", Project_ID: "",
  Auditor_Type: "", Auditor_DNO_ID: "", Auditor_IDNO_ID: "",
  Owner_Person_ID: "", Utility: "", NCR_Status_ID: "",
};

const num = (v) => (trimStr(v) === "" ? null : Number(v));

export default function NcrModal({ ncr, lookups, onClose, onSaved }) {
  const isNew = !ncr?.NCR_ID;
  const [form, setForm] = useState(() => Object.fromEntries(
    Object.keys(BLANK).map((k) => [k, ncr?.[k] ?? BLANK[k]])));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [actions, setActions] = useState([]);
  const [comments, setComments] = useState([]);
  const [newAction, setNewAction] = useState({ Action: "", Owner_Person_ID: "", Due_Date: "" });
  const [newComment, setNewComment] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const loadChildren = useCallback(async () => {
    if (isNew) return;
    const soft = (t) => adminList(t).catch(() => ({ rows: [] }));
    const [a, c] = await Promise.all([soft("NCR_Action"), soft("NCR_Comment")]);
    const mine = (list) => (list || []).filter((x) => Number(x.NCR_ID) === Number(ncr.NCR_ID));
    setActions(mine(a.rows));
    setComments(mine(c.rows));
  }, [isNew, ncr]);
  useEffect(() => { loadChildren(); }, [loadChildren]);

  /* Sub-regions belong to a region, so the list narrows once one is
     chosen. Choosing a region that does not own the current sub-region
     clears it rather than leaving a pairing that is quietly wrong. */
  const subRegions = useMemo(() => {
    const all = lookups.subRegions || [];
    if (!form.Region_ID) return all;
    return all.filter((s) => Number(s.Region_ID) === Number(form.Region_ID));
  }, [lookups.subRegions, form.Region_ID]);

  useEffect(() => {
    if (!form.Sub_Region_ID) return;
    if (!subRegions.some((s) => Number(s.Sub_Region_ID) === Number(form.Sub_Region_ID))) {
      setForm((f) => ({ ...f, Sub_Region_ID: "" }));
    }
  }, [subRegions, form.Sub_Region_ID]);

  const statusName = (id) => (lookups.statuses || [])
    .find((s) => Number(s.NCR_Status_ID) === Number(id))?.NCR_Status ?? "";
  const closing = statusName(form.NCR_Status_ID) === "Closed";

  async function save() {
    if (!trimStr(form.Description)) { setMsg("Give the report a description."); return; }
    if (!form.NCR_Status_ID) { setMsg("Choose a status."); return; }
    if (form.Auditor_Type === "DNO" && !form.Auditor_DNO_ID) {
      setMsg("Choose which DNO raised it."); return;
    }
    if (form.Auditor_Type === "IDNO" && !form.Auditor_IDNO_ID) {
      setMsg("Choose which IDNO raised it."); return;
    }

    /* The two auditor ids are cleared to match the type. The database
       refuses a mismatched pair (0139), and sending one it will reject
       turns a form mistake into an error about a constraint. */
    const payload = {
      Description: trimStr(form.Description) || null,
      Date_Received: form.Date_Received || null,
      Close_Date: form.Close_Date || null,
      Region_ID: num(form.Region_ID),
      Sub_Region_ID: num(form.Sub_Region_ID),
      Business_Unit_ID: num(form.Business_Unit_ID),
      Project_ID: num(form.Project_ID),
      Auditor_Type: form.Auditor_Type || null,
      Auditor_DNO_ID: form.Auditor_Type === "DNO" ? num(form.Auditor_DNO_ID) : null,
      Auditor_IDNO_ID: form.Auditor_Type === "IDNO" ? num(form.Auditor_IDNO_ID) : null,
      Owner_Person_ID: num(form.Owner_Person_ID),
      Utility: form.Utility || null,
      NCR_Status_ID: num(form.NCR_Status_ID),
    };

    setBusy(true);
    try {
      if (isNew) await adminCreate("NCR", payload, "NCR_ID");
      else await adminUpdate("NCR", ncr.NCR_ID, payload);
      setMsg("");
      onSaved();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function addAction() {
    if (!trimStr(newAction.Action)) return;
    setBusy(true);
    try {
      const created = await adminCreate("NCR_Action", {
        NCR_ID: ncr.NCR_ID,
        Action: trimStr(newAction.Action),
        Owner_Person_ID: num(newAction.Owner_Person_ID),
        Due_Date: newAction.Due_Date || null,
      }, "NCR_Action_ID");
      setActions((xs) => [...xs, created]);
      setNewAction({ Action: "", Owner_Person_ID: "", Due_Date: "" });
      setMsg("");
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function closeAction(a) {
    const today = new Date().toISOString().slice(0, 10);
    const next = a.Closed_Date ? null : today;
    try {
      await adminUpdate("NCR_Action", a.NCR_Action_ID, { Closed_Date: next });
      setActions((xs) => xs.map((x) =>
        x.NCR_Action_ID === a.NCR_Action_ID ? { ...x, Closed_Date: next } : x));
    } catch (e) { setMsg(e.message); }
  }

  async function removeAction(a) {
    try {
      await adminDelete("NCR_Action", a.NCR_Action_ID, "NCR_Action_ID");
      setActions((xs) => xs.filter((x) => x.NCR_Action_ID !== a.NCR_Action_ID));
    } catch (e) { setMsg(e.message); }
  }

  async function addComment() {
    if (!trimStr(newComment)) return;
    setBusy(true);
    try {
      const created = await adminCreate("NCR_Comment", {
        NCR_ID: ncr.NCR_ID, Comment: trimStr(newComment),
      }, "NCR_Comment_ID");
      setComments((xs) => [created, ...xs]);
      setNewComment("");
      setMsg("");
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  const personName = (id) => (lookups.people || [])
    .find((p) => Number(p.Person_ID) === Number(id))?.Person_Name ?? "";

  const openActions = actions.filter((a) => !a.Closed_Date).length;

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="nm" role="dialog" onClick={(e) => e.stopPropagation()}
        aria-label={isNew ? "Add a non-compliance report" : `Edit ${ncr.NCR_Reference}`}>
        <style>{CSS}</style>
        <div className="nm-head">
          <h2>{isNew ? "Add a non-compliance report" : `Edit ${ncr.NCR_Reference}`}</h2>
          <button className="nm-close" onClick={onClose} aria-label="Close">
            {"\u00d7"}
          </button>
        </div>

        <div className="nm-body">
          <div className="nm-grid">
            <label className="nm-fld">
              <span>NCR reference</span>
              <input value={isNew ? "" : ncr.NCR_Reference} readOnly
                placeholder="Allocated on save"
                title="Allocated by the database when the report is saved" />
            </label>
            <label className="nm-fld">
              <span>Date received</span>
              <input type="date" value={form.Date_Received ?? ""} onChange={set("Date_Received")} />
            </label>
            <label className="nm-fld">
              <span>Status *</span>
              <select value={form.NCR_Status_ID ?? ""} onChange={set("NCR_Status_ID")}>
                <option value="">{"\u2014"}</option>
                {(lookups.statuses || []).map((s) => (
                  <option key={s.NCR_Status_ID} value={s.NCR_Status_ID}>{s.NCR_Status}</option>
                ))}
              </select>
            </label>

            <label className="nm-fld">
              <span>Region</span>
              <select value={form.Region_ID ?? ""} onChange={set("Region_ID")}>
                <option value="">{"\u2014"}</option>
                {(lookups.regions || []).map((r) => (
                  <option key={r.Region_ID} value={r.Region_ID}>{r.Region}</option>
                ))}
              </select>
            </label>
            <label className="nm-fld">
              <span>Sub region</span>
              <select value={form.Sub_Region_ID ?? ""} onChange={set("Sub_Region_ID")}
                disabled={!subRegions.length}>
                <option value="">
                  {form.Region_ID ? "\u2014" : "\u2014 any region \u2014"}
                </option>
                {subRegions.map((s) => (
                  <option key={s.Sub_Region_ID} value={s.Sub_Region_ID}>{s.Sub_Region}</option>
                ))}
              </select>
            </label>
            <label className="nm-fld">
              <span>Business unit</span>
              <select value={form.Business_Unit_ID ?? ""} onChange={set("Business_Unit_ID")}
                disabled={!(lookups.businessUnits || []).length}>
                <option value="">
                  {(lookups.businessUnits || []).length ? "\u2014" : "Arrives with HR"}
                </option>
                {(lookups.businessUnits || []).map((b) => (
                  <option key={b.Business_Unit_ID} value={b.Business_Unit_ID}>
                    {b.Business_Unit}
                  </option>
                ))}
              </select>
            </label>

            <label className="nm-fld nm-span2">
              <span>Project</span>
              <select value={form.Project_ID ?? ""} onChange={set("Project_ID")}>
                <option value="">{"\u2014"}</option>
                {(lookups.projects || []).map((p) => (
                  <option key={p.Project_ID} value={p.Project_ID}>
                    {p.Project_Ref}{p.Site_Name ? ` \u2014 ${p.Site_Name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="nm-fld">
              <span>Utility</span>
              <select value={form.Utility ?? ""} onChange={set("Utility")}>
                <option value="">{"\u2014"}</option>
                {UTILITIES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>

            <label className="nm-fld">
              <span>Raised by</span>
              <select value={form.Auditor_Type ?? ""} onChange={set("Auditor_Type")}>
                {AUDITOR_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </label>
            {form.Auditor_Type === "DNO" && (
              <label className="nm-fld">
                <span>DNO *</span>
                <select value={form.Auditor_DNO_ID ?? ""} onChange={set("Auditor_DNO_ID")}>
                  <option value="">{"\u2014"}</option>
                  {(lookups.dnos || []).map((d) => (
                    <option key={d.DNO_ID} value={d.DNO_ID}>{d.DNO_Name}</option>
                  ))}
                </select>
              </label>
            )}
            {form.Auditor_Type === "IDNO" && (
              <label className="nm-fld">
                <span>IDNO *</span>
                <select value={form.Auditor_IDNO_ID ?? ""} onChange={set("Auditor_IDNO_ID")}>
                  <option value="">{"\u2014"}</option>
                  {(lookups.idnos || []).map((i) => (
                    <option key={i.IDNO_ID} value={i.IDNO_ID}>{i.IDNO_Name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="nm-fld">
              <span>Owner</span>
              <select value={form.Owner_Person_ID ?? ""} onChange={set("Owner_Person_ID")}>
                <option value="">{"\u2014 Unassigned \u2014"}</option>
                {(lookups.people || []).map((p) => (
                  <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                ))}
              </select>
            </label>

            <label className="nm-fld nm-span3">
              <span>Description *</span>
              <textarea rows="3" value={form.Description ?? ""} onChange={set("Description")} />
            </label>

            <label className="nm-fld">
              <span>Close date</span>
              <input type="date" value={form.Close_Date ?? ""} onChange={set("Close_Date")} />
            </label>
          </div>

          {closing && !form.Close_Date && (
            <Banner kind="warn">
              Status is Closed but there is no close date. Neither is required, but a
              register full of one without the other is hard to report on.
            </Banner>
          )}
          {closing && openActions > 0 && (
            <Banner kind="warn">
              {openActions} corrective action{openActions === 1 ? " is" : "s are"} still
              open on this report.
            </Banner>
          )}

          {msg && <p className="nm-msg">{msg}</p>}

          {isNew ? (
            <p className="hint nm-note">
              Corrective actions and comments can be added once the report is saved.
            </p>
          ) : (
            <>
              <section className="nm-sec">
                <h3>
                  Corrective actions
                  <span className="nm-n">
                    {actions.length ? `${openActions} open of ${actions.length}` : "none yet"}
                  </span>
                </h3>
                {actions.map((a) => (
                  <div className={a.Closed_Date ? "nm-action done" : "nm-action"}
                    key={a.NCR_Action_ID}>
                    <span className="nm-action-text">{a.Action}</span>
                    <span className="nm-action-meta">
                      {personName(a.Owner_Person_ID) || "Unassigned"}
                      {a.Due_Date ? ` \u00b7 due ${a.Due_Date}` : ""}
                      {a.Closed_Date ? ` \u00b7 closed ${a.Closed_Date}` : ""}
                    </span>
                    <button className="btn sm" onClick={() => closeAction(a)}>
                      {a.Closed_Date ? "Reopen" : "Close"}
                    </button>
                    <button className="btn delete sm"
                      onClick={() => removeAction(a)}>Delete</button>
                  </div>
                ))}
                <div className="nm-add">
                  <input placeholder="What needs doing…" value={newAction.Action}
                    onChange={(e) => setNewAction((a) => ({ ...a, Action: e.target.value }))} />
                  <select value={newAction.Owner_Person_ID}
                    onChange={(e) => setNewAction((a) =>
                      ({ ...a, Owner_Person_ID: e.target.value }))}>
                    <option value="">{"\u2014 Owner \u2014"}</option>
                    {(lookups.people || []).map((p) => (
                      <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                    ))}
                  </select>
                  <input type="date" value={newAction.Due_Date} aria-label="Due date"
                    onChange={(e) => setNewAction((a) => ({ ...a, Due_Date: e.target.value }))} />
                  <button className="btn edit sm" disabled={busy || !trimStr(newAction.Action)}
                    onClick={addAction}>Add</button>
                </div>
              </section>

              <section className="nm-sec">
                <h3>
                  Comments
                  <span className="nm-n">{comments.length || "none yet"}</span>
                </h3>
                {comments.map((c) => (
                  <div className="nm-comment" key={c.NCR_Comment_ID}>
                    <p>{c.Comment}</p>
                    <span className="nm-comment-meta">
                      {c.Author || "Unattributed"}
                      {c.Created_At ? ` \u00b7 ${String(c.Created_At).slice(0, 10)}` : ""}
                    </span>
                  </div>
                ))}
                <div className="nm-add">
                  <input placeholder="Add a comment…" value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addComment(); }} />
                  <button className="btn edit sm" disabled={busy || !trimStr(newComment)}
                    onClick={addComment}>Add</button>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="nm-foot">
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button className="btn edit sm" disabled={busy} onClick={save}>
            {busy ? "Saving\u2026" : isNew ? "Add report" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.nm { background: var(--white); border-radius: 14px; width: 860px; max-width: 100%;
  max-height: 90vh; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,.3); }
.nm-head { display: flex; align-items: center; gap: 12px; padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border); }
.nm-head h2 { flex: 1; margin: 0; font-size: 16px; font-weight: 700; color: var(--accent); }
.nm-close { background: none; border: none; font-size: 22px; line-height: 1;
  cursor: pointer; color: var(--muted); padding: 0 2px; }
.nm-body { padding: 18px 22px; overflow-y: auto; }
.nm-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 13px 22px;
  border-top: 1px solid var(--border); }
.nm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; }
.nm-span2 { grid-column: span 2; }
.nm-span3 { grid-column: 1 / -1; }
.nm-fld { display: flex; flex-direction: column; gap: 3px; font-size: 12px; min-width: 0; }
.nm-fld > span { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.nm-fld input, .nm-fld select, .nm-fld textarea { font: 500 12.5px inherit;
  padding: 6px 9px; width: 100%; border: 1px solid var(--border); border-radius: 6px;
  background: var(--white); }
.nm-fld input[readonly] { background: var(--bg); color: var(--muted); }
.nm-fld textarea { resize: vertical; }
.nm-msg { margin: 12px 0 0; font-size: 12px; color: var(--err-text); }
.nm-note { margin-top: 14px; }
.nm-sec { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.nm-sec h3 { margin: 0 0 10px; font-size: 13px; font-weight: 700; }
.nm-n { font: 500 11.5px inherit; color: var(--muted); margin-left: 8px; }
.nm-action { display: flex; align-items: center; gap: 9px; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 7px; margin-bottom: 6px;
  font-size: 12.5px; }
.nm-action.done { background: var(--ok-bg); border-color: var(--ok-border); }
.nm-action-text { flex: 1; font-weight: 600; }
.nm-action.done .nm-action-text { text-decoration: line-through; color: var(--muted); }
.nm-action-meta { font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.nm-comment { padding: 8px 10px; border-left: 3px solid var(--border);
  margin-bottom: 7px; background: var(--bg); border-radius: 0 6px 6px 0; }
.nm-comment p { margin: 0 0 3px; font-size: 12.5px; }
.nm-comment-meta { font-size: 11px; color: var(--muted); }
.nm-add { display: flex; gap: 7px; margin-top: 9px; flex-wrap: wrap; }
.nm-add input, .nm-add select { font: 500 12.5px inherit; padding: 6px 9px;
  border: 1px solid var(--border); border-radius: 6px; }
.nm-add input:first-child { flex: 1; min-width: 180px; }
@media (max-width: 720px) { .nm-grid { grid-template-columns: 1fr 1fr; } }
`;
