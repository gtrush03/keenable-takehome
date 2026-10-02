// Galactica chapter: the bridge slider (one acquired_at cut → train / eval), the Common Crawl overlap bars,
// and build vs buy. Every number is read from data/ at runtime.
(() => {
  // ---- Bridge: drag the cutoff T over the 500 pages of data/cc_overlap.json, bucketed by acquired_at month ----
  const cut = document.getElementById("gaCut");
  if (cut) fetch("data/cc_overlap.json").then(r => r.json()).then(d => {
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
    // bucket 0 = before 2026, buckets 1..10 = Jan..Oct 2026; cut position i puts buckets 0..i in train, T = 1st of MON[i]
    const b = Array(11).fill(0);
    d.rows.forEach(r => { const a = r.acquired_at || ""; b[a < "2026" ? 0 : +a.slice(5, 7)]++; });
    const N = d.rows.length, max = Math.max(...b);
    const PRINTED = 6; // T = 1 Jul 2026: a recent model cutoff; 170 train vs 330 eval
    const hist = (i) => `<div class="ga-cols">${b.map((n, k) => `<div class="${k <= i ? "tr" : "ev"}"><i style="height:${Math.max(n ? 3 : 0, n / max * 100)}%"></i><span>${k ? MON[k - 1] : "≤2025"}</span></div>`).join("")}</div>`;
    const out = (i) => {
      const tr = b.slice(0, i + 1).reduce((s, n) => s + n, 0);
      return `<div class="ev">T = 1 ${MON[i]} 2026<small>train: acquired before T · eval: acquired on or after T</small></div>` +
        `<div class="m">${tr}<span class="of">/${N}</span><small>pretraining slice</small></div>` +
        `<div class="m us">${N - tr}<span class="of">/${N}</span><small>post-cutoff acquisition slice; contamination untested</small></div>`;
    };
    const host = document.getElementById("gaHist");
    const render = () => {
      const i = +cut.value;
      cut.style.setProperty("--p", (i / cut.max * 100) + "%");
      host.innerHTML = hist(i);
      document.getElementById("gaCutOut").innerHTML = out(i);
    };
    cut.addEventListener("input", render); render();
    document.getElementById("gaCutPrint").innerHTML = `<div class="ga-hist">${hist(PRINTED)}</div><div class="ix-out">${out(PRINTED)}</div>` +
      `<p class="ix-printed-note">Printed state: T = 1 Jul 2026. On the web, drag T month by month.</p>`;
  });

  // ---- R: pooled share of 500 Keenable pages absent from Common Crawl ----
  const cc = document.getElementById("gaCC");
  if (cc) fetch("data/cc_overlap.json").then(r => r.json()).then(d => {
    const p = d.pooled, narrow = cc.clientWidth < 600;
    const ci = x => `${(x.ci95[0] * 100).toFixed(1)}–${(x.ci95[1] * 100).toFixed(1)}%`;
    const rows = [
      { label: narrow ? "Latest" : "Latest crawl (Sep 2026)", x: p.absent_from_latest_crawl },
      { label: narrow ? "All 2026" : "All nine crawls of 2026", x: p.absent_from_all_2026_crawls, hl: true },
    ];
    if (p.absent_from_every_crawl) rows.push({ label: narrow ? "Every crawl" : "Every crawl since 2008", x: p.absent_from_every_crawl });
    KC.bar(cc, {
      data: rows.map(r => ({ label: r.label, value: r.x.share * 100, hl: r.hl, note: r.x.k != null ? `${r.x.k}/${r.x.n}, 95% CI ${ci(r.x)}` : `estimate, 95% CI ${ci(r.x)}; 40-page subsample checked in all 119 older crawls` })),
      max: 100, rowH: narrow ? 52 : 64, labelWidth: narrow ? 150 : 300, fmt: v => v.toFixed(1) + "%", color: "rgba(11,11,11,.16)",
    });
    const all = p.absent_from_all_2026_crawls;
    document.getElementById("gaCCcap").innerHTML = `Absent, of ${all.n} pages Keenable served; 2026 CI ${ci(all)}. Every crawl since 2008: ` +
      (p.absent_from_every_crawl ? `${(p.absent_from_every_crawl.share * 100).toFixed(0)}% (estimate, CI ${ci(p.absent_from_every_crawl)})` : "still running") + `. Source: <a class="src" href="data/cc_overlap.json">data/cc_overlap.json</a>`;
  });

  // ---- O: FineWeb-Edu-style score distribution, live Jev on the broad sample (scores >= 3 highlighted) ----
  const qual = document.getElementById("gaQual");
  if (qual) fetch("data/charts/ga_est_quality.json").then(r => r.json()).then(d => {
    const narrow = qual.clientWidth < 600, n = d.n;
    const names = ["no value", "some info", "superficial", "textbook intro", "highly useful"];
    const rows = [0, 1, 2, 3, 4].map(k => ({ label: narrow ? `${k}–${k + 1}` : `Score ${k}–${k + 1} · ${names[k]}`, value: d.hist_floor[k] / n * 100, hl: k >= 3,
      note: `${d.hist_floor[k]} of ${n}` }));
    KC.bar(qual, { data: rows, max: 40, rowH: narrow ? 40 : 50, labelWidth: narrow ? 110 : 280, fmt: v => v.toFixed(1) + "%", color: "rgba(11,11,11,.16)" });
    const p = x => (x * 100).toFixed(1) + "%", ci = x => `${(x.ci95[0] * 100).toFixed(1)}–${(x.ci95[1] * 100).toFixed(1)}%`;
    document.getElementById("gaQualCap").innerHTML = `Score ≥ 3: ${p(d.share_ge3.share)} (CI ${ci(d.share_ge3)}), n = ${n} docs. ` +
      `FineWeb-Edu’s threshold of 3 kept 8% of FineWeb. Source: <a class="src" href="data/charts/ga_est_quality.json">ga_est_quality.json</a>`;
  });

  // ---- O: build vs buy, USD per year (buy = card price range, build = low / mid / high scenarios) ----
  const cost = document.getElementById("gaCost");
  if (cost) fetch("data/charts/opt1_build_vs_buy.json").then(r => r.json()).then(d => {
    const M = v => "$" + (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    const by = Object.fromEntries(d.build.map(x => [x.scenario, x.build_total_usd_yr]));
    const narrow = cost.clientWidth < 600;
    const rows = [
      { label: narrow ? "Buy (card)" : "Buy Galactica (card)", value: d.buy.mid, txt: `${M(d.buy.low)}–${M(d.buy.high)}`, hl: true },
      { label: narrow ? "Build, low" : "Build, low inputs", value: by.low, txt: M(by.low), color: "rgba(11,11,11,.16)" },
      { label: narrow ? "Build, mid" : "Build, mid inputs", value: by.mid, txt: M(by.mid), color: "rgba(11,11,11,.55)" },
      { label: narrow ? "Build, high" : "Build, high inputs", value: by.high, txt: M(by.high), color: "rgba(11,11,11,.16)" },
    ];
    const txt = Object.fromEntries(rows.map(r => [r.value, r.txt]));
    KC.bar(cost, { data: rows, rowH: narrow ? 52 : 64, labelWidth: narrow ? 120 : 270, fmt: v => txt[v] || M(v) });
  });
})();
