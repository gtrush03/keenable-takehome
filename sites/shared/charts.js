/* KC: tiny theme-aware SVG charts. All colors come from CSS variables so both themes work.
   KC.bar(el, {data:[{label, value, color?, note?, hl?}], horizontal?, fmt?, max?, height?})
   KC.line(el, {series:[{name, color?, points:[[x,y],...], dash?, area?}], bands:[{name?, lo:[[x,y]], hi:[[x,y]], color?}],
                x:{label?, fmt?, min?, max?, log?}, y:{label?, fmt?, min?, max?, log?}, marks:[{x, label}], height?})
   KC.scatter(el, {points:[{x, y, label, r?, color?, hl?}], x:{label, fmt, log?}, y:{label, fmt}, height?})
   KC.funnel(el, {steps:[{label, value, note?}], fmt?})
   KC.hist(el, {values:[...], bins?, fmt?, marks:[{x,label}]})
   Colors: pass a CSS var name like "--accent" or any color string. */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const css = (n) => getComputedStyle(document.body).getPropertyValue(n).trim() || n;
  const col = (c, i = 0) => {
    const pal = ["--accent", "--warm", "--teal", "--purple", "--green", "--ink-3", "--accent-2", "--expressive"];
    const v = c || pal[i % pal.length]; return v.startsWith("--") ? css(v) : v;
  };
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n); return n;
  };
  const fmtDefault = (v) => Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + "B" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "K" : (+v.toFixed(2)).toString();
  const niceTicks = (min, max, n = 5) => {
    const span = max - min || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || mag * 10;
    const out = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10)); return out;
  };
  const logTicks = (min, max) => { const out = []; for (let p = Math.floor(Math.log10(min)); p <= Math.ceil(Math.log10(max)); p++) out.push(Math.pow(10, p)); return out.filter(v => v >= min * 0.999 && v <= max * 1.001); };
  const scale = (d0, d1, r0, r1, log) => log
    ? (v) => r0 + (Math.log10(Math.max(v, 1e-12)) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0)) * (r1 - r0)
    : (v) => r0 + (v - d0) / ((d1 - d0) || 1) * (r1 - r0);
  const frame = (host, h) => {
    const node = typeof host === "string" ? document.querySelector(host) : host;
    node.classList.add("chart"); node.innerHTML = "";
    // narrow containers get a narrower canvas so 11px labels stay ~9–11px on phones
    const cw = node.clientWidth || 800, W = cw >= 700 ? 800 : Math.max(420, Math.round(cw * 1.15)), svg = el("svg", { viewBox: `0 0 ${W} ${h}`, role: "img", preserveAspectRatio: "xMidYMid meet" }, node);
    if (node.dataset.label) svg.setAttribute("aria-label", node.dataset.label);
    const tip = document.createElement("div"); tip.className = "tip"; node.appendChild(tip);
    const showTip = (evt, html) => {
      const r = node.getBoundingClientRect(); tip.innerHTML = html; tip.style.opacity = 1;
      const x = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, evt.clientX - r.left + 12)); tip.style.left = x + "px"; tip.style.top = (evt.clientY - r.top - 34) + "px";
    };
    const hideTip = () => { tip.style.opacity = 0; };
    return { node, svg, W, h, showTip, hideTip };
  };
  const hover = (f, n, html) => { n.addEventListener("mousemove", e => f.showTip(e, html)); n.addEventListener("mouseleave", f.hideTip); n.style.cursor = "default"; };
  const axisY = (f, g, ticks, y, x0, x1, fmt) => ticks.forEach(t => {
    el("line", { x1: x0, x2: x1, y1: y(t), y2: y(t), class: "gridl" }, g);
    el("text", { x: x0 - 8, y: y(t) + 4, "text-anchor": "end" }, g).textContent = fmt(t);
  });

  const KC = {};

  KC.bar = (host, o) => {
    const data = o.data, fmt = o.fmt || fmtDefault, horiz = o.horizontal !== false;
    if (horiz) {
      const rowH = o.rowH || 34, h = o.height || data.length * rowH + 20, f = frame(host, h);
      const labW = Math.min(o.labelWidth || 230, Math.round(f.W * 0.36)), x0 = labW, x1 = f.W - 90;
      const max = o.max || Math.max(...data.map(d => d.value)) * 1.02, x = scale(o.log ? (o.min || 1) : 0, max, x0, x1, o.log);
      const g = el("g", { class: "axis" }, f.svg);
      data.forEach((d, i) => {
        const yy = 10 + i * rowH, c = d.hl ? col("--accent") : col(d.color || (o.color || "--ink-3"));
        el("text", { x: x0 - 12, y: yy + rowH / 2 + 4, "text-anchor": "end", class: "lbl", style: d.hl ? `fill:${col("--ink-strong")};font-weight:500` : "" }, g).textContent = d.label;
        const w = Math.max(1, x(d.value) - x0);
        const r = el("rect", { x: x0, y: yy + 7, width: w, height: rowH - 14, fill: c, class: "growx", style: `--i:${i}`, opacity: d.hl ? 1 : 0.85 }, f.svg);
        el("text", { x: x0 + w + 8, y: yy + rowH / 2 + 4, class: "lbl", style: d.hl ? `fill:${col("--ink-strong")}` : "" }, f.svg).textContent = fmt(d.value);
        hover(f, r, `${d.label}: <b>${fmt(d.value)}</b>${d.note ? "<br>" + d.note : ""}`);
      });
      return f;
    }
    const h = o.height || 320, f = frame(host, h), pad = { l: 60, r: 16, t: 16, b: 46 };
    const max = o.max || Math.max(...data.map(d => d.value)) * 1.1, y = scale(0, max, h - pad.b, pad.t);
    const g = el("g", { class: "axis" }, f.svg); axisY(f, g, niceTicks(0, max, 4), y, pad.l, f.W - pad.r, fmt);
    const bw = (f.W - pad.l - pad.r) / data.length;
    data.forEach((d, i) => {
      const c = d.hl ? col("--accent") : col(d.color || o.color || "--ink-3");
      const r = el("rect", { x: pad.l + i * bw + bw * 0.18, y: y(d.value), width: bw * 0.64, height: y(0) - y(d.value), fill: c, class: "grow", style: `--i:${i}` }, f.svg);
      el("text", { x: pad.l + i * bw + bw / 2, y: h - pad.b + 18, "text-anchor": "middle", class: "lbl" }, g).textContent = d.label;
      el("text", { x: pad.l + i * bw + bw / 2, y: y(d.value) - 6, "text-anchor": "middle", class: "lbl" }, f.svg).textContent = fmt(d.value);
      hover(f, r, `${d.label}: <b>${fmt(d.value)}</b>${d.note ? "<br>" + d.note : ""}`);
    });
    return f;
  };

  KC.line = (host, o) => {
    const h = o.height || 360, f = frame(host, h), pad = { l: 64, r: 24, t: 16, b: 48 };
    const all = [...(o.series || []).flatMap(s => s.points), ...(o.bands || []).flatMap(b => [...b.lo, ...b.hi])];
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const X = o.x || {}, Y = o.y || {};
    const xmin = X.min ?? Math.min(...xs), xmax = X.max ?? Math.max(...xs);
    const ymin = Y.min ?? (Y.log ? Math.min(...ys) : Math.min(0, ...ys)), ymax = Y.max ?? Math.max(...ys) * 1.08;
    const x = scale(xmin, xmax, pad.l, f.W - pad.r, X.log), y = scale(ymin, ymax, h - pad.b, pad.t, Y.log);
    const fx = X.fmt || fmtDefault, fy = Y.fmt || fmtDefault;
    const g = el("g", { class: "axis" }, f.svg);
    axisY(f, g, Y.log ? logTicks(ymin, ymax) : niceTicks(ymin, ymax, 4), y, pad.l, f.W - pad.r, fy);
    (X.log ? logTicks(xmin, xmax) : niceTicks(xmin, xmax, 6)).forEach(t => { el("text", { x: x(t), y: h - pad.b + 20, "text-anchor": "middle" }, g).textContent = fx(t); });
    if (X.label) el("text", { x: f.W - pad.r, y: h - 6, "text-anchor": "end" }, g).textContent = X.label;
    if (Y.label) el("text", { x: pad.l, y: pad.t - 4 > 8 ? pad.t - 4 : 10, "text-anchor": "start" }, g).textContent = Y.label;
    (o.bands || []).forEach((b, i) => {
      const d = b.hi.map((p, k) => `${k ? "L" : "M"}${x(p[0])},${y(p[1])}`).join("") + b.lo.slice().reverse().map(p => `L${x(p[0])},${y(p[1])}`).join("") + "Z";
      el("path", { d, fill: col(b.color || "--accent"), opacity: b.opacity ?? 0.12 }, f.svg);
    });
    (o.marks || []).forEach(m => {
      el("line", { x1: x(m.x), x2: x(m.x), y1: pad.t, y2: h - pad.b, stroke: col("--ink-3"), "stroke-dasharray": "3 3" }, f.svg);
      el("text", { x: x(m.x) + 6, y: pad.t + 12, class: "lbl" }, f.svg).textContent = m.label;
    });
    (o.series || []).forEach((s, i) => {
      const c = col(s.color, i), pts = s.points;
      const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
      if (s.area) el("path", { d: d + `L${x(pts[pts.length - 1][0])},${y(Y.log ? ymin : 0)}L${x(pts[0][0])},${y(Y.log ? ymin : 0)}Z`, fill: c, opacity: 0.08 }, f.svg);
      const p = el("path", { d, fill: "none", stroke: c, "stroke-width": s.width || 2.2, "stroke-dasharray": s.dash || null, class: s.dash ? null : "draw", "stroke-linejoin": "round" }, f.svg);
      if (!s.dash) requestAnimationFrame(() => { try { p.style.setProperty("--len", Math.ceil(p.getTotalLength())); } catch (_) {} });
      const last = pts[pts.length - 1];
      if (s.name && o.endLabels !== false) el("text", { x: Math.min(x(last[0]) + 6, f.W - 4), y: y(last[1]) + 4, class: "lbl", style: `fill:${c}`, "text-anchor": x(last[0]) > f.W - 120 ? "end" : "start", dx: x(last[0]) > f.W - 120 ? -10 : 0, dy: -8 }, f.svg).textContent = s.name;
      pts.forEach(pt => { const dot = el("circle", { cx: x(pt[0]), cy: y(pt[1]), r: 9, fill: "transparent" }, f.svg); hover(f, dot, `${s.name || ""} · ${fx(pt[0])}: <b>${fy(pt[1])}</b>`); });
    });
    return f;
  };

  KC.scatter = (host, o) => {
    const h = o.height || 380, f = frame(host, h), pad = { l: 64, r: 24, t: 16, b: 48 };
    const P = o.points, X = o.x || {}, Y = o.y || {};
    const xmin = X.min ?? Math.min(...P.map(p => p.x)) * (X.log ? 0.8 : 1), xmax = X.max ?? Math.max(...P.map(p => p.x)) * 1.1;
    const ymin = Y.min ?? Math.min(...P.map(p => p.y)) * 0.96, ymax = Y.max ?? Math.max(...P.map(p => p.y)) * 1.02;
    const x = scale(xmin, xmax, pad.l, f.W - pad.r, X.log), y = scale(ymin, ymax, h - pad.b, pad.t);
    const fx = X.fmt || fmtDefault, fy = Y.fmt || fmtDefault, g = el("g", { class: "axis" }, f.svg);
    axisY(f, g, niceTicks(ymin, ymax, 4), y, pad.l, f.W - pad.r, fy);
    (X.log ? logTicks(xmin, xmax) : niceTicks(xmin, xmax, 6)).forEach(t => { el("text", { x: x(t), y: h - pad.b + 20, "text-anchor": "middle" }, g).textContent = fx(t); });
    if (X.label) el("text", { x: f.W - pad.r, y: h - 6, "text-anchor": "end" }, g).textContent = X.label;
    if (Y.label) el("text", { x: pad.l, y: 10 }, g).textContent = Y.label;
    P.slice().sort((a, b) => (a.hl ? 1 : 0) - (b.hl ? 1 : 0)).forEach((p, i) => {
      const c = p.hl ? col("--accent") : col(p.color || "--ink-3");
      const dot = el("circle", { cx: x(p.x), cy: y(p.y), r: p.r || (p.hl ? 8 : 5.5), fill: c, opacity: p.hl ? 1 : 0.7, class: "grow", style: `--i:${i}` }, f.svg);
      if (p.hl || o.labelAll) el("text", { x: x(p.x) + 11, y: y(p.y) + 4, class: "lbl", style: p.hl ? `fill:${col("--ink-strong")};font-weight:500` : "" }, f.svg).textContent = p.label;
      hover(f, dot, `${p.label}<br>${X.label || "x"}: <b>${fx(p.x)}</b> · ${Y.label || "y"}: <b>${fy(p.y)}</b>${p.note ? "<br>" + p.note : ""}`);
    });
    return f;
  };

  KC.funnel = (host, o) => {
    const steps = o.steps, fmt = o.fmt || fmtDefault, rowH = 56, h = steps.length * rowH + 10, f = frame(host, h);
    const max = steps[0].value, narrow = f.W < 700, cx = f.W * (narrow ? 0.3 : 0.42), maxW = f.W * (narrow ? 0.56 : 0.62);
    steps.forEach((s, i) => {
      const w = Math.max(6, maxW * (s.value / max)), yy = 5 + i * rowH;
      const r = el("rect", { x: cx - w / 2, y: yy, width: w, height: rowH - 10, fill: col(i === steps.length - 1 ? "--accent" : "--accent-2"), opacity: 0.35 + 0.65 * (i + 1) / steps.length, class: "growx", style: `--i:${i};transform-origin:center` }, f.svg);
      el("text", { x: cx, y: yy + rowH / 2, "text-anchor": "middle", class: "lbl", style: `fill:${col(i >= steps.length - 2 ? "--bg" : "--ink-strong")};font-weight:500` }, f.svg).textContent = fmt(s.value);
      el("text", { x: cx + maxW / 2 + 16, y: yy + rowH / 2 - 4, class: "lbl", style: `fill:${col("--ink")}` }, f.svg).textContent = s.label;
      if (s.note) el("text", { x: cx + maxW / 2 + 16, y: yy + rowH / 2 + 12, class: "lbl" }, f.svg).textContent = s.note;
      hover(f, r, `${s.label}: <b>${fmt(s.value)}</b>${i ? ` (${(100 * s.value / steps[i - 1].value).toFixed(0)}% of previous)` : ""}`);
    });
    return f;
  };

  KC.hist = (host, o) => {
    const v = o.values.slice().sort((a, b) => a - b), n = o.bins || 40, lo = o.min ?? v[0], hi = o.max ?? v[v.length - 1];
    const bw = (hi - lo) / n, counts = Array(n).fill(0); v.forEach(x => { counts[Math.min(n - 1, Math.max(0, Math.floor((x - lo) / bw)))]++; });
    const h = o.height || 300, f = frame(host, h), pad = { l: 24, r: 24, t: 20, b: 44 }, fmt = o.fmt || fmtDefault;
    const x = scale(lo, hi, pad.l, f.W - pad.r), y = scale(0, Math.max(...counts) * 1.1, h - pad.b, pad.t), g = el("g", { class: "axis" }, f.svg);
    counts.forEach((c, i) => { const r = el("rect", { x: x(lo + i * bw) + 1, y: y(c), width: Math.max(1, x(lo + bw) - x(lo) - 2), height: y(0) - y(c), fill: col("--accent-2"), class: "grow", style: `--i:${i % 20}` }, f.svg); hover(f, r, `${fmt(lo + i * bw)}–${fmt(lo + (i + 1) * bw)}: <b>${c}</b> draws`); });
    niceTicks(lo, hi, 6).forEach(t => { el("text", { x: x(t), y: h - pad.b + 20, "text-anchor": "middle" }, g).textContent = fmt(t); });
    (o.marks || []).forEach(m => {
      el("line", { x1: x(m.x), x2: x(m.x), y1: pad.t, y2: h - pad.b, stroke: col(m.color || "--accent"), "stroke-width": 1.5, "stroke-dasharray": m.dash || null }, f.svg);
      el("text", { x: x(m.x) + 5, y: pad.t + 10, class: "lbl", style: `fill:${col(m.color || "--accent")}` }, f.svg).textContent = m.label;
    });
    if (o.xLabel) el("text", { x: f.W - pad.r, y: h - 6, "text-anchor": "end" }, g).textContent = o.xLabel;
    return f;
  };

  KC.pct = (arr, p) => { const v = arr.slice().sort((a, b) => a - b); const k = (v.length - 1) * p, f0 = Math.floor(k); return v[f0] + (v[Math.min(v.length - 1, f0 + 1)] - v[f0]) * (k - f0); };
  KC.money = (v) => (v < 0 ? "-" : "") + "$" + fmtDefault(Math.abs(v));
  KC.fmt = fmtDefault;
  window.KC = KC;
})();
