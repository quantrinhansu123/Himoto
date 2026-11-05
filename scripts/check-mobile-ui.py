"""Browser UI regression for Expo Web using synthetic API responses only.

Build with EXPO_PUBLIC_API_URL=https://mobile-api.example.invalid, then serve
mobile/.expo/web-preview locally. This never logs in to a real Himoto service.
"""
import argparse
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright
from lib.mobile_customer_ui import customer_response, run_customer_checks
from lib.mobile_catalogue_media_fixture import thumbnail_response

TOKEN = "hm1_" + "a" * 43
USER = {"id": 7, "name": "QA Quản lý", "email": "qa@example.invalid", "role": "branch_manager",
        "permissions": ["vehicles.read", "contracts.read", "customers.read"], "storeId": 23, "allStores": False}
EXPIRY = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
STORES = [{"id": 23, "name": "Cơ sở QA"}, {"id": 24, "name": "Cơ sở đối chiếu"}]


def record(kind, index):
    return {"id": index, "code": f"HD-QA-{index:03d}" if kind == "contracts" else f"QA-{index:03d}",
            "name": f"Khách QA {index}" if kind != "vehicles" else f"Xe QA {index}", "status": "ready" if kind == "vehicles" else "renting" if kind == "contracts" else "active",
            "storeId": 23, "storeName": "Cơ sở QA", "license": f"QA-{index:03d}" if kind != "customers" else "",
            "vehicleName": "Xe kiểm tra", "phone": "0900000000" if kind != "vehicles" else "", "startsAt": "2026-10-30T08:00:00+07:00",
            "endsAt": "2026-12-02T08:00:00+07:00", "totalAmount": 500000 if kind == "contracts" else None,
            "paidAmount": 100000 if kind == "contracts" else None, "brand": "QA", "color": "Đỏ", "odometer": 1234}


