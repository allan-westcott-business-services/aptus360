import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminDelete } from "../../api/admin.js";

/* People and roles, master-detail rather than a matrix.

   A grid grows a column per role and becomes unreadable by about eight.
   Here the role list runs vertically inside the detail panel, so it scales
   regardless. Two directions because the app needs both: editing is
   person-first ("what does Sam do?"), while every dropdown in the app is
   role-first ("who are the estimators?") — see fillSelRole in the original. */
export default function PeopleRolesAdmin() {
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [map, setMap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [by, setBy] = useState("person");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({ Person_Name: "", Email: "" });
  const [adding, setAdding] = useState(false);

  async function load() {
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

  const rolesOf = (pid) => roles.filter((r) => held.has(`${pid}:${r.Role_ID}`));
  const peopleIn = (rid) => people.filter((p) => held.has(`${p.Person_ID}:${rid}`));

  async function toggle(personId, roleId) {
    const key = `${personId}:${roleId}`;
    setBusy(key);
    try {
      const existing = map.find((m) => m.Person_ID === personId && m.Role_ID === roleId);
      if (existing) {
        await adminDelete("Person_Role", existing.Person_Role_ID, "Person_Role_ID");
        setMap((m) => m.filter((x) => x.Person_Role_ID !== existing.Person_Role_ID));
      } else {
        const created = await adminCreate("Person_Role", { Person_ID: personId, Role_ID: roleId });
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
      const created = await adminCreate("Person", { ...draft, Is_Active: true });
      setDraft({ Person_Name: "", Email: "" });
      setAdding(false);
      await load();
      setSelected(created?.Person_ID ?? null);
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="loading">Loading people&hellip;</div>;

  const list = by === "person" ? people : roles;
  const idKey = by === "person" ? "Person_ID" : "Role_ID";
  const labelKey = by === "person" ? "Person_Name" : "Role";

  const shown = list.filter((x) =>
    !search.trim() || String(x[labelKey]).toLowerCase().includes(search.toLowerCase())
  );

  const current = list.find((x) => x[idKey] === selected);

  return (
    <div>
      <style>{CSS}</style>
      <div className="pr-head">
        <h2 className="admin-title">People &amp; Roles</h2>
        <div className="seg">
          {["person", "role"].map((k) => (
            <button
              key={k}
              className={by === k ? "seg-btn on" : "seg-btn"}
              onClick={() => { setBy(k); setSelected(null); setSearch(""); }}
            >
              By {k}
            </button>
          ))}
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="pr-split">
        <div className="pr-list">
          <input
            aria-label="Search"
            className="pr-search"
            value={search}
            placeholder={by === "person" ? "Search people\u2026" : "Search roles\u2026"}
            onChange={(e) => setSearch(e.target.value)}
          />
          {shown.map((x) => {
            const id = x[idKey];
            const count = by === "person" ? rolesOf(id).length : peopleIn(id).length;
            return (
              <button
                key={id}
                className={selected === id ? "pr-item on" : "pr-item"}
                onClick={() => setSelected(id)}
              >
                <span className="pr-name">{x[labelKey]}</span>
                <span className={count ? "pr-count" : "pr-count zero"}>{count}</span>
              </button>
            );
          })}
          {by === "person" && (
            adding ? (
              <div className="pr-add">
                <input
                  autoFocus
                  placeholder="Name"
                  value={draft.Person_Name}
                  onChange={(e) => setDraft((d) => ({ ...d, Person_Name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addPerson()}
                />
                <input
                  placeholder="Email (optional)"
                  value={draft.Email}
                  onChange={(e) => setDraft((d) => ({ ...d, Email: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addPerson()}
                />
                <div className="pr-add-actions">
                  <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
                  <button className="btn accent" onClick={addPerson}>Add</button>
                </div>
              </div>
            ) : (
              <button className="pr-newbtn" onClick={() => setAdding(true)}>+ Add person</button>
            )
          )}
        </div>

        <div className="pr-detail">
          {!current ? (
            <div className="pr-empty">
              Select {by === "person" ? "someone" : "a role"} to edit
              {by === "person" ? " their roles" : " its members"}.
            </div>
          ) : (
            <>
              <div className="pr-detail-head">
                <h3>{current[labelKey]}</h3>
                {by === "person" && current.Email && <p className="pr-mail">{current.Email}</p>}
                {by === "role" && current.Role_Code && (
                  <p className="pr-mail mono">{current.Role_Code}</p>
                )}
              </div>

              <p className="panel-label">
                {by === "person" ? "Roles held" : "People in this role"}
              </p>

              <div className="pr-rows">
                {(by === "person" ? roles : people).map((x) => {
                  const rid = by === "person" ? x.Role_ID : current.Role_ID;
                  const pid = by === "person" ? current.Person_ID : x.Person_ID;
                  const on = held.has(`${pid}:${rid}`);
                  const key = `${pid}:${rid}`;
                  return (
                    <button
                      key={x[by === "person" ? "Role_ID" : "Person_ID"]}
                      className={on ? "pr-row on" : "pr-row"}
                      disabled={busy === key}
                      onClick={() => toggle(pid, rid)}
                      aria-pressed={on}
                    >
                      <span className={on ? "box on" : "box"}>{on ? "\u2713" : ""}</span>
                      <span className="pr-row-label">
                        {by === "person" ? x.Role : x.Person_Name}
                      </span>
                      {by === "person" && x.Role_Code && (
                        <span className="pr-code mono">{x.Role_Code}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {by === "person" && rolesOf(current.Person_ID).length === 0 && (
                <Banner kind="warn">
                  No roles assigned &mdash; this person won&rsquo;t appear in any picker.
                </Banner>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.pr-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
.seg-btn {
  background: var(--white); border: none; padding: 6px 14px; cursor: pointer;
  font: 600 12.5px inherit; color: var(--muted);
}
.seg-btn.on { background: var(--accent); color: #fff; }

.pr-split { display: grid; grid-template-columns: 260px 1fr; gap: 18px; align-items: start; }
.pr-list {
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 8px; max-height: 62vh; overflow-y: auto;
}
.pr-search { margin-bottom: 8px; }
.pr-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; text-align: left; background: none; border: 1px solid transparent;
  border-radius: 6px; padding: 7px 9px; cursor: pointer; font: 500 12.5px inherit;
  color: var(--text); margin-bottom: 1px;
}
.pr-item:hover { background: var(--bg); }
.pr-item.on { background: var(--accent-light); color: var(--accent); font-weight: 600; }
.pr-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pr-count {
  flex: none; font-size: 10.5px; font-weight: 700; background: var(--accent);
  color: #fff; border-radius: 20px; padding: 1px 7px;
}
.pr-count.zero { background: var(--border); color: var(--muted); }
.pr-newbtn {
  width: 100%; background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 7px; margin-top: 6px; cursor: pointer; font: 600 12.5px inherit; color: var(--accent);
}
.pr-newbtn:hover { background: var(--accent-light); }
.pr-add { border: 1px solid var(--accent); border-radius: 6px; padding: 8px; margin-top: 6px; }
.pr-add input { margin-bottom: 6px; }
.pr-add-actions { display: flex; gap: 6px; }
.pr-add-actions .btn { flex: 1; padding: 5px; }

.pr-detail {
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px 18px; min-height: 300px;
}
.pr-empty { color: var(--muted); font-size: 13px; text-align: center; padding: 80px 20px; }
.pr-detail-head { padding-bottom: 12px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
.pr-detail-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.pr-mail { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
.mono { font-family: ui-monospace, Menlo, monospace; }

.pr-rows { display: flex; flex-direction: column; gap: 3px; max-height: 42vh; overflow-y: auto; }
.pr-row {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  background: none; border: 1px solid transparent; border-radius: 6px;
  padding: 7px 9px; cursor: pointer; font: 500 13px inherit; color: var(--text);
}
.pr-row:hover { background: var(--bg); }
.pr-row.on { background: #ecfdf5; }
.pr-row:disabled { opacity: .5; cursor: wait; }
.box {
  flex: none; width: 19px; height: 19px; border-radius: 5px;
  border: 1.5px solid var(--border); background: var(--white);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: transparent;
}
.box.on { background: #059669; border-color: #059669; color: #fff; }
.pr-row-label { flex: 1; }
.pr-code {
  font-size: 10px; color: var(--muted); background: var(--bg);
  border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px;
}
`;
