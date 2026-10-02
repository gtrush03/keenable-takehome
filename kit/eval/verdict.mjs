// Turns summary.json into VERDICT.md: one page, winner per metric, caveats, a pilot proposal and volume/price sizing.
// Keenable list prices (keenable.ai/pricing, read 2026-10-01): $4/1K pay-go, $1/1K at 100+ RPS, 100K requests/month free.
// Competitor prices come from each adapter's price_per_1k / price_floor_per_1k (sources in eval/providers.mjs).

const SECONDS_PER_MONTH = 30 * 86400;
export const KEENABLE = { paygo_per_1k: 4, frontier_per_1k: 1, frontier_min_rps: 100, free_per_month: 100000 };

export function keenableMonthlyCost(monthly) {
  const avgRps = monthly / SECONDS_PER_MONTH;
  return {
    avg_rps: avgRps,
    paygo_usd: (Math.max(0, monthly - KEENABLE.free_per_month) / 1000) * KEENABLE.paygo_per_1k,
    frontier_usd: (monthly / 1000) * KEENABLE.frontier_per_1k,
    frontier_eligible_on_average: avgRps >= KEENABLE.frontier_min_rps,
  };
}

export function sizing(board, volumes) {
  return volumes.map((m) => {
    const k = keenableMonthlyCost(m);
    const others = Object.fromEntries(Object.entries(board).filter(([id, b]) => !b.status && !id.startsWith("keenable")).map(([id, b]) => [id, { list_usd: (m / 1000) * b.cost.list_per_1k, floor_usd: (m / 1000) * b.cost.floor_per_1k }]));
    return { monthly: m, ...k, others };
  });
}

