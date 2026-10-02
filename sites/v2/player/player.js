/* KPlayer: Keenable film player, no dependencies.
   KPlayer.mount(el, {src, poster, title, chapters, autoplayMuted, loop, eyebrow, fill})  -> player
     chapters: [{t, label}] or a key of media/chapters.json ("fintech" | "galactica")
   KPlayer.hero(el, {loopSrc, poster, eyebrow, title, sub, films: [{label, src, poster, title, chapters}]})  -> muted loop + "Watch the film"
     loopSrc: false → no background video at all (nothing is downloaded)
   KPlayer.open({src, poster, title, chapters})  -> the full film in an overlay; Esc or Close returns to the page
   src may be an HLS playlist (.m3u8): native where the browser plays HLS (Safari, iOS), else hls.js 1.6.13 (cdnjs, SRI-pinned; the copy
   next to this file if the CDN fails). Cloud build: set window.MEDIA_BASE = "media/hls/" (relative to the site root) before this script. KPlayer.media then points
   there, and a film's <name>.mp4 plays MEDIA_BASE + <name>/master.m3u8. Locally (no MEDIA_BASE) the MP4s play as before.
   Progressive fallback: window.MEDIA_BASE = "media/web/"; window.MEDIA_MODE = "mp4"; → plays MEDIA_BASE + <name>.mp4 as a plain MP4.
   Keys (when the player has focus or is in the overlay): Space / K play-pause, J / L back / forward 10 s, F full screen, M mute, C chapters.
   Shift + > / Shift + < (anywhere on the page): speed up / down.
   ← / → are never taken by the player: they belong to the slide deck (in full screen they also leave full screen so the next slide shows).
   opts.nav = { prev: fn, next: fn, prevLabel, nextLabel }: ‹ › slide buttons on the player's edges, shown with the controls (and in full screen).
   Speed (1.5): the bar's speed control cycles 1× → 1.5× → 2×. One choice for every film on the page, kept in localStorage, pitch preserved.
   Press and hold the picture (mouse or finger, 300 ms) = 2× while held, with a "2×" chip at the top; a quick tap still plays / pauses.
   iOS: inline playback, native full screen through webkitEnterFullscreen, 44 px tap targets, controls stay up after a tap. */
