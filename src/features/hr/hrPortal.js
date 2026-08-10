/* Human Resources — the HR Portal, running inside Aptus360.
   ────────────────────────────────────────────────────────────────────
   Ported from hr-portal.html, which was a single file of vanilla JS
   against Tailwind, Lucide and Chart.js from CDNs. It is still vanilla
   JS: HumanResourcesPage.jsx gives it two divs to draw into and this
   module writes HTML into them, exactly as it did before.

   Rewriting sixteen modules as React components would have been weeks of
   work with a regression in every one of them. Wrapping it instead means
   the screens behave on day one the way they did the day before, and any
   module can be converted to React later, on its own, without touching
   the other fifteen.

   What changed in the port:

   • The shell is gone. The portal drew its own sidebar, top bar and
     login page; Aptus360 supplies all three, so those were removed and
     renderShell() became the bridge that reports navigation upward.
   • Tailwind is gone with it — the portal only ever used it for a single
     class, and loading it would have restyled the rest of the app.
   • Lucide and Chart.js are bundled instead of fetched from a CDN, and
     the icons are imported by name so only the ones in use ship.
   • Styles are scoped to `.hr-root` — see hrStyles.js for why that is
     load-bearing rather than cosmetic.
   • Dead code that the module system would have rejected outright was
     removed: two superseded analytics builds, one of which declared
     pageAnalytics a second time.

   What did NOT change, and is worth knowing before working on this:

   • These screens read and write a DIFFERENT Supabase project from the
     rest of Aptus360, straight from the browser with the anon key —
     they do not go through /api/*, so their access is governed by that
     project's RLS policies and nothing else. Everywhere else in this
     app the browser never touches Supabase directly. Unifying the two
     is a migration, not a refactor, so it is left as it was.
   • There is no sign-in. The portal bypassed its own login and used the
     anon key as the bearer token, so anyone who can open Aptus360 can
     open these screens. */

import Chart from "chart.js/auto";
import { drawIcons } from "./icons.js";

/* The pane React mounts for us. Everything this module queries or draws
   is inside it. */
export const HR_ROOT_ID = "hr-root";

function hrScope() {
  return document.getElementById(HR_ROOT_ID) || document;
}

/* Scoped stand-in for document.querySelectorAll — see the note in
   build_hr_module.py on why the lookups are confined to the pane. */
function hrAll(selector) {
  return hrScope().querySelectorAll(selector);
}

/* Set by mount(). Told about every internal navigation so the app's
   sidebar highlight follows along; a no-op until then. */
let onNavigate = () => {};

// ════════════════════════════════════════════════════════════════════════
//  ██╗  ██╗██████╗     ██████╗  ██████╗ ██████╗ ████████╗ █████╗ ██╗
//  ██║  ██║██╔══██╗    ██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔══██╗██║
//  ███████║██████╔╝    ██████╔╝██║   ██║██████╔╝   ██║   ███████║██║
//  ██╔══██║██╔══██╗    ██╔═══╝ ██║   ██║██╔══██╗   ██║   ██╔══██║██║
//  ██║  ██║██║  ██║    ██║     ╚██████╔╝██║  ██║   ██║   ██║  ██║███████╗
//  ╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝
//
//  Pure HTML · Vanilla JS · Tailwind CDN · Lucide Icons · Supabase REST
//  Single file — no build tools, no framework, no npm
// ════════════════════════════════════════════════════════════════════════

// ── 1. CONFIGURATION ──────────────────────────────────────────────────
//  Change SUPABASE_URL and SUPABASE_KEY to point at any Supabase project.
// ──────────────────────────────────────────────────────────────────────
/* The HR screens talk to their own Supabase project — a different one
   from the rest of Aptus360, and reached directly rather than through
   /api/*. That is how the standalone portal worked and nothing here
   changes it; see the note at the top of this file.

   The values below were literals in the single-file build. They are read
   from the environment now, with the shipped values as a fallback so an
   existing deploy keeps working before the variables are set. */
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import {
  tableName as hrTable, rowIn as hrRowIn, rowOut as hrRowOut,
  parseFilter as hrParseFilter, matchesFilters as hrMatches,
} from "./hrNames.js";

/* Left only so nothing that still reads them breaks. Nothing should:
   the HR project is no longer contacted. */
const SUPABASE_URL = import.meta.env.VITE_HR_SUPABASE_URL || 'https://gshnfyttitutnqshllal.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_HR_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzaG5meXR0aXR1dG5xc2hsbGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTYyOTQsImV4cCI6MjA5NDE5MjI5NH0.-bKCVOBrPsohgLTxcok7TliNpxQFoFp-TO023BhKiL8';

// ── 2. MODULE DEFINITIONS ─────────────────────────────────────────────
//  Each module entry drives: sidebar nav, top-bar badge, dashboard grid.
//  icon   = lucide icon name  |  accent = hex colour
// ──────────────────────────────────────────────────────────────────────
const MODULES = [
  { id: 'dashboard',    label: 'Dashboard',         icon: 'layout-dashboard', accent: 'var(--accent)' },
  { id: 'people',       label: 'People',            icon: 'users',            accent: '#3b82f6' },
  { id: 'roles',        label: 'Roles & Structure', icon: 'building-2',       accent: '#8b5cf6' },
  { id: 'pay',          label: 'Pay',               icon: 'wallet',           accent: '#10b981' },
  { id: 'skills',       label: 'Skills & Training', icon: 'graduation-cap',   accent: '#f97316' },
  { id: 'recruitment',  label: 'Recruitment',       icon: 'search',           accent: '#14b8a6' },
  { id: 'interactions', label: 'Interactions',      icon: 'message-square',   accent: '#ec4899' },
  { id: 'leavers',      label: 'Leavers',           icon: 'user-minus',       accent: '#ef4444' },
  { id: 'onboarding',   label: 'Onboarding',        icon: 'rocket',           accent: '#f59e0b' },
  { id: 'contractors',  label: 'Contractors & Temps', icon: 'user-cog',       accent: '#0891b2' },
  { id: 'performance',  label: 'Performance',       icon: 'target',           accent: '#0891b2' },
  { id: 'leave',        label: 'Leave',              icon: 'calendar-off',     accent: '#10b981' },
  { id: 'compliance',   label: 'Compliance',         icon: 'shield-check',     accent: '#f59e0b' },
  { id: 'benefits',     label: 'Benefits',           icon: 'gift',             accent: '#ec4899' },
  { id: 'reports',      label: 'Reports',            icon: 'bar-chart-2',      accent: '#8b5cf6' },
  { id: 'admin',        label: 'Admin',             icon: 'settings',         accent: 'var(--accent)' },
];

// ── 3. ADMIN / LOOKUP TABLE DEFINITIONS ──────────────────────────────
//  Adding a new lookup table = add one entry here.
//  fields: key, label, type (text|number|date|select), options, hint, required
// ──────────────────────────────────────────────────────────────────────
const ADMIN_TABLES = [
  { id: 'departments',            label: 'Departments',            table: 'departments',            icon: 'building-2',
    fields: [{ key: 'name', label: 'Name', required: true }, { key: 'code', label: 'Code', hint: 'e.g. HR, FIN, ENG' }, { key: 'cost_centre', label: 'Cost Centre' }] },
  { id: 'job_titles',             label: 'Job Titles',             table: 'job_titles',             icon: 'briefcase',
    fields: [{ key: 'title', label: 'Job Title', required: true }] },
  { id: 'salary_bands',           label: 'Salary Bands',           table: 'salary_bands',           icon: 'wallet',
    fields: [{ key: 'band_name', label: 'Band Name', required: true }, { key: 'grade', label: 'Grade' }, { key: 'min_salary', label: 'Min Salary (£)', type: 'number' }, { key: 'max_salary', label: 'Max Salary (£)', type: 'number' }, { key: 'currency', label: 'Currency', hint: 'Default: GBP' }, { key: 'effective_date', label: 'Effective From', type: 'date' }] },
  { id: 'skill_categories',       label: 'Skill Categories',       table: 'skill_categories',       icon: 'folder',
    fields: [{ key: 'name', label: 'Category Name', required: true }] },
  { id: 'skills',                 label: 'Skills',                 table: 'skills',                 icon: 'star',
    fields: [{ key: 'name', label: 'Skill Name', required: true }, { key: 'category_id', label: 'Category ID (UUID)', hint: 'From the Skill Categories table' }] },
  { id: 'training_courses',       label: 'Training Courses',       table: 'training_courses',       icon: 'book-open',
    fields: [{ key: 'name', label: 'Course Name', required: true }, { key: 'provider', label: 'Provider' }, { key: 'course_type', label: 'Type', type: 'select', options: ['Formal','Informal','E-Learning','Workshop','Conference'] }, { key: 'internal_external', label: 'Internal / External', type: 'select', options: ['Internal','External'] }, { key: 'renewal_months', label: 'Renewal (months)', type: 'number', hint: 'Leave blank if no renewal needed' }] },
  { id: 'certificate_types',      label: 'Certificate Types',      table: 'certificate_types',      icon: 'award',
    fields: [{ key: 'name', label: 'Certificate Name', required: true }, { key: 'issuing_body', label: 'Issuing Body' }, { key: 'validity_months', label: 'Valid for (months)', type: 'number' }] },
  { id: 'accreditation_types',    label: 'Accreditations',         table: 'accreditation_types',    icon: 'badge-check',
    fields: [{ key: 'name', label: 'Accreditation Name', required: true }, { key: 'professional_body', label: 'Professional Body', hint: 'e.g. CIPD, CMI, CIMA' }] },
  { id: 'interaction_types',      label: 'Interaction Types',      table: 'interaction_types',      icon: 'message-circle',
    fields: [{ key: 'name', label: 'Interaction Type', required: true, hint: 'e.g. Sickness, Disciplinary, 1:1, Welfare Check' }] },
  { id: 'leaver_types',           label: 'Leaver Types',           table: 'leaver_types',           icon: 'log-out',
    fields: [{ key: 'name', label: 'Leaver Type', required: true, hint: 'e.g. Resignation, Retirement, Dismissal' }] },
  { id: 'onboarding_content_types', label: 'Onboarding Content',  table: 'onboarding_content_types', icon: 'play-circle',
    fields: [{ key: 'name', label: 'Content Type', required: true, hint: 'e.g. Video, Questionnaire, Policy' }] },
  { id: 'sickness_categories',    label: 'Sickness Categories',    table: 'sickness_categories',    icon: 'activity',
    fields: [{ key: 'name', label: 'Category', required: true, hint: 'e.g. Mental Health, Musculoskeletal, Respiratory' }] },
  { id: 'equipment_types',          label: 'Equipment Types',         table: 'equipment_types',         icon: 'package',
    fields: [{ key: 'name', label: 'Equipment Type', required: true, hint: 'e.g. Laptop, Mobile Phone, Car, Access Fob' }] },
  { id: 'job_sites',                label: 'Job Sites',                table: 'job_sites',                icon: 'globe',
    fields: [{ key: 'name', label: 'Site Name', required: true, hint: 'e.g. Reed, Indeed, Total Jobs' }, { key: 'url', label: 'URL', hint: 'e.g. https://www.reed.co.uk' }] },
  { id: 'sector_magazines',         label: 'Sector Magazines',         table: 'sector_magazines',         icon: 'book',
    fields: [{ key: 'name', label: 'Magazine Name', required: true }, { key: 'publisher', label: 'Publisher' }, { key: 'sector', label: 'Sector / Industry' }] },
  { id: 'interview_format_types', label: 'Interview Format Types', table: 'interview_format_types', icon: 'clipboard-check',
    fields: [{ key: 'name', label: 'Format Type', required: true, hint: 'e.g. Competency Based, Technical Assessment, Presentation' }] },
  { id: 'leave_types',   label: 'Leave Types',  table: 'leave_types',  icon: 'calendar-off',
    fields: [{ key:'name', label:'Leave Type', required:true }, { key:'default_days', label:'Default Days/Year', type:'number' }, { key:'colour', label:'Colour (hex)', hint:'e.g. #3b82f6' }, { key:'is_paid', label:'Paid?', type:'select', options:[{value:'true',label:'Yes'},{value:'false',label:'No'}] }] },
  { id: 'benefit_types', label: 'Benefit Types', table: 'benefit_types', icon: 'gift',
    fields: [{ key:'name', label:'Benefit Name', required:true }, { key:'category', label:'Category', type:'select', options:['Health','Pension','Insurance','Car','Travel','Childcare','Wellbeing','Technology','Other'] }] },
  { id: 'office_locations',           label: 'Office Locations',          table: 'office_locations',          icon: 'building-2',
    fields: [
      { key: 'name',           label: 'Location Name',   required: true, hint: 'e.g. London HQ, Manchester Store, Glasgow Office & Store' },
      { key: 'location_type',  label: 'Location Type',   type: 'select', options: ['Office','Store','Both'] },
      { key: 'address_line_1', label: 'Address Line 1' },
      { key: 'address_line_2', label: 'Address Line 2' },
      { key: 'city',           label: 'City / Town' },
      { key: 'county',         label: 'County' },
      { key: 'postcode',       label: 'Postcode' },
      { key: 'country',        label: 'Country' },
      { key: 'phone',          label: 'Office Phone' },
      { key: 'email',          label: 'Office Email' },
      { key: 'is_primary',     label: 'Primary Office?', type: 'select', options: [{value:'true',label:'Yes — main office'},{value:'false',label:'No'}] },
    ] },
];

// ── 4. APPLICATION STATE ──────────────────────────────────────────────
//  All mutable state lives here. Never mutate elsewhere.
// ──────────────────────────────────────────────────────────────────────
const S = {
  token:            null,   // Supabase JWT
  user:             null,   // Supabase user object
  page:             'dashboard',
  collapsed:        false,  // sidebar collapsed
  _navShowMore:          false,  // whether hidden nav items are exposed
  _navSectCollapsed:     {},    // section label -> true if collapsed
  adminTable:       'departments',
  peopleSearch:     '',
  adminSearch:      '',
  people:           [],     // cached people records
  tableCache:       {},     // cached lookup table data keyed by table name
  modal:            null,   // active modal state object
  rolesTab:         'emp-roles',
  skillsTab:        'emp-skills',
  recruitTab:       'vacancies',
  interactTab:      'all',
  onboardTab:       'content',
  crudSearch:       '',
  contractorsTab:   'workers',
  perfTab:          'reviews',
  leaveTab:         'requests',
  compTab:          'documents',
  benTab:           'benefits',
  rptTab:           'headcount',
  chartDrill:       null,   // null | {type:'office'|'dept', ...}
  losPivot:         'all',  // 'all' | 'office' | 'dept'
  cache:            {},
};

// ── 5. SUPABASE API CLIENT ────────────────────────────────────────────
//  Thin wrapper around fetch() → Supabase REST API.
//  All methods return parsed JSON.
// ──────────────────────────────────────────────────────────────────────
// ── Toast notification (shown on API errors so failures are visible) ──
function showToast(msg, type = 'error') {
  const existing = document.getElementById('hr-toast');
  if (existing) existing.remove();
  const colours = { error: '#ef4444', success: '#10b981', warn: '#f59e0b' };
  const icons   = { error: 'alert-circle', success: 'check-circle', warn: 'alert-triangle' };
  const t = document.createElement('div');
  t.id = 'hr-toast';
  t.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <i data-lucide="${icons[type]}" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"></i>
      <div style="flex:1;font-size:13px;line-height:1.5">${msg}</div>
      <button onclick="this.closest('#hr-toast').remove()" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;font-size:16px;line-height:1;flex-shrink:0">×</button>
    </div>`;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', right:'24px', zIndex:'9999',
    background: colours[type], color:'#fff', borderRadius:'12px',
    padding:'14px 16px', maxWidth:'420px', boxShadow:'0 8px 24px rgba(0,0,0,0.2)',
    animation:'hrSlideUp 0.2s ease', fontFamily:"'Inter',sans-serif",
  });
  document.body.appendChild(t);
  drawIcons(t);
  setTimeout(() => t?.remove(), type === 'error' ? 8000 : 4000);
}

/* The four query wrappers, now going through Aptus360's own endpoint
   instead of the HR project's PostgREST.

   Everything above these speaks the HR schema's names — `people`, `id`,
   `person_id` — and carries on doing so. hrNames.js translates in both
   directions, so the 5,700 lines of module code below were not touched.

   ── Why not simply repoint the URL ──

   The old wrappers talked to PostgREST with an anon key. Against this
   database that returns nothing: row level security is on with no
   policies, deliberately, and all access goes through the functions
   with the service key. So the wrappers change, not the address.

   ── Filtering happens here, for now ──

   Eleven call sites pass a PostgREST filter. The admin endpoint returns
   whole tables, so the filter is applied to the rows after they arrive.
   That is fine for a Department and wrong for a year of timesheets;
   when those tables have data in them, the filtering belongs in the
   endpoint. Written down here so it is a known trade rather than a
   surprise later. */
const api = {
  // Login is Aptus360's, not the HR project's. Kept so the module's own
  // call site does not have to change; it is never reached.
  async signIn() {
    return { error: { message: "Sign in through Aptus360, not the HR portal." } };
  },

  async select(table, cols = '*', filter = '') {
    try {
      const { rows = [] } = await adminList(hrTable(table));
      const out = rows.map((r) => hrRowIn(r, table));
      const filters = hrParseFilter(filter);
      return filters.length ? out.filter((r) => hrMatches(r, filters)) : out;
    } catch (e) {
      console.error(`SELECT ${table} failed:`, e.message);
      showToast(`Could not load <b>${table}</b>: ${e.message}`, 'error');
      return [];
    }
  },

  async insert(table, body) {
    const t = hrTable(table);
    try {
      const created = await adminCreate(t, hrRowOut(body, table), `${t}_ID`);
      return [hrRowIn(created, table)];
    } catch (e) {
      showToast(`Save failed: ${e.message}`, 'error');
      throw e;
    }
  },

  async update(table, id, body) {
    const t = hrTable(table);
    try {
      const updated = await adminUpdate(t, id, hrRowOut(body, table));
      return [hrRowIn(updated, table)];
    } catch (e) {
      showToast(`Update failed: ${e.message}`, 'error');
      throw e;
    }
  },

  async del(table, id) {
    const t = hrTable(table);
    try {
      await adminDelete(t, id, `${t}_ID`);
      return true;
    } catch (e) {
      showToast(`Delete failed: ${e.message}`, 'error');
      throw e;
    }
  },
};

// ── 6. UTILITY FUNCTIONS ──────────────────────────────────────────────

/* Find a record by id, comparing loosely.

   Ids used to be uuids and are now bigints, while anything read back
   out of a `data-` attribute is a string. `5 === "5"` is false, so
   every edit and delete button quietly stopped finding its row — the
   button worked, the lookup returned undefined, and nothing happened.
   Nothing threw, which is why it looked like a dead button. */
const byId = (rows, id) =>
  (rows || []).find((r) => String(r.id) === String(id));

const $ = id => document.getElementById(id);
// Escape HTML to prevent XSS when inserting user data into innerHTML
const x = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Generate a lucide <i> tag. Call lucide.createIcons() after inserting.
function ic(name, size = 16, colour = '') {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;display:inline-block${colour ? ';color:'+colour : ''}"></i>`;
}

// Re-render lucide icons in the whole document after any innerHTML update
function icons() { drawIcons(hrScope()); }

// Build a form field HTML block (label + input/select/textarea)
function field(f, val = '') {
  const labelHtml = `<label class="field-label">${x(f.label)}${f.required ? ' <span style="color:#f87171">*</span>' : ''}</label>`;
  const hintHtml  = f.hint ? `<p class="field-hint">${x(f.hint)}</p>` : '';
  const wrap      = inner => `<div style="margin-bottom:16px">${labelHtml}${inner}${hintHtml}</div>`;
  const base      = 'class="field-input"';

  if (f.type === 'select') {
    // options can be an array OR a function (called fresh each render so dropdowns are never stale)
    const optsArr = typeof f.options === 'function' ? f.options() : (f.options || []);
    const noData  = optsArr.length === 0;
    const opts = optsArr.map(o => {
      const v = o.value ?? o;
      const l = o.label ?? o;
      return `<option value="${x(v)}"${String(val) === String(v) ? ' selected' : ''}>${x(l)}</option>`;
    }).join('');
    const hint2 = noData ? `<p class="field-hint" style="color:#f59e0b">⚠ No options available — check the Admin page or add records first.</p>` : '';
    return wrap(`<select ${base} data-field="${f.key}" ${noData?'disabled':''}><option value="">Select…</option>${opts}</select>${hint2}`);
  }
  if (f.type === 'textarea') {
    return wrap(`<textarea ${base} data-field="${f.key}" rows="3" style="resize:none">${x(val)}</textarea>`);
  }
  return wrap(`<input type="${f.type || 'text'}" ${base} data-field="${f.key}" value="${x(val)}">`);
}

// Read all [data-field] inputs inside a container into the modal form object
function collectForm(containerId = 'hr-modal-body') {
  if (!S.modal) return;
  const container = $(containerId);
  if (!container) return;
  container.querySelectorAll('[data-field]').forEach(el => {
    S.modal.form[el.dataset.field] = el.value || null;
  });
}


/* ═══ SHELL BRIDGE ═════════════════════════════════════════════════
   In the standalone app this drew the sidebar and top bar, then filled
   in the page. Aptus360 already has both, so what is left is the half
   that still matters: tell the shell where we have navigated to, then
   render the page.

   Every internal navigation in the HR screens ends in a renderShell()
   call — a dashboard tile, a drill-down row, an org-chart node. Keeping
   the name means those call sites are unchanged and keep working; they
   now move the app's sidebar selection as a side effect. */
function renderShell() {
  onNavigate(S.page);
  loadPage();
}

// ── 9. PAGE ROUTER ────────────────────────────────────────────────────
async function loadPage() {
  switch (S.page) {
    case 'dashboard':  await pageDashboard();  break;
    case 'people':       destroyDashCharts(); await pagePeople();       break;
    case 'roles':        await pageRoles();        break;
    case 'pay':          await pagePay();           break;
    case 'skills':       await pageSkills();        break;
    case 'recruitment':  await pageRecruitment();   break;
    case 'interactions': await pageInteractions();  break;
    case 'leavers':      await pageLeavers();       break;
    case 'onboarding':   await pageOnboarding();    break;
    case 'contractors':  await pageContractors();   break;
    case 'performance':  await pagePerformance();   break;
    case 'leave':        await pageLeave();          break;
    case 'compliance':   await pageCompliance();     break;
    case 'benefits':     await pageBenefits();       break;
    case 'reports':      await pageReports();        break;
    case 'admin':        await pageAdmin();          break;
    default:             pageComingSoon();           break;
  }
}

// ── 10. DASHBOARD PAGE ────────────────────────────────────────────────

// ── Dashboard configuration ───────────────────────────────────────────
// All available stat cards — each user can pick which to show and in
// what order. Preferences saved to localStorage (per browser / per user).

const ALL_DASH_CARDS = [
  { key:'people',       table:'people',            filter:'',                    icon:'users',          color:'#3b82f6', label:'Employees',           nav:'people'       },
  { key:'vacancies',    table:'vacancies',          filter:'status=eq.Open',      icon:'clipboard-list', color:'#0891b2', label:'Open Vacancies',       nav:'recruitment'  },
  { key:'interactions', table:'interactions',       filter:'',                    icon:'message-square', color:'#ec4899', label:'Interactions',         nav:'interactions' },
  { key:'applications', table:'applications',       filter:'',                    icon:'briefcase',      color:'#14b8a6', label:'Applications',         nav:'recruitment'  },
  { key:'leavers',      table:'leavers',            filter:'',                    icon:'user-minus',     color:'#ef4444', label:'Leavers',              nav:'leavers'      },
  { key:'applicants',   table:'applicants',         filter:'',                    icon:'user-2',         color:'#8b5cf6', label:'Applicants',           nav:'recruitment'  },
  { key:'training',     table:'employee_training',  filter:'',                    icon:'book-open',      color:'#f97316', label:'Training Records',     nav:'skills'       },
  { key:'contractors',  table:'contingent_workers', filter:'',                    icon:'user-cog',       color:'#0891b2', label:'Contractors & Temps',  nav:'contractors'  },
  { key:'timesheets',   table:'timesheets',         filter:'status=eq.Submitted', icon:'clock',          color:'var(--accent)', label:'Timesheets Pending',   nav:'contractors'  },
  { key:'certificates', table:'employee_certificates', filter:'',                 icon:'award',          color:'#f59e0b', label:'Certificates',         nav:'skills'       },
];

const DASH_PREFS_KEY = 'hr_portal_dashboard_v1';
const DASH_DEFAULT   = ['people','vacancies','interactions','applications','leavers','training'];

function getDashPrefs() {
  try {
    const s = localStorage.getItem(DASH_PREFS_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  // First visit: defaults
  return {
    order: ALL_DASH_CARDS.map(c => c.key),
    visible: DASH_DEFAULT,
  };
}

function saveDashPrefs(prefs) {
  try { localStorage.setItem(DASH_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

async function pageDashboard() {
  const pc = $('hr-page-content');
  if (!pc) return;

  // Reset drill state when page freshly loaded
  if (!S._dashCountsCache) S.chartDrill = null;

  // Fetch stat card counts in parallel
  await Promise.all([
    cached('office_locations','office_locations','id,name,city'),
    cached('departments','departments','id,name'),
    cached('roles','roles','id,job_title_id,department_id'),
    cached('job_titles','job_titles','id,title'),
  ]);

  // Skeleton while loading
  pc.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px">
      <div>
        <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Dashboard</h1>
        <p style="color:var(--muted);font-size:14px">Live overview of your HR data</p>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:36px">
      ${[...Array(6)].map(()=>`<div class="stat-card" style="min-height:110px;background:linear-gradient(90deg,var(--bg) 25%,var(--border) 50%,var(--bg) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite"></div>`).join('')}
    </div>`;

  // Fetch counts for all cards in parallel
  const counts = {};
  await Promise.all(ALL_DASH_CARDS.map(async c => {
    try {
      const res = await api.select(c.table, 'id', c.filter||'');
      counts[c.key] = Array.isArray(res) ? res.length : '—';
    } catch { counts[c.key] = '—'; }
  }));

  // Fetch chart data (people details for analytics)
  let chartData = null;
  try {
    const [rawPeople, cwRows, empRoles] = await Promise.all([
      api.select('people','id,first_name,last_name,employee_number,photo_url,dob,start_date,employment_type,department_id,office_location_id,status,gender,nationality,eye_colour'),
      api.select('contingent_workers','person_id,worker_type'),
      api.select('employee_roles','person_id,role_id,end_date'),
    ]);
    chartData = buildChartData(rawPeople, cwRows,
      S.cache.departments, S.cache.office_locations,
      empRoles, S.cache.roles, S.cache.job_titles);
  } catch(e) { console.warn('Chart data failed:', e); }

  S._dashCountsCache = { counts, chartData };
  // Share chart data with the analytics section on the dashboard
  if (!S._an) S._an = { levels:['office','dept','emptype',''], path:[], type:'doughnut', cd:null };
  if (chartData) S._an.cd = chartData;
  renderDashboard(counts, chartData);
}

function renderDashboard(counts, chartData) {
  const pc = $('hr-page-content');
  if (!pc) return;

  const prefs   = getDashPrefs();
  const ordered = prefs.order
    .map(k => ALL_DASH_CARDS.find(c => c.key === k))
    .filter(Boolean);
  // Also include any new cards not yet in the user's saved order
  ALL_DASH_CARDS.forEach(c => { if (!ordered.find(o => o.key === c.key)) ordered.push(c); });
  const visible  = ordered.filter(c => prefs.visible.includes(c.key));
  const configuring = S.dashConfig === true;

  pc.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
      <div>
        <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Dashboard</h1>
        <p style="color:var(--muted);font-size:14px">Click any card to open that section</p>
      </div>
      <button id="dash-config-btn" style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:${configuring?'var(--accent)':'var(--bg)'};color:${configuring?'#fff':'#475569'};border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;transition:all 0.15s">
        ${ic('settings',14)} ${configuring ? 'Done' : 'Customise'}
      </button>
    </div>

    <!-- Stat cards grid -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:36px" id="dash-cards">
      ${visible.length ? visible.map(r => `
        <div class="stat-card" data-nav="${r.nav}" style="cursor:pointer;transition:transform 0.15s,box-shadow 0.15s"
             onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.10)'"
             onmouseleave="this.style.transform='';this.style.boxShadow=''">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div class="icon-tile" style="background:${r.color}18">${ic(r.icon,20,r.color)}</div>
            <span class="badge" style="background:var(--bg);color:var(--muted);border:1px solid var(--border);display:flex;align-items:center;gap:4px">${ic('arrow-right',11)} go</span>
          </div>
          <div class="font-display" style="font-size:36px;font-weight:800;color:var(--text);margin-bottom:4px">${counts[r.key] ?? '—'}</div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em">${r.label}</div>
        </div>`).join('') : `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">No cards selected — click Customise to add some</div>`}
    </div>

    ${configuring ? `
    <!-- Configuration panel -->
    <div style="background:#fff;border:1px solid var(--border);border-radius:16px;padding:24px;margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h2 class="font-display" style="font-size:16px;font-weight:700;color:var(--text)">${ic('settings',15)} Customise Dashboard Cards</h2>
        <span style="font-size:12px;color:var(--muted)">Saved automatically · per browser</span>
      </div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:20px">Toggle cards on or off and reorder with the arrows. Changes apply live above.</p>
      <div style="display:flex;flex-direction:column;gap:8px" id="dash-cfg-list">
        ${ordered.map((c, idx) => {
          const on = prefs.visible.includes(c.key);
          return `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:${on?'var(--bg)':'#fff'};border:1px solid ${on?'var(--border)':'var(--bg)'};border-radius:10px;transition:all 0.1s">
            <div style="display:flex;flex-direction:column;gap:2px">
              <button data-cfg-up="${c.key}" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:0;line-height:1;font-size:14px" ${idx===0?'disabled':''}>▲</button>
              <button data-cfg-dn="${c.key}" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:0;line-height:1;font-size:14px" ${idx===ordered.length-1?'disabled':''}>▼</button>
            </div>
            <div class="icon-tile" style="background:${c.color}15;width:32px;height:32px;flex-shrink:0">${ic(c.icon,15,c.color)}</div>
            <div style="flex:1">
              <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:1px">${x(c.label)}</p>
              <p style="font-size:11px;color:var(--muted)">${counts[c.key]??'—'} record${counts[c.key]===1?'':'s'}</p>
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
              <span style="font-size:12px;color:${on?'#10b981':'var(--muted)'};font-weight:600">${on?'Shown':'Hidden'}</span>
              <div style="position:relative;width:40px;height:22px;flex-shrink:0">
                <input type="checkbox" data-cfg-toggle="${c.key}" ${on?'checked':''} style="position:absolute;opacity:0;width:0;height:0">
                <div style="position:absolute;inset:0;background:${on?'#10b981':'var(--border)'};border-radius:11px;transition:background 0.2s;pointer-events:none"></div>
                <div style="position:absolute;top:3px;left:${on?'21':'3'}px;width:16px;height:16px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);pointer-events:none"></div>
              </div>
            </label>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}


    <!-- Compliance Alerts -->
    ${!configuring && chartData && (() => {
      const now = new Date();
      const warn60 = new Date(now.getTime() + 60*86400000);
      const people = chartData.active || [];
      const alerts = [];
      // RTW expiry from people table
      people.filter(p => p.rtw_expiry && new Date(p.rtw_expiry) < warn60).forEach(p => {
        const d = new Date(p.rtw_expiry);
        alerts.push({type: d < now ? 'error':'warn', msg: `RTW expires ${p.rtw_expiry}`, name: `${p.first_name||''} ${p.last_name||''}`.trim()});
      });
      if (!alerts.length) return '';
      return `<div style="margin-bottom:24px">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">${ic('alert-triangle',12)} Compliance Alerts</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${alerts.slice(0,8).map(a=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${a.type==='error'?'var(--err-bg)':'var(--warn-bg)'};border:1px solid ${a.type==='error'?'var(--err-border)':'var(--warn-border)'};border-radius:8px">
            <span style="font-size:12px;font-weight:600;color:${a.type==='error'?'#dc2626':'var(--warn-text)'}">${a.name}</span>
            <span style="font-size:12px;color:${a.type==='error'?'#ef4444':'#f59e0b'}">${a.msg}</span>
          </div>`).join('')}
          ${alerts.length>8?`<p style="font-size:12px;color:var(--muted);text-align:center">+${alerts.length-8} more alerts</p>`:''}
        </div>
      </div>`;
    })()}
    <!-- Configurable Analytics Chart -->
    ${!configuring ? `
    <div style="margin-bottom:32px">
      <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px">${ic('pie-chart',12)} People Analytics</p>
      <div style="display:grid;grid-template-columns:1fr 210px;gap:16px;align-items:start">
        <!-- Chart + table -->
        <div>
          <div id="an-crumb" style="min-height:24px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:13px;margin-bottom:10px"></div>
          <div class="card" style="padding:18px;margin-bottom:12px">
            <div id="an-hdr" style="font-size:13px;color:var(--muted);margin-bottom:10px"></div>
            <div style="height:300px;position:relative">
              <canvas id="an-canvas"></canvas>
            </div>
            <div id="an-emp-list" style="display:none;margin-top:4px"></div>
          </div>
          <div id="an-tbl"></div>
        </div>
        <!-- Config dropdowns (right) -->
        <div style="position:sticky;top:24px;display:flex;flex-direction:column;gap:10px">
          <div class="card" style="padding:14px">
            <p style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Drill-Down Levels</p>
            ${[0,1,2,3].map(i=>`
            <div style="margin-bottom:9px">
              <label style="font-size:10px;font-weight:700;color:var(--muted);display:block;margin-bottom:2px">
                Level ${i+1} ${i===0?'<span style="color:#f87171">★</span>':'<span style="color:var(--border)">(opt)</span>'}
              </label>
              <select id="an-lv${i}" style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text);background:#fff;font-family:'Inter',sans-serif">
                ${i>0?'<option value="">-- none --</option>':''}
                ${AN_DIMS.map(d=>'<option value="'+d.key+'"'+((S._an&&(S._an.levels[i]||'')=== d.key)?' selected':'')+'>'+d.label+'</option>').join('')}
              </select>
            </div>`).join('')}
          </div>
          <div class="card" style="padding:14px">
            <p style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Chart Type</p>
            ${[['doughnut','Doughnut'],['pie','Pie'],['bar','Bar']].map(([t,lbl])=>`
            <button id="an-ct-${t}" style="width:100%;padding:6px 8px;margin-bottom:4px;text-align:left;border:1px solid ${S._an&&S._an.type===t?'var(--accent)':'var(--border)'};border-radius:6px;background:${S._an&&S._an.type===t?'var(--accent-light)':'#fff'};color:${S._an&&S._an.type===t?'var(--accent)':'var(--muted)'};font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:6px">
              ${ic(t==='bar'?'bar-chart-2':'pie-chart',11)} ${lbl}
            </button>`).join('')}
          </div>
          <div class="card" style="padding:14px" id="an-stats">
            <p style="font-size:10px;color:var(--muted);margin-bottom:2px">Showing</p>
            <p class="font-display" style="font-size:22px;font-weight:800;color:var(--text);line-height:1">—</p>
          </div>
        </div>
      </div>
    </div>` : ''}

    <!-- Module grid -->
    ${!configuring ? `
    <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px">All Modules</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${MODULES.filter(m => m.id !== 'dashboard').map(m => `
        <div class="mod-card" data-nav="${m.id}" style="cursor:pointer;transition:transform 0.15s,box-shadow 0.15s"
             onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.08)'"
             onmouseleave="this.style.transform='';this.style.boxShadow=''">
          <div class="icon-tile" style="background:${m.accent}18">${ic(m.icon,18,m.accent)}</div>
          <div style="flex:1">
            <p style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px">${x(m.label)}</p>
            <span class="badge" style="background:${m.accent}15;color:${m.accent};display:flex;align-items:center;gap:3px;width:fit-content">${ic('arrow-right',10)} open</span>
          </div>
        </div>`).join('')}
    </div>` : ''}`;

  icons();

  // Nav clicks
  pc.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => { S.page = el.dataset.nav; renderShell(); });
  });


  // Bind + draw the configurable analytics pie chart
  if (!configuring && S._an) {
    _anBindSection(S._an);
    if (S._an.cd) setTimeout(() => _anDraw(S._an), 60);
  }

  // Customise toggle
  $('dash-config-btn')?.addEventListener('click', () => {
    S.dashConfig = !S.dashConfig;
    renderDashboard(counts, chartData); // pass chartData so charts survive toggle
  });

  if (!configuring) return;

  // ── Config panel interactions ─────────────────────────────────────
  const updatePrefs = (newPrefs) => {
    saveDashPrefs(newPrefs);
    renderDashboard(counts, chartData); // re-render with live counts already fetched
  };

  // Toggle visibility — bind 'change' on the hidden checkbox only (one element
  // per row) so clicking doesn't fire multiple times via bubbling.
  pc.querySelectorAll('input[data-cfg-toggle]').forEach(input => {
    input.addEventListener('change', () => {
      const key   = input.dataset.cfgToggle;
      const prefs = getDashPrefs();
      if (prefs.visible.includes(key)) prefs.visible = prefs.visible.filter(k => k !== key);
      else prefs.visible.push(key);
      updatePrefs(prefs);
    });
  });

  // Reorder up
  pc.querySelectorAll('[data-cfg-up]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.cfgUp;
      const p   = getDashPrefs();
      const idx = p.order.indexOf(key);
      if (idx > 0) { [p.order[idx-1], p.order[idx]] = [p.order[idx], p.order[idx-1]]; }
      updatePrefs(p);
    });
  });

  // Reorder down
  pc.querySelectorAll('[data-cfg-dn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.cfgDn;
      const p   = getDashPrefs();
      const idx = p.order.indexOf(key);
      if (idx < p.order.length - 1) { [p.order[idx], p.order[idx+1]] = [p.order[idx+1], p.order[idx]]; }
      updatePrefs(p);
    });
  });
}


// ── 11. PEOPLE PAGE ───────────────────────────────────────────────────
async function pagePeople() {
  try {
    S.people = await api.select('people','*') || [];
    if (!Array.isArray(S.people)) S.people = [];
  } catch { S.people = []; }
  await cached('departments','departments','id,name');
  await cached('office_locations','office_locations','id,name,city');
  renderPeople();

  // If navigated here from an employee list, open that person's modal
  if (S.pendingOpenPerson) {
    const person = byId(S.people, S.pendingOpenPerson);
    S.pendingOpenPerson = null;
    if (person) {
      // Small delay so the page finishes rendering first
      setTimeout(() => openPersonModal(person), 80);
    }
  }
}

function peopleRowHtml(p) {
  const statusBadge = s => {
    const colours = { Active:'#10b981', 'On Leave':'#f59e0b', Suspended:'#ef4444', Leaver:'var(--muted)' };
    const c = colours[s] || '#10b981';
    return `<span class="badge" style="background:${c}15;color:${c};border:1px solid ${c}30">${x(s||'Active')}</span>`;
  };
  return `<tr class="tr">
    <td class="td" style="width:34px;padding-right:0">
      <input type="checkbox" class="bulk-pick" data-pick="${x(p.id)}"
        ${S.peoplePicked?.has(String(p.id)) ? 'checked' : ''}
        aria-label="Select ${x(`${p.first_name||''} ${p.last_name||''}`.trim())}">
    </td>
    <td class="td">
      ${p.employee_number
        ? `<span style="font-family:monospace;font-size:12px;background:var(--bg);color:#475569;padding:2px 8px;border-radius:4px">${x(p.employee_number)}</span>`
        : `<span style="color:var(--border)">—</span>`}
    </td>
    <td class="td">
      <div style="display:flex;align-items:center;gap:10px">
        ${p.photo_url
          ? `<img src="${p.photo_url}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--border)">`
          : `<div class="avatar" style="background:#e0e7ff;color:var(--accent)">${(p.first_name||'?')[0]}${(p.last_name||'?')[0]}</div>`}
        <span style="font-weight:500;color:var(--text)">${x(p.first_name||'')} ${x(p.last_name||'')}</span>
      </div>
    </td>
    <td class="td">${p.department_id ? resolve('departments',p.department_id,'name') : '<span style="color:var(--border)">—</span>'}</td>
    <td class="td">${p.office_location_id ? resolve('office_locations',p.office_location_id, r => r.city ? r.name+' ('+r.city+')' : r.name) + ((() => { const o=(S.cache.office_locations||[]).find(xx=>xx.id===p.office_location_id); return o?.location_type ? ` <span class="badge" style="background:var(--bg);color:var(--muted);font-size:10px">${o.location_type}</span>` : ''; })()) : '<span style="color:var(--border)">—</span>'}</td>
    <td class="td">
      ${p.email
        ? `<a href="mailto:${x(p.email)}" style="color:var(--accent);text-decoration:none;font-size:13px">${x(p.email)}</a>`
        : `<span style="color:var(--border)">—</span>`}
    </td>
    <td class="td">${statusBadge(p.status)}</td>
    <td class="td">${p.nationality ? x(p.nationality) : '<span style="color:var(--border)">—</span>'}</td>
    <td class="td" style="text-align:right;white-space:nowrap">
      <button class="btn-icon edit" data-edit="${x(p.id)}" title="Edit">${ic('pencil',14)}</button>
      <button class="btn-icon del"  data-del="${x(p.id)}"  title="Delete">${ic('trash-2',14)}</button>
    </td>
  </tr>`;
}

// Filter people list and update only the tbody + count badge — never rebuilds the input
function filterPeople() {
  const q = (S.peopleSearch || '').toLowerCase().trim();
  const list = q
    ? S.people.filter(p =>
        `${p.first_name||''} ${p.last_name||''} ${p.employee_number||''} ${p.email||''} ${p.department_id?resolve('departments',p.department_id,'name'):''} `.toLowerCase().includes(q))
    : S.people;

  const badge = document.getElementById('people-count-badge');
  if (badge) badge.textContent = list.length + ' shown';

  const tbody = document.getElementById('people-tbody');
  const empty = document.getElementById('people-empty');
  if (tbody) {
    tbody.innerHTML = list.map(peopleRowHtml).join('');
    icons(); // render Lucide pencil + trash icons in the new rows
    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = byId(S.people, btn.dataset.edit);
        if (p) openPersonModal(p);
      });
    });
    tbody.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this employee? This cannot be undone.')) return;
        try {
          await api.del('people', btn.dataset.del);
          S.people = S.people.filter(p => p.id !== btn.dataset.del);
          filterPeople();
        } catch {}
      });
    });
  }
  if (empty) empty.style.display = list.length ? 'none' : 'block';
  if (tbody) tbody.parentElement && (tbody.parentElement.style.display = list.length ? '' : 'none');
}

function renderPeople() {
  const pc = $('hr-page-content');
  if (!pc) return;

  // Render the page shell ONCE — the search input is never rebuilt
  pc.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text)">People</h1>
          <span id="people-count-badge" class="badge" style="background:var(--accent-light);color:#3b82f6;border:1px solid #bfdbfe">${S.people.length} shown</span>
        </div>
        <p style="color:var(--muted);font-size:14px">${S.people.length} employee record${S.people.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" id="add-person">${ic('plus',14)} Add Employee</button>
    </div>

    <div class="search-wrap">
      <span class="search-icon">${ic('search',15)}</span>
      <input type="search" class="field-input" id="people-search"
        placeholder="Search name, email, department, employee number…"
        value="${x(S.peopleSearch||'')}" autocomplete="off">
    </div>

    <div id="people-empty" class="card" style="display:none">
      <div class="empty">
        <div style="width:56px;height:56px;background:var(--bg);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:var(--muted)">${ic('clipboard-list',22)}</div>
        <p style="font-weight:600;color:var(--muted);margin-bottom:4px">No employees found</p>
        <p style="font-size:13px;color:var(--muted)">Try a different search or add your first employee</p>
      </div>
    </div>

    <!-- Only once something is picked. A bar that is always there,
         permanently saying "0 selected", is furniture. -->
    <div id="bulk-bar" class="bulk-bar" style="display:none">
      <span id="bulk-count"></span>
      <span style="flex:1"></span>
      <button class="btn btn-secondary" id="bulk-clear">Clear</button>
      <button class="btn btn-primary" id="bulk-edit">Edit selected</button>
    </div>

    <div class="card" id="people-table-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th class="th" style="width:34px;padding-right:0">
              <input type="checkbox" id="bulk-all" aria-label="Select all shown">
            </th>
            <th class="th">Emp #</th>
            <th class="th">Name</th>
            <th class="th">Department</th>
            <th class="th">Office</th>
            <th class="th">Work Email</th>
            <th class="th">Status</th>
            <th class="th">Nationality</th>
            <th class="th" style="width:88px;min-width:88px"></th>
          </tr>
        </thead>
        <tbody id="people-tbody"></tbody>
      </table>
    </div>`;

  icons();

  // Initial population
  filterPeople();

  // Add employee
  $('add-person')?.addEventListener('click', () => openPersonModal(null));

  // Search — update only tbody, never the input itself
  $('people-search')?.addEventListener('input', e => {
    S.peopleSearch = e.target.value;
    filterPeople();
  });

  hrAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = byId(S.people, btn.dataset.edit);
      if (p) openPersonModal(p);
    });
  });

  wireBulkSelection();

  hrAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Permanently delete this employee record? This cannot be undone.')) return;
      await api.del('people', btn.dataset.del);
      await pagePeople();
    });
  });
}

