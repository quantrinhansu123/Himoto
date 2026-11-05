"""Browser acceptance of the mobile composer using intercepted synthetic data."""
import argparse
import json
import math
import re
import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright
from lib.mobile_customer_ui import customer_response
from lib.mobile_catalogue_media_fixture import thumbnail_response
from lib.mobile_customer_matches_ui import run_duplicate_workflows
from lib.mobile_customer_documents_fixture import document_response
from lib.mobile_customer_photo_copy_fixture import response as customer_copy_response
from lib.mobile_customer_documents_ui import run_document_workflows
from lib.mobile_draft_fixture import TEMPLATE, STORES, draft_customer, draft_record, draft_response
from lib.mobile_contract_fixture import contract_response
from lib.mobile_contract_ui import run_contract_workflows
from lib.mobile_recovery_fixture import recovery_response
from lib.mobile_finance_fixture import finance_response
from lib.mobile_finance_ui import run_finance_workflows
from lib.mobile_renewal_fixture import renewal_response, bill_response
from lib.mobile_renewal_ui import run_renewal_workflows
from lib.mobile_collection_fixture import collection_response
from lib.mobile_collection_ui import run_collection_workflows
from lib.mobile_return_fixture import return_response
from lib.mobile_return_ui import run_return_workflows
from lib.mobile_swap_fixture import swap_response
from lib.mobile_swap_ui import run_swap_workflows
from lib.mobile_bad_debt_recovery_fixture import bad_debt_recovery_response
from lib.mobile_bad_debt_recovery_ui import run_bad_debt_recovery_workflows

USER = {"id": 7, "name": "QA Quản lý", "email": "qa@example.invalid", "role": "branch_manager", "permissions": ["vehicles.read", "contracts.read", "contracts.draft", "customers.read", "customers.write"], "storeId": 23, "allStores": False}
TOKEN = "hm1_" + "a" * 43
EXPIRY = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()

