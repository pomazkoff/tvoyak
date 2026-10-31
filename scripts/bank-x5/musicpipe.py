import json, sys, os, random, statistics, uuid, collections, time, urllib.parse, requests, re
from concurrent.futures import ThreadPoolExecutor
from common import *
from llm import chat
from textpipe import RREASON
import textpipe as T
GEN_MODEL='anthropic/claude-haiku-5.5'
bank=T.bank; targets=T.targets
CAND=f'{W}/music_cand.jsonl'; ACC=f'{W}/music_acc.jsonl'; REJ=f'{W}/music_rej.jsonl'
CACHE=f'{W}/itunes_cache.json'
cache=json.load(open(CACHE)) if os.path.exists(CACHE) else {}
SCALE=T.SCALE
HINT={
'Классика':'Кто композитор этого произведения? Подсказка: … (answer — композитор; запись — известное исполнение)',
'Саундтреки':'Из какого фильма, сериала, игры или мультфильма эта музыка? Подсказка: … (answer — название произведения; трек — оригинальный саундтрек)',
'Звук наоборот':'Задом наперёд: <жанр/эпоха>. Кто исполняет? (answer — исполнитель; трек играет задом наперёд, поэтому только мега-хиты с ярким припевом)',
}
DEFAULT_HINT='«Назовите исполнителя. Подсказка: …» (answer — исполнитель) или иногда «Как называется эта песня? Подсказка: …» (answer — название песни)'
def needs():
    out={}
    for c,o in targets.items():
        if o['mkind']!='music': continue
        d=collections.Counter()
        for k,n in o['buckets'].items():
            kind,v=k.split('|')
            if kind=='music': d[int(v)]+=4*n
        out[c]=dict(d)
    return out
def ex_music(c): return [q for q in bank if q['category']==c and q['kind']=='music']

def itunes(term, country):
    k=f'{country}|{term}'
    if k in cache: return cache[k]
    for a in range(4):
        try:
            r=requests.get('https://itunes.apple.com/search',params=dict(term=term,media='music',entity='song',limit=25,country=country),timeout=20)
            if r.status_code==200:
                res=r.json().get('results',[]); cache[k]=res; time.sleep(0.5); return res
            time.sleep(10*(a+1))
        except Exception: time.sleep(5)
    return []
BAD=('live','remix','karaoke','instrumental','cover','acoustic','версия','version','tribute','made famous','in the style','8-bit','lullaby','piano version','sped up','slowed','re-record','демо')
def tok(s): return set(norm(s).split())
def find_track(artist,title,classical=False):
    for country in ('ru','us'):
        res=itunes(f'{artist} {title}',country)
        best=None
        for r in res:
            pu=r.get('previewUrl','')
            if not pu.startswith('https://audio-ssl.itunes.apple.com/'): continue
            tn=r.get('trackName',''); an=r.get('artistName','')
            low=(tn+' '+r.get('collectionName','')).lower()
            if not classical and any(b in tn.lower() for b in BAD): continue
            tt=norm(title).split()
            if not tt or not norm(tn).startswith(' '.join(tt[:2])) and not (classical and set(tt[:2])&tok(tn)): continue
            at=tok(artist); 
            if not classical and not (at & tok(an)) and norm(artist) not in norm(an): continue
            best=r; break
        if best: return {'url':best['previewUrl'],'track':best['trackName'],'artist':best['artistName'],'album':best.get('collectionName'),'country':country,'ms':best.get('trackTimeMillis'),'year':(best.get('releaseDate') or '')[:4]}
    return None

