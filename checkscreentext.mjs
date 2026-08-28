/* Escapes that only work inside a string.

   `\u2014` is an em dash to JavaScript. It is six characters to JSX
   text. Written in a template literal it renders as a dash; written
   between tags it renders as a backslash, a u and four digits, on
   screen, to a customer.

   One had been sitting in the Circuit Report: "50 not reached from the
   substation \u2014 check the feeder starts on it". Every other escape in
   that file is inside a template literal, where it works, which is
   exactly why the one that was not lasted — the pattern looks right,
   and it is right nearly everywhere it appears.

   This is a class of fault rather than an incident, so it is checked
   across every screen rather than fixed in the one place it was found.

   ── And the origin is whatever the drawing has ──

   That same sentence said "substation" on a site fed from a POC, and
   told somebody to check a feeder starts on a thing that is not on
   their drawing. The report has always known which it is. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

function jsxFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsxFiles(p));
    else if (name.endsWith(".jsx")) out.push(p);
  }
  return out;
}

/* ── Only what would render ──

   Comments are full of these and they are fine there: this file's own
   header has two. Strings and template literals are fine too, which is
   where nearly every one lives.

   So both are stripped before looking, and what is left is text
   between tags. Getting that wrong in the loose direction would flood
   the output with hits nobody can act on, which is how a check comes to
   be ignored. */
/* ── Read the file, do not pattern-match it ──

   Two regex attempts failed here and both failed the same way. Strip
   the strings and look at the rest: a template literal spans lines and
   can hold another inside `${...}`, so the pattern either misses the
   nesting or eats past the closing backtick — ten correct messages
   reported as faults. Match the text between tags instead: `${...}`
   makes `}` and `{` everywhere, so a hundred and forty-five.

   A regex cannot tell code from string in a language with nestable
   literals. So this walks the characters and keeps track: in code, in a
   line comment, in a block comment, in a quote, in a template literal
   and how deep. It is thirty lines and it is right, which the clever
   version was not.

   What is kept is the code, with everything else blanked and the
   newlines preserved so a hit still reports its own line. An escape
   renders as text in exactly one place: between a `>` or `}` and the
   next `<` or `{`. */
function codeOnly(src) {
  const out = new Array(src.length).fill(" ");
  let i = 0;
  /* Template literals nest through ${...}, so the state is a stack
     rather than a flag. */
  const stack = [];
  const top = () => stack[stack.length - 1];

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    const state = top();

    if (src[i] === "\n") { out[i] = "\n"; i++; continue; }

    if (state === "line") { if (c === "\n") stack.pop(); i++; continue; }
    if (state === "block") {
      if (c === "*" && next === "/") { stack.pop(); i += 2; continue; }
      i++; continue;
    }
    if (state === "'" || state === '"') {
      if (c === "\\") { i += 2; continue; }
      if (c === state) stack.pop();
      i++; continue;
    }
    if (state === "`") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { stack.pop(); i++; continue; }
      /* Into an expression, which is code again. */
      if (c === "$" && next === "{") { stack.push("expr"); i += 2; continue; }
      i++; continue;
    }

    /* Code, or an expression inside a literal. */
    if (c === "/" && next === "/") { stack.push("line"); i += 2; continue; }
    if (c === "/" && next === "*") { stack.push("block"); i += 2; continue; }
    if (c === "'" || c === '"' || c === "`") { stack.push(c); i++; continue; }
    if (state === "expr" && c === "}") { stack.pop(); i++; continue; }
    if (state === "expr" && c === "{") { stack.push("expr"); i++; continue; }

    out[i] = c;
    i++;
  }
  return out.join("");
}

function renderableEscapes(src) {
  const code = codeOnly(src);
  const lines = src.split("\n");
  const hits = [];
  for (const m of code.matchAll(/[>}]([^<>{}]*)[<{]/g)) {
    if (!/\\u[0-9a-fA-F]{4}/.test(m[1])) continue;
    const line = code.slice(0, m.index).split("\n").length;
    hits.push({ line, text: (lines[line - 1] || "").trim() });
  }
  return hits;
}

// 1. No screen renders an escape as literal text.
for (const file of jsxFiles("./src")) {
  for (const hit of renderableEscapes(readFileSync(file, "utf8"))) {
    fail(`${file}:${hit.line} renders an escape as text \u2014 use the HTML entity `
      + `(&mdash;, &middot;) in JSX: ${hit.text.slice(0, 70)}`);
  }
}

