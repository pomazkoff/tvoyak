import json, sys, os, random, statistics, subprocess, uuid, collections, time
from concurrent.futures import ThreadPoolExecutor
from common import *
from llm import chat
FITREJ={x['key'] for x in readl(f'{W}/fit.jsonl') if not x['keep']}
from briefs import B, SPECIAL
GEN_MODEL=os.environ.get('GEN_MODEL','anthropic/claude-haiku-5.5')
GREASON={'effort':'low'} if GEN_MODEL.startswith('openai') else {'enabled':False}
RREASON={'deepseek/deepseek-v4.1-flash':{'enabled':False},'openai/gpt-6-luna-pro':{'effort':'low'},'google/gemini-3.1-flash-lite':{'effort':'low'}}
REVIEWERS=['openai/gpt-6-luna-pro','deepseek/deepseek-v4.1-flash','google/gemini-3.1-flash-lite']
bank=json.load(open('../bank_before.json'))
targets=json.load(open('targets.json'))
CAND=f'{W}/text_cand.jsonl'; ACC=f'{W}/text_acc.jsonl'; REJ=f'{W}/text_rej.jsonl'
SCALE=[100,200,300,400,500,600,800,1000]
NOANS={'Сколько стоило?','Логика с подвохом'}

def text_needs():
    needs={}
    for c,o in targets.items():
        if o['mkind'] in ('picture','video'): continue
        d=collections.Counter()
        for k,n in o['buckets'].items():
            kind,v=k.split('|')
            if o['mkind']=='music' and kind=='music': continue
            d[int(v)]+=4*n
        if d: needs[c]=dict(d)
    return needs

def existing(c):
    return [q for q in bank if q['category']==c]

DIFF="""Шкала сложности (номинал): 100 — знает почти любой взрослый в России; 200 — легко; 300 — средне, нужно немного интереса к теме; 400 — для тех, кто следит за темой; 500 — трудно, но ответ всё ещё известен многим любителям темы; 600–1000 — для знатоков темы, но про массовые, известные вещи (не узкоспециальные факты). Не ставь высокий номинал вопросу, на который ответит почти любой (Google, Nintendo, Porsche — это 100–200)."""

SUBT_F=f'{W}/subtopics.json'
_subt=json.load(open(SUBT_F)) if os.path.exists(SUBT_F) else {}
def subtopics(c):
    if c in _subt: return _subt[c]
    brief=(SPECIAL[c][0] if c in SPECIAL else B.get(c,c))
    r,_=chat(GEN_MODEL,[{'role':'user','content':f'Тема викторины «{c}» ({brief}). Перечисли 60 разных конкретных подтем/направлений для вопросов (например, для «Кино»: «фильмы Marvel», «советские комедии Гайдая», «Оскар 2010-х», «российские блокбастеры 2020-х», «Гарри Поттер»), разнообразно, мейнстрим, интересно массовой российской аудитории. JSON: {{"t":["..."]}}'}],temperature=0.8,reasoning={'enabled':False})
    t=(r or {}).get('t',[]) or [c]
    with lock:
        _subt[c]=t; json.dump(_subt,open(SUBT_F,'w'),ensure_ascii=False)
    return t

