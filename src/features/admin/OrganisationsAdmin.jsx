import { useState, useEffect, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import {
  listOrganisations, getOrgTypes, getOrganisation, saveOrganisation,
  saveBranch, saveContact, addRole, removeRecord,
} from "../../api/organisations.js";

/* Organisations.

   One record per company, wearing as many hats as it actually wears —
   ESP is an IDNO and a supplier, and that's one organisation with two
   roles rather than two records that don't know about each other.

   People sit at branches, not at companies, because that's where they
   actually work and it's the only level that has an address. */
export default function OrganisationsAdmin() {
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [subtypes, setSubtypes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingOrg, setEditingOrg] = useState(false);
  const [orgDraft, setOrgDraft] = useState({});
  const [newRole, setNewRole] = useState({ type: "", subtype: "" });
  const [newBranch, setNewBranch] = useState("");
  const [contactFor, setContactFor] = useState(null);
  const [contactDraft, setContactDraft] = useState({});

  const loadList = useCallback(async () => {
    try {
      const r = await listOrganisations();
      setRows(r.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadList();
    getOrgTypes()
      .then((r) => { setTypes(r.types || []); setSubtypes(r.subtypes || []); })
      .catch((e) => setError(e.message));
  }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try { setDetail(await getOrganisation(id)); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { loadDetail(selected); }, [selected, loadDetail]);

  const shown = useMemo(() => rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.Name} ${r.Code ?? ""}`.toLowerCase().includes(q)) return false;
    if (roleFilter && !(r.roles || "").includes(roleFilter)) return false;
    return true;
  }), [rows, search, roleFilter]);

  const typeById = (id) => types.find((t) => t.Organisation_Type_ID === id);
  const subtypeById = (id) => subtypes.find((s) => s.Organisation_Subtype_ID === id);
  const subtypesFor = (typeId) =>
    subtypes.filter((s) => String(s.Organisation_Type_ID) === String(typeId));

  async function createOrg() {
    if (!newName.trim()) return setError("An organisation needs a name.");
    try {
      const created = await saveOrganisation({ Name: newName.trim(), Is_Active: true });
      setNewName(""); setAdding(""); setAdding(false);
      await loadList();
      setSelected(created.Organisation_ID);
    } catch (e) { setError(e.message); }
  }

  async function saveOrgDetails() {
    try {
      await saveOrganisation(orgDraft, selected);
      setEditingOrg(false);
      await Promise.all([loadList(), loadDetail(selected)]);
    } catch (e) { setError(e.message); }
  }

  async function attachRole() {
    if (!newRole.type) return setError("Choose a type.");
    try {
      await addRole({
        Organisation_ID: selected,
        Organisation_Type_ID: newRole.type,
        Organisation_Subtype_ID: newRole.subtype || null,
      });
      setNewRole({ type: "", subtype: "" });
      await Promise.all([loadList(), loadDetail(selected)]);
      setError("");
    } catch (e) { setError(e.message); }
  }

  async function detachRole(roleId) {
    try {
      await removeRecord("role", roleId);
      await Promise.all([loadList(), loadDetail(selected)]);
    } catch (e) { setError(e.message); }
  }

  async function createBranch() {
    if (!newBranch.trim()) return setError("A branch needs a name.");
    try {
      await saveBranch({ Organisation_ID: selected, Branch_Name: newBranch.trim() });
      setNewBranch("");
      await Promise.all([loadList(), loadDetail(selected)]);
      setError("");
    } catch (e) { setError(e.message); }
  }

  async function dropBranch(b) {
    const mine = detail.contacts.filter(
      (c) => c.Organisation_Branch_ID === b.Organisation_Branch_ID);
    if (mine.length && !window.confirm(
      `${b.Branch_Name} has ${mine.length} contact${mine.length === 1 ? "" : "s"}. Delete both?`
    )) return;
    try {
      await removeRecord("branch", b.Organisation_Branch_ID);
      await Promise.all([loadList(), loadDetail(selected)]);
      setError("");
    } catch (e) { setError(e.message); }
  }

  async function submitContact() {
    if (!contactDraft.Contact_Name?.trim()) return setError("A contact needs a name.");
    try {
      await saveContact(
        { ...contactDraft, Organisation_Branch_ID: contactFor },
        contactDraft.Organisation_Contact_ID
      );
      setContactFor(null); setContactDraft({});
      await Promise.all([loadList(), loadDetail(selected)]);
      setError("");
    } catch (e) { setError(e.message); }
  }

  async function dropContact(c) {
    if (!window.confirm(`Delete ${c.Contact_Name}?`)) return;
    try {
      await removeRecord("contact", c.Organisation_Contact_ID);
      await Promise.all([loadList(), loadDetail(selected)]);
    } catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading organisations&hellip;</div>;

  const org = detail?.organisation;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">Organisations</h2>
      <p className="oa-note">
        One record per company. An organisation can hold several roles at once &mdash; an
        IDNO that also supplies, a subcontractor covering more than one trade.
      </p>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="oa-split">
        {/* ── list ── */}
        <div className="oa-list">
          <input className="oa-search" value={search} placeholder="Search organisations&hellip;"
            aria-label="Search organisations" onChange={(e) => setSearch(e.target.value)} />
          <select className="oa-rolefilter" value={roleFilter} aria-label="Filter by role"
            onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {types.map((t) => (
              <option key={t.Organisation_Type_ID} value={t.Label}>{t.Label}</option>
            ))}
          </select>

          <p className="oa-count">{shown.length} of {rows.length}</p>

          {shown.map((r) => (
            <button key={r.Organisation_ID}
              className={selected === r.Organisation_ID ? "oa-item on" : "oa-item"}
              onClick={() => { setSelected(r.Organisation_ID); setEditingOrg(false); }}>
              <span className="oa-name">
                {r.Name}
                {r.Code && <span className="oa-code">{r.Code}</span>}
              </span>
              <span className="oa-roles">{r.roles || "no role"}</span>
            </button>
          ))}

          {adding ? (
            <div className="oa-add">
              <input autoFocus value={newName} placeholder="Organisation name"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createOrg()} />
              <div className="oa-add-actions">
                <button className="btn ghost sm" onClick={() => setAdding(false)}>Cancel</button>
                <button className="btn accent sm" onClick={createOrg}>Add</button>
              </div>
              <p className="hint">A Head Office branch is created automatically.</p>
            </div>
          ) : (
            <button className="oa-new" onClick={() => setAdding(true)}>+ Add organisation</button>
          )}
        </div>

        {/* ── detail ── */}
        <div className="oa-detail">
          {!org ? (
            <div className="oa-empty">Select an organisation.</div>
          ) : (
            <>
              <div className="oa-head">
                <div>
                  <h3>{org.Name}</h3>
                  {org.Trading_Name && <p className="oa-trading">trading as {org.Trading_Name}</p>}
                </div>
                <button className="row-edit" onClick={() => {
                  setOrgDraft({ ...org });
                  setEditingOrg((v) => !v);
                }}>{editingOrg ? "Cancel" : "Edit details"}</button>
              </div>

              {editingOrg ? (
                <div className="oa-form">
                  {[
                    ["Name", "Name"], ["Trading_Name", "Trading name"], ["Code", "Code"],
                    ["Registration_Number", "Company number"],
                    ["Address_1", "Address"], ["Town", "Town"], ["Postcode", "Postcode"],
                    ["Phone", "General phone"], ["Email", "General email"], ["Website", "Website"],
                  ].map(([col, label]) => (
                    <div className="fld" key={col}>
                      <label htmlFor={`oa-${col}`}>{label}</label>
                      <input id={`oa-${col}`} value={orgDraft[col] ?? ""}
                        onChange={(e) => setOrgDraft((d) => ({ ...d, [col]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="oa-form-actions">
                    <button className="btn accent" onClick={saveOrgDetails}>Save</button>
                  </div>
                </div>
              ) : (
                <div className="oa-facts">
                  {org.Phone && <span>&#9742; {org.Phone}</span>}
                  {org.Email && <span>&#9993; {org.Email}</span>}
                  {org.Postcode && <span>{org.Town} {org.Postcode}</span>}
                  {!org.Phone && !org.Email && (
                    <span className="oa-muted">No general contact details</span>
                  )}
                </div>
              )}

              {/* roles */}
              <p className="panel-label">Roles</p>
              <div className="oa-roles-list">
                {(detail.roles || []).length === 0 && (
                  <p className="oa-muted">
                    No roles yet &mdash; this organisation won&rsquo;t appear in any picker.
                  </p>
                )}
                {(detail.roles || []).map((r) => (
                  <span className="oa-role" key={r.Organisation_Role_ID}>
                    {typeById(r.Organisation_Type_ID)?.Label ?? "Unknown"}
                    {r.Organisation_Subtype_ID && (
                      <span className="oa-sub">{subtypeById(r.Organisation_Subtype_ID)?.Label}</span>
                    )}
                    <button className="oa-x" title="Remove role"
                      onClick={() => detachRole(r.Organisation_Role_ID)}>&times;</button>
                  </span>
                ))}
              </div>

              <div className="oa-addrole">
                <select value={newRole.type} aria-label="Role type"
                  onChange={(e) => setNewRole({ type: e.target.value, subtype: "" })}>
                  <option value="">Add a role&hellip;</option>
                  {types.map((t) => (
                    <option key={t.Organisation_Type_ID} value={t.Organisation_Type_ID}>
                      {t.Label}
                    </option>
                  ))}
                </select>
                {subtypesFor(newRole.type).length > 0 && (
                  <select value={newRole.subtype} aria-label="Trade"
                    onChange={(e) => setNewRole((r) => ({ ...r, subtype: e.target.value }))}>
                    <option value="">Trade&hellip;</option>
                    {subtypesFor(newRole.type).map((s) => (
                      <option key={s.Organisation_Subtype_ID} value={s.Organisation_Subtype_ID}>
                        {s.Label}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn ghost sm" disabled={!newRole.type} onClick={attachRole}>
                  Add
                </button>
                {subtypesFor(newRole.type).length > 0 && (
                  <span className="hint">Add one per trade they cover.</span>
                )}
              </div>

              {/* branches and their people */}
              <p className="panel-label">Branches &amp; contacts</p>
              {(detail.branches || []).map((b) => {
                const people = detail.contacts.filter(
                  (c) => c.Organisation_Branch_ID === b.Organisation_Branch_ID);
                return (
                  <div className="oa-branch" key={b.Organisation_Branch_ID}>
                    <div className="oa-branch-head">
                      <strong>{b.Branch_Name}</strong>
                      <span className="oa-dd">{b.Branch_Dropdown}</span>
                      <span className="oa-pcount">{people.length}</span>
                      <button className="row-edit" onClick={() => {
                        setContactFor(b.Organisation_Branch_ID);
                        setContactDraft({});
                      }}>+ Contact</button>
                      <button className="row-del" title="Delete branch"
                        onClick={() => dropBranch(b)}>&#10005;</button>
                    </div>

                    {people.map((c) => (
                      <div className="oa-contact" key={c.Organisation_Contact_ID}>
                        <span className="oc-name">
                          {c.Contact_Name}
                          {c.Is_Primary && <span className="oc-primary">Primary</span>}
                        </span>
                        <span className="oc-role">{c.Job_Title}</span>
                        <span className="oc-email">{c.Email}</span>
                        <span className="oc-phone">{c.Phone || c.Mobile}</span>
                        <button className="row-edit" onClick={() => {
                          setContactFor(b.Organisation_Branch_ID);
                          setContactDraft({ ...c });
                        }}>Edit</button>
                        <button className="row-del" onClick={() => dropContact(c)}>&#10005;</button>
                      </div>
                    ))}

                    {contactFor === b.Organisation_Branch_ID && (
                      <div className="oa-cform">
                        <input placeholder="Name" value={contactDraft.Contact_Name ?? ""}
                          onChange={(e) => setContactDraft((d) => ({ ...d, Contact_Name: e.target.value }))} />
                        <input placeholder="Job title" value={contactDraft.Job_Title ?? ""}
                          onChange={(e) => setContactDraft((d) => ({ ...d, Job_Title: e.target.value }))} />
                        <input placeholder="Email" value={contactDraft.Email ?? ""}
                          onChange={(e) => setContactDraft((d) => ({ ...d, Email: e.target.value }))} />
                        <input placeholder="Phone" value={contactDraft.Phone ?? ""}
                          onChange={(e) => setContactDraft((d) => ({ ...d, Phone: e.target.value }))} />
                        <label className="oa-inline">
                          <input type="checkbox" checked={!!contactDraft.Is_Primary}
                            onChange={(e) => setContactDraft((d) => ({ ...d, Is_Primary: e.target.checked }))} />
                          Primary
                        </label>
                        <button className="btn accent sm" onClick={submitContact}>
                          {contactDraft.Organisation_Contact_ID ? "Save" : "Add"}
                        </button>
                        <button className="btn ghost sm" onClick={() => {
                          setContactFor(null); setContactDraft({});
                        }}>Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="oa-addbranch">
                <input value={newBranch} placeholder="New branch name" aria-label="New branch name"
                  onChange={(e) => setNewBranch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createBranch()} />
                <button className="btn ghost sm" onClick={createBranch}>+ Add branch</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.oa-note { font-size: 12.5px; color: var(--muted); margin: -10px 0 14px; max-width: 78ch; }
.oa-split { display: grid; grid-template-columns: 280px 1fr; gap: 18px; align-items: start; }
.oa-list { border: 1px solid var(--border); border-radius: var(--radius); padding: 9px;
  max-height: 72vh; overflow-y: auto; }
.oa-search, .oa-rolefilter { width: 100%; margin-bottom: 6px; font-size: 12px; }
.oa-count { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); margin: 4px 0 6px; }
.oa-item { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
  background: none; border: 1px solid transparent; border-radius: 6px; padding: 7px 9px;
  cursor: pointer; font: inherit; color: var(--text); margin-bottom: 1px; }
.oa-item:hover { background: var(--bg); }
.oa-item.on { background: var(--accent-light); border-color: var(--accent); }
.oa-name { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 7px; }
.oa-code { font: 700 9.5px ui-monospace, Menlo, monospace; background: var(--accent);
  color: #fff; border-radius: 3px; padding: 1px 5px; }
.oa-roles { font-size: 10.5px; color: var(--muted); }
.oa-new { width: 100%; background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 7px; margin-top: 6px; cursor: pointer; font: 600 12.5px inherit; color: var(--accent); }
.oa-new:hover { background: var(--accent-light); }
.oa-add { border: 1px solid var(--accent); border-radius: 6px; padding: 8px; margin-top: 6px; }
.oa-add input { width: 100%; margin-bottom: 6px; font-size: 12px; }
.oa-add-actions { display: flex; gap: 6px; }
.oa-add-actions .btn { flex: 1; }
.oa-detail { border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px;
  min-height: 400px; }
.oa-empty { color: var(--muted); font-size: 13px; text-align: center; padding: 120px 20px; }
.oa-head { display: flex; align-items: flex-start; gap: 10px; padding-bottom: 11px;
  border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.oa-head > div { flex: 1; }
.oa-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
.oa-trading { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); font-style: italic; }
.oa-facts { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--muted);
  margin-bottom: 4px; }
.oa-muted { color: var(--muted); font-size: 12px; font-style: italic; }
.oa-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 11px; }
.oa-form-actions { grid-column: 1 / -1; }
.oa-roles-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 9px; }
.oa-role { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600;
  background: var(--accent-light); border: 1px solid var(--accent); color: var(--accent);
  border-radius: 999px; padding: 3px 5px 3px 12px; }
.oa-sub { font-size: 10px; font-weight: 700; background: var(--accent); color: #fff;
  border-radius: 999px; padding: 1px 8px; }
.oa-x { border: none; background: none; cursor: pointer; color: var(--accent); font-size: 14px;
  line-height: 1; padding: 0 4px; }
.oa-addrole { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 4px; }
.oa-addrole select { width: auto; min-width: 150px; font-size: 12px; }
.oa-branch { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; }
.oa-branch-head { display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  background: var(--bg); border-radius: var(--radius) var(--radius) 0 0; }
.oa-branch-head strong { font-size: 13px; }
.oa-dd { flex: 1; font-size: 11px; color: var(--muted); }
.oa-pcount { font-size: 10.5px; font-weight: 700; background: var(--white); color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; }
.oa-contact { display: flex; align-items: center; gap: 12px; padding: 7px 12px;
  border-top: 1px solid var(--border); font-size: 12px; }
.oc-name { min-width: 150px; font-weight: 600; display: flex; align-items: center; gap: 7px; }
.oc-primary { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border);
  border-radius: 3px; padding: 1px 5px; }
.oc-role, .oc-email, .oc-phone { flex: 1; color: var(--muted); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oa-cform { display: flex; gap: 6px; padding: 9px 12px; border-top: 1px solid var(--border);
  flex-wrap: wrap; align-items: center; }
.oa-cform input[type=text], .oa-cform input:not([type]) { flex: 1; min-width: 110px; font-size: 12px; }
.oa-inline { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0; }
.oa-addbranch { display: flex; gap: 7px; margin-top: 8px; }
.oa-addbranch input { flex: 1; }
.btn.sm { padding: 4px 12px; font-size: 11.5px; }
.row-edit { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11.5px inherit; padding: 3px 7px; border-radius: 4px; }
.row-edit:hover { background: var(--accent-light); }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 11px; padding: 3px 6px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
@media (max-width: 980px) { .oa-split { grid-template-columns: 1fr; } }
`;