// ── 11b. BULK EDIT ────────────────────────────────────────────────────
//  Setting the same thing on many people at once: the fields that are
//  properties of a job rather than of a person. Names, emails and eye
//  colour are deliberately not here — there is no such thing as forty
//  people sharing a phone number, and offering it invites an accident.
// ──────────────────────────────────────────────────────────────────────

/* Which fields can be set in bulk, and where each one actually lives.

   Five sit on Person and are a plain update. Two do not: a job role is
   a row in Employee_Role and a manager is a row in Hierarchy, both
   dated. Setting those is not an update — it closes the current record
   and opens a new one, so the history stays readable afterwards. */
const BULK_FIELDS = [
  { key: 'department_id', label: 'Department', where: 'person',
    options: () => mkOpts(S.cache.departments||[], 'id', 'name') },
  { key: 'office_location_id', label: 'Office location', where: 'person',
    options: () => mkOpts(S.cache.office_locations||[], 'id',
      r => (r.city ? r.name+' ('+r.city+')' : r.name)) },
  { key: 'employment_type', label: 'Employment type', where: 'person',
    options: () => ['Full Time','Part Time','Fixed Term','Zero Hours','Contractor','Apprentice'] },
  { key: 'status', label: 'Status', where: 'person',
    options: () => ['Active','On Leave','Suspended','Leaver'] },
  { key: 'is_active', label: 'Is active', where: 'person',
    options: () => [{value:'true',label:'Yes'},{value:'false',label:'No'}] },
  { key: 'role_id', label: 'Job role', where: 'employee_roles',
    options: () => mkOpts(S.cache.roles||[], 'id', r => {
      const jt = byId(S.cache.job_titles, r.job_title_id);
      const d  = byId(S.cache.departments, r.department_id);
      return `${jt?.title||'?'} (${d?.name||'?'})`;
    }) },
  { key: 'manager_id', label: 'Manager', where: 'hierarchy',
    options: () => mkOpts(S.people||[], 'id',
      r => `${r.first_name||''} ${r.last_name||''}`.trim() || '—') },
];

function wireBulkSelection() {
  S.peoplePicked = S.peoplePicked || new Set();

  hrAll('[data-pick]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) S.peoplePicked.add(String(cb.dataset.pick));
      else S.peoplePicked.delete(String(cb.dataset.pick));
      drawBulkBar();
    });
  });

  const all = $('bulk-all');
  if (all) all.addEventListener('change', () => {
    /* Everything currently shown, not everything there is: the tick sits
       above a filtered list, and selecting rows the search has hidden is
       how somebody changes a department they never saw. */
    hrAll('[data-pick]').forEach(cb => {
      cb.checked = all.checked;
      if (all.checked) S.peoplePicked.add(String(cb.dataset.pick));
      else S.peoplePicked.delete(String(cb.dataset.pick));
    });
    drawBulkBar();
  });

  $('bulk-clear')?.addEventListener('click', () => {
    S.peoplePicked.clear();
    hrAll('[data-pick]').forEach(cb => { cb.checked = false; });
    const a = $('bulk-all'); if (a) a.checked = false;
    drawBulkBar();
  });

  $('bulk-edit')?.addEventListener('click', openBulkModal);
  drawBulkBar();
}

function drawBulkBar() {
  const bar = $('bulk-bar');
  if (!bar) return;
  const n = S.peoplePicked?.size || 0;
  bar.style.display = n ? 'flex' : 'none';
  const count = $('bulk-count');
  if (count) count.textContent = `${n} ${n === 1 ? 'person' : 'people'} selected`;
}

function openBulkModal() {
  S.modal = { type: 'bulk', form: {}, saving: false, done: null };
  drawBulkModal();
}

function drawBulkModal() {
  const m = S.modal;
  const n = S.peoplePicked.size;

  const rows = BULK_FIELDS.map(f => {
    const opts = f.options();
    const list = opts.map(o => (typeof o === 'string'
      ? { value: o, label: o }
      : { value: o.value ?? o.id, label: o.label ?? o.name }));
    return `<label class="field">
      <span class="field-label">${x(f.label)}</span>
      <select class="field-input" data-bulk="${x(f.key)}">
        <option value="">${'\u2014'} Leave unchanged ${'\u2014'}</option>
        ${list.map(o => `<option value="${x(o.value)}"
          ${m.form[f.key] === String(o.value) ? 'selected' : ''}>${x(o.label)}</option>`).join('')}
      </select>
    </label>`;
  }).join('');

  const chosen = Object.entries(m.form).filter(([, v]) => v !== '' && v != null);

  /* The module's own modal shell, not a helper of my own: there isn't
     one, and a second way of drawing a modal is a second thing to keep
     looking right. */
  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal modal-md">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:24px 28px 0;flex-shrink:0">
          <div>
            <h3 style="font-size:18px;font-weight:700;color:var(--text)">
              Edit ${n} ${n === 1 ? 'person' : 'people'}</h3>
            <p style="font-size:13px;color:var(--muted);margin-top:4px;max-width:52ch;line-height:1.55">
              Anything left as &ldquo;leave unchanged&rdquo; is not touched. Only fields
              that belong to a job are here &mdash; names, contact details and personal
              information stay on the individual record.
            </p>
          </div>
          <button class="btn-icon" id="bulk-x">${ic('x',18)}</button>
        </div>
        <div style="padding:20px 28px;overflow-y:auto;flex:1">
          <div class="two-col">${rows}</div>
          ${m.error ? `<p style="margin-top:14px;font-size:13px;color:var(--err-text)">${x(m.error)}</p>` : ''}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:16px 28px;border-top:1px solid var(--border);flex-shrink:0">
          <button class="btn btn-secondary" id="bulk-cancel">Cancel</button>
          <button class="btn btn-primary" id="bulk-apply" ${!chosen.length || m.saving ? 'disabled' : ''}>
            ${m.saving ? 'Applying\u2026' : `Apply to ${n}`}
          </button>
        </div>
      </div>
    </div>`;

  hrAll('[data-bulk]').forEach(sel => {
    sel.addEventListener('change', () => {
      S.modal.form[sel.dataset.bulk] = sel.value;
      drawBulkModal();
    });
  });
  $('bulk-apply')?.addEventListener('click', applyBulk);
  $('bulk-x')?.addEventListener('click', closeModal);
  $('bulk-cancel')?.addEventListener('click', closeModal);
}

async function applyBulk() {
  const m = S.modal;
  const ids = [...S.peoplePicked];
  const chosen = BULK_FIELDS.filter(f => m.form[f.key] !== '' && m.form[f.key] != null);
  if (!chosen.length) return;

  m.saving = true; m.error = null; drawBulkModal();

  const today = new Date().toISOString().slice(0, 10);
  const personPatch = {};
  for (const f of chosen) {
    if (f.where !== 'person') continue;
    personPatch[f.key] = f.key === 'is_active' ? m.form[f.key] === 'true' : m.form[f.key];
  }

  let done = 0;
  const failures = [];
  for (const id of ids) {
    try {
      if (Object.keys(personPatch).length) await api.update('people', id, personPatch);

      /* The dated ones. Close whatever is open first, then open the new
         record from today — an employee with two current managers is not
         a thing, and leaving the old row open would produce one. */
      for (const f of chosen) {
        if (f.where === 'employee_roles') {
          const open = (await api.select('employee_roles', '*', `person_id=eq.${id}`))
            .filter(r => !r.end_date);
          for (const r of open) await api.update('employee_roles', r.id, { end_date: today });
          await api.insert('employee_roles',
            { person_id: id, role_id: m.form.role_id, start_date: today });
        }
        if (f.where === 'hierarchy') {
          const open = (await api.select('hierarchy', '*', `person_id=eq.${id}`))
            .filter(r => !r.effective_to);
          for (const r of open) await api.update('hierarchy', r.id, { effective_to: today });
          await api.insert('hierarchy',
            { person_id: id, manager_id: m.form.manager_id, effective_from: today });
        }
      }
      done++;
    } catch (e) {
      failures.push(`${id}: ${e.message}`);
    }
  }

  m.saving = false;
  if (failures.length) {
    /* Said plainly rather than rolled back. There is no transaction
       across these calls, so some people are already changed; telling
       somebody it all failed would be a lie they would act on. */
    m.error = `${done} of ${ids.length} updated. ${failures.length} failed: ${failures[0]}`;
    drawBulkModal();
  } else {
    closeModal();
    S.peoplePicked.clear();
    showToast(`Updated ${done} ${done === 1 ? 'person' : 'people'}.`, 'success');
    await pagePeople();
  }
}

// ── 12. PEOPLE MODAL ──────────────────────────────────────────────────
//  Three-tab modal: Personal · Employment · Equality & D&I
// ──────────────────────────────────────────────────────────────────────
function openPersonModal(person) {
  S.modal = { type: 'person', tab: 'personal', form: person ? {...person} : {}, editId: person?.id || null, saving: false };
  drawPersonModal();
}

function drawPersonModal() {
  const m = S.modal;
  if (!m) return;
  const f = k => m.form[k] || '';

  // Tab content builder
  const tabContent = () => {
    if (m.tab === 'personal') return `
      <!-- Photo upload -->
      <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--bg)">
        <div id="photo-wrap" style="position:relative;cursor:pointer;margin-bottom:8px" onclick="document.getElementById('photo-input').click()">
          ${m.form.photo_url
            ? `<img src="${m.form.photo_url}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid var(--border);display:block">`
            : `<div style="width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#7c3aed);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#fff;border:3px solid var(--border)">${(f('first_name')||'?')[0]}${(f('last_name')||'?')[0]}</div>`}
          <div style="position:absolute;bottom:2px;right:2px;width:24px;height:24px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff">
            ${ic('camera',11,'#fff')}
          </div>
        </div>
        <p style="font-size:11px;color:var(--muted)">Click photo to upload · Max 500KB · Cropped to circle</p>
        <input type="file" id="photo-input" accept="image/*" style="display:none">
      </div>
      <div class="two-col">
        ${field({key:'first_name', label:'First Name', required:true}, f('first_name'))}
        ${field({key:'last_name',  label:'Last Name',  required:true}, f('last_name'))}
        ${field({key:'preferred_name',   label:'Preferred Name'},         f('preferred_name'))}
        ${field({key:'employee_number',  label:'Employee Number'},         f('employee_number'))}
        ${field({key:'dob',              label:'Date of Birth', type:'date'}, f('dob'))}
        ${field({key:'ni_number',        label:'NI Number', hint:'National Insurance'}, f('ni_number'))}
        ${field({key:'personal_email',   label:'Personal Email', type:'email'}, f('personal_email'))}
        ${field({key:'email',            label:'Work Email',     type:'email'}, f('email'))}
        ${field({key:'personal_phone',   label:'Personal Phone', type:'tel'},   f('personal_phone'))}
        ${field({key:'work_phone',       label:'Work Phone',     type:'tel'},   f('work_phone'))}
      </div>
      ${field({key:'nationality', label:'Nationality', type:'select', options:['Afghan', 'Albanian', 'Algerian', 'American', 'Andorran', 'Angolan', 'Argentinean', 'Armenian', 'Australian', 'Austrian', 'Azerbaijani', 'Bahamian', 'Bahraini', 'Bangladeshi', 'Barbadian', 'Batswana', 'Belarusian', 'Belgian', 'Belizean', 'Beninese', 'Bhutanese', 'Bolivian', 'Bosnian', 'Brazilian', 'British', 'Bruneian', 'Bulgarian', 'Burkinabe', 'Burmese', 'Burundian', 'Cambodian', 'Cameroonian', 'Canadian', 'Cape Verdean', 'Central African', 'Chadian', 'Chilean', 'Chinese', 'Colombian', 'Comoran', 'Congolese', 'Costa Rican', 'Croatian', 'Cuban', 'Cypriot', 'Czech', 'Danish', 'Dominican', 'Dutch', 'East Timorese', 'Ecuadorean', 'Egyptian', 'Emirian', 'Eritrean', 'Estonian', 'Ethiopian', 'Fijian', 'Filipino', 'Finnish', 'French', 'Gabonese', 'Gambian', 'Georgian', 'German', 'Ghanaian', 'Greek', 'Grenadian', 'Guatemalan', 'Guinean', 'Guyanese', 'Haitian', 'Honduran', 'Hungarian', 'Icelander', 'Indian', 'Indonesian', 'Iranian', 'Iraqi', 'Irish', 'Israeli', 'Italian', 'Ivorian', 'Jamaican', 'Japanese', 'Jordanian', 'Kazakhstani', 'Kenyan', 'Kuwaiti', 'Kyrgyz', 'Laotian', 'Latvian', 'Lebanese', 'Liberian', 'Libyan', 'Liechtensteiner', 'Lithuanian', 'Luxembourger', 'Macedonian', 'Malagasy', 'Malawian', 'Malaysian', 'Maldivan', 'Malian', 'Maltese', 'Mauritanian', 'Mauritian', 'Mexican', 'Micronesian', 'Moldovan', 'Monacan', 'Mongolian', 'Moroccan', 'Mozambican', 'Namibian', 'Nepalese', 'New Zealander', 'Nicaraguan', 'Nigerian', 'Nigerien', 'North Korean', 'Norwegian', 'Omani', 'Pakistani', 'Panamanian', 'Papua New Guinean', 'Paraguayan', 'Peruvian', 'Polish', 'Portuguese', 'Qatari', 'Romanian', 'Russian', 'Rwandan', 'Saint Lucian', 'Salvadoran', 'Samoan', 'Saudi', 'Scottish', 'Senegalese', 'Serbian', 'Seychellois', 'Sierra Leonean', 'Singaporean', 'Slovakian', 'Slovenian', 'Somali', 'South African', 'South Korean', 'South Sudanese', 'Spanish', 'Sri Lankan', 'Sudanese', 'Surinamer', 'Swazi', 'Swedish', 'Swiss', 'Syrian', 'Taiwanese', 'Tajik', 'Tanzanian', 'Thai', 'Togolese', 'Tunisian', 'Turkish', 'Ugandan', 'Ukrainian', 'Uruguayan', 'Uzbekistani', 'Venezuelan', 'Vietnamese', 'Welsh', 'Yemenite', 'Zambian', 'Zimbabwean']}, f('nationality'))}
      ${field({key:'eye_colour', label:'Eye Colour', type:'select', options:['Amber','Black','Blue','Brown','Grey','Green','Hazel','Other']}, f('eye_colour'))}`;

    if (m.tab === 'employment') return `
      <div class="two-col">
        ${field({key:'start_date',          label:'Start Date',              type:'date', required:true}, f('start_date'))}
        ${field({key:'department_id',       label:'Department',               type:'select', options: mkOpts(S.cache.departments||[],'id','name')}, f('department_id'))}
        ${field({key:'office_location_id',    label:'Office Location',           type:'select', options: mkOpts(S.cache.office_locations||[],'id', r => (r.city ? r.name+' ('+r.city+')' : r.name) + (r.location_type ? ' — '+r.location_type : ''))}, f('office_location_id'))}
        ${field({key:'employment_type',     label:'Employment Type',          type:'select', options:['Full Time','Part Time','Fixed Term','Zero Hours','Contractor','Apprentice']}, f('employment_type'))}
        ${field({key:'status',              label:'Status',                   type:'select', options:['Active','On Leave','Suspended','Leaver']}, f('status'))}
        ${field({key:'probation_end_date',  label:'Probation End Date',       type:'date'}, f('probation_end_date'))}
        ${field({key:'probation_months',    label:'Probation Period (months)', type:'number', hint:'e.g. 3 or 6 months'}, f('probation_months'))}
        ${field({key:'notice_period_weeks', label:'Notice Period (weeks)',     type:'number', hint:'Contractual notice in weeks — 4 = 1 month, 12 = 3 months'}, f('notice_period_weeks'))}
      </div>
      ${field({key:'right_to_work', label:'Right to Work', type:'select', options:['Yes — British/Irish Passport','Yes — Biometric Residence Permit','Yes — Share Code','Pending','N/A']}, f('right_to_work'))}
      ${field({key:'rtw_expiry', label:'Right to Work Expiry', type:'date'}, f('rtw_expiry'))}`;

    if (m.tab === 'equality') return `
      <div class="alert alert-info" style="margin-bottom:16px">
        ${ic('info',15)} Collected for diversity monitoring under GDPR special category rules.
      </div>
      <div class="two-col">
        ${field({key:'gender',   label:'Gender',   type:'select', options:['Male','Female','Non-binary','Prefer not to say','Other']}, f('gender'))}
        ${field({key:'pronouns', label:'Pronouns', type:'select', options:['He/Him','She/Her','They/Them','Other','Prefer not to say']}, f('pronouns'))}
      </div>
      ${field({key:'ethnicity', label:'Ethnicity', type:'select', options:['White — British','White — Irish','White — Other','Asian / Asian British — Indian','Asian / Asian British — Pakistani','Asian / Asian British — Bangladeshi','Asian / Asian British — Other','Black / African / Caribbean','Mixed — White & Black Caribbean','Mixed — White & Asian','Mixed — Other','Other ethnic group','Prefer not to say']}, f('ethnicity'))}
      ${field({key:'disability', label:'Disability / Long-term health condition', type:'select', options:[{value:'false',label:'No'},{value:'true',label:'Yes — reasonable adjustments may apply'}]}, f('disability') === true ? 'true' : f('disability') === false ? 'false' : f('disability'))}
      ${(f('disability') === 'true' || f('disability') === true) ? field({key:'disability_notes', label:'Adjustment Notes', type:'textarea'}, f('disability_notes')) : ''}`;

    return '';
  };

  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal modal-md">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:24px 28px 0;flex-shrink:0">
          <div>
            <h3 class="font-display" style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:2px">
              ${m.editId ? x(`${m.form.first_name||''} ${m.form.last_name||''}`.trim() || 'Edit Employee') : 'New Employee'}
            </h3>
            <p style="font-size:13px;color:var(--muted)">${m.editId ? `Employee #${x(m.form.employee_number||'—')}` : 'Add a new employee record'}</p>
          </div>
          <button id="mc" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;border-radius:6px;display:flex">
            ${ic('x',16)}
          </button>
        </div>
        <!-- Tab bar -->
        <div style="display:flex;border-bottom:1px solid var(--bg);padding:0 28px;margin-top:16px;flex-shrink:0">
          ${['personal','employment','equality'].map(t =>
            `<button class="modal-tab ${m.tab===t?'active':''}" data-tab="${t}">
              ${{ personal:'Personal', employment:'Employment', equality:'Equality & D&I' }[t]}
            </button>`).join('')}
        </div>
        <!-- Scrollable body -->
        <div id="hr-modal-body" style="overflow-y:auto;padding:24px 28px;flex:1">${tabContent()}</div>
        <!-- Footer -->
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:16px 28px;border-top:1px solid var(--bg);background:var(--bg);border-radius:0 0 20px 20px;flex-shrink:0">
          <button class="btn btn-secondary" id="m-cancel">Cancel</button>
          <button class="btn btn-primary"   id="m-save" ${m.saving?'disabled':''}>
            ${ic('save',14)} ${m.saving?'Saving…':'Save changes'}
          </button>
        </div>
      </div>
    </div>`;
  icons();

  // ── Photo upload handler ─────────────────────────────────────────
  document.getElementById('photo-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Photo must be under 5MB', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height, 400);
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, (img.width-size)/2, (img.height-size)/2, size, size, 0, 0, size, size);
        m.form.photo_url = canvas.toDataURL('image/jpeg', 0.75);
        const wrap = document.getElementById('photo-wrap');
        if (wrap) wrap.innerHTML = `<img src="${m.form.photo_url}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid var(--border);display:block"><div style="position:absolute;bottom:2px;right:2px;width:24px;height:24px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff">✓</div>`;
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Close handlers
  $('mc').addEventListener('click', closeModal);
  $('m-cancel').addEventListener('click', closeModal);
  $('mo').addEventListener('click', e => { if (e.target === $('mo')) closeModal(); });

  // Tab switching — save current form data first, then re-draw
  hrAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      collectForm(); S.modal.tab = btn.dataset.tab; drawPersonModal();
    });
  });

  // Save
  $('m-save').addEventListener('click', async () => {
    collectForm();
    S.modal.saving = true; drawPersonModal();
    try {
      if (m.editId) await api.update('people', m.editId, m.form);
      else await api.insert('people', m.form);
      closeModal(); await pagePeople();
    } catch { S.modal.saving = false; drawPersonModal(); }
  });
}

// ── 13. ADMIN PAGE ────────────────────────────────────────────────────
async function pageAdmin() {
  S.adminSearch = '';
  await loadAdminTable();
}

async function loadAdminTable() {
  const t = ADMIN_TABLES.find(t => t.id === S.adminTable) || ADMIN_TABLES[0];
  try {
    S.tableCache[t.table] = await api.select(t.table, '*') || [];
    if (!Array.isArray(S.tableCache[t.table])) S.tableCache[t.table] = [];
  } catch { S.tableCache[t.table] = []; }
  renderAdmin();
}

function renderAdmin() {
  const pc = $('hr-page-content');
  if (!pc) return;
  const tConfig  = ADMIN_TABLES.find(t => t.id === S.adminTable) || ADMIN_TABLES[0];
  const records  = S.tableCache[tConfig.table] || [];
  const q        = S.adminSearch.toLowerCase();
  const firstKey = tConfig.fields[0]?.key;
  const filtered = q ? records.filter(r => String(r[firstKey]||'').toLowerCase().includes(q)) : records;

  pc.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px">
      <div>
        <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Admin</h1>
        <p style="color:var(--muted);font-size:14px">Manage all reference and lookup data</p>
      </div>
    </div>

    <!-- Lookup table selector grid -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:32px">
      ${ADMIN_TABLES.map(t => `
        <button class="admin-tab ${S.adminTable===t.id?'active':''}" data-admin-tab="${t.id}">
          ${ic(t.icon,13)} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">${x(t.label)}</span>
        </button>`).join('')}
    </div>

    <!-- Selected table header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <h2 class="font-display" style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:2px">${x(tConfig.label)}</h2>
        <p style="font-size:13px;color:var(--muted)">${records.length} entr${records.length!==1?'ies':'y'}</p>
      </div>
      <button class="btn btn-primary" id="admin-add">${ic('plus',14)} Add ${x(tConfig.label)}</button>
    </div>

    <!-- Search (shown when table has > 6 entries) -->
    ${records.length > 6 ? `
    <div class="search-wrap">
      <span class="search-icon">${ic('search',15)}</span>
      <input type="search" class="field-input" id="admin-search" placeholder="Search ${x(tConfig.label.toLowerCase())}…" value="${x(S.adminSearch)}">
    </div>` : ''}

    <!-- Table -->
    <div class="card">
      ${filtered.length === 0 ? `
        <div class="empty">
          <div style="width:56px;height:56px;background:var(--bg);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:var(--muted)">${ic('clipboard-list',22)}</div>
          <p style="font-weight:600;color:var(--muted);margin-bottom:4px">No ${x(tConfig.label.toLowerCase())} entries yet</p>
          <p style="font-size:13px;color:var(--muted)">Add your first entry using the button above</p>
        </div>` : `
      <table class="tbl">
        <thead>
          <tr>
            ${tConfig.fields.map(f => `<th class="th">${x(f.label)}</th>`).join('')}
            <th class="th"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(row => `
            <tr class="tr">
              ${tConfig.fields.map((f, i) => `
                <td class="td">
                  ${i === 0 && row[f.key]
                    ? `<span class="badge" style="background:var(--bg);color:var(--text)">${x(row[f.key])}</span>`
                    : `<span style="color:${row[f.key]?'inherit':'var(--border)'}">${x(row[f.key]||'—')}</span>`}
                </td>`).join('')}
              <td class="td" style="text-align:right;white-space:nowrap">
                <button class="btn-icon edit" data-edit="${x(row.id)}" title="Edit">${ic('pencil',14)}</button>
                <button class="btn-icon del"  data-del="${x(row.id)}"  title="Delete">${ic('trash-2',14)}</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`}
    </div>`;
  icons();

  // Table-tab switching
  hrAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.adminTable = btn.dataset.adminTab; S.adminSearch = ''; loadAdminTable();
    });
  });

  // Search
  $('admin-search')?.addEventListener('input', e => { S.adminSearch = e.target.value; renderAdmin(); });

  // Add
  $('admin-add')?.addEventListener('click', () => openAdminModal(tConfig, null));

  // Edit
  hrAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = byId(records, btn.dataset.edit);
      if (row) openAdminModal(tConfig, row);
    });
  });

  // Delete
  hrAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete this ${tConfig.label} entry? This cannot be undone.`)) return;
      await api.del(tConfig.table, btn.dataset.del);
      await loadAdminTable();
    });
  });
}

// ── 14. ADMIN MODAL ───────────────────────────────────────────────────
function openAdminModal(tConfig, row) {
  S.modal = { type: 'admin', tConfig, form: row ? {...row} : {}, editId: row?.id || null, saving: false };
  drawAdminModal();
}

function drawAdminModal() {
  const m = S.modal;
  if (!m) return;
  const { tConfig } = m;

  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal modal-sm">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:24px 28px 20px;border-bottom:1px solid var(--bg);flex-shrink:0">
          <h3 class="font-display" style="font-size:17px;font-weight:800;color:var(--text)">
            ${m.editId ? `Edit ${x(tConfig.label)}` : `New ${x(tConfig.label)}`}
          </h3>
          <button id="mc" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;border-radius:6px;display:flex">${ic('x',16)}</button>
        </div>
        <div id="hr-modal-body" style="overflow-y:auto;padding:24px 28px;flex:1">
          ${tConfig.fields.map(f => field(f, m.form[f.key] || '')).join('')}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:16px 28px;border-top:1px solid var(--bg);background:var(--bg);border-radius:0 0 20px 20px;flex-shrink:0">
          <button class="btn btn-secondary" id="m-cancel">Cancel</button>
          <button class="btn btn-primary" id="m-save" ${m.saving?'disabled':''}>
            ${ic('save',14)} ${m.saving?'Saving…':'Save changes'}
          </button>
        </div>
      </div>
    </div>`;
  icons();

  $('mc').addEventListener('click', closeModal);
  $('m-cancel').addEventListener('click', closeModal);
  $('mo').addEventListener('click', e => { if (e.target === $('mo')) closeModal(); });

  $('m-save').addEventListener('click', async () => {
    collectForm();
    m.saving = true; drawAdminModal();
    try {
      if (m.editId) await api.update(tConfig.table, m.editId, m.form);
      else await api.insert(tConfig.table, m.form);
      closeModal(); await loadAdminTable();
    } catch { m.saving = false; drawAdminModal(); }
  });
}

// ── 15. CLOSE MODAL ───────────────────────────────────────────────────
function closeModal() {
  S.modal = null;
  const r = $('hr-modal-root');
  if (r) r.innerHTML = '';
}

// ── 16. COMING SOON PAGE ──────────────────────────────────────────────
const CS_ITEMS = {
  roles:        ['Role history with start/end dates','Org chart view','Department hierarchy','Manager timeline'],
  pay:          ['Full salary history','Pay band positioning','Gender pay gap reporting','Pay review workflow'],
  skills:       ['Skills matrix per employee','Training attendance records','Certificate & accreditation tracker','Renewal alerts'],
  recruitment:  ['Job advert builder','Candidate pipeline kanban','Interview stage tracker','Offer management'],
  interactions: ['Sickness & return-to-work','Disciplinary case tracker','Grievance log','1:1 and welfare check records'],
  leavers:      ['Resignation / retirement / dismissal records','Exit interview tracker','Death in service process','Rehire eligibility flag'],
  onboarding:   ['Video & document completion tracking','Questionnaire results','Task checklist per new starter','Role-specific onboarding plans'],
};

function pageComingSoon() {
  const pc = $('hr-page-content');
  if (!pc) return;
  const m     = MODULES.find(mod => mod.id === S.page);
  if (!m) return;
  const items = CS_ITEMS[m.id] || [];

  pc.innerHTML = `
    <div style="margin-bottom:32px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">${x(m.label)}</h1>
      <p style="color:var(--muted);font-size:14px">Module UI in development</p>
    </div>
    <div class="card">
      <div style="padding:80px 40px;display:flex;flex-direction:column;align-items:center;text-align:center">
        <div class="icon-tile" style="width:64px;height:64px;border-radius:16px;background:${m.accent}18;margin-bottom:24px">
          ${ic(m.icon,28,m.accent)}
        </div>
        <span class="badge" style="background:var(--bg);color:var(--muted);border:1px solid var(--border);margin-bottom:16px;padding:5px 12px">
          Schema ready · UI coming soon
        </span>
        <p style="font-size:14px;color:var(--muted);max-width:340px;line-height:1.75;margin-bottom:32px">
          All database tables for this module are set up in Supabase. The interface is being built.
        </p>
        ${items.length ? `
        <div style="background:var(--bg);border-radius:12px;padding:24px;text-align:left;width:100%;max-width:380px;border:1px solid var(--bg)">
          <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px">What's included</p>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:10px">
            ${items.map(item =>
              `<li style="display:flex;align-items:center;gap:10px;font-size:13px;color:#475569">
                <span style="color:#10b981;flex-shrink:0">${ic('check-circle',14)}</span> ${x(item)}
              </li>`).join('')}
          </ul>
        </div>` : ''}
      </div>
    </div>`;
  icons();
}


// ════════════════════════════════════════════════════════════════════════
//  SHARED HELPERS FOR RELATIONAL PAGES (sections 17–23)
//  These power all new module pages that reference people and lookup tables.
// ════════════════════════════════════════════════════════════════════════

// ── Cached fetch ──────────────────────────────────────────────────────
// Fetches a table once per session and stores in S.cache[key].
async function cached(key, table, cols) {
  if (!S.cache[key]) {
    try { const r = await api.select(table, cols||'*'); S.cache[key] = Array.isArray(r) ? r : []; }
    catch { S.cache[key] = []; }
  }
  return S.cache[key];
}
function clearCache(...keys) { keys.forEach(k => delete S.cache[k]); }

// ── Dropdown option builder: [{value, label}] from any array ─────────
function mkOpts(arr, valKey, labelFn) {
  return (arr||[])
    .map(r => ({
      value: r[valKey||'id'],
      label: typeof labelFn === 'function' ? labelFn(r) : (r[labelFn]||r.id||'')
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'en', { sensitivity: 'base' }));
}

// ── Resolve an ID to a display name using a cached array ─────────────
function resolve(cacheKey, id, labelFn) {
  if (!id) return '—';
  const rec = byId(S.cache[cacheKey], id);
  if (!rec) return `<span style="color:var(--border);font-family:monospace;font-size:11px">${x(String(id).slice(0,8))}…</span>`;
  return x(typeof labelFn === 'function' ? labelFn(rec) : (rec[labelFn]||'—'));
}

// ── Person helpers ────────────────────────────────────────────────────
const personName = id => resolve('people', id, r => `${r.first_name||''} ${r.last_name||''}`.trim());
const personOpts = () => mkOpts(S.cache.people||[], 'id',
  r => `${r.first_name||''} ${r.last_name||''}${r.employee_number?' ('+r.employee_number+')':''}`.trim());

// ── Sub-tab bar: pill group navigation used by multi-section pages ────
function subTabBar(tabs, activeId, stateKey) {
  return `<div style="display:flex;gap:3px;background:var(--bg);border-radius:10px;padding:4px;margin-bottom:28px;flex-wrap:wrap">
    ${tabs.map(t => `
      <button data-subtab="${t.id}" data-sk="${stateKey}"
        style="padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;border:none;cursor:pointer;
               display:flex;align-items:center;gap:5px;transition:all 0.15s;font-family:'Inter',sans-serif;
               ${activeId===t.id
                 ? 'background:#fff;color:var(--accent);box-shadow:0 1px 4px rgba(0,0,0,0.12)'
                 : 'background:transparent;color:var(--muted)'}">
        ${ic(t.icon||'circle', 12)} ${x(t.label)}
      </button>`).join('')}
  </div>`;
}

// ── Bind sub-tab buttons (updates S[stateKey] and calls rerender) ─────
function bindSubTabs(rerender) {
  hrAll('[data-subtab]').forEach(btn => {
    btn.addEventListener('click', () => { S[btn.dataset.sk] = btn.dataset.subtab; rerender(); });
  });
}

// ── Generic CRUD list renderer ────────────────────────────────────────
// config: { table, title, subtitle, addLabel, columns:[{label,key?,render?}], fields, wide? }
function renderCRUD(config, records) {
  const q = (S.crudSearch||'').toLowerCase();
  const filtered = q ? records.filter(r => {
    const allText = config.columns.map(c => String(r[c.key]||'')).join(' ').toLowerCase();
    const names   = `${r.first_name||''} ${r.last_name||''}`.toLowerCase();
    return allText.includes(q) || names.includes(q);
  }) : records;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <h2 class="font-display" style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:2px">${x(config.title)}</h2>
        ${config.subtitle ? `<p style="font-size:13px;color:var(--muted)">${x(config.subtitle)}</p>` : ''}
      </div>
      <button class="btn btn-primary" id="crud-add">${ic('plus',14)} ${x(config.addLabel||'Add Record')}</button>
    </div>
    <div class="search-wrap" style="max-width:380px">
      <span class="search-icon">${ic('search',15)}</span>
      <input type="search" class="field-input" id="crud-search" placeholder="Search…" value="${x(S.crudSearch||'')}">
    </div>
    <div class="card">
      ${filtered.length === 0 ? `
        <div class="empty">
          <div style="width:48px;height:48px;background:var(--bg);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:var(--muted)">${ic('inbox',20)}</div>
          <p style="font-weight:600;color:var(--muted);font-size:14px;margin-bottom:4px">No records yet</p>
          <p style="font-size:13px;color:var(--muted)">Use the button above to add the first one</p>
        </div>` : `
      <table class="tbl">
        <thead><tr>
          ${config.columns.map(c=>`<th class="th">${x(c.label)}</th>`).join('')}
          <th class="th"></th>
        </tr></thead>
        <tbody>
          ${filtered.map(row=>`
            <tr class="tr">
              ${config.columns.map(c=>`<td class="td">${c.render ? c.render(row) : x(row[c.key]||'—')}</td>`).join('')}
              <td class="td" style="text-align:right;white-space:nowrap">
                ${(config.rowActions||[]).map(a=>`<button class="btn-icon" data-action="${x(a.key)}" data-action-id="${x(row.id)}" title="${x(a.label)}" style="color:${a.colour||'var(--muted)'}">${ic(a.icon,14)}</button>`).join('')}
                <button class="btn-icon edit" data-edit="${x(row.id)}" title="Edit">${ic('pencil',14)}</button>
                <button class="btn-icon del"  data-del="${x(row.id)}"  title="Delete">${ic('trash-2',14)}</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`}
    </div>`;
}

// ── Bind CRUD events (search, add, edit, delete) ──────────────────────
function bindCRUD(config, records, onReload) {
  document.getElementById('crud-search')?.addEventListener('input', e => {
    S.crudSearch = e.target.value; renderPageContent(config, records, onReload);
  });
  document.getElementById('crud-add')?.addEventListener('click', () => openGenericModal(config, null, onReload));
  hrAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = byId(records, btn.dataset.edit);
      if (row) openGenericModal(config, row, onReload);
    });
  });
  hrAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete this ${config.title} record? This cannot be undone.`)) return;
      await api.del(config.table, btn.dataset.del);
      clearCache(config.table);
      await onReload();
    });
  });
}

