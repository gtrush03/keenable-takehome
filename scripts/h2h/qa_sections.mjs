// Screenshots of the lower sections (today's questions, findings) at 1440x900. bun scripts/h2h/qa_sections.mjs
import { createRequire } from "node:module";
const require = createRequire("playwright-core");
const { chromium } = require("playwright-core");
const b = await chromium.launch({ headless: true, channel: "chrome" });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
await p.goto("http://127.0.0.1:7952/", { waitUntil: "networkidle" });
for (const id of ["today", "findings", "conclusion"]) { await p.locator("#" + id).scrollIntoViewIfNeeded(); await p.evaluate((i) => document.getElementById(i).scrollIntoView({ block: "start" }), id); await p.waitForTimeout(300); await p.screenshot({ path: `data/h2h/qa/sec_${id}.png` }); }
await b.close();
