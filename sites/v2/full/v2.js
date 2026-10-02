/* v2 chrome: the chapter path bar and the c-ix enter pulse. Load after shared/deck.js.
   Slides join a chapter with data-chapter. The bar's order and labels come from data-chapters on .c-path
   ("id:Label,id:Label"), or the main-site list below, so empty chapters still show (dimmed). */
(() => {
  const DEFAULT = "opening:Opening,proof:PROOF,fintech:Fintech,galactica:Galactica,client:Client meeting,people:People,gtm:Founding GTM,appendix:Appendix,ask:The ask";
  const slides = [...document.querySelectorAll("main > .slide")];
  const host = document.querySelector(".c-path");
  const CHAPTERS = ((host && host.dataset.chapters) || DEFAULT).split(",").map(x => x.split(":").map(t => t.trim()));
  if (!slides.length || !host || !window.Deck) return;

  const first = {}, count = {}, hasIx = {};
  slides.forEach((s, i) => {
    const c = s.dataset.chapter; if (!c) return;
    if (first[c] === undefined) first[c] = i;
    count[c] = (count[c] || 0) + 1;
    if (s.querySelector(".c-ix")) hasIx[c] = true;
  });

  host.innerHTML = `<button class="path-cur" type="button" aria-haspopup="true" aria-expanded="false"></button><ol></ol><div class="path-ticks"><b></b></div>`;
  const ol = host.querySelector("ol"), curBtn = host.querySelector(".path-cur"), tick = host.querySelector(".path-ticks b");
  CHAPTERS.forEach(([id, label]) => {
    const li = document.createElement("li"); li.dataset.ch = id;
    if (first[id] === undefined) li.classList.add("empty");
    li.innerHTML = `<button type="button">${label}${hasIx[id] ? '<i class="ixdot" title="has an interactive"></i>' : ""}</button>`;
    li.querySelector("button").addEventListener("click", () => {
      host.classList.remove("open"); curBtn.setAttribute("aria-expanded", "false");
      const i = first[id]; if (i === undefined) return;
      if (document.body.classList.contains("present")) Deck.show(i);
      else slides[i].scrollIntoView({ behavior: "smooth", block: "start" });
    });
    ol.append(li);
  });
  curBtn.addEventListener("click", () => { const o = host.classList.toggle("open"); curBtn.setAttribute("aria-expanded", o); });

  // Menu: a full-screen list of chapters, each one jump (George 22:57Z: pages, not scrolling)
  const menuBtn = document.querySelector("[data-menu]");
  if (menuBtn) {
    const ov = document.createElement("div"); ov.className = "menu-ov"; ov.hidden = true; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Menu");
    ov.innerHTML = `<div class="menu-in"><p class="menu-k">Menu</p><ol class="menu-big"><li><button type="button" data-go-case><i>1</i><b>The case</b><span>The deck from the start, about 25 minutes.</span></button></li><li><a href="films/"><i>2</i><b>The films</b><span>Fintech, Galactica and the ad, full screen.</span></a></li><li><a href="#" data-demo-link target="_blank" rel="noopener"><i>3</i><b>Try the demo <em>↗</em></b><span>Pick a day. See what search knew before it happened.</span></a></li></ol><div class="menu-low"><p class="menu-lab">Chapters</p><ol class="menu-ch"></ol><p class="menu-lab">More</p><p class="menu-more"><a href="#" data-toc>Contents</a><a href="map/">Requirements</a><a href="memo/">Memo</a><a href="v2.pdf" download>PDF</a><a href="hub/">Home</a></p></div><button class="menu-x" type="button" aria-label="Close menu">Close ✕</button></div>`;
    document.body.append(ov);
    const mol = ov.querySelector(".menu-ch");
    const close = () => { ov.hidden = true; document.body.classList.remove("menu-open"); };
    const open = () => { ov.hidden = false; document.body.classList.add("menu-open"); const b = ov.querySelector("[data-go-case]"); if (b) b.focus(); };
    CHAPTERS.forEach(([id, label], k) => {
      if (first[id] === undefined) return;
      const li = document.createElement("li");
      li.innerHTML = `<button type="button">${label}</button>`;
      li.querySelector("button").addEventListener("click", () => { close(); if (!document.body.classList.contains("present")) Deck.present(true); Deck.show(first[id]); });
      mol.append(li);
    });
    if (window.DEMO_URL) ov.querySelector("[data-demo-link]").href = window.DEMO_URL;
    ov.querySelector("[data-go-case]").addEventListener("click", () => { close(); if (!document.body.classList.contains("present")) Deck.present(true); Deck.show(0); });
    menuBtn.addEventListener("click", () => ov.hidden ? open() : close());
    ov.querySelector(".menu-x").addEventListener("click", close);
    ov.querySelector("[data-toc]").addEventListener("click", e => { e.preventDefault(); close(); window.DeckTocOpen && DeckTocOpen(); });
    addEventListener("keydown", e => {
      if (ov.hidden) return;
      if (e.key === "Escape") { close(); e.preventDefault(); e.stopImmediatePropagation(); }
      else if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "p", "P"].includes(e.key)) e.stopImmediatePropagation();
    }, true);
  }

  let last = -1;
  const update = () => {
    const i = Deck.cur; if (i === last) return; last = i;
    const ch = slides[i].dataset.chapter, order = CHAPTERS.findIndex(c => c[0] === ch);
    [...ol.children].forEach((li, k) => {
      li.classList.toggle("cur", k === order); li.classList.toggle("past", k < order);
      if (k === order) { li.setAttribute("aria-current", "step"); li.scrollIntoView({ block: "nearest", inline: "nearest" }); } else li.removeAttribute("aria-current");
    });
    const n = slides.slice(0, i + 1).filter(s => s.dataset.chapter === ch).length;
    curBtn.innerHTML = `${(CHAPTERS[order] || ["", ""])[1]} <small>${n}/${count[ch] || 1}</small>`;
    tick.style.transform = `scaleX(${slides.length > 1 ? i / (slides.length - 1) : 1})`;
  };
  let raf = 0; const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setTimeout(update, 60)); };
  ["scroll", "keydown", "hashchange", "resize"].forEach(t => addEventListener(t, soon, { passive: true }));
  document.addEventListener("slide:in", soon);
  update();

  // c-ix: one 1.5 s pulse when its slide enters; "touched" after the first input
  document.addEventListener("slide:in", e => e.target.querySelectorAll(".c-ix:not(.touched)").forEach(ix => {
    ix.classList.remove("pulse"); void ix.offsetWidth; ix.classList.add("pulse");
    setTimeout(() => ix.classList.remove("pulse"), 1600);
  }));
  document.querySelectorAll(".c-ix").forEach(ix => {
    ix.setAttribute("data-noswipe", "");
    const mark = () => { if (ix.classList.contains("touched")) return; ix.classList.add("touched"); const b = ix.querySelector(".ix-badge span"); if (b) b.textContent = "You moved it"; };
    ix.addEventListener("input", mark); ix.addEventListener("click", e => { if (e.target.closest("button, input")) mark(); });
  });
})();

