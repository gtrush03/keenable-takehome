// Fintech chapter (P→R→O→O→F). Every number is read from data/*.json at load; nothing is typed in by hand here.
//   #fxGrid    data/fintech_judged.json → summary.lookahead (no fence, outcome stated per event)
//   #flip*     data/fence_relevance.json → rows (the v1 demo runs, raw Jev labels per result)
//   #live*     Keenable keyless CORS endpoint, one request per click; recorded run from fence_relevance rows
//   #fxCost    data/fintech_cost_model.json → scenarios
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = (s) => (s ? String(s).slice(0, 10) : "unknown");
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const json = (u) => fetch(u).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
  const narrow = () => matchMedia("(max-width: 700px)").matches;
  const SHORT = { "Microsoft / Activision Blizzard": "Activision", "Silicon Valley Bank / SVB Financial Group": "SVB", "Credit Suisse / UBS": "Credit Suisse", "Sam Bankman-Fried": "SBF", "Nvidia": "Nvidia" };
  const short = (name) => SHORT[name] || name.split(/[ /]/)[0];
  // acquired at or after midnight UTC of the cutoff day = after the fence (same rule as scripts/fence_relevance.py)
  const isLate = (acq, cut) => !!acq && Date.parse(acq) >= Date.parse(cut + "T00:00:00Z");

  /* ---------- P: 6 × 10 unit grid ---------- */
  const grid = $("fxGrid");
  if (grid) json("data/fintech_judged.json").then(d => {
    const name = (q) => q.match(/^(Microsoft|Silicon Valley Bank|Credit Suisse|FTX|Nvidia|Sam Bankman-Fried)/)?.[0]
      .replace("Microsoft", "Activision").replace("Silicon Valley Bank", "SVB").replace("Sam Bankman-Fried", "SBF") || q;
    grid.innerHTML = d.summary.lookahead.map(e => {
      const n = e.now.states_outcome;
      return `<div class="row"><span class="ev">${esc(name(e.q))}<small>${esc(e.cutoff)}</small></span><span class="cells">${
        Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span><b>${n}</b></div>`;
    }).join("");
  }).catch(() => { grid.textContent = "Could not load data/fintech_judged.json"; });

  /* ---------- R: fence relevance rows, shared by the flip and the live box's recorded run ---------- */
  const fence = ($("flipEv") || $("liveForm")) ? json("data/fence_relevance.json") : null;
  const LABEL = { "leaks-outcome": ["reveals outcome", "bad"], "useful-pre-event-evidence": ["useful", "good"], "related-but-weak": ["weak", ""], "irrelevant": ["off-topic", ""] };
  const row = (r, cut) => {
    const [lab, cls] = LABEL[r.jev_adj] || [r.jev_adj, ""], late = isLate(r.acquired_at, cut);
    return `<li><a class="t" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title || host(r.url))}</a><span class="m"><span class="tag ${cls}">${esc(lab)}</span><span class="${late ? "late" : ""}">acquired ${esc(day(r.acquired_at))}</span><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(host(r.url))}</a></span></li>`;
  };

  /* ---------- R: TRY IT, pick an event, switch the fence ---------- */
  const ARMS = [["no fence", "No fence"], ["published_before", "Publish date"], ["query_time", "query_time"]];
  if ($("flipEv")) fence.then(d => {
    const evs = Object.keys(d.events).sort().map(k => ({ k, name: short(d.events[k].entity) }));
    const rowsFor = (k, arm) => d.rows.filter(r => r.cutoff === k && r.arm === arm);
    const count = (rs) => ({ useful: rs.filter(r => r.jev_adj === "useful-pre-event-evidence").length, leaks: rs.filter(r => r.jev_adj === "leaks-outcome").length, late: rs.filter(r => r.acq_after).length, unk: rs.filter(r => !r.acquired_at).length, n: rs.length });
    const meter = (c, arm) => `<span class="${arm === "query_time" ? "us" : ""}"><b>${c.useful}</b>/${c.n} useful</span><span class="${c.leaks ? "bad" : ""}"><b>${c.leaks}</b>/${c.n} reveal the outcome</span><span class="${c.late ? "bad" : ""}"><b>${c.late}</b>/${c.n} crawled after the cutoff</span>` + (c.unk ? `<span class="bad"><b>${c.unk}</b> crawl date unknown</span>` : "");
    let ev = evs.findIndex(e => e.k === "2022-11-08"), arm = "no fence";
    if (ev < 0) ev = 0;
    $("flipEv").innerHTML = evs.map((e, i) => `<button type="button" data-i="${i}">${esc(e.name)}</button>`).join("");
    $("flipArm").innerHTML = ARMS.map(([a, l]) => `<button type="button" data-a="${esc(a)}">${esc(l)}</button>`).join("");
    const render = () => {
      const e = evs[ev], rs = rowsFor(e.k, arm), c = count(rs);
      $("flipEv").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.i === ev));
      $("flipArm").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.a === arm));
      $("flipMeter").innerHTML = `<span class="ev">${esc(e.name)} · cutoff ${esc(e.k)}</span>` + meter(c, arm);
      $("flipRows").innerHTML = rs.slice(0, narrow() ? 2 : 3).map(r => row(r, e.k)).join("");
    };
    $("flipEv").addEventListener("click", ev2 => { const b = ev2.target.closest("button"); if (b) { ev = +b.dataset.i; render(); } });
    $("flipArm").addEventListener("click", ev2 => { const b = ev2.target.closest("button"); if (b) { arm = b.dataset.a; render(); } });
    render();
    // printed state: the frame that makes the point, SBF the day before sentencing, no fence vs query_time
    const P = evs.find(e => e.k === "2024-03-27") || evs[0];
    $("flipPrint").innerHTML = `<p class="fx-pev">${esc(P.name)} · cutoff ${esc(P.k)}</p><div class="fx-two">` + [ARMS[0], ARMS[2]].map(([a, l]) => {
      const rs = rowsFor(P.k, a);
      return `<div><p class="k">${esc(l)}</p><div class="fx-meter">${meter(count(rs), a)}</div><ol class="fx-rows">${rs.slice(0, 2).map(r => row(r, P.k)).join("")}</ol></div>`;
    }).join("") + `</div><p class="ix-printed-note">Printed state: SBF. On the web, pick any of seven events and three fences.</p>`;
  }).catch(() => { $("flipRows").innerHTML = $("flipPrint").innerHTML = "<li>Could not load data/fence_relevance.json</li>"; });

  /* ---------- R: LIVE, run it yourself (keyless CORS endpoint; fixes carried over from sites/fintech/site.js) ---------- */
  const form = $("liveForm");
  if (form) {
    const q = $("liveQ"), dt = $("liveDate"), tm = $("liveTm"), go = $("liveGo"), out = $("liveRows"), meter = $("liveMeter");
    const PRESET = { cutoff: "2023-03-09", arm: "query_time + pre-event terms + period" };
    let recorded = null, busy = false, liveShown = false;
    q.value = "SVB Financial Group deposits liquidity securities losses capital raise March 2023"; dt.value = PRESET.cutoff;
    // results always render against what the form held when the request was sent, never the live form
    const show = (results, label, ms, st, cls) => {
      const cut = st.tm ? st.date : null, list = results.slice(0, 10);
      const late = cut ? list.filter(r => isLate(r.acquired_at, cut)).length : null;
      const unk = cut ? list.filter(r => !r.acquired_at).length : 0;
      out.innerHTML = list.slice(0, narrow() ? 1 : 4).map(r => `<li><a class="t" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title || host(r.url))}</a><span class="m"><span class="${cut && isLate(r.acquired_at, cut) ? "late" : ""}">acquired ${esc(day(r.acquired_at))}</span><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(host(r.url))}</a></span></li>`).join("") || `<li>No results.</li>`;
      meter.innerHTML = `<span class="fx-pill ${cls || ""}">${esc(label)}</span>` + (cut ? `<span class="${late ? "bad" : unk ? "" : "us"}"><b>${late}</b>/${list.length} acquired after ${esc(cut)}</span>` : `<span>no fence: ${list.length} results</span>`)
        + (unk ? `<span class="bad"><b>${unk}</b> acquired_at unknown, not checked</span>` : "") + (ms != null ? `<span>${ms} ms from your browser</span>` : "");
    };
    const isPreset = (st) => st.tm && st.date === PRESET.cutoff && st.q === q.defaultValue;
    q.defaultValue = q.value;
    fence.then(d => {
      recorded = d.rows.filter(r => r.cutoff === PRESET.cutoff && r.arm === PRESET.arm);
      const s = d.searches.find(x => x.cutoff === PRESET.cutoff && x.arm === PRESET.arm), when = s ? s.fetched_at.slice(0, 10) : "2026-10-01";
      if (!busy && !liveShown) show(recorded, narrow() ? `Recorded ${when}` : `Recorded ${when} · press Search to go live`, null, { tm: true, date: PRESET.cutoff }, "mute");
      $("livePrint").innerHTML = `<p class="fx-pev mono">${esc(q.defaultValue)} · query_time ${PRESET.cutoff}</p><div class="fx-meter"><span class="us"><b>${recorded.filter(r => r.acq_after).length}</b>/${recorded.length} acquired after the cutoff</span><span>recorded ${esc(when)}</span></div><ol class="fx-rows">${
        recorded.slice(0, 3).map(r => `<li><a class="t" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title || host(r.url))}</a><span class="m"><span>acquired ${esc(day(r.acquired_at))}</span><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(host(r.url))}</a></span></li>`).join("")}</ol><p class="ix-printed-note">Printed state: recorded run. On the web this box queries the live index.</p>`;
    }).catch(() => {
      if (!busy && !liveShown) meter.innerHTML = `<span class="fx-pill warn">Recorded run unavailable</span><span>press Search to go live</span>`;
      $("livePrint").innerHTML = `<p class="ix-printed-note">Could not load data/fence_relevance.json.</p>`;
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); if (busy || !q.value.trim()) return;
      const st = { q: q.value.trim(), date: dt.value, tm: tm.checked && !!dt.value };
      const body = { query: st.q, mode: "pro", max_results: 10 }; if (st.tm) body.query_time = st.date + "T00:00:00Z";
      const lock = (on) => [q, dt, tm, go].forEach(el => { el.disabled = on; });
      busy = true; lock(true); meter.innerHTML = `<span class="fx-pill">Searching…</span>`;
      const t0 = performance.now();
      try {
        const r = await fetch("https://api.keenable.ai/v1/search/public?keenable_title=keenable-v2-fintech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) });
        const ms = Math.round(performance.now() - t0);
        if (!r.ok) throw new Error(r.status === 429 ? "rate limited (429)" : "HTTP " + r.status);
        const j = await r.json();
        liveShown = true; show(j.results || [], st.tm ? "Live · fence on" : "Live · no fence", ms, st, "good");
      } catch (err) {
        const why = err.name === "TimeoutError" ? "timeout" : (err.message || "network");
        if (recorded && isPreset(st) && !liveShown) show(recorded, `Recorded run (live failed: ${why})`, null, st, "warn");
        else { meter.innerHTML = `<span class="fx-pill warn">Live call failed: ${esc(why)}</span>`; out.innerHTML = `<li>This request failed; no results shown. Try again in a few seconds.</li>`; }
      } finally { setTimeout(() => { busy = false; lock(false); }, 1500); }
    });
  }

  /* ---------- O · Order: annual cost at list price ---------- */
  const cost = $("fxCost");
  if (cost && window.KC) json("data/fintech_cost_model.json").then(d => {
    const S = Object.fromEntries(d.scenarios.map(s => [s.id, s])), nw = cost.clientWidth < 600;
    const fund = S.equity_research_agent_50_analysts, kyc = S.aml_screening_1m_monthly, bt = S.pit_backtest_run;
    const data = [
      { label: nw ? "Fund · pay-go" : "Fund research agent · pay-go", value: fund.annual_cost_usd.keenable_paygo_net, hl: true, note: fund.description },
      { label: nw ? "KYC · pay-go" : "KYC screen, 1M/mo · pay-go", value: kyc.annual_cost_usd.keenable_paygo_net, note: kyc.description },
      { label: nw ? "KYC · Frontier" : "KYC screen, 1M/mo · Frontier", value: kyc.annual_cost_usd.keenable_frontier, note: kyc.burst_note },
      { label: nw ? "Backtest · pay-go" : "One backtest run · pay-go", value: bt.cost_per_run_usd.keenable_paygo, note: bt.description },
      { label: nw ? "Backtest · Frontier" : "One backtest run · Frontier", value: bt.cost_per_run_usd.keenable_frontier, note: bt.description },
    ];
    KC.bar(cost, { data, rowH: nw ? 44 : 44, labelWidth: nw ? 200 : 330, color: "--ink-3", fmt: v => "$" + (v >= 1e4 ? Math.round(v / 1e3) : (v / 1e3).toFixed(1)) + "K" });
  }).catch(() => { cost.textContent = "Could not load data/fintech_cost_model.json"; });
})();
