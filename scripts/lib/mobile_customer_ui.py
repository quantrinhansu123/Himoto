"""Synthetic customer mutation responses and browser acceptance. No real API."""
from copy import deepcopy
import re
from playwright.sync_api import expect
from lib.mobile_customer_matches_fixture import duplicate_response


def profile(customer_id=1):
    return {"id": customer_id, "name": f"Khách QA {customer_id}", "phone": "0900000000", "email": "qa@example.invalid", "address": "Địa chỉ QA",
            "id_card": "001234567890", "customer_type": "vietnam", "nationality": "", "contact_channel": "", "contact_detail": "",
            "store_id": 23, "status": "active", "warning_note": "", "driver_license_number": "", "driver_license_issued_on": "",
            "id_card_issued_on": "", "id_card_issued_by": "", "relatives": [], "revision": "100"}


def customer_response(route, request, url, state, respond):
    if not url.path.startswith("/api/mobile/v1/customers"):
        return False
    result = duplicate_response(request.url, request.method, request.post_data_json if request.post_data else {}, request.headers, state)
    if result:
        status, data, lost = result
        if lost: route.abort("failed")
        else: respond(data, status)
        return True
    profiles = state.setdefault("profiles", {})
    receipts = state.setdefault("receipts", {})
    state.setdefault("customer_creates", 0)
    state.setdefault("customer_keys", [])
    parts = url.path.removeprefix("/api/mobile/v1/customers").strip("/").split("/")
    if request.method == "GET" and parts[0] == "requests":
        respond({"receipt": receipts.get(parts[1], {}).get("receipt")})
    elif request.method == "GET":
        customer_id = int(parts[0])
        respond(profiles.get(customer_id, profile(customer_id)))
    elif request.method in ("POST", "PATCH"):
        body = request.post_data_json
        key = request.headers.get("idempotency-key", "")
        state["customer_keys"].append(key)
        if not key:
            respond({"message": "Thiếu mã lần lưu.", "code": "INVALID_REQUEST_KEY"}, 400)
            return True
        if key in state.get("tombstones", {}):
            respond({"message": "QA request cancelled", "code": "REQUEST_CANCELLED"}, 409)
            return True
        if key in receipts:
            if receipts[key]["body"] != body:
                respond({"message": "Lần lưu trước có nội dung khác.", "code": "REQUEST_KEY_REUSED"}, 409)
            else:
                respond({**receipts[key]["receipt"], "replayed": True})
            return True
        customer_id = 100 + state["customer_creates"] if request.method == "POST" else int(parts[0])
        existing = profiles.get(customer_id, profile(customer_id))
        if state.pop("customer_conflict", False):
            profiles[customer_id] = {**existing, "name": "Tên mới từ máy chủ", "revision": "102"}
            respond({"message": "Hồ sơ đã được thay đổi. Tải lại để xem thông tin mới trước khi lưu.", "code": "CUSTOMER_CONFLICT"}, 409)
            return True
        if request.method == "PATCH" and body.get("revision") != existing["revision"]:
            respond({"message": "Hồ sơ đã được thay đổi.", "code": "CUSTOMER_CONFLICT"}, 409)
            return True
        revision = "100" if request.method == "POST" else str(int(existing["revision"]) + 1)
        profiles[customer_id] = {**deepcopy(body), "id": customer_id, "revision": revision}
        receipt = {"id": customer_id, "revision": revision, "replayed": False}
        receipts[key] = {"receipt": receipt, "body": deepcopy(body), "operation": "customer.create" if request.method == "POST" else f"customer.update:{customer_id}"}
        if request.method == "POST":
            state["customer_creates"] += 1
        if state.pop("customer_lost_response", False):
            route.abort("failed")
        else:
            respond(receipt, 201 if request.method == "POST" else 200)
    else:
        raise AssertionError(f"Unexpected customer request: {request.method} {url.path}")
    return True


