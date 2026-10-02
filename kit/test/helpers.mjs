// Test helpers: a fake fetch that records requests and returns canned Keenable responses.
export function mockFetch(results = [], { status = 200, mode = "pro" } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init?.method, headers: init?.headers, body });
    const payload = url.includes("/v1/fetch")
      ? { url: new URL(url).searchParams.get("url"), title: "Page", content: "# Hello\nbody", published_at: 1700000000 }
      : { query: body?.query, mode: body?.mode || mode, results };
    return new Response(JSON.stringify(status === 200 ? payload : { error: "boom" }), { status, headers: { "content-type": "application/json" } });
  };
  fn.calls = calls;
  return fn;
}

export const RESULTS = [
  { title: "SEC filing", url: "https://www.sec.gov/a", snippet: "Revenue was 46.7 billion", published_at: "2023-01-02T00:00:00Z", acquired_at: "2023-01-03T00:00:00Z" },
  { title: "Later news", url: "https://news.example.com/b", snippet: "filed for bankruptcy", published_at: "2024-05-01T00:00:00Z", acquired_at: "2023-02-01T00:00:00Z" },
  { title: "Undated", url: "https://blog.example.org/c", snippet: "nothing here", acquired_at: "2022-12-01T00:00:00Z" },
];
export const offline = process.env.KIT_OFFLINE === "1";
