import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminDelete } from "../../api/admin.js";

/* People and their roles. Roles live in Person_Role, so this is a grid:
   people down the side, roles across the top, a checkbox at each crossing.
   Ticking writes a mapping row; unticking deletes it. */
export default function PeopleRolesAdmin() {
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [map, setMap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [draft, setDraft] = useState({ Person_Name: "", Email: "" });

  async function load() {
    setLoading(true);
    try {
      const [p, r, m] = await Promise.all([
        adminList("Person"), adminList("Role"), adminList("Person_Role"),
      ]);
      setPeople(p.rows || []);
      setRoles(r.rows || []);
      setMap(m.rows || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const held = useMemo(() => {
    const s = new Set();
    map.forEach((m) => s.add(`${m.Person_ID}:${m.Role_ID}`));
    return s;
  }, [map]);

  const mappingFor = (personId, roleId) =>
    map.find((m) => m.Person_ID === personId && m.Role_ID === roleId);

  async function toggle(person, role) {
    const key = `${person.Person_ID}:${role.Role_ID}`;
    setBusy(key);
    try {
      const existing = mappingFor(person.Person_ID, role.Role_ID);
      if (existing) {
        await adminDelete("Person_Role", existing.Person_Role_ID, "Person_Role_ID");
        setMap((m) => m.filter((x) => x.Person_Role_ID !== existing.Person_Role_ID));
      } else {
        const created = await adminCreate("Person_Role", {
          Person_ID: person.Person_ID, Role_ID: role.Role_ID,
        });
        setMap((m) => [...m, created]);
      }
      setError("");
    } catch (e) {
      setError(e.message);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function addPerson() {
    if (!draft.Person_Name.trim()) return setError("Name is required.");
    try {
      await adminCreate("Person", { ...draft, Is_Active: true });
      setDraft({ Person_Name: "", Email: "" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="loading">Loading people&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">People &amp; Roles</h2>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="add-panel">
        <p className="panel-label">Add a person</p>
        <div className="person-add">
          <div className="fld">
            <label>Name <span className="req">*</span></label>
            <input value={draft.Person_Name}
              onChange={(e) => setDraft((d) => ({ ...d, Person_Name: e.target.value }))} />
          </div>
          <div className="fld">
            <label>Email</label>
            <input type="email" value={draft.Email}
              onChange={(e) => setDraft((d) => ({ ...d, Email: e.target.value }))} />
          </div>
          <button className="btn accent" onClick={addPerson}>+ Add</button>
        </div>
      </div>

      <p className="panel-label">
        {people.length} {people.length === 1 ? "person" : "people"} &middot; tick to assign a role
      </p>

      {people.length === 0 ? (
        <div className="empty">No people yet. Add one above.</div>
      ) : (
        <div className="grid-wrap">
          <table className="role-grid">
            <thead>
              <tr>
                <th className="name-col">Person</th>
                {roles.map((r) => (
                  <th key={r.Role_ID} className="role-col" title={r.Role_Code}>{r.Role}</th>
                ))}
                <th className="count-col">Roles</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const count = roles.filter((r) => held.has(`${p.Person_ID}:${r.Role_ID}`)).length;
                return (
                  <tr key={p.Person_ID} className={count === 0 ? "no-roles" : ""}>
                    <td className="name-col">
                      <span className="pname">{p.Person_Name}</span>
                      {p.Email && <span className="pmail">{p.Email}</span>}
                    </td>
                    {roles.map((r) => {
                      const on = held.has(`${p.Person_ID}:${r.Role_ID}`);
                      const key = `${p.Person_ID}:${r.Role_ID}`;
                      return (
                        <td key={r.Role_ID} className="role-col">
                          <button
                            className={on ? "cell on" : "cell"}
                            disabled={busy === key}
                            onClick={() => toggle(p, r)}
                            aria-label={`${p.Person_Name} — ${r.Role}`}
                            aria-pressed={on}
                          >
                            {busy === key ? "\u00B7" : on ? "\u2713" : ""}
                          </button>
                        </td>
                      );
                    })}
                    <td className="count-col">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="foot-note">
        Someone with no roles won&rsquo;t appear in any picker &mdash; the BDD/KAM and
        Estimator dropdowns filter on these assignments.
      </p>
    </div>
  );
}

const CSS = `
.person-add { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
.grid-wrap { border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; max-height: 60vh; }
.role-grid { border-collapse: collapse; font-size: 12.5px; width: 100%; }
.role-grid th {
  position: sticky; top: 0; z-index: 2; background: var(--accent); color: #fff;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 8px 6px; text-align: center;
}
.role-grid th.name-col { text-align: left; padding-left: 12px; min-width: 190px; }
.role-grid td { border-top: 1px solid var(--border); padding: 4px 6px; text-align: center; }
.role-grid td.name-col { text-align: left; padding-left: 12px; }
.role-grid tbody tr:nth-child(even) { background: #fafbfc; }
.role-grid tbody tr:hover { background: var(--accent-light); }
.role-grid tbody tr.no-roles .pname { color: var(--muted); }
.pname { display: block; font-weight: 600; }
.pmail { display: block; font-size: 10.5px; color: var(--muted); }
.role-col { min-width: 84px; }
.count-col { min-width: 54px; font-weight: 700; color: var(--muted); }
.cell {
  width: 24px; height: 24px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--border); background: var(--white);
  font-size: 12px; font-weight: 700; color: transparent; line-height: 1;
}
.cell:hover { border-color: var(--accent); }
.cell.on { background: #059669; border-color: #059669; color: #fff; }
.cell:disabled { opacity: .5; cursor: wait; }
.foot-note { font-size: 11.5px; color: var(--muted); margin-top: 12px; }
`;
