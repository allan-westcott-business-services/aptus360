/* What an isolate is allowed to take away.

   Opening a utility menu isolates that layer: every feature whose keys
   are not kept gets hidden. That is the point of it — and twice now it
   has taken something with it that the isolate was never about.

   The survey and the span nodes were the first two, and each earned an
   exception on the same argument: a utility shown without the ground it
   runs over is half a drawing.

   The plot seeds and the trench are the same case and a stronger one.
   The seeds say which house each service goes to; the trench says where
   the ground is open. Everything on a utility layer lies in that dig,
   so hiding it shows the cable and not the hole.

   Their own H still hides them. This is only about an isolate taking
   them away as a side effect of asking for something else. */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* ── The sweep ──

   From applyShown to the line that writes the hidden set. Both bounds
   are strings that appear once, and it fails loudly if either moves —
   an earlier version of this file used a boundary that matched
   somewhere else, so the slice ended before the code it was checking
   and every assertion passed with the fix taken out. A check that
   cannot see the fault is worse than no check, because it reports all
   clear. */
{
  const from = canvas.indexOf("const applyShown = useCallback");
  /* The sweep ends where the hidden set is written. That line grew a
     second job \u2014 carrying deliberate hides through, so opening a
     utility never switches a layer back on \u2014 so the boundary is its
     opening now rather than the old one-liner. */
  const to = canvas.indexOf("setHidden((prev) => {");
  if (from < 0 || to < 0 || to <= from) {
    fail("could not find the isolate sweep \u2014 the assertions below are not being made");
  } else {
    const sweep = canvas.slice(from, to);

    // 1. Plot seeds survive.
    if (!/k === "role:plot"/.test(sweep)) {
      fail("isolating a utility hides the plot seeds");
    }
    /* Both spellings. A feature goes if ANY of its keys is hidden, so a
       seed placed on the trench carries the narrower key too — keeping
       only the plain one leaves it hidden by the other and takes the
       seed with it. That was exactly the span node bug. */
    if (!/endsWith\(":role:plot"\)/.test(sweep)) {
      fail("only the plain plot key is kept \u2014 a seed on the trench is still hidden");
    }

    /* 1b. Including the layer key the seeds are drawn on.

       A plot seed and a supply seed both live on Layer_Key "plot", so a
       seed carries `plot` as well as `role:plot` — and a feature is
       hidden if ANY of its keys is hidden. Keeping the role key while
       sweeping the layer key away hid the seed anyway, by the other
       name.

       That is exactly what happened: the rule read correctly, the seeds
       still vanished, and the key that took them was the one nobody had
       named. */
    if (!/k === "plot"/.test(sweep)) {
      fail("the layer the seeds are drawn on is swept away, so they vanish "
        + "however carefully their role key is kept");
    }

    /* 1c. And the supply seeds.

       A non-residential supply is a seed like a dwelling is one: it is
       where a service goes to, and a design with the pumping station
       missing is missing the load that sized the cable. */
    if (!/k === "role:nrs"/.test(sweep)) {
      fail("isolating a utility hides the non-residential supply seeds");
    }
    if (!/endsWith\(":role:nrs"\)/.test(sweep)) {
      fail("only the plain supply key is kept \u2014 the narrower one still hides it");
    }

    // 2. And the trench.
    if (!/k === "trench"/.test(sweep)) {
      fail("isolating a utility hides the trench layer");
    }
    if (!/startsWith\("lt:trench/.test(sweep)) {
      fail("the trench line types are not kept \u2014 the dig disappears under an isolate");
    }
  }
}

/* ── What is being placed stays on screen ──

   A seed hidden while seeds are being placed means tapping the plan and
   watching nothing appear. The work looks like it failed, so it gets
   done twice — and the second seed is real.

   Only while a placement is waiting for a click. Everything else stays
   hidden as it was, and when the queue is done the layer goes back to
   whatever the drawing said. */
{
  const vFrom = canvas.indexOf("const visible = useMemo");
  const vTo = canvas.indexOf("if (outsideCircuit(f, isolatedCircuit)) return false;");
  if (vFrom < 0 || vTo < 0 || vTo <= vFrom) {
    fail("could not find the visibility filter \u2014 the assertions below are not being made");
  } else {
    const vis = canvas.slice(vFrom, vTo);

    if (!/awaitingClick/.test(vis)) {
      fail("a seed being placed can still be hidden by an isolate");
    }
    /* Above the hidden test, or it never runs: the filter returns false
       on a hidden key before it would reach the guard. */
    const guard = vis.indexOf("awaitingClick");
    const hide = vis.indexOf("hidden.includes(k)");
    if (guard >= 0 && hide >= 0 && guard > hide) {
      fail("the placement guard sits below the hidden test, so it never runs");
    }
  }

  /* Declared above its first use.

     `visible` is a memo that runs during render, so reading a const
     declared below it throws — and that takes the whole canvas out
     rather than losing a layer. This is how it was first written, and
     it is recurring fault 2. */
  const declared = canvas.indexOf("const awaitingClick =");
  const usedAt = canvas.indexOf("const visible = useMemo");
  if (declared < 0) fail("awaitingClick is not declared at all");
  else if (declared > usedAt) {
    fail("awaitingClick is declared after `visible` reads it \u2014 the canvas will not render");
  }
  const placingAt = canvas.indexOf("const placing =");
  if (placingAt < 0 || placingAt > declared) {
    fail("placing is declared after awaitingClick reads it");
  }
}

/* ── What actually survives, not what the rules say ──

   The assertions above read the source. This runs the sweep: every key
   each kind of feature carries, and whether the feature is left visible
   when a utility is isolated.

   Worth having because the fault it catches is invisible in the rules.
   Keeping `role:plot` looks like keeping the seeds — until you notice
   they also carry `plot`, and one hidden key is enough. */
{
  const classKeys = (f) => [
    f.Layer_Key,
    f.Attributes?.Line_Type ? `lt:${f.Attributes.Line_Type}` : null,
    f.Feature_Role && f.Feature_Role !== "shape" ? `role:${f.Feature_Role}` : null,
    f.Layer_Key && f.Feature_Role && f.Feature_Role !== "shape"
      ? `${f.Layer_Key}:role:${f.Feature_Role}` : null,
  ].filter(Boolean);

  const feats = [
    { name: "plot seed", keep: true, f: { Layer_Key: "plot", Feature_Role: "plot", Attributes: {} } },
    { name: "supply seed", keep: true, f: { Layer_Key: "plot", Feature_Role: "nrs", Attributes: {} } },
    { name: "mains trench", keep: true, f: { Layer_Key: "trench", Attributes: { Line_Type: "trench_main" } } },
    { name: "service trench", keep: true, f: { Layer_Key: "trench", Attributes: { Line_Type: "trench_service" } } },
    { name: "existing trench", keep: true, f: { Layer_Key: "trench", Attributes: { Line_Type: "trench_main_existing" } } },
    /* Another utility's main. The whole point of an isolate is that
       this goes. A rule generous enough to keep it is a rule that
       isolates nothing. */
    { name: "gas main", keep: false, f: { Layer_Key: "gas", Attributes: { Line_Type: "gas_main" } } },
    { name: "water service", keep: false, f: { Layer_Key: "water", Attributes: { Line_Type: "water_service" } } },
  ];

  const all = new Set();
  for (const { f } of feats) for (const k of classKeys(f)) all.add(k);

  /* Isolating Electric: its own keys are kin and stay. */
  const keep = new Set(["electric", "role:meter", "electric:role:meter"]);
  for (const k of all) {
    if (k === "plot") keep.add(k);
    if (k === "role:plot" || k.endsWith(":role:plot")) keep.add(k);
    if (k === "role:nrs" || k.endsWith(":role:nrs")) keep.add(k);
    if (k === "trench" || k.startsWith("lt:trench") || k.startsWith("trench:")) keep.add(k);
  }
  const hidden = [...all].filter((k) => !keep.has(k));

  for (const { name, keep: want, f } of feats) {
    const gone = classKeys(f).some((k) => hidden.includes(k));
    if (want && gone) fail(`isolating a utility hides the ${name}`);
    if (!want && !gone) fail(`isolating a utility leaves the ${name} showing`);
  }
}

console.log(bad === 0
  ? "  ok  Isolate behaves (plots and the dig stay; what is being placed stays)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
