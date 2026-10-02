"""How much of a Keenable page sample is missing from Common Crawl?

Lookups use Common Crawl's own CDX index files (the zipnum shards behind index.commoncrawl.org):
stream each crawl's cluster.idx once, then range-fetch only the ~275 KB cdx block that would hold each
URL's SURT key. Same data the CDX API serves, without hammering it; a random subset is cross-checked
against the CDX API itself at <= 1 request/second.

Usage: .venv-cc/bin/python scripts/cc_overlap.py [sample|lookup|crosscheck|report|all]
"""
import gzip, hashlib, json, os, random, sys, time, urllib.request, urllib.error, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import warnings
warnings.filterwarnings("ignore")
import surt

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cc_cdx_cache"
UA = "george-trusynth-research/1.0 (Common Crawl overlap study, ~1k URLs; contact george@trusynth.com)"
DATA_HOST = "https://data.commoncrawl.org"
CDX_API = "https://index.commoncrawl.org"
BLOCK_WORKERS = int(os.environ.get("CC_WORKERS", "1"))
MIN_INTERVAL_S = float(os.environ.get("CC_MIN_INTERVAL", "1.0"))  # data.commoncrawl.org throttles bursts with 403
_last_req = [0.0]
for d in (CACHE, CACHE / "cluster", CACHE / "blocks", CACHE / "cdxapi"):
    d.mkdir(parents=True, exist_ok=True)


def wjson(path, obj):
    Path(path).write_text(json.dumps(obj, indent=2, ensure_ascii=False))


def http_get(url, headers=None, tries=6, stream=False):
    h = {"User-Agent": UA, **(headers or {})}
    delay = 2.0
    for i in range(tries):
        wait = MIN_INTERVAL_S - (time.time() - _last_req[0])
        if wait > 0:
            time.sleep(wait)
        _last_req[0] = time.time()
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=120)
            return r if stream else r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 and "index.commoncrawl.org" in url:
                return e.read()
            if e.code == 403 and "data.commoncrawl.org" in url and i < tries - 1:
                time.sleep(120 * (i + 1)); continue  # CloudFront rate block: back off hard
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(delay); delay *= 2; continue
            raise
        except Exception:
            if i < tries - 1:
                time.sleep(delay); delay *= 2; continue
            raise


def skey(u):
    return surt.surt(u)


def url_keys(u):
    """Exact SURT key, then fallback without query string (SURT already drops scheme, www, trailing slash)."""
    p = urllib.parse.urlsplit(u)
    keys = [skey(u)]
    noq = urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, "", ""))
    k2 = skey(noq)
    if k2 not in keys:
        keys.append(k2)
    return keys


