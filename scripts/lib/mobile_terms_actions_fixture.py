"""Read-only portfolios projected from actual isolated SQL, on the existing QA."""
from copy import deepcopy
from datetime import datetime,timezone
from urllib.parse import urlparse,parse_qs
import re
def response(path,method,body,headers,state):
    w=state.get('terms_actions_workspace');token=(headers.get('Authorization')or headers.get('authorization','')).removeprefix('Bearer ');route=urlparse(path).path;q={k:v[0]for k,v in parse_qs(urlparse(path).query).items()}
    if not w or token not in state['sessions']:return None
    terms=w['terms'];draft=w['draft'];records=[terms['record'],terms['ownershipRecord'],draft['record']]
    if route=='/api/mobile/v1/catalogue/contracts'and method=='GET'and q.get('search')in ['9301','9306','9312']:
        rows=[r for r in records if str(r['id'])==q['search']];return 200,{'rows':deepcopy(rows),'total':len(rows),'page':1,'pages':1,'statusCounts':[],'updatedAt':datetime.now(timezone.utc).isoformat()},False
    for record in records:
        if route==f"/api/mobile/v1/catalogue/contracts/{record['id']}"and method=='GET':return 200,deepcopy(record),False
    if route=='/api/mobile/v1/contracts/9301/rental-terms'and method=='GET':return 200,deepcopy(terms['profile']),False
    if route=='/api/mobile/v1/contracts/9306/ownership-terms'and method=='GET':return 200,deepcopy(terms['ownership']),False
    if route=='/api/mobile/v1/drafts/9312/delete'and method=='GET':return 200,deepcopy(draft['preview']),False
    if route=='/api/mobile/v1/contracts/9301/history'and method=='GET':
        tab=q.get('tab','changes');p=deepcopy(terms['cashflow']if tab=='cashflow'else terms['history'])
        if q.get('search')or q.get('page','1')!='1':return 400,{'message':'Portfolio chỉ xem trang đầu không lọc; phân trang/tìm được kiểm bằng actual SQL.','code':'QA_PREVIEW_LIMIT'},False
        return 200,p,False
    if re.fullmatch(r'/api/mobile/v1/(?:rental-terms|ownership-terms|draft-deletions)/requests/[0-9a-f-]+',route)and method=='GET':return 200,{'result':None},False
    if route in ['/api/mobile/v1/contracts/9301/rental-terms','/api/mobile/v1/contracts/9306/ownership-terms','/api/mobile/v1/drafts/9312/delete']:
        return 400,{'message':'Portfolio chỉ kiểm màn hình, không gửi sửa/xóa. Actual writer đã kiểm riêng trên SQL nhúng.','code':'QA_TERMS_ACTIONS_READ_ONLY'},False
    return None
