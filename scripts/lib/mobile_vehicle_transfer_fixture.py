"""Actor-aware synthetic transfer service. No operational DB/network access."""
import base64
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from lib.mobile_catalogue_media_fixture import thumbnail_response

SCHEMA="himoto.qa.vehicle-transfers.v1"
ACTIONS=("transfer","receive","reject","cancel")
def now(): return datetime.now(timezone.utc).isoformat()
def digest(value): return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
def token(sid,actor): return "hm1_"+base64.urlsafe_b64encode(hashlib.sha256(f"fixture:{sid}:{actor}".encode()).digest()).decode().rstrip("=")
def actor_profile(state,actor):
    return {"id":actor,"name":"QA Quản lý" if actor==7 else "QA Người nhận","email":f"qa{actor}@example.invalid","role":"branch_manager",
            "permissions":["vehicles.read","vehicles.transfer","vehicles.receive"],"storeId":23 if actor==7 else 24,"allStores":state["scopes"].get(str(actor),False)}

def seed_dataset(state,base):
    assert type(base) is int and 7100<=base<=9900 and base%100==0
    assert all(str(i) not in state["vehicles"] for i in range(base+1,base+13)),"Dataset already exists; never reset fixture vehicles"
    state["vehicles"].update({str(i):{"id":i,"revision":"100","name":f"Xe điều chuyển QA {i}","license":f"QA-TRANSFER-{i}","brand":"QA","type":"electric","color":"Đỏ","year":"2026",
        "status":"using" if i==base+2 else "repairing" if i==base+3 else "sold" if i==base+9 else "ready","storeId":23,"storeName":"Kho đi QA",
        "ownerStoreId":201 if i==base+2 else 23,"ownerStoreName":"Cơ sở QA 01" if i==base+2 else "Kho đi QA"} for i in range(base+1,base+13)})
def seed_state():
    stores=[{"id":23,"name":"Kho đi QA","revision":"100"},{"id":24,"name":"Kho nhận QA","revision":"100"}]
    stores += [{"id":200+i,"name":f"Cơ sở QA {i:02d}","revision":"100"} for i in range(1,32)]
    stores.append({"id":232,"name":"Kho_% QA","revision":"100"})
    vehicles={str(i):{"id":i,"revision":"100","name":f"Xe điều chuyển QA {i}","license":f"QA-TRANSFER-{i}","brand":"QA","type":"electric","color":"Đỏ","year":"2026",
                     "status":"using" if i==7102 else "repairing" if i==7103 else "sold" if i==7109 else "ready","storeId":23,"storeName":"Kho đi QA",
                     "ownerStoreId":201 if i==7102 else 23,"ownerStoreName":"Cơ sở QA 01" if i==7102 else "Kho đi QA"} for i in range(7101,7113)}
    return {"schema":SCHEMA,"fixtureOnly":True,"stores":stores,"vehicles":vehicles,"pending":{},"events":{},"requests":{},"sessions":{},"sessionSeq":0,
            "eventSeq":50000,"writes":0,"mode":"none","pageError":False,"delayed":[],"scopes":{}}
def valid_state(state):
    assert isinstance(state,dict) and state.get("schema")==SCHEMA and state.get("fixtureOnly") is True
    assert all(isinstance(state.get(k),dict) for k in ("vehicles","pending","events","requests","sessions","scopes"))
    assert isinstance(state["stores"],list) and all(s["id"]>0 and isinstance(s["name"],str) for s in state["stores"])
    for slot,row in state["requests"].items():
        assert row["actorId"] in (7,8) and slot==f"{row['actorId']}:{row['key']}"
        assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",row["key"])
        assert re.fullmatch(r"vehicle\.(transfer|receive|reject|cancel):[1-9][0-9]{0,14}",row["operation"])
        assert row["status"] in ("cancelled","committed")
        if row["status"]=="committed":
            assert row["fingerprint"]==digest(row["body"]) and row["receipt"]["requestId"]==row["key"]
            assert row["operation"]==f"vehicle.{row['receipt']['action']}:{row['receipt']['id']}"
        else: assert row["receipt"] is None
    return state
def authenticate(state,headers):
    bearer=headers.get("authorization") or headers.get("Authorization") or ""
    for sid,session in state["sessions"].items():
        if session["active"] and datetime.fromisoformat(session["expiresAt"])>datetime.now(timezone.utc) and bearer=="Bearer "+token(sid,session["actorId"]):
            return session["actorId"],sid
    return None,None
