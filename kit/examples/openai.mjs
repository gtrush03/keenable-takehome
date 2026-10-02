// OpenAI-style function calling. Model call runs only if OPENAI_API_KEY or OPENROUTER_API_KEY is set.
//   node examples/openai.mjs
import OpenAI from "openai";
import { openaiChatTools, createOpenAIToolHandler } from "../adapters/openai.mjs";
import { PROMPT, DIRECT_CALL, has, noKey } from "./_shared.mjs";

const handle = createOpenAIToolHandler();

if (!has("OPENAI_API_KEY") && !has("OPENROUTER_API_KEY")) {
  noKey(["OPENAI_API_KEY", "OPENROUTER_API_KEY"]);
  const fake = { id: "call_demo", type: "function", function: { name: DIRECT_CALL.name, arguments: JSON.stringify(DIRECT_CALL.args) } };
  const { message, data } = await handle(fake);
  console.log("tool message appended to the conversation:\n", message.content.slice(0, 1200));
  console.log("\nharness telemetry:", JSON.stringify(data.meta));
} else {
  const viaRouter = !has("OPENAI_API_KEY");
  const client = viaRouter ? new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" }) : new OpenAI();
  const model = process.env.KIT_OPENAI_MODEL || (viaRouter ? "openai/gpt-5" : "gpt-5");
  const messages = [{ role: "user", content: PROMPT }];
  for (let step = 0; step < 6; step++) {
    const r = await client.chat.completions.create({ model, messages, tools: openaiChatTools });
    const msg = r.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) { console.log(msg.content); break; }
    for (const call of msg.tool_calls) {
      const { message, data } = await handle(call);
      console.error(`[tool] ${call.function.name} ${call.function.arguments} -> ${data?.results?.length ?? "page"} (${data?.meta?.ms} ms)`);
      messages.push(message);
    }
  }
}
