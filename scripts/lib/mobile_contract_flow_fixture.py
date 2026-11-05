"""Durable synthetic customer/contract flow. No operational DB, env or providers."""
import hashlib
import json
import math
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from lib.mobile_draft_fixture import STORES, draft_customer, draft_record, draft_response
from lib.mobile_recovery_fixture import recovery_response
from lib.mobile_customer_matches_fixture import duplicate_response
from lib.mobile_customer_documents_fixture import document_response, summary as document_summary, MODES as DOCUMENT_MODES
from lib.mobile_gps_fixture import read_overlay_response,valid_state as valid_gps,summary as gps_summary
from lib.mobile_contract_photos_fixture import response as contract_photo_response,summary as contract_photo_summary,MODES as CONTRACT_PHOTO_MODES
from lib.mobile_customer_photo_copy_fixture import response as customer_copy_response,summary as customer_copy_summary,MODES as CUSTOMER_COPY_MODES
from lib.mobile_media_delete_fixture import response as media_delete_response,summary as media_delete_summary,MODES as MEDIA_DELETE_MODES
from lib.mobile_work_access_fixture import response as work_access_response

SCHEMA = "himoto.qa.contract-flow.v1"
USER = {"id": 7, "name": "QA Quản lý", "email": "qa@example.invalid", "role": "branch_manager",
        "permissions": ["vehicles.read", "contracts.read", "contracts.draft", "customers.read", "customers.write"],
        "storeId": 23, "allStores": False}


def digest(state):
    value = json.loads(json.dumps(state, ensure_ascii=False))
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def seed_state():
    return {"schema": SCHEMA, "fixtureOnly": True, "sessions": {}, "sessionSeq": 0, "profiles": {}, "receipts": {},
            "customer_creates": 0, "customer_keys": [], "draft_profiles": {}, "draft_receipts": {},
            "draft_creates": 0, "draft_updates": 0, "tombstones": {}, "mode": "none"}


def valid_state(state):
    if 'contract_photo_writes' in state:
        assert type(state['contract_photo_writes']) is int and state['contract_photo_writes']>=0 and state['contract_photo_writes']==len(state.get('contract_photo_receipts',{}))
    if 'gps' in state:valid_gps(state['gps'])
    assert state["schema"] == SCHEMA and state["fixtureOnly"] is True
    for key in ("profiles", "draft_profiles", *( ["duplicate_profiles"] if "duplicate_profiles" in state else [] )):
        assert isinstance(state[key], dict)
        state[key] = {int(index): row for index, row in state[key].items()}
    for key in ("sessions", "receipts", "draft_receipts", "tombstones"):
        assert isinstance(state[key], dict)
    assert state["customer_creates"] == len(state["profiles"])
    assert state["mode"] in ("none", "lost", "selection-failure", "matches-failure", "resolve-failure", "update-lost", *DOCUMENT_MODES, *CONTRACT_PHOTO_MODES,*CUSTOMER_COPY_MODES,*MEDIA_DELETE_MODES)
    if 'media_deletes' in state:assert state['media_deletes']==len(state.get('media_delete_receipts',{}))
    if 'customer_photo_copy_writes' in state:assert state['customer_photo_copy_writes']==len(state.get('customer_photo_copy_receipts',{}))
    return state


def summary(state, generation):
    return {"fixtureOnly": True, "schema": SCHEMA, "generation": generation, "digest": digest(state),
            "customerCreates": state["customer_creates"], "draftCreates": state["draft_creates"],
            "draftUpdates": state["draft_updates"], "activeSessions": len(state["sessions"]),
            "customers": deepcopy(list(state["profiles"].values())), "drafts": deepcopy(list(state["draft_profiles"].values())),
            "customerKeys": list(state["customer_keys"]), "customerReceipts": deepcopy(state["receipts"]),
            "draftReceipts": deepcopy(state["draft_receipts"]), "tombstones": deepcopy(state["tombstones"]),
            "duplicateProfiles": deepcopy(list(state.get("duplicate_profiles", {}).values())), "customerUpdates": state.get("customer_updates", 0), **document_summary(state),
            **({'gps':gps_summary(state['gps'],generation)} if 'gps' in state else {}),**contract_photo_summary(state),**customer_copy_summary(state),**media_delete_summary(state)}


def record(kind, index, state):
    if kind == "contracts":
        return draft_record(index, state)
    customer = draft_customer(index)
    profile = state["profiles"].get(index)
    details = profile or customer["details"]
    return {"id": index, "code": f"QA-{index:03d}", "name": details["name"] if kind == "customers" else f"Xe QA {index}",
            "status": details.get("status", "active") if kind == "customers" else "ready", "storeId": 23,
            "storeName": "Cơ sở QA", "license": f"QA-{index:03d}" if kind == "vehicles" else "", "vehicleName": "",
            "phone": details.get("phone", ""), "startsAt": "", "endsAt": "", "totalAmount": None, "paidAmount": None,
            "brand": "QA", "color": "Đỏ", "odometer": None}


