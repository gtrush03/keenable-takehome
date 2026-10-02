// Fireworks deck: the hosted-tool adapter's search side, in the browser. A port of planSearch / cache / meter from
// kit/channel/hosted-tool.mjs: one allowed domain becomes Keenable's `site`, repeats inside the TTL are served from cache
// and not billed, each call writes one ledger row. Recorded rows: kit/channel/out/demo_report.json (realtime, 2026-10-01).
(() => {
  const form = document.getElementById("fwForm"); if (!form) return;
  const REC = [{"id": "code-01", "q": "Next.js 16 middleware renamed proxy migration", "ms": 606, "top3": [{"title": "Next.js 16 Migration Guide: Everything That Breaks (And How to Fix It)", "url": "https://codewithseb.com/blog/nextjs-16-migration-guide-breaking-changes"}, {"title": "Next.js \"middleware is deprecated, please use proxy\": the migration guide", "url": "https://reqkey.com/blog/nextjs-middleware-deprecated-use-proxy"}, {"title": "Next.js 16 Renamed middleware.ts to proxy.ts", "url": "https://konadu.dev/nextjs-16-middleware-renamed-to-proxy"}]}, {"id": "code-02", "q": "TypeError: Cannot read properties of undefined (reading 'map') React useEffect fetch", "ms": 203, "top3": [{"title": "Fix TypeError: Cannot read properties of undefined (reading 'map') in React", "url": "https://errornotes.dev/en/errors/react/fix-typeerror-cannot-read-properties-of-undefined-reading-map-in-react"}, {"title": "How to fix Cannot read properties of undefined (reading 'map') in React", "url": "https://deverrors.com/errors/react-cannot-read-map-undefined"}, {"title": "Cannot read properties of undefined (reading 'map') in React | bobbyhadz", "url": "https://bobbyhadz.com/blog/react-typeerror-cannot-read-property-map-of-undefined"}]}, {"id": "code-03", "q": "pydantic v2 model_validator mode before example", "ms": 201, "top3": [{"title": "Migrating @root_validator to @model_validator in Pydantic v2", "url": "https://fastapi-patterns.com/advanced-pydantic-validation-serialization/pydantic-v2-migration-guide/root-validator-to-model-validator"}, {"title": "Designing Resilient Pydantic v2 Schemas: Advanced Validation, Custom Serialization, and Er", "url": "https://karya-semi.vercel.app/blog/designing-resilient-pydantic-v2-schemas-advanced-validation-serialization"}, {"title": "Pydantic v2 Textbook Ch. 3 — Validators in Depth", "url": "https://blog.rajpoot.dev/textbooks/pydantic/03-validators"}]}, {"id": "code-04", "q": "vLLM tool calling parser for Qwen3 hermes flag", "ms": 206, "top3": [{"title": "joshuaeric/vllm-tool-calling-guide · Hugging Face", "url": "https://huggingface.co/joshuaeric/vllm-tool-calling-guide?library=hermes"}, {"title": "Turning Qwen3-8B-AWQ into an agent: a production design of Qwen-Agent × function calling", "url": "https://tomodahinata.com/en/blog/qwen3-agent-tool-use-function-calling-qwen-agent-production"}, {"title": "oh-my-pi/docs/toolconv/qwen3.md at main · can1357/oh-my-pi", "url": "https://github.com/can1357/oh-my-pi/blob/main/docs/toolconv/qwen3.md"}]}, {"id": "code-05", "q": "rust tokio select! cancel safety", "ms": 268, "top3": [{"title": "select in tokio - Rust", "url": "https://docs.rs/tokio/latest/tokio/macro.select.html"}, {"title": "Chapter 34: select!, Cancellation, and Timeouts", "url": "https://lavkushry.github.io/The-Rust-Mastery-Handbook/part-05/chapter-34-select-cancellation-and-timeouts.html"}, {"title": "Lesson 10: Cancellation Safety — The silent footgun -", "url": "https://atharvapandey.com/post/rust/rust-async-cancellation"}]}, {"id": "code-06", "q": "postgres 18 release notes asynchronous I/O", "ms": 298, "top3": [{"title": "PostgreSQL: Release Notes", "url": "https://postgresql.org/docs/release/18"}, {"title": "PostgreSQL 18 features and upgrade notes", "url": "https://pg.edu.rich/en/docs/reference/postgresql-18"}, {"title": "Postgres 18 Async I/O: Faster Scans, One Catch", "url": "https://blogs.abhipanseriya.dev/blog/postgres-18-stopped-reading-one-block-at-a-time"}]}, {"id": "code-07", "q": "Model Context Protocol specification streamable HTTP transport", "ms": 345, "top3": [{"title": "Streamable HTTP", "url": "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http"}, {"title": "Transports", "url": "https://modelcontextprotocol.io/specification/2025-11-25/basic/transports"}, {"title": "modelcontextprotocol/docs/specification/2026-07-28/basic/transports/streamable-http.mdx at", "url": "https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx"}]}, {"id": "code-08", "q": "Fireworks AI function calling API docs", "ms": 298, "top3": [{"title": "Tool Calling", "url": "https://docs.fireworks.ai/guides/function-calling"}, {"title": "Tool Calling - Fireworks AI Docs", "url": "https://fireworks.ai/docs/guides/function-calling"}, {"title": "Serverless Quickstart", "url": "https://docs.fireworks.ai/getting-started/quickstart"}]}];
  const DOMAINS = { "code-01": "nextjs.org", "code-02": "react.dev", "code-03": "docs.pydantic.dev", "code-04": "docs.vllm.ai", "code-05": "docs.rs", "code-06": "postgresql.org", "code-07": "modelcontextprotocol.io", "code-08": "docs.fireworks.ai" };
  const PRINTED = "code-07", TTL = 5 * 60_000, PER_1K = 1;
  const $ = (id) => document.getElementById(id), sel = $("fwQ"), dom = $("fwDom"), go = $("fwGo");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const call = (q, d) => JSON.stringify({ name: "web_search", input: d ? { query: q, allowed_domains: [d] } : { query: q } });
  const list = (rows) => rows.slice(0, 3).map(r => `<li><span class="t">${esc(r.title || r.url)}</span><span class="h">${esc(host(r.url))}</span></li>`).join("");
  // the ledger is simulated at list price: the keyless endpoint bills nothing. `total` = billable calls in this session.
  const ledger = (x) => `<span>legs <b>${x.legs}</b></span><span>${x.hit ? "cache hit" : "upstream"} <b>${x.ms} ms</b></span><span>billable <b>${x.billed}</b></span><span>session, live calls <b>$${(x.total * PER_1K / 1000).toFixed(3)}</b> simulated at list price ($1/1K)</span>`;
  const inDomain = (u, d) => !d || host(u) === d || host(u).endsWith("." + d);
  REC.forEach((r, i) => sel.add(new Option(r.q, i)));
  const cache = new Map(); let billed = 0, busy = false;
  const domain = () => dom.value === "1" ? DOMAINS[REC[+sel.value].id] : null;
  const show = (rows, x, label) => { $("fwRes").innerHTML = list(rows) || `<li><span class="t">No results.</span></li>`; $("fwLedger").innerHTML = ledger(x) + `<span class="lbl">${label}</span>`; };
  // the recorded run had no domain filter: with allowed_domains on, show only its rows on that domain
  const showRecorded = () => {
    const r = REC[+sel.value], d = domain(), rows = r.top3.filter(x => inDomain(x.url, d));
    show(rows, { legs: 1, ms: r.ms, billed: 1, hit: false, total: billed }, d ? `recorded run, 1 Oct 2026, filtered to ${d}. Press Run for a live call` : "recorded run, 1 Oct 2026");
  };
  const sync = () => { const r = REC[+sel.value]; dom.options[1].text = `allowed_domains: ${DOMAINS[r.id]}`; $("fwCall").textContent = call(r.q, domain()); showRecorded(); };
  sel.addEventListener("change", sync);
  dom.addEventListener("change", sync);
  sel.value = String(REC.findIndex(r => r.id === PRINTED)); sel.dispatchEvent(new Event("change"));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); if (busy) return;
    const r = REC[+sel.value], d = domain();
    const req = { query: r.q, mode: "realtime", max_results: 10, ...(d ? { site: d } : {}) }, key = JSON.stringify(req), hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) { const c0 = performance.now(); show(hit.rows, { legs: 1, ms: Math.round(performance.now() - c0), billed: 0, hit: true, total: billed }, "served from the adapter cache"); return; }
    busy = true; [sel, dom, go].forEach(x => x.disabled = true); $("fwLedger").textContent = "Calling Keenable…";
    const t0 = performance.now();
    try {
      const res = await fetch("https://api.keenable.ai/v1/search/public?keenable_title=keenable-platform-take-home", { method: "POST", headers: { "content-type": "application/json" }, body: key, signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error(res.status === 429 ? "rate limited" : "HTTP " + res.status);
      const j = await res.json(), ms = Math.round(performance.now() - t0), rows = (j.results || []).filter(x => inDomain(x.url, d));
      cache.set(key, { at: Date.now(), rows }); billed++;
      show(rows, { legs: 1, ms, billed: 1, hit: false, total: billed }, "live from your browser. Run it again: cache hit");
    } catch (err) { $("fwLedger").textContent = `Live call failed (${err.message || "network"}); not billed. The list shows the previous result; this request failed.`; }
    finally { setTimeout(() => { busy = false; [sel, dom, go].forEach(x => x.disabled = false); }, 1500); }
  });
  const p = REC.find(r => r.id === PRINTED);
  $("fwPrint").innerHTML = `<pre class="fw-call">${esc(call(p.q, null))}</pre><ol class="fw-res">${list(p.top3)}</ol><p class="fw-ledger">${ledger({ legs: 1, ms: p.ms, billed: 1, hit: false, total: 1 })}<span class="lbl">repeat inside TTL: served from cache, 0 billed</span></p>`;
})();
