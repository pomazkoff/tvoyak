import json, urllib.request, urllib.parse, sys
titles=sys.argv[1].split("|")
q=urllib.parse.urlencode(dict(action="query",prop="pageimages",piprop="original|name",titles="|".join(titles),format="json",redirects=1))
req=urllib.request.Request("https://"+(sys.argv[2] if len(sys.argv)>2 else "en")+".wikipedia.org/w/api.php?"+q,headers={"User-Agent":"tvoyak-quiz/1.0 (pomazkoff)"})
d=json.load(urllib.request.urlopen(req))
for p in d["query"]["pages"].values():
    print(p.get("title"),"=>",p.get("pageimage"))
