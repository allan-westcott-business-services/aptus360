import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import Field from "../../components/Field.jsx";
import Section from "../../components/Section.jsx";
import Select from "../../components/Select.jsx";
import { getLookups } from "../../api/lookups.js";
import { getProject, updateProject } from "../../api/projects.js";
import { listContacts, saveContact, deleteContact } from "../../api/stakeholders.js";
import { updateScope } from "../../api/scopes.js";
import { utilityById } from "../../lib/utilities.js";
import DevelopersSection from "./DevelopersSection.jsx";

/* Everyone outside Aptus with a stake in the site: the authorities that
   have to be satisfied, and the developer's own people. */
/* What the network operator is called on each utility.

   They are different trades with different names, and the field said
   "DNO" on all three. That was true of electricity and wrong of the
   others: a gas transporter is not a distribution network operator, and
   the picker now offers Cadent under a heading that says it is one.

   Worth getting right rather than approximately right, because these
   are the words on the paperwork somebody sends out. */
const OPERATOR_WORD = {
  electric: "DNO",
  gas: "Gas Transporter",
  water: "Water Undertaker",
};

/* Which role belongs in each utility's picker.

   The incumbent network operator, and only that: the DNO on electricity,
   the gas transporter, the water undertaker. One role each.

   ── Not the independents ──

   An IDNO, an IGT or an IWU is an adopting operator, which is a
   different question with a different answer and its own field. Offering
   them here made the list several times longer than it should be and
   invited somebody to name GTC where Cadent belongs — and the two are
   not interchangeable on any document that follows.

   ── Both halves still matter ──

   The role says what sort of company it is, the utility says where it
   works. A company holding the role but not marked as covering the
   utility is one somebody has not finished setting up; one covering the
   utility without the role is the wrong sort of company entirely. */
const OPERATOR_ROLES = {
  electric: ["dno"],
  gas: ["gt"],
  water: ["wu"],
};

const rolesFor = (utility) =>
  OPERATOR_ROLES[String(utility || "").toLowerCase().trim()] ?? null;

/* Every role in that map, flattened. What counts as an operator at all,
   as against a customer or an authority — the view already excludes
   those, and this keeps the list honest if it ever stops. */
const OPERATOR_ROLE_KEYS = [...new Set(Object.values(OPERATOR_ROLES).flat())];

const operatorWord = (utility) =>
  OPERATOR_WORD[String(utility || "").toLowerCase().trim()] ?? "operator";

/* "Electric DNO", "Gas Transporter", "Water Undertaker".

   Electricity keeps its utility in front because "DNO" alone does not
   say which network. The other two carry it already. */
function operatorLabel(utility) {
  const word = operatorWord(utility);
  if (word === "DNO") return `${utility ?? "Utility"} DNO`;
  if (word === "operator") return `${utility ?? "Utility"} operator`;
  return word;
}

