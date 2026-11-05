"""Durable, actor-bound recovery QA transport; no real accounts or database."""
import hashlib
import json
import math
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from lib.mobile_bad_debt_recovery_fixture import seed_bad_debt_recovery, bad_debt_recovery_response
from lib.mobile_draft_fixture import STORES, draft_record

SCHEMA = "himoto-mobile-bad-debt-recovery-fixture-v1"
MODES = ("none", "drop", "lose_response", "conflict")


def digest(state):
    normalized = json.loads(json.dumps(state, ensure_ascii=False))
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def seed_state():
    state = {"schema": SCHEMA, "fixtureOnly": True, "sessions": {}, "sessionSeq": 0, "scopes": {},
             "bad_debt_recovery_receipts": {}, "bad_debt_recovery_writes": 0, "tombstones": {}, "mode": "none"}
    seed_dataset(state, 8100)
    return state


def seed_dataset(state, base):
    assert type(base) is int and 8100 <= base <= 9900 and base % 100 == 0
    indexes = range(base+1, base+9)
    assert not any(index in state.get('draft_profiles', {}) or index in state.get('bad_debt_recovery_profiles', {}) for index in indexes), 'Never reset a recovery dataset'
    for index in indexes:
        seed_bad_debt_recovery(state, index, count=26 if index == base+1 else 1, ownership=index in (base+2, base+3), settled=index == base+3)


def valid_state(state):
    assert state.get("schema") == SCHEMA and state.get("fixtureOnly") is True and state["mode"] in MODES
    assert type(state["sessionSeq"]) is int and state["sessionSeq"] >= 0
    for name in ("draft_profiles", "bad_debt_recovery_profiles"):
        assert isinstance(state[name], dict) and state[name]
        state[name] = {int(key): value for key, value in state[name].items()}
    assert isinstance(state["sessions"], dict) and isinstance(state["scopes"], dict)
    for entry in state["sessions"].values():
        assert entry["actorId"] in (7, 8) and type(entry["active"]) is bool
        datetime.fromisoformat(entry["expiresAt"])
    for slot, saved in state["bad_debt_recovery_receipts"].items():
        proof = saved["receipt"]
        assert slot == f"{proof['actorId']}:{proof['requestId']}" and proof["actorId"] in (7, 8)
        assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", proof["requestId"])
        assert saved["operation"] == f"return.recover:{proof['id']}" and proof["review"]["id"] == proof["id"]
        assert proof["review"]["before"] == {k: proof["review"]["after"][k] for k in proof["review"]["before"]}
        assert proof["event"]["actorId"] == proof["actorId"] and proof["event"]["itemId"] == proof["review"]["item"]["id"]
        assert slot not in state["tombstones"]
    assert state["bad_debt_recovery_writes"] == len(state["bad_debt_recovery_receipts"])
    for slot, operation in state["tombstones"].items():
        actor, key = slot.split(":", 1)
        assert actor in ("7", "8") and re.fullmatch(r"return\.recover:[1-9][0-9]{0,14}", operation)
        assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", key)
    return state


def summary(state, generation):
    return {"fixtureOnly": True, "schema": SCHEMA, "generation": generation, "digest": digest(state), "writes": state["bad_debt_recovery_writes"],
            "receipts": [deepcopy(v["receipt"]) for v in state["bad_debt_recovery_receipts"].values()],
            "tombstones": [{"actorId": int(slot.split(":", 1)[0]), "key": slot.split(":", 1)[1], "operation": op} for slot, op in state["tombstones"].items()],
            "activeSessions": sum(s["active"] for s in state["sessions"].values()), "mode": state["mode"]}


def token(sid, actor):
    return "hm1_"+hashlib.sha256(f"recovery-qa:{actor}:{sid}".encode()).hexdigest()[:43]


def user(state, actor):
    scope = state["scopes"].get(str(actor), {"storeId": 23, "allStores": False})
    return {"id": actor, "name": "QA Quản lý" if actor == 7 else "QA Nhân viên", "email": f"qa{actor}@example.invalid", "role": "branch_manager" if actor == 7 else "staff",
            "permissions": ["vehicles.read", "contracts.read", "contracts.return", "customers.read"], **scope}


