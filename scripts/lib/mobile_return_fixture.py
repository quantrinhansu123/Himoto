"""Synthetic return UI fixture; calculations are not a substitute for SQL parity."""
import hashlib
import json
import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from uuid import uuid4
from lib.mobile_finance_fixture import seed_finance
from lib.mobile_contract_fixture import ACCOUNTS


def stamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def seed_return(state, index=5101, count=1, paid=100000):
    finance = seed_finance(state, index)
    finance.update({"rentalPaid": paid, "rentalRemaining": max(500000-paid, 0), "depositHeld": 100000})
    rows = [{"id": index*100+i, "vehicleId": index*100+i, "name": f"Xe trả QA {i+1}", "license": f"QA-RETURN-{i+1}",
             "revision": "100", "startsAt": "2026-10-10T08:00:00+07:00", "returnAt": "2026-10-15T08:00:00+07:00",
             "completedAt": None, "dailyPrice": 100000, "overdue": True, "reconciled": False, "available": True, "blockedReason": None} for i in range(count)]
    data = {"id": index, "code": f"HD-QA-{index}", "status": "overdue", "storeId": 23, "revision": "100",
            "available": True, "blockedReason": None, "ownership": False, "holdActive": False, "completedFromHold": False,
            "totalAmount": 500000, "rentalPaid": paid, "rentalRemaining": max(500000-paid, 0), "depositHeld": 100000, "rentalRefundable": 0,
            "rows": rows, "accounts": ACCOUNTS, "observedAt": datetime.now(timezone.utc).isoformat()}
    state.setdefault("return_profiles", {})[index] = data
    return data


def fee_preview(profile, body, state):
    assert body["revision"] == profile["revision"], "Hợp đồng QA đã thay đổi."
    projected = []
    for item in sorted(body["items"], key=lambda row: row["item_id"]):
        row = next(r for r in profile["rows"] if r["id"] == item["item_id"])
        assert row["revision"] == item["item_revision"] and row["available"], "Dòng xe QA đã thay đổi."
        actual = item["returned_at"]+":00+07:00"
        minutes = max(0, math.ceil((stamp(actual)-stamp(row["returnAt"]))/60))
        days = minutes//1440+(1 if minutes % 1440 > 480 else 0)
        hours = 0 if minutes % 1440 > 480 else math.ceil((minutes % 1440)/60)
        rate = int(item["hourly_rate"])
        suggested = days*row["dailyPrice"]+hours*rate
        late, repair, discount = int(item.get("fee_override", suggested)), int(item.get("repair_fee", 0)), int(item.get("early_discount", 0))
        projected.append({"id": row["id"], "vehicleId": row["vehicleId"], "revision": row["revision"], "name": row["name"], "license": row["license"],
                          "returnAt": row["returnAt"], "returnedAt": actual, "lateMinutes": minutes, "chargeableHours": math.ceil(minutes/60),
                          "lateDays": days, "lateHours": hours, "hourlyRate": rate, "dailyPrice": row["dailyPrice"],
                          "suggestedLateFee": suggested, "lateFee": late, "repairFee": repair, "repairNote": item.get("repair_note", "").strip(),
                          "earlyDiscount": discount, "fee": late+repair-discount, "overridden": "fee_override" in item})
    totals = {key: sum(row[key] for row in projected) for key in ("lateFee", "repairFee", "earlyDiscount", "fee")}
    before = {key: profile[key] for key in ("totalAmount", "rentalPaid", "rentalRemaining", "depositHeld", "rentalRefundable")}
    total = before["totalAmount"]+totals["fee"]
    assert total >= 0, "Giảm sớm vượt tổng phí."
    remaining_items = sum(1 for row in profile["rows"] if row["available"])-len(projected)
    remaining = max(total-before["rentalPaid"], 0)
    after = {**before, "totalAmount": total, "rentalRemaining": remaining,
             "rentalRefundable": max(min(totals["earlyDiscount"], before["rentalPaid"]-total), 0),
             "remainingItems": remaining_items, "closesRental": remaining_items == 0,
             "depositRefundEligible": remaining_items == 0 and remaining == 0 and before["depositHeld"] > 0,
             "status": ("completed" if remaining == 0 else "wait_payment") if remaining_items == 0 else "overdue"}
    result = {"phase": "fees", "id": profile["id"], "code": profile["code"], "revision": profile["revision"], "ownership": False,
              "items": projected, "before": before, "after": after, "totals": totals}
    result["snapshot"] = digest({**result, "clock": state.get("return_stamp", 0)})
    result["observedAt"] = datetime.now(timezone.utc).isoformat()
    return result