export default function StakeholderTab({ projectId }) {
  const [lookups, setLookups] = useState(null);
  const [f, setF] = useState(null);
  const [saved, setSaved] = useState({});
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(blankContact());
  const [editingId, setEditingId] = useState(null);
  /* The project's utilities, one scope row each, which is where the DNO
     for that utility is recorded. */
  const [scopes, setScopes] = useState([]);
  const [savingDno, setSavingDno] = useState(null);

  function blankContact() {
    return { Contact_Name: "", Job_Title: "", Telephone: "", Email: "", Is_Primary: false };
  }

  async function load() {
    try {
      const [lk, proj, cs] = await Promise.all([
        getLookups(), getProject(projectId), listContacts(projectId),
      ]);
      setLookups(lk);
      const picked = {
        Fire_Service_ID: proj.Fire_Service_ID ?? "",
        Town_Council_ID: proj.Town_Council_ID ?? "",
        County_Council_ID: proj.County_Council_ID ?? "",
      };
      setF(picked);
      setSaved(picked);
      setContacts(cs.rows || []);
      setScopes(proj.scopes || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const dirty = f && Object.keys(f).some((k) => String(f[k]) !== String(saved[k]));

  async function saveAuthorities() {
    setSaving(true);
    try {
      await updateProject(projectId, {
        Fire_Service_ID: f.Fire_Service_ID || null,
        Town_Council_ID: f.Town_Council_ID || null,
        County_Council_ID: f.County_Council_ID || null,
      });
      setSaved({ ...f });
      setFlash("Authorities saved");
      setTimeout(() => setFlash(""), 2400);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  /* ── The DNO for one utility ──

     Written on the spot rather than gathered behind a Save button: it
     is one field per utility and there are three of them, and a Save
     that covers a form somebody has already left is how a change goes
     missing.

     Stored on Project_Scope, which is already one row per project per
     utility — so a scheme doing electric and water has two rows and
     therefore two DNOs, and this list is however many utilities the
     project has rather than three fixed fields. */
  async function setDno(scope, organisationId) {
    setSavingDno(scope.Project_Scope_ID);
    try {
      await updateScope(scope.Project_Scope_ID, {
        DNO_Organisation_ID: organisationId || null,
      });
      setScopes((xs) => xs.map((x) =>
        Number(x.Project_Scope_ID) === Number(scope.Project_Scope_ID)
          ? { ...x, DNO_Organisation_ID: organisationId || null } : x));
      setFlash("DNO saved");
      setTimeout(() => setFlash(""), 2400);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setSavingDno(null); }
  }

  async function submitContact() {
    if (!draft.Contact_Name.trim()) return setError("A contact needs a name.");
    try {
      await saveContact(projectId, { ...draft, Contact_Name: draft.Contact_Name.trim() }, editingId);
      setDraft(blankContact());
      setEditingId(null);
      setError("");
      await load();
    } catch (e) { setError(e.message); }
  }

  async function removeContact(c) {
    if (!window.confirm(`Delete ${c.Contact_Name}?`)) return;
    try { await deleteContact(projectId, c.Project_Contact_ID); await load(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading stakeholders&hellip;</div>;

  const authorities = lookups?.localAuthorities || [];
  /* ── Which councils go in which dropdown ──

     A county council sits above districts; a unitary has nothing above
     it and does both jobs, so it belongs in both lists. Scotland, Wales
     and Northern Ireland have no county tier at all, and their councils
     are single-tier — which is why they sit with the unitaries rather
     than being forced into one box or the other.

     Named by subtype rather than worked out from the name: "Durham
     County Council" and "County Durham" are the same body spelled two
     ways, and a rule reading the name would get one of them wrong. */
  const COUNTY_TIER = ["county_council"];
  const TOWN_TIER = ["district_council", "borough_council", "city_council"];
  /* Single-tier: does both jobs, so appears in both lists. */
  const SINGLE_TIER = ["unitary", "met_borough", "london_borough",
    "council_area", "principal_council", "ni_district", "sui_generis"];

  /* Gone, or going, is not the same as gone yet. A council past its
     abolition date is not offered — England is mid-reorganisation and
     172 of these disappear in April 2028 — but a project that already
     names one keeps it, because this filters what is offered and not
     what is stored. */
  const today = new Date().toISOString().slice(0, 10);
  const councils = (lookups?.councils || [])
    .filter((c) => !c.Abolition_Date || c.Abolition_Date > today);

  const inTier = (keys) => councils.filter((c) => keys.includes(c.Subtype_Key));
  const towns = [...inTier(TOWN_TIER), ...inTier(SINGLE_TIER)]
    .sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
  const counties = [...inTier(COUNTY_TIER), ...inTier(SINGLE_TIER)]
    .sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
  const detailFor = (id) => councils.find((a) =>
    String(a.Organisation_ID) === String(id));
  const fire = (lookups?.fireServices || []).find((x) => String(x.Fire_Service_ID) === String(f.Fire_Service_ID));

  return (
    <div>
      <style>{CSS}</style>
      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      <DevelopersSection projectId={projectId} />

      <DnoSection scopes={scopes} lookups={lookups} onSet={setDno} saving={savingDno} />

      <Section
        title="Authorities"
        right={dirty && (
          <button className="btn accent sm" disabled={saving} onClick={saveAuthorities}>
            {saving ? "Saving\u2026" : "Save authorities"}
          </button>
        )}
      >
        <div className="auth-grid">
          <Field label="Fire authority">
            <Select value={f.Fire_Service_ID} onChange={set("Fire_Service_ID")}>
              <option value="">&mdash; None &mdash;</option>
              {(lookups.fireServices || []).map((x) => (
                <option key={x.Fire_Service_ID} value={x.Fire_Service_ID}>{x.Fire_Service_Name}</option>
              ))}
            </Select>
            {fire && <p className="auth-note">Hydrant approvals and access</p>}
          </Field>

          <Field label="Town council">
            <Select value={f.Town_Council_ID} onChange={set("Town_Council_ID")}>
              <option value="">&mdash; None &mdash;</option>
              {towns.map((a) => (
                <option key={a.Organisation_ID} value={a.Organisation_ID}>
                  {a.Name}
                </option>
              ))}
            </Select>
            <AuthorityNote a={detailFor(f.Town_Council_ID)} />
          </Field>

          <Field label="County council">
            <Select value={f.County_Council_ID} onChange={set("County_Council_ID")}>
              <option value="">&mdash; None &mdash;</option>
              {counties.map((a) => (
                <option key={a.Organisation_ID} value={a.Organisation_ID}>
                  {a.Name}
                </option>
              ))}
            </Select>
            <AuthorityNote a={detailFor(f.County_Council_ID)} />
          </Field>
        </div>
        {councils.length === 0 && (
          <p className="hint">
            No councils on the register &mdash; add them in Admin &rarr;
            Organisations, as a Local Authority.
          </p>
        )}
      </Section>

      <Section title="Developer contacts" right={<span className="sec-note">{contacts.length}</span>}>
        <div className="contact-form">
          <div className="cf-grid">
            <div className="fld"><label>Name <span className="req">*</span></label>
              <input value={draft.Contact_Name}
                onChange={(e) => setDraft((d) => ({ ...d, Contact_Name: e.target.value }))} /></div>
            <div className="fld"><label>Job title</label>
              <input value={draft.Job_Title}
                onChange={(e) => setDraft((d) => ({ ...d, Job_Title: e.target.value }))} /></div>
            <div className="fld w-tel"><label>Telephone</label>
              <input value={draft.Telephone}
                onChange={(e) => setDraft((d) => ({ ...d, Telephone: e.target.value }))} /></div>
            <div className="fld"><label>Email</label>
              <input type="email" value={draft.Email}
                onChange={(e) => setDraft((d) => ({ ...d, Email: e.target.value }))} /></div>
            <div className="fld w-btn">
              <label className="inline">
                <input type="checkbox" checked={draft.Is_Primary}
                  onChange={(e) => setDraft((d) => ({ ...d, Is_Primary: e.target.checked }))} />
                Primary
              </label>
              <div className="cf-btns">
                <button className="btn accent sm" onClick={submitContact}>
                  {editingId ? "Save" : "+ Add"}
                </button>
                {editingId && (
                  <button className="btn ghost sm"
                    onClick={() => { setEditingId(null); setDraft(blankContact()); }}>Cancel</button>
                )}
              </div>
            </div>
          </div>
        </div>

        {contacts.length === 0 ? (
          <p className="hint">No developer contacts recorded yet.</p>
        ) : (
          <div className="contact-list">
            {contacts.map((c) => (
              <div className={c.Is_Primary ? "contact primary" : "contact"} key={c.Project_Contact_ID}>
                <div className="c-main">
                  <span className="c-name">
                    {c.Contact_Name}
                    {c.Is_Primary && <span className="tag">Primary</span>}
                  </span>
                  {c.Job_Title && <span className="c-role">{c.Job_Title}</span>}
                </div>
                <div className="c-reach">
                  {c.Telephone && <a href={`tel:${c.Telephone}`} className="c-link">&#9742; {c.Telephone}</a>}
                  {c.Email && <a href={`mailto:${c.Email}`} className="c-link">&#9993; {c.Email}</a>}
                </div>
                <div className="c-act">
                  <button className="btn edit sm"
                    onClick={() => { setEditingId(c.Project_Contact_ID); setDraft({ ...blankContact(), ...c }); }}>
                    Edit
                  </button>
                  <button className="btn delete sm" onClick={() => removeContact(c)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* The distribution operator for each utility on this project.

   ── Why here ──

   A DNO is an outside organisation with a stake in the site, which is
   what this tab is for. It was on the outline design modal, two clicks
   further in and beside the adopting operator — a reasonable place for
   a design decision and the wrong one for a fact about who the site
   connects to.

   One place, not two. The same column edited on two screens is how a
   record ends up disagreeing with itself, so it has moved rather than
   been copied.

   ── Only that utility's DNOs ──

   Filtered by the utility the scope belongs to, from Organisation_Utility
   by way of the Operator_Utility view: the water design must not offer
   the electric DNO. Anything already saved stays in its own list even
   if it would not qualify, so a project set up before this rule shows
   what it holds instead of appearing empty.

   An operator with no utilities assigned cannot be placed, so it is not
   offered — but the count is shown, because a name missing from a
   dropdown with no explanation is exactly the fault this fixes. */
function DnoSection({ scopes, lookups, onSet, saving }) {
  /* Every operator, narrowed per utility below.

     This filtered to the dno role here, before the per-utility rules
     ran — so a gas transporter and a water undertaker were discarded on
     the way in, and each field then reported that none had been set up.
     Which was true of the list it had been given, and false of the
     register.

     The narrowing belongs below, where the utility is known: gas wants
     gt and igt, water wants wu and iwu, and only electricity wants dno.
     A filter here can only ever be right for one of the three. */
  const operators = (lookups?.operators || [])
    .filter((o) => (o.role_keys || []).some((k) =>
      OPERATOR_ROLE_KEYS.includes(String(k).toLowerCase())));
  const unassigned = operators.filter((o) => !(o.utility_ids || []).length).length;

  if (!scopes.length) {
    return (
      <Section title="Distribution operators">
        <p className="dno-none">
          This project has no utilities yet. Add them on the Outline Designs tab
          and each one can be given its DNO here.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Distribution operators">
      <div className="auth-grid">
        {scopes.map((sc) => {
          const utility = utilityById(sc.Utility_ID);
          const roles = rolesFor(utility?.name);
          /* Holds the right role for this utility. A utility nobody has
             named roles for offers every operator, which is the old
             behaviour and the safe fallback. */
          const rightRole = (o) => !roles
            || (o.role_keys || []).some((k) => roles.includes(k));
          const covers = (o) => (o.utility_ids || [])
            .some((x) => Number(x) === Number(sc.Utility_ID));

          const forThis = operators.filter((o) =>
            (rightRole(o) && covers(o))
            /* Whoever is already chosen stays in the list, whatever the
               rules say now. Otherwise changing the roles would empty a
               field that has a perfectly good answer in it, and the
               screen would show None over a saved value. */
            || Number(o.Organisation_ID) === Number(sc.DNO_Organisation_ID));

          /* Which of the two things is missing, so the message can say
             something somebody can act on. */
          const anyWithRole = operators.some(rightRole);
          return (
            <Field key={sc.Project_Scope_ID} label={operatorLabel(utility?.name)}>
              <Select value={sc.DNO_Organisation_ID ?? ""}
                disabled={saving === sc.Project_Scope_ID}
                onChange={(v) => onSet(sc, v ? Number(v) : null)}>
                <option value="">&mdash; None &mdash;</option>
                {forThis.map((o) => (
                  <option key={o.Organisation_ID} value={o.Organisation_ID}>{o.Name}</option>
                ))}
              </Select>
              {!forThis.length && (
                <p className="dno-note">
                  {/* Naming the gap rather than restating the field.

                      "No Gas Transporter is marked as working in this
                      utility" said nothing: a gas transporter works in
                      gas by definition. What is actually wrong is one
                      of two things, and they have different fixes. */}
                  {anyWithRole
                    ? `Set which utilities each ${operatorWord(utility?.name)} `
                      + "covers in Admin \u203a Organisations."
                    : `No ${operatorWord(utility?.name)} has been set up yet `
                      + "\u2014 add one in Admin \u203a Organisations."}
                </p>
              )}
            </Field>
          );
        })}
      </div>
      {unassigned > 0 && (
        <p className="dno-note">
          {unassigned} DNO(s) are not offered because no utilities are assigned
          to them.
        </p>
      )}
    </Section>
  );
}

/* What is known about the council somebody has picked.

   Contacts came from the old Local_Authority table and are still shown
   where an organisation has them. What a council reliably has is its
   kind and its nation, which say something useful on their own: a
   Metropolitan Borough and a County Council are not the same body to
   deal with.

   And where it is going. 172 of these councils cease to exist in April
   2028, and a project running into 2029 wants that visible at the
   moment it is chosen rather than discovered later. */
function AuthorityNote({ a }) {
  if (!a) return null;

  const bits = [
    a.trade_label,
    a.Nation && a.Nation !== "England" ? a.Nation : null,
    a.Contact_Name, a.Telephone, a.Email,
  ].filter(Boolean);

  const going = a.Abolition_Date
    ? `Ceases ${String(a.Abolition_Date).split("-").reverse().join("/")}`
    : null;

  if (!bits.length && !going) return null;
  return (
    <>
      {!!bits.length && <p className="auth-note">{bits.join(" \u00B7 ")}</p>}
      {going && <p className="auth-going">{going}</p>}
    </>
  );
}

const CSS = `
.dno-note { margin: 4px 0 0; font-size: 11px; color: #b45309; font-weight: 600; }
.dno-none { font-size: 12.5px; color: var(--muted); margin: 0; }
.auth-grid { display: grid; grid-template-columns: repeat(3, minmax(200px, 1fr)); gap: 14px; }
.auth-note { font-size: 11px; color: var(--muted); margin: 4px 0 0; }
/* When a council stops existing. Amber rather than grey: it is a thing
   to notice at the moment of choosing, not a footnote. */
.auth-going { font-size: 11px; color: #7c4a03; margin: 2px 0 0; font-weight: 600; }
.btn.sm { padding: 4px 12px; font-size: 11.5px; }
.contact-form { border: 1px solid var(--border); border-radius: var(--radius);
  background: #f8f9fb; padding: 12px; margin-bottom: 12px; }
.cf-grid { display: grid; grid-template-columns: 1.1fr 1fr 150px 1.3fr auto; gap: 10px; align-items: end; }
.cf-grid .w-tel input { font-family: ui-monospace, Menlo, monospace; }
.cf-btns { display: flex; gap: 6px; }
label.inline { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 6px; cursor: pointer; }
.contact-list { display: flex; flex-direction: column; gap: 6px; }
.contact { display: flex; align-items: center; gap: 14px; border: 1px solid var(--border);
  border-left: 3px solid var(--border); border-radius: var(--radius); padding: 10px 13px; }
.contact.primary { border-left-color: var(--accent); background: var(--accent-light); }
.c-main { min-width: 190px; }
.c-name { display: block; font-size: 13px; font-weight: 700; }
.c-role { font-size: 11.5px; color: var(--muted); }
.c-reach { flex: 1; display: flex; flex-wrap: wrap; gap: 14px; }
.c-link { font-size: 12.5px; color: var(--accent); text-decoration: none; }
.c-link:hover { text-decoration: underline; }
.c-act { display: flex; gap: 4px; }
.tag { margin-left: 7px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 6px; }
@media (max-width: 900px) { .cf-grid { grid-template-columns: 1fr 1fr; } }
`;
