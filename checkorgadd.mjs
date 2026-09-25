/* Adding an organisation, and being left on it.

   Two things were wrong with the old panel. The "+ Add organisation"
   button sat under the list, and the list is every company we deal with
   and scrolls inside its own panel — so adding one meant scrolling to the
   foot of a few hundred rows first. And although the new organisation was
   selected, the list is filtered: a company created while "All roles" was
   set to something, or with anything in the search box, was filtered
   straight out of the list it had just been added to. The detail panel
   showed it; no row was highlighted; it read as having gone nowhere.

   These tests are about the rules, not the wording. The button may be
   relabelled; it may not go back under the list, and creating an
   organisation may not leave the user unable to see it. */

import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const SRC = "src/features/admin/OrganisationsAdmin.jsx";
const src = readFileSync(SRC, "utf8");

/* A function body bounded by its braces, not by a character count. A
   window of N characters goes stale the moment a comment is added. */
function body(text, header) {
  const start = text.indexOf(header);
  if (start < 0) return null;
  const open = text.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (!depth) return text.slice(start, i + 1); }
  }
  return null;
}

// ─── 1. The add control is above the list, inside the list panel ───
{
  const panel = src.indexOf('className="oa-list"');
  const add = src.indexOf("+ Add organisation");
  const items = src.indexOf("shown.map(");

  if (panel < 0) fail("the organisations list panel is no longer there to look in");
  if (add < 0) fail("no add-organisation control found at all");
  if (items < 0) fail("the list of organisations is no longer rendered from shown");

  if (add > 0 && items > 0 && add > items) {
    fail("the add-organisation control still comes after the list of organisations");
  }
  if (panel > 0 && add > 0 && add < panel) {
    fail("the add-organisation control has left the list panel");
  }
}

// ─── 2. One of it, not two ───
{
  const n = src.split("+ Add organisation").length - 1;
  if (n !== 1) fail(`the add-organisation control appears ${n} times, expected 1`);
}

/* The name form and the button are the same control in two states, so the
   form belongs at the top with it rather than left at the foot. */
{
  const form = src.indexOf('placeholder="Organisation name"');
  const items = src.indexOf("shown.map(");
  if (form < 0) fail("the new-organisation name form is gone");
  else if (items > 0 && form > items) fail("the new-organisation name form is still below the list");
}

// ─── 3. Nothing at the top of a scrolling panel sits flush against the list ───
{
  const css = src.slice(src.indexOf("const CSS = `"));
  if (!/\.oa-addtop\s*\{[^}]*margin-bottom/.test(css)) {
    fail("the add control at the top of the list has no gap below it");
  }
}

