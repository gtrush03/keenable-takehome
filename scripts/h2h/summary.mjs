// Writes data/h2h/SUMMARY.md from data/h2h/latest_judged.json + pit_llm.json (no hand-typed numbers).
//   bun scripts/h2h/summary.mjs
import { readFileSync, writeFileSync } from "node:fs";
const jd = JSON.parse(readFileSync("data/h2h/latest_judged.json", "utf8"));
const raw = JSON.parse(readFileSync("data/h2h/latest_raw.json", "utf8"));
const llm = JSON.parse(readFileSync("data/h2h/pit_llm.json", "utf8"));
const ORDER = ["keenable", "keenable_nofence", "keenable_pubdate", "tavily", "exa", "linkup", "firecrawl", "parallel", "serper", "searchapi", "youcom", "valyu", "jina", "serpapi", "brave", "perplexity"];
const WHY = { serpapi: "not run: signup needs phone verification", brave: "not run: free plan needs a credit card", perplexity: "not run: API is prepaid, needs a payment method", youcom: "not run: key issued but $0 free credit (HTTP 402 payment_required)", jina: "not run: key needs a paid top-up (0 free tokens)", valyu: "not run: terms forbid benchmarking for publication without written consent; signup not completed" };
const f = (x) => (x == null ? "—" : x);
const rows = ORDER.map((id) => {
  const b = jd.board[id], L = llm.board[id], p = raw.providers[id];
  if (!b || b.status) return `| ${id} | ${WHY[id] || b?.status || "not run"} | | | | | | | |`;
  const ranAt = (p.ran_at || raw.ran_at).slice(11, 16) + "Z";
  return `| ${b.label} | ${b.fence.split(" (")[0].replace(/\|/g, "/")} · ran ${ranAt} | ${b.latency_ms.p50} / ${b.latency_ms.p95} | ${b.cost.list_per_1k == null ? "n/a" : `$${b.cost.list_per_1k} ($${b.cost.floor_per_1k})`} | ${b.now ? `${b.now.verified}/${b.now.judged}` : "—"} | ${b.now ? `${b.now.gold_top10}/${b.now.queries}` : "—"} | ${b.pit.states_outcome}/${b.pit.results} | ${L ? `${L["leaks-outcome"]}/${L.results_labelled}` : "—"} | ${L ? `${L["useful-pre-event-evidence"]}/${L.results_labelled}` : "—"} | ${b.pit.acquired_after_cutoff} / ${b.pit.published_after_cutoff} | ${b.errors} |`;
});
const md = `# Fintech head-to-head: tonight's run (MEASURED)

Run ${raw.ran_at} (Keenable arms ${raw.providers.keenable?.ran_at || raw.ran_at}) from ${raw.client}. Judged ${jd.judged_at}; PIT LLM judge ${llm.judged_at} (${llm.model}, ${llm.calls} calls, ${llm.failed} failed).
Raw: \`${jd.source}\` · judged: \`data/h2h/latest_judged.json\` · LLM labels: \`data/h2h/pit_llm.json\` · blind packet: \`data/h2h/blind_packet.json\`.

| Provider | Date filter · ran | p50 / p95 ms (all calls) | $/1K list (floor) | Now: verified /39 | Now: primary source top 10 /40 | PIT states outcome (regex) | PIT states outcome (LLM) | PIT useful pre-event (LLM) | PIT acquired / published after cutoff | Errors |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

**Manual review of the LLM "states outcome" flags** (title + snippet, by me): Keenable query_time ${llm.board.keenable?.["leaks-outcome"]} flagged, 1 genuine (blockworks.co FTX tag page: acquired 2022-06-28, text from 2024); the rest are the Jan-2022 deal announcement, stock-quote pages and another company's bankruptcy. Linkup ${llm.board.linkup?.["leaks-outcome"]} flagged, 14 genuine (most undated pages that its toDate filter lets through). Other rivals' flags were not hand-reviewed.

${kitLine()}

## Caveats
- **Latency**: client wall-clock incl. TLS from a residential Mac mini in San Francisco; not server time. Keenable ran keyed (\`/v1/search\`, pro). Rivals are on free tiers; Firecrawl's free tier caps at ~10 req/min, so it was re-run at 0.15 rps.
- **SearchAPI** free tier allows ~20 calls/hour, so it ran the 7 events + the first 10 now queries only (verified /9).
- **n**: 40 "now" queries (39 judged; 1 answer not public yet) and 7 point-in-time events × top 10 = up to 70 results per arm. Small n: read differences of a few results as noise.
- **Judges**: "now" = rule judge (expected primary-source domain in top 10, or a fact-strength regex in a title/snippet; fixed in scripts/h2h/queries.json before any run). PIT = blind LLM judge (${llm.model} via OpenRouter, provider names hidden, one 10-result list per call), labels and definitions = JEV_CRITERIA from data/fence_relevance.json; regex column = outcome regex fixed before runs. Snippets only, not full pages. The LLM judge over-flags (see manual review).
- **Fences**: each provider uses its own best native "before this date" filter (see column). Parallel has none (after_date only), so its PIT arm is unfenced. Keenable query_time fences on acquisition time; every other filter fences on a published date.
- **Prices**: list prices read from each pricing page on 2026-10-01 (notes in scripts/h2h/providers.mjs). Not run: SerpApi (phone), Brave (card), Perplexity (card). No paid plan, card or phone was used.
- **ToS**: keyword scan of Tavily, Exa, Parallel, Linkup and Firecrawl terms found no clause forbidding publishing benchmark results (not a legal read). Results are shown privately to Keenable, unlisted.
`;
function kitLine() {
  try {
    const out = readFileSync("kit/eval/out/fintech_rivals.stdout", "utf8").split("\n").filter((l) => /^(keenable|tavily|exa|parallel|arm)/.test(l));
    return "**Second harness (kit/eval, same 40 queries + 7 dated, run separately; `kit/eval/out/fintech_rivals/VERDICT.md`):**\n\n```\n" + out.join("\n") + "\n```";
  } catch { return ""; }
}
writeFileSync("data/h2h/SUMMARY.md", md);
console.log(md);
