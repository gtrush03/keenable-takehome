import json,sys,time,urllib.request,urllib.parse,os
# Keenable keyless public search, <=2 rps (we sleep 0.6s between calls)
out=[]
for q in sys.argv[2:]:
    url="https://api.keenable.ai/v1/search/public?"+urllib.parse.urlencode({"query":q})
    try:
        r=urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"keenable-g5","X-Keenable-Title":"george-g5-targets"}),timeout=30)
        d=json.load(r)
    except Exception as e:
        d={"error":str(e)}
    d["_query"]=q; d["_at"]=time.strftime("%Y-%m-%dT%H:%M:%S%z")
    out.append(d)
    for x in d.get("results",[])[:6]:
        print(q[:40],"|",x.get("url"),"|",(x.get("snippet") or x.get("description") or "")[:220].replace("\n"," "))
    time.sleep(0.6)
json.dump(out,open(sys.argv[1],"w"),indent=1)
