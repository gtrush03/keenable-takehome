// Builds the Cloudflare copy of the demo into sites/demo/cloud/public/ (the local :7952 demo is untouched).
//   bun sites/demo/cloud/build.ts [proposalUrl]
//   /        → own.html  ("Test your own event", live Keenable via the Worker)
//   /test/   → the frozen recorded 7-rival run (sites/demo/index.html, replay mode; live buttons point to "/")
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dir, DEMO = join(HERE, ".."), OUT = join(HERE, "public");
const PROPOSAL = process.argv[2] || "https://george-keenable-site.pages.dev/";

function must(s: string, a: string, b: string) { if (!s.includes(a)) throw new Error("build: marker missing: " + a.slice(0, 60)); return s.split(a).join(b); }

for (const d of [OUT, join(OUT, "test"), join(OUT, "fonts"), join(OUT, "test/fonts")]) mkdirSync(d, { recursive: true });
for (const dir of [OUT, join(OUT, "test")]) {
  for (const f of readdirSync(join(DEMO, "fonts"))) copyFileSync(join(DEMO, "fonts", f), join(dir, "fonts", f));
  for (const f of ["keenable-wordmark-ink.svg", "keenable-mark-ee.svg"]) copyFileSync(join(DEMO, f), join(dir, f));
}

// the 1:1 keenable.ai kit (sites/v2/kit) styles the "Test your own event" page
mkdirSync(join(OUT, "kit"), { recursive: true });
copyFileSync(join(DEMO, "../v2/kit/keenable.css"), join(OUT, "kit/keenable.css"));
writeFileSync(join(OUT, "index.html"), must(readFileSync(join(HERE, "own.html"), "utf8"), "__PROPOSAL__", PROPOSAL));

let t = readFileSync(join(DEMO, "index.html"), "utf8");
t = must(t, 'href="https://founding-gtm.trusynth.com/hub/"', `href="${PROPOSAL}"`);
t = must(t, '<nav class="steps" aria-label="Demo steps">', '<nav class="steps" aria-label="Demo steps">\n    <a href="../" style="color:var(--blue);font-weight:500">← Test your own event</a>');
t = must(t, '<div class="right">', '<div class="right">\n    <a class="btn blue" href="../" style="display:inline-flex;align-items:center;text-decoration:none">Test your own event live</a>');
t = must(t, "</style>", "#bLive,#bFull{display:none!important}\n</style>");
t = must(t, 'toast("Live runs need the demo server: bun sites/demo/server.ts")', 'location.href = "../"');
t = must(t, 'toast("The full live test needs the demo server: bun sites/demo/server.ts")', 'location.href = "../"');
t = must(t, '<a class="brand" href="#home" aria-label="Keenable — demo home">', `<a class="brand" href="${PROPOSAL}hub/" aria-label="Keenable: home of the take-home" title="Home: everything in one place">`);   // George: the logo goes to the hub, even on the demo
t = must(t, "<title>Time Machine Head-to-Head</title>", "<title>Our test · George’s Keenable take-home</title>");
t = must(t, "</main>", `</main>\n<p class="wrap" style="font-size:12.5px;color:var(--muted);padding-top:18px;padding-bottom:28px;border-top:1px solid var(--line);margin-top:24px">A take-home by George Trushevskiy for Keenable. Not an official Keenable site.</p>`);
writeFileSync(join(OUT, "test/index.html"), t);
console.log("built", OUT, "proposal →", PROPOSAL);
// final privacy lint, shared with the site build (cloud-site/lint_final.py): private names block the build here too
const lint = Bun.spawnSync(["python3", join(DEMO, "cloud-site/lint_final.py"), OUT, join(DEMO, "../bundle_v2.py"), "demo"], { stdout: "inherit", stderr: "inherit" });
if (lint.exitCode !== 0) throw new Error("build: final lint failed (see above)");
