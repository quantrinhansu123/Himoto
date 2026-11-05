"""Browser checks for saved-period collection, with intercepted QA data only."""
import re
import struct
import zlib
from datetime import datetime, timezone
from playwright.sync_api import expect
from lib.mobile_collection_fixture import seed_collections, collection_response


def run_collection_workflows(page, state, base_url, output, checks):
    def button(name): return page.get_by_role("button", name=name, exact=True)
    def field(name): return page.get_by_role("textbox", name=name, exact=True)
    def choose(label, value): button(label).click(); button(value).click()
    def back(): page.get_by_role("link", name=re.compile(r", back$")).click()
    def tabs():
        for _ in range(6):
            if page.get_by_role("tab", name="Hợp đồng", exact=True).is_visible(): return
            previous=page.url;back();page.wait_for_url(lambda value: str(value)!=previous)
        raise AssertionError("Did not return to tabs")
    def open_period():
        page.get_by_role("tab",name="Hợp đồng",exact=True).click()
        button("Xem HD-QA-4003, Khách hợp đồng QA").click();button("Thu/chi hợp đồng").click()
        button("Các kỳ gia hạn và tiền còn thu").click()
        expect(page.get_by_text("Kỳ gia hạn #27",exact=True)).to_be_visible()
        if button("Tải thêm kỳ gia hạn").count(): button("Tải thêm kỳ gia hạn").click()
        button("Thu cho kỳ gia hạn #2").click()
        expect(field("Số tiền thu cho kỳ (VND)")).to_be_visible()
    def confirm(): button("Rà soát khoản thu theo kỳ").click();button("Xác nhận đã thu cho kỳ").click()
    def review_bill():
        expect(button("Xác nhận bill đúng khoản thu theo kỳ")).to_be_enabled();button("Xác nhận bill đúng khoản thu theo kỳ").click()
    def acknowledge():
        button("Xác nhận đã kiểm tra khoản thu theo kỳ").click();page.wait_for_url(re.compile(r"/finance/4003$"));tabs()
    state["user"]["permissions"] += ["finance.read","finance.write"]
    seed_collections(state)
    page.goto(base_url);field("Tài khoản").fill("qa");page.get_by_label("Mật khẩu",exact=True).fill("fixture-password");button("Đăng nhập").click()
    page.get_by_role("tab",name="Hợp đồng",exact=True).click();button("Xem HD-QA-4003, Khách hợp đồng QA").click()
    # The finance screen, not the renewal editor, owns this operation.
    button("Thu/chi hợp đồng").click();button("Các kỳ gia hạn và tiền còn thu").click()
    expect(page.get_by_text("Kỳ gia hạn #27",exact=True)).to_be_visible()
    state["collection_page_error"]=True;button("Tải thêm kỳ gia hạn").click()
    expect(button("Thử tải thêm kỳ")).to_be_visible();expect(page.get_by_text("Kỳ gia hạn #27",exact=True)).to_be_visible()
    state["collection_page_error"]=False;button("Thử tải thêm kỳ").click();button("Thu cho kỳ gia hạn #2").click()
    expect(field("Số tiền thu cho kỳ (VND)")).to_have_value("70000")
    checks.append("Finance-only staff discover actual saved periods with partial balances; a failed next page retains loaded periods and retries without inferring a version")
    field("Số tiền thu cho kỳ (VND)").fill("70001");choose("Hình thức thu theo kỳ","Tiền mặt");choose("Tài khoản nhận khoản thu theo kỳ","Két tiền mặt QA")
    button("Rà soát khoản thu theo kỳ").click();expect(page.get_by_text("Số tiền nhập vượt phần phí còn thiếu của kỳ đã chọn.",exact=True)).to_be_visible()
    field("Số tiền thu cho kỳ (VND)").fill("10000");button("Rà soát khoản thu theo kỳ").click()
    expect(page.get_by_text("Lưu và rà soát bill đúng kỳ gia hạn trước khi xác nhận đã thu.",exact=True)).to_be_visible()
    assert state.get("collection_writes",0)==0 and state.get("finance_writes",0)==0
    checks.append("Review rejects collection above the saved-period fee and requires a bill reviewed for that exact period before creating income")
    button("Chọn hoặc thay bill khoản thu theo kỳ").click()
    expect(page.get_by_text("Chuẩn bị bill · phiên bản gia hạn #2",exact=True)).to_be_visible()
    expect(button("Chọn ảnh bill")).to_be_disabled()
    back();page.wait_for_url(re.compile(r"/renewal-payment/4003\?version=2$"))
    expect(field("Số tiền thu cho kỳ (VND)")).to_have_value("10000")
    checks.append("Historical bill preparation opens the saved version under finance grants and returning retains the collection form; picker/upload remain native-only")
    def chunk(kind,data): return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    image=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',16,16,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\xdd\x11\x22'*16)*16))+chunk(b'IEND',b'')
    state.setdefault("bill_images",{})[(4003,2)]={"data":image,"info":{"id":4003,"version":2,"slot":"renewal-2-document-1","photoRevision":"901","mimeType":"image/png","bytes":len(image),"updatedAt":datetime.now(timezone.utc).isoformat()}}
    button("Tải lại số liệu thu theo kỳ").click();review_bill()
    before=state["linked_periods"][4003][0].copy()
    button("Rà soát khoản thu theo kỳ").click();button("Tiếp tục chỉnh sửa").click();expect(field("Số tiền thu cho kỳ (VND)")).to_have_value("10000")
    confirm();expect(page.get_by_role("heading",name="Khoản thu theo kỳ đã được ghi nhận",exact=True)).to_be_visible()
    assert state["finance_writes"]==1 and state["collection_writes"]==1
    assert state["finance_profiles"][4003]["totalAmount"]==500000 and state["linked_periods"][4003][0]["returnAt"]==before["returnAt"]
    assert state["linked_periods"][4003][0]["collected"]==20000
    page.screenshot(path=str(output/"collection-partial-receipt.png"),full_page=True);acknowledge()
    checks.append("Cancelling review preserves input; confirmed partial collection creates exactly one linked transaction while retaining the period fee and return date")
    open_period();field("Số tiền thu cho kỳ (VND)").fill("5000");choose("Hình thức thu theo kỳ","Tiền mặt");choose("Tài khoản nhận khoản thu theo kỳ","Két tiền mặt QA");review_bill()
    state["collection_mode"]="lost";confirm();expect(button("Đối chiếu khoản thu theo kỳ")).to_be_visible();expect(field("Số tiền thu cho kỳ (VND)")).not_to_be_editable()
    back();button("Rời bước thu theo kỳ").click();tabs();page.get_by_role("tab",name="Tài khoản",exact=True).click()
    button("Đối chiếu thu tiền theo kỳ gia hạn #4003").click();button("Đối chiếu với máy chủ").click();button("Mở kết quả thu tiền theo kỳ gia hạn #4003").click()
    expect(page.get_by_role("heading",name="Khoản thu theo kỳ đã được ghi nhận",exact=True)).to_be_visible()
    saved=list(state["collection_receipts"].values())[-1]["receipt"]
    expect(page.get_by_text(re.compile(f"^Phiếu thu #{saved['transactionId']} ·"))).to_be_visible();assert saved["version"]==2 and saved["amount"]==5000
    assert state["collection_writes"]==2 and state["finance_writes"]==2
    page.screenshot(path=str(output/"collection-account-recovered.png"),full_page=True);acknowledge()
    checks.append("A lost response locks edits; Account opens the dedicated exact-period receipt without a version URL or repeating money, then requires acknowledgement; process persistence is native-only")
    open_period();field("Số tiền thu cho kỳ (VND)").fill("1000");field("Nội dung thu theo kỳ").fill("Browser-Collection-Unsent")
    choose("Hình thức thu theo kỳ","Tiền mặt");choose("Tài khoản nhận khoản thu theo kỳ","Két tiền mặt QA");review_bill()
    state["collection_mode"]="drop";confirm();expect(button("Đối chiếu khoản thu theo kỳ")).to_be_visible()
    button("Đối chiếu khoản thu theo kỳ").click();button("Đối chiếu khoản thu với máy chủ").click()
    expect(field("Nội dung thu theo kỳ")).to_have_value("Browser-Collection-Unsent");expect(field("Số tiền thu cho kỳ (VND)")).to_be_editable()
    delayed=state["delayed_collection"];status,_,_=collection_response(delayed["path"],"POST",delayed["body"],delayed["headers"],state)
    assert status==409 and state["collection_writes"]==2 and state["finance_writes"]==2
    checks.append("Reconciliation of an uncommitted linked collection preserves the form, tombstones the original UUID and blocks a late retry without changing fees or money")
    for width,height,scheme in [(375,812,"light"),(390,844,"dark"),(768,1024,"light")]:
        page.set_viewport_size({"width":width,"height":height});page.emulate_media(color_scheme=scheme)
        expect(button("Rà soát khoản thu theo kỳ")).to_be_visible();box=button("Rà soát khoản thu theo kỳ").bounding_box()
        assert box["height"]>=48 and box["y"]+box["height"]<=height+1
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),"Horizontal overflow"
        page.screenshot(path=str(output/f"collection-{width}-{scheme}.png"),full_page=True)
        checks.append(f"Saved-period amounts, bill review and the persistent collection action fit {width}x{height} {scheme}")
