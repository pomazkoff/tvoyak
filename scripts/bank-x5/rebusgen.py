import json,re,random,collections,itertools
from common import *
E={"🐱":"кот","🦷":"зуб","🍋":"лимон","🦆":"утка","🌹":"роза","🐟":"рыба","🎈":"шар","👃":"нос","🚗":"машина","🦉":"сова","🦊":"лиса","🌙":"луна","🐋":"кит","☂️":"зонт","🏠":"дом","🧀":"сыр","🦁":"лев","🕷️":"паук","🐘":"слон","🐝":"пчела","🐍":"змея","🦀":"краб","🍉":"арбуз","🍐":"груша","🌳":"дерево","⚽":"мяч","🔑":"ключ","🐌":"улитка","🐺":"волк","🐮":"корова","🐜":"муравей","🦌":"олень","🐢":"черепаха","🍄":"гриб","🔥":"огонь","⭐":"звезда","🌊":"волна","🎁":"подарок","📖":"книга","🐓":"петух","🦢":"лебедь","🐧":"пингвин","🍒":"вишня","🥕":"морковь","🧅":"лук","🌰":"орех","🛏️":"кровать","🪑":"стул","✂️":"ножницы","💧":"капля","☀️":"солнце","🐐":"коза","🐑":"овца","🦔":"ёж","🐸":"лягушка","🍞":"хлеб"}
NUM={"1":"один","2":"два","3":"три","4":"четыре","5":"пять","6":"шесть","7":"семь","8":"восемь","9":"девять","10":"десять","40":"сорок","100":"сто","1000":"тысяча"}
U=lambda s:s.upper().replace('Ё','Е')
bank=json.load(open('/workspace/bankx5/bank_before.json'))
have={U(q['answer']) for q in bank if q['category']=='Ребусы'}
nouns={U(w.strip()) for w in open('dict/nouns.txt') if w.strip()}
freq=[]
for i,l in enumerate(open('dict/ru_50k.txt')):
    w=U(l.split()[0])
    if w in nouns and 4<=len(w)<=9 and re.fullmatch('[А-Я]+',w): freq.append((i,w))
freq=freq[:6000]
# readable units: (reading, part, cost)
units=[]
for em,w in E.items():
    W=U(w)
    for cs in range(0,3):
        for ce in range(0,3):
            r=W[cs:len(W)-ce]
            if len(r)<2 or cs+ce>=len(W)-1: continue
            p={'t':'pic','word':w,'emoji':em}
            if cs: p['cutStart']=cs
            if ce: p['cutEnd']=ce
            units.append((r,p,(cs>0)+(ce>0)+0.5*(cs+ce)))
    if len(W)<=4: units.append((W[::-1],{'t':'pic','word':w,'emoji':em,'flip':True},2.5))
for n,w in NUM.items(): units.append((U(w),{'t':'num','text':n,'word':w},1.0))
def decomps(W):
    out=[]
    for r,p,c in units:
        i=W.find(r)
        while i>=0:
            L,R=W[:i],W[i+len(r):]
            # option A: txt around
            if len(L)+len(R)<=3 and len(r)>=3 and (L or R or p.get('flip') or c>0):
                parts=([{'t':'txt','text':L}] if L else [])+[p]+([{'t':'txt','text':R}] if R else [])
                out.append((parts,c+0.6*bool(L)+0.3*len(L+R)))
            # option B: second unit on right/left
            for r2,p2,c2 in units:
                if p2 is p: continue
                for side in ('R','L'):
                    rest=R if side=='R' else L
                    other=L if side=='R' else R
                    j=rest.find(r2) if rest else -1
                    if j<0: continue
                    if side=='R':
                        mid,tail=rest[:j],rest[j+len(r2):]
                        if len(L)+len(mid)+len(tail)>2 or mid: continue
                        parts=([{'t':'txt','text':L}] if L else [])+[p,p2]+([{'t':'txt','text':tail}] if tail else [])
                        out.append((parts,c+c2+1.5+0.4*len(L+tail)))
            i=W.find(r,i+1)
    return out
def solve(parts):
    s=''
    for p in parts:
        if p['t']=='txt': s+=p['text']
        elif p['t']=='num': s+=U(p['word'])
        else:
            w=U(p['word']); w=w[::-1] if p.get('flip') else w
            s+=w[p.get('cutStart',0):len(w)-p.get('cutEnd',0)]
    return s
cands=[]
for rank,W in freq:
    if W in have: continue
    ds=decomps(W)
    ds=[d for d in ds if solve(d[0])==W]
    ds=[d for d in ds if not any(p['t']=='pic' and U(p['word'])==W for p in d[0])]
    # pic word shouldn't be the root of the answer (котик from кот), crude: answer starts with full uncut pic word and rest<=2 letters
    ok=[]
    for parts,c in ds:
        pics=[p for p in parts if p['t'] in('pic','num')]
        if len(parts)==1 and not (parts[0].get('flip') or parts[0].get('cutStart') or parts[0].get('cutEnd')): continue
        bad=False
        for p in pics:
            if p['t']=='pic' and not p.get('flip') and not p.get('cutStart') and not p.get('cutEnd') and W.startswith(U(p['word'])) and len(W)-len(p['word'])<=2: bad=True
        if not bad: ok.append((parts,c))
    if not ok: continue
    parts,c=min(ok,key=lambda x:x[1])
    for p in parts:
        if p['t']=='txt': p['text']=p['text']
    cands.append({'answer':W.capitalize(),'parts':parts,'cost':c+len(W)*0.15+rank/3000,'rank':rank})
print(len(cands))
json.dump(cands,open('rebus_cand.json','w'),ensure_ascii=False)
for x in random.sample(cands,15): print(x['answer'],round(x['cost'],2),solve(x['parts']),[ (p.get('emoji') or p.get('text')) for p in x['parts']], [ {k:v for k,v in p.items() if k in('cutStart','cutEnd','flip')} for p in x['parts']])
