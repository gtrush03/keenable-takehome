// Keenable Time Machine head-to-head — live demo server.
//   bun sites/demo/server.ts            → http://127.0.0.1:7952/
// Serves the page (sites/demo/index.html, built by build.ts) and a small JSON API that runs live searches through the
// same adapters as scripts/h2h (keys stay server-side: read from macOS Keychain, else .env.keys; never sent to the browser).
// Binds 127.0.0.1 only. No writes outside data/h2h/pit_llm_cache.json (judge cache) and data/h2h/live/ (live run logs).
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, normalize } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const DEMO = import.meta.dir;
process.chdir(ROOT);

// --- keys: Keychain first, .env.keys second. Values only ever live in process.env of this process. ---
const KEYCHAIN: Record<string, string> = {
  KEENABLE_API_KEY: "keenable-api", OPENROUTER_API_KEY: "hackday-openrouter-api",
  TAVILY_API_KEY: "keenable-h2h-tavily", EXA_API_KEY: "keenable-h2h-exa", PARALLEL_API_KEY: "keenable-h2h-parallel",
  LINKUP_API_KEY: "keenable-h2h-linkup", FIRECRAWL_API_KEY: "keenable-h2h-firecrawl", SERPAPI_API_KEY: "keenable-h2h-serpapi",
  BRAVE_API_KEY: "keenable-h2h-brave", PERPLEXITY_API_KEY: "keenable-h2h-perplexity",
  SERPER_API_KEY: "keenable-h2h-serper", YOUCOM_API_KEY: "keenable-h2h-youcom", VALYU_API_KEY: "keenable-h2h-valyu",
  JINA_API_KEY: "keenable-h2h-jina", SEARCHAPI_API_KEY: "keenable-h2h-searchapi",
};
function loadKeys() {
  for (const [v, svc] of Object.entries(KEYCHAIN)) {
    if (process.env[v]) continue;
    const r = Bun.spawnSync(["security", "find-generic-password", "-s", svc, "-w"], { stderr: "ignore" });
    const val = r.success ? r.stdout.toString().trim() : "";
    if (val) process.env[v] = val;
  }
  const f = join(ROOT, ".env.keys");
  if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadKeys();

const { PROVIDERS, availability } = await import(join(ROOT, "scripts/h2h/providers.mjs"));
const { labelResults, MODEL } = await import(join(ROOT, "scripts/h2h/pit_judge.mjs"));
const KEYS = JSON.parse(readFileSync(join(ROOT, "scripts/h2h/queries.json"), "utf8"));
const EVENTS: any[] = KEYS.pit_events;
const ORDER = ["keenable", "keenable_nofence", "keenable_pubdate", "tavily", "exa", "linkup", "firecrawl", "parallel", "serper", "searchapi", "youcom", "valyu", "jina", "serpapi", "brave", "perplexity"];
// Providers whose key exists but cannot serve on a free tier (checked 2026-10-01): shown as not run, never called.
const DISABLED: Record<string, string> = { youcom: "key issued, but $0 free credit (HTTP 402 payment_required)" };
const ready = (id: string) => !DISABLED[id] && availability(id).ready;
const LIVE_DIR = join(ROOT, "data/h2h/live");
mkdirSync(LIVE_DIR, { recursive: true });

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
function flag(ev: any, r: any) {
  const cut = Date.parse(ev.cutoff + "T00:00:00Z");
  const rx = new RegExp(ev.outcome_regex, "i");
  const pub = r.published_at && !isNaN(Date.parse(r.published_at)) ? Date.parse(r.published_at) : null;
  const acq = r.acquired_at && !isNaN(Date.parse(r.acquired_at)) ? Date.parse(r.acquired_at) : null;
  return {
    t: (r.title || "").slice(0, 160), u: r.url, h: host(r.url), s: (r.snippet || "").slice(0, 260),
    pub: r.published_at || null, acq: r.acquired_at || null,
    rx: rx.test(`${r.title || ""} ${r.snippet || ""}`),
    pub_after: pub != null && pub >= cut, acq_after: acq != null && acq >= cut,
  };
}

// Per-provider pacing so a full live run stays inside free-tier and keyless rate limits.
const nextSlot: Record<string, number> = {};
async function paced<T>(id: string, rps: number, fn: () => Promise<T>) {
  const now = Date.now(), at = Math.max(now, nextSlot[id] || 0);
  nextSlot[id] = at + 1000 / rps;
  if (at > now) await Bun.sleep(at - now);
  return fn();
}

async function search(id: string, q: string) {
  const p = PROVIDERS[id], ev = EVENTS.find((e) => e.q === q);
  if (!p || !ev) return { ok: false, error: "unknown provider or event" };
  const av = availability(id);
  if (DISABLED[id] || !av.ready) return { ok: false, error: DISABLED[id] || av.status, skipped: true };
  return paced(id, p.rps, async () => {
    const t0 = performance.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await p.search({ query: ev.q, cutoff: ev.cutoff });
        const ms = Math.round(performance.now() - t0);
        const out = { ok: true, id, q, cutoff: ev.cutoff, ms, server_ms: r.server_ms ?? null, cost_usd: r.cost_usd ?? null, at: new Date().toISOString(), results: r.results.slice(0, 10).map((x: any) => flag(ev, x)) };
        appendFileSync(join(LIVE_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify({ ...out, raw: r.results.slice(0, 10) }) + "\n");
        return out;
      } catch (e: any) {
        if (attempt < 2 && (e.status === 429 || e.status >= 500)) { await Bun.sleep(1500 * (attempt + 1)); continue; }
        return { ok: false, id, q, ms: Math.round(performance.now() - t0), error: String(e.message || e).slice(0, 160) };
      }
    }
  });
}