def run_customer_checks(page, state, output, checks, user):
    page.get_by_role("tab", name="Tài khoản").click()
    page.get_by_role("button", name="Đăng xuất", exact=True).click()
    state["user"] = {**user, "permissions": ["vehicles.read", "customers.read", "customers.write"]}
    page.get_by_role("textbox", name="Tài khoản", exact=True).fill("writer")
    page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
    page.get_by_role("button", name="Đăng nhập").click()
    page.get_by_role("button", name="Mở Khách hàng").click()
    page.wait_for_url(re.compile(r"/customers/?$"))
    expect(page.get_by_role("textbox", name="Tìm khách hàng", exact=True)).to_be_visible()
    page.get_by_role("button", name="Thêm khách hàng", exact=True).click()
    expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_be_visible()
    page.get_by_role("button", name="Lưu khách hàng", exact=True).click()
    expect(page.get_by_text("Nhập họ và tên khách hàng.", exact=True)).to_be_visible()
    page.get_by_role("button", name="Trạng thái hồ sơ", exact=True).click()
    page.get_by_role("button", name="Chưa hoàn tất", exact=True).click()
    page.get_by_role("textbox", name="Họ và tên", exact=True).fill("Khách tạo trên app")
    page.get_by_role("textbox", name="Số điện thoại", exact=True).fill("0901122334")
    documents = page.get_by_role("button", name="Giấy tờ", exact=True)
    if documents.get_attribute("aria-expanded") != "true":
        documents.click()
    page.get_by_label("Ngày cấp giấy tờ", exact=True).fill("2020-10-31")
    page.get_by_role("button", name="Người thân", exact=True).click()
    page.get_by_role("button", name="Thêm người thân", exact=True).click()
    page.get_by_role("textbox", name="Họ tên người thân 1", exact=True).fill("Người thân QA")
    page.get_by_role("textbox", name="Điện thoại người thân 1", exact=True).fill("0902233445")
    page.screenshot(path=str(output / "customer-create-375.png"), full_page=True)
    page.get_by_role("button", name="Lưu khách hàng", exact=True).click()
    expect(page.get_by_role("heading", name="Khách tạo trên app", exact=True)).to_be_visible()
    assert state["customer_creates"] == 1
    checks.append("Customer creation validates required fields and saves incomplete profiles with optional dates/relatives")

    page.get_by_role("button", name="Sửa hồ sơ khách hàng", exact=True).click()
    expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_have_value("Khách tạo trên app")
    page.get_by_role("textbox", name="Email", exact=True).fill("updated@example.invalid")
    page.get_by_role("button", name="Lưu thay đổi", exact=True).click()
    expect(page.get_by_role("heading", name="Khách tạo trên app", exact=True)).to_be_visible()
    assert state["profiles"][100]["email"] == "updated@example.invalid"
    assert state["profiles"][100]["relatives"][0]["name"] == "Người thân QA"
    checks.append("The editor loads the saved profile, updates email and preserves optional relatives/documents")

    page.get_by_role("button", name="Sửa hồ sơ khách hàng", exact=True).click()
    page.get_by_role("textbox", name="Họ và tên", exact=True).fill("Tên đang nhập")
    state["customer_conflict"] = True
    page.get_by_role("button", name="Lưu thay đổi", exact=True).click()
    expect(page.get_by_role("button", name="Tải bản mới", exact=True)).to_be_visible()
    expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_have_value("Tên đang nhập")
    page.get_by_role("button", name="Tải bản mới", exact=True).click()
    page.get_by_role("button", name="Tiếp tục chỉnh sửa", exact=True).click()
    expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_have_value("Tên đang nhập")
    page.get_by_role("button", name="Tải bản mới", exact=True).click()
    page.get_by_role("button", name="Tải bản mới", exact=True).last.click()
    expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_have_value("Tên mới từ máy chủ")
    checks.append("Revision conflicts preserve edits and require confirmation before replacing them with the server version")

    page.go_back()
    page.go_back()
    page.get_by_role("tab", name="Khách hàng").click()
    page.get_by_role("button", name="Thêm khách hàng", exact=True).click()
    page.get_by_role("button", name="Trạng thái hồ sơ", exact=True).click()
    page.get_by_role("button", name="Chưa hoàn tất", exact=True).click()
    page.get_by_role("textbox", name="Họ và tên", exact=True).fill("Khách mất phản hồi")
    before = state["customer_creates"]
    key_start = len(state["customer_keys"])
    state["customer_lost_response"] = True
    page.get_by_role("button", name="Lưu khách hàng", exact=True).click()
    expect(page.get_by_role("button", name="Kiểm tra lần lưu trước", exact=True)).to_be_visible()
    expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_have_value("Khách mất phản hồi")
    page.get_by_role("button", name="Lưu khách hàng", exact=True).click()
    expect(page.get_by_role("heading", name="Khách mất phản hồi", exact=True)).to_be_visible()
    assert state["customer_creates"] == before + 1
    assert len(set(state["customer_keys"][key_start:])) == 1
    checks.append("A response lost after commit preserves form input and retry uses the same key without creating a duplicate")

    page.go_back()
    page.get_by_role("tab", name="Khách hàng").click()
    page.get_by_role("button", name="Thêm khách hàng", exact=True).click()
    page.get_by_role("button", name="Trạng thái hồ sơ", exact=True).click()
    page.get_by_role("button", name="Chưa hoàn tất", exact=True).click()
    page.get_by_role("textbox", name="Họ và tên", exact=True).fill("Khách phục hồi")
    state["customer_lost_response"] = True
    page.get_by_role("button", name="Lưu khách hàng", exact=True).click()
    expect(page.get_by_role("button", name="Kiểm tra lần lưu trước", exact=True)).to_be_visible()
    page.go_back()
    expect(page.get_by_role("button", name="Tiếp tục chỉnh sửa", exact=True)).to_be_visible()
    page.get_by_role("button", name="Tiếp tục chỉnh sửa", exact=True).click()
    expect(page.get_by_role("textbox", name="Họ và tên", exact=True)).to_have_value("Khách phục hồi")
    page.go_back()
    page.get_by_role("button", name="Rời biểu mẫu", exact=True).click()
    page.get_by_role("button", name="Thêm khách hàng", exact=True).click()
    expect(page.get_by_text("Lần lưu trước đã thành công", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Lưu khách hàng", exact=True)).to_be_disabled()
    page.get_by_role("button", name="Xem hồ sơ đã lưu", exact=True).click()
    expect(page.get_by_role("heading", name="Khách phục hồi", exact=True)).to_be_visible()
    checks.append("Unsaved navigation supports cancel/discard; reopening recovers the previous committed result and blocks duplicate creation")

    page.go_back()
    page.get_by_role("button", name="Thêm khách hàng", exact=True).click()
    page.get_by_role("button", name="Loại khách hàng", exact=True).click()
    page.get_by_role("button", name="Khách nước ngoài", exact=True).click()
    page.get_by_role("button", name="Trạng thái hồ sơ", exact=True).click()
    page.get_by_role("button", name="Chưa hoàn tất", exact=True).click()
    page.get_by_role("textbox", name="Họ và tên", exact=True).fill("Khách quốc tế QA")
    page.get_by_role("button", name="Lưu khách hàng", exact=True).click()
    expect(page.get_by_text("Nhập điện thoại hoặc thông tin liên hệ.", exact=True)).to_be_visible()
    page.get_by_role("textbox", name="Kênh liên hệ", exact=True).fill("WeChat")
    page.get_by_role("textbox", name="Thông tin liên hệ", exact=True).fill("wechat-qa-contact")
    page.get_by_role("button", name="Lưu khách hàng", exact=True).click()
    expect(page.get_by_role("heading", name="Khách quốc tế QA", exact=True)).to_be_visible()
    expect(page.get_by_text("wechat-qa-contact", exact=True)).to_be_visible()
    checks.append("Foreign customer forms require a contact channel and show the saved contact even without a phone number")

    page.go_back()
    page.get_by_role("button", name="Thêm khách hàng", exact=True).click()
    for width, height, scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
        page.set_viewport_size({"width": width, "height": height})
        page.emulate_media(color_scheme=scheme)
        save = page.get_by_role("button", name="Lưu khách hàng", exact=True)
        expect(save).to_be_visible()
        assert save.bounding_box()["height"] >= 48
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=str(output / f"customer-form-{width}-{scheme}.png"), full_page=True)
        checks.append(f"Customer form and persistent save action fit {width}x{height} {scheme}")
