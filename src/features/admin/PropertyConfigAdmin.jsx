import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import Select from "../../components/Select.jsx";
import { adminList, adminCreate, adminDelete } from "../../api/admin.js";
import { BED_COLORS, BED_FALLBACK } from "../../lib/bedColours.js";

/* House Types, copied from the original admin screen.

   Two levels: Property_Type is the shape, Property_Config pairs it with a
   bedroom count and carries a short code. The code auto-generates as
   bedrooms + "B" + the first letter of the type — 3 Bed Semi-Detached
   becomes 3BS — and previews live in that bedroom's colour. */
export default function PropertyConfigAdmin() {
  const [types, setTypes] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [beds, setBeds] = useState("3");
  const [typeId, setTypeId] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [t, c] = await Promise.all([
        adminList("Property_Type"),
        adminList("Property_Config"),
      ]);
      setTypes(t.rows || []);
      setConfigs(c.rows || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  /* Regenerate the code whenever bedrooms or type change, but leave it
     editable — the first-letter convention collides for Terraced and
     Townhouse, and someone needs to be able to break the tie. */
  useEffect(() => {
    const t = types.find((x) => String(x.Property_Type_ID) === String(typeId));
    if (!beds || !t) return setCode("");
    setCode(`${beds}B${(t.Property_Type || "").trim()[0]?.toUpperCase() || "?"}`);
  }, [beds, typeId, types]);

  const colour = BED_COLORS[Number(beds)] || BED_FALLBACK;
  const isDupe = useMemo(
    () => configs.some((c) => (c.Code || "").toUpperCase() === code.toUpperCase() && code),
    [configs, code]
  );

  const grouped = useMemo(() => {
    const g = {};
    configs.forEach((c) => {
      const b = c.Bedrooms || 0;
      (g[b] = g[b] || []).push(c);
    });
    return Object.keys(g)
      .map(Number)
      .sort((a, b) => a - b)
      .map((b) => [b, g[b]]);
  }, [configs]);

  const typeName = (id) =>
    types.find((t) => t.Property_Type_ID === id)?.Property_Type ?? "\u2014";

  async function save() {
    if (!beds || !typeId) return setError("Select bedrooms and a property type.");
    if (isDupe) return setError(`Code ${code} already exists.`);
    setSaving(true);
    try {
      await adminCreate("Property_Config", {
        Bedrooms: Number(beds),
        Property_Type_ID: Number(typeId),
        Code: code.toUpperCase(),
      });
      setTypeId("");
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete ${c.Code}?`)) return;
    try {
      await adminDelete("Property_Config", c.Property_Config_ID, "Property_Config_ID");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="loading">Loading house types&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">House Types</h2>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="add-panel">
        <p className="panel-label">Add new house type</p>
        <div className="add-grid">
          <div className="fld">
            <label>Bedrooms</label>
            <Select value={beds} onChange={setBeds}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n} Bed</option>
              ))}
            </Select>
          </div>
          <div className="fld">
            <label>Property type</label>
            <Select value={typeId} onChange={setTypeId}>
              <option value="">&mdash; Select &mdash;</option>
              {types.map((t) => (
                <option key={t.Property_Type_ID} value={t.Property_Type_ID}>
                  {t.Property_Type}
                </option>
              ))}
            </Select>
          </div>
          <div className="fld">
            <label>
              Code <span className="auto">(auto-generated)</span>
            </label>
            <input
              className="code-input"
              value={code}
              placeholder="e.g. 3BS"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="preview-row">
            <div
              className="code-preview"
              style={code ? { background: colour.bg, color: colour.fg } : undefined}
            >
              {code || "\u2014"}
            </div>
            <button className="btn accent" onClick={save} disabled={saving || !typeId}>
              {saving ? "Adding\u2026" : "+ Add"}
            </button>
          </div>
        </div>
        {isDupe && (
          <Banner kind="error">
            &#9888; This code already exists &mdash; that combination would be a duplicate.
          </Banner>
        )}
      </div>

      <p className="panel-label">
        {configs.length} house type{configs.length === 1 ? "" : "s"} defined
      </p>

      {configs.length === 0 ? (
        <div className="empty">No house types yet. Add one above.</div>
      ) : (
        grouped.map(([bedCount, list]) => {
          const c = BED_COLORS[bedCount] || BED_FALLBACK;
          return (
            <div className="bed-group" key={bedCount}>
              <p className="bed-group-title">{bedCount} Bedroom</p>
              <div className="cards">
                {list.map((cfg) => (
                  <div
                    className="ht-card"
                    key={cfg.Property_Config_ID}
                    style={{ background: c.bg, color: c.fg }}
                  >
                    <span className="ht-code">{cfg.Code}</span>
                    <span className="ht-type">{typeName(cfg.Property_Type_ID)}</span>
                    <button onClick={() => remove(cfg)} title="Delete" style={{ color: c.fg }}>
                      &#10005;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const CSS = `
.admin-title { margin: 0 0 18px; font-size: 18px; font-weight: 700; }
.panel-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--accent); margin: 0 0 12px;
}
.add-panel {
  border: 1.5px solid var(--border); border-radius: 12px;
  padding: 18px; background: #f8f9fb; margin-bottom: 24px;
}
.add-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; align-items: end; }
.auto { font-weight: 400; font-size: 10px; text-transform: none; letter-spacing: 0; }
.code-input {
  font-family: ui-monospace, Menlo, monospace; font-weight: 700;
  font-size: 15px; letter-spacing: .05em;
}
.preview-row { display: flex; gap: 10px; align-items: center; }
.code-preview {
  min-width: 74px; padding: 9px 14px; border-radius: 8px; text-align: center;
  font-size: 15px; font-weight: 700; background: #e5e7eb; color: #374151;
  transition: background .2s, color .2s; font-family: ui-monospace, Menlo, monospace;
}
.preview-row .btn { flex: 1; }

.bed-group { margin-bottom: 14px; }
.bed-group-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); margin: 0 0 5px;
}
.cards { display: flex; flex-wrap: wrap; gap: 6px; }
.ht-card {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 9px; font-size: 13px; font-weight: 700;
}
.ht-code { font-family: ui-monospace, Menlo, monospace; }
.ht-type { font-weight: 400; opacity: .85; font-size: 11px; }
.ht-card button {
  background: rgba(0,0,0,.2); border: none; border-radius: 50%;
  width: 18px; height: 18px; cursor: pointer; font-size: 10px; line-height: 1;
  display: flex; align-items: center; justify-content: center; padding: 0;
}
.ht-card button:hover { background: rgba(0,0,0,.38); }
.empty { text-align: center; padding: 32px; color: var(--muted); font-size: 13px; }
`;
