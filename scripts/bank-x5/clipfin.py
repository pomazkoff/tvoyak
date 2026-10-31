import json
from common import *
from llm import chat
sel=[x for x in readl(W+'/video_acc.jsonl') if x['category']=='Клипы' and x.get('vk')]
js='\n'.join(f"{x['id']}: исполнитель «{x['answer']}», песня «{x['song']}», режим {'только звук (curtain)' if x.get('curtain') else 'видно клип'}" for x in sel)
r,_=chat('openai/gpt-6-luna-pro',[{'role':'user','content':f"""Напиши вопросы для видео-раунда «Клипы» русской викторины в коротком формате, как в примерах: «Угадайте по звуку: кто поёт этот хит 2020 года?», «Угадайте по звуку: какая британская группа исполняет эту песню?», «Чей это клип 2009 года? Назовите певицу.», «Чей это клип? Назовите канадского певца.». Для режима «только звук» начинай с «Угадайте по звуку:», для «видно клип» — «Чей это клип…». Одна короткая точная подсказка (год выхода песни, страна, тип исполнителя). Без названия песни, без имени исполнителя и их частей. Все формулировки разные. Также дай answer (как принято по-русски, коротко: одно имя исполнителя без feat.) и variants (латиница/кириллица, краткая форма).
{js}
JSON {{"r":[{{"id":"..","prompt":"..","answer":"..","variants":[".."]}}]}}"""}],temperature=0.3,reasoning={'effort':'low'})
P={str(y['id']):y for y in r['r']}
out=[]
for x in sel:
    y=P.get(x['id'])
    if not y: continue
    x.update(prompt=y['prompt'],answer=y['answer'],variants=y['variants']); out.append(x)
with open(W+'/clips_final.jsonl','w') as f:
    for x in out: f.write(json.dumps(x,ensure_ascii=False)+'\n')
for x in out: print(x['value_new'],x.get('curtain'),x['prompt'],'→',x['answer'],x['variants'],'|',x['song'])
