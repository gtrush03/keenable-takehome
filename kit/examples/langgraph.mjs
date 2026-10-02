// LangChain.js tools inside a LangGraph ReAct agent. Model call runs only if ANTHROPIC_API_KEY or OPENAI_API_KEY is set.
//   node examples/langgraph.mjs
import { createKeenableLangChainTools } from "../adapters/langchain.mjs";
import { PROMPT, DIRECT_CALL, has, noKey } from "./_shared.mjs";

const tools = createKeenableLangChainTools();

if (!has("ANTHROPIC_API_KEY") && !has("OPENAI_API_KEY")) {
  noKey(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
  // Invoking with a ToolCall returns a ToolMessage: content for the model, artifact for the harness.
  const msg = await tools[0].invoke({ type: "tool_call", id: "demo", name: DIRECT_CALL.name, args: DIRECT_CALL.args });
  console.log("ToolMessage.content:\n", String(msg.content).slice(0, 1200));
  console.log("\nToolMessage.artifact.meta:", JSON.stringify(msg.artifact.meta));
} else {
  const { createReactAgent } = await import("@langchain/langgraph/prebuilt");
  const llm = has("ANTHROPIC_API_KEY")
    ? new (await import("@langchain/anthropic")).ChatAnthropic({ model: process.env.KIT_ANTHROPIC_MODEL || "claude-opus-5-5" })
    : new (await import("@langchain/openai")).ChatOpenAI({ model: process.env.KIT_OPENAI_MODEL || "gpt-5" });
  const agent = createReactAgent({ llm, tools });
  const out = await agent.invoke({ messages: [{ role: "user", content: PROMPT }] }, { recursionLimit: 12 });
  console.log(out.messages.at(-1).content);
}
