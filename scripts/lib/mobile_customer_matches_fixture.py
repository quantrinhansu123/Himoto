"""Synthetic duplicate profiles shared by browser/native. No real data or I/O."""
import re
from copy import deepcopy
from urllib.parse import urlparse
from lib.mobile_draft_fixture import draft_customer


def seed_duplicates(state):
    assert not state.get("duplicate_profiles"), "Never reset an existing duplicate dataset"
    profiles = {}
    for index, store, name, document in ((501, 23, "LocalQA", "001234567890"), (502, 24, "OtherQA", "001234567891")):
        profiles[index] = {"id": index, "name": name, "phone": "0901111111", "email": "qa@example.invalid",
            "address": "QA address", "id_card": document, "customer_type": "vietnam", "nationality": "",
            "contact_channel": "", "contact_detail": "", "store_id": store, "status": "active", "warning_note": "",
            "driver_license_number": "", "driver_license_issued_on": "", "id_card_issued_on": "", "id_card_issued_by": "",
            "relatives": [], "revision": "100"}
    state["duplicate_profiles"] = profiles
    state["customer_updates"] = 0


def can_edit(profile, user):
    return user.get("role") == "admin" or user.get("allStores") is True or profile["store_id"] == user.get("storeId", 23)


def snapshot(profile):
    row = draft_customer(profile["id"])
    relatives = deepcopy(profile.get("relatives", []))[:2]
    relatives += [{"name": "", "relationship": "", "phone": ""} for _ in range(2 - len(relatives))]
    row.update(storeId=profile["store_id"], storeName="Cơ sở QA" if profile["store_id"] == 23 else "Kho QA khác",
               status=profile["status"], relatives=relatives)
    row["details"].update({key: str(profile.get(key, "")) for key in row["details"]})
    return row


def duplicate_response(path, method, body, headers, state):
    url = urlparse(path)
    prefix = "/api/mobile/v1/customers"
    user = state.get("user", {"storeId": 23, "allStores": False, "role": "branch_manager", "permissions": ["customers.read", "customers.write"]})
    profiles = {**state.get("profiles", {}), **state.get("duplicate_profiles", {})}
    if url.path == prefix + "/matches" and method == "POST":
        if not all(permission in user["permissions"] for permission in ("customers.read", "customers.write")):
            return 403, {"code": "FORBIDDEN", "message": "QA denied"}, False
        if state.get("mode") == "matches-failure" or state.pop("matches_unavailable", False):
            state["mode"] = "none"
            return 503, {"code": "SERVICE_UNAVAILABLE", "message": "QA chưa tra cứu được hồ sơ trùng."}, False
        index = body.get("id")
        doc = re.sub(r"\s", "", body.get("id_card", "")).upper()
        phone = re.sub(r"\D", "", body.get("phone", ""))
        if index is None and not (doc or phone): return 400, {"message": "QA missing identity"}, False
        def matches(row):
            if index is not None: return row["id"] == index and can_edit(row, user)
            return bool(doc and re.sub(r"\s", "", row["id_card"]).upper() == doc or phone and re.sub(r"\D", "", row["phone"]) == phone)
        selected = [row for row in profiles.values() if matches(row)]
        return 200, {"id": index, "idCard": doc, "phoneDigits": phone, "hasMore": len(selected) > 10,
                     "rows": [{"customer": snapshot(row), "canEdit": can_edit(row, user)} for row in selected[:10]]}, False
    if state.get("mode") == "resolve-failure" and "/write-requests/" in url.path:
        state["mode"] = "none"
        return 503, {"code": "SERVICE_UNAVAILABLE", "message": "QA chưa đối chiếu được mã tạo cũ."}, False
    match = re.fullmatch(prefix + r"/([1-9][0-9]*)", url.path)
    if match and int(match[1]) in state.get("duplicate_profiles", {}):
        row = state["duplicate_profiles"][int(match[1])]
        if not can_edit(row, user): return 404, {"code": "NOT_FOUND", "message": "QA out of scope"}, False
        if method == "GET": return 200, deepcopy(row), False
        if method == "PATCH":
            key = headers.get("Idempotency-Key") or headers.get("idempotency-key")
            if not key: return 400, {"code": "INVALID_REQUEST_KEY", "message": "QA missing key"}, False
            operation = f"customer.update:{row['id']}"
            if key in state.get("tombstones", {}): return 409, {"code": "REQUEST_CANCELLED", "message": "QA cancelled"}, False
            previous = state.setdefault("receipts", {}).get(key)
            if previous:
                if previous["body"] != body or previous["operation"] != operation:
                    return 409, {"code": "REQUEST_KEY_REUSED", "message": "QA key reused"}, False
                return 200, {**previous["receipt"], "replayed": True}, False
            if body.get("revision") != row["revision"]:
                return 409, {"code": "CUSTOMER_CONFLICT", "message": "QA hồ sơ đã thay đổi."}, False
            updated = {**deepcopy(body), "id": row["id"], "revision": str(int(row["revision"]) + 1)}
            updated.pop("allow_incomplete", None)
            state["duplicate_profiles"][row["id"]] = updated
            receipt = {"id": row["id"], "revision": updated["revision"], "replayed": False}
            state["receipts"][key] = {"receipt": receipt, "body": deepcopy(body), "operation": operation}
            state["customer_updates"] += 1
            lost = state.get("mode") == "update-lost"
            if lost: state["mode"] = "none"
            return 200, receipt, lost
    if url.path == prefix and method == "POST" and state.get("duplicate_profiles"):
        key = headers.get("Idempotency-Key") or headers.get("idempotency-key")
        if key in state.get("receipts", {}) or key in state.get("tombstones", {}): return None
        doc, phone = re.sub(r"\s", "", body.get("id_card", "")).upper(), re.sub(r"\D", "", body.get("phone", ""))
        # Web duplicate writer gives document precedence over phone.
        if any(re.sub(r"\s", "", row["id_card"]).upper() == doc if doc else phone and re.sub(r"\D", "", row["phone"]) == phone for row in profiles.values()):
            state.setdefault("customer_keys", []).append(key)
            return 409, {"code": "CUSTOMER_EXISTS", "message": "Khách hàng đã tồn tại. Kiểm tra hồ sơ đã có."}, False
    return None
