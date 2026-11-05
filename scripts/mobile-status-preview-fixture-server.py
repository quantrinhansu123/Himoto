"""Read/review-only status portfolio on a separate preserved QA fork."""
import argparse
import importlib.util
import json
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse
from lib import mobile_vehicle_workspace_fixture as base

parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,required=True);parser.add_argument('--state-file',type=Path,required=True);parser.add_argument('--fixture',type=Path,required=True);args=parser.parse_args()
assert 8100<=args.port<=8199 and args.state_file.exists()
data=json.loads(args.fixture.read_text(encoding='utf-8'));assert data['fixtureOnly']
vehicle=data['preparation']['vehicle'];index=vehicle['id']
record=dict(id=index,code=str(index),name=vehicle['name'],status='ready',storeId=23,storeName=vehicle['storeName'],license=vehicle['license'],vehicleName=vehicle['name'],phone='',startsAt='',endsAt='',totalAmount=None,paidAmount=None,brand='',color='',odometer=None)
profile={'id':index,'revision':vehicle['revision'],'values':dict(name=vehicle['name'],license=vehicle['license'],brand='',type='xe_dien',year=None,store_id=23,status='ready',color='',chassis='',engine='',odometer=None,note='',revision=vehicle['revision']),'storeName':vehicle['storeName'],'ownerStoreId':vehicle['ownerStoreId'],'ownerStoreName':vehicle['ownerStoreName'],'typeLabel':'Xe điện','hasOpenContract':False,'inTransit':False,'canEdit':True}

def response(path,method,body,headers,state):
    route=urlparse(path).path;token=(headers.get('Authorization')or headers.get('authorization','')).removeprefix('Bearer ')
    if token in state['sessions']:
        if method=='GET'and route=='/api/mobile/v1/catalogue/vehicles':return 200,{'rows':[deepcopy(record)],'total':1,'page':1,'pages':1,'statusCounts':[['ready',1]],'updatedAt':data['preparation']['observedAt']},False
        if method=='GET'and route==f'/api/mobile/v1/vehicles/{index}':return 200,deepcopy(profile),False
        if route==f'/api/mobile/v1/vehicles/{index}/status':
            if method=='GET':return 200,deepcopy(data['preparation']),False
            return 400,{'message':'Portfolio chỉ kiểm xem và hủy xác nhận; writer đã kiểm riêng bằng actual web SQL.','code':'QA_READ_ONLY'},False
        if method=='POST'and route==f'/api/mobile/v1/vehicles/{index}/status/preview':
            review=deepcopy(data['review']);review['input']={**body,'customer_name':body['customer_name'].strip(),'customer_phone':body['customer_phone'].strip(),'customer_id_card':body['customer_id_card'].strip(),'note':body['note'].strip()}
            return 200,review,False
    return base.response(path,method,body,headers,state)

model=SimpleNamespace(SCHEMA=base.SCHEMA,digest=base.digest,valid_state=base.valid_state,seed_state=base.seed_state,summary=base.summary,response=response)
spec=importlib.util.spec_from_file_location('server',Path(__file__).with_name('mobile-contract-flow-fixture-server.py'));server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
server.model=model;server.serve(args.port,args.state_file)