def gen_prompt(c,want,banned,used):
    brief=T.B.get(c, 'очень известные песни для угадывания по 30-секундному фрагменту')
    if c=='Угадай мелодию': brief='самые узнаваемые песни всех эпох — русские и зарубежные хиты, от советской классики до хитов 2024 года'
    if c=='Звук наоборот': brief='очень известный трек (русский или мировой хит), который играет задом наперёд'
    wl=', '.join(f'{v} — {n} шт.' for v,n in sorted(want.items()))
    return f"""Ты готовишь музыкальные вопросы для русской викторины в стиле «Своя игра» (тема «{c}»: {brief}). Игроки слышат 30-секундное превью трека из iTunes и отвечают.
Шаблон вопроса: {HINT.get(c,DEFAULT_HINT)}
Подсказка короткая (3–8 слов), верная, без названия трека, без имени исполнителя и их частей/транслита; у каждого вопроса своя подсказка.
Номиналы: {wl}. {T.DIFF} Чем узнаваемее трек и исполнитель для массовой русскоязычной компании — тем ниже номинал.
Требования: только реальные, широко известные студийные записи, которые есть в iTunes/Apple Music; мейнстрим и побольше современных хитов (2000–2024), но без сомнительных фактов; без иноагентов и 18+.
variants — другие допустимые записи ответа (латиница/кириллица, краткая форма, фамилия), НЕ неправильные ответы.
Нельзя использовать этих исполнителей/ответы (уже есть в теме): {', '.join(sorted(banned))}
Уже выбранные песни: {', '.join(sorted(used))[:3000]}
Верни JSON: {{"q":[{{"value":300,"artist":"исполнитель как в iTunes (латиницей или кириллицей)","title":"название трека как в iTunes","prompt":"...","answer":"...","variants":["..."],"fact":"почему подсказка верна"}}]}}"""

def review_prompt(c,items):
    js=json.dumps([{k:q[k] for k in ('id','value','prompt','answer','variants')}|{'itunes_artist':q['it']['artist'],'itunes_track':q['it']['track'],'itunes_album':q['it']['album']} for q in items],ensure_ascii=False)
    return f"""Ты строгий редактор музыкальных вопросов русской викторины «Своя игра», тема «{c}». Игроки слышат 30-секундное превью трека itunes_track (исполнитель itunes_artist, альбом itunes_album){' задом наперёд' if c=='Звук наоборот' else ''} и отвечают на prompt.
{T.DIFF} Допустимые номиналы: {SCALE}.
Для каждого вопроса проверь:
- fact: "ok" — answer верен для этого трека, подсказка в prompt верна, трек — оригинальная запись (не кавер, не караоке, не ремикс; для классики/саундтрека — действительно это произведение); "wrong" — ошибка; "unsure" — не уверен.
- leak: true, если prompt выдаёт ответ (название, имя, транслит, однокоренные).
- popular: true, если трек/исполнитель узнаваемы для массовой русскоязычной компании и подходят теме «{c}».
- value: какой номинал ты бы поставил.
- bad_variants / add_variants: убрать неверные записи ответа / добавить недостающие верные (латиница/кириллица, краткая форма).
- why: коротко, если что-то не ok.
Вопросы: {js}
Верни JSON: {{"r":[{{"id":"...","fact":"ok","value":300,"add_variants":["..."]}}]}} — для каждого id обязательно fact, value и add_variants (хотя бы один вариант, если он возможен); поля leak, popular, bad_variants, why пиши ТОЛЬКО если они отличаются от нормы (leak:true, popular:false, непустой bad_variants, why при fact не ok)."""