// Helper: re-render just the CRUD section after search (no full page reload)
function renderPageContent(config, records, onReload) {
  const q = (S.crudSearch||'').toLowerCase();
  const filtered = q ? records.filter(r => {
    const allText = config.columns.map(c => String(r[c.key]||'')).join(' ').toLowerCase();
    return allText.includes(q);
  }) : records;
  // Just update the card section
  const card = document.querySelector('#page-content .card');
  if (!card) return;
  card.outerHTML = renderCRUD(config, records).split('<div class="card">')[1] ? '<div class="card">' + renderCRUD(config, records).split('<div class="card">')[1] : card.outerHTML;
  // Re-render fully instead
  onReload();
}

// ── Generic add/edit modal ────────────────────────────────────────────
function openGenericModal(config, row, onReload) {
  const form = row ? {...row} : {};
  // Stamp original DB status so workflow transitions can read the source state even after user edits the dropdown
  if (form.status) form._dbStatus = form.status;
  S.modal = { type:'generic', config, form, editId: row?.id||null, saving:false };
  drawGenericModal(onReload);
}

function drawGenericModal(onReload) {
  const m = S.modal; if (!m) return;
  const { config } = m;

  // Build fields — if wide, wrap in two-col grid
  const fieldsHtml = config.wide
    ? `<div class="two-col">${config.fields.map(f => field(f, m.form[f.key]||'')).join('')}</div>`
    : config.fields.map(f => field(f, m.form[f.key]||'')).join('');

  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal ${config.wide ? 'modal-md' : 'modal-sm'}">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:24px 28px 20px;border-bottom:1px solid var(--bg);flex-shrink:0">
          <h3 class="font-display" style="font-size:17px;font-weight:800;color:var(--text)">
            ${m.editId ? `Edit ${x(config.title)}` : `New ${x(config.title)}`}
          </h3>
          <button id="mc" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;border-radius:6px;display:flex">${ic('x',16)}</button>
        </div>
        <div id="hr-modal-body" style="overflow-y:auto;padding:24px 28px;flex:1">${fieldsHtml}</div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:16px 28px;border-top:1px solid var(--bg);background:var(--bg);border-radius:0 0 20px 20px;flex-shrink:0">
          <button class="btn btn-secondary" id="m-cancel">Cancel</button>
          <button class="btn btn-primary" id="m-save" ${m.saving?'disabled':''}>
            ${ic('save',14)} ${m.saving?'Saving…':'Save changes'}
          </button>
        </div>
      </div>
    </div>`;
  icons();

  $('mc').addEventListener('click', closeModal);
  $('m-cancel').addEventListener('click', closeModal);
  $('mo').addEventListener('click', e => { if (e.target === $('mo')) closeModal(); });

  // ── Reactive field wiring ─────────────────────────────────────────
  // Fields that declare `reactsTo: 'key'` rebuild their options whenever
  // that field changes — e.g. Conducted By excludes the selected Employee.
  config.fields.forEach(f => {
    if (!f.reactsTo) return;
    const triggerEl = document.querySelector(`[data-field="${f.reactsTo}"]`);
    const targetEl  = document.querySelector(`[data-field="${f.key}"]`);
    if (!triggerEl || !targetEl) return;
    const rebuild = () => {
      m.form[f.reactsTo] = triggerEl.value || null;
      const optsArr = typeof f.options === 'function' ? f.options() : (f.options || []);
      const currentVal = targetEl.value;
      targetEl.innerHTML = '<option value="">Select…</option>' +
        optsArr.map(o => {
          const v = String(o.value ?? o);
          const l = String(o.label ?? o);
          return `<option value="${v}"${currentVal === v ? ' selected' : ''}>${l}</option>`;
        }).join('');
    };
    triggerEl.addEventListener('change', rebuild);
    rebuild(); // run once on open so initial state is correct
  });

  // ── visibleIf: conditional field visibility ───────────────────────
  // Fields with `visibleIf: {field:'x', value:'y'}` are hidden unless
  // the trigger field equals the specified value.
  const applyVisibility = () => {
    config.fields.forEach(f => {
      if (!f.visibleIf) return;
      const triggerEl = document.querySelector(`[data-field="${f.visibleIf.field}"]`);
      const targetEl  = document.querySelector(`[data-field="${f.key}"]`);
      if (!triggerEl || !targetEl) return;
      const wrap = targetEl.closest('div[style*="margin-bottom"]') || targetEl.parentElement;
      if (wrap) {
        const match = f.visibleIf.values
          ? f.visibleIf.values.includes(triggerEl.value)
          : triggerEl.value === f.visibleIf.value;
        wrap.style.display = match ? '' : 'none';
      }
    });
  };
  // Wire up triggers for visibleIf
  config.fields.forEach(f => {
    if (!f.visibleIf) return;
    const triggerEl = document.querySelector(`[data-field="${f.visibleIf.field}"]`);
    if (triggerEl) triggerEl.addEventListener('change', applyVisibility);
  });
  applyVisibility(); // apply on open

  $('m-save').addEventListener('click', async () => {
    collectForm();
    // ── Client-side required field check ─────────────────────────────
    const missing = (config.fields||[]).filter(f => {
      if (!f.required) return false;
      const v = m.form[f.key];
      return !v || String(v).trim() === '';
    });
    if (missing.length) {
      // Highlight the empty required fields red
      missing.forEach(f => {
        const el = document.querySelector(`[data-field="${f.key}"]`);
        if (el) { el.style.borderColor='#ef4444'; el.style.boxShadow='0 0 0 3px rgba(239,68,68,0.15)'; }
      });
      showToast(`Please fill in: <b>${missing.map(f=>f.label).join(', ')}</b>`, 'warn');
      return;
    }
    m.saving = true; drawGenericModal(onReload);
    try {
      // Strip internal _-prefixed keys (e.g. _dbStatus) — never sent to Supabase
      const payload = Object.fromEntries(Object.entries(m.form).filter(([k]) => !k.startsWith('_')));
      if (m.editId) await api.update(config.table, m.editId, payload);
      else await api.insert(config.table, payload);
      clearCache(config.table);
      closeModal();
      showToast('Saved successfully', 'success');
      await onReload();
    } catch { m.saving = false; drawGenericModal(onReload); }
  });
}

// ── Status badge helper ───────────────────────────────────────────────
function statusBadge(val, colourMap) {
  const c = colourMap[val] || 'var(--muted)';
  return val ? `<span class="badge" style="background:${c}18;color:${c};border:1px solid ${c}28">${x(val)}</span>` : '—';
}

// ── Date display helper (highlights overdue in red, due-soon in amber) ─
function dateCell(dateStr, warnDays) {
  if (!dateStr) return '<span style="color:var(--border)">—</span>';
  const d = new Date(dateStr);
  const now = new Date();
  if (warnDays) {
    if (d < now) return `<span style="font-size:12px;font-weight:600;color:#ef4444">${x(dateStr)} ⚠</span>`;
    if (d < new Date(now.getTime() + warnDays*86400000)) return `<span style="font-size:12px;font-weight:600;color:#f59e0b">${x(dateStr)}</span>`;
  }
  return `<span style="font-size:12px">${x(dateStr)}</span>`;
}

// ════════════════════════════════════════════════════════════════════════
//  17. ROLES & STRUCTURE
//  Tables: employee_roles, roles, hierarchy
// ════════════════════════════════════════════════════════════════════════
const ROLES_TABS = [
  { id:'emp-roles', label:'Employee Roles',   icon:'user-check' },
  { id:'role-defs', label:'Role Definitions', icon:'briefcase'  },
  { id:'hierarchy', label:'Hierarchy',        icon:'git-merge'  },
];

async function pageRoles() {
  await Promise.all([
    cached('people',      'people',      'id,first_name,last_name,employee_number'),
    cached('job_titles',  'job_titles',  'id,title'),
    cached('departments', 'departments', 'id,name'),
    cached('salary_bands','salary_bands','id,band_name,grade'),
    cached('roles',       'roles',       '*'),
  ]);
  S.crudSearch = '';
  await loadRolesTab();
}

async function loadRolesTab() {
  const t = {
    'emp-roles':'employee_roles',
    'role-defs':'roles',
    'hierarchy':'hierarchy'
  }[S.rolesTab];
  // Hierarchy dropdowns need fresh people data — always reload to avoid stale empty cache
  if (S.rolesTab === 'hierarchy') {
    clearCache('people');
    await cached('people', 'people', 'id,first_name,last_name,employee_number');
  }
  clearCache(t); await cached(t, t);
  renderRoles();
}

function renderRoles() {
  const pc = $('hr-page-content'); if (!pc) return;
  const jt  = id => resolve('job_titles',  id, 'title');
  const dep = id => resolve('departments', id, 'name');

  const getConfig = () => {
    if (S.rolesTab === 'emp-roles') {
      const records = S.cache.employee_roles || [];
      return { config: {
        table:'employee_roles', title:'Employee Role History',
        subtitle:'All role assignments with start and end dates — full history tracked',
        addLabel:'Add Role', wide:true,
        columns:[
          { label:'Employee',   render: r => personName(r.person_id) },
          { label:'Job Title',  render: r => { const ro = (S.cache.roles||[]).find(ro=>ro.id===r.role_id); return jt(ro?.job_title_id); }},
          { label:'Department', render: r => { const ro = (S.cache.roles||[]).find(ro=>ro.id===r.role_id); return dep(ro?.department_id); }},
          { label:'Start Date', render: r => dateCell(r.start_date) },
          { label:'End Date',   render: r => r.end_date ? dateCell(r.end_date) : '<span class="badge" style="background:var(--ok-bg);color:#16a34a;border:1px solid var(--ok-border)">Current</span>' },
          { label:'Notes',      render: r => r.notes ? `<span style="font-size:12px;color:var(--muted)">${x(r.notes.slice(0,40))}${r.notes.length>40?'…':''}</span>` : '—' },
        ],
        fields:[
          { key:'person_id',  label:'Employee',   required:true, type:'select', options: personOpts() },
          { key:'role_id',    label:'Role',        required:true, type:'select', options: mkOpts(S.cache.roles||[], 'id', r => `${jt(r.job_title_id)} — ${dep(r.department_id)}`) },
          { key:'start_date', label:'Start Date',  required:true, type:'date' },
          { key:'end_date',   label:'End Date',    type:'date', hint:'Leave blank if this is the current role' },
          { key:'notes',      label:'Notes',       type:'textarea' },
        ],
      }, records };
    }
    if (S.rolesTab === 'role-defs') {
      const records = S.cache.roles || [];
      return { config: {
        table:'roles', title:'Role Definitions',
        subtitle:'Job title + department + salary band combinations — referenced by employee roles',
        addLabel:'Add Role Definition', wide:true,
        columns:[
          { label:'Job Title',   render: r => jt(r.job_title_id) },
          { label:'Department',  render: r => dep(r.department_id) },
          { label:'Salary Band', render: r => resolve('salary_bands', r.salary_band_id, ro => `${ro.band_name||''} ${ro.grade?'('+ro.grade+')':''}`.trim()) },
          { label:'FTE',         render: r => r.fte ? `<span class="badge" style="background:var(--bg);color:var(--text)">${x(String(r.fte))}</span>` : '<span style="color:var(--muted)">1.0</span>' },
        ],
        fields:[
          { key:'job_title_id',   label:'Job Title',   required:true, type:'select', options: mkOpts(S.cache.job_titles||[], 'id', 'title') },
          { key:'department_id',  label:'Department',  required:true, type:'select', options: mkOpts(S.cache.departments||[], 'id', 'name') },
          { key:'salary_band_id', label:'Salary Band', type:'select', options: mkOpts(S.cache.salary_bands||[], 'id', r=>`${r.band_name} ${r.grade?'('+r.grade+')':''}`) },
          { key:'fte',            label:'FTE',         type:'number', hint:'1.0 = full time · 0.5 = half time' },
        ],
      }, records };
    }
    // hierarchy
    const records = S.cache.hierarchy || [];
    return { config: {
      table:'hierarchy', title:'Organisation Hierarchy',
      subtitle:'Manager → report relationships with effective dates',
      addLabel:'Add Relationship', wide:true,
      columns:[
        { label:'Employee',       render: r => personName(r.person_id)  },
        { label:'Reports To',     render: r => personName(r.manager_id) },
        { label:'Effective From', render: r => dateCell(r.effective_from) },
        { label:'Effective To',   render: r => r.effective_to ? dateCell(r.effective_to) : '<span class="badge" style="background:var(--ok-bg);color:#16a34a;border:1px solid var(--ok-border)">Current</span>' },
      ],
      fields:[
        // Pass personOpts as a *function* (not called yet) so the dropdown
        // is built fresh each time the modal opens — avoids stale empty cache.
        { key:'person_id',      label:'Employee (who reports)',   required:true, type:'select', options: personOpts },
        { key:'manager_id',     label:'Manager (reports to)',     required:true, type:'select', options: personOpts },
        { key:'effective_from', label:'Effective From',           required:true, type:'date' },
        { key:'effective_to',   label:'Effective To',            type:'date', hint:'Leave blank if this is still the current reporting line' },
      ],
    }, records };
  };

  const { config, records } = getConfig();
  pc.innerHTML = `
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Roles & Structure</h1>
      <p style="color:var(--muted);font-size:14px">Role history, definitions and reporting lines</p>
    </div>
    ${subTabBar(ROLES_TABS, S.rolesTab, 'rolesTab')}
    ${renderCRUD(config, records)}`;
  icons();
  bindSubTabs(() => { S.crudSearch=''; loadRolesTab(); });
  bindCRUD(config, records, loadRolesTab);
}

// ════════════════════════════════════════════════════════════════════════
//  18. PAY
//  Table: employee_pay
// ════════════════════════════════════════════════════════════════════════
async function pagePay() {
  await Promise.all([
    cached('people',      'people',       'id,first_name,last_name,employee_number'),
    cached('salary_bands','salary_bands', 'id,band_name,grade,min_salary,max_salary'),
  ]);
  clearCache('employee_pay'); await cached('employee_pay','employee_pay');
  S.crudSearch = '';
  renderPay();
}

function renderPay() {
  const pc = $('hr-page-content'); if (!pc) return;
  const records = S.cache.employee_pay || [];
  const sbName  = id => resolve('salary_bands', id, r => `${r.band_name||''} ${r.grade?'('+r.grade+')':''}`.trim());

  const config = {
    table:'employee_pay', title:'Pay Records',
    subtitle:'Full salary history — every change is recorded with an effective date',
    addLabel:'Add Pay Record', wide:true,
    columns:[
      { label:'Employee',  render: r => personName(r.person_id) },
      { label:'Salary',    render: r => r.salary ? `<span style="font-weight:700;color:var(--text)">£${Number(r.salary).toLocaleString('en-GB')}</span>` : '—' },
      { label:'Frequency', render: r => r.pay_frequency ? statusBadge(r.pay_frequency, {Monthly:'#10b981',Weekly:'#3b82f6','4-Weekly':'#8b5cf6',Annual:'#f97316'}) : '—' },
      { label:'Band',      render: r => sbName(r.salary_band_id) },
      { label:'Effective', render: r => dateCell(r.effective_date) },
      { label:'Notes',     render: r => r.notes ? `<span style="font-size:12px;color:var(--muted)">${x(r.notes.slice(0,45))}${r.notes.length>45?'…':''}</span>` : '—' },
    ],
    fields:[
      { key:'person_id',      label:'Employee',       required:true, type:'select', options: personOpts() },
      { key:'salary',         label:'Salary (£)',      required:true, type:'number' },
      { key:'pay_frequency',  label:'Pay Frequency',  type:'select', options:['Monthly','Weekly','4-Weekly','Annual'] },
      { key:'salary_band_id', label:'Salary Band',    type:'select', options: mkOpts(S.cache.salary_bands||[],'id', r=>`${r.band_name} ${r.grade?'('+r.grade+')':''}`) },
      { key:'effective_date', label:'Effective Date', required:true, type:'date' },
      { key:'notes',          label:'Notes',          type:'textarea', hint:'e.g. Annual review, promotion, cost of living' },
    ],
  };

  pc.innerHTML = `
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Pay</h1>
      <p style="color:var(--muted);font-size:14px">Salary history and pay band positioning — every change preserved</p>
    </div>
    ${renderCRUD(config, records)}`;
  icons();
  bindCRUD(config, records, pagePay);
}

// ════════════════════════════════════════════════════════════════════════
//  19. SKILLS & TRAINING
//  Tables: employee_skills, employee_training, employee_certificates, employee_accreditations
// ════════════════════════════════════════════════════════════════════════
const SKILLS_TABS = [
  { id:'emp-skills',      label:'Skills',         icon:'star'        },
  { id:'training',        label:'Training',        icon:'book-open'   },
  { id:'certificates',    label:'Certificates',    icon:'award'       },
  { id:'accreditations',  label:'Accreditations',  icon:'badge-check' },
];

async function pageSkills() {
  await Promise.all([
    cached('people',             'people',             'id,first_name,last_name,employee_number'),
    cached('skills',             'skills',             'id,name'),
    cached('training_courses',   'training_courses',   'id,name,provider'),
    cached('certificate_types',  'certificate_types',  'id,name'),
    cached('accreditation_types','accreditation_types','id,name,professional_body'),
  ]);
  S.crudSearch = '';
  await loadSkillsTab();
}

async function loadSkillsTab() {
  const t = { 'emp-skills':'employee_skills', training:'employee_training',
               certificates:'employee_certificates', accreditations:'employee_accreditations' }[S.skillsTab];
  clearCache(t); await cached(t, t);
  renderSkills();
}

function renderSkills() {
  const pc = $('hr-page-content'); if (!pc) return;
  const proLevel = v => {
    const m = { Expert:'#7c3aed', Advanced:'#2563eb', Intermediate:'#0891b2', Beginner:'var(--muted)' };
    return v ? statusBadge(v, m) : '—';
  };

  const getConfig = () => {
    if (S.skillsTab === 'emp-skills') {
      const records = S.cache.employee_skills||[];
      return { config:{
        table:'employee_skills', title:'Employee Skills',
        subtitle:'Skills recorded per employee with proficiency level',
        addLabel:'Add Skill', wide:false,
        columns:[
          { label:'Employee',    render: r => personName(r.person_id) },
          { label:'Skill',       render: r => resolve('skills', r.skill_id, 'name') },
          { label:'Proficiency', render: r => proLevel(r.proficiency_level) },
          { label:'Acquired',    render: r => dateCell(r.date_acquired) },
        ],
        fields:[
          { key:'person_id',         label:'Employee',    required:true, type:'select', options: personOpts() },
          { key:'skill_id',          label:'Skill',       required:true, type:'select', options: mkOpts(S.cache.skills||[],'id','name') },
          { key:'proficiency_level', label:'Proficiency', type:'select', options:['Beginner','Intermediate','Advanced','Expert'] },
          { key:'date_acquired',     label:'Date Acquired', type:'date' },
        ],
      }, records };
    }
    if (S.skillsTab === 'training') {
      const records = S.cache.employee_training||[];
      return { config:{
        table:'employee_training', title:'Training Records',
        subtitle:'Course attendance — formal, informal, e-learning and workshops',
        addLabel:'Add Training Record', wide:true,
        columns:[
          { label:'Employee', render: r => personName(r.person_id) },
          { label:'Course',   render: r => resolve('training_courses', r.course_id, 'name') },
          { label:'Date',     render: r => dateCell(r.date_attended) },
          { label:'Outcome',  render: r => {
            if (r.passed==='true'||r.passed===true) return '<span class="badge" style="background:var(--ok-bg);color:#16a34a;border:1px solid var(--ok-border)">Passed</span>';
            if (r.passed==='false'||r.passed===false) return '<span class="badge" style="background:var(--err-bg);color:#dc2626;border:1px solid var(--err-border)">Not Passed</span>';
            return '<span style="color:var(--border)">—</span>';
          }},
          { label:'Score',    render: r => r.score ? `<span style="font-weight:600">${x(String(r.score))}%</span>` : '—' },
          { label:'Renewal',  render: r => dateCell(r.renewal_due, 30) },
        ],
        fields:[
          { key:'person_id',    label:'Employee', required:true, type:'select', options: personOpts() },
          { key:'course_id',    label:'Course',   required:true, type:'select', options: mkOpts(S.cache.training_courses||[],'id', r=>`${r.name}${r.provider?' — '+r.provider:''}`) },
          { key:'date_attended',label:'Date Attended', required:true, type:'date' },
          { key:'passed',       label:'Outcome',  type:'select', options:[{value:'true',label:'Passed'},{value:'false',label:'Not Passed'}] },
          { key:'score',        label:'Score (%)', type:'number' },
          { key:'renewal_due',  label:'Renewal Due', type:'date' },
          { key:'notes',        label:'Notes', type:'textarea' },
        ],
      }, records };
    }
    if (S.skillsTab === 'certificates') {
      const records = S.cache.employee_certificates||[];
      return { config:{
        table:'employee_certificates', title:'Certificates',
        subtitle:'Certificates held with expiry tracking — red = expired, amber = expiring within 60 days',
        addLabel:'Add Certificate', wide:false,
        columns:[
          { label:'Employee',     render: r => personName(r.person_id) },
          { label:'Certificate',  render: r => resolve('certificate_types', r.certificate_type_id, 'name') },
          { label:'Cert. No.',    render: r => r.certificate_number ? `<span style="font-family:monospace;font-size:12px">${x(r.certificate_number)}</span>` : '—' },
          { label:'Issued',       render: r => dateCell(r.issue_date) },
          { label:'Expires',      render: r => r.expiry_date ? dateCell(r.expiry_date, 60) : '<span class="badge" style="background:var(--bg);color:var(--muted)">No Expiry</span>' },
        ],
        fields:[
          { key:'person_id',           label:'Employee',    required:true, type:'select', options: personOpts() },
          { key:'certificate_type_id', label:'Certificate', required:true, type:'select', options: mkOpts(S.cache.certificate_types||[],'id','name') },
          { key:'certificate_number',  label:'Certificate No.' },
          { key:'issue_date',          label:'Issue Date', type:'date' },
          { key:'expiry_date',         label:'Expiry Date', type:'date', hint:'Leave blank if the certificate has no expiry' },
        ],
      }, records };
    }
    // accreditations
    const records = S.cache.employee_accreditations||[];
    return { config:{
      table:'employee_accreditations', title:'Accreditations',
      subtitle:'Professional body memberships — amber = renewal due within 60 days',
      addLabel:'Add Accreditation', wide:false,
      columns:[
        { label:'Employee',      render: r => personName(r.person_id) },
        { label:'Accreditation', render: r => resolve('accreditation_types', r.accreditation_type_id, 'name') },
        { label:'Membership No.',render: r => r.membership_number ? `<span style="font-family:monospace;font-size:12px">${x(r.membership_number)}</span>` : '—' },
        { label:'Issue Date',    render: r => dateCell(r.issue_date) },
        { label:'Renewal Date',  render: r => dateCell(r.renewal_date, 60) },
      ],
      fields:[
        { key:'person_id',             label:'Employee',      required:true, type:'select', options: personOpts() },
        { key:'accreditation_type_id', label:'Accreditation', required:true, type:'select', options: mkOpts(S.cache.accreditation_types||[],'id', r=>`${r.name}${r.professional_body?' ('+r.professional_body+')':''}`) },
        { key:'membership_number',     label:'Membership No.' },
        { key:'issue_date',            label:'Issue Date',   type:'date' },
        { key:'renewal_date',          label:'Renewal Date', type:'date' },
      ],
    }, records };
  };

  const { config, records } = getConfig();
  pc.innerHTML = `
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Skills & Training</h1>
      <p style="color:var(--muted);font-size:14px">Skills matrix, training records, certificates and accreditations</p>
    </div>
    ${subTabBar(SKILLS_TABS, S.skillsTab, 'skillsTab')}
    ${renderCRUD(config, records)}`;
  icons();
  bindSubTabs(() => { S.crudSearch=''; loadSkillsTab(); });
  bindCRUD(config, records, loadSkillsTab);
}

// ════════════════════════════════════════════════════════════════════════
//  20. RECRUITMENT
//  Tables: job_adverts, candidates, applications, interview_stages, offers
// ════════════════════════════════════════════════════════════════════════
const RECRUIT_TABS = [
  { id:'vacancies',    label:'Vacancies',     icon:'clipboard-list' },
  { id:'adverts',      label:'Job Adverts',   icon:'megaphone'      },
  { id:'applicants',   label:'Applicants',    icon:'users'          },
  { id:'applications', label:'Applications',  icon:'file-text'      },
  { id:'interviews',   label:'Interviews',    icon:'calendar'       },
  { id:'offers',       label:'Offers',        icon:'handshake'      },
];

async function pageRecruitment() {
  await Promise.all([
    cached('people',       'people',       'id,first_name,last_name,employee_number'),
    cached('vacancies',    'vacancies',    'id,title,status'),
    cached('job_adverts',  'job_adverts',  'id,title,vacancy_id,platform,status'),
    cached('applicants',   'applicants',   'id,first_name,last_name,email,in_talent_pool'),
    cached('applications', 'applications', '*'),
    cached('departments',  'departments',  'id,name'),
    cached('job_titles',   'job_titles',   'id,title'),
    cached('salary_bands',      'salary_bands',      'id,band_name,grade'),
    cached('interview_format_types','interview_format_types','id,name'),
    cached('office_locations',  'office_locations',  'id,name,city'),
    cached('job_sites',         'job_sites',         'id,name,url'),
    cached('sector_magazines','sector_magazines','id,name,sector'),
  ]);
  S.crudSearch = '';
  await loadRecruitTab();
}

async function loadRecruitTab() {
  const tableMap = {
    vacancies: 'vacancies', adverts: 'job_adverts', applicants: 'applicants',
    applications: 'applications', interviews: 'interview_stages', offers: 'offers',
  };
  const t = tableMap[S.recruitTab];
  clearCache(t); await cached(t, t);
  // keep applicants + vacancies fresh for dropdowns
  if (S.recruitTab === 'adverts') {
    clearCache('job_sites');       await cached('job_sites','job_sites','id,name');
    clearCache('sector_magazines');await cached('sector_magazines','sector_magazines','id,name');
    clearCache('recruitment_agencies');await cached('recruitment_agencies','recruitment_agencies','id,name');
  }
  if (['applications','interviews','offers'].includes(S.recruitTab)) {
    clearCache('applicants'); await cached('applicants','applicants','id,first_name,last_name,email');
    clearCache('vacancies');  await cached('vacancies','vacancies','id,title,status');
    clearCache('job_adverts');await cached('job_adverts','job_adverts','id,title,vacancy_id,platform,platform_name,status');
  }
  renderRecruitment();
}


// ── Recruitment Application Status Workflow ───────────────────────────
// Each key is the CURRENT status; values are the ONLY permitted next states.
// The modal reads this to filter the Status dropdown strictly.
const STATUS_TRANSITIONS = {
  'New':                   ['Under Review', 'Rejected', 'Withdrawn — Applicant', 'Withdrawn — Employer'],
  'Under Review':          ['Shortlisted', 'On Hold', 'Rejected', 'Withdrawn — Applicant', 'Withdrawn — Employer'],
  'Shortlisted':           ['Interview', 'On Hold', 'Rejected', 'Withdrawn — Applicant', 'Withdrawn — Employer'],
  'On Hold':               ['Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Withdrawn — Applicant', 'Withdrawn — Employer'],
  'Interview':             ['Further Interview', 'Offer', 'Not Successful', 'On Hold', 'Withdrawn — Applicant', 'Withdrawn — Employer'],
  'Further Interview':     ['Interview', 'Offer', 'Not Successful', 'Withdrawn — Applicant', 'Withdrawn — Employer'],
  'Offer':                 ['Hired', 'Offer Declined', 'Withdrawn — Applicant', 'Withdrawn — Employer'],
  // Terminal — no further transitions permitted
  'Hired':                 [],
  'Rejected':              [],
  'Not Successful':        [],
  'Offer Declined':        [],
  'Withdrawn — Applicant': [],
  'Withdrawn — Employer':  [],
};

function renderRecruitment() {
  const pc = $('hr-page-content'); if (!pc) return;

  // Helpers
  const vacTitle  = id => resolve('vacancies',   id, 'title');
  const applLabel = id => {
    const a = (S.cache.applicants||[]).find(r=>r.id===id);
    return a ? `${a.first_name||''} ${a.last_name||''}`.trim() : id?.slice(0,8)||'—';
  };
  const appLabel  = id => {
    const a = (S.cache.applications||[]).find(r=>r.id===id);
    return a ? `${applLabel(a.applicant_id)} → ${vacTitle(a.vacancy_id)}` : id?.slice(0,8)||'—';
  };
  const advertLabel = id => {
    const a = (S.cache.job_adverts||[]).find(r=>r.id===id);
    return a ? `${a.platform||'?'}: ${a.title||vacTitle(a.vacancy_id)}` : '—';
  };

  const VAC_SC    = { Open:'#10b981', 'On Hold':'#f59e0b', Filled:'#3b82f6', Cancelled:'#ef4444' };
  const ADV_SC    = { Draft:'var(--muted)', Live:'#10b981', Closed:'#ef4444' };
  const APP_SC    = {
    'New':                    'var(--muted)',
    'Under Review':           '#3b82f6',
    'Shortlisted':            '#8b5cf6',
    'On Hold':                '#f59e0b',
    'Interview':              '#f97316',
    'Further Interview':      '#ea580c',
    'Offer':                  '#0891b2',
    'Hired':                  '#10b981',
    'Not Successful':         '#ef4444',
    'Offer Declined':         '#dc2626',
    'Withdrawn — Applicant':  'var(--muted)',
    'Withdrawn — Employer':   'var(--muted)',
  };
  const INT_SC    = { 'Make Offer':'#10b981', 'Not Successful':'#ef4444',
                      'Further Interview Needed':'#f97316', 'Suggest Role Creation':'#8b5cf6',
                      'Suggest for Other Vacancy':'#3b82f6', Pending:'var(--muted)' };
  const OFFER_SC  = { Pending:'#f59e0b', Accepted:'#10b981', 'Accepted in Principle':'#3b82f6',
                      Declined:'#ef4444', Withdrawn:'var(--muted)' };
  const INVITE_SC = { Accepted:'#10b981', Declined:'#ef4444', 'No Response':'var(--muted)' };

  const depOpts  = () => mkOpts(S.cache.departments||[], 'id','name');
  const jtOpts   = () => mkOpts(S.cache.job_titles||[],  'id','title');
  const sbOpts   = () => mkOpts(S.cache.salary_bands||[],'id', r=>`${r.band_name} ${r.grade?'('+r.grade+')':''}`);
  const vacOpts  = () => mkOpts((S.cache.vacancies||[]).filter(v=>v.status==='Open'),'id','title');
  const allVacOpts = () => mkOpts(S.cache.vacancies||[],'id','title');
  const advOpts  = () => mkOpts(S.cache.job_adverts||[],'id', r => advertLabel(r.id));
  const applOpts = () => mkOpts(S.cache.applicants||[],'id', r=>`${r.first_name||''} ${r.last_name||''}`.trim());
  const appOpts  = () => mkOpts(S.cache.applications||[],'id', r => appLabel(r.id));

  const getConfig = () => {

    // ── VACANCIES ──────────────────────────────────────────────────────
    if (S.recruitTab === 'vacancies') {
      const records = S.cache.vacancies||[];
      return { config:{
        table:'vacancies', title:'Vacancies', subtitle:'Open positions and their hiring pipeline status',
        addLabel:'Open Vacancy', wide:true,
        columns:[
          { label:'Vacancy',       render: r => `<span style="font-weight:600">${x(r.title||'—')}</span>` },
          { label:'Status',        render: r => statusBadge(r.status||'Open', VAC_SC) },
          { label:'Department',    render: r => resolve('departments', r.department_id, 'name') },
          { label:'Salary Range',  render: r => r.salary_from||r.salary_to
              ? `<span style="font-size:12px">£${r.salary_from?Number(r.salary_from).toLocaleString('en-GB'):'?'} – £${r.salary_to?Number(r.salary_to).toLocaleString('en-GB'):'?'}</span>` : '—' },
          { label:'FTE',           render: r => r.fte ? `<span class="badge" style="background:var(--bg);color:var(--text)">${r.fte}</span>` : '—' },
          { label:'Opened',        render: r => dateCell(r.opened_date) },
          { label:'Target Fill',   render: r => dateCell(r.target_fill_date, 14) },
          { label:'Office',        render: r => r.office_location_id ? resolve('office_locations', r.office_location_id, ro => ro.city ? ro.name+' ('+ro.city+')' : ro.name) + ((() => { const o=(S.cache.office_locations||[]).find(x=>x.id===r.office_location_id); return o?.location_type ? ` <span class="badge" style="background:var(--bg);color:var(--muted);font-size:10px">${o.location_type}</span>` : ''; })()) : '<span style="color:var(--border)">—</span>' },
          { label:'Headcount',     render: r => r.headcount_approved
              ? '<span class="badge" style="background:var(--ok-bg);color:#16a34a">Approved</span>'
              : '<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Pending</span>' },
        ],
        fields:[
          { key:'title',              label:'Vacancy Title',        required:true },
          { key:'department_id',      label:'Department',           type:'select', options: depOpts },
          { key:'job_title_id',       label:'Job Title',            type:'select', options: jtOpts },
          { key:'salary_band_id',     label:'Salary Band',          type:'select', options: sbOpts },
          { key:'salary_from',        label:'Salary From (£)',       type:'number' },
          { key:'salary_to',          label:'Salary To (£)',         type:'number' },
          { key:'fte',                label:'FTE',                   type:'number', hint:'1.0 = full time' },
          { key:'status',             label:'Status',                type:'select', options:['Open','On Hold','Filled','Cancelled'] },
          { key:'headcount_approved', label:'Headcount Approved?',   type:'select', options:[{value:'true',label:'Yes'},{value:'false',label:'No — pending approval'}] },
          { key:'hiring_manager_id',  label:'Hiring Manager',        type:'select', options: personOpts },
          { key:'office_location_id', label:'Office Location',       type:'select',
            options: () => mkOpts(S.cache.office_locations||[],'id', r => (r.city ? r.name+' ('+r.city+')' : r.name) + (r.location_type ? ' — '+r.location_type : '')) },
          { key:'opened_date',        label:'Opened Date',           type:'date' },
          { key:'target_fill_date',   label:'Target Fill Date',      type:'date' },
          { key:'description',        label:'Role Description',      type:'textarea' },
          { key:'requirements',       label:'Requirements',          type:'textarea', hint:'Key skills, qualifications, experience needed' },
          { key:'notes',              label:'Notes',                 type:'textarea' },
        ],
      }, records };
    }

    // ── JOB ADVERTS ────────────────────────────────────────────────────
    if (S.recruitTab === 'adverts') {
      const records = S.cache.job_adverts||[];
      return { config:{
        table:'job_adverts', title:'Job Adverts',
        subtitle:'Each vacancy can be advertised on multiple platforms — Job Sites and Sector Magazines show checkboxes to select specific outlets',
        addLabel:'Place Advert', wide:true, _custom:'advert',
        rowActions:[{ key:'add-applicant', icon:'user-plus', label:'Add Applicant to this Advert', colour:'#10b981' }],
        columns:[
          { label:'Vacancy',    render: r => vacTitle(r.vacancy_id) },
          { label:'Platform',   render: r => {
            const c = { Internal:'var(--accent)', LinkedIn:'#0077b5', 'Company Website':'#10b981', 'Job Site':'#f97316', 'Sector Magazine':'#8b5cf6', Other:'var(--muted)' }[r.platform]||'var(--muted)';
            return r.platform ? `<span class="badge" style="background:${c}18;color:${c};border:1px solid ${c}28">${x(r.platform)}${r.platform_name?' — '+x(r.platform_name):''}</span>` : '—';
          }},
          { label:'Status',     render: r => statusBadge(r.status||'Draft', ADV_SC) },
          { label:'Salary',     key:'salary_shown' },
          { label:'Posted',     render: r => dateCell(r.posted_date) },
          { label:'Closing',    render: r => dateCell(r.closing_date, 3) },
          { label:'Cost',       render: r => r.cost ? `<span style="font-size:12px">£${Number(r.cost).toLocaleString('en-GB')}</span>` : '—' },
        ],
        fields:[
          { key:'vacancy_id',    label:'Vacancy',    required:true, type:'select', options: allVacOpts },
          { key:'platform',      label:'Platform',   required:true, type:'select',
            options:['Internal','Company Website','LinkedIn','Job Site','Sector Magazine','Recruitment Agency','Other'] },
          { key:'platform_name', label:'Platform Detail', hint:'e.g. Reed, Indeed, Nursing Times, Charity Jobs — leave blank for LinkedIn/Internal' },
          { key:'title',         label:'Advert Title', hint:'Leave blank to use the vacancy title' },
          { key:'advert_text',   label:'Advert Text', type:'textarea' },
          { key:'salary_shown',  label:'Salary (as advertised)', hint:'e.g. £35,000–£42,000 or "Competitive"' },
          { key:'url',           label:'Advert URL', hint:'Link to the live advert if external' },
          { key:'posted_date',   label:'Posted Date',  type:'date' },
          { key:'closing_date',  label:'Closing Date', type:'date' },
          { key:'cost',          label:'Advert Cost (£)', type:'number' },
          { key:'status',        label:'Status', type:'select', options:['Draft','Live','Closed'] },
        ],
      }, records };
    }

    // ── APPLICANTS ─────────────────────────────────────────────────────
    if (S.recruitTab === 'applicants') {
      const records = S.cache.applicants||[];
      return { config:{
        table:'applicants', title:'Applicants',
        subtitle:'All applicants — marked as Talent Pool if we want to keep them on record for future roles',
        addLabel:'Add Applicant', wide:false,
        rowActions:[{ key:'attachments', icon:'paperclip', label:'Manage Attachments (CV, cover letter etc.)', colour:'var(--accent)' }],
        columns:[
          { label:'Name',         render: r => `<div style="display:flex;align-items:center;gap:8px"><div class="avatar" style="background:#e0e7ff;color:var(--accent);font-size:10px">${(r.first_name||'?')[0]}${(r.last_name||'?')[0]}</div><span style="font-weight:500">${x(r.first_name||'')} ${x(r.last_name||'')}</span></div>` },
          { label:'Email',        render: r => r.email ? `<a href="mailto:${x(r.email)}" style="color:var(--accent);font-size:13px;text-decoration:none">${x(r.email)}</a>` : '—' },
          { label:'Phone',        key:'phone' },
          { label:'Talent Pool',  render: r => (r.in_talent_pool==='true'||r.in_talent_pool===true)
              ? '<span class="badge" style="background:#ede9fe;color:#7c3aed;border:1px solid #ddd6fe">★ Talent Pool</span>' : '—' },
          { label:'GDPR',         render: r => (r.gdpr_consent==='true'||r.gdpr_consent===true)
              ? '<span class="badge" style="background:var(--ok-bg);color:#16a34a">Consent given</span>'
              : '<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Pending</span>' },
        ],
        fields:[
          { key:'first_name',        label:'First Name',  required:true },
          { key:'last_name',         label:'Last Name',   required:true },
          { key:'email',             label:'Email',       type:'email' },
          { key:'phone',             label:'Phone',       type:'tel' },
          { key:'linkedin_url',      label:'LinkedIn URL' },
          { key:'cv_reference',      label:'CV Reference / File', hint:'Filename or link to stored CV' },
          { key:'gdpr_consent',      label:'GDPR Consent Given?', type:'select', options:[{value:'true',label:'Yes'},{value:'false',label:'No / Pending'}] },
          { key:'gdpr_consent_date', label:'Consent Date', type:'date' },
          { key:'in_talent_pool',    label:'Add to Talent Pool?', type:'select', options:[{value:'true',label:'Yes — keep for future roles'},{value:'false',label:'No'}] },
          { key:'talent_pool_notes', label:'Talent Pool Notes', type:'textarea', hint:'What roles or skills make them a good future candidate?' },
        ],
      }, records };
    }

    // ── APPLICATIONS ───────────────────────────────────────────────────
    if (S.recruitTab === 'applications') {
      const records = S.cache.applications||[];
      return { config:{
        table:'applications', title:'Applications',
        subtitle:'Track each applicant through the pipeline — from received to hired',
        addLabel:'Record Application', wide:true,
        columns:[
          { label:'Applicant',   render: r => applLabel(r.applicant_id) },
          { label:'Vacancy',     render: r => vacTitle(r.vacancy_id) },
          { label:'Via',         render: r => r.advert_id ? (() => {
              const ad = (S.cache.job_adverts||[]).find(a=>a.id===r.advert_id);
              return ad ? `<span class="badge" style="background:var(--bg);color:var(--text)">${x(ad.platform||'?')}</span>` : '—';
            })() : '<span style="color:var(--border)">Direct</span>' },
          { label:'Applied',     render: r => dateCell(r.application_date) },
          { label:'Status',      render: r => {
            const s = r.status||'New';
            const terminal = ['Hired','Rejected','Not Successful','Offer Declined','Withdrawn — Applicant','Withdrawn — Employer'];
            const badge = statusBadge(s, APP_SC);
            return terminal.includes(s) ? `<span style="opacity:0.8">${badge}</span>` : badge;
          }},
          { label:'Int. Invite', render: r => r.interview_response
              ? statusBadge(r.interview_response, INVITE_SC)
              : r.interview_invite_sent ? '<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Sent — awaiting</span>' : '—' },
          { label:'Talent Pool', render: r => (r.talent_pool==='true'||r.talent_pool===true)
              ? '<span class="badge" style="background:#ede9fe;color:#7c3aed">★ Pool</span>' : '—' },

        ],
        fields:[
          { key:'applicant_id',            label:'Applicant',        required:true, type:'select', options: applOpts },
          { key:'vacancy_id',              label:'Vacancy',          required:true, type:'select', options: allVacOpts },
          { key:'advert_id', label:'Applied Via — Channel', type:'select',
            reactsTo:'vacancy_id',
            hint:'Only shows channels where an advert was actually placed for this vacancy',
            options: () => {
              const vacId = S.modal?.form?.vacancy_id;
              if (!vacId) return [{value:'',label:'Select a vacancy first…'}];
              const ads = (S.cache.job_adverts||[]).filter(a => a.vacancy_id === vacId);
              if (!ads.length) return [{value:'',label:'No adverts placed for this vacancy yet'}];
              const opts = [{value:'',label:'Direct / Unknown'}];
              ads.forEach(a => opts.push({
                value: a.id,
                label: a.platform_name ? `${a.platform} — ${a.platform_name}` : a.platform
              }));
              return opts;
            }},
          { key:'application_date',        label:'Application Date', type:'date' },
          // Status — options are strictly filtered by STATUS_TRANSITIONS from current saved status.
          // For new applications (no current status) only 'New' and 'Under Review' are permitted.
          { key:'status', label:'Status', type:'select',
            options: () => {
              const curr = S.modal?.editId ? (S.modal?.form?._dbStatus || S.modal?.form?.status) : null;
              if (!curr) return ['New', 'Under Review'];
              return (STATUS_TRANSITIONS[curr] || [curr]);
            }},
          { key:'interview_invite_sent',   label:'Interview Invite Sent', type:'date',
            visibleIf:{ field:'status', values:['Shortlisted','Interview','Further Interview'] }},
          { key:'interview_response',      label:'Interview Invite Response', type:'select',
            options:['Accepted','Declined','No Response'],
            visibleIf:{ field:'status', values:['Shortlisted','Interview','Further Interview'] }},

          // Talent Pool — shown for terminal negative outcomes or declined interview invite
          { key:'talent_pool', label:'Add to Talent Pool?', type:'select',
            options:[{value:'true',label:'Yes — keep on file for future roles'},{value:'false',label:'No'}],
            visibleIf:{ field:'status', values:['Not Successful','Withdrawn — Applicant','Withdrawn — Employer','Rejected'] },
            hint:'Marks this applicant as worth considering for future roles' },
          { key:'talent_pool_notes', label:'Talent Pool Notes', type:'textarea',
            visibleIf:{ field:'status', values:['Not Successful','Withdrawn — Applicant','Withdrawn — Employer','Rejected'] }},
          { key:'notes', label:'Notes', type:'textarea' },
        ],
      }, records };
    }

    // ── INTERVIEWS ─────────────────────────────────────────────────────
    if (S.recruitTab === 'interviews') {
      const records = S.cache.interview_stages||[];
      return { config:{
        table:'interview_stages', title:'Interview Stages',
        subtitle:'Each application can have multiple interview stages with different formats and interviewers',
        addLabel:'Add Interview Stage', wide:true, _custom:'interview',
        columns:[
          { label:'Applicant',   render: r => { const a=(S.cache.applications||[]).find(ap=>ap.id===r.application_id); return a ? applLabel(a.applicant_id) : '—'; }},
          { label:'Stage',       render: r => r.stage_number ? `<span class="badge" style="background:var(--bg);color:var(--text)">Stage ${r.stage_number}</span>` : '—' },
          { label:'Date',        render: r => r.stage_date ? `${dateCell(r.stage_date)}${r.stage_time?' <span style="font-size:11px;color:var(--muted)">'+x(r.stage_time)+'</span>':''}` : '—' },
          { label:'Method',      render: r => r.method ? `<span class="badge" style="background:var(--accent-light);color:#3b82f6;border:1px solid #bfdbfe">${x(r.method)}</span>` : '—' },
          { label:'Type(s)',     render: r => r.stage_types ? `<span style="font-size:12px;color:var(--muted)">${x(r.stage_types)}</span>` : '—' },
          { label:'Interviewer(s)',key:'interviewers', render: r => r.interviewers ? `<span style="font-size:12px">${x(r.interviewers)}</span>` : '—' },
          { label:'Outcome',     render: r => r.outcome ? statusBadge(r.outcome, INT_SC) : '<span style="color:var(--border)">Pending</span>' },
        ],
        fields:[
          { key:'application_id',     label:'Application',   required:true, type:'select', options: appOpts },
          { key:'stage_number',       label:'Stage Number',  type:'number', hint:'1 = first interview, 2 = second, etc.' },
          { key:'stage_date',         label:'Date',          type:'date' },
          { key:'stage_time',         label:'Time',          hint:'e.g. 14:00' },
          { key:'method',             label:'Interview Method', type:'select',
            options:['In Person','Microsoft Teams','Zoom','Google Meet','Phone','Video Call'] },
          { key:'outcome',            label:'Outcome', type:'select',
            options:['Pending','Make Offer','Not Successful','Further Interview Needed','Suggest Role Creation to Management','Suggest for Other Vacancy'] },
          { key:'suggested_vacancy_id', label:'Suggest for Vacancy', type:'select', options: allVacOpts,
            visibleIf:{ field:'outcome', value:'Suggest for Other Vacancy' },
            hint:'Select the other vacancy to auto-allocate this applicant as a candidate' },
          { key:'notes',              label:'Notes / Feedback', type:'textarea', wide:true },
        ],
      }, records };
    }

    // ── OFFERS ─────────────────────────────────────────────────────────
    const records = S.cache.offers||[];
    return { config:{
      table:'offers', title:'Offers',
      subtitle:'Formal offers made — track acceptance, variations and escalations',
      addLabel:'Make Offer', wide:true,
      columns:[
        { label:'Applicant',   render: r => { const a=(S.cache.applications||[]).find(ap=>ap.id===r.application_id); return a ? applLabel(a.applicant_id) : '—'; }},
        { label:'Vacancy',     render: r => { const a=(S.cache.applications||[]).find(ap=>ap.id===r.application_id); return a ? vacTitle(a.vacancy_id) : '—'; }},
        { label:'Salary',      render: r => r.salary_offered ? `<span style="font-weight:700">£${Number(r.salary_offered).toLocaleString('en-GB')}</span>` : '—' },
        { label:'Start Date',  render: r => dateCell(r.start_date) },
        { label:'Status',      render: r => statusBadge(r.status||'Pending', OFFER_SC) },
        { label:'Variation',   render: r => r.variation_requested
            ? `<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Variation: ${x(r.variation_requested.slice(0,30))}${r.variation_requested.length>30?'…':''}</span>` : '—' },
        { label:'Escalated',   render: r => (r.escalated==='true'||r.escalated===true)
            ? '<span class="badge" style="background:var(--err-bg);color:#dc2626">Escalated</span>' : '—' },
      ],
      fields:[
        { key:'application_id',     label:'Application',     required:true, type:'select', options: appOpts },
        { key:'offered_by',         label:'Offer Made By',   type:'select', options: personOpts,
          hint:'HR person or hiring manager who made the offer' },
        { key:'offer_date',         label:'Offer Date',      type:'date' },
        { key:'salary_offered',     label:'Salary Offered (£)', type:'number' },
        { key:'start_date',         label:'Proposed Start Date', type:'date' },
        { key:'probation_months',   label:'Probation Period (months)', type:'number' },
        { key:'notice_weeks',       label:'Notice Period (weeks)',     type:'number' },
        { key:'other_terms',        label:'Other Terms / Benefits', type:'textarea' },
        { key:'status',             label:'Offer Response',  type:'select',
          options:['Pending','Accepted','Accepted in Principle','Declined','Withdrawn'] },
        { key:'response_date',      label:'Response Date',   type:'date' },
        { key:'variation_requested',label:'Variation Requested', type:'textarea',
          visibleIf:{ field:'status', value:'Accepted in Principle' },
          hint:'What change is the candidate asking for? e.g. higher salary, earlier start date' },
        { key:'escalated',          label:'Escalate to Management?', type:'select',
          visibleIf:{ field:'status', value:'Accepted in Principle' },
          options:[{value:'true',label:'Yes — needs management sign-off'},{value:'false',label:'No'}] },
        { key:'variation_outcome',  label:'Variation Outcome', type:'textarea',
          visibleIf:{ field:'status', value:'Accepted in Principle' },
          hint:'How was the variation resolved?' },
        { key:'notes',              label:'Notes', type:'textarea' },
      ],
    }, records };
  };

  const { config, records } = getConfig();

  pc.innerHTML = `
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Recruitment</h1>
      <p style="color:var(--muted);font-size:14px">Vacancies · adverts · applicants · interviews · offers</p>
    </div>
    ${subTabBar(RECRUIT_TABS, S.recruitTab, 'recruitTab')}
    ${renderCRUD(config, records)}`;
  icons();
  bindSubTabs(() => { S.crudSearch=''; loadRecruitTab(); });

  // Wire applicant attachment buttons
  hrAll('[data-action="attachments"]').forEach(btn => {
    const row = byId(records, btn.dataset.actionId);
    if (row) btn.addEventListener('click', () => openAttachmentsModal(row, loadRecruitTab));
  });

  if (config._custom === 'interview') {
    document.getElementById('crud-search')?.addEventListener('input', e => { S.crudSearch=e.target.value; loadRecruitTab(); });
    document.getElementById('crud-add')?.addEventListener('click', () => openInterviewModal(null, loadRecruitTab));
    hrAll('[data-edit]').forEach(btn => {
      const row = records.find(r=>r.id===btn.dataset.edit);
      btn.addEventListener('click', () => openInterviewModal(row, loadRecruitTab));
    });
    hrAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this interview stage?')) return;
        await api.del('interview_stages', btn.dataset.del);
        clearCache('interview_stages'); await loadRecruitTab();
      });
    });
  } else if (config._custom === 'advert') {
    // Adverts use a custom modal that creates one row per selected outlet
    document.getElementById('crud-search')?.addEventListener('input', e => { S.crudSearch=e.target.value; loadRecruitTab(); });
    document.getElementById('crud-add')?.addEventListener('click', () => openAdvertModal(null, loadRecruitTab));
    hrAll('[data-edit]').forEach(btn => {
      const row = records.find(r=>r.id===btn.dataset.edit);
      btn.addEventListener('click', () => openAdvertModal(row, loadRecruitTab));
    });
    hrAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this advert placement?')) return;
        await api.del('job_adverts', btn.dataset.del);
        clearCache('job_adverts'); await loadRecruitTab();
      });
    });
    // "Add Applicant" shortcut — pre-wires vacancy + channel from the advert row
    hrAll('[data-action="add-applicant"]').forEach(btn => {
      const advert = byId(records, btn.dataset.actionId);
      if (advert) btn.addEventListener('click', () => openApplicantFromAdvertModal(advert, loadRecruitTab));
    });
  } else {
    bindCRUD(config, records, loadRecruitTab);
  }
}



// ── Custom Advert Modal ───────────────────────────────────────────────
// Creates ONE job_adverts row per selected outlet (Job Site / Magazine /
// Recruitment Agency) so each channel can be tracked independently.
// Simple platforms (LinkedIn, Internal, etc.) create a single row.

const MULTI_PLATFORMS = ['Job Site', 'Sector Magazine', 'Recruitment Agency'];

function openAdvertModal(row, onReload) {
  S.modal = {
    type: 'advert', saving: false, onReload,
    form: row ? {...row} : { status:'Draft' },
    editId: row?.id || null,
    selectedOutlets: [],  // persists checked state across redraws
  };
  drawAdvertModal();
}

function drawAdvertModal() {
  const m = S.modal; if (!m || m.type !== 'advert') return;
  const f = k => m.form[k] || '';
  const isMulti = MULTI_PLATFORMS.includes(f('platform'));
  const isEdit  = !!m.editId;

  // Build the outlet checkbox panel
  const outletPanel = () => {
    if (!isMulti) return '';
    if (isEdit) return `
      <div style="background:#fef9c3;border:1px solid #fef08a;border-radius:8px;padding:12px 14px;font-size:13px;color:#854d0e;margin-bottom:0">
        ${ic('info',13)} Editing a single placement. To add more outlets, create additional advert records.
      </div>`;

    let items = [];
    if (f('platform') === 'Job Site') {
      items = (S.cache.job_sites||[]).map(s => ({id: s.id, label: s.name}));
    } else if (f('platform') === 'Sector Magazine') {
      items = (S.cache.sector_magazines||[]).map(s => ({id: s.id, label: s.name + (s.sector?' ('+s.sector+')':'')}));
    } else if (f('platform') === 'Recruitment Agency') {
      items = (S.cache.recruitment_agencies||[]).map(s => ({id: s.id, label: s.name}));
    }

    if (!items.length) return `
      <div style="background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:8px;padding:12px 14px;font-size:13px;color:var(--warn-text)">
        ${ic('alert-triangle',13)} No ${f('platform')} options found. Add them in the <b>Admin</b> page first.
      </div>`;

    return `
      <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="background:var(--bg);padding:10px 14px;border-bottom:1px solid var(--border);font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">
          ${ic('check-square',13)} Select ${x(f('platform'))} outlets <span style="color:#f87171">*</span>
          <span style="font-weight:400;color:var(--muted);margin-left:6px">Creates one advert record per outlet selected</span>
        </div>
        <div style="max-height:220px;overflow-y:auto;padding:8px 4px">
          ${items.map(it => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-radius:6px;transition:background 0.1s"
                   onmouseenter="this.style.background='var(--bg)'" onmouseleave="this.style.background=''">
              <input type="checkbox" data-outlet-id="${x(it.id)}" data-outlet-name="${x(it.label)}"
                     style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer"
                     ${(m.selectedOutlets||[]).some(o=>o.id===it.id)?'checked':''}>
              <span style="font-size:13px;color:var(--text)">${x(it.label)}</span>
            </label>`).join('')}
        </div>
      </div>`;
  };

  const allVacOpts = mkOpts(S.cache.vacancies||[],'id','title');

  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal modal-md" style="max-width:680px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:22px 28px 18px;border-bottom:1px solid var(--bg);flex-shrink:0">
          <div>
            <h3 class="font-display" style="font-size:17px;font-weight:800;color:var(--text)">
              ${isEdit ? 'Edit Advert Placement' : 'Place New Advert'}
            </h3>
            <p style="font-size:12px;color:var(--muted);margin-top:2px">
              ${isEdit ? 'Edit this single placement record' : 'Select one platform — multiple outlets create separate trackable records'}
            </p>
          </div>
          <button id="mc" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;display:flex">${ic('x',16)}</button>
        </div>

        <div id="hr-modal-body" style="overflow-y:auto;padding:22px 28px;flex:1;display:flex;flex-direction:column;gap:16px">

          <div class="two-col">
            ${field({key:'vacancy_id',  label:'Vacancy',   required:true, type:'select', options: allVacOpts}, f('vacancy_id'))}
            ${field({key:'platform',    label:'Platform',  required:true, type:'select',
                     options:['Internal','Company Website','LinkedIn','Job Site','Sector Magazine','Recruitment Agency','Other']}, f('platform'))}
          </div>

          <div id="advert-outlet-panel">${outletPanel()}</div>

          ${!isMulti || isEdit ? field({key:'platform_name', label:'Platform / Outlet Name',
              hint: isMulti ? 'Outlet name (set automatically for new multi-site adverts)' : 'e.g. Nursing Times, name of the specific site'}, f('platform_name')) : ''}

          <div class="two-col">
            ${field({key:'status', label:'Status', type:'select', options:['Draft','Live','Closed']}, f('status'))}
            ${field({key:'cost',   label:'Advert Cost (£)', type:'number', hint:'Cost per outlet (duplicated across all selected outlets)'}, f('cost'))}
          </div>
          <div class="two-col">
            ${field({key:'posted_date',  label:'Posted Date',  type:'date'}, f('posted_date'))}
            ${field({key:'closing_date', label:'Closing Date', type:'date'}, f('closing_date'))}
          </div>
          ${field({key:'title',        label:'Advert Title',   hint:'Leave blank to use the vacancy title'}, f('title'))}
          ${field({key:'salary_shown', label:'Salary (as advertised)', hint:'e.g. £35,000–£42,000 or "Competitive"'}, f('salary_shown'))}
          ${field({key:'url',          label:'Advert URL',     hint:'Link to the live advert (use same URL for all outlets if needed)'}, f('url'))}
          ${field({key:'advert_text',  label:'Advert Text', type:'textarea'}, f('advert_text'))}
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 28px;border-top:1px solid var(--bg);background:var(--bg);border-radius:0 0 20px 20px;flex-shrink:0">
          <button class="btn btn-secondary" id="m-cancel">Cancel</button>
          <button class="btn btn-primary" id="m-save" ${m.saving?'disabled':''}>
            ${ic('save',14)} ${m.saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Place advert')}
          </button>
        </div>
      </div>
    </div>`;
  icons();

  // Platform change → rebuild outlet panel + platform_name field.
  // Collect ALL current field values first so nothing already filled in is lost on redraw.
  const platformEl = document.querySelector('[data-field="platform"]');
  platformEl?.addEventListener('change', () => {
    hrAll('#hr-modal-body [data-field]').forEach(el => {
      m.form[el.dataset.field] = el.value || null;
    });
    m.form.platform = platformEl.value; // new value always wins
    drawAdvertModal();
  });


  $('mc').addEventListener('click', closeModal);
  $('m-cancel').addEventListener('click', closeModal);
  $('mo').addEventListener('click', e => { if(e.target===$('mo')) closeModal(); });

  $('m-save').addEventListener('click', async () => {
    // Collect common fields
    const getVal = key => document.querySelector(`[data-field="${key}"]`)?.value || null;
    const vacancyId  = getVal('vacancy_id');
    const platform   = getVal('platform');
    const status     = getVal('status') || 'Draft';
    const cost       = getVal('cost');
    const postedDate = getVal('posted_date');
    const closingDate= getVal('closing_date');
    const title      = getVal('title');
    const salarySh   = getVal('salary_shown');
    const url        = getVal('url');
    const advertText = getVal('advert_text');
    const platName   = getVal('platform_name');

    if (!vacancyId || !platform) {
      showToast('Please select a Vacancy and Platform', 'warn'); return;
    }

    const common = { vacancy_id:vacancyId, platform, status, cost:cost||null,
                     posted_date:postedDate||null, closing_date:closingDate||null,
                     title:title||null, salary_shown:salarySh||null,
                     url:url||null, advert_text:advertText||null };

    // ── Capture outlet selections BEFORE any redraw wipes the DOM ────
    const outletData = [...hrAll('[data-outlet-id]:checked')]
      .map(cb => ({ id: cb.dataset.outletId, name: cb.dataset.outletName }));

    // Persist so checkboxes re-tick if save fails and modal stays open
    m.selectedOutlets = outletData;

    // Validate multi-platform selection before touching the DOM
    if (!isEdit && MULTI_PLATFORMS.includes(platform) && !outletData.length) {
      showToast(`Please tick at least one ${platform} before placing the advert`, 'warn');
      return;
    }

    m.saving = true; drawAdvertModal();
    try {
      if (isEdit) {
        // Update single row, keep platform_name from form
        await api.update('job_adverts', m.editId, {...common, platform_name: platName||null});
      } else if (MULTI_PLATFORMS.includes(platform)) {
        // One row per selected outlet — data already captured above
        await Promise.all(outletData.map(o =>
          api.insert('job_adverts', {...common, platform_name: o.name})
        ));
      } else {
        // Simple platform — one row, no outlet checkbox
        await api.insert('job_adverts', {...common, platform_name: platName||null});
      }
      clearCache('job_adverts');
      closeModal();
      showToast(isEdit ? 'Advert updated' : 'Advert(s) placed', 'success');
      await m.onReload();
    } catch { m.saving = false; drawAdvertModal(); }
  });
}


// ── Record Applicant from Advert shortcut modal ───────────────────────
// Creates an applicant + application in one step, with vacancy and
// channel pre-wired from the advert the user clicked on.
function openApplicantFromAdvertModal(advert, onReload) {
  const vacName    = resolve('vacancies', advert.vacancy_id, 'title');
  const channelStr = advert.platform_name
    ? `${advert.platform} — ${advert.platform_name}`
    : advert.platform || 'Unknown';

  S.modal = {
    type: 'appl-from-advert', saving: false, onReload,
    advert, vacName, channelStr,
    form: { status:'New', application_date: new Date().toISOString().slice(0,10), gdpr_consent:'false' },
  };
  drawApplicantFromAdvertModal();
}

function drawApplicantFromAdvertModal() {
  const m = S.modal;
  if (!m || m.type !== 'appl-from-advert') return;
  const { advert, vacName, channelStr } = m;
  const fv = k => m.form[k] || '';

  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal modal-md" style="max-width:660px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:22px 28px 18px;border-bottom:1px solid var(--bg);flex-shrink:0">
          <div>
            <h3 class="font-display" style="font-size:17px;font-weight:800;color:var(--text)">Record Applicant</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
              <span style="font-size:12px;background:var(--accent-light);color:#3b82f6;border:1px solid #bfdbfe;border-radius:6px;padding:2px 8px">
                ${ic('clipboard-list',11)} ${x(vacName)}
              </span>
              <span style="font-size:12px;background:#f0fdf4;color:#16a34a;border:1px solid var(--ok-border);border-radius:6px;padding:2px 8px">
                ${ic('megaphone',11)} Via: ${x(channelStr)}
              </span>
            </div>
          </div>
          <button id="mc" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;display:flex;flex-shrink:0">${ic('x',16)}</button>
        </div>

        <div id="hr-modal-body" style="overflow-y:auto;padding:22px 28px;flex:1;display:flex;flex-direction:column;gap:0">

          <!-- Applicant details -->
          <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">${ic('user',11)} Applicant Details</p>
          <div class="two-col">
            ${field({key:'first_name', label:'First Name', required:true}, fv('first_name'))}
            ${field({key:'last_name',  label:'Last Name',  required:true}, fv('last_name'))}
            ${field({key:'email', label:'Email', type:'email'}, fv('email'))}
            ${field({key:'phone', label:'Phone', type:'tel'},  fv('phone'))}
          </div>
          ${field({key:'cv_reference',  label:'CV Reference / File', hint:'Filename or link to stored CV'}, fv('cv_reference'))}
          ${field({key:'linkedin_url',  label:'LinkedIn URL'}, fv('linkedin_url'))}
          ${field({key:'gdpr_consent',  label:'GDPR Consent Given?', type:'select',
            options:[{value:'false',label:'No / Pending'},{value:'true',label:'Yes'}]}, fv('gdpr_consent'))}

          <div style="height:1px;background:var(--bg);margin:16px 0"></div>

          <!-- Application details -->
          <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">${ic('file-text',11)} Application Details</p>
          <div class="two-col">
            ${field({key:'application_date', label:'Application Date', required:true, type:'date'}, fv('application_date'))}
            ${field({key:'status', label:'Initial Status', type:'select',
              options:['New','Under Review','Shortlisted']}, fv('status'))}
          </div>
          ${field({key:'notes', label:'Notes', type:'textarea', hint:'Any initial observations about this applicant'}, fv('notes'))}
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 28px;border-top:1px solid var(--bg);background:var(--bg);border-radius:0 0 20px 20px;flex-shrink:0">
          <button class="btn btn-secondary" id="m-cancel">Cancel</button>
          <button class="btn btn-primary" id="m-save" ${m.saving?'disabled':''}>
            ${ic('user-plus',14)} ${m.saving ? 'Saving…' : 'Record Applicant'}
          </button>
        </div>
      </div>
    </div>`;
  icons();

  $('mc').addEventListener('click', closeModal);
  $('m-cancel').addEventListener('click', closeModal);
  $('mo').addEventListener('click', e => { if(e.target===$('mo')) closeModal(); });

  $('m-save').addEventListener('click', async () => {
    // Collect all form fields
    hrAll('#hr-modal-body [data-field]').forEach(el => {
      m.form[el.dataset.field] = el.value || null;
    });

    // Validate
    if (!m.form.first_name || !m.form.last_name) {
      showToast('First Name and Last Name are required', 'warn'); return;
    }
    if (!m.form.application_date) {
      showToast('Please enter an Application Date', 'warn'); return;
    }

    m.saving = true; drawApplicantFromAdvertModal();
    try {
      // Step 1: create the applicant
      const applResult = await api.insert('applicants', {
        first_name:    m.form.first_name,
        last_name:     m.form.last_name,
        email:         m.form.email     || null,
        phone:         m.form.phone     || null,
        cv_reference:  m.form.cv_reference || null,
        linkedin_url:  m.form.linkedin_url || null,
        gdpr_consent:  m.form.gdpr_consent === 'true',
        gdpr_consent_date: m.form.gdpr_consent === 'true'
          ? new Date().toISOString().slice(0,10) : null,
      });

      const applicantId = Array.isArray(applResult) ? applResult[0]?.id : applResult?.id;
      if (!applicantId) throw new Error('Applicant was not created — check Supabase logs');

      // Step 2: create the application, pre-wired to this advert + vacancy
      await api.insert('applications', {
        applicant_id:     applicantId,
        vacancy_id:       advert.vacancy_id,
        advert_id:        advert.id,
        application_date: m.form.application_date,
        status:           m.form.status || 'New',
        notes:            m.form.notes  || null,
      });

      clearCache('applicants');
      clearCache('applications');
      closeModal();
      showToast(`${m.form.first_name} ${m.form.last_name} recorded — application linked to ${channelStr}`, 'success');
      await onReload();
    } catch(err) {
      m.saving = false;
      drawApplicantFromAdvertModal();
    }
  });
}


// ════════════════════════════════════════════════════════════════════════
//  INTERVIEW STAGE CUSTOM MODAL
//  Interviewers: checkboxes from People
//  Format Types: checkboxes from interview_format_types lookup
//  Send Invites: mailto links to panel + candidate
//  Notes: full width
// ════════════════════════════════════════════════════════════════════════
function openInterviewModal(row, onReload) {
  // Parse saved comma-separated values back to arrays
  const savedInterviewers = row?.interviewers
    ? row.interviewers.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const savedTypes = row?.stage_types
    ? row.stage_types.split(',').map(s=>s.trim()).filter(Boolean) : [];

  S.modal = {
    type: 'interview', saving: false, onReload,
    form: row ? {...row} : { outcome:'Pending', stage_number:1 },
    editId: row?.id || null,
    selectedInterviewers: savedInterviewers,   // array of person IDs
    selectedTypes: savedTypes,                 // array of format type names
  };
  drawInterviewModal();
}

function drawInterviewModal() {
  const m = S.modal; if (!m || m.type !== 'interview') return;
  const f = k => m.form[k] || '';

  const appOpts = mkOpts(S.cache.applications||[], 'id', r => {
    const appl = (S.cache.applicants||[]).find(a=>a.id===r.applicant_id);
    const vac  = (S.cache.vacancies||[]).find(v=>v.id===r.vacancy_id);
    return `${appl?`${appl.first_name||''} ${appl.last_name||''}`.trim():'?'} → ${vac?.title||'?'}`;
  });
  const allVacOpts = mkOpts(S.cache.vacancies||[], 'id', 'title');
  const formatTypes = (S.cache.interview_format_types||[]).map(t=>t.name).sort();
  const showSuggest = f('outcome') === 'Suggest for Other Vacancy';

  // Build interviewer list — all active people
  const panelPeople = (S.cache.people||[])
    .filter(p => p.status !== 'Leaver')
    .sort((a,b)=>(`${a.last_name||''} ${a.first_name||''}`).localeCompare(`${b.last_name||''} ${b.first_name||''}`));

  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal" style="max-width:680px;width:95vw">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:22px 28px 18px;border-bottom:1px solid var(--bg);flex-shrink:0">
          <div>
            <h3 class="font-display" style="font-size:17px;font-weight:800;color:var(--text)">
              ${m.editId ? 'Edit Interview Stage' : 'Add Interview Stage'}
            </h3>
            <p style="font-size:12px;color:var(--muted);margin-top:2px">Set up the panel, format and send calendar invites</p>
          </div>
          <button id="mc" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;display:flex;flex-shrink:0">${ic('x',16)}</button>
        </div>

        <div style="overflow-y:auto;padding:22px 28px;flex:1;display:flex;flex-direction:column;gap:16px">

          <!-- Core details -->
          <div class="two-col">
            ${field({key:'application_id', label:'Application', required:true, type:'select', options:appOpts}, f('application_id'))}
            ${field({key:'stage_number',   label:'Stage Number', type:'number', hint:'1 = first, 2 = second…'}, f('stage_number'))}
            ${field({key:'stage_date',     label:'Date',         type:'date'}, f('stage_date'))}
            ${field({key:'stage_time',     label:'Time',         hint:'e.g. 14:00'}, f('stage_time'))}
            ${field({key:'method',         label:'Interview Method', type:'select',
              options:['In Person','Microsoft Teams','Zoom','Google Meet','Phone','Video Call']}, f('method'))}
            ${field({key:'outcome',        label:'Outcome', type:'select',
              options:['Pending','Make Offer','Not Successful','Further Interview Needed','Suggest Role Creation to Management','Suggest for Other Vacancy']}, f('outcome'))}
          </div>

          ${showSuggest ? `
          <div>
            ${field({key:'suggested_vacancy_id', label:'Suggest for Vacancy', type:'select', options:allVacOpts,
              hint:'Applicant will be allocated as a candidate for this vacancy'}, f('suggested_vacancy_id'))}
          </div>` : ''}

          <!-- Format types (checkboxes from lookup) -->
          <div>
            <label class="field-label">Format / Type(s)</label>
            <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <div style="background:var(--bg);padding:8px 14px;border-bottom:1px solid var(--bg);display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">
                  ${ic('clipboard-list',11)} Select all that apply
                </span>
                ${m.selectedTypes.length ? `<span class="badge" style="background:var(--accent);color:#fff">${m.selectedTypes.length} selected</span>` : ''}
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:4px">
                ${formatTypes.length ? formatTypes.map(t => `
                  <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-radius:6px;transition:background 0.1s"
                         onmouseenter="this.style.background='var(--bg)'" onmouseleave="this.style.background=''">
                    <input type="checkbox" class="int-type-cb" data-type="${x(t)}"
                      ${m.selectedTypes.includes(t) ? 'checked' : ''}
                      style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0;cursor:pointer">
                    <span style="font-size:12px;color:var(--text)">${x(t)}</span>
                  </label>`).join('')
                : `<p style="padding:12px;color:var(--muted);font-size:13px;grid-column:1/-1">No format types configured. Add them in Admin → Interview Format Types.</p>`}
              </div>
            </div>
          </div>

          <!-- Interview panel (checkboxes from People) -->
          <div>
            <label class="field-label">Interview Panel</label>
            <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <div style="background:var(--bg);padding:8px 14px;border-bottom:1px solid var(--bg);display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">
                  ${ic('users',11)} Select panel members
                </span>
                ${m.selectedInterviewers.length ? `<span class="badge" style="background:#10b981;color:#fff">${m.selectedInterviewers.length} on panel</span>` : ''}
              </div>
              <div style="max-height:200px;overflow-y:auto;padding:4px">
                ${panelPeople.length ? panelPeople.map(p => {
                  const name = `${p.first_name||''} ${p.last_name||''}`.trim();
                  const isChecked = m.selectedInterviewers.includes(p.id);
                  // Exclude the applicant's own person record if linked
                  const appRow = (S.cache.applications||[]).find(a=>a.id===f('application_id'));
                  const applRow = appRow ? (S.cache.applicants||[]).find(a=>a.id===appRow.applicant_id) : null;
                  return `
                  <label style="display:flex;align-items:center;gap:10px;padding:7px 12px;cursor:pointer;border-radius:6px;transition:background 0.1s"
                         onmouseenter="this.style.background='var(--bg)'" onmouseleave="this.style.background=''">
                    <input type="checkbox" class="int-panel-cb" data-pid="${x(p.id)}"
                      data-name="${x(name)}" data-email="${x(p.email||p.personal_email||'')}"
                      ${isChecked ? 'checked' : ''}
                      style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0;cursor:pointer">
                    <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#7c3aed);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0">
                      ${(p.first_name||'?')[0]}${(p.last_name||'?')[0]}
                    </div>
                    <div>
                      <p style="font-size:12px;font-weight:500;color:var(--text);margin:0">${x(name)}</p>
                      ${p.email ? `<p style="font-size:10px;color:var(--muted);margin:0">${x(p.email)}</p>` : ''}
                    </div>
                  </label>`;
                }).join('')
                : `<p style="padding:12px;color:var(--muted);font-size:13px">No people found. Add employees in the People module.</p>`}
              </div>
            </div>
          </div>

          <!-- Notes (full width) -->
          <div style="width:100%">
            ${field({key:'notes', label:'Notes / Feedback', type:'textarea'}, f('notes'))}
          </div>

        </div>

        <!-- Footer -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 28px;border-top:1px solid var(--bg);background:var(--bg);border-radius:0 0 20px 20px;flex-shrink:0;flex-wrap:wrap">
          <button id="int-send-invites" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px"
            title="Opens your email client with a pre-filled meeting invite to the panel and candidate">
            ${ic('mail',14)} Send Invites
          </button>
          <div style="display:flex;gap:10px">
            <button class="btn btn-secondary" id="m-cancel">Cancel</button>
            <button class="btn btn-primary" id="m-save" ${m.saving?'disabled':''}>
              ${ic('save',14)} ${m.saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>`;
  icons();

  // ── Outcome → show/hide suggested vacancy ─────────────────────────
  document.querySelector('[data-field="outcome"]')?.addEventListener('change', () => {
    hrAll('[data-field]').forEach(el => { m.form[el.dataset.field] = el.value || null; });
    drawInterviewModal();
  });

  // ── Format type checkboxes → sync to m.selectedTypes ─────────────
  hrAll('.int-type-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) { if (!m.selectedTypes.includes(cb.dataset.type)) m.selectedTypes.push(cb.dataset.type); }
      else { m.selectedTypes = m.selectedTypes.filter(t => t !== cb.dataset.type); }
    });
  });

  // ── Panel checkboxes → sync to m.selectedInterviewers ────────────
  hrAll('.int-panel-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) { if (!m.selectedInterviewers.includes(cb.dataset.pid)) m.selectedInterviewers.push(cb.dataset.pid); }
      else { m.selectedInterviewers = m.selectedInterviewers.filter(id => id !== cb.dataset.pid); }
    });
  });

  // ── Send Invites ──────────────────────────────────────────────────
  document.getElementById('int-send-invites')?.addEventListener('click', () => {
    // Collect latest form state
    hrAll('#hr-modal-body [data-field]').forEach(el => { m.form[el.dataset.field] = el.value || null; });

    const dateStr  = m.form.stage_date || '';
    const timeStr  = m.form.stage_time || '';
    const method   = m.form.method     || 'Interview';
    const types    = m.selectedTypes.join(', ') || 'Interview';

    // Get panel emails
    const panelEmails = [...hrAll('.int-panel-cb:checked')]
      .map(cb => cb.dataset.email).filter(Boolean);

    // Get candidate email from the application → applicant chain
    const appRow  = (S.cache.applications||[]).find(a=>a.id===m.form.application_id);
    const applRow = appRow ? (S.cache.applicants||[]).find(a=>a.id===appRow.applicant_id) : null;
    const candEmail = applRow?.email || '';
    const candName  = applRow ? `${applRow.first_name||''} ${applRow.last_name||''}`.trim() : 'Candidate';

    const vacRow   = appRow ? (S.cache.vacancies||[]).find(v=>v.id===appRow.vacancy_id) : null;
    const vacTitle = vacRow?.title || 'Vacancy';

    const allEmails = [...new Set([...panelEmails, candEmail].filter(Boolean))];

    if (!allEmails.length) {
      showToast('No email addresses found. Ensure panel members and the applicant have email addresses recorded.', 'warn');
      return;
    }

    const subject  = encodeURIComponent(`Interview Invitation — ${vacTitle} (Stage ${m.form.stage_number||1})`);
    const panelNames = [...hrAll('.int-panel-cb:checked')].map(cb => cb.dataset.name).join(', ');
    const body = encodeURIComponent(
`Dear ${candName},

You are invited to attend an interview for the position of ${vacTitle}.

Date:         ${dateStr || 'TBC'}
Time:         ${timeStr || 'TBC'}
Method:       ${method}
Format:       ${types}
${panelNames ? `Interview Panel: ${panelNames}` : ''}

Please confirm your attendance by replying to this email.

Kind regards,
HR Team`
    );

    // Open email client
    window.open(`mailto:${allEmails.join(';')}?subject=${subject}&body=${body}`, '_blank');
    showToast(`Invite opened for ${allEmails.length} recipient${allEmails.length!==1?'s':''}`, 'success');
  });

  // ── Close ─────────────────────────────────────────────────────────
  $('mc').addEventListener('click', closeModal);
  $('m-cancel').addEventListener('click', closeModal);
  $('mo').addEventListener('click', e => { if(e.target===$('mo')) closeModal(); });

  // ── Save ─────────────────────────────────────────────────────────
  $('m-save').addEventListener('click', async () => {
    // Collect all standard fields
    hrAll('#hr-modal-body [data-field]').forEach(el => {
      m.form[el.dataset.field] = el.value || null;
    });

    // Merge checkboxes into text fields for storage
    m.form.stage_types  = m.selectedTypes.join(', ') || null;
    m.form.interviewers = m.selectedInterviewers
      .map(id => { const p=(S.cache.people||[]).find(q=>q.id===id); return p?`${p.first_name||''} ${p.last_name||''}`.trim():id; })
      .join(', ') || null;

    if (!m.form.application_id) { showToast('Please select an Application', 'warn'); return; }

    m.saving = true; drawInterviewModal();
    try {
      if (m.editId) await api.update('interview_stages', m.editId, m.form);
      else          await api.insert('interview_stages', m.form);
      clearCache('interview_stages');
      closeModal();
      showToast('Interview stage saved', 'success');
      await m.onReload();
    } catch { m.saving = false; drawInterviewModal(); }
  });
}

// ════════════════════════════════════════════════════════════════════════
//  21. INTERACTIONS
//  Tables: interactions, sickness_records, disciplinaries, grievances
// ════════════════════════════════════════════════════════════════════════
const INTERACT_TABS = [
  { id:'all',          label:'All Interactions', icon:'list'             },
  { id:'sickness',     label:'Sickness',          icon:'thermometer'      },
  { id:'disciplinary', label:'Disciplinaries',    icon:'alert-triangle'   },
  { id:'grievances',   label:'Grievances',         icon:'flag'             },
];

async function pageInteractions() {
  await Promise.all([
    cached('people',             'people',             'id,first_name,last_name,employee_number'),
    cached('interaction_types',  'interaction_types',  'id,name'),
    cached('sickness_categories','sickness_categories','id,name'),
    cached('interactions',       'interactions',       '*'),
  ]);
  S.crudSearch = '';
  await loadInteractTab();
}

async function loadInteractTab() {
  const t = { all:'interactions', sickness:'sickness_records', disciplinary:'disciplinaries', grievances:'grievances' }[S.interactTab];
  clearCache(t); await cached(t, t);
  renderInteractions();
}

function renderInteractions() {
  const pc = $('hr-page-content'); if (!pc) return;
  const typeName = id => resolve('interaction_types', id, 'name');
  const interLabel = id => {
    const i=(S.cache.interactions||[]).find(r=>r.id===id);
    return i ? `${personName(i.person_id)} — ${typeName(i.interaction_type_id)} (${i.interaction_date||'no date'})` : (id?.slice(0,8)||'—');
  };

  const DISC_SC = { Informal:'var(--muted)', Formal:'#f59e0b', 'First Written Warning':'#f97316', 'Final Written Warning':'#ef4444', Dismissal:'#7c3aed' };
  const GRIEV_SC = { Pay:'#3b82f6', 'Working Conditions':'#f97316', Discrimination:'#ef4444', Management:'#8b5cf6', 'Bullying & Harassment':'#ec4899', Other:'var(--muted)' };

  const getConfig = () => {
    if (S.interactTab === 'all') {
      const records = S.cache.interactions||[];
      return { config:{
        table:'interactions', title:'All Interactions', subtitle:'Every recorded staff interaction in date order',
        addLabel:'Log Interaction', wide:true,
        columns:[
          { label:'Employee',    render: r => personName(r.person_id) },
          { label:'Type',        render: r => {
            const n = typeName(r.interaction_type_id);
            const colours = { Sickness:'#ef4444', Disciplinary:'#f97316', Grievance:'#8b5cf6', '1:1':'#3b82f6', Welfare:'#10b981' };
            const c = Object.keys(colours).find(k => n.toLowerCase().includes(k.toLowerCase()));
            return `<span class="badge" style="background:${(colours[c]||'var(--muted)')}18;color:${(colours[c]||'var(--muted)')};border:1px solid ${(colours[c]||'var(--muted)')}28">${n}</span>`;
          }},
          { label:'Date',        render: r => dateCell(r.interaction_date) },
          { label:'Conducted By', render: r => r.conducted_by ? personName(r.conducted_by) : '—' },
          { label:'Follow Up',   render: r => r.follow_up_date ? `<span style="font-size:12px;color:#f59e0b;font-weight:600">${x(r.follow_up_date)}</span>` : '—' },
        ],
        fields:[
          { key:'person_id',           label:'Employee',  required:true, type:'select', options: personOpts() },
          { key:'interaction_type_id', label:'Type',       required:true, type:'select', options: mkOpts(S.cache.interaction_types||[],'id','name') },
          { key:'interaction_date',    label:'Date',       required:true, type:'date' },
          // options is a *function* so it re-evaluates each time the modal opens or person_id changes.
          // reactsTo: 'person_id' means the dropdown rebuilds whenever Employee is changed,
          // filtering out whoever is already selected as the subject of the interaction.
          { key:'conducted_by', label:'Conducted By (HR / Manager)', type:'select',
            options: () => personOpts().filter(o => o.value !== (S.modal?.form?.person_id || '')),
            reactsTo: 'person_id',
            hint:'Select the HR person or line manager who conducted this interaction' },
          { key:'outcome',             label:'Outcome' },
          { key:'follow_up_date',      label:'Follow-up Date', type:'date', hint:'Reminder to review or check in' },
          { key:'notes',               label:'Notes', type:'textarea' },
        ],
      }, records };
    }
    if (S.interactTab === 'sickness') {
      const records = S.cache.sickness_records||[];
      return { config:{
        table:'sickness_records', title:'Sickness Records', subtitle:'Absence detail linked to sickness notification interactions',
        addLabel:'Add Sickness Record', wide:true,
        columns:[
          { label:'Interaction',  render: r => `<span style="font-size:12px">${interLabel(r.interaction_id)}</span>` },
          { label:'Category',     render: r => resolve('sickness_categories', r.sickness_category_id, 'name') },
          { label:'Return Date',  render: r => r.return_to_work_date ? dateCell(r.return_to_work_date) : '<span style="color:#f59e0b;font-size:12px">Not yet returned</span>' },
          { label:'Fit Note',     render: r => (r.fit_note_received==='true'||r.fit_note_received===true) ? '<span class="badge" style="background:var(--ok-bg);color:#16a34a">Received</span>' : '<span class="badge" style="background:var(--bg);color:var(--muted)">Not received</span>' },
          { label:'Self-cert',    render: r => (r.self_cert==='true'||r.self_cert===true) ? '<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Self-cert</span>' : '—' },
        ],
        fields:[
          { key:'interaction_id',        label:'Interaction', required:true, type:'select', options: mkOpts(S.cache.interactions||[],'id', r=>interLabel(r.id)) },
          { key:'sickness_category_id',  label:'Sickness Category', type:'select', options: mkOpts(S.cache.sickness_categories||[],'id','name') },
          { key:'fit_note_received',     label:'Fit Note Received?', type:'select', options:[{value:'true',label:'Yes'},{value:'false',label:'No'}] },
          { key:'self_cert',             label:'Self-certification?', type:'select', options:[{value:'true',label:'Yes — no GP note required'},{value:'false',label:'No'}] },
          { key:'return_to_work_date',   label:'Return to Work Date', type:'date' },
        ],
      }, records };
    }
    if (S.interactTab === 'disciplinary') {
      const records = S.cache.disciplinaries||[];
      return { config:{
        table:'disciplinaries', title:'Disciplinary Cases', subtitle:'Disciplinary proceedings by stage — linked to interaction records',
        addLabel:'Add Disciplinary', wide:true,
        columns:[
          { label:'Interaction',   render: r => `<span style="font-size:12px">${interLabel(r.interaction_id)}</span>` },
          { label:'Stage',         render: r => statusBadge(r.stage, DISC_SC) },
          { label:'Misconduct',    render: r => r.alleged_misconduct ? `<span style="font-size:12px">${x(r.alleged_misconduct.slice(0,50))}${r.alleged_misconduct.length>50?'…':''}</span>` : '—' },
          { label:'Outcome',       key:'outcome' },
          { label:'Appeal',        render: r => (r.appeal_lodged==='true'||r.appeal_lodged===true) ? '<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Appeal lodged</span>' : '—' },
        ],
        fields:[
          { key:'interaction_id',    label:'Interaction', required:true, type:'select', options: mkOpts(S.cache.interactions||[],'id', r=>interLabel(r.id)) },
          { key:'stage',             label:'Stage', type:'select', options:['Informal','Formal','First Written Warning','Final Written Warning','Dismissal'] },
          { key:'alleged_misconduct',label:'Alleged Misconduct', type:'textarea' },
          { key:'outcome',           label:'Outcome' },
          { key:'appeal_lodged',     label:'Appeal Lodged?', type:'select', options:[{value:'true',label:'Yes'},{value:'false',label:'No'}] },
          { key:'appeal_outcome',    label:'Appeal Outcome' },
        ],
      }, records };
    }
    // grievances
    const records = S.cache.grievances||[];
    return { config:{
      table:'grievances', title:'Grievances', subtitle:'Formal and informal grievance records',
      addLabel:'Add Grievance', wide:false,
      columns:[
        { label:'Interaction', render: r => `<span style="font-size:12px">${interLabel(r.interaction_id)}</span>` },
        { label:'Category',    render: r => statusBadge(r.category, GRIEV_SC) },
        { label:'Respondent',  key:'respondent' },
        { label:'Outcome',     key:'outcome' },
        { label:'Appeal',      render: r => (r.appeal_lodged==='true'||r.appeal_lodged===true) ? '<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Appeal lodged</span>' : '—' },
      ],
      fields:[
        { key:'interaction_id', label:'Interaction', required:true, type:'select', options: mkOpts(S.cache.interactions||[],'id', r=>interLabel(r.id)) },
        { key:'category',       label:'Category', type:'select', options:['Pay','Working Conditions','Discrimination','Management','Bullying & Harassment','Other'] },
        { key:'respondent',     label:'Respondent (name or role)' },
        { key:'outcome',        label:'Outcome' },
        { key:'appeal_lodged',  label:'Appeal Lodged?', type:'select', options:[{value:'true',label:'Yes'},{value:'false',label:'No'}] },
        { key:'appeal_outcome', label:'Appeal Outcome' },
      ],
    }, records };
  };

  const { config, records } = getConfig();
  pc.innerHTML = `
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Interactions</h1>
      <p style="color:var(--muted);font-size:14px">Sickness · disciplinaries · grievances · 1:1s · welfare checks</p>
    </div>
    ${subTabBar(INTERACT_TABS, S.interactTab, 'interactTab')}
    ${renderCRUD(config, records)}`;
  icons();
  bindSubTabs(() => { S.crudSearch=''; loadInteractTab(); });
  bindCRUD(config, records, loadInteractTab);
}

// ════════════════════════════════════════════════════════════════════════
//  22. LEAVERS
//  Table: leavers
// ════════════════════════════════════════════════════════════════════════
async function pageLeavers() {
  await Promise.all([
    cached('people',      'people',      'id,first_name,last_name,employee_number'),
    cached('leaver_types','leaver_types','id,name'),
  ]);
  clearCache('leavers'); await cached('leavers','leavers');
  S.crudSearch = '';
  renderLeavers();
}

function renderLeavers() {
  const pc = $('hr-page-content'); if (!pc) return;
  const records = S.cache.leavers||[];
  const LEAVER_SC = { Resignation:'#3b82f6', Retirement:'#10b981', Dismissal:'#ef4444', Redundancy:'#f59e0b', 'Death in Service':'var(--muted)', 'End of Fixed Term Contract':'#8b5cf6', 'Mutual Agreement':'#14b8a6', 'TUPE Transfer':'#f97316' };

  const config = {
    table:'leavers', title:'Leavers', subtitle:'All employee departures — resignations, retirements, dismissals and more',
    addLabel:'Record Leaver', wide:true,
    columns:[
      { label:'Employee',         render: r => personName(r.person_id) },
      { label:'Reason',           render: r => { const n=resolve('leaver_types',r.leaver_type_id,'name'); return statusBadge(n.replace(/<[^>]*>/g,''), LEAVER_SC); }},
      { label:'Notice Given',     render: r => dateCell(r.notice_given_date) },
      { label:'Last Working Day', render: r => r.last_working_day ? `<span style="font-size:12px;font-weight:600">${x(r.last_working_day)}</span>` : '—' },
      { label:'Exit Interview',   render: r => (r.exit_interview_done==='true'||r.exit_interview_done===true) ? '<span class="badge" style="background:var(--ok-bg);color:#16a34a">Done</span>' : '<span class="badge" style="background:var(--bg);color:var(--muted)">Not done</span>' },
      { label:'Rehire?',          render: r => {
        if (r.eligible_for_rehire==='true'||r.eligible_for_rehire===true)  return '<span class="badge" style="background:var(--ok-bg);color:#16a34a">Yes</span>';
        if (r.eligible_for_rehire==='false'||r.eligible_for_rehire===false) return '<span class="badge" style="background:var(--err-bg);color:#dc2626">No</span>';
        return '—';
      }},
    ],
    fields:[
      { key:'person_id',           label:'Employee',         required:true, type:'select', options: personOpts() },
      { key:'leaver_type_id',      label:'Reason for Leaving', required:true, type:'select', options: mkOpts(S.cache.leaver_types||[],'id','name') },
      { key:'notice_given_date',   label:'Notice Given Date',  type:'date' },
      { key:'last_working_day',    label:'Last Working Day',   required:true, type:'date' },
      { key:'exit_interview_done', label:'Exit Interview Done?', type:'select', options:[{value:'true',label:'Yes'},{value:'false',label:'No'}] },
      { key:'eligible_for_rehire', label:'Eligible for Rehire?', type:'select', options:[{value:'true',label:'Yes'},{value:'false',label:'No'}] },
      { key:'notice_flexible',      label:'Notice Period Flexible?', type:'select', options:[{value:'true',label:'Yes — willing to negotiate leaving date'},{value:'false',label:'No — serving full notice'}] },
      { key:'notice_served_weeks',    label:'Notice Actually Served (weeks)', type:'number' },
      { key:'notice_waived',          label:'Notice Waived by Employer?', type:'select', options:[{value:'true',label:'Yes — employer waived notice'},{value:'false',label:'No'}] },
      { key:'notes',               label:'Notes', type:'textarea' },
    ],
  };

  pc.innerHTML = `
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Leavers</h1>
      <p style="color:var(--muted);font-size:14px">All employee departures with reason, dates and exit details</p>
    </div>
    ${renderCRUD(config, records)}`;
  icons();
  bindCRUD(config, records, pageLeavers);
}

// ════════════════════════════════════════════════════════════════════════
//  23. ONBOARDING
//  Tables: onboarding_content, onboarding_tasks, employee_onboarding_content, employee_onboarding_tasks
// ════════════════════════════════════════════════════════════════════════
const ONBOARD_TABS = [
  { id:'content',     label:'Content Library', icon:'library'          },
  { id:'tasks',       label:'Task Checklist',  icon:'check-square'     },
  { id:'emp-content', label:'Employee Content',icon:'play-circle'      },
  { id:'emp-tasks',   label:'Employee Tasks',  icon:'clipboard-check'  },
];

async function pageOnboarding() {
  await Promise.all([
    cached('people',             'people',             'id,first_name,last_name,employee_number'),
    cached('departments',        'departments',        'id,name'),
    cached('onboarding_content', 'onboarding_content', 'id,title,content_type'),
    cached('onboarding_tasks',   'onboarding_tasks',   'id,task_name'),
  ]);
  S.crudSearch = '';
  await loadOnboardTab();
}

async function loadOnboardTab() {
  const t = { content:'onboarding_content', tasks:'onboarding_tasks',
               'emp-content':'employee_onboarding_content', 'emp-tasks':'employee_onboarding_tasks' }[S.onboardTab];
  clearCache(t); await cached(t, t);
  renderOnboarding();
}

function renderOnboarding() {
  const pc = $('hr-page-content'); if (!pc) return;
  const TYPE_SC = { Video:'#ef4444', Document:'#3b82f6', Questionnaire:'#8b5cf6', Policy:'#10b981', 'E-Learning Module':'#f97316' };

  const deptOpts = () => [{value:'',label:'All Departments'}, ...mkOpts(S.cache.departments||[],'id','name')];

  const getConfig = () => {
    if (S.onboardTab === 'content') {
      const records = S.cache.onboarding_content||[];
      return { config:{
        table:'onboarding_content', title:'Onboarding Content Library',
        subtitle:'Videos, documents, questionnaires and policies for new starters',
        addLabel:'Add Content', wide:false,
        columns:[
          { label:'Title',      render: r => `<span style="font-weight:500">${x(r.title||'—')}</span>` },
          { label:'Type',       render: r => statusBadge(r.content_type, TYPE_SC) },
          { label:'Version',    key:'version' },
          { label:'Department', render: r => r.department_id ? resolve('departments',r.department_id,'name') : '<span class="badge" style="background:var(--bg);color:var(--muted)">All Departments</span>' },
          { label:'URL / Path', render: r => r.url_or_path ? `<a href="${x(r.url_or_path)}" target="_blank" style="color:var(--accent);font-size:12px;text-decoration:none">${x(r.url_or_path.slice(0,45))}${r.url_or_path.length>45?'…':''}</a>` : '—' },
        ],
        fields:[
          { key:'title',         label:'Title',   required:true },
          { key:'content_type',  label:'Type',    type:'select', options:['Video','Document','Questionnaire','Policy','E-Learning Module'] },
          { key:'version',       label:'Version', hint:'e.g. v1.0, 2025' },
          { key:'department_id', label:'Department', type:'select', options: deptOpts() },
          { key:'url_or_path',   label:'URL or File Path', hint:'Link or storage location of the content' },
        ],
      }, records };
    }
    if (S.onboardTab === 'tasks') {
      const records = S.cache.onboarding_tasks||[];
      return { config:{
        table:'onboarding_tasks', title:'Onboarding Task Checklist',
        subtitle:'Tasks to be completed for each new starter — assignable by department',
        addLabel:'Add Task', wide:false,
        columns:[
          { label:'Task Name',   render: r => `<span style="font-weight:500">${x(r.task_name||'—')}</span>` },
          { label:'Description', render: r => r.description ? `<span style="font-size:12px;color:var(--muted)">${x(r.description.slice(0,60))}${r.description.length>60?'…':''}</span>` : '—' },
          { label:'Department',  render: r => r.department_id ? resolve('departments',r.department_id,'name') : '<span class="badge" style="background:var(--bg);color:var(--muted)">All</span>' },
        ],
        fields:[
          { key:'task_name',     label:'Task Name',    required:true, hint:'e.g. Sign contract, Complete induction, Set up IT access' },
          { key:'description',   label:'Description',  type:'textarea' },
          { key:'department_id', label:'Department',   type:'select', options: deptOpts() },
        ],
      }, records };
    }
    if (S.onboardTab === 'emp-content') {
      const records = S.cache.employee_onboarding_content||[];
      return { config:{
        table:'employee_onboarding_content', title:'Employee Content Completion',
        subtitle:'Track which onboarding content each employee has watched or completed',
        addLabel:'Record Completion', wide:false,
        columns:[
          { label:'Employee',  render: r => personName(r.person_id) },
          { label:'Content',   render: r => resolve('onboarding_content', r.content_id, 'title') },
          { label:'Completed', render: r => r.completion_date ? `<span class="badge" style="background:var(--ok-bg);color:#16a34a;border:1px solid var(--ok-border)">${x(r.completion_date)}</span>` : '<span class="badge" style="background:#fef9c3;color:var(--warn-text)">Pending</span>' },
          { label:'Score',     render: r => r.score ? `<span style="font-weight:600">${x(String(r.score))}%</span>` : '—' },
        ],
        fields:[
          { key:'person_id',       label:'Employee', required:true, type:'select', options: personOpts() },
          { key:'content_id',      label:'Content',  required:true, type:'select', options: mkOpts(S.cache.onboarding_content||[],'id', r=>`${r.title}${r.content_type?' ('+r.content_type+')':''}`) },
          { key:'completion_date', label:'Completion Date', type:'date' },
          { key:'score',           label:'Score (%)', type:'number', hint:'For questionnaires only' },
        ],
      }, records };
    }
    // emp-tasks
    const records = S.cache.employee_onboarding_tasks||[];
    return { config:{
      table:'employee_onboarding_tasks', title:'Employee Task Completion',
      subtitle:'Track which onboarding tasks each new starter has completed',
      addLabel:'Record Task', wide:false,
      columns:[
        { label:'Employee',     render: r => personName(r.person_id) },
        { label:'Task',         render: r => resolve('onboarding_tasks', r.task_id, 'task_name') },
        { label:'Completed',    render: r => r.completion_date ? `<span class="badge" style="background:var(--ok-bg);color:#16a34a;border:1px solid var(--ok-border)">${x(r.completion_date)}</span>` : '<span class="badge" style="background:#fef9c3;color:var(--warn-text)">Pending</span>' },
        { label:'Completed By', key:'completed_by', render: r => r.completed_by ? x(r.completed_by) : '—' },
      ],
      fields:[
        { key:'person_id',       label:'Employee', required:true, type:'select', options: personOpts() },
        { key:'task_id',         label:'Task',     required:true, type:'select', options: mkOpts(S.cache.onboarding_tasks||[],'id','task_name') },
        { key:'completion_date', label:'Completion Date', type:'date' },
        { key:'completed_by',    label:'Completed By', hint:'Name of person who verified this was done' },
      ],
    }, records };
  };

  const { config, records } = getConfig();
  pc.innerHTML = `
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Onboarding</h1>
      <p style="color:var(--muted);font-size:14px">Content library · task checklists · employee completion tracking</p>
    </div>
    ${subTabBar(ONBOARD_TABS, S.onboardTab, 'onboardTab')}
    ${renderCRUD(config, records)}`;
  icons();
  bindSubTabs(() => { S.crudSearch=''; loadOnboardTab(); });
  bindCRUD(config, records, loadOnboardTab);
}



// ════════════════════════════════════════════════════════════════════════
//  CANDIDATE ATTACHMENTS MODAL
// ════════════════════════════════════════════════════════════════════════
async function openAttachmentsModal(applicant, onReload) {
  S.modal = { type:'attachments', applicant, saving:false, onReload };
  await drawAttachmentsModal();
}

async function drawAttachmentsModal() {
  const m = S.modal; if (!m || m.type !== 'attachments') return;
  const { applicant } = m;

  let attachments = [];
  try {
    const res = await api.select('candidate_attachments', 'id,filename,file_type,file_size,created_at',
      `candidate_id=eq.${applicant.id}&order=created_at.desc`);
    attachments = Array.isArray(res) ? res : [];
  } catch {}

  const fmt = bytes => bytes > 1048576 ? (bytes/1048576).toFixed(1)+'MB' : Math.round(bytes/1024)+'KB';
  const typeIcon = t => t?.includes('pdf') ? 'file-text' : t?.includes('image') ? 'image' : t?.includes('word') || t?.includes('doc') ? 'file-text' : 'file';

  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal modal-md" style="max-width:580px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:22px 28px 18px;border-bottom:1px solid var(--bg);flex-shrink:0">
          <div>
            <h3 class="font-display" style="font-size:17px;font-weight:800;color:var(--text)">Attachments</h3>
            <p style="font-size:12px;color:var(--muted);margin-top:2px">${x(applicant.first_name)} ${x(applicant.last_name)} — CVs, cover letters, test results</p>
          </div>
          <button id="mc" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;display:flex">${ic('x',16)}</button>
        </div>

        <div style="overflow-y:auto;padding:22px 28px;flex:1">
          <!-- Upload area -->
          <label style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;border:2px dashed var(--border);border-radius:12px;cursor:pointer;margin-bottom:20px;transition:border-color 0.15s"
                 onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
            <input type="file" id="attach-input" multiple accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" style="display:none">
            <div style="width:40px;height:40px;background:var(--bg);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--muted)">${ic('upload-cloud',18)}</div>
            <p style="font-size:13px;font-weight:600;color:var(--text)">Click to upload files</p>
            <p style="font-size:12px;color:var(--muted)">PDF, Word, images · Multiple files allowed</p>
          </label>

          <!-- Existing attachments -->
          ${attachments.length === 0 ? `
            <div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">No attachments yet</div>` : `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${attachments.map(a => `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px">
                <div style="color:var(--accent)">${ic(typeIcon(a.file_type),18)}</div>
                <div style="flex:1;min-width:0">
                  <p style="font-size:13px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(a.filename)}</p>
                  <p style="font-size:11px;color:var(--muted)">${a.file_type||'Unknown type'} · ${a.file_size ? fmt(a.file_size) : '?'} · ${x(a.created_at?.slice(0,10)||'')}</p>
                </div>
                <button class="btn-icon" data-dl="${x(a.id)}" title="Download" style="color:#10b981">${ic('download',15)}</button>
                <button class="btn-icon del" data-da="${x(a.id)}" title="Delete" style="color:#ef4444">${ic('trash-2',15)}</button>
              </div>`).join('')}
          </div>`}
        </div>

        <div style="display:flex;justify-content:flex-end;padding:14px 28px;border-top:1px solid var(--bg);background:var(--bg);border-radius:0 0 20px 20px;flex-shrink:0">
          <button class="btn btn-secondary" id="m-cancel">Close</button>
        </div>
      </div>
    </div>`;
  icons();

  $('mc').addEventListener('click', closeModal);
  $('m-cancel').addEventListener('click', closeModal);
  $('mo').addEventListener('click', e => { if(e.target===$('mo')) closeModal(); });

  // Upload
  document.getElementById('attach-input')?.addEventListener('change', async e => {
    const files = [...(e.target.files||[])];
    if (!files.length) return;
    for (const file of files) {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      await api.insert('candidate_attachments', {
        candidate_id: applicant.id,
        filename: file.name,
        file_type: file.type,
        file_size: file.size,
        file_data: base64,
      });
    }
    showToast(`${files.length} file${files.length>1?'s':''} uploaded`, 'success');
    await drawAttachmentsModal();
  });

  // Download
  hrAll('[data-dl]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api.select('candidate_attachments','id,filename,file_data',`id=eq.${btn.dataset.dl}`);
        const row = Array.isArray(res) ? res[0] : null;
        if (!row) return;
        const a = document.createElement('a');
        a.href = row.file_data;
        a.download = row.filename;
        a.click();
      } catch {}
    });
  });

  // Delete
  hrAll('[data-da]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this attachment?')) return;
      await api.del('candidate_attachments', btn.dataset.da);
      await drawAttachmentsModal();
    });
  });
}


// ════════════════════════════════════════════════════════════════════════
//  DASHBOARD CHARTS
// ════════════════════════════════════════════════════════════════════════
let _dashCharts = {};

function destroyDashCharts() {
  Object.values(_dashCharts).forEach(c => { try { c.destroy(); } catch {} });
  _dashCharts = {};
  if (_anPie) { try { _anPie.destroy(); } catch {} _anPie = null; }
}

const CHART_PAL = ['var(--accent)','#0891b2','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#ec4899','#14b8a6','var(--muted)','#84cc16','#06b6d4'];

// Compute all chart data from raw fetched records
function buildChartData(people, cwRows, depts, offices, empRoles, roles, jts) {
  const now   = new Date();
  const cwMap = Object.fromEntries((cwRows||[]).map(r => [r.person_id, r.worker_type]));
  const deptMap  = Object.fromEntries((depts||[]).map(d   => [d.id, d]));
  const offMap   = Object.fromEntries((offices||[]).map(o  => [o.id, o]));
  const roleMap  = Object.fromEntries((roles||[]).map(r    => [r.id, r]));
  const jtMap    = Object.fromEntries((jts||[]).map(j      => [j.id, j]));

  // Only active (non-leaver) employees
  const active = (people||[]).filter(p => p.status !== 'Leaver');

  // By office
  const byOffice = {};
  active.forEach(p => { const k = p.office_location_id||'__none'; byOffice[k] = (byOffice[k]||0)+1; });

  // Employment type
  const byEmpType = { Permanent:0, Temporary:0, Contractor:0, Other:0 };
  active.forEach(p => {
    const cw = cwMap[p.id];
    if (cw === 'Contractor' || cw === 'Day Rate') byEmpType.Contractor++;
    else if (cw === 'Temp') byEmpType.Temporary++;
    else if (['Full Time','Part Time'].includes(p.employment_type)) byEmpType.Permanent++;
    else if (['Fixed Term','Zero Hours','Apprentice'].includes(p.employment_type)) byEmpType.Temporary++;
    else byEmpType.Other++;
  });

  // Age buckets
  const ageBuckets = ['Under 25','25–34','35–44','45–54','55–64','65+','Unknown'];
  const byAge = Object.fromEntries(ageBuckets.map(b => [b,0]));
  active.forEach(p => {
    if (!p.dob) { byAge.Unknown++; return; }
    const age = Math.floor((now - new Date(p.dob)) / 31557600000);
    if (age < 25) byAge['Under 25']++;
    else if (age < 35) byAge['25–34']++;
    else if (age < 45) byAge['35–44']++;
    else if (age < 55) byAge['45–54']++;
    else if (age < 65) byAge['55–64']++;
    else byAge['65+']++;
  });

  // Length of service buckets
  const losBuckets = ['< 1 year','1–2 years','2–5 years','5–10 years','10–20 years','20+ years','Unknown'];
  const calcLosBucket = p => {
    if (!p.start_date) return 'Unknown';
    const yrs = (now - new Date(p.start_date)) / 31557600000;
    if (yrs < 1) return '< 1 year';
    if (yrs < 2) return '1–2 years';
    if (yrs < 5) return '2–5 years';
    if (yrs < 10) return '5–10 years';
    if (yrs < 20) return '10–20 years';
    return '20+ years';
  };
  const byLoS = Object.fromEntries(losBuckets.map(b => [b,0]));
  active.forEach(p => byLoS[calcLosBucket(p)]++);

  // LoS pivot data: per office / per dept
  const losByOffice = {}, losByDept = {};
  active.forEach(p => {
    const bucket = calcLosBucket(p);
    const offKey = p.office_location_id||'__none';
    const depKey = p.department_id||'__none';
    if (!losByOffice[offKey]) losByOffice[offKey] = Object.fromEntries(losBuckets.map(b => [b,0]));
    if (!losByDept[depKey])   losByDept[depKey]   = Object.fromEntries(losBuckets.map(b => [b,0]));
    losByOffice[offKey][bucket]++;
    losByDept[depKey][bucket]++;
  });

  // Drill-down: people by office and dept
  const byOfficeList = {}, byDeptList = {};
  active.forEach(p => {
    const ok = p.office_location_id||'__none';
    const dk = p.department_id||'__none';
    (byOfficeList[ok] = byOfficeList[ok]||[]).push(p);
    (byDeptList[dk]   = byDeptList[dk]  ||[]).push(p);
  });

  // Roles drill-down: current role per person
  const currentRoleMap = {};
  (empRoles||[]).filter(r => !r.end_date).forEach(r => { currentRoleMap[r.person_id] = r.role_id; });

  return {
    active, cwMap, deptMap, offMap, roleMap, jtMap,
    byOffice, byEmpType, byAge, byLoS, losBuckets, ageBuckets,
    losByOffice, losByDept, byOfficeList, byDeptList, currentRoleMap,
  };
}

function initDashboardCharts(cd, counts) {
  if (typeof Chart === 'undefined') return;
  destroyDashCharts();

  // ── Drill-down state ─────────────────────────────────────────────────
  const drill = S.chartDrill;

  if (drill?.type === 'office') {
    initOfficeToDeptsChart(cd, drill); return;
  }
  if (drill?.type === 'dept') {
    initDeptToRolesChart(cd, drill); return;
  }

  // ── Chart 1: Office Location Pie ─────────────────────────────────────
  const offCanvas = document.getElementById('chart-office');
  if (offCanvas) {
    const offIds    = Object.keys(cd.byOffice);
    const offLabels = offIds.map(id => id === '__none' ? 'No Office Assigned' : (cd.offMap[id]?.name||id));
    const offCounts = offIds.map(id => cd.byOffice[id]);
    _dashCharts.office = new Chart(offCanvas, {
      type: 'doughnut',
      data: { labels: offLabels, datasets: [{ data: offCounts, backgroundColor: CHART_PAL, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: (e, els) => {
          if (!els.length) return;
          const id = offIds[els[0].index];
          S.chartDrill = { type:'office', id, name: offLabels[els[0].index] };
          destroyDashCharts();
          renderDashChartSection(cd, counts);
        },
        plugins: { legend: { position:'right', labels:{ font:{size:11}, boxWidth:12 } },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} staff` } } },
      }
    });
  }

  // ── Chart 2: Employment Type Donut ───────────────────────────────────
  const etCanvas = document.getElementById('chart-emptype');
  if (etCanvas) {
    const et = cd.byEmpType;
    const etLabels = Object.keys(et).filter(k => et[k] > 0);
    const etColours = { Permanent:'#10b981', Temporary:'#f59e0b', Contractor:'var(--accent)', Other:'var(--muted)' };
    _dashCharts.emptype = new Chart(etCanvas, {
      type: 'doughnut',
      data: { labels: etLabels, datasets: [{ data: etLabels.map(k => et[k]), backgroundColor: etLabels.map(k => etColours[k]||'var(--muted)'), borderWidth: 2, borderColor:'#fff', hoverOffset:8 }] },
      options: { responsive:true, maintainAspectRatio:false,
        plugins: { legend:{position:'right',labels:{font:{size:11},boxWidth:12}},
          tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw} (${Math.round(c.raw/c.dataset.data.reduce((a,b)=>a+b,0)*100)}%)`}} } }
    });
  }

  // ── Chart 3: Age Distribution Bar ────────────────────────────────────
  const ageCanvas = document.getElementById('chart-age');
  if (ageCanvas) {
    const ageBuckets = cd.ageBuckets.filter(b => cd.byAge[b] > 0 || b !== 'Unknown');
    _dashCharts.age = new Chart(ageCanvas, {
      type: 'bar',
      data: { labels: ageBuckets, datasets: [{ label:'Staff', data: ageBuckets.map(b => cd.byAge[b]||0),
        backgroundColor: CHART_PAL.slice(0,ageBuckets.length), borderRadius:6, borderSkipped:false }] },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{ y:{beginAtZero:true,ticks:{stepSize:1}}, x:{grid:{display:false}} } }
    });
  }

  // ── Chart 4: Length of Service ────────────────────────────────────────
  initLoSChart(cd);
}

function initLoSChart(cd) {
  const losCanvas = document.getElementById('chart-los');
  if (!losCanvas || typeof Chart === 'undefined') return;
  if (_dashCharts.los) { _dashCharts.los.destroy(); delete _dashCharts.los; }

  const pivot = S.losPivot||'all';
  const buckets = cd.losBuckets;

  if (pivot === 'all') {
    _dashCharts.los = new Chart(losCanvas, {
      type:'bar',
      data:{ labels:buckets, datasets:[{ label:'Staff', data:buckets.map(b=>cd.byLoS[b]||0),
        backgroundColor:'var(--accent)', borderRadius:6, borderSkipped:false }] },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}} }
    });
  } else {
    const pivotData = pivot === 'office' ? cd.losByOffice : cd.losByDept;
    const pivotMap  = pivot === 'office' ? cd.offMap      : cd.deptMap;
    const keys = Object.keys(pivotData).slice(0,8); // cap at 8 series
    const datasets = keys.map((k,i) => ({
      label: k==='__none' ? (pivot==='office'?'No Office':'No Dept') : (pivotMap[k]?.name||k),
      data: buckets.map(b => (pivotData[k]||{})[b]||0),
      backgroundColor: CHART_PAL[i%CHART_PAL.length],
      borderRadius: 4, borderSkipped:false,
    }));
    _dashCharts.los = new Chart(losCanvas, {
      type:'bar',
      data:{ labels:buckets, datasets },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}}},
        scales:{ y:{beginAtZero:true,stacked:false}, x:{grid:{display:false}} } }
    });
  }
}

function initOfficeToDeptsChart(cd, drill) {
  const canvas = document.getElementById('chart-drill');
  if (!canvas || typeof Chart === 'undefined') return;
  const people = cd.byOfficeList[drill.id]||[];
  const deptCount = {};
  people.forEach(p => { const k=p.department_id||'__none'; deptCount[k]=(deptCount[k]||0)+1; });
  const keys   = Object.keys(deptCount).sort((a,b) => deptCount[b]-deptCount[a]);
  const labels = keys.map(k => k==='__none'?'No Department':(cd.deptMap[k]?.name||k));
  const counts = keys.map(k => deptCount[k]);
  _dashCharts.drill = new Chart(canvas, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Staff', data:counts,
      backgroundColor:CHART_PAL.slice(0,labels.length), borderRadius:8, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
      onClick:(e,els)=>{
        if (!els.length) return;
        const deptId = keys[els[0].index];
        const deptName = labels[els[0].index];
        S.chartDrill = { type:'dept', officeId:drill.id, officeName:drill.name, deptId, deptName };
        destroyDashCharts(); renderDashChartSection(cd, null);
      },
      plugins:{ legend:{display:false},
        tooltip:{callbacks:{label:c=>` ${c.raw} staff`}} },
      scales:{ x:{beginAtZero:true,ticks:{stepSize:1}}, y:{grid:{display:false}} } }
  });
}

function initDeptToRolesChart(cd, drill) {
  const canvas = document.getElementById('chart-drill');
  if (!canvas || typeof Chart === 'undefined') return;
  // People in this office + dept
  const people = (cd.byOfficeList[drill.officeId]||[]).filter(p => (p.department_id||'__none')===drill.deptId);
  const roleCount = {};
  people.forEach(p => {
    const roleId = cd.currentRoleMap[p.id];
    const jtId   = roleId ? cd.roleMap[roleId]?.job_title_id : null;
    const label  = jtId ? (cd.jtMap[jtId]?.title||'Unknown Role') : 'No Role Assigned';
    roleCount[label] = (roleCount[label]||0)+1;
  });
  const labels = Object.keys(roleCount).sort((a,b)=>roleCount[b]-roleCount[a]);
  _dashCharts.drill = new Chart(canvas, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Staff', data:labels.map(l=>roleCount[l]),
      backgroundColor:CHART_PAL.slice(0,labels.length), borderRadius:8, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
      cursor:'pointer',
      onClick:(e,els)=>{
        if (!els.length) return;
        const roleLabel = labels[els[0].index];
        S.chartDrill = { ...drill, type:'employees', roleLabel };
        destroyDashCharts(); renderDashChartSection(cd, null);
      },
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.raw} staff · click to see employees`}} },
      scales:{ x:{beginAtZero:true,ticks:{stepSize:1}}, y:{grid:{display:false}} } }
  });
  canvas.style.cursor = 'pointer';
}



