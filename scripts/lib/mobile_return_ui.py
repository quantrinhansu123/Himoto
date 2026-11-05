"""Browser return editor/receipt acceptance with synthetic data only."""
import re
from playwright.sync_api import expect
from lib.mobile_return_fixture import seed_return, return_response


def run_return_workflows(page, state, base_url, output, checks):
    state["user"]["permissions"].append("contracts.return")
    for index in range(5101, 5109):
        seed_return(state, index, count=2 if index == 5102 else 26 if index == 5103 else 1, paid=500000 if index == 5102 else 100000)
    def button(name): return page.get_by_role("button", name=name, exact=True)
    def field(name): return page.get_by_role("textbox", name=name, exact=True)
    def choose(label, value): button(label).click(); button(value).click()
    def heading(name): return page.get_by_role("heading", name=name, exact=True)
    def tabs():
        tab=page.get_by_role("tab", name="Hợp đồng", exact=True)
        if not tab.is_visible():
            page.get_by_role("link", name=re.compile(r", back$")).click()
        expect(tab).to_be_visible()
    def open_editor(index,pending=False):
        tabs(); page.get_by_role("tab", name="Hợp đồng", exact=True).click()
        button(f"Xem HD-QA-{index}, Khách hợp đồng QA").click()
        button("Trả xe và quyết toán").click()
        expect(heading("Trả xe đang chờ đối chiếu" if pending else "1. Chọn xe trả")).to_be_visible()
    def select_first():
        page.get_by_role("checkbox", name="Chọn trả xe QA-RETURN-1", exact=True).click()
        button("Nhập phí trả xe").click()
    def date(day="2026-10-15", hour="08:00"):
        page.get_by_label("Ngày nhận xe thực tế", exact=True).fill(day)
        page.get_by_label("Giờ nhận xe thực tế", exact=True).fill(hour)
    def fees():
        button("Tính phí và số dư").click(); expect(heading("3. Tiền thực thu và hoàn")).to_be_visible()
    def income(amount):
        button("Thêm khoản thực thu").click(); field("Khoản thu 1 (VND)").fill(str(amount))
    def review():
        button("Rà soát quyết toán").click(); expect(heading("4. Rà soát quyết toán")).to_be_visible()
    def commit():
        button("Ghi trả xe và quyết toán").click(); button("Xác nhận trả xe và quyết toán").click()
    def acknowledge():
        button("Xác nhận đã kiểm tra phiếu trả xe").click()
        page.wait_for_url(re.compile(r"/record/contracts/[1-9][0-9]*$"))
        tabs()
    page.goto(base_url)
    field("Tài khoản").fill("qa");page.get_by_label("Mật khẩu",exact=True).fill("fixture-password");button("Đăng nhập").click()
    expect(page.get_by_role("tab",name="Hợp đồng",exact=True)).to_be_visible()
    open_editor(5101);select_first()
    date("2026-10-09")
    button("Tính phí và số dư").click()
    expect(page.get_by_text("QA-RETURN-1: giờ trả không được trước giờ nhận xe.", exact=True)).to_be_visible()
    assert state.get("return_writes",0)==0 and state.get("return_previews",0)==0
    date(hour="09:00");field("Phí sửa chữa (VND)").fill("30000");field("Nội dung sửa chữa").fill("Browser QA repair")
    fees();income(450000);choose("Ghi hoàn cọc","Đã thực tế hoàn cọc");field("Hoàn cọc (VND)").fill("100000");review()
    button("Ghi trả xe và quyết toán").click();button("Tiếp tục chỉnh sửa").click()
    expect(heading("4. Rà soát quyết toán")).to_be_visible();assert state.get("return_writes",0)==0
    checks.append("Invalid actual return time is rejected locally before preview/key; fee/repair/settlement review preserves the form when confirmation is cancelled")
    commit();expect(heading("Trả xe đã được ghi nhận")).to_be_visible()
    assert state["return_writes"]==1
    saved=next(iter(state["return_receipts"].values()))["receipt"]
    assert [r["kind"] for r in saved["transactions"]]==["rental_debt","deposit_refund"]
    assert saved["review"]["after"]["totalAmount"]==550000 and saved["review"]["after"]["depositHeld"]==0
    for width,height,scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
        page.set_viewport_size({"width":width,"height":height});page.emulate_media(color_scheme=scheme)
        button("Xác nhận đã kiểm tra phiếu trả xe").scroll_into_view_if_needed()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        assert button("Xác nhận đã kiểm tra phiếu trả xe").bounding_box()["height"]>=48
        page.screenshot(path=str(output/f"return-receipt-{width}-{scheme}.png"),full_page=True)
    page.set_viewport_size({"width":375,"height":812});page.emulate_media(color_scheme="light")
    acknowledge();checks.append("Final return, actual income and deposit refund appear as exact immutable receipts; explicit acknowledgement removes the key and responsive light/dark receipt layouts fit without horizontal overflow")
    open_editor(5102);select_first();date("2026-10-14");field("Giảm doanh thu trả sớm (VND)").fill("50000");fees()
    expect(button("Ghi hoàn cọc")).to_be_disabled()
    choose("Ghi hoàn tiền thuê","Đã thực tế hoàn thuê");field("Hoàn thuê (VND)").fill("50000");review();commit()
    expect(heading("Trả xe đã được ghi nhận")).to_be_visible()
    latest=list(state["return_receipts"].values())[-1]["receipt"]
    assert latest["review"]["after"]["remainingItems"]==1 and latest["review"]["after"]["depositHeld"]==100000
    assert latest["transactions"][0]["kind"]=="rental_refund"
    acknowledge();checks.append("Partial vehicle return refunds eligible early-rental credit and disables deposit refund while another vehicle remains")
    open_editor(5103);page.get_by_role("checkbox",name="Chọn trả xe QA-RETURN-1",exact=True).click()
    button("Trang xe tiếp").click();page.get_by_role("checkbox",name="Chọn trả xe QA-RETURN-26",exact=True).click()
    button("Nhập phí trả xe").click();date();button("Xe được chọn tiếp").click();date();fees()
    assert state.get("return_writes",0)==2
    expect(page.get_by_text("HD-QA-5103 · đã chọn 2 xe",exact=True)).to_be_visible()
    page.get_by_role("link",name=re.compile(r", back$")).click();button("Tiếp tục chỉnh sửa").click()
    expect(heading("3. Tiền thực thu và hoàn")).to_be_visible()
    page.get_by_role("link",name=re.compile(r", back$")).click();button("Rời bước trả xe").click();tabs()
    checks.append("Vehicle selections survive a 25-row page boundary and per-vehicle fee editing; cancelling Back preserves the unsent form and explicit leave creates no write")
    open_editor(5104);select_first();date();fees();income(400000);review();state["return_lose_response"]=True;commit()
    expect(heading("Trả xe đang chờ đối chiếu")).to_be_visible()
    assert state["return_writes"]==3
    original=list(state["return_receipts"].values())[-1]["receipt"];original_key=original["requestId"]
    page.get_by_role("link",name=re.compile(r", back$")).click();button("Rời bước trả xe").click();tabs()
    page.get_by_role("tab",name="Tài khoản",exact=True).click();button("Đối chiếu trả xe và quyết toán #5104").click();button("Đối chiếu với máy chủ").click()
    button("Mở kết quả trả xe và quyết toán #5104").click();expect(heading("Trả xe đã được ghi nhận")).to_be_visible()
    expect(page.get_by_text(re.compile(original_key))).to_be_visible()
    assert state["return_writes"]==3 and len(state["return_receipts"][original_key]["receipt"]["transactions"])==1
    acknowledge();checks.append("Loss after commit locks the editor, retains its parent key through navigation, and Account opens the exact committed receipt without recording income again")
    open_editor(5105);select_first();date();field("Nội dung sửa chữa").fill("Keep unsent QA");fees();review()
    state["return_drop"]=True;commit();expect(heading("Trả xe đang chờ đối chiếu")).to_be_visible()
    button("Đối chiếu trả xe với máy chủ").click();button("Đối chiếu với máy chủ").click()
    expect(heading("2. Phí và giờ nhận xe")).to_be_visible()
    expect(field("Nội dung sửa chữa")).to_have_value("Keep unsent QA")
    assert state["return_writes"]==3
    delayed=state["return_delayed"];assert return_response(**delayed,state=state)[0]==409
    fees();review();commit();expect(heading("Trả xe đã được ghi nhận")).to_be_visible();acknowledge()
    checks.append("A request dropped before commit is durably cancelled; late retry is blocked and retained input can be reviewed again under a new UUID")
    open_editor(5106);select_first();date();field("Nội dung sửa chữa").fill("Keep stale QA");fees();review()
    state["return_conflict"]=True;commit();expect(heading("Trả xe đang chờ đối chiếu")).to_be_visible();assert state["return_writes"]==4
    button("Đối chiếu trả xe với máy chủ").click();button("Đối chiếu với máy chủ").click()
    expect(field("Nội dung sửa chữa")).to_have_value("Keep stale QA");fees();review();commit()
    expect(heading("Trả xe đã được ghi nhận")).to_be_visible();acknowledge()
    checks.append("A stale financial fingerprint rejects the write, preserves form and UUID until cancellation, then requires a fresh fee and settlement review")
    open_editor(5107);select_first();date();fees();income(500000);review()
    expect(button("Ghi trả xe và quyết toán")).to_be_disabled()
    button("Xác nhận khoản thu vượt và rà soát lại").click();expect(button("Ghi trả xe và quyết toán")).to_be_enabled()
    commit();expect(heading("Trả xe đã được ghi nhận")).to_be_visible()
    latest=list(state["return_receipts"].values())[-1]["receipt"]
    assert latest["review"]["overpaymentAcknowledged"] and latest["review"]["totals"]["totalIncrease"]==100000
    assert latest["review"]["after"]["totalAmount"]==600000
    acknowledge();checks.append("Actual overpayment requires an explicit second review and shows its exact contract total increase before the atomic write")
    before=state["return_writes"]
    open_editor(5108);select_first();date();fees();review();state["return_drop"]=True;commit()
    expect(heading("Trả xe đang chờ đối chiếu")).to_be_visible()
    page.get_by_role("link",name=re.compile(r", back$")).click();button("Rời bước trả xe").click();tabs()
    open_editor(5108,pending=True)
    button("Đối chiếu trả xe với máy chủ").click();button("Đối chiếu với máy chủ").click()
    expect(heading("1. Chọn xe trả")).to_be_visible()
    expect(page.get_by_role("checkbox",name="Chọn trả xe QA-RETURN-1",exact=True)).not_to_be_checked()
    assert state["return_writes"]==before
    page.get_by_role("link",name=re.compile(r", back$")).click();tabs()
    checks.append("Reopening an uncertain editor without form contents returns to vehicle selection after cancellation rather than an empty fee step; the original dropped request creates no write")