def gen_prompt(c, want, ctx_lines):
    brief,fmt = (SPECIAL[c] if c in SPECIAL else (B.get(c,c),''))
    wl=', '.join(f'{v} — {n} шт.' for v,n in sorted(want.items()))
    return f"""Ты автор вопросов для русской телевикторины в стиле «Своя игра» для компании друзей (веб-игра «Твояк»). Тема (категория): «{c}» — {brief}.
{fmt}
Сгенерируй вопросы по номиналам: {wl}.\nВ этой пачке бери вопросы из подтем: {'; '.join(random.sample(subtopics(c),min(4,len(subtopics(c)))))} (можно и смежные, но не повторяй типовые вопросы).
{DIFF}
Правила:
- Только на русском языке. Мейнстрим и актуальность: то, что знают и обсуждают в России, побольше современных (2010–2024) тем, но без фактов, в которых ты не уверен на 100%. Никакой политики, войн, иноагентов, 18+.
- Факты должны быть абсолютно точными и проверяемыми; в поле source кратко обоснуй факт (где/когда).
- Ответ НЕ должен угадываться из текста вопроса: ответ, его части, однокоренные слова и транслит не должны встречаться в вопросе.
- Ответ короткий и однозначный (одно имя, название, слово или число); у вопроса нет второго правильного ответа.
- variants — 1–5 других допустимых записей ТОГО ЖЕ правильного ответа: синонимы, короткая форма, фамилия без имени, оригинальное название, написание латиницей/кириллицей. НЕ включай неправильные ответы. Если иначе записать нельзя — хотя бы вариант без кавычек/дефисов или цифрами/словами.
- Не повторяй вопросы и ответы, которые уже есть в теме (список ниже), и не повторяйся внутри пачки. Покрой разные подтемы.
Уже есть в теме (ответ — вопрос):
{ctx_lines}
Верни JSON: {{"q":[{{"value":300,"prompt":"...","answer":"...","variants":["..."],"source":"..."}}]}}"""

def ctx_for(c, extra):
    allq=existing(c)+list(extra)
    ans=sorted({q['answer'] for q in allq})
    sample=[f"{q['answer']} — {q['prompt'][:80]}" for q in allq[-40:]]
    return 'Ответы, которые уже заняты: '+'; '.join(ans)+'\nПримеры вопросов:\n'+'\n'.join(sample)

def review_ctx(c, items, acc):
    pool=existing(c)+acc
    pg=[(e,grams(e['prompt'])) for e in pool]
    lines=[]; seen=set()
    for q in items:
        g=grams(q['prompt']); na=norm(q['answer'])
        cand=sorted(pg,key=lambda t:-jacc(g,t[1]))[:3]+[t for t in pg if norm(t[0]['answer'])==na]
        for e,_ in cand:
            k=e['prompt']
            if k in seen: continue
            seen.add(k); lines.append(f"{e['answer']} — {e['prompt'][:120]}")
    return '\n'.join(lines)

def run_leaks(items):
    p=f'/tmp/lk_{uuid.uuid4().hex}.json'; o=p+'.out'
    json.dump(items,open(p,'w'),ensure_ascii=False)
    subprocess.run(['/workspace/bankx5/tsx/node_modules/.bin/tsx','scripts/_leak_tmp.ts',p,o],cwd='/workspace/bankx5/repo',check=True)
    return {r['id']:r for r in json.load(open(o))}

def review_prompt(c, items, ctx_lines, scale):
    brief,fmt=(SPECIAL[c] if c in SPECIAL else (B.get(c,c),''))
    js=json.dumps([{k:q[k] for k in ('id','value','prompt','answer','variants')} for q in items],ensure_ascii=False)
    return f"""Ты строгий редактор и фактчекер русской викторины в стиле «Своя игра». Тема: «{c}» — {brief}. {fmt}
{DIFF} Допустимые номиналы в теме: {scale}.
Проверь каждый новый вопрос:
- fact: "ok" — ответ точно верен и факт в вопросе верен; "wrong" — есть фактическая ошибка (в вопросе или ответе) или у вопроса есть другой правильный ответ; "unsure" — не можешь уверенно подтвердить.
- leak: true, если ответ (или его часть, однокоренное слово, транслит) есть в тексте вопроса или ответ очевиден из формулировки без знаний.
- popular: true, если тема мейнстримная и интересна массовой русскоязычной компании; false — узкоспециально, устарело и забыто или не по теме категории.
- value: какой номинал из допустимых ты бы поставил по сложности.
- dup: true, если вопрос по сути повторяет вопрос из списка «уже есть» (тот же факт/тот же ответ на тот же вопрос) или другой новый вопрос из этой пачки (помечай более поздний).
- bad_variants: варианты, которые НЕ являются верной записью правильного ответа (их надо убрать).
- add_variants: другие верные записи того же ответа, которых не хватает (синонимы, латиница/кириллица, краткая форма).
- why: очень коротко, если что-то не ok.
Уже есть в теме (ответ — вопрос):
{ctx_lines}
Новые вопросы: {js}
Верни JSON: {{"r":[{{"id":"...","fact":"ok","value":300,"add_variants":["..."]}}]}} — для каждого id обязательно fact, value и add_variants (хотя бы один вариант, если он возможен); поля leak, popular, dup, bad_variants, why пиши ТОЛЬКО если они отличаются от нормы (leak:true, popular:false, dup:true, непустой bad_variants, why при fact не ok)."""

