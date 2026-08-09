import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

/* Teams: the gangs that turn up and do the work.

   Master-detail, like people and roles. A team has four things hanging
   off it — members, crafts, regions and its own details — and a grid
   with a column per craft becomes unreadable at about eight.

   ── Members are people or contacts ──

   One of ours, or a supplier's contact. A subcontract gang is not made
   of Person records — those are staff — and forcing them to be would
   mean creating a Person for every jointer a supplier sends. Which of
   the two a team may draw on follows its Supplier_ID. */

const TABS = [
  { id: "members", label: "Members" },
  { id: "crafts", label: "Crafts" },
  { id: "regions", label: "Regions" },
  { id: "details", label: "Details" },
];

export default function TeamsAdmin() {
  const [teams, setTeams] = useState([]);
  const [crafts, setCrafts] = useState([]);
  const [regions, setRegions] = useState([]);
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [teamCrafts, setTeamCrafts] = useState([]);
  const [teamRegions, setTeamRegions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("members");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ Team_Name: "", Supplier_ID: "" });
  const [addPerson, setAddPerson] = useState("");

  async function load() {
    try {
      const [t, c, rg, p, r, tm, tc, tr] = await Promise.all([
        adminList("Team"), adminList("Craft"),
        adminList("Region").catch(() => ({ rows: [] })),
        adminList("Person"), adminList("Role").catch(() => ({ rows: [] })),
        adminList("Team_Member"), adminList("Team_Craft"), adminList("Team_Region"),
      ]);
      setTeams(t.rows || []);
      setCrafts(c.rows || []);
      setRegions(rg.rows || []);
      setPeople(p.rows || []);
      setRoles(r.rows || []);
      setMembers(tm.rows || []);
      setTeamCrafts(tc.rows || []);
      setTeamRegions(tr.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  /* Back to Members when another team is opened — landing on the last
     team's regions is a small surprise every time. */
  useEffect(() => { setTab("members"); setAddPerson(""); }, [selected]);

  const current = teams.find((t) => Number(t.Team_ID) === Number(selected)) ?? null;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => String(t.Team_Name ?? "").toLowerCase().includes(q));
  }, [teams, search]);

  const membersOf = (id) =>
    members.filter((m) => Number(m.Team_ID) === Number(id));
  const nameOf = (m) => {
    if (m.Person_ID != null) {
      return people.find((p) => Number(p.Person_ID) === Number(m.Person_ID))
        ?.Person_Name ?? `Person ${m.Person_ID}`;
    }
    /* A supplier's contact. The contacts themselves are not loaded here —
       they belong to the supplier and there may be thousands — so the
       row names what it can and says what it is. */
    return `Contact ${m.Contact_ID}`;
  };

  /* A team's contact details are its leader's.

     Not stored on the team: a leader changing would leave the team with
     the previous one's number, and nothing would say so. Derived, so it
     is right by construction and wrong only in the way the underlying
     record is wrong.

     Where nobody leads, or the leader is a supplier's contact whose
     details are not loaded here, the team has no contact details and the
     panel says so rather than showing a blank. */
  const leaderOf = (teamId) => {
    const m = membersOf(teamId).find((x) => x.Is_Team_Leader);
    if (!m) return null;
    if (m.Person_ID == null) return { contactOnly: true, member: m };
    const p = people.find((x) => Number(x.Person_ID) === Number(m.Person_ID));
    return p ? { person: p, member: m } : { missing: true, member: m };
  };

  const count = (id, teamId) => {
    if (!teamId) return 0;
    if (id === "members") return membersOf(teamId).length;
    if (id === "crafts") {
      return teamCrafts.filter((x) => Number(x.Team_ID) === Number(teamId)).length;
    }
    if (id === "regions") {
      return teamRegions.filter((x) => Number(x.Team_ID) === Number(teamId)).length;
    }
    return 0;
  };

  async function addTeam() {
    if (!draft.Team_Name.trim()) { setError("Give the team a name."); return; }
    setBusy("new");
    try {
      const created = await adminCreate("Team", {
        Team_Name: draft.Team_Name.trim(),
        Supplier_ID: draft.Supplier_ID ? Number(draft.Supplier_ID) : null,
        Active: true,
      });
      setTeams((ts) => [...ts, created]);
      setSelected(created.Team_ID);
      setDraft({ Team_Name: "", Supplier_ID: "" });
      setAdding(false);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function addMember(personId) {
    if (!personId) return;
    /* Refused here as well as by the index: a message beside the picker
       is more use than a database error, and the index is what makes it
       true rather than merely likely. */
    if (membersOf(current.Team_ID)
      .some((m) => Number(m.Person_ID) === Number(personId))) {
      setError("Already on this team.");
      return;
    }
    setBusy("member");
    try {
      const created = await adminCreate("Team_Member", {
        Team_ID: current.Team_ID, Person_ID: Number(personId),
        Contact_ID: null, Is_Team_Leader: false,
      });
      setMembers((ms) => [...ms, created]);
      setAddPerson("");
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function removeMember(id) {
    setBusy(`m:${id}`);
    try {
      await adminDelete("Team_Member", id);
      setMembers((ms) => ms.filter((m) => m.Team_Member_ID !== id));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  /* One leader per team.

     Not a constraint, because a team briefly having two while somebody
     changes their mind is harmless — but the old leader is stood down
     here so it does not need thinking about. */
  async function makeLeader(m) {
    setBusy(`l:${m.Team_Member_ID}`);
    try {
      const others = membersOf(current.Team_ID)
        .filter((x) => x.Is_Team_Leader && x.Team_Member_ID !== m.Team_Member_ID);
      for (const o of others) {
        await adminUpdate("Team_Member", o.Team_Member_ID, { Is_Team_Leader: false });
      }
      await adminUpdate("Team_Member", m.Team_Member_ID,
        { Is_Team_Leader: !m.Is_Team_Leader });
      setMembers((ms) => ms.map((x) => {
        if (x.Team_Member_ID === m.Team_Member_ID) {
          return { ...x, Is_Team_Leader: !m.Is_Team_Leader };
        }
        return others.some((o) => o.Team_Member_ID === x.Team_Member_ID)
          ? { ...x, Is_Team_Leader: false } : x;
      }));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  /* Crafts and regions are the same operation against two tables, so
     they are one function told which. */
  async function toggleLink(table, idField, rows, setRows, valueId) {
    const key = `${table}:${valueId}`;
    const existing = rows.find((x) =>
      Number(x.Team_ID) === Number(current.Team_ID)
      && Number(x[idField]) === Number(valueId));
    setBusy(key);
    try {
      if (existing) {
        await adminDelete(table, existing[`${table}_ID`]);
        setRows((xs) => xs.filter((x) =>
          x[`${table}_ID`] !== existing[`${table}_ID`]));
      } else {
        const created = await adminCreate(table, {
          Team_ID: current.Team_ID, [idField]: valueId,
        });
        setRows((xs) => [...xs, created]);
      }
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function saveDetails(patch) {
    setBusy("details");
    try {
      await adminUpdate("Team", current.Team_ID, patch);
      setTeams((ts) => ts.map((t) =>
        Number(t.Team_ID) === Number(current.Team_ID) ? { ...t, ...patch } : t));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  /* Renaming, in one place because two screens offer it.

     Returns whether the name was accepted, so a caller showing an input
     knows whether to close it or stay open with the bad value still
     there to correct. */
  async function renameTeam(raw) {
    const next = String(raw ?? "").trim();
    const saved = current?.Team_Name ?? "";
    if (!current) return false;
    if (next === saved) return true;      // nothing changed; no pointless write
    /* Team_Name is NOT NULL, and the endpoint turns an empty string into
       null on the way past — so an empty box would arrive as a database
       error about a constraint rather than as anything a person could
       act on. Caught here, where the answer is obvious. */
    if (!next) { setError("A team needs a name."); return false; }
    setError("");
    await saveDetails({ Team_Name: next });
    return true;
  }

  if (loading) return <p className="hint">Loading teams…</p>;

  return (
    <div className="tm">
      <style>{CSS}</style>
      {/* Named here rather than relying on the Admin menu to label it:
          this screen is also reached from Operations, where there is no
          menu beside it saying what you are looking at. */}
      <h2 className="admin-title">Teams</h2>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="tm-split">
        <div className="tm-list">
          <div className="tm-list-head">
            <input value={search} placeholder="Search teams…"
              onChange={(e) => setSearch(e.target.value)} />
            <button className="btn accent sm" onClick={() => setAdding(!adding)}>
              {adding ? "Cancel" : "+ Team"}
            </button>
          </div>

          {adding && (
            <div className="tm-new">
              <input autoFocus placeholder="Team name" value={draft.Team_Name}
                onChange={(e) => setDraft((d) => ({ ...d, Team_Name: e.target.value }))} />
              <input placeholder="Supplier ID (blank if ours)" value={draft.Supplier_ID}
                onChange={(e) => setDraft((d) => ({ ...d, Supplier_ID: e.target.value }))} />
              <button className="btn accent sm" disabled={busy === "new"}
                onClick={addTeam}>{busy === "new" ? "Adding\u2026" : "Add"}</button>
            </div>
          )}

          {!shown.length && <p className="tm-none">No teams match.</p>}
          {shown.map((t) => (
            <button key={t.Team_ID}
              className={Number(selected) === Number(t.Team_ID) ? "tm-item on" : "tm-item"}
              onClick={() => setSelected(t.Team_ID)}>
              <span className="tm-item-name">
                {t.Team_Name}
                {!t.Active && <span className="tm-off">inactive</span>}
              </span>
              <span className="tm-item-meta">
                {t.Supplier_ID ? "supplier" : "in-house"}
                {" \u00b7 "}
                {membersOf(t.Team_ID).length}
              </span>
            </button>
          ))}
        </div>

        <div className="tm-detail">
          {!current ? (
            <div className="tm-empty">Select a team to configure it.</div>
          ) : (
            <>
              <div className="tm-detail-head">
                <TeamHeading
                  key={current.Team_ID}
                  team={current}
                  busy={busy === "details"}
                  onRename={renameTeam}
                />
                <p className="tm-sub">
                  {current.Supplier_ID
                    ? `Supplier team \u00b7 supplier ${current.Supplier_ID}`
                    : "In-house team"}
                  {current.Rate ? ` \u00b7 \u00a3${current.Rate} per ${current.Rate_Unit || "day"}` : ""}
                </p>
                <TeamContact lead={leaderOf(current.Team_ID)} />
              </div>

              <div className="tm-tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t.id} role="tab"
                    aria-selected={tab === t.id}
                    className={tab === t.id ? "tm-tab on" : "tm-tab"}
                    onClick={() => setTab(t.id)}>
                    {t.label}
                    {count(t.id, current.Team_ID) > 0 && (
                      <span className="tm-tab-n">{count(t.id, current.Team_ID)}</span>
                    )}
                  </button>
                ))}
              </div>

              {tab === "members" && (
                <>
                  {!membersOf(current.Team_ID).length && (
                    <p className="tm-none">Nobody on this team yet.</p>
                  )}
                  {membersOf(current.Team_ID).map((m) => (
                    <div className="tm-member" key={m.Team_Member_ID}>
                      <span className="tm-member-name">{nameOf(m)}</span>
                      {m.Contact_ID != null && (
                        <span className="tm-badge">supplier contact</span>
                      )}
                      <button
                        className={m.Is_Team_Leader ? "tm-lead on" : "tm-lead"}
                        disabled={busy === `l:${m.Team_Member_ID}`}
                        title={m.Is_Team_Leader ? "Team leader" : "Make team leader"}
                        onClick={() => makeLeader(m)}>
                        {m.Is_Team_Leader ? "\u2605 Leader" : "\u2606"}
                      </button>
                      <button className="btn delete sm"
                        disabled={busy === `m:${m.Team_Member_ID}`}
                        onClick={() => removeMember(m.Team_Member_ID)}>Remove</button>
                    </div>
                  ))}

                  {/* Only our people can be added here.

                      A supplier team's contacts belong to that supplier
                      and are not loaded on this page. Existing contact
                      members are shown and can be removed; adding one
                      needs the supplier's contact list, which is its own
                      piece of work. */}
                  <div className="tm-add">
                    <select value={addPerson}
                      onChange={(e) => setAddPerson(e.target.value)}>
                      <option value="">Add someone…</option>
                      {people
                        .filter((p) => !membersOf(current.Team_ID)
                          .some((m) => Number(m.Person_ID) === Number(p.Person_ID)))
                        .map((p) => (
                          <option key={p.Person_ID} value={p.Person_ID}>
                            {p.Person_Name}
                          </option>
                        ))}
                    </select>
                    <button className="btn accent sm"
                      disabled={!addPerson || busy === "member"}
                      onClick={() => addMember(addPerson)}>
                      {busy === "member" ? "Adding\u2026" : "Add"}
                    </button>
                  </div>
                  {current.Supplier_ID && (
                    <p className="hint tm-note">
                      This is a supplier team. Supplier contacts can be
                      removed here but not yet added &mdash; that needs the
                      supplier&rsquo;s contact list.
                    </p>
                  )}
                </>
              )}

              {tab === "crafts" && (
                <LinkList rows={crafts} idField="Craft_ID" labelField="Craft_Name"
                  isOn={(id) => teamCrafts.some((x) =>
                    Number(x.Team_ID) === Number(current.Team_ID)
                    && Number(x.Craft_ID) === Number(id))}
                  busy={busy} table="Team_Craft"
                  onToggle={(id) => toggleLink("Team_Craft", "Craft_ID",
                    teamCrafts, setTeamCrafts, id)}
                  empty="No crafts set up." />
              )}

              {tab === "regions" && (
                <LinkList rows={regions} idField="Region_ID" labelField="Region"
                  isOn={(id) => teamRegions.some((x) =>
                    Number(x.Team_ID) === Number(current.Team_ID)
                    && Number(x.Region_ID) === Number(id))}
                  busy={busy} table="Team_Region"
                  onToggle={(id) => toggleLink("Team_Region", "Region_ID",
                    teamRegions, setTeamRegions, id)}
                  empty="No regions set up." />
              )}

              {tab === "details" && (
                /* Keyed on the team so it remounts when another is
                   opened. The fields hold their own draft state, and a
                   draft belonging to the previous team would otherwise
                   sit in the boxes looking like this one's. */
                <TeamDetails
                  key={current.Team_ID}
                  team={current}
                  teams={teams}
                  busy={busy === "details"}
                  onSave={saveDetails}
                  onRename={renameTeam}
                  onError={setError}
                />
              )}

              {tab !== "details" && !count("crafts", current.Team_ID)
                && tab === "crafts" && (
                <Banner kind="warn">
                  No crafts &mdash; this team won&rsquo;t be offered for any phase.
                </Banner>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* The team's name, with a way to change it.

   On the heading because that is where the name is, and it is the first
   place anyone looks to rename the thing they are looking at. The button
   is visible rather than the heading being quietly clickable: a control
   nobody can see is one nobody uses.

   The same field also appears on the Details tab, beside the team's
   other attributes. Both call one `onRename`, so there is a single
   answer to what an empty name does. */
function TeamHeading({ team, busy, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(team.Team_Name ?? "");

  async function commit() {
    const ok = await onRename(draft);
    /* Stays open when refused, with the offending text still there. The
       alternative — closing and reverting — throws away what was typed
       and leaves an error message about a box that is no longer on
       screen. */
    if (ok) setEditing(false);
  }

  function cancel() {
    setDraft(team.Team_Name ?? "");
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="tm-name-row">
        <h3>{team.Team_Name}</h3>
        <button className="btn edit sm"
          onClick={() => { setDraft(team.Team_Name ?? ""); setEditing(true); }}>
          Rename
        </button>
      </div>
    );
  }

  return (
    <div className="tm-name-row">
      <input className="tm-name-input" autoFocus value={draft} disabled={busy}
        aria-label="Team name"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") cancel();
        }} />
      <button className="btn edit sm" disabled={busy} onClick={commit}>
        {busy ? "Saving\u2026" : "Save"}
      </button>
      <button className="btn sm" disabled={busy} onClick={cancel}>Cancel</button>
    </div>
  );
}

/* A team's own attributes, including its name.

   Renaming happens here rather than on the heading above, because a
   heading that is secretly an input is a thing people find by accident
   or not at all — and this is where the team's other attributes already
   live.

   Mounted with `key={team.Team_ID}`, so each team gets a fresh set of
   drafts. The previous arrangement read `defaultValue` off the current
   team, which is only ever correct at mount; it looked right solely
   because opening another team resets the tab to Members and unmounted
   this. That was a coincidence holding a bug shut. */
function TeamDetails({ team, teams, busy, onSave, onRename, onError }) {
  const [name, setName] = useState(team.Team_Name ?? "");
  const [rate, setRate] = useState(team.Rate ?? "");
  const [unit, setUnit] = useState(team.Rate_Unit ?? "");

  const saved = team.Team_Name ?? "";

  /* Nothing stops two teams sharing a name in the schema, and there are
     legitimate reasons to allow it, so this warns rather than refuses.
     It is worth saying: the planning board shows the name and not the
     id, so two Gang 4s there are indistinguishable. */
  const clash = name.trim() && teams.some((t) =>
    Number(t.Team_ID) !== Number(team.Team_ID)
    && String(t.Team_Name ?? "").trim().toLowerCase() === name.trim().toLowerCase());

  async function commitName() {
    const ok = await onRename(name);
    /* Refused means empty. Put the saved name back, since an empty box
       left on screen looks like a name that has been cleared. */
    if (!ok) setName(saved);
  }

  function onNameKey(e) {
    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
    /* Escape abandons the edit. Without it the only way out of a
       half-typed name is to retype the old one from memory. */
    if (e.key === "Escape") { setName(saved); e.currentTarget.blur(); }
  }

  function commitRate() {
    const next = rate === "" ? null : Number(rate);
    if (next != null && !Number.isFinite(next)) {
      onError("Rate has to be a number.");
      setRate(team.Rate ?? "");
      return;
    }
    if (next === (team.Rate ?? null)) return;
    onError("");
    onSave({ Rate: next });
  }

  function commitUnit() {
    const next = unit.trim() || null;
    if (next === (team.Rate_Unit ?? null)) return;
    onError("");
    onSave({ Rate_Unit: next });
  }

  return (
    <div className="tm-details">
      <div className="tm-details-row">
        <label className="tm-fld tm-fld-name">
          <span>Team name</span>
          <input value={name} disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={onNameKey} />
        </label>

        <label className="tm-fld">
          <span>Rate</span>
          <input type="number" value={rate} disabled={busy}
            onChange={(e) => setRate(e.target.value)}
            onBlur={commitRate} />
        </label>

        <label className="tm-fld">
          <span>Rate unit</span>
          <input value={unit} placeholder="day" disabled={busy}
            onChange={(e) => setUnit(e.target.value)}
            onBlur={commitUnit} />
        </label>

        <label className="tm-fld tm-check">
          <input type="checkbox" checked={!!team.Active} disabled={busy}
            onChange={(e) => onSave({ Active: e.target.checked })} />
          <span>Active</span>
        </label>
      </div>

      {clash && (
        <p className="hint tm-clash">
          Another team is already called that. Allowed, but the planning
          board shows names rather than numbers, so the two will look
          identical there.
        </p>
      )}

      <p className="hint">
        An inactive team stays on past work but is not offered
        for new assignments.
      </p>
    </div>
  );
}

/* How to reach a team: its leader's email and telephone.

   Shown beside the team rather than tucked inside the Members tab,
   because ringing the gang is the commonest reason for opening a team at
   all and should not need a click.

   Every state says what it is. "No team leader set" and "leader has no
   telephone" are different problems with different fixes, and a blank
   would be neither. */
function TeamContact({ lead }) {
  if (!lead) {
    return (
      <p className="tm-contact none">
        No team leader set &mdash; no contact details.
      </p>
    );
  }
  if (lead.contactOnly) {
    return (
      <p className="tm-contact none">
        Led by a supplier contact &mdash; details are on the supplier record.
      </p>
    );
  }
  if (lead.missing) {
    return (
      <p className="tm-contact none">
        The team leader is not in the people list.
      </p>
    );
  }

  const { person } = lead;
  const bits = [];
  if (person.Email) bits.push(person.Email);
  if (person.Telephone) bits.push(person.Telephone);

  return (
    <p className="tm-contact">
      <span className="tm-contact-who">{person.Person_Name}</span>
      {bits.length
        ? bits.map((b, i) => <span key={i} className="tm-contact-bit">{b}</span>)
        : <span className="tm-contact-bit none">no email or telephone on record</span>}
    </p>
  );
}

/* A tick list against one lookup table. Crafts and regions ask the same
   question of different rows, so they are one component. */
function LinkList({ rows, idField, labelField, isOn, onToggle, busy, table, empty }) {
  if (!rows.length) return <p className="tm-none">{empty}</p>;
  return (
    <div className="tm-links">
      {rows.map((r) => {
        const id = r[idField];
        const on = isOn(id);
        return (
          <button key={id} className={on ? "tm-link on" : "tm-link"}
            disabled={busy === `${table}:${id}`}
            aria-pressed={on}
            onClick={() => onToggle(id)}>
            <span className={on ? "box on" : "box"}>{on ? "\u2713" : ""}</span>
            <span>{r[labelField]}</span>
          </button>
        );
      })}
    </div>
  );
}

const CSS = `
.tm-split { display: grid; grid-template-columns: 260px 1fr; gap: 18px; }
.tm-list { border-right: 1px solid var(--border); padding-right: 16px; }
.tm-list-head { display: flex; gap: 6px; margin-bottom: 10px; }
.tm-list-head input { flex: 1; min-width: 0; font: 500 12px inherit; padding: 6px 9px;
  border: 1px solid var(--border); border-radius: 6px; }
.tm-new { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;
  padding: 10px; background: var(--bg); border-radius: 8px; }
.tm-new input { font: 500 12px inherit; padding: 6px 9px;
  border: 1px solid var(--border); border-radius: 6px; }
.tm-item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  width: 100%; background: none; border: none; cursor: pointer; text-align: left;
  padding: 7px 9px; border-radius: 7px; }
.tm-item:hover { background: var(--bg); }
.tm-item.on { background: #eff6ff; }
.tm-item-name { font: 600 12.5px inherit; }
.tm-item-meta { font-size: 10.5px; color: var(--muted); }
.tm-off { font-size: 9.5px; font-weight: 700; color: #b91c1c; margin-left: 6px; }
.tm-none { font-size: 12px; color: var(--muted); margin: 10px 0; }
.tm-empty { color: var(--muted); font-size: 13px; padding: 40px 0; text-align: center; }
.tm-detail-head { padding-bottom: 12px; border-bottom: 1px solid var(--border);
  margin-bottom: 0; }
.tm-detail-head h3 { margin: 0; font-size: 16px; }
.tm-name-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
/* Sized to the heading it replaces, so committing a rename doesn't make
   the panel jump. */
.tm-name-input { font: 700 16px inherit; padding: 3px 8px; min-width: 220px;
  border: 1px solid var(--accent); border-radius: 6px; }
.tm-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.tm-contact { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px;
  margin: 6px 0 0; font-size: 12px; }
.tm-contact-who { font-weight: 700; }
.tm-contact-bit { color: var(--text); }
.tm-contact-bit.none, .tm-contact.none { color: var(--muted); font-style: italic; }
.tm-tabs { display: flex; gap: 2px; overflow-x: auto; margin: 0 0 14px;
  border-bottom: 1px solid var(--border); }
.tm-tab { background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; font: 600 12px inherit; padding: 7px 11px; color: var(--muted);
  white-space: nowrap; }
.tm-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.tm-tab-n { display: inline-block; margin-left: 6px; font-size: 10px;
  font-weight: 700; background: var(--bg); border-radius: 9px; padding: 1px 6px; }
.tm-tab.on .tm-tab-n { background: #eff6ff; color: var(--accent); }
.tm-member { display: flex; align-items: center; gap: 9px; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 7px; margin-bottom: 6px;
  font-size: 12.5px; }
.tm-member-name { flex: 1; font-weight: 600; }
.tm-badge { font: 700 9.5px inherit; padding: 2px 7px; border-radius: 4px;
  background: #f3e8ff; color: #7c3aed; }
.tm-lead { background: none; border: 1px solid var(--border); border-radius: 5px;
  cursor: pointer; font: 600 10.5px inherit; padding: 2px 8px; color: var(--muted); }
.tm-lead.on { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
.tm-x { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 16px; line-height: 1; padding: 0 3px; }
.tm-x:hover { color: #b91c1c; }
.tm-add { display: flex; gap: 7px; margin-top: 10px; }
.tm-add select { flex: 1; font: 500 12px inherit; padding: 6px 9px;
  border: 1px solid var(--border); border-radius: 6px; }
.tm-note { margin-top: 8px; }
.tm-links { display: flex; flex-direction: column; gap: 4px; }
.tm-link { display: flex; align-items: center; gap: 9px; background: none;
  border: 1px solid transparent; border-radius: 7px; cursor: pointer;
  font: 500 12.5px inherit; padding: 6px 9px; text-align: left; }
.tm-link:hover { background: var(--bg); }
.tm-link.on { background: #eff6ff; border-color: #bfdbfe; }
.tm-details { display: flex; flex-direction: column; gap: 10px; }
.tm-details-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
/* The name is the widest thing here and the one most often retyped in
   full, so it gets room rather than sharing a rate-sized box. */
.tm-fld-name { flex: 1 1 240px; }
.tm-fld-name input { width: 100%; }
.tm-clash { color: var(--warn-text); }
.tm-fld { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.tm-fld > span { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.tm-fld input { font: 500 12.5px inherit; padding: 6px 9px;
  border: 1px solid var(--border); border-radius: 6px; }
.tm-check { flex-direction: row; align-items: center; gap: 7px; }
.tm-check input { width: auto; }
`;
