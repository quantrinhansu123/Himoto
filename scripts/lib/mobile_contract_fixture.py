"""Synthetic contract preparation/issuance. No operational DB or external I/O."""
from copy import deepcopy
from urllib.parse import urlparse
from lib.mobile_draft_fixture import TEMPLATE, draft_customer, draft_vehicle

ACCOUNTS = [{"id":1,"label":"Ngân hàng cá nhân QA","method":"transfer"}, {"id":1,"label":"Ngân hàng công ty QA","method":"company_transfer"}, {"id":1,"label":"Két tiền mặt QA","method":"cash"}]

def seed_contract(state, index=3001, mismatch=False):
    body=deepcopy(TEMPLATE)
    body["revision"]="100"
    d=body["draft"]
    d.update({"start_date":"2026-11-02T08:00","end_date":"2026-11-03T08:00"})
    d.update({"customer_id":1,"customer":draft_customer()["details"],"vehicles":[draft_vehicle(3)["vehicle"]],"total_amount":"500000","unit_price":"500000","deposit_amount":"200000","contract_type_id":"daily","contract_type_name":"Thuê theo ngày"})
    d["vehicles"][0].update({"rent_at":d["start_date"],"return_at":"2026-12-01T08:00" if mismatch else d["end_date"]})
    state.setdefault("draft_profiles",{})[index]={"id":index,"code":f"NHAP-{index}","revision":"100","input":body,"status":"draft"}
    return state["draft_profiles"][index]

def contract_response(path, method, body, headers, state):
    url=urlparse(path)
    prefix="/api/mobile/v1/contracts/"
    if not url.path.startswith(prefix): return None
    state.setdefault("contract_receipts",{})
    state.setdefault("contract_actions",0)
    state.setdefault("collections_count",0)
    parts=url.path.removeprefix(prefix).split("/")
    if method=="GET" and len(parts)==2 and parts[0]=="requests":
        previous=state["contract_receipts"].get(parts[1])
        return 200,{"receipt":{**previous["receipt"],"replayed":True} if previous else None},False
    if len(parts)!=2 or not parts[0].isdigit(): return 404,{"message":"Fixture endpoint not found"},False
    index=int(parts[0]);profile=state.get("draft_profiles",{}).get(index)
    if not profile: return 404,{"message":"Không tìm thấy hợp đồng.","code":"NOT_FOUND"},False
    d=profile["input"]["draft"]
    errors={}
    if not d["customer_id"]: errors["id_card"]="Tra cứu hoặc tạo hồ sơ khách hàng để gắn hợp đồng."
    if not d["customer"]["name"]: errors["name"]="Nhập tên khách."
    if any(row["id"] and ((row["rent_at"] and row["rent_at"]!=d["start_date"]) or (row["return_at"] and row["return_at"]!=d["end_date"])) for row in d["vehicles"]): errors["vehicle_times"]="Có dòng xe lưu thời gian cũ. Mở bản nháp, đối chiếu và đồng bộ với lịch hợp đồng."
    status=profile.get("status","draft")
    if method=="GET" and parts[1]=="preparation":
        return 200,{"id":index,"storeId":23,"storeName":"Cơ sở QA","code":profile["code"],"status":status,"revision":profile["revision"],"canFinalize":True,"requiresManager":False,"historical":False,"reservation":d.get("reservation",False),"customerName":d["customer"]["name"],"vehicles":[{"id":int(row["id"]),"label":row["license"]+" · "+row["name"]} for row in d["vehicles"] if row["id"]],"startsAt":d["start_date"],"endsAt":d["end_date"],"totalAmount":int(d["total_amount"] or 0),"depositAmount":int(d["deposit_amount"] or 0),"rentalPaid":profile.get("rentalPaid",0),"depositPaid":profile.get("depositPaid",0),"accounts":ACCOUNTS,"issues":{"rental":errors,"reservation":errors}},False
    if method=="POST" and parts[1] in ("finalize","handover"):
        key=headers.get("idempotency-key") or headers.get("Idempotency-Key")
        if key in state.get("tombstones", {}):
            return 409,{"message":"Mã thao tác đã được hủy.","code":"REQUEST_CANCELLED"},False
        if state.pop("contract_drop_before_commit",False) or (index==3005 and state.get("native_recovery_fixtures") and not state.get("native_request_dropped")):
            state["native_request_dropped"]=True
            state["delayed_contract_request"]={"path":path,"method":method,"body":deepcopy(body),"headers":dict(headers)}
            return 503,{"message":"Chưa nhận được kết quả xác nhận.","code":"SERVICE_UNAVAILABLE"},False
        previous=state["contract_receipts"].get(key)
        if previous:
            if previous["body"]!=body or previous["id"]!=index or previous["action"]!=parts[1]: return 409,{"message":"Lần xác nhận trước có nội dung khác.","code":"REQUEST_KEY_REUSED"},False
            return 200,{**previous["receipt"],"replayed":True},False
        if not key or body.get("revision")!=profile["revision"]: return 409,{"message":"Hợp đồng đã thay đổi. Tải lại trước khi xác nhận.","code":"CONTRACT_CHANGED"},False
        if parts[1]=="finalize":
            if status!="draft": return 409,{"message":"Không còn là bản nháp.","code":"CONTRACT_CHANGED"},False
            if errors: return 409,{"message":"Bổ sung bản nháp.","code":"DRAFT_INCOMPLETE","fields":errors},False
            if state.pop("contract_overlap",False) and not body.get("acknowledge_reservation_overlap"): return 409,{"message":"Cảnh báo chồng lịch cọc giữ xe QA.","code":"reservation_overlap"},False
            receipts=body["receipts"]
            state["collections_count"]+=len(receipts)
            profile["rentalPaid"]=profile.get("rentalPaid",0)+sum(int(row["amount"]) for row in receipts if row["purpose"]=="rental")
            profile["depositPaid"]=profile.get("depositPaid",0)+sum(int(row["amount"]) for row in receipts if row["purpose"]=="deposit")
            profile["status"]="deposit_contract" if body.get("reservation") else "renting"
            if body.get("reservation"): d["deposit_amount"]="0"
            profile["code"]=f"HD-QA-{index}"
        else:
            if status!="deposit_contract": return 409,{"message":"Đã giao xe hoặc đơn đã đổi trạng thái.","code":"CONTRACT_CHANGED"},False
            profile["status"]="renting"
        profile["revision"]=str(int(profile["revision"])+1)
        profile["input"]["revision"]=profile["revision"]
        receipt={"id":index,"revision":profile["revision"],"replayed":False}
        state["contract_receipts"][key]={"id":index,"action":parts[1],"body":deepcopy(body),"receipt":receipt}
        state["contract_actions"]+=1
        return 200,receipt,state.pop("contract_lost_response",False) or (index in (3002,3006) and parts[1]=="finalize")
    return 404,{"message":"Unknown synthetic contract endpoint"},False
