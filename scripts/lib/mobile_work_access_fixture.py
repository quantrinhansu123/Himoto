"""Opt-in actor/grant/scope QA overlay. Synthetic only; no accounts or providers."""
from copy import deepcopy
from datetime import datetime,timezone,timedelta
from urllib.parse import urlparse
import base64,hashlib

MODES=('full','media','all-media','hidden')

def configure(state,mode):
    assert mode in MODES
    if 'work_access' not in state:
        assert not state['sessions'] and not state['draft_creates'] and not state.get('contract_photo_writes',0),'Enable only on fresh QA state'
        state['work_access']={'mode':mode,'actors':{},'events':[]}
    state['work_access']['mode']=mode

def user(state,actor):
    permissions=['vehicles.read','customers.read','customers.write']
    if state['work_access']['mode']=='full' and actor==7:permissions+=['contracts.read','contracts.draft']
    return {'id':actor,'name':'QA Quản lý' if actor==7 else 'QA Người khác','email':'qa@example.invalid' if actor==7 else 'qa-other@example.invalid','role':'branch_manager','permissions':permissions,'storeId':None if state['work_access']['mode']=='all-media' else 23,'allStores':state['work_access']['mode']=='all-media'}

def response(path,method,body,headers,state):
    access=state.get('work_access')
    if not access:return None
    route=urlparse(path).path
    if route=='/api/mobile/v1/session' and method=='POST':
        if body.get('email') not in ('qa','qa-other') or body.get('password')!='fixture-password':return 401,{'code':'LOGIN_FAILED','message':'Tài khoản QA không hợp lệ.'},False
        actor=7 if body['email']=='qa' else 8;state['sessionSeq']+=1
        token='hm1_'+base64.urlsafe_b64encode(hashlib.sha256(f"work-access:{actor}:{state['sessionSeq']}".encode()).digest()).decode().rstrip('=')
        expires=(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat();state['sessions'][token]=expires;access['actors'][token]=actor
        return 201,{'token':token,'expiresAt':expires,'user':user(state,actor)},False
    token=(headers.get('Authorization') or headers.get('authorization','')).removeprefix('Bearer ')
    if token not in state['sessions']:return 401,{'code':'SESSION_EXPIRED','message':'Phiên QA đã hết hạn.'},False
    actor=access['actors'][token];current=user(state,actor)
    if route=='/api/mobile/v1/session':
        if method=='DELETE':del state['sessions'][token];return 200,{'success':True},False
        return 200,{'user':current,'expiresAt':state['sessions'][token]},False
    if route=='/api/mobile/v1/workspace':return 200,{'user':current,'stores':[{'id':23,'name':'Cơ sở QA'},{'id':24,'name':'Cơ sở QA khác'}]},False
    access['events'].append({'path':route,'method':method,'actor':actor,'mode':access['mode']})
    if actor!=7:return 403,{'code':'FORBIDDEN','message':'QA actor khác không đọc hồ sơ gốc.'},False
    if access['mode']=='hidden' and (route.startswith('/api/mobile/v1/record-media') or route.startswith('/api/mobile/v1/writes')):return 403,{'code':'FORBIDDEN','message':'QA hồ sơ ngoài phạm vi hiện tại.'},False
    if access['mode']!='full' and route.startswith('/api/mobile/v1/drafts'):return 403,{'code':'FORBIDDEN','message':'QA đã thu hồi quyền soạn hợp đồng.'},False
    return None
