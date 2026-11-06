import os, json, time, requests, re
TAG=""
KEY=os.environ["OPENROUTER_API_KEY_NEW"]
def spent():
    try: return sum(float(l.split("\t")[1] or 0) for l in open("/workspace/bankx5/work/cost.log"))
    except FileNotFoundError: return 0
class BudgetExceeded(Exception): pass
def chat(model, messages, temperature=0.7, max_tokens=8000, reasoning=None, json_mode=True, retries=4):
    body={"model":model,"messages":messages,"temperature":temperature,"max_tokens":max_tokens,"usage":{"include":True}}
    if reasoning: body["reasoning"]=reasoning
    if json_mode: body["response_format"]={"type":"json_object"}
    if spent()>float(os.environ.get("BUDGET","3.0")): raise BudgetExceeded()
    for a in range(retries):
        try:
            r=requests.post("https://openrouter.ai/api/v1/chat/completions",headers={"Authorization":"Bearer "+KEY},json=body,timeout=300)
            j=r.json()
            if "choices" not in j: raise Exception(str(j)[:300])
            txt=j["choices"][0]["message"]["content"] or ""
            u=j.get("usage") or {}; cost=u.get("cost",0)
            rt=(u.get("completion_tokens_details") or {}).get("reasoning_tokens",0)
            with open("/workspace/bankx5/work/cost.log","a") as f: f.write(f"{model}\t{cost}\t{u.get('prompt_tokens')}\t{u.get('completion_tokens')}\t{rt}\t{TAG}\n")
            if json_mode:
                i=txt.index("{")
                return json.JSONDecoder().raw_decode(txt[i:])[0], cost
            return txt, cost
        except Exception as e:
            print("LLM err",model,a,str(e)[:200]); time.sleep(3*(a+1))
    return None, 0
