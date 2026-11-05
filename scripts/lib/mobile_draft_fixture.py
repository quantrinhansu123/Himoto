"""Shared synthetic draft API for browser/native QA. No database or network I/O."""
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

TEMPLATE = json.loads((Path(__file__).parents[1] / "fixtures/mobile-draft.json").read_text(encoding="utf-8"))
STORES = [{"id": 23, "name": "Cơ sở QA"}, {"id": 24, "name": "Kho QA khác"}]
TYPES = [{"id": "daily", "label": "Thuê theo ngày", "rentalType": "daily", "termMonths": None, "active": True},
         {"id": "monthly", "label": "Thuê theo tháng", "rentalType": "monthly", "termMonths": None, "active": True},
         {"id": "ownership", "label": "Thuê sở hữu", "rentalType": "ownership", "termMonths": 12, "active": True}]
STAFF = [{"id": 501, "name": "QA Đại diện", "storeId": 23, "roles": ["representative"]},
         {"id": 502, "name": "QA NVKD", "storeId": 24, "roles": ["representative", "sales"]},
         {"id": 503, "name": "QA TLS", "storeId": 24, "roles": ["representative", "telesales"]}]

def draft_customer(index=1, foreign=False):
    details = deepcopy(TEMPLATE["draft"]["customer"])
    details.update({"name": "Khách hợp đồng QA" if index == 1 else f"Khách khác QA {index}", "phone": "0901122334", "id_card": "001234567890", "address": "Địa chỉ QA", "customer_type": "foreign" if foreign else "vietnam"})
    if foreign:
        details.update({"phone": "", "id_card": "QA-PASSPORT", "contact_channel": "WeChat", "contact_detail": "qa-contract-contact"})
    return {"id": index, "storeId": 24 if foreign else 23, "storeName": "Kho QA khác" if foreign else "Cơ sở QA", "status": "active", "details": details, "relatives": [{"name": "Người thân QA", "relationship": "Anh", "phone": "0902233445"}, {"name": "", "relationship": "", "phone": ""}]}

def draft_vehicle(index):
    vehicle = deepcopy(TEMPLATE["draft"]["vehicles"][0])
    vehicle.update({"id": str(300 + index), "name": f"Xe hợp đồng QA {index}", "license": f"QA-{index:03d}", "brand": "QA", "type_text": "Xe số", "year": "2026", "color": "Đỏ", "stock_store_id": "23", "stock_store_name": "Cơ sở QA"})
    return {"vehicle": vehicle, "status": "ready", "storeId": 23, "storeName": "Cơ sở QA"}

def draft_profile(index, state):
    return state.get("draft_profiles", {}).get(index)

def draft_record(index, state):
    profile = draft_profile(index, state)
    if not profile:
        return None
    value = profile["input"]["draft"]
    return {"id": index, "code": profile["code"], "name": value["customer"]["name"], "status": profile.get("status", "draft"), "storeId": 23, "storeName": "Cơ sở QA", "license": ", ".join(row["license"] for row in value["vehicles"]), "vehicleName": ", ".join(row["name"] for row in value["vehicles"]), "phone": value["customer"]["phone"], "startsAt": value["start_date"], "endsAt": value["end_date"], "totalAmount": int(value["total_amount"] or 0), "paidAmount": profile.get("rentalPaid", 0), "brand": "", "color": "", "odometer": None}