def iso(ts):
    return datetime.strptime(ts, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- sample
def build_sample():
    gal = json.load(open(DATA / "jev_galactica_pages.json"))["pages"]
    gurls = {p["url"] for p in gal}
    # acquired_at for the Galactica pages lives in the cached Keenable search responses that surfaced them
    acq = {}
    for f in (DATA / "jev_cache").glob("search_*.json"):
        for r in json.load(open(f)).get("results", []):
            if r.get("url") in gurls and r.get("acquired_at"):
                acq[r["url"]] = r["acquired_at"]
    rows = []
    for p in gal:
        pub = p.get("published_at")
        pub_iso = None
        if pub not in (None, "None", ""):
            try:
                pub_iso = datetime.fromtimestamp(int(pub), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (ValueError, OSError):
                pub_iso = None
        rows.append({"sample": "galactica", "url": p["url"], "query": p.get("query"),
                     "acquired_at": acq.get(p["url"]), "published_at": pub_iso})
    fin = {}
    for row in json.load(open(DATA / "fintech_run.json"))["rows"]:
        for run in row.get("runs", []):
            for r in run.get("results") or []:
                u = r.get("url")
                if not u or u in gurls or u in fin:
                    continue
                fin[u] = {"sample": "fintech", "url": u, "query": row.get("q"), "segment": row.get("seg"),
                          "acquired_at": r.get("acquired_at"), "published_at": r.get("published_at")}
    fl = sorted(fin.values(), key=lambda x: x["url"])
    random.Random(20261001).shuffle(fl)
    rows += fl[:300]
    for r in rows:
        r["keys"] = url_keys(r["url"])
    wjson(CACHE / "sample.json", {"built_at": datetime.now(timezone.utc).isoformat(),
                                  "fintech_pool_unique": len(fin), "rows": rows})
    print(f"sample: {sum(r['sample']=='galactica' for r in rows)} galactica, "
          f"{sum(r['sample']=='fintech' for r in rows)} fintech (pool {len(fin)})")
    return rows


# ---------------------------------------------------------------- crawl list
def crawls():
    p = CACHE / "collinfo.json"
    if not p.exists():
        p.write_bytes(http_get(CDX_API + "/collinfo.json"))
    return [c["id"] for c in json.load(open(p))]


# ---------------------------------------------------------------- cluster.idx -> blocks
def locate_blocks(crawl, keys):
    """Map each SURT key to the cdx block(s) that could contain it. Cached per crawl and key set."""
    cp = CACHE / "cluster" / f"{crawl}.json"
    cached = json.load(open(cp)) if cp.exists() else {}
    todo = sorted(set(k for k in keys if k not in cached), key=lambda s: s.encode())
    if not todo:
        return cached
    r = http_get(f"{DATA_HOST}/cc-index/collections/{crawl}/indexes/cluster.idx", stream=True)
    found = {}
    prev = None
    i = 0
    tb = [k.encode() for k in todo]
    for raw in r:
        line = raw.rstrip(b"\n")
        lk, _, rest = line.partition(b" ")
        parts = rest.split(b"\t")
        blk = (parts[1].decode(), int(parts[2]), int(parts[3]))
        # every pending key strictly below this line's first key lives in the previous block
        while i < len(tb) and tb[i] < lk:
            found.setdefault(todo[i], [])
            if prev and prev not in found[todo[i]]:
                found[todo[i]].append(prev)
            i += 1
        # a key equal to a block's first key can also have captures in the previous block
        j = i
        while j < len(tb) and tb[j] == lk:
            lst = found.setdefault(todo[j], [])
            for b in (prev, blk):
                if b and b not in lst:
                    lst.append(b)
            j += 1
        prev = blk
        if i >= len(tb):
            break
    while i < len(tb):
        found.setdefault(todo[i], [])
        if prev and prev not in found[todo[i]]:
            found[todo[i]].append(prev)
        i += 1
    r.close()
    cached.update({k: [list(b) for b in v] for k, v in found.items()})
    wjson(cp, cached)
    return cached


def fetch_block(crawl, blk, keyset):
    fname, off, ln = blk
    cp = CACHE / "blocks" / crawl / f"{fname}_{off}.json"
    if cp.exists():
        c = json.load(open(cp))
        if set(keyset) <= set(c["checked_keys"]):
            return c["hits"]
    else:
        c = {"checked_keys": [], "hits": {}}
    raw = http_get(f"{DATA_HOST}/cc-index/collections/{crawl}/indexes/{fname}",
                   headers={"Range": f"bytes={off}-{off + ln - 1}"})
    text = gzip.decompress(raw)
    want = {k.encode(): k for k in set(keyset) | set(c["checked_keys"])}
    hits = {}
    for line in text.split(b"\n"):
        if not line:
            continue
        k, ts, js = line.split(b" ", 2)
        if k in want:
            j = json.loads(js)
            hits.setdefault(want[k], []).append({"timestamp": ts.decode(), "status": j.get("status"),
                                                  "url": j.get("url"), "mime": j.get("mime")})
    cp.parent.mkdir(parents=True, exist_ok=True)
    wjson(cp, {"checked_keys": sorted(want.values()), "hits": hits, "bytes": len(raw)})
    return hits


def lookup_crawl(crawl, keys):
    loc = locate_blocks(crawl, keys)
    by_block = {}
    for k in keys:
        for b in loc.get(k, []):
            by_block.setdefault(tuple(b), []).append(k)
    out = {k: [] for k in keys}
    with ThreadPoolExecutor(BLOCK_WORKERS) as ex:
        for hits in ex.map(lambda kv: fetch_block(crawl, kv[0], kv[1]), by_block.items()):
            for k, caps in hits.items():
                if k in out:
                    out[k].extend(caps)
    return out, len(by_block)


def lookup():
    rows = json.load(open(CACHE / "sample.json"))["rows"]
    allc = crawls()
    c2026 = [c for c in allc if c.startswith("CC-MAIN-2026")]
    resp = CACHE / "lookup_results.json"
    res = json.load(open(resp)) if resp.exists() else {"crawls": {}}
    allkeys = sorted({k for r in rows for k in r["keys"]})
    log = open(CACHE / "lookup.log", "a")

    def done(crawl, keys):
        have = res["crawls"].get(crawl, {}).get("checked", [])
        return set(keys) <= set(have)

    def run(crawl, keys):
        t = time.time()
        out, nb = lookup_crawl(crawl, keys)
        ent = res["crawls"].setdefault(crawl, {"checked": [], "hits": {}})
        ent["checked"] = sorted(set(ent["checked"]) | set(keys))
        for k, caps in out.items():
            if caps:
                ent["hits"][k] = caps
        wjson(resp, res)
        msg = f"{crawl}: {len(keys)} keys, {nb} blocks, {sum(1 for v in out.values() if v)} keys hit, {time.time()-t:.0f}s"
        print(msg, flush=True); log.write(msg + "\n"); log.flush()

    # phase A: every 2026 crawl, every key
    for c in c2026:
        if not done(c, allkeys):
            run(c, allkeys)
    # phase B: older crawls newest-first, only for URLs not yet seen in any crawl
    budget = int(os.environ.get("CC_OLDER_CRAWLS", "999"))
    per_sample = int(os.environ.get("CC_ANY_SUBSAMPLE", "20"))
    seen26 = set()
    for c in c2026:
        seen26 |= set(res["crawls"].get(c, {}).get("hits", {}))
    sub = []
    for smp in ("galactica", "fintech"):
        miss = [r for r in rows if r["sample"] == smp and not any(k in seen26 for k in r["keys"])]
        sub += random.Random(11).sample(miss, min(per_sample, len(miss)))
    res["any_crawl_subsample"] = [r["url"] for r in sub]
    wjson(resp, res)
    for n, c in enumerate([c for c in allc if not c.startswith("CC-MAIN-2026")]):
        if n >= budget:
            break
        seen = set()
        for ent in res["crawls"].values():
            seen |= set(ent["hits"])
        pending = [k for r in sub if not any(k2 in seen for k2 in r["keys"]) for k in r["keys"]]
        if not pending:
            break
        if not done(c, pending):
            run(c, sorted(set(pending)))
    res["older_crawls_budget"] = budget
    wjson(resp, res)


# ---------------------------------------------------------------- CDX API cross-check (<= 1 rps)
def cdx_api(crawl, url):
    name = f"{crawl}_{hashlib.sha1(url.encode()).hexdigest()[:16]}.json"
    cp = CACHE / "cdxapi" / name
    if cp.exists():
        return json.load(open(cp))
    q = urllib.parse.urlencode({"url": url, "output": "json"})
    t = time.time()
    body = http_get(f"{CDX_API}/{crawl}-index?{q}").decode(errors="replace")
    lines = [json.loads(l) for l in body.splitlines() if l.strip().startswith("{")]
    caps = [l for l in lines if "urlkey" in l]
    out = {"crawl": crawl, "url": url, "captures": len(caps),
           "timestamps": [c["timestamp"] for c in caps], "raw_message": None if caps else body[:200],
           "fetched_at": datetime.now(timezone.utc).isoformat(), "seconds": round(time.time() - t, 2)}
    wjson(cp, out)
    time.sleep(max(0.0, 1.0 - (time.time() - t)))
    return out


def crosscheck(n=int(os.environ.get("CC_XCHECK", "40"))):
    rows = json.load(open(CACHE / "sample.json"))["rows"]
    res = json.load(open(CACHE / "lookup_results.json"))
    c2026 = [c for c in crawls() if c.startswith("CC-MAIN-2026") and c in res["crawls"]]
    rng = random.Random(7)
    hitrows = [r for r in rows if any(r["keys"][0] in res["crawls"][c]["hits"] for c in c2026)]
    pairs = []
    # half the pairs where the index files say "present", half chosen at random
    for r in rng.sample(hitrows, min(n // 2, len(hitrows))):
        c = next(c for c in c2026 if r["keys"][0] in res["crawls"][c]["hits"])
        pairs.append((r, c))
    for r in rng.sample(rows, n - len(pairs)):
        pairs.append((r, rng.choice(c2026)))
    out = []
    for r, c in pairs:
        try:
            api = cdx_api(c, r["url"])
        except Exception as e:
            out.append({"url": r["url"], "crawl": c, "error": f"CDX API unavailable: {e}"[:200]})
            print(c, r["url"][:70], "ERR", e, flush=True)
            continue
        mine = len(res["crawls"][c]["hits"].get(r["keys"][0], []))
        out.append({"url": r["url"], "crawl": c, "index_files_captures": mine, "cdx_api_captures": api["captures"],
                    "agree_presence": (mine > 0) == (api["captures"] > 0)})
        wjson(CACHE / "crosscheck.json", out)
        print(c, r["url"][:70], mine, api["captures"], flush=True)
    wjson(CACHE / "crosscheck.json", out)


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else "all"
    if step in ("sample", "all"):
        build_sample()
    if step in ("lookup", "all"):
        lookup()
    if step in ("crosscheck", "all"):
        crosscheck()