def steps(a,b,scale):
    def idx(v):
        return min(range(len(scale)),key=lambda i:abs(scale[i]-v))
    return idx(b)-idx(a)

def decide(q, revs, scale):
    reasons=[]
    rs=[r for r in revs if r]
    if len(rs)<2: return False,['review_missing'],q['variants']
    facts=[r.get('fact','unsure') for r in rs]
    if 'wrong' in facts: reasons.append('fact_wrong:'+'; '.join(r.get('why','') for r in rs if r.get('fact')=='wrong'))
    elif facts.count('unsure')>=2: reasons.append('fact_unsure')
    if any(r.get('leak') for r in rs): reasons.append('leak')
    if sum(1 for r in rs if r.get('popular') is False)>=2: reasons.append('not_mainstream')
    vals=[r.get('value') for r in rs if isinstance(r.get('value'),(int,float))]
    st=[steps(q['value'],v,scale) for v in vals]
    if sum(1 for s in st if abs(s)>=2)>=2 or (len(st)>=3 and (all(s>=1 for s in st) or all(s<=-1 for s in st))):
        med=statistics.median(vals)
        nv=min(scale,key=lambda x:abs(x-med))
        reasons.append(f'difficulty:{vals}->{nv}')
    if sum(1 for r in rs if r.get('dup'))>=2 or (any(r.get('dup') for r in rs) and q.get('_samans')): reasons.append('dup')
    bad=set(); 
    for r in rs: bad|={norm(x) for x in (r.get('bad_variants') or [])}
    addc=collections.Counter()
    for r in rs:
        for x in set(norm(y) for y in (r.get('add_variants') or [])): addc[x]+=1
    raw={norm(x):x for r in rs for x in (r.get('add_variants') or [])}
    var=[v for v in q['variants'] if norm(v) not in bad and norm(v)!=norm(q['answer'])]
    for k,n in addc.items():
        if n>=2 and k not in bad and k!=norm(q['answer']) and k not in {norm(v) for v in var}: var.append(raw[k])
    # dedupe
    seen=set(); var2=[]
    for v in var:
        if norm(v) and norm(v) not in seen: seen.add(norm(v)); var2.append(v.strip())
    if not var2:
        for k in addc:
            if k not in bad and k!=norm(q['answer']): var2.append(raw[k]); break
    if not var2: reasons.append('no_variants')
    return (not reasons), reasons, var2

