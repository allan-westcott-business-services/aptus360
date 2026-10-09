import { AREAS, firstViewOf } from "../../lib/navigation.js";
import { areaVisible, firstGrantedView } from "../../lib/access.js";
import { areaVars } from "../../lib/colour.js";

/* The landing page: one square per area of the business.

   It exists because the sidebar had grown to eleven sections and about
   seventy items, nearly all of which are irrelevant to whoever is
   looking at it. Choosing an area here scopes the menu to that area, so
   the planner sees eight operations screens rather than seventy.

   Each square carries its section's name and nothing else. It listed
   the screens behind it and a count of how many were live, which made
   the page useful as a migration board while most sections were empty;
   now that they are mostly built, that detail is noise in front of a
   choice between eight things. The colour and the name are enough to
   pick by. */



/* ── A section somebody has no access to is shown, in grey ──

   Asked for: "I want to restrict access to the main 8 sections by
   showing them as grey / monochrome buttons if they do not have access
   to that section."

   This replaced hiding them, which is what went in first. Hiding is the
   tidier instinct and it is the worse one here: eight squares is the
   shape of the business, and a person who sees five of them has no way
   to tell whether Commercial does not apply to their job, has not been
   built, or is simply not theirs — so they ask nobody and assume the
   app is smaller than it is. A grey square says there IS a Commercial
   section and it is not yours, which is a thing somebody can act on.

   Grey by the same route the colour arrives: the square's colour is
   data, fed in as custom properties, so a locked one is fed a neutral
   instead of being filtered. `filter: grayscale()` would have left the
   label at full strength and greyed the logo colours by accident. */

/* The neutral a locked square is drawn in. The same slate the
   not-built-yet placeholder badge falls back to, so "not for you" and
   "not here yet" read as the same kind of absence rather than as two
   different warnings. */
const LOCKED_COLOUR = "#94a3b8";

/* ── Two reasons a square does not open ──

   They are drawn the same and they mean different things, so they say
   different things. "No access" is something to take to the office.
   "To Be Developed" is not, and somebody who reads the first when the
   second is true raises a ticket that cannot be answered. */
const NO_ACCESS = "No access";
const TO_BE_DEVELOPED = "To Be Developed";

/* `keys` is the menu access this person has been granted, or null where
   access control is off — the unconfigured sample-data mode, which has
   no login and so nobody to grant anything to. See lib/access.js. */
