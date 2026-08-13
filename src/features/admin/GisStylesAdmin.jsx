import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { listGisStyles, saveGisStyle, deleteGisStyle } from "../../api/gis.js";
import { getLookups } from "../../api/lookups.js";
import { appearance, symbolPath, STROKE_ONLY, SYMBOLS } from "../../lib/gisStyle.js";

/* Styling rules for the GIS canvas.

   A rule says what something looks like and when. Its scope is whatever
   you fill in — leave a field on "Any" and it stops narrowing. Rules
   cascade rather than replace, so an operator's rule can set a colour
   and inherit everything else from the rule beneath it.

   The preview is drawn by the same functions the canvas uses, at the
   zoom you pick. A swatch that lies about what you'll get on the plan
   would be worse than no swatch. */

/* The canvas zoom readout, from a pixels-per-metre figure.

   The canvas prints Math.round(scale * 25) + "%", so this has to use the
   same 25 — and if that ever changes, both have to change together or
   the admin quietly starts lying. One number, one expression, for that
   reason. */
const PCT_PER_PX_PER_M = 25;
const asPct = (v) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) || n <= 0
    ? ""
    : `\u2248 ${Math.round(n * PCT_PER_PX_PER_M)}% zoom`;
};

const BLANK = {
  Style_Name: "", Layer_Key: "", Line_Type: "", Feature_Role: "",
  Utility_ID: "", Organisation_ID: "", Site: "",
  Colour: "#64748b", Label_Colour: "", Dashed: false, Dash_Pattern: "", Symbol: "",
  Width_Px: "", Width_M: "", Scale_Width: false,
  Min_Width_Px: "", Max_Width_Px: "", Symbol_Size_Px: "",
  Symbol_Size_M: "", Scale_Symbol: false, Min_Symbol_Px: "", Max_Symbol_Px: "",
  Min_Scale: "", Max_Scale: "", Label_Min_Scale: "",
  Marker_Text: "", Marker_Symbol: "", Marker_Interval_M: "", Marker_Size_Px: "",
  Marker_Colour: "", Marker_Rotate: true, Marker_Offset_Px: "", Marker_Min_Gap_Px: "",
  Sort_Order: 0, Is_Active: true, Notes: "",
};

/* Every role a feature can hold, with the name it goes by.

   It was five of them — plot, meter, joint, source — and the register
   has grown to twelve since. Anything missing here cannot be styled at
   all: there was no way to scope a row to a service valve, a POC or a
   span node, so those drew in their layer's colour and nothing could
   say otherwise.

   The list matches the CHECK constraint on GIS_Feature."Feature_Role",
   last set by migration 0124. A role added there wants adding here too,
   or it arrives on the drawing with no way to style it. */
const ROLES = [
  ["", "Any"],
  ["plot", "Plot seed"],
  ["meter", "Meter"],
  ["joint", "Joint"],
  ["source", "Source"],
  ["poc", "POC"],
  ["substation", "Substation"],
  ["governor", "Gas governor"],
  ["servicevalve", "Service valve"],
  ["spannode", "Span node"],
  ["linkbox", "Link box"],
  ["column", "Lighting column"],
  ["shape", "Shape"],
];

