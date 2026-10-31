import json,re
from common import *
import videopipe as V
a=readl(f'{W}/video_acc.jsonl')
miss=[x for x in a if not x.get('vk')]
qs={x['id']:f"{x['answer']} трейлер" for x in miss}
res=V.vk_find(list(dict.fromkeys(qs.values())))
def pick(x,rs):
    an=norm(x['answer'])
    for r in rs or []:
        t=r.get('title') or ''; tl=t.lower()
        if r.get('restricted'): continue
        if any(b in tl for b in ('реакция','обзор','пародия','ai upscale','разбор','фанатск','fan','тизер','teaser','концепт')): continue
        if 'трейлер' not in tl and 'trailer' not in tl: continue
        if an not in norm(t): continue
        if not (60<=(r.get('dur') or 0)<=400): continue
        return {'url':f"https://vkvideo.ru/video_ext.php?oid={r['oid']}&id={r['id']}&hash={r['hash']}",'title':t,'dur':r.get('dur')}
picked={x['id']:pick(x,res.get(qs[x['id']])) for x in miss}
urls=[v['url'] for v in picked.values() if v]
ok=set()
for i in range(0,len(urls),20):
    s,out=V.vk_check(urls[i:i+20]); ok|=s
fill={k:v for k,v in picked.items() if v and v['url'] in ok}
json.dump(fill,open('vkfill.json','w'),ensure_ascii=False,indent=0)
print(len(miss),sum(1 for v in picked.values() if v),len(fill))
for k,v in fill.items(): print(next(x['answer'] for x in miss if x['id']==k),'|',v['title'],v['dur'])
