"""Synthetic contract finance; no operational database or external I/O."""
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from lib.mobile_contract_fixture import ACCOUNTS, seed_contract

PURPOSES = ["debt", "deposit", "extra", "deposit_refund", "rental_refund"]

def seed_finance(state, index=4001):
    profile = seed_contract(state, index)
    profile.update({"status": "renting", "code": f"HD-QA-{index}", "rentalPaid": 100000, "depositPaid": 100000})
    history = [{"id": 1001+i, "direction": "in", "deposit": False, "amount": 74000 if i == 0 else 1000,
        "paidAt": f"2026-09-{1+i:02d}T08:00:00+07:00", "method": "Tiền mặt", "account": "Két tiền mặt QA",
        "note": f"Phiếu lịch sử QA {i+1}", "noteTruncated": False, "actor": "QA", "status": "approved", "renewalVersion": None} for i in range(27)]
    state.setdefault("finance_profiles", {})[index] = {"id": index, "code": profile["code"], "status": "renting", "storeId": 23, "revision": "100", "canWrite": True,
        "totalAmount": 500000, "rentalPaid": 100000, "rentalRemaining": 400000, "depositPaid": 100000, "depositRefunded": 0,
        "depositHeld": 100000, "depositRemaining": 100000, "rentalRefundable": 50000, "holdActive": False, "completedFromHold": False,
        "purposes": PURPOSES[:], "accounts": ACCOUNTS, "billing": None, "history": history}
    return state["finance_profiles"][index]

