import json, collections
bank=json.load(open('../bank_before.json'))
meta={r['category']:r for r in json.load(open('meta.json'))}
cnt=collections.defaultdict(lambda: collections.Counter())
for q in bank:
    v=q['value'] or 400
    k='music' if q['kind']=='music' else ('video' if q['kind']=='video' else ('image' if q['kind']=='image' else 'text'))
    if q['picture']: k='pic:'+q['picture']
    cnt[(q['category'])][(k,v)]+=1
out={}
for c,ct in sorted(cnt.items()):
    out[c]={'mkind':meta.get(c,{}).get('kind','text'),'total':sum(ct.values()),'buckets':{f"{k}|{v}":n for (k,v),n in sorted(ct.items())}}
json.dump(out,open('targets.json','w'),ensure_ascii=False,indent=1)
for c,o in out.items(): print(c,o['mkind'],o['total'],o['buckets'])
