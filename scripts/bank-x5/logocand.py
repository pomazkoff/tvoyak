import json
from llm import chat
from common import *
import textpipe as T
have=[q['answer'] for q in T.bank if q['category']=='Логотипы']
out=[]
for part in ['мировые бренды, техника, приложения, соцсети, игры, интернет-сервисы','автомобильные марки, спорт, одежда, еда и напитки, организации, российские компании и сервисы']:
    r,_=chat('openai/gpt-6-luna-pro',[{'role':'user','content':f"""Составь список из 110 известных в России брендов/организаций ({part}), у которых есть логотип-ЗНАК БЕЗ БУКВ и слов (символ, эмблема, иконка приложения), который многие узнают: например яблоко Apple, «галочка» Nike, звезда Mercedes, птица Twitter, иконка WhatsApp. Не включай логотипы, где название или буквы — основная часть (Coca-Cola, Google с надписью, BMW с буквами). Буква-монограмма (Facebook «f», Pinterest «P») допустима, только если ответ из неё не читается напрямую — лучше избегай. Исключи: {', '.join(have)}.
Для каждого: answer (как принято писать бренд), variants (русское написание, сокращения), value (100 — знает каждый, 1000 — узнает только знаток), commons_query — что искать на Wikimedia Commons (англ., например "Pepsi globe logo svg").
JSON {{"l":[{{"answer":"Pepsi","variants":["Пепси"],"value":200,"commons_query":"Pepsi globe 2023 svg"}}]}}"""}],temperature=0.5,reasoning={'effort':'low'})
    out+=r.get('l',[])
seen=set(); res=[]
for x in out:
    if norm(x['answer']) in seen or norm(x['answer']) in {norm(h) for h in have}: continue
    seen.add(norm(x['answer'])); res.append(x)
json.dump(res,open('logo_cand.json','w'),ensure_ascii=False,indent=0); print(len(res)); print([x['answer'] for x in res])