def process_category(c, need, rounds=int(os.environ.get('ROUNDS','6'))):
    scale=[100,200,300,400,500] if c in SPECIAL else SCALE
    acc=[q for q in readl(ACC) if q['category']==c and c+'|'+q['prompt'] not in FITREJ]
    allc=[q for q in readl(CAND) if q['category']==c]
    for rnd in range(rounds):
        have=collections.Counter(q['value'] for q in acc)
        deficit={v:n-have[v] for v,n in need.items() if n-have[v]>0}
        if not deficit: break
        want_total={v:max(1,round(n*1.5)) if rnd==0 else n+1 for v,n in deficit.items()}
        # chunk into calls of ~20
        queue=[]
        for v,n in want_total.items(): queue+= [v]*n
        random.shuffle(queue)
        batch_new=[]
        for i in range(0,len(queue),20):
            want=collections.Counter(queue[i:i+20])
            r,_=chat(GEN_MODEL,[{'role':'user','content':gen_prompt(c,want,ctx_for(c,acc+allc+batch_new))}],temperature=0.9,reasoning=GREASON)
            for x in (r or {}).get('q',[]):
                try:
                    v=int(x['value']); 
                    if v not in need: continue
                    q={'id':uuid.uuid4().hex[:10],'category':c,'value':v,'prompt':x['prompt'].strip(),'answer':str(x['answer']).strip(),'variants':[str(y) for y in (x.get('variants') or [])],'source':x.get('source',''),'round':rnd}
                    if not q['prompt'] or not q['answer']: continue
                    batch_new.append(q); append(CAND,q)
                except Exception: pass
        allc+=batch_new
        # local checks
        leaks=run_leaks(batch_new) if batch_new else {}
        pool_ex=existing(c)+acc
        survivors=[]
        for q in batch_new:
            lk=[l for l in leaks[q['id']]['leaks'] if l['level']=='full']
            if lk: append(REJ,{**q,'reasons':['leak_auto:'+lk[0]['needle']],'stage':'local'}); continue
            g=grams(q['prompt'])
            sim=max([jacc(g,grams(e['prompt'])) for e in pool_ex+survivors] or [0])
            if sim>0.55: append(REJ,{**q,'reasons':[f'dup_auto:{sim:.2f}'],'stage':'local'}); continue
            if c not in NOANS:
                same=[e for e in pool_ex+survivors if norm(e['answer'])==norm(q['answer'])]
                if len(same)>=2: append(REJ,{**q,'reasons':['dup_answer_x2'],'stage':'local'}); continue
                q['_samans']=bool(same)
            survivors.append(q)
        # LLM review in batches of 20
        for i in range(0,len(survivors),20):
            chunk=survivors[i:i+20]
            ctx=review_ctx(c,chunk,acc)
            pr=review_prompt(c,chunk,ctx,scale)
            def rv(m):
                r,_=chat(m,[{'role':'user','content':pr}],temperature=0.1,reasoning=RREASON.get(m,{'effort':'low'}))
                return {str(x.get('id')):x for x in (r or {}).get('r',[])} if r else {}
            with ThreadPoolExecutor(3) as ex: outs=list(ex.map(rv,REVIEWERS))
            for q in chunk:
                revs=[o.get(q['id']) for o in outs]
                ok,reasons,var=decide(q,revs,scale)
                have=collections.Counter(x['value'] for x in acc)
                if not ok and len(reasons)==1 and reasons[0].startswith('difficulty:'):
                    nv=int(reasons[0].split('->')[1])
                    if nv in need and have[nv]<need[nv]:
                        q={**q,'value':nv,'repriced_from':q['value']}; ok=True
                if ok and have[q['value']]>=need[q['value']]:
                    append(REJ,{**q,'reasons':['surplus'],'stage':'surplus','revs':revs}); continue
                if ok:
                    q2={k:v for k,v in q.items() if not k.startswith('_')}; q2['variants']=var; q2['revs']=revs
                    acc.append(q2); append(ACC,q2)
                else:
                    append(REJ,{**q,'reasons':reasons,'stage':'review','revs':revs})
    have=collections.Counter(q['value'] for q in acc)
    return c, sum(need.values()), len(acc), {v:(have[v],n) for v,n in need.items()}

if __name__=='__main__':
    needs=text_needs()
    only=sys.argv[1:] 
    cats=[c for c in needs if not only or c in only]
    with ThreadPoolExecutor(int(os.environ.get('PAR','8'))) as ex:
        def safe(c):
            try: return process_category(c,needs[c])
            except Exception as e: return (c,'ERR',repr(e)[:200])
        for res in ex.map(safe,cats):
            print('DONE',*res,flush=True)
