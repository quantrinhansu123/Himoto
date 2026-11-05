"""Read-only renewal demo portfolio from actual isolated SQL projections."""
from copy import deepcopy
from datetime import datetime,timezone
from urllib.parse import urlparse,parse_qs
def response(path,method,body,headers,state):
    w=state.get('renewal_parity_workspace');token=(headers.get('Authorization')or headers.get('authorization','')).removeprefix('Bearer ');route=urlparse(path).path;q={k:v[0]for k,v in parse_qs(urlparse(path).query).items()}
    if not w or token not in state['sessions']:return None
    index=str(w['record']['id'])
    if route=='/api/mobile/v1/operations/contracts'and method=='GET'and q.get('scope')=='backfill'and index in q.get('search',''):
        rows=[deepcopy(w['record'])]if q.get('store','all')in('all','23')else[]
        return 200,{'rows':rows,'total':len(rows),'page':1,'pages':1,'statusCounts':[],'updatedAt':datetime.now(timezone.utc).isoformat(),'scope':'backfill'},False
    if route==f'/api/mobile/v1/catalogue/contracts/{index}'and method=='GET':return 200,deepcopy(w['record']),False
    if route==f'/api/mobile/v1/contracts/{index}/finance'and method=='GET':return 200,deepcopy(w['finance']),False
    if route==f'/api/mobile/v1/contracts/{index}/renewals'and method=='GET':return 200,deepcopy(w['backfillRenewal']if q.get('backfill')=='1'else w['renewal']),False
    if route.startswith(f'/api/mobile/v1/contracts/{index}/')and method!='GET':return 400,{'message':'Portfolio gia hạn giờ/ngày/thu nhiều xe chỉ xem màn hình; actual writer và phiếu được kiểm bằng SQL nhúng.','code':'QA_RENEWAL_READ_ONLY'},False
    return None
