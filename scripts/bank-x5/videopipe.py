import json, sys, os, random, uuid, collections, subprocess, requests, re, time
from concurrent.futures import ThreadPoolExecutor
from common import *
from llm import chat
import textpipe as T
GEN='anthropic/claude-haiku-5.5'
CAND=f'{W}/video_cand.jsonl'; ACC=f'{W}/video_acc.jsonl'; REJ=f'{W}/video_rej.jsonl'
SC={'Клипы':[200,300,400,500,600],'ТВ-шоу':[100,200,300],'Трейлеры':[100,200,300,400]}
SPEC={
'Трейлеры':('трейлеры известных фильмов и мультфильмов (мировые блокбастеры и российские хиты 2000–2025)','prompt — «Из какого фильма этот трейлер?» с короткой подсказкой (год, жанр, режиссёр, но без слов из названия), answer — русское прокатное название, variants — оригинальное и короткое название. curtain=false (видео видно с 20-й по 36-ю секунду). search_en — запрос для YouTube (оригинальное название + year + official trailer), search_ru — запрос для VK Видео (русское название + год + трейлер).'),
'Клипы':('известные музыкальные клипы российских и зарубежных исполнителей (1980–2024)','prompt — либо «Угадайте по звуку: кто исполняет эту песню …?» (curtain=true, только звук), либо «Чей это клип? …» (curtain=false), с подсказкой без названия песни и имени; answer — исполнитель, variants — латиница/кириллица, краткое имя. search_en — «исполнитель песня official video» для YouTube, search_ru — тот же клип для VK Видео. Обязательно укажи artist и song.'),
'ТВ-шоу':('заставки и фрагменты известных российских телепередач и телешоу (советское и российское ТВ, 1980–2024): телеигры, ток-шоу, юмористические шоу, детские передачи','prompt — «Угадайте по звуку: заставка какой передачи …?» с подсказкой без слов из названия (curtain=true, звучит заставка 0–16 с); answer — название передачи, variants — другие названия. search_en и search_ru — запрос «заставка <передача>» (YouTube и VK Видео).'),
}
def needs():
    out={}
    for c in SC:
        d=collections.Counter()
        for k,n in T.targets[c]['buckets'].items(): d[int(k.split('|')[1])]+=4*n
        out[c]=dict(d)
    return out
def ex(c): return [q for q in T.bank if q['category']==c]
def yt_search(q,n=6):
    try:
        out=subprocess.run(['yt-dlp','--flat-playlist','-j',f'ytsearch{n}:{q}'],capture_output=True,text=True,timeout=90).stdout
        return [json.loads(l) for l in out.splitlines() if l.strip()]
    except Exception: return []
def yt_embeddable(vid):
    try:
        r=requests.get('https://www.youtube.com/oembed',params={'url':f'https://www.youtube.com/watch?v={vid}','format':'json'},timeout=20)
        return r.status_code==200
    except Exception: return False
BADW=('reaction','реакция','review','обзор','fan made','fanmade','concept','parody','пародия','karaoke','караоке','cover','кавер','lyrics','8d','slowed','teaser','тизер','final','финальн','behind','за кадром','1 hour','10 hours','remix','live','концерт')
def key_tokens(s): return [w for w in norm(s).split() if len(w)>=3][:3]
def pick_yt(q):
    res=yt_search(q['search_en'])
    for r in res:
        t=r.get('title') or ''; tl=t.lower(); d=r.get('duration') or 0
        if any(b in tl for b in BADW if not (q['category']=='ТВ-шоу' and b in ('live','концерт'))): continue
        lo,hi=((60,400) if q['category']!='ТВ-шоу' else (16,900))
        if not (lo<=d<=hi): continue
        if q['category']=='Трейлеры' and not re.search(r'trailer|трейлер',tl): continue
        keys=key_tokens(q.get('match_en') or q['search_en'])
        if keys and not any(k in norm(t) for k in keys[:2]): continue
        if yt_embeddable(r['id']): return {'id':r['id'],'title':t,'channel':r.get('channel') or r.get('uploader'),'duration':d}
    return None
