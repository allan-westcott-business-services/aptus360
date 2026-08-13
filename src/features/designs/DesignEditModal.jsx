import { useState } from "react";
import { openGis } from "../../lib/gisIntent.js";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { utilityById } from "../../lib/utilities.js";

/* One outline design, with room to read it.

   The table has eleven columns and shows everything at once, which is
   right for scanning and wrong for editing — this is the same fields
   laid out to be filled in. */
export default function DesignEditModal({
  design, lookups, designers, checkers, onSave, onClose, projectId,
}) {
  const [f, setF] = useState({ ...design });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  /* Whether the form has been touched. Compared against the design as it
     arrived rather than tracked per field: every field goes through set,
     and one comparison cannot fall behind the way a flag set in eight
     places can. */
  const dirty = JSON.stringify(f) !== JSON.stringify(design);

  /* Electric is the only utility with a cable catalogue; the rest hold
     their sizes as text. Judged on the utility rather than on whether a
     catalogue happens to have rows, so an empty catalogue shows an empty
     picker rather than silently turning into a text box. */
  const isElectric = Number(f.Utility_ID) === 1;

  /* ── The operators this utility's design may name ──

     Filtered by the utility, which is what Organisation_Utility records
     and what the legacy IDNO table cannot answer. A water design should
     not offer an operator that only works in electric, and until now
     every picker offered everybody.

     An operator with no utilities assigned is not shown — nobody has
     said whether it does water — but the count is, because a name
     missing from a dropdown with no explanation is the fault this is
     fixing, and hiding a different set silently would just move it.

     Whatever is already selected stays in its list even if it would not
     qualify, so opening a design saved before this rule shows what it
     actually holds rather than appearing empty. */
  const utilityId = Number(f.Utility_ID);
  const covers = (ids) => (ids || []).some((x) => Number(x) === utilityId);

  const idnoChoices = (lookups.idnos || [])
    .filter((i) => covers(i.utility_ids) || Number(i.IDNO_ID) === Number(f.IDNO_ID));

  const cableLabel = (c) => {
    const t = (lookups.cableTypes || []).find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    return [t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ");
  };

  /* Split by usage, the same rule the feature editor applies: a mains
     default must not offer a service cable. A type with no usage set
     stays in both, since an unfilled field is not a statement. */
  const byUsage = (want) => (lookups.cableSizes || []).filter((c) => {
    const u = String((lookups.cableTypes || [])
      .find((x) => x.Cable_Type_ID === c.Cable_Type_ID)?.Usage_Type ?? "")
      .trim().toLowerCase();
    return !u || u === want;
  });
  const mainsCables = byUsage("mains");
  const serviceCables = byUsage("service");
  const u = utilityById(f.Utility_ID);
  const num = (v) => (v === "" || v == null ? null : Number(v));

  const today = new Date().toISOString().slice(0, 10);
  const overdue = f.Target_Date && !f.Actual_Date && String(f.Target_Date).slice(0, 10) < today;

  async function save() {
    setSaving(true);
    try {
      await onSave(f);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const drag = useDragHandle();

  return (
    <div className="dm-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="dm" onClick={(e) => e.stopPropagation()} style={drag.panelStyle} role="dialog" aria-label="Edit outline design">
        <style>{CSS}</style>

        <div className="dm-head" {...drag.handleProps}
          style={{ ...drag.handleProps.style, borderTopColor: u?.colour }}>
          <div>
            <h3>
              <span className="dm-dot" style={{ background: u?.colour }} />
              {u?.name ?? "Outline design"}
            </h3>
            <p className="dm-sub">Commercial state is on the Details tab.</p>
          </div>
          <button className="dm-x" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        <div className="dm-body">
          {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

          <p className="dm-label">Ownership</p>
          <div className="dm-grid">
            <div className="fld">
              <label htmlFor="dm-designer">Designer</label>
              <select id="dm-designer" value={f.Designer_ID ?? ""}
                onChange={(e) => set("Designer_ID")(num(e.target.value))}>
                <option value="">&mdash;</option>
                {designers.map((p) => (
                  <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="dm-checker">Checked by</label>
              <select id="dm-checker" value={f.Design_Checked_By ?? ""}
                onChange={(e) => set("Design_Checked_By")(num(e.target.value))}>
                <option value="">&mdash;</option>
                {(checkers.length ? checkers : lookups.people || []).map((p) => (
                  <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                ))}
              </select>
            </div>
            <div className="fld w-sm">
              <label htmlFor="dm-rev">Revision</label>
              <input id="dm-rev" type="number" min="0" value={f.Revision ?? 0}
                onChange={(e) => set("Revision")(Number(e.target.value))} />
            </div>
          </div>

          <p className="dm-label">Progress</p>
          <div className="dm-grid">
            <div className="fld">
              <label htmlFor="dm-status">Design status</label>
              <select id="dm-status" value={f.Design_Status_ID ?? ""}
                onChange={(e) => set("Design_Status_ID")(num(e.target.value))}>
                <option value="">&mdash;</option>
                {(lookups.designStatuses || []).map((d) => (
                  <option key={d.Design_Status_ID} value={d.Design_Status_ID}>{d.Status}</option>
                ))}
              </select>
            </div>
            <div className="fld w-date">
              <label htmlFor="dm-target">Target date</label>
              <input id="dm-target" type="date" value={f.Target_Date || ""}
                className={overdue ? "late" : ""}
                onChange={(e) => set("Target_Date")(e.target.value)} />
              {overdue && <p className="hint late-note">Passed with no actual date</p>}
            </div>
            <div className="fld w-date">
              <label htmlFor="dm-actual">Actual date</label>
              <input id="dm-actual" type="date" value={f.Actual_Date || ""}
                onChange={(e) => set("Actual_Date")(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="dm-poc">POC status</label>
              <select id="dm-poc" value={f.POC_Status_ID ?? ""}
                onChange={(e) => set("POC_Status_ID")(num(e.target.value))}>
                <option value="">&mdash;</option>
                {(lookups.pocStatuses || []).map((x) => (
                  <option key={x.POC_Status_ID} value={x.POC_Status_ID}>{x.POC_Status}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="dm-label">Adopting operator</p>
          <div className="dm-grid">
            <div className="fld">
              <label htmlFor="dm-idno">Adopting operator</label>
              <select id="dm-idno" value={f.IDNO_ID ?? ""}
                onChange={(e) => set("IDNO_ID")(num(e.target.value))}>
                <option value="">&mdash;</option>
                {idnoChoices.map((i) => (
                  <option key={i.IDNO_ID} value={i.IDNO_ID}>{i.IDNO_Name}</option>
                ))}
              </select>
            </div>
            {/* The DNO is not here.

                It was, briefly. It belongs on Stakeholders with the
                other outside organisations — a DNO is who the site
                connects to rather than a decision taken while designing
                it — and having it on both screens would be two places
                writing one column. */}
            <div className="fld grow">
              <label htmlFor="dm-ref">Reference</label>
              <input id="dm-ref" className="mono" value={f.Reference || ""}
                onChange={(e) => set("Reference")(e.target.value)} />
            </div>
          </div>

          {/* What new runs are drawn with.

              Set once here rather than on each feature: a project lays
              one size of main and one of service, and choosing it on
              every run is both tedious and easy to miss — a cable left
              unset on one run is invisible until the bill comes out
              short.

              Electric picks from the catalogue, filtered by usage so a
              service cannot be given a mains cable. Gas and water take
              free text, because that is how their sizes are held on the
              features; a catalogue for them is a larger change than this
              and not the one asked for. */}
          <p className="dm-label">Default equipment</p>
          <div className="dm-grid">
            {isElectric ? (
              <>
                <div className="fld grow">
                  <label htmlFor="dm-dmain">Mains cable</label>
                  <select id="dm-dmain" value={f.Default_Main_Cable_Size_ID ?? ""}
                    onChange={(e) => set("Default_Main_Cable_Size_ID")(num(e.target.value))}>
                    <option value="">&mdash; none &mdash;</option>
                    {mainsCables.map((c) => (
                      <option key={c.Cable_Size_ID} value={c.Cable_Size_ID}>{cableLabel(c)}</option>
                    ))}
                  </select>
                </div>
                <div className="fld grow">
                  <label htmlFor="dm-dsvc">Service cable</label>
                  <select id="dm-dsvc" value={f.Default_Service_Cable_Size_ID ?? ""}
                    onChange={(e) => set("Default_Service_Cable_Size_ID")(num(e.target.value))}>
                    <option value="">&mdash; none &mdash;</option>
                    {serviceCables.map((c) => (
                      <option key={c.Cable_Size_ID} value={c.Cable_Size_ID}>{cableLabel(c)}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="fld grow">
                  <label htmlFor="dm-dmain-t">Mains pipe</label>
                  <input id="dm-dmain-t" value={f.Default_Main_Size || ""}
                    placeholder="e.g. 180mm PE"
                    onChange={(e) => set("Default_Main_Size")(e.target.value)} />
                </div>
                <div className="fld grow">
                  <label htmlFor="dm-dsvc-t">Service pipe</label>
                  <input id="dm-dsvc-t" value={f.Default_Service_Size || ""}
                    placeholder="e.g. 32mm PE"
                    onChange={(e) => set("Default_Service_Size")(e.target.value)} />
                </div>
              </>
            )}
          </div>
          <p className="dm-hint">
            New runs drawn on the canvas take these. Anything already drawn
            keeps what it has.
          </p>

          <p className="dm-label">Points</p>
          <div className="dm-points">
            <div className="fld w-sm">
              <label>Calculated</label>
              <input value={f.Auto_Base_Points ?? "\u2014"} disabled />
              <p className="hint">From the plot count</p>
            </div>
            <div className="dm-arrow">&rarr;</div>
            <div className="fld w-sm">
              <label htmlFor="dm-pts">Manual</label>
              <input id="dm-pts" type="number" step="0.5"
                disabled={!f.Base_Points_Overridden}
                value={f.Base_Points_Overridden ? (f.Manual_Base_Points ?? "") : ""}
                onChange={(e) => set("Manual_Base_Points")(num(e.target.value))} />
            </div>
            <div className="dm-ovr">
              <label className="inline">
                <input type="checkbox" checked={!!f.Base_Points_Overridden}
                  onChange={(e) => {
                    set("Base_Points_Overridden")(e.target.checked);
                    if (e.target.checked && f.Manual_Base_Points == null) {
                      set("Manual_Base_Points")(f.Auto_Base_Points ?? 0);
                    }
                    if (!e.target.checked) set("Manual_Base_Points")(null);
                  }} />
                Override the calculated figure
              </label>
              <p className="hint">
                Counts toward the project&rsquo;s total design points. 0 is a valid override.
              </p>
            </div>
          </div>

          <p className="dm-label">Flags</p>
          <div className="dm-flags">
            <label className="inline">
              <input type="checkbox" checked={!!f.External_Design}
                onChange={(e) => set("External_Design")(e.target.checked)} />
              External design
            </label>
            <label className="inline">
              <input type="checkbox" checked={!!f.Carried_Forward}
                onChange={(e) => set("Carried_Forward")(e.target.checked)} />
              Carried forward
            </label>
          </div>
        </div>

        <div className="dm-foot">
          <button className="btn accent" disabled={saving} onClick={save}>
            {saving ? "Saving\u2026" : "Save design"}
          </button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>

          {/* Straight to this utility on the drawing, with the others put
              away. Someone reading an electric design wants to see the
              electric network, and reaching it meant opening the canvas,
              finding the project, then hiding four other utilities by
              hand.

              Unsaved edits are left behind, so it says so rather than
              discarding them quietly. */}
          <button className="btn ghost dm-gis"
            title="Open this project on the GIS canvas, showing only this utility"
            onClick={() => {
              if (dirty && !window.confirm(
                "Open the GIS design? Changes on this form will not be saved."
              )) return;
              openGis({ projectId, utilityId: design?.Utility_ID });
            }}>
            Open GIS design
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.dm-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 24px; }
.dm { background: var(--white); border-radius: 12px; width: 100%; max-width: 700px;
  max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
.dm-head { display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  border-top: 3px solid var(--muted); border-radius: 12px 12px 0 0; }
.dm-head h3 { margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.dm-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dm-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.dm-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 13px; }
.dm-body { padding: 16px 20px; overflow-y: auto; }
.dm-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  color: var(--accent); margin: 16px 0 8px; }
.dm-label:first-of-type { margin-top: 0; }
.dm-grid { display: flex; gap: 12px; flex-wrap: wrap; }
.dm-grid .fld { flex: 1; min-width: 150px; }
.dm-grid .fld.grow { flex: 2; }
.dm-grid .fld.w-sm { flex: none; width: 96px; }
.dm-grid .fld.w-date { flex: none; width: 158px; }
.dm-points { display: flex; gap: 12px; align-items: flex-start;
  background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
.dm-points .fld.w-sm { flex: none; width: 104px; }
.dm-arrow { align-self: center; color: var(--muted); font-size: 15px; padding-top: 14px; }
.dm-ovr { flex: 1; min-width: 200px; padding-top: 14px; }
.dm-flags { display: flex; gap: 22px; }
label.inline { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 5px; cursor: pointer; }
.late { border-color: #fca5a5 !important; background: #fef2f2 !important; }
.late-note { color: #b91c1c !important; }
.mono { font-family: ui-monospace, Menlo, monospace; }
.dm-foot { display: flex; gap: 9px; padding: 14px 20px; border-top: 1px solid var(--border); }
/* Pushed to the far end: it leaves the form, so it does not belong
   beside the buttons that act on it. */
.dm-gis { margin-left: auto; }
/* Sits under the fields it explains, not against them. The negative top
   margin this had pulled it into the selects above. */
.dm-hint { margin: 8px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.45; }
`;
