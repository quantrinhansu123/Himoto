"""Real login and read-only isolation checks. Never modifies operational records."""
import argparse,json,urllib.request,urllib.error
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:3102')
p.add_argument('--password-file',required=True)
p.add_argument('--cookies-dir',default='.backups/account-access/cookies')
args=p.parse_args();password=Path(args.password_file).read_text().strip();out=Path(args.cookies_dir);out.mkdir(parents=True,exist_ok=True)
checks=[]
def request(path,cookie=None,body=None):
    headers={'Accept':'application/json'}
    if cookie:headers['Cookie']='himoto_management_session='+cookie
    if body is not None:headers.update({'Origin':args.url,'Content-Type':'application/json'})
    req=urllib.request.Request(args.url+path,headers=headers,data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=45) as response:return response.status,json.load(response),response.headers
    except urllib.error.HTTPError as error:return error.code,json.load(error),error.headers
def login(name):
    status,data,headers=request('/api/session',body={'email':name,'password':password});assert status==200,(name,status,data.get('message'))
    cookie=headers['Set-Cookie'].split(';')[0].split('=',1)[1]
    (out/(name+'.txt')).write_text(cookie,encoding='utf-8');return cookie,data['user']
admin,_=login('quantri')
status,body,_=request('/api/auth/vehicle/vehicles',admin);assert status==200
vehicles=body['data']
status,body,_=request('/api/auth/customers',admin);assert status==200
customers=body['data']
for login_name,store in [('nv.giapbat',23),('nv.lang',31),('nv.nguyenhoang',32),('nv.hadong',33),('nv.hangbut',34),('nv.thuesohuu',35),('ql.thuesohuu',35)]:
    cookie,user=login(login_name);assert user['store_id']==store and not user['scope_all']
    status,data,_=request('/api/auth/stores',cookie);assert status==200,(login_name,status,data.get('message'));assert [int(r['id']) for r in data['data']]==[store]
    status,data,_=request('/api/auth/vehicle/vehicles',cookie);assert status==200,(login_name,status,data.get('message'));assert all(int(r.get('current_store_id') or r['store_id'])==store for r in data['data'])
    status,data,_=request('/api/auth/customers',cookie);assert status==200;assert all(int(r['store_id'])==store for r in data['data'])
    status,data,_=request('/api/auth/order/car-rental?table=1&store=all',cookie);assert status==200,(login_name,status,data.get('message'));assert all(int(r['store_id'])==store for r in data['data']['rows'])
    status,directory,_=request('/api/auth/contract-staff',cookie);assert status==200;assert all(int(r['store_id'])==store for r in directory['data']);assert all(not any(k in r for k in ['phone','email','notes','password']) for r in directory['data'])
    assert request('/api/auth/payment-events',cookie)[0]==200
    foreign=next(v for v in vehicles if int(v.get('current_store_id') or v['store_id'])!=store)
    assert request('/api/auth/vehicles/'+str(foreign['id'])+'/history',cookie)[0]==404
    foreign_customer=next(c for c in customers if c.get('store_id') and int(c['store_id'])!=store)
    assert request('/api/auth/record-photos/customers/'+str(foreign_customer['id']),cookie)[0]==404
    assert request('/api/auth/accounts',cookie)[0]==403
    assert request('/api/auth/accounts',cookie,body={})[0]==403
    assert request('/api/auth/cashbook/vouchers',cookie)[0]==403
    checks.append(login_name+': login, own-branch lists and direct-ID/photo isolation; account and finance permissions enforced')
ownership=(out/'nv.thuesohuu.txt').read_text();assert request('/api/auth/order/car-rental/1/finalize',ownership,body={})[0]==403
checks.append('Ownership employee cannot call contract approval directly')
hr,user=login('hcns');assert user['access_role']=='hr';assert request('/api/auth/hr/staff',hr)[0]==200;assert request('/api/auth/vehicle/vehicles',hr)[0]==403
accounting,user=login('ketoan');assert user['access_role']=='accounting';assert request('/api/auth/cashbook/vouchers',accounting)[0]==200;assert request('/api/auth/hr/staff',accounting)[0]==403
assert request('/api/auth/accounts',admin)[0]==200
assert request('/api/webhooks/sepay',body={})[0]==401
checks.append('HR, accounting and admin each retain their intended workspace capabilities')
assert request('/api/auth/vehicle/vehicles')[0]==401
checks.append('Anonymous access remains blocked')
print(json.dumps({'passed':len(checks),'checks':checks,'operationalWrites':0,'secretsPrinted':False},ensure_ascii=False))
