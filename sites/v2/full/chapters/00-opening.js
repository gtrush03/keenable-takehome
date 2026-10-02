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
