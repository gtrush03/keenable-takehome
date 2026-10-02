/* Extended deck: full-page section dividers + an Apple-style Dock (ruling #8). A layer only; no slide is changed.
   Load BEFORE full/shared/deck.js: the dividers must be in <main> when deck.js collects its slides.
   The Dock builds after every script has run (DOMContentLoaded) and drives window.Deck.
   Sections and labels come from .c-path[data-chapters]; each divider's line is read from the section's own slides.
   Main deck (George, 2 Oct): <script src="full/dock.js" data-dock="main"> gives the 19-slide deck the Dock and its Peek previews only;
   no dividers, no new slides, main thumbnails, and it keeps clear of the hero and the film slides. */
(() => {
  const me = document.currentScript, MODE = (me && me.dataset.dock) || "full";
  const main = document.querySelector("main"), path = document.querySelector(".c-path");
  if (!main || !path || !path.dataset.chapters) return;
  const CH = path.dataset.chapters.split(",").map(p => p.split(":").map(t => t.trim()));
  const pad = n => String(n).padStart(2, "0");
  const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // what each section proves: an existing line from that section (or the brief's grid), never new copy
  const LINE = {
    fintech: '#tk-grid a[href="#tk-f-thesis"] > span',
    bridge: "#two-buyers h2",
    galactica: '#tk-grid a[href="#tk-g-thesis"] > span',
    findings: "#findings h2",
    sell: "#proof-ch h2",
    why: "#why h2",
    ask: "#ask h2",
    sources: "#sources h2",
  };
  const text = sel => { const el = sel && document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; };

  // divider colour: Keenable blue, black or #EFF3FB, always contrasting with both neighbouring slides
  const tone = el => {
    if (!el) return "light";
    const m = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    if (m.length < 3 || (m.length > 3 && m[3] < 0.5)) return "light";
    return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] < 128 ? "dark" : "light";
  };
  const slides = [...main.querySelectorAll(":scope > .slide")];
  const total = CH.length;
  let prevTone = "";
  if (MODE === "full") CH.forEach(([id, label], k) => {
    if (id === "opening") return;                              // the hero opens the deck; no divider in front of it
    const first = slides.find(s => s.dataset.chapter === id); if (!first) return;
    const a = tone(first.previousElementSibling), b = tone(first);
    const opts = a === "dark" && b === "dark" ? ["blue", "pale"] : a === "light" && b === "light" ? ["black", "blue"] : ["blue"];
    const pick = opts.find(o => o !== prevTone) || opts[0]; prevTone = pick;
    const line = text(LINE[id]);
    const s = document.createElement("section");
    s.className = `slide dk-div dk-${pick}`; s.id = "part-" + id;
    s.dataset.chapter = id; s.dataset.title = `${pad(k + 1)} · ${label}`; s.dataset.divider = "";
    s.innerHTML = `<div class="inner"><p class="dk-n">${pad(k + 1)} / ${pad(total)}</p><h1>${esc(label)}</h1>${line ? `<p class="dk-l">${esc(line)}</p>` : ""}</div>`;
    first.before(s);
  });

  addEventListener("DOMContentLoaded", () => {
    const D = window.Deck; if (!D) return;
    const body = document.body, all = D.slides;
    const items = CH.map(([id, label], k) => ({ id, label, k, i: all.findIndex(s => s.dataset.chapter === id) }))
      .filter(x => x.i >= 0).sort((p, q) => p.i - q.i);
    const dock = document.createElement("nav");
    dock.className = "dk screen-only"; dock.setAttribute("aria-label", "Sections"); dock.setAttribute("data-noswipe", "");
    const short = l => MODE === "main" ? l.split(" · ")[0] : l;   // main's chapters read "Fintech · Option 2": the tile keeps "Fintech"
    dock.innerHTML = `<div class="dk-bar">${items.map(x =>
      `<button type="button" class="dk-it" data-i="${x.i}" data-ch="${x.id}" aria-label="${pad(x.k + 1)} ${esc(x.label)}"><span class="dk-ic">${pad(x.k + 1)}</span><span class="dk-lb">${esc(short(x.label))}</span></button>`).join("")}</div>`;
    body.append(dock);
    const bar = dock.firstChild, its = [...bar.children];

    // jump: a new history entry (Back returns to where you were), then present mode shows the divider and website mode scrolls to it;
    // finally hand the keys back to the deck
    bar.addEventListener("click", e => {
      const b = e.target.closest(".dk-it"); if (!b || e.defaultPrevented) return;
      const i = +b.dataset.i, id = all[i].id;
      if (D.cur !== i && location.hash !== "#" + id) history.pushState({ deck: MODE, id }, "", "#" + id);
      if (body.classList.contains("present")) D.show(i); else all[i].scrollIntoView({ behavior: "smooth", block: "start" });
      if (e.detail) b.blur();                                   // mouse/touch: Space and arrows go back to the slides
      poke();
    });

    // current section
    let last = -2;
    const update = () => {
      const c = D.cur; let k = -1; items.forEach((x, j) => { if (x.i <= c) k = j; });
      body.classList.toggle("dk-on-div", !!(all[c] && all[c].classList.contains("dk-div")));
      if (MODE === "main") body.classList.toggle("dk-away", !!(all[c] && (all[c].id === "hero" || all[c].querySelector(".film-full"))));   // the hero and the films own the screen
      if (k === last) return; last = k;
      its.forEach((b, j) => { b.classList.toggle("on", j === k); if (j === k) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
      const on = its[k];
      if (on && bar.scrollWidth > bar.clientWidth + 2) bar.scrollTo({ left: on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2, behavior: "smooth" });
    };
    let raf = 0; const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setTimeout(update, 60)); };
    ["scroll", "keydown", "hashchange", "resize"].forEach(t => addEventListener(t, soon, { passive: true }));
    document.addEventListener("slide:in", soon);
    update();

    // show on movement, hide when idle (like the slide controls); always up on a divider
    let hideT, hold = false;
    const poke = (ms = 2400) => { body.classList.add("dk-show"); clearTimeout(hideT); hideT = setTimeout(() => hold ? poke(ms) : body.classList.remove("dk-show"), ms); };
    // main deck on a touch screen (George, 2 Oct): the Dock rises only on a tap in the bottom band (.dk-band) or on the Dock itself; never on
    // a swipe, a tap elsewhere, the slide controls or page load, so it does not sit on the slides. Mouse events there are ignored: iOS sends them
    // after each tap and WebKit again after a scroll (at the last tap point), which would hold the Dock up.
    const touchUI = MODE === "main" && matchMedia("(hover: none) and (pointer: coarse)").matches;
    const band = touchUI ? body.appendChild(Object.assign(document.createElement("div"), { className: "dk-band" })) : null;
    let t0 = null;
    dock.addEventListener("mouseenter", () => { if (touchUI) return; hold = true; poke(); });        // stays up while the pointer (or a Peek) is on it
    dock.addEventListener("mouseleave", () => { if (touchUI) return; hold = false; poke(); });
    addEventListener("mousemove", () => { if (!touchUI) poke(); }, { passive: true });
    addEventListener("touchstart", e => {
      if (e.target.closest(".dk")) return;
      if (!touchUI) return poke(3200);
      const t = e.touches[0]; t0 = t && !e.target.closest(".sc, a, button") && t.clientY >= band.getBoundingClientRect().top ? [t.clientX, t.clientY] : null;
    }, { passive: true });
    if (touchUI) addEventListener("touchend", e => { const t = e.changedTouches[0];
      if (t0 && t && Math.hypot(t.clientX - t0[0], t.clientY - t0[1]) < 12) poke(3200); t0 = null; }, { passive: true });
    addEventListener("scroll", () => { if (!touchUI && !body.classList.contains("present")) poke(); }, { passive: true });
    let dockAt = -1e9;   // on main touch screens only a finger on the Dock counts as its scroll, not update() centring the current tile
    dock.addEventListener("touchstart", () => { dockAt = performance.now(); poke(4000); }, { passive: true });
    dock.addEventListener("scroll", () => { if (!touchUI || performance.now() - dockAt < 1500) poke(4000); }, { passive: true, capture: true });
    if (!touchUI) poke(3600);

    // hide while a film plays (the hero's muted background loop does not count)
    const film = () => body.classList.toggle("dk-film", [...document.querySelectorAll("video")].some(v => !v.paused && !v.ended && !v.classList.contains("kp-hero-bg")));
    ["play", "playing", "pause", "ended", "emptied"].forEach(t => document.addEventListener(t, film, true));
    document.addEventListener("slide:in", () => setTimeout(film, 80));

    // website mode: step aside for the footer
    const foot = document.querySelector(".footer");
    if (foot && "IntersectionObserver" in window) new IntersectionObserver(es => es.forEach(e => body.classList.toggle("dk-foot", e.isIntersecting))).observe(foot);

    // magnify on hover with neighbour falloff (fine pointers only; the phone layout is a scroller)
    const fine = matchMedia("(hover: hover) and (pointer: fine)"), wide = matchMedia("(min-width: 701px)");
    const MAX = 1.75, R = 160;
    let base = null;
    const measure = () => { its.forEach(b => b.style.setProperty("--s", 1)); base = its.map(b => { const r = b.getBoundingClientRect(); return r.left + r.width / 2; }); };
    bar.addEventListener("mouseenter", () => { if (fine.matches && wide.matches) { bar.classList.add("dk-mag"); measure(); } });
    bar.addEventListener("mousemove", e => {
      if (!base || !fine.matches || !wide.matches) return;
      its.forEach((b, j) => { const d = Math.abs(e.clientX - base[j]); b.style.setProperty("--s", d < R ? 1 + (MAX - 1) * (Math.cos(Math.PI * d / R) + 1) / 2 : 1); });
    });
    bar.addEventListener("mouseleave", () => { base = null; bar.classList.remove("dk-mag"); its.forEach(b => b.style.setProperty("--s", 1)); });
    addEventListener("resize", () => { base = null; its.forEach(b => b.style.setProperty("--s", 1)); });
    // Peek (ruling #10): hover or long-press a tile to preview the section's first slides. nav/peek.js is the shared
    // module; attach whenever it is present (now, on load, on "peek:ready", or within 15 s) and stay a plain Dock without it.
    const peekIds = x => all.slice(x.i).filter(s => s.dataset.chapter === x.id && !s.classList.contains("dk-div")).slice(0, 4).map(s => s.id);
    let peeked = false;
    const attachPeek = () => {
      const P = window.Peek; if (peeked || !P || typeof P.attach !== "function") return peeked;
      peeked = true; dock.classList.add("dk-peek");
      its.forEach((b, j) => { const x = items[j]; try { P.attach(b, { deck: MODE, ids: peekIds(x), title: `${pad(x.k + 1)} · ${x.label}`, place: "above" }); } catch (err) { /* a Dock without Peek */ } });
      return true;
    };
    if (!attachPeek()) {
      addEventListener("load", attachPeek, { once: true }); document.addEventListener("peek:ready", attachPeek);
      let tries = 0; const iv = setInterval(() => { if (attachPeek() || ++tries > 30) clearInterval(iv); }, 500);
    }
    window.DeckDock = { el: dock, items, update, attachPeek, peekIds };
  });
})();
