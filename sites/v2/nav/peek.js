/* Peek (ruling #10): preview a slide or a section without leaving. Hover ~250 ms (desktop) or long-press ~450 ms (touch)
   on any attached element shows a floating card; tapping the card goes there; moving away or Esc closes it.
   Thumbnails are pre-rendered by nav/thumbs.mjs into nav/thumbs/<deck>/<id>.webp with nav/thumbs/thumbs.json.
   API: Peek.attach(el, { deck: "main" | "full", ids: [...] | id: "…" | chapter: "…", title, go, place }) — go() runs on card tap (default: el.click()); place: "above" keeps the card above the item (for a bottom dock). */
(() => {
  if (window.Peek) return;
  const SRC = (document.currentScript && document.currentScript.src) || location.href;
  const at = p => new URL(p, SRC).href;
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let M = null; const ready = fetch(at("thumbs/thumbs.json"), { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null).then(j => (M = j));
  const HOVER = 250, PRESS = 450, MAX = 4;

  const card = document.createElement("div"); card.className = "peek"; card.hidden = true; card.setAttribute("role", "tooltip"); card.setAttribute("data-noswipe", "");
  let cur = null, tHover = 0, tOut = 0, tPress = 0, pressXY = null, pressed = false;
  const mount = () => { if (!card.isConnected) document.body.append(card); };

  const resolve = o => {
    const d = M && M.decks && M.decks[o.deck || "main"];
    let ids = o.ids || (o.id ? [o.id] : []);
    if (o.chapter && d) ids = (d.chapters.find(c => c.ch === o.chapter) || {}).ids || ids;
    const meta = id => (d && d.slides[id]) || {};
    const ch = o.chapter && d ? d.chapters.find(c => c.ch === o.chapter) : null;
    return { deck: o.deck || "main", ids, meta, title: o.title || (ids.length > 1 ? (ch && ch.label) : meta(ids[0]).t) || "", section: ids.length > 1 };
  };
  function render(o) {
    const r = resolve(o), shown = r.ids.slice(0, r.section ? MAX : 1);
    const img = id => `<img src="${at(`thumbs/${r.deck}/${encodeURIComponent(id)}.webp`)}" alt="" width="400" height="250" decoding="async" onerror="this.classList.add('peek-miss')">`;
    card.className = "peek" + (r.section ? " peek-sec" : "");
    card.innerHTML = `<div class="peek-strip">${shown.map(img).join("")}</div><p class="peek-t">${esc(r.title)}</p>` +
      (r.section ? `<p class="peek-s">${r.ids.length} slide${r.ids.length > 1 ? "s" : ""}${r.deck === "full" ? " · Extended version" : ""}</p>`
                 : (r.deck === "full" ? `<p class="peek-s">Extended version</p>` : ""));
  }
  function place(el) {
    const a = el.getBoundingClientRect(), W = innerWidth, H = innerHeight, g = 12, side = W > 700 && (el._peek || {}).place !== "above";   // place:"above" (a bottom dock): never beside the item
    card.style.left = card.style.top = "0px"; const c = card.getBoundingClientRect();
    let x, y;
    if (side && a.right + g + c.width <= W - 8) { x = a.right + g; y = a.top + a.height / 2 - c.height / 2; }        // right of the item
    else if (side && a.left - g - c.width >= 8) { x = a.left - g - c.width; y = a.top + a.height / 2 - c.height / 2; }  // left
    else { x = a.left + a.width / 2 - c.width / 2; y = a.top - g - c.height; if (y < 8) y = a.bottom + g; }            // above, else below
    card.style.left = Math.round(Math.max(8, Math.min(W - c.width - 8, x))) + "px";
    card.style.top = Math.round(Math.max(8, Math.min(H - c.height - 8, y))) + "px";
  }
  async function show(el) {
    const o = el._peek; if (!o) return; await ready; mount(); render(o); card.hidden = false; cur = el; place(el);
    requestAnimationFrame(() => card.classList.add("on"));
  }
  function hide() { clearTimeout(tHover); clearTimeout(tPress); if (card.hidden) return; card.classList.remove("on"); card.hidden = true; cur = null; }
  const go = () => { const el = cur; hide(); pressed = false; if (!el) return; el._peek.go ? el._peek.go() : el.click(); };

  function attach(el, o = {}) {
    if (!el) return; const first = !el._peek; el._peek = o; if (!first) return;
    el.classList.add("peek-on");
    el.addEventListener("mouseenter", e => { if (e.pointerType === "touch" || matchMedia("(hover: none)").matches) return; clearTimeout(tOut); clearTimeout(tHover); tHover = setTimeout(() => show(el), HOVER); });
    el.addEventListener("mouseleave", () => { clearTimeout(tHover); tOut = setTimeout(() => { if (!card.matches(":hover")) hide(); }, 140); });
    el.addEventListener("focus", () => { if (el.matches(":focus-visible")) { clearTimeout(tHover); tHover = setTimeout(() => show(el), HOVER * 2); } });
    el.addEventListener("blur", () => { if (cur === el) setTimeout(() => { if (!card.contains(document.activeElement)) hide(); }, 0); });
    el.addEventListener("touchstart", e => { pressed = false; const t = e.touches[0]; pressXY = [t.clientX, t.clientY]; clearTimeout(tPress); tPress = setTimeout(() => { pressed = true; show(el); if (navigator.vibrate) navigator.vibrate(8); }, PRESS); }, { passive: true });
    el.addEventListener("touchmove", e => { const t = e.touches[0]; if (pressXY && Math.hypot(t.clientX - pressXY[0], t.clientY - pressXY[1]) > 10) clearTimeout(tPress); }, { passive: true });
    el.addEventListener("touchend", e => { clearTimeout(tPress); if (pressed) e.preventDefault(); }, { passive: false });   // a long-press only previews
    el.addEventListener("click", e => { if (pressed) { pressed = false; e.preventDefault(); e.stopImmediatePropagation(); } else hide(); }, true);
    el.addEventListener("contextmenu", e => { if (pressed || tPress) e.preventDefault(); });
  }
  card.addEventListener("mouseenter", () => clearTimeout(tOut));
  card.addEventListener("mouseleave", () => { tOut = setTimeout(hide, 140); });
  card.addEventListener("click", e => { e.preventDefault(); go(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !card.hidden) { const inToc = cur && cur.closest(".toc-ov"); hide(); if (inToc && window.DeckTOC) DeckTOC.close(); e.preventDefault(); e.stopImmediatePropagation(); }   /* one Esc closes a preview and the Contents it came from */ else if (e.key === "Enter" && !card.hidden && document.activeElement === cur) { /* Enter on the item navigates as usual */ hide(); } }, true);
  document.addEventListener("touchstart", e => { if (!card.hidden && !card.contains(e.target) && e.target !== cur && !(cur && cur.contains(e.target))) hide(); }, { passive: true });
  addEventListener("scroll", () => { if (!card.hidden && cur) place(cur); }, { passive: true, capture: true });
  addEventListener("resize", hide);
  document.addEventListener("slide:in", hide);

  window.Peek = { attach, show, hide, ready, get manifest() { return M; } };
  document.dispatchEvent(new CustomEvent("peek:ready"));
})();
