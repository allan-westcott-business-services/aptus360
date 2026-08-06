import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminDelete } from "../../api/admin.js";
import { NAV_SECTIONS } from "../../lib/navigation.js";

/* People and roles, master-detail rather than a matrix.

   A grid grows a column per role and becomes unreadable by about eight.
   Here the role list runs vertically inside the detail panel, so it scales
   regardless. Two directions because the app needs both: editing is
   person-first ("what does Sam do?"), while every dropdown in the app is
   role-first ("who are the estimators?") — see fillSelRole in the original. */
/* Why somebody is away.

   A fixed list so the same absence is called the same thing every time —
   free text gave "hol", "Holiday" and "A/L" for one reason, which makes
   counting sickness across a year impossible. */
/* The tabs on a person.

   Counts on the tab rather than only inside it: whether somebody has any
   regions is worth seeing without opening the tab, and a person with no
   roles is worth spotting from here.

   Menu access and certification are listed because they were asked for
   and because their absence should be visible rather than silent — each
   says what it would take. */
const PERSON_TABS = [
  { id: "roles", label: "Roles" },
  { id: "regions", label: "Regions" },
  { id: "away", label: "Absence" },
  { id: "menu", label: "Menu Access" },
  { id: "certs", label: "Certification" },
];

export const AWAY_REASONS = [
  "Holiday",
  "Sickness",
  "Training",
  "Parental Leave",
  "Maternity",
  "Compassionate",
];

