import { useState, useEffect, useMemo } from "react";
import Field from "../../components/Field.jsx";
import Section from "../../components/Section.jsx";
import Select from "../../components/Select.jsx";
import Toggle from "../../components/Toggle.jsx";
import Banner from "../../components/Banner.jsx";
import StagePill from "../../components/StagePill.jsx";
import ScopePicker from "./ScopePicker.jsx";
import { getLookups } from "../../api/lookups.js";
import { createProject, nextProjectRef } from "../../api/projects.js";
import { statusesForStage, STAGES } from "../../lib/constants.js";
import { isBudget } from "../../lib/utilities.js";

const REQUIRED = [
  ["Date_Received", "Date received"],
  ["Branch_ID", "Customer branch"],
  ["Region_ID", "Region"],
  ["Quote_Type_ID", "Quote type"],
  ["BDD_KAM_ID", "BDD / KAM"],
  ["Estimator_ID", "Estimator"],
  ["Project_Status_ID", "Status"],
];

const blank = () => ({
  Project_Ref: "",
  Date_Received: new Date().toISOString().slice(0, 10),
  KPI_Date: "",
  Branch_ID: "",
  Region_ID: "",
  Sub_Region_ID: "",
  Quote_Type_ID: "1",
  Project_Status_ID: "1",
  BDD_KAM_ID: "",
  Estimator_ID: "",
  Site_Name: "",
  Site_Address: "",
  Postcode: "",
  I_and_C: false,
  Is_Priority: false,
  Notes: "",
});

