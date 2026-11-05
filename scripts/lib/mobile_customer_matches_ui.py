"""Focused duplicate-customer acceptance against synthetic, intercepted API."""
from copy import deepcopy
from playwright.sync_api import expect
from lib.mobile_customer_matches_fixture import seed_duplicates


def run_duplicate_workflows(page, state, base_url, output, checks):
    seed_duplicates(state)
    button = lambda label: page.get_by_role("button", name=label, exact=True)
    field = lambda label: page.get_by_role("textbox", name=label, exact=True)
    def choose(label, value):
        button(label).click()
        button(value).click()
    def open_form():
        button("Bước 2: Khách hàng").click()
        button("Thêm khách trong hợp đồng").click()
        field("Họ và tên").fill("DuplicateInputQA")
        field("Số điện thoại").fill("0901111111")
        choose("Trạng thái hồ sơ", "Chưa hoàn tất")
        if button("Giấy tờ").get_attribute('aria-expanded') != 'true': button("Giấy tờ").click()
        field("Số CCCD/CMND").fill("001234567890")
        button("Lưu khách hàng").click()
        expect(button("Dùng khách hàng #501")).to_be_visible()
    def new_contract(number):
        button("Thêm bản nháp").click()
        field("Số hợp đồng giấy").fill(number)
        button("Bước 3: Phương tiện").click()
        button("Thêm xe vào bản nháp").click()
        button("Chọn xe QA-003").click()
        button("Bước 4: Chi phí").click()
        field("Tổng giá trị hợp đồng (VND)").fill("1250000")
    def leave_contract():
        page.go_back()
        if button("Rời bản nháp").count(): button("Rời bản nháp").click()
        expect(button("Thêm bản nháp")).to_be_visible()
    page.goto(base_url)
    field("Tài khoản").fill("qa")
    page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
    button("Đăng nhập").click()
    page.get_by_role("tab", name="Hợp đồng", exact=True).click()
    new_contract("92001")
    open_form()
    assert state.get("customer_creates", 0) == 0
    first_key = state["customer_keys"][-1]
    button("Đi tới khách hàng #502").click()
    expect(page.get_by_role("heading", name="Khách hàng #502", exact=True)).to_be_visible()
    expect(button("Sửa hồ sơ khách này")).to_have_count(0)
    button("Quay lại biểu mẫu").click()
    expect(field("Họ và tên")).to_have_value("DuplicateInputQA")
    checks.append("Duplicate creation opens exact matches; foreign-branch details are read-only and returning preserves the create form")
    # A resolver failure must leave the pending UUID intact, then a failed fresh
    # lookup must preserve the form after durable cancellation of that UUID.
    state["resolve_unavailable"] = True
    button("Dùng khách hàng #502").click()
    expect(page.get_by_text("Chưa kết nối được máy chủ đối chiếu.", exact=True)).to_be_visible()
    assert first_key not in state.get("tombstones", {})
    state["matches_unavailable"] = True
    button("Dùng khách hàng #502").click()
    expect(page.get_by_text("QA chưa tra cứu được hồ sơ trùng.", exact=True)).to_be_visible()
    assert state["tombstones"][first_key] == "customer.create"
    expect(field("Họ và tên")).to_have_value("DuplicateInputQA")
    button("Dùng khách hàng #502").click()
    expect(field("Họ tên khách thuê")).to_have_value("OtherQA")
    assert state.get("customer_creates", 0) == 0
    checks.append("Resolver and fresh-lookup failures preserve input; choosing existing cancels the old UUID before binding the foreign customer")
    button("Bước 1: Hợp đồng & pháp lý").click()
    expect(field("Số hợp đồng giấy")).to_have_value("92001")
    button("Bước 4: Chi phí").click()
    expect(field("Tổng giá trị hợp đồng (VND)")).to_have_value("1250000")
    button("Lưu nháp").click()
    expect(button("Tiếp tục soạn hợp đồng")).to_be_visible()
    saved = state["draft_profiles"][2001]["input"]["draft"]
    assert saved["customer_id"] == 502 and saved["vehicles"][0]["id"] == "303"
    assert saved["total_amount"] == "1250000" and saved["contract_number"] == "92001"
    checks.append("Using an existing customer creates no customer and retains exact contract ID, vehicle and money on draft save")
    leave_contract()
    new_contract("92002")
    open_form()
    button("Đi tới khách hàng #501").click()
    button("Sửa hồ sơ khách này").click()
    expect(page.get_by_role("heading", name="Sửa hồ sơ khách đã có", exact=True)).to_be_visible()
    field("Họ và tên").fill("CancelledEditQA")
    button("Quay lại hồ sơ trùng").click()
    button("Tiếp tục chỉnh sửa").click()
    expect(field("Họ và tên")).to_have_value("CancelledEditQA")
    button("Quay lại hồ sơ trùng").click()
    button("Rời biểu mẫu").click()
    expect(button("Sửa hồ sơ khách này")).to_be_visible()
    assert state["customer_updates"] == 0
    button("Sửa hồ sơ khách này").click()
    field("Họ và tên").fill("LocalEditedQA")
    state["mode"] = "update-lost"
    button("Lưu thay đổi").click()
    expect(button("Kiểm tra lần lưu trước")).to_be_visible()
    assert state["customer_updates"] == 1
    button("Kiểm tra lần lưu trước").click()
    expect(button("Xem hồ sơ đã lưu")).to_be_visible()
    button("Xem hồ sơ đã lưu").click()
    expect(field("Họ tên khách thuê")).to_have_value("LocalEditedQA")
    assert state["customer_updates"] == 1
    checks.append("Scoped duplicate editing supports guarded cancel and lost-response recovery; updated snapshot returns to the same contract once")
    leave_contract()
    new_contract("92003")
    open_form()
    # Simulate an original response arriving after the duplicate list opened.
    late_key = state["customer_keys"][-1]
    late = deepcopy(state["duplicate_profiles"][501])
    late.update(id=100, name="OriginalCommitQA", id_card="001234567899")
    state.setdefault("profiles", {})[100] = late
    state["customer_creates"] = 1
    state["receipts"][late_key] = {"body": {}, "operation": "customer.create", "receipt": {"id": 100, "revision": "100", "replayed": False}}
    button("Dùng khách hàng #502").click()
    expect(button("Dùng khách hàng đã lưu")).to_be_visible()
    expect(button("Lưu khách hàng")).to_be_disabled()
    button("Dùng khách hàng đã lưu").click()
    expect(field("Họ tên khách thuê")).to_have_value("OriginalCommitQA")
    assert late_key not in state["tombstones"] and state["customer_creates"] == 1
    checks.append("A committed original intent takes precedence over a different duplicate selection and blocks a second create")
    leave_contract()
    new_contract("92004")
    open_form()
    field("Số điện thoại").fill("0902222222")
    expect(button("Dùng khách hàng #502")).to_have_count(0)
    checks.append("Changing identity removes stale duplicate choices")
    button("Lưu khách hàng").click()
    expect(button("Dùng khách hàng #501")).to_be_visible()
    for width, height, scheme in ((320, 740, "light"), (375, 812, "dark"), (390, 844, "light"), (430, 932, "dark")):
        page.set_viewport_size({"width": width, "height": height})
        page.emulate_media(color_scheme=scheme, reduced_motion="reduce")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        button("Đi tới khách hàng #501").scroll_into_view_if_needed()
        page.screenshot(path=str(output / f"duplicates-{width}-{scheme}.png"), full_page=True)
    checks.append("Duplicate choices fit 320/375/390/430 widths with light/dark theme")
