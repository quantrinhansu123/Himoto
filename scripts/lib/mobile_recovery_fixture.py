"""Synthetic reconciliation/tombstones; no business data or external I/O."""
from urllib.parse import urlparse

def recovery_response(path, method, body, headers, state):
    parts = urlparse(path).path.split("/")
    if len(parts) != 7 or parts[1:5] != ["api", "mobile", "v1", "write-requests"] or parts[6] != "resolve":
        return None
    if method != "POST":
        return 405, {"message": "Method not allowed"}, False
    key, operation = parts[5], body.get("operation", "")
    state.setdefault("resolution_calls", 0)
    state["resolution_calls"] += 1
    if state.pop("resolve_expired", False):
        state["expired"] = True
        return 401, {"message": "Phiên đã hết hạn.", "code": "SESSION_EXPIRED"}, False
    if state.pop("resolve_unavailable", False):
        return 503, {"message": "Chưa kết nối được máy chủ đối chiếu.", "code": "SERVICE_UNAVAILABLE"}, False
    previous = state.get("contract_receipts", {}).get(key)
    if previous:
        assert operation == f"contract.{previous['action']}:{previous['id']}"
        result = {"key": key, "operation": operation, "status": "committed", "receipt": {**previous["receipt"], "replayed": True}}
    else:
        previous = state.get("media_delete_receipts", {}).get(key) or state.get("customer_photo_copy_receipts", {}).get(key) or state.get("contract_photo_receipts", {}).get(key) or state.get("document_receipts", {}).get(key) or state.get("bad_debt_recovery_receipts", {}).get(key) or state.get("swap_receipts", {}).get(key) or state.get("return_receipts", {}).get(key) or state.get("collection_receipts", {}).get(key) or state.get("renewal_receipts", {}).get(key) or state.get("bill_receipts", {}).get(key) or state.get("finance_receipts", {}).get(key) or state.get("draft_receipts", {}).get(key) or state.get("receipts", {}).get(key)
        if previous:
            assert operation == previous["operation"]
            result = {"key": key, "operation": operation, "status": "committed", "receipt": {**previous["receipt"], "replayed": True}}
        else:
            state.setdefault("tombstones", {})[key] = operation
            result = {"key": key, "operation": operation, "status": "cancelled", "receipt": None}
    return 200, result, state.pop("resolve_lost_response", False)
