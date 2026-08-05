import { useState, useEffect } from "react";
import Field from "../../components/Field.jsx";
import Section from "../../components/Section.jsx";
import Select from "../../components/Select.jsx";
import Toggle from "../../components/Toggle.jsx";
import Banner from "../../components/Banner.jsx";
import StagePill from "../../components/StagePill.jsx";
import { getLookups } from "../../api/lookups.js";
import { getProject, updateProject } from "../../api/projects.js";
import { statusOptions as workflowOptions } from "../../lib/statusWorkflow.js";
import { listDevelopers } from "../../api/developers.js";
import {
  statusesForStage,
  STAGES,
} from "../../lib/constants.js";

const SITE_CSS = `
.site-row { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
.site-row .fld.grow { flex: 0.9; min-width: 120px; }
.site-row .fld.grow-wide { flex: 1.2; min-width: 150px; }
/* Sized to their content: "North West" and a six-figure grid reference */
.site-row /* Wide enough for the longest UK postcode with its space — eight
   characters — without taking room from the address beside it. */
.fld.w-postcode { flex: 0 0 120px; }
.fld.w-region { width: 152px; flex: none; }
.site-row .fld.w-coord { width: 104px; flex: none; }
.site-row.second { margin-bottom: 12px; }
.site-row .fld.w-count { width: 150px; flex: none; }
.dv-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; }
.dv { display: flex; align-items: center; gap: 12px; border: 1px solid var(--border);
  border-left: 3px solid var(--border); border-radius: var(--radius); padding: 9px 13px;
  min-width: 0; }
.dv.main { border-left-color: var(--accent); background: var(--accent-light); }
.dv-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dv-tag { margin-left: 8px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 6px; }
.dv-plots { font-size: 11.5px; font-weight: 700; color: var(--muted); background: var(--white);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; white-space: nowrap; }
.dv-none { font-size: 12.5px; color: var(--muted); font-style: italic; margin: 0; }
.dv-warn { font-size: 11.5px; color: #92400e; font-weight: 600; margin: 10px 0 0; }
.dv-note { font-size: 11px; color: var(--muted); margin: 8px 0 0; }
.pts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.pts-grid .span2 { grid-column: span 2; }
.pts-flag { margin-left: 7px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; background: var(--warn-bg); color: var(--warn-text);
  border: 1px solid var(--warn-border); border-radius: 4px; padding: 1px 6px; }
.pts-flag.warn { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
.pts-manual-row { display: flex; gap: 6px; align-items: center; }
.pts-manual-row input { flex: 1; min-width: 0; }
.pts-clear { flex: none; background: var(--bg); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px 11px; cursor: pointer; font: 600 12px inherit; color: var(--muted); }
.pts-clear:hover { background: var(--warn-bg); color: var(--warn-text); border-color: var(--warn-border); }
.pts-total { font-weight: 700; color: var(--accent); background: var(--accent-light) !important; }
.pts-total.pending { color: var(--warn-text); background: var(--warn-bg) !important;
  border-color: var(--warn-border) !important; }
.pts-row { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.pts-row .fld.w-pts { width: 132px; flex: none; }
.pts-row .pts-manual { color: var(--accent); font-weight: 700; }
.pts-row .pts-total { font-weight: 700; color: var(--accent);
  background: var(--accent-light) !important; }
.pts-row .pts-note { flex: 1; min-width: 220px; font-size: 11.5px; color: var(--muted);
  align-self: center; margin: 0; max-width: 46ch; }
@media (max-width: 900px) { .site-row { flex-wrap: wrap; } }
`;

