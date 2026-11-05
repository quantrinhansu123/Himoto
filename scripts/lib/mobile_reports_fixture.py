"""Read-only report catalogue generated from actual domains on isolated PGlite.

Known QA scopes return exact saved SQL outputs. Unknown scopes explicitly fail;
they are never replaced with invented zeroes or another period's export.
"""
import hashlib
import json
import math
import re
from copy import deepcopy
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

ROOT=Path(__file__).resolve().parents[2]
_cache={}


def catalogue(state):
    meta=state.get('reports_workspace')
    if not meta:return None
    path=(ROOT/meta['catalogue']).resolve()
    assert path.is_relative_to((ROOT/'.backups').resolve())
    key=(str(path),meta['sha256'])
    if key not in _cache:
        raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==meta['sha256']
        value=json.loads(raw);assert value['fixtureOnly'];_cache[key]=value
    return _cache[key]


def canonical(kind,params):
    values={key:value for key,value in params.items() if value and key not in ('page','size')}
    if kind=='vehicles':
        if values.get('sort')=='revenue':values.pop('sort')
        if values.get('direction')=='desc':values.pop('direction')
    if kind=='overview' and values.get('view')=='stores':values.pop('view')
    if kind=='ledger' and values.get('side')=='in':values.pop('side')
    encode=lambda value:quote(value,safe="~()*!.'-")
    return kind+'?'+'&'.join(encode(key)+'='+encode(value) for key,value in sorted(values.items()))


def response(path,method,body,headers,state):
    url=urlparse(path);route=url.path
    if not route.startswith('/api/mobile/v1/reports'):return None
    def fail(message,status=400):return status,{'message':message,'code':'QA_REPORT_SCOPE'},False
    data=catalogue(state)
    if not data:return fail('Chưa nạp danh mục báo cáo QA.',503)
    if method!='GET':return fail('Báo cáo QA chỉ đọc.',405)
    if route=='/api/mobile/v1/reports/options':return 200,deepcopy(data['options']),False
    match=re.fullmatch(r'/api/mobile/v1/reports/([a-z-]+)(/export)?',route)
    if not match:return fail('Không có báo cáo QA này.',404)
    kind=match[1]
    if kind=='fleet':return fail('Tài khoản QA hiện tại không có quyền báo cáo đội xe chủ quản.',403)
    raw=parse_qs(url.query,keep_blank_values=True)
    if any(len(value)!=1 for value in raw.values()):return fail('Bộ lọc QA trùng lặp.')
    params={key:value[0] for key,value in raw.items()};key=canonical(kind,params)
    collection=data['exports'] if match[2] else data['entries']
    if key not in collection:return fail('Bộ lọc này chưa có dữ liệu báo cáo QA đã chuẩn bị. Đặt lại kỳ tháng này và bộ lọc để demo; API nghiệp vụ thật xử lý bộ lọc đầy đủ.')
    result=deepcopy(collection[key])
    if not match[2]:
        for section in result['sections']:
            if 'paging' not in section:continue
            size=int(params.get('size',section['paging']['size']));requested=int(params.get('page','1'))
            if not 1<=size<=100 or requested<1:return fail('Phân trang QA không hợp lệ.')
            total=section['paging']['total'];page=min(requested,max(1,math.ceil(total/size)))
            # Captured with page size50/100 so the complete small QA portfolio
            # is available; paging must preserve totals and row order.
            assert len(section['rows'])==total
            section['rows']=section['rows'][(page-1)*size:page*size];section['paging'].update(page=page,size=size)
    return 200,result,False