def run(base_url, output, contracts_only=False, finance_only=False, renewals_only=False, collections_only=False, returns_only=False, swaps_only=False, recoveries_only=False, duplicates_only=False, documents_only=False):
    output.mkdir(parents=True, exist_ok=True)
    checks, errors, unexpected = [], [], []
    state = {"user": deepcopy(USER)}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 375, "height": 812}, color_scheme="light", reduced_motion="reduce")
        def intercept(route):
            request, url = route.request, urlparse(route.request.url)
            if url.netloc == urlparse(base_url).netloc:
                return route.continue_()
            if url.hostname != "mobile-api.example.invalid":
                unexpected.append(url.hostname)
                return route.abort()
            headers = {"Access-Control-Allow-Origin": base_url, "Access-Control-Allow-Headers": "authorization,content-type,idempotency-key,x-record-revision,x-reference-revision,x-photo-revision,x-media-snapshot,x-photo-kind,x-ocr-request,x-expected-identity,x-customer-photo-snapshot", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"}
            if request.method == "OPTIONS":
                return route.fulfill(status=204, headers=headers)
            binary = request.method == 'PUT' or url.path.endswith('/documents/ocr')
            body = {'jpeg': base64.b64encode(request.post_data_buffer).decode()} if binary else request.post_data_json if request.post_data else {}
            def respond(data, status=200):
                route.fulfill(status=status, headers=headers, json=data)
            if url.path.endswith("/session"):
                if request.method == "POST":
                    assert body["email"] == "qa" and body["password"] == "fixture-password"
                    state["expired"] = False
                    return respond({"token": TOKEN, "user": state["user"], "expiresAt": EXPIRY}, 201)
                if state.get("expired"):
                    return respond({"message": "Phiên đã hết hạn.", "code": "SESSION_EXPIRED"}, 401)
                return respond({"success": True} if request.method == "DELETE" else {"user": state["user"], "expiresAt": EXPIRY})
            if state.get("expired"):
                return respond({"message": "Phiên đã hết hạn.", "code": "SESSION_EXPIRED"}, 401)
            if url.path.endswith("/workspace"):
                return respond({"user": state["user"], "stores": STORES})
            copy_result=customer_copy_response(request.url,request.method,body,request.headers,state)
            if copy_result:
                status,data,lost=copy_result
                return route.abort('failed') if lost else respond(data,status)
            document_result = document_response(request.url, request.method, body, request.headers, state)
            if document_result:
                status, data, lost = document_result
                if url.path.endswith('/documents/ocr') and state.pop('hold_ocr', False):
                    state['held_ocr'] = (route, status, data, headers)
                    return
                if lost: return route.abort('failed')
                if '_bytesBase64' in data:
                    return route.fulfill(status=status, headers={**headers, 'Content-Type': data['mimeType']}, body=base64.b64decode(data['_bytesBase64']))
                return respond(data, status)
            bill = re.fullmatch(r"/api/mobile/v1/contracts/([1-9][0-9]*)/renewals/([1-9][0-9]*)/(?:collection/)?bill",url.path)
            if bill and request.method == "GET":
                if "revision" in parse_qs(url.query):
                    photo=state.get("bill_images",{}).get((int(bill[1]),int(bill[2])))
                    if not photo or photo["info"]["photoRevision"]!=parse_qs(url.query)["revision"][0]:
                        return respond({"message":"Changed synthetic image"},409)
                    return route.fulfill(status=200,headers={**headers,"Content-Type":photo["info"]["mimeType"]},body=photo["data"])
                status,data,_=bill_response(request.url,"GET",b"",request.headers,state)
                return respond(data,status)
            recovered = bad_debt_recovery_response(request.url,request.method,body,request.headers,state)
            if recovered:
                status,data,lost=recovered
                return route.abort('failed') if lost else respond(data,status)
            swapped = swap_response(request.url,request.method,body,request.headers,state)
            if swapped:
                status,data,lost=swapped
                return route.abort('failed') if lost else respond(data,status)
            returned = return_response(request.url,request.method,body,request.headers,state)
            if returned:
                status,data,lost=returned
                return route.abort('failed') if lost else respond(data,status)
            collection = collection_response(request.url,request.method,body,request.headers,state)
            if collection:
                status,data,lost=collection
                return route.abort('failed') if lost else respond(data,status)
            renewal = renewal_response(request.url,request.method,body,request.headers,state)
            if renewal:
                status,data,lost=renewal
                return route.abort('failed') if lost else respond(data,status)
            financial = finance_response(request.url, request.method, body, request.headers, state)
            if financial:
                status, data, lost = financial
                return route.abort('failed') if lost else respond(data, status)
            resolution = recovery_response(request.url, request.method, body, request.headers, state)
            if resolution:
                status, data, lost = resolution
                return route.abort('failed') if lost else respond(data, status)
            contract_result = contract_response(request.url, request.method, body, request.headers, state)
            if contract_result:
                status, data, lost = contract_result
                return route.abort('failed') if lost else respond(data, status)
            if customer_response(route, request, url, state, respond):
                return
            thumbnail = thumbnail_response(request.url, request.method)
            if thumbnail is not None:
                return respond(thumbnail)
            result = draft_response(request.url.removeprefix("https://mobile-api.example.invalid"), request.method, body, request.headers, state)
            if result:
                status, data, lost = result
                return route.abort("failed") if lost else respond(data, status)
            if "/catalogue/" in url.path:
                parts = url.path.split("/catalogue/")[1].split("/")
                kind = parts[0]
                def row(index):
                    saved = draft_record(index, state) if kind == "contracts" else None
                    if saved:
                        return saved
                    customer = draft_customer(index)
                    return {"id": index, "code": f"KH-QA-{index}" if kind == "customers" else f"QA-{index}", "name": customer["details"]["name"] if kind == "customers" else f"Xe QA {index}", "status": "active" if kind == "customers" else "ready", "storeId": 23, "storeName": "Cơ sở QA", "license": "", "vehicleName": "", "phone": customer["details"]["phone"], "startsAt": "", "endsAt": "", "totalAmount": None, "paidAmount": None, "brand": "", "color": "", "odometer": None}
                if len(parts) == 2:
                    return respond(row(int(parts[1])))
                rows = [row(index) for index in state.get("draft_profiles", {})] if kind == "contracts" else [row(index) for index in range(1, 24)]
                params = parse_qs(url.query)
                query = params.get("search", [""])[0].lower()
                rows = [item for item in rows if query in (item["name"] + item["code"]).lower()]
                status = params.get("status", ["all"])[0]
                if status != "all":
                    rows = [item for item in rows if item["status"] == status]
                size, page = int(params.get("size", ["20"])[0]), int(params.get("page", ["1"])[0])
                pages = max(1, math.ceil(len(rows) / size))
                return respond({"rows": rows[(page-1)*size:page*size], "total": len(rows), "page": page, "pages": pages, "statusCounts": [], "updatedAt": datetime.now(timezone.utc).isoformat()})
            raise AssertionError(f"Unexpected synthetic route: {url.path}")
        context.route("**/*", intercept)
        page = context.new_page()
        page.set_default_timeout(15000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        def button(name):
            return page.get_by_role("button", name=name, exact=True)
        def choose(label, value):
            button(label).click()
            button(value).click()
        def new_draft():
            button("Thêm bản nháp").click()
            expect(page.get_by_role("heading", name="1. Hợp đồng & pháp lý", exact=True)).to_be_visible()
        def draft_workflows():
            page.goto(base_url)
            page.get_by_role("textbox", name="Tài khoản", exact=True).fill("qa")
            page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
            button("Đăng nhập").click()
            page.get_by_role("tab", name="Hợp đồng", exact=True).click()
            new_draft()
            expect(button("Lưu nháp")).to_be_enabled()
            page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True).fill("90001")
            button("Nhân sự và nguồn khách").click()
            choose("Người làm hợp đồng", "QA Đại diện · Cơ sở QA")
            expect(page.get_by_role("textbox", name="Tên người làm hợp đồng", exact=True)).to_have_value("QA Đại diện")
            checks.append("The five-section composer follows web order and loads scoped options, rental times and staff attribution")

            button("Tiếp theo").click()
            button("Chọn hồ sơ khách").click()
            page.get_by_role("button", name=re.compile("^Chọn khách Khách hợp đồng QA,")).click()
            button("Dùng hồ sơ đã chọn").click()
            expect(page.get_by_role("textbox", name="Họ tên khách thuê", exact=True)).to_have_value("Khách hợp đồng QA")
            button("Giấy tờ của khách").click()
            page.get_by_label("Ngày cấp giấy tờ khách thuê", exact=True).fill("2020-10-31")
            button("Tiếp theo").click()
            page.get_by_label("Ngày nhận xe", exact=True).fill("2026-11-01")
            page.get_by_label("Giờ nhận xe", exact=True).fill("08:00")
            page.get_by_label("Ngày hẹn trả xe", exact=True).fill("2026-11-02")
            page.get_by_label("Giờ hẹn trả xe", exact=True).fill("18:00")
            button("Thêm xe vào bản nháp").click()
            button("Chọn xe QA-001").click()
            button("Thêm xe vào bản nháp").click()
            expect(button("Chọn xe QA-001")).to_be_disabled()
            button("Chọn xe QA-002").click()
            button("Kiểm tra lịch thuê").click()
            expect(page.get_by_text("Có hợp đồng chưa đóng", exact=True)).to_be_visible()
            expect(page.get_by_text("Chồng lịch xe đã cọc", exact=True)).to_be_visible()
            expect(page.get_by_text("QA-RENTAL · Kho QA khác", exact=False)).to_be_visible()
            checks.append("Customer selection confirms snapshot replacement; stock selection prevents duplicate vehicles and shows hard/deposit conflicts per vehicle")

            button("Tiếp theo").click()
            page.get_by_role("textbox", name="Đơn giá (VND)", exact=True).fill("500000")
            page.get_by_role("textbox", name="Tổng giá trị hợp đồng (VND)", exact=True).fill("1500000")
            button("Các khoản phí khác").click()
            button("Thêm khoản phí").click()
            page.get_by_role("textbox", name="Tên khoản phí 1", exact=True).fill("Phí giao QA")
            page.get_by_role("textbox", name="Số tiền khoản phí 1 (VND)", exact=True).fill("100000")
            button("Kỳ đóng tiền").click()
            button("Chỉnh lịch đóng tiền").click()
            button("Thêm kỳ đóng").click()
            page.get_by_label("Ngày đóng kỳ 1", exact=True).fill("2026-11-01")
            page.get_by_role("textbox", name="Số tiền kỳ 1 (VND)", exact=True).fill("800000")
            button("Đóng lịch đóng tiền").click()
            expect(page.get_by_text("Lịch riêng đã lưu: 0 kỳ.", exact=True)).to_be_visible()
            button("Chỉnh lịch đóng tiền").click()
            button("Thêm kỳ đóng").click()
            page.get_by_label("Ngày đóng kỳ 1", exact=True).fill("2026-11-01")
            page.get_by_role("textbox", name="Số tiền kỳ 1 (VND)", exact=True).fill("800000")
            button("Áp dụng lịch đóng tiền").click()
            expect(page.get_by_text("Lịch riêng đã lưu: 1 kỳ.", exact=True)).to_be_visible()
            page.get_by_role("textbox", name="Tổng giá trị hợp đồng (VND)", exact=True).fill("1x")
            button("Lưu nháp").click()
            expect(page.get_by_role("textbox", name="Tổng giá trị hợp đồng (VND)", exact=True)).to_have_value("1x")
            assert state["draft_creates"] == 0
            page.get_by_role("textbox", name="Tổng giá trị hợp đồng (VND)", exact=True).fill("1500000")
            button("Lưu nháp").click()
            expect(button("Tiếp tục soạn hợp đồng")).to_be_visible()
            saved = state["draft_profiles"][2001]["input"]["draft"]
            assert saved["staff_id"] == "501"
            assert saved["customer"]["id_card_issued_on"] == "2020-10-31"
            assert len(saved["vehicles"]) == 2 and saved["extra_charges"][0]["amount"] == "100000" and len(saved["custom_installments"]) == 1
            checks.append("Draft saving validates entered money, stages installment edits, preserves optional data and navigates to the saved contract")

            button("Tiếp tục soạn hợp đồng").click()
            button("Bước 5: Ký kết & ghi chú").click()
            page.get_by_role("textbox", name="Ghi chú bản nháp", exact=True).fill("Giữ thay đổi khi xung đột")
            state["draft_conflict"] = True
            button("Lưu nháp").click()
            expect(button("Tải bản nháp mới")).to_be_visible()
            expect(page.get_by_role("textbox", name="Ghi chú bản nháp", exact=True)).to_have_value("Giữ thay đổi khi xung đột")
            button("Tải bản nháp mới").click()
            button("Tiếp tục chỉnh sửa").click()
            expect(page.get_by_role("textbox", name="Ghi chú bản nháp", exact=True)).to_have_value("Giữ thay đổi khi xung đột")
            button("Tải bản nháp mới").click()
            page.get_by_role("dialog").get_by_role("button", name="Tải bản nháp mới", exact=True).click()
            expect(page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True)).to_have_value("99999")
            button("Bước 5: Ký kết & ghi chú").click()
            expect(page.get_by_role("textbox", name="Ghi chú bản nháp", exact=True)).to_have_value("")
            button("Bước 4: Chi phí").click()
            expect(page.get_by_text("Lịch riêng đã lưu: 1 kỳ.", exact=True)).to_be_visible()
            button("Bước 5: Ký kết & ghi chú").click()
            page.get_by_role("textbox", name="Ghi chú bản nháp", exact=True).fill("Cập nhật đã xác nhận")
            button("Lưu nháp").click()
            expect(button("Tiếp tục soạn hợp đồng")).to_be_visible()
            assert state["draft_updates"] == 1
            checks.append("Reopening preserves saved fees/schedules; revision conflicts retain edits until explicit reload confirmation")

            page.go_back()
            new_draft()
            page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True).fill("90003")
            button("Lưu nháp").click()
            expect(button("Kiểm tra lần lưu trước")).to_be_visible()
            expect(page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True)).to_have_value("90003")
            button("Lưu nháp").click()
            expect(button("Tiếp tục soạn hợp đồng")).to_be_visible()
            assert state["draft_creates"] == 2
            checks.append("A response lost after commit preserves input and retries with the same key without creating twice")

            page.go_back()
            new_draft()
            page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True).fill("90004")
            state["draft_lost_response"] = True
            button("Lưu nháp").click()
            expect(button("Kiểm tra lần lưu trước")).to_be_visible()
            page.go_back()
            button("Tiếp tục chỉnh sửa").click()
            expect(page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True)).to_have_value("90004")
            page.go_back()
            button("Rời bản nháp").click()
            new_draft()
            expect(page.get_by_text("Lần lưu trước đã thành công", exact=True)).to_be_visible()
            expect(button("Lưu nháp")).to_be_disabled()
            button("Xem bản nháp đã lưu").click()
            expect(button("Tiếp tục soạn hợp đồng")).to_be_visible()
            assert state["draft_creates"] == 3
            checks.append("Unsaved navigation supports cancel/discard; reopening recovers the committed receipt and prevents duplicate creation")

            page.go_back()
            new_draft()
            page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True).fill("90005")
            state["draft_lost_response"] = True
            button("Lưu nháp").click()
            expect(button("Kiểm tra lần lưu trước")).to_be_visible()
            committed = state["draft_creates"]
            state["expired"] = True
            button("Kiểm tra lần lưu trước").click()
            expect(button("Đăng nhập")).to_be_visible()
            state["user"]["id"] = 8
            page.get_by_role("textbox", name="Tài khoản", exact=True).fill("qa")
            page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
            button("Đăng nhập").click()
            page.get_by_role("tab", name="Hợp đồng", exact=True).click()
            new_draft()
            expect(button("Lưu nháp")).to_be_enabled()
            expect(page.get_by_text("Lần lưu trước đã thành công", exact=True)).to_have_count(0)
            page.go_back()
            page.get_by_role("tab", name="Tài khoản", exact=True).click()
            button("Đăng xuất").click()
            expect(button("Đăng nhập")).to_be_visible()
            state["user"]["id"] = 7
            page.get_by_role("textbox", name="Tài khoản", exact=True).fill("qa")
            page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
            button("Đăng nhập").click()
            page.get_by_role("tab", name="Hợp đồng", exact=True).click()
            new_draft()
            expect(page.get_by_text("Lần lưu trước đã thành công", exact=True)).to_be_visible()
            expect(button("Lưu nháp")).to_be_disabled()
            button("Xem bản nháp đã lưu").click()
            expect(button("Tiếp tục soạn hợp đồng")).to_be_visible()
            assert state["draft_creates"] == committed
            checks.append("A committed write survives session expiry, another actor's sign-in and logout; the original actor recovers its receipt without a duplicate")

            page.go_back()
            new_draft()
            button("Bước 2: Khách hàng").click()
            button("Chọn hồ sơ khách").click()
            button("Tra cứu chính xác").click()
            page.get_by_role("textbox", name="Số điện thoại, giấy tờ hoặc liên hệ", exact=True).fill("qa-contract-contact")
            button("Tra cứu hồ sơ").click()
            button("Chọn hồ sơ Khách hợp đồng QA").click()
            button("Dùng hồ sơ đã chọn").click()
            expect(page.get_by_role("textbox", name="Họ tên khách thuê", exact=True)).to_have_value("Khách hợp đồng QA")
            page.screenshot(path=str(output / "draft-exact-foreign-lookup.png"), full_page=True)
            checks.append("Exact company-wide lookup selects a foreign customer through explicit confirmation")
            for width, height, scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
                page.set_viewport_size({"width": width, "height": height})
                page.emulate_media(color_scheme=scheme)
                for index, title in enumerate(["Hợp đồng & pháp lý", "Khách hàng", "Phương tiện", "Chi phí", "Ký kết & ghi chú"]):
                    button(f"Bước {index+1}: {title}").click()
                    expect(button("Lưu nháp")).to_be_visible()
                    box = button("Lưu nháp").bounding_box()
                    assert box["height"] >= 48 and box["y"] + box["height"] <= height + 1
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
                    page.screenshot(path=str(output / f"draft-step-{index+1}-{width}-{scheme}.png"), full_page=True)
                checks.append(f"All five composer sections and the persistent save action fit {width}x{height} {scheme}")
        def inline_customer_workflows():
            page.go_back()
            if button("Rời bản nháp").count():
                button("Rời bản nháp").click()
            new_draft()
            page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True).fill("91001")
            button("Bước 3: Phương tiện").click()
            button("Thêm xe vào bản nháp").click()
            button("Chọn xe QA-003").click()
            button("Bước 4: Chi phí").click()
            page.get_by_role("textbox", name="Tổng giá trị hợp đồng (VND)", exact=True).fill("1250000")
            button("Bước 2: Khách hàng").click()
            button("Thêm khách trong hợp đồng").click()
            page.get_by_role("textbox", name="Họ và tên", exact=True).fill("Khách hủy thêm tại chỗ")
            button("Quay lại hợp đồng").click()
            button("Tiếp tục chỉnh sửa").click()
            expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_have_value("Khách hủy thêm tại chỗ")
            button("Quay lại hợp đồng").click()
            button("Rời biểu mẫu").click()
            expect(button("Thêm khách trong hợp đồng")).to_be_visible()
            assert state.get("customer_creates", 0) == 0
            checks.append("Inline customer cancellation confirms discard and returns to the same unsaved contract without a write")

            button("Thêm khách trong hợp đồng").click()
            page.get_by_role("textbox", name="Họ và tên", exact=True).fill("Khách mới trong hợp đồng")
            button("Lưu khách hàng").click()
            expect(page.get_by_text("Nhập địa chỉ khách hàng.", exact=True)).to_be_visible()
            assert state.get("customer_creates", 0) == 0
            choose("Trạng thái hồ sơ", "Chưa hoàn tất")
            state["customer_lost_response"] = True
            button("Lưu khách hàng").click()
            expect(button("Kiểm tra lần lưu trước")).to_be_visible()
            expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_have_value("Khách mới trong hợp đồng")
            assert state["customer_creates"] == 1
            button("Kiểm tra lần lưu trước").click()
            expect(button("Dùng khách hàng đã lưu")).to_be_visible()
            state["customer_selection_failure"] = True
            button("Dùng khách hàng đã lưu").click()
            expect(page.get_by_text("Synthetic selection temporarily unavailable", exact=True)).to_be_visible()
            expect(button("Lưu khách hàng")).to_be_disabled()
            assert state["customer_creates"] == 1
            button("Dùng khách hàng đã lưu").click()
            expect(page.get_by_role("textbox", name="Họ tên khách thuê", exact=True)).to_have_value("Khách mới trong hợp đồng")
            assert state["customer_creates"] == 1
            customer_id = state["profiles"][100]["id"]
            assert state["profiles"][100]["status"] == "draft"
            checks.append("Ordinary customers default to active validation; an explicitly incomplete create recovers a lost commit and a failed profile reload without duplicating the customer")
            button("Bước 1: Hợp đồng & pháp lý").click()
            expect(page.get_by_role("textbox", name="Số hợp đồng giấy", exact=True)).to_have_value("91001")
            button("Bước 4: Chi phí").click()
            expect(page.get_by_role("textbox", name="Tổng giá trị hợp đồng (VND)", exact=True)).to_have_value("1250000")
            before = state["draft_creates"]
            button("Lưu nháp").click()
            expect(button("Tiếp tục soạn hợp đồng")).to_be_visible()
            saved = state["draft_profiles"][2001 + before]["input"]["draft"]
            assert saved["customer_id"] == customer_id
            assert saved["vehicles"][0]["id"] == "303"
            assert saved["total_amount"] == "1250000" and saved["contract_number"] == "91001"
            assert len(set(state["customer_keys"])) == 1
            checks.append("The created customer's exact ID returns to the contract and saving preserves the chosen vehicle, contract number and money")

        try:
            if documents_only:
                run_document_workflows(page,state,base_url,output,checks)
            elif duplicates_only:
                run_duplicate_workflows(page,state,base_url,output,checks)
            elif recoveries_only:
                run_bad_debt_recovery_workflows(page,state,base_url,output,checks)
            elif swaps_only:
                run_swap_workflows(page,state,base_url,output,checks)
            elif returns_only:
                run_return_workflows(page,state,base_url,output,checks)
            elif collections_only:
                run_collection_workflows(page,state,base_url,output,checks)
            elif renewals_only:
                run_renewal_workflows(page,state,base_url,output,checks)
            elif finance_only:
                run_finance_workflows(page, state, base_url, output, checks)
            elif contracts_only:
                run_contract_workflows(page, state, base_url, output, checks)
            else:
                draft_workflows()
                inline_customer_workflows()
            assert not errors, errors
            assert not unexpected, unexpected
        except Exception as failure:
            failure_result = {
                "status": "failed", "completedGroups": len(checks), "checks": checks,
                "error": str(failure), "pageErrors": errors,
                "unexpectedHosts": unexpected, "operationalWrites": 0, "realLogins": 0,
                "completedAt": datetime.now(timezone.utc).isoformat(),
            }
            # Save the verdict before inspecting a possibly closed/crashed page.
            (output / "results.json").write_text(json.dumps(failure_result, ensure_ascii=False, indent=2), encoding="utf-8")
            try:
                page.screenshot(path=str(output / "failure.png"), full_page=True)
                (output / "failure.html").write_text(page.content(), encoding="utf-8")
                failure_result["mediaDark"] = page.evaluate("matchMedia('(prefers-color-scheme: dark)').matches")
            except Exception as evidence_error:
                failure_result["evidenceError"] = str(evidence_error)
            (output / "results.json").write_text(json.dumps(failure_result, ensure_ascii=False, indent=2), encoding="utf-8")
            raise
        finally:
            browser.close()
    result = {"status": "passed", "passed": len(checks), "checks": checks, "pageErrors": errors, "unexpectedHosts": unexpected, "operationalWrites": 0, "realLogins": 0, "completedAt": datetime.now(timezone.utc).isoformat()}
    (output / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8083")
    parser.add_argument("--output", type=Path, default=Path(".backups/mobile-draft-ui-20261101"))
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--contracts-only', action='store_true')
    mode.add_argument('--finance-only', action='store_true')
    mode.add_argument('--renewals-only', action='store_true')
    mode.add_argument('--collections-only', action='store_true')
    mode.add_argument('--returns-only', action='store_true')
    mode.add_argument('--swaps-only', action='store_true')
    mode.add_argument('--recoveries-only', action='store_true')
    mode.add_argument('--duplicates-only', action='store_true')
    mode.add_argument('--documents-only', action='store_true')
    args = parser.parse_args()
    run(args.url.rstrip("/"), args.output, args.contracts_only, args.finance_only, args.renewals_only, args.collections_only, args.returns_only, args.swaps_only, args.recoveries_only, args.duplicates_only, args.documents_only)
