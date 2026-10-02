// Stress ramp against Keenable's keyless endpoint: open-loop arrivals at 0.5 -> 1 -> 1.5 -> 2 rps (never above 2 rps).
// Open loop = requests fire on a fixed clock whether or not earlier ones returned, so slow responses can't hide load.
// Usage: node scripts/fintech_stress.mjs [stage_seconds=60] [out.json]
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://api.keenable.ai/v1/search/public";
const TITLE = "keenable-fintech-research";
const STAGES = [0.5, 1.0, 1.5, 2.0];
const STAGE_S = +(process.argv[2] || 60);
const MAX_RPS = 2;

// rotating fintech workload (all four segments) — mixed pro/realtime, some point-in-time
const W = [
  { query: "Danske Bank Estonia money laundering investigation" },
  { query: "OFAC sanctions designation Russia bank 2026", mode: "realtime" },
  { query: "FOMC statement federal funds rate decision" },
  { query: "Wirecard Markus Braun trial verdict", mode: "realtime" },
  { query: "Silicon Valley Bank deposit outflows", query_time: "2023-03-09" },
  { query: "Middesk business verification API" },
  { query: "NVIDIA quarterly earnings data center revenue", mode: "realtime" },
  { query: "FinCEN enforcement action money services business" },
  { query: "Credit Suisse UBS merger", query_time: "2023-03-17" },
  { query: "Companies House Revolut Ltd filing history", mode: "realtime" },
  { query: "SOFR rate today" },
  { query: "1MDB Jho Low arrest warrant", mode: "realtime" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pct(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

async function one(body) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json", "X-Keenable-Title": TITLE }, body: JSON.stringify({ max_results: 10, snippet_max_length: 200, ...body }) });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0), n: j?.results?.length ?? null, remaining: r.headers.get("x-ratelimit-remaining"), error: r.ok ? undefined : (j?.error || j?.message || String(r.status)) };
  } catch (e) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: e.name + ": " + e.message };
  }
}

const ran_at = new Date().toISOString();
const stages = [];
let k = 0;
for (const rps of STAGES) {
  if (rps > MAX_RPS) throw new Error("rps cap");
  const interval = 1000 / rps, count = Math.round(STAGE_S * rps), t0 = Date.now(), pending = [];
  for (let i = 0; i < count; i++) {
    const wait = t0 + i * interval - Date.now();
    if (wait > 0) await sleep(wait);
    const body = W[k++ % W.length];
    const sent = Date.now() - t0;
    pending.push(one(body).then((r) => ({ ...r, sent_ms: sent, mode: body.mode || "pro", pit: !!body.query_time })));
  }
  const res = await Promise.all(pending);
  const ok = res.filter((r) => r.ok), lat = ok.map((r) => r.ms);
  const codes = {};
  for (const r of res) codes[r.status] = (codes[r.status] || 0) + 1;
  const s = {
    target_rps: rps, sent: res.length, achieved_send_rps: +(res.length / ((res.at(-1).sent_ms || 1) / 1000 + interval / 1000)).toFixed(2),
    ok: ok.length, errors: res.length - ok.length, error_rate: +((res.length - ok.length) / res.length).toFixed(4), status_codes: codes,
    p50_ms: pct(lat, 0.5), p95_ms: pct(lat, 0.95), p99_ms: pct(lat, 0.99), max_ms: lat.length ? Math.max(...lat) : null,
    pro_p50_ms: pct(ok.filter((r) => r.mode === "pro" && !r.pit).map((r) => r.ms), 0.5),
    realtime_p50_ms: pct(ok.filter((r) => r.mode === "realtime").map((r) => r.ms), 0.5),
    pit_p50_ms: pct(ok.filter((r) => r.pit).map((r) => r.ms), 0.5),
    empty_results: ok.filter((r) => r.n === 0).length,
    ratelimit_remaining_end: res.at(-1).remaining, samples: res,
  };
  stages.push(s);
  process.stderr.write(`stage ${rps} rps: ${s.ok}/${s.sent} ok, p50 ${s.p50_ms} p95 ${s.p95_ms} p99 ${s.p99_ms} ms, codes ${JSON.stringify(codes)}, remaining ${s.ratelimit_remaining_end}\n`);
  await sleep(3000);
}

const out = {
  ran_at, endpoint: BASE, auth: "keyless public endpoint (per-IP pool: 1,000/h, 10 rps; https://docs.keenable.ai/rate-limits)",
  method: `open-loop fixed-rate arrivals, ${STAGE_S}s per stage, ramp ${STAGES.join(" -> ")} rps, hard cap ${MAX_RPS} rps; 12-query rotating fintech workload (pro, realtime, point-in-time)`,
  client: "Mac, residential ISP; latency = wall time incl. TLS + body read (not server time)", node: process.version,
  caveat: "Keyless pool is shared per IP and capped at 10 rps; this test probes our client-side tail at <=2 rps, not Keenable's production capacity (100+ RPS Frontier is a contracted tier).",
  stages,
};
mkdirSync("data", { recursive: true });
writeFileSync(process.argv[3] || "data/fintech_stress.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(stages.map(({ samples, ...s }) => s), null, 1));
