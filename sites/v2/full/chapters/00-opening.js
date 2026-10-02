/* 00-opening: the chapter map jumps to the first slide of each chapter; chapters with no slides yet are dimmed. */
(() => {
  const map = document.getElementById("opMap");
  if (!map) return;
  const slides = [...document.querySelectorAll("main > .slide")];
  map.querySelectorAll("a[data-ch]").forEach(a => {
    const i = slides.findIndex(s => s.dataset.chapter === a.dataset.ch);
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
    const h = KPlayer.hero(slot, {
      loopSrc: false, poster: M + "fintech.jpg",   // George #17: no readable text behind the hero; nothing downloads
      titleHtml: "Search, with a clock.<br><em>Galactica.</em>",
      sub: "George Trushevskiy · Founding GTM take-home for Keenable. I didn’t pitch your product: I ran it, tested it, and brought back the bug.",
      films: [],
    });
    // George 00:03Z: one primary "Start presentation" (advances to the agenda), the films and the demo as small text links
    const ctas = h.el.querySelector(".kp-hero-ctas");
    const go = document.createElement("button");
    go.type = "button"; go.className = "hero-start"; go.innerHTML = 'Start presentation <span aria-hidden="true">→</span>';
    go.addEventListener("click", () => { if (!window.Deck) return; if (!document.body.classList.contains("present")) Deck.present(true); Deck.show(Deck.slides.indexOf(slot.closest(".slide")) + 1); });
    const links = document.createElement("p");
    links.className = "hero-links";
    links.innerHTML = '<a href="#film-fintech">Fintech film</a><a href="#film-galactica">Galactica film</a><a href="#film-ad">The ad</a><a href="' + demo + '" target="_blank" rel="noopener" data-demo-link>Live demo ↗</a>';
    ctas.append(go, links);
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

/* Focus film slides: the film fills the screen, the chrome dims, and it starts with sound when the slide is entered
   (the presenter's keypress is the gesture; without one it starts muted with "Tap for sound").
   ← / → always change slides; J / L seek 10 s, Space pauses, Esc opens the overview. When it ends, "Continue →" appears.
   Deep links: ?ch=solution#film-fintech or ?t=104#film-fintech start the film there. */
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
