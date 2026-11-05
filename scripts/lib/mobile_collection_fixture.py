"""Synthetic saved-period partial collections. No DB, storage or external I/O."""
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from lib.mobile_finance_fixture import seed_finance


def seed_collections(state, index=4003, count=26):
    profile = seed_finance(state, index)
    state.setdefault("linked_periods", {})[index] = [{"orderId": index, "version": version, "itemId": 301, "vehicleId": 3,
        "vehicleName": "Xe hợp đồng QA", "license": "QA-003", "beforeReturnAt": "2026-11-02T08:00:00+07:00",
        "returnAt": "2026-11-03T08:00:00+07:00", "createdAt": "2026-11-01T08:00:00+07:00", "amount": 80000,
        "collected": 10000 if version == 2 else 80000} for version in range(2, count+2)]
    return profile


def period_snapshot(period):
    result = deepcopy(period)
    result["remaining"] = result["amount"]-result["collected"]
    result["snapshot"] = hashlib.sha256(json.dumps(period, sort_keys=True).encode()).hexdigest()
    return result


def collection_response(path, method, body, headers, state):
    url = urlparse(path)
    lookup = re.fullmatch(r"/api/mobile/v1/renewal-collections/requests/([a-f0-9-]+)", url.path)
    if lookup:
        saved = state.get("collection_receipts", {}).get(lookup[1])
        return 200, {"receipt": {**deepcopy(saved["receipt"]), "replayed": True} if saved else None}, False
    match = re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/renewals/(periods|([1-9][0-9]*)/collection)", url.path)
    if not match:
        return None
    permissions = state.get("user", {}).get("permissions", ["contracts.read", "finance.write"])
    if "contracts.read" not in permissions or ("finance.write" not in permissions if method == "POST" else not any(p in permissions for p in ("finance.read", "finance.write"))):
        return 403, {"message": "Không có quyền tài chính.", "code": "FORBIDDEN"}, False
    index = int(match[1])
    profile = state.get("finance_profiles", {}).get(index)
    if not profile:
        return 404, {"message": "Không có hợp đồng QA.", "code": "NOT_FOUND"}, False
    periods = state.get("linked_periods", {}).get(index, [])
    if match[2] == "periods":
        page = int(parse_qs(url.query).get("page", ["1"])[0])
        if page > 1 and state.get("collection_page_error"):
            return 503, {"message": "Chưa tải được kỳ tiếp theo QA."}, False
        rows = sorted(periods, key=lambda row: row["version"], reverse=True)
        return 200, {"id": index, "code": profile["code"], "canWrite": "finance.write" in permissions, "available": True, "blockedReason": None,
            "page": page, "pages": max(1, (len(rows)+24)//25), "total": len(rows), "rows": [period_snapshot(row) for row in rows[(page-1)*25:page*25]]}, False
    version = int(match[3])
    period = next((row for row in periods if row["version"] == version), None)
    if not period:
        return 409, {"message": "Kỳ đã lưu không tồn tại QA.", "code": "RENEWAL_COLLECTION_CONFLICT"}, False
    current = period_snapshot(period)
    if method == "GET":
        return 200, {"id": index, "code": profile["code"], "storeId": 23, "revision": profile["revision"], "canWrite": "finance.write" in permissions,
            "totalAmount": profile["totalAmount"], "rentalPaid": profile["rentalPaid"], "rentalRemaining": profile["rentalRemaining"],
            "available": current["remaining"] > 0, "blockedReason": None if current["remaining"] > 0 else "Kỳ đã thu đủ QA.", "period": current,
            "accounts": deepcopy(profile["accounts"]), "observedAt": datetime.now(timezone.utc).isoformat()}, False
    key = headers.get("idempotency-key") or headers.get("Idempotency-Key")
    if key in state.get("tombstones", {}):
        return 409, {"message": "Mã thu theo kỳ đã bị khóa.", "code": "REQUEST_CANCELLED"}, False
    fingerprint = json.dumps(body, sort_keys=True)
    saved = state.setdefault("collection_receipts", {}).get(key)
    if saved:
        if saved["fingerprint"] != fingerprint:
            return 409, {"message": "Mã đã dùng cho nội dung khác.", "code": "REQUEST_KEY_REUSED"}, False
        return 200, {**deepcopy(saved["receipt"]), "replayed": True}, False
    mode = state.pop("collection_mode", "none")
    if mode == "drop":
        state["delayed_collection"] = {"path": path, "body": deepcopy(body), "headers": dict(headers)}
        return 503, {"message": "Chưa nhận được kết quả thu theo kỳ.", "code": "SERVICE_UNAVAILABLE"}, False
    photo = state.get("bill_images", {}).get((index, version))
    if body.get("version") != version or body.get("revision") != profile["revision"] or body.get("snapshot") != current["snapshot"] or body.get("expected_total") != profile["totalAmount"] or body.get("expected_remaining") != profile["rentalRemaining"] or not photo or body.get("bill_revision") != photo["info"]["photoRevision"]:
        return 409, {"message": "Số liệu hoặc bill đã thay đổi QA.", "code": "RENEWAL_COLLECTION_CONFLICT"}, False
    amount = int(body["amount"])
    if amount <= 0 or amount > current["remaining"]:
        return 409, {"message": "Tiền vượt phí còn thiếu QA.", "code": "RENEWAL_COLLECTION_CONFLICT"}, False
    if amount > profile["rentalRemaining"] and not body.get("acknowledge_overpayment"):
        return 409, {"message": "Cần xác nhận thu vượt QA.", "code": "OVERPAYMENT_ACK_REQUIRED"}, False
    account = next(row for row in profile["accounts"] if row["id"] == body["account_id"] and row["method"] == body["method"])
    transaction = 9001 + state.get("finance_writes", 0)
    state["finance_writes"] = state.get("finance_writes", 0)+1
    state["collection_writes"] = state.get("collection_writes", 0)+1
    profile["rentalPaid"] += amount
    profile["rentalRemaining"] = max(0, profile["totalAmount"]-profile["rentalPaid"])
    profile["revision"] = str(int(profile["revision"])+1)
    profile["history"].append({"id": transaction, "direction": "in", "deposit": False, "amount": amount, "paidAt": body["paid_at"]+":00+07:00",
        "method": body["method"], "account": account["label"], "note": body["note"], "noteTruncated": False, "actor": "QA", "status": "approved", "renewalVersion": version})
    receipt = {"id": index, "revision": profile["revision"], "replayed": False, "version": version, "transactionId": transaction, "amount": amount,
        "periodAmount": period["amount"], "collectedBefore": period["collected"], "remainingAfter": current["remaining"]-amount,
        "itemId": period["itemId"], "vehicleId": period["vehicleId"], "beforeReturnAt": period["beforeReturnAt"], "returnAt": period["returnAt"], "periodCreatedAt": period["createdAt"],
        "method": body["method"], "accountId": body["account_id"], "paidAt": body["paid_at"]+":00+07:00", "billRevision": body["bill_revision"], "current": True, "billCurrent": True}
    period["collected"] += amount
    state["collection_receipts"][key] = {"operation": f"payment.renewal:{index}", "fingerprint": fingerprint, "receipt": deepcopy(receipt)}
    return 200, receipt, mode == "lost"
