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
.site-row .fld.w-region { width: 152px; flex: none; }
.site-row .fld.w-coord { width: 104px; flex: none; }
.site-row.second { margin-bottom: 12px; }
.site-row .fld.w-count { width: 150px; flex: none; }
.dv-list { display: flex; flex-wrap: wrap; gap: 8px; }
.dv { display: flex; align-items: center; gap: 12px; border: 1px solid var(--border);
  border-left: 3px solid var(--border); border-radius: var(--radius); padding: 9px 13px;
  min-width: 260px; }
.dv.main { border-left-color: var(--accent); background: var(--accent-light); }
.dv-name { flex: 1; font-size: 13px; font-weight: 600; }
.dv-tag { margin-left: 8px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 6px; }
.dv-plots { font-size: 11.5px; font-weight: 700; color: var(--muted); background: var(--white);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; white-space: nowrap; }
.dv-none { font-size: 12.5px; color: var(--muted); font-style: italic; margin: 0; }
.dv-warn { font-size: 11.5px; color: #92400e; font-weight: 600; margin: 10px 0 0; }
.dv-note { font-size: 11px; color: var(--muted); margin: 8px 0 0; }
.pts-row { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.pts-row .fld.w-pts { width: 132px; flex: none; }
.pts-row .pts-manual { color: var(--accent); font-weight: 700; }
.pts-row .pts-total { font-weight: 700; color: var(--accent);
  background: var(--accent-light) !important; }
.pts-row .pts-total.overridden { color: #92400e; background: var(--warn-bg) !important;
  border-color: var(--warn-border) !important; }
.pts-note { flex: 1; min-width: 220px; font-size: 11.5px; color: var(--muted);
  align-self: center; margin: 0; max-width: 46ch; }
@media (max-width: 900px) { .site-row { flex-wrap: wrap; } }
`;

export default function ProjectDetailsForm({ projectId }) {
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
      /* Auto_Plot_Count is derived, not stored — strip it before saving. */
      const { Auto_Plot_Count, ...payload } = f;
      await updateProject(f.Project_ID, payload);
      const fresh = await getProject(f.Project_ID);
      const { scopes: _ignored = [], ...rest } = fresh;
      setF(rest);
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
        <div className="pts-row">
          <div className="fld w-pts">
            <label>Base points</label>
            <input value={f.Manual_Base_Points ?? f.Tender_Base_Points ?? ""} disabled
              className={f.Manual_Base_Points != null ? "pts-manual" : ""} />
            <p className="hint">
              {f.Manual_Base_Points != null ? "Overridden" : "From the plot count band"}
            </p>
          </div>
          <div className="fld w-pts">
            <label>Override</label>
            <input type="number" step="0.5" value={f.Manual_Base_Points ?? ""}
              placeholder="\u2014"
              onChange={(e) => set("Manual_Base_Points")(e.target.value === "" ? null : e.target.value)} />
            <p className="hint">Blank to use the band</p>
          </div>
          <div className="fld w-pts">
            <label>Total points</label>
            <input value={f.Tender_Total_Points ?? ""} disabled
              className={f.Manual_Total_Points != null ? "pts-total overridden" : "pts-total"} />
            <p className="hint">
              {f.Manual_Total_Points != null ? "Set manually" : "Base, rules and design points"}
            </p>
          </div>
          <div className="fld w-pts">
            <label>Override total</label>
            <input type="number" step="0.5" placeholder="\u2014"
              value={f.Manual_Total_Points ?? ""}
              onChange={(e) => set("Manual_Total_Points")(e.target.value === "" ? null : e.target.value)} />
            <p className="hint">Blank to calculate</p>
          </div>
          <div className="fld grow">
            <label>Reason</label>
            <input value={f.Points_Note || ""} placeholder="Why the score was adjusted"
              onChange={(e) => set("Points_Note")(e.target.value)} />
          </div>
          <p className="pts-note">
            Total is the base, each utility&rsquo;s rule and the outline design points.
            Overriding the total replaces all of that &mdash; worth noting why.
            Bands and rules live in Admin &rarr; Points Configuration.
          </p>
        </div>
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
