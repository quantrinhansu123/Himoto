"""Synthetic renewal preparation/bill state. No DB, external storage or real records."""
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import urlparse


def renewal_response(path, method, body, headers, state):
    url = urlparse(path)
    lookup = re.fullmatch(r"/api/mobile/v1/renewals/requests/([a-f0-9-]+)", url.path)
    if lookup:
        saved = state.get("renewal_receipts", {}).get(lookup[1])
        return 200, {"receipt": {**deepcopy(saved["receipt"]), "replayed": True} if saved else None}, False
    lookup = re.fullmatch(r"/api/mobile/v1/(bills|renewal-collection-bills)/requests/([a-f0-9-]+)", url.path)
    if lookup:
        saved = state.get("bill_receipts", {}).get(lookup[2])
        if saved and saved["operation"].split(":")[0] != ("payment.bill" if lookup[1] == "renewal-collection-bills" else "renewal.bill"):
            saved = None
        receipt = deepcopy(saved["receipt"]) if saved else None
        if receipt:
            current = state.get("bill_images", {}).get((receipt["id"], receipt["version"]))
            receipt.update(replayed=True, current=bool(current and current["info"]["photoRevision"] == receipt["photoRevision"]))
        return 200, {"receipt": receipt}, False
    preparation = re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/renewals", url.path)
    if not preparation:
        return None
    index = int(preparation[1])
    profile = state.get("finance_profiles", {}).get(index)
    if not profile:
        return 404, {"message": "Không có hợp đồng QA."}, False
    if method == "POST":
        return record_renewal(index, body, headers, state)
    version = state.get("renewal_versions", {}).get(index, 2)
    line = state.get("renewal_lines", {}).get(index, {"revision":"100", "returnAt":"2026-11-02T08:00:00+07:00"})
    evidence = bool(state.get("bill_images", {}).get((index, version)))
    return 200, {"id": index, "code": profile["code"], "status": "renting", "storeId": 23, "revision": profile["revision"],
        "available": True, "blockedReason": None, "nextVersion": version,
        "totalAmount": profile["totalAmount"], "rentalPaid": profile["rentalPaid"], "rentalRemaining": profile["rentalRemaining"],
        "items": {"page": 1, "pages": 1, "total": 1, "rows": [{"id": 301, "vehicleId": 3, "name": "Xe hợp đồng QA", "license": "QA-003", "revision": line["revision"], "returnAt": line["returnAt"], "dailyPrice": 100000, "renewalAmount": 0}]},
        "accounts": deepcopy(profile["accounts"]), "evidence": {"requiredForCollection": True, "slot": f"renewal-{version}-document-1", "present": evidence},
        "observedAt": datetime.now(timezone.utc).isoformat()}, False


def bill_response(path, method, data, headers, state):
    match = re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/renewals/([1-9][0-9]*)/(collection/)?bill", urlparse(path).path)
    if not match:
        return None
    index, version = int(match[1]), int(match[2])
    collection = bool(match[3])
    profile = state.get("finance_profiles", {}).get(index)
    if not profile:
        return 404, {"message": "Không có hợp đồng QA."}, False
    images = state.setdefault("bill_images", {})
    previous = images.get((index, version))
    if method == "GET":
        return 200, deepcopy(previous["info"]) if previous else {"id": index, "version": version, "slot": f"renewal-{version}-document-1", "photoRevision": None, "mimeType": None, "bytes": None, "updatedAt": None}, False
    key = headers.get("idempotency-key") or headers.get("Idempotency-Key")
    if state.get("tombstones", {}).get(key):
        return 409, {"message": "Mã lưu bill đã được hủy.", "code": "REQUEST_CANCELLED"}, False
    revision = headers.get("x-contract-revision") or headers.get("X-Contract-Revision")
    expected = headers.get("x-bill-revision") or headers.get("X-Bill-Revision")
    sha = hashlib.sha256(data).hexdigest()
    fingerprint = (index, version, revision, expected, sha)
    saved = state.setdefault("bill_receipts", {}).get(key)
    if saved:
        if saved["fingerprint"] != fingerprint:
            return 409, {"message": "Mã lưu bill đã dùng cho ảnh khác.", "code": "REQUEST_KEY_REUSED"}, False
        receipt = deepcopy(saved["receipt"])
        receipt.update(replayed=True, current=bool(previous and previous["info"]["photoRevision"] == receipt["photoRevision"]))
        return 200, receipt, False
    if state.get("bill_mode") == "drop":
        state["bill_mode"] = "none"
        return 503, {"message": "Chưa nhận được xác nhận lưu bill.", "code": "SERVICE_UNAVAILABLE"}, False
    valid_version = any(row["version"] == version for row in state.get("linked_periods", {}).get(index, [])) if collection else version == state.get("renewal_versions", {}).get(index, 2)
    if not valid_version or revision != profile["revision"] or expected != (previous["info"]["photoRevision"] if previous else "0"):
        return 409, {"message": "Phiên bản hợp đồng hoặc bill đã thay đổi.", "code": "BILL_CONFLICT"}, False
    if not data.startswith(b"\xff\xd8\xff") or not 0 < len(data) <= 2097152:
        return 400, {"message": "Ảnh JPEG không hợp lệ.", "code": "INVALID_BILL"}, False
    state["bill_writes"] = state.get("bill_writes", 0) + 1
    photo_revision = str(900 + state["bill_writes"])
    info = {"id": index, "version": version, "slot": f"renewal-{version}-document-1", "photoRevision": photo_revision, "mimeType": "image/jpeg", "bytes": len(data), "updatedAt": datetime.now(timezone.utc).isoformat()}
    images[(index, version)] = {"info": info, "data": data}
    receipt = {"id": index, "revision": revision, "replayed": False, "version": version, "slot": info["slot"], "sha256": sha, "photoRevision": photo_revision, "bytes": len(data), "current": True}
    state["bill_receipts"][key] = {"operation": f"{'payment' if collection else 'renewal'}.bill:{index}", "fingerprint": fingerprint, "receipt": deepcopy(receipt)}
    if state.get("bill_mode") == "lost":
        state["bill_mode"] = "none"
        return 503, {"message": "Chưa nhận được xác nhận lưu bill.", "code": "SERVICE_UNAVAILABLE"}, False
    return 200, receipt, False


