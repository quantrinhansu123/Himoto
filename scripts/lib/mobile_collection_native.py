"""Android saved-period collection acceptance; all records/images are synthetic."""
import json
import re
import subprocess
import time
import urllib.request


def run_collections(qa,selected_bill=False,recovery_only=False,cancelled_form=False):
    def stats(late=False):
        with urllib.request.urlopen("http://127.0.0.1:8091/__fixture_collections"+("?late=1" if late else ""),timeout=5) as response:
            result=json.load(response)
        assert result["fixtureOnly"] is True
        return result
    def mode(kind,value):
        request=urllib.request.Request(f"http://127.0.0.1:8091/__fixture_{kind}_mode",data=json.dumps({"mode":value}).encode(),headers={"Content-Type":"application/json"},method="POST")
        with urllib.request.urlopen(request,timeout=5) as response: assert json.load(response)["mode"]==value
    def choose(label,value): qa.scroll_to(label);qa.tap(label);qa.tap(value)
    def reveal(label):
        # A reused record/finance screen can retain its scroll position. Search
        # toward the top first, then down; no business/navigation tap is retried.
        try: qa.scroll_to(label,upward=True)
        except AssertionError: qa.scroll_to(label)
    def enter(label,value): qa.scroll_to(label);qa.text(label,value,replace=True);qa.hide_keyboard()
    def open_period():
        qa.tap("Hợp đồng",bottom=True)
        if qa.matches(qa.tree(),"Xóa tìm kiếm"): qa.tap("Xóa tìm kiếm")
        qa.text("Tìm hợp đồng","HD-QA-4003");qa.hide_keyboard();qa.tap("Xem HD-QA-4003, Khách hợp đồng QA")
        qa.wait("Chi tiết hợp đồng");reveal("Thu/chi hợp đồng");qa.tap("Thu/chi hợp đồng")
        # Reopening cached finance can briefly expose the old header during
        # navigation/refetch. Wait for the new page's loading gate before a
        # scroll; never repeat a navigation tap against a stale hierarchy.
        qa.wait("Ghi nhận thu/chi")
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            controls=[node for node in qa.matches(qa.tree(),"Ghi nhận thu/chi") if node.get("clickable")=="true"]
            if controls and all(node.get("enabled")=="true" for node in controls): break
            time.sleep(.5)
        else: raise AssertionError("Finance did not finish refreshing before period navigation")
        reveal("Các kỳ gia hạn và tiền còn thu");qa.tap("Các kỳ gia hạn và tiền còn thu")
        qa.scroll_to("Thu cho kỳ gia hạn #2");qa.tap("Thu cho kỳ gia hạn #2");qa.wait("Rà soát khoản thu theo kỳ")
    def fill(amount,note):
        enter("Số tiền thu cho kỳ (VND)",amount)
        choose("Hình thức thu theo kỳ","Tiền mặt");choose("Tài khoản nhận khoản thu theo kỳ","Két tiền mặt QA")
        enter("Nội dung thu theo kỳ",note)
    def review_bill(): qa.scroll_to("Xác nhận bill đúng khoản thu theo kỳ");qa.tap("Xác nhận bill đúng khoản thu theo kỳ")
    def confirm(): qa.tap("Rà soát khoản thu theo kỳ");qa.tap("Xác nhận đã thu cho kỳ")
    def to_tabs():
        for _ in range(6):
            if qa.matches(qa.tree(),"Tổng quan"):
                qa.tap("Tổng quan",bottom=True);return
            qa.back()
        raise AssertionError("Could not return to tabs after acknowledging the exact collection result")
    def acknowledge():
        qa.scroll_to("Xác nhận đã kiểm tra khoản thu theo kỳ");qa.tap("Xác nhận đã kiểm tra khoản thu theo kỳ");qa.wait("Ghi nhận thu/chi")
        to_tabs()
    def account_recover(label):
        qa.launch();qa.wait("Mở Đội xe",timeout=180);qa.tap("Tài khoản",bottom=True)
        qa.scroll_to(f"Đối chiếu {label} #4003");qa.tap(f"Đối chiếu {label} #4003");qa.tap("Đối chiếu với máy chủ")
        qa.scroll_to(f"Mở kết quả {label} #4003");qa.tap(f"Mở kết quả {label} #4003")
    def pick_bill():
        subprocess.run(["node","scripts/generate-mobile-bill-fixture.cjs"],check=True,capture_output=True)
        photo_name=f'Himoto-QA-{time.time_ns()}.png' if qa.physical else 'mobile-bill-qa.png'
        photo_path='/sdcard/Pictures/'+photo_name
        qa.command("push",".backups/mobile-bill-qa.png",photo_path)
        if qa.physical:
            with qa.output.joinpath('created-qa-media.jsonl').open('a',encoding='utf-8') as output:
                output.write(json.dumps({'path':photo_path,'synthetic':True})+'\n')
        qa.command("shell","am","broadcast","-a","android.intent.action.MEDIA_SCANNER_SCAN_FILE","-d","file://"+photo_path)
        qa.scroll_to("Chọn ảnh bill");qa.tap("Chọn ảnh bill")
        if qa.physical: print('Physical picker: select only the synthetic image marked SYNTHETIC BILL - QA ONLY; waiting for operator selection.',flush=True)
        deadline=time.monotonic()+(240 if qa.physical else 60)
        while time.monotonic()<deadline:
            root=qa.tree()
            if qa.physical and qa.matches(root,'Xem lớn Ảnh bill đang chọn'):
                break
            choices=[node for node in root.iter("node") if node.get("package") not in ("vn.himoto.staff","com.android.systemui") and
                (photo_name in node.get('text','')+node.get('content-desc','') if qa.physical else
                 re.search(r":id/(?:icon_thumbnail|thumbnail|doc_thumb)$",node.get("resource-id","")) or "Photo taken on" in node.get("content-desc","") or "mobile-bill-qa" in node.get("text","")+node.get("content-desc",""))]
            if choices:
                x1,y1,x2,y2=map(int,re.findall(r"\d+",choices[0].get("bounds")))
                qa.command("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2));break
            time.sleep(.5)
        else: raise AssertionError("Select only the newly created Himoto-QA image in the native picker; no personal thumbnail is selected automatically")
        qa.wait("Xem lớn Ảnh bill đang chọn");qa.tap("Lưu ảnh bill");qa.tap("Xác nhận lưu bill")
    starting=stats()
    if cancelled_form:
        assert qa.physical and starting['writes']==2 and len(starting['receipts'])==2,'Resume only the existing server-cancelled physical QA form'
        assert [(row['id'],row['version'],row['amount'],row['remainingAfter']) for row in starting['receipts']]==[(4003,2,10000,60000),(4003,2,5000,55000)]
        assert 'payment.renewal:4003' in starting['tombstones'].values()
    elif recovery_only:
        assert starting['writes']==1 and len(starting['receipts'])==1,'Resume recovery only after exactly one acknowledged QA partial collection'
        first=starting['receipts'][0]
        assert first['id']==4003 and first['version']==2 and first['amount']==10000 and first['remainingAfter']==60000
    else:
        assert starting["writes"]==0,"Acknowledge all old requests before using a fresh collection fixture"
    before_money=qa.fixture_stats()["financeWrites"]-(2 if cancelled_form else 1 if recovery_only else 0)
    original=stats()["periods"]["4003"][0].copy()
    if not selected_bill and not recovery_only and not cancelled_form:
        open_period();fill("70001","Native-Collection-Retained");qa.tap("Rà soát khoản thu theo kỳ")
        qa.wait("Số tiền nhập vượt phần phí còn thiếu của kỳ đã chọn.")
        enter("Số tiền thu cho kỳ (VND)","10000");qa.tap("Rà soát khoản thu theo kỳ")
        qa.wait("Lưu và rà soát bill đúng kỳ gia hạn trước khi xác nhận đã thu.")
        assert stats()["writes"]==0 and qa.fixture_stats()["financeWrites"]==before_money
        qa.screenshot("40-native-collection-review-blocked")
        qa.passed("Saved-period discovery displays partial balances and blocks over-period income or collection without a bill before any money write")
        qa.scroll_to("Chọn hoặc thay bill khoản thu theo kỳ");qa.tap("Chọn hoặc thay bill khoản thu theo kỳ");qa.wait("Ảnh bill sẽ lưu")
        pick_bill()
    elif selected_bill:
        if not qa.physical:raise AssertionError('Resuming a manually selected QA image requires an explicit physical target')
        qa.wait('Xem lớn Ảnh bill đang chọn');qa.tap('Lưu ảnh bill');qa.tap('Xác nhận lưu bill')
    if not recovery_only and not cancelled_form:
        qa.wait("Bill đã được lưu",timeout=60);qa.tap("Xác nhận đã kiểm tra bill");qa.wait("Rà soát khoản thu theo kỳ")
        qa.scroll_to("Nội dung thu theo kỳ",upward=True)
        assert any(node.get("text")=="Native-Collection-Retained" for node in qa.tree().iter("node"))
        review_bill();qa.screenshot("41-native-collection-bill-return")
        qa.passed("Native picker prepares and saves the bill for the historical period and returns with amount/account/note retained, requiring fresh image review")
        qa.tap("Rà soát khoản thu theo kỳ");qa.tap("Tiếp tục chỉnh sửa");confirm();qa.wait("Khoản thu theo kỳ đã được ghi nhận",timeout=60)
        saved=stats()["receipts"][-1];assert saved["version"]==2 and saved["amount"]==10000 and saved["remainingAfter"]==60000
        assert stats()["periods"]["4003"][0]["returnAt"]==original["returnAt"] and stats()["periods"]["4003"][0]["amount"]==original["amount"]
        assert qa.fixture_stats()["financeBalances"]["4003"]["totalAmount"]==500000
        qa.screenshot("42-native-collection-committed");acknowledge()
        qa.passed("Cancelling review keeps input; confirmed partial collection records one exact-period transaction without changing the agreed fee or return date")
    if not cancelled_form:
        open_period();fill("5000","QA-5000");review_bill();mode("collection","lost");confirm();qa.wait("Đối chiếu khoản thu theo kỳ",timeout=60)
        assert stats()["writes"]==2 and qa.fixture_stats()["financeWrites"]==before_money+2
        account_recover("thu tiền theo kỳ gia hạn");qa.wait("Khoản thu theo kỳ đã được ghi nhận",timeout=60)
        recovered=stats()["receipts"][-1]
        assert recovered["amount"]==5000 and any(node.get("text","").startswith(f"Phiếu thu #{recovered['transactionId']} · ") for node in qa.tree().iter("node"))
        qa.screenshot("43-native-collection-recovered");acknowledge()
        assert stats()["writes"]==2 and qa.fixture_stats()["financeWrites"]==before_money+2
        qa.passed("After a lost commit response and process termination, Account/SecureStore opens the dedicated exact-version transaction without a version URL or a second income")
        open_period();fill("1000","QA-1000");review_bill();mode("collection","drop");confirm();qa.wait("Đối chiếu khoản thu theo kỳ",timeout=60)
        qa.tap("Đối chiếu khoản thu theo kỳ");qa.tap("Đối chiếu khoản thu với máy chủ");qa.wait("Rà soát khoản thu theo kỳ")
    reveal("Nội dung thu theo kỳ")
    assert any(node.get("text")=="QA-1000" for node in qa.tree().iter("node"))
    assert stats(late=True)["lateStatus"]==409 and stats()["writes"]==2
    qa.screenshot("44-native-collection-cancelled")
    qa.back();qa.tap("Tiếp tục chỉnh sửa");qa.back();qa.tap("Rời bước thu theo kỳ")
    to_tabs()
    qa.passed("An uncommitted collection is safely tombstoned, the form survives reconciliation/Back cancellation and a late request cannot collect money")
    open_period();qa.scroll_to("Chọn hoặc thay bill khoản thu theo kỳ");qa.tap("Chọn hoặc thay bill khoản thu theo kỳ");qa.wait("Ảnh bill sẽ lưu")
    mode("bill","lost");pick_bill();qa.wait("Đối chiếu yêu cầu lưu bill",timeout=60)
    qa.back();qa.tap("Rời bước bill");qa.wait("Có lần lưu bill chưa được xác nhận. Mở bước bill và kiểm tra kết quả trước khi ghi khoản thu.")
    buttons=[node for node in qa.matches(qa.tree(),"Rà soát khoản thu theo kỳ") if node.get('clickable')=='true']
    assert buttons and all(node.get("enabled")=="false" for node in buttons),"An unresolved bill must block new collection"
    account_recover("lưu bill khoản thu theo kỳ");qa.wait("Bill đã được lưu",timeout=60)
    qa.wait("Phiên bản gia hạn #2");qa.screenshot("45-native-collection-bill-recovered")
    qa.tap("Xác nhận đã kiểm tra bill");qa.wait("Ghi nhận thu/chi")
    assert qa.fixture_stats()["financeWrites"]==before_money+2 and stats()["writes"]==2
    to_tabs();qa.tap("Tài khoản",bottom=True)
    qa.scroll_to("Tải lại danh sách đối chiếu");qa.tap("Tải lại danh sách đối chiếu");qa.wait("Không có thao tác chờ đối chiếu trong phạm vi này.")
    qa.tap("Tổng quan",bottom=True)
    qa.passed("A lost historical bill acknowledgement recovers the exact image/version through its dedicated finance route after process termination, with no money write and no pending keys left")