// Demo link: one URL in <meta name="demo-url">, applied to every [data-demo-link].
(() => {
  const url = window.DEMO_URL; if (!url) return;
  document.querySelectorAll("[data-demo-link]").forEach(a => { a.href = url; a.target = "_blank"; a.rel = "noopener"; });
})();

// One slide per screen by default, from every link. ?scroll=1 opts out; print and automated QA keep the long page.
(() => {
  if (!window.Deck) return;
  const q = new URLSearchParams(location.search);
  if (q.has("scroll") || navigator.webdriver || (window.matchMedia && matchMedia("print").matches)) return;
  if (!document.body.classList.contains("present")) Deck.present(true);
})();

// Present mode never scrolls the window (a deep link could leave it 31px down under the top bar).
(() => {
  const fix = () => { if (document.body.classList.contains("present") && window.scrollY) window.scrollTo(0, 0); };
  document.addEventListener("slide:in", () => requestAnimationFrame(fix));
  addEventListener("hashchange", () => requestAnimationFrame(fix));
  addEventListener("scroll", fix, { passive: true });
  addEventListener("load", () => { fix(); setTimeout(fix, 300); setTimeout(fix, 1200); });
  fix();
})();

// Slide controls (George 23:55Z): ‹ › arrows + counter, trackpad and touch swipe,
// pinch-in / O / Esc = overview of every slide, pinch-out / ctrl± = zoom the current slide. Present mode only.
(() => {
  if (!window.Deck) return;
  const body = document.body, slides = Deck.slides, N = slides.length;
  const isP = () => body.classList.contains("present");
  const hit = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ‹ › and "12 / 102", bottom right; fade in on mouse move or touch
  const chev = d => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ctl = document.createElement("div"); ctl.className = "sc screen-only";
  ctl.innerHTML = `<button type="button" class="sc-n" data-toc title="Contents"></button><button type="button" class="sc-b" data-sc="-1" aria-label="Previous slide" title="Previous (←)">${chev("M11 4 6 9l5 5")}</button><button type="button" class="sc-b" data-sc="1" aria-label="Next slide" title="Next (→)">${chev("M7 4l5 5-5 5")}</button>`;
  body.append(ctl);
  const num = ctl.querySelector(".sc-n"), [bPrev, bNext] = ctl.querySelectorAll(".sc-b");
  const upd = () => { num.textContent = `${Deck.cur + 1} / ${N}`; bPrev.disabled = Deck.cur === 0; bNext.disabled = Deck.cur === N - 1; };
  document.addEventListener("slide:in", upd); upd();
  ctl.addEventListener("click", e => { const b = e.target.closest("[data-sc]"); if (b) Deck.go(+b.dataset.sc); });
  // Contents: film-fintech's TOC takes "toc:open" (preventDefault = handled); otherwise the overview grid
  window.DeckTocOpen = () => { const ev = new CustomEvent("toc:open", { cancelable: true }); if (document.dispatchEvent(ev)) openOv(); };
  num.addEventListener("click", () => DeckTocOpen());
  let hideT, mx = innerWidth / 2, my = innerHeight / 2;
  const poke = () => { body.classList.add("sc-on"); clearTimeout(hideT); hideT = setTimeout(() => body.classList.remove("sc-on"), 2200); };
  addEventListener("mousemove", e => { mx = e.clientX; my = e.clientY; if (isP()) poke(); }, { passive: true });
  addEventListener("touchstart", () => { if (isP()) poke(); }, { passive: true });

  // zoom: CSS transform on the current slide, origin at the cursor, drag to pan
  let z = 1, tx = 0, ty = 0, zs = null;
  const apply = () => { zs.style.transition = "none"; zs.style.transformOrigin = "0 0"; zs.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`; };
  const clamp = () => { const W = innerWidth, H = innerHeight; tx = Math.min(0, Math.max(W - W * z, tx)); ty = Math.min(0, Math.max(H - H * z, ty)); };
  const resetZoom = () => { if (zs) { zs.style.transform = ""; zs.style.transformOrigin = ""; zs.style.transition = ""; } z = 1; tx = ty = 0; zs = null; body.classList.remove("zoomed"); };
  const zoomTo = (z2, px = mx, py = my) => {
    z2 = Math.min(5, Math.max(1, z2));
    if (z2 <= 1.02) { resetZoom(); return; }
    if (!zs) zs = slides[Deck.cur];
    tx = px - (px - tx) * (z2 / z); ty = py - (py - ty) * (z2 / z); z = z2; clamp(); apply(); body.classList.add("zoomed");
  };
  document.addEventListener("slide:in", e => { if (zs && e.target !== zs) resetZoom(); });   // the zoomed slide itself re-fires slide:in as its box changes
  let drag = null, dragged = false;
  addEventListener("pointerdown", e => { if (z <= 1 || e.button !== 0 || e.target.closest(".sc, .topbar, .menu-ov, .ov")) return; drag = { x: e.clientX, y: e.clientY, tx, ty }; dragged = false; });
  addEventListener("pointermove", e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true; tx = drag.tx + dx; ty = drag.ty + dy; clamp(); apply(); });
  addEventListener("pointerup", () => { drag = null; });
  addEventListener("click", e => { if (dragged) { dragged = false; e.preventDefault(); e.stopPropagation(); } }, true);

  // overview: every slide as a live thumbnail, grouped by chapter
  const LABELS = Object.assign({ fun: "For fun" }, Object.fromEntries((document.querySelector(".c-path")?.dataset.chapters || "").split(",").map(p => p.split(":"))));
  const fmt = (v, d) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  let ov = null, tiles = [];
  const ovOpen = () => !!ov && !ov.hidden;
  const build = () => {
    ov = document.createElement("div"); ov.className = "ov"; ov.hidden = true; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "All slides");
    ov.innerHTML = `<div class="ov-in"><p class="ov-k"><b>All slides</b><span>Click one to jump · Esc to close</span></p></div>`;
    const inn = ov.firstChild; let grp = null, last = null;
    slides.forEach((s, i) => {
      const ch = s.dataset.chapter || "";
      if (ch !== last) { last = ch; const h = document.createElement("p"); h.className = "ov-h"; h.textContent = LABELS[ch] || ch; grp = document.createElement("div"); grp.className = "ov-g"; inn.append(h, grp); }
      const b = document.createElement("button"); b.type = "button"; b.className = "ov-t"; b.dataset.i = i;
      b.innerHTML = `<span class="ov-f"><span class="ov-s"></span></span><span class="ov-c"><i>${i + 1}</i>${esc(s.dataset.title || "")}</span>`;
      const host = b.querySelector(".ov-s");
      if (s.classList.contains("film")) {
        const img = s.querySelector(".print-only img"); host.classList.add("ov-film");
        if (img) host.innerHTML = `<img src="${esc(img.getAttribute("src"))}" alt="">`;
      } else {
        const c = s.cloneNode(true);
        c.classList.add("cur", "in"); c.classList.remove("prev"); c.style.transform = ""; c.style.transition = ""; c.inert = true; c.setAttribute("aria-hidden", "true");
        c.querySelectorAll("video, iframe, script").forEach(x => x.remove());
        c.querySelectorAll("[data-count]").forEach(el => { el.textContent = (el.dataset.prefix || "") + fmt(parseFloat(el.dataset.count), +(el.dataset.dec || 0)) + (el.dataset.suffix || ""); });
        host.append(c);
      }
      grp.append(b); tiles.push(b);
    });
    body.append(ov);
    ov.addEventListener("click", e => { const t = e.target.closest(".ov-t"); if (!t) return; closeOv(); Deck.show(+t.dataset.i); });
  };
  const size = () => { ov.style.setProperty("--W", innerWidth + "px"); ov.style.setProperty("--H", innerHeight + "px"); ov.style.setProperty("--ar", innerWidth + " / " + innerHeight); const f = tiles[0].querySelector(".ov-f"); ov.style.setProperty("--ovs", f.clientWidth / innerWidth); };
  const openOv = () => {
    if (!ov) build();
    resetZoom(); const k = slides[Deck.cur]._kp; if (k) k.pause();
    ov.hidden = false; body.classList.add("ov-open"); size();
    tiles.forEach((t, i) => t.classList.toggle("on", i === Deck.cur));
    const t = tiles[Deck.cur]; t.scrollIntoView({ block: "center" }); t.focus({ preventScroll: true });
  };
  const closeOv = () => { if (!ov) return; ov.hidden = true; body.classList.remove("ov-open"); };
  addEventListener("resize", () => { if (ovOpen()) size(); if (z > 1) { clamp(); apply(); } });
  window.DeckOverview = { open: openOv, close: closeOv, get isOpen() { return ovOpen(); }, zoomTo, resetZoom, get zoom() { return z; } };

  // keys: O / Esc overview, ctrl/cmd + − 0 zoom; inside the overview the arrows move between thumbnails
  addEventListener("keydown", e => {
    if (!isP() || body.classList.contains("menu-open")) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "=" || e.key === "+")) { closeOv(); zoomTo(z * 1.25); hit(e); return; }
    if (mod && e.key === "-") { if (z > 1) zoomTo(z / 1.25); else openOv(); hit(e); return; }
    if (mod && e.key === "0") { resetZoom(); hit(e); return; }
    if (mod || e.altKey) return;
    if (ovOpen()) {
      const i = tiles.indexOf(document.activeElement), cols = Math.max(1, getComputedStyle(tiles[0].parentNode).gridTemplateColumns.split(" ").length);
      const to = j => { const t = tiles[Math.max(0, Math.min(N - 1, j))]; t.focus({ preventScroll: true }); t.scrollIntoView({ block: "nearest" }); };
      if (e.key === "Escape" || e.key === "o" || e.key === "O") { closeOv(); hit(e); }
      else if (e.key === "ArrowRight") { to(i + 1); hit(e); }
      else if (e.key === "ArrowLeft") { to(i - 1); hit(e); }
      else if (e.key === "ArrowDown") { to(i + cols); hit(e); }
      else if (e.key === "ArrowUp") { to(i - cols); hit(e); }
      else if (["PageDown", "PageUp", "Home", "End", "p", "P"].includes(e.key)) e.stopImmediatePropagation();
      return;
    }
    if (e.key === "o" || e.key === "O") { openOv(); hit(e); }
    else if (e.key === "Escape") { if (z > 1) resetZoom(); else openOv(); hit(e); }
  }, true);

  // trackpad: two-finger horizontal swipe = one slide (threshold + cooldown through the inertia tail);
  // pinch (ctrl+wheel) = zoom in, or the overview from 1×; zoomed, two-finger scroll pans
  let acc = 0, lastW = 0, lock = false, lockUntil = 0, quietT, pacc = 0, plock = 0;
  const holdLock = () => { clearTimeout(quietT); quietT = setTimeout(() => { lock = false; acc = 0; }, Math.max(240, lockUntil - performance.now())); };
  addEventListener("wheel", e => {
    if (!isP() || body.classList.contains("menu-open")) return;
    const now = performance.now();
    if (e.ctrlKey) {
      e.preventDefault();
      if (now - lastW > 300) pacc = 0; lastW = now;
      if (ovOpen()) { pacc += e.deltaY; if (pacc < -40 && now > plock) { closeOv(); plock = now + 600; pacc = 0; } return; }
      if (z > 1 || e.deltaY < 0) { const wasZ = z > 1; zoomTo(z * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); if (wasZ && z === 1) plock = now + 600; pacc = 0; return; }
      pacc += e.deltaY; if (pacc > 40 && now > plock) { openOv(); plock = now + 600; pacc = 0; }
      return;
    }
    if (ovOpen()) return;
    if (z > 1) { e.preventDefault(); tx -= e.deltaX; ty -= e.deltaY; clamp(); apply(); return; }
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || (e.target.closest && e.target.closest(".tablewrap, [data-noswipe]"))) return;
    e.preventDefault();
    if (lock) { holdLock(); return; }
    if (now - lastW > 250) acc = 0; lastW = now;
    acc += e.deltaX;
    if (Math.abs(acc) > 50) { Deck.go(acc > 0 ? 1 : -1); acc = 0; lock = true; lockUntil = now + 500; holdLock(); }
  }, { passive: false });
  // Safari pinch
  let g0 = 1;
  addEventListener("gesturestart", e => { if (!isP()) return; e.preventDefault(); g0 = z; }, { passive: false });
  addEventListener("gesturechange", e => {
    if (!isP()) return; e.preventDefault();
    if (ovOpen()) { if (e.scale > 1.3) closeOv(); return; }
    if (g0 <= 1 && e.scale < 0.75) { openOv(); return; }
    zoomTo(g0 * e.scale, e.clientX || mx, e.clientY || my);
  }, { passive: false });
})();
