/* Editing, removing and bulk-editing people.

   People & Roles could add a person and manage their roles, regions,
   absences and menu access, and could not change a name, correct an
   email or remove anybody at all. A screen that can only ever add is
   one where the first typo is permanent.

   Mounted and driven rather than read, because the faults here are all
   invisible in the source: a tick that also selects the person, an edit
   that writes the whole row back over columns it never showed, a bulk
   action that reads a stale selection.

   ── Why the network is a fake and not a mock ──

   Every write is captured, so the check can say what was sent as well
   as what was drawn. The fault that matters most — an update carrying
   fields the screen does not own — is only visible in the request. */
import { build } from "esbuild";
import { JSDOM } from "jsdom";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const bundle = await build({
  entryPoints: ["src/features/admin/PeopleRolesAdmin.jsx"],
  bundle: true, write: false, format: "cjs", jsx: "automatic",
  platform: "browser", logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  loader: { ".png": "empty", ".css": "empty" },
  define: {
    "process.env.NODE_ENV": '"development"',
    "import.meta.env": JSON.stringify({
      VITE_USE_MOCKS: "false", VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "",
      MODE: "test", DEV: false, PROD: false,
    }),
  },
});

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true, runScripts: "outside-only" });
const { window } = dom;
for (const k of ["window", "document", "navigator", "HTMLElement", "Element",
  "Node", "Event", "MouseEvent", "getComputedStyle", "requestAnimationFrame",
  "cancelAnimationFrame", "sessionStorage", "localStorage"]) {
  if (globalThis[k] === undefined) globalThis[k] = window[k];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* A small office: three people, two roles, one of each mapping. */
const db = {
  Person: [
    { Person_ID: 1, Person_Name: "A. Whitcombe", Email: "aw@x.test", Telephone: "111", Is_Active: true },
    { Person_ID: 2, Person_Name: "R. Nkemelu", Email: null, Telephone: null, Is_Active: true },
    { Person_ID: 3, Person_Name: "J. Farrell", Email: null, Telephone: null, Is_Active: false },
  ],
  Role: [
    { Role_ID: 1, Role: "Estimator", Role_Code: "ESTIMATOR" },
    { Role_ID: 2, Role: "Designer", Role_Code: "DESIGNER" },
  ],
  /* Whitcombe holds both. Step 4 removes one of them across everybody
     picked, so the other is what step 6's delete still has to clear —
     without it that assertion would pass on an empty list. */
  Person_Role: [
    { Person_Role_ID: 10, Person_ID: 1, Role_ID: 1 },
    { Person_Role_ID: 11, Person_ID: 1, Role_ID: 2 },
  ],
  Region: [], Person_Region: [], Person_Holiday: [], Person_Menu_Visible: [],
  Admin_Menu_Item: [],
};

const writes = [];
let nextId = 100;
/* Refuses to delete person 1, the way the database refuses somebody
   with work recorded against them. That refusal is the case the screen
   has to handle well, and it is the one nobody would hit by hand. */
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || "GET").toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  const table = decodeURIComponent((/\/admin\/([^/?]+)/.exec(u) || [])[1] || "");

  /* `text`, not `json`. The API wrapper reads the body as text and
     parses it itself, so a fake that only answers json() hands back
     undefined and every screen loads empty — which is what the first
     run of this check found, in the check rather than the screen. */
  const reply = (status, payload) => ({
    ok: status < 400, status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  });

  if (method === "GET") return reply(200, { rows: db[table] ?? [] });
  writes.push({ table, method, url: u, body });

  if (method === "DELETE") {
    /* `/admin/Person?id=1`, which is how adminDelete builds it —
       matching a path segment here quietly refused nothing and made
       the refusal case pass by never happening. */
    const delId = new URL(u, "http://x").searchParams.get("id");
    if (table === "Person" && delId === "1") {
      return reply(409, { error: "violates foreign key constraint" });
    }
    return reply(200, { ok: true });
  }
  return reply(200, { ...(body || {}), Person_Role_ID: nextId++ });
};
globalThis.confirm = () => true;
window.confirm = globalThis.confirm;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const shared = {
  react: React,
  "react-dom": await import("react-dom"),
  "react-dom/client": await import("react-dom/client"),
  "react/jsx-runtime": await import("react/jsx-runtime"),
};
const shim = (id) => {
  const m = shared[id];
  if (!m) throw new Error("unexpected external: " + id);
  return m.default && m.default.createElement ? m.default : m;
};
const mod = { exports: {} };
new Function("require", "module", "exports", "globalThis",
  bundle.outputFiles[0].text)(shim, mod, mod.exports, globalThis);
const PeopleRolesAdmin = mod.exports.default;

const root = createRoot(document.getElementById("root"));
const txt = () => document.body.textContent;
const click = async (el) => {
  if (!el) return fail("clicked something that is not there");
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
};
const type = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
const byText = (sel, label) =>
  [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === label);
const rowFor = (name) => [...document.querySelectorAll(".pr-row")]
  .find((r) => r.querySelector(".pr-name")?.textContent.startsWith(name));

await act(async () => { root.render(React.createElement(PeopleRolesAdmin)); });
await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

/* Nothing below means anything if the screen did not load, and every
   assertion would throw rather than fail — which reads as a broken
   check instead of the fault it is. */
if (!document.querySelector(".pr-row")) {
  fail("the screen rendered no people at all \u2014 nothing below was checked");
  console.log(bad ? `\n${bad} problem(s)` : "");
  process.exit(1);
}

