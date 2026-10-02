/* A real Back (ruling #10). Load after shared/deck.js (and v2.js); no change to deck.js is needed.
   - Jumps push a history entry: Deck.show(i) more than one slide away, called from outside the deck (TOC, Menu, overview, path bar, Peek, dock, map)
     and in-slide #links. Steps keep replacing: ←/→, swipe, wheel and ‹ › go through Deck.go, which deck.js handles with replaceState.
   - popstate → Deck.show(hash), so Back returns to exactly the slide you jumped from; across pages the browser's own Back works.
   - A quiet "‹ Back" sits left of the slide counter; hidden when there is nothing to go back to. With no history it goes to the hub. */
(() => {
  const SRC = (document.currentScript && document.currentScript.src) || location.href;
  const HUB = new URL("../hub/", SRC).href;
  const D = window.Deck;
  const st = () => history.state || {};
  let depth = st().navK || 0, restoring = false;

  // keep our state across deck.js's replaceState(null, …) on every step, and count everyone's pushes
  // (full/dock.js pushes {deck, id} itself), so Back knows there is somewhere to go
  const rs = history.replaceState.bind(history), ps = history.pushState.bind(history);
  history.replaceState = (s, t, u) => rs(s == null ? history.state : Object.assign({}, s, { navK: depth }), t, u);
  history.pushState = (s, t, u) => { depth += 1; ps(Object.assign({}, s || {}, { navK: depth }), t, u); update(); };
  if (history.state == null) rs({ navK: 0 }, ""); else if (history.state.navK == null) rs(Object.assign({}, history.state, { navK: 0 }), "");

  const sameSiteRef = () => { try { const r = new URL(document.referrer); return r.origin === location.origin && r.pathname !== location.pathname; } catch (e) { return false; } };
  const canBack = () => depth > 0 || sameSiteRef();
  const push = id => { if (decodeURIComponent(location.hash.slice(1)) === id) return; history.pushState({}, "", "#" + id); };   // already pushed by the caller (dock) → no second entry

  if (D) {
    const N = D.slides.length, orig = D.show;
    const idx = i => Math.max(0, Math.min(N - 1, i));
    D.show = function (i) {
      const j = idx(i);
      // ±1 is a step wherever it comes from (the film slides step with Deck.show(cur ± 1)); anything further is a jump
      if (!restoring && Math.abs(j - D.cur) > 1 && D.slides[j] && D.slides[j].id) push(D.slides[j].id);
      return orig.call(this, i);
    };
    // in-slide links (#id) are jumps too: push before deck.js shows the slide
    document.addEventListener("click", e => {
      const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || e.defaultPrevented || !document.body.classList.contains("present")) return;
      const el = document.getElementById(a.getAttribute("href").slice(1)); const sl = el && el.closest("main > .slide"); const j = D.slides.indexOf(sl);
      if (j >= 0 && j !== D.cur) push(sl.id);
    }, true);
    addEventListener("popstate", e => {
      depth = (e.state && e.state.navK) || 0;
      window.DeckTOC?.close?.(); window.DeckOverview?.isOpen && window.DeckOverview.close(); window.Peek?.hide?.();
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1))); const sl = el && el.closest("main > .slide"); const j = D.slides.indexOf(sl);
      if (j >= 0 && j !== D.cur) { restoring = true; try { if (document.body.classList.contains("present")) orig(j); else sl.scrollIntoView({ block: "start" }); } finally { restoring = false; } }
      update();
    });
  }

  // ‹ Back control, left of the counter (inside v2's .sc when present, else floating bottom-left)
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "nav-back screen-only"; btn.setAttribute("aria-label", "Back to where you came from"); btn.title = "Back (where you came from)";
  btn.innerHTML = `<i class="nb-i" aria-hidden="true" style="--ic:url('${new URL("icons/chevron-left.svg", SRC).href}')"></i><span class="nb-l">Back</span>`;
  btn.addEventListener("click", () => { if (depth > 0 || (sameSiteRef() && history.length > 1)) history.back(); else location.href = sameSiteRef() ? document.referrer : HUB; });
  function update() { if (btn) btn.hidden = !canBack(); }
  const mount = () => { const sc = document.querySelector(".sc"); if (sc) sc.prepend(btn); else if (D) { btn.classList.add("nav-float"); document.body.append(btn); } update(); };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", mount) : mount();
  addEventListener("pageshow", update);
  window.NavBack = { get depth() { return depth; }, back: () => btn.click(), update };
})();
