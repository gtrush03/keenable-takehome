// Headless QA for the demo: screenshots at 1440x900 and 390x844, console errors, optional live click.
//   node-free: bun scripts/h2h/qa_demo.mjs [--live]
import { createRequire } from "node:module";
const require = createRequire("playwright-core");
const { webkit, chromium } = require("playwright-core");
const URL = process.env.DEMO_URL || "http://127.0.0.1:7952/";
const out = "data/h2h/qa";
const engine = process.argv.includes("--chromium") ? chromium : webkit;
const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: "chrome" } : {}) });
const errors = [];
for (const [w, h, name] of [[1440, 900, "desk"], [390, 844, "phone"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${name}: pageerror ${e.message}`));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png` });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(name, "scrollWidth", sw, "viewport", w);
  if (name === "desk") {
    await page.click("#sAll"); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/desk_all.png` });
    await page.click("#sEv"); await page.click("tr.row[data-id=keenable]"); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/desk_open.png`, fullPage: false });
    await page.screenshot({ path: `${out}/desk_full.png`, fullPage: true });
    if (process.argv.includes("--live")) {
      await page.click("tr.row[data-id=keenable]");
      await page.click("#bLive");
      await page.waitForFunction(() => !document.querySelector("#bLive").disabled, null, { timeout: 60000 });
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `${out}/desk_live.png` });
      const rows = await page.$$eval("tr.row[data-id]", (trs) => trs.map((t) => t.dataset.id + ":" + t.querySelector(".verdict")?.textContent + ":" + (t.innerText.includes("live") ? "live" : "rec")));
      console.log("live rows", rows.join(" | "));
    }
  }
  await ctx.close();
}
if (process.argv.includes("--full")) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`full: pageerror ${e.message}`));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.click("#bFull");
  await page.waitForTimeout(4000); await page.screenshot({ path: `${out}/desk_full_running.png` });
  await page.waitForFunction(() => !document.querySelector("#bFull").disabled, null, { timeout: 300000 });
  await page.waitForTimeout(45000);
  await page.screenshot({ path: `${out}/desk_full_done.png` });
  console.log("full:", await page.textContent("#ptext"));
  await ctx.close();
}
if (process.argv.includes("--file")) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`file: pageerror ${e.message}`));
  await page.goto("file://" + process.cwd() + "/sites/demo/index.html");
  await page.waitForTimeout(800);
  await page.click("#bReplay"); await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/file_replay.png` });
  console.log("file mode rows:", (await page.$$("tr.row[data-id]")).length, "pill:", await page.textContent("#mode"));
  await ctx.close();
}
await browser.close();
console.log("console errors:", errors.length ? errors : "none");
