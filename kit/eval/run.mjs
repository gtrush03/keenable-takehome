#!/usr/bin/env node
// Bring-your-own-benchmark runner. One command:
//   node eval/run.mjs --queries my.jsonl --providers keenable,tavily
// Options:
//   --queries <file.jsonl|file.csv>   required. Fields: id, query, expected_domains?, expected_regex?, regex_strength?,
//                                     query_time?, gold_answer?, leak_regex?, segment?
//   --providers a,b                   default: keenable. Known: see eval/providers.mjs. Missing keys => NEEDS KEY, skipped.
//   --out <dir>                       default: eval/out/<queries file name>
//   --k 10                            results per query
//   --limit N                         first N queries only
//   --monthly 1000000,10000000        volumes for the sizing table   --peak-rps N   buyer's stated peak, for the memo
//   --seed N                          blinding seed (default 20261001)
//   --rejudge                         re-score an existing <out>/results.jsonl without calling any provider
//   --no-llm                          skip the LLM judge even if a model key is set
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { PROVIDERS, availability } from "./providers.mjs";
import { loadQueries } from "./load.mjs";
import { blind, aggregate } from "./judge.mjs";
import { runLlmJudge } from "./llm-judge.mjs";
import { renderVerdict } from "./verdict.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => process.stderr.write(s + "\n");

export async function callProvider(p, body) {
  const t0 = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await p.search(body);
      // request_ms (when the adapter reports it) excludes time spent waiting on the client-side pacer.
      return { ok: true, ms: r.request_ms ?? Math.round(performance.now() - t0), server_ms: r.server_ms ?? null, cost_usd: r.cost_usd ?? null, served_mode: r.served_mode ?? null, results: r.results };
    } catch (e) {
      if (attempt < 2 && (e.status === 429 || e.status >= 500)) { await sleep(1500 * (attempt + 1)); continue; }
      return { ok: false, ms: Math.round(performance.now() - t0), status: e.status || 0, error: e.message, results: [] };
    }
  }
}

async function runArm(id, items, k) {
  const p = PROVIDERS[id], av = availability(id);
  const meta = { label: p?.label || id, fence: p?.fence, price_per_1k: p?.price_per_1k, price_floor_per_1k: p?.price_floor_per_1k, price_note: p?.price_note };
  if (!av.ready) { log(`${id.padEnd(18)} ${av.status}`); return [id, { ...meta, ran: false, status: av.status }]; }
  const out = { ...meta, ran: true, auth: av.auth, calls: {} };
  const gap = id.startsWith("keenable") ? 0 : 1000 / p.rps; // Keenable arms share the client's process-wide pacer
  for (const it of items) {
    const t = Date.now();
    const r = await callProvider(p, { query: it.query, query_time: it.query_time, k });
    out.calls[it.id] = r;
    log(`${id.padEnd(18)} ${it.id.padEnd(10)} ${r.ok ? `${String(r.ms).padStart(5)}ms n=${r.results.length}` : `ERR ${r.error}`}`);
    const wait = gap - (Date.now() - t);
    if (wait > 0) await sleep(wait);
  }
  return [id, out];
}

