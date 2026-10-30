import sys, json, urllib.request, urllib.parse, io, time
from PIL import Image, ImageDraw
UA={"User-Agent":"tvoyak-quiz/1.0 (pomazkoff)"}
files=json.load(open(sys.argv[1])); out=sys.argv[2]
tiles=[]
for i,f in enumerate(files):
    url="https://commons.wikimedia.org/wiki/Special:FilePath/"+urllib.parse.quote(f.replace(" ","_"))+"?width=330"
    try:
        im=Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30).read())).convert("RGB")
    except Exception as e:
        print("FAIL",f,e); im=Image.new("RGB",(330,220),"red")
    im.thumbnail((330,260)); t=Image.new("RGB",(330,290),"white"); t.paste(im,(0,0))
    d=ImageDraw.Draw(t); d.text((4,265),f"{i}: {f[:48]}",fill="black")
    # grid lines at 0.25 steps
    w,h=im.size
    for k in (1,2,3):
        d.line([(w*k/4,0),(w*k/4,h)],fill=(255,0,0)); d.line([(0,h*k/4),(w,h*k/4)],fill=(255,0,0))
    tiles.append(t); time.sleep(0.5)
cols=4; rows=(len(tiles)+cols-1)//cols
S=Image.new("RGB",(330*cols,290*rows),"white")
for i,t in enumerate(tiles): S.paste(t,((i%cols)*330,(i//cols)*290))
S.save(out); print("saved",out)
