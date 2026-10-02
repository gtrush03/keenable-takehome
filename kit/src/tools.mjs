// One canonical definition of the two tools. Every adapter (OpenAI, Anthropic, MCP, AI SDK, LangChain) is a thin
// re-shaping of this file, so a field added here shows up everywhere. Names match Keenable's own packages
// (@keenable/ai-sdk exposes keenable_search / keenable_fetch); the extra fields are the ones those packages don't
// expose yet: mode, acquired_* and query_time.
import { createKeenable, renderForModel } from "./keenable.mjs";

const DATE = "A date (YYYY-MM-DD), an ISO 8601 timestamp, or a relative delta such as 7d, 12h, 3mo.";

export const SEARCH_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string", description: "What to look for, in natural language." },
    mode: { type: "string", enum: ["pro", "realtime"], description: "pro (default): deeper retrieval. realtime: fastest." },
    site: { type: "string", description: "Restrict results to one domain, e.g. sec.gov." },
    published_after: { type: "string", description: `Only pages published at or after this point. ${DATE}` },
    published_before: { type: "string", description: `Only pages published at or before this point. ${DATE}` },
    acquired_after: { type: "string", description: `Only pages Keenable indexed at or after this point. ${DATE}` },
    acquired_before: { type: "string", description: `Only pages Keenable indexed at or before this point. ${DATE}` },
    query_time: { type: "string", description: "Search the index as it stood at this instant: pages acquired later are excluded. Use it to ask what was knowable before an event. A date means 00:00:00 UTC." },
    max_results: { type: "integer", minimum: 1, maximum: 50, description: "Number of results, 1-50 (default 10)." },
  },
  required: ["query"],
  additionalProperties: false,
};

export const FETCH_SCHEMA = {
  type: "object",
  properties: {
    url: { type: "string", description: "Absolute URL of the page to read, usually one returned by keenable_search." },
    max_chars: { type: "integer", minimum: 1, description: "Truncate the returned markdown to this many characters (default 50,000)." },
    live: { type: "boolean", description: "Fetch live from the source instead of Keenable's indexed copy (needed for URLs that are not indexed)." },
    prompt: { type: "string", description: "Optional extraction instruction (max 2,000 chars); returns only the extracted answer instead of the page." },
  },
  required: ["url"],
  additionalProperties: false,
};

export const TOOLS = [
  { name: "keenable_search", description: "Search the web with Keenable's own index. Returns ranked pages with title, URL, page text and dates. Use it whenever the answer depends on current events or facts you are unsure about; set query_time to see the web as it stood at a past instant.", schema: SEARCH_SCHEMA },
  { name: "keenable_fetch", description: "Read one web page as clean markdown. Use it after keenable_search when a snippet is not enough, or when the user gives you a URL.", schema: FETCH_SCHEMA },
];

// Runs a tool call by name. Returns { text } for the model plus { data } for the harness (full JSON + telemetry).
export function createToolRunner(clientOrOpts = {}) {
  const k = typeof clientOrOpts.search === "function" ? clientOrOpts : createKeenable(clientOrOpts);
  async function run(name, args) {
    if (name === "keenable_search") {
      const res = await k.search(args);
      return { text: renderForModel(res), data: res };
    }
    if (name === "keenable_fetch") {
      const max = args?.max_chars ?? 12000;
      const page = await k.fetch({ ...args, max_chars: max });
      const head = `# ${page.title || page.url}\n${page.url}${page.published_at ? ` (published ${page.published_at.slice(0, 10)})` : ""}\n\n`;
      return { text: head + page.content, data: page };
    }
    throw new Error(`Unknown tool: ${name}`);
  }
  return { run, client: k };
}
