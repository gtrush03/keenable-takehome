// LangChain.js / LangGraph.js tools. Keenable's official LangChain package (langchain-keenable) is Python-only as of
// 2026-10-01; this fills the JS side with the same two tools. responseFormat "content_and_artifact" gives the model
// a compact citable string and keeps the full JSON (dates, PIT flags, telemetry) as the ToolMessage artifact.
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createKeenable, renderForModel } from "../src/keenable.mjs";

export function createKeenableLangChainTools(opts = {}) {
  const k = opts.client || createKeenable(opts);

  const search = tool(
    async (a) => {
      const res = await k.search(a);
      return [renderForModel(res), res];
    },
    {
      name: "keenable_search",
      description: "Search the web with Keenable's own index. Returns ranked pages with title, URL, page text and dates. Set query_time to see the web as it stood at a past instant.",
      responseFormat: "content_and_artifact",
      schema: z.object({
        query: z.string().describe("What to look for, in natural language."),
        mode: z.enum(["pro", "realtime"]).optional().describe("pro (default) deeper, realtime fastest."),
        site: z.string().optional().describe("Restrict to one domain."),
        published_after: z.string().optional(), published_before: z.string().optional(),
        acquired_after: z.string().optional(), acquired_before: z.string().optional(),
        query_time: z.string().optional().describe("Index as it stood at this instant."),
        max_results: z.number().int().min(1).max(50).optional(),
      }),
    },
  );

  const fetchTool = tool(
    async ({ url, prompt }) => {
      const p = await k.fetch({ url, prompt, max_chars: opts.contentMaxLength ?? 12000 });
      return [`# ${p.title || p.url}\n${p.url}\n\n${p.content}`, p];
    },
    {
      name: "keenable_fetch",
      description: "Read one web page as clean markdown.",
      responseFormat: "content_and_artifact",
      schema: z.object({ url: z.string().describe("Absolute URL."), prompt: z.string().optional().describe("Optional extraction instruction.") }),
    },
  );

  return [search, fetchTool];
}
