import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminUpdate } from "../../api/admin.js";
import {
  digEstimate, hoursText, DEFAULT_SURFACE_FACTORS,
} from "../../features/gis/digRate.js";
import { trenchSize } from "../../features/gis/trenchSize.js";

/* The numbers behind every dig and lay estimate.

   ── Why these are edited and the NJUG ones are not ──

   trenchSize.js keeps its separations in code and says why: a published
   standard changes when the standard changes, not per project. These
   are the opposite case. They are a company's own, they differ by
   machine and by ground, and the whole point of them is that they move
   as real jobs come in.

   Which is the reason this screen exists. The rates went into the
   database so they could be corrected without a deploy, and for a while
   correcting them meant opening the SQL editor — which is not much
   better than a deploy, and worse in one way: nobody but a developer
   could do it.

   ── What one number here moves ──

   All of it. A rate feeds the width and depth panel on every trench,
   the estimate on the trench editor, the half-days on every call-off
   section, the default end date of every excavation assignment, and the
   labour rows on every bill.

   So the effect is shown before it is saved. The worked example on the
   right is a real trench put through the real model — the same
   digEstimate every screen calls — and it updates as the fields are
   typed in. A rate is a number until you see it turn into four days.

   ── Estimate and measured ──

   Source and Sample_Size are not two more fields. They are what lets a
   figure say whether anybody has checked it: every screen showing a
   duration reads them and says either "Planning estimate — not
   measured" or "From 31 recorded jobs".

   Left as free fields, anyone could set a made-up rate to measured and
   the sentence would lie. So they are not editable directly. Calibrate
   takes a rate and a number of jobs together and writes all three, and
   there is no way to claim a sample without giving one. */

const round2 = (v) => Math.round(v * 100) / 100;

/* A trench to put the rates through: a joint trench of one gas, one
   water and one LV, a hundred metres of it.

   A real shape rather than a round number, because the point is to
   watch a rate become a duration somebody would recognise. */
const EXAMPLE = {
  lengthM: 100,
  items: [
    { utility: "gas", outsideDiameterMM: 180, withinM: 100 },
    { utility: "water", outsideDiameterMM: 110, withinM: 100 },
    { utility: "electric", withinM: 100 },
  ],
};

