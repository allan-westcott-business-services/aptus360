# Aptus360

React rewrite of the Aptus360 single-file app, with an API layer and a merged
Project model replacing the separate Tender and Contract records.

Runs on sample data out of the box — no database needed to see the screens.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5173
```

That's enough to see both forms. `VITE_USE_MOCKS=true` in `.env.example` means
the API client returns in-memory sample data instead of calling the backend.

To run the API functions as well, use the Netlify CLI instead of `npm run dev`:

```bash
npm install -g netlify-cli
netlify dev
```

## What's here

```
src/
  api/          fetch wrappers — the only place that talks to /api/*
  components/   Field, Section, Select, Toggle, Banner, StagePill, Sidebar
  features/
    home/       the landing page
    projects/   projects list, tabs, revisions
    gis/        the drawing canvas
    ...
  lib/          navigation, utilities, statuses, sample data
netlify/
  functions/    the API layer — service-role key lives here only
supabase/
  migrations/   versioned schema
```

## Navigation

The app opens on a landing page of eight squares, one per area of the
business: Business Development, Tendering & Design, Operations,
Commercial, Human Resources, HSQE, Finance and Admin. Choosing one scopes
the sidebar to that area's screens and nothing else, so a planner sees
eight operations screens rather than the whole app.

`src/lib/navigation.js` is the single source of truth for what the
landing page offers, what the sidebar shows, and which menu items People
& Roles can grant. Add a screen there and it appears in all three.

```js
{ view: "vehicles", label: "Vehicles" }              // placeholder
{ view: "planning", label: "Planning", built: true } // real screen
```

`built: true` means the React version exists. Everything else renders a
placeholder, which is why each square can honestly report `3 of 8 live`
rather than promising eight screens and delivering three.

Two rules that are easy to trip over:

- **The sidebar is not on every screen** — the landing page has none. Any
  CSS the whole app depends on belongs in `src/styles.css`, not in the
  sidebar's own `<style>` block.
- **Don't list views anywhere else.** `ALL_VIEWS` is derived. A
  hand-kept copy is a second place to remember a screen, and the two
  drifting means a page you can navigate to but not reload back into.

## Checks

```bash
npm test          # every check*.mjs — navigation model, shell, HR, GIS, call-offs
npm run check     # the above plus the Python source checks
node checkall.mjs --only span     # just the ones matching "span"
```

Both scripts go through `checkall.mjs`, which runs every check it finds
and reports all of them rather than stopping at the first failure. It
also tells a crash apart from a failure, because those mean different
things: a check reporting "3 problem(s)" looked at something, and one
that throws never got to look.

The list of checks is **derived from the folder**, not hand-kept — a
script on disk and not in a list never runs, and nothing notices. That
had already happened twice. Anything deliberately excluded says why, in
`NOT_A_SUITE_CHECK`.

These aren't decoration: each one caught a fault that had already
shipped. `HANDOVER.md` lists what each covers, which `checkorder.py`
hits are known false positives, and which checks currently fail and why.

## Going live against real data

1. **Apply the schema.**
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   `0001_project_model.sql` creates `Project`, `Project_Scope` and the status
   tables alongside your existing ones. It drops nothing — the current app
   keeps working.

2. **Add your keys to `.env`.**
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   VITE_USE_MOCKS=false
   ```
   The `VITE_` prefix is a security boundary, not a naming convention. Prefixed
   variables are bundled into the browser; unprefixed ones stay server-side.
   The service role key must never gain a prefix.

   Human Resources reads two more, because it points at its own Supabase
   project rather than this one — see **Human Resources** below:
   ```
   VITE_HR_SUPABASE_URL=https://<hr project>.supabase.co
   VITE_HR_SUPABASE_ANON_KEY=<hr anon key>
   ```
   Both fall back to the values the standalone portal shipped with, so the
   section works before either is set.

3. **Run `netlify dev`** and check the forms load real lookups.

4. **Migrate the data** — see `aptus360-project-model.md` §5 for the ordered
   steps. Not scripted here; it needs decisions about the child-tender fold.

## Deploying

Push to GitHub, then in Netlify: **Add new site → Import an existing project**.
Netlify detects Vite and fills in `npm run build` / `dist`. Add the same four
environment variables under **Site configuration → Environment variables**.

After that, pushing to `main` deploys to production, and every pull request
gets its own preview URL.

## Human Resources

The **Human Resources** section is the former standalone HR Portal, mounted
inside the shell rather than rewritten. It is still vanilla JS: React gives it
a pane and it draws into it. `src/features/hr/hrPortal.js` explains the port in
full; the short version is that rewriting sixteen modules as components would
have been weeks of work and a regression in each, and any one module can be
converted later without touching the other fifteen.

Two things about it differ from the rest of the app, and both are inherited
from the standalone portal rather than introduced by the port:

- **It talks to a different Supabase project, directly from the browser**, with
  the anon key, not through `/api/*`. So the note below about RLS and the anon
  key does not hold for these screens: their access is governed entirely by
  that project's own policies. Bringing HR onto this database is a migration
  with about forty endpoints behind it, not a refactor.
- **There is no sign-in on it.** The portal bypassed its own login and used the
  anon key as the bearer token. Anyone who can open Aptus360 can open payroll
  and sickness records. Worth closing before this reaches people who should not
  see them.

`node checkhr.mjs` mounts all sixteen modules in a simulated DOM with `fetch`
stubbed and checks each one renders, icons draw, modals open in the right root,
and the sidebar bridge does not double-render. Run it after touching anything
in `src/features/hr/`.

## Notes

- **RLS is on with no policies** in the migration. That means the anon key can
  read nothing, and all access goes through the functions. This is deliberate:
  the legacy app disabled RLS and shipped the anon key in the browser.
- **Functions time out at 10 seconds.** Heavy operations — bulk plot scans, the
  Audacia invoice import — belong in Postgres functions called via RPC, not
  here.
- **No router.** `App.jsx` switches on a `view` string held in state and
  remembered in session storage, so a reload returns you to the screen
  you were on. Add `react-router-dom` when the URL needs to be
  shareable — deep links and the back button are what you're trading away.
- **JavaScript, not TypeScript.** Deliberate, to keep the ramp gentle. When you
  do switch, `supabase gen types typescript --linked` generates types from the
  schema, which is what stops the phantom-column problem recurring.

## Next steps

See the open work list at the foot of `HANDOVER.md`, which is kept
current. In short: HR has no sign-in and that's the one item that's a
disclosure risk rather than a missing feature; three SQL migrations were
pasted into Supabase by hand and never committed, so the repo is not a
complete record of the schema; the pickers still need moving to
`Organisation_ID`; and `GISCanvasPage.jsx` has reached 12,000 lines and
wants breaking up.
