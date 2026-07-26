import { useState, useEffect } from "react";
import Field from "../../components/Field.jsx";
import Section from "../../components/Section.jsx";
import Select from "../../components/Select.jsx";
import Toggle from "../../components/Toggle.jsx";
import Banner from "../../components/Banner.jsx";
import StagePill from "../../components/StagePill.jsx";
import { getLookups } from "../../api/lookups.js";
import { getProject, updateProject } from "../../api/projects.js";
import {
  statusesForStage,
  STAGES,
} from "../../lib/constants.js";

export default function ProjectDetailsForm({ projectId }) {
  const [lookups, setLookups] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([getLookups(), getProject(projectId)])
      .then(([lk, proj]) => {
        if (!live) return;
        setLookups(lk);
        const { scopes: _ignored = [], ...rest } = proj;
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
      await updateProject(f.Project_ID, f);
      setFlash("Changes saved");
      setTimeout(() => setFlash(""), 2600);
    } catch (e) {
      setFlash(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Banner kind="error">Couldn&rsquo;t load this project: {loadError}</Banner>;
  if (!f || !lookups) return <div className="loading">Loading project&hellip;</div>;

  const plotMismatch = Number(f.Audacia_Plot_Count) !== Number(f.Auto_Plot_Count);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Project details</h2>
          <p className="page-sub">
            One record from first enquiry onward. Contract-stage fields unlock once the
            project is Secured.
          </p>
        </div>
        <StagePill stage={STAGES.CONTRACT} />
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}

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
          <Field label="Status" span={2}>
            <Select value={f.Project_Status_ID} onChange={set("Project_Status_ID")}>
              {statusesForStage(lookups.projectStatuses, STAGES.CONTRACT).map((s) => (
                <option key={s.Project_Status_ID} value={s.Project_Status_ID}>
                  {s.Status}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Plot count (Audacia)" span={2}>
            <input
              type="number"
              value={f.Audacia_Plot_Count ?? ""}
              onChange={(e) => set("Audacia_Plot_Count")(e.target.value)}
            />
          </Field>
          <Field label="Plot count (Aptus)" span={2} hint="Counted from plots">
            <input value={f.Auto_Plot_Count ?? ""} disabled />
          </Field>
          <Field label="Min. plot call off" span={2}>
            <input
              type="number"
              value={f.Minimum_Service_Call_Off ?? ""}
              onChange={(e) => set("Minimum_Service_Call_Off")(e.target.value)}
            />
          </Field>
        </div>
        {plotMismatch && (
          <Banner kind="warn">
            Plot counts disagree &mdash; Audacia has {f.Audacia_Plot_Count}, Aptus has {f.Auto_Plot_Count}.
          </Banner>
        )}
      </Section>

      <Section title="Site">
        <div className="grid6">
          <Field label="Site name" span={3}>
            <input value={f.Site_Name || ""} onChange={(e) => set("Site_Name")(e.target.value)} />
          </Field>
          <Field label="Site address" span={3}>
            <input value={f.Site_Address || ""} onChange={(e) => set("Site_Address")(e.target.value)} />
          </Field>
          <Field label="Region" span={2}>
            <Select value={f.Region_ID} onChange={set("Region_ID")}>
              {lookups.regions.map((r) => (
                <option key={r.Region_ID} value={r.Region_ID}>
                  {r.Region}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fire authority" span={2}>
            <Select value={f.Fire_Service_ID} onChange={set("Fire_Service_ID")}>
              <option value="">&mdash;</option>
              {lookups.fireServices.map((x) => (
                <option key={x.Fire_Service_ID} value={x.Fire_Service_ID}>
                  {x.Fire_Service_Name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Eastings">
            <input className="mono" value={f.Eastings ?? ""} onChange={(e) => set("Eastings")(e.target.value)} />
          </Field>
          <Field label="Northings">
            <input className="mono" value={f.Northings ?? ""} onChange={(e) => set("Northings")(e.target.value)} />
          </Field>
          <Field label="Site contact" span={3}>
            <input value={f.Site_Contact || ""} onChange={(e) => set("Site_Contact")(e.target.value)} />
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
