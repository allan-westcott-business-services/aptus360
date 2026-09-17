/* CAD Layers — what our geometry is called in AutoCAD.

   The DXF export names layers from a schedule kept here rather than
   from the drawing's own vocabulary. One row is one rule: what it
   matches, and what the layer is called when it does.

   Two things this screen has to make obvious, because getting either
   wrong is a drawing sent to a client on the wrong layers:

   1. **Whose rule is it.** A row with no customer is the HOUSE style,
      used for everyone. A row with one belongs to that customer and
      beats the house row it competes with. The list says which at a
      glance rather than making somebody open each row.

   2. **Which rule actually wins.** The same lesson as fault 133: an
      editor that shows rules one at a time cannot answer "why did it
      land on that layer", which is the only question anybody brings to
      it. The inspector at the top answers it from the real matcher.

   Sizes carry a unit that depends on the utility — a pipe's size is a
   diameter in mm, a cable's is an area in mm² — so the editor shows
   which applies rather than leaving somebody to type 185 meaning the
   wrong one. */

import { useEffect, useMemo, useState } from "react";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import { explainLayer, sizeUnitFor, sizeUnitLabel } from "../gis/dxfLayerMap.js";

const BLANK = {
  Layer_Key: "", Line_Type: "", Feature_Role: "", Build_Status: "",
  Size_From: "", Size_To: "", Cable_Type: "", Size_Label: "",
  Geometry_Type: "", Siting: "", CAD_Layer_ID: "",
  Organisation_ID: "",
  CAD_Layer: "", ACI_Colour: "", Linetype: "CONTINUOUS", Text_Layer: "",
  Sort_Order: 0, Is_Active: true, Notes: "",
};

const LAYERS = ["", "water", "gas", "electric", "trench", "lighting", "annotation"];
const ROLES = ["", "plot", "meter", "poc", "substation", "joint", "servicevalve",
  "washout", "sectionmark", "hvtt", "reducer", "linkbox", "msdb", "hdcutout",
  "governor", "nrs", "feederpoint", "spannode", "primary", "ringsub", "openpoint"];
const STATUSES = ["", "planned", "live", "existing", "abandoned"];