def gates(state,v,actor):
    p=state["pending"].get(str(v["id"])) if v["status"]=="in_transit" else None
    stores={s["id"]:s for s in state["stores"]}
    result=[]
    for action in ACTIONS:
        reason=None
        if action=="transfer":
            if v["status"]=="sold": reason="Xe đã bán, không điều chuyển kho."
            elif v["status"]=="in_transit": reason="Xử lý lượt chuyển hiện tại trước khi chuyển tiếp."
        elif v["status"]!="in_transit": reason="Xe không còn ở trạng thái Chờ luân chuyển."
        elif not p or not p["receivable"] or p["toStoreId"]!=v["storeId"]: reason="Lượt chuyển đã xử lý hoặc không khớp kho."
        elif action=="cancel" and p["actorId"]!=actor: reason="Chỉ người tạo lượt chuyển được tự hủy."
        elif action!="cancel" and p["actorId"]==actor: reason="Người chuyển không được tự nhận hoặc từ chối cùng lượt; dùng Hủy điều chuyển."
        elif (p["toStoreId"] if action=="receive" else p["fromStoreId"]) not in stores: reason="Không còn cơ sở tham chiếu."
        result.append({"action":action,"available":reason is None,"blockedReason":reason})
    return result
def preview(state,v,body,actor):
    action=body["action"];note=body["note"].strip()
    assert body["revision"]==v["revision"],"Thông tin xe QA đã thay đổi. Tải lại xe."
    gate=next(g for g in gates(state,v,actor) if g["action"]==action)
    assert gate["available"],gate["blockedReason"]
    stores={s["id"]:s for s in state["stores"]}
    p=deepcopy(state["pending"].get(str(v["id"]))) if action!="transfer" else None
    if p:
        assert body["transfer_event_id"]==p["id"] and body["transfer_event_revision"]==p["revision"],"Lượt chuyển QA đã thay đổi."
    origin=stores.get(p["fromStoreId"] if p else v["storeId"])
    target=stores.get(p["toStoreId"] if p else body["to_store_id"])
    assert target and (p or target["id"]!=v["storeId"]),"Chọn kho đến khác kho hiện tại."
    effect=("awaiting_receipt" if v["status"]=="ready" else "immediate_transfer") if action=="transfer" else {"receive":"received","reject":"rejected","cancel":"cancelled"}[action]
    after={"status":"in_transit" if effect=="awaiting_receipt" else v["status"] if effect=="immediate_transfer" else "ready",
           "storeId":origin["id"] if action in ("reject","cancel") else target["id"]}
    if "ownerStoreId" in v:after["ownerStoreId"]=after["storeId"]
    fields={"id":v["id"],"action":action,"revision":v["revision"],"vehicle":deepcopy(v),"transfer":p,"fromStore":deepcopy(origin),"toStore":deepcopy(target),"after":after,"effect":effect,"note":note}
    return {**fields,"snapshot":digest(fields),"observedAt":now()}
def current_proof(state,proof):
    result=deepcopy(proof);v=state["vehicles"].get(str(proof["id"]))
    result["vehicleCurrent"]=bool(v and v["revision"]==proof["revision"])
    result["eventsCurrent"]=all(state["events"].get(str(e["id"]),{}).get("proof")==e for e in proof["events"])
    dispatch=proof["events"][0] if proof["action"]=="transfer" else proof["review"]["transfer"]
    p=state["pending"].get(str(proof["id"]))
    expected=[] if proof["review"]["effect"]=="awaiting_receipt" else [proof["events"][-1]["id"]]
    actual=[row["proof"]["id"] for row in state["events"].values() if row["vehicleId"]==proof["id"] and row["proof"]["refId"]==dispatch["id"]]
    result["transferCurrent"]=bool(p and p["id"]==dispatch["id"] and p["revision"]==dispatch["revision"] and p["receivable"]==(not expected) and sorted(actual)==expected)
    result["current"]=all(result[k] for k in ("vehicleCurrent","eventsCurrent","transferCurrent"));return result