def finance_response(path, method, body, headers, state):
    url = urlparse(path)
    if url.path.startswith("/api/mobile/v1/payments/requests/") and method == "GET":
        previous = state.get("finance_receipts", {}).get(url.path.rsplit("/", 1)[1])
        return 200, {"receipt": {**previous["receipt"], "replayed": True} if previous else None}, False
    parts = url.path.removeprefix("/api/mobile/v1/contracts/").split("/")
    if not url.path.startswith("/api/mobile/v1/contracts/") or len(parts) != 2 or not parts[0].isdigit() or parts[1] not in ("finance", "payments"):
        return None
    index = int(parts[0])
    context = state.get("finance_profiles", {}).get(index)
    if not context:
        return 404, {"message": "Không có số liệu thu/chi QA.", "code": "NOT_FOUND"}, False
    permissions = state.get("user", {}).get("permissions", ["contracts.read", "finance.read", "finance.write"])
    if "contracts.read" not in permissions or ("finance.write" not in permissions if method == "POST" else not any(p in permissions for p in ("finance.read", "finance.write"))):
        return 403, {"message": "Không có quyền thu/chi.", "code": "FORBIDDEN"}, False
    if method == "GET" and parts[1] == "finance":
        page = int(parse_qs(url.query).get("page", ["1"])[0])
        if state.get("finance_page_error") and page > 1:
            return 503, {"message": "Lỗi tải trang lịch sử QA.", "code": "SERVICE_UNAVAILABLE"}, False
        result = deepcopy(context)
        history = sorted(result.pop("history"), key=lambda r: (r["paidAt"], r["id"]), reverse=True)
        pages = max(1, (len(history)+24)//25); page = min(page, pages)
        result["history"] = {"page": page, "pages": pages, "total": len(history), "rows": history[(page-1)*25:page*25]}
        result["canWrite"] = "finance.write" in permissions
        result["purposes"] = [p for p in PURPOSES if not (result["completedFromHold"] and p in ("debt", "deposit", "extra")) and not (result["holdActive"] and p == "extra")
            and (p != "deposit" or result["depositRemaining"] > 0) and (p != "deposit_refund" or result["depositHeld"] > 0) and (p != "rental_refund" or result["rentalRefundable"] > 0)]
        result["observedAt"] = datetime.now(timezone.utc).isoformat()
        return 200, result, False
    if method != "POST" or parts[1] != "payments":
        return 405, {"message": "Method not allowed"}, False
    key = headers.get("idempotency-key") or headers.get("Idempotency-Key")
    if key in state.get("tombstones", {}):
        return 409, {"message": "Mã thao tác đã được hủy.", "code": "REQUEST_CANCELLED"}, False
    if state.pop("finance_drop_before_commit", False) or (state.get("native_recovery_fixtures") and body.get("note", "").endswith("Native-Finance-Unsent") and not state.get("native_finance_dropped")):
        state["native_finance_dropped"] = True
        state["delayed_payment_request"] = {"path": path, "method": method, "body": deepcopy(body), "headers": dict(headers)}
        return 503, {"message": "Chưa xác nhận được thu/chi.", "code": "SERVICE_UNAVAILABLE"}, False
    previous = state.setdefault("finance_receipts", {}).get(key)
    if previous:
        if previous["body"] != body: return 409, {"message": "Mã lần thu/chi có nội dung khác.", "code": "REQUEST_KEY_REUSED"}, False
        return 200, {**previous["receipt"], "replayed": True}, False
    if state.pop("finance_conflict", False): context["revision"] = str(int(context["revision"])+1)
    if body.get("revision") != context["revision"]:
        return 409, {"message": "Số liệu thu/chi đã thay đổi. Đối chiếu trước khi ghi.", "code": "PAYMENT_CONFLICT"}, False
    if state.pop("finance_accrual_change", False):
        context["totalAmount"] += 10000
        context["rentalRemaining"] += 10000
    if body.get("expected_total") != context["totalAmount"] or body.get("expected_remaining") != context["rentalRemaining"]:
        return 409, {"message": "Số dư đã thay đổi từ lúc rà soát. Đối chiếu và tải lại số liệu trước khi ghi.", "code": "PAYMENT_CONFLICT"}, False
    amount, purpose = int(body["amount"]), body["purpose"]
    if purpose == "debt":
        if amount > context["rentalRemaining"] and not body.get("acknowledge_overpayment"):
            return 409, {"message": "Xác nhận thu vượt.", "code": "OVERPAYMENT_ACK_REQUIRED"}, False
        if context["rentalRemaining"] > 0 and amount > context["rentalRemaining"]: context["totalAmount"] += amount-context["rentalRemaining"]
        context["rentalPaid"] += amount
    elif purpose == "extra": context["totalAmount"] += amount; context["rentalPaid"] += amount
    elif purpose == "deposit": context["depositPaid"] += amount; context["depositHeld"] += amount; context["depositRemaining"] -= amount
    elif purpose == "deposit_refund": context["depositRefunded"] += amount; context["depositHeld"] -= amount
    elif purpose == "rental_refund": context["rentalPaid"] -= amount; context["rentalRefundable"] -= amount
    else: return 400, {"message": "Nghiệp vụ không hợp lệ.", "code": "INVALID_PAYMENT"}, False
    context["rentalRemaining"] = max(0, context["totalAmount"]-context["rentalPaid"])
    context["revision"] = str(int(context["revision"])+1)
    transaction = 9001 + state.get("finance_writes", 0)
    account = next(a for a in context["accounts"] if a["id"] == body["account_id"] and a["method"] == body["method"])
    context["history"].append({"id": transaction, "direction": "out" if purpose.endswith("refund") else "in", "deposit": purpose in ("deposit", "deposit_refund"),
        "amount": amount, "paidAt": body["paid_at"]+":00+07:00", "method": body["method"], "account": account["label"], "note": body["note"], "noteTruncated": False,
        "actor": "QA Quản lý", "status": "approved", "renewalVersion": None})
    receipt = {"id": index, "revision": context["revision"], "transactionId": transaction, "replayed": False}
    state["finance_receipts"][key] = {"receipt": receipt, "body": deepcopy(body), "operation": f"payment.record:{index}"}
    state["finance_writes"] = state.get("finance_writes", 0)+1
    profile = state["draft_profiles"][index]
    profile["rentalPaid"] = context["rentalPaid"]; profile["depositPaid"] = context["depositPaid"]
    profile["input"]["draft"]["total_amount"] = str(context["totalAmount"])
    if state.pop("finance_expire_after_commit", False):
        state["expired"] = True
        return 401, {"message": "Phiên đã hết hạn.", "code": "SESSION_EXPIRED"}, False
    return 201, receipt, state.pop("finance_lost_response", False) or body.get("note", "").endswith("Native-Finance-Lost")
