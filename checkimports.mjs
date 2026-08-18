/* Every local import names something that is actually exported.

   A missing named export is not caught by anything until the bundler
   reaches it. Node does not load these files, the check scripts import
   only the modules they test, and the canvas is too large to notice a
   name that quietly stopped existing — so the first thing that objects
   is `vite build`, on Netlify, after the commit.

   That is exactly how the joint-label rename broke a deploy: labelKinds
   renamed two of its exports, the canvas was copied in on a later pass,
   and for one build the canvas asked for a name the module no longer
   had. The files are hand-copied here a file at a time, which makes a
   half-applied change the normal case rather than an unlucky one.

   Cheap to check and worth checking on every run: read the imports,
   read the exports, compare.

   ── What it does not do ──

   It is a reader, not a parser. Import and export statements are matched
   by shape, which covers everything in this repo and would miss
   something exotic — an export built at runtime, or a name re-exported
   through a chain this does not follow past one hop. A miss here is a
   name it fails to object to, never one it objects to wrongly, so the
   check can be trusted when it complains and is not the last word when
   it is quiet. */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Every source file, and the root check scripts — those import from src
   too, and a check that cannot load its own module is a check that
   silently stops testing anything. */
const strays = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (!/\.(js|jsx|mjs)$/.test(name)) continue;

    /* A check script under src is a copy that landed in the wrong
       place. They import by paths relative to the repo root, so they
       cannot run from there and nothing in npm test refers to them —
       the real ones sit beside package.json. Noted rather than failed
       on: they are litter from copying files in by hand, not a broken
       import, and a check that goes red for them would be ignored. */
    if (/^check.*\.mjs$/.test(name)) { strays.push(p); continue; }

    out.push(p);
  }
  return out;
}

const files = [
  ...walk("src"),
  ...readdirSync(".").filter((f) => /^check.*\.mjs$/.test(f)),
];

/* What a module exports, by name.

   `export * from "./x"` is followed one hop, which is all this repo
   uses. A default export is recorded as "default" so an import of it is
   not reported as missing. */
const cache = new Map();

function exportsOf(file, depth = 0) {
  if (cache.has(file)) return cache.get(file);
  const names = new Set();
  cache.set(file, names);                 // set first: a cycle stops here

  let src;
  try { src = readFileSync(file, "utf8"); } catch { return names; }

  for (const m of src.matchAll(
    /^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  if (/^\s*export\s+default\b/m.test(src)) names.add("default");

  /* Braced exports and re-exports: `export { a, b as c }`, with or
     without a `from`. The name that matters is the one after `as`,
     since that is what an importer asks for. */
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const bits = part.trim().split(/\s+as\s+/);
      const name = (bits[1] ?? bits[0] ?? "").trim();
      if (name) names.add(name);
    }
  }

  if (depth < 3) {
    for (const m of src.matchAll(/^\s*export\s*\*\s*from\s*["']([^"']+)["']/gm)) {
      const target = resolveLocal(file, m[1]);
      if (target) for (const n of exportsOf(target, depth + 1)) names.add(n);
    }
  }

  return names;
}

/* A relative specifier as a path on disk, or null where it is a package
   or something this does not resolve. */
function resolveLocal(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
    join(base, "index.js"), join(base, "index.jsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

let checked = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");

  for (const m of src.matchAll(
    /^\s*import\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/gm)) {
    const clause = m[1];
    const spec = m[2];

    if (!spec.startsWith(".")) continue;          // a package, not ours

    const target = resolveLocal(file, spec);
    if (!target) {
      fail(`${file} imports "${spec}", which is not a file`);
      continue;
    }

    /* Only the braced part carries names. A default or namespace import
       asks for nothing in particular. */
    const braced = clause.match(/\{([\s\S]*)\}/);
    if (!braced) continue;

    const have = exportsOf(target);
    for (const part of braced[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      checked++;
      if (!have.has(name)) {
        fail(`${file} imports { ${name} } from "${spec}", which does not export it`);
      }
    }
  }
}

if (strays.length) {
  console.log(`  note: ${strays.length} check script(s) sitting under src/ `
    + "and belonging beside package.json \u2014 safe to delete:");
  for (const p of strays) console.log(`        ${p}`);
}

console.log(bad ? `\n${bad} problem(s)`
  : `Imports line up (${checked} named imports across ${files.length} files).`);
process.exit(bad ? 1 : 0);