export default function AddProjectForm() {
  const [lookups, setLookups] = useState(null);
  const [f, setF] = useState(blank);
  const [scopes, setScopes] = useState([1, 2, 3]);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([getLookups(), nextProjectRef()])
      .then(([lk, ref]) => {
        if (!live) return;
        setLookups(lk);
        setF((p) => (p.Project_Ref ? p : { ...p, Project_Ref: ref }));
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const subRegions = useMemo(() => {
    if (!lookups) return [];
    return lookups.subRegions.filter((s) => !f.Region_ID || +s.Region_ID === +f.Region_ID);
  }, [lookups, f.Region_ID]);

  async function submit() {
    const miss = REQUIRED.filter(([k]) => !f[k]).map(([, l]) => l);
    if (!isBudget(f.Quote_Type_ID) && scopes.length === 0) miss.push("At least one scope");
    setErrors(miss);
    if (miss.length) return;

    setSaving(true);
    try {
      const branch = lookups.branches.find((b) => +b.Branch_ID === +f.Branch_ID);
      const result = await createProject({
        ...f,
        Customer_ID: branch ? branch.Customer_ID : null,
        scopes: scopes.map((id) => ({ Utility_ID: id, Scope_Status_ID: 1 })),
      });
      setSaved(result);
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSaved(null);
    setScopes([1, 2, 3]);
    setErrors([]);
    nextProjectRef().then((ref) => setF({ ...blank(), Project_Ref: ref }));
  }

  if (loadError) return <Banner kind="error">Couldn&rsquo;t load reference data: {loadError}</Banner>;
  if (!lookups) return <div className="loading">Loading reference data&hellip;</div>;

  if (saved) {
    return (
      <div className="done">
        <div className="done-tick">&#10003;</div>
        <h3>Project {saved.Project_Ref} created</h3>
        <p>
          {scopes.length} scope{scopes.length === 1 ? "" : "s"} added. It starts at Tender stage and can
          be promoted once secured.
        </p>
        <button className="btn accent" onClick={reset}>
          Add another project
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Add project</h2>
          <p className="page-sub">
            A project is the enquiry. It stays one record from first enquiry through to contract.
          </p>
        </div>
        <StagePill stage={STAGES.TENDER} />
      </div>

      {errors.length > 0 && (
        <Banner kind="error">
          <strong>Complete these fields:</strong> {errors.join(", ")}
        </Banner>
      )}

      <Section title="Project details">
        <div className="grid6">
          <Field label="Project ref" span={2} hint="Generated \u2014 edit if you need a specific ref">
            <input className="mono" value={f.Project_Ref} onChange={(e) => set("Project_Ref")(e.target.value)} />
          </Field>
          <Field label="Date received" required span={2}>
            <input type="date" value={f.Date_Received} onChange={(e) => set("Date_Received")(e.target.value)} />
          </Field>
          <Field label="KPI date" span={2}>
            <input type="date" value={f.KPI_Date} onChange={(e) => set("KPI_Date")(e.target.value)} />
          </Field>

          <Field label="Customer branch" required span={3}>
            <Select value={f.Branch_ID} onChange={set("Branch_ID")}>
              <option value="">Select&hellip;</option>
              {lookups.branches.map((b) => (
                <option key={b.Branch_ID} value={b.Branch_ID}>
                  {b.Branch_Name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Region" required span={2}>
            <Select
              value={f.Region_ID}
              onChange={(v) => {
                set("Region_ID")(v);
                set("Sub_Region_ID")("");
              }}
            >
              <option value="">Select&hellip;</option>
              {lookups.regions.map((r) => (
                <option key={r.Region_ID} value={r.Region_ID}>
                  {r.Region}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sub region">
            <Select value={f.Sub_Region_ID} onChange={set("Sub_Region_ID")} disabled={!f.Region_ID}>
              <option value="">&mdash;</option>
              {subRegions.map((s) => (
                <option key={s.Sub_Region_ID} value={s.Sub_Region_ID}>
                  {s.Sub_Region}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Quote type" required span={2}>
            <Select value={f.Quote_Type_ID} onChange={set("Quote_Type_ID")}>
              {lookups.quoteTypes.map((q) => (
                <option key={q.Quote_Type_ID} value={q.Quote_Type_ID}>
                  {q.Quote_Type}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="BDD / KAM" required span={2}>
            <Select value={f.BDD_KAM_ID} onChange={set("BDD_KAM_ID")}>
              <option value="">Select&hellip;</option>
              {lookups.people.map((p) => (
                <option key={p.Person_ID} value={p.Person_ID}>
                  {p.Person_Name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimator" required span={2}>
            <Select value={f.Estimator_ID} onChange={set("Estimator_ID")}>
              <option value="">Select&hellip;</option>
              {lookups.people.map((p) => (
                <option key={p.Person_ID} value={p.Person_ID}>
                  {p.Person_Name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" required span={2}>
            <Select value={f.Project_Status_ID} onChange={set("Project_Status_ID")}>
              {statusesForStage(STAGES.TENDER).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Flags" span={4}>
            <div className="toggle-row">
              <Toggle checked={f.I_and_C} onChange={set("I_and_C")} label="I &amp; C" />
              <Toggle checked={f.Is_Priority} onChange={set("Is_Priority")} label="Priority" />
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Site">
        <div className="grid6">
          <Field label="Site name" span={3}>
            <input value={f.Site_Name} onChange={(e) => set("Site_Name")(e.target.value)} placeholder="e.g. Kirkstall Meadows" />
          </Field>
          <Field label="Site address" span={2}>
            <input value={f.Site_Address} onChange={(e) => set("Site_Address")(e.target.value)} />
          </Field>
          <Field label="Postcode">
            <input className="mono" value={f.Postcode} onChange={(e) => set("Postcode")(e.target.value.toUpperCase())} />
          </Field>
        </div>
      </Section>

      <Section
        title="Scope"
        intro="Pick the designs this project needs. Each becomes a scope that can be quoted, won or lost on its own."
        right={<span className="sec-note">{isBudget(f.Quote_Type_ID) ? "\u2014" : `${scopes.length} of 6 selected`}</span>}
      >
        <ScopePicker
          selected={scopes}
          quoteTypeId={f.Quote_Type_ID}
          onToggle={(id) => setScopes((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
        />
      </Section>

      <Section title="Notes">
        <textarea
          value={f.Notes}
          onChange={(e) => set("Notes")(e.target.value)}
          placeholder="Anything the estimator should know\u2026"
        />
      </Section>

      <div className="actions">
        <button className="btn ghost" type="button">
          Cancel
        </button>
        <button className="btn accent" onClick={submit} disabled={saving}>
          {saving ? "Creating\u2026" : "Create project"}
        </button>
      </div>
    </div>
  );
}
