import { useRef, useState } from "react";
import Select from "../../components/Select.jsx";
import {
  addHouseType, updateHouseType, retireHouseType,
  attachFloorPlan, floorPlanLink, removeFloorPlan,
} from "../../api/houseTypes.js";

/* ── The development's plot breakdown ──

   The builder's named house types for this development: the Sunflower,
   code SUNF, a 3 bed semi-detached, with its floor plan. At the top of
   the Plots tab, because it is what the plots are entered AGAINST \u2014
   the Add plots rows offer these codes, and choosing one sets the
   plot's house type from here.

   Edited in place, saved as each field is left, the way the Plots
   table itself works. A code is unique within the development; the
   server says which house already has it. */
export default function PlotBreakdown({ projectId, rows, onChange, lookups, plotCounts = {} }) {
  const [draft, setDraft] = useState({ Name: "", Code: "", Property_Config_ID: "" });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);
  const fileFor = useRef(null);
  const fileInput = useRef(null);

  const typeName = (id) =>
    (lookups?.propertyTypes || []).find((t) => t.Property_Type_ID === id)?.Property_Type ?? "";
  const configs = lookups?.propertyConfigs || [];
  const configLabel = (c) => `${c.Bedrooms} Bed ${typeName(c.Property_Type_ID)}`;

  const run = async (key, fn) => {
    setBusy(key); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const save = (r, patch) => run(r.House_Type_ID, async () => {
    const next = await updateHouseType(r.House_Type_ID, patch);
    onChange(rows.map((x) => (x.House_Type_ID === r.House_Type_ID ? next : x)));
  });

  const add = () => run("add", async () => {
    if (!draft.Name.trim()) throw new Error("Give the house type a name, e.g. Sunflower.");
    const made = await addHouseType(projectId, {
      Name: draft.Name, Code: draft.Code, Property_Config_ID: draft.Property_Config_ID || null,
      Sort_Order: rows.length,
    });
    onChange([...rows, made]);
    setDraft({ Name: "", Code: "", Property_Config_ID: "" });
  });

  const retire = (r) => {
    const n = plotCounts[r.House_Type_ID] || 0;
    if (!window.confirm(`Remove the ${r.Name} from the breakdown?`
      + (n ? ` ${n} plot${n === 1 ? " keeps" : "s keep"} it as their house.` : ""))) return;
    run(r.House_Type_ID, async () => {
      await retireHouseType(r.House_Type_ID);
      onChange(rows.filter((x) => x.House_Type_ID !== r.House_Type_ID));
    });
  };

  const pickFile = (r) => { fileFor.current = r; fileInput.current?.click(); };
  const upload = (file) => {
    const r = fileFor.current;
    if (!file || !r) return;
    run(r.House_Type_ID, async () => {
      const next = await attachFloorPlan(r.House_Type_ID, file);
      onChange(rows.map((x) => (x.House_Type_ID === r.House_Type_ID ? next : x)));
    });
  };
  /* Confirmed by name: the plan is the one thing here that cannot be
     got back from the app if it was the only copy. */
  const detach = (r) => {
    if (!window.confirm(`Remove ${r.File_Name || "the floor plan"} from the ${r.Name}?`)) return;
    run(r.House_Type_ID, async () => {
      const next = await removeFloorPlan(r.House_Type_ID);
      onChange(rows.map((x) => (x.House_Type_ID === r.House_Type_ID ? next : x)));
    });
  };

  const view = (r) => run(r.House_Type_ID, async () => {
    const { url } = await floorPlanLink(r.House_Type_ID);
    if (url) window.open(url, "_blank", "noopener");
  });

  return (
    <section className="pb">
      <style>{CSS}</style>
      <button type="button" className="pb-head" onClick={() => setOpen((v) => !v)}
        aria-expanded={open}>
        <span className="pb-caret">{open ? "\u25be" : "\u25b8"}</span>
        Development plot breakdown
        <span className="pb-count">{rows.length} house type{rows.length === 1 ? "" : "s"}</span>
      </button>

      {open && (
        <div className="pb-body">
          {error && <p className="pb-error">{error}</p>}
          <div className="pb-grid">
            <span className="pb-h">Name</span>
            <span className="pb-h">Code</span>
            <span className="pb-h">Type</span>
            <span className="pb-h">Floor plan</span>
            <span className="pb-h pb-n">Plots</span>
            <span />

            {rows.map((r) => (
              <Row key={r.House_Type_ID} r={r} busy={busy === r.House_Type_ID}
                configs={configs} configLabel={configLabel} plots={plotCounts[r.House_Type_ID] || 0}
                onSave={(patch) => save(r, patch)} onFile={() => pickFile(r)}
                onView={() => view(r)} onDetach={() => detach(r)} onRetire={() => retire(r)} />
            ))}

            {/* A new one, entered on the last line. */}
            <input value={draft.Name} placeholder="e.g. Sunflower" aria-label="New house type name"
              onChange={(e) => setDraft((d) => ({ ...d, Name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && add()} />
            <input value={draft.Code} placeholder="e.g. SUNF" aria-label="New house type code"
              onChange={(e) => setDraft((d) => ({ ...d, Code: e.target.value.toUpperCase() }))}
              onKeyDown={(e) => e.key === "Enter" && add()} />
            <Select value={draft.Property_Config_ID} aria-label="New house type"
              onChange={(v) => setDraft((d) => ({ ...d, Property_Config_ID: v }))}>
              <option value="">&mdash; type &mdash;</option>
              {configs.map((c) => (
                <option key={c.Property_Config_ID} value={c.Property_Config_ID}>{configLabel(c)}</option>
              ))}
            </Select>
            <span className="pb-quiet">Add the plan once it is saved</span>
            <span />
            <button type="button" className="btn accent sm" disabled={busy === "add"} onClick={add}>
              {busy === "add" ? "Adding\u2026" : "Add"}
            </button>
          </div>
          <input ref={fileInput} type="file" hidden
            accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf"
            onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      )}
    </section>
  );
}

/* One house type. Fields save when left, and only when changed, so
   tabbing through a row writes nothing. */
function Row({ r, busy, configs, configLabel, plots, onSave, onFile, onView, onDetach, onRetire }) {
  const [name, setName] = useState(r.Name || "");
  const [code, setCode] = useState(r.Code || "");
  return (
    <>
      <input value={name} aria-label="Name" disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== r.Name && onSave({ Name: name })} />
      <input value={code} aria-label="Code" disabled={busy}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onBlur={() => code !== (r.Code || "") && onSave({ Code: code })} />
      <Select value={r.Property_Config_ID ?? ""} aria-label="Type" disabled={busy}
        onChange={(v) => onSave({ Property_Config_ID: v || null })}>
        <option value="">&mdash; type &mdash;</option>
        {configs.map((c) => (
          <option key={c.Property_Config_ID} value={c.Property_Config_ID}>{configLabel(c)}</option>
        ))}
      </Select>
      <span className="pb-file">
        {r.Storage_Path ? (
          <>
            <button type="button" className="pb-link" onClick={onView} title="Open the floor plan">
              {r.File_Name || "Floor plan"}
            </button>
            <button type="button" className="pb-link pb-quiet" disabled={busy}
              onClick={onFile}>replace</button>
            <button type="button" className="pb-link pb-remove" disabled={busy}
              onClick={onDetach} title="Remove the floor plan">remove</button>
          </>
        ) : (
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onFile}>Attach</button>
        )}
      </span>
      <span className="pb-n">{plots || ""}</span>
      <button type="button" className="pb-x" title="Remove from the breakdown"
        disabled={busy} onClick={onRetire}>&times;</button>
    </>
  );
}

const CSS = `
.pb { border: 1px solid var(--border); border-radius: 10px; margin: 0 0 16px; background: var(--white); }
.pb-head { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none;
  padding: 10px 14px; font: inherit; font-weight: 600; cursor: pointer; text-align: left; }
.pb-caret { color: var(--muted); width: 12px; }
.pb-count { margin-left: auto; font-weight: 400; color: var(--muted); font-size: 13px; }
.pb-body { padding: 0 14px 14px; }
.pb-grid { display: grid; grid-template-columns: 1.6fr 0.9fr 1.6fr 1.8fr 56px 60px;
  gap: 8px 10px; align-items: center; }
.pb-h { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
  color: var(--muted); }
.pb-n { text-align: center; font-variant-numeric: tabular-nums; }
.pb-file { display: flex; gap: 8px; align-items: center; min-width: 0; }
.pb-link { border: 0; background: none; padding: 0; font: inherit; color: var(--accent);
  text-decoration: underline; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-quiet { color: var(--muted); font-size: 12px; }
.pb-remove { color: #b91c1c; font-size: 12px; }
.pb-x { border: 0; background: none; font-size: 20px; color: var(--muted); cursor: pointer; justify-self: center; }
.pb-x:hover { color: #b91c1c; }
.pb-error { color: #b91c1c; margin: 0 0 8px; font-size: 13px; }
@media (max-width: 900px) { .pb-grid { grid-template-columns: 1fr 1fr; } .pb-h { display: none; } }
`;