(function () {
  "use strict";
  const SCRIPT = document.currentScript && document.currentScript.src;
  // relative MEDIA_BASE resolves against the site root (the folder above player/), so pages in subfolders (films/) share one config
  const MEDIA_BASE = window.MEDIA_BASE ? new URL(window.MEDIA_BASE, SCRIPT ? new URL("../", SCRIPT) : document.baseURI).href : "";
  const MEDIA_HLS = !!MEDIA_BASE && String(window.MEDIA_MODE || "hls").toLowerCase() !== "mp4";
  const BASE = MEDIA_BASE || (SCRIPT ? new URL("../media/", SCRIPT).href : "media/");
  const HLS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.6.13/hls.light.min.js";
  const HLS_SRI = "sha384-6zVopFZ6MnadnshQ07Vs8phFH+j+4/Ug+8qEZUIrwOiEv3+rW6ndNweevq1hUH93";
  const EASE_IDLE_MS = 2000;
  const players = new Set();
  let chaptersCache = null;
  let hlsLib = null;

  // playback speed (ruling #14): one choice for every film on the page; it survives film changes, chapter seeks, slide changes and full screen
  const SPEEDS = [1, 1.5, 2], SPEED_KEY = "kp.speed";
  let speed = 1;
  try { const s = parseFloat(localStorage.getItem(SPEED_KEY)); if (SPEEDS.includes(s)) speed = s; } catch (e) { /* storage blocked: 1× */ }
  const fmtSpeed = (s) => s + "×";
  function setSpeed(s) {
    if (!SPEEDS.includes(s)) return;
    speed = s;
    try { localStorage.setItem(SPEED_KEY, String(s)); } catch (e) { /* storage blocked: this page only */ }
    players.forEach((p) => p._speed(true));
  }
  const stepSpeed = (d) => setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + d))]);
  // Shift + > / Shift + < (YouTube's keys); the deck uses neither
  window.addEventListener("keydown", (e) => {
    if ((e.key !== ">" && e.key !== "<") || e.metaKey || e.ctrlKey || e.altKey || !players.size) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    stepSpeed(e.key === ">" ? 1 : -1);
    e.preventDefault();
  });

  const loadScript = (url, sri) => new Promise((res) => {
    const s = document.createElement("script");
    s.src = url; if (sri) { s.integrity = sri; s.crossOrigin = "anonymous"; }
    s.onload = () => res(window.Hls || null); s.onerror = () => res(null);
    document.head.appendChild(s);
  });
  // .m3u8 → native HLS when the browser has it, else hls.js (loaded once, on first use); anything else → plain src.
  // With MEDIA_BASE, a film's <name>.mp4 becomes MEDIA_BASE/<name>/master.m3u8.
  function setSrc(v, src) {
    const mp4 = MEDIA_BASE && /([^/?#]+)\.mp4([?#].*)?$/i.exec(src || "");
    if (mp4) src = MEDIA_BASE + mp4[1] + (MEDIA_HLS ? "/master.m3u8" : ".mp4");
    if (!/\.m3u8(\?|#|$)/i.test(src || "") || v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; return null; }
    const ref = { hls: null, dead: false, wantPlay: false };
    if (!hlsLib) hlsLib = loadScript(HLS_CDN, HLS_SRI).then((H) => H || loadScript(SCRIPT ? new URL("hls.light.min.js", SCRIPT).href : "player/hls.light.min.js"));
    hlsLib.then((Hls) => {
      if (ref.dead) return;
      if (!Hls || !Hls.isSupported()) { v.src = src; if (ref.wantPlay) v.play().catch(() => {}); return; }
      ref.hls = new Hls({ capLevelToPlayerSize: true });
      ref.hls.on(Hls.Events.MANIFEST_PARSED, () => { if (ref.wantPlay || !v.paused) v.play().catch(() => {}); });
      ref.hls.loadSource(src); ref.hls.attachMedia(v);
    });
    return ref;
  }

  const ICON = {
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v4h4"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v4h-4"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4 5.5h2v2H4zM4 11h2v2H4zM4 16.5h2v2H4z" fill="currentColor" stroke="none"/></svg>',
    fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    fsx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    ff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 6.5v11l8-5.5zM12.5 6.5v11l8-5.5z"/></svg>',
  };

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ":" + String(r).padStart(2, "0");
  };
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function loadChapters(url) {
    if (!chaptersCache) chaptersCache = fetch(url || BASE + "chapters.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    return chaptersCache;
  }

  function mount(el, opts) {
    opts = Object.assign({ chapters: [], autoplayMuted: false, loop: false, title: "", eyebrow: "Film" }, opts || {});
    if (typeof el === "string") el = document.querySelector(el);
    if (opts.mode === "hero") return hero(el, opts);
    const root = h("div", "kp" + (opts.fill ? " kp-fill" : "") + (opts.showTitle ? " kp-show-title" : ""));
    root.tabIndex = 0;
    root.dataset.state = "paused";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", (opts.title || "Film") + " player");
    root.innerHTML =
      '<video class="kp-video" playsinline webkit-playsinline preload="metadata"></video>' +
      '<div class="kp-shade"></div>' +
      '<div class="kp-top"><span class="kp-eyebrow"></span><span class="kp-title"></span></div>' +
      '<button class="kp-unmute" type="button" aria-label="Turn sound on">' + ICON.mute + "<span>Tap for sound</span></button>" +
      '<button class="kp-big" type="button" aria-label="Play" title="Play (Space)">' + ICON.play + "</button>" +
      '<div class="kp-hold" aria-hidden="true">' + ICON.ff + "<span>2×</span></div>" +
      '<div class="kp-keys" aria-hidden="true"><span><kbd>Space</kbd> play</span><span><kbd>J</kbd><kbd>L</kbd> 10 s</span><span><kbd>&lt;</kbd><kbd>&gt;</kbd> speed</span><span><kbd>F</kbd> full screen</span><span><kbd>M</kbd> sound</span></div>' +
      '<button class="kp-nav kp-nav-prev" type="button" hidden>' + ICON.prev + "</button>" +
      '<button class="kp-nav kp-nav-next" type="button" hidden>' + ICON.next + "</button>" +
      '<div class="kp-badge"></div>' +
      '<div class="kp-chapters" role="menu" aria-label="Chapters"><h4>Chapters</h4></div>' +
      '<div class="kp-bar">' +
      '<div class="kp-scrub" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0">' +
      '<div class="kp-track"><div class="kp-buf"></div><div class="kp-prog"></div></div><div class="kp-marks"></div>' +
      '<div class="kp-knob"></div><div class="kp-hover"><span class="kp-hover-t">0:00</span><i class="kp-hover-c"></i></div></div>' +
      '<div class="kp-row">' +
      '<button class="kp-btn kp-pp" type="button" aria-label="Play" title="Play / pause (Space · K)" aria-keyshortcuts="Space K">' + ICON.play + "</button>" +
      '<button class="kp-btn kp-skip kp-back" type="button" aria-label="Back 10 seconds" title="Back 10 s (J)" aria-keyshortcuts="J">' + ICON.back + "<span>10</span></button>" +
      '<button class="kp-btn kp-skip kp-fwd" type="button" aria-label="Forward 10 seconds" title="Forward 10 s (L)" aria-keyshortcuts="L">' + ICON.fwd + "<span>10</span></button>" +
      '<span class="kp-time"><b class="kp-cur">0:00</b><span class="kp-of"> / <span class="kp-dur">0:00</span></span></span>' +
      '<span class="kp-chapnow"></span><span class="kp-spacer"></span>' +
      '<button class="kp-btn kp-speed" type="button" aria-label="Playback speed 1×" title="Speed: 1× · 1.5× · 2× (Shift + &gt; / &lt;)" aria-keyshortcuts="Shift+&gt; Shift+&lt;"><span>1×</span></button>' +
      '<button class="kp-btn kp-mute" type="button" aria-label="Mute" title="Sound on / off (M)" aria-keyshortcuts="M">' + ICON.vol + "</button>" +
      '<span class="kp-vol"><input type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></span>' +
      '<button class="kp-btn kp-listbtn" type="button" aria-label="Chapters" aria-expanded="false" title="Chapters (C)" aria-keyshortcuts="C">' + ICON.list + "</button>" +
      '<button class="kp-btn kp-fsbtn" type="button" aria-label="Full screen" title="Full screen (F)" aria-keyshortcuts="F">' + ICON.fs + "</button>" +
      "</div></div>" +
      '<div class="kp-msg"><div>This film could not load.<small>Check the file path or reload</small></div></div>';
    el.innerHTML = "";
    el.appendChild(root);

    const $ = (s) => root.querySelector(s);
    const v = $(".kp-video"), scrub = $(".kp-scrub"), prog = $(".kp-prog"), buf = $(".kp-buf"), knob = $(".kp-knob"), marks = $(".kp-marks");
    const hov = $(".kp-hover"), hovT = $(".kp-hover-t"), hovC = $(".kp-hover-c"), cur = $(".kp-cur"), durEl = $(".kp-dur");
    const pp = $(".kp-pp"), big = $(".kp-big"), muteBtn = $(".kp-mute"), vol = $(".kp-vol input"), listBtn = $(".kp-listbtn"), fsBtn = $(".kp-fsbtn");
    const list = $(".kp-chapters"), chapNow = $(".kp-chapnow"), eyebrow = $(".kp-eyebrow"), titleEl = $(".kp-title"), badge = $(".kp-badge");
    const speedBtn = $(".kp-speed");

    let chapters = [], duration = opts.duration || 0, dragging = false, idleTimer = 0, lastChap = -1, holding = false;
    titleEl.textContent = opts.title || "";
    if (opts.poster) v.poster = opts.poster;
    const hlsRef = setSrc(v, opts.src);
    v.loop = !!opts.loop;
    if (opts.autoplayMuted) { v.muted = true; v.autoplay = true; root.classList.add("kp-muted-auto"); }

    const dur = () => (isFinite(v.duration) && v.duration > 0 ? v.duration : duration);
    const chapIndex = (t) => { let i = -1; chapters.forEach((c, k) => { if (t >= c.t - 0.05) i = k; }); return i; };

    function setChapters(list_) {
      chapters = (list_ || []).filter((c) => c && isFinite(c.t)).map((c) => ({ t: +c.t, label: String(c.label || "") })).sort((a, b) => a.t - b.t);
      renderMarks();
      list.querySelectorAll(".kp-ch").forEach((n) => n.remove());
      chapters.forEach((c, i) => {
        const b = h("button", "kp-ch", '<span class="n">' + String(i + 1).padStart(2, "0") + '</span><span class="l">' + esc(cap(c.label)) + '</span><span class="t">' + fmt(c.t) + "</span>");
        b.type = "button"; b.setAttribute("role", "menuitem");
        b.addEventListener("click", () => { seek(c.t); play(); toggleList(false); });
        list.appendChild(b);
      });
      listBtn.style.display = chapters.length ? "" : "none";
      updateChapter(true);
    }
    const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
    function renderMarks() {
      marks.innerHTML = "";
      const d = dur();
      if (!d) return;
      chapters.forEach((c, i) => {
        const pct = Math.min(100, (c.t / d) * 100);
        const tick = h("div", "kp-tick" + (i === 0 ? " kp-tick-0" : ""));
        tick.style.left = pct + "%";
        const lab = h("button", "kp-tlabel" + (pct > 78 ? " kp-tlabel-end" : ""));   // late chapters end at their tick, so the label never runs off the bar
        lab.type = "button"; lab.textContent = c.label; lab.style.left = pct + "%";
        lab.addEventListener("pointerdown", (e) => e.stopPropagation());
        lab.addEventListener("click", (e) => { e.stopPropagation(); seek(c.t); play(); });
        marks.append(tick, lab);
      });
    }
    function updateChapter(force) {
      const i = chapIndex(v.currentTime || 0);
      if (i === lastChap && !force) return;
      lastChap = i;
      const c = chapters[i];
      eyebrow.innerHTML = esc(opts.eyebrow) + (c ? ' · <b>' + String(i + 1).padStart(2, "0") + " " + esc(c.label) + "</b>" : "");
      chapNow.innerHTML = c ? "<b>" + String(i + 1).padStart(2, "0") + "</b> " + esc(c.label) : "";
      marks.querySelectorAll(".kp-tlabel").forEach((n, k) => n.classList.toggle("kp-on", k === i));
      list.querySelectorAll(".kp-ch").forEach((n, k) => n.classList.toggle("kp-on", k === i));
    }
    function paint() {
      const d = dur(), t = v.currentTime || 0, p = d ? Math.min(1, t / d) : 0;
      prog.style.width = p * 100 + "%";
      knob.style.left = p * 100 + "%";
      cur.textContent = fmt(t);
      scrub.setAttribute("aria-valuenow", Math.round(t));
      scrub.setAttribute("aria-valuetext", fmt(t) + " of " + fmt(Math.round(d)));
      if (v.buffered.length && d) buf.style.width = Math.min(100, (v.buffered.end(v.buffered.length - 1) / d) * 100) + "%";
      updateChapter();
    }
    function seek(t) {
      const d = dur();
      t = Math.max(0, Math.min(d ? d - 0.05 : t, t));
      try { v.currentTime = t; } catch (e) { /* not seekable yet */ }
      paint();
      poke();
    }
    function play() {
      players.forEach((p) => { if (p !== api && !p.video.muted) p.pause(); });
      if (hlsRef && !hlsRef.hls && !v.src) { hlsRef.wantPlay = true; return; }   // hls.js still loading: play once the playlist is in
      const r = v.play();
      if (r && r.catch) r.catch(() => { root.dataset.state = "paused"; syncPP(); });
    }
    function pause() { if (hlsRef) hlsRef.wantPlay = false; v.pause(); }
    function toggle() { if (v.paused || v.ended) play(); else pause(); }
    function syncPP() {
      const playing = !v.paused && !v.ended;
      root.dataset.state = playing ? "playing" : "paused";
      pp.innerHTML = playing ? ICON.pause : ICON.play;
      pp.setAttribute("aria-label", playing ? "Pause" : "Play");
      big.innerHTML = playing ? ICON.pause : ICON.play;
      big.classList.toggle("kp-big-pause", playing);
      big.setAttribute("aria-label", playing ? "Pause" : "Play"); big.title = (playing ? "Pause" : "Play") + " (Space)";
      if (playing) root.classList.add("kp-started");
      poke();
    }
    function syncVol() {
      const m = v.muted || v.volume === 0;
      muteBtn.innerHTML = m ? ICON.mute : ICON.vol;
      muteBtn.setAttribute("aria-label", m ? "Unmute" : "Mute");
      vol.value = v.muted ? 0 : v.volume;
      vol.style.setProperty("--v", (v.muted ? 0 : v.volume) * 100 + "%");
      if (!v.muted) root.classList.remove("kp-muted-auto");
    }
    function toggleMute() { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 1; syncVol(); poke(); }
    // speed: the page-wide choice, or 2× while the picture is held; defaultPlaybackRate carries it through src swaps (load() resets playbackRate to it)
    function applyRate() {
      const r = holding ? 2 : speed;
      v.defaultPlaybackRate = speed;
      if (v.playbackRate !== r) v.playbackRate = r;
      v.preservesPitch = true; v.webkitPreservesPitch = true; v.mozPreservesPitch = true;
    }
    function syncSpeed(show) {
      applyRate();
      speedBtn.firstChild.textContent = fmtSpeed(speed);
      speedBtn.setAttribute("aria-label", "Playback speed " + fmtSpeed(speed));
      speedBtn.classList.toggle("kp-on", speed !== 1);
      if (show) poke();
    }
    // iPhone Safari has no element full screen: the video goes native (webkitEnterFullscreen) and reports webkitDisplayingFullscreen
    function isFs() { return document.fullscreenElement === root || document.webkitFullscreenElement === root || !!v.webkitDisplayingFullscreen; }
    const exitFs = () => {
      if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) { v.webkitExitFullscreen(); return; }
      if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    };
    function toggleFs() {
      if (isFs()) { exitFs(); return; }
      if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iPhone Safari: native fullscreen video
    }
    function toggleList(force) {
      const open = typeof force === "boolean" ? force : !root.classList.contains("kp-list-open");
      root.classList.toggle("kp-list-open", open);
      listBtn.classList.toggle("kp-on", open);
      listBtn.setAttribute("aria-expanded", String(open));
      poke();
    }
    // controls auto-hide after 2 s idle while playing
    function poke() {
      root.classList.remove("kp-idle");
      clearTimeout(idleTimer);
      if (!v.paused && !dragging && !root.classList.contains("kp-list-open")) idleTimer = setTimeout(() => root.classList.add("kp-idle"), EASE_IDLE_MS);
    }

    // scrubber: pointer drag + hover time
    const tAt = (x) => { const r = scrub.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); return { p, t: p * dur() }; };
    function showHover(x) {
      const { p, t } = tAt(x), i = chapIndex(t), r = scrub.getBoundingClientRect();
      hovT.textContent = fmt(t);
      hovC.textContent = chapters[i] ? chapters[i].label : "";
      const half = hov.offsetWidth / 2 || 30;
      hov.style.left = Math.max(half, Math.min(r.width - half, p * r.width)) + "px";
    }
    scrub.addEventListener("pointermove", (e) => { showHover(e.clientX); if (dragging) seek(tAt(e.clientX).t); });
    scrub.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true; scrub.classList.add("kp-drag"); scrub.setPointerCapture(e.pointerId);
      showHover(e.clientX); seek(tAt(e.clientX).t);
    });
    const endDrag = (e) => { if (!dragging) return; dragging = false; scrub.classList.remove("kp-drag"); try { scrub.releasePointerCapture(e.pointerId); } catch (_) {} poke(); };
    scrub.addEventListener("pointerup", endDrag);
    scrub.addEventListener("pointercancel", endDrag);
    scrub.addEventListener("keydown", (e) => {
      if (e.key === "Home") { seek(0); e.preventDefault(); e.stopPropagation(); }
      if (e.key === "End") { seek(dur()); e.preventDefault(); e.stopPropagation(); }
    });

    pp.addEventListener("click", toggle);
    big.addEventListener("click", () => { if (root.classList.contains("kp-muted-auto")) { v.muted = false; syncVol(); seek(0); play(); } else toggle(); });
    // ‹ › slide buttons (opt-in): leave full screen first so the next slide is what shows
    const nav = opts.nav || {};
    [["prev", ".kp-nav-prev", "Previous slide"], ["next", ".kp-nav-next", "Next slide"]].forEach(([k, sel, def]) => {
      const b = $(sel); if (typeof nav[k] !== "function") return;
      const label = nav[k + "Label"] || def; b.hidden = false; b.setAttribute("aria-label", label); b.title = label + (k === "prev" ? " (←)" : " (→)");
      b.addEventListener("click", (e) => { e.stopPropagation(); exitFs(); nav[k](); });
    });
    $(".kp-back").addEventListener("click", () => seek(v.currentTime - 10));
    $(".kp-fwd").addEventListener("click", () => seek(v.currentTime + 10));
    $(".kp-unmute").addEventListener("click", (e) => { e.stopPropagation(); v.muted = false; if (v.volume === 0) v.volume = 1; syncVol(); play(); });
    muteBtn.addEventListener("click", toggleMute);
    vol.addEventListener("input", () => { v.volume = +vol.value; v.muted = +vol.value === 0; syncVol(); poke(); });
    listBtn.addEventListener("click", () => toggleList());
    fsBtn.addEventListener("click", toggleFs);
    speedBtn.addEventListener("click", () => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]));
    // click on the picture toggles play (not on controls)
    let lastPointer = "mouse", idleAtDown = false;
    root.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType || "mouse"; idleAtDown = root.classList.contains("kp-idle"); }, true);

    // press and hold the picture (ruling #18): 2× after 300 ms while held, back to the chosen speed on release.
    // A quick tap still toggles play. While a hold is on, the touch never reaches the deck's swipe, and no callout or selection appears.
    const HOLD_MS = 300;
    let holdT = 0, holdAt = null, held = false;   // held: this press became a hold (its click and touchend are swallowed)
    const onPicture = (t) => t === v || (t.closest && t.closest(".kp-big"));
    function holdStart() { holdT = 0; holding = true; held = true; clearTimeout(idleTimer); root.classList.add("kp-holding", "kp-idle"); applyRate(); }
    function holdEnd() { clearTimeout(holdT); holdT = 0; holdAt = null; if (!holding) return; holding = false; root.classList.remove("kp-holding"); applyRate(); }
    root.addEventListener("pointerdown", (e) => {
      held = false;
      if (e.button !== 0 || !e.isPrimary || !onPicture(e.target)) return;
      holdAt = { x: e.clientX, y: e.clientY }; clearTimeout(holdT);
      if (!v.paused && !v.ended) holdT = setTimeout(holdStart, HOLD_MS);
    });
    root.addEventListener("pointermove", (e) => {   // a finger that travels is a swipe, not a hold
      if (holdAt && !holding && Math.hypot(e.clientX - holdAt.x, e.clientY - holdAt.y) > 10) { clearTimeout(holdT); holdT = 0; holdAt = null; }
    });
    ["pointerup", "pointercancel"].forEach((ev) => root.addEventListener(ev, holdEnd));
    v.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") holdEnd(); });
    const swallow = (e) => { if (holding || held) e.stopPropagation(); };   // pointer events fire before touch events, so `held` covers the touchend
    v.addEventListener("touchmove", swallow, { passive: true });
    v.addEventListener("touchend", swallow, { passive: true });
    big.addEventListener("touchend", swallow, { passive: true });
    v.addEventListener("contextmenu", (e) => { if (lastPointer !== "mouse" || holding || held) e.preventDefault(); });
    big.addEventListener("click", (e) => { if (held) { held = false; e.stopImmediatePropagation(); } }, true);

    v.addEventListener("click", () => {
      if (held) { held = false; return; }   // the end of a hold, not a tap
      if (root.classList.contains("kp-list-open")) { toggleList(false); return; }
      if (lastPointer === "touch" && idleAtDown) { poke(); return; }   // first tap shows the controls
      toggle();
    });
    v.addEventListener("dblclick", toggleFs);

    root.addEventListener("pointermove", (e) => { if (!holding) poke(); });
    root.addEventListener("pointerdown", poke);
    root.addEventListener("focusin", poke);
    // touch fires pointerleave right after every tap: only a real mouse leaving hides the controls (iOS: they stay up after a tap)
    root.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !v.paused && !dragging) root.classList.add("kp-idle"); });
    root.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" && e.key !== " ") return;
      let done = true;
      switch (e.key) {
        case " ": case "k": case "K":
          if (tag === "button" && e.key === " ") { done = false; break; } toggle(); break;
        case "j": case "J": seek(v.currentTime - 10); break;
        case "l": case "L": seek(v.currentTime + 10); break;
        // ← / → are not handled here: they bubble to the slide deck
        case "f": case "F": toggleFs(); break;
        case "m": case "M": toggleMute(); break;
        case "c": case "C": if (chapters.length) toggleList(); break;
        case "Escape": if (root.classList.contains("kp-list-open")) toggleList(false); else done = false; break;
        default: done = false;
      }
      // handled keys stay inside the player (the slide deck listens for Space too); arrows always pass through
      if (done) { e.preventDefault(); e.stopPropagation(); poke(); }
    });

    v.addEventListener("loadedmetadata", () => { applyRate(); durEl.textContent = fmt(Math.round(dur())); scrub.setAttribute("aria-valuemax", Math.round(dur())); renderMarks(); updateChapter(true); paint(); });
    ["loadstart", "play", "seeked"].forEach((ev) => v.addEventListener(ev, applyRate));   // src swaps, hls.js attach, chapter seeks
    v.addEventListener("timeupdate", paint);
    v.addEventListener("progress", paint);
    v.addEventListener("seeked", paint);
    v.addEventListener("play", syncPP);
    v.addEventListener("playing", syncPP);
    v.addEventListener("pause", syncPP);
    v.addEventListener("ended", () => { syncPP(); root.classList.remove("kp-idle"); });
    v.addEventListener("volumechange", syncVol);
    v.addEventListener("error", () => root.classList.add("kp-error"));
    // slide keys (← → ↑ ↓ PgUp PgDn) belong to the deck: in full screen, leave it so the new slide is visible. Never prevented or stopped.
    // Window capture phase, registered at mount: it runs before a deck handler that stops propagation in its own capture listener.
    const SLIDE_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"];
    const onArrow = (e) => { if (SLIDE_KEYS.includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) exitFs(); };
    window.addEventListener("keydown", onArrow, true);
    const onFs = () => { const on = isFs(); root.classList.toggle("kp-fs", on); fsBtn.innerHTML = on ? ICON.fsx : ICON.fs; fsBtn.setAttribute("aria-label", on ? "Exit fullscreen" : "Fullscreen"); poke(); };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    v.addEventListener("webkitbeginfullscreen", onFs);   // iPhone native full screen
    v.addEventListener("webkitendfullscreen", onFs);

    const api = {
      el: root, video: v, play, pause, toggle, seek, toggleFullscreen: toggleFs, setChapters, _speed: syncSpeed,
      get chapters() { return chapters.slice(); },
      get speed() { return speed; },
      destroy() { clearTimeout(holdT); if (hlsRef) { hlsRef.dead = true; if (hlsRef.hls) hlsRef.hls.destroy(); } v.pause(); v.removeAttribute("src"); v.load(); document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("webkitfullscreenchange", onFs); window.removeEventListener("keydown", onArrow, true); players.delete(api); root.remove(); },
    };
    players.add(api);

    if (typeof opts.chapters === "string") {
      const key = opts.chapters;
      loadChapters(opts.chaptersUrl).then((j) => { const f = j && j[key]; if (f) { if (!duration) duration = f.duration || 0; setChapters(f.chapters); durEl.textContent = fmt(Math.round(dur())); } });
    } else setChapters(opts.chapters);
    badge.textContent = opts.badge || "";
    durEl.textContent = fmt(Math.round(dur()));
    syncVol(); syncPP(); syncSpeed(); paint();
    if (opts.autoplayMuted) play();
    return api;
  }

  /* overlay: the full film over the page */
  let overlay = null;
  function open(film) {
    close();
    const back = document.activeElement;
    const ov = h("div", "kp-overlay");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", film.title || "Film");
    const btn = h("button", "kp-close", "Close " + ICON.close); btn.type = "button";
    const frame = h("div", "kp-overlay-frame");
    ov.append(btn, frame);
    document.body.appendChild(ov);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const p = mount(frame, Object.assign({}, film, { autoplayMuted: false }));
    const onKey = (e) => {
      if (e.key === "Escape" && !document.fullscreenElement) { e.preventDefault(); e.stopPropagation(); close(); return; }
      // keys pressed anywhere while the overlay is open drive its player, never the slides underneath
      // the overlay is modal: ← / → seek the film here (no slide shows behind it), and nothing reaches the deck
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); p.seek(p.video.currentTime + (e.key === "ArrowLeft" ? -10 : 10)); return; }
      if (!p.el.contains(e.target) && [" ", "f", "m", "k", "c", "j", "l", "F", "M", "K", "C", "J", "L"].includes(e.key) && e.target !== btn) {
        e.preventDefault(); e.stopPropagation();
        p.el.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, bubbles: true }));
      } else if (!p.el.contains(e.target) && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("keydown", onKey, true);
    btn.addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    overlay = { ov, p, onKey, back, prevOverflow };
    requestAnimationFrame(() => ov.classList.add("kp-in"));
    p.el.focus({ preventScroll: true });
    p.play();
    return p;
  }
  function close() {
    if (!overlay) return;
    const { ov, p, onKey, back, prevOverflow } = overlay;
    overlay = null;
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.style.overflow = prevOverflow;
    p.destroy();
    ov.remove();
    if (back && back.focus) back.focus({ preventScroll: true });
  }

  /* hero: muted loop behind a title, buttons open films in the overlay */
  function hero(el, opts) {
    if (typeof el === "string") el = document.querySelector(el);
    opts = Object.assign({ eyebrow: "", title: "", sub: "", films: [] }, opts || {});
    if (!opts.films.length && opts.film) opts.films = [opts.film];
    if (!opts.films.length && opts.src) opts.films = [{ src: opts.src, poster: opts.filmPoster, title: opts.filmTitle || opts.title, chapters: opts.chapters }];
    const root = h("div", "kp-hero");
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.innerHTML =
      '<video class="kp-hero-bg" muted playsinline webkit-playsinline loop preload="auto" aria-hidden="true"></video><div class="kp-hero-shade"></div>' +
      '<div class="kp-hero-copy">' + (opts.eyebrow ? '<span class="kp-eyebrow">' + esc(opts.eyebrow) + "</span>" : "") +
      '<h1 class="kp-hero-title">' + (opts.titleHtml || esc(opts.title)) + "</h1>" + (opts.sub ? '<p class="kp-hero-sub">' + esc(opts.sub) + "</p>" : "") +
      '<div class="kp-hero-ctas"></div></div>';
    el.innerHTML = "";
    el.appendChild(root);
    const bg = root.querySelector(".kp-hero-bg");
    bg.muted = true;
    // loopSrc: false = no background video at all (nothing is requested; the page draws its own background)
    const noLoop = opts.loopSrc === false;
    if (noLoop) { bg.hidden = true; root.classList.add("kp-hero-noloop"); }
    else {
      if (opts.poster) bg.poster = opts.poster;
      bg.src = opts.loopSrc || BASE + "hero-loop.mp4";
      if (!reduce) { bg.autoplay = true; bg.play().catch(() => {}); }
    }
    // pause the loop when it is off screen
    if ("IntersectionObserver" in window && !reduce && !noLoop) {
      new IntersectionObserver((es) => es.forEach((x) => (x.isIntersecting && !overlay ? bg.play().catch(() => {}) : bg.pause())), { threshold: 0.15 }).observe(root);
    }
    const ctas = root.querySelector(".kp-hero-ctas");
    opts.films.forEach((f, i) => {
      const b = h("button", "kp-cta" + (i ? " kp-ghost" : ""), ICON.play + "<span>" + esc(f.label || "Watch the film") + "</span>" + (f.length ? "<small>" + esc(f.length) + "</small>" : ""));
      b.type = "button";
      b.addEventListener("click", () => { bg.pause(); const p = open(f); p.video.addEventListener("emptied", () => { if (!reduce && !noLoop) bg.play().catch(() => {}); }, { once: true }); });
      ctas.appendChild(b);
    });
    return { el: root, video: bg, open: (i) => open(opts.films[i || 0]) };
  }

  window.KPlayer = { mount, hero, open, close, loadChapters, setSpeed, get speed() { return speed; }, speeds: SPEEDS.slice(), media: BASE, version: "1.5" };
})();
