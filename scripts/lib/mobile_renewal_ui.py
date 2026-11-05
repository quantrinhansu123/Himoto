"""Browser renewal checks; images/money/accounts are synthetic and intercepted."""
import re
import struct
import zlib
from datetime import datetime, timezone
from playwright.sync_api import expect
from lib.mobile_finance_fixture import seed_finance
from lib.mobile_renewal_fixture import renewal_response


def run_renewal_workflows(page, state, base_url, output, checks):
    def button(name): return page.get_by_role("button", name=name, exact=True)
    def choose(label, value): button(label).click(); button(value).click()
    def back(): page.get_by_role("link", name=re.compile(r", back$")).click()
    def tabs():
        for _ in range(4):
            if page.get_by_role("tab", name="Hợp đồng", exact=True).is_visible(): return
            previous=page.url; back(); page.wait_for_url(lambda value: str(value)!=previous)
        raise AssertionError("Did not return to tabs")
    def open_editor(index=4001):
        page.get_by_role("tab", name="Hợp đồng", exact=True).click()
        button(f"Xem HD-QA-{index}, Khách hợp đồng QA").click(); button("Gia hạn hợp đồng").click()
        expect(button("Rà soát gia hạn")).to_be_enabled()
        page.get_by_label('Ngày bắt đầu gia hạn',exact=True).fill('2026-11-02')
        page.get_by_label('Giờ bắt đầu gia hạn',exact=True).fill('08:00')
        choose('Trạng thái thu tiền gia hạn','Chưa thu tiền')
    def field(name): return page.get_by_role("textbox", name=name, exact=True)
    def confirm(): button("Rà soát gia hạn").click(); button("Xác nhận lưu gia hạn").click()
    def acknowledge():
        button("Xác nhận đã kiểm tra gia hạn").click()
        page.wait_for_url(re.compile(r"/record/contracts/[1-9][0-9]*$"))
        expect(button("Gia hạn hợp đồng")).to_be_visible()
        tabs()
    state["user"]["permissions"].append("contracts.renew")
    seed_finance(state,4001);seed_finance(state,4002)
    page.goto(base_url);field("Tài khoản").fill("qa");page.get_by_label("Mật khẩu",exact=True).fill("fixture-password");button("Đăng nhập").click()
    open_editor(4002)
    expect(field("Phí gia hạn thỏa thuận (VND)")).to_have_value("100000")
    page.get_by_label("Ngày hẹn trả mới",exact=True).fill("2026-11-02")
    button("Rà soát gia hạn").click()
    expect(page.get_by_text("Hẹn trả mới phải sau hẹn trả hiện tại của xe.",exact=True)).to_be_visible()
    assert state.get("renewal_writes",0)==0
    checks.append("Review rejects a non-extending return date before any request key or renewal is created")
    page.get_by_label("Ngày hẹn trả mới",exact=True).fill("2026-11-03")
    field("Phí gia hạn thỏa thuận (VND)").fill("80000");field("Ghi chú gia hạn").fill("Browser-Unpaid")
    button("Rà soát gia hạn").click();button("Tiếp tục chỉnh sửa").click()
    expect(field("Phí gia hạn thỏa thuận (VND)")).to_have_value("80000");assert state.get("renewal_writes",0)==0
    confirm();expect(page.get_by_role("heading",name="Gia hạn đã được ghi nhận",exact=True)).to_be_visible()
    expect(page.get_by_text("Chưa ghi khoản thu tiền",exact=True)).to_be_visible()
    assert state["renewal_writes"]==1 and state.get("finance_writes",0)==0 and state["finance_profiles"][4002]["totalAmount"]==580000
    acknowledge();checks.append("Cancelling review preserves the agreed fee; an unpaid renewal then advances one version/date and total without recording income")
    open_editor()
    field("Phí gia hạn thỏa thuận (VND)").fill("1000");field("Phí thu ngoài (VND)").fill("500");field("Tên phí thu ngoài").fill("QA outside")
    choose("Trạng thái thu tiền gia hạn","Đã thực nhận đủ phí ở trên")
    choose("Hình thức thu gia hạn","Tiền mặt");choose("Tài khoản nhận gia hạn","Két tiền mặt QA")
    button("Rà soát gia hạn").click()
    expect(page.get_by_text("Lưu và rà soát bill đúng phiên bản trước khi xác nhận đã thu.",exact=True)).to_be_visible()
    assert state["renewal_writes"]==1
    checks.append("Paid renewal cannot be reviewed without a saved image reviewed for its exact version, even with a valid receiving account")
    # A valid tiny synthetic PNG exercises legacy bill-read/load state only;
    # native picker/codec/readability acceptance is a separate suite.
    def chunk(kind,data): return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    image=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',16,16,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\xdd\x11\x22'*16)*16))+chunk(b'IEND',b'')
    state.setdefault("bill_images",{})[(4001,2)]={"data":image,"info":{"id":4001,"version":2,"slot":"renewal-2-document-1","photoRevision":"901","mimeType":"image/png","bytes":len(image),"updatedAt":datetime.now(timezone.utc).isoformat()}}
    button("Tải lại số liệu gia hạn").click();button("Xác nhận bill đúng giao dịch").click()
    state["renewal_mode"]="lost";confirm()
    expect(button("Đối chiếu yêu cầu gia hạn")).to_be_visible();expect(field("Phí gia hạn thỏa thuận (VND)")).not_to_be_editable()
    assert state["renewal_writes"]==2 and state["finance_writes"]==2
    back();button("Tiếp tục chỉnh sửa").click();expect(field("Phí thu ngoài (VND)")).to_have_value("500")
    back();button("Rời bước gia hạn").click();tabs();page.get_by_role("tab",name="Tài khoản",exact=True).click()
    button("Đối chiếu gia hạn hợp đồng #4001").click();button("Đối chiếu với máy chủ").click();button("Mở kết quả gia hạn hợp đồng #4001").click()
    receipt=next(row["receipt"] for row in state["renewal_receipts"].values() if row["receipt"]["id"]==4001)
    expect(page.get_by_text(f"Phiếu tiền thuê #{receipt['transactionId']}",exact=True)).to_be_visible()
    expect(page.get_by_text(re.compile(f"^Phiếu thu ngoài #{receipt['outsideTransactionId']}"))).to_be_visible()
    assert receipt["transactionId"]!=receipt["outsideTransactionId"] and receipt["totalAmount"]==501000
    assert state["finance_profiles"][4001]["rentalPaid"]==101000
    page.screenshot(path=str(output/"renewal-recovered.png"),full_page=True);acknowledge()
    assert state["renewal_writes"]==2 and state["finance_writes"]==2
    checks.append("Lost-response recovery through Account retains the exact version and separate rental/outside transactions without repeating the fee or collection")
    open_editor();field("Phí gia hạn thỏa thuận (VND)").fill("2000");field("Ghi chú gia hạn").fill("Browser-Unsent")
    state["renewal_mode"]="drop";confirm();expect(button("Đối chiếu yêu cầu gia hạn")).to_be_visible()
    button("Đối chiếu yêu cầu gia hạn").click();button("Đối chiếu gia hạn với máy chủ").click()
    expect(field("Ghi chú gia hạn")).to_have_value("Browser-Unsent");expect(field("Phí gia hạn thỏa thuận (VND)")).to_be_editable()
    key=next(key for key,value in state["tombstones"].items() if value=="renewal.record:4001")
    status,_,_=renewal_response("/api/mobile/v1/contracts/4001/renewals","POST",{}, {"idempotency-key":key},state)
    assert status==409 and state["renewal_writes"]==2 and state["finance_writes"]==2
    checks.append("Server cancellation of an uncommitted renewal unlocks the preserved form and rejects a late retry using the old UUID without changing dates or money")
    for width,height,scheme in [(375,812,"light"),(390,844,"dark"),(768,1024,"light")]:
        page.set_viewport_size({"width":width,"height":height});page.emulate_media(color_scheme=scheme)
        expect(button("Rà soát gia hạn")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),"Horizontal overflow"
        page.screenshot(path=str(output/f"renewal-{width}-{scheme}.png"),full_page=True)
        checks.append(f"The renewal form and persistent review action fit {width}x{height} {scheme}")
