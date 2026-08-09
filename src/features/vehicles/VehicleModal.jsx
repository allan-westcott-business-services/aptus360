import { useState } from "react";
import { FUEL_TYPES, VEHICLE_TYPES, STATUSES } from "./vehicleMeta.js";

/* Add or edit a vehicle.

   Registration is the only required field, as in the original: a van
   turns up with a plate and everything else gets filled in later, and a
   form that demanded the VIN before it would save would simply not be
   used.

   It is upper-cased and stripped of spaces on save because the unique
   index in 0137 is on that form. "AB12 CDE" and "ab12cde" are one van,
   and letting both in would put it on the list twice with two MOT
   expiries. */

const BLANK = {
  Registration: "", Make: "", Model: "", Variant: "", Year_Of_Manufacture: "",
  Colour: "", Fuel_Type: "", Vehicle_Type: "", VIN: "",
  Assigned_To_Person_ID: "", Status: "Active", Notes: "",
};

export default function VehicleModal({ vehicle, people, busy, onSave, onClose }) {
  const isNew = !vehicle?.Vehicle_ID;
  const [form, setForm] = useState(() => ({
    ...BLANK,
    ...Object.fromEntries(Object.keys(BLANK)
      .map((k) => [k, vehicle?.[k] ?? BLANK[k]])),
  }));
  const [msg, setMsg] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit() {
    const reg = form.Registration.trim().toUpperCase();
    if (!reg) { setMsg("Registration is required."); return; }
    const year = form.Year_Of_Manufacture === "" ? null : Number(form.Year_Of_Manufacture);
    if (year != null && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
      setMsg("Year of manufacture looks wrong."); return;
    }
    setMsg("");
    onSave({
      Registration: reg,
      Make: form.Make.trim() || null,
      Model: form.Model.trim() || null,
      Variant: form.Variant.trim() || null,
      Year_Of_Manufacture: year,
      Colour: form.Colour.trim() || null,
      Fuel_Type: form.Fuel_Type || null,
      Vehicle_Type: form.Vehicle_Type || null,
      VIN: form.VIN.trim().toUpperCase() || null,
      Assigned_To_Person_ID: form.Assigned_To_Person_ID
        ? Number(form.Assigned_To_Person_ID) : null,
      Status: form.Status || "Active",
      Notes: form.Notes.trim() || null,
    }, (m) => setMsg(m));
  }

  return (
    <div className="vh-backdrop" onClick={onClose}>
      <div className="vh-modal" role="dialog" aria-label={isNew ? "Add a vehicle" : "Edit vehicle"}
        onClick={(e) => e.stopPropagation()}>
        <div className="vh-modal-head">
          <h2>{isNew ? "Add a vehicle" : `Edit ${vehicle.Registration}`}</h2>
          <button className="vh-close" onClick={onClose} aria-label="Close">
            {"\u00d7"}
          </button>
        </div>

        <div className="vh-grid">
          <label className="vh-fld">
            <span>Registration *</span>
            <input autoFocus className="vh-reg" value={form.Registration}
              onChange={set("Registration")} />
          </label>
          <label className="vh-fld">
            <span>Vehicle type</span>
            <select value={form.Vehicle_Type} onChange={set("Vehicle_Type")}>
              <option value="">{"\u2014"}</option>
              {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="vh-fld">
            <span>Status</span>
            <select value={form.Status} onChange={set("Status")}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="vh-fld">
            <span>Make</span>
            <input value={form.Make} onChange={set("Make")} />
          </label>
          <label className="vh-fld">
            <span>Model</span>
            <input value={form.Model} onChange={set("Model")} />
          </label>
          <label className="vh-fld">
            <span>Variant</span>
            <input value={form.Variant} onChange={set("Variant")} />
          </label>

          <label className="vh-fld">
            <span>Year</span>
            <input type="number" min="1900" max="2100"
              value={form.Year_Of_Manufacture} onChange={set("Year_Of_Manufacture")} />
          </label>
          <label className="vh-fld">
            <span>Colour</span>
            <input value={form.Colour} onChange={set("Colour")} />
          </label>
          <label className="vh-fld">
            <span>Fuel</span>
            <select value={form.Fuel_Type} onChange={set("Fuel_Type")}>
              <option value="">{"\u2014"}</option>
              {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="vh-fld vh-span2">
            <span>VIN</span>
            <input value={form.VIN} onChange={set("VIN")} />
          </label>
          <label className="vh-fld">
            <span>Assigned to</span>
            <select value={form.Assigned_To_Person_ID} onChange={set("Assigned_To_Person_ID")}>
              <option value="">{"\u2014 Unassigned \u2014"}</option>
              {people.map((p) => (
                <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
              ))}
            </select>
          </label>

          {/* Mileage is not editable here.

              It is a cached copy of the newest reading in the mileage
              log, kept by a trigger (0137). A box on this form would let
              somebody type a figure the log disagrees with, and the next
              reading logged would silently overwrite it. Record a
              reading instead — the row follows. */}
          <p className="vh-note vh-span3">
            Mileage is set by recording a reading against the vehicle,
            under <strong>Mileage</strong> when the row is expanded.
          </p>

          <label className="vh-fld vh-span3">
            <span>Notes</span>
            <textarea rows="2" value={form.Notes} onChange={set("Notes")} />
          </label>
        </div>

        {msg && <p className="vh-msg">{msg}</p>}

        <div className="vh-modal-foot">
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button className="btn edit sm" disabled={busy} onClick={submit}>
            {busy ? "Saving\u2026" : isNew ? "Add vehicle" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