// ── Bind employee list rows → navigate to People and open their modal ─
function bindEmployeeList(container) {
  (container || document).querySelectorAll('[data-pid]').forEach(row => {
    row.addEventListener('click', () => {
      S.pendingOpenPerson = row.dataset.pid;
      S.page = 'people';
      renderShell();
    });
  });
}

// ── Employee list renderer (shared by dashboard drill + analytics) ─────
function renderEmployeeListHTML(people, cd) {
  if (!people.length) return `<div style="text-align:center;padding:32px;color:var(--muted)">No employees found for this selection</div>`;
  const now = new Date();
  const los = p => {
    if (!p.start_date) return '—';
    const y = Math.floor((now - new Date(p.start_date))/31557600000);
    if (y < 1) return '< 1 yr'; if (y === 1) return '1 yr';
    return y + ' yrs';
  };
  const ET_COLOURS = { 'Full Time':'#10b981','Part Time':'#3b82f6','Fixed Term':'#f59e0b',
    'Zero Hours':'#f97316','Contractor':'var(--accent)','Apprentice':'#8b5cf6','Other':'var(--muted)' };
  return `
    <table class="tbl">
      <thead><tr>
        <th class="th">Employee</th>
        <th class="th">Role</th>
        <th class="th">Type</th>
        <th class="th">Start Date</th>
        <th class="th">Service</th>
      </tr></thead>
      <tbody>
        ${people.sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||'')).map(p => {
          const roleId = cd.currentRoleMap?.[p.id];
          const jtId   = roleId ? cd.roleMap?.[roleId]?.job_title_id : null;
          const title  = jtId ? (cd.jtMap?.[jtId]?.title||'—') : '—';
          const initials = `${(p.first_name||'?')[0]}${(p.last_name||'?')[0]}`;
          const et = p.employment_type || 'Other';
          const ec = ET_COLOURS[et] || 'var(--muted)';
          return `
          <tr class="tr" data-pid="${p.id}" style="cursor:pointer" title="Click to open employee record"
              onmouseenter="this.style.background='#f0f9ff'" onmouseleave="this.style.background=''">
            <td class="td">
              <div style="display:flex;align-items:center;gap:10px">
                ${p.photo_url
                  ? `<img src="${p.photo_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--border)">`
                  : `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#7c3aed);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>`}
                <div>
                  <p style="font-size:13px;font-weight:600;color:var(--text);line-height:1.2">${x(p.first_name||'')} ${x(p.last_name||'')}</p>
                  ${p.employee_number ? `<p style="font-size:10px;color:var(--muted)">${x(p.employee_number)}</p>` : ''}
                </div>
              </div>
            </td>
            <td class="td" style="font-size:13px;color:var(--text)">${x(title)}</td>
            <td class="td"><span class="badge" style="background:${ec}18;color:${ec};border:1px solid ${ec}28;font-size:11px">${x(et)}</span></td>
            <td class="td" style="font-size:12px;color:var(--muted)">${x(p.start_date||'—')}</td>
            <td class="td" style="font-size:12px;font-weight:600;color:var(--text)">${los(p)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderDashChartSection(cd, counts) {
  const drill = S.chartDrill;
  const chartArea = document.getElementById('dash-charts');
  if (!chartArea) return;

  // ── Employees list (deepest drill level) ──────────────────────────────
  if (drill?.type === 'employees') {
    const people = (cd?.byOfficeList?.[drill.officeId]||[])
      .filter(p => (p.department_id||'__none') === drill.deptId)
      .filter(p => {
        const roleId = cd.currentRoleMap?.[p.id];
        const jtId   = roleId ? cd.roleMap?.[roleId]?.job_title_id : null;
        const label  = jtId ? (cd.jtMap?.[jtId]?.title||'No Role Assigned') : 'No Role Assigned';
        return label === drill.roleLabel;
      });

    chartArea.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <button id="drill-back" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px">
          ${ic('arrow-left',13)} Back to ${x(drill.deptName)} roles
        </button>
        <span style="font-size:11px;color:var(--muted)">Dashboard › ${x(drill.officeName||'')} › ${x(drill.deptName||'')} › ${x(drill.roleLabel||'')}</span>
      </div>
      <div class="card" style="padding:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div>
            <h3 class="font-display" style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:2px">
              ${x(drill.roleLabel)} — ${x(drill.deptName)}
            </h3>
            <p style="font-size:12px;color:var(--muted)">${x(drill.officeName)} · ${people.length} employee${people.length!==1?'s':''}</p>
          </div>
          <span class="badge" style="background:var(--accent);color:#fff;font-size:13px;padding:6px 12px">${people.length}</span>
        </div>
        ${renderEmployeeListHTML(people, cd)}
      </div>`;
    icons();
    bindEmployeeList(chartArea);

    document.getElementById('drill-back')?.addEventListener('click', () => {
      S.chartDrill = { type:'dept', officeId:drill.officeId, officeName:drill.officeName,
                       deptId:drill.deptId, deptName:drill.deptName };
      destroyDashCharts(); renderDashChartSection(cd, counts);
      setTimeout(() => initDeptToRolesChart(cd, S.chartDrill), 30);
    });
    return;
  }

  // If chart data hasn't loaded yet, show a subtle placeholder
  if (!cd) {
    chartArea.innerHTML = `<div style="padding:20px 0 4px;color:var(--muted);font-size:13px;display:flex;align-items:center;gap:8px">${ic('loader',14)} Loading people analytics…</div>`;
    icons(); return;
  }

  if (drill) {
    const isRoles   = drill.type === 'dept' || drill.type === 'employees';
    const title     = isRoles ? `Roles in ${drill.deptName}` : `Departments in ${drill.name}`;
    const subtitle  = isRoles
      ? `${drill.officeName} · ${drill.deptName}`
      : `Click a department bar to see its role breakdown`;

    chartArea.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <button id="drill-back" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px">
          ${ic('arrow-left',13)} ${isRoles ? 'Back to '+drill.officeName+' departments' : 'Back to all offices'}
        </button>
        <div>
          <span style="font-size:11px;color:var(--muted)">Dashboard</span>
          <span style="font-size:11px;color:var(--muted)"> › ${drill.officeName||''}</span>
          ${isRoles ? `<span style="font-size:11px;color:var(--muted)"> › ${drill.deptName}</span>` : ''}
        </div>
      </div>
      <div class="card" style="padding:24px">
        <h3 class="font-display" style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px">${x(title)}</h3>
        <p style="font-size:12px;color:var(--muted);margin-bottom:20px">${x(subtitle)}</p>
        <div style="height:320px;position:relative">
          <canvas id="chart-drill"></canvas>
        </div>
      </div>`;
    icons();

    document.getElementById('drill-back')?.addEventListener('click', () => {
      if (isRoles) {
        S.chartDrill = { type:'office', id:drill.officeId, name:drill.officeName };
      } else {
        S.chartDrill = null;
      }
      destroyDashCharts();
      renderDashChartSection(cd, counts);
      if (!S.chartDrill) initDashboardCharts(cd, counts);
    });

    // Init the drill chart
    setTimeout(() => {
      if (drill.type === 'office') initOfficeToDeptsChart(cd, drill);
      else initDeptToRolesChart(cd, drill);
    }, 30);
    return;
  }

  // Normal 4-chart grid
  chartArea.innerHTML = `
    <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">
      ${ic('bar-chart-2',12)} People Analytics <span style="font-weight:400;font-style:italic"> · Click office slice to drill down</span>
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card" style="padding:20px">
        <h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">${ic('map-pin',12)} Staff by Office Location</h3>
        <div style="height:210px;position:relative"><canvas id="chart-office"></canvas></div>
        <p style="font-size:10px;color:var(--muted);margin-top:8px;text-align:center">Click a slice to see department breakdown</p>
      </div>
      <div class="card" style="padding:20px">
        <h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">${ic('users',12)} Employment Type</h3>
        <div style="height:210px;position:relative"><canvas id="chart-emptype"></canvas></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:36px">
      <div class="card" style="padding:20px">
        <h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">${ic('calendar',12)} Age Distribution</h3>
        <div style="height:200px;position:relative"><canvas id="chart-age"></canvas></div>
      </div>
      <div class="card" style="padding:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <h3 style="font-size:13px;font-weight:700;color:var(--text)">${ic('clock',12)} Length of Service</h3>
          <select id="los-pivot" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;color:#475569;background:var(--bg)">
            <option value="all" ${S.losPivot==='all'?'selected':''}>All Staff</option>
            <option value="office" ${S.losPivot==='office'?'selected':''}>By Office</option>
            <option value="dept" ${S.losPivot==='dept'?'selected':''}>By Department</option>
          </select>
        </div>
        <div style="height:200px;position:relative"><canvas id="chart-los"></canvas></div>
      </div>
    </div>`;
  icons();

  document.getElementById('los-pivot')?.addEventListener('change', e => {
    S.losPivot = e.target.value;
    initLoSChart(cd);
  });

  setTimeout(() => initDashboardCharts(cd, counts), 30);
}

// ════════════════════════════════════════════════════════════════════════
//  24. CONTRACTORS & TEMPS
//  Tables: recruitment_agencies, contingent_workers,
//          equipment_assignments, timesheets, timesheet_entries
// ════════════════════════════════════════════════════════════════════════
const CONTRACTOR_TABS = [
  { id:'workers',    label:'Workers',             icon:'user-cog'      },
  { id:'agencies',   label:'Recruitment Agencies',icon:'building'      },
  { id:'equipment',  label:'Equipment Issued',    icon:'package'       },
  { id:'timesheets', label:'Timesheets',          icon:'clock'         },
];

async function pageContractors() {
  await Promise.all([
    cached('people',               'people',               'id,first_name,last_name,employee_number'),
    cached('recruitment_agencies', 'recruitment_agencies', 'id,name,contact_name'),
    cached('equipment_types',      'equipment_types',      'id,name'),
  ]);
  S.crudSearch = '';
  await loadContractorsTab();
}

async function loadContractorsTab() {
  const t = {
    workers:    'contingent_workers',
    agencies:   'recruitment_agencies',
    equipment:  'equipment_assignments',
    timesheets: 'timesheets',
  }[S.contractorsTab];
  clearCache(t); await cached(t, t);
  // Timesheets page also needs agencies fresh for the worker filter
  if (S.contractorsTab === 'workers') {
    clearCache('people');
    await cached('people','people','id,first_name,last_name,employee_number');
    clearCache('recruitment_agencies');
    await cached('recruitment_agencies','recruitment_agencies','id,name,contact_name');
  }
  renderContractors();
}

function renderContractors() {
  const pc = $('hr-page-content'); if (!pc) return;

  const agencyName = id => resolve('recruitment_agencies', id, 'name');

  const WORKER_STATUS = { Active:'#10b981', Expired:'#ef4444', 'Upcoming':'#f59e0b', Extended:'#3b82f6', Terminated:'var(--muted)' };
  const IR35 = { 'Inside IR35':'#ef4444', 'Outside IR35':'#10b981', 'N/A':'var(--muted)' };
  const TS_STATUS = { Draft:'var(--muted)', Submitted:'#3b82f6', Approved:'#10b981', Rejected:'#ef4444' };

  const workerStatus = row => {
    if (!row.contract_end) return 'Active';
    const end = new Date(row.contract_end);
    const now = new Date();
    if (end < now) return 'Expired';
    if (new Date(row.contract_start||now) > now) return 'Upcoming';
    return 'Active';
  };

  const getConfig = () => {
    // ── WORKERS ────────────────────────────────────────────────────────
    if (S.contractorsTab === 'workers') {
      const records = S.cache.contingent_workers || [];
      return { config: {
        table:'contingent_workers', title:'Contractors & Temps',
        subtitle:'Non-permanent workers — contractors, temps and day rate staff',
        addLabel:'Add Worker', wide:true,
        columns:[
          { label:'Name',          render: r => personName(r.person_id) },
          { label:'Type',          render: r => statusBadge(r.worker_type, { Contractor:'#0891b2', Temp:'#8b5cf6', 'Day Rate':'#f97316' }) },
          { label:'Agency',        render: r => r.agency_id ? agencyName(r.agency_id) : '<span style="color:var(--border)">Direct</span>' },
          { label:'Contract Start',render: r => dateCell(r.contract_start) },
          { label:'Contract End',  render: r => r.contract_end ? dateCell(r.contract_end, 30) : '<span class="badge" style="background:var(--bg);color:var(--muted)">Open-ended</span>' },
          { label:'Day Rate',      render: r => r.day_rate ? `<span style="font-weight:600">£${Number(r.day_rate).toLocaleString('en-GB')}</span>` : '—' },
          { label:'IR35',          render: r => r.ir35_status ? statusBadge(r.ir35_status, IR35) : '—' },
          { label:'Status',        render: r => statusBadge(workerStatus(r), WORKER_STATUS) },
        ],
        fields:[
          { key:'person_id',      label:'Employee Record', required:true, type:'select', options: personOpts,
            hint:'Select the existing People record for this worker — add them in People first if needed' },
          { key:'worker_type',    label:'Worker Type', required:true, type:'select', options:['Contractor','Temp','Day Rate'] },
          { key:'agency_id',      label:'Recruitment Agency', type:'select',
            options: () => [{value:'',label:'Direct (no agency)'},...mkOpts(S.cache.recruitment_agencies||[],'id','name')] },
          { key:'contract_start', label:'Contract Start', required:true, type:'date' },
          { key:'contract_end',   label:'Contract End', type:'date', hint:'Leave blank for open-ended contracts' },
          { key:'day_rate',       label:'Day Rate (£)', type:'number' },
          { key:'pay_currency',   label:'Currency', type:'select', options:['GBP','EUR','USD'] },
          { key:'ir35_status',    label:'IR35 Status', type:'select', options:['Inside IR35','Outside IR35','N/A'] },
          { key:'purchase_order', label:'Purchase Order / Ref' },
          { key:'notes',          label:'Notes', type:'textarea' },
        ],
      }, records };
    }

    // ── AGENCIES ───────────────────────────────────────────────────────
    if (S.contractorsTab === 'agencies') {
      const records = S.cache.recruitment_agencies || [];
      return { config: {
        table:'recruitment_agencies', title:'Recruitment Agencies',
        subtitle:'Agencies we work with for contractor and temp placements',
        addLabel:'Add Agency', wide:true,
        columns:[
          { label:'Agency Name',     render: r => `<span style="font-weight:600">${x(r.name||'—')}</span>` },
          { label:'Contact',         key:'contact_name' },
          { label:'Email',           render: r => r.email ? `<a href="mailto:${x(r.email)}" style="color:var(--accent);font-size:13px;text-decoration:none">${x(r.email)}</a>` : '—' },
          { label:'Phone',           key:'phone' },
          { label:'Fee %',           render: r => r.fee_percentage ? `<span style="font-weight:600">${x(String(r.fee_percentage))}%</span>` : '—' },
          { label:'Terms Agreed',    render: r => dateCell(r.terms_agreed) },
          { label:'Account Manager', key:'account_manager' },
        ],
        fields:[
          { key:'name',            label:'Agency Name',       required:true },
          { key:'contact_name',    label:'Contact Name',      hint:'Main point of contact at the agency' },
          { key:'email',           label:'Email',             type:'email' },
          { key:'phone',           label:'Phone',             type:'tel' },
          { key:'website',         label:'Website',           hint:'e.g. https://agency.com' },
          { key:'account_manager', label:'Our Account Manager', hint:'Internal person who manages this agency relationship' },
          { key:'fee_percentage',  label:'Fee %',             type:'number', hint:'Agency fee as a % of first year salary' },
          { key:'terms_agreed',    label:'Terms Agreed Date', type:'date' },
          { key:'notes',           label:'Notes',             type:'textarea' },
        ],
      }, records };
    }

    // ── EQUIPMENT ──────────────────────────────────────────────────────
    if (S.contractorsTab === 'equipment') {
      const records = S.cache.equipment_assignments || [];
      return { config: {
        table:'equipment_assignments', title:'Equipment Issued',
        subtitle:'Kit issued to staff — laptops, phones, cars, fobs etc. Red = overdue return',
        addLabel:'Issue Equipment', wide:true,
        columns:[
          { label:'Employee',         render: r => personName(r.person_id) },
          { label:'Equipment',        render: r => resolve('equipment_types', r.equipment_type_id, 'name') },
          { label:'Asset Tag',        render: r => r.asset_tag ? `<span style="font-family:monospace;font-size:12px">${x(r.asset_tag)}</span>` : '—' },
          { label:'Serial No.',       render: r => r.serial_number ? `<span style="font-family:monospace;font-size:12px">${x(r.serial_number)}</span>` : '—' },
          { label:'Issued',           render: r => dateCell(r.issued_date) },
          { label:'Returned',         render: r => r.returned_date
              ? `<span class="badge" style="background:var(--ok-bg);color:#16a34a">${x(r.returned_date)}</span>`
              : '<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">With employee</span>' },
          { label:'Condition',        render: r => r.condition_issued ? `<span style="font-size:12px;color:var(--muted)">${x(r.condition_issued)}</span>` : '—' },
        ],
        fields:[
          { key:'person_id',          label:'Employee',          required:true, type:'select', options: personOpts },
          { key:'equipment_type_id',  label:'Equipment Type',    required:true, type:'select',
            options: () => mkOpts(S.cache.equipment_types||[],'id','name') },
          { key:'asset_tag',          label:'Asset Tag',         hint:'Internal asset reference number' },
          { key:'serial_number',      label:'Serial Number' },
          { key:'issued_date',        label:'Date Issued',       required:true, type:'date' },
          { key:'condition_issued',   label:'Condition on Issue',type:'select', options:['New','Excellent','Good','Fair','Poor'] },
          { key:'returned_date',      label:'Date Returned',     type:'date', hint:'Leave blank if still with employee' },
          { key:'condition_returned', label:'Condition on Return',type:'select', options:['Excellent','Good','Fair','Poor','Damaged','Lost'] },
          { key:'notes',              label:'Notes',             type:'textarea' },
        ],
      }, records };
    }

    // ── TIMESHEETS ─────────────────────────────────────────────────────
    const records = S.cache.timesheets || [];
    return { config: {
      table:'timesheets', title:'Timesheets',
      subtitle:'Weekly timesheets — click Add to open the weekly entry form',
      addLabel:'New Timesheet', wide:true,
      columns:[
        { label:'Worker',         render: r => personName(r.person_id) },
        { label:'Week Commencing',render: r => r.week_start_date ? `<span style="font-size:12px;font-weight:500">${x(r.week_start_date)}</span>` : '—' },
        { label:'Total Hours',    render: r => r.total_hours!=null ? `<span style="font-weight:700;color:var(--text)">${x(String(r.total_hours))} hrs</span>` : '—' },
        { label:'Status',         render: r => statusBadge(r.status||'Draft', TS_STATUS) },
        { label:'Submitted',      render: r => dateCell(r.submitted_date) },
        { label:'Approved By',    render: r => r.approved_by ? personName(r.approved_by) : '—' },
      ],
      fields:[], // timesheets use a custom modal — see openTimesheetModal
      _custom: 'timesheet',
    }, records };
  };

  const { config, records } = getConfig();

  pc.innerHTML = `
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Contractors & Temps</h1>
      <p style="color:var(--muted);font-size:14px">Agencies · contractors · equipment · timesheets</p>
    </div>
    ${subTabBar(CONTRACTOR_TABS, S.contractorsTab, 'contractorsTab')}
    ${renderCRUD(config, records)}`;
  icons();

  bindSubTabs(() => { S.crudSearch=''; loadContractorsTab(); });

  // Timesheets tab uses a custom modal; other tabs use the generic one
  if (config._custom === 'timesheet') {
    document.getElementById('crud-search')?.addEventListener('input', e => { S.crudSearch=e.target.value; loadContractorsTab(); });
    document.getElementById('crud-add')?.addEventListener('click', () => openTimesheetModal(null, loadContractorsTab));
    hrAll('[data-edit]').forEach(btn => {
      const row = records.find(r=>r.id===btn.dataset.edit);
      btn.addEventListener('click', () => openTimesheetModal(row, loadContractorsTab));
    });
    hrAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this timesheet and all its entries?')) return;
        await api.del('timesheets', btn.dataset.del);
        clearCache('timesheets');
        await loadContractorsTab();
      });
    });
  } else {
    bindCRUD(config, records, loadContractorsTab);
  }
}

