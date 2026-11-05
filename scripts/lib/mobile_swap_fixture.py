"""Synthetic swap transport/UI state; SQL/domain invariants live in PGlite tests."""
import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from lib.mobile_contract_fixture import seed_contract


def seed_swap(state, index=6101, count=1, ownership=False):
    contract = seed_contract(state, index)
    contract.update({"status": "renting", "code": f"HD-QA-{index}"})
    rows = [{"id": index*100+i, "vehicleId": index*100+i, "revision": "100", "name": f"Xe cũ QA {i+1}", "license": f"QA-SWAP-OLD-{i+1}",
             "startsAt": "2026-10-10T08:00:00+07:00", "returnAt": "2026-11-10T08:00:00+07:00", "completedAt": None,
             "available": True, "blockedReason": None} for i in range(count)]
    vehicles = [{"id": index*100+1000+i, "revision": "100", "name": f"Xe thay QA {i+1}", "license": f"QA-SWAP-NEW-{i+1}",
                 "brand": "QA", "type": "electric", "color": "Đỏ", "year": "2026", "storeId": 29 if ownership else 23,
                 "storeName": "Kho Thuê sở hữu QA" if ownership else "Kho cơ sở QA"} for i in range(31)]
    vehicles[-1]["license"] = "QA-SWAP-NEW-_%"
    result = {"id": index, "code": f"HD-QA-{index}", "status": "renting", "storeId": 31 if ownership else 23, "revision": "100",
              "ownership": ownership, "available": True, "blockedReason": None, "rows": rows, "vehicles": vehicles}
    state.setdefault("swap_profiles", {})[index] = result
    return result


def swap_response(path, method, body, headers, state):
    url = urlparse(path)
    if url.path.startswith("/api/mobile/v1/swaps/requests/") and method == "GET":
        saved = state.get("swap_receipts", {}).get(url.path.rsplit("/", 1)[1])
        proof = deepcopy(saved["receipt"]) if saved else None
        if proof:
            proof["replayed"] = True
            for key in state.get("swap_corrections", []):
                proof[key] = False
            proof["current"] = all(proof[k] for k in ("itemCurrent", "vehicleCurrent", "historyCurrent", "contractCurrent"))
        return 200, {"receipt": proof}, False
    match = re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/swaps(?:/(candidates|preview))?", url.path)
    if not match:
        return None
    index, action = int(match[1]), match[2]
    profile = state.get("swap_profiles", {}).get(index)
    if not profile:
        return 404, {"message": "Không có hợp đồng đổi xe QA.", "code": "NOT_FOUND"}, False
    params = parse_qs(url.query)
    page = int(params.get("page", ["1"])[0])
    if method == "GET" and action is None:
        result = {k: deepcopy(v) for k, v in profile.items() if k not in ("rows", "vehicles")}
        result["items"] = {"page": page, "pages": max(1, math.ceil(len(profile["rows"])/25)), "total": len(profile["rows"]), "rows": deepcopy(profile["rows"][(page-1)*25:page*25])}
        result["observedAt"] = datetime.now(timezone.utc).isoformat()
        return 200, result, False
    if method == "GET" and action == "candidates":
        if state.get("swap_page_error") and page > 1:
            return 503, {"message": "Lỗi tải trang kho QA.", "code": "SERVICE_UNAVAILABLE"}, False
        selected = next((r for r in profile["rows"] if str(r["id"]) == params.get("item_id", [""])[0]), None)
        if not selected or not selected["available"] or params.get("revision", [""])[0] != profile["revision"] or params.get("item_revision", [""])[0] != selected["revision"]:
            return 409, {"message": "Hợp đồng hoặc dòng xe QA đã thay đổi. Tải lại lựa chọn.", "code": "SWAP_REVIEW_REQUIRED"}, False
        search = params.get("search", [""])[0].strip()
        rows = [v for v in profile["vehicles"] if search.lower() in (v["name"]+" "+v["license"]).lower()]
        return 200, {"id": index, "revision": profile["revision"], "itemId": selected["id"], "itemRevision": selected["revision"],
                     "ownership": profile["ownership"], "page": page, "search": search, "hasMore": len(rows) > page*25,
                     "rows": deepcopy(rows[(page-1)*25:page*25]), "observedAt": datetime.now(timezone.utc).isoformat()}, False
    key = headers.get("idempotency-key") or headers.get("Idempotency-Key")
    if action is None:
        if key in state.get("tombstones", {}):
            return 409, {"message": "Mã đổi xe QA đã được khóa.", "code": "REQUEST_CANCELLED"}, False
        saved = state.get("swap_receipts", {}).get(key)
        if saved:
            assert saved["body"] == body
            return 200, {**saved["receipt"], "replayed": True}, False
        if state.pop("swap_drop", False):
            state["swap_delayed"] = {"path": path, "method": method, "body": deepcopy(body), "headers": dict(headers)}
            return 503, {"message": "Chưa xác nhận được đổi xe QA.", "code": "SERVICE_UNAVAILABLE"}, False
        if state.pop("swap_conflict", False):
            profile["revision"] = str(int(profile["revision"])+1)
    else:
        assert action == "preview" and not key
        state["swap_previews"] = state.get("swap_previews", 0)+1
    selected = next((r for r in profile["rows"] if r["id"] == body.get("item_id")), None)
    vehicle = next((v for v in profile["vehicles"] if v["id"] == body.get("vehicle_id")), None)
    if not profile["available"] or body.get("revision") != profile["revision"] or not selected or not selected["available"] or selected["revision"] != body.get("item_revision") or not vehicle or vehicle["revision"] != body.get("vehicle_revision"):
        return 409, {"message": "Hợp đồng hoặc xe thay thế QA đã thay đổi. Tải lại để chọn lại xe.", "code": "SWAP_REVIEW_REQUIRED"}, False
    if action == "preview":
        return 200, {"id": index, "code": profile["code"], "revision": profile["revision"], "ownership": profile["ownership"],
                     "item": deepcopy(selected), "vehicle": deepcopy(vehicle), "observedAt": datetime.now(timezone.utc).isoformat()}, False
    assert key
    revision = str(int(profile["revision"])+1)
    proof = {"id": index, "revision": revision, "requestId": key, "replayed": False, "code": profile["code"],
             "swapId": 9001+state.get("swap_writes", 0), "swapRevision": revision, "itemId": selected["id"], "itemRevision": revision,
             "reviewedRevision": body["revision"], "reviewedItemRevision": body["item_revision"], "reviewedVehicleRevision": body["vehicle_revision"],
             "from": {"id": selected["vehicleId"], "name": selected["name"], "license": selected["license"]}, "to": {**deepcopy(vehicle), "revision": revision},
             "recordedAt": datetime.now(timezone.utc).isoformat(), "itemCurrent": True, "vehicleCurrent": True, "historyCurrent": True, "contractCurrent": True, "current": True}
    selected.update({"vehicleId": vehicle["id"], "name": vehicle["name"], "license": vehicle["license"], "revision": revision})
    profile["vehicles"].remove(vehicle)
    profile["revision"] = revision
    state.setdefault("swap_receipts", {})[key] = {"operation": f"return.swap:{index}", "body": deepcopy(body), "receipt": proof}
    state["swap_writes"] = state.get("swap_writes", 0)+1
    return 200, proof, state.pop("swap_lose_response", False)
