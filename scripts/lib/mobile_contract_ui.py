"""Focused browser acceptance of staff issuance/handover with synthetic money."""
from playwright.sync_api import expect
import re
from lib.mobile_contract_fixture import seed_contract, contract_response

def run_contract_workflows(page, state, base_url, output, checks):
    def button(name): return page.get_by_role("button",name=name,exact=True)
    def choose(label,value):
        button(label).click()
        button(value).click()
    def login():
        page.goto(base_url)
        page.get_by_role("textbox",name="Tài khoản",exact=True).fill("qa")
        page.get_by_label("Mật khẩu",exact=True).fill("fixture-password")
        button("Đăng nhập").click()
        page.get_by_role("tab",name="Hợp đồng",exact=True).click()
    def open_contract(index,code=None):
        button(f"Xem {code or 'NHAP-'+str(index)}, Khách hợp đồng QA").click()
    def review(index,code=None):
        open_contract(index,code)
        button("Rà soát và phát hành").click()
        expect(page.get_by_role("heading",name=code or f"NHAP-{index}",exact=True)).to_be_visible()
    def collection(index,amount,method="transfer",purpose="rental"):
        button("Thêm khoản thực nhận").click()
        page.get_by_role("textbox",name=f"Số tiền khoản {index} (VND)",exact=True).fill(amount)
        if purpose=="deposit": choose(f"Loại tiền khoản {index}","Cọc thế chấp")
        if method!="transfer": choose(f"Hình thức khoản {index}","Tiền mặt" if method=="cash" else "CK tài khoản công ty")
        choose(f"Tài khoản nhận khoản {index}",{"transfer":"Ngân hàng cá nhân QA","cash":"Két tiền mặt QA","company_transfer":"Ngân hàng công ty QA"}[method])
        page.get_by_label(f"Ngày nhận tiền khoản {index}",exact=True).fill("2026-10-01")
        page.get_by_label(f"Giờ nhận tiền khoản {index}",exact=True).fill("08:00")
    def confirm(label):
        button(label).click()
        page.get_by_role("dialog").get_by_role("button",name=label,exact=True).click()
    state["user"]["permissions"].append("contracts.finalize")
    seed_contract(state,3001,mismatch=True)
    seed_contract(state,3002)
    seed_contract(state,3003)
    seed_contract(state,3004)
    seed_contract(state,3005)
    seed_contract(state,3006)
    seed_contract(state,3007)
    login()
    review(3001)
    expect(button("Phát hành và giao xe")).to_be_disabled()
    button("Bổ sung bản nháp").click()
    button("Bước 3: Xe").click()
    button("Đồng bộ lịch các xe").click()
    button("Tiếp tục chỉnh sửa").click()
    assert state["draft_profiles"][3001]["input"]["draft"]["vehicles"][0]["return_at"]=="2026-12-01T08:00"
    button("Đồng bộ lịch các xe").click()
    button("Áp dụng lịch hợp đồng").click()
    expect(button("Đồng bộ lịch các xe")).to_have_count(0)
    assert state["draft_profiles"][3001]["input"]["draft"]["vehicles"][0]["return_at"]=="2026-12-01T08:00"
    button("Lưu nháp").click()
    expect(button("Rà soát và phát hành")).to_be_visible()
    assert state["draft_profiles"][3001]["input"]["draft"]["vehicles"][0]["return_at"]==state["draft_profiles"][3001]["input"]["draft"]["end_date"]
    checks.append("Legacy line times block issuance; alignment supports cancel, changes no server data until Save, and matches pricing/printing/issuance")
    button("Rà soát và phát hành").click()
    collection(1,"100000",method="cash",purpose="deposit")
    collection(2,"200000",method="company_transfer")
    state["contract_overlap"]=True
    confirm("Phát hành và giao xe")
    expect(page.get_by_text("Cảnh báo chồng lịch cọc giữ xe QA.",exact=True)).to_be_visible()
    expect(page.get_by_role("textbox",name="Số tiền khoản 1 (VND)",exact=True)).to_have_value("100000")
    choose("Đã kiểm tra và chấp nhận chồng lịch cọc","Đã kiểm tra và đồng ý")
    confirm("Phát hành và giao xe")
    expect(button("Gọi khách hàng")).to_be_visible()
    expect(button("Phát hành và giao xe")).to_have_count(0)
    expect(button("Rà soát và phát hành")).to_have_count(0)
    assert state["contract_actions"]==1 and state["collections_count"]==2
    recorded=next(iter(state["contract_receipts"].values()))["body"]
    assert recorded["receipts"][0]["method"]=="cash" and recorded["receipts"][1]["method"]=="company_transfer" and recorded["receipts"][0]["account_id"]==recorded["receipts"][1]["account_id"]==1
    page.screenshot(path=str(output/"issued-contract.png"),full_page=True)
    checks.append("Issuance preserves split deposits/rental collections, disambiguates identical cash/bank IDs and requires explicit overlap consent")
    page.get_by_role("link", name=re.compile(r", back$")).click()
    review(3002)
    choose("Cách phát hành","Nhận cọc giữ xe")
    collection(1,"150000")
    state["contract_lost_response"]=True
    confirm("Nhận cọc giữ xe")
    expect(button("Kiểm tra lần xác nhận trước")).to_be_visible()
    committed=state["collections_count"]
    page.go_back()
    button("Tiếp tục chỉnh sửa").click()
    expect(page.get_by_role("textbox",name="Số tiền khoản 1 (VND)",exact=True)).to_have_value("150000")
    page.go_back()
    button("Rời bước xác nhận").click()
    expect(button("Xác nhận giao xe giữ chỗ")).to_be_visible()
    button("Xác nhận giao xe giữ chỗ").click()
    expect(page.get_by_role("heading",name="Lần xác nhận trước đã thành công",exact=True)).to_be_visible()
    button("Xem hợp đồng đã xác nhận").click()
    expect(button("Xác nhận giao xe giữ chỗ")).to_be_visible()
    assert state["collections_count"]==committed
    checks.append("A committed reservation with a lost response preserves entered collections, guards leaving and recovers its receipt without collecting again")
    button("Xác nhận giao xe giữ chỗ").click()
    confirm("Xác nhận giao xe")
    expect(button("Gọi khách hàng")).to_be_visible()
    expect(button("Xác nhận giao xe")).to_have_count(0)
    expect(button("Xác nhận giao xe giữ chỗ")).to_have_count(0)
    assert state["collections_count"]==committed and state["draft_profiles"][3002]["status"]=="renting"
    checks.append("Handover uses the loaded revision and never recollects the reservation advance")
    page.get_by_role("link", name=re.compile(r", back$")).click()
    review(3003)
    collection(1,"9999999999999")
    button("Phát hành và giao xe").click()
    expect(page.get_by_text("Số tiền nhập vượt số còn phải thu. Kiểm tra các khoản thực nhận.",exact=True)).to_be_visible()
    expect(page.get_by_role("textbox",name="Số tiền khoản 1 (VND)",exact=True)).to_have_value("9999999999999")
    assert state["contract_actions"]==3
    checks.append("Over-collection validation preserves the entered amount and does not send an action")
    for width,height,scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
        page.set_viewport_size({"width":width,"height":height});page.emulate_media(color_scheme=scheme)
        expect(page.get_by_role("heading",name="NHAP-3003",exact=True)).to_have_css("color", "rgb(23, 32, 42)" if scheme=="light" else "rgb(242, 244, 247)")
        action=button("Phát hành và giao xe");box=action.bounding_box()
        assert box["height"]>=48 and box["y"]+box["height"]<=height+1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        page.screenshot(path=str(output/f"contract-preparation-{width}-{scheme}.png"),full_page=True)
    checks.append("Preparation and persistent confirm action fit portrait, landscape, tablet and dark mode")
    page.set_viewport_size({"width":375,"height":812})
    page.get_by_role("link", name=re.compile(r", back$")).click()
    button("Rời bước xác nhận").click()
    expect(button("Gọi khách hàng")).to_be_visible()
    page.get_by_role("link", name=re.compile(r", back$")).click()
    review(3004)
    state["contract_lost_response"]=True
    confirm("Phát hành và giao xe")
    expect(button("Kiểm tra lần xác nhận trước")).to_be_visible()
    button("Tải lại thông tin hợp đồng").click()
    expect(page.get_by_role("heading",name="Lần xác nhận trước đã thành công",exact=True)).to_be_visible()
    button("Xem hợp đồng đã xác nhận").click()
    expect(button("Gọi khách hàng")).to_be_visible()
    assert state["contract_actions"]==4
    checks.append("Reloading after an uncertain committed response also reconciles its pending key and offers the saved result")

    # A request lost before commit must not be abandoned locally: a late copy
    # could still arrive. Resolve it with a durable server tombstone first.
    page.get_by_role("link", name=re.compile(r", back$")).click()
    review(3005)
    state["contract_drop_before_commit"]=True
    confirm("Phát hành và giao xe")
    expect(button("Kiểm tra lần xác nhận trước")).to_be_visible()
    page.get_by_role("link", name=re.compile(r", back$")).click()
    # No form changes, so returning after the zero-collection request is safe.
    expect(button("Rà soát và phát hành")).to_be_visible()
    page.get_by_role("link", name=re.compile(r", back$")).click()
    page.get_by_role("tab",name="Tài khoản",exact=True).click()
    expect(button("Đối chiếu phát hành hợp đồng #3005")).to_be_visible()
    button("Đối chiếu phát hành hợp đồng #3005").click()
    page.get_by_role("dialog").get_by_role("button",name="Tiếp tục chỉnh sửa",exact=True).click()
    assert state.get("resolution_calls",0)==0
    state["resolve_lost_response"]=True
    button("Đối chiếu phát hành hợp đồng #3005").click()
    button("Đối chiếu với máy chủ").click()
    expect(page.get_by_text("Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.",exact=True)).to_be_visible()
    expect(button("Đối chiếu phát hành hợp đồng #3005")).to_be_visible()
    assert state["contract_actions"]==4
    delayed=state["delayed_contract_request"]
    assert contract_response(delayed["path"],delayed["method"],delayed["body"],delayed["headers"],state)[1]["code"]=="REQUEST_CANCELLED"
    button("Đối chiếu phát hành hợp đồng #3005").click()
    button("Đối chiếu với máy chủ").click()
    expect(page.get_by_text("Không có thao tác chờ đối chiếu trong phạm vi này.",exact=True)).to_be_visible()
    assert state["resolution_calls"]==2 and state["contract_actions"]==4
    checks.append("Account recovery confirms before resolving, retains the original key after lost cancellation acknowledgement, retries safely and blocks a delayed financial request")
    page.screenshot(path=str(output/"recovery-cancelled.png"),full_page=True)

    page.get_by_role("tab",name="Hợp đồng",exact=True).click()
    review(3006)
    state["contract_lost_response"]=True
    confirm("Phát hành và giao xe")
    expect(button("Kiểm tra lần xác nhận trước")).to_be_visible()
    page.get_by_role("link", name=re.compile(r", back$")).click()
    expect(button("Gọi khách hàng")).to_be_visible()
    page.get_by_role("link", name=re.compile(r", back$")).click()
    page.get_by_role("tab",name="Tài khoản",exact=True).click()
    state["resolve_unavailable"]=True
    button("Đối chiếu phát hành hợp đồng #3006").click()
    button("Đối chiếu với máy chủ").click()
    expect(page.get_by_text("Chưa kết nối được máy chủ đối chiếu.",exact=True)).to_be_visible()
    expect(button("Đối chiếu phát hành hợp đồng #3006")).to_be_visible()
    button("Đối chiếu phát hành hợp đồng #3006").click()
    button("Đối chiếu với máy chủ").click()
    expect(page.get_by_text("Đã ghi thành công",exact=True)).to_be_visible()
    assert state["contract_actions"]==5
    for width,height,scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
        page.set_viewport_size({"width":width,"height":height});page.emulate_media(color_scheme=scheme)
        expect(page.get_by_role("heading",name="Tài khoản",exact=True)).to_have_css("color", "rgb(23, 32, 42)" if scheme=="light" else "rgb(242, 244, 247)")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        assert button("Mở kết quả phát hành hợp đồng #3006").bounding_box()["height"]>=48
        page.screenshot(path=str(output/f"recovery-{width}-{scheme}.png"),full_page=True)
    button("Mở kết quả phát hành hợp đồng #3006").click()
    expect(button("Gọi khách hàng")).to_be_visible()
    assert state["contract_actions"]==5
    checks.append("Account recovery retains keys during server outages, returns the committed receipt without a second financial action and fits small/large/landscape/tablet themes")

    page.get_by_role("link", name=re.compile(r", back$")).click()
    page.get_by_role("tab",name="Hợp đồng",exact=True).click()
    review(3007)
    state["contract_drop_before_commit"]=True
    confirm("Phát hành và giao xe")
    expect(button("Kiểm tra lần xác nhận trước")).to_be_visible()
    page.get_by_role("link", name=re.compile(r", back$")).click()
    expect(button("Rà soát và phát hành")).to_be_visible()
    page.get_by_role("link", name=re.compile(r", back$")).click()
    page.get_by_role("tab",name="Tài khoản",exact=True).click()
    state["resolve_expired"]=True
    button("Đối chiếu phát hành hợp đồng #3007").click()
    button("Đối chiếu với máy chủ").click()
    expect(button("Đăng nhập")).to_be_visible()
    page.get_by_role("textbox",name="Tài khoản",exact=True).fill("qa")
    page.get_by_label("Mật khẩu",exact=True).fill("fixture-password")
    button("Đăng nhập").click()
    page.get_by_role("tab",name="Tài khoản",exact=True).click()
    expect(button("Đối chiếu phát hành hợp đồng #3007")).to_be_visible()
    button("Đối chiếu phát hành hợp đồng #3007").click()
    button("Đối chiếu với máy chủ").click()
    expect(page.get_by_text("Không có thao tác chờ đối chiếu trong phạm vi này.",exact=True)).to_be_visible()
    assert state["contract_actions"]==5
    checks.append("Expiry during reconciliation preserves the original pending key across reauthentication and allows safe resolution without another business action")