def record_renewal(index, body, headers, state):
    key = headers.get("idempotency-key") or headers.get("Idempotency-Key")
    if state.get("tombstones", {}).get(key):
        return 409, {"message":"Mã gia hạn đã được hủy.", "code":"REQUEST_CANCELLED"}, False
    fingerprint = json.dumps(body, sort_keys=True, ensure_ascii=False)
    previous = state.setdefault("renewal_receipts", {}).get(key)
    if previous:
        if previous["fingerprint"] != fingerprint:
            return 409, {"message":"Mã gia hạn đã dùng cho nội dung khác.", "code":"REQUEST_KEY_REUSED"}, False
        return 200, {**deepcopy(previous["receipt"]), "replayed":True}, False
    mode = state.pop("renewal_mode", "none")
    if mode == "drop":
        return 503, {"message":"Chưa xác nhận được kết quả gia hạn.", "code":"SERVICE_UNAVAILABLE"}, False
    profile = state["finance_profiles"][index]
    version = state.setdefault("renewal_versions", {}).get(index, 2)
    line = state.setdefault("renewal_lines", {}).get(index, {"revision":"100", "returnAt":"2026-11-02T08:00:00+07:00"})
    if body.get("expected_version") != version or body.get("order_revision") != profile["revision"] or body.get("item_revision") != line["revision"] or body.get("item_id") != 301:
        return 409, {"message":"Hợp đồng hoặc xe vừa thay đổi.", "code":"RENEWAL_CONFLICT"}, False
    amount, outside = int(body["amount"]), int(body.get("outside_amount", "0"))
    new_return = body["return_at"]+":00+07:00"
    if datetime.fromisoformat(new_return) <= datetime.fromisoformat(line["returnAt"]):
        return 409, {"message":"Hẹn trả mới phải sau hẹn trả hiện tại.", "code":"RENEWAL_CONFLICT"}, False
    collection = body.get("receipt")
    account = None
    if collection:
        photo = state.get("bill_images", {}).get((index, version))
        if not photo or body.get("bill_revision") != photo["info"]["photoRevision"]:
            return 409, {"message":"Bill cần được rà soát lại.", "code":"RENEWAL_CONFLICT"}, False
        account = next((row for row in profile["accounts"] if row["id"] == collection["account_id"] and row["method"] == collection["method"]), None)
        if not account or (outside and collection["method"] == "company_transfer") or amount+outside <= 0:
            return 400, {"message":"Khoản thu gia hạn chưa hợp lệ.", "code":"INVALID_RENEWAL"}, False
    transaction, outside_transaction = None, None
    if collection:
        for rental, value in [(True, amount), (False, outside)]:
            if value == 0:
                continue
            transaction_id = 9001 + state.get("finance_writes", 0)
            state["finance_writes"] = state.get("finance_writes", 0)+1
            if rental:
                transaction = transaction_id
            else:
                outside_transaction = transaction_id
            profile["history"].append({"id":transaction_id,"direction":"in","deposit":False,"amount":value,"paidAt":collection["paid_at"]+":00+07:00",
                "method":collection["method"],"account":account["label"],"note":body.get("note","") if rental else body.get("outside_name",""),
                "noteTruncated":False,"actor":"QA Quản lý","status":"approved","renewalVersion":version})
    profile["totalAmount"] += amount
    if collection:
        profile["rentalPaid"] += amount
    profile["rentalRemaining"] = max(0, profile["totalAmount"]-profile["rentalPaid"])
    profile["revision"] = str(int(profile["revision"])+1)
    state["renewal_lines"][index] = {"revision":str(int(line["revision"])+1), "returnAt":new_return}
    state["renewal_versions"][index] = version+1
    state["renewal_writes"] = state.get("renewal_writes", 0)+1
    expected = int(body.get("expected_amount", body["amount"]))
    receipt = {"id":index,"revision":profile["revision"],"replayed":False,"version":version,"returnAt":new_return,"amount":amount,"totalAmount":profile["totalAmount"],
        "collected":bool(collection),"collection":{"method":collection["method"],"accountId":collection["account_id"],"paidAt":collection["paid_at"]+":00+07:00"} if collection else None,
        "transactionId":transaction,"outsideAmount":outside,"outsideTransactionId":outside_transaction,"billRevision":body["bill_revision"] if collection else None,
        "warning":f"Phí thỏa thuận khác gợi ý {expected} VND." if amount != expected else None,"current":True}
    state["renewal_receipts"][key] = {"operation":f"renewal.record:{index}","fingerprint":fingerprint,"receipt":deepcopy(receipt)}
    return 200, receipt, mode == "lost"
