// Talks to the kit's stdio MCP server the way an MCP client does: initialize, tools/list, tools/call.
//   node examples/mcp-client.mjs
// To add the server to Claude Code:   claude mcp add keenable-kit -- node "$PWD/mcp/server.mjs"
// With a pinned clock for an eval:     claude mcp add keenable-kit -e KEENABLE_PIN_QUERY_TIME=2023-03-09 -- node "$PWD/mcp/server.mjs"
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

export function startMcp(env = {}) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../mcp/server.mjs", import.meta.url))], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: child.stdout }).on("line", (l) => { const m = JSON.parse(l); pending.get(m.id)?.(m); pending.delete(m.id); });
  const rpc = (method, params) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  return { rpc, notify, close: () => child.kill() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mcp = startMcp();
  const init = await mcp.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "kit-example", version: "0" } });
  mcp.notify("notifications/initialized");
  console.log("server:", init.result.serverInfo, "protocol", init.result.protocolVersion);
  const list = await mcp.rpc("tools/list", {});
  console.log("tools:", list.result.tools.map((t) => `${t.name}(${Object.keys(t.inputSchema.properties).join(", ")})`).join("  "));
  const call = await mcp.rpc("tools/call", { name: "keenable_search", arguments: { query: "Silicon Valley Bank deposit outflows", query_time: "2023-03-09", max_results: 5 } });
  console.log("\n" + call.result.content[0].text.slice(0, 1200));
  console.log("\n_meta:", JSON.stringify(call.result._meta));
  mcp.close();
}
