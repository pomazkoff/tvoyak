import json
from common import *
from llm import chat
a={x['id']:x for x in readl(W+'/video_acc.jsonl')}
f=json.load(open('vkfill.json'))
BAD={'Моана','Дюна','Джокер','Головоломка','Аватар','Парк юрского периода','Тёмный рыцарь'}
sel=[]
for x in a.values():
    v=x.get('vk') or f.get(x['id'])
    if not v or x['answer'] in BAD: continue
    x['vk']=v; sel.append(x)
js='\n'.join(f"{x['id']}: «{x['answer']}» — {x['prompt']}" for x in sel)
r,_=chat('anthropic/claude-haiku-5.5',[{'role':'user','content':f"""Перепиши вопросы для видео-раунда «Трейлеры» в короткий формат, как в примерах: «Из какого фильма этот трейлер?», «Из какого мультфильма Pixar этот трейлер?», «Из какого фильма Кристофера Нолана этот трейлер?», «Из какого фильма 2014 года этот трейлер про космос?». Одна короткая подсказка (год, студия, режиссёр или очень общий жанр), без слов из названия и без однокоренных к ним, без имён персонажей из названия. Все формулировки разные.
{js}
JSON {{"r":[{{"id":"..","prompt":".."}}]}}"""}],temperature=0.3,reasoning={'enabled':False})
P={str(y['id']):y['prompt'] for y in r['r']}
out=[]
for x in sel:
    if x['id'] in P: x['prompt']=P[x['id']]; out.append(x)
open(W+'/video_final.jsonl','w').write(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in out))
for x in out: print(x['value_new'],x['prompt'],'→',x['answer'],'|',x['vk']['title'][:50])