export default function ProjectDetailsForm({ projectId, onSaved }) {
  const [lookups, setLookups] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [scopeDesigns, setScopeDesigns] = useState([]);
  const [devs, setDevs] = useState({ rows: [], counts: {}, unassigned: 0 });
  const [flash, setFlash] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([getLookups(), getProject(projectId), listDevelopers(projectId)])
      .then(([lk, proj, d]) => {
        if (!live) return;
        setLookups(lk);
        setDevs(d || { rows: [], counts: {}, unassigned: 0 });
        const { scopes: sc = [], ...rest } = proj;
        setScopeDesigns(sc);
        setF(rest);
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [projectId]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const before = f.Project_Status_ID;
      /* Auto_Plot_Count is derived, not stored — strip it before saving.

         Generated columns like Display_Ref are stripped at the endpoint
         instead, where the list of them belongs: every form posts the
         whole object back, and a rule kept in each of them is a rule
         that will be missed by the next one. */
      const { Auto_Plot_Count, ...payload } = f;
      await updateProject(f.Project_ID, payload);
      const fresh = await getProject(f.Project_ID);
      const { scopes: _ignored = [], ...rest } = fresh;
      setF(rest);
      /* Told upward, so the heading above the tabs shows the name that
         was just typed rather than the one it was opened with.

         The saved record rather than the draft: the database fills in
         Display_Ref and may normalise other fields, and the heading
         should show what was stored, not what was sent. */
      onSaved?.(rest);
      const promoted = String(rest.Project_Status_ID) !== String(before);
      setFlash(promoted ? "Saved \u2014 project moved to the Contract stage" : "Changes saved");
      setTimeout(() => setFlash(""), 2600);
    } catch (e) {
      setFlash(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Banner kind="error">Couldn&rsquo;t load this project: {loadError}</Banner>;
  if (!f || !lookups) return <div className="loading">Loading project&hellip;</div>;

  /* The status list follows the project's current stage. A tender offers the
     tender workflow through to Secured; choosing one of the Secured statuses
     fires the database trigger that promotes it, after which this dropdown
     shows the contract workflow instead. */
  const currentStatus = (lookups.projectStatuses || [])
    .find((s) => s.Project_Status_ID === Number(f.Project_Status_ID));
  const stage = currentStatus?.Stage ?? STAGES.TENDER;
  const isTenderStage = (x) => x === STAGES.TENDER;

  /* "Electric = 15, Gas = 1, Water = 1" — the original showed the working,
     which is the difference between a number you trust and one you query. */
  const baseUsed = f.Manual_Base_Points != null && f.Manual_Base_Points !== ""
    ? Number(f.Manual_Base_Points)
    : Number(f.Tender_Base_Points ?? 0);
  const liveTotal = Number(f.Total_Design_Points ?? 0) + baseUsed;
  const totalDiffers = Number(f.Tender_Total_Points ?? 0) !== liveTotal;

  const ruleBreakdown = Object.entries(f.Points_Breakdown || {})
    .map(([k, v]) => `${k} = ${v}`).join(", ");
  const designBreakdown = scopeDesigns
    .map((d) => {
      const u = (lookups.utilities || []).find((x) => x.Utility_ID === d.Utility_ID);
      const v = d.Base_Points_Overridden ? d.Manual_Base_Points : d.Auto_Base_Points;
      return u ? `${u.Utility} = ${v ?? 0}` : null;
    })
    .filter(Boolean).join(", ");
  const statusOptions = isTenderStage(stage)
    ? workflowOptions({
        statuses: lookups.projectStatuses || [],
        transitions: lookups.transitions || [],
        guards: lookups.guards || [],
        currentId: f.Project_Status_ID,
        quoteTypeId: f.Quote_Type_ID,
        ctx: { designs: scopeDesigns, plotCount: f.Auto_Plot_Count ?? 0 },
      })
    : statusesForStage(lookups.projectStatuses, stage).map((x) => ({ ...x, blocked: null }));
  const isTender = stage === STAGES.TENDER;
  const willPromote = isTender && /^secured/i.test(currentStatus?.Status ?? "");


  return (
    <div>
      <style>{SITE_CSS}</style>
      <div className="page-head">
        <div>
          <h2>Project details</h2>
          <p className="page-sub">
            One record from first enquiry onward. Contract-stage fields unlock once the
            project is Secured.
          </p>
        </div>
        <StagePill stage={stage} />
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}

      {willPromote && (
        <Banner kind="warn">
          Saving with <strong>{currentStatus.Status}</strong> will move this project to the
          Contract stage and stamp the secured date. That can&rsquo;t be undone from here.
        </Banner>
      )}

      <Section
        title="Developers"
        right={<span className="sec-note">{devs.rows.length}</span>}
      >
        {devs.rows.length === 0 ? (
          <p className="dv-none">
            No developers on this project &mdash; add them on the Stakeholders tab.
          </p>
        ) : (
          <>
            <div className="dv-list">
              {devs.rows.map((d) => {
                const b = (lookups.branches || []).find((x) => x.Branch_ID === d.Branch_ID);
                const n = devs.counts?.[d.Project_Developer_ID] || 0;
                return (
                  <div className={d.Is_Main ? "dv main" : "dv"} key={d.Project_Developer_ID}>
                    <span className="dv-name">
                      {b ? (b.Branch_Dropdown || b.Branch_Name) : "\u2014"}
                      {d.Is_Main && <span className="dv-tag">Main</span>}
                    </span>
                    <span className="dv-plots">{n} plot{n === 1 ? "" : "s"}</span>
                  </div>
                );
              })}
            </div>
            {devs.unassigned > 0 && (
              <p className="dv-warn">
                {devs.unassigned} plot{devs.unassigned === 1 ? " is" : "s are"} not assigned to a
                developer &mdash; set them on the Plots tab.
              </p>
            )}
            <p className="dv-note">Managed on the Stakeholders tab.</p>
          </>
        )}
      </Section>

      <Section title="Site">
        <div className="site-row">
          <div className="fld grow">
            <label>Site name</label>
            <input value={f.Site_Name || ""} onChange={(e) => set("Site_Name")(e.target.value)} />
          </div>
          <div className="fld grow-wide">
            <label>Site address</label>
            <input value={f.Site_Address || ""} onChange={(e) => set("Site_Address")(e.target.value)} />
          </div>
          {/* Beside the address it belongs to.

              It sat between Eastings and Northings, which split the
              coordinate pair as well as putting the postcode a long way
              from the address — two faults from one placement. */}
          <div className="fld w-postcode">
            <label>Postcode</label>
            <input className="mono" value={f.Postcode || ""}
              onChange={(e) => set("Postcode")(e.target.value.toUpperCase())} />
          </div>
          <div className="fld w-region">
            <label>Region</label>
            <Select
              value={f.Region_ID}
              onChange={(v) => { set("Region_ID")(v); set("Sub_Region_ID")(""); }}
            >
              <option value="">&mdash;</option>
              {(lookups.regions || []).map((r) => (
                <option key={r.Region_ID} value={r.Region_ID}>{r.Region}</option>
              ))}
            </Select>
          </div>
          <div className="fld w-region">
            <label>Sub region</label>
            <Select value={f.Sub_Region_ID} onChange={set("Sub_Region_ID")} disabled={!f.Region_ID}>
              <option value="">&mdash;</option>
              {(lookups.subRegions || [])
                .filter((sr) => String(sr.Region_ID) === String(f.Region_ID))
                .map((sr) => (
                  <option key={sr.Sub_Region_ID} value={sr.Sub_Region_ID}>{sr.Sub_Region}</option>
                ))}
            </Select>
          </div>
          <div className="fld w-coord">
            <label>Eastings</label>
            <input className="mono" value={f.Eastings ?? ""} onChange={(e) => set("Eastings")(e.target.value)} />
          </div>
          <div className="fld w-coord">
            <label>Northings</label>
            <input className="mono" value={f.Northings ?? ""} onChange={(e) => set("Northings")(e.target.value)} />
          </div>
        </div>


        <div className="site-row second">
          <div className="fld w-count">
            <label>Plot count</label>
            <input value={f.Auto_Plot_Count ?? ""} disabled />
            <p className="hint">Counted from plots</p>
          </div>
          <div className="fld w-count">
            <label>Min. plot call off</label>
            <input
              type="number"
              value={f.Minimum_Service_Call_Off ?? ""}
              onChange={(e) => set("Minimum_Service_Call_Off")(e.target.value)}
            />
          </div>
        </div>
      </Section>

      <Section title="Status">
        <div className="grid6">
          <Field label="Project status" span={2}>
            <Select value={f.Project_Status_ID} onChange={set("Project_Status_ID")}>
              {statusOptions.map((s) => (
                <option key={s.Project_Status_ID} value={s.Project_Status_ID}
                        disabled={!!s.blocked} title={s.blocked || undefined}>
                  {s.Status}{s.isCurrent ? " (no change)" : ""}{s.blocked ? " \uD83D\uDEAB" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stage" span={2} hint={isTender ? "Moves to Contract once Secured" : "Promoted from Tender"}>
            <input value={stage} disabled />
          </Field>
          <Field label="Secured date" span={2}>
            <input type="date" value={f.Secured_Date || ""}
              onChange={(e) => set("Secured_Date")(e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Points">
        <div className="pts-grid">
          <div className="fld">
            <label>Total design points (auto)</label>
            <input value={f.Total_Design_Points ?? ""} disabled />
            <p className="hint">
              Always calculated from the outline designs &mdash; not editable.
              {designBreakdown && <><br /><strong>{designBreakdown}</strong></>}
            </p>
          </div>

          <div className="fld">
            <label>Tender base points (auto)</label>
            <input value={f.Tender_Base_Points ?? ""} disabled />
            <p className="hint">
              From the plot count and which utilities are on this project.
              {ruleBreakdown && <><br /><strong>{ruleBreakdown}</strong></>}
            </p>
          </div>

          <div className="fld">
            <label>
              Tender base points (manual)
              {f.Manual_Base_Points != null && <span className="pts-flag">Manual</span>}
            </label>
            <div className="pts-manual-row">
              <input type="number" step="0.5" value={f.Manual_Base_Points ?? ""}
                placeholder={"\u2014"}
                onChange={(e) => set("Manual_Base_Points")(e.target.value === "" ? null : e.target.value)} />
              {f.Manual_Base_Points != null && (
                <button type="button" className="pts-clear"
                  onClick={() => set("Manual_Base_Points")(null)}>
                  Clear
                </button>
              )}
            </div>
            <p className="hint">
              Overrides the auto figure when set. <strong>0 is a valid override</strong> &mdash;
              use Clear to go back to the calculated value.
            </p>
          </div>

          <div className="fld">
            <label>
              Tender total points
              {totalDiffers && <span className="pts-flag">Unsaved</span>}
            </label>
            <input value={liveTotal} disabled
              className={totalDiffers ? "pts-total pending" : "pts-total"} />
            <p className="hint">
              {`Design ${f.Total_Design_Points ?? 0} + base ${
                f.Manual_Base_Points != null && f.Manual_Base_Points !== ""
                  ? `${f.Manual_Base_Points} (manual)`
                  : (f.Tender_Base_Points ?? 0)
              }`}
              {totalDiffers && <><br />Saves as {liveTotal}.</>}
            </p>
          </div>


          <div className="fld span2">
            <label>Reason for override</label>
            <input value={f.Points_Note || ""} placeholder="Why the score was adjusted"
              onChange={(e) => set("Points_Note")(e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="Quote">
        <div className="grid6">
          <Field label="Date sent" span={2} hint="When the quote went to the customer">
            <input type="date" value={f.Date_Sent || ""}
              onChange={(e) => set("Date_Sent")(e.target.value)} />
          </Field>
          <Field label="Quote type" span={2}>
            <Select value={f.Quote_Type_ID} onChange={set("Quote_Type_ID")}>
              <option value="">&mdash;</option>
              {(lookups.quoteTypes || []).map((q) => (
                <option key={q.Quote_Type_ID} value={q.Quote_Type_ID}>{q.Quote_Type}</option>
              ))}
            </Select>
          </Field>
          <Field label="I &amp; C" span={2}>
            <div className="toggle-row">
              <Toggle checked={!!f.I_and_C} onChange={set("I_and_C")} label="Industrial &amp; commercial" />
            </div>
          </Field>
        </div>
        <p className="hint">
          Quote values are held per outline design, since each is quoted and won separately.
        </p>
      </Section>

      <Section title="Award details">
        <div className="grid6">
          <Field label="Contract number" required span={2} hint="Must match the Audacia contract code">
            <input
              className="mono"
              value={f.Contract_Number || ""}
              onChange={(e) => set("Contract_Number")(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Date signed" required span={2}>
            <input type="date" value={f.Date_Signed || ""} onChange={(e) => set("Date_Signed")(e.target.value)} />
          </Field>
          

        </div>
      </Section>

      <Section title="Delivery options">
        <div className="grid6">
          <Field label="Mains &amp; services" span={2}>
            <div className="toggle-row">
              <Toggle checked={!!f.Lay_Only_MU} onChange={set("Lay_Only_MU")} label="Lay only" />
            </div>
          </Field>
        </div>
      </Section>

      <div className="actions">
        <button className="btn ghost" type="button">
          Cancel
        </button>
        <button className="btn accent" onClick={save} disabled={saving}>
          {saving ? "Saving\u2026" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