/* 2. And the check can see the fault it exists for.

   A check that cannot fail is worse than none, and this one strips so
   much before looking that it is worth proving it still finds
   something. */
{
  const planted = renderableEscapes('<p>50 not reached \\u2014 check it</p>');
  if (!planted.length) {
    fail("the escape check no longer detects an escape in JSX text");
  }
  /* And does not fire on the two places it is correct. */
  if (renderableEscapes('const s = `a \\u2014 b`;').length) {
    fail("the escape check fires on a template literal, where the escape works");
  }
  /* And on a literal that spans lines with another inside it, which is
     the shape that defeated the first version. */
  if (renderableEscapes('const s = `a ${x ? `${y} \\u00b7 ` : ""} b`;\\n').length) {
    fail("the escape check fires on a nested template literal");
  }
  if (renderableEscapes('/* a note \\u2014 with a dash */').length) {
    fail("the escape check fires on a comment");
  }
}

/* 3. The Circuit Report names whichever origin the drawing has.

   "Not reached from the substation" on a POC-fed site sends somebody to
   check a feeder starts on something that is not there. The report
   knows which it is; five places asked, and one of them did not. */
{
  const src = readFileSync("./src/features/gis/CircuitReport.jsx", "utf8");
  /* The code, not the commentary. The file explains this fault at
     length and quotes the sentence that was wrong — a check that
     forbids naming a fault in a comment is a check that stops the
     reason being written down. */
  const code = codeOnly(src);

  if (/from the substation/.test(code)) {
    fail("the Circuit Report still says substation regardless of what feeds the site");
  }
  if (!/originWordOf/.test(code)) {
    fail("the Circuit Report has no single answer for what the site is fed from");
  }
  /* Written once. It was spelled out at five places, and the fifth was
     the one that was wrong — which is what a fifth copy is for. */
  const inline = (code.match(/stationRole === "poc"/g) || []).length;
  if (inline > 1) {
    fail(`the origin word is worked out inline ${inline} times \u2014 once is the definition`);
  }
}

/* ── A level is a property of a cable ──

   The volt drop and loop impedance at a span node come from the cable
   feeding it. The walk that produces them runs on the TRENCH network,
   so a node reached by a dig with nothing laid in it still got a leg,
   and its label showed a figure worked out from a conductor that does
   not exist.

   A number on a drawing is read as a measurement of the design. One
   computed from an absent cable is worse than a blank: a blank says
   "not yet", a number says "this is what it will be", and nothing on
   screen tells them apart. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const fn = canvas.slice(canvas.indexOf("const levelsByNode = useCallback"),
    canvas.indexOf("const levelsKey = useMemo"));

  if (!/if \(!cableAtNode\(src, leg\.stopId\)\) continue;/.test(fn)) {
    fail("a span node with no cable reaching it is still given levels");
  }
  /* Measured against the drawing, not read off the node.

     Build LV Network writes VD_Cable_Size_ID onto the span node, and
     deleting the cable afterwards leaves it there — so a node whose
     cable had been deleted still had a size, still passed, and still
     showed a volt drop for a conductor no longer on the drawing. That
     was the first attempt at this: reading a record of the cable
     instead of looking for the cable. */
  if (/leg\.cableSizeId == null\) continue/.test(fn)) {
    fail("the no-cable test reads the size recorded on the node, which survives the cable");
  }
  const helper = canvas.slice(canvas.indexOf("const cableAtNode = useCallback"),
    canvas.indexOf("const levelsByNode = useCallback"));
  if (!/f\.Layer_Key !== "electric"/.test(helper)) {
    fail("the cable test does not look on the electric layer");
  }
  /* SPAN_REACH_M, not a number invented beside it.

     The model already answers "how far past a cable may a span node
     sit and still be reported" — a cable often stops short of the
     trench end, and the node marking that end is still the node the
     design is measured to. Half a metre was written here first and
     blanked a node two metres off its cable, which is a node placed by
     eye rather than a node with no cable. */
  if (/<= 0\.5\) return true/.test(helper)) {
    fail("the cable test uses its own tolerance instead of SPAN_REACH_M");
  }
  if (!/<= SPAN_REACH_M/.test(helper)) {
    fail("the cable test does not use the reach the rest of the model uses");
  }
  /* A service cable ending at the node is the plot's tail, not the run
     feeding it. */
  if (!/\/service\/i\.test\(type\)/.test(helper)) {
    fail("a service cable counts as the run feeding the node");
  }
  /* Before the figures are worked out, not after: computing them and
     then discarding them is the same answer and a slower one, and it
     invites somebody to use the value on the way past. */
  const guard = fn.indexOf("leg.cableSizeId == null");
  const compute = fn.indexOf("cumulativeToNode(");
  if (guard >= 0 && compute >= 0 && guard > compute) {
    fail("the no-cable test runs after the levels have been computed");
  }
}

console.log(bad === 0
  ? "  ok  Screen text behaves (no escapes rendered raw, the origin named from the drawing)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
