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

/* ── A panel whose body scrolls ──

   `.fe` is a flex column with `max-height: 88vh`, and `.fe-body` has
   `overflow-y: auto`. That is not enough on its own: a flex item's
   `min-height` defaults to `auto` \u2014 "never shrink below my content"
   \u2014 so a tall panel grew past the max height instead of scrolling,
   and the footer was carried out of the white box and left floating on
   the backdrop with the Delete, Cancel and Save buttons on it.

   Reported from the MSDB editor once its rows were reorganised, but
   every modal using `.fe` had the same fault waiting: the bill of
   materials, the bulk editor, the print dialog.

   Checked here because no test that reads values can see it. The DOM
   is correct either way \u2014 the footer IS inside the panel \u2014 and jsdom
   computes no layout, so this is the only place it can be held. */
{
  const fail = (where, why) => { console.log(`  FAIL ${where}: ${why}`); bad++; };
  const css = readFileSync("./src/styles.css", "utf8");
  const body = /\.fe-body \{([^}]*)\}/.exec(css)?.[1] ?? "";
  if (!body) fail("src/styles.css", ".fe-body has no rule at all");
  else {
    if (!/overflow-y:\s*auto/.test(body)) {
      fail("src/styles.css", ".fe-body does not scroll, so a tall panel "
        + "pushes its own footer off the bottom");
    }
    if (!/min-height:\s*0/.test(body)) {
      fail("src/styles.css", ".fe-body has no min-height: 0, so `overflow-y: "
        + "auto` cannot take effect \u2014 a flex item will not shrink below its "
        + "content without it, and the footer is pushed out of the panel");
    }
  }
  /* ── A panel class that means something else ──

     `.fe-board` was the substation's WAY TABLE, `display: grid`. The
     MSDB panel was given that same class for its width, so the panel
     became a grid, `.fe`'s flex column stopped applying, and the
     footer was carried out of the white box with the Delete, Cancel
     and Save buttons on it.

     Nothing failed. The panel rendered, the DOM stayed correct, and
     the only sign was three buttons floating on the backdrop.

     So: a class used to modify `.fe` must not also be defined on its
     own with a display of its own. Checked across the editor's own
     stylesheet, which is where both meanings lived, three thousand
     lines apart. */
  const editorCss = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  for (const m of editorCss.matchAll(/\.fe\.([\w-]+) \{/g)) {
    const name = m[1];
    const own = new RegExp(`^\\.${name} \\{([^}]*)\\}`, "m").exec(editorCss);
    if (own && /display:/.test(own[1])) {
      fail("src/features/gis/FeatureEditor.jsx",
        `.${name} modifies the panel AND has a display of its own \u2014 the `
        + "panel takes that display and stops being a flex column, which "
        + "drops its footer out of the white box");
    }
  }

  const fe = /\.fe \{([^}]*)\}/.exec(css)?.[1] ?? "";
  if (!/flex-direction:\s*column/.test(fe) || !/max-height/.test(fe)) {
    fail("src/styles.css", ".fe is no longer a flex column with a max height, "
      + "which is what the body scrolling and the footer staying both rest on");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `All ${checked} exported stylesheets have rules, and a panel's body scrolls.`);
process.exit(bad ? 1 : 0);
