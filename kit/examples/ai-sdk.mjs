// Vercel AI SDK. Model call runs only if OPENAI_API_KEY or ANTHROPIC_API_KEY is set.
//   node examples/ai-sdk.mjs
import { generateText, stepCountIs } from "ai";
import { keenableTools } from "../adapters/ai-sdk.mjs";
import { PROMPT, has, noKey } from "./_shared.mjs";

const tools = keenableTools();

if (!has("ANTHROPIC_API_KEY") && !has("OPENAI_API_KEY")) {
  noKey(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
  const out = await tools.keenable_search.execute({ query: "Silicon Valley Bank deposit outflows", queryTime: "2023-03-09" }, { toolCallId: "demo", messages: [] });
  console.log(`queryTime ${out.queryTime}, ${out.results.length} results`);
  for (const r of out.results.slice(0, 5)) console.log(`- ${r.title} | ${r.url} | published ${r.publishedAt ?? "?"} | acquired ${r.acquiredAt ?? "?"}${r.pit?.published_after_query_time ? " | DATE AFTER QUERY_TIME" : ""}`);
} else {
  const model = has("ANTHROPIC_API_KEY")
    ? (await import("@ai-sdk/anthropic")).anthropic(process.env.KIT_ANTHROPIC_MODEL || "claude-opus-5-5")
    : (await import("@ai-sdk/openai")).openai(process.env.KIT_OPENAI_MODEL || "gpt-5");
  const { text, steps } = await generateText({ model, tools, prompt: PROMPT, stopWhen: stepCountIs(6) });
  console.error(`[${steps.length} steps]`);
  console.log(text);
}