// 1. Everybody is listed, including the inactive one.
{
  if (!rowFor("A. Whitcombe")) fail("the people did not load");
  /* Dimmed, not hidden. Hiding them would leave no way to bring
     anybody back. */
  const gone = rowFor("J. Farrell");
  if (!gone) fail("an inactive person is not listed at all");
  else if (!gone.className.includes("off")) fail("an inactive person is not marked");
  if (!txt().includes("inactive")) fail("nothing says who is inactive");
}

// 2. Editing a person.
{
  await click(rowFor("A. Whitcombe").querySelector(".pr-item"));
  await click(byText(".btn", "Edit"));

  const name = document.querySelector('.pr-edit input[aria-label="Name"]');
  if (!name) { fail("the edit form did not open"); }
  else {
    if (name.value !== "A. Whitcombe") {
      fail(`the edit form opened on "${name.value}", not the selected person`);
    }
    await type(name, "A. Whitcombe-Hale");
    writes.length = 0;
    await click(byText(".btn", "Save"));

    const w = writes.find((x) => x.table === "Person" && x.method !== "GET");
    if (!w) fail("saving an edit wrote nothing");
    else {
      if (w.body?.Person_Name !== "A. Whitcombe-Hale") {
        fail(`the edit sent "${w.body?.Person_Name}"`);
      }
      /* Only the three fields this screen shows. A person also carries
         HR columns, a planner colour and an employee number, and
         sending the whole row back would null whatever this screen was
         not holding — fault 5. */
      const sent = Object.keys(w.body || {}).sort().join(",");
      if (sent !== "Email,Person_Name,Telephone") {
        fail(`the edit sent ${sent} — it must send only what it shows`);
      }
    }
    if (!txt().includes("A. Whitcombe-Hale")) fail("the new name is not shown");
  }
}

// 3. Ticking somebody does not open them.
{
  await click(rowFor("R. Nkemelu").querySelector(".pr-item"));
  const before = document.querySelector(".pr-detail-head h3")?.textContent;

  await click(rowFor("A. Whitcombe-Hale").querySelector(".pr-tick"));
  const after = document.querySelector(".pr-detail-head h3")?.textContent;
  if (before !== after) {
    fail("ticking somebody also opened them — picking six would leave the last one open");
  }
  if (!txt().includes("1 selected")) fail("the bulk bar did not appear");
}

// 4. A role, across everybody picked.
{
  await click(rowFor("R. Nkemelu").querySelector(".pr-tick"));
  if (!txt().includes("2 selected")) {
    fail(`the second tick did not count \u2014 bar reads "${
      document.querySelector(".pr-bulk-head strong")?.textContent}"`);
  }

  const sel = document.querySelector(".pr-bulk-role select");
  await act(async () => {
    sel.value = "1";
    sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  writes.length = 0;
  await click(byText(".btn", "Add role"));

  const made = writes.filter((w) => w.table === "Person_Role" && w.method === "POST");
  /* One, not two. Whitcombe already holds Estimator, and adding it
     again would be a duplicate row saying the same thing twice. */
  if (made.length !== 1) {
    fail(`adding a role to two people made ${made.length} rows — one already held it`);
  }
  if (made[0] && Number(made[0].body?.Person_ID) !== 2) {
    fail("the role went to the person who already had it");
  }

  /* And removing is symmetrical: only those who hold it. */
  writes.length = 0;
  await click(byText(".btn", "Remove role"));
  const removed = writes.filter((w) => w.method === "DELETE");
  /* Two: both people now hold it. Whitcombe's other role is untouched,
     which is the point — a bulk remove takes the role named and not
     whatever else somebody happens to hold. */
  if (removed.length !== 2) {
    fail(`removing a role from two holders made ${removed.length} deletes`);
  }
}

// 5. Active and inactive, in bulk.
{
  writes.length = 0;
  await click(byText(".btn", "Make inactive"));
  const patched = writes.filter((w) => w.table === "Person" && w.method !== "GET");
  if (patched.length !== 2) {
    fail(`making two people inactive sent ${patched.length} updates`);
  }
  if (patched.some((w) => w.body?.Is_Active !== false)) {
    fail("Make inactive did not send Is_Active false");
  }
  /* And only that field, for the same reason the edit sends only
     three. */
  if (patched.some((w) => Object.keys(w.body || {}).length !== 1)) {
    fail("the active flag was sent alongside other columns");
  }
}

// 6. A person the database will not delete.
//
//    Somebody with work recorded against them. The refusal is the right
//    answer — cascading through it would delete an employment history
//    to tidy up a list — so what matters is that the screen says who,
//    and says what to do instead.
{
  await click(rowFor("A. Whitcombe-Hale").querySelector(".pr-item"));
  writes.length = 0;
  await click(byText(".btn", "Delete"));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  const body = txt();
  if (process.env.DEBUG_PEOPLE) {
    console.log("  [debug] writes:", JSON.stringify(writes.map((w) => `${w.method} ${w.url}`)));
    console.log("  [debug] banner:", document.querySelector(".banner, .pr-detail")?.textContent?.slice(0, 200));
  }
  if (!/cannot be deleted/i.test(body)) {
    fail("a refused delete said nothing");
  }
  if (!/A\. Whitcombe-Hale/.test(body)) {
    fail("a refused delete did not name who could not be deleted");
  }
  /* And points at the thing that was actually wanted. */
  if (!/inactive/i.test(body)) {
    fail("a refused delete did not offer making them inactive instead");
  }
  /* The configuration this screen owns goes first, so a person who IS
     deletable does not leave rows pointing at nobody. */
  if (!writes.some((w) => w.table === "Person_Role" && w.method === "DELETE")) {
    fail("deleting a person left their roles behind");
  }
}

await act(async () => { root.unmount(); });

console.log(bad ? `\n${bad} problem(s)`
  : "People & Roles behaves (edit, deactivate, delete, and bulk changes).");
process.exit(bad ? 1 : 0);