export default function DxfLayersAdmin() {
  const [rows, setRows] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [lineTypes, setLineTypes] = useState([]);
  /* The cable catalogue, so a rule can name a particular cable and the
     inspector can resolve one. */
  const [cableSizes, setCableSizes] = useState([]);
  const [cableTypes, setCableTypes] = useState([]);
  /* Their layer names, and our pipe catalogues. A rule picks from
     these rather than having every name and size typed again: two
     hundred rules typed by hand is two hundred chances at a typo
     nobody sees until a drawing is issued. */
  const [cadLayers, setCadLayers] = useState([]);
  const [gasSizes, setGasSizes] = useState([]);
  const [waterSizes, setWaterSizes] = useState([]);
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = () => adminList("DXF_Layer_Map")
    .then(({ rows: r = [] }) => setRows(r))
    .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    adminList("Organisation").then(({ rows: r = [] }) => setOrgs(r)).catch(() => {});
    adminList("GIS_Line_Type").then(({ rows: r = [] }) => setLineTypes(r)).catch(() => {});
    adminList("Electric_Cable_Size").then(({ rows: r = [] }) => setCableSizes(r)).catch(() => {});
    adminList("Electric_Cable_Type").then(({ rows: r = [] }) => setCableTypes(r)).catch(() => {});
    adminList("CAD_Layer").then(({ rows: r = [] }) => setCadLayers(r)).catch(() => {});
    adminList("Gas_Pipe_Size").then(({ rows: r = [] }) => setGasSizes(r)).catch(() => {});
    adminList("Water_Pipe_Size").then(({ rows: r = [] }) => setWaterSizes(r)).catch(() => {});
  }, []);

  const orgName = (id) => orgs.find((o) => String(o.Organisation_ID) === String(id))?.Name
    ?? (id == null || id === "" ? "House style" : `#${id}`);

  const open = (row) => {
    setSel(row?.DXF_Layer_Map_ID ?? "new");
    setDraft(row ? { ...BLANK, ...row } : { ...BLANK });
    setError("");
  };

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setDraft((d) => ({ ...d, [k]: v }));
  };

  async function save() {
    if (!draft.CAD_Layer.trim()) {
      setError("A rule needs a CAD layer name \u2014 it is the whole point of it.");
      return;
    }
    setBusy(true);
    try {
      /* Empty means "any", and an empty string is not a blank in the
         database: a rule scoped to Layer_Key "" would match nothing at
         all while looking perfectly reasonable in the list. */
      const body = { ...draft };
      for (const k of ["Layer_Key", "Line_Type", "Feature_Role", "Build_Status",
        "Organisation_ID", "Linetype", "Text_Layer", "Notes",
        "Cable_Type", "Size_Label", "Geometry_Type", "Siting"]) {
        if (body[k] === "") body[k] = null;
      }
      for (const k of ["Size_From", "Size_To", "ACI_Colour", "Organisation_ID",
        "CAD_Layer_ID"]) {
        body[k] = body[k] === "" || body[k] == null ? null : Number(body[k]);
      }
      body.Sort_Order = Number(body.Sort_Order) || 0;

      if (sel === "new") await adminCreate("DXF_Layer_Map", body);
      else await adminUpdate("DXF_Layer_Map", sel, body);
      await load();
      setSel(null);
      setStatus("Saved");
      setTimeout(() => setStatus(""), 3000);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function remove() {
    if (sel === "new" || sel == null) { setSel(null); return; }
    setBusy(true);
    try {
      await adminDelete("DXF_Layer_Map", sel);
      await load();
      setSel(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  /* ── Which layer would this land on? ── */
  const [ask, setAsk] = useState({
    Layer_Key: "water", Line_Type: "water_main", Feature_Role: "",
    Build_Status: "", Size: "", Organisation_ID: "", Cable_Size_ID: "",
  });
  const asked = useMemo(() => {
    const f = {
      Layer_Key: ask.Layer_Key || null,
      Feature_Role: ask.Feature_Role || null,
      Attributes: {
        Line_Type: ask.Line_Type || null,
        Build_Status: ask.Build_Status || null,
        Size: ask.Size || null,
        /* A chosen cable answers the question a size band cannot: 3c
           WAVE 95 and 4c WAVE 95 are the same 95mm\u00b2. */
        VD_Cable_Size_ID: ask.Cable_Size_ID || null,
      },
    };
    return explainLayer(f, {
      /* The rows on screen ARE the rules: the inspector answers from
         what is in front of somebody, not from a second copy. */
      rules: rows, lineTypes, cableSizes, cableTypes,
      organisationId: ask.Organisation_ID === "" ? null : ask.Organisation_ID,
    });
  }, [ask, rows, lineTypes, cableSizes, cableTypes]);

  /* The catalogue is read under either spelling of its keys.

     0082 creates `Electric_Cable_Size_ID` and `Type_Name`; the live
     tables and the admin endpoint use `Cable_Size_ID` and
     `Cable_Type`. Both are accepted rather than betting on one: a
     screen that guessed wrong would show an empty cable list and look
     like the catalogue was missing. */
  const cableId = (c) => c.Cable_Size_ID ?? c.Electric_Cable_Size_ID;
  const typeIdOf = (c) => c.Cable_Type_ID ?? c.Electric_Cable_Type_ID;
  const typeName = (t) => t?.Cable_Type ?? t?.Type_Name ?? "";
  const cableName = (c) => {
    const t = cableTypes.find((x) => String(typeIdOf(x)) === String(typeIdOf(c)));
    return [typeName(t), c.Size_Label].filter(Boolean).join(" ");
  };

  const askUnit = sizeUnitLabel(sizeUnitFor(ask.Layer_Key));

  return (
    <div className="admin-pane">
      <h2>CAD Layers</h2>
      <p className="hint">
        What the DXF export calls each thing in AutoCAD. A rule with no
        customer is the <strong>house style</strong>; one with a customer
        applies only to their drawings and beats the house rule it competes
        with. Blank fields mean &ldquo;any&rdquo;, and the most specific rule
        wins.
      </p>

      {error && <div className="banner error">{error}</div>}
      {status && <div className="banner ok">{status}</div>}

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8,
        padding: "10px 12px", margin: "12px 0" }}>
        <strong>Which layer would this land on?</strong>
        <div className="gs-grid" style={{ marginTop: 8 }}>
          <div className="fld">
            <label htmlFor="dx-layer">Utility</label>
            <select id="dx-layer" value={ask.Layer_Key}
              onChange={(e) => setAsk((a) => ({ ...a, Layer_Key: e.target.value }))}>
              {LAYERS.map((l) => <option key={l} value={l}>{l || "\u2014"}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="dx-lt">Line type</label>
            <input id="dx-lt" value={ask.Line_Type}
              onChange={(e) => setAsk((a) => ({ ...a, Line_Type: e.target.value }))}
              placeholder="water_main" />
          </div>
          <div className="fld">
            <label htmlFor="dx-role">Point role</label>
            <select id="dx-role" value={ask.Feature_Role}
              onChange={(e) => setAsk((a) => ({ ...a, Feature_Role: e.target.value }))}>
              {ROLES.map((r) => <option key={r} value={r}>{r || "\u2014"}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="dx-size">Size ({askUnit})</label>
            <input id="dx-size" value={ask.Size}
              onChange={(e) => setAsk((a) => ({ ...a, Size: e.target.value }))}
              placeholder={askUnit === "mm\u00b2" ? "185" : "180"} />
          </div>
          <div className="fld">
            <label htmlFor="dx-cable">Cable</label>
            <select id="dx-cable" value={ask.Cable_Size_ID}
              onChange={(e) => setAsk((a) => ({ ...a, Cable_Size_ID: e.target.value }))}>
              <option value="">{"\u2014"}</option>
              {cableSizes.map((c) => (
                <option key={cableId(c)} value={cableId(c)}>{cableName(c)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="dx-status">Build status</label>
            <select id="dx-status" value={ask.Build_Status}
              onChange={(e) => setAsk((a) => ({ ...a, Build_Status: e.target.value }))}>
              {STATUSES.map((x) => <option key={x} value={x}>{x || "\u2014"}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="dx-org">Customer</label>
            <select id="dx-org" value={ask.Organisation_ID}
              onChange={(e) => setAsk((a) => ({ ...a, Organisation_ID: e.target.value }))}>
              <option value="">House style</option>
              {orgs.map((o) => (
                <option key={o.Organisation_ID} value={o.Organisation_ID}>{o.Name}</option>
              ))}
            </select>
          </div>
        </div>

        {asked.rows.length === 0 ? (
          <p className="hint">
            <strong>No rule matches.</strong> It would go to
            {" "}<code>APTUS-UNMAPPED</code>, which is deliberate: a layer named
            as unmapped is obvious in AutoCAD, where something plausible merged
            into a real layer is not.
          </p>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#475569" }}>
                  <th>Applied</th><th>Rule</th><th>Scope</th><th>Layer</th>
                </tr>
              </thead>
              <tbody>
                {asked.rows.map(({ rule, score }, i) => {
                  const winner = i === asked.rows.length - 1;
                  return (
                    <tr key={rule.DXF_Layer_Map_ID}
                      style={{ borderTop: "1px solid #e2e8f0",
                        fontWeight: winner ? 700 : 400 }}>
                      <td>{i + 1}{winner ? " \u2014 wins" : ""}</td>
                      <td>
                        <button className="btn ghost" style={{ padding: "1px 6px" }}
                          onClick={() => open(rule)}>{rule.CAD_Layer}</button>
                      </td>
                      <td style={{ color: "#64748b" }}>
                        {orgName(rule.Organisation_ID)} {"\u00b7"} {score}
                      </td>
                      <td style={{ textDecoration: winner ? "none" : "line-through",
                        color: winner ? "#0f172a" : "#94a3b8" }}>
                        {rule.CAD_Layer}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ margin: "8px 0 0", fontSize: 13 }}>
              <strong>Lands on:</strong> <code>{asked.won?.CAD_Layer}</code>
              {asked.won?.Text_Layer && <> &middot; labels on <code>{asked.won.Text_Layer}</code></>}
              {asked.won?.ACI_Colour != null && <> &middot; colour {asked.won.ACI_Colour}</>}
              {asked.won?.Linetype && <> &middot; {asked.won.Linetype}</>}
            </p>
          </>
        )}
      </div>

      <button className="btn accent" onClick={() => open(null)}>New rule</button>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10,
        fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#475569" }}>
            <th>CAD layer</th><th>Matches</th><th>Whose</th><th>Colour</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.DXF_Layer_Map_ID} style={{ borderTop: "1px solid #e2e8f0",
              opacity: r.Is_Active === false ? 0.5 : 1 }}>
              <td><code>{r.CAD_Layer}</code></td>
              <td style={{ color: "#64748b" }}>
                {[r.Layer_Key, r.Line_Type, r.Feature_Role, r.Build_Status,
                  r.Cable_Type, r.Size_Label,
                  (r.Size_From != null || r.Size_To != null)
                    ? `${r.Size_From ?? ""}\u2013${r.Size_To ?? ""} `
                      + sizeUnitLabel(sizeUnitFor(r.Layer_Key))
                    : null,
                ].filter(Boolean).join(" \u00b7 ") || "anything"}
              </td>
              <td>{orgName(r.Organisation_ID)}</td>
              <td>{r.ACI_Colour ?? "\u2014"}</td>
              <td>
                <button className="btn ghost" onClick={() => open(r)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sel != null && (
        <div className="fe-backdrop" onClick={() => setSel(null)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: 18,
              width: "min(680px, 94vw)", maxHeight: "88vh", overflow: "auto",
              boxShadow: "0 24px 60px rgba(15,23,42,.28)" }}>
            <h3 style={{ marginTop: 0 }}>
              {sel === "new" ? "New rule" : draft.CAD_Layer}
            </h3>

            {/* ── Asked in the order somebody thinks in ──

                Class, then geometry, then the sizes THAT class has,
                then the CAD layer. Each answer narrows the next: pick
                Gas and Line and the size list is gas pipe, not every
                size in the business. A flat form of twelve fields asks
                somebody to know the whole schema; this asks four
                questions in the order the CAD schedule is written. */}
            <div className="gs-grid">
              <div className="fld">
                <label htmlFor="dxe-layer2">1. Class</label>
                <select id="dxe-layer2" value={draft.Layer_Key ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d,
                    Layer_Key: e.target.value,
                    /* A size chosen under one class means nothing under
                       another: 125mm gas is not 125mm water, and a
                       cable type is not a pipe at all. */
                    Size_Label: "", Cable_Type: "",
                    Size_From: "", Size_To: "", CAD_Layer_ID: "" }))}>
                  <option value="">Any</option>
                  {LAYERS.filter(Boolean).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="fld">
                <label htmlFor="dxe-geom">2. Geometry</label>
                <select id="dxe-geom" value={draft.Geometry_Type ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d,
                    Geometry_Type: e.target.value, CAD_Layer_ID: "" }))}>
                  <option value="">Any</option>
                  <option value="Line">Line</option>
                  <option value="Point">Point</option>
                  <option value="Polygon">Polygon</option>
                </select>
              </div>

              {/* 3. The sizes THIS class has, and nothing else. Gas
                  pipe under gas, water pipe under water, cable types
                  and areas under electric. Shown for lines, because a
                  point has no size worth mapping on. */}
              {draft.Geometry_Type !== "Point" && draft.Layer_Key === "gas" && (
                <div className="fld">
                  <label htmlFor="dxe-gas">3. Gas pipe size</label>
                  <select id="dxe-gas" value={draft.Size_Label ?? ""}
                    onChange={set("Size_Label")}>
                    <option value="">Any size</option>
                    {gasSizes.map((z) => (
                      <option key={z.Gas_Pipe_Size_ID} value={z.Size_Label ?? z.Size}>
                        {z.Size_Label ?? z.Size}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draft.Geometry_Type !== "Point" && draft.Layer_Key === "water" && (
                <div className="fld">
                  <label htmlFor="dxe-water">3. Water pipe size</label>
                  <select id="dxe-water" value={draft.Size_Label ?? ""}
                    onChange={set("Size_Label")}>
                    <option value="">Any size</option>
                    {waterSizes.map((z) => (
                      <option key={z.Water_Pipe_Size_ID} value={z.Size_Label ?? z.Size}>
                        {z.Size_Label ?? z.Size}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draft.Layer_Key === "electric" && (
                <>
                  <div className="fld">
                    <label htmlFor="dxe-cabletype2">3. Cable type</label>
                    <select id="dxe-cabletype2" value={draft.Cable_Type ?? ""}
                      onChange={set("Cable_Type")}>
                      <option value="">Any type</option>
                      {cableTypes.map((t) => (
                        <option key={typeIdOf(t)} value={typeName(t)}>{typeName(t)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fld">
                    <label htmlFor="dxe-cablesize">3. Cable size</label>
                    <select id="dxe-cablesize" value={draft.Size_Label ?? ""}
                      onChange={set("Size_Label")}>
                      <option value="">Any size</option>
                      {[...new Set(cableSizes
                        .filter((c) => !draft.Cable_Type
                          || typeName(cableTypes.find((t) =>
                            String(typeIdOf(t)) === String(typeIdOf(c))))
                            .toLowerCase() === String(draft.Cable_Type).toLowerCase())
                        .map((c) => c.Size_Label))].map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* External or internal, where it is a question: mains
                  feeder cables and meters. */}
              {(draft.Layer_Key === "electric" || draft.Feature_Role === "meter") && (
                <div className="fld">
                  <label htmlFor="dxe-siting">External or internal</label>
                  <select id="dxe-siting" value={draft.Siting ?? ""} onChange={set("Siting")}>
                    <option value="">Either</option>
                    <option value="External">External</option>
                    <option value="Internal">Internal</option>
                  </select>
                </div>
              )}

              {/* 4. Their layer. Picked from the CAD team's own list,
                  filtered to the class and geometry already chosen, so
                  the choice is a handful rather than the whole
                  schedule. Typing one is still allowed, for a layer
                  they have not sent us yet. */}
              <div className="fld">
                <label htmlFor="dxe-pick">4. AutoCAD layer</label>
                <select id="dxe-pick" value={draft.CAD_Layer_ID ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const row = cadLayers.find((c) => String(c.CAD_Layer_ID) === String(id));
                    setDraft((d) => ({ ...d, CAD_Layer_ID: id,
                      /* The NAME is copied onto the rule as well as the
                         id. The export reads a name, and a rule that
                         only pointed at a row would export nothing at
                         all if that row were ever deleted.

                         Colour and linetype are not copied: the layer
                         list no longer records them, because the
                         drawing this file is imported into already has
                         these layers and its own template decides how
                         they look. */
                      CAD_Layer: row?.Layer_Name ?? d.CAD_Layer }));
                  }}>
                  <option value="">&mdash; type one below &mdash;</option>
                  {cadLayers
                    .filter((c) => (!draft.Layer_Key || !c.Layer_Key
                      || c.Layer_Key === draft.Layer_Key))
                    .filter((c) => (!draft.Geometry_Type || !c.Geometry_Type
                      || c.Geometry_Type === draft.Geometry_Type))
                    .map((c) => (
                      <option key={c.CAD_Layer_ID} value={c.CAD_Layer_ID}>
                        {c.Layer_Name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="fld">
                <label htmlFor="dxe-cad">CAD layer name</label>
                <input id="dxe-cad" value={draft.CAD_Layer} onChange={set("CAD_Layer")}
                  placeholder="WATER-MAIN-180" />
              </div>
              <div className="fld">
                <label htmlFor="dxe-org">Customer</label>
                <select id="dxe-org" value={draft.Organisation_ID ?? ""}
                  onChange={set("Organisation_ID")}>
                  <option value="">House style (everyone)</option>
                  {orgs.map((o) => (
                    <option key={o.Organisation_ID} value={o.Organisation_ID}>{o.Name}</option>
                  ))}
                </select>
              </div>

              <div className="fld">
                <label htmlFor="dxe-lt">Line type</label>
                <input id="dxe-lt" list="dxe-lts" value={draft.Line_Type ?? ""}
                  onChange={set("Line_Type")} placeholder="Any" />
                <datalist id="dxe-lts">
                  {lineTypes.map((t) => <option key={t.Type_Key} value={t.Type_Key} />)}
                </datalist>
              </div>
              <div className="fld">
                <label htmlFor="dxe-role">Point role</label>
                <select id="dxe-role" value={draft.Feature_Role ?? ""} onChange={set("Feature_Role")}>
                  {ROLES.map((r) => <option key={r} value={r}>{r || "Any"}</option>)}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="dxe-status">Build status</label>
                <select id="dxe-status" value={draft.Build_Status ?? ""} onChange={set("Build_Status")}>
                  {STATUSES.map((x) => <option key={x} value={x}>{x || "Any"}</option>)}
                </select>
              </div>

              <div className="fld">
                <label htmlFor="dxe-from">
                  Size from ({sizeUnitLabel(sizeUnitFor(draft.Layer_Key))})
                </label>
                <input id="dxe-from" value={draft.Size_From ?? ""} onChange={set("Size_From")} />
              </div>
              <div className="fld">
                <label htmlFor="dxe-to">
                  Size to ({sizeUnitLabel(sizeUnitFor(draft.Layer_Key))})
                </label>
                <input id="dxe-to" value={draft.Size_To ?? ""} onChange={set("Size_To")} />
              </div>

              <div className="fld">
                <label htmlFor="dxe-cabletype">Cable type</label>
                <input id="dxe-cabletype" list="dxe-ctypes"
                  value={draft.Cable_Type ?? ""} onChange={set("Cable_Type")}
                  placeholder="Any \u2014 e.g. 3c WAVE" />
                <datalist id="dxe-ctypes">
                  {cableTypes.map((t) => (
                    <option key={typeIdOf(t)} value={typeName(t)} />
                  ))}
                </datalist>
              </div>
              <div className="fld">
                <label htmlFor="dxe-sizelabel">Exact size</label>
                <input id="dxe-sizelabel" list="dxe-sizes"
                  value={draft.Size_Label ?? ""} onChange={set("Size_Label")}
                  placeholder="Any \u2014 e.g. 95" />
                <datalist id="dxe-sizes">
                  {[...new Set(cableSizes.map((c) => c.Size_Label))].map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </div>
              <div className="fld">
                <label htmlFor="dxe-aci">Colour (ACI)</label>
                <input id="dxe-aci" value={draft.ACI_Colour ?? ""} onChange={set("ACI_Colour")}
                  placeholder="3" />
              </div>
              <div className="fld">
                <label htmlFor="dxe-ltype">Linetype</label>
                <input id="dxe-ltype" value={draft.Linetype ?? ""} onChange={set("Linetype")}
                  placeholder="CONTINUOUS" />
              </div>
              <div className="fld">
                <label htmlFor="dxe-text">Text layer</label>
                <input id="dxe-text" value={draft.Text_Layer ?? ""} onChange={set("Text_Layer")}
                  placeholder="Labels go on the geometry's layer" />
              </div>
              <div className="fld">
                <label htmlFor="dxe-sort">Sort order</label>
                <input id="dxe-sort" value={draft.Sort_Order ?? 0} onChange={set("Sort_Order")} />
              </div>
            </div>

            <div className="fld">
              <label htmlFor="dxe-notes">Notes</label>
              <input id="dxe-notes" value={draft.Notes ?? ""} onChange={set("Notes")} />
            </div>

            <label className="fe-check" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={draft.Is_Active !== false}
                onChange={(e) => setDraft((d) => ({ ...d, Is_Active: e.target.checked }))} />
              Active
            </label>

            {/* Sizes mean different things on different utilities, so the
                unit is shown against the fields above rather than left to
                be remembered. A pipe is a diameter; a cable is an area. */}
            {(draft.Size_From !== "" || draft.Size_To !== "") && (
              <p className="hint">
                Sizes here are{" "}
                <strong>{sizeUnitLabel(sizeUnitFor(draft.Layer_Key))}</strong>
                {sizeUnitFor(draft.Layer_Key) === "mm2"
                  ? " \u2014 cable is specified by conductor area."
                  : " \u2014 pipe is specified by diameter."}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn accent" disabled={busy} onClick={save}>Save</button>
              <button className="btn ghost" onClick={() => setSel(null)}>Cancel</button>
              {sel !== "new" && (
                <button className="btn ghost" style={{ marginLeft: "auto" }}
                  disabled={busy} onClick={remove}>Delete</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
