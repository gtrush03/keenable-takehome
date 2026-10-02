// Export a site to PDF: one slide per 16:9 page.  Usage: PW=... node sites/pdf.mjs <url> <out.pdf>
import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "/opt/homebrew/lib/node_modules/playwright/node_modules/playwright-core");
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(url, { waitUntil: "networkidle" });
// visit every slide so lazy charts/data render, then mark all revealed
await p.evaluate(async () => {
  const s = [...document.querySelectorAll("main > .slide")];
  for (const el of s) { el.classList.add("in"); el.dispatchEvent(new CustomEvent("slide:in", { bubbles: true })); }
  document.querySelectorAll("[data-count]").forEach(el => { el.dataset.dur = 1; });
  if (window.DeckPrint) window.DeckPrint();
  await new Promise(r => setTimeout(r, 1500));
});
await p.emulateMedia({ media: "print" });
await p.pdf({ path: out, width: "13.333in", height: "7.5in", printBackground: true, preferCSSPageSize: true });
console.log("wrote", out); await b.close();