def response(path, method, body, headers, state):
    access=work_access_response(path,method,body,headers,state)
    if access is not None:return access
    url = urlparse(path)
    if url.path == "/api/mobile/v1/session" and method == "POST":
        if body.get("email") != "qa" or body.get("password") != "fixture-password":
            return 401, {"message": "Tài khoản QA không hợp lệ.", "code": "LOGIN_FAILED"}, False
        state["sessionSeq"] += 1
        import base64
        token = "hm1_" + base64.urlsafe_b64encode(hashlib.sha256(f"contract-flow:{state['sessionSeq']}".encode()).digest()).decode().rstrip("=")
        expires = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
        state["sessions"][token] = expires
        return 201, {"token": token, "expiresAt": expires, "user": USER}, False
    token = (headers.get("Authorization") or headers.get("authorization", "")).removeprefix("Bearer ")
    if token not in state["sessions"]:
        return 401, {"message": "Vui lòng đăng nhập QA.", "code": "SESSION_EXPIRED"}, False
    if url.path == "/api/mobile/v1/session":
        if method == "DELETE":
            del state["sessions"][token]
            return 200, {"success": True}, False
        return 200, {"user": USER, "expiresAt": state["sessions"][token]}, False
    if url.path == "/api/mobile/v1/workspace":
        return 200, {"user": USER, "stores": STORES}, False
    if state["mode"] == "selection-failure" and url.path.endswith("/drafts/customer-lookup"):
        state["mode"] = "none"
        return 503, {"message": "QA chưa tải được hồ sơ đã lưu.", "code": "SERVICE_UNAVAILABLE"}, False
    result = read_overlay_response(path,method,body,headers,state,USER) or media_delete_response(path,method,body,headers,state) or customer_copy_response(path,method,body,headers,state) or contract_photo_response(path,method,body,headers,state) or document_response(path, method, body, headers, state) or duplicate_response(path, method, body, headers, state) or draft_response(path, method, body, headers, state) or recovery_response(path, method, body, headers, state)
    if result:
        return result
    parts = url.path.removeprefix("/api/mobile/v1/").split("/")
    if parts[0] == "customers":
        if method == "GET" and len(parts) == 3 and parts[1] == "requests":
            receipt = state["receipts"].get(parts[2], {}).get("receipt")
            return 200, {"receipt": receipt}, False
        if method == "GET" and len(parts) == 2:
            profile = state["profiles"].get(int(parts[1]))
            return (200, profile, False) if profile else (404, {"code": "NOT_FOUND", "message": "Không có hồ sơ QA."}, False)
        if method == "POST" and len(parts) == 1:
            key = headers.get("Idempotency-Key") or headers.get("idempotency-key")
            if not key or not re.fullmatch(r"[0-9a-f-]{36}", key):
                return 400, {"code": "INVALID_REQUEST_KEY", "message": "Thiếu mã QA."}, False
            state["customer_keys"].append(key)
            previous = state["receipts"].get(key)
            if key in state["tombstones"]:
                return 409, {"code": "REQUEST_CANCELLED", "message": "Mã QA đã hủy."}, False
            if previous:
                if previous["body"] != body:
                    return 409, {"code": "REQUEST_KEY_REUSED", "message": "Mã QA đã dùng cho nội dung khác."}, False
                return 200, {**previous["receipt"], "replayed": True}, False
            index = 100 + state["customer_creates"]
            profile = deepcopy(body)
            profile.pop("allow_incomplete", None)
            profile.update(id=index, revision="100")
            state["profiles"][index] = profile
            receipt = {"id": index, "revision": "100", "replayed": False}
            state["receipts"][key] = {"body": deepcopy(body), "receipt": receipt, "operation": "customer.create"}
            state["customer_creates"] += 1
            lost = state["mode"] == "lost"
            if lost: state["mode"] = "none"
            return 201, receipt, lost
    if parts[0] == "catalogue" and len(parts) in (2, 3) and method == "GET":
        kind = parts[1]
        if len(parts) == 3:
            return 200, record(kind, int(parts[2]), state), False
        ids = list(state["draft_profiles"]) if kind == "contracts" else list(range(1, 24)) + list(state["profiles"]) if kind == "customers" else list(range(1, 24))
        rows = [record(kind, index, state) for index in ids]
        params = parse_qs(url.query)
        query = params.get("search", [""])[0].lower()
        rows = [row for row in rows if query in (row["code"] + row["name"]).lower()]
        size, page = int(params.get("size", ["20"])[0]), int(params.get("page", ["1"])[0])
        return 200, {"rows": rows[(page-1)*size:page*size], "page": page, "pages": max(1, math.ceil(len(rows)/size)),
                     "total": len(rows), "statusCounts": [], "updatedAt": datetime.now(timezone.utc).isoformat()}, False
    return 404, {"message": "Chức năng chưa có trong fixture QA này.", "code": "NOT_FOUND"}, False
