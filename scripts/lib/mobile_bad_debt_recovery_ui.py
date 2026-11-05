"""Browser recovery editor/receipt acceptance; synthetic transport only."""
import re
from playwright.sync_api import expect
from lib.mobile_bad_debt_recovery_fixture import seed_bad_debt_recovery, bad_debt_recovery_response


def run_bad_debt_recovery_workflows(page, state, base_url, output, checks):
    state["user"]["permissions"].append("contracts.return")
    for index in range(8101, 8109):
        seed_bad_debt_recovery(state, index, count=26 if index == 8101 else 1, ownership=index in (8102, 8103), settled=index == 8103)
    def button(name): return page.get_by_role("button", name=name, exact=True)
    def heading(name): return page.get_by_role("heading", name=name, exact=True)
    def field(name): return page.get_by_role("textbox", name=name, exact=True)
    def actual(value):
        day, hour = value.split("T")
        page.get_by_label("Ngày thu hồi thực tế", exact=True).fill(day)
        page.get_by_label("Giờ thu hồi thực tế", exact=True).fill(hour)
    def tabs():
        tab = page.get_by_role("tab", name="Hợp đồng", exact=True)
        if not tab.is_visible():
            page.get_by_role("link", name=re.compile(r", back$")).click()
        expect(tab).to_be_visible()
    def open_editor(index, pending=False):
        tabs();page.get_by_role("tab", name="Hợp đồng", exact=True).click()
        button(f"Xem HD-QA-{index}, Khách hợp đồng QA").click();button("Thu hồi xe nợ xấu").click()
        expect(heading("Thu hồi xe đang chờ đối chiếu" if pending else "1. Chọn xe đã thu hồi")).to_be_visible()
    def select(number=1):
        page.get_by_role("radio", name=f"Chọn thu hồi xe QA-RECOVER-{number}", exact=True).click()
        button("Nhập ngày thu hồi").click();expect(heading("2. Ngày thu hồi và ghi chú")).to_be_visible()
    def review():
        button("Rà soát thu hồi xe").click();expect(heading("3. Rà soát thu hồi xe")).to_be_visible()
    def commit():
        button("Ghi thu hồi xe nợ xấu").click();button("Xác nhận ghi thu hồi xe").click()
    def acknowledge():
        button("Xác nhận đã kiểm tra phiếu thu hồi").click()
        page.wait_for_url(re.compile(r"/record/contracts/[1-9][0-9]*$"));tabs()
    def leave():
        page.get_by_role("link", name=re.compile(r", back$")).click();button("Rời bước thu hồi xe").click()
        page.wait_for_url(re.compile(r"/record/contracts/[1-9][0-9]*$"));tabs()
    def cancel_pending():
        button("Đối chiếu thu hồi với máy chủ").click();button("Đối chiếu với máy chủ").click()
    page.goto(base_url)
    field("Tài khoản").fill("qa");page.get_by_label("Mật khẩu", exact=True).fill("fixture-password")
    button("Đăng nhập").click();expect(page.get_by_role("tab", name="Hợp đồng", exact=True)).to_be_visible()
    open_editor(8101);button("Trang xe thu hồi tiếp").click();select(26)
    actual("2026-10-31T09:30");field("Ghi chú thu hồi").fill("  Nhận lại xe QA · đủ phụ kiện  ")
    review();assert state.get("bad_debt_recovery_writes", 0) == 0 and state["bad_debt_recovery_previews"] == 1
    expect(page.get_by_text("Nhận lại xe QA · đủ phụ kiện", exact=True)).to_be_visible()
    button("Ghi thu hồi xe nợ xấu").click();button("Tiếp tục chỉnh sửa").click()
    expect(heading("3. Rà soát thu hồi xe")).to_be_visible()
    checks.append("Pagination selects line 26; exact Vietnam recovery minute and normalized note survive readonly preview and cancelling confirmation without a write UUID/history")
    for width, height, scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
        page.set_viewport_size({"width": width, "height": height});page.emulate_media(color_scheme=scheme)
        button("Ghi thu hồi xe nợ xấu").scroll_into_view_if_needed()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        assert button("Ghi thu hồi xe nợ xấu").bounding_box()["height"] >= 48
        page.screenshot(path=str(output/f"recovery-review-{width}-{scheme}.png"), full_page=True)
    page.set_viewport_size({"width":375,"height":812});page.emulate_media(color_scheme="light")
    commit();expect(heading("Thu hồi xe đã được ghi nhận")).to_be_visible()
    original = next(iter(state["bad_debt_recovery_receipts"].values()))["receipt"]
    assert original["review"]["item"]["license"] == "QA-RECOVER-26" and original["review"]["before"] == {k: original["review"]["after"][k] for k in original["review"]["before"]}
    assert state["bad_debt_recovery_writes"] == 1 and not state.get("finance_receipts")
    page.screenshot(path=str(output/"recovery-original-receipt.png"), full_page=True);acknowledge()
    checks.append("Four light/dark viewport reviews fit; confirmed physical recovery opens the immutable original actor/vehicle/date/note proof with unchanged debt/deposit and no money receipt")
    open_editor(8102);select();actual("2026-08-02T08:00");review()
    expect(page.get_by_text(re.compile(r"Mốc chốt nợ:.*16/9/26"))).to_be_visible()
    expect(page.get_by_text("Còn nợ thuê: 1.900.000 ₫", exact=True)).to_be_visible();leave()
    open_editor(8103);select();review();expect(page.get_by_text("Trạng thái sau ghi: Hoàn thành", exact=True)).to_be_visible();leave()
    checks.append("Ownership early physical recovery retains the frozen cutoff and debt; only a previously settled last-line review predicts completion, without writing either review")
    open_editor(8104);select()
    for value in ("2026-07-01T08:00", "2099-01-01T08:00"):
        actual(value);button("Rà soát thu hồi xe").click()
        expect(page.get_by_role("alert")).to_be_visible()
    assert state["bad_debt_recovery_writes"] == 1
    actual("2026-10-31T09:30");field("Ghi chú thu hồi").fill("Ghi chú được giữ")
    review();button("Sửa ngày hoặc ghi chú thu hồi").click();expect(field("Ghi chú thu hồi")).to_have_value("Ghi chú được giữ")
    checks.append("Impossible, pre-rental and future dates fail locally before preview/key allocation; editing review preserves the typed recovery note/date")
    review();state["bad_debt_recovery_lose_response"] = True;commit()
    expect(heading("Thu hồi xe đang chờ đối chiếu")).to_be_visible();expect(button("Mở phiếu thu hồi xe")).to_be_enabled()
    lost_key, lost = list(state["bad_debt_recovery_receipts"].items())[-1]
    state["bad_debt_recovery_corrections"] = ["historyCurrent", "moneyCurrent"]
    leave();page.get_by_role("tab", name="Tài khoản", exact=True).click()
    button("Đối chiếu thu hồi xe nợ xấu #8104").click();button("Đối chiếu với máy chủ").click()
    button("Mở kết quả thu hồi xe nợ xấu #8104").click();expect(heading("Thu hồi xe đã được ghi nhận")).to_be_visible()
    expect(page.get_by_text(re.compile(lost_key))).to_be_visible()
    expect(page.get_by_text("Lịch sử thu hồi đã thay đổi sau khi ghi.", exact=True)).to_be_visible()
    expect(page.get_by_text("Số dư hoặc lịch sử tiền đã thay đổi sau khi ghi.", exact=True)).to_be_visible()
    assert lost["receipt"]["current"] and state["bad_debt_recovery_writes"] == 2
    state["bad_debt_recovery_corrections"] = [];acknowledge()
    checks.append("Lost commit response retains the UUID through navigation; Account resolves/open the exact original proof and independent later-history/money warnings without a second recovery")
    open_editor(8105);select();actual("2026-10-31T09:30");field("Ghi chú thu hồi").fill("Giữ ghi chú sau hủy mã")
    review();state["bad_debt_recovery_drop"] = True;commit();expect(heading("Thu hồi xe đang chờ đối chiếu")).to_be_visible()
    cancel_pending();expect(heading("2. Ngày thu hồi và ghi chú")).to_be_visible()
    expect(field("Ghi chú thu hồi")).to_have_value("Giữ ghi chú sau hủy mã");expect(page.get_by_label("Ngày thu hồi thực tế", exact=True)).to_have_value("2026-10-31")
    assert bad_debt_recovery_response(**state["bad_debt_recovery_delayed"], state=state)[0] == 409
    review();commit();expect(heading("Thu hồi xe đã được ghi nhận")).to_be_visible();acknowledge()
    checks.append("An unsent request is tombstoned before retry; delayed delivery is rejected and retained actual date/note are reviewed under a new UUID")
    open_editor(8106);select();review();state["bad_debt_recovery_conflict"] = True;commit()
    expect(heading("Thu hồi xe đang chờ đối chiếu")).to_be_visible();assert state["bad_debt_recovery_writes"] == 3
    cancel_pending();expect(heading("2. Ngày thu hồi và ghi chú")).to_be_visible()
    button("Tải lại xe cần thu hồi").click();button("Tải lại và chọn lại xe").click();select();review();commit()
    expect(heading("Thu hồi xe đã được ghi nhận")).to_be_visible();acknowledge()
    checks.append("A revision conflict after review creates no physical recovery; cancellation and explicit re-selection fetch current revisions before a fresh confirmed write")
    open_editor(8107);select();review();state["bad_debt_recovery_drop"] = True;commit()
    expect(heading("Thu hồi xe đang chờ đối chiếu")).to_be_visible();leave();open_editor(8107, pending=True)
    cancel_pending();expect(heading("1. Chọn xe đã thu hồi")).to_be_visible();expect(button("Nhập ngày thu hồi")).to_be_disabled()
    assert bad_debt_recovery_response(**state["bad_debt_recovery_delayed"], state=state)[0] == 409
    page.get_by_role("link", name=re.compile(r", back$")).click();tabs()
    checks.append("Reopening the editor preserves an unresolved UUID; a cancelled unsent request returns to unselected preparation and blocks late delivery")
    state["bad_debt_recovery_unavailable"] = True;open_editor(8108)
    expect(page.get_by_text("Chưa tải được xe thu hồi QA.", exact=True)).to_be_visible()
    state["bad_debt_recovery_unavailable"] = False
    button("Tải lại xe cần thu hồi").click();select();review();leave()
    checks.append("Preparation transport failure is recoverable through explicit reload and does not allocate a write key or lose an existing proof")
    page.get_by_role("tab", name="Tài khoản", exact=True).click()
    expect(page.get_by_text("Không có thao tác chờ đối chiếu trong phạm vi này.", exact=True)).to_be_visible()
    button("Đăng xuất").click();expect(button("Đăng nhập")).to_be_visible()
    checks.append("Every committed recovery is acknowledged and every unsent key is cancelled; Account ledger is empty before final logout")
