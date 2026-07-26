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
  SCOPE_STATUSES,
  DESIGN_STATUSES,
  SCOPE_STATUS_SECURED,
  SCOPE_STATUS_LOST,
  DESIGN_STATUS_COMPLETE,
} from "../../lib/constants.js";
import { utilityById } from "../../lib/utilities.js";

export default function EditContractForm({ projectId = 4711 }) {
  const [lookups, setLookups] = useState(null);
  const [f, setF] = useState(null);
  const [scopes, setScopes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([getLookups(), getProject(projectId)])
      .then(([lk, proj]) => {
        if (!live) return;
        setLookups(lk);
        const { scopes: s = [], ...rest } = proj;
        setF(rest);
        setScopes(s);
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [projectId]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const setScope = (id, k, v) =>
    setScopes((p) => p.map((s) => (s.Project_Scope_ID === id ? { ...s, [k]: v } : s)));

  async function save() {
    setSaving(true);
    try {
      await updateProject(f.Project_ID, { ...f, scopes });
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

  const secured = scopes.filter((s) => s.Scope_Status_ID === SCOPE_STATUS_SECURED);
  const done = secured.filter((s) => s.Design_Status_ID === DESIGN_STATUS_COMPLETE);
  const goodToGo = secured.length > 0 && done.length === secured.length;
  const plotMismatch = Number(f.Audacia_Plot_Count) !== Number(f.Auto_Plot_Count);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            Edit contract <span className="ref mono">{f.Project_Ref}</span>
          </h2>
          <p className="page-sub">Same record as the tender &mdash; contract fields unlock at this stage.</p>
        </div>
        <StagePill stage={STAGES.CONTRACT} />
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}

      <Banner kind={goodToGo ? "ok" : "muted"}>
        <strong>Good to go:</strong>{" "}
        {goodToGo
          ? "all secured scopes have completed designs."
          : `${done.length} of ${secured.length} secured scopes have completed designs.`}{" "}
        <span className="derived">Derived &mdash; not editable</span>
      </Banner>

      <Section title="Contract details">
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
              {statusesForStage(STAGES.CONTRACT).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Audacia customer name" span={3}>
            <input
              value={f.Audacia_Customer_Name || ""}
              onChange={(e) => set("Audacia_Customer_Name")(e.target.value)}
            />
          </Field>
          <Field label="Plot count (Audacia)">
            <input
              type="number"
              value={f.Audacia_Plot_Count ?? ""}
              onChange={(e) => set("Audacia_Plot_Count")(e.target.value)}
            />
          </Field>
          <Field label="Plot count (Aptus)" hint="Counted from plots">
            <input value={f.Auto_Plot_Count ?? ""} disabled />
          </Field>
          <Field label="Min. plot call off">
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

      <Section
        title="Scopes"
        intro="Each scope carries its own commercial state, adopting operator and reference. Losing one leaves the rest untouched."
        right={
          <span className="sec-note">
            {secured.length} of {scopes.length} secured
          </span>
        }
      >
        <div className="scope-table">
          <div className="scope-th">
            <span>Scope</span>
            <span>Commercial</span>
            <span>Secured</span>
            <span>Design</span>
            <span>Adopting operator</span>
            <span>Reference</span>
          </div>
          {scopes.map((s) => {
            const u = utilityById(s.Utility_ID);
            const lost = s.Scope_Status_ID === SCOPE_STATUS_LOST;
            return (
              <div className={lost ? "scope-tr lost" : "scope-tr"} key={s.Project_Scope_ID}>
                <span className="scope-cell-name">
                  <span className="dot" style={{ background: u.colour }} />
                  {u.icon} {u.name}
                  {s.External_Design && <em className="ext">external</em>}
                </span>
                <Select
                  value={s.Scope_Status_ID}
                  onChange={(v) => setScope(s.Project_Scope_ID, "Scope_Status_ID", Number(v))}
                >
                  {SCOPE_STATUSES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </Select>
                <input
                  type="date"
                  value={s.Secured_Date || ""}
                  disabled={lost}
                  onChange={(e) => setScope(s.Project_Scope_ID, "Secured_Date", e.target.value)}
                />
                <Select
                  value={s.Design_Status_ID}
                  disabled={lost}
                  onChange={(v) => setScope(s.Project_Scope_ID, "Design_Status_ID", Number(v))}
                >
                  {DESIGN_STATUSES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={s.IDNO_ID ?? ""}
                  disabled={lost}
                  onChange={(v) => setScope(s.Project_Scope_ID, "IDNO_ID", v ? Number(v) : null)}
                >
                  <option value="">&mdash;</option>
                  {lookups.idnos.map((x) => (
                    <option key={x.IDNO_ID} value={x.IDNO_ID}>
                      {x.IDNO_Name}
                    </option>
                  ))}
                </Select>
                <input
                  className="mono"
                  placeholder="&mdash;"
                  value={s.Reference || ""}
                  disabled={lost}
                  onChange={(e) => setScope(s.Project_Scope_ID, "Reference", e.target.value)}
                />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Technical defaults">
        <div className="grid6">
          <Field label="Default heat source" span={2}>
            <Select value={f.Default_Plot_Heat_Source_ID} onChange={set("Default_Plot_Heat_Source_ID")}>
              {lookups.heatSources.map((x) => (
                <option key={x.Heat_Source_ID} value={x.Heat_Source_ID}>
                  {x.Heat_Source}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default heat pump model" span={2} hint="Plots with their own model override this">
            <Select value={f.Heat_Pump_Model_ID} onChange={set("Heat_Pump_Model_ID")}>
              {lookups.heatPumpModels.map((x) => (
                <option key={x.Heat_Pump_Model_ID} value={x.Heat_Pump_Model_ID}>
                  {x.Model}
                </option>
              ))}
            </Select>
          </Field>
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