export default function DigRatesAdmin() {
  const [rates, setRates] = useState([]);
  const [bands, setBands] = useState([]);
  const [lays, setLays] = useState([]);
  const [surfaces, setSurfaces] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaid] = useState("");
  const [busy, setBusy] = useState(null);

  /* What is being edited, and what it was. Kept apart so a field can be
     typed into without every keystroke going to the server, and so
     Cancel means something. */
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState({});

  /* Calibrating a rate: the measured output and how many jobs it came
     from, together. */
  const [calibrating, setCalibrating] = useState(null);
  const [cal, setCal] = useState({ rate: "", jobs: "" });

  async function load() {
    try {
      const [r, d, l, s] = await Promise.all([
        adminList("Dig_Rate"),
        adminList("Dig_Depth_Factor"),
        adminList("Dig_Lay_Rate"),
        adminList("GIS_Surface_Type"),
      ]);
      setRates(r.rows || []);
      setBands(d.rows || []);
      setLays(l.rows || []);
      setSurfaces(s.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  /* The tables as the model wants them, so the example below is worked
     out by the same code the canvas uses rather than by a copy of it
     living on this screen. */
  const model = useMemo(() => ({
    rates: rates.filter((r) => r.Is_Active).map((r) => ({
      key: r.Machine_Key,
      label: r.Label,
      baseRateM3Hr: Number(r.Base_Rate_M3_Hr),
      setupMinutes: Number(r.Setup_Minutes),
      isDefault: !!r.Is_Default,
      source: r.Source,
      sampleSize: Number(r.Sample_Size) || 0,
    })),
    depthBands: bands.map((b) => ({
      fromM: Number(b.Depth_From_M),
      toM: b.Depth_To_M == null ? null : Number(b.Depth_To_M),
      factor: Number(b.Factor),
      note: b.Note,
    })),
    layRates: Object.fromEntries(lays
      .filter((l) => l.Is_Active)
      .map((l) => [l.Utility_Key, Number(l.Rate_M_Hr)])),
    surfaceTypes: surfaces,
  }), [rates, bands, lays, surfaces]);

  /* The worked example, per surface, with whatever is in the fields
     right now — including a row being edited, so a rate can be watched
     turning into a duration before it is saved. */
  const example = useMemo(() => {
    const size = trenchSize(EXAMPLE.items, { trenchM: EXAMPLE.lengthM });
    return surfaces
      .filter((s) => s.Is_Active)
      .map((s) => {
        const est = digEstimate({
          lengthM: EXAMPLE.lengthM,
          size,
          surfaceKey: s.Surface_Key,
          utilities: EXAMPLE.items.map((x) => x.utility),
          ...model,
        });
        return { surface: s.Label, est };
      })
      .filter((x) => x.est.ok);
  }, [model, surfaces]);

  const shown = example[0]?.est ?? null;

  function startEdit(kind, row, pk) {
    setEdit({ kind, id: row[pk], pk });
    setDraft({ ...row });
    setSaid("");
  }

  async function saveEdit(table) {
    setBusy("save");
    try {
      await adminUpdate(table, edit.id, draft);
      await load();
      setEdit(null);
      setSaid("Saved. Every estimate on every project now uses it.");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  /* Making one machine the default takes it off the other.

     Dig_Rate has a unique index over Is_Default, so ticking a second
     one fails with a constraint error nobody could act on. The flag is
     moved rather than set: cleared where it was, then written where it
     is wanted, and in that order so the two are never both true. */
  async function makeDefault(row) {
    setBusy(`default:${row.Dig_Rate_ID}`);
    try {
      for (const r of rates) {
        if (r.Is_Default && Number(r.Dig_Rate_ID) !== Number(row.Dig_Rate_ID)) {
          await adminUpdate("Dig_Rate", r.Dig_Rate_ID, { Is_Default: false });
        }
      }
      await adminUpdate("Dig_Rate", row.Dig_Rate_ID, { Is_Default: true });
      await load();
      setSaid(`${row.Label} is now assumed where no machine is chosen.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  /* Replacing an estimate with what actually happened.

     The rate, the source and the sample are written together, because
     they are one fact: this is the output we measured, over this many
     jobs. Set separately, somebody could mark a guess as measured and
     every screen would repeat the claim. */
  async function calibrate(row) {
    const rate = Number(cal.rate);
    const jobs = Math.floor(Number(cal.jobs));
    if (!(rate > 0)) { setError("Give the measured output, in m³ an hour."); return; }
    if (!(jobs > 0)) { setError("Give the number of jobs it came from."); return; }

    setBusy("cal");
    try {
      await adminUpdate("Dig_Rate", row.Dig_Rate_ID, {
        Base_Rate_M3_Hr: rate, Source: "measured", Sample_Size: jobs,
      });
      await load();
      setCalibrating(null);
      setCal({ rate: "", jobs: "" });
      setSaid(`${row.Label} now reports "From ${jobs} recorded job`
        + `${jobs === 1 ? "" : "s"}" wherever a duration is shown.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  if (loading) return <p className="admin-wait">Loading…</p>;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">Dig &amp; Lay Rates</h2>

      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}
      {saved && <Banner kind="ok" onClose={() => setSaid("")}>{saved}</Banner>}

      <p className="dr-intro">
        How long a trench takes to open and to lay. These are not NJUG:
        NJUG sets how deep a main sits and how far it sits from the next
        one, and says nothing about durations. What is below is this
        company&rsquo;s own output, and it is meant to be corrected as real
        jobs are recorded.
      </p>

      {/* ── What it comes to ──

          A real trench through the real model, updating as the fields
          change. Above the tables rather than below them, because it is
          what the tables are for — and a rate is an abstraction until it
          is a number of days. */}
      {shown && (
        <div className="dr-example">
          {/* Said before the numbers, not after.

              Six durations in bold on an admin screen read as this
              company's figures for a job somebody is planning. They are
              not: it is one invented trench put through the tables so a
              rate can be seen as days, and it changes as the fields
              below change.

              Somebody who reads the numbers first and the caption
              second has already taken them for data. */}
          <p className="dr-example-what">
            <strong>An example, not a job.</strong> One made-up trench put
            through the rates below, so a change to a rate can be read as
            a number of days. Edit anything underneath and these move.
          </p>
          <div className="dr-example-head">
            <strong>100 m of joint trench</strong>
            <span>
              {`one gas 180mm, one water 110mm, one LV \u00b7 `}
              {`${shown.widthM}m wide \u00d7 ${shown.depthM}m deep `}
              {`\u00b7 ${shown.machine}`}
            </span>
          </div>
          <div className="dr-example-rows">
            {example.map((x) => (
              <div className="dr-ex" key={x.surface}>
                <span className="dr-ex-surface">{x.surface}</span>
                <span className="dr-ex-total">{hoursText(x.est.totalHours)}</span>
                <span className="dr-ex-split">
                  {`${hoursText(x.est.digHours)} dig \u00b7 `}
                  {`${hoursText(x.est.layHours)} lay`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Machines ── */}
      <h3 className="dr-h">Machine output</h3>
      <p className="dr-note">
        Cubic metres an hour, digging trench in unmade ground: spoil to
        the side, banksman, trimming as it goes. Every other surface is a
        multiplier off that, further down.
      </p>
      <table className="dr-tbl">
        <thead>
          <tr>
            <th>Machine</th>
            <th className="num">m³/hr</th>
            <th className="num">Setup</th>
            <th>Assumed</th>
            <th>Where it comes from</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => {
            const on = edit?.kind === "rate" && edit.id === r.Dig_Rate_ID;
            return (
              <tr key={r.Dig_Rate_ID} className={r.Is_Active ? "" : "off"}>
                <td>
                  {on ? (
                    <input value={draft.Label ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, Label: e.target.value }))} />
                  ) : r.Label}
                </td>
                <td className="num">
                  {on ? (
                    <input type="number" step="0.1" className="dr-num"
                      value={draft.Base_Rate_M3_Hr ?? ""}
                      onChange={(e) => setDraft((d) => ({
                        ...d, Base_Rate_M3_Hr: e.target.value,
                      }))} />
                  ) : Number(r.Base_Rate_M3_Hr)}
                </td>
                <td className="num">
                  {on ? (
                    <input type="number" className="dr-num"
                      value={draft.Setup_Minutes ?? ""}
                      onChange={(e) => setDraft((d) => ({
                        ...d, Setup_Minutes: e.target.value,
                      }))} />
                  ) : `${r.Setup_Minutes} min`}
                </td>
                <td>
                  {/* One default, moved rather than ticked — the unique
                      index behind it makes a second tick an error
                      nobody could act on. */}
                  {r.Is_Default ? (
                    <span className="dr-pill">Assumed</span>
                  ) : (
                    <button className="btn ghost sm" disabled={!!busy || !r.Is_Active}
                      onClick={() => makeDefault(r)}>
                      Use by default
                    </button>
                  )}
                </td>
                <td>
                  {/* Never editable directly. This sentence is what
                      every duration on every screen repeats, so it has
                      to be earned rather than typed. */}
                  {r.Source === "measured" ? (
                    <span className="dr-measured">
                      {`Measured \u00b7 ${r.Sample_Size} job`}
                      {Number(r.Sample_Size) === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="dr-estimate">Planning estimate</span>
                  )}
                </td>
                <td className="dr-act">
                  {on ? (
                    <>
                      <button className="btn accent sm" disabled={busy === "save"}
                        onClick={() => saveEdit("Dig_Rate")}>Save</button>
                      <button className="btn ghost sm"
                        onClick={() => setEdit(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn ghost sm"
                        onClick={() => startEdit("rate", r, "Dig_Rate_ID")}>Edit</button>
                      <button className="btn ghost sm" onClick={() => {
                        setCalibrating(r.Dig_Rate_ID);
                        setCal({ rate: String(r.Base_Rate_M3_Hr), jobs: "" });
                      }}>Calibrate</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Calibrating ──

          The rate and the sample together, because they are one fact.
          Nothing here can mark a guess as measured without saying how
          many jobs it came from. */}
      {calibrating != null && (() => {
        const r = rates.find((x) => Number(x.Dig_Rate_ID) === Number(calibrating));
        if (!r) return null;
        return (
          <div className="dr-cal">
            <strong>{`Calibrate ${r.Label}`}</strong>
            <p>
              What the machine actually managed, and over how many jobs.
              Both are written together — a rate cannot be called measured
              without a sample behind it, because every screen showing a
              duration repeats that claim.
            </p>
            <div className="dr-cal-row">
              <label>
                Measured output
                <input type="number" step="0.1" value={cal.rate}
                  onChange={(e) => setCal((c) => ({ ...c, rate: e.target.value }))} />
                <span>m³/hr</span>
              </label>
              <label>
                From
                <input type="number" value={cal.jobs}
                  onChange={(e) => setCal((c) => ({ ...c, jobs: e.target.value }))} />
                <span>recorded jobs</span>
              </label>
              <button className="btn accent sm" disabled={busy === "cal"}
                onClick={() => calibrate(r)}>Save as measured</button>
              <button className="btn ghost sm"
                onClick={() => setCalibrating(null)}>Cancel</button>
            </div>
            <p className="dr-cal-warn">
              Log the machine and whether any hand-digging near live
              services was needed alongside each job before averaging.
              Hand-dig is usually the largest single source of variance on
              utility trenching, and left in it pollutes the rate.
            </p>
          </div>
        );
      })()}

      {/* ── Depth ── */}
      <h3 className="dr-h">Depth</h3>
      <p className="dr-note">
        How much slower the same machine is as the trench deepens.
        Applied after the volume, so it is not counting the extra dig
        twice — it is the spoil travelling further, the accuracy
        mattering more, and past about a metre the sides having to be
        held.
      </p>
      <table className="dr-tbl">
        <thead>
          <tr>
            <th>From</th><th>To</th><th className="num">Factor</th>
            <th>Why</th><th />
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => {
            const on = edit?.kind === "band" && edit.id === b.Dig_Depth_Factor_ID;
            return (
              <tr key={b.Dig_Depth_Factor_ID}>
                <td>{`${Number(b.Depth_From_M).toFixed(2)} m`}</td>
                <td>{b.Depth_To_M == null
                  ? "deeper" : `${Number(b.Depth_To_M).toFixed(2)} m`}</td>
                <td className="num">
                  {on ? (
                    <input type="number" step="0.05" className="dr-num"
                      value={draft.Factor ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, Factor: e.target.value }))} />
                  ) : `\u00d7${Number(b.Factor)}`}
                </td>
                <td className="dr-why">{b.Note}</td>
                <td className="dr-act">
                  {on ? (
                    <>
                      <button className="btn accent sm" disabled={busy === "save"}
                        onClick={() => saveEdit("Dig_Depth_Factor")}>Save</button>
                      <button className="btn ghost sm"
                        onClick={() => setEdit(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn ghost sm"
                      onClick={() => startEdit("band", b, "Dig_Depth_Factor_ID")}>
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* The bands have to meet. A gap is a depth that matches nothing
          and an overlap is one that matches two, and either shows here
          rather than as a duration somebody queries months later. */}
      {bands.some((b, i) => i > 0
        && Number(b.Depth_From_M) !== Number(bands[i - 1].Depth_To_M)) && (
        <p className="dr-warn">
          These bands do not meet. A depth between two of them takes
          whichever the database returns first, which is not something to
          leave to chance — each band should start where the one above it
          ends.
        </p>
      )}

      {/* ── Laying ── */}
      <h3 className="dr-h">Laying</h3>
      <p className="dr-note">
        Metres an hour in an open trench. Per utility rather than per
        size: the difference between 63mm and 180mm is small next to the
        difference between drawing in a cable and jointing pipe.
      </p>
      <table className="dr-tbl">
        <thead>
          <tr><th>Utility</th><th className="num">m/hr</th><th>Note</th><th /></tr>
        </thead>
        <tbody>
          {lays.map((l) => {
            const on = edit?.kind === "lay" && edit.id === l.Dig_Lay_Rate_ID;
            return (
              <tr key={l.Dig_Lay_Rate_ID} className={l.Is_Active ? "" : "off"}>
                <td className="dr-cap">{l.Utility_Key}</td>
                <td className="num">
                  {on ? (
                    <input type="number" step="1" className="dr-num"
                      value={draft.Rate_M_Hr ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, Rate_M_Hr: e.target.value }))} />
                  ) : Number(l.Rate_M_Hr)}
                </td>
                <td className="dr-why">{l.Note}</td>
                <td className="dr-act">
                  {on ? (
                    <>
                      <button className="btn accent sm" disabled={busy === "save"}
                        onClick={() => saveEdit("Dig_Lay_Rate")}>Save</button>
                      <button className="btn ghost sm"
                        onClick={() => setEdit(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn ghost sm"
                      onClick={() => startEdit("lay", l, "Dig_Lay_Rate_ID")}>Edit</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Surfaces ──

          Read-only here, and deliberately. The factor lives on
          GIS_Surface_Type because the trench already records its
          surface, and a second place to edit it is a second place for
          the six of them to disagree. Listed so this screen shows the
          whole calculation rather than three quarters of it. */}
      <h3 className="dr-h">Surface</h3>
      <p className="dr-note">
        How much slower each surface is than unmade ground, which is the
        baseline the machine rates were written for. Edited on the
        Surface Types screen, where the surfaces themselves live —
        listed here so the whole calculation can be read in one place.
      </p>
      <table className="dr-tbl">
        <thead>
          <tr>
            <th>Surface</th>
            <th className="num">Factor</th>
            <th>Against unmade</th>
            {/* Reinstatement: area and surface, so it belongs on the
                same row as the dig factor rather than a table of its
                own. */}
            <th className="num">Reinstate m&sup2;/hr</th>
            <th>Where that came from</th>
          </tr>
        </thead>
        <tbody>
          {surfaces.filter((s) => s.Is_Active).map((s) => {
            const f = Number(s.Dig_Factor ?? DEFAULT_SURFACE_FACTORS[s.Surface_Key] ?? 1);
            return (
              <tr key={s.Surface_Key}>
                <td>{s.Label}</td>
                <td className="num">{`\u00d7${round2(f)}`}</td>
                <td className="dr-why">
                  {f === 1 ? "the baseline"
                    : f > 1 ? `${round2(f)}\u00d7 the dig, for breaking out`
                      : `${round2(f)}\u00d7 the dig, softer going`}
                </td>
                <td className="num">
                  {s.Reinstate_M2_Hr ? round2(Number(s.Reinstate_M2_Hr))
                    : <span className="dr-unset">not set</span>}
                </td>
                <td className="dr-why">
                  {/* Provenance, the same way the machine rates carry
                      it: a rate from eleven real jobs is a different
                      thing from one somebody estimated. */}
                  {!s.Reinstate_M2_Hr
                    ? "no estimate for this surface until a rate is set"
                    : s.Reinstate_Source === "measured"
                      ? `measured, ${s.Reinstate_Sample_Size ?? "?"} job(s)`
                      : "an estimate, not yet measured"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {surfaces.filter((s) => s.Is_Active)
        .every((s) => Number(s.Dig_Factor ?? 0) !== 1) && (
        <p className="dr-warn">
          No surface is at 1.00. The machine rates above are written for
          unmade ground, so one of these should be the baseline — if none
          is, every estimate on every project is scaled by something.
        </p>
      )}

      {/* ── Reinstatement, unrated ──

          Said plainly rather than left to be noticed. Until a rate is
          set the phase gets no estimate and somebody types an end date
          from memory — which is what it has always done, and is easy to
          keep doing without realising it could stop. */}
      {surfaces.filter((s) => s.Is_Active && !s.Reinstate_M2_Hr).length > 0 && (
        <p className="dr-warn">
          {`${surfaces.filter((s) => s.Is_Active && !s.Reinstate_M2_Hr).length} `}
          surface(s) have no reinstatement rate, so that phase gets no
          estimate and its end date is typed by hand. There is no public
          source for these figures &mdash; SROH and the council standard
          details specify materials and depths, not durations &mdash; so
          they want a number from somebody who has laid the surface.
        </p>
      )}
    </div>
  );
}

const CSS = `
.dr-intro { max-width: 62ch; color: var(--muted); font-size: 13px; line-height: 1.6;
  margin: 0 0 16px; }
.dr-h { margin: 26px 0 4px; font-size: 14px; font-weight: 700; }
.dr-note { max-width: 62ch; margin: 0 0 10px; font-size: 12px; color: var(--muted);
  line-height: 1.6; }

/* The worked example. Boxed and above the tables, because it is what
   they are for — a rate is an abstraction until it is a number of
   days. */
.dr-example { border: 1px solid var(--border); border-radius: 10px;
  background: var(--bg); padding: 12px 14px; margin-bottom: 8px; }
/* What the example is, above what it says. Amber rather than grey: it
   is a caveat about the figures beside it, not a footnote. */
.dr-example-what { margin: 0 0 12px; padding: 9px 11px; border-radius: 8px;
  background: #fef3e2; border: 1px solid #f2d675; font-size: 12.5px;
  line-height: 1.6; color: #7c4a03; }
.dr-example-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
  margin-bottom: 9px; }
.dr-example-head span { font-size: 11.5px; color: var(--muted); }
/* Three across, so the six surfaces read as two rows of three.

   A grid rather than wrapped flex: flex sized each card to its content
   and fitted five on the first row, leaving the sixth stretched across
   the width on its own — which made Agricultural look like a different
   kind of thing from the five above it. Fixed columns keep every card
   the same size, so the only thing varying between them is the number,
   which is what they are there to be compared on.

   Two across on a narrow panel, then one. Squeezing three columns into
   a sidebar-width panel would wrap "Carriageway 3/4" onto two lines and
   push the durations out of alignment. */
.dr-example-rows { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media (max-width: 900px) {
  .dr-example-rows { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .dr-example-rows { grid-template-columns: 1fr; }
}
.dr-ex { background: var(--white); border: 1px solid var(--border);
  border-radius: 8px; padding: 7px 10px; min-width: 0; }
.dr-ex-surface { display: block; font-size: 10.5px; text-transform: uppercase;
  letter-spacing: .04em; color: var(--muted); font-weight: 700; }
.dr-ex-total { display: block; font: 700 15px inherit; margin: 2px 0 1px; }
.dr-ex-split { display: block; font-size: 11px; color: var(--muted); }

.dr-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 4px; }
.dr-tbl th { text-align: left; padding: 7px 10px; font-size: 10.5px;
  text-transform: uppercase; letter-spacing: .04em; color: var(--muted);
  border-bottom: 1px solid var(--border); }
.dr-tbl td { padding: 7px 10px; border-bottom: 1px solid var(--border); }
.dr-tbl .num { text-align: right; }
.dr-tbl tr.off { opacity: .5; }
.dr-tbl input { font: 500 12.5px inherit; padding: 4px 7px; border-radius: 6px;
  border: 1px solid var(--border); width: 100%; }
.dr-num { max-width: 90px; text-align: right; }
.dr-why { color: var(--muted); font-size: 11.5px; }
.dr-cap { text-transform: capitalize; }
.dr-act { text-align: right; white-space: nowrap; }
.dr-act .btn { margin-left: 5px; }

.dr-pill { display: inline-block; background: var(--accent); color: #fff;
  border-radius: 20px; padding: 1px 9px; font: 700 10.5px inherit; }
/* Which of these a rate shows is the sentence every duration in the
   application repeats, so the two read differently at a glance. */
.dr-measured { color: #15803d; font-weight: 600; font-size: 11.5px; }
.dr-estimate { color: var(--muted); font-style: italic; font-size: 11.5px; }

.dr-cal { border: 1px solid var(--accent); border-radius: 10px; padding: 12px 14px;
  margin: 10px 0 4px; background: var(--white); }
.dr-cal p { max-width: 60ch; font-size: 12px; color: var(--muted); line-height: 1.6;
  margin: 5px 0 10px; }
.dr-cal-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
.dr-cal-row label { display: flex; align-items: center; gap: 6px; font-size: 12px;
  font-weight: 600; }
.dr-cal-row input { font: 500 12.5px inherit; padding: 5px 8px; border-radius: 6px;
  border: 1px solid var(--border); width: 90px; }
.dr-cal-row span { font-weight: 500; color: var(--muted); }
.dr-cal-warn { font-size: 11.5px; }

/* A figure nobody has set. Said as words rather than left blank: an
   empty cell reads as nothing to enter. */
.dr-unset { color: var(--muted); font-style: italic; }
.dr-warn { max-width: 62ch; margin: 6px 0 0; padding: 8px 11px; border-radius: 8px;
  background: #fef3c7; border: 1px solid #fcd34d; font-size: 12px; line-height: 1.6; }
`;
