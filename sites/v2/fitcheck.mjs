// Fit check for v2 pages. For each slide: does it fit its 16:9 print page, does it fit 1600×1000 and 390×844 on screen
// (present mode), and what is the smallest rendered text (HTML and SVG)? Exit 1 on any failure.
// Usage: PW=... node sites/v2/fitcheck.mjs http://127.0.0.1:7950/v2/
// Ruling #15: a fourth pass in real WebKit as an iPhone 15 Pro (393×852, touch) when the WebKit build is on this machine; WEBKIT=0 skips it.
import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "/opt/homebrew/lib/node_modules/playwright/node_modules/playwright-core");
const url = process.argv[2] || "http://127.0.0.1:7950/v2/";
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const HOME = process.env.HOME, fs = require("node:fs");
const WK_PW = process.env.WK_PW || HOME + "/.npm/_npx/dd6c45a6a1785775/node_modules/playwright-core", WK_EXE = process.env.WK_EXE || HOME + "/Library/Caches/ms-playwright/webkit-2284/pw_run.sh";
let wk = null, wkDevice = null;
if (process.env.WEBKIT !== "0" && fs.existsSync(WK_EXE) && fs.existsSync(WK_PW)) {
  try { const W = require(WK_PW); wk = await W.webkit.launch({ executablePath: WK_EXE }); wkDevice = W.devices["iPhone 15 Pro"]; } catch (e) { console.log("WebKit pass skipped: " + e.message.split("\n")[0]); }
}

const measure = () => [...document.querySelectorAll("main > .slide")].map(s => {
  let min = 99, where = "";
  const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length; };
  s.querySelectorAll("*").forEach(el => {
    if (!visible(el)) return;
    if (el.closest(".kp, .kp-hero")) return;  // KPlayer chrome (the film player), not slide copy
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) return;
    let px = parseFloat(getComputedStyle(el).fontSize);
    if (el instanceof SVGElement && el.ownerSVGElement) { const m = el.ownerSVGElement.getScreenCTM(); if (m) px *= m.a; }
    if (px < min) { min = px; where = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) + " '" + el.textContent.trim().slice(0, 24) + "'"; }
  });
  return { id: s.id, over: Math.max(0, s.scrollHeight - s.clientHeight, s.scrollWidth - s.clientWidth), min: Math.round(min * 10) / 10, where };
});

const runs = [
  ["print 1280×720", { width: 1280, height: 720 }, true, 15],
  ["present 1600×1000", { width: 1600, height: 1000 }, false, 18],
  ["present 390×844", { width: 390, height: 844 }, false, 14],
];
if (wk) runs.push([`present WebKit iPhone 15 Pro ${wkDevice.viewport.width}×${wkDevice.viewport.height}`, null, false, 14]);
let bad = 0;
for (const [name, vp, print, floor] of runs) {
  const p = vp ? await b.newPage({ viewport: vp }) : await (await wk.newContext({ ...wkDevice })).newPage();
  await p.goto(url + (print ? "" : "?present=1"), { waitUntil: vp ? "networkidle" : "load" });
  await p.evaluate(() => document.querySelectorAll("main > .slide").forEach(s => { s.classList.add("in"); s.dispatchEvent(new CustomEvent("slide:in", { bubbles: true })); }));
  await p.waitForTimeout(1200);
  if (print) await p.emulateMedia({ media: "print" });
  const rows = print ? await p.evaluate(measure) : [];
  if (!print) { // present mode shows one slide at a time: measure each as current
    const n = await p.evaluate(() => document.querySelectorAll("main > .slide").length);
    for (let i = 0; i < n; i++) { await p.evaluate(i => Deck.show(i), i); await p.waitForTimeout(80); rows.push((await p.evaluate(measure))[i]); }
  }
  console.log(`\n${name} (floor ${floor}px)`);
  for (const r of rows) {
    const fail = r.over > 1 || r.min < floor; if (fail) bad++;
    console.log(`${fail ? "FAIL" : " ok "}  ${r.id.padEnd(14)} overflow ${String(r.over).padStart(4)}px   min text ${r.min}px  ${r.min < floor ? r.where : ""}`);
  }
  await p.close();
}
await b.close(); if (wk) await wk.close();
console.log(bad ? `\n${bad} failures` : "\nall slides fit"); process.exit(bad ? 1 : 0);
