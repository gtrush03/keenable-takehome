// Shared bits for the examples: one prompt, one direct-call fallback, and key detection (env vars only).
export const PROMPT = "What was publicly known about Silicon Valley Bank's deposit outflows as of 2023-03-09, the day before the FDIC closed it? " +
  "Call keenable_search with query_time 2023-03-09 so you only see the web as it stood then, and cite the URLs you used.";

// The tool call a model would make for PROMPT; used when no model key is set.
export const DIRECT_CALL = { name: "keenable_search", args: { query: "Silicon Valley Bank deposit outflows", query_time: "2023-03-09", max_results: 5 } };

export const has = (k) => Boolean(process.env[k]);
export function noKey(names) {
  console.log(`No ${names.join(" / ")} in the environment: running the Keenable tool handler directly (no model call).\n`);
}
