// Pre-rendered slide thumbnails for Peek (ruling #10). Run headless after each build:
//   bun sites/v2/nav/thumbs.mjs [http://127.0.0.1:7950/v2/]      (node works too; PW=<playwright-core path> to override)
// Writes nav/thumbs/main/<id>.webp (index.html), nav/thumbs/full/<id>.webp (full.html), 400×250 q70, and nav/thumbs/thumbs.json.
// Film slides use their poster. WebP is encoded by Chrome's canvas, so no image tools are needed.
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright-core");
const BASE = (process.argv[2] || "http://127.0.0.1:7950/v2/").replace(/\/?$/, "/");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "thumbs");
const W = 400, H = 250, Q = +(process.env.Q || 0.7), VW = 1600, VH = 1000;
const DECKS = [["main", "index.html"], ["full", "full.html"]];

const b = await chromium.launch({ headless: true, executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const enc = await b.newPage();   // encoder: draws a PNG (or a poster URL) into a 400×250 canvas, cover-fit, returns WebP base64
await enc.goto(BASE + "index.html");
const toWebp = (src) => enc.evaluate(async ({ src, W, H, Q }) => {
  const img = new Image(); img.crossOrigin = "anonymous"; img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.imageSmoothingQuality = "high"; const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s; x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return c.toDataURL("image/webp", Q).split(",")[1];
}, { src, W, H, Q });

const manifest = { generated: new Date().toISOString(), w: W, h: H, base: BASE, decks: {} };
let bytes = 0;
for (const [deck, file] of DECKS) {
  const dir = path.join(OUT, deck); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".webp")) fs.unlinkSync(path.join(dir, f));   // stale thumbs of removed slides
  const p = await b.newPage({ viewport: { width: VW, height: VH } });
  await p.emulateMedia({ reducedMotion: "reduce" });
  const res = await p.goto(BASE + file + "?present=1", { waitUntil: "networkidle" }).catch(() => null);
  if (!res || !res.ok()) { console.warn(`skip ${deck}: ${file} not reachable`); await p.close(); continue; }
  await p.addStyleTag({ content: `.topbar, .sc, .toc-layer, .toc-ov, .nav-back, .peek, .menu-ov, .ov, .film-fs, .film-go, .kp-controls { display: none !important; }
    *, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }` });
  await p.evaluate(() => { if (!document.body.classList.contains("present")) Deck.present(true); });
  const meta = await p.evaluate(() => {
    const L = Object.assign({ fun: "For fun" }, Object.fromEntries((document.querySelector(".c-path")?.dataset.chapters || "").split(",").filter(Boolean).map(x => x.split(":").map(t => t.trim()))));
    return { labels: L, slides: Deck.slides.map(s => ({ id: s.id, t: s.dataset.title || "", ch: s.dataset.chapter || "", poster: s.classList.contains("film") ? (s.querySelector(".print-only img, .film-frame img")?.src || s.querySelector("video")?.poster || "") : "" })) };
  });
  const slides = {}, order = [], chapters = [];
  for (let i = 0; i < meta.slides.length; i++) {
    const s = meta.slides[i]; if (!s.id) continue;
    let b64;
    if (s.poster) b64 = await toWebp(s.poster).catch(() => null);
    if (!b64) {
      await p.evaluate(i => { Deck.show(i); const s = Deck.slides[i]; s.classList.add("in"); s.querySelectorAll("[data-count]").forEach(el => el.dispatchEvent(new Event("x"))); }, i);
      await p.waitForTimeout(260);
      const png = await p.screenshot({ type: "png" });
      b64 = await toWebp("data:image/png;base64," + png.toString("base64"));
    }
    const buf = Buffer.from(b64, "base64"); fs.writeFileSync(path.join(dir, s.id + ".webp"), buf); bytes += buf.length;
    slides[s.id] = { t: s.t, ch: s.ch, n: i + 1 }; order.push(s.id);
    const last = chapters[chapters.length - 1]; if (!last || last.ch !== s.ch) chapters.push({ ch: s.ch, label: meta.labels[s.ch] || s.ch, ids: [] });
    chapters[chapters.length - 1].ids.push(s.id);
  }
  manifest.decks[deck] = { page: file, slides, order, chapters };
  console.log(`${deck}: ${order.length} thumbs`);
  await p.close();
}
manifest.bytes = bytes;
fs.writeFileSync(path.join(OUT, "thumbs.json"), JSON.stringify(manifest));
console.log(`total ${(bytes / 1048576).toFixed(2)} MB${bytes > 4 * 1048576 ? "  ⚠ over the 4 MB budget: rerun with Q=0.6" : ""}`);
await b.close();