// ── Timesheet custom modal ────────────────────────────────────────────
// Shows a Mon–Sun weekly grid for entering hours per day, plus a header
// for worker, week, status and approver.

function openTimesheetModal(row, onReload) {
  // If editing, load existing entries to pre-fill the grid
  S.modal = {
    type: 'timesheet',
    form: row ? {...row} : { status:'Draft', week_start_date: nearestMonday() },
    editId: row?.id || null,
    saving: false,
    entries: [],  // populated below for edits
    onReload,
  };
  if (row?.id) {
    // Load entries async then redraw
    api.select('timesheet_entries', '*', `timesheet_id=eq.${row.id}&order=work_date.asc`)
      .then(rows => { S.modal.entries = Array.isArray(rows) ? rows : []; drawTimesheetModal(); });
  }
  drawTimesheetModal();
}

function nearestMonday(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}

// Days shown in the timesheet grid
const TS_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function drawTimesheetModal() {
  const m = S.modal; if (!m || m.type !== 'timesheet') return;
  const TS_STATUS_COLOURS = { Draft:'var(--muted)', Submitted:'#3b82f6', Approved:'#10b981', Rejected:'#ef4444' };

  // Build per-day entry rows (pre-filled from m.entries for edits)
  const entryRow = (day, idx) => {
    const entry = (m.entries||[]).find(e => {
      if (!e.work_date || !m.form.week_start_date) return false;
      const base = new Date(m.form.week_start_date);
      base.setDate(base.getDate() + idx);
      return e.work_date === base.toISOString().slice(0,10);
    });
    return `
      <tr style="border-bottom:1px solid var(--bg)">
        <td style="padding:8px 12px;font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;width:110px">${day}</td>
        <td style="padding:4px 8px">
          <input type="number" min="0" max="24" step="0.5"
            data-ts-day="${idx}" data-ts-field="hours"
            value="${entry?.hours_worked!=null ? entry.hours_worked : ''}"
            style="width:80px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;text-align:center"
            placeholder="0">
        </td>
        <td style="padding:4px 8px;width:100%">
          <input type="text" data-ts-day="${idx}" data-ts-field="desc"
            value="${x(entry?.description||'')}"
            style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px"
            placeholder="What did you work on? (optional)">
        </td>
      </tr>`;
  };

  $('hr-modal-root').innerHTML = `
    <div class="modal-overlay" id="mo">
      <div class="modal modal-md" style="max-width:700px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:22px 28px 18px;border-bottom:1px solid var(--bg);flex-shrink:0">
          <div>
            <h3 class="font-display" style="font-size:17px;font-weight:800;color:var(--text)">
              ${m.editId ? 'Edit Timesheet' : 'New Timesheet'}
            </h3>
            <p style="font-size:12px;color:var(--muted);margin-top:2px">Enter hours for each day of the week</p>
          </div>
          <button id="mc" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;border-radius:6px;display:flex">${ic('x',16)}</button>
        </div>

        <div id="hr-modal-body" style="overflow-y:auto;padding:22px 28px;flex:1">
          <!-- Header fields -->
          <div class="two-col" style="margin-bottom:20px">
            <div>
              <label class="field-label">Worker <span style="color:#f87171">*</span></label>
              <select class="field-input" id="ts-person" data-field="person_id">
                <option value="">Select…</option>
                ${personOpts().map(o=>`<option value="${x(o.value)}"${m.form.person_id===o.value?' selected':''}>${x(o.label)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="field-label">Week Commencing (Monday) <span style="color:#f87171">*</span></label>
              <input type="date" class="field-input" id="ts-week" value="${x(m.form.week_start_date||'')}"
                style="cursor:pointer">
              <p class="field-hint">Auto-snaps to the Monday of the selected week</p>
            </div>
            <div>
              <label class="field-label">Status</label>
              <select class="field-input" id="ts-status">
                ${['Draft','Submitted','Approved','Rejected'].map(s=>`<option value="${s}"${(m.form.status||'Draft')===s?' selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="field-label">Approved By</label>
              <select class="field-input" id="ts-approved-by">
                <option value="">None</option>
                ${personOpts().map(o=>`<option value="${x(o.value)}"${m.form.approved_by===o.value?' selected':''}>${x(o.label)}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Daily hours grid -->
          <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
            <div style="background:var(--bg);padding:10px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">${ic('clock',13)} Daily Hours</span>
              <span id="ts-total" style="font-size:13px;font-weight:700;color:var(--text)">Total: 0 hrs</span>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:var(--bg);border-bottom:1px solid var(--border)">
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:var(--muted);text-align:left;text-transform:uppercase">Day</th>
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:var(--muted);text-align:left;text-transform:uppercase">Hours</th>
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:var(--muted);text-align:left;text-transform:uppercase">Description / Project</th>
                </tr>
              </thead>
              <tbody id="ts-grid">
                ${TS_DAYS.map((d,i) => entryRow(d,i)).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-top:16px">
            <label class="field-label">Notes</label>
            <textarea class="field-input" id="ts-notes" rows="2" style="resize:none">${x(m.form.notes||'')}</textarea>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 28px;border-top:1px solid var(--bg);background:var(--bg);border-radius:0 0 20px 20px;flex-shrink:0">
          <button class="btn btn-secondary" id="m-cancel">Cancel</button>
          <button class="btn btn-primary" id="m-save" ${m.saving?'disabled':''}>
            ${ic('save',14)} ${m.saving?'Saving…':'Save timesheet'}
          </button>
        </div>
      </div>
    </div>`;
  icons();

  // ── Recalculate total hours as inputs change ──────────────────────
  const recalcTotal = () => {
    const total = [...hrAll('[data-ts-field="hours"]')]
      .reduce((sum, el) => sum + (parseFloat(el.value)||0), 0);
    const el = document.getElementById('ts-total');
    if (el) el.textContent = `Total: ${total % 1 === 0 ? total : total.toFixed(1)} hrs`;
    return total;
  };
  hrAll('[data-ts-field="hours"]').forEach(el =>
    el.addEventListener('input', recalcTotal));
  recalcTotal();

  // ── Week picker: snap to Monday ───────────────────────────────────
  document.getElementById('ts-week')?.addEventListener('change', e => {
    const mon = nearestMonday(e.target.value);
    e.target.value = mon;
    m.form.week_start_date = mon;
    // Rebuild the grid rows to clear previous entries
    const grid = document.getElementById('ts-grid');
    if (grid) grid.innerHTML = TS_DAYS.map((d,i) => entryRow(d,i)).join('');
    hrAll('[data-ts-field="hours"]').forEach(el =>
      el.addEventListener('input', recalcTotal));
    recalcTotal();
  });

  $('mc').addEventListener('click', closeModal);
  $('m-cancel').addEventListener('click', closeModal);
  $('mo').addEventListener('click', e => { if(e.target===$('mo')) closeModal(); });

  $('m-save').addEventListener('click', async () => {
    const personId   = document.getElementById('ts-person')?.value;
    const weekStart  = document.getElementById('ts-week')?.value;
    const status     = document.getElementById('ts-status')?.value || 'Draft';
    const approvedBy = document.getElementById('ts-approved-by')?.value || null;
    const notes      = document.getElementById('ts-notes')?.value || null;
    const totalHrs   = recalcTotal();

    if (!personId || !weekStart) {
      showToast('Please select a Worker and Week Commencing date', 'warn'); return;
    }

    // Collect per-day entries
    const dayEntries = [];
    hrAll('[data-ts-field="hours"]').forEach(el => {
      const hrs = parseFloat(el.value);
      if (!hrs || hrs <= 0) return;
      const idx  = parseInt(el.dataset.tsDay);
      const base = new Date(weekStart);
      base.setDate(base.getDate() + idx);
      const descEl = document.querySelector(`[data-ts-day="${idx}"][data-ts-field="desc"]`);
      dayEntries.push({
        work_date:    base.toISOString().slice(0,10),
        hours_worked: hrs,
        description:  descEl?.value || null,
      });
    });

    m.saving = true; drawTimesheetModal();
    try {
      const tsBody = {
        person_id: personId, week_start_date: weekStart, status,
        approved_by: approvedBy||null, submitted_date: status==='Submitted'?new Date().toISOString().slice(0,10):null,
        approved_date: status==='Approved'?new Date().toISOString().slice(0,10):null,
        total_hours: totalHrs||null, notes,
      };
      let tsId = m.editId;
      if (tsId) {
        await api.update('timesheets', tsId, tsBody);
        // Delete existing entries and re-insert
        const existing = await api.select('timesheet_entries','id',`timesheet_id=eq.${tsId}`);
        if (Array.isArray(existing)) {
          await Promise.all(existing.map(e => api.del('timesheet_entries', e.id)));
        }
      } else {
        const created = await api.insert('timesheets', tsBody);
        tsId = Array.isArray(created) ? created[0]?.id : created?.id;
      }
      // Insert day entries
      if (tsId && dayEntries.length) {
        await Promise.all(dayEntries.map(e => api.insert('timesheet_entries', { ...e, timesheet_id: tsId })));
      }
      clearCache('timesheets');
      closeModal();
      showToast('Timesheet saved', 'success');
      await m.onReload();
    } catch(err) { m.saving = false; drawTimesheetModal(); }
  });
}


// ── Bind dropdown + chart-type events for the analytics section ───────
// Called after the dashboard re-renders so bindings are always fresh.
function _anBindSection(st) {
  [0,1,2,3].forEach(i => {
    document.getElementById('an-lv'+i)?.addEventListener('change', () => {
      st.levels = [0,1,2,3].map(j => document.getElementById('an-lv'+j)?.value||'');
      if (i <= st.path.length) st.path = st.path.slice(0, i);
      _anDraw(st);
    });
  });
  ['doughnut','pie','bar'].forEach(t => {
    document.getElementById('an-ct-'+t)?.addEventListener('click', () => {
      st.type = t;
      ['doughnut','pie','bar'].forEach(u => {
        const b = document.getElementById('an-ct-'+u); if (!b) return;
        b.style.border     = `1px solid ${u===t?'var(--accent)':'var(--border)'}`;
        b.style.background = u===t ? 'var(--accent-light)' : '#fff';
        b.style.color      = u===t ? 'var(--accent)' : 'var(--muted)';
      });
      _anDraw(st);
    });
  });
}

// ════════════════════════════════════════════════════════════════════════
//  ANALYTICS PAGE — Single configurable drill-down pie chart
//  4 dropdowns on the right define each drill level.
//  Clicking a slice updates the SAME chart one level deeper.
// ════════════════════════════════════════════════════════════════════════

const AN_DIMS = [
  { key:'office',   label:'Office Location',
    fn:(p,cd)=> p.office_location_id ? (cd.offMap?.[p.office_location_id]?.name||'Unknown') : 'No Office' },
  { key:'dept',     label:'Department',
    fn:(p,cd)=> p.department_id ? (cd.deptMap?.[p.department_id]?.name||'Unknown') : 'No Department' },
  { key:'emptype',  label:'Employment Type',
    fn:(p,cd)=>{
      const cw=cd.cwMap?.[p.id];
      if(cw==='Contractor'||cw==='Day Rate') return 'Contractor';
      if(cw==='Temp') return 'Temporary';
      if(['Full Time','Part Time'].includes(p.employment_type)) return 'Permanent';
      if(['Fixed Term','Zero Hours','Apprentice'].includes(p.employment_type)) return 'Temporary';
      return 'Other';
    }},
  { key:'agegroup', label:'Age Group',
    fn:(p)=>{ if(!p.dob) return 'Unknown';
      const a=Math.floor((new Date()-new Date(p.dob))/31557600000);
      if(a<25)return'Under 25'; if(a<35)return'25-34'; if(a<45)return'35-44';
      if(a<55)return'45-54';   if(a<65)return'55-64'; return'65+'; }},
  { key:'los',      label:'Length of Service',
    fn:(p)=>{ if(!p.start_date) return 'Unknown';
      const y=(new Date()-new Date(p.start_date))/31557600000;
      if(y<1)return'Under 1yr'; if(y<2)return'1-2 yrs'; if(y<5)return'2-5 yrs';
      if(y<10)return'5-10 yrs'; if(y<20)return'10-20 yrs'; return'20+ yrs'; }},
  { key:'gender',      label:'Gender',            fn:(p)=>p.gender||'Not Specified' },
  { key:'nationality', label:'Nationality',        fn:(p)=>p.nationality||'Not Specified' },
  { key:'jobtitle',    label:'Job Title',
    fn:(p,cd)=>{ const rId=cd.currentRoleMap?.[p.id]; const jId=rId?cd.roleMap?.[rId]?.job_title_id:null;
      return jId?(cd.jtMap?.[jId]?.title||'Unknown'):'No Role'; }},
  { key:'status',   label:'Employment Status',  fn:(p)=>p.status||'Unknown' },
  { key:'eyecolour',label:'Eye Colour',         fn:(p)=>p.eye_colour||'Not Recorded' },
];

let _anPie = null;


function _anDraw(st) {
  const cd=st.cd; if(!cd) return;
  const levels = st.levels.filter(Boolean);
  const depth  = st.path.length;

  // Past all levels — show employee list
  if(depth>0 && depth>=levels.length){ _anShowEmp(st,levels,cd); return; }

  // Ensure canvas is visible, emp list hidden
  const canvas  = document.getElementById('an-canvas');
  const empDiv  = document.getElementById('an-emp-list');
  const tblDiv  = document.getElementById('an-tbl');
  if(canvas)  canvas.style.display='block';
  if(empDiv)  { empDiv.style.display='none'; empDiv.innerHTML=''; }

  // Filter people by path
  let people = cd.active||[];
  st.path.forEach(({key,val})=>{
    const d=AN_DIMS.find(d=>d.key===key);
    if(d) people=people.filter(p=>d.fn(p,cd)===val);
  });

  // Group by current dim
  const dimKey = levels[depth];
  const dim    = AN_DIMS.find(d=>d.key===dimKey);
  const groups = {};
  if(dim) people.forEach(p=>{ const v=dim.fn(p,cd); groups[v]=(groups[v]||0)+1; });
  const labels = Object.keys(groups).sort((a,b)=>groups[b]-groups[a]);
  const data   = labels.map(l=>groups[l]);
  const total  = data.reduce((s,v)=>s+v,0);
  const hasNext= depth<levels.length-1;

  // Breadcrumb
  const crumb=document.getElementById('an-crumb');
  if(crumb){
    const segs=['All Staff',...st.path.map(p=>p.val)];
    crumb.innerHTML=segs.map((s,i)=>
      '<span '+(i<segs.length-1
        ?'class="an-c" data-d="'+i+'" style="color:var(--accent);cursor:pointer;font-weight:500;text-decoration:underline"'
        :'style="color:var(--text);font-weight:700"')+'>'+x(s)+'</span>'
      +(i<segs.length-1?'<span style="color:var(--border);font-size:11px"> › </span>':'')
    ).join('')+(dim?' <span style="color:var(--muted);font-style:italic;font-size:12px">by '+dim.label+'</span>':'');
    crumb.querySelectorAll('.an-c').forEach(el=>
      el.addEventListener('click',()=>{ st.path=st.path.slice(0,parseInt(el.dataset.d)); _anDraw(st); })
    );
  }

  // Header
  const hdr=document.getElementById('an-hdr');
  if(hdr) hdr.innerHTML=dim?
    '<span style="font-weight:700;color:var(--text)">'+dim.label+'</span>'
    +' <span style="color:var(--muted);font-size:12px">'+labels.length+' groups · '+total+' staff</span>'
    +' <span style="color:'+(hasNext?'var(--accent)':'#10b981')+';font-size:11px;font-style:italic">'
    +(hasNext?'click a slice to drill down':'click a slice to see employees')+'</span>':'';

  // Draw chart
  if(_anPie){ try{_anPie.destroy();}catch(e){} _anPie=null; }
  if(canvas && labels.length && typeof Chart!=='undefined'){
    const isBar=st.type==='bar';
    _anPie=new Chart(canvas,{
      type:st.type,
      data:{labels,datasets:[{
        data,
        backgroundColor:labels.map((_,i)=>CHART_PAL[i%CHART_PAL.length]),
        borderWidth:isBar?0:2,borderColor:'#fff',
        hoverOffset:isBar?0:10,borderRadius:isBar?6:0,borderSkipped:false,
      }]},
      options:{
        responsive:true,maintainAspectRatio:false,
        indexAxis:isBar?'y':undefined,
        cutout:st.type==='doughnut'?'60%':undefined,
        onClick:(e,els)=>{
          if(!els.length||!dimKey) return;
          const val=labels[els[0].index];
          const empDiv=document.getElementById('an-emp-list');
          const empShowing=empDiv&&empDiv.style.display!=='none';
          if(empShowing){
            // Chart is at deepest level — swap to whichever slice was clicked
            st.path[st.path.length-1]={key:dimKey,val};
            _anShowEmp(st,levels,cd);
          } else if(!hasNext){
            // Deepest level, employee list not yet open — show it
            st.path.push({key:dimKey,val});
            _anShowEmp(st,levels,cd);
          } else {
            // Not at deepest level — drill down normally
            st.path.push({key:dimKey,val});
            _anDraw(st);
          }
        },
        plugins:{
          legend:{display:!isBar,position:'right',labels:{font:{size:11},boxWidth:12,padding:10}},
          tooltip:{callbacks:{label:c=>
            ' '+c.label+': '+c.raw+' ('+Math.round(c.raw/total*100)+'%) '+(hasNext?'click to drill down':'click for employees')
          }},
        },
        scales:isBar?{x:{beginAtZero:true,ticks:{stepSize:1}},y:{grid:{display:false}}}:undefined,
      }
    });
    canvas.style.cursor='pointer';
  }

  // Table
  if(tblDiv){
    tblDiv.innerHTML=!labels.length?'':
      '<div class="card" style="padding:0;overflow:hidden"><table class="tbl"><thead><tr>'
      +'<th class="th">Group</th><th class="th" style="text-align:right">Count</th>'
      +'<th class="th" style="text-align:right">%</th><th class="th">Distribution</th>'
      +'</tr></thead><tbody>'
      +labels.map((l,i)=>
        '<tr class="tr an-row" data-v="'+x(l)+'" style="cursor:pointer" '
        +'onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'\'">'
        +'<td class="td"><div style="display:flex;align-items:center;gap:8px">'
        +'<div style="width:10px;height:10px;border-radius:50%;background:'+CHART_PAL[i%CHART_PAL.length]+';flex-shrink:0"></div>'
        +'<span style="font-size:13px;font-weight:500">'+x(l)+'</span></div></td>'
        +'<td class="td" style="text-align:right;font-weight:700;color:var(--text)">'+data[i]+'</td>'
        +'<td class="td" style="text-align:right;color:var(--muted)">'+Math.round(data[i]/total*100)+'%</td>'
        +'<td class="td"><div style="background:var(--bg);border-radius:4px;height:6px;overflow:hidden">'
        +'<div style="background:'+CHART_PAL[i%CHART_PAL.length]+';height:100%;width:'+Math.round(data[i]/total*100)+'%;border-radius:4px"></div>'
        +'</div></td></tr>'
      ).join('')
      +'</tbody></table></div>';
    tblDiv.querySelectorAll('.an-row').forEach(row=>
      row.addEventListener('click',()=>{
        if(!dimKey) return;
        st.path.push({key:dimKey,val:row.dataset.v});
        _anDraw(st);
      })
    );
  }

  // Stats
  _anStats(st,total);
}

function _anShowEmp(st,levels,cd){
  let people=cd.active||[];
  st.path.forEach(({key,val})=>{
    const d=AN_DIMS.find(d=>d.key===key);
    if(d) people=people.filter(p=>d.fn(p,cd)===val);
  });

  const empDiv=document.getElementById('an-emp-list');
  const tblDiv=document.getElementById('an-tbl');
  // ── Chart stays visible — employee list appears BELOW it ─────────────
  if(tblDiv) tblDiv.innerHTML='';

  // Breadcrumb
  const crumb=document.getElementById('an-crumb');
  if(crumb){
    const segs=['All Staff',...st.path.map(p=>p.val)];
    crumb.innerHTML=segs.map((s,i)=>
      '<span '+(i<segs.length-1
        ?'class="an-c" data-d="'+i+'" style="color:var(--accent);cursor:pointer;font-weight:500;text-decoration:underline"'
        :'style="color:var(--text);font-weight:700"')+'>'+x(s)+'</span>'
      +(i<segs.length-1?'<span style="color:var(--border);font-size:11px"> › </span>':'')
    ).join('');
    crumb.querySelectorAll('.an-c').forEach(el=>
      el.addEventListener('click',()=>{ st.path=st.path.slice(0,parseInt(el.dataset.d)); _anDraw(st); })
    );
  }

  // Update header — show employee count + close button (no "Back", chart stays)
  const hdr=document.getElementById('an-hdr');
  if(hdr) hdr.innerHTML=
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">'
    +'<div>'
    +'<span style="font-weight:700;color:var(--text)">'+x(st.path[st.path.length-1]?.val||'Employees')+'</span>'
    +' <span style="color:var(--muted);font-size:12px;margin-left:6px">'+people.length+' employee'+(people.length!==1?'s':'')+'</span>'
    +'</div>'
    +' <button id="an-close-emp" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1;padding:2px 6px;border-radius:4px" title="Close employee list">×</button>'
    +'</div>';
  icons();

  // Employee list — shown below the chart, inside the same card
  if(empDiv){
    empDiv.style.display='block';
    empDiv.style.borderTop='1px solid var(--bg)';
    empDiv.style.marginTop='16px';
    empDiv.style.paddingTop='16px';
    empDiv.innerHTML=
      '<p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">'
      +ic('users',11)+' Employees in this group</p>'
      +renderEmployeeListHTML(people,cd);
    bindEmployeeList(empDiv);
  }

  _anStats(st,people.length);

  // × button: just hides the employee list without removing the drill state
  document.getElementById('an-close-emp')?.addEventListener('click',()=>{
    if(empDiv){empDiv.style.display='none';empDiv.innerHTML='';}
    // Reset header back to chart header
    const dimKey=levels[levels.length-1];
    const dim=AN_DIMS.find(d=>d.key===dimKey);
    if(hdr) hdr.innerHTML=dim?
      '<span style="font-weight:700;color:var(--text)">'+dim.label+'</span>'
      +' <span style="color:var(--muted);font-size:12px">click a slice to see employees</span>':'';
  });
}

function _anStats(st,total){
  const el=document.getElementById('an-stats'); if(!el) return;
  el.innerHTML=
    '<p style="font-size:11px;color:var(--muted);margin-bottom:3px">Showing</p>'
    +'<p class="font-display" style="font-size:26px;font-weight:800;color:var(--text);line-height:1">'+total+'</p>'
    +'<p style="font-size:11px;color:var(--muted);margin-top:3px;margin-bottom:'+(st.path.length?'12':'0')+'px">'
    +(st.path.length?st.path.map(p=>x(p.val)).join(' \u203a '):'all active employees')+'</p>'
    +(st.path.length?'<button id="an-reset" class="btn btn-secondary" style="width:100%;font-size:12px">Reset</button>':'');
  icons();
  document.getElementById('an-reset')?.addEventListener('click',()=>{ st.path=[]; _anDraw(st); });
}


// ════════════════════════════════════════════════════════════════════════
//  PERFORMANCE MODULE
//  Tabs: Reviews · Objectives · PIPs · Succession
// ════════════════════════════════════════════════════════════════════════
const PERF_TABS = [
  { id:'reviews',    label:'Reviews',          icon:'clipboard-list' },
  { id:'objectives', label:'Objectives',       icon:'target'         },
  { id:'pips',       label:'PIPs',             icon:'alert-triangle' },
  { id:'succession', label:'Succession',       icon:'git-branch'     },
  { id:'mentoring',  label:'Mentoring',        icon:'users'          },
];
async function pagePerformance() {
  await Promise.all([
    cached('people','people','id,first_name,last_name,employee_number'),
    cached('roles','roles','id,job_title_id,department_id'),
    cached('job_titles','job_titles','id,title'),
    cached('departments','departments','id,name'),
  ]);
  S.crudSearch=''; if(!S.perfTab) S.perfTab='reviews';
  await loadPerfTab();
}
async function loadPerfTab() {
  const t={reviews:'performance_reviews',objectives:'objectives',pips:'pip_records',succession:'succession_plans',mentoring:'mentoring_relationships'}[S.perfTab];
  clearCache(t); await cached(t,t);
  renderPerformance();
}
function renderPerformance() {
  const pc=$('hr-page-content'); if(!pc) return;
  const RATING={1:'⭐ Unsatisfactory',2:'⭐⭐ Needs Improvement',3:'⭐⭐⭐ Meets Expectations',4:'⭐⭐⭐⭐ Exceeds Expectations',5:'⭐⭐⭐⭐⭐ Outstanding'};
  const RATING_C={1:'#ef4444',2:'#f97316',3:'#f59e0b',4:'#10b981',5:'var(--accent)'};
  const OBJ_SC={'Not Started':'var(--muted)','In Progress':'#3b82f6','Complete':'#10b981','Overdue':'#ef4444','Cancelled':'var(--muted)'};
  const PIP_SC={'Ongoing':'#f59e0b','Successful':'#10b981','Unsuccessful':'#ef4444','Resigned':'var(--muted)','Dismissed':'#7c3aed'};
  const READ_SC={'Ready Now':'#10b981','Ready in 1-2 Years':'#3b82f6','Ready in 3-5 Years':'#f59e0b','Development Needed':'#ef4444'};

  const getConfig=()=>{
    if(S.perfTab==='reviews') {
      const records=S.cache.performance_reviews||[];
      return {config:{table:'performance_reviews',title:'Performance Reviews',subtitle:'All performance and probation reviews',addLabel:'Add Review',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Conducted By',render:r=>r.conducted_by?personName(r.conducted_by):'—'},
          {label:'Date',render:r=>dateCell(r.review_date)},
          {label:'Probation',render:r=>r.probation_review?'<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Probation</span>':'—'},
          {label:'Rating',render:r=>r.rating_score?`<span class="badge" style="background:${RATING_C[r.rating_score]}18;color:${RATING_C[r.rating_score]};border:1px solid ${RATING_C[r.rating_score]}28">${RATING[r.rating_score]}</span>`:'—'},
          {label:'Next Review',render:r=>dateCell(r.next_review_date,60)},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'conducted_by',label:'Conducted By',type:'select',options:personOpts},
          {key:'review_date',label:'Review Date',required:true,type:'date'},
          {key:'probation_review',label:'Probation Review?',type:'select',options:[{value:'true',label:'Yes'},{value:'false',label:'No'}]},
          {key:'rating_score',label:'Overall Rating',type:'select',options:[{value:'1',label:'1 – Unsatisfactory'},{value:'2',label:'2 – Needs Improvement'},{value:'3',label:'3 – Meets Expectations'},{value:'4',label:'4 – Exceeds Expectations'},{value:'5',label:'5 – Outstanding'}]},
          {key:'next_review_date',label:'Next Review Date',type:'date'},
          {key:'objectives',label:'Objectives Set',type:'textarea'},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    if(S.perfTab==='objectives') {
      const records=S.cache.objectives||[];
      return {config:{table:'objectives',title:'Objectives',subtitle:'Individual objectives and targets',addLabel:'Add Objective',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Objective',render:r=>`<span style="font-weight:500">${x(r.title||'—')}</span>`},
          {label:'Target Date',render:r=>dateCell(r.target_date,14)},
          {label:'Status',render:r=>statusBadge(r.status||'Not Started',OBJ_SC)},
          {label:'Weight',render:r=>r.weight?`<span style="font-size:12px">${x(String(r.weight))}%</span>`:'—'},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'title',label:'Objective Title',required:true},
          {key:'description',label:'Description',type:'textarea'},
          {key:'target_date',label:'Target Date',type:'date'},
          {key:'weight',label:'Weighting (%)',type:'number',hint:'Optional % weighting for this objective'},
          {key:'status',label:'Status',type:'select',options:['Not Started','In Progress','Complete','Overdue','Cancelled']},
        ],
      },records};
    }
    if(S.perfTab==='pips') {
      const records=S.cache.pip_records||[];
      return {config:{table:'pip_records',title:'Performance Improvement Plans',subtitle:'PIPs with targets, reviews and outcomes',addLabel:'Add PIP',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Start',render:r=>dateCell(r.start_date)},
          {label:'Review Date',render:r=>dateCell(r.review_date,7)},
          {label:'End Date',render:r=>r.end_date?dateCell(r.end_date):'<span style="color:#f59e0b;font-size:12px">Ongoing</span>'},
          {label:'Outcome',render:r=>r.outcome?statusBadge(r.outcome,PIP_SC):'<span style="color:var(--muted)">Pending</span>'},
          {label:'Conducted By',render:r=>r.conducted_by?personName(r.conducted_by):'—'},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'conducted_by',label:'Conducted By',type:'select',options:personOpts},
          {key:'start_date',label:'PIP Start Date',required:true,type:'date'},
          {key:'end_date',label:'PIP End Date',type:'date'},
          {key:'reason',label:'Reason for PIP',type:'textarea'},
          {key:'targets',label:'Improvement Targets',type:'textarea'},
          {key:'review_date',label:'Review Date',type:'date'},
          {key:'outcome',label:'Outcome',type:'select',options:['Ongoing','Successful','Unsuccessful','Resigned','Dismissed']},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    if(S.perfTab==='succession') {
      const records=S.cache.succession_plans||[];
      const roleOpts=()=>mkOpts(S.cache.roles||[],'id',r=>{const jt=(S.cache.job_titles||[]).find(j=>j.id===r.job_title_id);const d=(S.cache.departments||[]).find(d=>d.id===r.department_id);return `${jt?.title||'?'} (${d?.name||'?'})`;});
      return {config:{table:'succession_plans',title:'Succession Planning',subtitle:'Key role successors and development readiness',addLabel:'Add Plan',wide:true,
        columns:[
          {label:'Role',render:r=>{const ro=(S.cache.roles||[]).find(x=>x.id===r.role_id);const jt=(S.cache.job_titles||[]).find(j=>j.id===ro?.job_title_id);return x(jt?.title||'—');}},
          {label:'Primary Successor',render:r=>personName(r.primary_successor_id)},
          {label:'Secondary Successor',render:r=>r.secondary_successor_id?personName(r.secondary_successor_id):'—'},
          {label:'Readiness',render:r=>r.readiness?statusBadge(r.readiness,READ_SC):'—'},
        ],
        fields:[
          {key:'role_id',label:'Role',required:true,type:'select',options:roleOpts},
          {key:'primary_successor_id',label:'Primary Successor',required:true,type:'select',options:personOpts},
          {key:'secondary_successor_id',label:'Secondary Successor',type:'select',options:personOpts},
          {key:'readiness',label:'Readiness',type:'select',options:['Ready Now','Ready in 1-2 Years','Ready in 3-5 Years','Development Needed']},
          {key:'development_needed',label:'Development Required',type:'textarea'},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    // mentoring
    const records=S.cache.mentoring_relationships||[];
    const MEN_SC={Active:'#10b981',Completed:'#3b82f6',Paused:'#f59e0b'};
    return {config:{table:'mentoring_relationships',title:'Mentoring Relationships',subtitle:'Mentor and mentee pairings',addLabel:'Add Relationship',wide:false,
      columns:[
        {label:'Mentor',render:r=>personName(r.mentor_id)},
        {label:'Mentee',render:r=>personName(r.mentee_id)},
        {label:'Focus Areas',render:r=>r.focus_areas?`<span style="font-size:12px;color:var(--muted)">${x(r.focus_areas.slice(0,50))}${r.focus_areas.length>50?'…':''}</span>`:'—'},
        {label:'Frequency',key:'meeting_frequency'},
        {label:'Status',render:r=>statusBadge(r.status||'Active',MEN_SC)},
      ],
      fields:[
        {key:'mentor_id',label:'Mentor',required:true,type:'select',options:personOpts},
        {key:'mentee_id',label:'Mentee',required:true,type:'select',options:personOpts},
        {key:'start_date',label:'Start Date',type:'date'},
        {key:'end_date',label:'End Date',type:'date'},
        {key:'focus_areas',label:'Focus Areas',type:'textarea'},
        {key:'meeting_frequency',label:'Meeting Frequency',type:'select',options:['Weekly','Fortnightly','Monthly','Ad hoc']},
        {key:'status',label:'Status',type:'select',options:['Active','Completed','Paused']},
        {key:'notes',label:'Notes',type:'textarea'},
      ],
    },records};
  };

  const {config,records}=getConfig();
  pc.innerHTML=`
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Performance</h1>
      <p style="color:var(--muted);font-size:14px">Reviews · Objectives · PIPs · Succession Planning · Mentoring</p>
    </div>
    ${subTabBar(PERF_TABS,S.perfTab,'perfTab')}
    ${renderCRUD(config,records)}`;
  icons();
  bindSubTabs(()=>{S.crudSearch='';loadPerfTab();});
  bindCRUD(config,records,loadPerfTab);
}

// ════════════════════════════════════════════════════════════════════════
//  LEAVE MODULE
//  Tabs: Requests · Entitlements · Calendar
// ════════════════════════════════════════════════════════════════════════
const LEAVE_TABS=[
  {id:'requests',     label:'Leave Requests',   icon:'calendar'},
  {id:'entitlements', label:'Entitlements',      icon:'layers'},
];
async function pageLeave() {
  await Promise.all([
    cached('people','people','id,first_name,last_name,employee_number'),
    cached('leave_types','leave_types','id,name,colour,default_days'),
  ]);
  S.crudSearch=''; if(!S.leaveTab) S.leaveTab='requests';
  await loadLeaveTab();
}
async function loadLeaveTab() {
  const t={requests:'leave_requests',entitlements:'leave_entitlements'}[S.leaveTab];
  clearCache(t); await cached(t,t);
  renderLeave();
}
function renderLeave() {
  const pc=$('hr-page-content'); if(!pc) return;
  const REQ_SC={Pending:'#f59e0b',Approved:'#10b981',Declined:'#ef4444',Cancelled:'var(--muted)'};
  const ltName=id=>resolve('leave_types',id,'name');
  const ltColour=id=>{const lt=(S.cache.leave_types||[]).find(l=>l.id===id);return lt?.colour||'#3b82f6';};

  const getConfig=()=>{
    if(S.leaveTab==='requests') {
      const records=(S.cache.leave_requests||[]).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      return {config:{table:'leave_requests',title:'Leave Requests',subtitle:'All leave requests — pending, approved and historical',addLabel:'Record Leave',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Type',render:r=>{const c=ltColour(r.leave_type_id);const n=ltName(r.leave_type_id);return n?`<span class="badge" style="background:${c}18;color:${c};border:1px solid ${c}28">${n}</span>`:'—';}},
          {label:'Start',render:r=>dateCell(r.start_date)},
          {label:'End',render:r=>dateCell(r.end_date)},
          {label:'Days',render:r=>`<span style="font-weight:700">${r.total_days}</span>`},
          {label:'Status',render:r=>statusBadge(r.status||'Pending',REQ_SC)},
          {label:'Approved By',render:r=>r.approved_by?personName(r.approved_by):'—'},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'leave_type_id',label:'Leave Type',required:true,type:'select',options:()=>mkOpts(S.cache.leave_types||[],'id','name')},
          {key:'start_date',label:'Start Date',required:true,type:'date'},
          {key:'end_date',label:'End Date',required:true,type:'date'},
          {key:'total_days',label:'Total Days',required:true,type:'number',hint:'Excluding weekends and bank holidays'},
          {key:'half_day',label:'Half Day?',type:'select',options:[{value:'false',label:'No — full days'},{value:'true',label:'Yes — half day'}]},
          {key:'half_day_period',label:'Half Day Period',type:'select',options:['Morning','Afternoon'],visibleIf:{field:'half_day',value:'true'}},
          {key:'status',label:'Status',type:'select',options:['Pending','Approved','Declined','Cancelled']},
          {key:'approved_by',label:'Approved By',type:'select',options:personOpts},
          {key:'approved_date',label:'Approval Date',type:'date'},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    // entitlements
    const records=S.cache.leave_entitlements||[];
    return {config:{table:'leave_entitlements',title:'Leave Entitlements',subtitle:'Annual entitlements per employee per year',addLabel:'Set Entitlement',wide:true,
      columns:[
        {label:'Employee',render:r=>personName(r.person_id)},
        {label:'Leave Type',render:r=>ltName(r.leave_type_id)},
        {label:'Year',key:'year'},
        {label:'Entitlement',render:r=>`<span style="font-weight:700">${r.days_entitlement} days</span>`},
        {label:'Carried Over',render:r=>r.days_carried_over?`<span style="font-size:12px;color:var(--muted)">+${r.days_carried_over}</span>`:'—'},
        {label:'Adjustment',render:r=>r.days_adjustment?`<span style="font-size:12px;color:${r.days_adjustment>0?'#10b981':'#ef4444'}">${r.days_adjustment>0?'+':''}${r.days_adjustment} (${x(r.adjustment_reason||'')})</span>`:'—'},
      ],
      fields:[
        {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
        {key:'leave_type_id',label:'Leave Type',required:true,type:'select',options:()=>mkOpts(S.cache.leave_types||[],'id','name')},
        {key:'year',label:'Year',required:true,type:'number',hint:'e.g. 2025'},
        {key:'days_entitlement',label:'Days Entitlement',required:true,type:'number'},
        {key:'days_carried_over',label:'Days Carried Over',type:'number'},
        {key:'days_adjustment',label:'Adjustment (days)',type:'number',hint:'Positive or negative adjustment'},
        {key:'adjustment_reason',label:'Adjustment Reason'},
      ],
    },records};
  };

  const {config,records}=getConfig();
  pc.innerHTML=`
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Leave Management</h1>
      <p style="color:var(--muted);font-size:14px">Annual leave · sick leave · maternity · paternity · TOIL</p>
    </div>
    ${subTabBar(LEAVE_TABS,S.leaveTab,'leaveTab')}
    ${renderCRUD(config,records)}`;
  icons();
  bindSubTabs(()=>{S.crudSearch='';loadLeaveTab();});
  bindCRUD(config,records,loadLeaveTab);
}

// ════════════════════════════════════════════════════════════════════════
//  COMPLIANCE MODULE
//  Tabs: Documents · DBS · Driving Licence · Occ Health · RTW · Bradford
// ════════════════════════════════════════════════════════════════════════
const COMP_TABS=[
  {id:'documents',  label:'Documents',        icon:'file-text'},
  {id:'dbs',        label:'DBS Checks',       icon:'shield-check'},
  {id:'driving',    label:'Driving Licences', icon:'car'},
  {id:'oh',         label:'Occ. Health',      icon:'activity'},
  {id:'rtw',        label:'Return to Work',   icon:'user-check'},
  {id:'bradford',   label:'Bradford Factor',  icon:'bar-chart-2'},
];
async function pageCompliance() {
  await Promise.all([
    cached('people','people','id,first_name,last_name,employee_number'),
    cached('sickness_records','sickness_records','*'),
    cached('interactions','interactions','id,person_id,interaction_date,interaction_type_id'),
  ]);
  S.crudSearch=''; if(!S.compTab) S.compTab='documents';
  await loadCompTab();
}
async function loadCompTab() {
  if(S.compTab==='bradford') { renderCompliance(); return; }
  const t={documents:'person_documents',dbs:'dbs_checks',driving:'driving_licence_checks',oh:'oh_referrals',rtw:'return_to_work_forms'}[S.compTab];
  clearCache(t); await cached(t,t);
  renderCompliance();
}
function renderCompliance() {
  const pc=$('hr-page-content'); if(!pc) return;
  const DBS_SC={Pending:'#f59e0b',Clear:'#10b981','Issues Found':'#ef4444',Expired:'var(--muted)','Not Required':'var(--muted)'};
  const DL_SC={Pass:'#10b981',Fail:'#ef4444','Issues Found':'#f97316','Not Checked':'var(--muted)'};

  if(S.compTab==='bradford') {
    // Calculate Bradford Factor: B = S² × D
    const now=new Date();
    const people=S.cache.people||[];
    const interactions=S.cache.interactions||[];
    const sickRecords=S.cache.sickness_records||[];
    const oneYear=new Date(now.getTime()-365*86400000);

    const bradfordData=people.map(p=>{
      const sickInts=interactions.filter(i=>i.person_id===p.id&&new Date(i.interaction_date)>oneYear);
      const S_count=sickInts.length;
      const D_days=sickRecords.filter(sr=>sickInts.find(i=>i.id===sr.interaction_id)).reduce((acc,sr)=>{
        if(!sr.return_to_work_date) return acc+1;
        const intRow=sickInts.find(i=>i.id===sr.interaction_id);
        if(!intRow) return acc+1;
        const days=Math.max(1,Math.round((new Date(sr.return_to_work_date)-new Date(intRow.interaction_date))/86400000));
        return acc+days;
      },0);
      const B=S_count*S_count*D_days;
      return {person_id:p.id,name:`${p.first_name||''} ${p.last_name||''}`.trim(),S_count,D_days,B};
    }).filter(d=>d.B>0).sort((a,b)=>b.B-a.B);

    const bColour=b=>b>=450?'#ef4444':b>=200?'#f97316':b>=75?'#f59e0b':'#10b981';
    const bLabel=b=>b>=450?'Trigger — formal review':b>=200?'Elevated — review recommended':b>=75?'Moderate — monitor closely':'Low';

    pc.innerHTML=`
      <div style="margin-bottom:28px">
        <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Compliance</h1>
        <p style="color:var(--muted);font-size:14px">Bradford Factor · Documents · DBS · Driving · Occupational Health · RTW</p>
      </div>
      ${subTabBar(COMP_TABS,S.compTab,'compTab')}
      <div style="margin-bottom:16px;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:10px;padding:14px 18px;font-size:13px;color:var(--warn-text)">
        ${ic('info',14)} Bradford Factor = S² × D (S = number of sickness spells, D = total days absent in last 12 months).
        Trigger thresholds: <strong>75+</strong> monitor · <strong>200+</strong> review · <strong>450+</strong> formal action
      </div>
      <div class="card">
        ${bradfordData.length===0?`<div class="empty"><p style="color:var(--muted)">No sickness absence data in the last 12 months</p></div>`:`
        <table class="tbl"><thead><tr>
          <th class="th">Employee</th><th class="th" style="text-align:right">Spells (S)</th>
          <th class="th" style="text-align:right">Days (D)</th>
          <th class="th" style="text-align:right">Score (B)</th>
          <th class="th">Level</th>
        </tr></thead><tbody>
        ${bradfordData.map(d=>`<tr class="tr">
          <td class="td" style="font-weight:500">${x(d.name)}</td>
          <td class="td" style="text-align:right">${d.S_count}</td>
          <td class="td" style="text-align:right">${d.D_days}</td>
          <td class="td" style="text-align:right;font-weight:700;color:${bColour(d.B)}">${d.B}</td>
          <td class="td"><span class="badge" style="background:${bColour(d.B)}18;color:${bColour(d.B)};border:1px solid ${bColour(d.B)}28">${bLabel(d.B)}</span></td>
        </tr>`).join('')}
        </tbody></table>`}
      </div>`;
    icons();
    bindSubTabs(()=>{S.crudSearch='';loadCompTab();});
    return;
  }

  const getConfig=()=>{
    if(S.compTab==='documents') {
      const records=S.cache.person_documents||[];
      return {config:{table:'person_documents',title:'Documents',subtitle:'Passports, visas, right to work and other personal documents — red = expired',addLabel:'Add Document',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Document Type',render:r=>`<span class="badge" style="background:var(--bg);color:var(--text)">${x(r.document_type||'—')}</span>`},
          {label:'Reference',render:r=>r.reference_number?`<span style="font-family:monospace;font-size:12px">${x(r.reference_number)}</span>`:'—'},
          {label:'Issue Date',render:r=>dateCell(r.issue_date)},
          {label:'Expiry',render:r=>r.expiry_date?dateCell(r.expiry_date,60):'<span class="badge" style="background:var(--bg);color:var(--muted)">No expiry</span>'},
          {label:'Verified',render:r=>r.verified_date?`<span class="badge" style="background:var(--ok-bg);color:#16a34a">✓ ${x(r.verified_date)}</span>`:'<span style="color:var(--muted)">Not verified</span>'},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'document_type',label:'Document Type',required:true,type:'select',options:['Passport','Driving Licence','NI Card','Birth Certificate','DBS Certificate','Visa / BRP','Share Code','Other']},
          {key:'reference_number',label:'Reference / Document Number'},
          {key:'issue_date',label:'Issue Date',type:'date'},
          {key:'expiry_date',label:'Expiry Date',type:'date',hint:'Leave blank if no expiry'},
          {key:'issuing_authority',label:'Issuing Authority'},
          {key:'verified_by',label:'Verified By',type:'select',options:personOpts},
          {key:'verified_date',label:'Date Verified',type:'date'},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    if(S.compTab==='dbs') {
      const records=S.cache.dbs_checks||[];
      return {config:{table:'dbs_checks',title:'DBS Checks',subtitle:'Disclosure and Barring Service checks — amber = expiring within 60 days',addLabel:'Add DBS Check',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Check Type',render:r=>`<span class="badge" style="background:var(--bg);color:var(--text)">${x(r.check_type||'—')}</span>`},
          {label:'Certificate No.',render:r=>r.certificate_number?`<span style="font-family:monospace;font-size:12px">${x(r.certificate_number)}</span>`:'—'},
          {label:'Issue Date',render:r=>dateCell(r.issue_date)},
          {label:'Expiry',render:r=>r.expiry_date?dateCell(r.expiry_date,60):'<span class="badge" style="background:var(--bg);color:var(--muted)">No expiry</span>'},
          {label:'Status',render:r=>statusBadge(r.status||'Pending',DBS_SC)},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'check_type',label:'Check Type',required:true,type:'select',options:['Basic','Standard','Enhanced','Enhanced with Barred Lists']},
          {key:'certificate_number',label:'Certificate Number'},
          {key:'application_date',label:'Application Date',type:'date'},
          {key:'issue_date',label:'Issue Date',type:'date'},
          {key:'expiry_date',label:'Expiry Date',type:'date'},
          {key:'status',label:'Status',type:'select',options:['Pending','Clear','Issues Found','Expired','Not Required']},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    if(S.compTab==='driving') {
      const records=S.cache.driving_licence_checks||[];
      return {config:{table:'driving_licence_checks',title:'Driving Licence Checks',subtitle:'For employees with company vehicles or car allowances',addLabel:'Add Check',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Licence No.',render:r=>r.licence_number?`<span style="font-family:monospace;font-size:12px">${x(r.licence_number)}</span>`:'—'},
          {label:'Expiry',render:r=>dateCell(r.expiry_date,60)},
          {label:'Check Date',render:r=>dateCell(r.check_date)},
          {label:'Points',render:r=>r.points!=null?`<span style="font-weight:700;color:${r.points>=9?'#ef4444':r.points>=6?'#f59e0b':'#10b981'}">${r.points}</span>`:'—'},
          {label:'Result',render:r=>r.result?statusBadge(r.result,DL_SC):'—'},
          {label:'Next Check',render:r=>dateCell(r.next_check_date,30)},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'licence_number',label:'Licence Number'},
          {key:'expiry_date',label:'Licence Expiry',type:'date'},
          {key:'check_date',label:'Date Checked',required:true,type:'date'},
          {key:'categories',label:'Licence Categories',hint:'e.g. B, C1, C'},
          {key:'endorsements',label:'Endorsements / Convictions'},
          {key:'points',label:'Penalty Points',type:'number'},
          {key:'result',label:'Check Result',type:'select',options:['Pass','Fail','Issues Found','Not Checked']},
          {key:'next_check_date',label:'Next Check Date',type:'date'},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    if(S.compTab==='oh') {
      const records=S.cache.oh_referrals||[];
      return {config:{table:'oh_referrals',title:'Occupational Health Referrals',subtitle:'OH referrals, appointments and recommendations',addLabel:'Add Referral',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Referral Date',render:r=>dateCell(r.referral_date)},
          {label:'Reason',render:r=>r.reason?`<span style="font-size:12px;color:var(--muted)">${x(r.reason.slice(0,50))}${r.reason.length>50?'…':''}</span>`:'—'},
          {label:'Referred By',render:r=>r.referred_by?personName(r.referred_by):'—'},
          {label:'Appointment',render:r=>dateCell(r.appointment_date)},
          {label:'Follow Up',render:r=>dateCell(r.follow_up_date,7)},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'referred_by',label:'Referred By',type:'select',options:personOpts},
          {key:'referral_date',label:'Referral Date',required:true,type:'date'},
          {key:'reason',label:'Reason for Referral',type:'textarea'},
          {key:'appointment_date',label:'OH Appointment Date',type:'date'},
          {key:'outcome',label:'OH Outcome',type:'textarea'},
          {key:'recommendations',label:'Recommendations',type:'textarea'},
          {key:'follow_up_date',label:'Follow-Up Date',type:'date'},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    // RTW
    const records=S.cache.return_to_work_forms||[];
    return {config:{table:'return_to_work_forms',title:'Return to Work Forms',subtitle:'Return to work meetings following sickness absence',addLabel:'Add RTW Form',wide:true,
      columns:[
        {label:'Employee',render:r=>personName(r.person_id)},
        {label:'Meeting Date',render:r=>dateCell(r.meeting_date)},
        {label:'Conducted By',render:r=>r.conducted_by?personName(r.conducted_by):'—'},
        {label:'Phased Return',render:r=>(r.phased_return==='true'||r.phased_return===true)?'<span class="badge" style="background:var(--warn-bg);color:var(--warn-text)">Phased</span>':'—'},
        {label:'Adjusted Duties',render:r=>(r.adjusted_duties==='true'||r.adjusted_duties===true)?'<span class="badge" style="background:#ede9fe;color:#7c3aed">Adjusted</span>':'—'},
        {label:'Next Review',render:r=>dateCell(r.next_review_date,7)},
      ],
      fields:[
        {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
        {key:'conducted_by',label:'Conducted By',type:'select',options:personOpts},
        {key:'meeting_date',label:'Meeting Date',required:true,type:'date'},
        {key:'employee_fit',label:'Employee Fit for Work?',type:'select',options:[{value:'true',label:'Yes — fit for work'},{value:'false',label:'No — further absence'}]},
        {key:'phased_return',label:'Phased Return Agreed?',type:'select',options:[{value:'true',label:'Yes'},{value:'false',label:'No'}]},
        {key:'adjusted_duties',label:'Adjusted Duties Agreed?',type:'select',options:[{value:'true',label:'Yes'},{value:'false',label:'No'}]},
        {key:'support_agreed',label:'Support Agreed',type:'textarea'},
        {key:'next_review_date',label:'Next Review Date',type:'date'},
        {key:'notes',label:'Notes',type:'textarea'},
      ],
    },records};
  };

  const {config,records}=getConfig();
  pc.innerHTML=`
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Compliance</h1>
      <p style="color:var(--muted);font-size:14px">Documents · DBS · Driving · Occupational Health · Return to Work · Bradford Factor</p>
    </div>
    ${subTabBar(COMP_TABS,S.compTab,'compTab')}
    ${renderCRUD(config,records)}`;
  icons();
  bindSubTabs(()=>{S.crudSearch='';loadCompTab();});
  bindCRUD(config,records,loadCompTab);
}

// ════════════════════════════════════════════════════════════════════════
//  BENEFITS MODULE
// ════════════════════════════════════════════════════════════════════════
const BEN_TABS=[
  {id:'benefits',    label:'Employee Benefits', icon:'gift'},
  {id:'bank',        label:'Bank Details',      icon:'credit-card'},
  {id:'working',     label:'Working Patterns',  icon:'clock'},
  {id:'nextofkin',   label:'Next of Kin',       icon:'heart'},
];
async function pageBenefits() {
  await Promise.all([
    cached('people','people','id,first_name,last_name,employee_number'),
    cached('benefit_types','benefit_types','id,name,category'),
  ]);
  S.crudSearch=''; if(!S.benTab) S.benTab='benefits';
  await loadBenTab();
}
async function loadBenTab() {
  const t={benefits:'employee_benefits',bank:'bank_details',working:'working_patterns',nextofkin:'next_of_kin'}[S.benTab];
  clearCache(t); await cached(t,t);
  renderBenefits();
}
function renderBenefits() {
  const pc=$('hr-page-content'); if(!pc) return;
  const getConfig=()=>{
    if(S.benTab==='benefits') {
      const records=S.cache.employee_benefits||[];
      return {config:{table:'employee_benefits',title:'Employee Benefits',subtitle:'Benefits and their employer / employee contributions',addLabel:'Add Benefit',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Benefit',render:r=>resolve('benefit_types',r.benefit_type_id,'name')},
          {label:'Provider',key:'provider'},
          {label:'Start',render:r=>dateCell(r.start_date)},
          {label:'End',render:r=>r.end_date?dateCell(r.end_date):'<span class="badge" style="background:var(--ok-bg);color:#16a34a">Active</span>'},
          {label:'Employer £',render:r=>r.employer_contribution!=null?`<span style="font-weight:600">£${Number(r.employer_contribution).toFixed(2)}/mo</span>`:'—'},
          {label:'Employee £',render:r=>r.employee_contribution!=null?`<span style="font-size:12px;color:var(--muted)">£${Number(r.employee_contribution).toFixed(2)}/mo</span>`:'—'},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'benefit_type_id',label:'Benefit',required:true,type:'select',options:()=>mkOpts(S.cache.benefit_types||[],'id',r=>`${r.name}${r.category?' ('+r.category+')':''}`)},
          {key:'provider',label:'Provider',hint:'e.g. Bupa, Aviva, NEST'},
          {key:'start_date',label:'Start Date',type:'date'},
          {key:'end_date',label:'End Date',type:'date',hint:'Leave blank if ongoing'},
          {key:'employer_contribution',label:'Employer Contribution (£/month)',type:'number'},
          {key:'employee_contribution',label:'Employee Contribution (£/month)',type:'number'},
          {key:'notes',label:'Notes',type:'textarea'},
        ],
      },records};
    }
    if(S.benTab==='bank') {
      const records=S.cache.bank_details||[];
      return {config:{table:'bank_details',title:'Bank Details',subtitle:'Payment details for payroll — handle with care',addLabel:'Add Bank Details',wide:false,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Account Name',key:'account_name'},
          {label:'Bank',key:'bank_name'},
          {label:'Sort Code',render:r=>r.sort_code?`<span style="font-family:monospace">${x(r.sort_code)}</span>`:'—'},
          {label:'Acc. No.',render:r=>r.account_number?`<span style="font-family:monospace">****${x(r.account_number.slice(-4))}</span>`:'—'},
          {label:'Method',render:r=>statusBadge(r.payment_method||'BACS',{BACS:'#3b82f6',CHAPS:'#8b5cf6',Cheque:'#f59e0b'})},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'account_name',label:'Account Name'},
          {key:'bank_name',label:'Bank / Building Society Name'},
          {key:'sort_code',label:'Sort Code',hint:'Format: 00-00-00'},
          {key:'account_number',label:'Account Number'},
          {key:'building_society_roll',label:'Building Society Roll Number',hint:'If applicable'},
          {key:'payment_method',label:'Payment Method',type:'select',options:['BACS','CHAPS','Cheque']},
        ],
      },records};
    }
    if(S.benTab==='working') {
      const records=S.cache.working_patterns||[];
      return {config:{table:'working_patterns',title:'Working Patterns',subtitle:'Contracted hours, remote working and shift arrangements',addLabel:'Add Pattern',wide:true,
        columns:[
          {label:'Employee',render:r=>personName(r.person_id)},
          {label:'Pattern',render:r=>r.pattern_name?`<span style="font-weight:500">${x(r.pattern_name)}</span>`:'—'},
          {label:'Hours/Week',render:r=>r.contracted_hours?`<span style="font-weight:700">${r.contracted_hours}h</span>`:'—'},
          {label:'Office Days',render:r=>r.office_days!=null?`<span style="font-size:12px">${r.office_days}d</span>`:'—'},
          {label:'Remote Days',render:r=>r.remote_days!=null?`<span style="font-size:12px">${r.remote_days}d</span>`:'—'},
          {label:'Effective From',render:r=>dateCell(r.effective_from)},
          {label:'Effective To',render:r=>r.effective_to?dateCell(r.effective_to):'<span class="badge" style="background:var(--ok-bg);color:#16a34a">Current</span>'},
        ],
        fields:[
          {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
          {key:'pattern_name',label:'Pattern Name',hint:'e.g. Standard 37.5h, Compressed 4-day, Part-time 3-day'},
          {key:'contracted_hours',label:'Contracted Hours/Week',type:'number'},
          {key:'shift_type',label:'Shift Type',type:'select',options:['Day Shift','Night Shift','Rotating Shifts','Flexible','Compressed Hours','Annualised Hours']},
          {key:'office_days',label:'Office Days/Week',type:'number'},
          {key:'remote_days',label:'Remote Days/Week',type:'number'},
          {key:'effective_from',label:'Effective From',type:'date'},
          {key:'effective_to',label:'Effective To',type:'date',hint:'Leave blank if current pattern'},
        ],
      },records};
    }
    // next of kin
    const records=S.cache.next_of_kin||[];
    return {config:{table:'next_of_kin',title:'Next of Kin',subtitle:'Emergency contacts for all employees',addLabel:'Add Next of Kin',wide:false,
      columns:[
        {label:'Employee',render:r=>personName(r.person_id)},
        {label:'Name',render:r=>`<span style="font-weight:500">${x(r.name||'—')}</span>`},
        {label:'Relationship',key:'relationship'},
        {label:'Phone',key:'phone'},
        {label:'Email',render:r=>r.email?`<a href="mailto:${x(r.email)}" style="color:var(--accent);font-size:13px;text-decoration:none">${x(r.email)}</a>`:'—'},
        {label:'Primary',render:r=>(r.is_primary==='true'||r.is_primary===true)?'<span class="badge" style="background:var(--ok-bg);color:#16a34a">Primary</span>':'—'},
      ],
      fields:[
        {key:'person_id',label:'Employee',required:true,type:'select',options:personOpts},
        {key:'name',label:'Full Name',required:true},
        {key:'relationship',label:'Relationship',type:'select',options:['Spouse / Civil Partner','Parent','Child','Sibling','Partner','Friend','Other']},
        {key:'phone',label:'Phone',type:'tel'},
        {key:'email',label:'Email',type:'email'},
        {key:'is_primary',label:'Primary Contact?',type:'select',options:[{value:'true',label:'Yes — primary'},{value:'false',label:'No'}]},
      ],
    },records};
  };

  const {config,records}=getConfig();
  pc.innerHTML=`
    <div style="margin-bottom:28px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Benefits & Details</h1>
      <p style="color:var(--muted);font-size:14px">Benefits · Bank Details · Working Patterns · Next of Kin</p>
    </div>
    ${subTabBar(BEN_TABS,S.benTab,'benTab')}
    ${renderCRUD(config,records)}`;
  icons();
  bindSubTabs(()=>{S.crudSearch='';loadBenTab();});
  bindCRUD(config,records,loadBenTab);
}

// ════════════════════════════════════════════════════════════════════════
//  REPORTS MODULE
//  Tabs: Headcount · Turnover · Training Compliance · Gender Pay · D&I · Org Chart
// ════════════════════════════════════════════════════════════════════════
const RPT_TABS=[
  {id:'headcount',   label:'Headcount',           icon:'users'},
  {id:'turnover',    label:'Turnover',             icon:'user-minus'},
  {id:'training',    label:'Training Compliance',  icon:'book-open'},
  {id:'genderpay',   label:'Gender Pay',           icon:'bar-chart'},
  {id:'di',          label:'D&I',                  icon:'globe'},
  {id:'orgchart',    label:'Org Chart',            icon:'git-merge'},
];
async function pageReports() {
  await Promise.all([
    cached('people','people','id,first_name,last_name,employee_number,department_id,office_location_id,employment_type,status,start_date,gender,ethnicity,disability'),
    cached('departments','departments','id,name'),
    cached('office_locations','office_locations','id,name,city'),
    cached('leavers','leavers','*'),
    cached('training_courses','training_courses','id,name'),
    cached('employee_training','employee_training','*'),
    cached('employee_pay','employee_pay','person_id,salary,effective_date'),
    cached('hierarchy','hierarchy','*'),
    cached('roles','roles','id,job_title_id,department_id'),
    cached('job_titles','job_titles','id,title'),
    cached('employee_roles','employee_roles','person_id,role_id,end_date'),
  ]);
  S.crudSearch=''; if(!S.rptTab) S.rptTab='headcount';
  renderReports();
}
function renderReports() {
  const pc=$('hr-page-content'); if(!pc) return;
  const active=(S.cache.people||[]).filter(p=>p.status!=='Leaver');
  const depName=id=>{ const d=(S.cache.departments||[]).find(r=>r.id===id); return d?x(d.name):'<span style="color:var(--muted)">No Department</span>'; };
  const offName=id=>{ const o=(S.cache.office_locations||[]).find(r=>r.id===id); return o?x(o.name):'<span style="color:var(--muted)">No Office</span>'; };

  const sectionTitle=(title,subtitle)=>`
    <div style="margin-bottom:20px">
      <h1 class="font-display" style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px">Reports</h1>
      <p style="color:var(--muted);font-size:14px">Workforce analytics and statutory reporting</p>
    </div>
    ${subTabBar(RPT_TABS,S.rptTab,'rptTab')}
    <div style="margin-bottom:20px">
      <h2 class="font-display" style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:2px">${title}</h2>
      <p style="font-size:13px;color:var(--muted)">${subtitle}</p>
    </div>`;

  if(S.rptTab==='headcount') {
    const byDept={};const byOffice={};const byType={};
    active.forEach(p=>{
      const d=p.department_id||'unknown'; byDept[d]=(byDept[d]||0)+1;
      const o=p.office_location_id||'unknown'; byOffice[o]=(byOffice[o]||0)+1;
      const t=p.employment_type||'Unknown'; byType[t]=(byType[t]||0)+1;
    });
    const row=(label,count,total)=>`
      <tr class="tr"><td class="td" style="font-weight:500">${label}</td>
      <td class="td" style="text-align:right;font-weight:700;color:var(--text)">${count}</td>
      <td class="td" style="text-align:right;color:var(--muted)">${Math.round(count/total*100)}%</td>
      <td class="td"><div style="background:var(--bg);border-radius:4px;height:6px;overflow:hidden"><div style="background:var(--accent);height:100%;width:${Math.round(count/total*100)}%;border-radius:4px"></div></div></td>
      </tr>`;
    pc.innerHTML=sectionTitle('Headcount Report','Current active headcount by department, office and employment type')
    +`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      <div class="card" style="padding:20px"><h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">By Department</h3>
        <table class="tbl"><thead><tr><th class="th">Department</th><th class="th" style="text-align:right">Staff</th><th class="th" style="text-align:right">%</th><th class="th"></th></tr></thead><tbody>
        ${Object.entries(byDept).sort((a,b)=>b[1]-a[1]).map(([id,n])=>row(depName(id)||'Unknown',n,active.length)).join('')}</tbody></table></div>
      <div class="card" style="padding:20px"><h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">By Office</h3>
        <table class="tbl"><thead><tr><th class="th">Office</th><th class="th" style="text-align:right">Staff</th><th class="th" style="text-align:right">%</th><th class="th"></th></tr></thead><tbody>
        ${Object.entries(byOffice).sort((a,b)=>b[1]-a[1]).map(([id,n])=>row(offName(id)||'Unknown',n,active.length)).join('')}</tbody></table></div>
      <div class="card" style="padding:20px"><h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">By Employment Type</h3>
        <table class="tbl"><thead><tr><th class="th">Type</th><th class="th" style="text-align:right">Staff</th><th class="th" style="text-align:right">%</th><th class="th"></th></tr></thead><tbody>
        ${Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>row(t,n,active.length)).join('')}</tbody></table></div>
    </div>
    <div class="card" style="padding:20px;margin-top:16px;display:flex;gap:32px;flex-wrap:wrap">
      ${[['Total Active',active.length,'var(--accent)'],['Full Time',(active.filter(p=>p.employment_type==='Full Time')).length,'#10b981'],['Part Time',(active.filter(p=>p.employment_type==='Part Time')).length,'#3b82f6'],['Contractors/Temps',(active.filter(p=>['Contractor','Fixed Term','Zero Hours'].includes(p.employment_type))).length,'#f59e0b']].map(([lbl,n,c])=>
        `<div><p style="font-size:11px;color:var(--muted);margin-bottom:2px">${lbl}</p><p style="font-size:28px;font-weight:800;color:${c}">${n}</p></div>`).join('')}
    </div>`;
    icons(); bindSubTabs(()=>{S.rptTab=$('hr-page-content').querySelector('[data-subtab].active')?.dataset.subtab||'headcount';renderReports();});
    pc.querySelectorAll('[data-subtab]').forEach(btn=>btn.addEventListener('click',()=>{S.rptTab=btn.dataset.subtab;renderReports();}));
    return;
  }

  if(S.rptTab==='turnover') {
    const leavers=S.cache.leavers||[];const now=new Date();
    const yr=[0,1,2].map(y=>({year:now.getFullYear()-y,leavers:leavers.filter(l=>{const d=new Date(l.last_working_day);return d.getFullYear()===now.getFullYear()-y;})}));
    const avgHead=active.length;
    pc.innerHTML=sectionTitle('Turnover Report','Leaver analysis and turnover rates by year')
    +`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px">
    ${yr.map(({year,leavers:lv})=>`
      <div class="card" style="padding:20px;text-align:center">
        <p style="font-size:13px;font-weight:700;color:var(--muted);margin-bottom:8px">${year}</p>
        <p style="font-size:32px;font-weight:800;color:var(--text)">${lv.length}</p>
        <p style="font-size:13px;color:var(--muted);margin-top:4px">Leavers</p>
        <p style="font-size:16px;font-weight:700;color:${lv.length/Math.max(avgHead,1)>0.15?'#ef4444':'#10b981'};margin-top:8px">
          ${(lv.length/Math.max(avgHead,1)*100).toFixed(1)}% turnover
        </p>
      </div>`).join('')}
    </div>
    <div class="card" style="padding:20px">
      <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:14px">Leavers This Year by Reason</h3>
      <table class="tbl"><thead><tr><th class="th">Employee</th><th class="th">Last Day</th><th class="th">Exit Interview</th></tr></thead><tbody>
      ${yr[0].leavers.map(l=>`<tr class="tr"><td class="td">${personName(l.person_id)}</td><td class="td">${x(l.last_working_day||'—')}</td>
        <td class="td">${(l.exit_interview_done==='true'||l.exit_interview_done===true)?'<span class="badge" style="background:var(--ok-bg);color:#16a34a">Done</span>':'<span class="badge" style="background:var(--bg);color:var(--muted)">Not done</span>'}</td></tr>`).join('')||'<tr><td class="td" colspan="3" style="text-align:center;color:var(--muted)">No leavers this year</td></tr>'}
      </tbody></table>
    </div>`;
    icons(); pc.querySelectorAll('[data-subtab]').forEach(btn=>btn.addEventListener('click',()=>{S.rptTab=btn.dataset.subtab;renderReports();})); return;
  }

  if(S.rptTab==='training') {
    const courses=S.cache.training_courses||[];const records=S.cache.employee_training||[];
    const compliance=courses.map(c=>{
      const done=records.filter(r=>r.course_id===c.id&&r.passed);
      const total=active.length;const pct=total?Math.round(done.length/total*100):0;
      const missing=active.filter(p=>!done.find(r=>r.person_id===p.id));
      return {course:c,done:done.length,total,pct,missing};
    }).sort((a,b)=>a.pct-b.pct);
    pc.innerHTML=sectionTitle('Training Compliance','Who has completed mandatory training — click a course to see who is outstanding')
    +`<div class="card" style="padding:0;overflow:hidden">
    <table class="tbl"><thead><tr>
      <th class="th">Course</th><th class="th" style="text-align:right">Completed</th>
      <th class="th" style="text-align:right">%</th><th class="th">Compliance</th>
    </tr></thead><tbody>
    ${compliance.map(c=>`<tr class="tr">
      <td class="td" style="font-weight:500">${x(c.course.name)}</td>
      <td class="td" style="text-align:right">${c.done} / ${c.total}</td>
      <td class="td" style="text-align:right;font-weight:700;color:${c.pct<50?'#ef4444':c.pct<80?'#f59e0b':'#10b981'}">${c.pct}%</td>
      <td class="td" style="min-width:120px"><div style="background:var(--bg);border-radius:4px;height:8px;overflow:hidden">
        <div style="background:${c.pct<50?'#ef4444':c.pct<80?'#f59e0b':'#10b981'};height:100%;width:${c.pct}%;border-radius:4px;transition:width 0.5s"></div></div>
        ${c.missing.length?`<p style="font-size:10px;color:var(--muted);margin-top:2px">Outstanding: ${c.missing.slice(0,3).map(p=>`${p.first_name||''} ${p.last_name||''}`.trim()).join(', ')}${c.missing.length>3?' +'+( c.missing.length-3)+' more':''}</p>`:''}</td>
    </tr>`).join('')}
    </tbody></table></div>`;
    icons(); pc.querySelectorAll('[data-subtab]').forEach(btn=>btn.addEventListener('click',()=>{S.rptTab=btn.dataset.subtab;renderReports();})); return;
  }

  if(S.rptTab==='genderpay') {
    const payRecords=S.cache.employee_pay||[];
    const latestPay={};payRecords.forEach(p=>{if(!latestPay[p.person_id]||new Date(p.effective_date)>new Date(latestPay[p.person_id].effective_date))latestPay[p.person_id]=p;});
    const peopleWithPay=active.map(p=>({...p,salary:latestPay[p.id]?.salary})).filter(p=>p.salary&&p.gender);
    const male=peopleWithPay.filter(p=>p.gender==='Male');const female=peopleWithPay.filter(p=>p.gender==='Female');
    const mean=arr=>arr.length?arr.reduce((s,v)=>s+Number(v.salary),0)/arr.length:0;
    const median=arr=>{if(!arr.length)return 0;const s=[...arr].sort((a,b)=>Number(a.salary)-Number(b.salary));const m=Math.floor(s.length/2);return s.length%2?Number(s[m].salary):(Number(s[m-1].salary)+Number(s[m].salary))/2;};
    const mMean=mean(male);const fMean=mean(female);const mMed=median(male);const fMed=median(female);
    const gap=(m,f)=>m?((m-f)/m*100).toFixed(1):0;
    const stat=(label,value,sub)=>`<div class="card" style="padding:20px;text-align:center"><p style="font-size:12px;color:var(--muted);margin-bottom:4px">${label}</p><p style="font-size:24px;font-weight:800;color:var(--text)">${value}</p>${sub?`<p style="font-size:11px;color:var(--muted);margin-top:2px">${sub}</p>`:''}</div>`;
    pc.innerHTML=sectionTitle('Gender Pay Gap Report','Based on current salaries for active employees with gender recorded')
    +`<div style="background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:10px;padding:12px 18px;margin-bottom:16px;font-size:13px;color:var(--warn-text)">${ic('info',13)} ${peopleWithPay.length} employees have salary and gender data · ${active.length-peopleWithPay.length} excluded (missing data)</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
      ${stat('Mean Pay Gap',gap(mMean,fMean)+'%','Men vs Women')}
      ${stat('Median Pay Gap',gap(mMed,fMed)+'%','Men vs Women')}
      ${stat('Mean Male Salary','£'+Math.round(mMean).toLocaleString('en-GB'),male.length+' men')}
      ${stat('Mean Female Salary','£'+Math.round(fMean).toLocaleString('en-GB'),female.length+' women')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" style="padding:20px"><h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">Pay Quartiles</h3>
        ${['Upper','Upper Middle','Lower Middle','Lower'].map((q,qi)=>{
          const sorted=[...peopleWithPay].sort((a,b)=>Number(b.salary)-Number(a.salary));
          const size=Math.ceil(sorted.length/4);const slice=sorted.slice(qi*size,(qi+1)*size);
          const mPct=slice.length?Math.round(slice.filter(p=>p.gender==='Male').length/slice.length*100):0;
          return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="color:var(--muted)">${q} Quartile</span><span>${100-mPct}% F · ${mPct}% M</span></div>
          <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;display:flex">
            <div style="background:#ec4899;height:100%;width:${100-mPct}%;border-radius:4px 0 0 4px;transition:width 0.5s"></div>
            <div style="background:#3b82f6;height:100%;width:${mPct}%;border-radius:0 4px 4px 0;transition:width 0.5s"></div>
          </div></div>`;}).join('')}
      </div>
      <div class="card" style="padding:20px"><h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">Bonus Pay Gap</h3>
        <p style="font-size:13px;color:var(--muted);padding:20px 0;text-align:center">Bonus data not yet recorded.<br>Add bonus payments via the Pay module.</p>
      </div>
    </div>`;
    icons(); pc.querySelectorAll('[data-subtab]').forEach(btn=>btn.addEventListener('click',()=>{S.rptTab=btn.dataset.subtab;renderReports();})); return;
  }

  if(S.rptTab==='di') {
    const ethnicityCount={};const disabilityCount={yes:0,no:0,not_stated:0};
    active.forEach(p=>{
      const e=p.ethnicity||'Not Stated'; ethnicityCount[e]=(ethnicityCount[e]||0)+1;
      if(p.disability===true||p.disability==='true') disabilityCount.yes++;
      else if(p.disability===false||p.disability==='false') disabilityCount.no++;
      else disabilityCount.not_stated++;
    });
    const total=active.length;
    pc.innerHTML=sectionTitle('Diversity & Inclusion Report','Ethnicity, disability and declaration rates for active employees')
    +`<div style="display:grid;grid-template-columns:1fr 300px;gap:16px">
      <div class="card" style="padding:20px"><h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">Ethnicity</h3>
        <table class="tbl"><thead><tr><th class="th">Ethnicity</th><th class="th" style="text-align:right">Count</th><th class="th" style="text-align:right">%</th><th class="th"></th></tr></thead><tbody>
        ${Object.entries(ethnicityCount).sort((a,b)=>b[1]-a[1]).map(([e,n])=>`<tr class="tr">
          <td class="td" style="font-weight:500">${x(e)}</td><td class="td" style="text-align:right;font-weight:700">${n}</td>
          <td class="td" style="text-align:right;color:var(--muted)">${Math.round(n/total*100)}%</td>
          <td class="td"><div style="background:var(--bg);border-radius:4px;height:6px;overflow:hidden"><div style="background:var(--accent);height:100%;width:${Math.round(n/total*100)}%;border-radius:4px"></div></div></td>
        </tr>`).join('')}
        </tbody></table>
        <p style="font-size:11px;color:var(--muted);margin-top:12px">${active.filter(p=>!p.ethnicity).length} employees have not stated their ethnicity (${Math.round(active.filter(p=>!p.ethnicity).length/total*100)}%)</p>
      </div>
      <div class="card" style="padding:20px"><h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">Disability Declaration</h3>
        ${[['Declared — Yes',disabilityCount.yes,'#ef4444'],['Declared — No',disabilityCount.no,'#10b981'],['Not Stated',disabilityCount.not_stated,'var(--muted)']].map(([lbl,n,c])=>`
          <div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:500;color:var(--text)">${lbl}</span><span style="font-weight:700;color:${c}">${n} (${Math.round(n/total*100)}%)</span></div>
          <div style="background:var(--bg);border-radius:4px;height:8px;overflow:hidden"><div style="background:${c};height:100%;width:${Math.round(n/total*100)}%;border-radius:4px"></div></div></div>`).join('')}
      </div>
    </div>`;
    icons(); pc.querySelectorAll('[data-subtab]').forEach(btn=>btn.addEventListener('click',()=>{S.rptTab=btn.dataset.subtab;renderReports();})); return;
  }

  if(S.rptTab==='orgchart') {
    pc.innerHTML = sectionTitle('Organisation Chart',
      'Interactive org chart from hierarchy records · drag to pan · scroll to zoom · click a person to open their record')
    + `<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="search-wrap" style="max-width:220px">
          <span class="search-icon">${ic('search',14)}</span>
          <input id="oc-search" type="search" class="field-input" placeholder="Search by name…" autocomplete="off">
        </div>
        <button id="oc-expand-all"   class="btn btn-secondary" style="font-size:12px">${ic('chevrons-down',12)} Expand all</button>
        <button id="oc-collapse-all" class="btn btn-secondary" style="font-size:12px">${ic('chevrons-up',12)} Collapse all</button>
        <button id="oc-fit"          class="btn btn-secondary" style="font-size:12px">${ic('maximize-2',12)} Fit</button>
        <span style="font-size:11px;color:var(--muted);margin-left:auto">Drag to pan · scroll/pinch to zoom</span>
       </div>
       <div class="card" style="padding:0;overflow:hidden;position:relative" id="oc-wrap">
         <canvas id="oc-canvas" style="display:block;width:100%;height:600px;cursor:grab"></canvas>
         <div id="oc-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:var(--muted);font-size:14px;flex-direction:column;gap:8px">
           ${ic('git-merge',28)} <span>No hierarchy data found.<br>Add reporting relationships in Roles &amp; Structure → Hierarchy.</span>
         </div>
       </div>`;

    icons();
    pc.querySelectorAll('[data-subtab]').forEach(btn =>
      btn.addEventListener('click', () => { S.rptTab = btn.dataset.subtab; renderReports(); }));

    // ── Data ─────────────────────────────────────────────────────────
    const hierarchy  = S.cache.hierarchy    || [];
    const empRoles   = S.cache.employee_roles || [];
    const people     = (S.cache.people || []).filter(p => p.status !== 'Leaver');
    const current    = hierarchy.filter(h => !h.effective_to);

    // Build manager→children map
    const byManager = {};
    current.forEach(h => {
      if (!byManager[h.manager_id]) byManager[h.manager_id] = [];
      byManager[h.manager_id].push(h.person_id);
    });
    const allReports = new Set(current.map(h => h.person_id));

    // Root nodes = active people with no manager in current hierarchy
    const roots = people.filter(p => !allReports.has(p.id));

    // Current role map
    const currentRoleMap = {};
    empRoles.filter(r => !r.end_date).forEach(r => currentRoleMap[r.person_id] = r.role_id);

    if (!roots.length && !current.length) {
      document.getElementById('oc-empty').style.display = 'flex';
      return;
    }

    // ── Canvas setup ──────────────────────────────────────────────────
    const canvas  = document.getElementById('oc-canvas');
    const dpr     = window.devicePixelRatio || 1;

    function syncCanvasSize() {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    syncCanvasSize();
    const ctx = canvas.getContext('2d');

    // Polyfill for ctx.roundRect (not in all browsers)
    function roundRect(x, y, w, h, r) {
      const rr = typeof r === 'number' ? [r,r,r,r] : (r||[0,0,0,0]);
      ctx.beginPath();
      ctx.moveTo(x + rr[0], y);
      ctx.lineTo(x + w - rr[1], y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr[1]);
      ctx.lineTo(x + w, y + h - rr[2]);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr[2], y + h);
      ctx.lineTo(x + rr[3], y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr[3]);
      ctx.lineTo(x, y + rr[0]);
      ctx.quadraticCurveTo(x, y, x + rr[0], y);
      ctx.closePath();
    }

    let pan = {x:60, y:60}, zoom = 1;
    let dragging = false, dragStart = {x:0,y:0}, panStart = {x:0,y:0};
    const collapsed  = new Set();
    let   highlight  = null;

    // Layout constants
    const CW=200, CH=72, GAP_X=36, GAP_Y=56;

    // Department colours
    const deptIds = [...new Set(people.filter(p=>p.department_id).map(p=>p.department_id))].sort();
    const DCOLS   = ['var(--accent)','#0891b2','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#ec4899','#14b8a6','var(--muted)'];
    const deptCol = id => DCOLS[deptIds.indexOf(id) % DCOLS.length] || 'var(--accent)';

    // ── Layout engine ─────────────────────────────────────────────────
    let nodes = [], edges = [];

    function subtreeW(id) {
      if (collapsed.has(id)) return CW;
      const ch = byManager[id] || [];
      if (!ch.length) return CW;
      return Math.max(CW, ch.reduce((s,c) => s + subtreeW(c), 0) + (ch.length-1)*GAP_X);
    }

    function layoutNode(id, x, y, visited) {
      if (visited.has(id)) return;
      visited.add(id);
      const p = byId(people, id); if (!p) return;
      const rId  = currentRoleMap[id];
      const role = byId(S.cache.roles, rId);
      const jt   = byId(S.cache.job_titles, role?.job_title_id);
      const ch   = byManager[id] || [];
      nodes.push({id, x, y,
        name:  `${p.first_name||''} ${p.last_name||''}`.trim(),
        title: jt?.title || '',
        col:   p.department_id ? deptCol(p.department_id) : 'var(--accent)',
        hasKids: ch.length > 0,
        isCollapsed: collapsed.has(id),
      });
      if (!collapsed.has(id) && ch.length) {
        const totalW = ch.reduce((s,c)=>s+subtreeW(c),0) + (ch.length-1)*GAP_X;
        let cx = x - (totalW - CW) / 2;
        ch.forEach(cid => {
          const sw = subtreeW(cid);
          const childX = cx + (sw - CW) / 2;
          const childY = y + CH + GAP_Y;
          edges.push({x1: x+CW/2, y1: y+CH, x2: childX+CW/2, y2: childY});
          layoutNode(cid, childX, childY, visited);
          cx += sw + GAP_X;
        });
      }
    }

    function buildLayout() {
      nodes = []; edges = [];
      const visited = new Set();
      let cx = 40;
      roots.forEach(p => {
        layoutNode(p.id, cx, 40, visited);
        cx += subtreeW(p.id) + GAP_X;
      });
      // Include anyone not yet placed (orphans with no root)
      people.forEach(p => {
        if (!visited.has(p.id)) { layoutNode(p.id, cx, 40, visited); cx += CW + GAP_X; }
      });
    }
    buildLayout();

    // ── Hit test ─────────────────────────────────────────────────────
    function nodeAt(wx, wy) {
      return nodes.find(n => wx>=n.x && wx<=n.x+CW && wy>=n.y && wy<=n.y+CH);
    }
    function toggleAt(n, wx, wy) {
      // Small circle at bottom-centre of card
      const cx = n.x+CW/2, cy = n.y+CH;
      return Math.hypot(wx-cx, wy-cy) < 10/zoom;
    }

    // ── Draw ─────────────────────────────────────────────────────────
    function draw() {
      syncCanvasSize();
      const W = canvas.width/dpr, H = canvas.height/dpr;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Connector lines
      ctx.strokeStyle = 'var(--border)';
      ctx.lineWidth   = 1.5 / zoom;
      edges.forEach(e => {
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        ctx.bezierCurveTo(e.x1, e.y1+GAP_Y*0.5, e.x2, e.y2-GAP_Y*0.5, e.x2, e.y2);
        ctx.stroke();
      });

      // Cards
      nodes.forEach(n => {
        const isHL = highlight === n.id;

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.07)';
        ctx.shadowBlur  = 10/zoom;

        // Card bg
        ctx.fillStyle   = isHL ? 'var(--warn-bg)' : '#fff';
        ctx.strokeStyle = isHL ? '#f59e0b' : 'var(--border)';
        ctx.lineWidth   = (isHL ? 2 : 1) / zoom;
        roundRect(n.x, n.y, CW, CH, 8);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;

        // Left accent bar
        ctx.fillStyle = n.col;
        roundRect(n.x, n.y, 4, CH, [8,0,0,8]);
        ctx.fill();

        // Initials circle
        const initials = n.name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
        ctx.fillStyle = n.col + '28';
        ctx.beginPath(); ctx.arc(n.x+22, n.y+CH/2, 14, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = n.col;
        ctx.font      = `700 ${Math.max(10, 11/zoom)}px Inter,Arial,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(initials, n.x+22, n.y+CH/2);

        // Name
        ctx.fillStyle    = 'var(--text)';
        ctx.font         = `600 ${Math.max(9, 11/zoom)}px Inter,Arial,sans-serif`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        const nameTxt = n.name.length > 20 ? n.name.slice(0,18)+'…' : n.name;
        ctx.fillText(nameTxt, n.x+44, n.y + CH*0.37);

        // Title
        ctx.fillStyle = 'var(--muted)';
        ctx.font      = `${Math.max(8,10/zoom)}px Inter,Arial,sans-serif`;
        const titleTxt = (n.title||'No role').length > 24 ? (n.title||'').slice(0,22)+'…' : (n.title||'No role');
        ctx.fillText(titleTxt, n.x+44, n.y + CH*0.66);

        // Expand/collapse button (bottom-centre)
        if (n.hasKids) {
          ctx.fillStyle   = n.isCollapsed ? n.col : 'var(--border)';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth   = 1.5/zoom;
          ctx.beginPath(); ctx.arc(n.x+CW/2, n.y+CH, 8/zoom, 0, Math.PI*2);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle    = n.isCollapsed ? '#fff' : 'var(--muted)';
          ctx.font         = `700 ${Math.max(9,10/zoom)}px Arial,sans-serif`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.isCollapsed ? '+' : '−', n.x+CW/2, n.y+CH);
        }
      });

      ctx.restore();
    }

    // ── Fit to screen ─────────────────────────────────────────────────
    function fit() {
      if (!nodes.length) return;
      const minX = Math.min(...nodes.map(n=>n.x));
      const maxX = Math.max(...nodes.map(n=>n.x+CW));
      const minY = Math.min(...nodes.map(n=>n.y));
      const maxY = Math.max(...nodes.map(n=>n.y+CH));
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      zoom = Math.min(W/(maxX-minX+80), H/(maxY-minY+80), 1);
      pan.x = (W - (maxX-minX)*zoom)/2 - minX*zoom + 20;
      pan.y = (H - (maxY-minY)*zoom)/2 - minY*zoom + 20;
      draw();
    }

    // Draw after DOM settles
    requestAnimationFrame(() => { syncCanvasSize(); fit(); });

    // ── Mouse ─────────────────────────────────────────────────────────
    canvas.addEventListener('mousedown', e => {
      dragging=true; canvas.style.cursor='grabbing';
      dragStart={x:e.clientX,y:e.clientY}; panStart={...pan};
    });
    canvas.addEventListener('mousemove', e => {
      if (dragging) {
        pan.x = panStart.x + (e.clientX-dragStart.x);
        pan.y = panStart.y + (e.clientY-dragStart.y);
        draw(); return;
      }
      const rect=canvas.getBoundingClientRect();
      const wx=(e.clientX-rect.left-pan.x)/zoom, wy=(e.clientY-rect.top-pan.y)/zoom;
      const n=nodeAt(wx,wy);
      canvas.style.cursor = n ? 'pointer' : 'grab';
    });
    canvas.addEventListener('mouseup', e => {
      const moved = Math.hypot(e.clientX-dragStart.x, e.clientY-dragStart.y);
      dragging=false; canvas.style.cursor='grab';
      if (moved > 4) return;
      const rect=canvas.getBoundingClientRect();
      const wx=(e.clientX-rect.left-pan.x)/zoom, wy=(e.clientY-rect.top-pan.y)/zoom;
      const n=nodeAt(wx,wy);
      if (!n) return;
      if (n.hasKids && toggleAt(n,wx,wy)) {
        if (collapsed.has(n.id)) collapsed.delete(n.id); else collapsed.add(n.id);
        buildLayout(); draw();
      } else {
        S.pendingOpenPerson=n.id; S.page='people'; renderShell();
      }
    });
    canvas.addEventListener('mouseleave', ()=>{ dragging=false; canvas.style.cursor='grab'; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const rect=canvas.getBoundingClientRect();
      const mx=e.clientX-rect.left, my=e.clientY-rect.top;
      const oldZ=zoom;
      zoom = Math.max(0.15, Math.min(3, zoom - e.deltaY*0.001));
      pan.x = mx-(mx-pan.x)*(zoom/oldZ);
      pan.y = my-(my-pan.y)*(zoom/oldZ);
      draw();
    },{passive:false});

    // ── Touch ─────────────────────────────────────────────────────────
    let tStart=null, tPanStart=null, tDist=null;
    canvas.addEventListener('touchstart',e=>{
      if(e.touches.length===1){tStart={x:e.touches[0].clientX,y:e.touches[0].clientY};tPanStart={...pan};}
      if(e.touches.length===2){tDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
      e.preventDefault();
    },{passive:false});
    canvas.addEventListener('touchmove',e=>{
      if(e.touches.length===2&&tDist){
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        zoom=Math.max(0.15,Math.min(3,zoom*(d/tDist))); tDist=d;
      } else if(e.touches.length===1&&tStart&&tPanStart){
        pan.x=tPanStart.x+(e.touches[0].clientX-tStart.x);
        pan.y=tPanStart.y+(e.touches[0].clientY-tStart.y);
      }
      draw(); e.preventDefault();
    },{passive:false});
    canvas.addEventListener('touchend',()=>{tDist=null;});

    // ── Toolbar ───────────────────────────────────────────────────────
    document.getElementById('oc-expand-all')?.addEventListener('click',()=>{ collapsed.clear(); buildLayout(); draw(); });
    document.getElementById('oc-collapse-all')?.addEventListener('click',()=>{
      nodes.forEach(n=>{ if(n.hasKids) collapsed.add(n.id); });
      buildLayout(); draw();
    });
    document.getElementById('oc-fit')?.addEventListener('click', fit);
    document.getElementById('oc-search')?.addEventListener('input', e=>{
      const q=e.target.value.toLowerCase().trim();
      if(!q){highlight=null;draw();return;}
      const m=nodes.find(n=>n.name.toLowerCase().includes(q));
      if(m){
        highlight=m.id;
        pan.x=canvas.offsetWidth/2  - m.x*zoom - CW*zoom/2;
        pan.y=canvas.offsetHeight/2 - m.y*zoom - CH*zoom/2;
        draw();
      }
    });

    return;
  }
}

/* ═══ MOUNT API ════════════════════════════════════════════════════
   The three calls HumanResourcesPage.jsx makes. */

/* Draw `page` into the pane. Called on mount and whenever the sidebar
   selection changes.

   The guard is what stops the two navigation paths from fighting. An
   internal navigation calls renderShell(), which renders immediately and
   *then* tells React where we went; React updates the sidebar and hands
   the same page straight back here. Without the guard that echo would
   render every internal navigation twice — visibly, since each render
   refetches. */
export function showPage(page) {
  if (S.page === page) return;
  S.page = page;
  loadPage();
}

export function mount(page, navigate) {
  onNavigate = navigate || (() => {});
  S.page = page;
  loadPage();
}

/* Chart.js keeps its instances alive until told otherwise, and they hold
   the canvases they were built on. Without this, leaving Human Resources
   and coming back leaks a chart per visit and the new canvases refuse to
   draw. */
export function unmount() {
  onNavigate = () => {};
  destroyDashCharts();
  closeModal();
  document.getElementById("hr-toast")?.remove();
}
