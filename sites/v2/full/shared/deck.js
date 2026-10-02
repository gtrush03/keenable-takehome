/* Deck engine: one page works as a scrolling website and as a full-screen presentation.
   Markup: <main><section class="slide" id="..." data-title="Short name">...</section></main>
   Keys: P toggles presentation · ←/→, ↑/↓, Space, PgUp/PgDn move · Esc leaves · Home/End. */
(() => {
  const slides = [...document.querySelectorAll("main > .slide")];
  if (!slides.length) return;
  slides.forEach((s, i) => { if (!s.id) s.id = "s" + (i + 1); });

  // chrome
  const bar = document.createElement("div"); bar.className = "progress"; document.body.append(bar);
  const rail = document.createElement("div"); rail.className = "rail"; rail.setAttribute("aria-hidden", "true");
  slides.forEach(s => { const a = document.createElement("a"); a.href = "#" + s.id; a.title = s.dataset.title || ""; rail.append(a); });
  document.body.append(rail);
  const counter = document.createElement("div"); counter.className = "counter"; document.body.append(counter);
  const nav = document.querySelector(".topbar nav");
  if (nav && !nav.children.length) slides.filter(s => s.dataset.title).forEach(s => {
    const a = document.createElement("a"); a.href = "#" + s.id; a.textContent = s.dataset.title; nav.append(a);
  });

  let cur = 0;
  const setActive = (i) => {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    [...rail.children].forEach((a, j) => a.classList.toggle("on", j === cur));
    if (nav) [...nav.children].forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + slides[cur].id));
    bar.style.transform = `scaleX(${slides.length > 1 ? cur / (slides.length - 1) : 1})`;
    counter.innerHTML = `<span>${String(cur + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}</span><span>${slides[cur].dataset.title || ""}</span>`;
    const activeNav = nav && nav.querySelector("a.on"); if (activeNav) activeNav.scrollIntoView({ block: "nearest", inline: "center" });
  };

  // reveal + active tracking in website mode
  const seen = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); e.target.dispatchEvent(new CustomEvent("slide:in", { bubbles: true })); }
  }), { threshold: 0.18 });
  slides.forEach(s => {
    [...s.querySelectorAll("[data-reveal]")].forEach((el, k) => el.style.setProperty("--i", el.dataset.i ?? k));
    seen.observe(s);
  });
  const act = new IntersectionObserver(es => {
    if (document.body.classList.contains("present")) return;
    es.forEach(e => { if (e.isIntersecting) setActive(slides.indexOf(e.target)); });
  }, { rootMargin: "-45% 0px -50% 0px" });
  slides.forEach(s => act.observe(s));

  // presentation mode
  const present = (on) => {
    document.body.classList.toggle("present", on);
    if (on) { show(cur); } else { slides.forEach(s => s.classList.remove("cur", "prev")); slides[cur].scrollIntoView({ behavior: "instant", block: "start" }); }
    document.querySelectorAll("[data-present-toggle]").forEach(b => b.setAttribute("aria-pressed", on));
  };
  const show = (i) => {
    setActive(i);
    slides.forEach((s, j) => { s.classList.toggle("cur", j === cur); s.classList.toggle("prev", j < cur); });
    slides[cur].classList.add("in"); slides[cur].scrollTop = 0;
    slides[cur].dispatchEvent(new CustomEvent("slide:in", { bubbles: true }));
    // hotfix 3d: WebKit throws after 100 replaceState calls in 10 s; skip when the hash is already this slide
    if (decodeURIComponent(location.hash.slice(1)) !== slides[cur].id) try { history.replaceState(null, "", "#" + slides[cur].id); } catch (_) {}
  };
  const go = (d) => {
    if (document.body.classList.contains("present")) show(cur + d);
    else slides[Math.max(0, Math.min(slides.length - 1, cur + d))].scrollIntoView({ behavior: "smooth", block: "start" });
  };
  document.querySelectorAll("[data-present-toggle]").forEach(b => b.addEventListener("click", () => present(!document.body.classList.contains("present"))));

  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable], [data-keys-local]") || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === " " || e.key === "Enter") && e.target.closest("button, a, summary, [role=button]")) return;
    const P = document.body.classList.contains("present");
    if (e.key === "p" || e.key === "P") { present(!P); e.preventDefault(); }
    else if (e.key === "Escape" && P) present(false);
    else if (P && ["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { go(1); e.preventDefault(); }
    else if (P && ["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { go(-1); e.preventDefault(); }
    else if (!P && (e.key === "PageDown" || e.key === "j")) { go(1); e.preventDefault(); }
    else if (!P && (e.key === "PageUp" || e.key === "k")) { go(-1); e.preventDefault(); }
    else if (e.key === "Home" && P) show(0);
    else if (e.key === "End" && P) show(slides.length - 1);
  });
  // swipe in presentation mode
  let tx = null;
  let touchAt = -1e9;   // the mouse events iOS sends after a tap must not slide the top bar in (that would drop the tap's click)
  addEventListener("touchstart", e => { touchAt = performance.now(); tx = e.target.closest("input, select, textarea, button, .tablewrap, [data-noswipe]") ? null : e.touches[0].clientX; }, { passive: true });
  addEventListener("touchend", e => {
    if (!document.body.classList.contains("present") || tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); tx = null;
  }, { passive: true });
  let hideT; addEventListener("mousemove", e => {
    if (!document.body.classList.contains("present") || performance.now() - touchAt < 1200) return;
    document.body.classList.toggle("show-ui", e.clientY < 70); clearTimeout(hideT);
    hideT = setTimeout(() => document.body.classList.remove("show-ui"), 1800);
  });

  document.addEventListener("click", e => {
    const a = e.target.closest('a[href^="#"]'); if (!a || !document.body.classList.contains("present")) return;
    const id = a.getAttribute("href").slice(1), target = document.getElementById(id); if (!target) return;
    const slide = target.closest("main > .slide"); const i = slides.indexOf(slide);
    if (i >= 0) { e.preventDefault(); show(i); if (target !== slide) setTimeout(() => target.scrollIntoView({ block: "start", behavior: "smooth" }), 450); }
  });
  addEventListener("hashchange", () => {
    if (!document.body.classList.contains("present")) return;
    const el = document.getElementById(location.hash.slice(1)); const sl = el && el.closest("main > .slide"); const i = slides.indexOf(sl);
    if (i >= 0 && i !== cur) show(i);
  });

  // count-up numbers: <span data-count="1234.5" data-dec="1" data-prefix="$" data-suffix="M"></span>
  const fmt = (v, d) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const runCount = (el) => {
    if (el.dataset.done) return; el.dataset.done = 1;
    const to = parseFloat(el.dataset.count), d = +(el.dataset.dec || 0), pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = pre + fmt(to, d) + suf; return; }
    const t0 = performance.now(), dur = +(el.dataset.dur || 1200);
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e2 = 1 - Math.pow(1 - k, 3); el.textContent = pre + fmt(to * e2, d) + suf; if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  document.querySelectorAll("[data-count]").forEach(el => { el.textContent = (el.dataset.prefix || "") + "0" + (el.dataset.suffix || ""); });
  document.addEventListener("slide:in", e => e.target.querySelectorAll("[data-count]").forEach(runCount));
  // print / PDF: every slide revealed and every counter at its final value, no animation
  const finalizeForPrint = () => {
    slides.forEach(s => s.classList.add("in"));
    document.querySelectorAll("[data-count]").forEach(el => {
      el.dataset.done = 1;
      el.textContent = (el.dataset.prefix || "") + fmt(parseFloat(el.dataset.count), +(el.dataset.dec || 0)) + (el.dataset.suffix || "");
    });
  };
  addEventListener("beforeprint", finalizeForPrint);
  if (matchMedia) { const mq = matchMedia("print"); mq.addEventListener && mq.addEventListener("change", e => { if (e.matches) finalizeForPrint(); }); }
  window.DeckPrint = finalizeForPrint;

  // deep link / start mode (?present=1)
  const startEl = location.hash && document.getElementById(location.hash.slice(1));
  const startIdx = Math.max(0, slides.indexOf(startEl && startEl.closest("main > .slide")));
  setActive(startIdx);
  if (new URLSearchParams(location.search).has("present")) present(true);
  // website mode: re-anchor deep links once fonts and late layout settle (charts, fetched data)
  else if (startEl) {
    const reanchor = () => { if (!document.body.classList.contains("present")) startEl.scrollIntoView({ block: "start" }); };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(reanchor));
    addEventListener("load", () => setTimeout(reanchor, 150), { once: true });
    // keep the anchor while late content changes the layout, for up to 4 s or until the reader scrolls
    let userMoved = false; const stop = () => { userMoved = true; ro.disconnect(); };
    ["wheel", "touchstart", "keydown"].forEach(t => addEventListener(t, stop, { once: true, passive: true }));
    const ro = new ResizeObserver(() => { if (!userMoved) requestAnimationFrame(reanchor); });
    ro.observe(document.querySelector("main")); setTimeout(() => ro.disconnect(), 4000);
  }
  window.Deck = { go, show, present, slides, get cur() { return cur; } };
})();