def process(c,need,used_global,rounds=4):
    exq=ex_music(c)
    banned={q['answer'] for q in exq}
    ex_urls={q['audio_url'] for q in bank if q.get('audio_url')}
    acc=[q for q in readl(ACC) if q['category']==c]
    for rnd in range(rounds):
        have=collections.Counter(q['value'] for q in acc)
        deficit={v:n-have[v] for v,n in need.items() if n-have[v]>0}
        if not deficit: break
        queue=[]
        for v,n in deficit.items(): queue+=[v]*(round(n*1.7) if rnd==0 else n+2)
        random.shuffle(queue); cands=[]
        for i in range(0,len(queue),20):
            want=collections.Counter(queue[i:i+20])
            used=used_global|{f"{q['artist']} — {q['title']}" for q in cands}
            r,_=chat(GEN_MODEL,[{'role':'user','content':gen_prompt(c,want,banned,used)}],temperature=0.9,reasoning={'enabled':False})
            for x in (r or {}).get('q',[]):
                try:
                    v=int(x['value'])
                    if v not in need: continue
                    q={'id':uuid.uuid4().hex[:10],'category':c,'value':v,'artist':x['artist'].strip(),'title':x['title'].strip(),'prompt':x['prompt'].strip(),'answer':str(x['answer']).strip(),'variants':[str(y) for y in x.get('variants') or []],'fact':x.get('fact',''),'round':rnd}
                    key=norm(q['artist'])+'|'+norm(q['title'])
                    if key in {norm(a)+'|'+norm(t) for a,t in [s.split(' — ',1) for s in used_global|{f"{z['artist']} — {z['title']}" for z in cands}]}:
                        append(REJ,{**q,'reasons':['dup_song'],'stage':'local'}); continue
                    if norm(q['answer']) in {norm(b) for b in banned} or norm(q['artist']) in {norm(b) for b in banned}:
                        append(REJ,{**q,'reasons':['dup_existing_artist'],'stage':'local'}); continue
                    cands.append(q); append(CAND,q)
                except Exception: pass
        # artist cap 2 among new
        cnt=collections.Counter(norm(q['artist']) for q in acc)
        ok1=[]
        for q in cands:
            if cnt[norm(q['artist'])]>=2: append(REJ,{**q,'reasons':['artist_cap'],'stage':'local'}); continue
            cnt[norm(q['artist'])]+=1; ok1.append(q)
        # itunes
        ok2=[]
        for q in ok1:
            it=find_track(q['artist'],q['title'],classical=(c in ('Классика','Саундтреки')))
            if not it: append(REJ,{**q,'reasons':['no_itunes_preview'],'stage':'media'}); continue
            if it['url'] in ex_urls: append(REJ,{**q,'reasons':['dup_preview'],'stage':'media'}); continue
            q['it']=it; ok2.append(q)
        json.dump(cache,open(CACHE,'w'))
        # leaks: answer + title + artist (title only matters if answer is artist, etc.)
        lk=T.run_leaks([{'id':q['id'],'prompt':q['prompt'],'answer':q['answer'],'variants':q['variants']+[q['title'],q['artist']] + ([] if c!='Саундтреки' else [])} for q in ok2]) if ok2 else {}
        ok3=[]
        for q in ok2:
            full=[l for l in lk[q['id']]['leaks'] if l['level']=='full']
            if full: append(REJ,{**q,'reasons':['leak_auto:'+full[0]['needle']],'stage':'local'}); continue
            if any(T.jacc(grams(q['prompt']),grams(e['prompt']))>0.8 for e in exq+acc+ok3):
                append(REJ,{**q,'reasons':['dup_prompt'],'stage':'local'}); continue
            ok3.append(q)
        for i in range(0,len(ok3),20):
            chunk=ok3[i:i+20]; pr=review_prompt(c,chunk)
            def rv(m):
                r,_=chat(m,[{'role':'user','content':pr}],temperature=0.1,reasoning=RREASON.get(m,{'effort':'low'}))
                return {str(x.get('id')):x for x in (r or {}).get('r',[])} if r else {}
            with ThreadPoolExecutor(3) as ex: outs=list(ex.map(rv,T.REVIEWERS))
            for q in chunk:
                revs=[o.get(q['id']) for o in outs]
                for r in revs:
                    if r: r['dup']=False
                ok,reasons,var=T.decide(q,revs,SCALE)
                have=collections.Counter(x['value'] for x in acc)
                if not ok and len(reasons)==1 and reasons[0].startswith('difficulty:'):
                    nv=int(reasons[0].split('->')[1])
                    if nv in need and have[nv]<need[nv]: q={**q,'value':nv,'repriced_from':q['value']}; ok=True
                if ok and have[q['value']]>=need[q['value']]: append(REJ,{**q,'reasons':['surplus'],'stage':'surplus'}); continue
                if ok:
                    q2=dict(q); q2['variants']=var; q2['revs']=revs; acc.append(q2); append(ACC,q2)
                    used_global.add(f"{q['artist']} — {q['title']}")
                else: append(REJ,{**q,'reasons':reasons,'stage':'review','revs':revs})
    have=collections.Counter(q['value'] for q in acc)
    return c,sum(need.values()),len(acc),{v:(have[v],n) for v,n in need.items()}

if __name__=='__main__':
    N=needs(); only=sys.argv[1:]
    used=set(f"{q['artist']} — {q['title']}" for q in readl(ACC))
    cats=[c for c in N if not only or c in only]
    def safe(c):
        try: return process(c,N[c],used)
        except Exception as e:
            import traceback; traceback.print_exc(); return (c,'ERR',repr(e)[:200])
    with ThreadPoolExecutor(int(os.environ.get('PAR','3'))) as ex:
        for r in ex.map(safe,cats): print('DONE',*r,flush=True)
    json.dump(cache,open(CACHE,'w'))
