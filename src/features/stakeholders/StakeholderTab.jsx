import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import Field from "../../components/Field.jsx";
import Section from "../../components/Section.jsx";
import Select from "../../components/Select.jsx";
import { getLookups } from "../../api/lookups.js";
import { getProject, updateProject } from "../../api/projects.js";
import { listContacts, saveContact, deleteContact } from "../../api/stakeholders.js";

/* Everyone outside Aptus with a stake in the site: the authorities that
   have to be satisfied, and the developer's own people. */
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
  const towns = authorities.filter((a) => a.Authority_Type === "Town" || a.Authority_Type === "Unitary");
  const counties = authorities.filter((a) => a.Authority_Type === "County" || a.Authority_Type === "Unitary");
  const detailFor = (id) => authorities.find((a) => String(a.Local_Authority_ID) === String(id));
  const fire = (lookups?.fireServices || []).find((x) => String(x.Fire_Service_ID) === String(f.Fire_Service_ID));

  return (
    <div>
      <style>{CSS}</style>
      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

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
                <option key={a.Local_Authority_ID} value={a.Local_Authority_ID}>{a.Authority_Name}</option>
              ))}
            </Select>
            <AuthorityNote a={detailFor(f.Town_Council_ID)} />
          </Field>

          <Field label="County council">
            <Select value={f.County_Council_ID} onChange={set("County_Council_ID")}>
              <option value="">&mdash; None &mdash;</option>
              {counties.map((a) => (
                <option key={a.Local_Authority_ID} value={a.Local_Authority_ID}>{a.Authority_Name}</option>
              ))}
            </Select>
            <AuthorityNote a={detailFor(f.County_Council_ID)} />
          </Field>
        </div>
        {authorities.length === 0 && (
          <p className="hint">
            No local authorities configured &mdash; add them in Admin &rarr; Local Authority.
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
                  <button className="row-edit"
                    onClick={() => { setEditingId(c.Project_Contact_ID); setDraft({ ...blankContact(), ...c }); }}>
                    Edit
                  </button>
                  <button className="row-del" onClick={() => removeContact(c)} title="Delete">&#10005;</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function AuthorityNote({ a }) {
  if (!a) return null;
  const bits = [a.Contact_Name, a.Telephone, a.Email].filter(Boolean);
  if (!bits.length) return null;
  return <p className="auth-note">{bits.join(" \u00B7 ")}</p>;
}

const CSS = `
.auth-grid { display: grid; grid-template-columns: repeat(3, minmax(200px, 1fr)); gap: 14px; }
.auth-note { font-size: 11px; color: var(--muted); margin: 4px 0 0; }
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
.row-edit { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11.5px inherit; padding: 2px 6px; border-radius: 4px; }
.row-edit:hover { background: var(--white); }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 11px; padding: 2px 5px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
@media (max-width: 900px) { .cf-grid { grid-template-columns: 1fr 1fr; } }
`;