export default function PeopleRolesAdmin() {
  /* Which tab of the person panel is open.

     Not remembered between people: opening somebody's record to check
     their roles and landing on last person's absences is a small
     surprise every time. Roles is where the panel starts because it is
     the thing most often being looked at. */

  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [map, setMap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [by, setBy] = useState("person");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({ Person_Name: "", Email: "", Telephone: "" });
  const [adding, setAdding] = useState(false);

  /* Where somebody works, and when they are not working. Both belong on
     the person rather than in pages of their own: they are answered
     while looking at that person, not by opening a list of absences. */
  const [regions, setRegions] = useState([]);
  const [personRegions, setPersonRegions] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [away, setAway] = useState({ Start_DateTime: "", End_DateTime: "", Reason: "" });

  /* What each person may see in the sidebar.

     Absent means hidden, so somebody new sees nothing until it is
     granted. The other way round — everything visible until revoked —
     means forgetting to revoke leaves a leaver with the run of the
     place, and forgetting is the common case. */
  const [menuVisible, setMenuVisible] = useState([]);
  const [ptab, setPtab] = useState("roles");

  /* What each tab holds, for the badge.

     Zero shows nothing rather than a nought — a badge reading 0 is the
     same information as no badge and more to read. */
  const tabCount = (id, person) => {
    if (!person) return 0;
    const pid = Number(person.Person_ID);
    if (id === "roles") return rolesOf(pid).length;
    if (id === "regions") {
      return personRegions.filter((x) => Number(x.Person_ID) === pid).length;
    }
    if (id === "away") {
      /* Only what is still to come or in progress. A badge counting five
         years of past holidays says nothing about this person now. */
      const now = new Date().toISOString();
      return holidays.filter((x) => Number(x.Person_ID) === pid
        && String(x.End_DateTime) >= now).length;
    }
    if (id === "menu") {
      return menuVisible.filter((x) => Number(x.Person_ID) === pid).length;
    }
    return 0;
  };

  async function load() {
    try {
      const [p, r, m, rg, pr, ph, mv] = await Promise.all([
        adminList("Person"), adminList("Role"), adminList("Person_Role"),
        /* Regions and absences, fetched softly: a database without the
           0113 tables should still show people and roles rather than an
           error where the page used to be. */
        adminList("Region").catch(() => ({ rows: [] })),
        adminList("Person_Region").catch(() => ({ rows: [] })),
        adminList("Person_Holiday").catch(() => ({ rows: [] })),
        adminList("Person_Menu_Visible").catch(() => ({ rows: [] })),
      ]);
      setPeople(p.rows || []);
      setRoles(r.rows || []);
      setMap(m.rows || []);
      setRegions(rg.rows || []);
      setPersonRegions(pr.rows || []);
      setHolidays(ph.rows || []);
      setMenuVisible(mv.rows || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  /* Back to Roles when a different person is opened. */
  useEffect(() => { setPtab("roles"); }, [selected]);

  const held = useMemo(() => {
    const s = new Set();
    map.forEach((m) => s.add(`${m.Person_ID}:${m.Role_ID}`));
    return s;
  }, [map]);

  const rolesOf = (pid) => roles.filter((r) => held.has(`${pid}:${r.Role_ID}`));
  const peopleIn = (rid) => people.filter((p) => held.has(`${p.Person_ID}:${rid}`));

  /* A region on or off for this person. The same shape as a role,
     because it is the same question about a different list. */
  async function toggleRegion(personId, regionId) {
    const key = `rg:${personId}:${regionId}`;
    const existing = personRegions.find((x) =>
      Number(x.Person_ID) === Number(personId)
      && Number(x.Region_ID) === Number(regionId));
    setBusy(key);
    try {
      if (existing) {
        await adminDelete("Person_Region", existing.Person_Region_ID);
        setPersonRegions((xs) => xs.filter((x) =>
          x.Person_Region_ID !== existing.Person_Region_ID));
      } else {
        const created = await adminCreate("Person_Region", {
          Person_ID: personId, Region_ID: regionId,
        });
        setPersonRegions((xs) => [...xs, created]);
      }
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  /* Granting or revoking one item. */
  async function toggleMenu(personId, key) {
    const busyKey = `mv:${key}`;
    const existing = menuVisible.find((x) =>
      Number(x.Person_ID) === Number(personId) && x.Menu_Key === key);
    setBusy(busyKey);
    try {
      if (existing) {
        await adminDelete("Person_Menu_Visible", existing.Person_Menu_Visible_ID);
        setMenuVisible((xs) => xs.filter((x) =>
          x.Person_Menu_Visible_ID !== existing.Person_Menu_Visible_ID));
      } else {
        const created = await adminCreate("Person_Menu_Visible", {
          Person_ID: personId, Menu_Key: key,
        });
        setMenuVisible((xs) => [...xs, created]);
      }
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  /* A whole section at once.

     Sections have up to ten items and granting them one at a time is ten
     round trips and ten chances to miss one. Written one row at a time
     because that is what the endpoint takes; the failure of one is
     reported rather than the rest being abandoned. */
  async function toggleSection(personId, section, grant) {
    setBusy(`sec:${section.id}`);
    try {
      const keys = section.items.filter((i) => i.built).map((i) => i.view);
      const mine = menuVisible.filter((x) => Number(x.Person_ID) === Number(personId));
      const added = [];
      const removedIds = [];

      for (const key of keys) {
        const existing = mine.find((x) => x.Menu_Key === key);
        if (grant && !existing) {
          added.push(await adminCreate("Person_Menu_Visible", {
            Person_ID: personId, Menu_Key: key,
          }));
        } else if (!grant && existing) {
          await adminDelete("Person_Menu_Visible", existing.Person_Menu_Visible_ID);
          removedIds.push(existing.Person_Menu_Visible_ID);
        }
      }

      setMenuVisible((xs) => [
        ...xs.filter((x) => !removedIds.includes(x.Person_Menu_Visible_ID)),
        ...added,
      ]);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function addAway(personId) {
    if (!away.Start_DateTime || !away.End_DateTime) {
      setError("Give both a start and an end.");
      return;
    }
    /* Checked here as well as by the table's constraint: a message
       beside the fields is more use than a database error, and the
       constraint is what makes it true rather than merely likely. */
    if (away.End_DateTime < away.Start_DateTime) {
      setError("The end is before the start.");
      return;
    }
    setBusy("away");
    try {
      const created = await adminCreate("Person_Holiday", {
        Person_ID: personId,
        Start_DateTime: away.Start_DateTime,
        End_DateTime: away.End_DateTime,
        Reason: away.Reason.trim() || null,
      });
      setHolidays((xs) => [...xs, created]);
      setAway({ Start_DateTime: "", End_DateTime: "", Reason: "" });
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function removeAway(id) {
    setBusy(`away:${id}`);
    try {
      await adminDelete("Person_Holiday", id);
      setHolidays((xs) => xs.filter((x) => x.Person_Holiday_ID !== id));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

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
      setDraft({ Person_Name: "", Email: "", Telephone: "" });
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
                {/* Optional, but worth asking for: a team's number is its
                    leader's, so a person with none can lead a gang
                    nobody can ring. */}
                <input
                  placeholder="Telephone (optional)"
                  value={draft.Telephone}
                  onChange={(e) => setDraft((d) => ({ ...d, Telephone: e.target.value }))}
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
                {by === "person" && (
                  <p className="pr-mail">
                    {current.Email || "no email"}
                    {current.Telephone ? ` \u00b7 ${current.Telephone}` : ""}
                  </p>
                )}
                {by === "role" && current.Role_Code && (
                  <p className="pr-mail mono">{current.Role_Code}</p>
                )}
              </div>

              {/* Tabs, so one person's configuration does not become one
                  long scroll.

                  Only in person view: a role has one thing to show — who
                  holds it — and a strip of one tab is furniture.

                  The panels are all about the same person, so the tabs
                  carry no state of their own beyond which is open; each
                  reads the same `current`. */}
              {by === "person" && (
                <div className="pr-tabs" role="tablist">
                  {PERSON_TABS.map((t) => (
                    <button key={t.id} role="tab"
                      aria-selected={ptab === t.id}
                      className={ptab === t.id ? "pr-tab on" : "pr-tab"}
                      onClick={() => setPtab(t.id)}>
                      {t.label}
                      {tabCount(t.id, current) > 0 && (
                        <span className="pr-tab-n">{tabCount(t.id, current)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {(by === "role" || ptab === "roles") && (
              <p className="panel-label">
                {by === "person" ? "Roles held" : "People in this role"}
              </p>
              )}

              {(by === "role" || ptab === "roles") && (
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
              )}

              {by === "person" && ptab === "roles"
                && rolesOf(current.Person_ID).length === 0 && (
                <Banner kind="warn">
                  No roles assigned &mdash; this person won&rsquo;t appear in any picker.
                </Banner>
              )}

              {/* Regions and absences hang off the person, not the role.

                  Looking at a role and asking which regions it covers is
                  not a question anybody has — the regions belong to the
                  person, and a role is a list of people. */}
              {by === "person" && (
                <>
                  {ptab === "regions" && (
                  <>
                  <p className="panel-label">Regions covered</p>
                  {!regions.length ? (
                    <p className="pr-none">
                      No regions set up. Add them under Region first.
                    </p>
                  ) : (
                    <div className="pr-rows">
                      {regions.map((rg) => {
                        const on = personRegions.some((x) =>
                          Number(x.Person_ID) === Number(current.Person_ID)
                          && Number(x.Region_ID) === Number(rg.Region_ID));
                        const key = `rg:${current.Person_ID}:${rg.Region_ID}`;
                        return (
                          <button key={rg.Region_ID}
                            className={on ? "pr-row on" : "pr-row"}
                            disabled={busy === key}
                            aria-pressed={on}
                            onClick={() => toggleRegion(current.Person_ID, rg.Region_ID)}>
                            <span className={on ? "box on" : "box"}>
                              {on ? "\u2713" : ""}
                            </span>
                            <span className="pr-row-label">{rg.Region}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  </>
                  )}

                  {ptab === "away" && (
                  <>
                  <p className="panel-label">Away from work</p>
                  <AwayList
                    rows={holidays.filter((h) =>
                      Number(h.Person_ID) === Number(current.Person_ID))}
                    busy={busy}
                    onRemove={removeAway} />

                  <div className="pr-away-add">
                    <input type="datetime-local" value={away.Start_DateTime}
                      aria-label="Away from"
                      onChange={(e) => setAway((a2) => ({
                        ...a2, Start_DateTime: e.target.value,
                      }))} />
                    <span className="pr-to">to</span>
                    <input type="datetime-local" value={away.End_DateTime}
                      aria-label="Away until"
                      onChange={(e) => setAway((a2) => ({
                        ...a2, End_DateTime: e.target.value,
                      }))} />
                    {/* A list rather than free text.

                        Typed reasons come back as "hol", "Holiday",
                        "annual leave" and "A/L", which is four things
                        to nobody's benefit — and it makes counting
                        sickness across a year impossible.

                        Held in the file rather than a table because it
                        is a short fixed list nobody administers. If it
                        needs adding to often, it wants a lookup. */}
                    <select value={away.Reason} aria-label="Reason"
                      onChange={(e) => setAway((a2) => ({
                        ...a2, Reason: e.target.value,
                      }))}>
                      <option value="">Reason…</option>
                      {AWAY_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <button className="btn accent sm" disabled={busy === "away"}
                      onClick={() => addAway(current.Person_ID)}>
                      {busy === "away" ? "Adding\u2026" : "Add"}
                    </button>
                  </div>
                  </>
                  )}

                  {/* Said rather than shown as an empty panel.

                      Menu access in the original is its own admin screen
                      driven by Role_Menu_Defaults — access follows the
                      role, with per-person overrides — so it is not a
                      port of anything to put it here. Certification does
                      not exist per person at all: Gas_Safe_No and the
                      rest are columns on Supplier. Both are decisions
                      rather than transcriptions. */}
                  {ptab === "menu" && (
                    <>
                      <p className="panel-label">Menu access</p>
                      <p className="hint pr-menu-note">
                        Ticked items appear in this person&rsquo;s sidebar.
                        Nothing is visible until it is granted.
                      </p>

                      {/* The sections come from navigation.js, the same
                          definition the sidebar renders from, so the two
                          cannot disagree about what pages exist.

                          Only built pages are offered: granting access
                          to a placeholder gives somebody a menu item
                          that goes nowhere. */}
                      {NAV_SECTIONS.map((sec) => {
                        const items = sec.items.filter((i) => i.built);
                        if (!items.length) return null;
                        const on = items.filter((i) => menuVisible.some((x) =>
                          Number(x.Person_ID) === Number(current.Person_ID)
                          && x.Menu_Key === i.view)).length;
                        return (
                          <div className="pr-menu-sec" key={sec.id}>
                            <div className="pr-menu-head">
                              <span className="pr-menu-dot"
                                style={{ background: sec.colour }} />
                              <strong>{sec.label}</strong>
                              <span className="pr-menu-count">
                                {on} of {items.length}
                              </span>
                              <button className="pr-menu-all"
                                disabled={busy === `sec:${sec.id}`}
                                onClick={() => toggleSection(
                                  current.Person_ID, sec, on < items.length)}>
                                {on < items.length ? "Grant all" : "Revoke all"}
                              </button>
                            </div>
                            {items.map((i) => {
                              const granted = menuVisible.some((x) =>
                                Number(x.Person_ID) === Number(current.Person_ID)
                                && x.Menu_Key === i.view);
                              return (
                                <button key={i.view}
                                  className={granted ? "pr-row on" : "pr-row"}
                                  disabled={busy === `mv:${i.view}`}
                                  aria-pressed={granted}
                                  onClick={() => toggleMenu(current.Person_ID, i.view)}>
                                  <span className={granted ? "box on" : "box"}>
                                    {granted ? "\u2713" : ""}
                                  </span>
                                  <span className="pr-row-label">{i.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}

                      {/* Said plainly: an empty sidebar looks like a
                          broken sign-in rather than a permissions
                          decision. */}
                      {!menuVisible.some((x) =>
                        Number(x.Person_ID) === Number(current.Person_ID)) && (
                        <Banner kind="warn">
                          Nothing granted &mdash; this person will see an empty sidebar.
                        </Banner>
                      )}
                    </>
                  )}

                  {ptab === "certs" && (
                    <div className="pr-todo">
                      <p className="panel-label">Certification</p>
                      <p>
                        Not built. The original holds Gas Safe, CSCS and
                        NRSWA numbers on <strong>Supplier</strong>, not on
                        a person, and has no certification table &mdash; so
                        this is new work rather than a port. A card with an
                        expiry date wants its own table.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Someone's time away, newest first.

   Dates read as people say them — "14 Sep, 9:00am" — rather than as the
   database holds them. A timestamp shown raw makes somebody work out
   whether 2026-09-14T09:00:00+01:00 is the morning they meant. */
function AwayList({ rows = [], busy, onRemove }) {
  if (!rows.length) {
    return <p className="pr-none">Nothing recorded. This person is available.</p>;
  }

  const when = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const day = d.toLocaleDateString("en-GB",
      { day: "numeric", month: "short", year: "2-digit" });
    /* Midnight is how a whole day is stored, and printing "00:00"
       against it makes a day off look like a precise appointment. */
    const midnight = d.getHours() === 0 && d.getMinutes() === 0;
    return midnight ? day
      : `${day}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const sorted = [...rows].sort((a, b) =>
    String(b.Start_DateTime).localeCompare(String(a.Start_DateTime)));

  return (
    <div>
      {sorted.map((h) => (
        <div className="pr-away" key={h.Person_Holiday_ID}>
          <span className="pr-away-when">
            {when(h.Start_DateTime)}
            {"\u2002\u2013\u2002"}
            {when(h.End_DateTime)}
          </span>
          <span className="pr-away-why">{h.Reason || ""}</span>
          <button className="btn delete sm"
            disabled={busy === `away:${h.Person_Holiday_ID}`}
            onClick={() => onRemove(h.Person_Holiday_ID)}>Delete</button>
        </div>
      ))}
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

/* The tab strip. Scrolls rather than wraps: five tabs on a narrow
   detail panel would otherwise make a second row and move everything
   below them down. */
.pr-tabs { display: flex; gap: 2px; overflow-x: auto; margin: 0 0 14px;
  border-bottom: 1px solid var(--border); }
.pr-tab { background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; font: 600 12px inherit; padding: 7px 11px; color: var(--muted);
  white-space: nowrap; }
.pr-tab:hover { color: var(--text); }
.pr-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.pr-tab-n { display: inline-block; margin-left: 6px; font-size: 10px;
  font-weight: 700; background: var(--bg); border-radius: 9px; padding: 1px 6px; }
.pr-tab.on .pr-tab-n { background: #eff6ff; color: var(--accent); }
.pr-menu-note { margin: 0 0 14px; }
.pr-menu-sec { margin-bottom: 16px; }
.pr-menu-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px;
  padding-bottom: 5px; border-bottom: 1px solid var(--border); }
.pr-menu-head strong { font-size: 12px; }
.pr-menu-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.pr-menu-count { font-size: 10.5px; color: var(--muted); }
.pr-menu-all { margin-left: auto; background: none; border: 1px solid var(--border);
  border-radius: 5px; cursor: pointer; font: 600 10px inherit; padding: 2px 8px;
  color: var(--accent); }
.pr-menu-all:disabled { opacity: .5; cursor: not-allowed; }
.pr-todo p:last-child { font-size: 12.5px; color: var(--muted); line-height: 1.65;
  margin: 6px 0 0; }
.pr-sep { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--border); }
.pr-none { font-size: 12px; color: var(--muted); margin: 6px 0; }
.pr-away { display: flex; align-items: center; gap: 10px; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 7px; margin-bottom: 6px;
  font-size: 12.5px; background: var(--white); }
.pr-away-when { font-weight: 600; white-space: nowrap; }
.pr-away-why { color: var(--muted); flex: 1; }
.pr-away-x { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 16px; line-height: 1; padding: 0 3px; }
.pr-away-x:hover { color: #b91c1c; }
/* Wraps rather than squeezing: two datetime fields and a reason do not
   fit one line in a detail panel at most window widths. */
.pr-away-add { display: flex; flex-wrap: wrap; align-items: center; gap: 7px;
  margin-top: 10px; }
.pr-away-add input { font: 500 12px inherit; padding: 5px 8px;
  border: 1px solid var(--border); border-radius: 6px; }
.pr-away-add input[placeholder] { flex: 1 1 140px; min-width: 120px; }
.pr-to { font-size: 11.5px; color: var(--muted); }
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
