// Anthropic tool use with a manual agent loop. Model call runs only if ANTHROPIC_API_KEY is set.
//   node examples/anthropic.mjs
import Anthropic from "@anthropic-ai/sdk";
import { anthropicTools, createAnthropicToolHandler } from "../adapters/anthropic.mjs";
import { PROMPT, DIRECT_CALL, has, noKey } from "./_shared.mjs";

const handle = createAnthropicToolHandler();

if (!has("ANTHROPIC_API_KEY")) {
  noKey(["ANTHROPIC_API_KEY"]);
  const { message, data } = await handle([{ type: "tool_use", id: "toolu_demo", name: DIRECT_CALL.name, input: DIRECT_CALL.args }]);
  console.log("tool_result block returned to the model:\n", message.content[0].content.slice(0, 1200));
  console.log("\nharness telemetry:", JSON.stringify(data[0].meta));
} else {
  const client = new Anthropic();
  const model = process.env.KIT_ANTHROPIC_MODEL || "claude-opus-5-5";
  const messages = [{ role: "user", content: PROMPT }];
  for (let step = 0; step < 6; step++) {
    // Server-side refusal fallback is on: a declined turn is re-run on a fallback model inside the same call.
    const r = await client.beta.messages.create({
      model, max_tokens: 16000, tools: anthropicTools, messages,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    if (r.stop_reason === "refusal") { console.log("Refused:", r.stop_details?.category); break; }
    messages.push({ role: "assistant", content: r.content });
    const { message } = await handle(r.content);
    if (!message) { console.log(r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")); break; }
    messages.push(message);
  }
}