export default function GisStylesAdmin() {
  const [rows, setRows] = useState([]);
  const [layers, setLayers] = useState([]);
  const [lineTypes, setLineTypes] = useState([]);
  const [utilities, setUtilities] = useState([]);
  const [operators, setOperators] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(BLANK);
  const [previewScale, setPreviewScale] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const canvasRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await listGisStyles();
      setRows(r.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    getLookups()
      .then((lk) => {
        setUtilities(lk.utilities || []);
        setOperators([...new Map((lk.orgOperators || [])
          .map((o) => [o.Organisation_ID, o])).values()]);
      })
      .catch((e) => setError(e.message));
    /* Layers and line types come from the canvas endpoint, which needs a
       project. Reading them from the styles already saved keeps this
       screen self-contained; anything not yet styled can still be typed
       in by key. */
  }, [load]);

  useEffect(() => {
    setLayers([...new Set(rows.map((r) => r.Layer_Key).filter(Boolean))]);
    setLineTypes([...new Set(rows.map((r) => r.Line_Type).filter(Boolean))]);
  }, [rows]);

  const isNew = selected === "new";
  const editing = isNew || selected != null;

  /* What the preview draws: the row being edited on its own, since the
     cascade it sits in depends on which feature it lands on. */
  const preview = useMemo(() => {
    const num = (v) => (v === "" || v == null ? null : Number(v));
    return appearance({
      Colour: draft.Colour || null,
      /* Blank means inherit, so it is stored as null rather than as an
         empty string — the cascade tests for null and "" is a value. */
      Label_Colour: draft.Label_Colour || null,
      Dashed: !!draft.Dashed,
      Dash_Pattern: draft.Dash_Pattern || null,
      Symbol: draft.Symbol || null,
      Width_Px: num(draft.Width_Px),
      Width_M: num(draft.Width_M),
      Scale_Width: !!draft.Scale_Width,
      Min_Width_Px: num(draft.Min_Width_Px),
      Max_Width_Px: num(draft.Max_Width_Px),
      Symbol_Size_Px: num(draft.Symbol_Size_Px),
      Symbol_Size_M: num(draft.Symbol_Size_M),
      Scale_Symbol: !!draft.Scale_Symbol,
      Min_Symbol_Px: num(draft.Min_Symbol_Px),
      Max_Symbol_Px: num(draft.Max_Symbol_Px),
      Min_Scale: num(draft.Min_Scale),
      Max_Scale: num(draft.Max_Scale),
      Label_Min_Scale: num(draft.Label_Min_Scale),
      /* The preview has to see these or it shows a plain line while the
         canvas shows a lettered one. */
      Marker_Text: draft.Marker_Text || null,
      Marker_Symbol: draft.Marker_Symbol || null,
      Marker_Interval_M: num(draft.Marker_Interval_M),
      Marker_Size_Px: num(draft.Marker_Size_Px),
      Marker_Colour: draft.Marker_Colour || null,
      Marker_Rotate: !!draft.Marker_Rotate,
      Marker_Offset_Px: num(draft.Marker_Offset_Px),
      Marker_Min_Gap_Px: num(draft.Marker_Min_Gap_Px),
    }, previewScale);
  }, [draft, previewScale]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !editing) return;
    const ctx = cv.getContext("2d");
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, h);

    if (!preview.visible) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Hidden at this zoom", w / 2, h / 2 + 4);
      return;
    }

    if (draft.Symbol) {
      ctx.beginPath();
      symbolPath(ctx, preview.symbol, w / 2, h / 2, preview.symbolPx);
      if (STROKE_ONLY.has(preview.symbol)) {
        ctx.strokeStyle = preview.colour;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = preview.colour;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(18, h / 2);
      ctx.lineTo(w - 18, h / 2);
      ctx.strokeStyle = preview.colour;
      ctx.lineWidth = preview.widthPx;
      ctx.setLineDash(preview.dash);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [preview, draft.Symbol, editing]);

  function open(row) {
    setSelected(row ? row.GIS_Style_ID : "new");
    setDraft(row ? { ...BLANK, ...Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v == null ? "" : v])) } : BLANK);
    setError("");
  }

  const set = (col) => (e) =>
    setDraft((d) => ({ ...d, [col]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save() {
    if (!draft.Style_Name.trim()) return setError("A rule needs a name.");
    try {
      const { GIS_Style_ID, ...body } = draft;
      await saveGisStyle({ ...body, Style_Name: body.Style_Name.trim() },
        isNew ? undefined : selected);
      setSelected(null);
      await load();
      setStatus("Saved");
      setTimeout(() => setStatus(""), 4000);
    } catch (e) { setError(e.message); }
  }

  async function remove(row) {
    if (!window.confirm(`Delete "${row.Style_Name}"? Objects it styled fall back to the rule beneath it.`)) return;
    try {
      await deleteGisStyle(row.GIS_Style_ID);
      setSelected(null);
      await load();
    } catch (e) { setError(e.message); }
  }

  const opName = (id) => operators.find((o) => String(o.Organisation_ID) === String(id))?.Name;
  const utName = (id) => utilities.find((u) => String(u.Utility_ID) === String(id))?.Utility;

  const scopeOf = (r) => [
    r.Organisation_ID && opName(r.Organisation_ID),
    r.Site, r.Line_Type, r.Feature_Role, r.Layer_Key, r.Utility_ID && utName(r.Utility_ID),
  ].filter(Boolean).join(" \u00B7 ") || "Everything";

  if (loading) return <div className="loading">Loading styles&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">GIS Styles</h2>
      <p className="gs-note">
        What each object looks like on the canvas, and at which zooms. Rules stack:
        the most specific match wins field by field, so an operator&rsquo;s rule can set
        just a colour and inherit the rest. Leave a scope field on &ldquo;Any&rdquo; and it
        stops narrowing.
      </p>
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}
      {status && <Banner kind="ok">{status}</Banner>}

      <div className="gs-split">
        <div className="gs-list">
          <button className="gs-new" onClick={() => open(null)}>+ Add a rule</button>
          {rows.length === 0 && (
            <p className="gs-empty">
              No rules yet. Run migration 0051 to seed them from the current line types.
            </p>
          )}
          {rows.map((r) => (
            <button key={r.GIS_Style_ID}
              className={selected === r.GIS_Style_ID ? "gs-item on" : "gs-item"}
              onClick={() => open(r)}>
              <span className="gs-sw" style={{
                background: r.Colour || "#cbd5e1",
                height: Math.max(2, Math.min(10, Number(r.Width_Px) || 3)),
              }} />
              <span className="gs-nm">
                {r.Style_Name}
                {r.Is_Active === false && <span className="gs-off">off</span>}
              </span>
              <span className="gs-scope">{scopeOf(r)}</span>
              {(r.Min_Scale || r.Max_Scale) && (
                <span className="gs-zoom">
                  {r.Min_Scale ? `\u2265${r.Min_Scale}` : ""}
                  {r.Min_Scale && r.Max_Scale ? " " : ""}
                  {r.Max_Scale ? `\u2264${r.Max_Scale}` : ""}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="gs-detail">
          {!editing ? (
            <div className="gs-pick">Choose a rule, or add one.</div>
          ) : (
            <>
              <div className="fld">
                <label htmlFor="gs-name">Rule name</label>
                <input id="gs-name" value={draft.Style_Name} onChange={set("Style_Name")}
                  placeholder="e.g. Northern Powergrid gas main" />
              </div>

              <p className="panel-label">Applies to</p>
              <div className="gs-grid">
                <div className="fld">
                  <label htmlFor="gs-op">Operator</label>
                  <select id="gs-op" value={draft.Organisation_ID} onChange={set("Organisation_ID")}>
                    <option value="">Any</option>
                    {operators.map((o) => (
                      <option key={o.Organisation_ID} value={o.Organisation_ID}>{o.Name}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="gs-util">Utility</label>
                  <select id="gs-util" value={draft.Utility_ID} onChange={set("Utility_ID")}>
                    <option value="">Any</option>
                    {utilities.map((u) => (
                      <option key={u.Utility_ID} value={u.Utility_ID}>{u.Utility}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="gs-lt">Line type</label>
                  <input id="gs-lt" list="gs-lts" value={draft.Line_Type} onChange={set("Line_Type")}
                    placeholder="Any" />
                  <datalist id="gs-lts">
                    {lineTypes.map((t) => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div className="fld">
                  <label htmlFor="gs-layer">Layer</label>
                  <input id="gs-layer" list="gs-layers" value={draft.Layer_Key} onChange={set("Layer_Key")}
                    placeholder="Any" />
                  <datalist id="gs-layers">
                    {layers.map((l) => <option key={l} value={l} />)}
                  </datalist>
                </div>
                <div className="fld">
                  <label htmlFor="gs-site">Site</label>
                  <select id="gs-site" value={draft.Site} onChange={set("Site")}>
                    <option value="">Any</option>
                    <option value="On-site">On-site</option>
                    <option value="Off-site">Off-site</option>
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="gs-role">Point role</label>
                  <select id="gs-role" value={draft.Feature_Role} onChange={set("Feature_Role")}>
                    {ROLES.map(([r, name]) => (
                      <option key={r} value={r}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="panel-label">Looks like</p>
              <div className="gs-grid">
                <div className="fld">
                  <label htmlFor="gs-col">Colour</label>
                  <div className="gs-colrow">
                    <input id="gs-col" type="color" value={draft.Colour || "#64748b"}
                      onChange={set("Colour")} />
                    <input value={draft.Colour} onChange={set("Colour")} placeholder="#64748b" />
                  </div>
                </div>

                {/* The text drawn for whatever this row matches.

                    Its own field rather than following the line's
                    colour: a label has to read against the drawing it
                    sits on, and the thing it names is often the wrong
                    colour for that.

                    Blank inherits — from a less specific row, and from
                    the canvas default when nothing sets one. The Clear
                    button is how it gets back to blank once a picker
                    has been used, since a colour input has no empty. */}
                <div className="fld">
                  <label htmlFor="gs-lblcol">Label colour</label>
                  <div className="gs-colrow">
                    <input id="gs-lblcol" type="color"
                      value={draft.Label_Colour || "#0f172a"}
                      onChange={set("Label_Colour")} />
                    <input value={draft.Label_Colour} onChange={set("Label_Colour")}
                      placeholder="inherits" />
                    <button className="btn ghost sm"
                      onClick={() => setDraft((d) => ({ ...d, Label_Colour: "" }))}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="fld">
                  <label htmlFor="gs-sym">Symbol (points)</label>
                  <select id="gs-sym" value={draft.Symbol} onChange={set("Symbol")}>
                    <option value="">Not a point</option>
                    {SYMBOLS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="gs-dash">Dash pattern</label>
                  <input id="gs-dash" value={draft.Dash_Pattern} onChange={set("Dash_Pattern")}
                    placeholder="9,6" disabled={!draft.Dashed} />
                </div>
              </div>
              <label className="gs-check">
                <input type="checkbox" checked={!!draft.Dashed} onChange={set("Dashed")} />
                Dashed
              </label>

              {/* Symbol size, the same shape as Width below it.

                  A point drawn at a fixed pixel size is the same dot at
                  10% and at 800%, so zooming in grows the drawing around
                  it until a meter is smaller than the cable it sits on.
                  Drawing it to scale fixes that, and the clamps are what
                  stop it vanishing at site level or covering the plot at
                  full zoom. */}
              <p className="panel-label">Symbol size</p>
              <label className="gs-check">
                <input type="checkbox" checked={!!draft.Scale_Symbol}
                  onChange={set("Scale_Symbol")} />
                Draw to scale &mdash; grows and shrinks with the zoom
              </label>
              <div className="gs-grid">
                <div className="fld">
                  <label htmlFor="gs-symsize">Fixed size (px)</label>
                  <input id="gs-symsize" type="number" step="1" value={draft.Symbol_Size_Px}
                    onChange={set("Symbol_Size_Px")} placeholder="6"
                    disabled={!!draft.Scale_Symbol} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-symm">Real size (m)</label>
                  <input id="gs-symm" type="number" step="0.05" value={draft.Symbol_Size_M}
                    onChange={set("Symbol_Size_M")} placeholder="0.6"
                    disabled={!draft.Scale_Symbol} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-minsym">Never smaller than (px)</label>
                  <input id="gs-minsym" type="number" step="0.5" value={draft.Min_Symbol_Px}
                    onChange={set("Min_Symbol_Px")} placeholder="3"
                    disabled={!draft.Scale_Symbol} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-maxsym">Never larger than (px)</label>
                  <input id="gs-maxsym" type="number" step="1" value={draft.Max_Symbol_Px}
                    onChange={set("Max_Symbol_Px")} placeholder="18"
                    disabled={!draft.Scale_Symbol} />
                </div>
              </div>

              <p className="panel-label">Width</p>
              <label className="gs-check">
                <input type="checkbox" checked={!!draft.Scale_Width} onChange={set("Scale_Width")} />
                Draw to scale &mdash; use the real width on the ground
              </label>
              <div className="gs-grid">
                <div className="fld">
                  <label htmlFor="gs-wpx">Fixed width (px)</label>
                  <input id="gs-wpx" type="number" step="0.5" value={draft.Width_Px}
                    onChange={set("Width_Px")} disabled={!!draft.Scale_Width} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-wm">Real width (m)</label>
                  <input id="gs-wm" type="number" step="0.05" value={draft.Width_M}
                    onChange={set("Width_M")} disabled={!draft.Scale_Width} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-minw">Never thinner than (px)</label>
                  <input id="gs-minw" type="number" step="0.5" value={draft.Min_Width_Px}
                    onChange={set("Min_Width_Px")} />
                </div>
                <div className="fld">
                  <label htmlFor="gs-maxw">Never thicker than (px)</label>
                  <input id="gs-maxw" type="number" step="1" value={draft.Max_Width_Px}
                    onChange={set("Max_Width_Px")} />
                </div>
              </div>

              <p className="panel-label">Visible between</p>
              {/* The canvas shows a percentage; these are pixels per
                  metre. They are the same quantity — the readout is
                  scale &times; 25 — but the hint used to claim they were
                  the same number, so a value read off the canvas as 21%
                  and typed in here as 21 meant something eighty times
                  larger and the feature vanished for good.

                  The conversion is shown live under each box rather than
                  explained, because arithmetic in a hint is arithmetic
                  someone has to do. */}
              <p className="hint gs-hint">
                Zoom is canvas pixels per metre. The canvas readout is a percentage of
                the same thing &mdash; 4 here is the 100% view, 0.84 is 21%. Leave blank
                for no limit.
              </p>
              <div className="gs-grid">
                <div className="fld">
                  <label htmlFor="gs-min">Hide below</label>
                  <input id="gs-min" type="number" step="0.5" value={draft.Min_Scale}
                    onChange={set("Min_Scale")} placeholder="no limit" />
                  <span className="gs-pct">{asPct(draft.Min_Scale)}</span>
                </div>
                <div className="fld">
                  <label htmlFor="gs-max">Hide above</label>
                  <input id="gs-max" type="number" step="0.5" value={draft.Max_Scale}
                    onChange={set("Max_Scale")} placeholder="no limit" />
                  <span className="gs-pct">{asPct(draft.Max_Scale)}</span>
                </div>
                <div className="fld">
                  <label htmlFor="gs-lbl">Drop the label below</label>
                  <input id="gs-lbl" type="number" step="0.5" value={draft.Label_Min_Scale}
                    onChange={set("Label_Min_Scale")} placeholder="always show" />
                  <span className="gs-pct">{asPct(draft.Label_Min_Scale)}</span>
                </div>
                <div className="gs-span">
                  <p className="panel-label">Markers along the line</p>
                  <p className="hint">
                    A letter or symbol repeated at a set interval &mdash; an E every
                    ten metres, a tick along a ducted run. Leave both empty for a plain
                    line. Only applies to lines.
                  </p>
                </div>
                <div className="fld">
                  <label htmlFor="gs-mtext">Letter or number</label>
                  <input id="gs-mtext" maxLength={3} value={draft.Marker_Text}
                    onChange={set("Marker_Text")} placeholder="E" />
                </div>
                <div className="fld">
                  <label htmlFor="gs-msym">Or a symbol</label>
                  <select id="gs-msym" value={draft.Marker_Symbol} onChange={set("Marker_Symbol")}>
                    <option value="">&mdash; none &mdash;</option>
                    {SYMBOLS.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="gs-mint">Every (m)</label>
                  <input id="gs-mint" type="number" step="0.5" min="0.5"
                    value={draft.Marker_Interval_M}
                    onChange={set("Marker_Interval_M")} placeholder="10" />
                </div>
                <div className="fld">
                  <label htmlFor="gs-msize">Size (px)</label>
                  <input id="gs-msize" type="number" value={draft.Marker_Size_Px}
                    onChange={set("Marker_Size_Px")} placeholder="11" />
                </div>
                <div className="fld">
                  <label htmlFor="gs-mcol">Marker colour</label>
                  <input id="gs-mcol" value={draft.Marker_Colour}
                    onChange={set("Marker_Colour")} placeholder="follows the line" />
                </div>
                <div className="fld">
                  <label htmlFor="gs-moff">Offset from the line (px)</label>
                  <input id="gs-moff" type="number" value={draft.Marker_Offset_Px}
                    onChange={set("Marker_Offset_Px")} placeholder="0" />
                </div>
                <div className="fld">
                  <label htmlFor="gs-mgap">Thin out below (px apart)</label>
                  <input id="gs-mgap" type="number" value={draft.Marker_Min_Gap_Px}
                    onChange={set("Marker_Min_Gap_Px")} placeholder="28" />
                  <p className="hint">
                    Zoomed out, markers this close together become a smear, so the
                    interval doubles rather than crowding.
                  </p>
                </div>
                <label className="gs-check">
                  <input type="checkbox" checked={!!draft.Marker_Rotate}
                    onChange={set("Marker_Rotate")} />
                  Turn the marker along the line
                </label>

                <div className="fld">
                  <label htmlFor="gs-sort">Sort order</label>
                  <input id="gs-sort" type="number" value={draft.Sort_Order} onChange={set("Sort_Order")} />
                </div>
              </div>

              <p className="panel-label">Preview</p>
              <div className="gs-preview">
                <canvas ref={canvasRef} width={360} height={70} />
                <div className="gs-slider">
                  <label htmlFor="gs-zoom">Zoom: {previewScale} px/m</label>
                  <input id="gs-zoom" type="range" min="0.5" max="30" step="0.5"
                    value={previewScale}
                    onChange={(e) => setPreviewScale(Number(e.target.value))} />
                  <span className="hint">
                    {preview.visible
                      ? `drawn at ${preview.widthPx.toFixed(1)} px`
                      : "hidden at this zoom"}
                  </span>
                </div>
              </div>

              <div className="fld">
                <label htmlFor="gs-notes">Notes</label>
                <textarea id="gs-notes" value={draft.Notes} onChange={set("Notes")}
                  placeholder="Why this rule exists — which standard it came from" />
              </div>

              <div className="gs-foot">
                <label className="gs-check">
                  <input type="checkbox" checked={draft.Is_Active !== false}
                    onChange={set("Is_Active")} />
                  Active
                </label>
                <span className="gs-spacer" />
                {!isNew && (
                  <button className="btn ghost danger"
                    onClick={() => remove(rows.find((r) => r.GIS_Style_ID === selected))}>
                    Delete
                  </button>
                )}
                <button className="btn ghost" onClick={() => setSelected(null)}>Cancel</button>
                <button className="btn accent" onClick={save}>Save rule</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.gs-note { font-size: 12.5px; color: var(--muted); margin: -10px 0 14px; max-width: 82ch; }
.gs-split { display: grid; grid-template-columns: 300px 1fr; gap: 18px; align-items: start; }
.gs-list { border: 1px solid var(--border); border-radius: var(--radius); padding: 9px;
  max-height: 78vh; overflow-y: auto; }
.gs-new { width: 100%; background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 7px; margin-bottom: 8px; cursor: pointer; font: 600 12.5px inherit; color: var(--accent); }
.gs-new:hover { background: var(--accent-light); }
.gs-empty { font-size: 11.5px; color: var(--muted); font-style: italic; padding: 0 4px; }
.gs-item { display: grid; grid-template-columns: 22px 1fr auto; gap: 4px 8px; width: 100%;
  text-align: left; background: none; border: 1px solid transparent; border-radius: 6px;
  padding: 7px 9px; cursor: pointer; font: inherit; color: var(--text); margin-bottom: 1px;
  align-items: center; }
.gs-item:hover { background: var(--bg); }
.gs-item.on { background: var(--accent-light); border-color: var(--accent); }
.gs-sw { width: 22px; border-radius: 2px; }
.gs-nm { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.gs-off { font-size: 9px; font-weight: 700; text-transform: uppercase; background: var(--bg);
  border: 1px solid var(--border); color: var(--muted); border-radius: 3px; padding: 0 4px; }
.gs-scope { grid-column: 2 / 3; font-size: 10.5px; color: var(--muted); }
.gs-zoom { grid-row: 1 / 3; grid-column: 3; font: 700 9.5px ui-monospace, Menlo, monospace;
  background: var(--bg); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px;
  color: var(--muted); }
.gs-detail { border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px;
  min-height: 420px; }
.gs-pick { color: var(--muted); font-size: 13px; text-align: center; padding: 150px 20px; }
.gs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 11px; }
.gs-colrow { display: flex; gap: 6px; }
.gs-colrow input[type=color] { width: 40px; padding: 2px; flex: none; }
/* A heading and its note spanning the whole form grid, so a group of
   related fields reads as a group rather than as more of the same. */
.gs-span { grid-column: 1 / -1; margin-top: 6px; }
.gs-span .panel-label { margin-bottom: 2px; }
.gs-check { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 9px 0 0; }

.gs-pct { font-size: 10.5px; color: var(--muted); margin-top: 3px; display: block; }
.gs-hint { margin: -4px 0 8px; max-width: 76ch; }
.gs-preview { display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
  border: 1px solid var(--border); border-radius: var(--radius); padding: 11px; }
.gs-preview canvas { border-radius: 4px; }
.gs-slider { flex: 1; min-width: 190px; }
.gs-slider label { margin-bottom: 5px; }
.gs-foot { display: flex; align-items: center; gap: 9px; margin-top: 16px; padding-top: 13px;
  border-top: 1px solid var(--border); }
.gs-spacer { flex: 1; }
@media (max-width: 1040px) { .gs-split { grid-template-columns: 1fr; } }
`;
