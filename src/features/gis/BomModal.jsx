import { useState, useEffect, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import * as XLSX from "xlsx";
import Banner from "../../components/Banner.jsx";
import { getGisBom } from "../../api/gis.js";
import { parseHex, tint, contrast } from "../../lib/pillColour.js";

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
/* The order the sections read in.

   Off-site first. It is the work that has to happen before anything on
   the development can be connected — the main brought to the site
   boundary — so a bill walked top to bottom follows the order the
   ground is dug in rather than the order the two happen to be named.

   Drives the sections, the per-site totals and the Excel summary
   together. gis_bom orders the same way, so the sheet and the screen
   cannot disagree; changing one without the other is what would leave
   the export reading differently from the modal it was taken from. */
const SITE_ORDER = ["Off-site", "On-site", "Unclassified", ""];

/* A name Excel will accept for a worksheet.

   Four rules, all of which it enforces by refusing to open the file
   rather than by complaining as it is written — so a developer called
   "Anwyl Homes (North West) / Cheshire" produces a workbook that will
   not open, with nothing to say why.

     no : \ / ? * [ ]        replaced, not stripped, so two developers
                             differing only in punctuation stay different
     31 characters           trimmed from the end
     not empty               falls back rather than failing
     unique in the workbook  a numeric suffix, kept inside the 31

   Exported so the rules can be tested without building a workbook. */
/* Rows that describe the same thing, added together.

   gis_bom groups by developer, so a site with two of them returns two
   "Mains Trench / Unmade" rows. In a sheet with a Developer column that
   is a split worth having; on screen there is no such column, so it
   reads as the same item listed twice for no reason, and the reader is
   left adding up by eye.

   Merged on what identifies the item — where it is, whose utility, what
   it is, what it is dug through — and nothing else. Quantities and
   feature counts add; the developer becomes many, and is dropped rather
   than guessed at. */
export function mergeRows(rows = []) {
  const out = new Map();
  for (const r of rows) {
    const key = [r.site, r.utility, r.item, r.surface, r.unit].join("\u0000");
    const prev = out.get(key);
    if (!prev) {
      out.set(key, { ...r });
      continue;
    }
    prev.quantity = Number(prev.quantity) + Number(r.quantity);
    prev.features = Number(prev.features) + Number(r.features);
    /* No longer one developer's. Nulled rather than left showing the
       first one merged, which would name an owner for a quantity that
       is partly someone else's. */
    if (String(prev.developer_id ?? "") !== String(r.developer_id ?? "")) {
      prev.developer_id = null;
      prev.developer_name = null;
      /* Marked, because a merged row and an unassigned one both end up
         with no developer and they are not the same thing: one is
         several people's, the other is nobody's. A sheet that called a
         merged quantity "(shared)" would be claiming it was the
         substation's. */
      prev.merged = true;
    }
  }
  /* Rounded once, at the end. Adding two figures already rounded to two
     places can leave a third — 0.1 + 0.2 in binary — and a quantity
     reading 377.00000000000006 is not a quantity anyone trusts. */
  return [...out.values()].map((r) => ({
    ...r, quantity: Math.round(Number(r.quantity) * 100) / 100,
  }));
}

export function sheetName(raw, used = new Set()) {
  let base = String(raw ?? "").replace(/[\\/:*?[\]]/g, "-").trim().slice(0, 31).trim();
  if (!base) base = "Sheet";

  if (!used.has(base.toLowerCase())) { used.add(base.toLowerCase()); return base; }

  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const cand = `${base.slice(0, 31 - suffix.length).trim()}${suffix}`;
    if (!used.has(cand.toLowerCase())) { used.add(cand.toLowerCase()); return cand; }
  }
  return base.slice(0, 31);
}

/* ── What a section is painted with ──

   One colour, given four ways, so the section reads as one block: the
   band at full strength, the column headings at a little over half, the
   rows barely tinted, and the rules between them somewhere in between.

   Mixed towards white rather than made translucent, for the reason
   `tint` gives: alpha takes the colour of whatever is behind it, and a
   modal that is dragged over a drawing has something different behind
   it every time it moves.

   The ink on the band is worked out rather than fixed at white. Every
   utility on a seeded drawing is dark enough to take white, but the
   colour is editable — it is one UPDATE on Utility — and white on a
   pale yellow is the sort of thing that ships because nobody tried it.
   The same contrast comparison the status pills use, so a colour that
   reads one way there cannot read the other way here.

   Null where there is no usable colour, and the section then draws
   exactly as it did before: a utility somebody has not coloured should
   look plain rather than look broken. */
export function utilitySkin(colour) {
  if (!parseHex(colour)) return null;
  const bg = String(colour).trim();
  return {
    "--u": bg,
    "--u-ink": contrast(bg, "#1f2937") >= contrast(bg, "#ffffff") ? "#1f2937" : "#ffffff",
    "--u-head": tint(bg, 0.55),
    "--u-row": tint(bg, 0.9),
    "--u-line": tint(bg, 0.72),
  };
}

