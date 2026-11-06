import json,sys,random,collections,requests,uuid,re
from concurrent.futures import ThreadPoolExecutor
from common import *
from llm import chat
import textpipe as T
GEN='anthropic/claude-haiku-5.5'
TW="https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/"
_tw={}
def twcode(e):
    pts=[ord(ch) for ch in e]; z=0x200d in pts
    return '-'.join(format(p,'x') for p in pts if z or p!=0xfe0f)
def tw_ok(e):
    if e not in _tw:
        try: _tw[e]=requests.head(TW+twcode(e)+'.svg',timeout=15,allow_redirects=True).status_code==200
        except Exception: _tw[e]=False
    return _tw[e]
EMO_RE=re.compile(r'[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\u20e3\U0001F1E6-\U0001F1FF]')
def is_emoji(e): return isinstance(e,str) and 0<len(e)<=16 and bool(EMO_RE.search(e)) and not re.search('[A-Za-zА-Яа-я]',e)
VALS=[100,200,300,400,500,600,800,1000]
def need(c):
    d=collections.Counter()
    for k,n in T.targets[c]['buckets'].items(): d[int(k.split('|')[1])]+=4*n
    return dict(d)
ex=lambda c:[q for q in T.bank if q['category']==c]
GRID={100:(6,4),200:(7,4),300:(8,5),400:(8,6),500:(9,6),600:(10,7),800:(11,8),1000:(12,8)}
def gen_emoji(want,banned):
    wl=', '.join(f'{v} — {n} шт.' for v,n in sorted(want.items()))
    return f"""Придумай задания «Эмодзи-шифр» для русской викторины «Своя игра»: название известного произведения зашифровано 2–6 эмодзи (одна строка, максимум 3 строки), игроки угадывают название. Типы: фильм, мультфильм, сериал, песня, сказка, книга, пословица — мейнстрим, известное в России (советское, российское и мировое, побольше современного). Шифр должен однозначно читаться при подсказке типа; эмодзи только стандартные Unicode (никаких букв и цифр-текста, флаги можно).
Номиналы: {wl}. 100 — почти любой отгадает (🐻🍯🎈 → «Винни-Пух»), 300 — надо подумать, 500 — непросто, 800–1000 — сложная, но честная и всё равно однозначная шифровка известного названия.
Нельзя (уже есть): {', '.join(banned)}
JSON: {{"q":[{{"value":100,"type":"мультфильм","lines":[["🐻","🍯","🎈"]],"answer":"Винни-Пух","variants":["Винни Пух","Winnie the Pooh"]}}]}}"""
def gen_hidden(want,banned):
    wl=', '.join(f'{v} — {n} шт.' for v,n in sorted(want.items()))
    return f"""Придумай задания «Найди лишнее» для викторины: на экране сетка из одинаковых эмодзи base, среди них один отличающийся odd; игроки должны найти его и назвать, что это. Сложность растёт, когда odd очень похож на base (🐐 среди 🐑, 🍵 среди ☕, 🐥 среди 🦆) и сетка крупнее. 100 — odd резко отличается по цвету и форме (🍎 среди 🥦); 1000 — почти неотличим по силуэту и цвету.
odd должен однозначно называться одним-двумя русскими словами (ответ — именно название odd), base и odd — стандартные одиночные эмодзи Unicode (без ZWJ, без флагов, без цифр). Не повторяй пары.
Номиналы: {wl}.
Уже есть (odd/base): {', '.join(banned)}
JSON: {{"q":[{{"value":300,"odd":"🧄","base":"🥚","answer":"Чеснок","variants":["Чесночок"]}}]}}"""
def review(c,items):
    if c=='Эмодзи-шифр':
        js='\n'.join(f"{q['id']}: [{q['type']}] {' / '.join(''.join(l) for l in q['lines'])} → «{q['answer']}» (варианты {q['variants']}), номинал {q['value']}" for q in items)
        task="Игроки видят эмодзи и тип (фильм/песня/…), угадывают название. Проверь: fact — ok, если произведение существует, известно в России и шифр честно и достаточно однозначно читается как ответ; wrong — если шифр не читается, ведёт к другому популярному ответу или произведение малоизвестно; unsure."
    else:
        js='\n'.join(f"{q['id']}: лишний {q['odd']} среди {q['base']} → «{q['answer']}» (варианты {q['variants']}), номинал {q['value']}" for q in items)
        task="Игроки видят сетку из base (картинки Twemoji) с одним odd и называют odd. Проверь: fact — ok, если odd в Twemoji действительно изображает ответ и его однозначно можно так назвать, а base явно другой предмет; wrong — иначе; unsure."
    return f"""Ты строгий редактор викторины «Своя игра», формат «{c}». {task}
{T.DIFF}
{js}
Верни JSON {{"r":[{{"id":"..","fact":"ok","value":300,"add_variants":[".."],"bad_variants":[]}}]}} (why — если не ok)."""
def run(c):
    N=need(c); E=ex(c); acc=[x for x in readl(f'{W}/pic_acc.jsonl') if x['category']==c]
    num=max(int(re.search(r'№ (\d+)',q['prompt']).group(1)) for q in E)
    for rnd in range(4):
        h=collections.Counter(x['value'] for x in acc)
        want={v:N[v]-h[v] for v in N if N[v]-h[v]>0}
        if not want: break
        tot=sum(want.values()); calls=max(1,round(tot*1.5/25))
        if c=='Эмодзи-шифр': banned=[q['answer'] for q in E]+[x['answer'] for x in acc]
        else: banned=[f"{q['picture_spec']['odd']}/{q['picture_spec']['base']}" for q in E]+[f"{x['odd']}/{x['base']}" for x in acc]
        def g(i):
            w={v:max(1,round(n*1.5/calls)) for v,n in want.items()}
            pr=(gen_emoji if c=='Эмодзи-шифр' else gen_hidden)(w,banned)
            r,_=chat(GEN,[{'role':'user','content':pr}],temperature=0.95,reasoning={'enabled':False})
            return (r or {}).get('q',[])
        with ThreadPoolExecutor(4) as tp: cands=[q for l in tp.map(g,range(calls)) for q in l]
        seen={(norm(b) if c=='Эмодзи-шифр' else b) for b in banned}; surv=[]
        for q in cands:
            q['category']=c; q['id']=uuid.uuid4().hex[:6]
            try: q['value']=min(VALS,key=lambda v:abs(v-int(q.get('value'))))
            except Exception: continue
            q['variants']=[v for v in q.get('variants') or [] if isinstance(v,str) and v.strip() and norm(v)!=norm(q.get('answer',''))]
            if c=='Эмодзи-шифр':
                lines=q.get('lines')
                if not (isinstance(lines,list) and 1<=len(lines)<=3 and all(isinstance(l,list) and 1<=len(l)<=6 for l in lines)): append(f'{W}/pic_rej.jsonl',{**q,'reasons':['bad_spec']}); continue
                allE=[e for l in lines for e in l]
                if not (2<=len(allE)<=9) or not all(is_emoji(e) and tw_ok(e) for e in allE): append(f'{W}/pic_rej.jsonl',{**q,'reasons':['bad_emoji']}); continue
                key=norm(q['answer'])
            else:
                if not (is_emoji(q.get('odd')) and is_emoji(q.get('base')) and q['odd']!=q['base'] and tw_ok(q['odd']) and tw_ok(q['base'])): append(f'{W}/pic_rej.jsonl',{**q,'reasons':['bad_emoji']}); continue
                key=f"{q['odd']}/{q['base']}"
                if sum(1 for x in E if norm(x['answer'])==norm(q['answer']))+sum(1 for x in acc+surv if norm(x['answer'])==norm(q['answer']))>=2: append(f'{W}/pic_rej.jsonl',{**q,'reasons':['dup_answer']}); continue
            if key in seen: append(f'{W}/pic_rej.jsonl',{**q,'reasons':['dup']}); continue
            seen.add(key); surv.append(q)
        print(c,rnd,len(cands),len(surv),flush=True)
        for i in range(0,len(surv),25):
            b=surv[i:i+25]
            def rv(m):
                try:
                    r,_=chat(m,[{'role':'user','content':review(c,b)}],temperature=0.1,reasoning=T.RREASON.get(m))
                    return {str(x.get('id')):x for x in (r or {}).get('r',[])}
                except Exception: return {}
            with ThreadPoolExecutor(3) as tp: R=list(tp.map(rv,T.REVIEWERS))
            for q in b:
                rs=[r.get(q['id']) for r in R if r.get(q['id'])]
                if len(rs)<2: append(f'{W}/pic_rej.jsonl',{**q,'reasons':['review_missing'],'stage':'review'}); continue
                if any(r.get('fact')=='wrong' for r in rs) or sum(r.get('fact')=='unsure' for r in rs)>=2:
                    append(f'{W}/pic_rej.jsonl',{**q,'reasons':['fact'],'why':[r.get('why') for r in rs],'stage':'review'}); continue
                vals=sorted(min(VALS,key=lambda v:abs(v-(r.get('value') or q['value']))) for r in rs); med=vals[len(vals)//2]
                if abs(VALS.index(med)-VALS.index(q['value']))>=2: q['repriced_from']=q['value']; q['value']=med
                bad={norm(x) for r in rs for x in r.get('bad_variants') or []}
                vs=[v for v in q['variants'] if norm(v) not in bad]
                adds=collections.Counter(a for r in rs for a in r.get('add_variants') or [] if isinstance(a,str))
                for a,n in adds.items():
                    if norm(a)!=norm(q['answer']) and a not in vs and (n>=2 or not vs): vs.append(a)
                q['variants']=vs
                h=collections.Counter(x['value'] for x in acc)
                if h[q['value']]>=N.get(q['value'],0):
                    alt=[v for v in N if h[v]<N[v] and abs(VALS.index(v)-VALS.index(q['value']))<=1]
                    if not alt: append(f'{W}/pic_rej.jsonl',{**q,'reasons':['surplus']}); continue
                    q['value']=alt[0]
                q['revs']=rs; acc.append(q); append(f'{W}/pic_acc.jsonl',q)
        print(c,'acc',len(acc),flush=True)
if __name__=='__main__':
    for c in sys.argv[1:]: run(c)