def settlement_preview(profile, body, state):
    fees = fee_preview(profile, body, state)
    assert body["fee_snapshot"] == fees["snapshot"], "Phí hoặc số dư QA đã thay đổi. Rà soát phí lại."
    settlement, after = deepcopy(body["settlement"]), deepcopy(fees["after"])
    totals = {"income": 0, "rentalRefund": 0, "depositRefund": 0, "totalIncrease": 0}
    payments, overpayment = [], False
    for row in settlement["receipts"]:
        amount = int(row["amount"])
        remaining = after["rentalRemaining"]
        increase = max(amount-remaining, 0) if remaining > 0 else 0
        overpayment |= amount > remaining
        after["totalAmount"] += increase
        after["rentalPaid"] += amount
        after["rentalRemaining"] = max(after["totalAmount"]-after["rentalPaid"], 0)
        totals["income"] += amount
        totals["totalIncrease"] += increase
        payments.append({**row, "label": next(a["label"] for a in ACCOUNTS if a["method"] == row["method"] and a["id"] == row["account_id"]), "totalIncrease": increase})
    if settlement.get("rental_refund"):
        row = settlement["rental_refund"]
        amount = int(row["amount"])
        assert amount <= max(min(fees["totals"]["earlyDiscount"], after["rentalPaid"]-after["totalAmount"]), 0), "Khoản hoàn thuê QA vượt credit hợp lệ."
        after["rentalPaid"] -= amount
        totals["rentalRefund"] = amount
        payments.append({**row, "kind": "rental_refund", "label": next(a["label"] for a in ACCOUNTS if a["method"] == row["method"]), "totalIncrease": 0})
    if settlement.get("refund"):
        row = settlement["refund"]
        amount = int(row["amount"])
        assert after["closesRental"] and after["rentalRemaining"] == 0 and amount <= after["depositHeld"], "Chỉ hoàn cọc QA sau đủ xe và hết nợ."
        after["depositHeld"] -= amount
        totals["depositRefund"] = amount
        payments.append({**row, "kind": "deposit_refund", "label": next(a["label"] for a in ACCOUNTS if a["method"] == row["method"]), "totalIncrease": 0})
    after["rentalRefundable"] = max(min(fees["totals"]["earlyDiscount"]-totals["rentalRefund"], after["rentalPaid"]-after["totalAmount"]), 0)
    after["rentalRemaining"] = max(after["totalAmount"]-after["rentalPaid"], 0)
    after["depositRefundEligible"] = after["closesRental"] and after["rentalRemaining"] == 0 and after["depositHeld"] > 0
    if after["closesRental"]:
        after["status"] = "completed" if after["rentalRemaining"] == 0 else "wait_payment"
    result = {"phase": "settlement", "id": profile["id"], "revision": profile["revision"], "fees": fees, "settlement": settlement,
              "payments": payments, "totals": totals, "overpayment": overpayment, "overpaymentAcknowledged": body.get("acknowledge_overpayment", False), "after": after}
    result["snapshot"] = digest({**result, "fees": fees["snapshot"]})
    result["observedAt"] = fees["observedAt"]
    return result


