import { useState, useEffect, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import {
  listOrganisations, getOrgTypes, getOrganisation, saveOrganisation,
  saveBranch, saveContact, addRole, saveRole, removeRecord,
} from "../../api/organisations.js";

/* Organisations.

   One record per company, wearing as many hats as it actually wears —
   ESP is an IDNO and a supplier, and that's one organisation with two
   roles rather than two records that don't know about each other.

   People sit at branches, not at companies, because that's where they
   actually work and it's the only level that has an address.

   Every field the endpoint will write is reachable from this screen.
   Branch_Dropdown is the exception: it's derived from the company and
   branch names, so it's shown but never sent — the same treatment it
   gets in Customers & Branches. */

const EM_DASH = "\u2014";

/* Named rather than spread from the row, so a derived column can never
   ride along into a PATCH and be rejected by the database. */
const branchFields = (b) => ({
  Branch_Name: b?.Branch_Name ?? "",
  Region_ID: b?.Region_ID ?? "",
  Address_1: b?.Address_1 ?? "",
  Town: b?.Town ?? "",
  Postcode: b?.Postcode ?? "",
  Phone: b?.Phone ?? "",
  Is_Active: b ? b.Is_Active !== false : true,
});

const contactFields = (c, branchId) => ({
  Organisation_Contact_ID: c?.Organisation_Contact_ID,
  Organisation_Branch_ID: c?.Organisation_Branch_ID ?? branchId,
  Organisation_Type_ID: c?.Organisation_Type_ID ?? "",
  Contact_Name: c?.Contact_Name ?? "",
  Job_Title: c?.Job_Title ?? "",
  Email: c?.Email ?? "",
  Phone: c?.Phone ?? "",
  Mobile: c?.Mobile ?? "",
  Notes: c?.Notes ?? "",
  Is_Primary: !!c?.Is_Primary,
  Is_Active: c ? c.Is_Active !== false : true,
});

export default function OrganisationsAdmin() {
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [subtypes, setSubtypes] = useState([]);
  const [regions, setRegions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingOrg, setEditingOrg] = useState(false);
  const [orgDraft, setOrgDraft] = useState({});
  const [newRole, setNewRole] = useState({ type: "", subtype: "" });
  const [roleFor, setRoleFor] = useState(null);          // role id being referenced
  const [roleRef, setRoleRef] = useState("");
  const [branchFor, setBranchFor] = useState(null);      // branch id, or "new"
  const [branchDraft, setBranchDraft] = useState({});
  const [contactFor, setContactFor] = useState(null);    // branch the form sits under
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
    getLookups()
      .then((lk) => setRegions(lk.regions || []))
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
    if (!showInactive && r.Is_Active === false) return false;
    return true;
  }), [rows, search, roleFilter, showInactive]);

  const typeById = (id) => types.find((t) => t.Organisation_Type_ID === id);
  const subtypeById = (id) => subtypes.find((s) => s.Organisation_Subtype_ID === id);
  const regionById = (id) => regions.find((r) => r.Region_ID === id);
  const subtypesFor = (typeId) =>
    subtypes.filter((s) => String(s.Organisation_Type_ID) === String(typeId));

  /* One editor open at a time. Two half-filled forms on screen is how you
     lose the one you meant to save. */
  function closeEditors() {
    setRoleFor(null); setRoleRef("");
    setBranchFor(null); setBranchDraft({});
    setContactFor(null); setContactDraft({});
  }

  async function createOrg() {
    if (!newName.trim()) return setError("An organisation needs a name.");
    try {
      const created = await saveOrganisation({ Name: newName.trim(), Is_Active: true });
      setNewName(""); setAdding(false);
      await loadList();
      setSelected(created.Organisation_ID);
    } catch (e) { setError(e.message); }
  }

  async function saveOrgDetails() {
    if (!orgDraft.Name?.trim()) return setError("An organisation needs a name.");
    try {
      await saveOrganisation({ ...orgDraft, Name: orgDraft.Name.trim() }, selected);
      setEditingOrg(false);
      await Promise.all([loadList(), loadDetail(selected)]);
      setError("");
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
      closeEditors();
      await Promise.all([loadList(), loadDetail(selected)]);
    } catch (e) { setError(e.message); }
  }

  function startRoleRef(r) {
    closeEditors();
    setRoleFor(r.Organisation_Role_ID);
    setRoleRef(r.Reference ?? "");
  }

  async function submitRoleRef() {
    try {
      await saveRole(roleFor, { Reference: roleRef.trim() });
      closeEditors();
      await loadDetail(selected);
      setError("");
    } catch (e) { setError(e.message); }
  }

  function startBranch(b) {
    closeEditors();
    setBranchFor(b ? b.Organisation_Branch_ID : "new");
    setBranchDraft(branchFields(b));
  }

  async function submitBranch() {
    if (!branchDraft.Branch_Name?.trim()) return setError("A branch needs a name.");
    try {
      await saveBranch(
        {
          ...branchDraft,
          Branch_Name: branchDraft.Branch_Name.trim(),
          Organisation_ID: selected,
        },
        branchFor === "new" ? undefined : branchFor
      );
      closeEditors();
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
      closeEditors();
      await Promise.all([loadList(), loadDetail(selected)]);
      setError("");
    } catch (e) { setError(e.message); }
  }

  function startContact(branchId, c) {
    closeEditors();
    setContactFor(branchId);
    setContactDraft(contactFields(c, branchId));
  }

  async function submitContact() {
    if (!contactDraft.Contact_Name?.trim()) return setError("A contact needs a name.");
    const { Organisation_Contact_ID, ...body } = contactDraft;
    try {
      await saveContact(
        {
          ...body,
          Contact_Name: body.Contact_Name.trim(),
          Organisation_Branch_ID: body.Organisation_Branch_ID || contactFor,
        },
        Organisation_Contact_ID
      );
      closeEditors();
      await Promise.all([loadList(), loadDetail(selected)]);
      setError("");
    } catch (e) { setError(e.message); }
  }

  async function dropContact(c) {
    if (!window.confirm(`Delete ${c.Contact_Name}?`)) return;
    try {
      await removeRecord("contact", c.Organisation_Contact_ID);
      closeEditors();
      await Promise.all([loadList(), loadDetail(selected)]);
    } catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading organisations&hellip;</div>;

  const org = detail?.organisation;
  const branches = detail?.branches || [];

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

          <div className="oa-listbar">
            <p className="oa-count">{shown.length} of {rows.length}</p>
            <label className="oa-inline">
              <input type="checkbox" checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
          </div>

          {shown.map((r) => (
            <button key={r.Organisation_ID}
              className={selected === r.Organisation_ID ? "oa-item on" : "oa-item"}
              onClick={() => {
                setSelected(r.Organisation_ID);
                setEditingOrg(false);
                closeEditors();
              }}>
              <span className="oa-name">
                {r.Name}
                {r.Code && <span className="oa-code">{r.Code}</span>}
                {r.Is_Active === false && <span className="oa-off">Inactive</span>}
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
                  <h3>
                    {org.Name}
                    {org.Is_Active === false && <span className="oa-off">Inactive</span>}
                  </h3>
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
                    ["Address_1", "Address line 1"], ["Address_2", "Address line 2"],
                    ["Town", "Town"], ["County", "County"], ["Postcode", "Postcode"],
                    ["Phone", "General phone"], ["Email", "General email"], ["Website", "Website"],
                  ].map(([col, label]) => (
                    <div className="fld" key={col}>
                      <label htmlFor={`oa-${col}`}>{label}</label>
                      <input id={`oa-${col}`} value={orgDraft[col] ?? ""}
                        onChange={(e) => setOrgDraft((d) => ({ ...d, [col]: e.target.value }))} />
                    </div>
                  ))}
                  {/* VAT belongs to the organisation, not to each invoice
                      raised against it. Two fields rather than one: a rate
                      of 0 and "not registered" are different facts, and an
                      invoice needs to know which. */}
                  <div className="fld">
                    <label htmlFor="oa-vatreg">VAT</label>
                    <label className="oa-inline oa-vat">
                      <input id="oa-vatreg" type="checkbox"
                        checked={!!orgDraft.VAT_Registered}
                        onChange={(e) => setOrgDraft((d) => ({ ...d, VAT_Registered: e.target.checked }))} />
                      Registered
                    </label>
                  </div>
                  <div className="fld">
                    <label htmlFor="oa-vatrate">VAT rate (%)</label>
                    <input id="oa-vatrate" type="number" step="0.5"
                      value={orgDraft.VAT_Rate ?? ""}
                      disabled={!orgDraft.VAT_Registered}
                      placeholder={orgDraft.VAT_Registered ? "standard" : "n/a"}
                      onChange={(e) => setOrgDraft((d) => ({ ...d, VAT_Rate: e.target.value }))} />
                    <p className="hint">
                      Blank takes the standard rate in force on the invoice date,
                      from Admin &rsaquo; VAT Rates.
                    </p>
                  </div>
                  <div className="fld oa-full">
                    <label htmlFor="oa-Notes">Notes</label>
                    <textarea id="oa-Notes" value={orgDraft.Notes ?? ""}
                      onChange={(e) => setOrgDraft((d) => ({ ...d, Notes: e.target.value }))} />
                  </div>
                  <div className="oa-form-actions">
                    <label className="oa-inline">
                      <input type="checkbox" checked={orgDraft.Is_Active !== false}
                        onChange={(e) => setOrgDraft((d) => ({ ...d, Is_Active: e.target.checked }))} />
                      Active
                    </label>
                    <span className="hint">
                      Inactive organisations stay on past projects but drop out of the pickers.
                    </span>
                    <button className="btn accent" onClick={saveOrgDetails}>Save changes</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="oa-facts">
                    {org.Phone && <span>&#9742; {org.Phone}</span>}
                    {org.Email && <span>&#9993; {org.Email}</span>}
                    {org.Website && <span>{org.Website}</span>}
                    {org.VAT_Registered && (
                      <span className="oa-vatchip">
                        VAT {org.VAT_Rate != null ? `${org.VAT_Rate}%` : "standard"}
                      </span>
                    )}
                    {(org.Town || org.Postcode) && <span>{org.Town} {org.Postcode}</span>}
                    {!org.Phone && !org.Email && (
                      <span className="oa-muted">No general contact details</span>
                    )}
                  </div>
                  {org.Notes && <p className="oa-notes">{org.Notes}</p>}
                </>
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
                    <button className="oa-ref" title="Edit reference"
                      onClick={() => startRoleRef(r)}>
                      {r.Reference || "+ ref"}
                    </button>
                    <button className="oa-x" title="Remove role"
                      onClick={() => detachRole(r.Organisation_Role_ID)}>&times;</button>
                  </span>
                ))}
              </div>

              {roleFor && (
                <div className="oa-roleform">
                  <div className="fld">
                    <label htmlFor="or-ref">Reference</label>
                    <input id="or-ref" autoFocus value={roleRef}
                      onChange={(e) => setRoleRef(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitRoleRef()} />
                  </div>
                  <button className="btn accent sm" onClick={submitRoleRef}>Save reference</button>
                  <button className="btn ghost sm" onClick={closeEditors}>Cancel</button>
                  <span className="hint">
                    How this organisation is identified in this role &mdash; a scheme prefix as an
                    IDNO, an account code as a supplier. Held per role, not per company.
                  </span>
                </div>
              )}

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
              {branches.map((b) => {
                const people = detail.contacts.filter(
                  (c) => c.Organisation_Branch_ID === b.Organisation_Branch_ID);
                const editingThis = branchFor === b.Organisation_Branch_ID;
                const where = [b.Address_1, b.Town, b.Postcode].filter(Boolean).join(", ");
                return (
                  <div className="oa-branch" key={b.Organisation_Branch_ID}>
                    <div className="oa-branch-head">
                      <strong>{b.Branch_Name}</strong>
                      {b.Is_Active === false && <span className="oa-off">Inactive</span>}
                      <span className="oa-dd">{b.Branch_Dropdown}</span>
                      <span className="oa-pcount">{people.length}</span>
                      <button className="row-edit" onClick={() => startBranch(b)}>
                        {editingThis ? "Editing" : "Edit branch"}
                      </button>
                      <button className="row-edit"
                        onClick={() => startContact(b.Organisation_Branch_ID, null)}>
                        + Contact
                      </button>
                      <button className="row-del" title="Delete branch"
                        onClick={() => dropBranch(b)}>&#10005;</button>
                    </div>

                    {editingThis ? (
                      <BranchForm draft={branchDraft} setDraft={setBranchDraft} regions={regions}
                        dropdown={b.Branch_Dropdown} onSave={submitBranch} onCancel={closeEditors} />
                    ) : (
                      (where || b.Phone || b.Region_ID) && (
                        <div className="oa-branch-facts">
                          {where && <span>{where}</span>}
                          {b.Phone && <span>&#9742; {b.Phone}</span>}
                          {regionById(b.Region_ID) && (
                            <span className="oa-region">{regionById(b.Region_ID).Region}</span>
                          )}
                        </div>
                      )
                    )}

                    {people.map((c) => (
                      <div className="oa-contact" key={c.Organisation_Contact_ID}>
                        <span className="oc-name">
                          {c.Contact_Name}
                          {c.Is_Primary && <span className="oc-primary">Primary</span>}
                          {c.Is_Active === false && <span className="oa-off">Inactive</span>}
                        </span>
                        <span className="oc-role">{c.Job_Title}</span>
                        <span className="oc-email">{c.Email}</span>
                        <span className="oc-phone">{c.Phone || c.Mobile}</span>
                        <button className="row-edit"
                          onClick={() => startContact(b.Organisation_Branch_ID, c)}>Edit</button>
                        <button className="row-del" onClick={() => dropContact(c)}>&#10005;</button>
                      </div>
                    ))}

                    {contactFor === b.Organisation_Branch_ID && (
                      <ContactForm draft={contactDraft} setDraft={setContactDraft}
                        branches={branches} types={types}
                        onSave={submitContact} onCancel={closeEditors} />
                    )}
                  </div>
                );
              })}

              {branchFor === "new" ? (
                <div className="oa-branch">
                  <div className="oa-branch-head"><strong>New branch</strong></div>
                  <BranchForm draft={branchDraft} setDraft={setBranchDraft} regions={regions}
                    dropdown="" onSave={submitBranch} onCancel={closeEditors} />
                </div>
              ) : (
                <button className="oa-new" onClick={() => startBranch(null)}>+ Add branch</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── branch editor ──
   Branch_Dropdown is read-only: it's built from the company and branch
   names, and every picker in the app reads it. Typing over it here would
   put a name on a project that matches nothing. */
function BranchForm({ draft, setDraft, regions, dropdown, onSave, onCancel }) {
  const set = (col) => (e) => setDraft((d) => ({ ...d, [col]: e.target.value }));
  return (
    <div className="oa-bform">
      <div className="fld">
        <label htmlFor="ob-name">Branch name</label>
        <input id="ob-name" value={draft.Branch_Name ?? ""} onChange={set("Branch_Name")} />
      </div>
      <div className="fld">
        <label htmlFor="ob-region">Region</label>
        <select id="ob-region" value={draft.Region_ID ?? ""} onChange={set("Region_ID")}>
          <option value="">{EM_DASH}</option>
          {regions.map((r) => (
            <option key={r.Region_ID} value={r.Region_ID}>{r.Region}</option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label htmlFor="ob-phone">Phone</label>
        <input id="ob-phone" value={draft.Phone ?? ""} onChange={set("Phone")} />
      </div>
      <div className="fld">
        <label htmlFor="ob-addr">Address</label>
        <input id="ob-addr" value={draft.Address_1 ?? ""} onChange={set("Address_1")} />
      </div>
      <div className="fld">
        <label htmlFor="ob-town">Town</label>
        <input id="ob-town" value={draft.Town ?? ""} onChange={set("Town")} />
      </div>
      <div className="fld">
        <label htmlFor="ob-pc">Postcode</label>
        <input id="ob-pc" value={draft.Postcode ?? ""} onChange={set("Postcode")} />
      </div>
      <div className="oa-form-actions">
        <label className="oa-inline">
          <input type="checkbox" checked={draft.Is_Active !== false}
            onChange={(e) => setDraft((d) => ({ ...d, Is_Active: e.target.checked }))} />
          Active
        </label>
        {dropdown && <span className="hint">Shown in pickers as {dropdown}</span>}
        <button className="btn accent sm" onClick={onSave}>Save branch</button>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ── contact editor ──
   The branch picker is here rather than a separate "move" action because
   people change office, and re-typing the whole record to do it is how
   the phone number ends up wrong. */
function ContactForm({ draft, setDraft, branches, types, onSave, onCancel }) {
  const set = (col) => (e) => setDraft((d) => ({ ...d, [col]: e.target.value }));
  const editing = !!draft.Organisation_Contact_ID;
  return (
    <div className="oa-cform">
      <div className="fld">
        <label htmlFor="oc-name">Name</label>
        <input id="oc-name" autoFocus value={draft.Contact_Name ?? ""} onChange={set("Contact_Name")} />
      </div>
      <div className="fld">
        <label htmlFor="oc-job">Job title</label>
        <input id="oc-job" value={draft.Job_Title ?? ""} onChange={set("Job_Title")} />
      </div>
      <div className="fld">
        <label htmlFor="oc-email">Email</label>
        <input id="oc-email" type="email" value={draft.Email ?? ""} onChange={set("Email")} />
      </div>
      <div className="fld">
        <label htmlFor="oc-phone">Phone</label>
        <input id="oc-phone" value={draft.Phone ?? ""} onChange={set("Phone")} />
      </div>
      <div className="fld">
        <label htmlFor="oc-mobile">Mobile</label>
        <input id="oc-mobile" value={draft.Mobile ?? ""} onChange={set("Mobile")} />
      </div>
      <div className="fld">
        <label htmlFor="oc-branch">Branch</label>
        <select id="oc-branch" value={draft.Organisation_Branch_ID ?? ""}
          onChange={set("Organisation_Branch_ID")}>
          {branches.map((b) => (
            <option key={b.Organisation_Branch_ID} value={b.Organisation_Branch_ID}>
              {b.Branch_Name}
            </option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label htmlFor="oc-type">For role</label>
        <select id="oc-type" value={draft.Organisation_Type_ID ?? ""} onChange={set("Organisation_Type_ID")}>
          <option value="">All roles</option>
          {types.map((t) => (
            <option key={t.Organisation_Type_ID} value={t.Organisation_Type_ID}>{t.Label}</option>
          ))}
        </select>
      </div>
      <div className="fld oa-full">
        <label htmlFor="oc-notes">Notes</label>
        <textarea id="oc-notes" value={draft.Notes ?? ""} onChange={set("Notes")} />
      </div>
      <div className="oa-form-actions">
        <label className="oa-inline">
          <input type="checkbox" checked={!!draft.Is_Primary}
            onChange={(e) => setDraft((d) => ({ ...d, Is_Primary: e.target.checked }))} />
          Primary contact
        </label>
        <label className="oa-inline">
          <input type="checkbox" checked={draft.Is_Active !== false}
            onChange={(e) => setDraft((d) => ({ ...d, Is_Active: e.target.checked }))} />
          Active
        </label>
        <span className="hint">One primary per branch for each role.</span>
        <button className="btn accent sm" onClick={onSave}>
          {editing ? "Save contact" : "Add contact"}
        </button>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
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
.oa-listbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
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
.oa-off { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  background: var(--bg); color: var(--muted); border: 1px solid var(--border);
  border-radius: 3px; padding: 1px 5px; }
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
.oa-head h3 { margin: 0; font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.oa-trading { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); font-style: italic; }
.oa-facts { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--muted);
  margin-bottom: 4px; }
.oa-notes { font-size: 12px; color: var(--muted); margin: 8px 0 0; white-space: pre-wrap;
  max-width: 78ch; }
.oa-muted { color: var(--muted); font-size: 12px; font-style: italic; }
.oa-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 11px; }
.oa-full { grid-column: 1 / -1; }
.oa-form-actions { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px;
  flex-wrap: wrap; }
.oa-form-actions .hint { margin: 0; flex: 1; }
.oa-roles-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 9px; }
.oa-role { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600;
  background: var(--accent-light); border: 1px solid var(--accent); color: var(--accent);
  border-radius: 999px; padding: 3px 5px 3px 12px; }
.oa-sub { font-size: 10px; font-weight: 700; background: var(--accent); color: #fff;
  border-radius: 999px; padding: 1px 8px; }
.oa-ref { border: none; background: none; cursor: pointer; color: var(--accent);
  font: 600 10.5px ui-monospace, Menlo, monospace; padding: 1px 6px; border-radius: 3px;
  border: 1px dashed var(--accent); opacity: .75; }
.oa-ref:hover { opacity: 1; background: var(--white); }
.oa-roleform { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap;
  border: 1px solid var(--accent); border-radius: var(--radius); padding: 10px 12px;
  margin-bottom: 9px; }
.oa-roleform .fld { min-width: 180px; }
.oa-roleform .hint { flex: 1 1 100%; margin: 0; }
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
.oa-branch-facts { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11.5px;
  color: var(--muted); padding: 7px 12px; border-top: 1px solid var(--border); }
.oa-region { font-weight: 600; }
.oa-bform, .oa-cform { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px; padding: 11px 12px; border-top: 1px solid var(--border); }
.oa-contact { display: flex; align-items: center; gap: 12px; padding: 7px 12px;
  border-top: 1px solid var(--border); font-size: 12px; }
.oc-name { min-width: 150px; font-weight: 600; display: flex; align-items: center; gap: 7px; }
.oc-primary { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border);
  border-radius: 3px; padding: 1px 5px; }
.oc-role, .oc-email, .oc-phone { flex: 1; color: var(--muted); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oa-vat { margin-top: 6px; }
.oa-vatchip { font-weight: 700; color: var(--accent); }
.oa-inline { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0; }

.btn.sm { padding: 4px 12px; font-size: 11.5px; }
.row-edit { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11.5px inherit; padding: 3px 7px; border-radius: 4px; }
.row-edit:hover { background: var(--accent-light); }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 11px; padding: 3px 6px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
@media (max-width: 980px) { .oa-split { grid-template-columns: 1fr; } }
`;