def gen_prompt(c,want,banned):
    brief,fmt=SPEC[c]; wl=', '.join(f'{v} — {n} шт.' for v,n in sorted(want.items()))
    return f"""Ты готовишь видео-вопросы для русской викторины в стиле «Своя игра», тема «{c}»: {brief}.
{fmt}
Номиналы: {wl}. {T.DIFF}
Только реально существующие и широко известные ролики, мейнстрим, побольше современного; без политики, иноагентов, 18+. Ответ не должен угадываться из текста вопроса. У каждого вопроса уникальная формулировка (подсказка).
Нельзя повторять (уже есть): {', '.join(sorted(banned))}
Верни JSON: {{"q":[{{"value":200,"prompt":"...","answer":"...","variants":["..."],"curtain":true,"search_en":"...","search_ru":"...","match_en":"ключевые слова, которые точно есть в названии ролика на YouTube (оригинальное название)","match_ru":"ключевые слова для VK","artist":"","song":""}}]}}"""
def review_prompt(c,items):
    js=json.dumps([{'id':q['id'],'value':q['value'],'prompt':q['prompt'],'answer':q['answer'],'variants':q['variants'],'youtube_title':q['yt']['title'],'youtube_channel':q['yt']['channel'],'vk_title':(q.get('vk') or {}).get('title')} for q in items],ensure_ascii=False)
    return f"""Ты строгий редактор видео-вопросов русской викторины «Своя игра», тема «{c}». Игроки смотрят (или слушают под шторкой) фрагмент ролика youtube_title (канал youtube_channel; копия на VK — vk_title) и отвечают на prompt.
{T.DIFF} Допустимые номиналы: {SC[c]}.
Проверь каждый: fact — "ok", если ролик действительно соответствует ответу (тот самый фильм/клип/передача, официальный или нормальный по качеству, не пародия/реакция), подсказка верна; "wrong" — не соответствует или ошибка в подсказке; "unsure". leak: true, если prompt выдаёт ответ. popular: false, если не мейнстрим. value — твой номинал. bad_variants/add_variants — для записей ответа. vk_ok: false, если vk_title явно про другой ролик.
Вопросы: {js}
Верни JSON: {{"r":[{{"id":"...","fact":"ok","value":200,"add_variants":["..."],"vk_ok":true}}]}} — поля leak, popular, bad_variants, why пиши только если они отличаются от нормы."""
def vk_find(queries):
    if not queries: return {}
    out=f'/tmp/vk_{uuid.uuid4().hex}.json'
    subprocess.run(['node','find.mjs',*queries],cwd='/workspace/bankx5/vk',env={**os.environ,'OUT':out,'MIN':'15','PROFILE':'/tmp/vkprofile_bx5'},capture_output=True,text=True,timeout=60*len(queries)+120)
    return json.load(open(out)) if os.path.exists(out) else {}
def vk_check(urls):
    if not urls: return set()
    r=subprocess.run(['node','check.mjs',*urls],cwd='/workspace/bankx5/vk',capture_output=True,text=True,timeout=30*len(urls)+60)
    ok=set()
    for l in r.stdout.splitlines():
        for u in urls:
            if u in l and ('ok' in l.lower() or 'inited' in l.lower()) and 'fail' not in l.lower(): ok.add(u)
    return ok, r.stdout
def vk_pick(q,res):
    keys=key_tokens(q.get('match_ru') or q['search_ru'])
    for r in res or []:
        t=r.get('title') or ''; tl=t.lower()
        if r.get('restricted'): continue
        if any(b in tl for b in ('реакция','обзор','пародия','караоке','кавер','ai upscale','разбор')): continue
        if q['category']=='Трейлеры' and 'трейлер' not in tl and 'trailer' not in tl: continue
        if keys and not any(k in norm(t) for k in keys[:2]): continue
        lo=60 if q['category']!='ТВ-шоу' else 16
        if (r.get('dur') or 0)<lo: continue
        return {'url':f"https://vkvideo.ru/video_ext.php?oid={r['oid']}&id={r['id']}&hash={r['hash']}",'title':t,'dur':r.get('dur')}
    return None
