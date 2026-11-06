import json,collections,sys
from concurrent.futures import ThreadPoolExecutor
from common import *
from llm import chat
from briefs import B,SPECIAL
keys={(x['category'],x['prompt']) for x in json.load(open('prod_keys.json'))}
OUT=f'{W}/fit.jsonl'
done={x['key'] for x in readl(OUT)}
items=[]
for f,kind in [('text_acc.jsonl','text'),('music_acc.jsonl','music')]:
    for q in readl(f'{W}/{f}'):
        k=q['category']+'|'+q['prompt']
        if (q['category'],q['prompt']) in keys or k in done: continue
        d={'key':k,'category':q['category'],'value':q['value'],'prompt':q['prompt'],'answer':q['answer'],'variants':q['variants']}
        if kind=='music': d['звучит_трек']=f"{q['it']['artist']} — {q['it']['track']}"
        items.append(d)
byc=collections.defaultdict(list)
for x in items: byc[x['category']].append(x)
def brief(c): return SPECIAL[c][0]+'. Формат: '+SPECIAL[c][1] if c in SPECIAL else B.get(c,c)
jobs=[(c,l[i:i+25]) for c,l in byc.items() for i in range(0,len(l),25)]
def run(job):
    c,ch=job
    js=json.dumps([{'n':i,**{k:v for k,v in x.items() if k not in('key','category')}} for i,x in enumerate(ch)],ensure_ascii=False)
    pr=f"""Ты главный редактор русской викторины «Своя игра». Категория «{c}»: {brief(c)}.
Для каждого вопроса реши, оставить ли его. Отклоняй (keep=false), если:
- вопрос не по теме категории или не в её формате (например, в «Кто это сказал?» нет цитаты; в «Сериалы» вопрос про фильм; в «Мемы» вопрос не про мем; в «Советская эстрада» не про советскую эстраду; в музыкальном вопросе ответ не про звучащий трек);
- есть фактическая ошибка, сомнительный факт или ответ не единственный;
- вопрос скучный/школьно-тривиальный для темы или ответ очевиден из вопроса;
- variants содержат неверные ответы.
Иначе keep=true. Будь строг, но не отклоняй хорошие вопросы.
Вопросы: {js}
JSON {{"r":[{{"n":0,"keep":true,"why":"коротко, если false"}}]}}"""
    r,_=chat('openai/gpt-6-luna-pro',[{'role':'user','content':pr}],temperature=0.1,reasoning={'effort':'low'})
    res={x.get('n'):x for x in (r or {}).get('r',[])}
    for i,x in enumerate(ch):
        v=res.get(i)
        if v is None: continue
        append(OUT,{'key':x['key'],'keep':bool(v.get('keep')),'why':v.get('why','')})
with ThreadPoolExecutor(8) as ex: list(ex.map(run,jobs))
f=readl(OUT); print(len(items),'checked; total',len(f),'keep',sum(x['keep'] for x in f))
