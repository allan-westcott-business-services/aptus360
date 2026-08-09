/* A hook reading a value declared below it.

   ── The failure ──

   `useMemo` and `useCallback` run their factory during render, so a
   factory reading a `const` declared further down the component hits a
   temporal dead zone:

       Cannot access 'stage' before initialization

   In a production build the name is minified, so it reads as "Cannot
   access 'A' before initialization" — and it takes the whole page down,
   not the part that was wrong. This is recurring fault 2 in
   HANDOVER.md, and it has now happened four times.

   ── Why checkorder.py misses it ──

   That check deliberately ignores references inside arrow bodies,
   because most of them are callbacks that run later, when the `const`
   exists. A `useMemo` factory is the exception: it is an arrow that
   runs immediately.

   ── What is checked ──

   The dependency array, which names exactly the outer values the
   factory closes over and is unambiguous to read. Each dependency must
   be declared before the hook, or be a parameter, an import, or defined
   at module level. Anything declared later in the same file with
   `const` or `let` is the fault above.

       node checkhooks.mjs
*/
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const HOOKS = /\b(useMemo|useCallback)\s*\(/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(name)) out.push(full);
  }
  return out;
}

/* The dependency array of the hook call starting at `from`: the last
   bracketed list before the call's closing paren. Found by counting
   depth rather than by regex, because a factory body contains brackets
   of its own. */
function depsOf(src, from) {
  let depth = 0, lastOpen = -1, lastClose = -1;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") {
      if (c === "[" && depth === 1) lastOpen = i;
      depth++;
    } else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (c === "]" && depth === 1) lastClose = i;
      if (depth === 0) break;
    }
  }
  if (lastOpen === -1 || lastClose < lastOpen) return null;
  return { text: src.slice(lastOpen + 1, lastClose), at: lastOpen };
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

let bad = 0;
const files = walk("src");

for (const file of files) {
  const src = readFileSync(file, "utf8");

  /* Where each name is declared with const/let at any nesting. Only the
     first is recorded: a name redeclared in an inner scope is a
     different binding, and treating the later one as authoritative
     would report a hook that is perfectly correct. */
  const declared = new Map();
  for (const m of src.matchAll(/\b(?:const|let)\s+(?:\{([^}]*)\}|\[([^\]]*)\]|([A-Za-z_$][\w$]*))/g)) {
    const names = (m[1] ?? m[2] ?? m[3] ?? "")
      .split(",")
      .map((n) => n.split(":").pop().replace(/=.*/, "").trim().replace(/^\.\.\./, ""))
      .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
    for (const n of names) if (!declared.has(n)) declared.set(n, m.index);
  }

  for (const hook of [...src.matchAll(HOOKS)]) {
    const deps = depsOf(src, hook.index + hook[0].length - 1);
    if (!deps) continue;
    const names = deps.text
      .split(",")
      .map((d) => d.trim().split(/[.?[]/)[0])
      .filter((d) => /^[A-Za-z_$][\w$]*$/.test(d));

    for (const name of new Set(names)) {
      const at = declared.get(name);
      if (at === undefined) continue;              // param, import, or module level
      if (at < hook.index) continue;               // declared above: fine
      console.log(`  ${relative(".", file)}:${lineOf(src, hook.index)}`);
      console.log(`      ${hook[1]} depends on "${name}", `
        + `declared below at line ${lineOf(src, at)}`);
      bad++;
    }
  }
}

console.log(bad
  ? `\n${bad} hook(s) reading a value declared below them. These throw `
    + '"Cannot access X before initialization" and blank the page.'
  : `No hook reads a value declared below it (${files.length} files checked).`);
process.exit(bad ? 1 : 0);
