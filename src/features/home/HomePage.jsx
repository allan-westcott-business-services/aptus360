import { AREAS, areaBuiltCount, firstViewOf } from "../../lib/navigation.js";
import { areaVars } from "../../lib/colour.js";

/* The landing page: one square per area of the business.

   It exists because the sidebar had grown to eleven sections and about
   seventy items, nearly all of which are irrelevant to whoever is
   looking at it. Choosing an area here scopes the menu to that area, so
   the planner sees eight operations screens rather than seventy.

   Each square previews the screens behind it and says how many are
   live. That number is the honest one — it counts `built` items, the
   same flag the sidebar and People & Roles read — so the page keeps
   working as a migration board rather than promising eight screens and
   delivering three. */

/* Five names fit a square at the narrowest column width before the list
   starts to wrap past its space. Beyond that, count the rest. */
const PREVIEW = 5;

function previewOf(area) {
  const names = area.items.map((i) => i.label);
  if (names.length <= PREVIEW) return names.join(" \u00B7 ");
  const rest = names.length - PREVIEW;
  return `${names.slice(0, PREVIEW).join(" \u00B7 ")} \u00B7 +${rest} more`;
}

export default function HomePage({ onOpen }) {
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
          const live = areaBuiltCount(area);
          const total = area.items.length;
          return (
            <button
              key={area.id}
              type="button"
              className="area-sq"
              /* The colour is per area and comes from data, so it cannot
                 live in the stylesheet. Everything else does. */
              style={areaVars(area.colour)}
              onClick={() => onOpen(firstViewOf(area))}
            >
              <span className="area-glyph" aria-hidden="true">{area.icon}</span>

              <span className="area-name">{area.label}</span>
              <span className="area-blurb">{area.blurb}</span>

              <span className="area-list">{previewOf(area)}</span>

              <span className="area-foot">
                <span className="area-count">
                  {live === total
                    ? `${total} ${total === 1 ? "screen" : "screens"}`
                    : `${live} of ${total} live`}
                </span>
                <span className="area-go" aria-hidden="true">&rarr;</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CSS = `
.home { max-width: 1180px; margin: 0 auto; padding: 26px 4px 56px; }

.home-head { text-align: center; margin-bottom: 30px; }
.home-logo {
  width: 190px; height: auto; display: block; margin: 0 auto 20px;
}
.home-head h1 {
  margin: 0 0 5px; font-size: 25px; font-weight: 700; letter-spacing: -0.015em;
}
.home-head p { margin: 0; font-size: 13.5px; color: var(--muted); }

.home-grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(232px, 1fr));
}

/* The square. The outline is the identity of the area, so it is 2px and
   in full colour rather than a hairline that would read as a generic
   card border. */
.area-sq {
  position: relative; aspect-ratio: 1; min-height: 232px;
  display: flex; flex-direction: column; align-items: flex-start;
  gap: 0; text-align: left;
  padding: 20px 20px 17px;
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

.area-glyph {
  width: 42px; height: 42px; flex: none; margin-bottom: 14px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px; font-size: 20px; line-height: 1;
  background: var(--sq-tint);
}

.area-name {
  font-size: 16.5px; font-weight: 700; line-height: 1.25;
  letter-spacing: -0.01em; margin-bottom: 5px;
}
.area-blurb {
  font-size: 12px; line-height: 1.5; color: var(--muted);
}

/* Pushed to the bottom so the names sit above the footer whatever the
   blurb's length, and every square's rule lines up across the row. */
.area-list {
  margin-top: auto; padding-top: 12px;
  font-size: 11px; line-height: 1.5; color: var(--muted);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;
}

.area-foot {
  width: 100%; margin-top: 11px; padding-top: 10px;
  border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.area-count {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--sq);
}
.area-go {
  font-size: 15px; line-height: 1; color: var(--sq);
  transition: transform .16s ease;
}
.area-sq:hover .area-go { transform: translateX(3px); }

@media (max-width: 560px) {
  .home-grid { grid-template-columns: 1fr; }
  /* A full-width square is a very tall box on a phone, and the preview
     list is what it can afford to lose. */
  .area-sq { aspect-ratio: auto; min-height: 0; }
  .area-list { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .area-sq, .area-go { transition: none; }
  .area-sq:hover { transform: none; }
  .area-sq:hover .area-go { transform: none; }
}
`;
