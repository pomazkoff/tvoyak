import json,requests,re,time
from concurrent.futures import ThreadPoolExecutor
FREE=re.compile(r'^(public domain|pd\b|pd-|cc0|cc[ -]?by(?:[ -]sa)?(?:[ -]\d(?:\.\d)?)?|cc by|fal|free art|gfdl|mpl|mozilla public|apache|mit\b|bsd)',re.I)
S=requests.Session(); S.headers['User-Agent']='TvoyakBankBot/1.0 (pomazkoff@gmail.com)'
def search(q):
    for _ in range(3):
        try:
            r=S.get('https://commons.wikimedia.org/w/api.php',params={'action':'query','format':'json','generator':'search','gsrnamespace':6,'gsrsearch':q,'gsrlimit':6,'prop':'imageinfo','iiprop':'url|extmetadata|size|mime','iiurlwidth':240,'iiextmetadatafilter':'LicenseShortName|Artist'},timeout=30).json()
            break
        except Exception: time.sleep(2)
    else: return []
    out=[]
    for p in sorted((r.get('query') or {}).get('pages',{}).values(),key=lambda p:p.get('index',99)):
        ii=(p.get('imageinfo') or [{}])[0]; m=ii.get('extmetadata',{})
        lic=(m.get('LicenseShortName') or {}).get('value','')
        if not FREE.match(lic) or re.search('non-?free|fair use|copyright',lic,re.I): continue
        if ii.get('mime') not in ('image/svg+xml','image/png'): continue
        out.append({'file':p['title'][5:],'lic':lic,'artist':re.sub('<[^>]+>','',(m.get('Artist') or {}).get('value',''))[:80],'thumb':ii.get('thumburl')})
    return out[:3]
if __name__=="__main__":
  pass
c0=None
def _main():
  c=json.load(open('logo_cand.json'))
with ThreadPoolExecutor(4) as tp: res=list(tp.map(lambda x:search(x['commons_query']),c))
for x,r in zip(c,res): x['opts']=r
json.dump(c,open('logo_opts.json','w'),ensure_ascii=False,indent=0)
print(sum(1 for x in c if x['opts']),len(c))
