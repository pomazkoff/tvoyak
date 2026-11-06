import json,collections
from common import *
U=lambda s:s.upper().replace('Ё','Е')
from llm import chat
import textpipe as T
c=json.load(open('rebus_cand.json'))
c.sort(key=lambda x:x['rank'])
use=collections.Counter(); sel=[]
for x in c:
    em=[p.get('emoji') or p.get('text') for p in x['parts'] if p['t']!='txt']
    if any(use[e]>=7 for e in em): continue
    sel.append(x); [use.update([e]) for e in em]
    if len(sel)>=230: break
for i,x in enumerate(sel): x['id']=str(i)
def show(x):
    out=[]
    for p in x['parts']:
        if p['t']=='txt': out.append(f"буквы {p['text']}")
        elif p['t']=='num': out.append(f"число {p['text']}")
        else: out.append(("перевёрнутая " if p.get('flip') else "")+f"картинка {p['emoji']} ({p['word']})"+(f", {p['cutStart']} запятых слева" if p.get('cutStart') else "")+(f", {p['cutEnd']} запятых справа" if p.get('cutEnd') else ""))
    return ' + '.join(out)
res={}
for i in range(0,len(sel),40):
    b=sel[i:i+40]
    js='\n'.join(f"{x['id']}: ответ «{x['answer']}» = {show(x)}" for x in b)
    pr=f"""Ты редактор ребусов для семейной русской викторины. Для каждого ребуса оцени слово-ответ: ok=true, только если это общеупотребительное существительное в именительном падеже единственного числа (или обычное слово, которое знает любой школьник), без грубости, мата, политики, насилия, болезней и неприятных тем, и ответ не является просто формой/однокоренным словом картинки (котик от кот). Также предложи variants — другие допустимые записи ответа (например с «ё», иная форма), если есть, иначе [].
{js}
Верни JSON {{"r":[{{"id":"0","ok":true,"variants":[]}}]}}"""
    outs=[]
    for m in ['openai/gpt-6-luna-pro','google/gemini-3.1-flash-lite']:
        r,_=chat(m,[{'role':'user','content':pr}],temperature=0.1,reasoning=T.RREASON.get(m))
        outs.append({str(y.get('id')):y for y in (r or {}).get('r',[])})
    for x in b:
        rs=[o.get(x['id']) for o in outs]
        x['ok']=all(r and r.get('ok') for r in rs)
        x['variants']=sorted({v for r in rs if r for v in (r.get('variants') or []) if isinstance(v,str) and U(v)!=U(x['answer']) and len(v)>1})
json.dump(sel,open('rebus_rev.json','w'),ensure_ascii=False,indent=0)
ok=[x for x in sel if x['ok']]
print(len(sel),len(ok)); print([x['answer'] for x in sel if not x['ok']])
