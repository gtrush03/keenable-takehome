#!/usr/bin/env python3
"""Galactica estimates, step 2: consent signals for every distinct host in data/galactica_sample.json.

Per host (all hosts if <= 400, else a uniform seeded random sample of 400), one GET each of
  /robots.txt                   AI-bot groups, Content-Signal (Cloudflare) lines
  /ai.txt                       Spawning-style AI policy file (counted only if it looks like a policy, not HTML)
  /.well-known/tdmrep.json      W3C TDMRep (TDM reservation, EU DSM Art. 4)
<= 2 requests/second overall, descriptive UA, 15 s timeout, cached per URL in data/ga_robots_cache/.

    python3 scripts/ga_est_robots.py
"""
import hashlib
import json
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "ga_robots_cache"
CACHE.mkdir(parents=True, exist_ok=True)
UA = "george-keenable-research/1.0 (robots.txt consent study; one fetch per host; contact george@trusynth.com)"
MIN_INTERVAL = 0.55
MAX_HOSTS = 400
_last = [0.0]
_lock = threading.Lock()


def get(url):
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:20] + ".json")
    if f.exists():
        return json.loads(f.read_text())
    with _lock:  # global start-rate limit (<= 2 req/s) shared by all worker threads
        dt = time.monotonic() - _last[0]
        if dt < MIN_INTERVAL:
            time.sleep(MIN_INTERVAL - dt)
        _last[0] = time.monotonic()
    out = {"url": url, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/plain,*/*;q=0.5"})
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read(400_000)
            out.update(status=r.status, final_url=r.geturl(), content_type=r.headers.get("Content-Type", ""),
                       body=body.decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        out.update(status=e.code, body="")
    except Exception as e:  # DNS, TLS, timeout
        out.update(status=None, error=type(e).__name__ + ": " + str(e)[:160], body="")
    f.write_text(json.dumps(out))
    return out


def main():
    docs = json.loads((ROOT / "data" / "galactica_sample.json").read_text())["docs"]
    hosts = Counter()
    order = {}
    for d in docs:
        p = urllib.parse.urlsplit(d["url"])
        h = f"{p.scheme}://{p.netloc}"
        hosts[h] += 1
        order.setdefault(h, len(order))
    allh = sorted(hosts, key=lambda h: order[h])
    # Uniform seeded random sample of hosts, so host shares are unbiased and doc shares use a ratio estimator.
    ranked = allh if len(allh) <= MAX_HOSTS else sorted(random.Random(20261001).sample(allh, MAX_HOSTS), key=lambda h: order[h])
    print(f"{len(hosts)} distinct hosts; fetching {len(ranked)}", file=sys.stderr)
    def one(h):
        for path in ("/robots.txt", "/ai.txt", "/.well-known/tdmrep.json"):
            get(h + path)
    # 8 workers only so slow/timeout hosts do not stall the queue; starts stay <= 2/s and one host is never hit in parallel.
    with ThreadPoolExecutor(8) as ex:
        for i, _ in enumerate(ex.map(one, ranked)):
            if i % 25 == 0:
                print(f"  {i + 1}/{len(ranked)}", file=sys.stderr)
    (ROOT / "data" / "ga_robots_hosts.json").write_text(json.dumps(
        {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "user_agent": UA,
         "hosts_total": len(hosts), "hosts_fetched": ranked}, indent=1))


if __name__ == "__main__":
    main()
