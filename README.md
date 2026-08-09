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
  components/   Field, Section, Select, Toggle, Banner, StagePill
  features/
    projects/   AddProjectForm, EditContractForm, ScopePicker
  lib/          utilities, statuses, sample data
netlify/
  functions/    the API layer — service-role key lives here only
supabase/
  migrations/   versioned schema
```

Two screens are implemented:

- **Add project** — creates a project at Tender stage, with scope selection
  replacing the old two-step utility flow.
- **Edit contract** — the same record at Contract stage. Scopes carry their own
  commercial status, adopting operator and reference, so a street lighting
  scope can be lost while the residential work proceeds.

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
- **No router yet.** `App.jsx` switches between the two forms with local state.
  Add `react-router-dom` when a third screen appears.
- **JavaScript, not TypeScript.** Deliberate, to keep the ramp gentle. When you
  do switch, `supabase gen types typescript --linked` generates types from the
  schema, which is what stops the phantom-column problem recurring.

## Next steps

- Project list view with filters and column preferences
- Status transitions as endpoints, with the guard logic moved server-side
- Points calculation moved out of the browser (see open item 1 in the model doc)
- Plots and designs screens
