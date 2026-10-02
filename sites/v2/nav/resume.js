/* "Continue where you left off" (ruling #19) and "Return to main presentation" (#20/#21). Self-injecting; load after shared/deck.js on a deck,
   or on any other page (hub, full.html, original25.html, films/, map/, index-map/, memo/).
   SAVE (decks only): each slide:in stores {deck, id, title, section, n, N, t} in localStorage, one key per deck ("main" = /v2/, "full" = full.html;
   original25.html and every other page save nothing, so "main" only ever tracks the main deck);
   a playing film also stores {film, time} every ~2 s, read from its <video> (player.js is untouched). Slide 1 is never saved.
   SHOW: the hub's primary button becomes "Continue · …" (the old start button becomes a small "Start over" link); the deck Menu gets one quiet
   "Continue: …" row. RESUME: a real link (or Deck.show inside the same deck), so Back works; a film is sought to its time and left paused.
   RETURN: every page except the main deck and the hub gets a quiet "Return to main presentation" pill (deck top bar, kit header next to Demo,
   else fixed bottom-left)
   that opens the main deck where the viewer left it (slide + film time), else ../?present=1.
   Storage blocked or throwing (private mode): no Continue, no saves, nothing throws; the Return pill still goes to ../?present=1. */
(() => {
  if (window.ResumeNav) return; window.ResumeNav = {};   // loaded twice: the first copy wins
  const SRC = (document.currentScript && document.currentScript.src) || location.href;
  const at = p => new URL(p, SRC).href;
  const ROOT = at("../");
  let store = null;
  try { store = window.localStorage; store.setItem("keenable.resume.probe", "1"); store.removeItem("keenable.resume.probe"); } catch (e) { store = null; }
  const key = d => "keenable.resume." + d;
  const get = d => { if (!store) return null; try { const r = JSON.parse(store.getItem(key(d)) || "null"); return r && r.id ? r : null; } catch (e) { return null; } };
  const set = (d, r) => { if (!store) return; try { store.setItem(key(d), JSON.stringify(r)); } catch (e) { /* full or blocked: skip */ } };
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ready = fn => document.readyState === "loading" ? addEventListener("DOMContentLoaded", fn) : fn();
  const ICON = `<i class="rs-i" style="--ic:url('${at("icons/resume.svg")}')" aria-hidden="true"></i>`;

  const FILM = { fintech: "Film 1", galactica: "Film 2", ad: "The ad" };
  const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const filmed = r => r.film && r.time > 1;
  const what = r => filmed(r) ? `${FILM[r.film] || "Film"} · ${clock(r.time)}` : r.deck === "full" ? `Extended · Slide ${r.n}` : `Slide ${r.n}${r.section ? " · " + r.section : ""}`;
  const href = r => {
    const q = filmed(r) ? "rt=" + Math.floor(r.time) : "", h = "#" + encodeURIComponent(r.id);
    return r.deck === "full" ? `${ROOT}full.html${q ? "?" + q : ""}${h}` : `${ROOT}?present=1${q ? "&" + q : ""}${h}`;
  };
  const saved = () => ["main", "full"].map(get).filter(Boolean).sort((a, b) => b.t - a.t);   // most recent first
  const snap = saved();   // where the viewer left off before this page loaded

  const css = document.createElement("style");
  css.textContent = `.rs-i{display:inline-block;flex:none;width:20px;height:20px;background:currentColor;-webkit-mask:var(--ic) center/contain no-repeat;mask:var(--ic) center/contain no-repeat}
.rs-go{gap:10px;max-width:100%}.rs-go .rs-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs-sub{display:flex;flex-wrap:wrap;gap:8px 24px;margin:16px 0 0;font-size:14px;line-height:18px;color:rgba(42,42,42,.6)}
.rs-sub a{color:inherit;text-decoration:none}.rs-sub a:hover{color:#2A2A2A;text-decoration:underline;text-underline-offset:3px}
.rs-row{margin:20px 0 0}.rs-row a{display:inline-flex;align-items:center;gap:8px;color:#2A2A2A;text-decoration:none;font-size:16px;line-height:1.3}
.rs-row a:hover{color:#005CFF}.rs-row .rs-i{width:18px;height:18px}
.rs-ret{display:inline-flex;align-items:center;gap:8px;box-sizing:border-box;height:40px;padding:0 14px;border-radius:12px;background:#EFF3FB;color:#2A2A2A;
font:400 15px/1 "Stack Sans Text",system-ui,sans-serif;letter-spacing:0;text-transform:none;text-decoration:none;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.rs-ret:hover{color:#005CFF}.rs-ret:focus-visible{outline:2px solid #005CFF;outline-offset:2px}.rs-ret .rs-i{width:18px;height:18px}.rs-ret .rs-rs{display:none}
.rs-dock{position:fixed;z-index:60;left:calc(clamp(16px,2.4vw,32px) + env(safe-area-inset-left));bottom:calc(20px + env(safe-area-inset-bottom));display:flex;gap:8px;align-items:center}
.rs-dock .rs-ret{height:42px;background:rgba(239,243,251,.94);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 1px 0 rgba(42,42,42,.06)}
.rs-dock .nav-back{position:static}
body.rs-docked{padding-bottom:calc(76px + env(safe-area-inset-bottom))}
.rs-kit-end{justify-self:end;display:inline-flex;align-items:center;gap:8px}.rs-ret-kit{height:var(--k-ctl-h,42px)}
@media (max-width:520px){.rs-ret-kit{padding:0 10px}.rs-ret-kit .rs-rl{display:none}.rs-ret-kit .rs-rs{display:inline}}
@media (max-width:700px){.rs-ret-bar{padding:0 10px}.rs-ret-bar .rs-rl{display:none}.rs-ret-bar .rs-rs{display:inline}.rs-dock{left:calc(16px + env(safe-area-inset-left));bottom:calc(16px + env(safe-area-inset-bottom))}}
@media (max-width:420px){.rs-ret-bar{width:44px;padding:0;justify-content:center}.rs-ret-bar .rs-rs{display:none}.rs-ret-bar .rs-i{width:20px;height:20px}}
@media (pointer:coarse){.rs-ret,.rs-dock .rs-ret{min-height:44px;height:44px}}
@media print{.rs-sub,.rs-row,.rs-ret,.rs-dock{display:none!important}}`;
  document.head.append(css);

  // ---------- deck: save, menu row, resume ----------
  const rel = location.pathname.slice(new URL(ROOT).pathname.length);
  const deck = /^(index\.html)?$/.test(rel) ? "main" : /^full(\.html)?$/.test(rel) ? "full" : null;
  let resuming = null;   // {s, time, until}: pause the film that the deck auto-starts, then seek it
  const D = window.Deck;
  if (store && deck && D) {
    const slides = D.slides, N = slides.length;
    const LABELS = Object.fromEntries((document.querySelector(".c-path")?.dataset.chapters || "").split(",").filter(Boolean).map(p => p.split(":").map(t => t.trim())));
    const section = s => { const c = s.dataset.chapter || ""; return LABELS[c] || (c ? c[0].toUpperCase() + c.slice(1).replace(/-/g, " ") : ""); };
    const title = s => s.dataset.title || s.querySelector("h1, h2, h3")?.textContent.trim() || "";
    const save = (i, extra) => { const s = slides[i]; if (i <= 0 || !s || !s.id) return; set(deck, Object.assign({ deck, id: s.id, title: title(s), section: section(s), n: i + 1, N, t: Date.now() }, extra)); };
    const isP = () => document.body.classList.contains("present");
    const filmOf = el => { const k = el && el.closest && el.closest(".kplayer[data-film]"), s = k && k.closest(".slide"); return s ? { k, s, i: slides.indexOf(s) } : null; };

    document.addEventListener("slide:in", e => {
      const s = e.target.closest ? e.target.closest(".slide") : null, i = slides.indexOf(s);
      if (i < 0 || (isP() && i !== D.cur)) return;
      const old = get(deck), k = s.querySelector(".kplayer[data-film]");
      save(i, old && old.id === s.id && k && old.film === k.dataset.film ? { film: old.film, time: old.time } : {});   // a film slide keeps its saved time until the film reports a new one
      syncRow();
    });
    // media events do not bubble; a capture listener on document still sees them, whenever player.js mounts its <video>
    const lastT = new WeakMap();
    document.addEventListener("timeupdate", e => {
      const f = filmOf(e.target), v = e.target; if (!f || f.i <= 0 || resuming) return;
      const now = Date.now(); if (now - (lastT.get(v) || 0) < 2000) return; lastT.set(v, now);
      if (v.currentTime > 1 && !v.ended) save(f.i, { film: f.k.dataset.film, time: Math.round(v.currentTime * 10) / 10 });
    }, true);
    document.addEventListener("ended", e => { const f = filmOf(e.target); if (f && f.i > 0) save(f.i, {}); }, true);
    document.addEventListener("play", e => {
      if (!resuming || Date.now() > resuming.until || !resuming.s.contains(e.target)) return;
      const v = e.target; v.pause(); v.muted = false; seek(v, resuming.time);   // the viewer chooses to play
    }, true);
    const endGuard = () => { resuming = null; };
    ["pointerdown", "keydown", "touchstart"].forEach(t => addEventListener(t, () => { if (resuming && Date.now() > resuming.armed + 300) endGuard(); }, true));
    const seek = (v, t) => { const go = () => { try { if (Math.abs(v.currentTime - t) > 0.5) v.currentTime = t; } catch (e) {} }; v.readyState >= 1 ? go() : v.addEventListener("loadedmetadata", go, { once: true }); };
    const arm = (id, time) => {
      const s = document.getElementById(id); if (!s || slides.indexOf(s) < 0 || !(time > 0)) return;
      resuming = { s, time, armed: Date.now(), until: Date.now() + 10000 };
      const v = s.querySelector(".kplayer[data-film] video");
      if (v) { if (!v.paused) { v.pause(); v.muted = false; } seek(v, time); }
    };

    // arriving from Continue: ?rt=<seconds>#<film slide>; the param is dropped so a reload does not seek again
    const q = new URLSearchParams(location.search), rt = parseFloat(q.get("rt"));
    if (!isNaN(rt)) {
      q.delete("rt"); const qs = q.toString();
      try { history.replaceState(history.state, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) {}
      ready(() => arm(decodeURIComponent(location.hash.slice(1)), rt));
    }

    // Menu: one quiet "Continue: …" row (the most recent save from before this page, unless it is where the deck is now)
    let row = null, used = false;
    const target = () => used ? null : snap.find(r => !(r.deck === deck && slides[D.cur] && slides[D.cur].id === r.id)) || null;
    function syncRow() {
      const menu = document.querySelector(".menu-ov .menu-in"); if (!menu) return;
      const r = target();
      if (!r) { if (row) row.hidden = true; return; }
      if (!row) {
        row = document.createElement("p"); row.className = "rs-row";
        const more = menu.querySelector(".menu-more"); more ? more.before(row) : menu.append(row);
        row.addEventListener("click", e => {
          const a = e.target.closest("a"), r = target(); if (!a || !r || r.deck !== deck) return;   // the other deck: a normal link
          const s = document.getElementById(r.id), i = slides.indexOf(s); if (i < 0) return;
          e.preventDefault(); used = true; row.hidden = true;
          const x = document.querySelector(".menu-ov:not([hidden]) .menu-x"); if (x) x.click();
          if (filmed(r)) arm(r.id, r.time);
          if (isP()) D.show(i); else { history.pushState({}, "", "#" + r.id); s.scrollIntoView({ block: "start" }); }
        });
      }
      row.hidden = false;
      row.innerHTML = `<a href="${esc(href(r))}">${ICON}<span>Continue: ${esc(what(r))}</span></a>`;
    }
    ready(syncRow); addEventListener("load", syncRow);
  }

  // ---------- hub: Continue becomes the primary button ----------
  function hub() {
    const cta = document.querySelector(".hub-cta"); if (!cta) return;
    const list = saved();
    cta.querySelectorAll(".rs-go").forEach(a => a.remove());
    const kept = document.querySelector("[data-rs-start]"); if (kept && !cta.contains(kept)) cta.prepend(kept);   // re-render: the start link comes back before its row goes
    cta.parentElement.querySelectorAll(".rs-sub").forEach(p => p.remove());
    const start = cta.querySelector("[data-rs-start]") || [...document.querySelectorAll("a[href]")].find(a => /[?&]present=1\b/.test(a.getAttribute("href")) && !a.classList.contains("rs-go"));
    if (start && start.dataset.rsStart === undefined) { start.dataset.rsStart = ""; start.dataset.rsHtml = start.innerHTML; start.dataset.rsClass = start.className; }
    if (!list.length) { if (start && start.dataset.rsHtml !== undefined) { start.innerHTML = start.dataset.rsHtml; start.className = start.dataset.rsClass; cta.prepend(start); } return; }
    const [r, other] = list;
    const go = document.createElement("a");
    go.className = "k-btn k-btn--dark hub-go1 rs-go"; go.href = href(r);
    go.innerHTML = `${ICON}<span class="rs-l">Continue · ${esc(what(r))}</span>`;
    go.title = r.title || "";
    cta.prepend(go);
    const sub = document.createElement("p"); sub.className = "rs-sub";
    if (start) { start.className = "rs-over"; start.textContent = "Start over"; sub.append(start); }
    if (other) { const a = document.createElement("a"); a.className = "rs-alt"; a.href = href(other); a.textContent = `Or continue: ${what(other)}`; sub.append(a); }
    if (sub.childElementCount) cta.after(sub);
  }
  ready(hub);
  addEventListener("pageshow", e => { if (e.persisted) hub(); });   // back from the deck (bfcache): show the newest position

  // ---------- #20/#21: "Return to main presentation" on every page that is not the main deck or the hub ----------
  const mainHref = () => { const r = get("main"); return r ? href(r) : ROOT + "?present=1"; };
  window.ResumeNav.mainHref = mainHref;
  ["pointerdown", "click", "focusin"].forEach(t => document.addEventListener(t, e => { const a = e.target.closest && e.target.closest("a[data-rs-main]"); if (a) a.href = mainHref(); }, true));   // the TOC's "Main presentation" link
  function ret() {
    if (deck === "main" || document.querySelector(".hub-cta, .rs-ret")) return;
    const a = document.createElement("a"); a.className = "rs-ret screen-only";
    a.innerHTML = `<i class="rs-i" style="--ic:url('${at("icons/return.svg")}')" aria-hidden="true"></i><span class="rs-rl">Return to main presentation</span><span class="rs-rs" aria-hidden="true">Main</span>`;
    const upd = () => { const r = get("main"); a.href = mainHref(); a.title = r ? `Return to main presentation · ${what(r)}` : "Return to main presentation"; a.setAttribute("aria-label", a.title); };
    upd(); ["pointerdown", "focus", "mouseenter"].forEach(t => a.addEventListener(t, upd)); addEventListener("pageshow", upd); addEventListener("storage", upd);
    const tools = document.querySelector(".topbar .tools");
    if (tools) { a.classList.add("rs-ret-bar"); tools.prepend(a); return; }   // decks: in the top bar, clear of the dock, the counter and ‹ Back
    const demo = document.querySelector(".k-header .k-pill");
    if (demo) { const end = document.createElement("span"); end.className = "rs-kit-end"; demo.before(end); end.append(a, demo); a.classList.add("rs-ret-kit"); return; }   // kit pages: sticky header, next to Demo (a fixed pill would cover film controls while scrolling)
    const dock = document.createElement("div"); dock.className = "rs-dock screen-only"; dock.append(a); document.body.append(dock); document.body.classList.add("rs-docked");
    const adopt = () => { const b = document.querySelector(".nav-back.nav-float"); if (b) { b.classList.remove("nav-float"); dock.prepend(b); } };   // a floating ‹ Back joins it
    adopt(); addEventListener("load", adopt);
  }
  ready(ret);
})();