// ─── 4. createOrg selects what it made, and clears what would hide it ───
{
  const fn = body(src, "async function createOrg()");
  if (!fn) fail("createOrg is no longer a function I can read");
  else {
    if (!/setSelected\(/.test(fn)) {
      fail("createOrg no longer selects the organisation it created");
    }
    /* The two filters that can hide a brand-new organisation: it holds no
       roles, and its name is not what was being searched for. */
    if (!/setRoleFilter\(\s*""\s*\)/.test(fn)) {
      fail("createOrg leaves the role filter set, which hides an organisation with no roles");
    }
    if (!/setSearch\(\s*""\s*\)/.test(fn)) {
      fail("createOrg leaves the search box set, which hides an organisation that does not match it");
    }
    /* branchFor and contactFor hold ids belonging to the organisation we
       were looking at. A form left open across the switch files its record
       under the wrong company. */
    if (!/closeEditors\(\)/.test(fn)) {
      fail("createOrg leaves branch/contact editors open against the previous organisation");
    }
    if (!/loadList\(\)/.test(fn)) {
      fail("createOrg no longer refreshes the list");
    }
  }
}

// ─── 5. loadList hands its rows back, or the fallback cannot look in them ───
{
  const fn = body(src, "const loadList = useCallback(");
  if (!fn) fail("loadList is no longer a function I can read");
  else if (!/return\s+\w+\s*;/.test(fn)) {
    fail("loadList returns nothing, so createOrg cannot find a row it did not get an id for");
  }
}

// ─── 6. Behaviour: the created organisation ends up visible and selected ───
{
  /* The panel's own filter, as the component computes it. */
  const visible = (rows, { search, roleFilter, showInactive }) => rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.Name} ${r.Code ?? ""}`.toLowerCase().includes(q)) return false;
    if (roleFilter && !(r.roles || "").split(",").map((x) => x.trim()).includes(roleFilter)) return false;
    if (!showInactive && r.Is_Active === false) return false;
    return true;
  });

  const run = async ({ apiReturnsId, startState, table }) => {
    const st = { ...startState };
    const set = (k) => (v) => { st[k] = v; };
    const created = { Organisation_ID: 91, Name: "Vistry (Midlands)", Is_Active: true, roles: "" };

    // What createOrg does, in order.
    const name = st.newName.trim();
    if (!name) return { ...st, error: "An organisation needs a name." };
    const back = apiReturnsId ? created : { Name: name, Is_Active: true };
    table.push(created);
    set("newName")(""); set("adding")(false);
    set("search")(""); set("roleFilter")("");
    set("editingOrg")(false);
    set("branchFor")(null); set("contactFor")(null);
    const fresh = table.slice();
    set("rows")(fresh);
    const id = back?.Organisation_ID ?? fresh.find((r) => r.Name === name)?.Organisation_ID;
    if (id) set("selected")(id);
    return st;
  };

  const base = {
    rows: [{ Organisation_ID: 4, Name: "Anwyl", roles: "Developer", Is_Active: true }],
    selected: 4, search: "anw", roleFilter: "Developer", showInactive: false,
    newName: "  Vistry (Midlands)  ", adding: true,
    editingOrg: true, branchFor: 77, contactFor: 78,
  };

  for (const apiReturnsId of [true, false]) {
    const table = base.rows.slice();
    const st = await run({ apiReturnsId, startState: base, table });

    if (st.selected !== 91) {
      fail(`the new organisation was not selected (id came back as ${st.selected}`
        + `, api returned an id: ${apiReturnsId})`);
    }
    const shown = visible(st.rows, st);
    if (!shown.some((r) => r.Organisation_ID === 91)) {
      fail("the new organisation was selected but filtered out of the list");
    }
    if (st.branchFor !== null || st.contactFor !== null) {
      fail("a branch or contact form stayed open across the switch of organisation");
    }
    if (st.editingOrg !== false) fail("the details editor stayed open on the previous organisation");
    if (st.adding !== false) fail("the add form stayed open after adding");
    if (st.newName !== "") fail("the typed name was not cleared");
  }

  /* An empty name creates nothing and changes no selection. */
  {
    const table = base.rows.slice();
    const st = await run({ apiReturnsId: true, startState: { ...base, newName: "   " }, table });
    if (st.error !== "An organisation needs a name.") fail("a blank name was accepted");
    if (table.length !== base.rows.length) fail("a blank name still inserted a row");
    if (st.selected !== 4) fail("a blank name moved the selection");
  }
}

/* ─── 7. The screen itself, mounted and driven ───

   Everything above reads the source or re-implements a rule. This part
   mounts the real panel with a fake network and adds an organisation
   through the form, because the fault that started this — the new row
   filtered out of the list it had just been added to — only exists once
   the filters, the create and the re-render are all the component's own.

   The list is narrowed first, with a search term and a role, because
   that is the state the fault needs: a brand-new organisation matches
   neither. */
{
  const bundle = await build({
    entryPoints: [SRC],
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
  for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement",
    "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle",
    "requestAnimationFrame", "cancelAnimationFrame", "sessionStorage", "localStorage"]) {
    if (globalThis[k] === undefined) globalThis[k] = window[k];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  /* Two developers, both holding a role, so the role filter is a real
     filter and not a no-op. The organisation added below holds none. */
  const orgs = [
    { Organisation_ID: 4, Name: "Anwyl Homes", Code: "ANW", roles: "Developer",
      trades: "", branch_count: 1, contact_count: 2, Is_Active: true },
    { Organisation_ID: 5, Name: "Barratt", Code: "BAR", roles: "Developer",
      trades: "", branch_count: 1, contact_count: 1, Is_Active: true },
  ];
  let nextId = 90;

  /* text(), not json() — the API wrapper reads the body as text and parses
     it itself, so a fake answering only json() hands back undefined and
     the screen loads empty. */
  const reply = (status, payload) => ({
    ok: status < 400, status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  });

  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url), "http://localhost/");
    const what = u.searchParams.get("what");
    const id = u.searchParams.get("id");
    const method = (opts.method || "GET").toUpperCase();

    if (u.pathname === "/api/lookups") return reply(200, { regions: [] });
    if (u.pathname !== "/api/organisations") return reply(404, { error: u.pathname });

    if (method === "GET" && what === "types") {
      return reply(200, {
        types: [{ Organisation_Type_ID: 1, Label: "Developer" }],
        subtypes: [],
      });
    }
    if (method === "GET" && what === "detail") {
      const organisation = orgs.find((o) => String(o.Organisation_ID) === String(id)) || null;
      return reply(200, { organisation, roles: [], branches: [], contacts: [], utilities: [] });
    }
    if (method === "GET") return reply(200, { rows: orgs.slice() });
    if (method === "POST" && !what) {
      const body = JSON.parse(opts.body);
      const row = {
        Organisation_ID: ++nextId, Name: body.Name, Code: null, roles: "",
        trades: "", branch_count: 1, contact_count: 0, Is_Active: true,
      };
      orgs.push(row);
      return reply(201, row);
    }
    return reply(405, { error: method });
  };

  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const shared = {
    react: React,
    "react-dom": await import("react-dom"),
    "react-dom/client": await import("react-dom/client"),
    "react/jsx-runtime": await import("react/jsx-runtime"),
  };
  const shim = (mid) => {
    const m = shared[mid];
    if (!m) throw new Error("unexpected external: " + mid);
    return m.default && m.default.createElement ? m.default : m;
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "globalThis",
    bundle.outputFiles[0].text)(shim, mod, mod.exports, globalThis);
  const Panel = mod.exports.default;

  const host = window.document.getElementById("root");
  const root = createRoot(host);
  const settle = async () => {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  };
  const q = (sel) => host.querySelector(sel);
  const qa = (sel) => [...host.querySelectorAll(sel)];
  const byText = (sel, label) => qa(sel).find((e) => (e.textContent || "").trim() === label);
  const click = async (el, what) => {
    if (!el) return fail(`clicked ${what}, which is not there`);
    await act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await settle();
  };
  /* React tracks the last value it wrote, so assigning .value directly is
     seen as no change and onChange never fires. */
  const setValue = async (el, value, proto) => {
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    await act(async () => {
      setter.call(el, value);
      el.dispatchEvent(new window.Event("input", { bubbles: true }));
      el.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await settle();
  };

  await act(async () => { root.render(React.createElement(Panel)); });
  await settle();

  const list = q(".oa-list");
  if (!list) fail("the list panel did not render");
  else {
    const kids = [...list.children];
    const addIdx = kids.findIndex((k) => (k.textContent || "").includes("+ Add organisation"));
    const firstItem = kids.findIndex((k) => k.classList?.contains("oa-item"));
    if (addIdx < 0) fail("the add control did not render inside the list panel");
    else if (firstItem < 0) fail("no organisations rendered, so the ordering cannot be judged");
    else if (addIdx > firstItem) fail("the add control rendered below the organisations");
  }

  // Narrowed down the way somebody would be before reaching for "add".
  await setValue(q(".oa-search"), "anwyl", window.HTMLInputElement.prototype);
  await setValue(q(".oa-rolefilter"), "Developer", window.HTMLSelectElement.prototype);
  if (qa(".oa-item").length !== 1) {
    fail(`the filters did not narrow the list (${qa(".oa-item").length} rows shown)`);
  }

  await click(byText("button", "+ Add organisation"), "the add button");
  const nameBox = q(".oa-add input");
  if (!nameBox) fail("the name form did not open");
  else {
    await setValue(nameBox, "Vistry Midlands", window.HTMLInputElement.prototype);
    await click(byText(".oa-add-actions button", "Add"), "the Add button");
    await settle();

    const rows = qa(".oa-item");
    const row = rows.find((r) => (r.textContent || "").includes("Vistry Midlands"));
    if (!row) {
      fail("the organisation was created but its row is not in the list"
        + ` (showing: ${rows.map((r) => r.querySelector(".oa-name")?.textContent).join(" | ") || "nothing"})`);
    } else if (!row.classList.contains("on")) {
      fail("the new organisation's row is in the list but not selected");
    }
    const head = q(".oa-detail h3");
    if (!head || !(head.textContent || "").includes("Vistry Midlands")) {
      fail(`the detail panel is not on the new organisation (it shows "${head?.textContent ?? "nothing"}")`);
    }
    /* The point of selecting it: branches and contacts, straight away. */
    if (!byText(".oa-detail .oa-new", "+ Add branch")) {
      fail("no way to add a branch to the organisation just created");
    }
  }

  await act(async () => { root.unmount(); });
}

console.log(bad ? `\n${bad} problem(s)`
  : "Adding an organisation: button above the list, new organisation selected and visible.");
process.exit(bad ? 1 : 0);
