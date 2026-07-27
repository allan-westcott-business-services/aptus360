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
@media (max-width: 900px) { .site-row { flex-wrap: wrap; } }
`;

export default function ProjectDetailsForm({ projectId }) {
  const [lookups, setLookups] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [scopeDesigns, setScopeDesigns] = useState([]);
  const [flash, setFlash] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([getLookups(), getProject(projectId)])
      .then(([lk, proj]) => {
        if (!live) return;
        setLookups(lk);
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

      <Section title="Customer">
        <div className="grid6">
          <Field label="Customer branch" span={3}>
            <Select value={f.Branch_ID} onChange={set("Branch_ID")}>
              <option value="">&mdash; None &mdash;</option>
              {(lookups.branches || []).map((b) => (
                <option key={b.Branch_ID} value={b.Branch_ID}>
                  {b.Branch_Dropdown || b.Branch_Name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
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
