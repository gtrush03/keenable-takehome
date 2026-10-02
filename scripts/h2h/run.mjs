// Fintech head-to-head: same 40 queries (4 segments) + 7 point-in-time events through every provider that is reachable,
// then the blind judge. One command (add any keys you have; missing ones are reported as NEEDS KEY and skipped):
//   TAVILY_API_KEY=... EXA_API_KEY=... BRAVE_API_KEY=... SERPAPI_API_KEY=... PARALLEL_API_KEY=... node scripts/h2h/run.mjs
// Options: --merge (keep other providers from the previous latest_raw.json)   --providers keenable,tavily   --limit 10 (first N queries)   --no-pit   --charts (also rewrite data/charts/opt2_h2h.json)
// Providers run concurrently; each is paced at its own rps (Keenable keyless <= 1.8 rps: shared per-IP pool).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PROVIDERS, availability } from "./providers.mjs";
import { judge } from "./judge.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const keys = JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8"));
const limit = +(arg("--limit") || keys.queries.length);
keys.queries = keys.queries.slice(0, limit);
if (process.argv.includes("--no-pit")) keys.pit_events = [];
const want = (arg("--providers") || Object.keys(PROVIDERS).join(",")).split(",");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(p, body) {
  const t0 = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await p.search(body);
      return { ok: true, ms: Math.round(performance.now() - t0), server_ms: r.server_ms, cost_usd: r.cost_usd, n: r.results.length, results: r.results };
    } catch (e) {
      if (attempt < 2 && (e.status === 429 || e.status >= 500)) { await sleep(1500 * (attempt + 1)); continue; }
      return { ok: false, ms: Math.round(performance.now() - t0), status: e.status || 0, error: e.message };
    }
  }
}

async function runProvider(id) {
  const p = PROVIDERS[id], av = availability(id);
  const meta = { label: p.label, fence: p.fence, price_per_1k: p.price_per_1k, price_floor_per_1k: p.price_floor_per_1k, price_note: p.price_note };
  if (!av.ready) return [id, { ...meta, ran: false, status: av.status }];
  const out = { ...meta, ran: true, auth: av.auth, now: {}, pit: {} };
  const gap = 1000 / p.rps;
  const jobs = [
    ...(p.pit_only ? [] : keys.queries.map((q) => ["now", q.id, { query: q.q }])),
    ...keys.pit_events.map((e) => ["pit", e.q, { query: e.q, cutoff: e.cutoff }]),
  ];
  for (const [arm, key, body] of jobs) {
    const t = Date.now();
    out[arm][key] = await call(p, body);
    const r = out[arm][key];
    process.stderr.write(`${id.padEnd(16)} ${arm} ${r.ok ? String(r.ms).padStart(5) + "ms n=" + r.n : "ERR " + r.error} | ${body.query.slice(0, 48)}\n`);
    const wait = gap - (Date.now() - t);
    if (wait > 0) await sleep(wait);
  }
  return [id, out];
}

const ran_at = new Date().toISOString();
let providers = Object.fromEntries((await Promise.all(want.map(runProvider))).map(([id, o]) => [id, { ...o, ran_at }]));
// --merge: keep providers from the previous latest_raw.json that were not re-run now (each keeps its own ran_at).
if (process.argv.includes("--merge")) {
  try { const prev = JSON.parse(readFileSync("data/h2h/latest_raw.json", "utf8")); providers = { ...Object.fromEntries(Object.entries(prev.providers).map(([id, o]) => [id, { ran_at: prev.ran_at, ...o }])), ...providers }; } catch {}
}
const raw = { ran_at, client: (typeof Bun !== "undefined" ? "bun " + Bun.version : "node " + process.version) + " on George's Mac mini (residential, San Francisco); latency = client wall-clock", keys, providers };
mkdirSync("data/h2h", { recursive: true });
const stamp = ran_at.replace(/[:.]/g, "-");
writeFileSync(`data/h2h/raw_${stamp}.json`, JSON.stringify(raw));
writeFileSync("data/h2h/latest_raw.json", JSON.stringify(raw));

const { packet, ...judged } = judge(raw);
writeFileSync("data/h2h/latest_judged.json", JSON.stringify({ source: `data/h2h/raw_${stamp}.json`, ran_at, ...judged }, null, 1));
writeFileSync("data/h2h/blind_packet.json", JSON.stringify({ note: "Provider names removed; labels are per-item.", ...packet }, null, 1));
if (process.argv.includes("--charts")) { mkdirSync("data/charts", { recursive: true });
writeFileSync("data/charts/opt2_h2h.json", JSON.stringify({
  title: "Fintech head-to-head: same queries, blind judge", ran_at, source: "data/h2h/latest_judged.json",
  rows: Object.entries(judged.board).map(([id, b]) => b.status ? { provider: id, label: b.label, status: b.status } : {
    provider: id, label: b.label, fence: b.fence, p50_ms: b.latency_ms.p50, p95_ms: b.latency_ms.p95, errors: b.errors,
    verified: b.now?.verified ?? null, judged: b.now?.judged ?? null, verified_rate: b.now?.verified_rate ?? null,
    pit_outcome_leaks: b.pit?.states_outcome ?? null, pit_results: b.pit?.results ?? null,
    list_per_1k: b.cost.list_per_1k, floor_per_1k: b.cost.floor_per_1k, usd_per_verified: b.cost.list_usd_per_verified_answer }),
}, null, 1)); }

console.log("\nprovider          status / p50 p95 | verified | PIT outcome leaks | $/1K list (floor)");
for (const [id, b] of Object.entries(judged.board)) {
  if (b.status) { console.log(`${id.padEnd(17)} ${b.status}`); continue; }
  console.log(`${id.padEnd(17)} ${b.latency_ms.p50}/${b.latency_ms.p95} ms | ${b.now ? `${b.now.verified}/${b.now.judged}` : "—"} | ${b.pit ? `${b.pit.states_outcome}/${b.pit.results}` : "—"} | $${b.cost.list_per_1k} ($${b.cost.floor_per_1k})${b.errors ? ` | ${b.errors} errors` : ""}`);
}
