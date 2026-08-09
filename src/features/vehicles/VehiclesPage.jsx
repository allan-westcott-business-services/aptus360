import { useState, useEffect, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import VehicleModal from "./VehicleModal.jsx";
import SubRecordModal from "./SubRecordModal.jsx";
import {
  SUB_KINDS, listedFields, newestByVehicle, dateUrgency,
  fmtDate, fmtMoney, fmtMiles,
} from "./vehicleMeta.js";

/* The fleet.

   A port of the original app's HSQE vehicles screen: a list of vehicles
   with MOT and insurance expiry shown as urgency badges, and a row that
   expands to the five histories hanging off it — insurance, MOT,
   services, maintenance and mileage readings.

   ── Why everything is loaded at once ──

   The original fetched each vehicle's five histories when its row was
   expanded, one request per section per expansion, every time. A fleet
   is tens of vehicles and its history is thousands of rows at the
   outside, so all six tables are fetched once here and filtered in
   memory. That is the same arrangement Teams uses, it makes expanding a
   row instant, and it is what lets the list show a count on each
   section without opening it.

   ── What the list is for ──

   Somebody opens this to answer "what is about to run out". So MOT and
   insurance expiry are columns rather than something behind an
   expansion, and they carry the days remaining once inside thirty. */

const DASH = "\u2014";

/* Sorting the list. Registration by default, because that is what
   somebody has in their hand when they come looking. */
const COLS = [
  { key: "Registration", label: "Registration" },
  { key: "make", label: "Make / model" },
  { key: "Vehicle_Type", label: "Type" },
  { key: "assignee", label: "Assigned to" },
  { key: "Current_Mileage", label: "Mileage", align: "right" },
  { key: "mot", label: "MOT expires" },
  { key: "insurance", label: "Insurance expires" },
  { key: "Status", label: "Status" },
];

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [people, setPeople] = useState([]);
  const [subs, setSubs] = useState(
    () => Object.fromEntries(SUB_KINDS.map((k) => [k.kind, []])));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [sort, setSort] = useState({ key: "Registration", dir: 1 });

  /* Which modal is open, if any. One piece of state rather than three
     booleans: two modals open at once is not a state this screen has,
     and holding it as three flags is how it becomes one. */
  const [editing, setEditing] = useState(null);   // { vehicle } or { vehicle: null }
  const [subEditing, setSubEditing] = useState(null); // { meta, vehicleId, record }

  const load = useCallback(async () => {
    try {
      const [v, p, ...rest] = await Promise.all([
        adminList("Vehicle"),
        adminList("Person"),
        ...SUB_KINDS.map((k) => adminList(k.table).catch(() => ({ rows: [] }))),
      ]);
      setVehicles(v.rows || []);
      setPeople(p.rows || []);
      setSubs(Object.fromEntries(
        SUB_KINDS.map((k, i) => [k.kind, rest[i]?.rows || []])));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const personName = useCallback((id) => {
    if (!id) return null;
    return people.find((p) => Number(p.Person_ID) === Number(id))?.Person_Name
      ?? `Person #${id}`;
  }, [people]);

  /* Newest cover per vehicle, for the two expiry columns. */
  const latestIns = useMemo(
    () => newestByVehicle(subs.insurance, "End_Date"), [subs.insurance]);
  const latestMot = useMemo(
    () => newestByVehicle(subs.mot, "Expiry_Date"), [subs.mot]);

  const rowsFor = useCallback((kind, vehicleId) => {
    const meta = SUB_KINDS.find((k) => k.kind === kind);
    return subs[kind]
      .filter((r) => Number(r.Vehicle_ID) === Number(vehicleId))
      .sort(meta.sort);
  }, [subs]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = vehicles.filter((v) => {
      if (!q) return true;
      return [v.Registration, v.Make, v.Model, v.Variant, v.Status, v.Vehicle_Type,
        personName(v.Assigned_To_Person_ID)]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
    const val = (v) => {
      switch (sort.key) {
        case "make": return [v.Make, v.Model, v.Variant].filter(Boolean).join(" ");
        case "assignee": return personName(v.Assigned_To_Person_ID) ?? "";
        case "mot": return latestMot[v.Vehicle_ID]?.Expiry_Date ?? "";
        case "insurance": return latestIns[v.Vehicle_ID]?.End_Date ?? "";
        case "Current_Mileage": return v.Current_Mileage ?? -1;
        default: return v[sort.key] ?? "";
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
      return String(x).localeCompare(String(y), "en-GB",
        { numeric: true, sensitivity: "base" }) * sort.dir;
    });
  }, [vehicles, search, sort, personName, latestMot, latestIns]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));
  }

  function toggleExpand(id) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(Number(id))) next.delete(Number(id));
      else next.add(Number(id));
      return next;
    });
  }

  /* ── Writes ───────────────────────────────────────────────── */

  async function saveVehicle(payload, fail) {
    setBusy("vehicle");
    try {
      if (editing.vehicle) {
        await adminUpdate("Vehicle", editing.vehicle.Vehicle_ID, payload);
        setVehicles((vs) => vs.map((v) =>
          Number(v.Vehicle_ID) === Number(editing.vehicle.Vehicle_ID)
            ? { ...v, ...payload } : v));
      } else {
        const created = await adminCreate("Vehicle", payload);
        setVehicles((vs) => [...vs, created]);
      }
      setEditing(null);
      setError("");
    } catch (e) { fail(e.message); }
    finally { setBusy(null); }
  }

  async function deleteVehicle(v) {
    if (!window.confirm(
      `Delete ${v.Registration}?\n\n`
      + "Its insurance, MOT, service, maintenance and mileage records "
      + "go with it. This cannot be undone.")) return;
    setBusy(`v:${v.Vehicle_ID}`);
    try {
      await adminDelete("Vehicle", v.Vehicle_ID, "Vehicle_ID");
      setVehicles((vs) => vs.filter((x) =>
        Number(x.Vehicle_ID) !== Number(v.Vehicle_ID)));
      /* The database cascades the five histories (0137). Dropping them
         here too keeps the counts right without a reload. */
      setSubs((s) => Object.fromEntries(Object.entries(s).map(([k, rows]) =>
        [k, rows.filter((r) => Number(r.Vehicle_ID) !== Number(v.Vehicle_ID))])));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function saveSub(payload, fail) {
    const { meta, vehicleId, record } = subEditing;
    setBusy("sub");
    try {
      let saved;
      if (record) {
        await adminUpdate(meta.table, record[meta.idField], payload);
        saved = { ...record, ...payload };
        setSubs((s) => ({
          ...s,
          [meta.kind]: s[meta.kind].map((r) =>
            r[meta.idField] === record[meta.idField] ? saved : r),
        }));
      } else {
        saved = await adminCreate(meta.table,
          { ...payload, Vehicle_ID: Number(vehicleId) }, meta.idField);
        setSubs((s) => ({ ...s, [meta.kind]: [...s[meta.kind], saved] }));
      }
      /* A mileage reading changes the vehicle's cached figure. The
         trigger in 0137 does the writing; this mirrors it locally so the
         row updates without a reload.

         Recomputed from the whole log rather than taken from the row
         just saved, because correcting a reading from three months ago
         must not drag the current figure back to it. */
      if (meta.kind === "mileage") {
        const rows = subs.mileage
          .filter((r) => Number(r.Vehicle_ID) === Number(vehicleId)
            && r.Log_ID !== record?.Log_ID)
          .concat(saved);
        const newest = rows.slice().sort((a, b) =>
          String(b.Reading_Date ?? "").localeCompare(String(a.Reading_Date ?? ""))
          || (Number(b.Log_ID ?? 0) - Number(a.Log_ID ?? 0)))[0];
        setVehicles((vs) => vs.map((v) => (Number(v.Vehicle_ID) === Number(vehicleId)
          ? {
            ...v,
            Current_Mileage: newest?.Mileage ?? null,
            Mileage_Recorded_On: newest?.Reading_Date ?? null,
          }
          : v)));
      }
      setSubEditing(null);
      setError("");
    } catch (e) { fail(e.message); }
    finally { setBusy(null); }
  }

  async function deleteSub(meta, row) {
    if (!window.confirm(`Delete this ${meta.one}?\nThis cannot be undone.`)) return;
    setBusy(`s:${meta.kind}:${row[meta.idField]}`);
    try {
      await adminDelete(meta.table, row[meta.idField], meta.idField);
      setSubs((s) => ({
        ...s,
        [meta.kind]: s[meta.kind].filter((r) => r[meta.idField] !== row[meta.idField]),
      }));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  if (loading) return <p className="hint">Loading vehicles&hellip;</p>;

  return (
    <div className="vh">
      <style>{CSS}</style>

      <div className="vh-head">
        <div>
          <h2>
            Vehicles
            <span className="vh-count">
              {shown.length === vehicles.length
                ? `(${vehicles.length})`
                : `(${shown.length} of ${vehicles.length})`}
            </span>
          </h2>
          <p className="vh-sub">
            Insurance, MOT, services, maintenance and mileage are recorded
            per vehicle &mdash; expand a row to see and add each.
          </p>
        </div>
        <div className="vh-head-actions">
          <input className="vh-search" value={search} placeholder="Search reg, make, assignee…"
            onChange={(e) => setSearch(e.target.value)} />
          <button className="btn edit sm" onClick={() => setEditing({ vehicle: null })}>
            + Add vehicle
          </button>
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {!shown.length ? (
        <p className="vh-none">
          {search ? "No vehicles match the search."
            : "No vehicles yet. Add one to start."}
        </p>
      ) : (
        <table className="vh-table">
          <thead>
            <tr>
              <th className="vh-chev" />
              {COLS.map((c) => (
                <th key={c.key} className={c.align === "right" ? "r" : ""}>
                  <button className="vh-sort" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sort.key === c.key && (
                      <span className="vh-arrow">{sort.dir > 0 ? "\u25B2" : "\u25BC"}</span>
                    )}
                  </button>
                </th>
              ))}
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => {
              const open = expanded.has(Number(v.Vehicle_ID));
              const mot = latestMot[v.Vehicle_ID];
              const ins = latestIns[v.Vehicle_ID];
              return [
                <tr key={v.Vehicle_ID} className={open ? "vh-row on" : "vh-row"}>
                  <td className="vh-chev">
                    <button className="vh-toggle"
                      aria-expanded={open}
                      aria-label={open ? `Collapse ${v.Registration}` : `Expand ${v.Registration}`}
                      onClick={() => toggleExpand(v.Vehicle_ID)}>
                      {open ? "\u25BC" : "\u25B6"}
                    </button>
                  </td>
                  <td className="vh-reg-cell">{v.Registration}</td>
                  <td>{[v.Make, v.Model, v.Variant].filter(Boolean).join(" ") || muted(DASH)}</td>
                  <td>{v.Vehicle_Type || muted(DASH)}</td>
                  <td>{personName(v.Assigned_To_Person_ID) ?? muted("Unassigned")}</td>
                  <td className="r num">{fmtMiles(v.Current_Mileage)}</td>
                  <td><ExpiryBadge date={mot?.Expiry_Date} /></td>
                  <td><ExpiryBadge date={ins?.End_Date} /></td>
                  <td><StatusPill status={v.Status} /></td>
                  <td className="r nowrap">
                    <button className="btn edit sm"
                      onClick={() => setEditing({ vehicle: v })}>Edit</button>
                    <button className="btn delete sm"
                      disabled={busy === `v:${v.Vehicle_ID}`}
                      onClick={() => deleteVehicle(v)}>Delete</button>
                  </td>
                </tr>,
                open && (
                  <tr key={`${v.Vehicle_ID}-sub`} className="vh-subrow">
                    <td colSpan={COLS.length + 2}>
                      <div className="vh-subwrap">
                        {SUB_KINDS.map((meta) => (
                          <HistoryCard
                            key={meta.kind}
                            meta={meta}
                            rows={rowsFor(meta.kind, v.Vehicle_ID)}
                            personName={personName}
                            busy={busy}
                            onAdd={() => setSubEditing({
                              meta, vehicleId: v.Vehicle_ID, record: null })}
                            onEdit={(r) => setSubEditing({
                              meta, vehicleId: v.Vehicle_ID, record: r })}
                            onDelete={(r) => deleteSub(meta, r)}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <VehicleModal
          vehicle={editing.vehicle}
          people={people}
          busy={busy === "vehicle"}
          onSave={saveVehicle}
          onClose={() => setEditing(null)}
        />
      )}

      {subEditing && (
        <SubRecordModal
          meta={subEditing.meta}
          record={subEditing.record}
          people={people}
          busy={busy === "sub"}
          onSave={saveSub}
          onClose={() => setSubEditing(null)}
        />
      )}
    </div>
  );
}

const muted = (t) => <span className="vh-muted">{t}</span>;

/* An expiry date, coloured by how close it is.

   The number of days is shown only when it is worth acting on: an MOT
   eight months out is just a date, one that ran out last week is a van
   that should not be moving. */
function ExpiryBadge({ date }) {
  if (!date) return <span className="vh-muted">{DASH}</span>;
  const { level, days } = dateUrgency(date);
  const tail = level === "expired" ? ` (${Math.abs(days)}d ago)`
    : level === "warn" ? ` (${days}d)`
      : "";
  return <span className={`vh-badge ${level}`}>{fmtDate(date)}{tail}</span>;
}

function StatusPill({ status }) {
  const cls = status === "Active" ? "ok"
    : status === "Off-Road" ? "warn" : "off";
  return <span className={`vh-pill ${cls}`}>{status || DASH}</span>;
}

/* One history section: a header with its count and an add button, and
   the rows beneath. Columns come from the kind's field list, so a field
   added to the form appears here too. */
function HistoryCard({ meta, rows, personName, busy, onAdd, onEdit, onDelete }) {
  const cols = listedFields(meta);

  const cell = (row, f) => {
    const v = row[f.id];
    switch (f.format) {
      case "money": return fmtMoney(v);
      case "miles": return fmtMiles(v);
      case "date": return fmtDate(v);
      case "expiry": return <ExpiryBadge date={v} />;
      case "person": return personName(v) ?? muted("Unassigned");
      case "status": return <ServicePill status={v} />;
      default: return v == null || v === "" ? muted(DASH) : String(v);
    }
  };

  return (
    <div className="vh-card">
      <div className="vh-card-head">
        <span className="vh-card-title">
          {meta.title}
          <span className="vh-card-n">{rows.length ? `(${rows.length})` : "(none yet)"}</span>
        </span>
        <button className="btn edit sm" onClick={onAdd}>+ {meta.addLabel}</button>
      </div>

      {!rows.length ? (
        <p className="vh-card-empty">{meta.empty}</p>
      ) : (
        <table className="vh-subtable">
          <thead>
            <tr>
              {cols.map((f) => (
                <th key={f.id} className={f.align === "right" ? "r" : ""}>{f.label}</th>
              ))}
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[meta.idField]}>
                {cols.map((f) => (
                  <td key={f.id}
                    className={[f.align === "right" ? "r" : "",
                      f.format === "miles" ? "num" : ""].filter(Boolean).join(" ")}>
                    {cell(r, f)}
                  </td>
                ))}
                <td className="r nowrap">
                  <button className="btn edit sm" onClick={() => onEdit(r)}>Edit</button>
                  <button className="btn delete sm"
                    disabled={busy === `s:${meta.kind}:${r[meta.idField]}`}
                    onClick={() => onDelete(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ServicePill({ status }) {
  const cls = status === "Completed" ? "ok"
    : status === "Overdue" ? "bad"
      : status === "Cancelled" ? "off" : "warn";
  return <span className={`vh-pill ${cls}`}>{status || DASH}</span>;
}

const CSS = `
.vh-head { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.vh-head h2 { margin: 0; font-size: 18px; }
.vh-count { font-size: 12px; font-weight: 500; color: var(--muted); margin-left: 8px; }
.vh-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 72ch; }
.vh-head-actions { display: flex; gap: 8px; align-items: center; }
.vh-search { width: 280px; max-width: 46vw; font: 500 12.5px inherit; padding: 7px 11px;
  border: 1px solid var(--border); border-radius: 7px; background: var(--bg); }
.vh-none { padding: 40px; text-align: center; color: var(--muted);
  font-size: 13px; font-style: italic; }
.vh-muted { color: var(--muted); }

.vh-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.vh-table thead th { background: var(--accent); color: #fff; text-align: left;
  font-size: 11px; font-weight: 600; padding: 0; white-space: nowrap; }
.vh-table thead th:first-child { border-radius: 8px 0 0 0; }
.vh-table thead th:last-child { border-radius: 0 8px 0 0; }
.vh-sort { width: 100%; background: none; border: none; color: inherit; font: inherit;
  cursor: pointer; padding: 9px 10px; text-align: inherit; display: flex;
  align-items: center; gap: 5px; }
.vh-table thead th.r .vh-sort { justify-content: flex-end; }
.vh-arrow { font-size: 8px; }
.vh-table tbody td { padding: 8px 10px; border-bottom: 1px solid #f1f3f6;
  vertical-align: middle; }
.vh-row:hover td { background: var(--bg); }
.vh-row.on td { background: #eff6ff; }
.vh-chev { width: 32px; text-align: center; }
.vh-toggle { background: none; border: none; cursor: pointer; color: var(--accent);
  font-size: 10px; padding: 4px 6px; line-height: 1; }
.vh-reg-cell { font-weight: 700; letter-spacing: .04em; white-space: nowrap; }
.vh-table .r { text-align: right; }
.vh-table .num { font-variant-numeric: tabular-nums; }
.vh-table .nowrap { white-space: nowrap; }
.vh-table .nowrap .btn + .btn { margin-left: 4px; }

.vh-badge { display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-size: 11px; font-weight: 600; white-space: nowrap; }
.vh-badge.ok { background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border); }
.vh-badge.warn { background: var(--warn-bg); color: var(--warn-text); border: 1px solid var(--warn-border); }
.vh-badge.expired { background: var(--err-bg); color: var(--err-text); border: 1px solid var(--err-border); }
.vh-pill { display: inline-block; padding: 2px 9px; border-radius: 10px;
  font-size: 11px; font-weight: 600; white-space: nowrap; }
.vh-pill.ok { background: var(--ok-bg); color: var(--ok-text); }
.vh-pill.warn { background: var(--warn-bg); color: var(--warn-text); }
.vh-pill.bad { background: var(--err-bg); color: var(--err-text); }
.vh-pill.off { background: #f3f4f6; color: #6b7280; }

/* ═══ EXPANDED ROW ══════════════════════════════════════════════ */
.vh-subrow > td { padding: 0 !important; background: #f8fafc;
  border-left: 3px solid var(--accent); border-bottom: 1px solid var(--border); }
.vh-subwrap { padding: 14px 18px; display: flex; flex-direction: column; gap: 12px; }
.vh-card { background: var(--white); border: 1px solid var(--border);
  border-radius: 8px; overflow: hidden; }
.vh-card-head { display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 7px 12px; background: #f8f9fb; border-bottom: 1px solid var(--border); }
.vh-card-title { font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: #374151; }
.vh-card-n { font-weight: 500; color: var(--muted); text-transform: none;
  letter-spacing: 0; margin-left: 6px; }
.vh-card-empty { margin: 0; padding: 11px 14px; font-size: 12px;
  color: var(--muted); font-style: italic; }
.vh-subtable { width: 100%; border-collapse: collapse; font-size: 12px; }
.vh-subtable thead th { background: #f0f4fa; color: var(--muted); font-size: 10px;
  text-transform: uppercase; letter-spacing: .04em; font-weight: 600;
  padding: 6px 12px; text-align: left; white-space: nowrap; }
.vh-subtable thead th.r, .vh-subtable td.r { text-align: right; }
.vh-subtable td { padding: 6px 12px; border-top: 1px solid #f3f4f6; }
.vh-subtable td.num { font-variant-numeric: tabular-nums; }
.vh-subtable .nowrap { white-space: nowrap; }
.vh-subtable .nowrap .btn + .btn { margin-left: 4px; }

/* ═══ MODALS ════════════════════════════════════════════════════
   Own backdrop rather than borrowing the GIS one: a class defined
   inside another feature's style block only exists while that feature
   is mounted, and this screen never mounts the canvas. */
.vh-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, .34);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
  padding: 20px; }
.vh-modal { background: var(--white); border-radius: 14px; padding: 20px 24px;
  width: 780px; max-width: 100%; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .3); }
.vh-modal-sm { width: 620px; }
.vh-modal-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.vh-modal-head h2 { flex: 1; margin: 0; font-size: 16px; font-weight: 700;
  color: var(--accent); }
.vh-close { background: none; border: none; font-size: 22px; line-height: 1;
  cursor: pointer; color: var(--muted); padding: 0 2px; }
.vh-close:hover { color: var(--text); }
.vh-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.vh-grid-2 { grid-template-columns: repeat(2, 1fr); }
.vh-span2 { grid-column: span 2; }
.vh-span3 { grid-column: 1 / -1; }
.vh-fld { display: flex; flex-direction: column; gap: 3px; font-size: 12px; min-width: 0; }
.vh-fld > span { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.vh-fld input, .vh-fld select, .vh-fld textarea {
  font: 500 12.5px inherit; padding: 6px 9px; width: 100%;
  border: 1px solid var(--border); border-radius: 6px; background: var(--white); }
.vh-fld textarea { resize: vertical; }
.vh-reg { text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
.vh-note { grid-column: 1 / -1; margin: 0; font-size: 11.5px; color: var(--muted); }
.vh-msg { margin: 10px 0 0; font-size: 12px; color: var(--err-text); }
.vh-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

@media (max-width: 900px) {
  .vh-grid { grid-template-columns: repeat(2, 1fr); }
  .vh-search { width: 200px; }
}
`;
