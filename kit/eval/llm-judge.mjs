// Optional LLM judge. Runs only when ANTHROPIC_API_KEY, OPENAI_API_KEY or OPENROUTER_API_KEY is already set.
// It sees the blind packet only: query, gold answer, and candidates labelled A, B, ... (never provider names), and
// answers per label whether the top results contain evidence that supports the gold answer.
// Items without a gold_answer are skipped (the rule judge still scores them).

export function llmJudgeBackend() {
  if (process.env.ANTHROPIC_API_KEY) return { name: "anthropic", model: process.env.KIT_JUDGE_MODEL || "claude-sonnet-5-5" };
  if (process.env.OPENAI_API_KEY) return { name: "openai", model: process.env.KIT_JUDGE_MODEL || "gpt-5-mini" };
  if (process.env.OPENROUTER_API_KEY) return { name: "openrouter", model: process.env.KIT_JUDGE_MODEL || "anthropic/claude-sonnet-5.5" };
  return null;
}

export function judgePrompt(entry, k = 5) {
  const cands = Object.entries(entry.candidates).map(([L, res]) =>
    `<candidate label="${L}">\n` + res.slice(0, k).map((x, i) => `[${i + 1}] ${x.title} | ${x.url}${x.published_at ? ` | ${String(x.published_at).slice(0, 10)}` : ""}\n${x.snippet}`).join("\n") + "\n</candidate>").join("\n");
  return `You are grading web search results for an evaluation. For each candidate, decide whether its top ${k} results contain ` +
    `evidence (title, URL or snippet) that supports the gold answer. Judge only what is written in the results; do not use outside knowledge. ` +
    `Ignore result order and candidate labels.\n\nQuery: ${entry.query}\nGold answer: ${entry.answer_key.gold_answer}\n\n${cands}\n\n` +
    `Reply with JSON only, one key per candidate label: {"A": {"supported": true, "evidence": "<short quote or empty>"}, ...}`;
}

export function parseJudgement(text, labels) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return Object.fromEntries(labels.map((L) => [L, j[L] && typeof j[L].supported === "boolean" ? { supported: j[L].supported, evidence: String(j[L].evidence || "").slice(0, 200) } : null]));
  } catch { return null; }
}

async function ask(backend, prompt) {
  if (backend.name === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const r = await client.beta.messages.create({
      model: backend.model, max_tokens: 4000, messages: [{ role: "user", content: prompt }],
      output_config: { effort: "low" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    if (r.stop_reason === "refusal") throw new Error(`judge refused (${r.stop_details?.category})`);
    return r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  }
  const { default: OpenAI } = await import("openai");
  const client = backend.name === "openrouter" ? new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" }) : new OpenAI();
  const r = await client.chat.completions.create({ model: backend.model, messages: [{ role: "user", content: prompt }] });
  return r.choices[0].message.content;
}

// Returns { backend, results: { item: { label: { supported, evidence } } }, errors }.
export async function runLlmJudge(packet, { concurrency = 2 } = {}) {
  const backend = llmJudgeBackend();
  if (!backend) return { backend: null, results: null, status: "NEEDS KEY: ANTHROPIC_API_KEY or OPENAI_API_KEY or OPENROUTER_API_KEY (rule judge only)" };
  const todo = packet.filter((e) => e.answer_key.gold_answer && Object.keys(e.candidates).length);
  const results = {}, errors = [];
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < todo.length) {
      const e = todo[i++];
      try {
        const parsed = parseJudgement(await ask(backend, judgePrompt(e)), Object.keys(e.candidates));
        if (parsed) results[e.item] = parsed; else errors.push(`${e.item}: unparseable`);
      } catch (err) { errors.push(`${e.item}: ${err.message}`); }
    }
  }));
  return { backend, results, errors, judged_items: Object.keys(results).length };
}
