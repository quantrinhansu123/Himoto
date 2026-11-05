"""Loopback-only synthetic mobile API for native emulator QA. No database access.

Use EXPO_PUBLIC_API_URL=http://10.0.2.2:8091 in an Android development build.
The service stores fixture state in process memory and never sends messages,
uploads files, authenticates real accounts or calls operational APIs.
"""
import argparse
import json
import math
import re
import threading
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from lib.mobile_draft_fixture import draft_response, draft_record
from lib.mobile_contract_fixture import contract_response, seed_contract
from lib.mobile_recovery_fixture import recovery_response
from lib.mobile_finance_fixture import finance_response, seed_finance
from lib.mobile_renewal_fixture import renewal_response, bill_response
from lib.mobile_collection_fixture import collection_response, seed_collections
from lib.mobile_return_fixture import return_response, seed_return
from lib.mobile_swap_fixture import swap_response, seed_swap

TOKEN = "hm1_" + "a" * 43
USER = {"id": 7, "name": "QA Quản lý", "email": "qa@example.invalid", "role": "branch_manager", "permissions": ["vehicles.read", "contracts.read", "contracts.draft", "contracts.finalize", "customers.read", "customers.write", "finance.read", "finance.write"], "storeId": 23, "allStores": False}
USER["permissions"].append("contracts.renew")
STORES = [{"id": 23, "name": "Cơ sở QA"}, {"id": 24, "name": "Cơ sở đối chiếu"}]
STATE = {"profiles": {}, "receipts": {}, "creates": 0, "updates": 0}
STATE["native_recovery_fixtures"] = True
STATE_LOCK = threading.Lock()
seed_contract(STATE,3001,mismatch=True)
seed_contract(STATE,3002)
seed_contract(STATE,3003)
seed_contract(STATE,3005)
seed_contract(STATE,3006)
seed_finance(STATE,4001)
seed_finance(STATE,4002)
seed_collections(STATE,count=1)


def customer_profile(index):
    return STATE["profiles"].get(index) or {"id": index, "name": f"Khách QA {index}", "phone": "0900000000", "email": "qa@example.invalid", "address": "Địa chỉ QA", "id_card": "001234567890",
        "customer_type": "vietnam", "nationality": "", "contact_channel": "", "contact_detail": "", "store_id": 23, "status": "active", "warning_note": "", "driver_license_number": "",
        "driver_license_issued_on": "", "id_card_issued_on": "", "id_card_issued_by": "", "relatives": [], "revision": "100"}