def return_response(path, method, body, headers, state):
    url = urlparse(path)
    if url.path.startswith("/api/mobile/v1/returns/requests/") and method == "GET":
        saved = state.get("return_receipts", {}).get(url.path.rsplit("/", 1)[1])
        return 200, {"receipt": {**saved["receipt"], "replayed": True} if saved else None}, False
    matched = re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/returns(?:/(preview|settlement-preview))?", url.path)
    if not matched:
        return None
    index, action = int(matched[1]), matched[2]
    profile = state.get("return_profiles", {}).get(index)
    if not profile:
        return 404, {"message": "Không có hợp đồng trả xe QA.", "code": "NOT_FOUND"}, False
    if method == "GET":
        page = int(parse_qs(url.query).get("page", ["1"])[0])
        if state.get("return_page_error") and page > 1:
            return 503, {"message": "Lỗi tải trang xe QA.", "code": "SERVICE_UNAVAILABLE"}, False
        result = {k: deepcopy(v) for k, v in profile.items() if k != "rows"}
        result["items"] = {"page": page, "pages": max(1, math.ceil(len(profile["rows"])/25)), "total": len(profile["rows"]), "rows": deepcopy(profile["rows"][(page-1)*25:page*25])}
        return 200, result, False
    key = headers.get("idempotency-key") or headers.get("Idempotency-Key")
    if action:
        assert not key, "Read-only preview must not reserve a request key"
        try:
            state["return_previews"] = state.get("return_previews", 0)+1
            return 200, fee_preview(profile, body, state) if action == "preview" else settlement_preview(profile, body, state), False
        except (AssertionError, StopIteration) as error:
            return 409, {"message": str(error), "code": "RETURN_REVIEW_REQUIRED"}, False
    if key in state.get("tombstones", {}):
        return 409, {"message": "Mã trả xe QA đã được khóa.", "code": "REQUEST_CANCELLED"}, False
    saved = state.get("return_receipts", {}).get(key)
    if saved:
        assert saved["body"] == body
        return 200, {**saved["receipt"], "replayed": True}, False
    if state.pop("return_drop", False):
        state["return_delayed"] = {"path": path, "method": method, "body": deepcopy(body), "headers": dict(headers)}
        return 503, {"message": "Chưa xác nhận được trả xe QA.", "code": "SERVICE_UNAVAILABLE"}, False
    if state.pop("return_conflict", False):
        state["return_stamp"] = state.get("return_stamp", 0)+1
    try:
        reviewed = settlement_preview(profile, body, state)
        assert body["settlement_snapshot"] == reviewed["snapshot"]
        assert not reviewed["overpayment"] or reviewed["overpaymentAcknowledged"]
    except AssertionError:
        return 409, {"message": "Quyết toán QA đã thay đổi. Rà soát lại.", "code": "RETURN_REVIEW_REQUIRED"}, False
    revision = str(int(profile["revision"])+1)
    proof = {"id": index, "revision": revision, "requestId": key, "replayed": False, "review": reviewed,
             "recordedAt": datetime.now(timezone.utc).isoformat(), "returnedItems": [], "transactions": [],
             "current": True, "itemsCurrent": True, "paymentsCurrent": True, "contractCurrent": True}
    for row in reviewed["fees"]["items"]:
        proof["returnedItems"].append({"id": row["id"], "vehicleId": row["vehicleId"], "returnedAt": row["returnedAt"], "revision": revision})
        original = next(r for r in profile["rows"] if r["id"] == row["id"])
        original.update({"completedAt": row["returnedAt"], "available": False, "blockedReason": "Đã nhận trả xe.", "revision": revision})
    for row in reviewed["payments"]:
        state["return_transaction_seq"] = state.get("return_transaction_seq", 8000)+1
        proof["transactions"].append({"id": state["return_transaction_seq"], "requestId": str(uuid4()), "revision": revision, "paymentRevision": revision,
                                      "kind": row["kind"], "amount": int(row["amount"]), "method": row["method"], "accountId": row["account_id"], "paidAt": row["paid_at"]+":00+07:00"})
    for field in ("totalAmount", "rentalPaid", "rentalRemaining", "depositHeld", "rentalRefundable", "status"):
        profile[field] = reviewed["after"][field]
    profile["revision"] = revision
    profile["available"] = reviewed["after"]["remainingItems"] > 0
    profile["blockedReason"] = None if profile["available"] else "Đã nhận đủ xe."
    state["draft_profiles"][index]["status"] = profile["status"]
    state.setdefault("return_receipts", {})[key] = {"operation": f"return.record:{index}", "body": deepcopy(body), "receipt": proof}
    state["return_writes"] = state.get("return_writes", 0)+1
    return 200, proof, state.pop("return_lose_response", False)
