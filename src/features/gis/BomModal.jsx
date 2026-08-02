import { useState, useEffect, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import * as XLSX from "xlsx";
import Banner from "../../components/Banner.jsx";
import { getGisBom } from "../../api/gis.js";

/* Bill of materials.

   Everything drawn on the project apart from polygons, grouped the three
   ways the quantities are actually used: which side of the red line it
   falls, what it is being dug through, and whose utility it is.

   Lines are metres and points are counts, so there is no single total to
   put at the bottom — a column of "417" that mixes metres of trench with
   a number of meters is worse than no total. Each unit is summed
   separately and labelled.

   The counted things are called objects here rather than points. Points
   is what the drawing calls a feature with one coordinate, but this app
   also has design points on the Outline Designs tab, and a card reading
   "227 points" beside a project whose design points are 4 invites the
   two to be read as the same number. */

/* Trench is the only thing split by site — what a trench is dug through
   and reinstated to differs either side of the boundary, and so does the
   rate. A metre of cable costs what it costs wherever it is laid, so
   those rows come back with no site and group on their own. */
const SITE_ORDER = ["On-site", "Off-site", "Unclassified", ""];

export default function BomModal({ projectId, projectName, onClose }) {
  const [rows, setRows] = useState([]);
  /* Whose bill is on screen. "" is the whole site — the same rows added
     up without the split, so the parts always reconcile against it. */
  const [whose, setWhose] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getGisBom(projectId)
      .then((r) => { if (live) { setRows(r.rows || []); setError(""); } })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId]);

  /* The developers with anything on this drawing, in the order the bill
     returns them. Built from the bill rather than fetched separately, so
     a developer with an area but nothing in it does not appear as an
     empty option. */
  const developers = useMemo(() => {
    const out = new Map();
    for (const r of rows) {
      if (r.developer_id == null) continue;
      if (!out.has(String(r.developer_id))) {
        out.set(String(r.developer_id), r.developer_name ?? `Developer ${r.developer_id}`);
      }
    }
    return [...out].map(([id, name]) => ({ id, name }));
  }, [rows]);

  /* What the bill shows now.

     Shared plant — the substation, the POC, the incomer — has no
     developer and is kept in every developer's bill. A bill that
     silently omits the substation cannot be reconciled against the site
     total, and the whole point of splitting is that the parts add up. */
  const shown = useMemo(() => (whose
    ? rows.filter((r) => String(r.developer_id ?? "") === whose || r.developer_id == null)
    : rows), [rows, whose]);

  /* Grouped for reading: site, then utility. The database already
     returns them in this order, so this only has to break them up. */
  const groups = useMemo(() => {
    const out = new Map();
    for (const r of shown) {
      const key = `${r.site}\u0000${r.utility}`;
      if (!out.has(key)) out.set(key, { site: r.site, utility: r.utility, items: [] });
      out.get(key).items.push(r);
    }
    const rank = (x) => {
      const i = SITE_ORDER.indexOf(x.site);
      return i < 0 ? SITE_ORDER.length : i;
    };
    return [...out.values()].sort((a, b) =>
      rank(a) - rank(b) || a.utility.localeCompare(b.utility));
  }, [shown]);

  const totalsFor = (items, unit) =>
    items.filter((r) => r.unit === unit).reduce((t, r) => t + Number(r.quantity), 0);

  /* Totals per site cover trench only, because only trench has a site.
     The unsplit rows get their own line rather than being folded in —
     adding cable metres to trench metres would produce a figure nobody
     wants. */
  const siteTotals = useMemo(() => SITE_ORDER.map((site) => {
    const items = shown.filter((r) => r.site === site);
    return {
      site: site || "Not site-dependent",
      metres: totalsFor(items, "m"),
      count: totalsFor(items, "no."),
      items: items.length,
    };
  }).filter((s) => s.items), [shown]);

  const unclassified = shown.filter((r) => r.site === "Unclassified").length;

  function exportXlsx() {
    /* Built from `shown`, not `rows` — the file has to be the bill that
       was on screen when the button was pressed. */
    const stamp = new Date().toISOString().slice(0, 10);
    const safe = String(projectName || `Project ${projectId}`).replace(/[\\/:*?[\]]/g, "-");
    /* The export follows what is on screen. A file called "BOM" holding
       one developer's work, indistinguishable from the site's, is how the
       wrong figure reaches a tender. */
    const who = whose
      ? (developers.find((d) => d.id === whose)?.name ?? `Developer ${whose}`)
      : "";

    /* One row per grouping, which is the sheet people will pivot from.
       Quantity stays numeric — writing "417.2 m" into the cell makes it
       text and every sum downstream returns zero. The unit has its own
       column for the same reason. */
    const detail = shown.map((r) => ({
      Site: r.site || "n/a",
      Utility: r.utility,
      /* Named on every row, so a sheet that has been filtered or pivoted
         still says whose work it is. */
      Developer: r.developer_name ?? "(shared)",
      Item: r.item,
      Surface: r.surface || "",
      Unit: r.unit,
      Quantity: Number(r.quantity),
      Features: Number(r.features),
    }));

    const summary = siteTotals.map((s) => ({
      Site: s.site,
      "Length (m)": Number(s.metres.toFixed(2)),
      "Objects (no.)": s.count,
      "Lines of detail": s.items,
    }));

    const bySurface = [...shown
      .filter((r) => r.unit === "m" && r.surface)
      .reduce((m, r) => {
        const k = `${r.site}\u0000${r.surface}`;
        m.set(k, (m.get(k) || 0) + Number(r.quantity));
        return m;
      }, new Map())]
      .map(([k, v]) => {
        const [site, surface] = k.split("\u0000");
        return { Site: site, Surface: surface, "Length (m)": Number(v.toFixed(2)) };
      })
      .sort((a, b) => SITE_ORDER.indexOf(a.Site) - SITE_ORDER.indexOf(b.Site)
        || a.Surface.localeCompare(b.Surface));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Bill of Materials");
    if (bySurface.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bySurface), "By Surface");
    }
    XLSX.writeFile(wb,
      `BOM ${safe}${who ? ` ${who}` : ""} ${stamp}.xlsx`.replace(/\s+/g, " ").trim());
  }

  const drag = useDragHandle();

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="bom" onClick={(e) => e.stopPropagation()} style={drag.panelStyle} role="dialog"
        aria-label="Bill of materials">
        <style>{CSS}</style>

        <div className="bom-head" {...drag.handleProps}>
          <div>
            <h3>Bill of materials</h3>
            <p className="bom-sub">
              {projectName || `Project ${projectId}`} &middot; everything drawn except the boundary
            </p>
            {/* Whose bill. Only where there is more than one developer
                with something drawn — a single developer's bill and the
                site's are the same list, and offering the choice would
                only invite the question of what the difference is. */}
            {developers.length > 1 && (
              <div className="bom-who">
                <label htmlFor="bom-dev">Show</label>
                <select id="bom-dev" value={whose} onChange={(e) => setWhose(e.target.value)}>
                  <option value="">The whole site</option>
                  {developers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {whose && (
                  <span className="bom-who-n">
                    with the shared substation, POC and incomer
                  </span>
                )}
              </div>
            )}
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="bom-body">
          {error && <Banner kind="error">{error}</Banner>}
          {loading && <p className="bom-empty">Working out quantities&hellip;</p>}

          {!loading && !rows.length && !error && (
            <p className="bom-empty">
              Nothing drawn yet. Trenches, cables, pipes, meters and joints all appear here
              once they exist.
            </p>
          )}

          {!loading && rows.length > 0 && (
            <>
              <div className="bom-tot">
                {siteTotals.map((s) => (
                  <div className={`bom-card bom-${s.site.toLowerCase().replace("-", "")}`} key={s.site}>
                    <span className="bc-label">{s.site}</span>
                    <span className="bc-main">{s.metres.toFixed(1)} m</span>
                    {/* Counted objects, and only where they are counted.

                        On-site and Off-site are trench, and a trench is
                        a length — so those cards showed "0 points" for
                        ever, which reads as "we found none" rather than
                        "this is not counted here". Meters, joints and
                        the rest carry no site, so they all fall under
                        Not site-dependent.

                        Called objects rather than points: this app has
                        design points on the Outline Designs tab, and
                        they are a different quantity entirely. */}
                    <span className="bc-sub">
                      {s.count > 0
                        ? `${s.count} object${s.count === 1 ? "" : "s"}`
                        : `${s.items} line${s.items === 1 ? "" : "s"} of detail`}
                    </span>
                  </div>
                ))}
              </div>

              {unclassified > 0 && (
                <p className="bom-warn">
                  {unclassified} row{unclassified === 1 ? "" : "s"} unclassified &mdash; drawn
                  before a site boundary existed, or a point that was never classified.
                  Redrawing a run classifies it.
                </p>
              )}

              {groups.map((g) => (
                <div className="bom-grp" key={`${g.site}-${g.utility}`}>
                  <p className="bom-grp-head">
                    {/* No pill where there is no site: an empty badge
                        reads as a missing value rather than as a row that
                        does not have one. */}
                    {g.site && (
                      <span className={`bom-pill bom-${g.site.toLowerCase().replace("-", "")}`}>
                        {g.site}
                      </span>
                    )}
                    {g.utility}
                  </p>
                  <table className="bom-tbl">
                    <thead>
                      <tr>
                        <th>Item</th><th>Surface</th>
                        <th className="num">Quantity</th><th className="num">Features</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((r, i) => (
                        <tr key={i}>
                          <td>{r.item}</td>
                          <td className="bom-surf">{r.surface || "\u2014"}</td>
                          <td className="num">
                            {Number(r.quantity).toFixed(r.unit === "m" ? 1 : 0)} {r.unit}
                          </td>
                          <td className="num bom-count">{r.features}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="fe-foot">
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn accent" disabled={!rows.length} onClick={exportXlsx}>
            Export to Excel
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.bom { background: var(--white); border-radius: 12px; width: min(760px, 94vw);
  max-height: 88vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.bom-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.bom-head > div { flex: 1; }
.bom-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
.bom-who { display: flex; align-items: baseline; gap: 8px; margin-top: 9px; }
.bom-who label { font-size: 11px; color: var(--muted); }
.bom-who select { border: 1px solid var(--border); border-radius: 6px; font: 600 12px inherit;
  padding: 4px 9px; }
.bom-who-n { font-size: 11px; color: var(--muted); }
.bom-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); }
.bom-body { padding: 15px 18px; overflow-y: auto; flex: 1; }
.bom-empty { color: var(--muted); font-size: 13px; text-align: center; padding: 50px 20px; }
.bom-tot { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px; margin-bottom: 14px; }
.bom-card { border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px;
  display: flex; flex-direction: column; gap: 1px; }
.bom-card.bom-onsite { border-color: #16a34a; background: #f0fdf4; }
.bom-card.bom-offsite { border-color: #9333ea; background: #faf5ff; }
.bc-label { font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); }
.bc-main { font-size: 19px; font-weight: 700; }
.bc-sub { font-size: 11px; color: var(--muted); }
.bom-warn { font-size: 11.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a;
  border-radius: 6px; padding: 7px 10px; margin: 0 0 14px; }
.bom-grp { margin-bottom: 16px; }
.bom-grp-head { display: flex; align-items: center; gap: 8px; margin: 0 0 5px;
  font-size: 12.5px; font-weight: 700; }
.bom-pill { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  border-radius: 20px; padding: 1px 8px; background: var(--bg); color: var(--muted);
  border: 1px solid var(--border); }
.bom-pill.bom-onsite { background: #16a34a; color: #fff; border-color: #16a34a; }
.bom-pill.bom-offsite { background: #9333ea; color: #fff; border-color: #9333ea; }
.bom-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.bom-tbl th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); padding: 4px 8px; border-bottom: 1px solid var(--border); }
.bom-tbl td { padding: 5px 8px; border-bottom: 1px solid var(--border); }
.bom-tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.bom-surf { color: var(--muted); }
.bom-count { color: var(--muted); font-size: 11.5px; }
`;
