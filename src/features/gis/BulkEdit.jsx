import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { classOf, membersOf, fieldsFor, planBulkEdit, CLEAR } from "./bulkEdit.js";

/* Editing every feature of one kind at once.

   Reached from a feature rather than from a list, because "this kind" is
   easiest to say by pointing at one: right-click a service trench and
   the panel is about service trenches.

   Every field starts blank and blank means unchanged. A form that
   arrived filled in with one feature's values would write those values
   across the rest the moment anything else was saved. */

export default function BulkEdit({
  feature, features, selected = [], lineTypes, layers, surfaceTypes,
  cables, cableTypes, busy, onApply, onClose,
}) {
  const drag = useDragHandle();
  const [draft, setDraft] = useState({});

  const cls = useMemo(() => classOf(feature, { lineTypes, layers }),
    [feature, lineTypes, layers]);
  const everyone = useMemo(() => membersOf(features, cls), [features, cls]);

  /* The ones selected that are of this class.

     A selection can span classes — a trench and a cable dragged over
     together — and the fields on offer only make sense for one of them.
     The odd ones out are left alone and said out loud, rather than
     quietly given a surface they cannot have. */
  const chosen = useMemo(
    () => (selected || []).filter((f) => membersOf([f], cls).length),
    [selected, cls]);
  const strays = (selected || []).length - chosen.length;

  /* Which of the two the edit applies to.

     Starts on the selection when more than one thing is selected — that
     is a deliberate act and the likeliest intent. One selected feature
     is more often a way of saying "this kind", so that starts on the
     class. */
  const [scope, setScope] = useState((selected || []).length > 1 ? "selected" : "class");
  const members = scope === "selected" && chosen.length ? chosen : everyone;
  const fields = useMemo(() => fieldsFor(cls, { lineTypes }), [cls, lineTypes]);
  const plan = useMemo(() => planBulkEdit(members, cls, draft),
    [members, cls, draft]);

  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  /* What each field currently holds across the class, so it is clear
     whether a change is setting something or replacing something. */
  const spread = (key) => {
    const vals = new Set(members.map((f) => String(f.Attributes?.[key] ?? "")));
    if (vals.size === 1) {
      const only = [...vals][0];
      return only === "" ? "none set" : `all ${only}`;
    }
    return `${vals.size} different values`;
  };

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="be" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Bulk edit">
        <style>{CSS}</style>

        <div className="be-head" {...drag.handleProps}>
          <div>
            <h3>Edit all {cls?.label?.toLowerCase()}</h3>
            <p className="be-sub">
              {members.length} feature{members.length === 1 ? "" : "s"}
              {scope === "selected" ? " selected" : " on this drawing"}
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="be-body">
          {/* Which set, said before anything is filled in. */}
          {chosen.length > 0 && everyone.length !== chosen.length && (
            <div className="be-scope">
              <button className={scope === "selected" ? "on" : ""}
                onClick={() => setScope("selected")}>
                The {chosen.length} selected
              </button>
              <button className={scope === "class" ? "on" : ""}
                onClick={() => setScope("class")}>
                All {everyone.length} {cls?.label?.toLowerCase()}
              </button>
            </div>
          )}
          {strays > 0 && (
            <p className="hint be-stray">
              {strays} other selected feature{strays === 1 ? " is" : "s are"} not
              {" "}{cls?.label?.toLowerCase()} and will be left alone.
            </p>
          )}
          {!fields.length ? (
            <p className="be-none">
              There is nothing on {cls?.label?.toLowerCase()} that can be set in bulk.
            </p>
          ) : (
            <>
              <p className="hint be-hint">
                Leave a field blank to leave it as it is. Only what you set is written.
              </p>

              {fields.map((fd) => (
                <div className="fld" key={fd.key}>
                  <label htmlFor={`be-${fd.key}`}>
                    {fd.label}
                    <span className="be-now">{spread(fd.key)}</span>
                  </label>

                  {fd.kind === "surface" && (
                    <select id={`be-${fd.key}`} value={draft[fd.key] ?? ""}
                      onChange={(e) => set(fd.key)(e.target.value)}>
                      <option value="">leave as is</option>
                      {(surfaceTypes || []).map((s) => (
                        <option key={s.Surface_Key} value={s.Surface_Key}>{s.Label}</option>
                      ))}
                      <option value={CLEAR}>&mdash; clear it &mdash;</option>
                    </select>
                  )}

                  {fd.kind === "lineType" && (
                    <select id={`be-${fd.key}`} value={draft[fd.key] ?? ""}
                      onChange={(e) => set(fd.key)(e.target.value)}>
                      <option value="">leave as is</option>
                      {(lineTypes || [])
                        .filter((t) => t.Layer_Key === cls.layer)
                        .map((t) => (
                          <option key={t.Type_Key} value={t.Type_Key}>{t.Label}</option>
                        ))}
                    </select>
                  )}

                  {fd.kind === "cable" && (
                    <select id={`be-${fd.key}`} value={draft[fd.key] ?? ""}
                      onChange={(e) => set(fd.key)(e.target.value)}>
                      <option value="">leave as is</option>
                      {(cables || [])
                        .filter((c) => {
                          const t = (cableTypes || []).find((x) =>
                            x.Cable_Type_ID === c.Cable_Type_ID);
                          const u = String(t?.Usage_Type ?? "").toLowerCase();
                          return !u || u.includes(fd.usage);
                        })
                        .map((c) => {
                          const t = (cableTypes || []).find((x) =>
                            x.Cable_Type_ID === c.Cable_Type_ID);
                          return (
                            <option key={c.Cable_Size_ID} value={c.Cable_Size_ID}>
                              {[t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ")}
                            </option>
                          );
                        })}
                      <option value={CLEAR}>&mdash; clear it &mdash;</option>
                    </select>
                  )}

                  {fd.kind === "choice" && (
                    <select id={`be-${fd.key}`} value={draft[fd.key] ?? ""}
                      onChange={(e) => set(fd.key)(e.target.value)}>
                      <option value="">leave as is</option>
                      {fd.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      <option value={CLEAR}>&mdash; clear it &mdash;</option>
                    </select>
                  )}

                  {fd.kind === "text" && (
                    <input id={`be-${fd.key}`} value={draft[fd.key] ?? ""}
                      placeholder="leave as is"
                      onChange={(e) => set(fd.key)(e.target.value)} />
                  )}

                  {fd.note && <p className="hint be-note">{fd.note}</p>}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="be-foot">
          {/* How many would actually change, not how many are of this
              kind. A feature already holding the value is not rewritten,
              and saying "48 of 120" is the difference between a bulk
              edit someone trusts and one they check afterwards. */}
          <span className="be-count">
            {plan.rows.length
              ? `${plan.rows.length} of ${members.length} would change`
              : "Nothing to change yet"}
          </span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={!!busy || !plan.rows.length}
            onClick={() => onApply(plan)}>
            {busy ? "Saving\u2026" : `Apply to ${plan.rows.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.be { background: var(--white); border-radius: 12px; width: min(460px, 94vw);
  max-height: 88vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.be-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.be-head h3 { margin: 0; font-size: 16px; }
.be-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.be-body { padding: 12px 18px; overflow-y: auto; flex: 1; }
.be-hint { margin: 0 0 12px; }
.be-note { margin: 4px 0 0; font-size: 10.5px; }
.be-none { color: var(--muted); font-size: 12.5px; margin: 20px 0; }
.be-now { float: right; font-weight: 500; font-size: 10.5px; color: var(--muted); }
.be-scope { display: flex; gap: 0; margin: 0 0 12px; border: 1px solid var(--border);
  border-radius: 7px; overflow: hidden; }
.be-scope button { flex: 1; background: var(--white); border: none; cursor: pointer;
  font: 600 11px inherit; padding: 6px 8px; color: var(--muted); }
.be-scope button.on { background: var(--accent); color: #fff; }
.be-stray { margin: -6px 0 12px; color: #b45309; }
.be-foot { display: flex; align-items: center; gap: 9px; padding: 12px 18px;
  border-top: 1px solid var(--border); }
.be-count { font-size: 11.5px; color: var(--muted); margin-right: auto; }
`;