def decide(c,q,revs):
    rs=[r for r in revs if r]
    if len(rs)<2: return None,['review_missing']
    if any(r.get('fact')=='wrong' for r in rs) or sum(r.get('fact')=='unsure' for r in rs)>=2: return None,['fact']
    if any(r.get('leak') for r in rs): return None,['leak']
    if sum(r.get('popular') is False for r in rs)>=2: return None,['not_popular']
    vals=sorted(min(SC[c],key=lambda v:abs(v-(r.get('value') or q['value']))) for r in rs)
    med=vals[len(vals)//2]
    bad={norm(b) for r in rs for b in (r.get('bad_variants') or [])}
    vs=[v for v in q['variants'] if norm(v) not in bad and norm(v)!=norm(q['answer'])]
    adds=collections.Counter(a for r in rs for a in (r.get('add_variants') or []))
    for a,n in adds.items():
        if a not in vs and norm(a)!=norm(q['answer']) and (n>=2 or not vs): vs.append(a)
    if not vs: return None,['no_variants']
    vk_ok=sum(r.get('vk_ok') is False for r in rs)<2
    return {**q,'variants':vs,'value_new':med,'vk_ok':vk_ok},[]
def run(c,need):
    accepted=[x for x in readl(ACC) if x['category']==c]
    used={norm(q['answer']) for q in ex(c)}|{norm(x['answer']) for x in accepted}
    usedyt={q.get('youtube_id') for q in ex(c)}|{x['yt']['id'] for x in accepted}
    usedvk={q.get('vk_url') for q in ex(c)}|{(x.get('vk') or {}).get('url') for x in accepted}
    for rnd in range(4):
        have=collections.Counter(x['value_new'] for x in accepted)
        want={v:n-have[v] for v,n in need.items() if n-have[v]>0}
        if not want: break
        tot=sum(want.values()); mult=1.6 if rnd==0 else 1.3
        cands=[]
        calls=max(1,round(tot*mult/20))
        def g(i):
            w={v:max(1,round(n*mult/calls)) for v,n in want.items()}
            r,_=chat(GEN,[{'role':'user','content':gen_prompt(c,w,[q['answer'] for q in ex(c)]+[x['answer'] for x in accepted])}],temperature=0.9,reasoning={'enabled':False})
            return (r or {}).get('q',[])
        with ThreadPoolExecutor(4) as tp:
            for lst in tp.map(g,range(calls)): cands+=lst
        print(c,'rnd',rnd,'gen',len(cands),flush=True)
        surv=[]
        seen=set(used)
        for q in cands:
            q['category']=c; q['id']=uuid.uuid4().hex[:8]
            try: q['value']=min(SC[c],key=lambda v:abs(v-int(q.get('value',SC[c][0]))))
            except Exception: q['value']=SC[c][0]
            q['variants']=[v for v in (q.get('variants') or []) if isinstance(v,str) and v.strip()]
            key=norm(q['answer'])+('|'+norm(q.get('song','')) if c=='Клипы' else '')
            if c!='Клипы' and norm(q['answer']) in seen: append(REJ,{**q,'reasons':['dup_answer']}); continue
            if c=='Клипы' and (key in seen or sum(1 for s in seen if s.split('|')[0]==norm(q['answer']))>=2): append(REJ,{**q,'reasons':['dup_answer']}); continue
            seen.add(key if c=='Клипы' else norm(q['answer'])); surv.append(q)
        # youtube
        with ThreadPoolExecutor(6) as tp: yts=list(tp.map(pick_yt,surv))
        s2=[]
        for q,y in zip(surv,yts):
            if not y or y['id'] in usedyt: append(REJ,{**q,'reasons':['no_youtube']}); continue
            q['yt']=y; usedyt.add(y['id']); s2.append(q)
        print(c,'yt ok',len(s2),'of',len(surv),flush=True)
        # vk
        qs=list({q['search_ru'] for q in s2})
        vkres={}
        for i in range(0,len(qs),15): vkres.update(vk_find(qs[i:i+15]))
        for q in s2:
            v=vk_pick(q,vkres.get(q['search_ru']))
            if v and v['url'] not in usedvk: q['vk']=v
        urls=[q['vk']['url'] for q in s2 if q.get('vk')]
        okset=set()
        for i in range(0,len(urls),20): okset|=vk_check(urls[i:i+20])[0]
        for q in s2:
            if q.get('vk') and q['vk']['url'] not in okset: q.pop('vk')
        print(c,'vk ok',sum(1 for q in s2 if q.get('vk')),flush=True)
        # review
        for i in range(0,len(s2),15):
            b=s2[i:i+15]
            def rv(m):
                try:
                    r,_=chat(m,[{'role':'user','content':review_prompt(c,b)}],temperature=0.2,reasoning=T.RREASON.get(m))
                    return {x.get('id'):x for x in (r or {}).get('r',[])}
                except Exception as e: return {}
            with ThreadPoolExecutor(3) as tp: R=list(tp.map(rv,T.REVIEWERS))
            for q in b:
                d,why=decide(c,q,[r.get(q['id']) for r in R])
                if not d: append(REJ,{**q,'reasons':why,'stage':'review'}); continue
                if not d['vk_ok']: d.pop('vk',None)
                h=collections.Counter(x['value_new'] for x in accepted)
                if h[d['value_new']]>=need.get(d['value_new'],0):
                    alt=[v for v in need if h[v]<need[v]]
                    if alt and abs(min(alt,key=lambda v:abs(v-d['value_new']))-d['value_new'])<=100: d['value_new']=min(alt,key=lambda v:abs(v-d['value_new']))
                    else: append(REJ,{**q,'reasons':['surplus']}); continue
                d['revs']=[r.get(q['id']) for r in R]
                accepted.append(d); append(ACC,d); used.add(norm(d['answer']))
                if d.get('vk'): usedvk.add(d['vk']['url'])
        print(c,'acc',len(accepted),flush=True)
if __name__=='__main__':
    N=needs(); print(N)
    for c in (sys.argv[1:] or list(SC)): run(c,N[c])
