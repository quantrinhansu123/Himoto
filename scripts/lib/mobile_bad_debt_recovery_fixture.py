"""Synthetic physical-recovery transport. Domain/SQL invariants are tested separately."""
import hashlib
import json
import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from lib.mobile_contract_fixture import seed_contract


def seed_bad_debt_recovery(state, index=8101, count=1, ownership=False, settled=False):
    contract = seed_contract(state, index)
    contract.update(status="bad_debt", code=f"HD-QA-{index}")
    rows = [{"id": index*100+i, "vehicleId": index*100+i, "revision": "100", "name": f"Xe thu hồi QA {i+1}",
             "license": f"QA-RECOVER-{i+1}", "startsAt": "2026-08-01T01:00:00.000Z", "completedAt": None,
             "available": True, "blockedReason": None} for i in range(count)]
    amounts = {"totalAmount": 2000000, "rentalPaid": 2000000 if settled else 100000, "rentalRemaining": 0 if settled else 1900000,
               "rentalOverpayment": 0, "depositHeld": 500000}
    profile = {"id": index, "code": f"HD-QA-{index}", "storeId": 31 if ownership else 23, "revision": "100", "status": "bad_debt",
               "ownership": ownership, "hasInstallmentPlan": ownership, "available": True, "blockedReason": None,
               "badDebtAt": "2026-09-16T01:00:00.000Z", "billingStoppedAt": "2026-09-16T01:00:00.000Z" if ownership else None,
               "amounts": amounts, "settled": settled, "rows": rows}
    state.setdefault("bad_debt_recovery_profiles", {})[index] = profile
    return profile


def bad_debt_recovery_response(path, method, body, headers, state):
    url = urlparse(path)
    if url.path.startswith("/api/mobile/v1/recoveries/requests/") and method == "GET":
        saved = state.get("bad_debt_recovery_receipts", {}).get(url.path.rsplit("/", 1)[1])
        proof = deepcopy(saved["receipt"]) if saved else None
        if proof:
            proof["replayed"] = True
            for flag in state.get("bad_debt_recovery_corrections", []):
                proof[flag] = False
            proof["current"] = all(proof[k] for k in ("itemCurrent", "historyCurrent", "moneyCurrent", "contractCurrent"))
        return 200, {"receipt": proof}, False
    match = re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/recoveries(?:/(preview))?", url.path)
    if not match:
        return None
    index, action = int(match[1]), match[2]
    profile = state.get("bad_debt_recovery_profiles", {}).get(index)
    if not profile:
        return 404, {"message": "Không có hợp đồng thu hồi QA.", "code": "NOT_FOUND"}, False
    page = int(parse_qs(url.query).get("page", ["1"])[0])
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    remaining = sum(row["completedAt"] is None for row in profile["rows"])
    if method == "GET":
        if state.get("bad_debt_recovery_unavailable", False):
            return 503, {"message": "Chưa tải được xe thu hồi QA.", "code": "SERVICE_UNAVAILABLE"}, False
        rows = sorted(profile["rows"], key=lambda row: (row["completedAt"] is not None, row["id"]))
        return 200, {**{k: deepcopy(v) for k, v in profile.items() if k != "rows"}, "remainingItems": remaining,
                     "items": {"page": page, "pages": max(1, math.ceil(len(rows)/25)), "total": len(rows), "rows": deepcopy(rows[(page-1)*25:page*25])},
                     "observedAt": now}, False
    assert method == "POST"
    key = headers.get("idempotency-key") or headers.get("Idempotency-Key")
    if action is None:
        assert key
        if key in state.get("tombstones", {}):
            return 409, {"message": "Mã thu hồi QA đã được khóa.", "code": "REQUEST_CANCELLED"}, False
        saved = state.get("bad_debt_recovery_receipts", {}).get(key)
        if saved:
            assert saved["body"] == body
            return 200, {**saved["receipt"], "replayed": True}, False
        if state.pop("bad_debt_recovery_drop", False):
            state["bad_debt_recovery_delayed"] = {"path": path, "method": method, "body": deepcopy(body), "headers": dict(headers)}
            return 503, {"message": "Chưa xác nhận được thu hồi QA.", "code": "SERVICE_UNAVAILABLE"}, False
        if state.pop("bad_debt_recovery_conflict", False):
            profile["revision"] = str(int(profile["revision"])+1)
    else:
        assert not key
        state["bad_debt_recovery_previews"] = state.get("bad_debt_recovery_previews", 0)+1
    item = next((row for row in profile["rows"] if row["id"] == body.get("item_id")), None)
    if not profile["available"] or body.get("revision") != profile["revision"] or not item or not item["available"] or item["revision"] != body.get("item_revision"):
        return 409, {"message": "Dòng xe hoặc số dư QA đã thay đổi. Tải lại để chọn lại xe.", "code": "RECOVERY_REVIEW_REQUIRED"}, False
    minute = body["recovered_at"]
    actual = datetime.fromisoformat(minute+":00+07:00").astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    review = {k: deepcopy(profile[k]) for k in ("id", "code", "storeId", "revision", "status", "ownership", "hasInstallmentPlan", "badDebtAt", "billingStoppedAt", "settled")}
    review.update(item=deepcopy(item), recoveredAt=actual, note=body.get("note", "").strip(), before=deepcopy(profile["amounts"]),
                  after={**deepcopy(profile["amounts"]), "status": "completed" if remaining == 1 and profile["settled"] else "bad_debt", "remainingItems": remaining-1})
    review["snapshot"] = hashlib.sha256(json.dumps(review, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    review["observedAt"] = now
    if action == "preview":
        return 200, review, False
    if body.get("review_snapshot") != review["snapshot"]:
        return 409, {"message": "Dòng xe hoặc số dư QA đã thay đổi. Tải lại để chọn lại xe.", "code": "RECOVERY_REVIEW_REQUIRED"}, False
    revision = str(int(profile["revision"])+1)
    actor = state["user"]
    proof = {"id": index, "revision": revision, "requestId": key, "replayed": False, "review": review, "itemRevision": revision,
             "actorId": actor["id"], "actorName": actor["name"], "recordedAt": now,
             "event": {"itemId": item["id"], "vehicleId": item["vehicleId"], "recoveredAt": actual, "recordedAt": now, "actorId": actor["id"],
                       "note": review["note"], "requestHash": hashlib.sha256(key.encode()).hexdigest()},
             "financialFingerprint": hashlib.sha256(json.dumps(profile["amounts"], sort_keys=True).encode()).hexdigest(),
             "itemCurrent": True, "historyCurrent": True, "moneyCurrent": True, "contractCurrent": True, "current": True}
    item.update(revision=revision, completedAt=actual, available=False, blockedReason="Xe đã thu hồi.")
    profile.update(revision=revision, status=review["after"]["status"], available=remaining > 1,
                   blockedReason=None if remaining > 1 else "Đã thu hồi hết xe.")
    state["draft_profiles"][index]["status"] = profile["status"]
    state.setdefault("bad_debt_recovery_receipts", {})[key] = {"operation": f"return.recover:{index}", "body": deepcopy(body), "receipt": proof}
    state["bad_debt_recovery_writes"] = state.get("bad_debt_recovery_writes", 0)+1
    return 200, proof, state.pop("bad_debt_recovery_lose_response", False)
