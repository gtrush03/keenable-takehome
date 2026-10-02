// Fintech deck: live query box. One POST per click to Keenable's keyless CORS endpoint, query_time on or off.
// Presets are the seven fence-test events with the recipe phrasing; the prepared rows (and the printed state) come from
// data/fence_relevance.json, arm "query_time + pre-event terms + period", run 2026-10-01.
(() => {
  const form = document.getElementById("fxForm"); if (!form) return;
  const ARM = "query_time + pre-event terms + period", PRINTED = "2023-06-01", N = 5;
  const SHORT = { "Microsoft / Activision Blizzard": "Activision", "Silicon Valley Bank / SVB Financial Group": "SVB", "Credit Suisse / UBS": "Credit Suisse", "Sam Bankman-Fried": "SBF" };
  const $ = (id) => document.getElementById(id), sel = $("fxEv"), q = $("fxQ"), tm = $("fxTm"), dt = $("fxDate"), go = $("fxGo");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  // acquired at or after midnight UTC of the cutoff day = after the fence (same rule as scripts/fence_relevance.py)
  const isLate = (acq, cut) => !!acq && Date.parse(acq) >= Date.parse(cut + "T00:00:00Z");
  const list = (rows, cut) => rows.slice(0, N).map(r => {
    const late = cut && isLate(r.acquired_at, cut);
    return `<li class="${late ? "late" : ""}"><span class="t">${esc(r.title || r.url)}</span><span class="h">${esc(host(r.url))} · acquired ${esc((r.acquired_at || "unknown").slice(0, 10))}</span></li>`;
  }).join("");
  const meter = (rows, cut) => { const top = rows.slice(0, 10), n = top.length, late = top.filter(r => isLate(r.acquired_at, cut)).length, unk = top.filter(r => !r.acquired_at).length;
    return `Acquired after ${esc(cut)}: <b class="${late ? "bad" : unk ? "" : "ok"}">${late}/${n}</b>` + (unk ? ` · <b class="bad">${unk}</b> date unknown, not checked` : ""); };
  fetch("../../data/fence_relevance.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    const evs = Object.keys(d.events).sort().map(k => ({ k, name: SHORT[d.events[k].entity] || d.events[k].entity,
      q: d.searches.find(s => s.cutoff === k && s.arm === ARM).query, rows: d.rows.filter(r => r.cutoff === k && r.arm === ARM) }));
    evs.forEach((e, i) => sel.add(new Option(`${e.name} · cutoff ${e.k}`, i)));
    const pick = () => { const e = evs[+sel.value]; q.value = e.q; dt.value = e.k; };
    const show = (rows, cut, label) => { $("fxRes").innerHTML = list(rows, cut) || `<li><span class="t">No results.</span></li>`; $("fxMeter").innerHTML = (cut ? meter(rows, cut) + " · " : "") + label; };
    sel.addEventListener("change", () => { pick(); const e = evs[+sel.value]; show(e.rows, e.k, "recorded run, 1 Oct 2026. Press Search to go live."); });
    sel.value = String(evs.findIndex(e => e.k === PRINTED)); sel.dispatchEvent(new Event("change"));
    let busy = false;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault(); if (busy || !q.value.trim()) return;
      busy = true; [sel, q, tm, dt, go].forEach(x => x.disabled = true); $("fxMeter").textContent = "Searching…";
      const cut = tm.checked && dt.value ? dt.value : null, body = { query: q.value.trim(), mode: "pro", max_results: 10 };
      if (cut) body.query_time = cut + "T00:00:00Z";
      const t0 = performance.now();
      try {
        const r = await fetch("https://api.keenable.ai/v1/search/public?keenable_title=keenable-fintech-take-home", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) });
        if (!r.ok) throw new Error(r.status === 429 ? "rate limited" : "HTTP " + r.status);
        const j = await r.json(), ms = Math.round(performance.now() - t0);
        show(j.results || [], cut || dt.value, `live, ${ms} ms, ${cut ? "query_time on" : "no fence"}`);
      } catch (err) { $("fxMeter").textContent = `Live call failed (${err.message || "network"}). The list shows the previous result; this request failed.`; }
      finally { setTimeout(() => { busy = false; [sel, q, tm, dt, go].forEach(x => x.disabled = false); }, 1500); }
    });
    const p = evs.find(e => e.k === PRINTED);
    $("fxPrint").innerHTML = `<p class="fx-meter"><code>${esc(p.q)}</code> · query_time ${p.k} · ${meter(p.rows, p.k)}</p><ol class="fx-res">${list(p.rows, p.k)}</ol>`;
  }).catch(() => {
    $("fxMeter").textContent = "Could not load the recorded run (fence_relevance.json). Reload to retry.";
    $("fxPrint").innerHTML = `<p class="fx-meter">Could not load the recorded run.</p>`;
  });
})();
