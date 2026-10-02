#!/usr/bin/env node
// Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0), zero dependencies. Exposes keenable_search and
// keenable_fetch, including query_time.
//
// Keenable already runs a hosted MCP server (https://api.keenable.ai/mcp) and ships a stdio bridge
// (@keenable/mcp-server). Use those for everyday agents. This one is for eval harnesses, where the operator, not the
// model, must control the clock and the SKU:
//   KEENABLE_PIN_QUERY_TIME=2024-03-27   every search runs at that instant, whatever the model passes
//   KEENABLE_FORCE_MODE=realtime         operator override of the search mode (same idea as _meta keenable/overrides)
//   KEENABLE_LEAK_POLICY=drop            drop results dated after query_time instead of flagging them
//   KIT_TELEMETRY=calls.jsonl            append one JSON line per tool call (latency, endpoint, n, PIT counts)
// Note: @keenable/mcp-server 0.2.1 (npm, checked 2026-10-01) does not expose query_time; the hosted server does.
// Per-call telemetry also travels in the result's _meta["kit/telemetry"], outside the model-visible content.
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
import { TOOLS, createToolRunner } from "../src/tools.mjs";

const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const telemetryPath = process.env.KIT_TELEMETRY;
const runner = createToolRunner({
  onCall: (ev) => { if (telemetryPath) appendFileSync(telemetryPath, JSON.stringify({ at: new Date().toISOString(), ...ev }) + "\n"); },
});

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

async function handle(req) {
  const { id, method, params } = req;
  const isNotification = id === undefined || id === null;
  try {
    let result;
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: SUPPORTED.includes(params?.protocolVersion) ? params.protocolVersion : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "keenable-stack-kit", version: "0.1.0" },
          instructions: "keenable_search searches Keenable's web index (set query_time for point-in-time); keenable_fetch reads a page as markdown.",
        };
        break;
      case "ping": result = {}; break;
      case "tools/list":
        result = { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema })) };
        break;
      case "tools/call": {
        const name = params?.name;
        if (!TOOLS.some((t) => t.name === name)) { send({ id, error: { code: -32602, message: `Unknown tool: ${name}` } }); return; }
        const args = { ...(params.arguments || {}) };
        const ov = params._meta?.["keenable/overrides"];
        if (name === "keenable_search" && ["pro", "realtime"].includes(ov?.mode)) args.mode = ov.mode;
        try {
          const { text, data } = await runner.run(name, args);
          result = { content: [{ type: "text", text }], isError: false, _meta: { "kit/telemetry": data?.meta || null } };
        } catch (e) {
          result = { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
        }
        break;
      }
      default:
        if (method?.startsWith("notifications/")) return;
        if (!isNotification) send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
        return;
    }
    if (!isNotification) send({ id, result });
  } catch (e) {
    if (!isNotification) send({ id, error: { code: -32603, message: e.message } });
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { send({ id: null, error: { code: -32700, message: "Parse error" } }); return; }
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
});
log(`keenable-stack-kit MCP ready (${runner.client.auth}${runner.client.config.pinQueryTime ? `, query_time pinned to ${runner.client.config.pinQueryTime}` : ""})`);
