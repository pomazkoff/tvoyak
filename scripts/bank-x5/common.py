import json, re, unicodedata, os, threading
W='/workspace/bankx5/work'
def norm(s):
    s=unicodedata.normalize('NFKC',s or '').lower().replace('ё','е')
    s=re.sub(r'[^\w\s]',' ',s); return re.sub(r'\s+',' ',s).strip()
def grams(s,n=3):
    s=norm(s); return {s[i:i+n] for i in range(max(0,len(s)-n+1))}
def jacc(a,b):
    if not a or not b: return 0
    return len(a&b)/len(a|b)
lock=threading.Lock()
def append(path,obj):
    with lock:
        with open(path,'a') as f: f.write(json.dumps(obj,ensure_ascii=False)+'\n')
def readl(path):
    if not os.path.exists(path): return []
    return [json.loads(l) for l in open(path) if l.strip()]
