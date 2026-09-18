/* Closing brackets left behind in JSX, which render as TEXT.

   A `))}` on its own line after an expression that already closed is
   not a syntax error: it is a JSX text node, and React prints it. The
   build passes, nothing warns, and a user sees `))}` floating beside a
   panel — which is what happened twice in one session, both times
   after code was lifted out of a list into its own function and the
   old closers were left where they were.

   The signature is narrow and specific: a line of nothing but closing
   parens, immediately after a line that ends `)}` — an expression that
   has already been closed. A genuine closer never follows one of
   those; it follows the thing it is closing.

   Checked by reading rather than parsing, deliberately. A parser
   accepts this happily, because it IS valid JSX. The fault is not in
   the grammar, it is in the meaning, and the shape of it is what gives
   it away. */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const files = execSync("find src -name '*.jsx'").toString().trim().split("\n")
  .filter(Boolean);

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    /* Nothing but closing parens, optionally finished with a brace. */
    if (!/^\)+\}?$/.test(line)) continue;
    const prev = lines[i - 1].trim();
    /* And the line before it already closed an expression. */
    if (!/\)\}$/.test(prev)) continue;
    fail(`${file}:${i + 1} has "${line}" after an expression that already `
      + "closed, so it renders as text on the page");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `No stray closers render as text (${files.length} files).`);
process.exit(bad ? 1 : 0);