const fmt$ = (x) => (x == null ? "n/a" : x >= 1000 ? `$${Math.round(x).toLocaleString("en-US")}` : `$${x.toFixed(x < 1 ? 3 : 2)}`);
const fmtN = (x) => (x >= 1e6 ? `${x / 1e6}M` : x >= 1e3 ? `${x / 1e3}K` : String(x));
const pctS = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(0)}%`);

// Winner per metric among providers that ran. better = "max" | "min". Returns { metric, winners[], value, note }.
export function winners(board, pairwise) {
  const ran = Object.entries(board).filter(([, b]) => !b.status);
  const pick = (metric, get, better, unit = "") => {
    const vals = ran.map(([id, b]) => [id, get(b)]).filter(([, v]) => v != null);
    if (!vals.length) return { metric, winners: [], value: null, note: "no data" };
    const best = better === "max" ? Math.max(...vals.map(([, v]) => v)) : Math.min(...vals.map(([, v]) => v));
    const w = vals.filter(([, v]) => v === best).map(([id]) => id);
    return { metric, winners: w, value: best, unit, tie: w.length > 1, n_compared: vals.length };
  };
  const rows = [
    pick("Verified rate (rule judge)", (b) => b.quality.verified_rate, "max"),
    pick("Hit@1 (expected domain)", (b) => b.quality.hit_at[1], "max"),
    pick("Hit@3", (b) => b.quality.hit_at[3], "max"),
    pick("Hit@10", (b) => b.quality.hit_at[10], "max"),
    pick("LLM-judged supported", (b) => (b.quality.llm_judged ? b.quality.llm_supported / b.quality.llm_judged : null), "max"),
    pick("Latency p50", (b) => b.latency_ms.p50, "min", " ms"),
    pick("Latency p95", (b) => b.latency_ms.p95, "min", " ms"),
    pick("Latency p99", (b) => b.latency_ms.p99, "min", " ms"),
    pick("PIT index leaks (acquired after query_time)", (b) => b.pit?.acquired_after_query_time, "min"),
    pick("PIT outcome leaks (result states the later outcome)", (b) => b.pit?.outcome_leaks, "min"),
    pick("PIT content-date flags (published_at after query_time)", (b) => b.pit?.published_after_query_time, "min"),
    pick("List price per 1K", (b) => b.cost.list_per_1k, "min", "$"),
    pick("List cost per verified answer", (b) => b.cost.list_usd_per_verified, "min", "$"),
  ];
  const v = rows[0];
  if (v.winners.length === 1 && ran.length > 1) {
    const ps = pairwise.filter((p) => p.a === v.winners[0] || p.b === v.winners[0]);
    v.note = ps.map((p) => `vs ${p.a === v.winners[0] ? p.b : p.a}: ${p.a === v.winners[0] ? p.a_only : p.b_only} wins / ${p.a === v.winners[0] ? p.b_only : p.a_only} losses, McNemar p=${p.mcnemar_p}`).join("; ");
  }
  return rows;
}

export function renderVerdict(summary, { volumes = [1e6, 1e7, 1e8], peakRps = null } = {}) {
  const { board, pairwise, meta } = summary;
  const ran = Object.entries(board).filter(([, b]) => !b.status);
  const skipped = Object.entries(board).filter(([, b]) => b.status);
  const W = winners(board, pairwise);
  const k = board.keenable || ran.find(([id]) => id.startsWith("keenable"))?.[1];
  const kid = board.keenable ? "keenable" : ran.find(([id]) => id.startsWith("keenable"))?.[0];
  const L = [];

  L.push(`# Verdict: ${meta.set_name}`, "");
  L.push(`${meta.items} queries from \`${meta.queries_path}\` (sha256 ${meta.queries_sha256.slice(0, 12)}), run ${meta.ran_at}. Arms that ran: ${ran.map(([id]) => `**${id}**`).join(", ") || "none"}.` +
    (skipped.length ? ` Skipped: ${skipped.map(([id, b]) => `${id} (${b.status})`).join(", ")}.` : ""), "");

  if (k) {
    const q = k.quality;
    L.push("## Headline", "");
    L.push(`- **${kid}** verified **${q.verified}/${q.judged}** (${pctS(q.verified_rate)}, 95% CI ${pctS(q.verified_ci95[0])}–${pctS(q.verified_ci95[1])}); hit@1/3/10 on expected domains ${pctS(q.hit_at[1])} / ${pctS(q.hit_at[3])} / ${pctS(q.hit_at[10])} over ${q.domain_judged} queries.`);
    L.push(`- Latency (client wall-clock incl. TLS, ${meta.client}): p50 **${k.latency_ms.p50} ms**, p95 **${k.latency_ms.p95} ms**, p99 ${k.latency_ms.p99} ms over ${k.latency_ms.n} calls; ${k.errors} errors.`);
    if (k.pit) L.push(`- Point-in-time: ${k.pit.items} queries with query_time, ${k.pit.results} results. Index leaks (acquired after query_time): **${k.pit.acquired_after_query_time}**. Results stating the later outcome: **${k.pit.outcome_leaks ?? "n/a"}**. Results whose published_at is after query_time: **${k.pit.published_after_query_time}** (content-date check; ${k.pit.undated} undated).`);
    L.push(`- Cost: ${k.auth === "keyless" ? "this run billed $0 (keyless endpoint)" : `this run at list ${fmt$(k.cost.this_run_list_usd)}`}; at list price, **${fmt$(k.cost.list_usd_per_verified)} per verified answer** (${fmt$(k.cost.floor_usd_per_verified)} at the $1/1K tier).`, "");
  }

  L.push("## Winner per metric", "", "| Metric | Winner | Value | Note |", "|---|---|---|---|");
  for (const w of W) {
    const val = w.value == null ? "n/a" : w.unit === "$" ? fmt$(w.value) : w.metric.includes("rate") || w.metric.startsWith("Hit") || w.metric.startsWith("LLM") ? pctS(w.value) : `${w.value}${w.unit}`;
    const note = [w.tie && "tie", w.n_compared === 1 && "only one arm had data", w.note].filter(Boolean).join("; ");
    L.push(`| ${w.metric} | ${w.winners.join(", ") || "n/a"} | ${val} | ${note} |`);
  }
  L.push("");

  if (ran.length > 1) {
    L.push("| Arm | Verified | Hit@3 | p50 / p95 ms | PIT index / outcome / content-date | $ per verified (list) |", "|---|---|---|---|---|---|");
    for (const [id, b] of ran) L.push(`| ${id} | ${b.quality.verified}/${b.quality.judged} | ${pctS(b.quality.hit_at[3])} | ${b.latency_ms.p50} / ${b.latency_ms.p95} | ${b.pit ? `${b.pit.acquired_after_query_time} / ${b.pit.outcome_leaks ?? "n/a"} / ${b.pit.published_after_query_time}` : "n/a"} | ${fmt$(b.cost.list_usd_per_verified)} |`);
    L.push("");
  }

  L.push("## Sizing at list prices", "");
  const S = sizing(board, volumes);
  const comp = [...new Set(S.flatMap((s) => Object.keys(s.others)))];
  L.push(`| Monthly searches | Avg RPS | Keenable pay-go ($4/1K, first 100K free) | Keenable $1/1K tier (100+ RPS) |${comp.map((c) => ` ${c} list |`).join("")}`);
  L.push(`|---|---|---|---|${comp.map(() => "---|").join("")}`);
  for (const s of S) L.push(`| ${fmtN(s.monthly)} | ${s.avg_rps.toFixed(1)} | ${fmt$(s.paygo_usd)} | ${fmt$(s.frontier_usd)}${s.frontier_eligible_on_average ? "" : " (needs 100+ RPS capacity)"} |${comp.map((c) => ` ${fmt$(s.others[c]?.list_usd)} |`).join("")}`);
  L.push("", `100 RPS sustained is ${fmtN(100 * SECONDS_PER_MONTH)} searches a month. ASSUMPTION: the $1/1K tier is sold on provisioned 100+ RPS capacity, not average load${peakRps ? `; this buyer's stated peak is ${peakRps} RPS` : ""}; the 100K free allowance is applied to pay-go only. Annual = monthly × 12.`, "");

  L.push("## Pilot proposal", "");
  const p95 = k?.latency_ms.p95, lo = k?.quality.verified_ci95?.[0];
  L.push(`1. **Week 0: integration.** Drop the tool into the buyer's harness with this kit (OpenAI / Anthropic tool, MCP, AI SDK or LangChain adapter). Keyed endpoint, 100K free requests/month cover the pilot's evaluation traffic.`);
  L.push(`2. **Weeks 1–2: their benchmark.** Run \`eval/run.mjs\` on the buyer's own query set (held-out half fixed before any run) against their current provider(s). Same blind judge, their gold answers, their LLM judge if they want one.`);
  L.push(`3. **Weeks 3–4: shadow traffic.** Mirror a fixed share of production agent searches; compare answer-level outcomes, not only retrieval.`);
  L.push(`4. **Pass criteria (agreed up front, from this run):** verified rate ≥ ${lo != null ? pctS(lo) : "the lower CI bound measured here"} on the held-out set; p95 ≤ ${p95 ? `${Math.round(p95 * 1.25)} ms` : "agreed target"} measured from the buyer's region on the keyed endpoint; zero index leaks on query_time queries; outcome leaks no higher than the incumbent.`);
  L.push(`5. **Conversion:** on pass, a volume commitment sized from the table above (pick the row nearest the buyer's measured monthly search count), priced at pay-go below 100 RPS and at the $1/1K tier for provisioned 100+ RPS. Head of Revenue owns final terms.`, "");

  L.push("## What this does not prove", "");
  const cav = [
    ran.length < 2 ? "Only one search provider ran, so no head-to-head claim is made; competitor arms switch on when their env keys are set." : null,
    ran.every(([id]) => id.startsWith("keenable")) && ran.length > 1 ? "All arms that ran are Keenable modes; this compares pro vs realtime, not Keenable vs competitors." : null,
    "Rule judge: a result counts as verified when an expected primary domain is in the top 10 or a fact-strength regex appears in a top-10 title/snippet. It is strict and reproducible, and it is not a reader of full pages.",
    summary.llm?.backend ? `LLM judge: ${summary.llm.backend.name} ${summary.llm.backend.model} on ${summary.llm.judged_items} items with gold answers, blind to provider names.` : `LLM judge did not run (${summary.llm?.status || "no key"}).`,
    "Latency is client wall-clock from one residential connection, paced to ≤2 rps on the keyless endpoint; it is not server latency and not a load test.",
    "Point-in-time fences differ by provider: Keenable filters on acquisition time (query_time); others filter on a publish-date field, so their PIT numbers measure a weaker fence.",
    k?.pit?.published_after_query_time ? "A result acquired before query_time but carrying a published_at after it is flagged, not counted as an index leak. Two explanations fit and the API response cannot tell them apart: the stored copy was refreshed after first acquisition while acquired_at kept the first date (a tag or listing page that kept updating), or the page's date metadata is wrong. Either way, an agent replaying the past could read later content; check `pit.examples` in summary.json." : null,
    ...(summary.notes || []),
    `Sample size: ${meta.items} queries. Treat differences inside the 95% CI as ties.`,
  ].filter(Boolean);
  for (const c of cav) L.push(`- ${c}`);
  L.push("", `Files: \`results.jsonl\` (one line per arm × query), \`summary.json\`, \`blind_packet.json\` (evidence without provider names). Seed ${meta.seed}.`);
  return L.join("\n") + "\n";
}