// Judge queue: OpenRouter's new-account cap is 20 requests/min, so at most 3 in flight; cached repeats are instant.
let inflight = 0; const waiters: (() => void)[] = [];
async function judged(cutoff: string, results: any[]) {
  while (inflight >= 3) await new Promise<void>((r) => waiters.push(r));
  inflight++;
  try { return await labelResults(cutoff, results.map((x) => ({ title: x.t, url: x.u, snippet: x.s }))); }
  finally { inflight--; waiters.shift()?.(); }
}

const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".png": "image/png", ".js": "text/javascript", ".css": "text/css" };

Bun.serve({
  hostname: "127.0.0.1", port: Number(process.env.PORT || 7952), idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/status") {
      return json({
        live: true, judge: { ready: !!process.env.OPENROUTER_API_KEY, model: MODEL },
        providers: ORDER.filter((id) => PROVIDERS[id]).map((id) => {
          const p = PROVIDERS[id], av = availability(id);
          return { id, label: p.label, fence: p.fence, price_per_1k: p.price_per_1k, ready: ready(id), auth: av.auth || null, status: DISABLED[id] || av.status || null };
        }),
        events: EVENTS.map((e) => ({ q: e.q, cutoff: e.cutoff, event: e.event })),
      });
    }
    if (url.pathname === "/api/search" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      return json(await search(String(b.provider), String(b.q)));
    }
    if (url.pathname === "/api/judge" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!process.env.OPENROUTER_API_KEY) return json({ ok: false, error: "no judge key" });
      const out = await judged(String(b.cutoff), Array.isArray(b.results) ? b.results.slice(0, 10) : []);
      return json(out ? { ok: true, model: out.model, labels: out.labels, cached: !!out.cached } : { ok: false, error: "judge failed (rate limit?)" });
    }
    // static
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, "");
    if (!path || path.endsWith("/")) path += "index.html";
    if (path.includes("..")) return new Response("Not found", { status: 404 });
    const f = Bun.file(join(DEMO, path));
    if (!(await f.exists()) || path.endsWith(".ts")) return new Response("<!doctype html><title>Not found</title><p style='font:16px system-ui;padding:40px'>Not found. <a href='/'>Back to the demo</a></p>", { status: 404, headers: { "content-type": "text/html" } });
    const ext = path.slice(path.lastIndexOf("."));
    return new Response(f, { headers: { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": "no-store" } });
  },
});
console.log(`keenable demo → http://127.0.0.1:${process.env.PORT || 7952}/  (providers ready: ${ORDER.filter((id) => PROVIDERS[id] && ready(id)).join(", ")}; judge ${process.env.OPENROUTER_API_KEY ? "on" : "off"})`);
