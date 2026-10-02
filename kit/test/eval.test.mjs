// Offline tests for the eval runner: loading, blind judging, metrics, sizing and the verdict memo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { parseCSV, loadQueries, normalise } from "../eval/load.mjs";
import { scoreRules, blind, aggregate } from "../eval/judge.mjs";
import { pct, wilson, mcnemar } from "../eval/stats.mjs";
import { keenableMonthlyCost, renderVerdict, winners } from "../eval/verdict.mjs";
import { judgePrompt, parseJudgement } from "../eval/llm-judge.mjs";
import { PROVIDERS, availability } from "../eval/providers.mjs";
import { RESULTS } from "./helpers.mjs";

const tmp = new URL("../.cache/test/", import.meta.url).pathname;

test("CSV parser handles quotes, embedded commas and doubled quotes", () => {
  const rows = parseCSV('id,query,expected_domains\nq1,"a, b",sec.gov;www.Fed.gov\nq2,"say ""hi""",\n');
  assert.deepEqual(rows[0], { id: "q1", query: "a, b", expected_domains: "sec.gov;www.Fed.gov" });
  assert.equal(rows[1].query, 'say "hi"');
  assert.deepEqual(normalise(rows[0], 0).expected_domains, ["sec.gov", "fed.gov"]);
});

test("loader validates and both sample sets load", () => {
  mkdirSync(tmp, { recursive: true });
  writeFileSync(tmp + "bad.jsonl", '{"id":"a","query":"x","expected_regex":"("}\n');
  assert.throws(() => loadQueries(tmp + "bad.jsonl"), /bad expected_regex/);
  writeFileSync(tmp + "dup.jsonl", '{"id":"a","query":"x"}\n{"id":"a","query":"y"}\n');
  assert.throws(() => loadQueries(tmp + "dup.jsonl"), /duplicate id/);
  const fin = loadQueries(new URL("../eval/sets/fintech.jsonl", import.meta.url).pathname);
  assert.equal(fin.length, 47);
  assert.equal(fin.filter((q) => q.query_time).length, 7);
  const ag = loadQueries(new URL("../eval/sets/agentic.csv", import.meta.url).pathname);
  assert.ok(ag.length >= 12 && ag.every((q) => q.query));
});

test("rule judge: hit@k, fact vs topic regex, PIT leak checks", () => {
  const key = normalise({ id: "x", query: "q", expected_domains: ["sec.gov"], expected_regex: "46\\.7", regex_strength: "fact" }, 0);
  const s = scoreRules(RESULTS, key);
  assert.equal(s.domain_rank, 1);
  assert.deepEqual(s.hit, { 1: true, 3: true, 10: true });
  assert.equal(s.verified, true);
  const topicOnly = scoreRules(RESULTS, normalise({ query: "q", expected_regex: "46\\.7", regex_strength: "topic" }, 0));
  assert.equal(topicOnly.judged, false);
  assert.equal(topicOnly.verified, null);
  assert.equal(topicOnly.on_topic, true);
  const pit = scoreRules(RESULTS, normalise({ query: "q", query_time: "2023-03-01", leak_regex: "bankruptcy" }, 0)).pit;
  assert.deepEqual([pit.acquired_after_query_time, pit.published_after_query_time, pit.outcome_leaks, pit.undated], [0, 1, 1, 1]);
});

function fakeRun() {
  const items = [0, 1, 2, 3].map((i) => normalise({ id: `q${i}`, query: `q${i}`, expected_domains: ["sec.gov"] }, i));
  const good = { ok: true, ms: 100, results: RESULTS }, bad = { ok: true, ms: 300, results: RESULTS.slice(1) };
  return { items, providers: {
    alpha: { label: "Alpha", ran: true, auth: "keyless", price_per_1k: 4, price_floor_per_1k: 1, calls: { q0: good, q1: good, q2: good, q3: bad } },
    beta: { label: "Beta", ran: true, auth: "key", price_per_1k: 8, price_floor_per_1k: 8, calls: { q0: bad, q1: bad, q2: good, q3: { ok: false, ms: 50, error: "500 x", results: [] } } },
    gamma: { label: "Gamma", ran: false, status: "NEEDS KEY: GAMMA_API_KEY" },
  } };
}

