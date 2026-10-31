import json,random,re,collections
from common import *
import textpipe as T
bank=T.bank
def esc(s): return "'"+str(s).replace("'","''")+"'"
def arr(v): return "array["+",".join(esc(x) for x in v)+"]::text[]" if v else "'{}'::text[]"
def jb(o): return esc(json.dumps(o,ensure_ascii=False))+"::jsonb"
def lit(x):
    if x is None: return 'null'
    if isinstance(x,bool): return 'true' if x else 'false'
    if isinstance(x,(int,float)): return str(x)
    return esc(x)
COLS=['category','prompt','answer','variants','kind','value','youtube_id','vk_url','vk_start_seconds','vk_end_seconds','start_seconds','end_seconds','curtain','audio_url','audio_fx','picture','picture_spec','reveal_seconds','image_url','image_credit','image_license','image_page','enabled']
rows=[]
existing={(q['category'],q['prompt']) for q in bank}
def add(r):
    r={c:r.get(c) for c in COLS}
    if r['curtain'] is None: r['curtain']=False
    r['variants']=[v for v in dict.fromkeys(r['variants'] or []) if norm(v)!=norm(r['answer'])]
    if (r['category'],r['prompt']) in existing: return
    existing.add((r['category'],r['prompt'])); rows.append(r)
for q in readl(f'{W}/text_acc.jsonl'):
    add({'category':q['category'],'prompt':q['prompt'],'answer':q['answer'],'variants':q['variants'],'kind':'text','value':q['value'],'enabled':True})
for q in readl(f'{W}/music_acc.jsonl'):
    rev=q['category']=='Звук наоборот'
    add({'category':q['category'],'prompt':q['prompt'],'answer':q['answer'],'variants':q['variants'],'kind':'music','value':q['value'],'audio_url':q['it']['url'],'audio_fx':'reverse' if rev else None,'start_seconds':0,'end_seconds':30,'curtain':True,'enabled':True})
for q in readl(f'{W}/video_acc_final.jsonl'):
    s,e=(20,36) if q['category']=='Трейлеры' else ((0,16) if q['category']=='ТВ-шоу' else (40,56))
    vk=q.get('vk')
    add({'category':q['category'],'prompt':q['prompt'],'answer':q['answer'],'variants':q['variants'],'kind':'video','value':q['value_new'],'youtube_id':q['yt']['id'],'vk_url':vk and vk['url'],'vk_start_seconds':s if vk else None,'vk_end_seconds':e if vk else None,'start_seconds':s,'end_seconds':e,'curtain':bool(q.get('curtain')) if q['category']!='ТВ-шоу' else True,'enabled':True})
GRID={100:(6,4),200:(7,4),300:(8,5),400:(8,6),500:(9,6),600:(10,7),800:(11,8),1000:(12,8)}
rnd=random.Random(5)
for c,fmt,start in [('Эмодзи-шифр','emoji',31),('Найди лишнее','hidden',26)]:
    lst=sorted([q for q in readl(f'{W}/pic_acc.jsonl') if q['category']==c],key=lambda q:q['value'])
    for n,q in enumerate(lst):
        if fmt=='emoji': spec={'lines':q['lines']}; pr=f"Эмодзи-шифр № {start+1+n}: {q['type']}."
        else:
            cl,rw=GRID[q['value']]; spec={'odd':q['odd'],'base':q['base'],'cols':cl,'rows':rw,'seed':rnd.randint(1,999)}; pr=f"Найди лишнее № {start+1+n}: что здесь лишнее?"
        add({'category':c,'prompt':pr,'answer':q['answer'],'variants':q['variants'],'kind':'image','value':q['value'],'picture':fmt,'picture_spec':spec,'reveal_seconds':None,'enabled':False})
for f in ['rebus_final.json','logo_final.json']:
    for q in json.load(open(f)): add({**q,'enabled':False})
json.dump(rows,open('final_rows.json','w'),ensure_ascii=False,indent=0)
print(len(rows)); print(collections.Counter(r['category'] for r in rows))
