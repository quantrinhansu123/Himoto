"""Browser acceptance of swap editor/recovery, synthetic transport only."""
import re
from playwright.sync_api import expect
from lib.mobile_swap_fixture import seed_swap, swap_response


def run_swap_workflows(page, state, base_url, output, checks):
    state["user"]["permissions"].append("contracts.return")
    for index in range(6101, 6109):
        seed_swap(state, index, count=26 if index == 6101 else 1, ownership=index == 6102)
    def button(name): return page.get_by_role("button", name=name, exact=True)
    def heading(name): return page.get_by_role("heading", name=name, exact=True)
    def field(): return page.get_by_role("textbox", name="Biển số hoặc tên xe thay thế", exact=True)
    def radio(name): return page.get_by_role("radio", name=name, exact=True)
    def tabs():
        tab = page.get_by_role("tab", name="Hợp đồng", exact=True)
        if not tab.is_visible():
            page.get_by_role("link", name=re.compile(r", back$")).click()
        expect(tab).to_be_visible()
    def open_editor(index, pending=False):
        tabs();page.get_by_role("tab", name="Hợp đồng", exact=True).click()
        button(f"Xem HD-QA-{index}, Khách hợp đồng QA").click()
        button("Đổi xe trong hợp đồng").click()
        expect(heading("Đổi xe đang chờ đối chiếu" if pending else "1. Chọn xe đang thuê")).to_be_visible()
    def select_old(number=1):
        radio(f"Chọn đổi xe QA-SWAP-OLD-{number}").click();button("Tìm xe thay thế").click()
        expect(heading("2. Chọn xe thay thế")).to_be_visible()
    def select_new(number=1):
        radio(f"Chọn xe thay thế QA-SWAP-NEW-{number}").click()
    def review():
        button("Rà soát đổi xe").click();expect(heading("3. Rà soát đổi xe")).to_be_visible()
    def commit():
        button("Ghi đổi xe trong hợp đồng").click();button("Xác nhận đổi xe trong hợp đồng").click()
    def acknowledge():
        button("Xác nhận đã kiểm tra phiếu đổi xe").click()
        page.wait_for_url(re.compile(r"/record/contracts/[1-9][0-9]*$"));tabs()
    def leave():
        page.get_by_role("link", name=re.compile(r", back$")).click()
        button("Rời bước đổi xe").click()
        page.wait_for_url(re.compile(r"/record/contracts/[1-9][0-9]*$"));tabs()
    page.goto(base_url)
    page.get_by_role("textbox", name="Tài khoản", exact=True).fill("qa")
    page.get_by_label("Mật khẩu", exact=True).fill("fixture-password");button("Đăng nhập").click()
    expect(page.get_by_role("tab", name="Hợp đồng", exact=True)).to_be_visible()
    open_editor(6101);button("Trang xe đang thuê tiếp").click();select_old(26)
    button("Trang kho tiếp").click();select_new(26)
    field().fill("_%");button("Tìm trong kho thay thế").click()
    expect(radio("Chọn xe thay thế QA-SWAP-NEW-_%")).to_be_visible()
    expect(page.get_by_text("Đã chọn: QA-SWAP-NEW-26", exact=True)).to_be_visible()
    radio("Chọn xe thay thế QA-SWAP-NEW-_%").click();review()
    assert state.get("swap_writes",0)==0 and not state.get("swap_receipts") and state["swap_previews"]==1
    checks.append("Old-line and stock pagination preserve selection; literal wildcard search is applied explicitly and review creates no write key/history")
    button("Ghi đổi xe trong hợp đồng").click();button("Tiếp tục chỉnh sửa").click()
    expect(heading("3. Rà soát đổi xe")).to_be_visible()
    assert state.get("swap_writes",0)==0
    for width,height,scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
        page.set_viewport_size({"width":width,"height":height});page.emulate_media(color_scheme=scheme)
        button("Ghi đổi xe trong hợp đồng").scroll_into_view_if_needed()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        assert button("Ghi đổi xe trong hợp đồng").bounding_box()["height"]>=48
        page.screenshot(path=str(output/f"swap-review-{width}-{scheme}.png"),full_page=True)
    page.set_viewport_size({"width":375,"height":812});page.emulate_media(color_scheme="light")
    commit();expect(heading("Đổi xe đã được ghi nhận")).to_be_visible()
    proof=next(iter(state["swap_receipts"].values()))["receipt"]
    assert proof["from"]["license"]=="QA-SWAP-OLD-26" and proof["to"]["license"]=="QA-SWAP-NEW-_%"
    assert state["swap_writes"]==1 and not state.get("finance_receipts")
    page.screenshot(path=str(output/"swap-original-receipt.png"),full_page=True)
    acknowledge();checks.append("Confirmation cancellation keeps review; responsive light/dark review fits four viewports and committed original vehicles/warehouse are acknowledged without a financial write")
    open_editor(6102);select_old();select_new();review()
    expect(page.get_by_text("Kho: Kho Thuê sở hữu QA",exact=True)).to_be_visible()
    page.get_by_role("link",name=re.compile(r", back$")).click();button("Tiếp tục chỉnh sửa").click()
    expect(heading("3. Rà soát đổi xe")).to_be_visible();leave()
    assert state["swap_writes"]==1
    checks.append("HQ-sourced ownership review shows received lease stock; Back cancellation retains review and explicit leave sends no swap")
    open_editor(6103);select_old();select_new();state["swap_page_error"]=True;button("Trang kho tiếp").click()
    expect(page.get_by_text("Lỗi tải trang kho QA.",exact=True)).to_be_visible()
    expect(button("Rà soát đổi xe")).to_be_disabled()
    expect(page.get_by_text("Đã chọn: QA-SWAP-NEW-1",exact=True)).to_be_visible()
    state["swap_page_error"]=False;button("Tải lại danh sách xe thay thế").click();review();leave()
    checks.append("A stock-page failure keeps the chosen vehicle, disables review and supports explicit reload without clearing the unsent selection")
    open_editor(6104);select_old();select_new();review();state["swap_lose_response"]=True;commit()
    expect(heading("Đổi xe đang chờ đối chiếu")).to_be_visible()
    expect(button("Mở phiếu đổi xe")).to_be_enabled()
    lost=list(state["swap_receipts"].values())[-1]["receipt"];lost_key=lost["requestId"]
    state["swap_corrections"]=["vehicleCurrent"]
    leave();page.get_by_role("tab",name="Tài khoản",exact=True).click()
    button("Đối chiếu đổi xe trong hợp đồng #6104").click();button("Đối chiếu với máy chủ").click()
    button("Mở kết quả đổi xe trong hợp đồng #6104").click()
    expect(heading("Đổi xe đã được ghi nhận")).to_be_visible()
    expect(page.get_by_text(re.compile(lost_key))).to_be_visible()
    expect(page.get_by_text("Thông tin hoặc trạng thái xe thay thế đã thay đổi.",exact=True)).to_be_visible()
    assert lost["vehicleCurrent"] and state["swap_writes"]==2
    state["swap_corrections"]=[];acknowledge()
    checks.append("Lost commit response keeps the UUID through navigation; Account opens the exact original swap and independent later-stock warning without recording another swap")
    open_editor(6105);select_old();field().fill("NEW-2");button("Tìm trong kho thay thế").click();select_new(2);review()
    state["swap_drop"]=True;commit();expect(heading("Đổi xe đang chờ đối chiếu")).to_be_visible();expect(button("Mở phiếu đổi xe")).to_be_enabled()
    button("Đối chiếu đổi xe với máy chủ").click();button("Đối chiếu với máy chủ").click()
    expect(heading("2. Chọn xe thay thế")).to_be_visible()
    expect(field()).to_have_value("NEW-2");expect(page.get_by_text("Đã chọn: QA-SWAP-NEW-2",exact=True)).to_be_visible()
    delayed=state["swap_delayed"];assert swap_response(**delayed,state=state)[0]==409
    review();commit();expect(heading("Đổi xe đã được ghi nhận")).to_be_visible();acknowledge()
    assert state["swap_writes"]==3
    checks.append("A dropped unsent swap is durably cancelled, late delivery is rejected, and retained search/vehicle can be reviewed under a new UUID")
    open_editor(6106);select_old();select_new()
    state["swap_profiles"][6106]["vehicles"][0]["revision"]="101"
    button("Rà soát đổi xe").click()
    expect(page.get_by_text("Hợp đồng hoặc xe thay thế QA đã thay đổi. Tải lại để chọn lại xe.",exact=True)).to_be_visible()
    assert state["swap_writes"]==3
    button("Tải lại danh sách xe thay thế").click();select_new();review();leave()
    checks.append("A vehicle revision change before review fails read-only before reserving a write key; refreshing and explicitly reselecting uses the current stock revision")
    open_editor(6107);select_old();select_new();review();state["swap_conflict"]=True;commit()
    expect(heading("Đổi xe đang chờ đối chiếu")).to_be_visible();expect(button("Mở phiếu đổi xe")).to_be_enabled()
    assert state["swap_writes"]==3
    button("Đối chiếu đổi xe với máy chủ").click();button("Đối chiếu với máy chủ").click()
    expect(heading("2. Chọn xe thay thế")).to_be_visible()
    button("Tải lại để chọn lại xe").click();button("Tải lại và chọn lại xe").click()
    expect(heading("1. Chọn xe đang thuê")).to_be_visible();select_old();select_new();review();commit()
    expect(heading("Đổi xe đã được ghi nhận")).to_be_visible();acknowledge()
    assert state["swap_writes"]==4
    checks.append("A contract change between review and write leaves no swap and locks the UUID until cancellation; explicit reset fetches current revisions before a fresh confirmed write")
    open_editor(6108);select_old();select_new();review();state["swap_drop"]=True;commit()
    expect(heading("Đổi xe đang chờ đối chiếu")).to_be_visible();expect(button("Mở phiếu đổi xe")).to_be_enabled();leave()
    open_editor(6108,pending=True);button("Đối chiếu đổi xe với máy chủ").click();button("Đối chiếu với máy chủ").click()
    expect(heading("1. Chọn xe đang thuê")).to_be_visible();expect(button("Tìm xe thay thế")).to_be_disabled()
    assert swap_response(**state["swap_delayed"],state=state)[0]==409 and state["swap_writes"]==4
    page.get_by_role("link",name=re.compile(r", back$")).click()
    page.wait_for_url(re.compile(r"/record/contracts/6108$"));tabs()
    checks.append("Reopening an unresolved editor preserves its key; cancelling an unsent key returns to an unselected first step and late delivery remains blocked")
    page.get_by_role("tab",name="Tài khoản",exact=True).click()
    expect(page.get_by_text("Không có thao tác chờ đối chiếu trong phạm vi này.",exact=True)).to_be_visible()
    button("Đăng xuất").click();expect(button("Đăng nhập")).to_be_visible()
    checks.append("Every committed swap is acknowledged and every unsent key is cancelled; Account ledger is empty before final logout")