export default function BomModal({ projectId, projectName, utilities = [], layers = [], onClose }) {
  const [rows, setRows] = useState([]);
  /* ── The colour each section is drawn in ──

     Keyed on the name the bill puts in the section heading, because
     that is all a row carries: gis_bom returns the utility's name, and
     falls back to the layer's label for anything on a layer with no
     utility — trench, which is most of the metres on a drawing.

     So both are read, and the utility second so it wins where a layer
     happens to be labelled the same as a utility.

     A utility with no colour of its own falls through to its layer's,
     which is where the colour lived before 0123 moved it up. Nothing
     here writes a colour or picks one: a section whose utility nobody
     has coloured stays plain, which is the honest answer rather than a
     palette invented at render time. */
  const skins = useMemo(() => {
    const out = new Map();
    const put = (name, colour) => {
      const skin = utilitySkin(colour);
      if (name && skin) out.set(String(name).trim().toLowerCase(), skin);
    };
    for (const l of layers) put(l.Label, l.Colour);
    for (const u of utilities) {
      put(u.Utility, u.Colour
        || layers.find((l) => Number(l.Utility_ID) === Number(u.Utility_ID))?.Colour);
    }
    return out;
  }, [utilities, layers]);

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
  const shown = useMemo(() => mergeRows(whose
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
    const stamp = new Date().toISOString().slice(0, 10);
    const safe = String(projectName || `Project ${projectId}`).replace(/[\\/:*?[\]]/g, "-");

    /* One row per grouping, which is the sheet people will pivot from.
       Quantity stays numeric — writing "417.2 m" into the cell makes it
       text and every sum downstream returns zero. The unit has its own
       column for the same reason. */
    const detailOf = (list) => list.map((r) => ({
      Site: r.site || "n/a",
      Utility: r.utility,
      /* Named on every row, so a sheet that has been filtered or pivoted
         still says whose work it is. */
      Developer: r.developer_name ?? (r.merged ? "(various)" : "(shared)"),
      Item: r.item,
      Surface: r.surface || "",
      Unit: r.unit,
      Quantity: Number(r.quantity),
      Features: Number(r.features),
    }));

    const summaryOf = (list) => SITE_ORDER.map((site) => {
      const items = list.filter((r) => r.site === site);
      if (!items.length) return null;
      return {
        Site: site || "Not site-dependent",
        "Length (m)": Number(totalsFor(items, "m").toFixed(2)),
        "Objects (no.)": totalsFor(items, "no."),
        "Lines of detail": items.length,
      };
    }).filter(Boolean);

    const bySurfaceOf = (list) => [...list
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
    const used = new Set();
    const add = (name, data) => {
      if (!data.length) return;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), sheetName(name, used));
    };

    /* The whole site first, whatever is selected on screen.

       The file used to hold only what was showing, so a workbook made
       while reading one developer's bill was indistinguishable from the
       site's — which is how a wrong figure reaches a tender. It now
       carries everything, and the reader picks a tab.

       Shared plant is in every developer's tab and once in the site's,
       so a developer's tab can be read on its own without the substation
       missing, while the site total still counts it once. */
    /* Merged, so the sheet reads like the screen. An export whose row
       count differs from the panel it came from invites the question of
       which one is right. */
    const whole = mergeRows(rows);
    add("Summary", summaryOf(whole));
    add("Bill of Materials", detailOf(whole));
    add("By Surface", bySurfaceOf(whole));

    /* A tab each. Named for the developer, trimmed and made unique for
       Excel, which refuses a sheet name over 31 characters or holding
       any of : \\ / ? * [ ] — and refuses two the same. */
    for (const d of developers) {
      const mine = mergeRows(rows.filter((r) =>
        String(r.developer_id ?? "") === d.id || r.developer_id == null));
      add(d.name, detailOf(mine));
    }

    XLSX.writeFile(wb, `BOM ${safe} ${stamp}.xlsx`.replace(/\s+/g, " ").trim());
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

              {groups.map((g) => {
                /* Null for a section with no colour behind it, and the
                   class goes with it — so the tinted rules never apply
                   with the variables they read left undefined, which
                   would paint a section in whatever `background: var(--u)`
                   falls back to. */
                const skin = skins.get(String(g.utility).trim().toLowerCase()) ?? null;
                return (
                  <div className={`bom-grp${skin ? " tinted" : ""}`} style={skin ?? undefined}
                    key={`${g.site}-${g.utility}`}>
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
                );
              })}
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

/* ── A section in its utility's colour ──

   Only where one was resolved. Everything below is scoped to .tinted,
   so a section with no colour keeps the plain heading and the plain
   rules it has always had rather than falling back to an undefined
   variable.

   The block is clipped and the band square, so the band, the headings
   and the rows read as one thing with one edge — the point of colouring
   them at all is that the eye can find where gas stops and water
   starts without reading the words. */
.bom-grp.tinted { border: 1px solid var(--u-line); border-radius: 8px; overflow: hidden; }
.bom-grp.tinted .bom-grp-head { background: var(--u); color: var(--u-ink);
  margin: 0; padding: 6px 10px; font-size: 13px; letter-spacing: .01em; }
/* On the band the site badge is a chip of the band itself rather than
   its own green or purple: two saturated colours a few pixels apart
   compete, and the word inside it already says which site it is. */
.bom-grp.tinted .bom-grp-head .bom-pill { background: rgba(255,255,255,.24);
  color: inherit; border-color: rgba(255,255,255,.5); }
.bom-grp.tinted .bom-tbl th { background: var(--u-head); color: #1f2937;
  border-bottom-color: var(--u-line); padding: 5px 10px; }
.bom-grp.tinted .bom-tbl td { background: var(--u-row);
  border-bottom-color: var(--u-line); padding: 5px 10px; }
/* Nothing under the last row: the block's own border is the edge, and a
   rule just inside it reads as a line that failed to line up. */
.bom-grp.tinted .bom-tbl tr:last-child td { border-bottom: 0; }
/* The muted greys are legible on a tint this pale, but only just once
   the utility is a dark one — so they take the ink rather than the
   grey, at the weight that kept them secondary in the first place. */
.bom-grp.tinted .bom-surf, .bom-grp.tinted .bom-count { color: #6b7280; }
`;