export default function HomePage({ onOpen, keys = null }) {
  /* Every section, always. Which of them OPEN is the question, and an
     area with nothing behind it yet is shut to everybody — including
     in the sample-data mode below, where access control is off and
     every other square opens. */
  const open = (area) =>
    area.toBeDeveloped !== true && (keys ? areaVisible(keys, area) : true);
  /* And the screen it opens on is the first one they HAVE, not the
     first one that exists — otherwise Design sends a draughtsman who
     only has the canvas to the projects list and a refusal. */
  const openAt = (area) => (keys ? firstGrantedView(keys, area) : firstViewOf(area));

  return (
    <div className="home">
      <style>{CSS}</style>

      <header className="home-head">
        <img className="home-logo" src="/aptus360-logo.png"
          alt="Aptus360 — End-to-End MU Management" />
        <h1>Choose a section</h1>
        <p>Each section opens with only its own screens in the menu.</p>
      </header>

      <div className="home-grid">
        {AREAS.map((area) => {
          const allowed = open(area);
          /* Which kind of closed square this is. Taken from the area
             rather than from `allowed`, so a section that is both
             unbuilt and ungranted says the thing that is true of it —
             access cannot fix a screen that does not exist. */
          const why = area.toBeDeveloped === true ? TO_BE_DEVELOPED : NO_ACCESS;
          return (
            <button
              key={area.id}
              type="button"
              className={allowed ? "area-sq" : "area-sq locked"}
              /* `disabled` rather than an onClick that declines.
                 A disabled button takes no click, no Enter and no tab
                 stop, so there is one state to get right instead of a
                 handler that has to remember to refuse — and the shell
                 still refuses the view underneath either way. */
              disabled={!allowed}
              /* Said on hover as well as drawn, because grey alone is a
                 convention somebody has to already know. */
              title={allowed ? undefined
                : why === TO_BE_DEVELOPED
                  ? `${area.label} — not built yet`
                  : `${area.label} — you have not been given access to this section`}
              /* The colour is per area and comes from data, so it cannot
                 live in the stylesheet. Everything else does. */
              style={areaVars(allowed ? area.colour : LOCKED_COLOUR)}
              onClick={() => onOpen(openAt(area))}
            >
              <span className="area-name">{area.label}</span>
              {/* Spelled out under the name on the locked ones. The
                  grey carries it for anybody who knows the convention;
                  this is for everybody else, and it is the difference
                  between asking for access and reporting a fault. */}
              {!allowed && <span className="area-locked">{why}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CSS = `
/* Narrower than the rest of the app on purpose. The grid is four across
   and eight areas make two rows; capping the width is what keeps the
   squares at a size where both rows and the heading fit a laptop screen
   without scrolling. Left as a max, so a small window still reflows. */
.home { max-width: 836px; margin: 0 auto; padding: 20px 4px 40px; }

.home-head { text-align: center; margin-bottom: 22px; }
.home-logo {
  width: 150px; height: auto; display: block; margin: 0 auto 14px;
}
.home-head h1 {
  margin: 0 0 4px; font-size: 21px; font-weight: 700; letter-spacing: -0.015em;
}
.home-head p { margin: 0; font-size: 12.5px; color: var(--muted); }

.home-grid {
  display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

/* The square. The outline is the identity of the area, so it is 2px and
   in full colour rather than a hairline that would read as a generic
   card border. */
/* A column with a gap, so a locked square can carry "No access" under
   its name; with one child it behaves exactly as it did. It also brings
   this rule into line with the audience landing page, which has stacked
   a name over a blurb all along — checkportallanding.mjs holds the two
   squares to the same declarations, and the comment is out here rather
   than inside the braces because that check reads the rule as text and
   a comment in the middle of it counts as a difference. */
.area-sq {
  position: relative; aspect-ratio: 1; min-height: 110px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  text-align: center;
  padding: 14px;
  background: var(--white);
  border: 2px solid var(--sq);
  border-radius: 14px;
  font-family: inherit; color: var(--text); cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: transform .16s ease, box-shadow .16s ease, background-color .16s ease;
}
.area-sq:hover {
  background: var(--sq-wash);
  transform: translateY(-3px);
  box-shadow: 0 10px 22px var(--sq-glow);
}
.area-sq:active { transform: translateY(-1px); }
.area-sq:focus-visible {
  outline: 3px solid var(--sq-ring);
  outline-offset: 3px;
}

.area-name {
  font-size: 15.5px; font-weight: 700; line-height: 1.3;
  letter-spacing: -0.01em; text-wrap: balance;
}

/* ── A section this person has not been given ──

   Drawn rather than hidden, so the shape of the business is the same
   for everybody and a missing section reads as "not yours" instead of
   "not there". The neutral comes in through the same custom properties
   the colour does, so the border and the wash follow automatically;
   what is left here is the flattening — no lift, no shadow, a lighter
   label — and taking the hover and focus behaviour off, because a
   square that lifts under the pointer is a square that invites a
   press. */
.area-sq.locked {
  /* The 16% tint rather than the 6% wash the live squares hover to: a
     faint grey fill is what reads as switched off, where near-white
     reads as an ordinary square that has simply lost its colour. */
  background: var(--sq-tint);
  color: var(--muted);
  box-shadow: none;
  cursor: not-allowed;
}
.area-sq.locked .area-name { font-weight: 600; opacity: .75; }
/* :hover and :active are listed again because the rules above them set
   a transform and a shadow, and a disabled button still receives hover
   in every browser. */
.area-sq.locked:hover, .area-sq.locked:active {
  background: var(--sq-tint);
  transform: none;
  box-shadow: none;
}

.area-locked {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); opacity: .85;
}

@media (max-width: 560px) {
  .home-grid { grid-template-columns: 1fr; }
  /* A full-width square is a very tall box on a phone, so one row of
     name-height is enough there. */
  .area-sq { aspect-ratio: auto; min-height: 0; padding: 22px 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .area-sq { transition: none; }
  .area-sq:hover { transform: none; }
}
`;