def draft_response(path, method, body, headers, state):
    """Return (status, JSON, simulate_lost_response) or None for unrelated paths."""
    url = urlparse(path)
    prefix = "/api/mobile/v1/drafts"
    if not (url.path == prefix or url.path.startswith(prefix + "/")):
        return None
    state.setdefault("draft_profiles", {})
    state.setdefault("draft_receipts", {})
    state.setdefault("draft_creates", 0)
    state.setdefault("draft_updates", 0)
    suffix = url.path.removeprefix(prefix).strip("/")
    if method == "GET" and suffix == "options":
        return 200, {"initial": deepcopy(TEMPLATE), "stores": STORES[:1], "vehicleStores": STORES, "types": TYPES}, False
    if method == "GET" and suffix == "staff":
        return 200, {"rows": STAFF}, False
    if method == "GET" and suffix == "inventory":
        params = parse_qs(url.query)
        page = int(params.get("page", ["1"])[0])
        rows = [draft_vehicle(index) for index in range(1, 24)]
        search = params.get("search", [""])[0].lower()
        rows = [row for row in rows if search in (row["vehicle"]["name"] + row["vehicle"]["license"]).lower()]
        if params.get("store", ["23"])[0] == "24":
            rows = []
        return 200, {"rows": rows[(page-1)*20:page*20], "page": page, "hasMore": page*20 < len(rows)}, False
    if method == "POST" and suffix == "customer-lookup":
        index = int(body.get("id", 1))
        saved = state.get("profiles", {}).get(index)
        if saved:
            row = draft_customer(index)
            relatives = deepcopy(saved.get("relatives", []))
            relatives += [{"name": "", "relationship": "", "phone": ""} for _ in range(2 - len(relatives))]
            row.update({"status": saved["status"], "storeId": saved["store_id"], "relatives": relatives})
            row["details"].update({key: saved[key] for key in row["details"] if key in saved})
        else:
            row = draft_customer(index, foreign="query" in body)
        if state.pop("customer_selection_failure", False):
            return 503, {"code": "SERVICE_UNAVAILABLE", "message": "Synthetic selection temporarily unavailable"}, False
        return 200, {"rows": [row], "hasMore": False}, False
    if method == "POST" and suffix == "availability":
        rows = []
        for index in sorted(set(body["vehicleIds"])):
            hard = index == 301
            soft = index == 302
            blockers = [{"code": "QA-RENTAL" if hard else "QA-DEPOSIT", "storeName": "Kho QA khác", "status": "renting" if hard else "deposit_contract", "startsAt": "2026-11-01T09:00:00+07:00", "endsAt": "2026-11-03T09:00:00+07:00", "severity": "hard" if hard else "reservation_overlap"}] if hard or soft else []
            rows.append({"id": index, "status": "ready", "hasHardBlocker": hard, "reservationOverlap": soft, "blockersTotal": len(blockers), "draftsTotal": 1, "blockers": blockers, "drafts": [{"code": "NHAP-QA", "storeName": "Cơ sở QA", "startsAt": body["startsAt"], "endsAt": body["endsAt"]}]})
        return 200, {"checkedAt": datetime.now(timezone.utc).isoformat(), "startsAt": body["startsAt"], "endsAt": body["endsAt"], "vehicles": rows}, False
    if method == "GET" and suffix.startswith("requests/"):
        previous = state["draft_receipts"].get(suffix.split("/")[1])
        return 200, {"receipt": {**previous["receipt"], "replayed": True} if previous else None}, False
    if method == "GET" and suffix.isdigit():
        profile = draft_profile(int(suffix), state)
        return (200, deepcopy(profile), False) if profile else (404, {"message": "Không tìm thấy bản nháp.", "code": "NOT_FOUND"}, False)
    if method in ("POST", "PATCH") and (not suffix or suffix.isdigit()):
        key = headers.get("idempotency-key") or headers.get("Idempotency-Key")
        if not key:
            return 400, {"message": "Thiếu mã lần lưu.", "code": "INVALID_REQUEST_KEY"}, False
        previous = state["draft_receipts"].get(key)
        if key in state.get("tombstones", {}):
            return 409, {"message": "Mã thao tác đã được hủy.", "code": "REQUEST_CANCELLED"}, False
        if previous:
            if previous["body"] != body:
                return 409, {"message": "Lần lưu trước có nội dung khác. Kiểm tra bản nháp đã lưu.", "code": "REQUEST_KEY_REUSED"}, False
            return 200, {**previous["receipt"], "replayed": True}, False
        index = 2001 + state["draft_creates"] if method == "POST" else int(suffix)
        existing = draft_profile(index, state)
        if method == "PATCH" and state.pop("draft_conflict", False):
            existing["revision"] = str(int(existing["revision"]) + 1)
            existing["input"]["revision"] = existing["revision"]
            existing["input"]["draft"]["contract_number"] = "99999"
            return 409, {"message": "Bản nháp đã được người khác cập nhật.", "code": "DRAFT_CONFLICT"}, False
        if method == "PATCH" and (not existing or body.get("revision") != existing["revision"]):
            return 409, {"message": "Bản nháp đã thay đổi.", "code": "DRAFT_CONFLICT"}, False
        revision = "100" if method == "POST" else str(int(existing["revision"]) + 1)
        saved = deepcopy(body)
        saved["revision"] = revision
        saved["draft"]["paid_amount"] = "0"
        state["draft_profiles"][index] = {"id": index, "code": "NHAP-" + str(index), "revision": revision, "input": saved}
        receipt = {"id": index, "revision": revision, "replayed": False}
        state["draft_receipts"][key] = {"receipt": receipt, "body": deepcopy(body), "operation": "draft.create" if method == "POST" else f"draft.update:{index}"}
        state["draft_creates" if method == "POST" else "draft_updates"] += 1
        lost = state.pop("draft_lost_response", False) or method == "POST" and body["draft"]["contract_number"] == "90003"
        return 201 if method == "POST" else 200, receipt, lost
    return 404, {"message": "Unknown synthetic draft endpoint", "code": "NOT_FOUND"}, False
