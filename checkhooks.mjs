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

  /* ── A const reading another const declared below it ──

     Same fault, no hook involved: `const a = b.length > 1` where `b` is
     declared further down throws "Cannot access 'b' before
     initialization" the moment the component renders, and the page goes
     blank. This is how splitByDay was written \u2014 above the schedule it
     measured \u2014 and the hook check above sailed past it because there
     was no dependency array to look at.

     Only single-line initialisers, and only names this file declares
     with const or let. Anything spanning lines is left alone: a
     multi-line initialiser is usually a function body, and a function
     body runs later, when everything exists. */
  /* Two spaces of indent: the top level of a component. Deeper than
     that is inside a callback, where the names in scope are parameters
     this has no way to see \u2014 and where the code runs later anyway, so
     the fault cannot happen. Restricting to the outer level is what
     makes this quiet enough to be worth having. */
  /* Where each top-level function starts, and what it takes as
     parameters. A name can be a parameter here and a const there \u2014
     `contrast(a, b)` beside a `const a` in the next function \u2014 and
     without this the two look like one binding used too early. */
  const funcs = [...src.matchAll(
    /^(?:export\s+)?(?:default\s+)?function\s+\w+\s*\(([^)]*)\)/gm)]
    .map((f) => ({
      at: f.index,
      params: new Set(f[1].split(/[,{}[\]:]/)
        .map((x) => x.trim().split(/[=\s]/)[0])
        .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x))),
    }));
  const funcAt = (i) => {
    let last = null;
    for (const f of funcs) if (f.at <= i) last = f;
    return last;
  };

  for (const m of src.matchAll(
    /^ {2}const\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n]*)$/gm)) {
    /* Strings, regexes and property names are not references.
       `.map(` is not the variable `map`; `/pdf/` is not `pdf`. Left in,
       they made every reported line a false one. */
    const init = m[2]
      .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""')
      .replace(/\/(?![/*])(?:\\.|\[[^\]]*\]|[^/\n])+\/[gimsuy]*/g, "RE")
      .replace(/\.\s*[A-Za-z_$][\w$]*/g, ".x");
    /* A function of any shape runs later, not now. */
    if (/=>|\bfunction\b/.test(m[2])) continue;
    if (/\buse[A-Z]/.test(init)) continue;          // hooks: handled above
    const here = m.index;
    for (const ref of init.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      const name = ref[1];
      if (name === m[1]) continue;
      const at = declared.get(name);
      if (at === undefined) continue;
      if (at < here) continue;
      /* Both in the same function, or they are different bindings. */
      if (funcAt(here) !== funcAt(at)) continue;
      /* And not a parameter of it, which exists before any line runs. */
      if (funcAt(here)?.params.has(name)) continue;
      /* And the declaration it points at must be at the same level, or
         it is a different binding that happens to share a name. */
      /* From the start of its line, not from the keyword: `at` points
         at "const", so slicing there would never show the indent. */
      const lineStart = src.lastIndexOf("\n", at) + 1;
      if (!/^ {2}(?:const|let)\s/.test(src.slice(lineStart, src.indexOf("\n", at)))) {
        continue;
      }
      console.log(`  ${relative(".", file)}:${lineOf(src, here)}`);
      console.log(`      const ${m[1]} reads "${name}", `
        + `declared below at line ${lineOf(src, at)}`);
      bad++;
    }
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
  ? `\n${bad} value(s) read before they are declared. These throw `
    + '"Cannot access X before initialization" and blank the page.'
  : `Nothing is read before it is declared (${files.length} files checked).`);
process.exit(bad ? 1 : 0);
