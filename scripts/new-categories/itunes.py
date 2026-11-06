import json, urllib.request, urllib.parse, time, sys
SONGS=[
 ("Michael Jackson","Billie Jean","reverse",100),
 ("ABBA","Dancing Queen","reverse",200),
 ("Nirvana","Smells Like Teen Spirit","reverse",400),
 ("Кино","Группа крови","reverse",100),
 ("Руки Вверх!","Крошка моя","reverse",200),
 ("Король и Шут","Лесник","reverse",500),
 ("Земфира","Хочешь?","reverse",300),
 ("t.A.T.u.","Нас не догонят","reverse",400),
 ("Ed Sheeran","Shape of You","reverse",200),
 ("PSY","Gangnam Style","reverse",300),
 ("Luis Fonsi","Despacito","reverse",100),
 ("The Beatles","Yesterday","reverse",300),
 ("Coldplay","Viva la Vida","reverse",400),
 ("Eminem","Lose Yourself","reverse",300),
 ("Adele","Rolling in the Deep","reverse",300),
 ("Сплин","Выхода нет","reverse",400),
 ("Linkin Park","Numb","reverse",500),
 ("Мумий Тролль","Владивосток 2000","reverse",400),
 ("Daft Punk","Get Lucky","reverse",200),
 ("Алла Пугачёва","Миллион алых роз","reverse",100),
 ("Imagine Dragons","Believer","reverse",300),
]
out=[]
for artist,title,fx,val in SONGS:
    for country in ("ru","us"):
        q=urllib.parse.urlencode(dict(term=f"{artist} {title}",media="music",entity="song",limit=25,country=country))
        try:
            d=json.load(urllib.request.urlopen("https://itunes.apple.com/search?"+q,timeout=20))
        except Exception as e:
            print("ERR",artist,e); time.sleep(3); continue
        hits=[r for r in d["results"] if r.get("previewUrl","").startswith("https://audio-ssl.itunes.apple.com/") and title.lower().split()[0].strip("?") in r["trackName"].lower() and artist.lower().strip("!").split()[0].replace("ё","е") in r["artistName"].lower().replace("ё","е") and not any(w in r["trackName"].lower() for w in ("live","remix","версия","version","versión","karaoke","instrumental","cover")) ]
        if hits:
            r=hits[0]
            out.append(dict(artist=artist,title=title,fx=fx,value=val,url=r["previewUrl"],track=r["trackName"],found_artist=r["artistName"],country=country,ms=r.get("trackTimeMillis")))
            print("OK",country,artist,"|",r["artistName"],"|",r["trackName"])
            break
    else:
        print("MISS",artist,title)
    time.sleep(1.5)
json.dump(out,open("itunes.json","w"),ensure_ascii=False,indent=1)
