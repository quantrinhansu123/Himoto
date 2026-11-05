"""Native renewal acceptance with synthetic money/images only."""
import json
import re
import subprocess
import time
import urllib.request


def run_renewals(qa):
    def stats():
        with urllib.request.urlopen("http://127.0.0.1:8091/__fixture_renewals", timeout=5) as response:
            return json.load(response)

    def mode(value):
        request = urllib.request.Request("http://127.0.0.1:8091/__fixture_renewal_mode", data=json.dumps({"mode": value}).encode(),
            headers={"Content-Type":"application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=5) as response:
            assert json.load(response) == {"fixtureOnly":True,"mode":value}

    def choose(label, value):
        qa.scroll_to(label); qa.tap(label); qa.tap(value)

    def open_contract(index):
        qa.tap("Hợp đồng", bottom=True)
        if qa.matches(qa.tree(), "Xóa tìm kiếm"):
            qa.tap("Xóa tìm kiếm")
        qa.text("Tìm hợp đồng", f"HD-QA-{index}"); qa.hide_keyboard()
        qa.tap(f"Xem HD-QA-{index}, Khách hợp đồng QA")
        qa.scroll_to("Gia hạn hợp đồng"); qa.tap("Gia hạn hợp đồng"); qa.wait("Rà soát gia hạn")

    def confirm():
        qa.tap("Rà soát gia hạn"); qa.tap("Xác nhận lưu gia hạn")

    def acknowledge():
        qa.tap("Xác nhận đã kiểm tra gia hạn"); qa.wait("Chi tiết hợp đồng"); qa.back(); qa.tap("Tổng quan", bottom=True)

    def pick_bill():
        subprocess.run(["node", "scripts/generate-mobile-bill-fixture.cjs"], check=True, capture_output=True)
        qa.command("push", ".backups/mobile-bill-qa.png", "/sdcard/Pictures/mobile-bill-qa.png")
        qa.command("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file:///sdcard/Pictures/mobile-bill-qa.png")
        qa.scroll_to("Chọn ảnh bill"); qa.tap("Chọn ảnh bill")
        deadline = time.monotonic()+60
        while time.monotonic() < deadline:
            tree = qa.tree()
            candidates = [node for node in tree.iter("node") if node.get("package") not in ("vn.himoto.staff", "com.android.systemui") and
                (re.search(r":id/(?:icon_thumbnail|thumbnail|doc_thumb)$", node.get("resource-id", "")) or "Photo taken on" in node.get("content-desc", "") or
                 "mobile-bill-qa" in node.get("text", "")+node.get("content-desc", ""))]
            if candidates:
                bounds = list(map(int, re.findall(r"\d+", candidates[0].get("bounds"))))
                qa.command("shell", "input", "tap", str((bounds[0]+bounds[2])//2), str((bounds[1]+bounds[3])//2))
                break
            time.sleep(.5)
        else:
            raise AssertionError("Synthetic bill image not found in native picker")
        qa.wait("Xem lớn Ảnh bill đang chọn")
        qa.tap("Lưu ảnh bill"); qa.tap("Xác nhận lưu bill"); qa.wait("Bill đã được lưu", timeout=60)
        qa.tap("Xác nhận đã kiểm tra bill"); qa.wait("Rà soát gia hạn")

    assert stats()["writes"] == 0, "Use a fresh renewal fixture after acknowledging every pending request"
    before_money = qa.fixture_stats()["financeWrites"]
    open_contract(4002)
    qa.scroll_to("Ngày hẹn trả mới"); qa.tap("Ngày hẹn trả mới"); qa.confirm_system_picker()
    qa.scroll_to("Giờ hẹn trả mới"); qa.tap("Giờ hẹn trả mới"); qa.confirm_system_picker()
    qa.scroll_to("Phí gia hạn thỏa thuận (VND)"); qa.text("Phí gia hạn thỏa thuận (VND)", "80000", replace=True); qa.hide_keyboard()
    qa.scroll_to("Ghi chú gia hạn"); qa.text("Ghi chú gia hạn", "Native-Renewal-Unpaid"); qa.hide_keyboard()
    confirm(); qa.wait("Gia hạn đã được ghi nhận", timeout=60); qa.wait("Chưa ghi khoản thu tiền")
    result = stats(); assert result["writes"] == 1 and result["receipts"][0]["amount"] == 80000
    assert qa.fixture_stats()["financeWrites"] == before_money and result["receipts"][0]["warning"]
    qa.screenshot("27-native-renewal-unpaid"); acknowledge()
    qa.passed("An explicit unpaid renewal extends one period with its agreed fee/warning and creates no income")

    open_contract(4001)
    qa.scroll_to("Phí gia hạn thỏa thuận (VND)"); qa.text("Phí gia hạn thỏa thuận (VND)", "1000", replace=True); qa.hide_keyboard()
    qa.scroll_to("Phí thu ngoài (VND)"); qa.text("Phí thu ngoài (VND)", "500"); qa.hide_keyboard()
    qa.scroll_to("Tên phí thu ngoài"); qa.text("Tên phí thu ngoài", "QA-outside"); qa.hide_keyboard()
    qa.scroll_to("Ghi chú gia hạn"); qa.text("Ghi chú gia hạn", "Native-Renewal-Retained"); qa.hide_keyboard()
    choose("Trạng thái thu tiền gia hạn", "Đã thực nhận đủ phí ở trên")
    choose("Hình thức thu gia hạn", "Tiền mặt"); choose("Tài khoản nhận gia hạn", "Két tiền mặt QA")
    qa.scroll_to("Chọn hoặc thay bill gia hạn"); qa.tap("Chọn hoặc thay bill gia hạn"); qa.wait("Ảnh bill sẽ lưu")
    pick_bill()
    qa.scroll_to("Ghi chú gia hạn", upward=True)
    assert any(node.get("text") == "Native-Renewal-Retained" for node in qa.tree().iter("node"))
    qa.scroll_to("Xác nhận bill đúng giao dịch"); qa.tap("Xác nhận bill đúng giao dịch")
    qa.screenshot("28-native-renewal-reviewed-bill")
    qa.passed("Native bill upload returns to the original renewal form with entered fees/note/account retained and requires fresh review of the saved image")
    mode("lost"); confirm(); qa.wait("Đối chiếu yêu cầu gia hạn", timeout=60)
    assert stats()["writes"] == 2 and qa.fixture_stats()["financeWrites"] == before_money+2
    qa.launch(); qa.wait("Mở Đội xe", timeout=180); qa.tap("Tài khoản", bottom=True)
    qa.scroll_to("Đối chiếu gia hạn hợp đồng #4001"); qa.tap("Đối chiếu gia hạn hợp đồng #4001"); qa.tap("Đối chiếu với máy chủ")
    qa.scroll_to("Mở kết quả gia hạn hợp đồng #4001"); qa.tap("Mở kết quả gia hạn hợp đồng #4001")
    qa.wait("Gia hạn đã được ghi nhận", timeout=60)
    saved = next(row for row in stats()["receipts"] if row["id"] == 4001)
    qa.wait(f"Phiếu tiền thuê #{saved['transactionId']}")
    assert any(node.get("text", "").startswith(f"Phiếu thu ngoài #{saved['outsideTransactionId']} · ") for node in qa.tree().iter("node"))
    assert saved["transactionId"] != saved["outsideTransactionId"] and saved["totalAmount"] == 501000
    assert qa.fixture_stats()["financeBalances"]["4001"]["rentalPaid"] == 101000
    qa.screenshot("29-native-renewal-recovered"); acknowledge()
    assert stats()["writes"] == 2 and qa.fixture_stats()["financeWrites"] == before_money+2
    qa.passed("A paid renewal lost after commit recovers the exact version and separate rental/outside receipt IDs through Account and SecureStore after process termination, without a second fee or collection")

    open_contract(4001)
    qa.scroll_to("Phí gia hạn thỏa thuận (VND)"); qa.text("Phí gia hạn thỏa thuận (VND)", "2000", replace=True); qa.hide_keyboard()
    qa.scroll_to("Ghi chú gia hạn"); qa.text("Ghi chú gia hạn", "Native-Renewal-Unsent"); qa.hide_keyboard()
    mode("drop"); confirm(); qa.wait("Đối chiếu yêu cầu gia hạn", timeout=60)
    qa.tap("Đối chiếu yêu cầu gia hạn"); qa.tap("Đối chiếu gia hạn với máy chủ")
    qa.wait("Máy chủ xác nhận chưa gia hạn và đã khóa mã cũ. Nội dung được giữ để rà soát lại.")
    qa.scroll_to("Ghi chú gia hạn")
    assert any(node.get("text") == "Native-Renewal-Unsent" for node in qa.tree().iter("node"))
    assert stats()["writes"] == 2 and qa.fixture_stats()["financeWrites"] == before_money+2
    qa.screenshot("30-native-renewal-cancelled"); qa.back(); qa.tap("Rời bước gia hạn"); qa.wait("Chi tiết hợp đồng"); qa.back(); qa.tap("Tổng quan", bottom=True)
    qa.passed("Reconciliation cancels a renewal which never committed, retains its form for review and does not change the date, fee or money")