def record(state,v,body,key,actor):
    slot=f"{actor}:{key}";operation=f"vehicle.{body['action']}:{v['id']}"
    old=state["requests"].get(slot)
    if old:
        if old["operation"]!=operation:return 409,{"message":"Mã QA thuộc thao tác khác.","code":"REQUEST_KEY_REUSED"},False
        if old["status"]=="cancelled":return 409,{"message":"Mã QA đã khóa.","code":"REQUEST_CANCELLED"},False
        if old["fingerprint"]!=digest(body):return 409,{"message":"Nội dung QA khác mã cũ.","code":"REQUEST_KEY_REUSED"},False
        return 200,{**current_proof(state,old["receipt"]),"replayed":True},False
    mode=state["mode"];state["mode"]="none"
    if mode=="drop":
        state["delayed"].append({"actorId":actor,"key":key,"body":deepcopy(body),"vehicleId":v["id"]})
        return 503,{"message":"Chưa xác nhận được thao tác kho QA.","code":"SERVICE_UNAVAILABLE"},False
    if mode=="conflict":v["revision"]=str(int(v["revision"])+1)
    fields={k:val for k,val in body.items() if k!="review_snapshot"}
    try:
        reviewed=preview(state,v,fields,actor)
        assert reviewed["snapshot"]==body["review_snapshot"],"Xe hoặc kho QA đã thay đổi. Rà soát lại."
    except (AssertionError,KeyError) as error:return 409,{"message":str(error),"code":"TRANSFER_REVIEW_REQUIRED"},False
    action=body["action"];revision=str(int(v["revision"])+1);events=[]
    origin=reviewed["fromStore"];target=reviewed["toStore"];p=reviewed["transfer"]
    def event(kind,ref=None,note=None):
        state["eventSeq"]+=1
        row={"id":state["eventSeq"],"revision":revision,"type":kind,"refId":ref,
             "fromStoreId":p["fromStoreId"] if p else v["storeId"],"toStoreId":target["id"],
             "fromStoreName":p["fromStoreName"] if p else origin["name"] if origin else "",
             "toStoreName":p["toStoreName"] if p else target["name"],"actorId":actor,"actorName":actor_profile(state,actor)["name"],"recordedAt":now(),"note":body["note"] if note is None else note}
        state["events"][str(row["id"])]={"vehicleId":v["id"],"proof":deepcopy(row)};events.append(row);return row
    if action=="transfer":
        dispatch=event("manual_transfer")
        p={"id":dispatch["id"],"revision":revision,"type":"manual_transfer","fromStoreId":dispatch["fromStoreId"],"toStoreId":dispatch["toStoreId"],
           "fromStoreName":dispatch["fromStoreName"],"toStoreName":dispatch["toStoreName"],"actorId":actor,"recordedAt":dispatch["recordedAt"],"receivable":reviewed["effect"]=="awaiting_receipt"}
        state["pending"][str(v["id"])]=p
        if reviewed["effect"]=="immediate_transfer":event("manual_transfer_receive",dispatch["id"],"Tự nhận điều chuyển kho (xe không ở trạng thái Lưu kho).")
    else:
        event("manual_transfer_"+action,p["id"]);state["pending"][str(v["id"])]["receivable"]=False
    v.update({"revision":revision,"status":reviewed["after"]["status"],"storeId":reviewed["after"]["storeId"],
              "storeName":next(s["name"] for s in state["stores"] if s["id"]==reviewed["after"]["storeId"])})
    if "ownerStoreId" in reviewed["after"]:v.update(ownerStoreId=reviewed["after"]["ownerStoreId"],ownerStoreName=v["storeName"])
    proof={"id":v["id"],"revision":revision,"requestId":key,"replayed":False,"action":action,"review":reviewed,"events":events,
           "recordedAt":events[-1]["recordedAt"],"vehicleCurrent":True,"eventsCurrent":True,"transferCurrent":True,"current":True}
    state["requests"][slot]={"actorId":actor,"key":key,"operation":operation,"body":deepcopy(body),"fingerprint":digest(body),"status":"committed","receipt":deepcopy(proof)}
    state["writes"]+=1
    return 200,proof,mode=="lost"
