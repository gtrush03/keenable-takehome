/* iOS / mobile layer (ruling #15): viewport-fit, a dynamic-height fallback, edge swipes left to the iOS back gesture,
   and a dismissible "rotate" prompt for portrait phones. Safe to load on any page; does nothing it does not need to. */
(() => {
  if (window.IOSLayer) return;
  const html = document.documentElement;

  // viewport-fit=cover, so env(safe-area-inset-*) reports the notch and home indicator (the page's own meta should carry it too)
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ", viewport-fit=cover";

  // --app-h: the visible height, for browsers without dvh units (ios.css prefers 100dvh)
  const setH = () => html.style.setProperty("--app-h", window.innerHeight + "px");
  setH(); addEventListener("resize", setH, { passive: true }); addEventListener("orientationchange", () => setTimeout(setH, 250), { passive: true });

  // a swipe that starts within 24px of the left or right screen edge belongs to the iOS back/forward gesture, not to the deck:
  // its touchend never reaches the deck's swipe handler (shared/deck.js listens on window, after this capture listener). Taps pass.
  const EDGE = 24; let edge = false, sx = 0;
  addEventListener("touchstart", e => {
    const t = e.touches[0]; sx = t ? t.clientX : 0;
    edge = !!t && e.touches.length === 1 && (sx < EDGE || sx > window.innerWidth - EDGE);
  }, { capture: true, passive: true });
  addEventListener("touchend", e => {
    if (!edge) return; edge = false;
    const t = e.changedTouches[0];
    if (t && Math.abs(t.clientX - sx) > 30 && document.body && document.body.classList.contains("present")) e.stopPropagation();
  }, { capture: true, passive: true });

  // rotate prompt: portrait phones, on pages that play slides or films; never modal, remembered once dismissed
  const KEY = "keenable.rotate.dismissed";
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* private mode */ } } };
  const phonePortrait = matchMedia("(orientation: portrait) and (max-width: 600px) and (pointer: coarse)");
  const wants = () => html.dataset.rotate === "on" || (html.dataset.rotate !== "off" && !!document.querySelector("main > .slide, .kplayer, [data-film]"));
  let box = null, dismissed = !!store.get();
  const build = () => {
    box = document.createElement("div"); box.className = "ios-rot"; box.setAttribute("role", "status"); box.hidden = true;
    box.innerHTML =
      '<svg viewBox="0 0 40 40" aria-hidden="true">' +
        '<path class="ios-arc" d="M30.5 9.5a14 14 0 0 1 3.4 10.2" fill="none" stroke="#005CFF" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path class="ios-arc" d="M31.2 21.2l2.8-1.6 1.4 3" fill="none" stroke="#005CFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<g class="ios-ph"><rect x="13" y="6" width="14" height="28" rx="3.5" fill="#EFF3FB" stroke="#2A2A2A" stroke-width="1.6"/>' +
        '<rect x="17.5" y="8.6" width="5" height="1.6" rx=".8" fill="#2A2A2A"/><rect x="15.5" y="12" width="9" height="16" rx="1" fill="#005CFF" opacity=".9"/></g>' +
      "</svg>" +
      '<div class="ios-rot-t"><b>Rotate for the best experience</b><button type="button" class="ios-rot-go">Continue in portrait</button></div>' +
      '<button type="button" class="ios-rot-x" aria-label="Dismiss"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>';
    const close = () => { dismissed = true; store.set(); sync(); };
    box.querySelector(".ios-rot-go").addEventListener("click", close);
    box.querySelector(".ios-rot-x").addEventListener("click", close);
    ["touchstart", "touchend"].forEach(t => box.addEventListener(t, e => e.stopPropagation(), { passive: true }));   // not a slide swipe
    document.body.append(box);
  };
  const sync = () => {
    const show = !dismissed && phonePortrait.matches && wants();
    if (show && !box) build();
    if (!box) return;
    if (show) {
      // sit just under the page's top bar so Menu / Demo stay reachable
      const bar = document.querySelector(".topbar, .k-header-bar"), r = bar && bar.getBoundingClientRect();
      box.style.top = r && r.bottom > 0 && r.bottom < 160 ? Math.round(r.bottom + 8) + "px" : "";
      box.hidden = false; requestAnimationFrame(() => box.classList.add("in"));
    }
    else { box.classList.remove("in"); setTimeout(() => { if (!box.classList.contains("in")) box.hidden = true; }, 300); }
  };
  const start = () => { sync(); (phonePortrait.addEventListener ? phonePortrait.addEventListener("change", sync) : phonePortrait.addListener(sync)); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();

  window.IOSLayer = { sync, get dismissed() { return dismissed; } };
})();
