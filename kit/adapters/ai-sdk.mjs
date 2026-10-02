// Vercel AI SDK (ai v5-v7) tools. Keenable already ships @keenable/ai-sdk (keenable_search, keenable_fetch); this is a
// drop-in superset with the same tool names and input fields, plus what an eval harness needs and the package does not
// expose as of @keenable/ai-sdk 0.1.0 (checked 2026-10-01): mode, acquiredAfter/Before, queryTime, a harness-level
// query_time pin, PIT flags on every result, and per-call telemetry. If you don't need those, use the official package.
import { tool } from "ai";
import { z } from "zod";
import { createKeenable } from "../src/keenable.mjs";

const date = (what) => z.string().optional().describe(`Only pages ${what} this point: YYYY-MM-DD, ISO timestamp, or relative (7d, 3mo).`);

export function keenableTools(opts = {}) {
  const k = opts.client || createKeenable(opts);
  const snippetMax = opts.snippetMaxLength ?? 1000;

  const keenable_search = tool({
    description: "Search the web for current information. Returns ranked pages with title, URL, page text and dates. Set queryTime to see the web as it stood at a past instant.",
    inputSchema: z.object({
      query: z.string().describe("What to look for, described in natural language rather than keywords."),
      site: z.string().optional().describe("Restrict results to a single domain, e.g. 'arxiv.org'."),
      publishedAfter: date("published on or after"),
      publishedBefore: date("published on or before"),
      acquiredAfter: date("indexed by Keenable on or after"),
      acquiredBefore: date("indexed by Keenable on or before"),
      queryTime: z.string().optional().describe("Search the index as it stood at this instant (pages acquired later are excluded)."),
      mode: z.enum(["pro", "realtime"]).optional().describe("pro (default) for deeper retrieval, realtime for speed."),
    }),
    execute: async (a) => {
      const res = await k.search({
        query: a.query, site: a.site ?? opts.site, mode: a.mode, max_results: opts.maxResults, snippet_max_length: Math.max(180, snippetMax),
        published_after: a.publishedAfter, published_before: a.publishedBefore, acquired_after: a.acquiredAfter, acquired_before: a.acquiredBefore,
        query_time: a.queryTime,
      });
      return {
        query: res.query, mode: res.mode, queryTime: res.meta.pit?.query_time ?? null,
        results: res.results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet.slice(0, snippetMax), publishedAt: r.published_at, acquiredAt: r.acquired_at, ...(r.pit && { pit: r.pit }) })),
      };
    },
  });

  const keenable_fetch = tool({
    description: "Fetch one web page and return its main content as markdown. Use it after keenable_search when a result's text is not enough, or when the user gives you a URL.",
    inputSchema: z.object({
      url: z.string().describe("The absolute URL of the page to read."),
      prompt: z.string().optional().describe("Optional extraction instruction; returns only the extracted answer."),
    }),
    execute: async ({ url, prompt }) => {
      const p = await k.fetch({ url, prompt, max_chars: opts.contentMaxLength ?? 10000 });
      return { url: p.url, title: p.title, content: p.content, publishedAt: p.published_at };
    },
  });

  return { keenable_search, keenable_fetch };
}
