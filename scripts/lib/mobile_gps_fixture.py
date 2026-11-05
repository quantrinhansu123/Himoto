"""Durable synthetic GPS fleet and administrator writes. No env, DB or providers."""
import base64
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

SCHEMA = 'himoto.qa.gps.v1'
MODES = ('none', 'read-error', 'sync-error', 'mapping-lost', 'mapping-drop', 'mapping-conflict')
STORES = [{'id': 23, 'name': 'Cơ sở GPS QA A'}, {'id': 24, 'name': 'Cơ sở GPS QA B'}]
STATES = ('online', 'stopped', 'long_stopped', 'offline', 'warning', 'stale', 'none', 'unavailable')
def utc(): return datetime.now(timezone.utc)
def stamp(value): return value.isoformat()
def instant(value): return datetime.fromisoformat(value.replace('Z', '+00:00')) if value else None
def digest(state): return hashlib.sha256(json.dumps(state, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
def seed_state():
    at = utc()
    devices = []
    for index, vehicle_id, provider, status in [(1,101,'protrack','stopped'),(2,101,'iopgps','stopped'),(3,102,'protrack','online'),(4,103,'iopgps','online'),(5,104,'protrack','offline'),(6,105,'protrack','unavailable'),(7,106,'iopgps','stopped'),(8,None,'protrack','stopped'),(9,107,'protrack','stopped'),(10,107,'iopgps','online')]:
        devices.append({'id':index,'vehicle_id':vehicle_id,'provider':provider,'external_device_id':f'GPSQA{index:03}', 'provider_device_name':f'GPS QA {index}',
            'management_status':status,'sync_received_at':stamp(at-timedelta(minutes=11 if index==4 else 0)), 'heartbeat_at':stamp(at-timedelta(seconds=30)),
            'last_latitude':0 if index==1 else 10.75+index/1000,'last_longitude':0 if index==1 else 106.6+index/1000,'last_speed':45 if status=='online' else 0,
            'mapping_status':'manual' if vehicle_id else 'unmapped','position_recorded_at':stamp(at-timedelta(minutes=25)), 'provider_reported_at':stamp(at),
            'last_ignition':False,'stopped_since':stamp(at-timedelta(hours=96)) if index!=7 else None,
            'provider_stopped_since':stamp(at-timedelta(hours=100)) if provider=='protrack' else None})
    vehicles=[{'id':index,'revision':'100','license':f'GPS-QA-{index}','name':f'Xe GPS QA {index}','storeId':23 if index%2 else 24,'storeName':STORES[0 if index%2 else 1]['name']} for index in range(101,137)]
    return {'schema':SCHEMA,'fixtureOnly':True,'devices':devices,'vehicles':vehicles,'sessions':{},'sessionSeq':0,'requests':{},'mode':'none',
        'writes':0,'reads':0,'syncs':0,'candidateReads':0,'mappingReads':0,'lateStatus':None,'delayed':None,'createdAt':stamp(at)}
def valid_state(state):
    assert state['schema']==SCHEMA and state['fixtureOnly'] is True and state['mode'] in MODES
    assert state['writes']==sum(row['status']=='committed' for row in state['requests'].values())
    assert len({row['id'] for row in state['devices']})==len(state['devices'])
    assert all(type(state[k]) is int and state[k]>=0 for k in ('reads','syncs','writes','candidateReads','mappingReads'))
    return state
def summary(state,generation):
    return {'fixtureOnly':True,'schema':SCHEMA,'generation':generation,'digest':digest(state),'writes':state['writes'],'reads':state['reads'],'syncs':state['syncs'],
        'candidateReads':state['candidateReads'],'mappingReads':state['mappingReads'],'activeSessions':len(state['sessions']),
        'receipts':[deepcopy(r['receipt']) for r in state['requests'].values() if r['status']=='committed'],
        'tombstones':[{'key':r['key'],'actorId':r['actorId'],'operation':r['operation']} for r in state['requests'].values() if r['status']=='cancelled'],
        'devices':deepcopy(state['devices']),'lateStatus':state['lateStatus']}
def account(email):
    admin=email=='qa-admin'
    return {'id':8 if admin else 7,'name':'QA GPS Admin' if admin else 'QA GPS Staff','email':'gps-qa@example.invalid','role':'admin' if admin else 'branch_staff',
        'permissions':['vehicles.read','settings.write'] if admin or email=='qa-settings' else ['vehicles.read'],'storeId':23,'allStores':False}
def vehicle(state,index): return next((deepcopy(v) for v in state['vehicles'] if v['id']==index),None)
def public_vehicle(row): return {k:row[k] for k in ('id','revision','license','name','storeName')} if row else None
def device(state,index): return next((d for d in state['devices'] if d['id']==index),None)
def mapping_device(row): return {'id':row['id'],'provider':row['provider'],'externalId':row['external_device_id'],'name':row['provider_device_name'],'vehicleId':row['vehicle_id'],'mappingStatus':row['mapping_status']}
def mapping_snapshot(row): return digest(mapping_device(row))
def base_state(row,now):
    if row['management_status'] in ('none','unavailable'): return row['management_status']
    if not row['sync_received_at'] or (now-instant(row['sync_received_at'])).total_seconds()>600: return 'stale'
    return row['management_status'] or 'warning'
def stop_since(row,now):
    if base_state(row,now)!='stopped': return None
    for value in ([row.get('provider_stopped_since')] if row['provider']=='protrack' else [])+[row.get('stopped_since')]:
        at=instant(value)
        if at and datetime(2000,1,1,tzinfo=timezone.utc)<=at<=now and at<=instant(row['sync_received_at']): return at
    return None
def workspace(state,params,user):
    now=utc();query={'store':'all','provider':'all','state':'all','search':'','page':1,'event_source':'all','event_device':''}
    for key,values in params.items():
        assert key in query and len(values)==1
        query[key]=int(values[0]) if key=='page' else values[0]
    assert query['page']>0 and query['state'] in ('all',*STATES) and query['provider'] in ('all','protrack','iopgps')
    rows=[]
    for source in state['devices']:
        row=deepcopy(source);v=vehicle(state,row['vehicle_id'])
        row.update(license=v['license'] if v else None,store_id=v['storeId'] if v else None,store_name=v['storeName'] if v else None)
        rows.append(row)
    linked={r['vehicle_id'] for r in rows}
    for v in state['vehicles']:
        if v['id'] not in linked:
            rows.append({'id':-v['id'],'vehicle_id':v['id'],'provider':None,'external_device_id':'','provider_device_name':'','license':v['license'],'store_id':v['storeId'],
                'store_name':v['storeName'],'management_status':'none','mapping_status':'unmapped','sync_received_at':None,'heartbeat_at':None,
                'last_latitude':None,'last_longitude':None,'last_speed':None,'position_recorded_at':None,'provider_reported_at':None,'last_ignition':None,'stopped_since':None,'provider_stopped_since':None})
    rows=[r for r in rows if query['store']=='all' or str(r['store_id'])==query['store']]
    groups={}
    for r in rows:
        if r['vehicle_id'] is not None and r['management_status'] not in ('none','unavailable'):groups.setdefault(r['vehicle_id'],[]).append(r)
    long={index for index,devices in groups.items() if all(stop_since(r,now) and (now-stop_since(r,now)).total_seconds()>72*3600 for r in devices)}
    for r in rows:
        r['displayState']=base_state(r,now)
        if r['displayState']=='stopped' and r['vehicle_id'] in long:r['displayState']='long_stopped'
    counts={key:sum(r['displayState']==key for r in rows) for key in STATES};counts['long_stopped']=len(long)
    result={'query':query,'summary':{'fleet':len({r['vehicle_id'] for r in rows if r['vehicle_id'] is not None}),'unmapped':sum(r['vehicle_id'] is None for r in rows),'devices':len(rows),'states':counts},
        'stores':STORES,'eventDevices':[{'id':r['id'],'label':r['license'] or r['provider_device_name'] or r['external_device_id']} for r in rows if r['id']>0],
        'canMap':user['role']=='admin','observedAt':stamp(now)}
    selected=[r for r in rows if (query['provider']=='all' or r['provider']==query['provider']) and (query['state']=='all' or r['displayState']==query['state']) and
        any(query['search'].lower() in (r[k] or '').lower() for k in ('license','provider_device_name','external_device_id','store_name'))]
    page=min(query['page'],max(1,(len(selected)+24)//25));result.update(page=page,pageSize=25,total=len(selected),hasMore=page*25<len(selected),rows=selected[(page-1)*25:page*25])
    events=[]
    for index,source,kind in [(3,'poll','connection_online'),(2,'history','ignition_off'),(1,'webhook','connection_offline')]:
        d=device(state,index);v=vehicle(state,{1:101,2:101,3:102}[index])
        if query['store']!='all' and str(v['storeId'])!=query['store'] or query['event_source']!='all' and source!=query['event_source'] or query['event_device'] and str(index)!=query['event_device']:continue
        events.append({'id':index,'vehicleId':v['id'],'fromStatus':'online','toStatus':'offline','kind':kind,'source':source,
            'eventAt':stamp(now-timedelta(minutes=index*5)),'observedAt':stamp(now),'label':v['license']})
    result['events']=events
    return result
def read_overlay_response(path,method,body,headers,state,user):
    """Add read-only fleet QA to the existing contract watch without replacing its data."""
    url=urlparse(path)
    if not url.path.startswith('/api/mobile/v1/gps'):return None
    assert user['role']!='admin', 'Administrator write QA uses its own dedicated checkpoint'
    gps=state.setdefault('gps',seed_state())
    if url.path=='/api/mobile/v1/gps' and method=='GET':
        gps['reads']+=1;return 200,workspace(gps,parse_qs(url.query,keep_blank_values=True),user),False
    if url.path=='/api/mobile/v1/gps/refresh' and method=='POST':
        gps['syncs']+=1;return 200,{'synced':True,'observedAt':stamp(utc())},False
    return 403,{'code':'FORBIDDEN','message':'Chỉ quản trị được ghép GPS với xe.'},False
def response(path,method,body,headers,state):
    url=urlparse(path);params=parse_qs(url.query,keep_blank_values=True)
    token=(headers.get('Authorization') or headers.get('authorization','')).removeprefix('Bearer ')
    if url.path=='/api/mobile/v1/session' and method=='POST':
        if body.get('email') not in ('qa','qa-admin','qa-settings') or body.get('password')!='fixture-password':return 401,{'code':'LOGIN_FAILED','message':'Sai tài khoản GPS QA.'},False
        state['sessionSeq']+=1;token='hm1_'+base64.urlsafe_b64encode(hashlib.sha256(f"gps:{state['sessionSeq']}".encode()).digest()).decode().rstrip('=')
        user=account(body['email']);expires=stamp(utc()+timedelta(hours=8));state['sessions'][token]={'user':user,'expiresAt':expires}
        return 201,{'token':token,'expiresAt':expires,'user':user},False
    if token not in state['sessions']:return 401,{'code':'SESSION_EXPIRED','message':'Đăng nhập GPS QA.'},False
    user=state['sessions'][token]['user']
    if url.path=='/api/mobile/v1/session':
        if method=='DELETE':del state['sessions'][token];return 200,{'success':True},False
        return 200,deepcopy(state['sessions'][token]),False
    if url.path=='/api/mobile/v1/workspace':return 200,{'user':user,'stores':STORES},False
    if url.path=='/api/mobile/v1/catalogue/vehicles':
        from lib.mobile_contract_flow_fixture import record
        return 200,{'rows':[record('vehicles',101,{'profiles':{}})],'total':len(state['vehicles']),'page':1,'pages':len(state['vehicles']),'statusCounts':[],'updatedAt':stamp(utc())},False
    if url.path=='/api/mobile/v1/gps' and method=='GET':
        state['reads']+=1
        if state['mode']=='read-error':return 503,{'code':'SERVICE_UNAVAILABLE','message':'QA gián đoạn đọc GPS; giữ dữ liệu gần nhất.'},False
        return 200,workspace(state,params,user),False
    if url.path=='/api/mobile/v1/gps/refresh' and method=='POST':
        state['syncs']+=1
        if state['mode']=='sync-error':return 503,{'code':'GPS_SYNC_UNAVAILABLE','message':'QA chưa đồng bộ được GPS. Giữ trạng thái gần nhất.'},False
        return 200,{'synced':True,'observedAt':stamp(utc())},False
    if '/gps/' not in url.path and '/write-requests/' not in url.path:return 404,{'code':'NOT_FOUND','message':'Không có tuyến GPS QA.'},False
    if user['role']!='admin':return 403,{'code':'FORBIDDEN','message':'Chỉ quản trị được ghép GPS với xe.'},False
    actor=user['id'];key=headers.get('Idempotency-Key') or headers.get('idempotency-key')
    receipt_route=re.fullmatch(r'/api/mobile/v1/gps/mappings/requests/([0-9a-f-]{36})',url.path)
    resolver=re.fullmatch(r'/api/mobile/v1/write-requests/([0-9a-f-]{36})/resolve',url.path)
    if receipt_route:
        saved=state['requests'].get(f'{actor}:{receipt_route[1]}');receipt=deepcopy(saved['receipt']) if saved and saved['status']=='committed' else None
        if receipt:receipt.update(replayed=True,current=bool(device(state,receipt['id']) and mapping_snapshot(device(state,receipt['id']))==receipt['mappingSnapshot']))
        return 200,{'receipt':receipt},False
    if resolver:
        key=resolver[1];storage=f'{actor}:{key}';saved=state['requests'].get(storage);operation=body.get('operation')
        assert re.fullmatch(r'gps\.mapping:[1-9]\d{0,14}',operation or '')
        if saved and saved['operation']!=operation:return 409,{'code':'REQUEST_KEY_REUSED','message':'Mã không khớp.'},False
        if not saved:state['requests'][storage]={'status':'cancelled','key':key,'actorId':actor,'operation':operation}
        committed=saved and saved['status']=='committed'
        return 200,{'key':key,'operation':operation,'status':'committed' if committed else 'cancelled',
            'receipt':{k:saved['receipt'][k] for k in ('id','revision')}|{'replayed':True} if committed else None},False
    route=re.fullmatch(r'/api/mobile/v1/gps/devices/([1-9]\d*)/(mapping|candidates)',url.path)
    if not route:return 404,{'code':'NOT_FOUND','message':'Không có thiết bị QA.'},False
    index=int(route[1]);d=device(state,index)
    if not d:return 404,{'code':'NOT_FOUND','message':'Không có GPS QA.'},False
    if route[2]=='candidates':
        state['candidateReads']+=1;search=params.get('search',[''])[0];page=int(params.get('page',['1'])[0]);rows=[public_vehicle(v) for v in state['vehicles'] if search.lower() in f"{v['license']} {v['name']} {v['storeName']}".lower()]
        return 200,{'deviceId':index,'search':search,'page':page,'hasMore':page*25<len(rows),'rows':rows[(page-1)*25:page*25]},False
    if method=='GET':
        state['mappingReads']+=1
        return 200,{'device':mapping_device(d),'vehicle':public_vehicle(vehicle(state,d['vehicle_id'])),'snapshot':mapping_snapshot(d),'observedAt':stamp(utc())},False
    assert method=='POST' and re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',key or '')
    operation=f'gps.mapping:{index}';storage=f'{actor}:{key}';saved=state['requests'].get(storage)
    if saved:
        if saved['status']=='cancelled':return 409,{'code':'REQUEST_CANCELLED','message':'Mã GPS QA đã khóa.'},False
        if saved['body']!=body or saved['operation']!=operation:return 409,{'code':'REQUEST_KEY_REUSED','message':'Mã GPS QA đã dùng.'},False
        return 200,{**deepcopy(saved['receipt']),'replayed':True},False
    if state['mode']=='mapping-drop':
        state['mode']='none';state['delayed']={'path':path,'method':method,'body':body,'headers':headers};return 503,{'code':'SERVICE_UNAVAILABLE','message':'QA mất yêu cầu trước commit.'},False
    if state['mode']=='mapping-conflict':state['mode']='none';d['mapping_status']='manual_unmapped';d['vehicle_id']=None
    if body['snapshot']!=mapping_snapshot(d):return 409,{'code':'GPS_MAPPING_REVIEW_REQUIRED','message':'Thiết bị QA đã thay đổi. Đối chiếu và tải lại.'},False
    before=public_vehicle(vehicle(state,d['vehicle_id']));after=public_vehicle(vehicle(state,body['vehicleId']))
    assert (after['revision'] if after else None)==body['vehicleRevision']
    prior=mapping_device(d)
    if d['vehicle_id']!=body['vehicleId']:d.update(stopped_since=None,provider_stopped_since=None)
    d.update(vehicle_id=body['vehicleId'],mapping_status='manual' if body['vehicleId'] else 'manual_unmapped');state['writes']+=1
    proof={'id':index,'revision':str(200+state['writes']),'replayed':False,'requestId':key,'device':prior,'before':before,'after':after,'beforeSnapshot':body['snapshot'],
        'mappingSnapshot':mapping_snapshot(d),'actorId':actor,'actorName':user['name'],'recordedAt':stamp(utc()),'current':True}
    state['requests'][storage]={'status':'committed','key':key,'actorId':actor,'operation':operation,'body':deepcopy(body),'receipt':proof}
    lost=state['mode']=='mapping-lost'
    if lost:state['mode']='none'
    return 200,deepcopy(proof),lost
