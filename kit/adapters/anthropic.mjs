// Anthropic Messages API tool use: tool definitions plus a handler that turns tool_use blocks into tool_result blocks.
// Return every tool_result of one assistant turn in a single user message (keeps parallel tool calls working).
import { TOOLS, createToolRunner } from "../src/tools.mjs";

export const anthropicTools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));

export function createAnthropicToolHandler(opts) {
  const runner = createToolRunner(opts);
  // handle(content) takes the assistant message content array; returns { message, data } where message is the user
  // turn to append ({ role: "user", content: [tool_result, ...] }) or null when there were no tool_use blocks.
  return async function handle(content) {
    const uses = (content || []).filter((b) => b.type === "tool_use");
    if (!uses.length) return { message: null, data: [] };
    const settled = await Promise.all(uses.map(async (u) => {
      try {
        const { text, data } = await runner.run(u.name, u.input || {});
        return { block: { type: "tool_result", tool_use_id: u.id, content: text }, data };
      } catch (e) {
        return { block: { type: "tool_result", tool_use_id: u.id, content: `Error: ${e.message}`, is_error: true }, data: null, error: e };
      }
    }));
    return { message: { role: "user", content: settled.map((s) => s.block) }, data: settled.map((s) => s.data) };
  };
}
