import json,sys,collections,subprocess
from build import COLS,esc,arr,jb,lit
rows=json.load(open('final_rows.json'))
mode=sys.argv[1]; out=sys.argv[2]
DROP={'Логика с подвохом'}
if mode=='main': rows=[r for r in rows if r['kind']!='video' and r['category'] not in DROP]
else: rows=[r for r in rows if r['kind']=='video']
# leak + picture validation via repo code
json.dump([{**r,'id':str(i)} for i,r in enumerate(rows)],open('/tmp/mig_chk_in.json','w'),ensure_ascii=False)
subprocess.run(['/workspace/bankx5/tsx/node_modules/.bin/tsx','scripts/_leak_tmp.ts','/tmp/mig_chk_in.json','/tmp/mig_chk_out.json'],cwd='/workspace/bankx5/repo',check=True)
chk=json.load(open('/tmp/mig_chk_out.json'))
bad={int(c['id']) for c in chk if c['pic'] or any(l.get('level')=='full' for l in c['leaks'])}
rows=[r for i,r in enumerate(rows) if i not in bad]
cnt=collections.Counter(r['category'] for r in rows)
hdr=["-- Банк ×5 (scripts/bank-x5): только добавление, on conflict (category, prompt) do nothing.",
"-- Вопросы сгенерированы и прошли ревью тремя независимыми LLM (факты, мейнстрим, сложность↔номинал,",
"-- дубли с банком, утечка ответа) + findAnswerLeaks/pictureProblems из репозитория.",
"-- Музыка — только превью iTunes; картинки (ребусы, эмодзи-шифр, найди лишнее, логотипы Commons)",
"-- добавлены с enabled = false — включаются вручную в /admin/pictures.",
f"-- Всего: {len(rows)} (отброшено финальной проверкой: {len(bad)})"]+[f"--   {c}: {n}" for c,n in cnt.most_common()]
def val(r):
    v=[]
    for c in COLS:
        x=r.get(c)
        if c=='variants': v.append(arr(x))
        elif c=='picture_spec': v.append(jb(x) if x is not None else 'null')
        elif c=='enabled': v.append('true' if x is not False else 'false')
        elif c=='vk_url' and x: v.append(esc(x))
        else: v.append(lit(x))
    return '  ('+', '.join(v)+')'
sql='\n'.join(hdr)+f"\ninsert into public.question_bank ({', '.join(COLS)}) values\n"+',\n'.join(val(r) for r in rows)+"\non conflict (category, prompt) do nothing;\n"
open(out,'w').write(sql); print(len(rows),len(bad)); print(dict(cnt))