def run(base_url, output):
    output.mkdir(parents=True, exist_ok=True)
    checks = []
    errors = []
    unexpected = []
    calls = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height, scheme in [(375, 812, "light"), (430, 932, "dark"), (812, 375, "light"), (1024, 768, "dark")]:
            context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme, reduced_motion="reduce")
            state = {"unauthorized": False, "network_failure": False, "user": dict(USER)}

            def intercept(route):
                request = route.request
                url = urlparse(request.url)
                if url.netloc == urlparse(base_url).netloc:
                    route.continue_()
                    return
                if url.hostname != "mobile-api.example.invalid":
                    unexpected.append(url.hostname)
                    route.abort()
                    return
                headers = {"Access-Control-Allow-Origin": base_url.rstrip("/"), "Access-Control-Allow-Headers": "authorization,content-type,idempotency-key", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"}
                if request.method == "OPTIONS":
                    route.fulfill(status=204, headers=headers)
                    return
                calls.append({"path": url.path, "method": request.method,"query":parse_qs(url.query)})

                def respond(data, status=200):
                    route.fulfill(status=status, headers=headers, json=data)

                if state["unauthorized"]:
                    respond({"message": "Phiên đã hết hạn.", "code": "SESSION_EXPIRED"}, 401)
                    return
                thumbnail = thumbnail_response(request.url, request.method)
                if thumbnail is not None:
                    respond(thumbnail)
                    return
                if customer_response(route, request, url, state, respond):
                    return
                if url.path.endswith("/session"):
                    if request.method == "POST":
                        body = request.post_data_json
                        if body["password"] != "fixture-password":
                            respond({"message": "Email hoặc mật khẩu không chính xác.", "code": "LOGIN_FAILED"}, 401)
                        else:
                            if body["email"] == "viewer":
                                state["user"] = {**USER, "permissions": ["vehicles.read"], "role": "hr"}
                            respond({"token": TOKEN, "expiresAt": EXPIRY, "user": state["user"]}, 201)
                    elif request.method == "DELETE":
                        respond({"success": True})
                    else:
                        respond({"user": state["user"], "expiresAt": EXPIRY})
                elif url.path.endswith("/workspace"):
                    respond({"user": state["user"], "stores": STORES})
                elif request.method == 'GET' and re.fullmatch(r'/api/mobile/v1/contracts/[1-9][0-9]*/approval',url.path):
                    respond({'id':int(url.path.split('/')[-2]),'approval':None})
                elif request.method == 'GET' and re.fullmatch(r'/api/mobile/v1/vehicles/[1-9][0-9]*',url.path):
                    index=int(url.path.rsplit('/',1)[1]);assert 1<=index<=23
                    row=record('vehicles',index)
                    values={key:row[key]for key in ['name','license','brand','status','color','odometer']}
                    values.update(type='motorbike',year=None,store_id=23,chassis='',engine='',note='',revision='1')
                    respond({'id':index,'revision':'1','values':values,'storeName':'Cơ sở QA','ownerStoreId':23,
                             'ownerStoreName':'Cơ sở QA','typeLabel':'Xe máy','hasOpenContract':False,'inTransit':False,'canEdit':False})
                elif "/catalogue/" in url.path:
                    if state["network_failure"]:
                        route.abort("failed")
                        return
                    parts = url.path.split("/catalogue/")[1].split("/")
                    kind = parts[0]
                    if len(parts) > 1:
                        row = record(kind, int(parts[1]))
                        saved = state.get("profiles", {}).get(int(parts[1])) if kind == "customers" else None
                        if saved:
                            row.update({"name": saved["name"], "phone": saved["phone"], "status": "bad_debt" if saved["status"] == "blacklist" else saved["status"]})
                            row.update({"email": saved["email"], "address": saved["address"], "contactChannel": saved["contact_channel"], "contactDetail": saved["contact_detail"], "customerNote": saved["warning_note"]})
                        respond(row)
                        return
                    params = parse_qs(url.query)
                    rows = [record(kind, index) for index in range(1, 24)]
                    search = params.get("search", [""])[0].lower()
                    status = params.get("status", [""])[0]
                    store = params.get("store", ["all"])[0]
                    if kind=='contracts' and params.get('scope')==['overdue']:
                        rows=[]  # This dataset contains only future, non-overdue rentals.
                    if search:
                        rows = [row for row in rows if search in (row["name"] + row["code"] + row["license"]).lower()]
                    if status:
                        rows = [row for row in rows if row["status"] == status]
                    if store == "24":
                        rows = []
                    size = int(params.get("size", ["20"])[0])
                    pages = max(1, math.ceil(len(rows) / size))
                    page = min(int(params.get("page", ["1"])[0]), pages)
                    respond({"rows": rows[(page - 1) * size:page * size], "total": len(rows), "page": page, "pages": pages,
                             "statusCounts": [], "updatedAt": datetime.now(timezone.utc).isoformat()})
                else:
                    raise AssertionError(f"Unexpected fixture endpoint: {url.path}")

            context.route("**/*", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base_url, wait_until="networkidle")
            expect(page.get_by_role("heading", name="Đăng nhập", exact=True)).to_be_visible()
            expect(page.get_by_role("textbox", name="Tài khoản", exact=True)).to_be_visible()
            page.screenshot(path=str(output / f"login-{width}-{scheme}.png"), full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            checks.append(f"Login fits {width}x{height} {scheme}, reduced motion")

            page.get_by_role("textbox", name="Tài khoản", exact=True).fill("qa")
            page.get_by_label("Mật khẩu", exact=True).fill("wrong-password")
            page.get_by_role("button", name="Đăng nhập").click()
            expect(page.get_by_text("Email hoặc mật khẩu không chính xác.", exact=True)).to_be_visible()
            expect(page.get_by_role("textbox", name="Tài khoản", exact=True)).to_have_value("qa")
            page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
            page.get_by_role("button", name="Đăng nhập").click()
            expect(page.get_by_text("QA Quản lý", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Mở Đội xe")).to_be_visible()
            for tab in page.get_by_role("tab").all():
                box = tab.bounding_box()
                assert box and box["height"] >= 48 and box["y"] + box["height"] <= height + 1, f"Bottom navigation must remain inside the viewport with usable touch targets: {box} at {width}x{height}"
            page.screenshot(path=str(output / f"overview-{width}-{scheme}.png"), full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            checks.append(f"Invalid credentials preserve input; login and overview work at {width}")

            page.get_by_role("button", name="Mở Đội xe").click()
            expect(page.get_by_role("textbox", name="Tìm đội xe", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Xem QA-001, Xe QA 1", exact=True)).to_be_visible()
            page.screenshot(path=str(output / f"vehicles-{width}-{scheme}.png"), full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            checks.append(f"Fleet catalogue fits {width}x{height} {scheme}")
            page.get_by_role("button", name="Bộ lọc", exact=True).click()
            expect(page.get_by_role("heading", name="Lọc danh sách", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Áp dụng", exact=True)).to_be_visible()
            page.screenshot(path=str(output / f"filters-{width}-{scheme}.png"), full_page=True)
            page.get_by_role("textbox", name="Tìm cơ sở", exact=True).scroll_into_view_if_needed()
            expect(page.get_by_role("textbox", name="Tìm cơ sở", exact=True)).to_be_visible()
            page.get_by_role("button", name="Cơ sở đối chiếu", exact=True).scroll_into_view_if_needed()
            expect(page.get_by_role("button", name="Cơ sở đối chiếu", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Áp dụng", exact=True)).to_be_visible()
            page.get_by_role("button", name="Đóng", exact=True).click()
            checks.append(f"Complete filters and Apply/Close actions fit {width}x{height} {scheme}")

            if width == 375:
                search = page.get_by_role("textbox", name="Tìm đội xe", exact=True)
                search.fill("QA-023")
                expect(page.get_by_role("button", name="Xem QA-023, Xe QA 23", exact=True)).to_be_visible()
                page.get_by_role("button", name="Xem QA-023, Xe QA 23", exact=True).click()
                expect(page.get_by_text("Hãng xe", exact=True)).to_be_visible()
                expect(page.get_by_text("Đỏ", exact=True)).to_be_visible()
                page.screenshot(path=str(output / "vehicle-detail-375.png"), full_page=True)
                page.go_back()
                expect(search).to_be_visible()
                search.fill("khong-ton-tai")
                expect(page.get_by_text("Không có kết quả", exact=True)).to_be_visible()
                search.fill("")
                expect(page.get_by_role("button", name="Xem QA-001, Xe QA 1", exact=True)).to_be_visible()
                checks.append("Search, empty results, detail navigation and back preserve the catalogue")

                page.get_by_text("Cuộn để xem thêm", exact=True).scroll_into_view_if_needed()
                expect(page.get_by_text("Đã hiển thị hết kết quả", exact=True)).to_be_attached()
                expect(page.get_by_role("button", name="Xem QA-023, Xe QA 23", exact=True)).to_be_attached()
                expect(search).to_be_visible()
                search.scroll_into_view_if_needed()
                checks.append("Infinite pagination appends the final page without dropping previous records")

                page.get_by_role("button", name="Bộ lọc", exact=True).click()
                page.get_by_role("button", name="Bảo dưỡng", exact=True).click()
                page.get_by_role("button", name="Đóng", exact=True).click()
                expect(page.get_by_role("button", name="Xem QA-001, Xe QA 1", exact=True)).to_be_visible()
                page.get_by_role("button", name="Bộ lọc", exact=True).click()
                page.get_by_role("button", name="Bảo dưỡng", exact=True).click()
                page.get_by_role("button", name="Áp dụng", exact=True).click()
                expect(page.get_by_text("Không có kết quả", exact=True)).to_be_visible()
                page.get_by_role("button", name="Tất cả", exact=True).click()
                page.get_by_role("button", name="Bộ lọc", exact=True).click()
                page.get_by_role("textbox", name="Tìm cơ sở", exact=True).fill("doi chieu")
                page.get_by_role("button", name="Cơ sở đối chiếu", exact=True).click()
                page.get_by_role("button", name="Áp dụng", exact=True).click()
                expect(page.get_by_text("Không có kết quả", exact=True)).to_be_visible()
                page.get_by_role("button", name="Bộ lọc, 1 đang áp dụng", exact=True).click()
                page.get_by_role("button", name="Toàn bộ cơ sở", exact=True).click()
                page.get_by_role("button", name="Áp dụng", exact=True).click()
                checks.append("Status and store filters request fresh data and show empty states")
                checks.append("Filter sheet stages changes until Apply, supports cancellation and accent-insensitive store search")

                state["network_failure"] = True
                page.get_by_role("button", name="Lưu kho", exact=True).click()
                expect(page.get_by_text("Chưa tải được dữ liệu", exact=True)).to_be_visible()
                state["network_failure"] = False
                page.get_by_role("button", name="Thử lại", exact=True).click()
                expect(page.get_by_role("button", name="Xem QA-001, Xe QA 1", exact=True)).to_be_visible()
                checks.append("Network failure shows a retry action and recovers without restarting the app")

                page.get_by_role("tab", name="Hợp đồng").click()
                expect(page.get_by_role("button", name="Xem HD-QA-001, Khách QA 1", exact=True)).to_be_visible()
                page.get_by_role("button", name="Xem HD-QA-001, Khách QA 1", exact=True).click()
                expect(page.get_by_text("Giá trị hợp đồng", exact=True)).to_be_visible()
                expect(page.get_by_text("Tiền thuê đã ghi nhận", exact=True)).to_be_visible()
                page.go_back()
                page.get_by_role("tab", name="Khách hàng").click()
                expect(page.get_by_role("textbox", name="Tìm khách hàng", exact=True)).to_be_visible()
                page.get_by_role("tab", name="Tổng quan").click()
                page.get_by_role("button", name="Hợp đồng quá hạn", exact=True).click()
                page.wait_for_url('**/contracts-workspace/overdue')
                expect(page.get_by_role('heading',name='Hợp đồng quá hạn',exact=True).last).to_be_visible()
                expect(page.get_by_text("Không có kết quả", exact=True)).to_be_visible()
                assert any(call['path'].endswith('/catalogue/contracts')and call['query'].get('scope')==['overdue']for call in calls)
                page.go_back()
                expect(page.get_by_role('tab',name='Tổng quan',exact=True)).to_be_visible()
                page.get_by_role("tab", name="Tổng quan").click()
                page.get_by_role("button", name="Xe lưu kho", exact=True).click()
                expect(page.get_by_role("button", name="Lưu kho", exact=True)).to_have_attribute("aria-selected", "true")
                expect(page.get_by_role("button", name="Xem QA-001, Xe QA 1", exact=True)).to_be_visible()
                checks.append("Overview shortcuts open the correct catalogue with the requested status selected")
                page.get_by_role("tab", name="Tài khoản").click()
                expect(page.get_by_text("Phiên làm việc đến", exact=True)).to_be_visible()
                page.get_by_role("button", name="Đăng xuất", exact=True).click()
                try:
                    expect(page.get_by_role("heading", name="Đăng nhập", exact=True)).to_be_visible()
                except AssertionError:
                    page.screenshot(path=str(output / "failure-logout.png"), full_page=True)
                    print(json.dumps({"errors": errors, "body": page.locator("body").inner_text()[:2000], "lastCalls": calls[-8:]}, ensure_ascii=False))
                    raise
                checks.append("Contract/customer navigation, scoped account and server logout work")

                page.get_by_role("textbox", name="Tài khoản", exact=True).fill("viewer")
                page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
                page.get_by_role("button", name="Đăng nhập").click()
                expect(page.get_by_role("button", name="Mở Đội xe")).to_be_visible()
                expect(page.get_by_role("tab", name="Hợp đồng")).to_have_count(0)
                expect(page.get_by_role("tab", name="Khách hàng")).to_have_count(0)
                state["unauthorized"] = True
                page.get_by_role("button", name="Mở Đội xe").click()
                try:
                    expect(page.get_by_role("heading", name="Đăng nhập", exact=True)).to_be_visible()
                except AssertionError:
                    page.screenshot(path=str(output / "failure-expired-session.png"), full_page=True)
                    print(json.dumps({"errors": errors, "body": page.locator("body").inner_text()[:2000], "lastCalls": calls[-8:]}, ensure_ascii=False))
                    raise
                checks.append("Restricted roles hide inaccessible modules; server 401 returns to login")
                state["unauthorized"] = False
                state["user"] = {**USER, "permissions": ["customers.read"]}
                page.get_by_role("textbox", name="Tài khoản", exact=True).fill("qa")
                page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
                page.get_by_role("button", name="Đăng nhập").click()
                expect(page.get_by_role("button", name="Mở Khách hàng")).to_be_visible()
                expect(page.get_by_role("tab", name="Đội xe")).to_have_count(0)
                expect(page.get_by_role("tab", name="Hợp đồng")).to_have_count(0)
                expect(page.get_by_role("tab", name="Khách hàng")).to_be_visible()
                checks.append("Customer-only access also hides the fleet tab and keeps the permitted module available")
                run_customer_checks(page, state, output, checks, USER)
            context.close()
        browser.close()
    assert not errors, errors
    assert not unexpected, unexpected
    result = {"passed": len(checks), "checks": checks, "pageErrors": errors, "unexpectedHosts": unexpected,
              "fixtureRequests": len(calls), "realLogins": 0, "operationalWrites": 0}
    (output / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8083")
    parser.add_argument("--output", type=Path, default=Path(".backups/mobile-ui-20261031"))
    args = parser.parse_args()
    run(args.url.rstrip("/"), args.output)