test("blinding: labels hide provider names, are seeded, and unblind correctly", () => {
  const run = fakeRun();
  const a = blind(run, 7), b = blind(run, 7);
  assert.deepEqual(a.verdicts.map((v) => v.labels), b.verdicts.map((v) => v.labels));
  const packetText = JSON.stringify(a.packet);
  assert.ok(!packetText.includes("alpha") && !packetText.includes("Alpha") && !packetText.includes("beta"));
  assert.deepEqual(Object.keys(a.verdicts[0].labels).sort(), ["A", "B"]);
  const { board, pairwise } = aggregate(run, a.verdicts);
  assert.equal(board.alpha.quality.verified, 3);
  assert.equal(board.beta.quality.verified, 1);
  assert.equal(board.beta.errors, 1);
  assert.equal(board.gamma.status, "NEEDS KEY: GAMMA_API_KEY");
  assert.equal(board.alpha.cost.list_usd_per_verified, Math.round(((4 / 1000) * 4 / 3) * 1000) / 1000);
  assert.deepEqual([pairwise[0].a_only, pairwise[0].b_only, pairwise[0].both], [2, 0, 1]);
  const w = winners(board, pairwise);
  assert.deepEqual(w.find((x) => x.metric.startsWith("Verified")).winners, ["alpha"]);
  assert.deepEqual(w.find((x) => x.metric === "Latency p50").winners, ["alpha"]);
});

test("stats: nearest-rank percentiles, Wilson interval, exact McNemar", () => {
  const a = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual([pct(a, 0.5), pct(a, 0.95), pct(a, 0.99)], [50, 95, 99]);
  assert.equal(pct([], 0.5), null);
  const [lo, hi] = wilson(25, 40);
  assert.ok(lo > 0.46 && lo < 0.48 && hi > 0.75 && hi < 0.77);
  assert.equal(mcnemar(0, 0), 1);
  assert.ok(Math.abs(mcnemar(10, 0) - 2 / 1024) < 1e-9);
});

test("sizing at Keenable list prices", () => {
  const c = keenableMonthlyCost(10_000_000);
  assert.equal(c.paygo_usd, 39_600);
  assert.equal(c.frontier_usd, 10_000);
  assert.equal(c.frontier_eligible_on_average, false);
  assert.equal(keenableMonthlyCost(50_000).paygo_usd, 0);
  assert.equal(keenableMonthlyCost(300_000_000).frontier_eligible_on_average, true);
});

test("verdict memo has every section and the honest caveats", () => {
  const run = fakeRun();
  const { verdicts } = blind(run);
  const { board, pairwise } = aggregate(run, verdicts);
  const md = renderVerdict({ meta: { set_name: "t", queries_path: "t.jsonl", queries_sha256: "0".repeat(64), items: 4, ran_at: "now", client: "node", seed: 1 }, board, pairwise, llm: { status: "NEEDS KEY: X" } });
  for (const h of ["## Winner per metric", "## Sizing at list prices", "## Pilot proposal", "## What this does not prove"]) assert.ok(md.includes(h), h);
  assert.match(md, /gamma \(NEEDS KEY: GAMMA_API_KEY\)/);
  assert.match(md, /beta list/);
  assert.match(md, /LLM judge did not run/);
});

test("LLM judge prompt is blind and its reply parser is strict", () => {
  const entry = { item: "q", query: "q", answer_key: { gold_answer: "46.7B" }, candidates: { A: RESULTS, B: RESULTS } };
  const p = judgePrompt(entry);
  assert.ok(p.includes('label="A"') && p.includes("46.7B"));
  assert.deepEqual(parseJudgement('ok {"A":{"supported":true,"evidence":"46.7"},"B":{"supported":"yes"}}', ["A", "B"]), { A: { supported: true, evidence: "46.7" }, B: null });
  assert.equal(parseJudgement("no json", ["A"]), null);
});

test("every provider adapter declares price, fence and docs; keyed ones report NEEDS KEY without a key", () => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    assert.ok(p.price_per_1k > 0 && p.fence && p.docs && p.envKey, id);
    if (!p.keyless && !process.env[p.envKey]) assert.equal(availability(id).status, `NEEDS KEY: ${p.envKey}`);
  }
  assert.equal(availability("keenable").ready, true);
  assert.match(availability("nope").status, /UNKNOWN PROVIDER/);
});
