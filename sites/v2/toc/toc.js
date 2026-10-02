/* Contents overlay, "answers the brief" chips, orientation strip and Keenable marks for the v2 deck.
   Additive: load after shared/deck.js and v2.js. Reads toc/brief-map.json (optional). Open with T, the slide counter, or any [data-toc]. */
(() => {
  const SRC = (document.currentScript && document.currentScript.src) || location.href;
  const at = p => new URL(p, SRC).href;
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ready = fn => document.readyState === "loading" ? addEventListener("DOMContentLoaded", fn) : fn();
  // icons: nav/icons/<name>.svg as a currentColor mask (no emoji or glyph characters anywhere)
  const ic = (name, cls = "") => `<i class="tic ${cls}" style="--ic:url('${at("../nav/icons/" + name + ".svg")}')" aria-hidden="true"></i>`;
  // private notes never open from the TOC: v2.js PRIVATE plus research/li_*; a matching proof shows as plain text
  const PRIVATE = /research\/li_|li_network|li_outreach|data\/li\/|_g5|\/g5\/|candidacy|drafts\/|goals\/|chief|\.env|memory-sweep|review_|audit_/;

  ready(() => {
    const D = window.Deck, body = document.body;
    const slides = D ? D.slides : [...document.querySelectorAll("main > .slide")];
    const N = slides.length; if (!N) return;
    const cur = () => (D ? D.cur : 0);
    const isP = () => body.classList.contains("present");
    const LABELS = Object.assign({ fun: "For fun" }, Object.fromEntries((document.querySelector(".c-path")?.dataset.chapters || "").split(",").filter(Boolean).map(p => p.split(":").map(t => t.trim()))));
    const label = ch => LABELS[ch] || (ch ? ch[0].toUpperCase() + ch.slice(1) : "");
    const title = i => slides[i].dataset.title || slides[i].querySelector("h1, h2, h3")?.textContent.trim() || `Slide ${i + 1}`;

    // chapters = runs of the same data-chapter, in DOM order
    const chapters = []; slides.forEach((s, i) => { const ch = s.dataset.chapter || ""; const last = chapters[chapters.length - 1]; if (!last || last.ch !== ch) chapters.push({ ch, start: i, idx: [] }); chapters[chapters.length - 1].idx.push(i); });
    const openers = new Set([...chapters.map(c => c.start), ...slides.flatMap((s, i) => s.classList.contains("c-chapter") ? [i] : [])]);
    const chapOf = i => chapters.find(c => c.idx.includes(i));
    // numbering matches the deck counter, "n / N" (ruling #16: /v2/ is the flow only; everything else lives in full.html)
    const numRow = i => `${i + 1} / ${N}`;
    const FULL = at("../full.html");

    const jump = i => { close(); if (D && isP()) D.show(i); else slides[i].scrollIntoView({ behavior: "smooth", block: "start" }); };

    // ---------- brief map ----------
    let reqs = [];
    const toIdx = v => { if (typeof v === "number") return v - 1; const s = String(v).replace(/^#/, ""); if (/^\d+$/.test(s)) return +s - 1; const el = document.getElementById(s); const sl = el && el.closest("main > .slide"); return sl ? slides.indexOf(sl) : -1; };
    const norm = j => (Array.isArray(j) ? j : j.requirements || j.items || j.brief || []).map((r, k) => {
      const st = String(r.status ?? "").toLowerCase();
      const done = r.status === true || /^(done|yes|answered|complete|✅|ok|full)/.test(st) || st.includes("✅");
      const proof = (r.proof || r.proofs || r.links || []).map(p => typeof p === "string" ? { label: p.replace(/^https?:\/\//, "").split(/[?#]/)[0].slice(0, 40), href: p } : { label: p.label || p.title || p.name || p.href || p.url, href: p.href || p.url })
        .map(p => p.href && PRIVATE.test(p.href) ? { label: p.label, href: "" } : { ...p, href: p.href && !/^([a-z]+:|\/|#|\.)/i.test(p.href) ? at("../" + p.href) : p.href });   // brief-map hrefs (data/…, research/…) resolve from /v2/, like the deck's own source links
      const where = r.slides || r.slide_ids || r.where || [];
      const idx = [...new Set(where.map(toIdx).filter(i => i >= 0 && i < N))];   // map order: primary slide first
      const ext = where.filter(v => typeof v === "string" && !/^#?\d+$/.test(v) && toIdx(v) < 0).map(v => v.replace(/^#/, ""));   // cut from the flow → full.html#id
      return { id: String(r.id || r.key || "req" + (k + 1)).replace(/[^\w-]/g, "-"), title: r.title || r.requirement || r.label || r.name || `Requirement ${k + 1}`, req: r.req || r.requirement || r.question || r.title || "", group: r.group || "", short: r.short || r.chip || r.title || r.requirement || r.label, done, note: r.answer || r.note || r.where_text || "", proof, idx, ext };
    });
    const loadMap = () => fetch(at("brief-map.json"), { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => { reqs = norm(j); renderBrief(); renderChips(); document.dispatchEvent(new Event("toc:peek-refresh")); }).catch(() => {});

    // ---------- overlay ----------
    const ov = document.createElement("div"); ov.className = "toc-ov screen-only"; ov.hidden = true; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Contents"); ov.setAttribute("data-noswipe", "");
    ov.innerHTML = `<div class="toc-in"><div class="toc-top"><p class="toc-k">Contents</p><span class="toc-hint">${N} slides · T to open · Esc to close</span><button class="toc-x" type="button" aria-label="Close contents">Close ${ic("close")}</button></div><section class="toc-brief" hidden></section><ol class="toc-chs"></ol></div>`;
    const chOl = ov.querySelector(".toc-chs"), briefEl = ov.querySelector(".toc-brief");
    chapters.forEach((c, k) => {
      const li = document.createElement("li"); li.className = "toc-ch";
      li.innerHTML = `<div class="toc-chh"><i>${k + 1}</i><b>${esc(label(c.ch))}</b><span>${c.idx.length} slide${c.idx.length > 1 ? "s" : ""}</span></div><ol class="toc-rows">${c.idx.map(i => `<li><button type="button" data-i="${i}"><span class="toc-n">${numRow(i)}</span><span class="toc-t">${esc(title(i))}</span></button></li>`).join("")}</ol>`;
      chOl.append(li);
    });
    const rows = [...ov.querySelectorAll("[data-i]")];
    // ruling #9: one quiet row per requirement — requirement → our answer → proof → slide n (main flow first)
    function renderBrief() {
      if (!reqs.length) { briefEl.hidden = true; return; }
      briefEl.hidden = false;
      briefEl.innerHTML = `<p class="toc-bh">The brief ${ic("arrow-right", "tic-blue")} where it’s answered</p>
        <div class="toc-bt" role="table" aria-label="The brief, where it is answered"><div class="toc-btr toc-bthead" role="row"><span role="columnheader">Requirement</span><span role="columnheader">Our answer</span><span role="columnheader">Proof</span><span role="columnheader">Slide</span></div>
        ${reqs.map((r, k) => { const m = r.idx[0], x = r.ext[0], g = r.group && r.group !== (reqs[k - 1] || {}).group ? `<div class="toc-btg" role="row"><span role="cell">${esc(r.group)}</span></div>` : ""; return `${g}<div id="toc-req-${r.id}" class="toc-btr toc-req" role="row"${m !== undefined ? ` data-row-i="${m}"` : ""}>
          <span class="toc-bq" role="cell">${esc(r.req || r.title)}</span>
          <span class="toc-ba" role="cell">${esc(r.note || r.title)}${r.done ? "" : ` <em class="toc-partly">partly</em>`}</span>
          <span class="toc-bp" role="cell">${r.proof.filter(p => p.label || p.href).map(p => p.href ? `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.label)} ${ic("arrow-up-right")}</a>` : `<span class="toc-bpx">${esc(p.label)}</span>`).join("") || "—"}</span>
          <span class="toc-bs" role="cell">${m !== undefined ? `<button type="button" data-i="${m}" title="${esc(numRow(m))} · ${esc(title(m))}">slide ${m + 1}</button>` : x ? `<a class="toc-bx" href="${FULL}#${encodeURIComponent(x)}" data-x="${esc(x)}" title="Extended version">Ext.</a>` : "—"}</span></div>`; }).join("")}</div>`;
    }
    // (a) the frozen 102-slide deck: "Extended version →" plus its chapter list, read from full.html
    const extEl = document.createElement("section"); extEl.className = "toc-ext";
    const FALLBACK = [["opening", "hero"], ["fintech", "film-fintech"], ["bridge", "two-buyers"], ["galactica", "film-galactica"], ["findings", "findings"], ["fun", "film-ad"], ["sell", "proof-ch"], ["why", "why"], ["ask", "ask-found"], ["sources", "sources"]];
    const renderExt = (list, labels) => {
      // #21: "Original 25" sits next to "Extended version"; on original25.html itself that slot returns to the main presentation instead
      const o25 = /original25(\.html)?$/.test(location.pathname);
      const second = o25 ? `<a class="toc-ext-h" data-rs-main href="${at("../")}?present=1">Main presentation ${ic("arrow-right", "tic-blue")}</a>` : `<a class="toc-ext-h" href="${at("../original25.html")}">Original 25 ${ic("arrow-right", "tic-blue")}</a>`;
      extEl.innerHTML = `<p class="toc-ext-hs"><a class="toc-ext-h" href="${FULL}">Extended version ${ic("arrow-right", "tic-blue")}</a>${second}</p><p class="toc-ext-sub">Extended: the full ${list.n || 102}-slide deck, frozen. Original 25: the 25-slide original. Every chapter of the extended version:</p><ol class="toc-ext-ch">${list.map(([ch, id], k) => `<li><a href="${FULL}#${encodeURIComponent(id)}" data-ch="${esc(ch)}"><i>${k + 1}</i>${esc(labels[ch] || label(ch))}</a></li>`).join("")}</ol>`;
    };
    renderExt(FALLBACK, {});
    fetch(FULL, { cache: "no-store" }).then(r => r.ok ? r.text() : Promise.reject()).then(html => {
      const doc = new DOMParser().parseFromString(html, "text/html"), seen = new Set(), list = [];
      doc.querySelectorAll("main > .slide[id]").forEach(sl => { const ch = sl.dataset.chapter || ""; if (!seen.has(ch)) { seen.add(ch); list.push([ch, sl.id]); } });
      list.n = doc.querySelectorAll("main > .slide").length;
      const labels = Object.assign({ fun: "For fun" }, Object.fromEntries((doc.querySelector(".c-path")?.dataset.chapters || "").split(",").filter(Boolean).map(x => x.split(":").map(t => t.trim()))));
      if (list.length) { renderExt(list, labels); document.dispatchEvent(new Event("toc:peek-refresh")); }
    }).catch(() => {});
    // Datasets & code (rulings #12/#13): from dl/downloads.json, above "Extended version"
    const dlEl = document.createElement("section"); dlEl.className = "toc-dl"; dlEl.hidden = true;
    const fmtB = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B";
    const CLOUD = window.IS_CLOUD ?? !/^(127\.|localhost$|\[::1\]$|$)/.test(location.hostname);
    fetch(at("../dl/downloads.json"), { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      const grp = id => ((j.groups || []).find(x => x.id === id) || {}).items || [];
      const ds = grp("datasets"), code = grp("code");
      const row = it => {
        const href = CLOUD ? (it.href_cloud ?? it.href_local) : (it.href_local ?? it.href_cloud), fn = (CLOUD && it.filename_cloud) || it.filename || "";
        const bytes = CLOUD && it.bytes_cloud ? it.bytes_cloud : it.bytes, ok = href && !PRIVATE.test(href);
        const meta = [it.format, bytes ? fmtB(bytes) : "", it.rows ? (+it.rows).toLocaleString("en-US") + " rows" : "", it.label_kind].filter(Boolean).join(" · ");
        return `<li class="toc-dlr">${ic(it.icon || "dataset", "tic-lg")}<span class="toc-dll"><b>${esc(it.label)}</b><span>${esc(it.what || "")}</span></span><span class="toc-dlm">${esc(meta)}</span>` +
          (ok ? `<a class="toc-dla" href="${esc(at("../" + href))}" download="${esc(fn)}" aria-label="Download ${esc(it.label)}" title="Download">${ic("download")}</a>` : `<span class="toc-dla"></span>`) + `</li>`;
      };
      const codeRow = it => {
        const pub = window.REPO_PUBLIC === true && !!window.REPO_URL;
        return `<li class="toc-dlr">${ic(pub ? (it.icon_public || "github") : (it.icon || "code"), "tic-lg")}<span class="toc-dll"><b>${esc(it.label || "Code")}</b><span>${esc(it.what || "")}</span></span>` +
          (pub ? `<span class="toc-dlm">${esc(it.format || "GitHub")}</span><a class="toc-dla" href="${esc(window.REPO_URL)}" target="_blank" rel="noopener" aria-label="Open the code" title="Open">${ic("arrow-up-right")}</a>`
               : `<span class="toc-dlm toc-dlp">${esc((it.repo && it.repo.private_text) || "Code · private, available on request")}</span><span class="toc-dla"></span>`) + `</li>`;
      };
      dlEl.innerHTML = `<p class="toc-bh">Datasets &amp; code</p><ol class="toc-dlt">${ds.map(row).join("")}${code.map(codeRow).join("")}</ol>`;
      dlEl.hidden = !(ds.length || code.length);
    }).catch(() => {});
    ov.querySelector(".toc-in").append(dlEl, extEl);
    body.append(ov);
    ov.addEventListener("click", e => { if (e.target.closest("a")) return; const b = e.target.closest("[data-i], [data-row-i]"); if (b) { jump(+(b.dataset.i ?? b.dataset.rowI)); return; } if (e.target.closest(".toc-x") || e.target === ov) close(); });

    const isOpen = () => !ov.hidden;
    function open(reqId) {
      if (!isOpen()) { window.DeckOverview?.close?.(); document.querySelector(".menu-ov:not([hidden]) .menu-x")?.click(); }
      ov.hidden = false; body.classList.add("toc-open", "menu-open");   // menu-open: v2.js stops keys, wheel and swipe behind us
      loadMap();   // keen-research may still be adding rows
      rows.forEach(b => b.classList.toggle("on", +b.dataset.i === cur()));
      const target = reqId ? ov.querySelector(`#toc-req-${CSS.escape(reqId)}`) : rows.find(b => +b.dataset.i === cur() && b.closest(".toc-rows"));
      requestAnimationFrame(() => { if (target) { target.scrollIntoView({ block: reqId ? "start" : "center" }); if (reqId) { target.classList.remove("flash"); void target.offsetWidth; target.classList.add("flash"); } } ov.querySelector(".toc-x").focus({ preventScroll: true }); });
    }
    function close() { if (!isOpen()) return; ov.hidden = true; body.classList.remove("toc-open"); if (!document.querySelector(".menu-ov:not([hidden])")) body.classList.remove("menu-open"); }
    window.DeckTOC = { open, close, get isOpen() { return isOpen(); } };

    // Peek (nav/peek.js, ruling #10): hover or long-press any row, chapter or brief link for a preview
    const peekAll = () => {
      const P = window.Peek; if (!P) return;
      rows.forEach(b => P.attach(b, { deck: "main", id: slides[+b.dataset.i].id }));
      ov.querySelectorAll(".toc-ch").forEach((li, k) => { const h = li.querySelector(".toc-chh"); P.attach(h, { deck: "main", ids: chapters[k].idx.map(i => slides[i].id), title: label(chapters[k].ch), go: () => jump(chapters[k].start) }); });
      briefEl.querySelectorAll(".toc-bs [data-i]").forEach(b => P.attach(b, { deck: "main", id: slides[+b.dataset.i].id }));
      briefEl.querySelectorAll(".toc-bs [data-x]").forEach(a => P.attach(a, { deck: "full", id: a.dataset.x }));
      extEl.querySelectorAll(".toc-ext-ch a").forEach(a => { const ch = a.dataset.ch; if (ch) P.attach(a, { deck: "full", chapter: ch, title: a.textContent.replace(/^\d+/, "") }); });
    };
    window.Peek ? peekAll() : document.addEventListener("peek:ready", peekAll, { once: true });
    document.addEventListener("toc:peek-refresh", peekAll);

    addEventListener("keydown", e => {
      if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && document.querySelector(".peek:not([hidden])")) { window.Peek?.hide(); if (isOpen()) close(); e.preventDefault(); e.stopImmediatePropagation(); return; }   // one Esc closes a hover preview and Contents together
      if (isOpen()) {
        if (e.key === "Escape" || e.key === "t" || e.key === "T") { close(); e.preventDefault(); e.stopImmediatePropagation(); }
        else if (["ArrowRight", "ArrowLeft", "PageDown", "PageUp", "Home", "End", "p", "P", "o", "O"].includes(e.key)) e.stopImmediatePropagation();   // the deck stays put behind the list
        return;
      }
      if ((e.key === "t" || e.key === "T") && !body.classList.contains("menu-open")) { open(); e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    document.addEventListener("toc:open", e => { e.preventDefault(); open(e.detail && e.detail.id); });   // site-elevate's counter + Menu → Contents
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-toc], .sc-n"); if (!t || ov.contains(t)) return;
      e.preventDefault(); open(t.dataset.toc || undefined);
    });

    // "Contents" inside the Menu (skipped if the page already has its own [data-toc] there)
    const more = document.querySelector(".menu-ov .menu-more");
    if (more && !document.querySelector(".menu-ov [data-toc]")) { const a = document.createElement("a"); a.href = "#contents"; a.dataset.toc = ""; a.textContent = "Contents"; more.prepend(a); }

    // ---------- fixed layer: brief chips, orientation strip, marks ----------
    const layer = document.createElement("div"); layer.className = "toc-layer screen-only"; layer.setAttribute("aria-hidden", "false");
    layer.innerHTML = `<p class="toc-chips toc-cap"></p><p class="toc-orient" aria-live="polite"></p><img class="toc-eyes" alt="" src="${at("../kit/assets/logo-e-outline.png")}"><img class="toc-wm" alt="Keenable" src="${at("../kit/assets/keenable-wordmark-ink.svg")}">`;
    body.append(layer);
    const chipsEl = layer.querySelector(".toc-chips"), orient = layer.querySelector(".toc-orient"), eyes = layer.querySelector(".toc-eyes"), wm = layer.querySelector(".toc-wm");
    const WM = { ink: at("../kit/assets/keenable-wordmark-ink.svg"), white: at("../kit/assets/keenable-wordmark-white.svg") };
    function renderChips() {
      const i = cur(), mine = reqs.filter(r => r.idx.includes(i));
      const r = mine[0];
      chipsEl.innerHTML = r ? `<span class="toc-cap-k">Brief</span> · ${esc(r.short)} ${r.done ? "" : "(partly) "}— <a href="#contents" class="toc-cap-p" data-toc="${esc(r.id)}">proof ${ic("arrow-up-right")}</a>${mine.length > 1 ? ` <a href="#contents" class="toc-cap-more" data-toc="${esc(mine[1].id)}">+${mine.length - 1}</a>` : ""}` : "";

    }
    // dark if the slide's own (or first opaque ancestor's) background is dark
    const isDark = el => { for (let e = el; e; e = e.parentElement) { const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g); if (m && (m[3] === undefined || +m[3] > 0.5)) return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) < 110; } return false; };
    // marks never sit on slide content: each part tries its spots in order and hides if every spot touches visible text, an image or a control.
    // Full-bleed background media (over half the screen) does not count.
    const boxes = slide => [...slide.querySelectorAll("*")].filter(el => {
      if (!([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || /^(IMG|svg|VIDEO|CANVAS|BUTTON|INPUT|IFRAME)$/.test(el.tagName))) return false;
      const cs = getComputedStyle(el); if (cs.visibility === "hidden" || +cs.opacity === 0 || cs.display === "none") return false;
      const r = el.getBoundingClientRect(); return r.width && r.height && r.width * r.height < innerWidth * innerHeight * 0.5;
    }).map(el => el.getBoundingClientRect());
    const touches = (el, bx, pad = 6) => { const a = el.getBoundingClientRect(); return a.width > 0 && bx.some(r => a.left - pad < r.right && a.right + pad > r.left && a.top - pad < r.bottom && a.bottom + pad > r.top); };
    const G = () => (innerWidth <= 700 ? 16 : Math.min(32, Math.max(16, innerWidth * 0.024))), BAR = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 60;
    const SPOTS = {
      chips: () => [{ left: G(), bottom: innerWidth <= 700 ? 36 : 44 }, { left: G(), top: BAR() + 10 }, { right: G(), top: BAR() + 10 }],
      orient: () => [{ left: G(), bottom: innerWidth <= 700 ? 16 : 22 }, { left: G(), top: BAR() + 10 }],
      wm: () => [{ right: G(), bottom: 31 }, { right: G(), top: BAR() + 14 }],
      eyes: () => [{ right: G(), top: BAR() + (innerWidth <= 700 ? 12 : 20) }],
    };
    const put = (el, spot) => ["top", "bottom", "left", "right"].forEach(k => el.style[k] = spot[k] === undefined ? "auto" : spot[k] + "px");
    const placeAll = slide => {
      const bx = boxes(slide), parts = { chips: chipsEl, orient, wm, eyes };
      for (const [k, el] of Object.entries(parts)) {
        el.classList.remove("toc-off");
        if (getComputedStyle(el).display === "none" || (k === "chips" && !chipsEl.textContent.trim())) continue;
        const ok = SPOTS[k]().find(sp => { put(el, sp); return !touches(el, bx); });
        if (!ok) el.classList.add("toc-off");
      }
    };
    let last = -1, collT = 0;
    const update = () => {
      const i = cur(); if (i === last) return; last = i;
      const c = chapOf(i), s = slides[i];
      const nx = i + 1 < N ? `Next: ${title(i + 1)}` : "End";
      orient.innerHTML = `<b>${esc(label(c.ch))}</b> · <span class="toc-of">${numRow(i)}</span> · <span class="toc-nx">${esc(nx)}</span>`;
      const dark = s.classList.contains("dark") || s.classList.contains("film") || isDark(s);
      layer.classList.toggle("on-dark", dark); wm.src = dark ? WM.white : WM.ink;
      layer.classList.toggle("opener", openers.has(i) && !s.classList.contains("film"));
      renderChips();
      clearTimeout(collT); placeAll(s); collT = setTimeout(() => placeAll(s), 560);   // again after the slide's enter transition
      if (isOpen()) rows.forEach(b => b.classList.toggle("on", +b.dataset.i === i));
    };
    let raf = 0; const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    document.addEventListener("slide:in", soon); addEventListener("hashchange", soon); addEventListener("scroll", soon, { passive: true });
    update(); loadMap();
  });
})();
