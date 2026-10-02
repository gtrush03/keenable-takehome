// SP2 live demo, search side: run an inference platform's typical agent tool calls through Keenable as a hosted
// web_search tool, and report latency, results, cache behaviour and metering.
//
//   node channel/demo.mjs                       # keyless, <= 1.5 rps, ~45 calls, ~40 s
//   node channel/demo.mjs --queries my.jsonl    # bring the platform's own queries (same JSONL shape as eval/)
//
// Model side: runs a real tool loop only if FIREWORKS_API_KEY or OPENROUTER_API_KEY is already in the environment.
// Otherwise it writes out/transcript_STUB.md: real Keenable results, hand-written model turns, labelled as a stub.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHostedWebSearch, PRICE_PER_1K } from "./hosted-tool.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const queriesPath = arg("--queries", join(here, "queries.jsonl"));
const outDir = arg("--out", join(here, "out"));
mkdirSync(outDir, { recursive: true });

const queries = readFileSync(queriesPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const hit = (results, domains = []) => results.some((r) => domains.some((d) => host(r.url) === d || host(r.url).endsWith("." + d)));

const started = new Date().toISOString();
const rows = [];
const tools = { realtime: createHostedWebSearch({ mode: "realtime" }), pro: createHostedWebSearch({ mode: "pro" }) };
console.log(`Keenable auth: ${tools.realtime.auth} | ${queries.length} queries x 2 modes | paced <= 1.5 rps\n`);

for (const mode of ["realtime", "pro"]) {
  for (const q of queries) {
    try {
      const { results, meter } = await tools[mode].run({ query: q.query, max_results: 10 });
      const row = {
        id: q.id, segment: q.segment, mode, query: q.query, ms: meter.upstream_ms, n: results.length,
        expected_hit_top10: q.expected_domains ? hit(results, q.expected_domains) : null,
        expected_hit_top3: q.expected_domains ? hit(results.slice(0, 3), q.expected_domains) : null,
        dated_share: results.length ? +(results.filter((r) => r.published_at).length / results.length).toFixed(2) : 0,
        top3: results.slice(0, 3).map((r) => ({ title: r.title.slice(0, 90), url: r.url, published_at: r.published_at })),
      };
      rows.push(row);
      console.log(`${mode.padEnd(8)} ${String(row.ms).padStart(5)} ms  n=${String(row.n).padStart(2)}  ${row.expected_hit_top3 ? "top3" : row.expected_hit_top10 ? "top10" : "miss "}  ${q.id}  ${host(row.top3[0]?.url || "")}`);
    } catch (e) {
      rows.push({ id: q.id, segment: q.segment, mode, query: q.query, error: e.message });
      console.log(`${mode.padEnd(8)} ERROR ${q.id}: ${e.message}`);
    }
  }
}

// Cache: the same five calls again inside the TTL. These cost the platform nothing upstream.
const cacheRows = [];
for (const q of queries.slice(0, 5)) {
  const { meter } = await tools.realtime.run({ query: q.query, max_results: 10 });
  cacheRows.push({ id: q.id, total_ms: meter.total_ms, billed: meter.billed_keenable_requests, cache_hits: meter.cache_hits });
}

// Domain controls a client sends (Claude Code WebSearch has allowed_domains / blocked_domains).
const fan = await tools.realtime.run({ query: "tool calling function calling docs", allowed_domains: ["docs.fireworks.ai", "docs.together.ai"], max_results: 6 });
const blk = await tools.realtime.run({ query: "Fireworks AI Series D funding", blocked_domains: ["fireworks.ai"], max_results: 5 });
const domainDemo = {
  allowed_fanout: { legs: fan.meter.legs, billed: fan.meter.billed_keenable_requests, hosts: [...new Set(fan.results.map((r) => host(r.url)))], ms: fan.meter.upstream_ms },
  blocked_filter: { hosts: [...new Set(blk.results.map((r) => host(r.url)))], contains_blocked: blk.results.some((r) => host(r.url).endsWith("fireworks.ai")), ms: blk.meter.upstream_ms },
};

// Summary
const ok = rows.filter((r) => !r.error);
const byMode = Object.fromEntries(["realtime", "pro"].map((m) => {
  const rs = ok.filter((r) => r.mode === m), ms = rs.map((r) => r.ms), withExp = rs.filter((r) => r.expected_hit_top10 != null);
  return [m, {
    calls: rs.length, errors: rows.filter((r) => r.mode === m && r.error).length,
    p50_ms: pct(ms, 50), p95_ms: pct(ms, 95), max_ms: Math.max(...ms),
    mean_results: +(rs.reduce((s, r) => s + r.n, 0) / (rs.length || 1)).toFixed(1),
    expected_domain_top3: `${withExp.filter((r) => r.expected_hit_top3).length}/${withExp.length}`,
    expected_domain_top10: `${withExp.filter((r) => r.expected_hit_top10).length}/${withExp.length}`,
    dated_share_mean: +(rs.reduce((s, r) => s + r.dated_share, 0) / (rs.length || 1)).toFixed(2),
  }];
}));
const bySegment = {};
for (const r of ok) {
  const k = `${r.segment}/${r.mode}`; (bySegment[k] ||= { ms: [], top10: 0, n: 0 });
  bySegment[k].ms.push(r.ms); bySegment[k].n++; if (r.expected_hit_top10) bySegment[k].top10++;
}
for (const k of Object.keys(bySegment)) { const s = bySegment[k]; bySegment[k] = { calls: s.n, p50_ms: pct(s.ms, 50), p95_ms: pct(s.ms, 95), expected_top10: `${s.top10}/${s.n}` }; }

const billing = {
  realtime: { frontier: tools.realtime.bill(PRICE_PER_1K.frontier), payg: tools.realtime.bill(PRICE_PER_1K.payg) },
  pro: { frontier: tools.pro.bill(PRICE_PER_1K.frontier), payg: tools.pro.bill(PRICE_PER_1K.payg) },
};

// Model side
const modelSide = await runModelSide(tools.realtime);

const report = {
  _meta: {
    what: "SP2 search-side demo: platform-hosted web_search backed by Keenable",
    started, finished: new Date().toISOString(), endpoint: "https://api.keenable.ai/v1/search/public (keyless)",
    pacing: "kit pacer, <= 1.5 rps (rule: <= 2 rps)", queries: queriesPath,
    caveats: [
      "Latency is measured from this machine (Mac, residential/office network, US West unverified) to Keenable US East; a platform calling from its own cloud region sees lower network time.",
      "Keyless tier only. The keyed tier and dedicated Frontier capacity were not measured.",
      "expected_domain hit is a domain proxy for relevance, not a graded judgment.",
    ],
  },
  by_mode: byMode, by_segment: bySegment, cache: cacheRows, domain_controls: domainDemo, billing,
  ledger: { realtime: tools.realtime.ledger, pro: tools.pro.ledger }, rows, model_side: modelSide,
};
writeFileSync(join(outDir, "demo_report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(outDir, "DEMO.md"), renderMd(report));
console.log("\n" + JSON.stringify(byMode, null, 1));
console.log(`\ncache replay: ${cacheRows.map((c) => `${c.total_ms}ms/billed ${c.billed}`).join(", ")}`);
console.log(`model side: ${modelSide.status}`);
console.log(`wrote ${join(outDir, "demo_report.json")} and DEMO.md`);

async function runModelSide(tool) {
  const PROMPT = "Which inference platforms launched hosted web search tools for their models in 2026, and which search providers do they use? Cite URLs.";
  const key = process.env.FIREWORKS_API_KEY ? "FIREWORKS_API_KEY" : process.env.OPENROUTER_API_KEY ? "OPENROUTER_API_KEY" : null;
  if (!key) {
    const r1 = await tool.run({ query: "inference platform hosted tools web search launch 2026", max_results: 5 });
    const r2 = await tool.run({ query: "Baseten Hosted Tools Keenable Exa Parallel You.com", max_results: 5 });
    const fmt = (res) => res.results.map((x, i) => `[${i + 1}] ${x.title} (${x.url})${x.published_at ? ` [${x.published_at.slice(0, 10)}]` : ""}`).join("\n");
    const md = `# Model-side transcript: STUB

> **STUB.** No FIREWORKS_API_KEY or OPENROUTER_API_KEY was in the environment (NEEDS KEY: FIREWORKS_API_KEY).
> The two tool results below are **real** Keenable responses captured by this run (${new Date().toISOString()}).
> The model turns are **hand-written placeholders** that show the request/response shape; no model produced them.

**User:** ${PROMPT}

**Assistant (STUB, would be e.g. accounts/fireworks/models/<open model> on Fireworks):** tool call \`web_search({"query":"inference platform hosted tools web search launch 2026"})\`

**Platform executes server-side via Keenable** (${r1.meter.upstream_ms} ms, billed Keenable requests: ${r1.meter.billed_keenable_requests}):
\`\`\`
${fmt(r1)}
\`\`\`

**Assistant (STUB):** tool call \`web_search({"query":"Baseten Hosted Tools Keenable Exa Parallel You.com"})\`

**Platform executes server-side via Keenable** (${r2.meter.upstream_ms} ms):
\`\`\`
${fmt(r2)}
\`\`\`

**Assistant (STUB):** [final answer with citations would be generated here from the results above]

To run it for real: \`FIREWORKS_API_KEY=... node channel/demo.mjs\` (model: \`KIT_FW_MODEL\`, default accounts/fireworks/models/deepseek-v3p1).
`;
    writeFileSync(join(outDir, "transcript_STUB.md"), md);
    return { status: "STUB (NEEDS KEY: FIREWORKS_API_KEY or OPENROUTER_API_KEY)", file: join(outDir, "transcript_STUB.md"), real_tool_calls: [r1.meter, r2.meter] };
  }
  const { default: OpenAI } = await import("openai");
  const fw = key === "FIREWORKS_API_KEY";
  const client = new OpenAI({ apiKey: process.env[key], baseURL: fw ? "https://api.fireworks.ai/inference/v1" : "https://openrouter.ai/api/v1" });
  const model = fw ? process.env.KIT_FW_MODEL || "accounts/fireworks/models/deepseek-v3p1" : process.env.KIT_OR_MODEL || "deepseek/deepseek-chat-v3.1";
  const webSearch = { type: "function", function: { name: "web_search", description: "Search the web. Returns titles, URLs, snippets and dates.", parameters: { type: "object", properties: { query: { type: "string" }, allowed_domains: { type: "array", items: { type: "string" } }, blocked_domains: { type: "array", items: { type: "string" } } }, required: ["query"] } } };
  const messages = [{ role: "user", content: PROMPT }];
  const turns = [];
  const t0 = performance.now();
  for (let step = 0; step < 6; step++) {
    const r = await client.chat.completions.create({ model, messages, tools: [webSearch] });
    const msg = r.choices[0].message; messages.push(msg);
    if (!msg.tool_calls?.length) { turns.push({ role: "assistant", content: msg.content }); break; }
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments || "{}");
      const { results, meter } = await tool.run(args);
      turns.push({ role: "tool", args, ms: meter.upstream_ms, n: results.length });
      messages.push({ role: "tool", tool_call_id: call.id, content: results.map((x, i) => `[${i + 1}] ${x.title} (${x.url})\n${x.snippet}`).join("\n\n") });
    }
  }
  const md = `# Model-side transcript: LIVE (${key}, ${model})\n\n` + turns.map((t) => t.role === "tool" ? `- tool web_search ${JSON.stringify(t.args)} -> ${t.n} results, ${t.ms} ms` : `\n**Assistant:** ${t.content}`).join("\n");
  writeFileSync(join(outDir, "transcript_LIVE.md"), md);
  return { status: `LIVE via ${key}`, model, wall_ms: Math.round(performance.now() - t0), turns };
}

function renderMd(r) {
  const m = r.by_mode;
  const line = (k) => `| ${k} | ${m[k].calls} | ${m[k].errors} | ${m[k].p50_ms} | ${m[k].p95_ms} | ${m[k].max_ms} | ${m[k].mean_results} | ${m[k].expected_domain_top3} | ${m[k].expected_domain_top10} | ${m[k].dated_share_mean} |`;
  const seg = Object.entries(r.by_segment).map(([k, v]) => `| ${k} | ${v.calls} | ${v.p50_ms} | ${v.p95_ms} | ${v.expected_top10} |`).join("\n");
  return `# Hosted web_search on Keenable: search-side demo

Run ${r._meta.started} → ${r._meta.finished}. Endpoint: ${r._meta.endpoint}. Pacing: ${r._meta.pacing}.
Produced by \`kit/channel/demo.mjs\`; raw rows in \`demo_report.json\`.

## Latency and results by mode

| mode | calls | errors | p50 ms | p95 ms | max ms | mean results | expected domain in top 3 | in top 10 | share dated |
|---|---|---|---|---|---|---|---|---|---|
${line("realtime")}
${line("pro")}

## By workload segment

| segment/mode | calls | p50 ms | p95 ms | expected domain top 10 |
|---|---|---|---|---|
${seg}

## Cache replay (same calls inside TTL)

${r.cache.map((c) => `- ${c.id}: ${c.total_ms} ms, billed Keenable requests ${c.billed}, cache hits ${c.cache_hits}`).join("\n")}

## Client domain controls

- allowed_domains [2 domains] → ${r.domain_controls.allowed_fanout.legs} parallel legs, ${r.domain_controls.allowed_fanout.billed} billed requests, hosts: ${r.domain_controls.allowed_fanout.hosts.join(", ")}
- blocked_domains [fireworks.ai] → hosts: ${r.domain_controls.blocked_filter.hosts.join(", ")}; contains blocked: ${r.domain_controls.blocked_filter.contains_blocked}

## Metering (what the platform invoice would show for this run)

- realtime: ${r.billing.realtime.payg.tool_calls} tool calls → ${r.billing.realtime.payg.keenable_requests} Keenable requests → $${r.billing.realtime.frontier.usd} at $1/1K, $${r.billing.realtime.payg.usd} at $4/1K
- pro: ${r.billing.pro.payg.tool_calls} tool calls → ${r.billing.pro.payg.keenable_requests} Keenable requests → $${r.billing.pro.frontier.usd} at $1/1K, $${r.billing.pro.payg.usd} at $4/1K

## Model side

${r.model_side.status}${r.model_side.file ? ` — see \`${r.model_side.file.split("/kit/")[1] ? "kit/" + r.model_side.file.split("/kit/")[1] : r.model_side.file}\`` : ""}

## Caveats

${r._meta.caveats.map((c) => `- ${c}`).join("\n")}
`;
}
