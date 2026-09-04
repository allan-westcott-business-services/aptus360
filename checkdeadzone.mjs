/* A hook's dependency array naming something declared further down.

   A dependency array is evaluated DURING RENDER, unlike the effect body
   which runs after. So naming a `const` declared later in the component
   reads it in its temporal dead zone, and React throws "Cannot access
   '$r' before initialization" — the whole page, not the feature.

   Nothing catches it: `vite build` compiles it happily, because it is a
   runtime fault and a legal one to write. It showed up on screen, as a
   canvas that would not open at all.

   The effect body is fine either way — it runs long after everything is
   declared — so only the array is checked here. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
};
walk("./src");

/* Reserved words and globals that look like identifiers in an array. */
const IGNORE = new Set(["true", "false", "null", "undefined", "window",
  "document", "Math", "JSON", "Date", "Number", "String", "Boolean", "Array",
  "Object", "console"]);

for (const path of files) {
  const raw = readFileSync(path, "utf8");
  /* Comments blanked, newlines kept, so a dependency array written out
     in prose is not read as code. */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, "");

  /* Where each const or let is declared. `var` and `function` hoist, so
     they cannot be in a dead zone and are not collected. */
  const declared = new Map();
  /* The EARLIEST declaration of a name, not the first one the regexes
     happen to find.

     A component declares `const [rows, setRows] = useState()` near the
     top and often a local `const rows = ...` inside a handler far
     below. Recording whichever pattern matched first named the inner
     one and reported nine faults on pages that work perfectly — the
     shadowed local is not what the dependency array refers to.

     Earliest is also the conservative choice: it can miss a real fault
     where a name is genuinely declared twice, and it cannot invent one.
     A check that cries wolf gets switched off, and then catches
     nothing at all. */
  const note = (name, at) => {
    const had = declared.get(name);
    if (had == null || at < had) declared.set(name, at);
  };
  for (const m of src.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) {
    note(m[1], m.index);
  }
  /* Destructured too: `const { a, b } = ...` and `const [a] = ...`. */
  for (const m of src.matchAll(/^\s*(?:const|let)\s*[[{]([^}\]]+)[\]}]\s*=/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.split(":").pop().trim().replace(/^\.\.\./, "");
      if (/^[A-Za-z_$][\w$]*$/.test(name)) note(name, m.index);
    }
  }

  /* Which top-level function a position is in.

     Without this the check is file-scoped, and a file with two
     components in it reports one's parameter against the other's state:
     `usePopupPos(open)` and a `const [open]` inside a different
     component two lines below are not the same `open` at all.

     Real scope analysis wants a parser. This is the cheap approximation
     that covers the fault as it occurs — a hook and a declaration
     inside one long component — and stays quiet across a file holding
     several. */
  const bounds = [...src.matchAll(/^(?:export\s+default\s+|export\s+)?function\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => ({ at: m.index, name: m[1] }));
  const scopeOf = (at) => {
    let name = "(module)";
    for (const b of bounds) { if (b.at <= at) name = b.name; else break; }
    return name;
  };

  /* Dependency arrays: the `}, [ ... ])` that closes a hook. */
  for (const m of src.matchAll(/\}\s*,\s*\[([^\]]*)\]\s*\)/g)) {
    const at = m.index;
    for (const raw2 of m[1].split(",")) {
      const name = raw2.trim().split(/[.?[]/)[0].trim();
      if (!name || IGNORE.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      const declaredAt = declared.get(name);
      if (declaredAt != null && declaredAt > at
        && scopeOf(declaredAt) === scopeOf(at)) {
        const line = src.slice(0, at).split("\n").length;
        fail(`${path}:${line} — a dependency array names \`${name}\`, which is `
          + `declared at line ${src.slice(0, declaredAt).split("\n").length}. `
          + "Dependency arrays are evaluated during render, so this reads it "
          + "in its dead zone and the page will not open.");
      }
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "No hook depends on something declared later.");
process.exit(bad ? 1 : 0);
