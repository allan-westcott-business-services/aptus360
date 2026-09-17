/* The front door.

   Four audiences sign in at the same place and want four different
   things, so the first question is which of them is knocking:

     Aptus staff and contractors   the app as it has always been
     Client developer              their own sites and documents
     DNO                           electric DNOs, gas transporters,
                                   water undertakers
     IDNO                          IDNOs, iGTs, NAVs

   ── The square is a signpost, not a permission ──

   Choosing one here does not grant anything. The account decides what
   somebody sees: a staff account that picks "Client Developer" still
   gets the staff app, and a developer account that picks "Aptus Staff"
   still gets their portal. The choice is remembered only so that the
   sign-in screen can say who it is expecting and, afterwards, so a
   developer whose account is not set up yet can be told what is wrong
   rather than shown an empty page.

   That separation matters: a landing page that granted access would
   make the front door the security boundary, which is exactly the
   thing nobody should be able to walk around by editing a URL. */

import { areaVars } from "../../lib/colour.js";

export const AUDIENCES = [
  {
    id: "staff",
    label: "Aptus Staff & Contractors",
    blurb: "The full application.",
    colour: "#2563eb",
  },
  {
    id: "developer",
    label: "Client Developer",
    blurb: "Track your sites, send us what we have asked for, and review what we send you.",
    colour: "#16a34a",
  },
  {
    id: "dno",
    label: "DNO",
    blurb: "Electricity distribution, gas transportation and water undertaking.",
    colour: "#ea580c",
  },
  {
    id: "idno",
    label: "IDNO",
    blurb: "Independent networks: IDNOs, iGTs and NAVs.",
    colour: "#7c3aed",
  },
];

export default function AudienceLanding({ onChoose }) {
  return (
    <div className="home">
      <style>{CSS}</style>

      <header className="home-head">
        <img className="home-logo" src="/aptus360-logo.png"
          alt="Aptus360 \u2014 End-to-End MU Management" />
        <h1>Welcome</h1>
        <p>Tell us who you are, and we will take you to the right place.</p>
      </header>

      <div className="home-grid">
        {AUDIENCES.map((a) => (
          <button key={a.id} type="button" className="area-sq"
            style={areaVars(a.colour)}
            onClick={() => onChoose(a.id)}>
            <span className="area-name">{a.label}</span>
            <span className="area-blurb">{a.blurb}</span>
          </button>
        ))}
      </div>

      <p className="home-foot">
        You will be asked to sign in. If you do not have an account, speak to
        your Aptus contact.
      </p>
    </div>
  );
}

const CSS = `
.home { max-width: 980px; margin: 0 auto; padding: 48px 20px 64px; }
.home-head { text-align: center; margin-bottom: 28px; }
.home-logo { height: 54px; margin-bottom: 14px; }
.home-head h1 { margin: 0 0 6px; font-size: 26px; }
.home-head p { margin: 0; color: var(--muted); }
.home-grid { display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.area-sq { display: flex; flex-direction: column; justify-content: flex-end;
  gap: 8px; min-height: 160px; padding: 18px; text-align: left; cursor: pointer;
  border: 1px solid var(--area-line, #e2e8f0); border-radius: 14px;
  background: var(--area-bg, #f8fafc); color: #0f172a;
  transition: transform .08s ease, box-shadow .12s ease; }
.area-sq:hover { transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(15, 23, 42, .12); }
.area-name { font-size: 18px; font-weight: 700; }
.area-blurb { font-size: 12.5px; color: var(--muted); }
.home-foot { margin-top: 26px; text-align: center; color: var(--muted);
  font-size: 12.5px; }
`;
