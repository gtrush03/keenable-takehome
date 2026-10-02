import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const path of ["/", "/client/lab/", "/client/fintech/", "/client/fireworks/", "/memo/"]) {
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = [];
  p.on("pageerror", e => errs.push("JS " + e.message)); p.on("console", m => m.type() === "error" && errs.push("console " + m.text().slice(0, 120)));
  p.on("response", r => { if (r.status() >= 400 && !r.url().includes("favicon")) errs.push(r.status() + " " + r.url().replace("http://127.0.0.1:7964", "")); });
  await p.goto("http://127.0.0.1:7964" + path, { waitUntil: "networkidle" });
  await p.evaluate(async () => { for (const s of document.querySelectorAll("main > .slide")) { s.scrollIntoView(); await new Promise(r => setTimeout(r, 60)); } });
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => document.querySelectorAll("main > .slide").length);
  console.log(path, "slides", n, "errors", errs.length, errs.slice(0, 6));
  await p.close();
}
await b.close();