def response(path, method, body, headers, state):
    url = urlparse(path); route = url.path; params = parse_qs(url.query)
    if route == "/api/mobile/v1/session" and method == "POST":
        actor = {"qa": 7, "qa-receiver": 8}.get(body.get("email"))
        if not actor or body.get("password") != "fixture-password":
            return 401, {"message": "Sai tài khoản QA."}, False
        state["sessionSeq"] += 1; sid = str(state["sessionSeq"])
        expiry = (datetime.now(timezone.utc)+timedelta(hours=8)).isoformat()
        state["sessions"][sid] = {"actorId": actor, "active": True, "expiresAt": expiry}
        return 200, {"token": token(sid, actor), "user": user(state, actor), "expiresAt": expiry}, False
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    found = next(((sid, s) for sid, s in state["sessions"].items() if s["active"] and datetime.fromisoformat(s["expiresAt"]) > datetime.now(timezone.utc) and auth == "Bearer "+token(sid, s["actorId"])), None)
    if not found:
        return 401, {"message": "Phiên QA hết hạn.", "code": "SESSION_EXPIRED"}, False
    sid, session = found; actor = session["actorId"]; profile = user(state, actor)
    if route == "/api/mobile/v1/session":
        if method == "DELETE":
            session["active"] = False
            return 200, {"success": True}, False
        return 200, {"user": profile, "expiresAt": session["expiresAt"]}, False
    if route == "/api/mobile/v1/workspace":
        return 200, {"user": profile, "stores": STORES}, False
    def visible(index):
        p = state["bad_debt_recovery_profiles"].get(index)
        return p and (profile["allStores"] or p["storeId"] in (profile["storeId"], 31))
    if route == "/api/mobile/v1/overview":
        return 200, {"metrics": [{"key": "renting", "label": "Đang thuê", "value": 8}], "updatedAt": datetime.now(timezone.utc).isoformat()}, False
    if route.startswith("/api/mobile/v1/catalogue/"):
        parts = route.split("/catalogue/")[1].split("/")
        rows = [draft_record(i, state) for i in state["draft_profiles"] if visible(i)] if parts[0] == "contracts" else []
        if len(parts) == 2:
            row = next((r for r in rows if str(r["id"]) == parts[1]), None)
            return (200, row, False) if row else (404, {"message": "Không có hồ sơ QA."}, False)
        search = params.get("search", [""])[0].lower(); status = params.get("status", ["all"])[0]
        rows = [r for r in rows if search in (r["name"]+r["code"]).lower() and (status in ("all", "") or r["status"] == status)]
        size = int(params.get("size", ["20"])[0]); page = int(params.get("page", ["1"])[0])
        return 200, {"rows": rows[(page-1)*size:page*size], "page": page, "pages": max(1, math.ceil(len(rows)/size)), "total": len(rows), "statusCounts": [], "updatedAt": datetime.now(timezone.utc).isoformat()}, False
    resolve = re.fullmatch(r"/api/mobile/v1/write-requests/([0-9a-f-]+)/resolve", route)
    if resolve and method == "POST":
        key = resolve[1]; operation = body.get("operation", ""); slot = f"{actor}:{key}"
        saved = state["bad_debt_recovery_receipts"].get(slot)
        if saved:
            if saved["operation"] != operation or not visible(saved["receipt"]["id"]):
                return 403, {"message": "Phiếu ngoài phạm vi QA.", "code": "FORBIDDEN"}, False
            proof = saved["receipt"]
            return 200, {"key": key, "operation": operation, "status": "committed", "receipt": {"id": proof["id"], "revision": proof["revision"], "replayed": True}}, False
        if not re.fullmatch(r"return\.recover:[1-9][0-9]{0,14}", operation):
            return 400, {"message": "Nghiệp vụ QA không hợp lệ."}, False
        previous = state["tombstones"].get(slot)
        if previous and previous != operation:
            return 409, {"message": "Mã đã dùng cho thao tác QA khác."}, False
        state["tombstones"][slot] = operation
        return 200, {"key": key, "operation": operation, "status": "cancelled", "receipt": None}, False
    match = re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/recoveries(?:/preview)?", route)
    if match and not visible(int(match[1])):
        return 404, {"message": "Hợp đồng ngoài phạm vi QA.", "code": "NOT_FOUND"}, False
    saved_key = route.rsplit("/", 1)[1] if route.startswith("/api/mobile/v1/recoveries/requests/") else None
    if saved_key:
        saved = state["bad_debt_recovery_receipts"].get(f"{actor}:{saved_key}")
        if saved and not visible(saved["receipt"]["id"]):
            return 403, {"message": "Phiếu ngoài phạm vi QA.", "code": "FORBIDDEN"}, False
    view = {**state, "user": profile,
            "bad_debt_recovery_receipts": {slot.split(":", 1)[1]: deepcopy(v) for slot, v in state["bad_debt_recovery_receipts"].items() if slot.startswith(f"{actor}:")},
            "tombstones": {slot.split(":", 1)[1]: v for slot, v in state["tombstones"].items() if slot.startswith(f"{actor}:")}}
    if match and method == "POST" and not route.endswith("/preview") and state["mode"] != "none":
        view["bad_debt_recovery_"+state["mode"]] = True
        state["mode"] = "none"
    result = bad_debt_recovery_response(path, method, body, headers, view)
    if not result:
        return 404, {"message": "Endpoint không thuộc fixture thu hồi QA."}, False
    state["bad_debt_recovery_writes"] = view["bad_debt_recovery_writes"]
    for key, saved in view["bad_debt_recovery_receipts"].items():
        state["bad_debt_recovery_receipts"][f"{actor}:{key}"] = saved
    if "bad_debt_recovery_delayed" in view:
        state["bad_debt_recovery_delayed"] = view["bad_debt_recovery_delayed"]
    return result
