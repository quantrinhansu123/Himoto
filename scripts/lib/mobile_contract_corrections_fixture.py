"""Read-only monetary correction portfolio from actual isolated SQL projections."""
from copy import deepcopy
from datetime import datetime,timezone
from urllib.parse import urlparse,parse_qs
import re
def response(path,method,body,headers,state):
    w=state.get('contract_corrections_workspace');token=(headers.get('Authorization')or headers.get('authorization','')).removeprefix('Bearer ');route=urlparse(path).path;q={k:v[0]for k,v in parse_qs(urlparse(path).query).items()}
    if not w or token not in state['sessions']:return None
    if route=='/api/mobile/v1/catalogue/contracts'and method=='GET'and q.get('search')=='9405':return 200,{'rows':[deepcopy(w['record'])],'total':1,'page':1,'pages':1,'statusCounts':[],'updatedAt':datetime.now(timezone.utc).isoformat()},False
    if route=='/api/mobile/v1/catalogue/contracts/9405'and method=='GET':return 200,deepcopy(w['record']),False
    if route in('/api/mobile/v1/contracts/9405/receipt-corrections','/api/mobile/v1/contracts/9405/renewal-corrections'):
        if method=='GET':return 200,deepcopy(w['receipts'if route.endswith('/receipt-corrections')else'renewal']),False
        return 400,{'message':'Portfolio correction chỉ kiểm giao diện; actual writer/tiền/phiếu/audit được kiểm riêng bằng SQL nhúng.','code':'QA_CORRECTION_READ_ONLY'},False
    if re.fullmatch(r'/api/mobile/v1/contract-corrections/(receipts|renewal)/requests/[0-9a-f-]+',route)and method=='GET':return 200,{'result':None},False
    return None
