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
    if (r.width > 700 && r.height > 500) return drawWide(r);   // George 2 Oct: desktop gets the full-bleed piece; phones keep the band
    const head = (copy.firstElementChild || copy).getBoundingClientRect();
    const phone = r.width <= 700, top = parseFloat(getComputedStyle(root).paddingTop) + (phone ? 44 : 28);
    const W = Math.round(r.width), H = Math.round(head.top - r.top - (phone ? 28 : 40) - top);
    const key = W + "x" + H; if (key === lastKey) return; lastKey = key;
    box.classList.remove("wide"); root.querySelector(".kp-hero-shade").after(box);
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
        <circle cx="0" cy="${cy}" r="${R}" fill="#000" stroke="rgba(255,255,255,.55)" stroke-width="1.4"/>
        <g stroke="rgba(255,255,255,.5)" stroke-width="1.2" stroke-linecap="round">${ticks}</g>
        <path d="M0 ${cy}V${(cy - R * 0.5).toFixed(1)}" stroke="#fff" stroke-width="2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 0 ${cy};-60 0 ${cy};0 0 ${cy}" ${T}/></path>
        <path d="M0 ${cy}V${(cy - R * 0.74).toFixed(1)}" stroke="#005CFF" stroke-width="1.6" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 0 ${cy};-720 0 ${cy};0 0 ${cy}" ${T}/></path>
        <circle cx="0" cy="${cy}" r="2.4" fill="#fff"/></g></svg>`;
    if (reduce) box.firstElementChild.pauseAnimations();
  }
  // Desktop (George, 2 Oct): a full-bleed chart on black, behind the shade. Candles across the whole width; the blue cutoff line and its clock
  // run the full height. Left of the line (before the cutoff) is lit, right of it is a ghost. No text, no video.
  // First second: the candles rise in and the line slides in from the right edge; then a calm 18 s sweep back and forth.
  // Reduced motion: the same composition, drawn still with the line at 78% of the width.
  function drawWide(r) {
    const W = Math.round(r.width), H = Math.round(r.height), key = "w" + W + "x" + H; if (key === lastKey) return; lastKey = key;
    box.classList.add("wide"); root.querySelector(".kp-hero-shade").before(box);
    box.style.top = "0px"; box.style.height = H + "px";
    const bar = parseFloat(getComputedStyle(root).paddingTop) || 60;
    const R = 30, cy = bar + 34 + R, top = cy + R + 70, bot = H - 64;
    const n = Math.max(18, Math.round(W / 42)), step = W / n, bw = Math.max(6, Math.min(16, step * 0.38));
    const Y = t => bot - (bot - top) * t;
    let s = 11; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    let v = 0.5, ghost = "", up = "", dn = "", grid = "", area = `M0 ${bot}`;
    for (let i = 0; i < n; i++) {   // a slow wave across the full height, with noise, so the candles fill the field
      const x = step * (i + 0.5), o = v;
      v = Math.min(0.94, Math.max(0.06, 0.5 + 0.32 * Math.sin(i * 0.2 + 0.4) + 0.1 * Math.sin(i * 0.67) + (rnd() - 0.5) * 0.14));
      const hi = Math.min(1, Math.max(o, v) + 0.02 + 0.07 * rnd()), lo = Math.max(0, Math.min(o, v) - 0.02 - 0.07 * rnd());
      const yt = Y(Math.max(o, v)), bh = Math.max(3, Y(Math.min(o, v)) - yt);
      const c = `<path d="M${x.toFixed(1)} ${Y(hi).toFixed(1)}V${Y(lo).toFixed(1)}"/><rect x="${(x - bw / 2).toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"/>`;
      ghost += c; if (v >= o) up += c; else dn += c;
      area += `L${x.toFixed(1)} ${Y(v).toFixed(1)}`;
    }
    area += `L${W} ${Y(v).toFixed(1)}L${W} ${bot}Z`;   // the lit side also gets a soft blue area under the closes
    for (let k = 0; k <= 4; k++) grid += `<path d="M0 ${Y(k / 4).toFixed(1)}H${W}"/>`;
    let ticks = ""; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, r1 = R * (k % 3 ? 0.8 : 0.66); ticks += `<path d="M${(Math.sin(a) * r1).toFixed(1)} ${(cy - Math.cos(a) * r1).toFixed(1)}L${(Math.sin(a) * R * 0.9).toFixed(1)} ${(cy - Math.cos(a) * R * 0.9).toFixed(1)}"/>`; }
    const xa = Math.round(W * 0.86), xb = Math.round(W * 0.6), pos = reduce ? Math.round(W * 0.78) : xa;
    // start: the clock rewinds from "now" (the right edge) to the cutoff at 60% in 1.6 s, unlighting the future as it goes; then 60% ↔ 86%, so the lit side stays in the open right half
    const IN = `dur="1.6s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.25 1"`;
    const L = `begin="1.6s" dur="18s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.6 0 0.4 1;0.6 0 0.4 1"`;
    const anim = t => reduce ? "" : t;
    box.innerHTML = `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs><clipPath id="hmLit"><rect x="0" y="0" width="${pos}" height="${H}">${anim(`<animate attributeName="width" values="${W};${xb}" ${IN}/><animate attributeName="width" values="${xb};${xa};${xb}" ${L}/>`)}</rect></clipPath>
        <linearGradient id="hmGlow" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#005CFF" stop-opacity="0"/><stop offset="1" stop-color="#005CFF" stop-opacity=".32"/></linearGradient>
        <linearGradient id="hmArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#005CFF" stop-opacity=".42"/><stop offset="1" stop-color="#005CFF" stop-opacity="0"/></linearGradient></defs>
      <g fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1">${grid}</g>
      <g>${anim(`<animate attributeName="opacity" values="0;1" dur="1.2s" fill="freeze"/><animateTransform attributeName="transform" type="translate" values="0 28;0 0" ${IN}/>`)}
        <g fill="none" stroke="rgba(116,166,255,.26)" stroke-width="1.3">${ghost}</g>
        <g clip-path="url(#hmLit)"><path d="${area}" fill="url(#hmArea)"/><g stroke="#74A6FF" stroke-width="1.6"><g fill="rgba(116,166,255,.16)">${up}</g><g fill="#005CFF">${dn}</g></g></g></g>
      <g transform="translate(${pos} 0)">${anim(`<animateTransform attributeName="transform" type="translate" values="${W} 0;${xb} 0" ${IN}/><animateTransform attributeName="transform" type="translate" values="${xb} 0;${xa} 0;${xb} 0" ${L}/>`)}
        <rect x="-420" y="0" width="420" height="${H}" fill="url(#hmGlow)"/>
        <path d="M0 ${cy + R}V${H}" stroke="#005CFF" stroke-width="2"/>
        <circle cx="0" cy="${cy}" r="${R * 2.2}" fill="none" stroke="rgba(116,166,255,.12)"/>
        <circle cx="0" cy="${cy}" r="${R}" fill="#000" stroke="rgba(255,255,255,.7)" stroke-width="1.4"/>
        <g stroke="rgba(255,255,255,.6)" stroke-width="1.2" stroke-linecap="round">${ticks}</g>
        <path d="M0 ${cy}V${(cy - R * 0.5).toFixed(1)}" stroke="#fff" stroke-width="2.2" stroke-linecap="round" transform="rotate(${reduce ? -35 : 0} 0 ${cy})">${anim(`<animateTransform attributeName="transform" type="rotate" values="0 0 ${cy};-60 0 ${cy};0 0 ${cy}" ${L}/>`)}</path>
        <path d="M0 ${cy}V${(cy - R * 0.76).toFixed(1)}" stroke="#74A6FF" stroke-width="1.8" stroke-linecap="round" transform="rotate(${reduce ? -250 : 0} 0 ${cy})">${anim(`<animateTransform attributeName="transform" type="rotate" values="360 0 ${cy};0 0 ${cy}" ${IN}/><animateTransform attributeName="transform" type="rotate" values="0 0 ${cy};-720 0 ${cy};0 0 ${cy}" ${L}/>`)}</path>
        <circle cx="0" cy="${cy}" r="2.6" fill="#fff"/></g></svg>`;
  }
  let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(draw, 120); };
  addEventListener("resize", later); (document.fonts ? document.fonts.ready : Promise.resolve()).then(later);
  root.closest(".slide")?.addEventListener("slide:in", () => { const sv = box.firstElementChild; if (!reduce && box.classList.contains("wide") && sv && sv.setCurrentTime) sv.setCurrentTime(0); later(); });   // the start animation replays on every return to the hero
  later();
  if ("ResizeObserver" in window) new ResizeObserver(later).observe(root);
}

/* Films: the cinematic hero (muted loop + "Watch the film") and the full-bleed film slides, on the KPlayer. */
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
    // George, 2 Oct: the desktop hero gets its muted loop back (KPlayer's default hero-loop.mp4); phones (portrait and landscape, same
    // 700 × 500 line as drawWide) and reduced motion keep loopSrc: false, so nothing downloads there. Decided once at load.
    const wideLoop = matchMedia("(min-width: 701px) and (min-height: 501px)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const h = KPlayer.hero(slot, {
      loopSrc: wideLoop ? undefined : false,
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
    // the drawn timeline is the fallback on desktop: it steps aside once the loop is actually playing, and stays if it never does
    const bg = h.el.querySelector(".kp-hero-bg");
    if (wideLoop && bg) bg.addEventListener("playing", () => h.el.closest("#hero")?.classList.add("hero-video"), { once: true });
  }
  films.ad = { src: M + "ad.mp4", poster: M + "ad.jpg", title: "Rex", chapters: "ad", eyebrow: "The ad · 0:41" };
  /* George 2 Oct (~08:00Z): "once video is over have it auto move to the next slide". After real playback to the end, a small
     "Next slide in 3 · Cancel" chip (role=status) counts down on the film slide, then the deck moves on the way Continue → does
     (present: Deck.show; website: smooth scroll). No advance after a seek into the last 1.5 s or a resume seek. Cancel, any key,
     a tap on the player, playing again or leaving the slide stops it. Full screen is exited first. resume.js has already saved
     on 'ended' (capture, synchronous) before the chip appears. /films/ has no deck and never loads this file. */
  const AN_SECS = 3, AN_TAIL = 1.5;
  function autoNext(s, kp) {
    const v = kp.video, box = s.querySelector(".film-full") || s;
    if (!document.getElementById("an-css")) {
      const st = document.createElement("style"); st.id = "an-css";
      st.textContent = `.an-chip{position:absolute;z-index:8;display:inline-flex;align-items:center;gap:12px;box-sizing:border-box;max-width:calc(100% - 32px);min-height:52px;padding:4px 4px 4px 16px;border-radius:12px;background:rgba(20,20,20,.88);color:#fff;font:400 15px/1.2 "Stack Sans Text",system-ui,sans-serif;letter-spacing:0;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 0 0 1px rgba(255,255,255,.14);animation:anIn .25s ease both}
.an-chip .an-t{white-space:nowrap}.an-chip b{font-weight:500;font-variant-numeric:tabular-nums;color:#74A6FF}
.an-chip .an-x{min-width:44px;min-height:44px;padding:0 14px;border:0;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font:inherit;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.an-chip .an-x:hover{background:rgba(255,255,255,.24)}.an-chip .an-x:focus-visible{outline:2px solid #005CFF;outline-offset:2px}
@keyframes anIn{from{opacity:0;transform:translateY(6px)}}@media (prefers-reduced-motion:reduce){.an-chip{animation:none}}@media print{.an-chip{display:none!important}}`;
      document.head.append(st);
    }
    let runFrom = 0, chip = null, tick = 0, left = 0;
    const isP = () => document.body.classList.contains("present");
    const idx = () => Deck.slides.indexOf(s);
    // where the current run of playback started: a seek (scrubber, J/L, resume) moves it; playing again after the end restarts it at 0
    v.addEventListener("seeking", () => { runFrom = v.currentTime; });
    v.addEventListener("play", () => { runFrom = v.ended || v.currentTime >= (v.duration || Infinity) - 0.1 ? 0 : v.currentTime; stop(); });
    const onScreen = () => {
      if (document.hidden) return false;
      if (isP()) return Deck.slides[Deck.cur] === s;
      const r = s.getBoundingClientRect(), h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      return h >= Math.min(r.height, innerHeight) * 0.5;
    };
    const exitFs = () => {
      try {
        if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) v.webkitExitFullscreen();
        const f = document.fullscreenElement || document.webkitFullscreenElement;
        if (f && s.contains(f)) { const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (p && p.catch) p.catch(() => {}); }
      } catch (e) {}
    };
    const stop = () => {
      clearInterval(tick); tick = 0;
      if (chip) { chip.remove(); chip = null; }
      kp.el.removeEventListener("pointerdown", stop, true); document.removeEventListener("slide:in", onSlide); document.removeEventListener("visibilitychange", onVis);
    };
    const onSlide = (e) => { if (isP() && e.target !== s) stop(); };   // website mode checks the view on each tick instead
    const onVis = () => { if (document.hidden) stop(); };
    // any key stops it: keydown (registered at mount, before the film keys that stop propagation) and keyup as the backstop
    ["keydown", "keyup"].forEach(t => addEventListener(t, () => { if (chip) stop(); }, true));
    const go = () => {
      const b = s.querySelector("[data-film-next]"); if (b) { b.click(); return; }   // Continue →: Deck.show in present mode, smooth scroll on the website
      const i = idx(); if (isP()) Deck.show(i + 1); else { const n = Deck.slides[i + 1]; if (n) n.scrollIntoView({ behavior: "smooth", block: "start" }); }
    };
    // place the chip clear of the player controls, Continue →, Full screen, the big button, the title and the deck's top bar
    const place = () => {
      if (!chip) return;
      const B = box.getBoundingClientRect(), O = (chip.offsetParent || box).getBoundingClientRect(), cw = chip.offsetWidth, ch = chip.offsetHeight, pad = 16;
      const R = (el) => { if (!el || getComputedStyle(el).display === "none") return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
      const bar = R(kp.el.querySelector(".kp-bar")), goB = R(s.querySelector("[data-film-next]")), fsB = R(s.querySelector("[data-film-fs]")),
        big = R(kp.el.querySelector(".kp-big")), top = R(kp.el.querySelector(".kp-top")), tb = R(document.querySelector(".topbar"));
      const avoid = [bar, goB, fsB, big, top, tb, ...[...kp.el.querySelectorAll(".kp-nav, .kp-keys" + (kp.el.classList.contains("kp-list-open") ? ", .kp-chapters" : ""))].map(R)].filter(Boolean);
      const above = Math.max(bar ? B.bottom - bar.top : 0, goB ? B.bottom - goB.top : 0) + 12;
      const right = goB ? Math.max(pad, B.right - goB.right) : pad, y = B.height - above - ch;
      const hit = (c) => avoid.some(r => !(B.left + c.x + cw <= r.left || B.left + c.x >= r.right || B.top + c.y + ch <= r.top || B.top + c.y >= r.bottom));
      const fits = (c) => c.x >= 0 && c.y >= 0 && c.x + cw <= B.width && c.y + ch <= B.height;
      // right above Continue → first; else the same column higher up, then centred, then on the left (8 px steps upward)
      const cands = [];
      for (const x of [B.width - right - cw, (B.width - cw) / 2, pad]) for (let yy = y; yy >= 8; yy -= 8) cands.push({ x, y: yy });
      const c = cands.find(c => fits(c) && !hit(c)) || cands.find(fits) || { x: B.width - right - cw, y };
      chip.style.left = Math.round(B.left - O.left + c.x) + "px"; chip.style.top = Math.round(B.top - O.top + c.y) + "px";
    };
    v.addEventListener("ended", () => {
      const i = idx();
      if (!(v.duration - runFrom >= AN_TAIL) || i < 0 || i >= Deck.slides.length - 1 || !onScreen()) return;   // real playback to the end only
      exitFs(); stop(); left = AN_SECS;
      chip = document.createElement("div"); chip.className = "an-chip"; chip.setAttribute("role", "status"); chip.setAttribute("aria-atomic", "true");
      chip.innerHTML = `<span class="an-t">Next slide in <b>${left}</b></span><button type="button" class="an-x">Cancel</button>`;
      chip.querySelector(".an-x").addEventListener("click", (e) => { e.stopPropagation(); stop(); });
      box.append(chip); place(); setTimeout(place, 450);
      kp.el.addEventListener("pointerdown", stop, true); document.addEventListener("slide:in", onSlide); document.addEventListener("visibilitychange", onVis);
      tick = setInterval(() => {
        if (!chip || !v.ended || !onScreen()) return stop();
        left -= 1;
        if (left > 0) { chip.querySelector("b").textContent = left; return; }
        stop(); go();
      }, 1000);
    });
  }
  document.querySelectorAll(".kplayer[data-film]").forEach(el => {
    const f = films[el.dataset.film]; if (!f) return;
    const s = el.closest(".slide.focus");
    // film slides: KPlayer's own ‹ › (they also show in full screen and exit it first), wired to the deck
    const nav = s && { prev: () => Deck.show(Deck.slides.indexOf(s) - 1), next: () => Deck.show(Deck.slides.indexOf(s) + 1), prevLabel: "Previous slide", nextLabel: "Next slide" };
    const kp = KPlayer.mount(el, s ? Object.assign({ fill: true, nav }, f) : f);
    if (s) { s._kp = kp; const sc = kp.el.querySelector(".kp-scrub"); if (sc) sc.setAttribute("data-noswipe", ""); kp.video.addEventListener("ended", () => { s.classList.add("ended"); const b = s.querySelector("[data-film-next]"); if (b) b.focus({ preventScroll: true }); }); kp.video.addEventListener("play", () => s.classList.remove("ended")); }
    if (s) autoNext(s, kp);   // George 2 Oct: after the film ends, count down and move to the next slide
  });
})();
/* leaving a film slide pauses its film, so no audio plays from a hidden slide */
document.addEventListener("slide:in", e => {
  if (document.body.classList.contains("present") && window.Deck && e.target !== Deck.slides[Deck.cur]) return;
  document.querySelectorAll(".kplayer video").forEach(v => { if (!e.target.contains(v) && !v.paused) v.pause(); });
});

/* hotfix 3d, every screen: a film never runs off its own slide in presentation mode. Whatever starts it (a late retry,
   a stray tap), it is paused at once */
document.addEventListener("play", e => {
  const v = e.target, s = v.closest && v.closest(".kplayer[data-film]") && v.closest(".slide");
  if (s && window.Deck && document.body.classList.contains("present") && s !== Deck.slides[Deck.cur]) v.pause();
}, true);

/* hotfix 3d (2 Oct), touch screens: a film left behind gives back its decoder and buffer (pause, src removed, load()).
   Its next play() (entering its slide, the player's own ▶) puts the same src back first and picks up where it was, so
   play-on-entry with sound still works. hls.js players (blob: src) are left alone. */
(() => {
  if (!matchMedia("(hover: none) and (pointer: coarse)").matches) return;
  const away = v => {
    const s = v.closest(".slide"); if (!s) return false;
    if (document.body.classList.contains("present")) return !!window.Deck && s !== Deck.slides[Deck.cur];
    const r = s.getBoundingClientRect(); return r.bottom <= 0 || r.top >= innerHeight;   // website mode: only once fully off screen
  };
  const unload = v => {
    const src = v.getAttribute("src"); if (!src || src.startsWith("blob:")) return;
    v.pause(); v._k3d = { src, t: v.ended ? 0 : v.currentTime };
    if (!v._k3dPlay) {
      const play = v.play; v._k3dPlay = true;
      v.play = function () { const k = this._k3d; if (k) { this._k3d = null; this.src = k.src; if (k.t > 1) this.currentTime = k.t; } return play.call(this); };
    }
    v.removeAttribute("src"); v.load();
  };
  document.addEventListener("slide:in", e => {
    if (document.body.classList.contains("present") && window.Deck && e.target !== Deck.slides[Deck.cur]) return;
    document.querySelectorAll(".kplayer[data-film] video").forEach(v => { if (away(v)) unload(v); });
  });
})();

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
      // hotfix 3d: the muted retry is only for a refused sound start on the slide still shown. A play() cut short by leaving
      // the slide (AbortError from the leave-pause) used to land here and restart the film muted, off its slide
      if (r && r.catch) r.catch(err => { if ((err && err.name === "AbortError") || (isP() ? curSlide() !== s : !s._inView)) return; v.muted = true; kp.play(); });
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
