/* Index: the whole submission as a subway map, drawn at runtime from the deck itself.
   ../index.html  → lines = runs of data-chapter in deck order (names from .c-path[data-chapters]); stations = slides (data-title)
   ../full.html   → the Extended version line, one station per chapter
   ../config.js   → DEMO_URL (live demo interchange) and MEDIA_BASE (film downloads fallback)
   ../dl/downloads.json → the Downloads panel (falls back to the files we know exist)
   ../brands/brands.json → real logos under the stations that name companies (rivals, targets)
   Interchange glyphs are drawn here (24×24, 1.5 stroke, same line style as ../nav/icons) — no emoji, no icon fonts.
   Stations are plain links (../?present=1#id, ../full.html#id), so browser Back works. Previews come from window.Peek
   (../nav/peek.js) when it is there; without it the map works the same. */
(() => {
  const ROOT = new URL("../", location.href);
  const at = (p) => new URL(p, ROOT).href;
  const NS = "http://www.w3.org/2000/svg";
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // kit blue/ink first, then quiet companions that stay readable on white
  const COLORS = ["#005CFF", "#2A2A2A", "#FF7E38", "#6FA4FF", "#0B2E6F", "#00A889", "#7C5CFF", "#9AA4B8", "#E8A33D", "#5E6B7D"];
  const EXT_COLOR = "#0091B3", DL_COLOR = "#2A2A2A";   // the Extended line gets a hue no section uses
  const FALLBACK_LABELS = { opening: "Intro", fun: "For fun", ask: "Close", appendix: "Appendix" };
  // interchange glyphs, 24×24 with a 1.5 stroke (drawn for the map, same family as nav/icons)
  const GLYPH = {
    film: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
    demo: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M3 8.5h18M9.5 16 14.5 11M10.5 11h4v4"/>',
    extended: '<circle cx="6.5" cy="5.5" r="2"/><circle cx="6.5" cy="18.5" r="2"/><circle cx="17.5" cy="7.5" r="2"/><path d="M6.5 7.5v9M17.5 9.5c0 4.5-11 3-11 7"/>',
    appendix: '<rect x="4.5" y="7" width="12" height="14" rx="1.5"/><path d="M8 3.5h10a1.5 1.5 0 0 1 1.5 1.5v12.5M8 11.5h5M8 15h5"/>',
    datasets: '<ellipse cx="12" cy="6" rx="7" ry="2.75"/><path d="M5 6v12c0 1.5 3.1 2.75 7 2.75s7-1.25 7-2.75V6M5 12c0 1.5 3.1 2.75 7 2.75s7-1.25 7-2.75"/>',
    download: '<path d="M12 4v10.5M7.5 10l4.5 4.5 4.5-4.5M4.5 15.5V18a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5"/>',
    out: '<path d="M7 17 17 7M9 7h8v8"/>',
    chev: '<path d="m9.5 6 6 6-6 6"/>',
  };
  const svgIcon = (g, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLYPH[g]}</svg>`;
  // the Keenable mark comes from the kit; every other company from brands/<slug>.svg
  const logoHref = (slug) => at(slug === "keenable" ? "kit/assets/keenable-wordmark-ink.svg" : `brands/${slug}.svg`);
  let BRANDS = [];
  const ASPECT = {};   // width/height of each logo, read from its viewBox, so every logo sits at the same height
  async function loadAspects(slugs) {
    await Promise.all([...new Set(slugs)].filter((s) => !(s in ASPECT)).map(async (s) => {
      try {
        const t = await (await fetch(logoHref(s))).text(), vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(t);
        const w = vb ? +vb[1] : +(/<svg[^>]*\swidth="([\d.]+)/.exec(t) || [])[1], h = vb ? +vb[2] : +(/<svg[^>]*\sheight="([\d.]+)/.exec(t) || [])[1];
        ASPECT[s] = w > 0 && h > 0 ? w / h : 3;
      } catch { ASPECT[s] = 3; }
    }));
  }
  function logoRows(slugs, maxW) {   // greedy rows of logos at one height; marks get a touch more height than wordmarks
    const items = slugs.map((s) => { const a = ASPECT[s] || 3, h = a < 1.6 ? 15 : 12; return { s, h, w: Math.min(66, Math.max(h, h * a)) }; });
    const rows = [[]]; let x = 0;
    for (const it of items) { if (x && x + 9 + it.w > maxW) { rows.push([]); x = 0; } rows[rows.length - 1].push(it); x += (x ? 9 : 0) + it.w; }
    return rows;
  }
  async function loadBrands() {
    try { const r = await fetch("../brands/brands.json", { cache: "no-cache" }); if (r.ok) BRANDS = (await r.json()).filter((b) => b.slug && b.name); } catch {}
  }
  function named(text) {   // brands named in a piece of text, in order of first mention
    const hits = [];
    for (const b of BRANDS) {
      const alts = [...new Set([b.name, b.name.replace(/\s+(AI|Labs|Inc\.?|Asset Management)$/, "")])];
      let at1 = -1;
      for (const a of alts) { const m = new RegExp("\\b" + a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").exec(text); if (m && (at1 < 0 || m.index < at1)) at1 = m.index; }
      if (at1 >= 0) hits.push([at1, b.slug]);
    }
    return hits.sort((a, b) => a[0] - b[0]).map((h) => h[1]);
  }

  // ---------- read a deck ----------
  async function readDeck(path) {
    const r = await fetch(at(path), { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    const labels = { ...FALLBACK_LABELS };
    (doc.querySelector(".c-path")?.dataset.chapters || "").split(",").forEach((p) => {
      const [k, ...v] = p.split(":"); if (k && v.length) labels[k.trim()] = v.join(":").trim();
    });
    let els = [...doc.querySelectorAll("main > .slide")];
    if (!els.length) els = [...doc.querySelectorAll("section.slide")];
    const slides = els.filter((s) => s.id).map((s) => ({
      id: s.id, ch: s.dataset.chapter || "",
      title: (s.dataset.title || s.querySelector("h1, h2, h3")?.textContent || s.id).replace(/\s+/g, " ").trim(),
      film: s.classList.contains("film"),
      imgs: [...new Set([...s.querySelectorAll('img[src*="brands/"]')].map((i) => (/brands\/([a-z0-9-]+)\.svg/.exec(i.getAttribute("src")) || [])[1]).filter(Boolean))],
      text: s.innerHTML.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " "),   // tags → spaces, so "<b>Hebbia</b><i>Charlie" stays two words
    }));
    return { slides, labels };
  }
  const runs = (slides) => slides.reduce((a, s) => { const l = a[a.length - 1]; if (l && l.ch === s.ch) l.slides.push(s); else a.push({ ch: s.ch, slides: [s] }); return a; }, []);
  const secName = (labels, ch) => (labels[ch] || (ch ? ch[0].toUpperCase() + ch.slice(1) : "Slides")).split(" · ")[0];

  // "Film 1 · Fintech: search, with a clock · 6:11" → "Film 1 · Fintech"
  function short(t, max) {
    const parts = String(t).split(" · ").map((s) => s.trim()).filter((s) => s && !/^\d+:\d{2}$/.test(s) && !/^\d{1,2}$/.test(s) && !/^[A-Z]{1,2}$/.test(s));   // drop run times, "01"-style numbers and one-letter codes
    let s = parts[0] || "";
    if (parts.length > 1 && (s.length < 9 || /^(film|option|part)\b/i.test(s))) s += " · " + parts[1].split(":")[0].replace(/^\d{1,2}\s+/, "");
    return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
  }
  function wrap2(s, n) {   // two centred lines under a station
    if (s.length <= n) return [s];
    const w = s.split(" "); let a = "";
    while (w.length && (a + " " + w[0]).trim().length <= n) a = (a + " " + w.shift()).trim();
    if (!a) a = w.shift();
    let b = w.join(" ");
    if (b.length > n) b = b.slice(0, n - 1).trimEnd() + "…";
    return b ? [a, b] : [a];
  }

  // logos under a station: the slide's own logos, else the companies a rivals/targets slide names; Keenable only when the title names it
  function logosFor(s) {
    const kOK = /keenable/i.test(s.title);
    let l = s.imgs.length ? s.imgs : /\b(rivals?|targets?|accounts?|competitors?)\b/i.test(s.title) ? named(s.text) : named(s.title);
    l = l.filter((x) => kOK || x !== "keenable");
    return l.slice(0, 8);
  }

  // ---------- model ----------
  async function model() {
    await loadBrands();
    const main = await readDeck("index.html");
    let full = null; try { full = await readDeck("full.html"); } catch {}
    const flow = main.slides.filter((s) => s.ch !== "appendix"), app = main.slides.filter((s) => s.ch === "appendix");
    const secs = runs(flow).map((r, i) => ({ key: r.ch, name: secName(main.labels, r.ch), color: COLORS[i % COLORS.length], slides: r.slides }));
    const nodes = [];
    secs.forEach((sec, si) => sec.slides.forEach((s, k) => nodes.push({
      id: s.id, title: s.title, label: s.film ? short(s.title, 24) : short(s.title, 30), x: s.film, glyph: s.film ? "film" : "", sec: si, first: k === 0,
      href: at(`?present=1#${encodeURIComponent(s.id)}`), deck: "main", logos: logosFor(s),
    })));
    if (app.length) {
      const si = secs.push({ key: "appendix", name: "Appendix", color: COLORS[secs.length % COLORS.length], slides: app }) - 1;
      nodes.push({ id: app[0].id, title: `Appendix · ${app.length} slides`, label: `Appendix · ${app.length}`, x: true, glyph: "appendix", sec: si, first: true, junction: true, href: at(`?present=1#${encodeURIComponent(app[0].id)}`), deck: "main" });
    }
    if (full && full.slides.length) {
      const si = secs.push({ key: "extended", name: "Extended version", color: EXT_COLOR, slides: full.slides }) - 1;
      runs(full.slides).forEach((r, k) => nodes.push({
        id: r.slides[0].id, title: `Extended version · ${secName(full.labels, r.ch)} · ${r.slides.length} slide${r.slides.length > 1 ? "s" : ""}`, label: secName(full.labels, r.ch),
        x: k === 0, glyph: k === 0 ? "extended" : "", branch: true, sec: si, first: k === 0, href: at(`full.html#${encodeURIComponent(r.slides[0].id)}`), deck: "full", chapter: r.ch,
      }));
    }
    const dsi = secs.push({ key: "downloads", name: "Keep a copy", color: DL_COLOR, slides: [] }) - 1;
    nodes.push({ id: "datasets", title: "Datasets: every number behind the deck", label: "Datasets", x: true, glyph: "datasets", sec: dsi, first: true, action: "dl", group: "datasets" });
    nodes.push({ id: "downloads", title: "Downloads: every format", label: "Downloads", x: true, glyph: "download", sec: dsi, first: false, action: "dl" });
    // live demo: a spur off the first fintech station that isn't the line's first (or the first film)
    let demo = null;
    if (window.DEMO_URL) {
      const fi = secs.findIndex((s) => /fintech/i.test(s.key));
      let a = nodes.findIndex((n) => n.sec === fi && !n.first);
      if (a < 0) a = nodes.findIndex((n) => n.x && !n.junction);
      if (a < 0) a = 0;
      demo = { anchor: a, title: "Live demo: test your own event", label: "Live demo", glyph: "demo", href: window.DEMO_URL, external: true };
    }
    await loadAspects(nodes.flatMap((n) => n.logos || []));
    return { secs, nodes, demo };
  }

  // ---------- svg helpers ----------
  const el = (name, attrs = {}, parent) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  function glyph(parent, name, cx, cy, size) {
    const g = el("g", { class: "gl", transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})`, fill: "none", stroke: "#2A2A2A", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, parent);
    g.innerHTML = GLYPH[name] || "";
    return g;
  }
  const ROW_H = 21;
  function logos(parent, slugs, x, top, W, maxW, centre) {   // real logos in rows at one height (centred under a station on desktop, left-aligned on the phone)
    if (!slugs || !slugs.length) return 0;
    const g = el("g", { class: "logos" }, parent), rows = logoRows(slugs, maxW);
    el("title", {}, g).textContent = slugs.map((s) => (BRANDS.find((b) => b.slug === s) || { name: s }).name).join(", ");
    rows.forEach((row, r) => {
      const rw = row.reduce((a, it, i) => a + it.w + (i ? 9 : 0), 0);
      let lx = centre ? Math.max(4, Math.min(W - 4 - rw, x - rw / 2)) : x;
      row.forEach((it) => { const light = /white logo/i.test((BRANDS.find((b) => b.slug === it.s) || {}).note || "");   // white-only marks (made for dark grounds) are drawn in ink here
        el("image", { href: logoHref(it.s), ...(light ? { filter: "url(#im-ink)" } : {}), x: lx, y: top + r * ROW_H + (15 - it.h) / 2, width: it.w, height: it.h, preserveAspectRatio: "xMidYMid meet" }, g); lx += it.w + 9; });
    });
    return rows.length * ROW_H - 6;
  }
  function inkFilter(svg) {   // recolours a mono logo to the kit ink, keeping its shape (alpha)
    const f = el("filter", { id: "im-ink", "color-interpolation-filters": "sRGB" }, el("defs", {}, svg));
    el("feColorMatrix", { type: "matrix", values: "0 0 0 0 0.165  0 0 0 0 0.165  0 0 0 0 0.165  0 0 0 1 0" }, f);
  }
  function outArrow(parent, t) { const g = glyph(parent, "out", 0, 0, 14); g.classList.add("out"); t.dataset.out = "1"; t._out = g; }
  function placeOut(root) {   // the external-link arrow sits right after its label, so measure the label once it is in the page
    root.querySelectorAll("text[data-out]").forEach((t) => { try { const b = t.getBBox(); t._out.setAttribute("transform", `translate(${b.x + b.width + 4} ${b.y + b.height / 2 - 7}) scale(${14 / 24})`); } catch {} });
  }
  function station(g, n, cx, cy, color, opts = {}) {
    const a = el("a", { class: "st" + (n.x ? " x" : ""), "data-id": n.id || "" }, g);
    if (n.action === "dl") { a.setAttribute("href", "#" + (n.group || "downloads")); a.setAttribute("role", "button"); a.addEventListener("click", (e) => { e.preventDefault(); openDl(n.group); }); }
    else { a.setAttribute("href", n.href); if (n.external) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); } }
    a.setAttribute("aria-label", n.title);
    if (n.deck) { a.dataset.deck = n.deck; a.dataset.title = n.title; a.dataset.href = n.href; if (n.chapter) a.dataset.chapter = n.chapter; }
    el("title", {}, a).textContent = n.title;
    if (opts.hit) el("rect", { class: "hit", ...opts.hit }, a);
    if (n.x) {
      const R = opts.R || 16;
      el("circle", { class: "ring dot", cx, cy, r: R, fill: "#fff", stroke: "#2A2A2A", "stroke-width": 3 }, a);
      if (GLYPH[n.glyph]) glyph(a, n.glyph, cx, cy, opts.G || 22); else el("circle", { cx, cy, r: 5, fill: color }, a);
    } else el("circle", { class: "dot", cx, cy, r: 6.5, fill: "#fff", stroke: color, "stroke-width": 3.5 }, a);
    return a;
  }

  // ---------- desktop: serpentine rows, 45° chamfered turns, labels under the stations ----------
  function drawH(M, W) {
    const S = 112, padL = 64, padR = 64, rowH = 156, top = 78, C = 22, L = 15;
    const cols = Math.max(4, Math.floor((W - padL - padR) / S) + 1);
    const x0 = (W - (cols - 1) * S) / 2, xL = x0 - 52, xR = x0 + (cols - 1) * S + 52;
    const P = M.nodes.map((n, i) => { const r = Math.floor(i / cols), k = i % cols, ltr = r % 2 === 0; return { x: ltr ? x0 + k * S : x0 + (cols - 1 - k) * S, y: top + r * rowH, r, ltr }; });
    const rows = P[P.length - 1].r + 1, H = top + (rows - 1) * rowH + 70;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Subway map: every slide of the submission in order" });
    inkFilter(svg);
    const gl = el("g", {}, svg), gs = el("g", {}, svg), gt = el("g", {}, svg);
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], color = M.secs[M.nodes[i].sec].color;
      let pts;
      if (a.r === b.r) pts = [[a.x, a.y], [b.x, b.y]];
      else { const xt = a.ltr ? xR : xL, d = a.ltr ? 1 : -1; pts = [[a.x, a.y], [xt - d * C, a.y], [xt, a.y + C], [xt, b.y - C], [xt - d * C, b.y], [b.x, b.y]]; }
      el("path", { class: "ln", d: path(pts), stroke: color, "stroke-width": 8 }, gl);
    }
    M.nodes.forEach((n, i) => {
      const p = P[i], sec = M.secs[n.sec], y1 = p.y + (n.x ? 35 : 28);
      const a = station(gs, n, p.x, p.y, sec.color, { R: 16, G: 22 });
      const lines = wrap2(n.label, L);
      lines.forEach((line, k) => { const t = el("text", { x: p.x, y: y1 + k * 16, "text-anchor": "middle" }, a); t.textContent = line; });
      const lh = logos(a, n.logos, p.x, y1 + (lines.length - 1) * 16 + 10, W, 2 * S - 20, true);
      el("rect", { class: "hit", x: p.x - S / 2 + 4, y: p.y - 18, width: S - 8, height: y1 - p.y + 18 + (lines.length - 1) * 16 + (lh ? lh + 12 : 6) }, a); a.insertBefore(a.lastChild, a.querySelector("circle"));
      if (n.first && sec.name) {
        const t = el("text", { class: "sec", x: p.ltr ? p.x - 7 : p.x + 7, y: p.y - 20, fill: sec.color, "text-anchor": p.ltr ? "start" : "end" }, gt);   // right-to-left rows read back into the line
        t.textContent = sec.name.length > 18 ? sec.name.slice(0, 17) + "…" : sec.name;
      }
    });
    if (M.demo) {
      const p = P[M.demo.anchor], y = p.y - 56, x = p.x;
      el("path", { class: "ln", d: path([[x, p.y], [x, y]]), stroke: "#2A2A2A", "stroke-width": 4, "stroke-dasharray": "0 8", "stroke-linecap": "round" }, gl);
      const a = station(gs, { ...M.demo, x: true, id: "demo" }, x, y, "#005CFF", { R: 16, G: 22, hit: { x: x - 18, y: y - 18, width: 130, height: 36 } });
      const t = el("text", { x: x + 24, y: y + 4.5 }, a); t.textContent = M.demo.label; outArrow(a, t);
    }
    return svg;
  }

  // ---------- phone: one spine top to bottom, labels to the right ----------
  function drawV(M, W) {
    const X = 20, step = 44, head = 34, top = 20, LX = 48;
    const max = Math.max(16, Math.floor((W - LX) / 7.6));
    const seq = [];
    M.nodes.forEach((n, i) => { seq.push(n); if (M.demo && M.demo.anchor === i) seq.push({ ...M.demo, x: true, id: "demo", sec: n.sec, demo: true }); });
    let y = top; const P = [];
    const lrows = (n) => (n.logos && n.logos.length ? logoRows(n.logos, W - LX - 8).length : 0);
    seq.forEach((n) => { if (n.first && M.secs[n.sec].name) y += head; P.push(y); y += step + lrows(n) * ROW_H; });
    const H = y;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Subway map: every slide of the submission in order" });
    inkFilter(svg);
    const gl = el("g", {}, svg), gs = el("g", {}, svg), gt = el("g", {}, svg);
    for (let i = 1; i < seq.length; i++) el("path", { class: "ln", d: path([[X, P[i - 1]], [X, P[i]]]), stroke: M.secs[seq[i].sec].color, "stroke-width": 7 }, gl);
    seq.forEach((n, i) => {
      const sec = M.secs[n.sec], color = n.demo ? "#005CFF" : sec.color;
      if (n.first && sec.name) { const t = el("text", { class: "sec", x: LX, y: P[i] - 26, fill: sec.color }, gt); t.textContent = sec.name; }
      const a = station(gs, n, X, P[i], color, { R: 15, G: 20, hit: { x: 0, y: P[i] - step / 2, width: W, height: step + lrows(n) * ROW_H } });
      const lab = n.deck === "main" && !n.junction && !n.branch ? short(n.title, max) : n.label;   // extended chapters, appendix, datasets, downloads, demo: their own short names
      const t = el("text", { x: LX, y: P[i] + 5 }, a); t.textContent = lab;
      if (n.demo) outArrow(a, t);
      logos(a, n.logos, LX, P[i] + 16, W, W - LX - 8, false);
    });
    return svg;
  }

  // ---------- legend ----------
  function legend(M) {
    const lines = M.secs.filter((s) => s.name && s.key !== "downloads").map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");
    document.getElementById("legend").innerHTML = lines + `<span><b></b>Interchange</span><span><em></em>Slide</span>`;
  }

  // ---------- previews (Peek, optional) ----------
  function attachPeek() {
    if (!window.Peek || typeof Peek.attach !== "function") return;
    document.querySelectorAll("#map a.st[data-deck]").forEach((a) => {
      if (a.dataset.peek) return; a.dataset.peek = "1";
      const o = { deck: a.dataset.deck, title: a.dataset.title, go: () => { location.href = a.dataset.href; } };   // SVG links have no .click()
      if (a.dataset.chapter) o.chapter = a.dataset.chapter; else o.ids = [a.dataset.id];
      try { Peek.attach(a, o); } catch {}
    });
  }
  function loadPeek() {
    if (window.Peek) return attachPeek();
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = at("nav/peek.css"); document.head.appendChild(css);
    const s = document.createElement("script"); s.src = at("nav/peek.js"); s.async = true;
    s.onload = attachPeek; s.onerror = () => s.remove();
    document.head.appendChild(s);
  }

  // ---------- downloads ----------
  const dlg = document.getElementById("dl");
  const human = (b) => !b ? "" : b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
  let dlP = null;
  const ICONS = {};   // nav/icons/*.svg inlined so they take currentColor (hover turns them blue)
  async function loadIcons(base, names) {
    await Promise.all([...new Set(names)].filter((n) => n && !(n in ICONS)).map(async (n) => {
      try {
        const r = await fetch(at(base + n + ".svg")); const t = r.ok ? await r.text() : "";
        ICONS[n] = !/^<svg[\s>]/.test(t.trim()) ? "" : t.trim().replace(/<title>[\s\S]*?<\/title>/, "")
          .replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(color|role|aria-label|width|height)="[^"]*"/g, "").replace(/^<svg/, '<svg class="ic" width="24" height="24" aria-hidden="true" focusable="false"'));   // root tag only: the shapes keep their own width/height
      } catch { ICONS[n] = ""; }
    }));
  }
  // the cloud build sets MEDIA_BASE in config.js; locally the deck is served from 127.0.0.1 / localhost
  const CLOUD = !!window.MEDIA_BASE || !/^(127\.|localhost$|\[::1\]$)/.test(location.hostname);
  function row(d, iconBase) {
    const pick = (k) => (CLOUD ? d[k + "_cloud"] ?? d[k] ?? d[k + "_local"] : d[k + "_local"] ?? d[k]);   // href_local/href_cloud, bytes/bytes_cloud, …
    const bytes = pick("bytes"), detail = pick("detail") || [d.pages && `${d.pages} page${d.pages > 1 ? "s" : ""}`, d.length, d.rows && `${d.rows} rows`, d.files && `${d.files} files`, d.label_kind].filter(Boolean).join(" · ");
    const name = d.repo && window.REPO_PUBLIC && d.icon_public ? d.icon_public : d.icon;
    const icon = !name ? "" : ICONS[name] || `<img class="ic" src="${esc(at(iconBase + name + ".svg"))}" alt="" width="24" height="24">`;
    const body = `${icon}<span class="t">${esc(d.label)}${d.what || detail ? `<small>${esc([d.what, detail].filter(Boolean).join(" · "))}</small>` : ""}</span><span class="f">${esc(d.format || "")}</span><span class="s">${esc(human(bytes) || "")}</span>`;
    if (d.repo) {
      const url = window.REPO_PUBLIC && window.REPO_URL;
      return url ? `<li><a href="${esc(url)}" target="_blank" rel="noopener">${body.replace(/<span class="s">.*<\/span>$/, `<span class="s">${svgIcon("out", 16)}</span>`)}</a></li>` : `<li><div class="im-dl__plain">${icon}<span class="t">${esc(d.repo.private_text || "Code · private")}</span></div></li>`;
    }
    const href = pick("href"); if (!href) return "";
    return `<li><a href="${esc(at(href))}" download="${esc(pick("filename") || "")}">${body}</a></li>`;
  }
  const loadDl = () => dlP || (dlP = loadDlOnce());
  async function loadDlOnce() {
    const list = document.getElementById("dlList"), note = document.getElementById("dlNote");
    let html = "";
    try {
      const r = await fetch(at("dl/downloads.json"), { cache: "no-cache" }); if (!r.ok) throw 0;
      const j = await r.json(), iconBase = j.icon_base || "nav/icons/";
      await loadIcons(iconBase, (j.groups || []).flatMap((g) => (g.items || []).flatMap((d) => [d.icon, d.icon_public])));
      for (const g of j.groups || []) {
        const items = g.items || [], head = `<li class="im-dl__group" id="dl-g-${esc(g.id)}">${esc(g.label)}</li>`;
        if (items.length > 6) {   // long groups (the data files): the zip first, the rest folded
          const [lead, rest] = [items.filter((d) => /zip/i.test(d.format || "")), items.filter((d) => !/zip/i.test(d.format || ""))];
          html += head + lead.map((d) => row(d, iconBase)).join("") +
            `<li><details class="im-dl__more"><summary>${svgIcon("chev", 16)}${rest.length} separate files</summary><ul class="im-dl__list">${rest.map((d) => row(d, iconBase)).join("")}</ul></details></li>`;
        } else html += head + items.map((d) => row(d, iconBase)).join("");
      }
    } catch {
      const MB = window.MEDIA_BASE ? at(window.MEDIA_BASE) : at("media/");
      html = [["The deck", "v2.pdf", "PDF"], ["Fintech film", new URL("fintech.mp4", MB).href, "MP4"], ["Galactica film", new URL("galactica.mp4", MB).href, "MP4"], ["The ad", new URL("ad.mp4", MB).href, "MP4"]]
        .map(([l, h, f]) => `<li><a href="${esc(at(h))}" download>${svgIcon(f === "PDF" ? "appendix" : "film", 24).replace("<svg", '<svg class="ic"')}<span class="t">${esc(l)}</span><span class="f">${f}</span><span class="s">${svgIcon("download", 16)}</span></a></li>`).join("");
      note.textContent = "The full download list is on its way; these are ready now.";
    }
    list.innerHTML = html || `<li class="k-small">Nothing to download yet.</li>`;
  }
  async function openDl(group) {
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
    await loadDl();
    const g = group && document.getElementById("dl-g-" + group);
    if (g) g.scrollIntoView({ block: "start" }); else dlg.scrollTop = 0;
  }
  document.getElementById("dlOpen").addEventListener("click", () => openDl());
  document.querySelectorAll("[data-dl-open]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openDl(a.dataset.dlOpen || ""); }));
  document.getElementById("dlClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  if (location.hash === "#downloads" || location.hash === "#datasets") openDl(location.hash.slice(1) === "datasets" ? "datasets" : "");

  // ---------- render ----------
  const box = document.getElementById("map");
  let M = null, lastKey = "";
  function render() {
    if (!M) return;
    const W = Math.round(box.clientWidth), vertical = W < 760, key = vertical ? "v" + W : "h" + W;
    if (key === lastKey) return; lastKey = key;
    box.replaceChildren(vertical ? drawV(M, W) : drawH(M, W));
    placeOut(box); attachPeek();
  }
  model().then((m) => { M = m; legend(M); render(); loadPeek(); document.fonts?.ready.then(() => placeOut(box)); })
    .catch(() => { box.innerHTML = `<p class="k-body im-loading">The map couldn’t read the deck just now. Open <a href="../">the deck</a> or <a href="../full.html">the extended version</a>.</p>`; });
  let t = 0; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(render, 120); });
})();
