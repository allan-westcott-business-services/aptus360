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
import { addOptions } from "../../api/projectOptions.js";
import { statusesForStage, firstStatusForStage, peopleWithRole, ROLE, STAGES } from "../../lib/constants.js";

const REQUIRED = [
  ["Date_Received", "Date received"],
  ["Branch_Choice", "Customer branch"],
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
  Branch_Choice: "",
  Region_ID: "",
  Sub_Region_ID: "",
  Quote_Type_ID: "1",
  Project_Status_ID: "",
  BDD_KAM_ID: "",
  Estimator_ID: "",
  Site_Name: "",
  Site_Address: "",
  Postcode: "",
  I_and_C: false,
  Is_Priority: false,
  Notes: "",
});

export default function AddProjectForm({ onCreated, onGoToPlots, onReset }) {
  const [lookups, setLookups] = useState(null);
  const [f, setF] = useState(blank);
  const [scopes, setScopes] = useState([1, 2, 3]);
  /* How many parallel versions of this enquiry to quote. One means an
     ordinary project with no letter — a lone project is not "option A of
     one". Two or more turns it into 2607.004(A), (B) and so on. */
  const [options, setOptions] = useState(1);
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
        setF((p) => ({
          ...p,
          Project_Ref: p.Project_Ref || ref,
          Project_Status_ID: p.Project_Status_ID || firstStatusForStage(lk.projectStatuses, STAGES.TENDER),
          Quote_Type_ID: p.Quote_Type_ID || (lk.quoteTypes[0]?.Quote_Type_ID ?? ""),
        }));
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const quoteType = (id) => lookups?.quoteTypes.find((q) => q.Quote_Type_ID === Number(id));
  const quoteTypeIsBudget = (id) => quoteType(id)?.Is_Budget === true;
  const quoteTypeIsStreetLighting = (id) =>
    /street\s*lighting/i.test(quoteType(id)?.Quote_Type ?? "");

  const subRegions = useMemo(() => {
    if (!lookups) return [];
    return lookups.subRegions.filter((s) => !f.Region_ID || +s.Region_ID === +f.Region_ID);
  }, [lookups, f.Region_ID]);

  async function submit() {
    const miss = REQUIRED.filter(([k]) => !f[k]).map(([, l]) => l);
    if (!quoteTypeIsBudget(f.Quote_Type_ID) && scopes.length === 0) miss.push("At least one outline design");
    setErrors(miss);
    if (miss.length) return;

    setSaving(true);
    try {
      /* One table now, so a plain id. The prefix existed to say which of
         two branch tables a choice came from; the old one is no longer
         offered. Empty means nothing chosen, not branch nought —
         Number("") is 0, and 0 is a perfectly valid-looking id to write
         into a foreign key column. */
      const choice = String(f.Branch_Choice ?? "");
      const id = /^\d+$/.test(choice) ? Number(choice) : null;

      const result = await createProject({
        ...f,
        Branch_Choice: undefined,
        /* The old columns are written as null rather than left out.

           They are still on the table and still nullable, and every
           project was repointed off them on 26 Aug. Sending null says
           this project names an organisation branch and nothing else —
           where leaving them out would let a default or a trigger put
           something back, which is what a cached copy of the main
           developer is for. Dropping the columns is a separate
           decision. */
        Branch_ID: null,
        Organisation_Branch_ID: id,
        /* Customer_ID came off a Customer_Branch. An organisation's
           branch has no Customer to name, and inventing one would put a
           project under a customer nobody chose. */
        Customer_ID: null,
        /* ── The developer, not just the cached copy of it ──

           Project.Branch_ID and Customer_ID are a cached copy of the
           MAIN DEVELOPER, kept by sync_project_main_developer(). This
           form wrote the cache and nothing behind it, so a project came
           out naming a branch with no developer record — which is why
           the Details tab said "Developers 0" on a project that plainly
           had one, and why the Stakeholders tab was the only place the
           real thing could be entered.

           Sent with the project rather than added afterwards: a project
           that exists without its main developer is the state this is
           fixing, and a second call is a second chance to be left in
           it. */
        developer: id != null ? { Organisation_Branch_ID: id, Is_Main: true } : null,
        scopes: scopes.map((sid) => ({ Utility_ID: sid, Scope_Status_ID: 1 })),
      });

      /* Options are created after the project, not as part of it: each
         is a copy of what was just made, so there has to be something to
         copy first. Asking here rather than later means the set exists
         before anyone starts entering plots into one of them. */
      if (options > 1 && result?.Project_ID) {
        await addOptions(result.Project_ID, options - 1);
      }
      setSaved({ ...result, _options: options });
      if (onCreated) onCreated(result);
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSaved(null);
    setOptions(1);
    if (onReset) onReset();
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
          {scopes.length} outline design{scopes.length === 1 ? "" : "s"} added. It starts at Tender stage and can
          be promoted once secured.
        </p>
        <div className="done-actions">
          {onGoToPlots && (
            <button className="btn accent" onClick={onGoToPlots}>
              Add plots &rarr;
            </button>
          )}
          <button className="btn ghost" onClick={reset}>
            Add another project
          </button>
        </div>
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
          <Field label="Project ref" span={2} hint="Generated — edit if you need a specific ref">
            <input className="mono" value={f.Project_Ref} onChange={(e) => set("Project_Ref")(e.target.value)} />
          </Field>
          <Field label="Date received" required span={2}>
            <input type="date" value={f.Date_Received} onChange={(e) => set("Date_Received")(e.target.value)} />
          </Field>
          <Field label="KPI date" span={2}>
            <input type="date" value={f.KPI_Date} onChange={(e) => set("KPI_Date")(e.target.value)} />
          </Field>

          <Field label="Customer branch" required span={3}>
            {/* Housing developers, and only their branches.

                The list was every branch in both tables. Customer and
                Customer_Branch were emptied and their rows deleted on
                26 Aug — every project and developer repointed at the
                matching Organisation_Branch first — so there is one
                branch table now.

                Role-scoped rather than showing every organisation: the
                register holds IDNOs, DNOs, gas transporters, water
                undertakers, suppliers, subcontractors, fire and local
                authorities, and none of them is whose site this is. The
                one that is carries the 'customer' role, labelled
                "Customer (Housing Developer)".

                No prefix any more. Both tables were offered together
                and a bare number could not say which one a choice came
                from — the prefix undid that on save. One table, one
                sequence, one id. */}
            <Select value={f.Branch_Choice} onChange={set("Branch_Choice")}>
              <option value="">Select&hellip;</option>
              {(lookups.developerBranches || []).map((b) => (
                <option key={b.Organisation_Branch_ID} value={b.Organisation_Branch_ID}>
                  {b.Organisation_Name
                    ? `${b.Organisation_Name} \u2014 ${b.Branch_Dropdown || b.Branch_Name}`
                    : (b.Branch_Dropdown || b.Branch_Name)}
                </option>
              ))}
            </Select>
            {/* Said out loud, because an empty dropdown has two very
                different causes and they need different people to fix
                them: a role renamed in the register, or nobody having
                added a branch yet.

                Through the same `.hint` class every other note in this
                form uses. The first draft invented `.fld-warn`, which
                nothing in the stylesheet defines — an unstyled
                paragraph rendered as body text in the middle of a form,
                which is fault 12's shape: a rule that fails closed
                looks like a rule that was never written. */}
            {lookups.developerBranches_error && (
              <p className="hint">{lookups.developerBranches_error}</p>
            )}
            {!lookups.developerBranches_error
              && !(lookups.developerBranches || []).length && (
              <p className="hint">
                No housing developer has a branch yet &mdash; add one in
                Admin &rsaquo; Organisations.
              </p>
            )}
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
              {peopleWithRole(lookups.people, ROLE.BDD_KAM).map((p) => (
                <option key={p.Person_ID} value={p.Person_ID}>
                  {p.Person_Name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimator" required span={2}>
            <Select value={f.Estimator_ID} onChange={set("Estimator_ID")}>
              <option value="">Select&hellip;</option>
              {peopleWithRole(lookups.people, ROLE.ESTIMATOR).map((p) => (
                <option key={p.Person_ID} value={p.Person_ID}>
                  {p.Person_Name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" required span={2}>
            <Select value={f.Project_Status_ID} onChange={set("Project_Status_ID")}>
              {statusesForStage(lookups.projectStatuses, STAGES.TENDER).map((s) => (
                <option key={s.Project_Status_ID} value={s.Project_Status_ID}>
                  {s.Status}
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
        title="Design"
        intro="Pick the outline designs this project needs. Each can be quoted, won or lost on its own."
        right={<span className="sec-note">{quoteTypeIsBudget(f.Quote_Type_ID) ? "\u2014" : `${scopes.length} of 6 selected`}</span>}
      >
        <ScopePicker
          selected={scopes}
          isBudget={quoteTypeIsBudget(f.Quote_Type_ID)}
          isStreetLightingOnly={quoteTypeIsStreetLighting(f.Quote_Type_ID)}
          onToggle={(id) => setScopes((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
        />
      </Section>

      <Section
        title="Options"
        intro="Parallel versions of the same enquiry, quoted differently. Each starts as a copy of this one, lettered from A. Not the same as POC application options."
        right={<span className="sec-note">
          {options === 1 ? "No options" : `${options} \u2014 A to ${String.fromCharCode(64 + options)}`}
        </span>}
      >
        <div className="fld ap-opts">
          <label htmlFor="ap-options">How many options?</label>
          <input id="ap-options" type="number" min="1" max="26" value={options}
            onChange={(e) => setOptions(Math.max(1, Math.min(26, Number(e.target.value) || 1)))} />
          <p className="hint">
            {options === 1
              ? `${f.Project_Ref || "The project"} on its own.`
              : `${f.Project_Ref || "The project"}(A) through `
                + `${f.Project_Ref || ""}(${String.fromCharCode(64 + options)}), `
                + "each with the same plots, developers and designs. Add or remove any of them later."}
          </p>
        </div>
      </Section>

      <Section title="Notes">
        <textarea
          value={f.Notes}
          onChange={(e) => set("Notes")(e.target.value)}
          placeholder="Anything the estimator should know…"
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
