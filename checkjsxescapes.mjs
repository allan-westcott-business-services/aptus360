/* A \uXXXX escape only means something inside a JavaScript string.

   Written into JSX text — between a > and a < — it is six literal
   characters, and the user reads "held on it \u2014 it bends". Shipped
   in the breech dialog and reported from a screenshot.

   The trap is that the same sequence one line away, inside quotes, is
   correct and common: this file writes "\u2014" in string literals
   everywhere. So the eye slides over it, and neither the build nor
   any test notices, because the JSX is valid either way.

   The scan: for each line, find every \uXXXX, and decide whether it
   sits inside a quoted string by counting unescaped quotes before it.
   An odd count means inside a string, which is fine. An even count
   means it is loose in the markup, which is the fault. */
import { readdirSync, readFileSync, statSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(path);
    else if (/\.jsx$/.test(e.name)) files.push(path);
  }
};
walk("./src");

/* ── Where in the file are we ──

   A per-line guess is not enough. This codebase writes block comments
   without leading asterisks, so a continuation line looks like plain
   code, and the first version of this check reported five hundred
   comments as faults. Prose ABOUT an escape is not an escape.

   So: one pass over the characters, tracking whether we are in code,
   a line comment, a block comment, a quoted string or a template
   literal. A `\uXXXX` seen while in CODE is the fault — inside a
   string it is an escape and correct, inside a comment it is prose.

   Regular expressions are treated as code, so `/\u2014/` would be
   reported. None exists today; if one is written, it wants a comment
   here rather than a silent exception. */
function strandedEscapes(src) {
  const out = [];
  let i = 0;
  let line = 1;
  let state = "code";
  let quote = null;
  const stack = [];
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "\n") { line++; i++; if (state === "line") state = "code"; continue; }

    if (state === "code") {
      if (c === "/" && next === "*") { state = "block"; i += 2; continue; }
      if (c === "/" && next === "/") { state = "line"; i += 2; continue; }
      /* Back out of a ${ } hole into the template that opened it. */
      if (c === "}" && stack.length) { state = "string"; quote = stack.pop(); i++; continue; }
      if (c === '"' || c === "'" || c === "`") { state = "string"; quote = c; i++; continue; }
      if (c === "\\" && next === "u" && /^[0-9a-fA-F]{4}/.test(src.slice(i + 2, i + 6))) {
        out.push({ line, text: src.slice(i, i + 6) });
        i += 6;
        continue;
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") { state = "code"; i += 2; continue; }
      i++;
      continue;
    }

    if (state === "line") { i++; continue; }

    /* In a string: an escaped character cannot end it. */
    if (c === "\\") { i += 2; continue; }
    /* A ${ } hole inside a template is CODE again, and may hold
       another template. Without this, the nested backtick read as the
       closing one and everything after it looked like markup \u2014
       nine of the first eleven reports were that. */
    if (quote === "`" && c === "$" && next === "{") {
      stack.push(quote);
      state = "code";
      quote = null;
      i += 2;
      continue;
    }
    if (c === quote) { state = "code"; quote = null; }
    i++;
  }
  return out;
}

for (const path of files) {
  for (const hit of strandedEscapes(readFileSync(path, "utf8"))) {
    fail(`${path}:${hit.line} has ${hit.text} loose in the markup, where it `
      + `is six literal characters on screen \u2014 use {"${hit.text}"} or the `
      + "named entity");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `No unicode escape is stranded in JSX text (${files.length} files).`);
process.exit(bad ? 1 : 0);
