import json, urllib.request, urllib.parse, time, sys
SONGS=[
 ("Michael Jackson","Billie Jean","slow",100),
 ("ABBA","Dancing Queen","slow",200),
 ("Nirvana","Smells Like Teen Spirit","reverse",400),
 ("Кино","Группа крови","slow",100),
 ("Руки Вверх!","Крошка моя","slow",200),
 ("Король и Шут","Лесник","reverse",500),
 ("Земфира","Хочешь?","slow",300),
 ("t.A.T.u.","Нас не догонят","reverse",400),
 ("Ed Sheeran","Shape of You","slow",200),
 ("PSY","Gangnam Style","reverse",300),
 ("Luis Fonsi","Despacito","slow",100),
 ("The Beatles","Yesterday","slow",300),
 ("Coldplay","Viva la Vida","reverse",400),
 ("Eminem","Lose Yourself","slow",300),
 ("Adele","Rolling in the Deep","slow",300),
 ("Сплин","Выхода нет","slow",400),
 ("Linkin Park","Numb","reverse",500),
 ("Мумий Тролль","Владивосток 2000","slow",400),
 ("Daft Punk","Get Lucky","slow",200),
 ("Алла Пугачёва","Миллион алых роз","slow",100),
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
