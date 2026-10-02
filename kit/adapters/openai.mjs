// OpenAI-style function calling. Works with the OpenAI Chat Completions API, the Responses API, and every
// OpenAI-compatible endpoint (OpenRouter, vLLM, Together, Fireworks, Baseten /v1/chat/completions, ...).
import { TOOLS, createToolRunner } from "../src/tools.mjs";

// Chat Completions shape: { type: "function", function: { name, description, parameters } }
export const openaiChatTools = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } }));

// Responses API shape: { type: "function", name, description, parameters }
export const openaiResponsesTools = TOOLS.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.schema }));

// handle(toolCall) accepts either a Chat Completions tool_call ({ id, function: { name, arguments } }) or a Responses
// function_call item ({ call_id, name, arguments }) and returns the message/item to append to the conversation.
export function createOpenAIToolHandler(opts) {
  const runner = createToolRunner(opts);
  return async function handle(call) {
    const isResponses = call.type === "function_call" || (call.call_id && !call.function);
    const name = isResponses ? call.name : call.function?.name;
    const raw = isResponses ? call.arguments : call.function?.arguments;
    let output, data = null, error = null;
    try {
      const args = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
      ({ text: output, data } = await runner.run(name, args));
    } catch (e) {
      error = e; output = `Error: ${e.message}`;
    }
    const message = isResponses
      ? { type: "function_call_output", call_id: call.call_id, output }
      : { role: "tool", tool_call_id: call.id, content: output };
    return { message, data, error };
  };
}
