/* The fleet: constants, formatting, and what each history record holds.

   Ported from the original app's HSQE vehicles section. The five
   histories — insurance, MOT, services, maintenance, mileage — are one
   form and one table parameterised by this metadata rather than five of
   each, which is how the original had it and is the right call: they
   differ only in their fields.

   Lists are held here rather than in lookup tables. The original keeps
   them in the browser, and a five-row table for "Diesel, Petrol, Hybrid,
   Electric, Other" earns nothing. If a list starts needing sort orders
   or an active flag, that is the signal to promote it. */

export const FUEL_TYPES    = ["Diesel", "Petrol", "Hybrid", "Electric", "Other"];
export const VEHICLE_TYPES = ["Car", "Van", "Pickup", "HGV", "Plant", "Other"];
export const STATUSES      = ["Active", "Off-Road", "Sold", "Scrapped"];
export const SERVICE_STAT  = ["Scheduled", "Completed", "Overdue", "Cancelled"];

const DASH = "\u2014";

export const fmtDate = (d) => {
  if (!d) return DASH;
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  if (!y) return String(d);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
};

export const fmtMoney = (v) =>
  v == null || v === "" ? DASH
    : `\u00a3${Number(v).toLocaleString("en-GB",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtMiles = (v) =>
  v == null || v === "" ? DASH : Number(v).toLocaleString("en-GB");

export const today = () => new Date().toISOString().slice(0, 10);

/* How close a date is, for the expiry badges.

   Compared as calendar days rather than by subtracting timestamps, so
   an MOT expiring today reads as today whatever the clock says and
   whichever side of a daylight-saving change the two dates fall. */
export function dateUrgency(dateStr) {
  if (!dateStr) return { level: "none", days: null };
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!y) return { level: "none", days: null };
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((then - today0) / 86400000);
  if (days < 0) return { level: "expired", days };
  if (days <= 30) return { level: "warn", days };
  return { level: "ok", days };
}

/* The newest row per vehicle, by whichever date says when its cover
   runs out. Used for the MOT and insurance columns on the list, which
   answer "is this vehicle legal" and so want the latest expiry rather
   than the latest entry. */
export function newestByVehicle(rows, dateField) {
  const out = {};
  for (const r of rows) {
    const cur = out[r.Vehicle_ID];
    if (!cur || String(r[dateField] ?? "") > String(cur[dateField] ?? "")) {
      out[r.Vehicle_ID] = r;
    }
  }
  return out;
}

/* The five histories.

   `table` and `idField` name the row; `fields` drives both the form and
   the columns of the list beneath it. `align` and `format` are how a
   value is shown, kept beside the field so a new column cannot be added
   to one and forgotten in the other. */
export const SUB_KINDS = [
  {
    kind: "insurance",
    table: "Vehicle_Insurance",
    idField: "Insurance_ID",
    title: "Insurance",
    one: "insurance policy",
    addLabel: "Add policy",
    empty: "No insurance policies recorded.",
    sort: (a, b) => String(b.End_Date ?? "").localeCompare(String(a.End_Date ?? "")),
    fields: [
      { id: "Insurer", label: "Insurer", type: "text" },
      { id: "Policy_Number", label: "Policy number", type: "text" },
      { id: "Cover_Type", label: "Cover type", type: "select",
        options: ["", "Comprehensive", "Third Party", "Third Party Fire & Theft"] },
      { id: "Start_Date", label: "Start date", type: "date", required: true, format: "date" },
      { id: "End_Date", label: "End date", type: "date", required: true, format: "expiry" },
      { id: "Premium", label: "Premium (\u00a3)", type: "number", format: "money", align: "right" },
      { id: "Excess", label: "Excess (\u00a3)", type: "number", format: "money", align: "right",
        listed: false },
      { id: "Notes", label: "Notes", type: "textarea", span: 2, listed: false },
    ],
  },
  {
    kind: "mot",
    table: "Vehicle_MOT",
    idField: "MOT_ID",
    title: "MOT",
    one: "MOT test",
    addLabel: "Add MOT",
    empty: "No MOT tests recorded.",
    sort: (a, b) => String(b.Expiry_Date ?? "").localeCompare(String(a.Expiry_Date ?? "")),
    fields: [
      { id: "Test_Date", label: "Test date", type: "date", required: true, format: "date" },
      { id: "Expiry_Date", label: "Expiry date", type: "date", required: true, format: "expiry" },
      { id: "Result", label: "Result", type: "select",
        options: ["", "Pass", "Pass with Advisory", "Fail"] },
      { id: "Mileage_At_Test", label: "Mileage", type: "number", format: "miles", align: "right" },
      { id: "Test_Centre", label: "Test centre", type: "text" },
      { id: "Certificate_Number", label: "Cert. number", type: "text" },
      { id: "Notes", label: "Notes", type: "textarea", span: 2, listed: false },
    ],
  },
  {
    kind: "service",
    table: "Vehicle_Service",
    idField: "Service_ID",
    title: "Services",
    one: "service",
    addLabel: "Add service",
    empty: "No services recorded.",
    sort: (a, b) => String(b.Scheduled_Date ?? b.Completed_Date ?? "")
      .localeCompare(String(a.Scheduled_Date ?? a.Completed_Date ?? "")),
    fields: [
      { id: "Status", label: "Status", type: "select", options: SERVICE_STAT, format: "status" },
      { id: "Service_Type", label: "Service type", type: "select",
        options: ["", "Full Service", "Interim", "Oil Change", "Inspection", "Other"] },
      { id: "Scheduled_Date", label: "Scheduled date", type: "date", format: "date" },
      { id: "Completed_Date", label: "Completed date", type: "date", format: "date" },
      { id: "Mileage_At_Service", label: "Mileage", type: "number", format: "miles", align: "right" },
      { id: "Garage", label: "Garage", type: "text" },
      { id: "Cost", label: "Cost (\u00a3)", type: "number", format: "money", align: "right" },
      { id: "Notes", label: "Notes", type: "textarea", span: 2, listed: false },
    ],
  },
  {
    kind: "maintenance",
    table: "Vehicle_Maintenance",
    idField: "Maintenance_ID",
    title: "Maintenance",
    one: "maintenance record",
    addLabel: "Add work",
    empty: "No maintenance recorded.",
    sort: (a, b) => String(b.Maintenance_Date ?? "").localeCompare(String(a.Maintenance_Date ?? "")),
    fields: [
      { id: "Maintenance_Date", label: "Date", type: "date", required: true, format: "date" },
      { id: "Maintenance_Type", label: "Type", type: "text",
        placeholder: "e.g. Tyres, Brakes, Bodywork" },
      { id: "Description", label: "Description", type: "textarea", span: 2 },
      { id: "Garage", label: "Garage", type: "text" },
      { id: "Mileage_At_Maintenance", label: "Mileage", type: "number",
        format: "miles", align: "right" },
      { id: "Cost", label: "Cost (\u00a3)", type: "number", format: "money", align: "right" },
      { id: "Notes", label: "Notes", type: "textarea", span: 2, listed: false },
    ],
  },
  {
    kind: "mileage",
    table: "Vehicle_Mileage_Log",
    idField: "Log_ID",
    title: "Mileage",
    one: "mileage reading",
    addLabel: "Record reading",
    empty: "No mileage readings yet.",
    sort: (a, b) => String(b.Reading_Date ?? "").localeCompare(String(a.Reading_Date ?? "")),
    fields: [
      { id: "Reading_Date", label: "Reading date", type: "date", required: true,
        format: "date", default: today },
      { id: "Mileage", label: "Mileage", type: "number", required: true,
        format: "miles", align: "right" },
      { id: "Recorded_By_Person_ID", label: "Recorded by", type: "person", format: "person" },
      { id: "Notes", label: "Notes", type: "textarea", span: 2 },
    ],
  },
];

export const kindOf = (kind) => SUB_KINDS.find((k) => k.kind === kind) ?? null;

/* Columns shown in a history table: every field except those marked
   `listed: false`, which are the ones too long to sit in a row. */
export const listedFields = (meta) => meta.fields.filter((f) => f.listed !== false);