export async function evaluate({ queriesPath, providers, outDir, k = 10, limit, seed = 20261001, volumes, peakRps, llm = true, rejudge = false }) {
  const raw = readFileSync(queriesPath);
  let items = loadQueries(queriesPath);
  if (limit) items = items.slice(0, limit);
  mkdirSync(outDir, { recursive: true });
  const resultsPath = join(outDir, "results.jsonl");

  let run;
  if (rejudge) {
    if (!existsSync(resultsPath)) throw new Error(`--rejudge needs ${resultsPath}`);
    const lines = readFileSync(resultsPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const prov = {};
    for (const l of lines) {
      prov[l.provider] ||= { label: l.label, fence: l.fence, price_per_1k: l.price_per_1k, price_floor_per_1k: l.price_floor_per_1k, price_note: l.price_note, ran: true, auth: l.auth, calls: {} };
      prov[l.provider].calls[l.id] = l.call;
    }
    for (const id of providers) if (!prov[id]) { const av = availability(id); prov[id] = { label: PROVIDERS[id]?.label || id, ran: false, status: av.ready ? "not in results.jsonl" : av.status }; }
    run = { items, providers: prov, ran_at: lines[0]?.ran_at || null };
  } else {
    const ran_at = new Date().toISOString();
    const arms = Object.fromEntries(await Promise.all(providers.map((id) => runArm(id, items, k))));
    run = { items, providers: arms, ran_at };
    const lines = [];
    for (const [pid, p] of Object.entries(arms)) if (p.ran) for (const it of items) {
      lines.push(JSON.stringify({ ran_at, provider: pid, label: p.label, auth: p.auth, fence: p.fence, price_per_1k: p.price_per_1k, price_floor_per_1k: p.price_floor_per_1k, price_note: p.price_note, id: it.id, query: it.query, query_time: it.query_time, call: p.calls[it.id] }));
    }
    writeFileSync(resultsPath, lines.join("\n") + (lines.length ? "\n" : ""));
  }

  const { verdicts, packet } = blind(run, seed);
  const llmRun = llm ? await runLlmJudge(packet) : { backend: null, results: null, status: "disabled with --no-llm" };
  const { board, pairwise, perItem } = aggregate(run, verdicts, llmRun.results);

  // Re-write results.jsonl with the unblinded scores appended, so every line is self-contained.
  const scored = readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean).map((l) => {
    const o = JSON.parse(l);
    const s = perItem[o.provider]?.[o.id];
    if (s) { const { item, ...score } = s; o.score = score; }
    return JSON.stringify(o);
  });
  writeFileSync(resultsPath, scored.join("\n") + (scored.length ? "\n" : ""));

  // Observations the verdict should surface, computed from raw results (not from the judge).
  const notes = [];
  const kp = run.providers.keenable, kr = run.providers.keenable_realtime;
  if (kp?.ran && kr?.ran) {
    const ids = items.map((i) => i.id).filter((id) => kp.calls[id]?.ok && kr.calls[id]?.ok);
    const same = ids.filter((id) => JSON.stringify(kp.calls[id].results.map((x) => x.url)) === JSON.stringify(kr.calls[id].results.map((x) => x.url))).length;
    notes.push(`Keenable pro and realtime returned identical URL lists for ${same}/${ids.length} queries (served mode echoed as requested), so on this endpoint the two modes differ in latency only, if at all.`);
  }
  const summary = {
    meta: {
      set_name: basename(queriesPath).replace(/\.(jsonl|csv)$/i, ""), queries_path: queriesPath, queries_sha256: createHash("sha256").update(raw).digest("hex"),
      items: items.length, ran_at: run.ran_at, judged_at: new Date().toISOString(), seed, k,
      client: `node ${process.version} on ${process.platform}`,
      judge_rules: {
        verified: "expected primary domain in top 10 OR a fact-strength expected_regex in a top-10 title/snippet; topic-strength regex counts toward on_topic only",
        hit_at_k: "first expected domain at rank <= k (queries with expected_domains only)",
        pit: "for queries with query_time: acquired_after_query_time (index leak), outcome_leaks (leak_regex in a top-10 title/snippet), published_after_query_time (content-date check)",
        blinding: "arms relabelled A.. per query in seeded random order before scoring; see blind_packet.json",
      },
    },
    notes, board, pairwise,
    llm: { backend: llmRun.backend, status: llmRun.status || null, judged_items: llmRun.judged_items || 0, errors: llmRun.errors || [] },
    verdicts,
  };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 1));
  writeFileSync(join(outDir, "blind_packet.json"), JSON.stringify({ note: "Provider names removed; labels are per query.", seed, items: packet }, null, 1));
  const md = renderVerdict(summary, { volumes, peakRps });
  writeFileSync(join(outDir, "VERDICT.md"), md);
  return { summary, md, outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const queriesPath = arg("--queries");
  if (!queriesPath) { console.error("usage: node eval/run.mjs --queries my.jsonl [--providers keenable,tavily] [--out dir]"); process.exit(2); }
  const providers = arg("--providers", "keenable").split(",").map((s) => s.trim()).filter(Boolean);
  const outDir = arg("--out", join("eval", "out", basename(queriesPath).replace(/\.(jsonl|csv)$/i, "")));
  const volumes = arg("--monthly") ? arg("--monthly").split(",").map(Number) : undefined;
  const { summary, outDir: dir } = await evaluate({
    queriesPath, providers, outDir, k: +arg("--k", 10), limit: arg("--limit") ? +arg("--limit") : undefined,
    seed: +arg("--seed", 20261001), volumes, peakRps: arg("--peak-rps") ? +arg("--peak-rps") : null, llm: !flag("--no-llm"), rejudge: flag("--rejudge"),
  });
  console.log(`\narm                 verified   hit@3   p50/p95/p99 ms     PIT index/outcome/content-date   $/verified (list)`);
  for (const [id, b] of Object.entries(summary.board)) {
    if (b.status) { console.log(`${id.padEnd(19)} ${b.status}`); continue; }
    const q = b.quality;
    console.log(`${id.padEnd(19)} ${`${q.verified}/${q.judged}`.padEnd(10)} ${String(q.hit_at[3]).padEnd(7)} ${`${b.latency_ms.p50}/${b.latency_ms.p95}/${b.latency_ms.p99}`.padEnd(18)} ${(b.pit ? `${b.pit.acquired_after_query_time}/${b.pit.outcome_leaks ?? "-"}/${b.pit.published_after_query_time}` : "-").padEnd(32)} ${b.cost.list_usd_per_verified ?? "-"}${b.errors ? `  (${b.errors} errors)` : ""}`);
  }
  console.log(`LLM judge: ${summary.llm.backend ? `${summary.llm.backend.name} ${summary.llm.backend.model}, ${summary.llm.judged_items} items` : summary.llm.status}`);
  console.log(`\nwrote ${dir}/results.jsonl, summary.json, blind_packet.json, VERDICT.md`);
}
