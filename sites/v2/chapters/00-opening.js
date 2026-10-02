/* 00-opening: the chapter map jumps to the first slide of each chapter; chapters with no slides yet are dimmed. */
(() => {
  const map = document.getElementById("opMap");
  if (!map) return;
  const slides = [...document.querySelectorAll("main > .slide")];
  map.querySelectorAll("a[data-ch]").forEach(a => {
    const id = (a.getAttribute("href") || "").replace(/^#/, ""), byId = slides.findIndex(s => s.id === id);
    const i = byId >= 0 ? byId : slides.findIndex(s => s.dataset.chapter === a.dataset.ch);  // ids survive the v3 section names
    if (i < 0) { a.parentElement.classList.add("empty"); a.setAttribute("aria-disabled", "true"); }
    a.addEventListener("click", e => {
      e.preventDefault();
      if (i < 0) return;
      const ix = a.closest(".c-ix");
      if (ix && !ix.classList.contains("touched")) { ix.classList.add("touched"); const b = ix.querySelector(".ix-badge span"); if (b) b.textContent = "You tapped it"; }
      if (document.body.classList.contains("present") && window.Deck) Deck.show(i);
      else slides[i].scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
})();

/* #whoami: the two usage claims stay hidden unless the page is opened with ?claims=1 (one flag, default off). */
(() => { try { if (new URLSearchParams(location.search).get("claims") === "1") document.body.classList.add("claims"); } catch (e) {} })();

/* Hero helpers (George #17): custom play and speaker glyphs, the sound line (recomputed from the flow), the drawn background. */
const PLAY = '<svg class="hs-ico" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6.5 4.6c0-.8.9-1.3 1.6-.9l7.6 4.6c.7.4.7 1.4 0 1.8l-7.6 4.6c-.7.4-1.6-.1-1.6-.9z" fill="currentColor"/></svg>';
const SPEAKER = '<svg class="hs-ico" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.6h2.7L10 4.6v10.8l-3.8-3H3.5z"/><path d="M13 7.3a3.8 3.8 0 0 1 0 5.4M15.3 5.2a6.8 6.8 0 0 1 0 9.6"/></svg>';
function soundLine() {
  const LEN = { fintech: 371.2, galactica: 318.5, ad: 41.0 };   // ffprobe of media/*.mp4, 1 Oct
  const slides = window.Deck ? Deck.slides : [...document.querySelectorAll("main > .slide")];
  const films = slides.map(s => s.querySelector(".kplayer[data-film]")).filter(Boolean).map(k => LEN[k.dataset.film] || 0);
  const secs = films.reduce((a, b) => a + b, 0) + (slides.length - films.length) * 19;   // about 19 s a slide between films
  const n = ["no", "one", "two", "3", "4", "5"][films.length] || films.length;
  return `Sound on · ${n} narrated film${films.length === 1 ? "" : "s"} · about ${Math.round(secs / 60)} min`;
}
function heroMotion(root) {
  const NS = "http://www.w3.org/2000/svg", copy = root.querySelector(".kp-hero-copy");
  const box = document.createElement("div"); box.className = "hero-motion"; box.setAttribute("aria-hidden", "true");
  root.querySelector(".kp-hero-shade").after(box);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastKey = "";
  function draw() {
    const r = root.getBoundingClientRect(); if (!r.height) return;
    const head = (copy.firstElementChild || copy).getBoundingClientRect();
    const phone = r.width <= 700, top = parseFloat(getComputedStyle(root).paddingTop) + (phone ? 44 : 28);
    const W = Math.round(r.width), H = Math.round(head.top - r.top - (phone ? 28 : 40) - top);
    const key = W + "x" + H; if (key === lastKey) return; lastKey = key;
    box.style.top = top + "px"; box.style.height = Math.max(0, H) + "px";
    if (H < 110) { box.innerHTML = ""; return; }
    const pad = Math.min(88, Math.max(20, W * 0.06)), base = H - 10, R = Math.max(15, Math.min(38, H * 0.11)), cy = R + 4;
    const n = Math.max(8, Math.floor((W - 2 * pad) / (phone ? 30 : 52))), step = (W - 2 * pad) / n, bw = Math.min(16, step * 0.42);
    const xa = Math.round(W * (phone ? 0.8 : 0.78)), xb = Math.round(W * (phone ? 0.38 : 0.44));
    let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    let candles = "", dots = "";
    for (let i = 0; i < n; i++) {
      const x = pad + step * (i + 0.5), mid = base - (base - cy - R) * (0.42 + 0.22 * Math.sin(i * 0.55) + 0.12 * (rnd() - 0.5));
      const bh = Math.max(10, (base - cy - R) * (0.1 + 0.16 * rnd())), wk = 6 + 10 * rnd();
      candles += `<path d="M${x.toFixed(1)} ${(mid - bh / 2 - wk).toFixed(1)}V${(mid + bh / 2 + wk).toFixed(1)}"/><rect x="${(x - bw / 2).toFixed(1)}" y="${(mid - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"/>`;
      dots += `<circle cx="${x.toFixed(1)}" cy="${base}" r="2.2"/>`;
    }
    let ticks = ""; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, r1 = R * (k % 3 ? 0.8 : 0.7); ticks += `<path d="M${(Math.sin(a) * r1).toFixed(1)} ${(cy - Math.cos(a) * r1).toFixed(1)}L${(Math.sin(a) * R * 0.9).toFixed(1)} ${(cy - Math.cos(a) * R * 0.9).toFixed(1)}"/>`; }
    let rings = ""; for (let k = 2; k <= 7; k++) rings += `<circle cx="0" cy="${cy}" r="${(R * k * 1.15).toFixed(1)}"/>`;
    const T = `dur="18s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.6 0 0.4 1;0.6 0 0.4 1"`;
    box.innerHTML = `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">
      <defs><clipPath id="hmPast"><rect x="0" y="0" width="${xa}" height="${H}"><animate attributeName="width" values="${xa};${xb};${xa}" ${T}/></rect></clipPath></defs>
      <path d="M${pad} ${base}H${W - pad}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
      <g fill="rgba(255,255,255,.22)">${dots}</g>
      <g fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.2">${candles}</g>
      <g fill="none" stroke="rgba(255,255,255,.46)" stroke-width="1.2" clip-path="url(#hmPast)">${candles}</g>
      <g><animateTransform attributeName="transform" type="translate" values="${xa} 0;${xb} 0;${xa} 0" ${T}/>
        <g fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1">${rings}</g>
        <path d="M0 ${cy + R}V${base}" stroke="#005CFF" stroke-width="2"/><circle cx="0" cy="${base}" r="4" fill="#005CFF"/>
        <circle cx="0" cy="${cy}" r="${R}" fill="#141414" stroke="rgba(255,255,255,.55)" stroke-width="1.4"/>
        <g stroke="rgba(255,255,255,.5)" stroke-width="1.2" stroke-linecap="round">${ticks}</g>
        <path d="M0 ${cy}V${(cy - R * 0.5).toFixed(1)}" stroke="#fff" stroke-width="2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 0 ${cy};-60 0 ${cy};0 0 ${cy}" ${T}/></path>
        <path d="M0 ${cy}V${(cy - R * 0.74).toFixed(1)}" stroke="#005CFF" stroke-width="1.6" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 0 ${cy};-720 0 ${cy};0 0 ${cy}" ${T}/></path>
        <circle cx="0" cy="${cy}" r="2.4" fill="#fff"/></g></svg>`;
    if (reduce) box.firstElementChild.pauseAnimations();
  }
  let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(draw, 120); };
  addEventListener("resize", later); (document.fonts ? document.fonts.ready : Promise.resolve()).then(later);
  root.closest(".slide")?.addEventListener("slide:in", later); later();
  if ("ResizeObserver" in window) new ResizeObserver(later).observe(root);
}

/* Films: the cinematic hero (muted loop + "Watch the film") and the full-bleed film slides, on higgs-ad's KPlayer. */
(() => {
  if (!window.KPlayer) return;
  const M = KPlayer.media;
  const demo = window.DEMO_URL || "#";
  const films = {
    fintech: { src: M + "fintech.mp4", poster: M + "fintech.jpg", title: "Search, with a clock", chapters: "fintech", eyebrow: "Film · fintech · 6:11" },
    galactica: { src: M + "galactica.mp4", poster: M + "galactica.jpg", title: "Galactica: the same timestamp, for labs", chapters: "galactica", eyebrow: "Film · Galactica · 5:19" },
  };
  const slot = document.querySelector("[data-kp-hero]");
  if (slot) {
    const h = KPlayer.hero(slot, {
      loopSrc: false,   // KPlayer 1.5: no film-frame loop (George #17: no readable text behind the hero); nothing downloads
      titleHtml: "Search, with a clock.<br><em>Galactica.</em>",
      sub: "George Trushevskiy · Founding GTM take-home for Keenable. I didn’t pitch your product: I ran it, tested it, and brought back the bug.",
      films: [],
    });
    // George #17: one primary "Play presentation" (custom play glyph), a quiet sound line under it, then the films and the demo as small links
    const ctas = h.el.querySelector(".kp-hero-ctas");
    const go = document.createElement("button");
    go.type = "button"; go.className = "hero-start"; go.innerHTML = PLAY + "<span>Play presentation</span>";
    go.addEventListener("click", () => { if (!window.Deck) return; if (!document.body.classList.contains("present")) Deck.present(true); Deck.show(Deck.slides.indexOf(slot.closest(".slide")) + 1); });
    const sound = document.createElement("p");
    sound.className = "hero-sound"; sound.innerHTML = SPEAKER + "<span>" + soundLine() + "</span>";
    const links = document.createElement("p");
    links.className = "hero-links";
    links.innerHTML = '<a href="#film-fintech">Fintech film</a><a href="#film-galactica">Galactica film</a><a href="#film-ad">The ad</a><a href="' + demo + '" target="_blank" rel="noopener" data-demo-link>Live demo ↗</a>';
    ctas.append(go, sound, links);
    // George #17: the film-frame loop carried readable text (headlines, "0/60", dates) into the hero, so it is replaced by a
    // drawn timeline with no text at all: candles, a clock, and the blue cutoff line sweeping back to the day before
    heroMotion(h.el);
  }
  films.ad = { src: M + "ad.mp4", poster: M + "ad.jpg", title: "Rex", chapters: "ad", eyebrow: "The ad · 0:41" };
  document.querySelectorAll(".kplayer[data-film]").forEach(el => {
    const f = films[el.dataset.film]; if (!f) return;
    const s = el.closest(".slide.focus");
    // film slides: KPlayer's own ‹ › (they also show in full screen and exit it first), wired to the deck
    const nav = s && { prev: () => Deck.show(Deck.slides.indexOf(s) - 1), next: () => Deck.show(Deck.slides.indexOf(s) + 1), prevLabel: "Previous slide", nextLabel: "Next slide" };
    const kp = KPlayer.mount(el, s ? Object.assign({ fill: true, nav }, f) : f);
    if (s) { s._kp = kp; const sc = kp.el.querySelector(".kp-scrub"); if (sc) sc.setAttribute("data-noswipe", ""); kp.video.addEventListener("ended", () => { s.classList.add("ended"); const b = s.querySelector("[data-film-next]"); if (b) b.focus({ preventScroll: true }); }); kp.video.addEventListener("play", () => s.classList.remove("ended")); }
  });
})();
/* leaving a film slide pauses its film, so no audio plays from a hidden slide */
document.addEventListener("slide:in", e => {
  if (document.body.classList.contains("present") && window.Deck && e.target !== Deck.slides[Deck.cur]) return;
  document.querySelectorAll(".kplayer video").forEach(v => { if (!e.target.contains(v) && !v.paused) v.pause(); });
});

/* Focus film slides: the film fills the screen, the chrome dims, and it starts with sound when the slide is entered
   (the presenter's keypress is the gesture; without one it starts muted with "Tap for sound").
   ← / → always change slides; J / L seek 10 s, Space pauses, Esc opens the overview. When it ends, "Continue →" appears.
   Deep links: ?ch=solution#film-fintech or ?t=132#film-fintech start the film there. */
(() => {
  if (!window.KPlayer || !window.Deck) return;
  const isP = () => document.body.classList.contains("present");
  const curSlide = () => Deck.slides[Deck.cur];
  const q = new URLSearchParams(location.search);
  let deep = (q.get("ch") || q.get("t")) && location.hash ? { id: location.hash.slice(1), ch: (q.get("ch") || "").toLowerCase(), t: parseFloat(q.get("t")) } : null;
  const chaptersP = deep && deep.ch ? fetch(KPlayer.media + "chapters.json").then(r => r.json()).catch(() => null) : Promise.resolve(null);
  const startAt = (s) => {
    if (!deep || deep.id !== s.id) return Promise.resolve(null);
    const d = deep; deep = null;
    if (!isNaN(d.t)) return Promise.resolve(d.t);
    const key = (s.querySelector(".kplayer[data-film]") || {}).dataset?.film;
    return chaptersP.then(j => { const c = j && j[key] && j[key].chapters.find(c => c.label.toLowerCase().replace(/\s+/g, "-") === d.ch); return c ? c.t : null; });
  };
  const start = (s) => {
    const kp = s._kp; if (!kp) return;
    const v = kp.video;
    startAt(s).then(t => {
      if (t != null) v.currentTime = t; else if (v.ended) v.currentTime = 0;
      v.muted = false;
      const r = v.play();
      if (r && r.catch) r.catch(() => { v.muted = true; kp.play(); });
    });
  };
  const setOn = (on) => document.body.classList.toggle("film-on", !!on);
  document.addEventListener("slide:in", e => {
    if (!isP()) return;
    const s = e.target; if (s !== curSlide()) return;
    setOn(s.classList.contains("focus") && s._kp);
    if (s.classList.contains("focus")) start(s);
  });
  document.querySelectorAll(".slide.focus").forEach(s => {
    const fs = s.querySelector("[data-film-fs]"); if (fs) fs.addEventListener("click", () => { if (s._kp) s._kp.toggleFullscreen(); });
    const ff = s.querySelector(".film-full"); if (ff) ff.addEventListener("dblclick", e => { if (!e.target.closest(".kp-bar, button") && s._kp) { e.preventDefault(); s._kp.toggleFullscreen(); } });
    const b = s.querySelector("[data-film-next]");
    if (b) b.addEventListener("click", () => { if (isP()) Deck.show(Deck.slides.indexOf(s) + 1); else { const n = Deck.slides[Deck.slides.indexOf(s) + 1]; if (n) n.scrollIntoView({ behavior: "smooth", block: "start" }); } });
  });
  // website mode: a film plays while it fills most of the screen and pauses when scrolled away
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (isP()) return;
    const s = e.target, kp = s._kp; if (!kp) return;
    if (e.intersectionRatio >= 0.6) { setOn(true); if (!s.classList.contains("ended")) start(s); }
    else { if (!kp.video.paused) kp.pause(); if (![...document.querySelectorAll(".slide.focus")].some(x => x !== s && x._inView)) setOn(false); }
    s._inView = e.intersectionRatio >= 0.6;
  }), { threshold: [0, 0.6] });
  document.querySelectorAll(".slide.focus").forEach(s => io.observe(s));
  let wasP = isP();
  new MutationObserver(() => { const p = isP(); if (p === wasP) return; wasP = p;
    if (p) setOn(curSlide().classList.contains("focus")); else setOn([...document.querySelectorAll(".slide.focus")].some(x => x._inView)); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  // deck may already be presenting a film slide on load (?present=1#film-…): start it now
  if (isP() && curSlide().classList.contains("focus")) { setOn(true); start(curSlide()); }
  addEventListener("keydown", (e) => {
    if (!isP() || e.metaKey || e.ctrlKey || e.altKey) return;
    const s = curSlide(), kp = s && s.classList.contains("focus") && s._kp; if (!kp) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const v = kp.video, done = s.classList.contains("ended");
    const move = (d) => { kp.pause(); Deck.show(Deck.cur + d); };
    let hit = true;
    // ← → always change slides (George 23:55Z); seeking moved to J/L and the scrubber; Esc opens the overview (v2.js)
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") move(1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") move(-1);
    else if (e.key === "j" || e.key === "J") kp.seek(v.currentTime - 10);
    else if (e.key === "l" || e.key === "L") kp.seek(v.currentTime + 10);
    else if (e.key === " " || e.key === "k" || e.key === "K") { if ((e.key === " ") && e.target.closest("button")) hit = false; else kp.toggle(); }
    else if (e.key === "Enter" && done) move(1);
    else if (e.key === "m" || e.key === "M") v.muted = !v.muted;
    else if (e.key === "f" || e.key === "F") kp.toggleFullscreen();
    else hit = false;
    if (hit) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
})();