def response(path,method,body,headers,state):
    url=urlparse(path);params=parse_qs(url.query);route=url.path
    if route=="/api/mobile/v1/session" and method=="POST":
        actor={"qa":7,"qa-receiver":8,"qa8":8}.get(body.get("email"))
        if not actor or body.get("password")!="fixture-password":return 401,{"message":"Sai tài khoản QA."},False
        state["sessionSeq"]+=1;sid=str(state["sessionSeq"]);expires=(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat()
        state["sessions"][sid]={"actorId":actor,"active":True,"expiresAt":expires}
        return 200,{"token":token(sid,actor),"user":actor_profile(state,actor),"expiresAt":expires},False
    actor,sid=authenticate(state,headers)
    if actor is None:return 401,{"message":"Phiên QA hết hạn.","code":"SESSION_EXPIRED"},False
    thumbnail=thumbnail_response(path,method)
    if thumbnail is not None:
        if thumbnail['target']['id'] not in state['vehicles']:return 404,{'message':'Không có xe QA.'},False
        return 200,thumbnail,False
    if route=="/api/mobile/v1/session":
        if method=="DELETE":state["sessions"][sid]["active"]=False;return 200,{"success":True},False
        return 200,{"user":actor_profile(state,actor),"expiresAt":state["sessions"][sid]["expiresAt"]},False
    if route=="/api/mobile/v1/workspace":return 200,{"user":actor_profile(state,actor),"stores":[{"id":s["id"],"name":s["name"]} for s in state["stores"]]},False
    if route.startswith("/api/mobile/v1/catalogue/"):
        parts=route.removeprefix("/api/mobile/v1/catalogue/").split("/");kind=parts[0]
        rows=[{"id":v["id"],"code":v["license"],"name":v["name"],"status":v["status"],"storeId":v["storeId"],"storeName":v["storeName"],"license":v["license"],
               "vehicleName":"","phone":"","startsAt":"","endsAt":"","totalAmount":None,"paidAmount":None,"brand":v["brand"],"color":v["color"],"odometer":1234} for v in state["vehicles"].values()] if kind=="vehicles" else []
        if len(parts)==2:return (200,next(r for r in rows if str(r["id"])==parts[1]),False) if any(str(r["id"])==parts[1] for r in rows) else (404,{"message":"Không có xe QA."},False)
        search=params.get("search",[""])[0].lower();status=params.get("status",[""])[0];store=params.get("store",["all"])[0]
        rows=[r for r in rows if search in (r["name"]+r["license"]).lower() and (status in ("","all") or r["status"]==status) and (store=="all" or str(r["storeId"])==store)]
        size=int(params.get("size",["20"])[0]);page=int(params.get("page",["1"])[0]);pages=max(1,(len(rows)+size-1)//size)
        return 200,{"rows":rows[(page-1)*size:page*size],"page":page,"pages":pages,"total":len(rows),"statusCounts":[],"updatedAt":now()},False
    if route.startswith("/api/mobile/v1/vehicle-transfers/requests/"):
        saved=state["requests"].get(f"{actor}:{route.rsplit('/',1)[1]}")
        return 200,{"receipt":{**current_proof(state,saved["receipt"]),"replayed":True} if saved and saved["status"]=="committed" else None},False
    resolve=re.fullmatch(r"/api/mobile/v1/write-requests/([a-f0-9-]+)/resolve",route)
    if resolve:
        key=resolve[1];operation=body.get("operation","");slot=f"{actor}:{key}";old=state["requests"].get(slot)
        if not re.fullmatch(r"vehicle\.(transfer|receive|reject|cancel):[1-9][0-9]*",operation):return 400,{"message":"Sai thao tác QA."},False
        if old and old["operation"]!=operation:return 409,{"message":"Mã QA không khớp.","code":"REQUEST_KEY_REUSED"},False
        if not old:
            old={"actorId":actor,"key":key,"operation":operation,"body":None,"fingerprint":None,"status":"cancelled","receipt":None};state["requests"][slot]=old
        return 200,{"key":key,"operation":operation,"status":old["status"],"receipt":{"id":old["receipt"]["id"],"revision":old["receipt"]["revision"],"replayed":True} if old["receipt"] else None},False
    matched=re.fullmatch(r"/api/mobile/v1/vehicles/([1-9][0-9]*)/transfers(?:/(destinations|preview))?",route)
    if not matched:return 404,{"message":"Fixture endpoint not found"},False
    v=state["vehicles"].get(matched[1]);sub=matched[2]
    if not v:return 404,{"message":"Không có xe QA."},False
    if method=="GET" and sub is None:
        return 200,{"id":v["id"],"vehicle":deepcopy(v),"transfer":deepcopy(state["pending"].get(str(v["id"]))) if v["status"]=="in_transit" else None,"actions":gates(state,v,actor),"observedAt":now()},False
    if sub=="destinations":
        page=int(params.get("page",["1"])[0]);search=params.get("search",[""])[0].strip()
        if state["pageError"] and page>1:return 503,{"message":"Lỗi tải trang kho QA.","code":"SERVICE_UNAVAILABLE"},False
        if params.get("revision",[""])[0]!=v["revision"]:return 409,{"message":"Xe QA đã thay đổi.","code":"TRANSFER_REVIEW_REQUIRED"},False
        rows=[s for s in state["stores"] if s["id"]!=v["storeId"] and search.lower() in s["name"].lower()]
        return 200,{"id":v["id"],"revision":v["revision"],"page":page,"search":search,"hasMore":len(rows)>page*25,"rows":deepcopy(rows[(page-1)*25:page*25]),"observedAt":now()},False
    normalized={**body,"note":str(body.get("note","")).strip()}
    if sub=="preview":
        assert not (headers.get("idempotency-key") or headers.get("Idempotency-Key"))
        try:return 200,preview(state,v,normalized,actor),False
        except (AssertionError,KeyError) as error:return 409,{"message":str(error),"code":"TRANSFER_REVIEW_REQUIRED"},False
    key=headers.get("idempotency-key") or headers.get("Idempotency-Key")
    assert isinstance(key,str) and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",key)
    return record(state,v,normalized,key,actor)
