import json,sys,os,collections,re
from common import *
from llm import chat
import musicpipe as M
BLOCK={norm(x) for x in ['Oxxxymiron','Noize MC','Face','Morgenshtern','Моргенштерн','Монеточка','Земфира','Би-2','Аквариум','Борис Гребенщиков','Машина времени','Андрей Макаревич','Алла Пугачёва','Алла Пугачева','Максим Галкин','IC3PEAK','Pussy Riot','ДДТ','Мумий Тролль','Порнофильмы','Слава КПСС','Лайма Вайкуле','Вахтанг Кикабидзе','Ногу свело!','Сплин','Instasamka','Ляпис Трубецкой','Немцова','Шамиль Басаев','Тимур Муцураев','Кровосток','Pharaoh','Ic3peak','Little Big','Кис-кис','АИГЕЛ','Shortparis','Валерий Меладзе','Лолита','Нойз МС']}
BR={'Угадай мелодию':'самые узнаваемые хиты всех эпох (русские и зарубежные, от СССР до 2024)','Классика':'композиторы классической музыки (самые известные)'}
F=f'{W}/pools.json'
pools=json.load(open(F)) if os.path.exists(F) else {}
for c in sys.argv[1:]:
    if c in pools: continue
    brief=BR.get(c,M.T.B.get(c,c))
    r,_=chat('openai/gpt-6-luna-pro',[{'role':'user','content':f'Перечисли 90 самых известных для массовой русскоязычной аудитории исполнителей (групп/артистов{", композиторов" if c=="Классика" else ""}) для музыкальной викторины «{c}» ({brief}). Только реальные, очень популярные; без иноагентов, без политики. Для каждого — 3–6 их самых известных хитов (точные названия). JSON {{"a":[{{"artist":"как в Apple Music","hits":["..."]}}]}}'}],temperature=0.4,reasoning={'effort':'low'})
    banned={norm(q['answer']) for q in M.ex_music(c)}|{norm(q.get('artist','')) for q in M.ex_music(c)}
    out=[]
    for a in (r or {}).get('a',[]):
        art=a['artist'].strip()
        if norm(art) in BLOCK or norm(art) in banned: continue
        res=M.itunes(art,'ru')
        got=set()
        for h in a.get('hits',[])[:6]:
            tt=norm(h)
            for x in res:
                pu=x.get('previewUrl','');tn=x.get('trackName','');an=x.get('artistName','')
                if not pu.startswith('https://audio-ssl.itunes.apple.com/'): continue
                if c!='Классика' and (any(b in tn.lower() for b in M.BAD) or not (M.tok(art)&M.tok(an) or norm(art) in norm(an))): continue
                if c=='Классика' and not (M.tok(art)&M.tok(an+' '+x.get('collectionName',''))): continue
                if not norm(tn).startswith(tt[:max(4,len(tt)//2)]) or norm(tn) in got: continue
                got.add(norm(tn))
                out.append({'artist':art,'title':h,'it':{'url':pu,'track':tn,'artist':an,'album':x.get('collectionName'),'country':'ru','ms':x.get('trackTimeMillis'),'year':(x.get('releaseDate') or '')[:4]}}); break
    pools[c]=out; json.dump(pools,open(F,'w'),ensure_ascii=False)
    print(c,len((r or {}).get('a',[])),'artists ->',len(out),'tracks',flush=True)
json.dump(M.cache,open(M.CACHE,'w'))
