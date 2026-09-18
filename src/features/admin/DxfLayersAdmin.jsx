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
  "governor", "nrs", "feederpoint", "spannode", "primary", "ringsub", "openpoint",
  "textnote"];
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

  /* ── What objects a class and a geometry HAS ──

     The third question, and the only one worth asking once the first
     two are answered. Electric and Line means the cables — by their
     full description, because "3c WAVE 95" is what somebody reading a
     CAD schedule is looking for, not a type and a size to combine
     themselves. Gas and Line means gas pipe, water means water pipe,
     and a Point means the fittings that class has.

     Each option carries what it SETS on the rule, so the form asks
     about objects and the rule stores the fields the matcher reads.
     That is the whole simplification: the parts an object is made of
     were never the question. */
  const POINTS_BY_CLASS = {
    water: [["meter", "Water meter"], ["washout", "Wash out"],
      ["servicevalve", "Service valve"], ["poc", "Point of connection"],
      ["pumping", "Pumping station"]],
    gas: [["meter", "Gas meter"], ["governor", "Governor"],
      ["servicevalve", "Service valve"], ["poc", "Point of connection"]],
    electric: [["meter", "Electric meter"], ["joint", "Joint"],
      ["substation", "Substation"], ["primary", "Primary substation"],
      ["ringsub", "Ring substation"], ["openpoint", "Open point"],
      ["linkbox", "Link box"], ["msdb", "Multi-service board"],
      ["hdcutout", "Heavy duty cut-out"], ["feederpoint", "Feeder end point"],
      ["poc", "Point of connection"]],
    trench: [["sectionmark", "Cross-section mark"]],
    lighting: [["column", "Lighting column"]],
    annotation: [["sectionmark", "Cross-section mark"],
      ["textnote", "Text note"]],
  };

  const objects = useMemo(() => {
    const cls = draft.Layer_Key;
    const geom = draft.Geometry_Type;
    if (!cls) return [];

    if (geom === "Point") {
      return (POINTS_BY_CLASS[cls] || []).map(([role, label]) => ({
        key: `role:${role}`, label, apply: { Feature_Role: role },
      }));
    }

    if (geom === "Polygon") {
      return [
        { key: "role:plot", label: "Plot", apply: { Feature_Role: "plot" } },
        { key: "role:shape", label: "Boundary or area",
          apply: { Feature_Role: "shape" } },
      ];
    }

    if (geom !== "Line") return [];

    if (cls === "electric") {
      /* Every cable in the specs, named as the catalogue names it. */
      return cableSizes.map((c) => {
        const t = cableTypes.find((x) => String(typeIdOf(x)) === String(typeIdOf(c)));
        const name = [typeName(t), c.Size_Label].filter(Boolean).join(" ");
        return {
          key: `cable:${cableId(c)}`,
          label: name || `Cable ${cableId(c)}`,
          apply: { Cable_Type: typeName(t), Size_Label: c.Size_Label },
        };
      });
    }

    if (cls === "gas" || cls === "water") {
      const rows = cls === "gas" ? gasSizes : waterSizes;
      /* Main or service, and the size: the two together are the object
         somebody means. `Pipe_Kind` is on both catalogues (0128 for
         water); where it is absent the row is read as a main, which is
         what the tables held before the column existed. */
      return rows.map((z) => {
        const kind = String(z.Pipe_Kind || "main").toLowerCase();
        const size = z.Size_Label ?? z.Diameter_mm ?? "";
        return {
          key: `pipe:${cls}:${kind}:${size}`,
          label: `${kind === "service" ? "Service" : "Main"} ${size}`,
          apply: { Line_Type: `${cls}_${kind}`, Size_Label: String(size) },
        };
      });
    }

    return [];
  }, [draft.Layer_Key, draft.Geometry_Type, cableSizes, cableTypes,
    gasSizes, waterSizes]);

  /* Which option a rule already written corresponds to, so opening one
     shows what it is rather than an empty box. */
  const objectKey = (d) => {
    if (d.Feature_Role) return `role:${d.Feature_Role}`;
    if (d.Cable_Type || (d.Layer_Key === "electric" && d.Size_Label)) {
      const c = cableSizes.find((x) => {
        const t = cableTypes.find((y) => String(typeIdOf(y)) === String(typeIdOf(x)));
        return String(x.Size_Label) === String(d.Size_Label)
          && (!d.Cable_Type || typeName(t).toLowerCase()
            === String(d.Cable_Type).toLowerCase());
      });
      return c ? `cable:${cableId(c)}` : "";
    }
    if (d.Line_Type && d.Size_Label) {
      const [cls, kind] = String(d.Line_Type).split("_");
      return `pipe:${cls}:${kind}:${d.Size_Label}`;
    }
    return "";
  };

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
            {/* ── Three questions, then their layer ──

                Class, geometry, the object, the CAD layer. Each answer
                decides the next: Electric and Line offers the CABLES,
                by their full description, because "3c WAVE 95" is what
                somebody reading a CAD schedule is looking for. Gas and
                Line offers gas pipe, Water offers water pipe, and a
                Point offers the fittings that class has.

                Line type, size band and build status are gone from the
                form. They were the underlying fields rather than the
                question: picking "Gas main 180mm" sets a line type and
                a size between them, and asking for all three separately
                made somebody assemble an object out of parts. The
                columns remain, and a rule written before this still
                works; nothing here writes them by hand any more. */}
            <div className="gs-grid">
              <div className="fld">
                <label htmlFor="dxe-layer2">1. Class</label>
                <select id="dxe-layer2" value={draft.Layer_Key ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d,
                    Layer_Key: e.target.value,
                    /* An object chosen under one class means nothing
                       under another. */
                    Line_Type: "", Feature_Role: "", Size_Label: "",
                    Cable_Type: "", CAD_Layer_ID: "" }))}>
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
                    Geometry_Type: e.target.value,
                    Line_Type: "", Feature_Role: "", Size_Label: "",
                    Cable_Type: "", CAD_Layer_ID: "" }))}>
                  <option value="">Any</option>
                  <option value="Line">Line</option>
                  <option value="Point">Point</option>
                  <option value="Polygon">Polygon</option>
                </select>
              </div>

              <div className="fld">
                <label htmlFor="dxe-object">3. Object</label>
                <select id="dxe-object" value={objectKey(draft)}
                  onChange={(e) => {
                    const opt = objects.find((o) => o.key === e.target.value);
                    setDraft((d) => ({ ...d,
                      Line_Type: "", Feature_Role: "", Size_Label: "",
                      Cable_Type: "", ...(opt?.apply || {}) }));
                  }}>
                  <option value="">
                    {objects.length ? "Everything in this class" : "Choose a class first"}
                  </option>
                  {objects.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* External or internal, where it is a question at all:
                  mains feeder cables and meters. */}
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

              <div className="fld">
                <label htmlFor="dxe-pick">4. AutoCAD layer</label>
                <select id="dxe-pick" value={draft.CAD_Layer_ID ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const row = cadLayers.find((c) => String(c.CAD_Layer_ID) === String(id));
                    setDraft((d) => ({ ...d, CAD_Layer_ID: id,
                      /* The NAME is copied onto the rule as well as the
                         id: the export reads a name, and a rule that
                         only pointed at a row would export nothing if
                         that row were deleted. */
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
                        {c.Layer_Name}{c.Status ? `  \u00b7  ${c.Status}` : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div className="fld">
                <label htmlFor="dxe-cad">CAD layer name</label>
                <input id="dxe-cad" value={draft.CAD_Layer} onChange={set("CAD_Layer")}
                  placeholder="Or type one they have not sent us yet" />
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
                <label htmlFor="dxe-text">Text layer</label>
                <input id="dxe-text" value={draft.Text_Layer ?? ""} onChange={set("Text_Layer")}
                  placeholder="Labels go on the geometry's layer" />
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