def fixture_record(kind, index):
    if kind == "contracts":
        saved = draft_record(index, STATE)
        if saved:
            return saved
    row = {"id": index, "code": f"HD-QA-{index:03d}" if kind == "contracts" else f"QA-{index:03d}",
            "name": f"Khách QA {index}" if kind != "vehicles" else f"Xe QA {index}", "status": "ready" if kind == "vehicles" else "renting" if kind == "contracts" else "active",
            "storeId": 23, "storeName": "Cơ sở QA", "license": f"QA-{index:03d}" if kind != "customers" else "",
            "vehicleName": "Xe kiểm tra", "phone": "0900000000" if kind != "vehicles" else "", "startsAt": "2026-10-30T08:00:00+07:00",
            "endsAt": "2026-11-02T08:00:00+07:00", "totalAmount": 500000 if kind == "contracts" else None,
            "paidAmount": 100000 if kind == "contracts" else None, "brand": "QA", "color": "Đỏ", "odometer": 1234}
    if kind == "customers":
        saved = customer_profile(index)
        row.update({"name": saved["name"], "phone": saved["phone"], "status": saved["status"], "email": saved["email"], "address": saved["address"],
                    "contactChannel": saved["contact_channel"], "contactDetail": saved["contact_detail"], "customerNote": saved["warning_note"]})
    return row


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()

    def log_message(self, _format, *_args):
        pass  # Keep request bodies, credentials and bearer headers out of logs.

    def respond(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self):
        if self.headers.get("Origin") is not None:
            self.respond({"message": "Native client required", "code": "NATIVE_CLIENT_REQUIRED"}, 403)
            return False
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.respond({"message": "Phiên đã hết hạn.", "code": "SESSION_EXPIRED"}, 401)
            return False
        return True

    def do_POST(self):
        if self.path == "/__fixture_swap_mode":
            size=int(self.headers.get("Content-Length","0"))
            if not 0 < size <= 256:
                return self.respond({"message":"Invalid fixture mode"},400)
            try:
                body=json.loads(self.rfile.read(size))
            except ValueError:
                return self.respond({"message":"Invalid fixture mode"},400)
            if not isinstance(body,dict) or set(body)!={"mode"} or body["mode"] not in ("none","drop","lost","conflict"):
                return self.respond({"message":"Invalid fixture mode"},400)
            with STATE_LOCK:
                for key in ("swap_drop","swap_lose_response","swap_conflict"):
                    STATE.pop(key,None)
                if body["mode"]!="none":
                    STATE[{"drop":"swap_drop","lost":"swap_lose_response","conflict":"swap_conflict"}[body["mode"]]]=True
            return self.respond({"fixtureOnly":True,"mode":body["mode"]})
        if self.headers.get("Origin") is not None:
            return self.respond({"message": "Native client required", "code": "NATIVE_CLIENT_REQUIRED"}, 403)
        if self.path == "/__fixture_return_mode":
            size=int(self.headers.get("Content-Length","0"))
            if not 0<size<=256:
                return self.respond({"message":"Invalid fixture mode"},400)
            try:
                body=json.loads(self.rfile.read(size))
            except ValueError:
                return self.respond({"message":"Invalid fixture mode"},400)
            if not isinstance(body,dict) or set(body)!={"mode"} or body["mode"] not in ("none","drop","lost","conflict"):
                return self.respond({"message":"Invalid fixture mode"},400)
            with STATE_LOCK:
                for key in ("return_drop","return_lose_response","return_conflict"):
                    STATE.pop(key,None)
                if body["mode"]!="none":
                    STATE[{"drop":"return_drop","lost":"return_lose_response","conflict":"return_conflict"}[body["mode"]]]=True
            return self.respond({"fixtureOnly":True,"mode":body["mode"]})
        if self.path in ("/__fixture_bill_mode", "/__fixture_renewal_mode", "/__fixture_collection_mode"):
            size=int(self.headers.get("Content-Length","0"))
            if not 0 < size <= 256:
                return self.respond({"message":"Invalid fixture mode"},400)
            try:
                mode=json.loads(self.rfile.read(size))
            except ValueError:
                return self.respond({"message":"Invalid fixture mode"},400)
            if not isinstance(mode,dict) or set(mode)!={"mode"} or mode["mode"] not in ("none","drop","lost"):
                return self.respond({"message":"Invalid fixture mode"},400)
            with STATE_LOCK:
                STATE[{"/__fixture_renewal_mode":"renewal_mode","/__fixture_bill_mode":"bill_mode","/__fixture_collection_mode":"collection_mode"}[self.path]]=mode["mode"]
            return self.respond({"fixtureOnly":True,"mode":mode["mode"]})
        if self.path == "/__fixture_scope":
            # Loopback-only QA control; never part of the application's API.
            size = int(self.headers.get("Content-Length", "0"))
            if size < 0 or size > 256:
                return self.respond({"message": "Invalid fixture scope"}, 400)
            try:
                body = json.loads(self.rfile.read(size))
            except ValueError:
                return self.respond({"message": "Invalid fixture scope"}, 400)
            if not isinstance(body, dict) or set(body) != {"allStores"} or not isinstance(body["allStores"], bool):
                return self.respond({"message": "Invalid fixture scope"}, 400)
            with STATE_LOCK:
                USER["allStores"] = body["allStores"]
            return self.respond({"fixtureOnly": True, "allStores": USER["allStores"]})
        if self.path == "/api/mobile/v1/customers":
            return self.write_customer(None)
        if self.path.startswith("/api/mobile/v1/write-requests/"):
            return self.serve_draft("POST", recovery_response)
        if re.fullmatch(r"/api/mobile/v1/contracts/[1-9][0-9]*/swaps(?:/preview)?",self.path):
            return self.serve_draft("POST",swap_response)
        if re.fullmatch(r"/api/mobile/v1/contracts/[1-9][0-9]*/returns(?:/(?:preview|settlement-preview))?",self.path):
            return self.serve_draft("POST",return_response)
        if self.path.startswith("/api/mobile/v1/contracts/") and self.path.endswith("/payments"):
            return self.serve_draft("POST", finance_response)
        if self.path.startswith("/api/mobile/v1/contracts/") and self.path.endswith("/renewals"):
            return self.serve_draft("POST", renewal_response)
        if re.fullmatch(r"/api/mobile/v1/contracts/[1-9][0-9]*/renewals/[1-9][0-9]*/collection",self.path):
            return self.serve_draft("POST", collection_response)
        if self.path.startswith("/api/mobile/v1/contracts/"):
            return self.serve_draft("POST", contract_response)
        if self.path == "/api/mobile/v1/drafts" or self.path.startswith("/api/mobile/v1/drafts/"):
            return self.serve_draft("POST")
        if self.path != "/api/mobile/v1/session":
            return self.respond({"message": "Fixture endpoint not found"}, 404)
        size = int(self.headers.get("Content-Length", "0"))
        if size > 4096:
            return self.respond({"message": "Payload too large"}, 413)
        try:
            body = json.loads(self.rfile.read(size))
        except ValueError:
            return self.respond({"message": "Invalid JSON"}, 400)
        if body.get("email") != "qa" or body.get("password") != "fixture-password":
            return self.respond({"message": "Email hoặc mật khẩu không chính xác.", "code": "LOGIN_FAILED"}, 401)
        self.respond({"token": TOKEN, "user": USER, "expiresAt": self.expires_at}, 201)

    def do_PATCH(self):
        if self.path.startswith("/api/mobile/v1/drafts/"):
            return self.serve_draft("PATCH")
        prefix = "/api/mobile/v1/customers/"
        if self.path.startswith(prefix) and self.path.removeprefix(prefix).isdigit():
            return self.write_customer(int(self.path.removeprefix(prefix)))
        self.respond({"message": "Fixture endpoint not found"}, 404)

    def serve_draft(self, method, responder=draft_response):
        if not self.authorized():
            return
        body = None
        if method != "GET":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size < 0 or size > 512 * 1024:
                    return self.respond({"message": "Payload too large"}, 413)
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict):
                    raise ValueError("Object required")
            except ValueError:
                return self.respond({"message": "Invalid JSON"}, 400)
        with STATE_LOCK:
            result = responder(self.path, method, body, self.headers, STATE)
            if not result:
                return self.respond({"message": "Fixture endpoint not found"}, 404)
            status, response, lost = result
            if lost:
                return self.respond({"message": "Chưa nhận được xác nhận lưu. Kiểm tra kết quả lần lưu trước.", "code": "SERVICE_UNAVAILABLE"}, 503)
            return self.respond(response, status)

    def write_customer(self, customer_id):
        if not self.authorized():
            return
        size = int(self.headers.get("Content-Length", "0"))
        if size > 32768:
            return self.respond({"message": "Payload too large"}, 413)
        try:
            body = json.loads(self.rfile.read(size))
        except ValueError:
            return self.respond({"message": "Invalid JSON"}, 400)
        key = self.headers.get("Idempotency-Key")
        if not isinstance(body, dict) or not key or not body.get("name") or body.get("store_id") != 23:
            return self.respond({"message": "Invalid fixture customer"}, 400)
        with STATE_LOCK:
            previous = STATE["receipts"].get(key)
            if key in STATE.get("tombstones", {}):
                return self.respond({"message": "Mã thao tác đã được hủy.", "code": "REQUEST_CANCELLED"}, 409)
            if previous:
                if previous["body"] != body:
                    return self.respond({"message": "Lần lưu trước có nội dung khác.", "code": "REQUEST_KEY_REUSED"}, 409)
                return self.respond({**previous["receipt"], "replayed": True})
            creating = customer_id is None
            customer_id = 1000 + STATE["creates"] if creating else customer_id
            current = customer_profile(customer_id)
            if not creating and body.get("revision") != current["revision"]:
                return self.respond({"message": "Hồ sơ đã được thay đổi.", "code": "CUSTOMER_CONFLICT"}, 409)
            revision = "100" if creating else str(int(current["revision"]) + 1)
            STATE["profiles"][customer_id] = {**deepcopy(body), "id": customer_id, "revision": revision}
            receipt = {"id": customer_id, "revision": revision, "replayed": False}
            STATE["receipts"][key] = {"body": deepcopy(body), "receipt": receipt, "operation": "customer.create" if creating else f"customer.update:{customer_id}"}
            STATE["creates" if creating else "updates"] += 1
            if body["name"] == "Native-Lost-Response":
                return self.respond({"message": "Chưa nhận được xác nhận lưu. Kiểm tra kết quả lần lưu trước.", "code": "SERVICE_UNAVAILABLE"}, 503)
            self.respond(receipt, 201 if creating else 200)

    def do_PUT(self):
        if not self.authorized():
            return
        size=int(self.headers.get("Content-Length","0"))
        if not 0 < size <= 2097152:
            self.close_connection=True
            return self.respond({"message":"Invalid fixture image size"},413)
        data=self.rfile.read(size)
        with STATE_LOCK:
            result=bill_response(self.path,"PUT",data,self.headers,STATE)
        if not result:
            return self.respond({"message":"Fixture endpoint not found"},404)
        status,payload,_=result
        return self.respond(payload,status)

    def do_DELETE(self):
        if self.path != "/api/mobile/v1/session":
            return self.respond({"message": "Fixture endpoint not found"}, 404)
        if self.authorized():
            self.respond({"success": True})

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/__fixture_swaps":
            with STATE_LOCK:
                delayed=STATE.get("swap_delayed")
                late_status=swap_response(**delayed,state=STATE)[0] if parse_qs(url.query).get("late")==["1"] and delayed else None
                return self.respond({"fixtureOnly":True,"writes":STATE.get("swap_writes",0),
                    "receipts":[saved["receipt"] for saved in STATE.get("swap_receipts",{}).values()],"tombstones":STATE.get("tombstones",{}),"lateStatus":late_status})
        if url.path == "/__fixture_returns":
            with STATE_LOCK:
                delayed=STATE.get("return_delayed")
                late_status=return_response(**delayed,state=STATE)[0] if parse_qs(url.query).get("late")==["1"] and delayed else None
                return self.respond({"fixtureOnly":True,"writes":STATE.get("return_writes",0),
                    "receipts":[saved["receipt"] for saved in STATE.get("return_receipts",{}).values()],"tombstones":STATE.get("tombstones",{}),"lateStatus":late_status})
        if url.path == "/health":
            return self.respond({"fixtureOnly": True})
        if url.path == "/__fixture_bills":
            with STATE_LOCK:
                return self.respond({"fixtureOnly":True,"writes":STATE.get("bill_writes",0),"receipts":len(STATE.get("bill_receipts",{})),
                    "images":[{**photo["info"],"sha256":__import__("hashlib").sha256(photo["data"]).hexdigest()} for photo in STATE.get("bill_images",{}).values()]})
        if url.path == "/__fixture_renewals":
            with STATE_LOCK:
                return self.respond({"fixtureOnly":True,"writes":STATE.get("renewal_writes",0),"receipts":[saved["receipt"] for saved in STATE.get("renewal_receipts",{}).values()]})
        if url.path == "/__fixture_collections":
            with STATE_LOCK:
                delayed=STATE.get("delayed_collection")
                if parse_qs(url.query).get("late")==["1"] and delayed:
                    late_status,_,_=collection_response(delayed["path"],"POST",delayed["body"],delayed["headers"],STATE)
                else:
                    late_status=None
                return self.respond({"fixtureOnly":True,"writes":STATE.get("collection_writes",0),"receipts":[saved["receipt"] for saved in STATE.get("collection_receipts",{}).values()],
                    "lateStatus":late_status,"periods":STATE.get("linked_periods",{}),"tombstones":STATE.get("tombstones",{})})
        if url.path == "/__fixture_state":
            with STATE_LOCK:
                drafts = [{"id": index, "revision": profile["revision"], "paper": profile["input"]["draft"]["contract_number"], "customerId": profile["input"]["draft"]["customer_id"], "vehicleIds": [row["id"] for row in profile["input"]["draft"]["vehicles"]], "startsAt": profile["input"]["draft"]["start_date"]} for index, profile in STATE.get("draft_profiles", {}).items()]
                return self.respond({"fixtureOnly": True, "userAllStores": USER["allStores"], "customerCreates": STATE["creates"], "customerUpdates": STATE["updates"], "draftCreates": STATE.get("draft_creates", 0), "draftUpdates": STATE.get("draft_updates", 0), "drafts": drafts, "contractActions":STATE.get("contract_actions",0), "collectionsCount":STATE.get("collections_count",0), "resolutionCalls":STATE.get("resolution_calls",0), "tombstones":len(STATE.get("tombstones",{})), "financeWrites":STATE.get("finance_writes",0), "financeBalances":{str(i):{k:v for k,v in c.items() if k in ("totalAmount","rentalPaid","rentalRemaining","depositHeld","depositRemaining")} for i,c in STATE.get("finance_profiles",{}).items()}, "contractStatuses":{str(index):profile.get("status","draft") for index,profile in STATE.get("draft_profiles",{}).items()}})
        if url.path.startswith("/api/mobile/v1/swaps/requests/") or re.fullmatch(r"/api/mobile/v1/contracts/[1-9][0-9]*/swaps(?:/candidates)?",url.path):
            return self.serve_draft("GET",swap_response)
        if url.path.startswith("/api/mobile/v1/returns/requests/") or re.fullmatch(r"/api/mobile/v1/contracts/[1-9][0-9]*/returns",url.path):
            return self.serve_draft("GET",return_response)
        if url.path.startswith("/api/mobile/v1/payments/requests/") or (url.path.startswith("/api/mobile/v1/contracts/") and url.path.endswith("/finance")):
            return self.serve_draft("GET", finance_response)
        if url.path.startswith("/api/mobile/v1/renewal-collections/requests/") or re.fullmatch(r"/api/mobile/v1/contracts/[1-9][0-9]*/renewals/(?:periods|[1-9][0-9]*/collection)",url.path):
            return self.serve_draft("GET", collection_response)
        if url.path.startswith(("/api/mobile/v1/bills/requests/", "/api/mobile/v1/renewal-collection-bills/requests/", "/api/mobile/v1/renewals/requests/")) or (url.path.startswith("/api/mobile/v1/contracts/") and url.path.endswith("/renewals")):
            return self.serve_draft("GET", renewal_response)
        bill=re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/renewals/([1-9][0-9]*)/(?:collection/)?bill",url.path)
        if bill:
            if not self.authorized():
                return
            with STATE_LOCK:
                if "revision" in parse_qs(url.query):
                    photo=STATE.get("bill_images",{}).get((int(bill[1]),int(bill[2])))
                    if not photo:
                        return self.respond({"message":"No fixture image"},404)
                    if photo["info"]["photoRevision"]!=parse_qs(url.query)["revision"][0]:
                        return self.respond({"message":"Changed fixture image"},409)
                    data=photo["data"]
                    self.send_response(200)
                    self.send_header("Content-Type","image/jpeg")
                    self.send_header("Content-Length",str(len(data)))
                    self.send_header("Cache-Control","no-store")
                    self.end_headers()
                    self.wfile.write(data)
                    return
                status,payload,_=bill_response(self.path,"GET",b"",self.headers,STATE)
                return self.respond(payload,status)
        if url.path.startswith("/api/mobile/v1/contracts/"):
            return self.serve_draft("GET", contract_response)
        if url.path == "/api/mobile/v1/drafts" or url.path.startswith("/api/mobile/v1/drafts/"):
            return self.serve_draft("GET")
        if not self.authorized():
            return
        if url.path == "/api/mobile/v1/session":
            return self.respond({"user": USER, "expiresAt": self.expires_at})
        if url.path == "/api/mobile/v1/workspace":
            return self.respond({"user": USER, "stores": STORES})
        if url.path.startswith("/api/mobile/v1/customers/requests/"):
            key = url.path.rsplit("/", 1)[1]
            return self.respond({"receipt": STATE["receipts"].get(key, {}).get("receipt")})
        if url.path.startswith("/api/mobile/v1/customers/"):
            value = url.path.rsplit("/", 1)[1]
            if value.isdigit():
                return self.respond(customer_profile(int(value)))
        if url.path.startswith("/api/mobile/v1/catalogue/"):
            parts = url.path.removeprefix("/api/mobile/v1/catalogue/").split("/")
            kind = parts[0]
            if kind not in ("vehicles", "contracts", "customers"):
                return self.respond({"message": "Fixture endpoint not found"}, 404)
            if len(parts) == 2 and parts[1].isdigit():
                return self.respond(fixture_record(kind, int(parts[1])))
            params = parse_qs(url.query)
            rows = [fixture_record(kind, index) for index in range(1, 24)]
            if kind == "customers":
                rows += [fixture_record(kind, index) for index in list(STATE["profiles"]) if index >= 1000]
            if kind == "contracts":
                rows += [fixture_record(kind, index) for index in list(STATE.get("draft_profiles", {}))]
            search = params.get("search", [""])[0].lower()
            status = params.get("status", [""])[0]
            if search:
                rows = [row for row in rows if search in (row["name"] + row["code"] + row["license"]).lower()]
            if status:
                rows = [row for row in rows if row["status"] == status]
            if params.get("store", ["all"])[0] == "24":
                rows = []
            size = min(50, max(1, int(params.get("size", ["20"])[0])))
            pages = max(1, math.ceil(len(rows) / size))
            page = min(int(params.get("page", ["1"])[0]), pages)
            return self.respond({"rows": rows[(page - 1) * size:page * size], "total": len(rows), "page": page, "pages": pages, "statusCounts": [], "updatedAt": datetime.now(timezone.utc).isoformat()})
        self.respond({"message": "Fixture endpoint not found"}, 404)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8091)
    parser.add_argument("--returns",action="store_true",help="Seed an isolated return acceptance fixture; never reset an existing server")
    parser.add_argument("--swaps",action="store_true",help="Seed an isolated swap acceptance fixture; preserve running fixtures")
    args = parser.parse_args()
    if args.returns:
        USER["permissions"].append("contracts.return")
        for index in (5101,5104,5105):
            seed_return(STATE,index)
    if args.swaps:
        USER["permissions"].append("contracts.return")
        for index in (6101,6104,6105):
            seed_swap(STATE,index)
    print(f"Synthetic mobile API listening on 127.0.0.1:{args.port}; no real accounts or business writes.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
