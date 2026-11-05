"""Read-only full editor portfolio, projected by actual isolated SQL."""
from copy import deepcopy
from datetime import datetime,timezone
from urllib.parse import urlparse,parse_qs
import re

def response(path,method,body,headers,state):
    w=state.get('contract_edit_workspace');token=(headers.get('Authorization')or headers.get('authorization','')).removeprefix('Bearer ');route=urlparse(path).path;q={k:v[0]for k,v in parse_qs(urlparse(path).query).items()}
    if not w or token not in state['sessions']:return None
    if route=='/api/mobile/v1/catalogue/contracts'and method=='GET'and q.get('search')=='9305':
        return 200,{'rows':[deepcopy(w['record'])],'total':1,'page':1,'pages':1,'statusCounts':[],'updatedAt':datetime.now(timezone.utc).isoformat()},False
    if route=='/api/mobile/v1/catalogue/contracts/9305'and method=='GET':return 200,deepcopy(w['record']),False
    if route=='/api/mobile/v1/contracts/9305/edit':
        if method=='GET':return 200,deepcopy(w['preview']),False
        return 400,{'message':'Portfolio full edit chỉ kiểm màn hình; ghi thật được kiểm riêng bằng actual web writer trên SQL nhúng.','code':'QA_EDIT_READ_ONLY'},False
    if re.fullmatch(r'/api/mobile/v1/contract-edits/requests/[0-9a-f-]+',route)and method=='GET':return 200,{'result':None},False
    return None
