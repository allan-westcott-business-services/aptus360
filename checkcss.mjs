/* Stylesheets held in template literals must not be empty.

   ── The failure ──

   A stray backtick inside a `const CSS = ` template literal ends the
   string early. What follows is parsed as JavaScript, and if it happens
   to be syntactically valid the module still loads — it just exports an
   empty stylesheet. Nothing throws, the build passes, the tests pass,
   and every screen using that stylesheet renders unstyled.

   That is exactly what happened to the HR module: a comment reading
   "Was a bare `*` reset" closed HR_CSS at the word "bare", so 10,000
   characters of styling never reached the page and the screens looked
   like a different application.

   Checking that each exported stylesheet is non-empty catches it, and
   catches the same mistake in the four operator form stylesheets, which
   are large template literals full of prose comments. */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(name)) out.push(full);
  }
  return out;
}

let bad = 0, checked = 0;
for (const file of walk("src")) {
  const mod = await import("./" + relative(".", file).replace(/\\/g, "/"))
    .catch(() => null);
  if (!mod) continue;                       // needs a browser; not our concern
  const src = readFileSync(file, "utf8");
  for (const [name, value] of Object.entries(mod)) {
    if (!/CSS$/.test(name) || typeof value !== "string") continue;
    /* Only template literals can be truncated by a stray backtick. An
       export deliberately set to "" — useTableLayout does this, so a
       component that still concatenates it stays harmless — is not a
       fault and must not be reported as one. */
    if (!new RegExp(`export const ${name}\\s*=\\s*\``).test(src)) continue;
    checked++;
    if (value.trim().length === 0) {
      console.log(`  FAIL ${relative(".", file)}: ${name} is empty`);
      console.log("       A stray backtick in the template literal ends it early.");
      bad++;
    } else if (!value.includes("{")) {
      console.log(`  FAIL ${relative(".", file)}: ${name} has no rules in it`);
      bad++;
    }
  }
}

console.log(bad ? `\n${bad} empty stylesheet(s)`
  : `All ${checked} exported stylesheets have rules in them.`);
process.exit(bad ? 1 : 0);
