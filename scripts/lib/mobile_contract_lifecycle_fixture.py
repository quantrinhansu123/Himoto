"""Read-only lifecycle portfolio generated with actual web helper SQL."""
from copy import deepcopy
from datetime import datetime,timezone
from urllib.parse import urlparse,parse_qs
import re
def response(path,method,body,headers,state):
    w=state.get('contract_lifecycle_workspace');token=(headers.get('Authorization')or headers.get('authorization','')).removeprefix('Bearer ');route=urlparse(path).path;q={k:v[0]for k,v in parse_qs(urlparse(path).query).items()}
    if not w or token not in state['sessions']:return None
    if route=='/api/mobile/v1/catalogue/contracts'and method=='GET'and q.get('search')in('9505','9506'):
        rows=[deepcopy(r)for r in w['records']if str(r['id'])==q['search']]
        return 200,{'rows':rows,'total':len(rows),'page':1,'pages':1,'statusCounts':[],'updatedAt':datetime.now(timezone.utc).isoformat()},False
    for r in w['records']:
        if route==f"/api/mobile/v1/catalogue/contracts/{r['id']}"and method=='GET':return 200,deepcopy(r),False
    matched=re.fullmatch(r'/api/mobile/v1/contracts/(9505|9506)/lifecycle',route)
    if matched:
        if method=='GET':return 200,deepcopy(w['active'if matched[1]=='9505'else'held']),False
        return 400,{'message':'Portfolio bảo lưu chỉ kiểm màn hình; writer/tiền/kho/CAS/UUID đã kiểm riêng bằng SQL nhúng.','code':'QA_LIFECYCLE_READ_ONLY'},False
    if route=='/api/mobile/v1/contracts/9506/lifecycle/preview'and method=='POST':
        # This portfolio has no installment plan; the editable explicit deadline
        # comes from the actual SQL projection. No financial/model write occurs.
        return 200,{'id':9506,'revision':w['held']['revision'],'at':body['at'],'end':body.get('resume_end')or w['held']['suggestedResumeEnd'],'totalPeriods':0,'periods':[]},False
    if route=='/api/mobile/v1/contracts/9506/lifecycle/inventory'and method=='GET':
        inventory=deepcopy(w['inventory']);needle=q.get('search','').casefold();inventory['rows']=[r for r in inventory['rows']if(not q.get('store')or str(r['storeId'])==q['store'])and(not needle or needle in r['vehicle']['license'].casefold()or needle in r['vehicle']['name'].casefold())];inventory['page']=int(q.get('page','1'));inventory['hasMore']=False
        return 200,inventory,False
    if re.fullmatch(r'/api/mobile/v1/contract-lifecycle/requests/[0-9a-f-]+',route)and method=='GET':return 200,{'result':None},False
    return None
