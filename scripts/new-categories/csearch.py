import json, urllib.request, urllib.parse, sys
UA={"User-Agent":"tvoyak-quiz/1.0 (pomazkoff)"}
for term in sys.argv[1:]:
    q=urllib.parse.urlencode(dict(action="query",list="search",srsearch=term+" filetype:bitmap",srnamespace=6,srlimit=6,format="json"))
    d=json.load(urllib.request.urlopen(urllib.request.Request("https://commons.wikimedia.org/w/api.php?"+q,headers=UA)))
    print("##",term)
    for r in d["query"]["search"]:
        print("  ",r["title"])
