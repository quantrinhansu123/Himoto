"""Browser acceptance of scoped contract finance with synthetic records."""
import re
from playwright.sync_api import expect
from lib.mobile_finance_fixture import seed_finance, finance_response

def run_finance_workflows(page, state, base_url, output, checks):
    def button(name): return page.get_by_role("button", name=name, exact=True)
    def choose(label, value):
        button(label).click()
        button(value).click()
    def back(): page.get_by_role("link", name=re.compile(r", back$")).click()
    def to_tabs():
        for _ in range(4):
            if page.get_by_role("tab", name="Hợp đồng", exact=True).is_visible(): return
            previous = page.url
            back()
            page.wait_for_url(lambda current: str(current) != previous)
        expect(page.get_by_role("tab", name="Hợp đồng", exact=True)).to_be_visible()
    def login():
        page.goto(base_url)
        page.get_by_role("textbox", name="Tài khoản", exact=True).fill("qa")
        page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
        button("Đăng nhập").click()
        page.get_by_role("tab", name="Hợp đồng", exact=True).click()
    def open_finance(index=4001):
        button(f"Xem HD-QA-{index}, Khách hợp đồng QA").click()
        button("Thu/chi hợp đồng").click()
        expect(button("Ghi nhận thu/chi")).to_be_visible()
    def editor(amount, purpose="Thu tiền thuê / công nợ", method="cash", note=None):
        button("Ghi nhận thu/chi").click()
        expect(button("Ghi nhận khoản thu/chi")).to_be_enabled()
        if purpose != "Thu tiền thuê / công nợ": choose("Nghiệp vụ thu/chi", purpose)
        page.get_by_role("textbox", name="Số tiền thực thu/chi (VND)", exact=True).fill(amount)
        choose("Hình thức thu/chi", {"cash":"Tiền mặt", "transfer":"CK tài khoản cá nhân", "company_transfer":"CK tài khoản công ty"}[method])
        payout = purpose in ("Trả cọc cho khách", "Hoàn tiền thuê trả sớm")
        choose("Tài khoản thực chi" if payout else "Tài khoản thực nhận", {"cash":"Két tiền mặt QA", "transfer":"Ngân hàng cá nhân QA", "company_transfer":"Ngân hàng công ty QA"}[method])
        page.get_by_label("Ngày thực thu/chi", exact=True).fill("2026-10-01")
        page.get_by_label("Giờ thực thu/chi", exact=True).fill("08:00")
        if note is not None: page.get_by_role("textbox", name="Nội dung thu/chi", exact=True).fill(note)
    def confirm():
        button("Ghi nhận khoản thu/chi").click()
        button("Xác nhận đã thu/chi").click()
    def acknowledge(transaction):
        expect(page.get_by_role("heading", name="Thu/chi đã được ghi nhận", exact=True)).to_be_visible()
        expect(page.get_by_text(f"Phiếu #{transaction}", exact=True)).to_be_visible()
        button("Xem lịch sử thu/chi").click()
        expect(button("Ghi nhận thu/chi")).to_be_visible()

    state["user"]["permissions"] += ["finance.read", "finance.write"]
    seed_finance(state, 4001); seed_finance(state, 4002)
    login(); open_finance()
    expect(page.get_by_text("Lịch sử thu/chi · 27 phiếu", exact=True)).to_be_visible()
    state["finance_page_error"] = True
    button("Tải thêm phiếu thu/chi").click()
    expect(button("Thử tải thêm phiếu")).to_be_visible()
    expect(page.get_by_text("Đã hiển thị 25/27 phiếu", exact=True)).to_be_visible()
    state["finance_page_error"] = False
    button("Thử tải thêm phiếu").click()
    expect(page.get_by_text("Đã hiển thị 27/27 phiếu", exact=True)).to_be_visible()
    checks.append("Scoped finance loads balances and bounded history; a failed next page retains existing rows and retries explicitly without dropping records")

    editor("100000", method="company_transfer")
    confirm(); acknowledge(9001)
    assert state["finance_writes"] == 1
    assert next(iter(state["finance_receipts"].values()))["body"]["method"] == "company_transfer"
    checks.append("Recording a rental receipt confirms the actual bank/account/time and returns its exact transaction before allowing another financial intent")

    for amount, purpose, method in [("10000","Thu cọc còn thiếu","cash"),("20000","Trả cọc cho khách","transfer"),("5000","Hoàn tiền thuê trả sớm","cash"),("10000","Thu thêm khoản khác","cash")]:
        editor(amount, purpose, method)
        confirm(); acknowledge(9001 + state["finance_writes"] - 1)
    context = state["finance_profiles"][4001]
    assert context["depositHeld"] == 90000 and context["rentalPaid"] == 205000 and context["totalAmount"] == 510000
    assert state["finance_writes"] == 5
    recorded = list(state["finance_receipts"].values())
    assert {r["body"]["method"] for r in recorded} == {"cash","transfer","company_transfer"}
    assert all(r["body"]["account_id"] == 1 for r in recorded)
    checks.append("Deposit collection, deposit refund, early rental refund and extra receipts preserve their directions/balances and distinguish cash/personal/company accounts with identical IDs")

    editor("400000")
    button("Ghi nhận khoản thu/chi").click()
    expect(page.get_by_role("dialog").get_by_text(re.compile("Tổng hợp đồng tăng 95.000"))).to_be_visible()
    button("Tiếp tục chỉnh sửa").click()
    assert state["finance_writes"] == 5
    expect(page.get_by_role("textbox", name="Số tiền thực thu/chi (VND)", exact=True)).to_have_value("400000")
    confirm(); acknowledge(9006)
    assert state["finance_profiles"][4001]["totalAmount"] == 605000
    assert list(state["finance_receipts"].values())[-1]["body"]["acknowledge_overpayment"] is True
    checks.append("Over-collection shows the exact total increase, supports cancellation with preserved input and sends the explicit acknowledgement only after confirmation")

    editor("5000", "Thu thêm khoản khác")
    state["finance_lost_response"] = True
    confirm()
    expect(button("Đối chiếu yêu cầu thu/chi")).to_be_visible()
    expect(button("Ghi nhận khoản thu/chi")).to_have_count(0)
    expect(page.get_by_role("textbox", name="Số tiền thực thu/chi (VND)", exact=True)).not_to_be_editable()
    assert state["finance_writes"] == 7
    back(); button("Tiếp tục chỉnh sửa").click()
    expect(page.get_by_role("textbox", name="Số tiền thực thu/chi (VND)", exact=True)).to_have_value("5000")
    back(); button("Rời bước thu/chi").click()
    to_tabs()
    page.get_by_role("tab", name="Tài khoản", exact=True).click()
    button("Đối chiếu ghi thu/chi hợp đồng #4001").click()
    button("Đối chiếu với máy chủ").click()
    button("Mở kết quả ghi thu/chi hợp đồng #4001").click()
    acknowledge(9007)
    assert state["finance_writes"] == 7
    checks.append("A lost committed response locks financial input, guards leaving and recovers the exact transaction through Account without creating a second receipt")

    editor("7000", "Thu thêm khoản khác")
    state["finance_drop_before_commit"] = True
    confirm()
    expect(button("Đối chiếu yêu cầu thu/chi")).to_be_visible()
    state["resolve_lost_response"] = True
    button("Đối chiếu yêu cầu thu/chi").click(); button("Đối chiếu với máy chủ").click()
    expect(page.get_by_text("Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.", exact=True)).to_be_visible()
    expect(button("Ghi nhận khoản thu/chi")).to_have_count(0)
    button("Đối chiếu yêu cầu thu/chi").click(); button("Đối chiếu với máy chủ").click()
    expect(page.get_by_role("textbox", name="Số tiền thực thu/chi (VND)", exact=True)).to_be_editable()
    expect(page.get_by_role("textbox", name="Số tiền thực thu/chi (VND)", exact=True)).to_have_value("7000")
    delayed = state["delayed_payment_request"]
    assert finance_response(delayed["path"],delayed["method"],delayed["body"],delayed["headers"],state)[1]["code"] == "REQUEST_CANCELLED"
    confirm(); acknowledge(9008)
    assert state["finance_writes"] == 8
    checks.append("Uncommitted financial requests remain locked after lost cancellation acknowledgement; repeat reconciliation retains input, blocks late writes and permits a new UUID only after server confirmation")

    editor("10000", "Thu cọc còn thiếu")
    state["finance_conflict"] = True
    confirm()
    expect(page.get_by_text("Số liệu thu/chi đã thay đổi. Đối chiếu trước khi ghi.", exact=True)).to_be_visible()
    expect(button("Ghi nhận khoản thu/chi")).to_have_count(0)
    assert state["finance_writes"] == 8
    button("Đối chiếu yêu cầu thu/chi").click(); button("Đối chiếu với máy chủ").click()
    expect(button("Ghi nhận khoản thu/chi")).to_be_enabled()
    expect(page.get_by_role("textbox", name="Số tiền thực thu/chi (VND)", exact=True)).to_have_value("10000")
    confirm(); acknowledge(9009)
    checks.append("Stale revisions write no money, preserve the entered amount and require reconciliation before the refreshed revision can be submitted")

    editor("1000")
    state["finance_accrual_change"] = True
    confirm()
    expect(page.get_by_text("Số dư đã thay đổi từ lúc rà soát. Đối chiếu và tải lại số liệu trước khi ghi.", exact=True)).to_be_visible()
    assert state["finance_writes"] == 9
    button("Đối chiếu yêu cầu thu/chi").click(); button("Đối chiếu với máy chủ").click()
    expect(button("Ghi nhận khoản thu/chi")).to_be_enabled()
    confirm(); acknowledge(9010)
    checks.append("Installment balance drift without an xmin change rejects the reviewed snapshot and requires reconciliation/fresh numbers before recording")

    editor("2000", "Thu thêm khoản khác")
    state["finance_expire_after_commit"] = True
    confirm()
    expect(button("Đăng nhập")).to_be_visible()
    page.get_by_role("textbox", name="Tài khoản", exact=True).fill("qa")
    page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
    button("Đăng nhập").click()
    page.get_by_role("tab", name="Tài khoản", exact=True).click()
    button("Đối chiếu ghi thu/chi hợp đồng #4001").click(); button("Đối chiếu với máy chủ").click()
    button("Mở kết quả ghi thu/chi hợp đồng #4001").click()
    acknowledge(9011)
    assert state["finance_writes"] == 11
    checks.append("Expiry after financial commit preserves the scoped key through reauthentication and recovers the exact transaction without another receipt")

    editor("9999999999999", "Trả cọc cho khách")
    button("Ghi nhận khoản thu/chi").click()
    expect(page.get_by_text(re.compile("Số tiền nhập vượt giới hạn"))).to_be_visible()
    assert state["finance_writes"] == 11
    for width,height,scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
        page.set_viewport_size({"width":width,"height":height}); page.emulate_media(color_scheme=scheme)
        expect(page.get_by_role("heading", name="HD-QA-4001", exact=True)).to_have_css("color", "rgb(23, 32, 42)" if scheme == "light" else "rgb(242, 244, 247)")
        box = button("Ghi nhận khoản thu/chi").bounding_box()
        assert box["height"] >= 48 and box["y"]+box["height"] <= height+1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        page.screenshot(path=str(output/f"payment-editor-{width}-{scheme}.png"), full_page=True)
    checks.append("Refund limits preserve invalid input without sending money; the editor and persistent confirm action fit small/large/landscape/tablet and light/dark themes")
    back(); button("Rời bước thu/chi").click()
    expect(button("Ghi nhận thu/chi")).to_be_visible()
    to_tabs()
    page.get_by_role("tab", name="Tài khoản", exact=True).click()
    expect(page.get_by_text("Không có thao tác chờ đối chiếu trong phạm vi này.",exact=True)).to_be_visible()
    button("Đăng xuất").click()
    state["user"]["permissions"].remove("finance.write")
    login()
    button("Xem HD-QA-4001, Khách hợp đồng QA").click(); button("Thu/chi hợp đồng").click()
    expect(page.get_by_text(re.compile("Lịch sử thu/chi ·"))).to_be_visible()
    expect(button("Ghi nhận thu/chi")).to_have_count(0)
    checks.append("A finance reader can review scoped balances/history while recording controls remain unavailable; acknowledged requests leave no unresolved key")
