"""Android acceptance using the loopback synthetic API, never real data.

Requires the Himoto development APK and loopback fixture server on 8091.
Metro on 8081 uses http://10.0.2.2:8091 for emulators; explicit --physical USB
testing uses http://127.0.0.1:8091 with adb reverse for both ports.
Does not clear app data, modify operational records or place telephone calls.
"""
import argparse
import hashlib
import json
import re
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect as collect_diagnostics
from lib.mobile_renewal_native import run_renewals
from lib.mobile_collection_native import run_collections
from lib.mobile_native_keyboard import keyboard_visible,own_autofill_popup

PACKAGE = "vn.himoto.staff"
LAUNCH_URL = ("exp+himoto-staff://?__expo_url=http%3A%2F%2F10.0.2.2%3A8081"
              "&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1")


class NativeQA:
    def __init__(self, adb, serial, output, customers=False, drafts=False, writes_only=False, contracts=False, finance=False, scope_recovery=False, bills=False, bill_preview_only=False, renewals=False, collections=False, physical=False,collection_recovery=False):
        if not (re.fullmatch(r"[A-Za-z0-9]{6,64}",serial) if physical else re.fullmatch(r"emulator-\d+",serial)):
            raise ValueError("Select an emulator, or explicitly opt in with --physical and an authorized USB device serial.")
        self.physical=physical
        if physical and (bills or renewals or bill_preview_only):
            raise ValueError('Physical bill/renewal picker suites need their own audited media selector; use baseline or --collections with uniquely named synthetic media.')
        self.api_origin='http://127.0.0.1:8091' if physical else 'http://10.0.2.2:8091'
        self.device_host='127.0.0.1' if physical else '10.0.2.2'
        self.launch_url=LAUNCH_URL.replace('10.0.2.2',self.device_host)
        self.adb = [str(adb), "-s", serial]
        self.output = output
        self.checks = []
        self.customers = customers
        self.drafts = drafts
        self.writes_only = writes_only
        self.contracts = contracts
        self.finance = finance
        self.scope_recovery = scope_recovery
        self.bills = bills
        self.bill_preview_only = bill_preview_only
        self.renewals = renewals
        self.collections = collections
        self.collection_recovery=collection_recovery
        if collection_recovery and not (collections and writes_only):
            raise ValueError('--collections-recovery requires --collections --writes-only and an acknowledged first QA collection')
        self.source_files = None
        if bill_preview_only and not (bills and writes_only):
            raise ValueError('--bill-preview-only requires --bills --writes-only')
        self.started_epoch = None
        if writes_only and not (customers or drafts or contracts or finance or scope_recovery or bills or renewals or collections):
            raise ValueError("--writes-only requires a selected customer/draft/contract/finance/scope workflow")
        self.output.mkdir(parents=True, exist_ok=True)

    def command(self, *args, binary=False):
        # A freshly booted emulator may reconnect adbd. Retry only inspection
        # commands; never repeat taps, text injection or other UI mutations.
        read_only = args[0] == "get-state" or args[:2] in {
            ("shell", "dumpsys"), ("shell", "cat"), ("shell", "uiautomator")}
        for attempt in range(3 if read_only else 1):
            result = subprocess.run(self.adb + list(args), capture_output=True, timeout=40)
            if not result.returncode:
                break
            if read_only and attempt < 2:
                time.sleep(2 * (attempt + 1))
        if result.returncode:
            raise RuntimeError(f"adb {args[0]} exited {result.returncode}: " +
                               result.stderr.decode("utf-8", errors="replace")[:500])
        return result.stdout if binary else result.stdout.decode("utf-8", errors="replace")

    def tree(self):
        if self.physical and own_autofill_popup(self.command('shell','dumpsys','window','windows'),PACKAGE):
            # Android 9 Autofill UI can replace the entire accessibility tree.
            # Dismiss only that known popup over Himoto, retaining the user's
            # autofill settings and never selecting a stored credential.
            self.back()
        # Never reuse an older XML file when UI Automator exits without a dump.
        # Only one UI Automator reader may run on the selected emulator at once.
        for attempt in range(3):
            dump_path = f"/data/local/tmp/himoto-qa-{time.monotonic_ns()}.xml"
            try:
                message = self.command("shell", "uiautomator", "dump", dump_path)
                if dump_path in message:
                    return ET.fromstring(self.command("shell", "cat", dump_path))
            finally:
                # Never leave personal-phone accessibility data in shared storage.
                self.command("shell", "rm", "-f", dump_path)
            if attempt < 2:
                time.sleep(2)
        raise RuntimeError("UI Automator did not produce a fresh hierarchy: " + message[:500])

    @staticmethod
    def matches(root, label):
        nodes = [node for node in root.iter("node")
                 if node.get("package") == PACKAGE and
                 (node.get("text") == label or node.get("content-desc") == label or
                  node.get("content-desc", "").startswith(label + ","))]
        visible = []
        for node in nodes:
            bounds = list(map(int, re.findall(r"-?\d+", node.get("bounds", ""))))
            if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
                visible.append(node)
        return visible

    def wait(self, label, timeout=35):
        return self.wait_any([label], timeout)

    def wait_any(self, labels, timeout=35):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            root = self.tree()
            if any(self.matches(root, label) for label in labels):
                return root
            time.sleep(0.5)
        try:
            self.screenshot("failure")
            self.output.joinpath("failure.xml").write_text(ET.tostring(root, encoding="unicode"), encoding="utf-8")
        except RuntimeError:
            if not self.physical: raise
        raise AssertionError(f"Native UI did not show any of: {labels}")

    def tap(self, label, bottom=False):
        deadline=time.monotonic()+30
        while True:
            nodes=self.matches(self.wait(label),label)
            controls=[node for node in nodes if node.get("clickable")=="true"]
            enabled=[node for node in (controls or nodes) if node.get("enabled")=="true"]
            if enabled:
                node=enabled[-1] if bottom else enabled[0]
                break
            if time.monotonic()>=deadline:raise AssertionError(f"Native action remained disabled: {label}")
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds")))
        self.command("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))

    def text(self, label, value, replace=False):
        if not re.fullmatch(r"[A-Za-z0-9-]+", value):
            raise ValueError("Only simple synthetic test strings are accepted.")
        root = self.tree()
        already_focused = any(node.get("class") == "android.widget.EditText" and
                              node.get("focused") == "true" for node in self.matches(root, label))
        if not already_focused:
            # Package presence is insufficient: UI Automator can retain hidden
            # keyboard nodes. Inspect display insets, avoiding Gboard's large
            # input_method dump, which can return exit 255 on this QA image.
            if self.keyboard_visible():
                self.back()
            self.scroll_to(label)
        # Opening the IME can move the next field between the XML dump and tap.
        # Verify actual focus before injecting text; otherwise a slow emulator
        # can append the password to the preceding username field.
        deadline = time.monotonic() + 20
        while not already_focused:
            nodes = [node for node in self.matches(self.wait(label), label)
                     if node.get("class") == "android.widget.EditText"]
            if not nodes:
                raise AssertionError(f"Native text input missing: {label}")
            x1, y1, x2, y2 = map(int, re.findall(r"\d+", nodes[0].get("bounds")))
            self.command("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
            focused = [node for node in self.matches(self.tree(), label)
                       if node.get("class") == "android.widget.EditText" and node.get("focused") == "true"]
            if focused:
                break
            if time.monotonic() >= deadline:
                raise AssertionError(f"Native text input did not receive focus: {label}")
        if replace:
            if self.physical:
                # Android 9 shell input lacks keycombination. Delete only the
                # selected Himoto QA field, after confirming its exact focus;
                # never inject shortcuts into an unknown window or keyboard.
                for attempt in range(5):
                    fields=[node for node in self.matches(self.tree(),label) if node.get('class')=='android.widget.EditText' and node.get('focused')=='true']
                    if len(fields)!=1 or len(fields[0].get('text',''))>2000:
                        raise AssertionError('Cannot safely replace the focused Himoto QA field')
                    previous=fields[0].get('text','')
                    if not previous:break
                    self.command('shell','input','keyevent','KEYCODE_MOVE_END')
                    deletes=['KEYCODE_DEL']*(len(previous)+1)
                    for start in range(0,len(deletes),100):
                        self.command('shell','input','keyevent',*deletes[start:start+100])
                    # Let the controlled RN field commit before inspecting it.
                    # An older IME can collapse a burst of synthetic Delete
                    # events; never append the intended value to leftover text.
                else:
                    raise AssertionError('The focused Himoto QA field did not clear; no replacement text was injected')
            else:
                self.command("shell", "input", "keycombination", "KEYCODE_CTRL_LEFT", "KEYCODE_A")
                self.command("shell", "input", "keyevent", "KEYCODE_DEL")
        self.command("shell", "input", "keyevent", "KEYCODE_MOVE_END")
        self.command("shell", "input", "text", value)
        if replace:
            assert any(node.get("text") == value for node in self.matches(self.tree(), label)), f"Input replacement did not take effect: {label}"

    def keyboard_visible(self):
        displays=self.command("shell","dumpsys","window","displays")
        if re.search(r"type=ime[^\n]*\bvisible=(true|false)",displays):
            return keyboard_visible(displays)
        return keyboard_visible(displays,self.command("shell","dumpsys","input_method"))

    def hide_keyboard(self):
        # AOSP/physical keyboards can already be hidden after Next or typing.
        # A blind Back would navigate away and invalidate the write scenario.
        if self.keyboard_visible():
            self.back()

    def back(self):
        self.command("shell", "input", "keyevent", "4")

    def screenshot(self, name):
        if self.physical:
            windows=self.command('shell','dumpsys','window','windows')
            if not re.search(r'mCurrentFocus=Window\{[^\n}]*\s'+re.escape(PACKAGE)+r'/',windows):
                raise RuntimeError('Physical-device screenshots are limited to the Himoto app')
        self.output.joinpath(name + ".png").write_bytes(self.command("exec-out", "screencap", "-p", binary=True))

    def scroll_to(self, label, upward=False):
        for _ in range(8):
            root = self.tree()
            controls = [node for node in self.matches(root, label)
                        if node.get("clickable") == "true" or node.get("class") == "android.widget.EditText"]
            if any((int(re.findall(r"\d+", node.get("bounds"))[3]) -
                    int(re.findall(r"\d+", node.get("bounds"))[1])) >= 48 for node in controls):
                return
            bounds = next(root.iter("node")).get("bounds")
            _, _, width, height = map(int, re.findall(r"\d+", bounds))
            start, end = (.35, .72) if upward else (.72, .35)
            self.command("shell", "input", "swipe", str(width//2), str(int(height*start)), str(width//2), str(int(height*end)), "350")
        raise AssertionError(f"Native form cannot scroll to: {label}")

    def fixture_stats(self):
        with urllib.request.urlopen("http://127.0.0.1:8091/__fixture_state", timeout=5) as response:
            result = json.load(response)
        assert result["fixtureOnly"] is True
        return result

    def customer_flow(self):
        before = self.fixture_stats()
        self.tap("Khách hàng", bottom=True)
        self.tap("Thêm khách hàng")
        self.wait("Lưu khách hàng")
        self.scroll_to("Trạng thái hồ sơ")
        self.tap("Trạng thái hồ sơ")
        self.tap("Chưa hoàn tất")
        self.scroll_to("Họ và tên")
        self.text("Họ và tên", "Native-Form-QA")
        self.text("Số điện thoại", "0901122334")
        self.back()
        self.scroll_to("Giấy tờ")
        self.tap("Giấy tờ")
        self.scroll_to("Ngày cấp giấy tờ")
        self.tap("Ngày cấp giấy tờ")
        root = self.tree()
        positive = [node for node in root.iter("node") if node.get("resource-id") == "android:id/button1"]
        assert positive, "Android system date picker did not open"
        x1,y1,x2,y2 = map(int,re.findall(r"\d+",positive[0].get("bounds")))
        self.command("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2))
        self.screenshot("07-native-customer-date")
        self.tap("Lưu khách hàng")
        self.wait("Native-Form-QA", timeout=60)
        self.screenshot("08-created-customer")
        assert self.fixture_stats()["customerCreates"] == before["customerCreates"] + 1
        self.passed("The native customer form uses Android's date picker and creates a branch-scoped incomplete profile")

        self.tap("Sửa hồ sơ khách hàng")
        self.wait("Lưu thay đổi")
        self.text("Họ và tên", "-Edited")
        self.back()
        self.tap("Lưu thay đổi")
        self.wait("Native-Form-QA-Edited", timeout=60)
        assert self.fixture_stats()["customerUpdates"] == before["customerUpdates"] + 1
        self.passed("Native editing loads the existing profile and saves through its revision-bound mutation")
        self.back()

        self.tap("Thêm khách hàng")
        self.wait("Lưu khách hàng")
        self.scroll_to("Trạng thái hồ sơ")
        self.tap("Trạng thái hồ sơ")
        self.tap("Chưa hoàn tất")
        self.scroll_to("Họ và tên")
        self.text("Họ và tên", "Native-Lost-Response")
        self.back()
        self.tap("Lưu khách hàng")
        self.wait("Kiểm tra lần lưu trước", timeout=60)
        after_commit = self.fixture_stats()["customerCreates"]
        self.launch()
        self.wait("Mở Khách hàng", timeout=180)
        self.tap("Mở Khách hàng")
        self.tap("Thêm khách hàng")
        self.wait("Lần lưu trước đã thành công", timeout=60)
        self.screenshot("09-recovered-customer-write")
        self.tap("Xem hồ sơ đã lưu")
        self.wait("Native-Lost-Response", timeout=60)
        assert self.fixture_stats()["customerCreates"] == after_commit
        self.passed("A committed write with a failed response is recovered from SecureStore after process termination without creating twice")
        self.back()
        self.tap("Tổng quan", bottom=True)

    def confirm_system_picker(self):
        root = self.tree()
        positive = [node for node in root.iter("node") if node.get("resource-id") == "android:id/button1"]
        assert positive, "Android system date/time picker did not open"
        x1,y1,x2,y2 = map(int,re.findall(r"\d+",positive[0].get("bounds")))
        self.command("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2))

    def draft_flow(self):
        before = self.fixture_stats()
        self.tap("Hợp đồng", bottom=True)
        self.tap("Thêm bản nháp")
        self.wait("Lưu nháp")
        self.text("Số hợp đồng giấy", "90001")
        self.back()
        self.tap("Bước 3: Phương tiện")
        self.scroll_to("Ngày nhận xe")
        self.tap("Ngày nhận xe")
        self.confirm_system_picker()
        self.scroll_to("Giờ nhận xe")
        self.tap("Giờ nhận xe")
        self.confirm_system_picker()
        self.screenshot("10-draft-native-time")
        self.tap("Bước 2: Khách hàng")
        self.tap("Chọn hồ sơ khách")
        self.tap("Chọn khách Khách QA 1, QA-001")
        self.scroll_to("Dùng hồ sơ đã chọn")
        self.tap("Dùng hồ sơ đã chọn")
        self.tap("Bước 3: Phương tiện")
        self.tap("Thêm xe vào bản nháp")
        self.tap("Chọn xe QA-001")
        self.tap("Lưu nháp")
        self.wait("Tiếp tục soạn hợp đồng", timeout=60)
        saved = self.fixture_stats()
        assert saved["draftCreates"] == before["draftCreates"] + 1
        assert saved["drafts"][-1]["vehicleIds"] == ["301"]
        assert saved["drafts"][-1]["customerId"] == 1
        assert saved["drafts"][-1]["startsAt"].endswith("T08:00")
        self.screenshot("11-native-saved-draft")
        self.passed("The native composer opens Android date/time pickers, confirms a customer, selects stock and creates one draft")

        self.tap("Tiếp tục soạn hợp đồng")
        self.wait("Lưu nháp")
        self.text("Số hợp đồng giấy", "1")
        self.back()
        self.back()
        self.wait("Rời bản nháp?")
        self.tap("Tiếp tục chỉnh sửa")
        self.tap("Lưu nháp")
        self.wait("Tiếp tục soạn hợp đồng", timeout=60)
        assert self.fixture_stats()["draftUpdates"] == before["draftUpdates"] + 1
        self.passed("Native reopening preserves the draft; hardware Back can cancel leaving before a revision-bound update")
        self.back()

        self.tap("Thêm bản nháp")
        self.wait("Lưu nháp")
        self.text("Số hợp đồng giấy", "90003")
        self.back()
        self.tap("Lưu nháp")
        self.wait("Kiểm tra lần lưu trước", timeout=60)
        committed = self.fixture_stats()["draftCreates"]
        self.launch()
        self.wait("Mở Đội xe", timeout=180)
        self.tap("Hợp đồng", bottom=True)
        self.tap("Thêm bản nháp")
        root = self.wait("Lần lưu trước đã thành công", timeout=60)
        save_nodes = [node for node in self.matches(root, "Lưu nháp") if node.get("class") == "android.widget.Button"]
        assert save_nodes and all(node.get("enabled") == "false" for node in save_nodes)
        self.screenshot("12-native-recovered-draft")
        self.back()
        self.tap("Tài khoản", bottom=True)
        self.tap("Đăng xuất")
        self.wait("Đăng nhập")
        self.text("Tài khoản", "qa")
        self.command("shell", "input", "keyevent", "66")
        self.text("Mật khẩu", "fixture-password")
        self.back()
        self.tap("Đăng nhập")
        self.wait("Mở Đội xe")
        self.tap("Hợp đồng", bottom=True)
        self.tap("Thêm bản nháp")
        self.wait("Lần lưu trước đã thành công", timeout=60)
        self.tap("Xem bản nháp đã lưu")
        self.wait("Tiếp tục soạn hợp đồng", timeout=60)
        assert self.fixture_stats()["draftCreates"] == committed
        self.passed("A committed draft with a failed response survives process termination and sign-out/sign-in in SecureStore without a duplicate")
        self.back()
        self.tap("Tổng quan", bottom=True)

    def contract_flow(self):
        before=self.fixture_stats()
        def open_record(code,action):
            self.tap("Hợp đồng",bottom=True)
            root=self.tree()
            if self.matches(root,"Xóa tìm kiếm"):
                self.tap("Xóa tìm kiếm")
            self.text("Tìm hợp đồng",code)
            self.back()
            self.tap(f"Xem {code}, Khách hợp đồng QA")
            self.tap(action)
        def collection(amount):
            self.scroll_to("Thêm khoản thực nhận")
            self.tap("Thêm khoản thực nhận")
            self.text("Số tiền khoản 1 (VND)",amount)
            self.back()
            self.scroll_to("Tài khoản nhận khoản 1")
            self.tap("Tài khoản nhận khoản 1")
            self.tap("Ngân hàng cá nhân QA")
        open_record("NHAP-3001","Rà soát và phát hành")
        self.wait("Phát hành và giao xe")
        self.scroll_to("Bổ sung bản nháp")
        self.tap("Bổ sung bản nháp")
        self.wait("Lưu nháp")
        self.tap("Bước 3: Phương tiện")
        self.scroll_to("Đồng bộ lịch các xe")
        self.tap("Đồng bộ lịch các xe")
        self.tap("Áp dụng lịch hợp đồng")
        self.tap("Lưu nháp")
        self.wait("Rà soát và phát hành")
        self.tap("Rà soát và phát hành")
        collection("100000")
        self.tap("Phát hành và giao xe")
        self.tap("Phát hành và giao xe")
        self.wait("Chi tiết hợp đồng",timeout=60)
        self.wait("HD-QA-3001")
        assert self.fixture_stats()["collectionsCount"]==before["collectionsCount"]+1
        self.screenshot("13-native-issued-contract")
        self.passed("Native legacy-window review, alignment confirmation, keyboard amount entry and account selection produce one issued contract/collection")
        self.back()
        open_record("NHAP-3002","Rà soát và phát hành")
        self.tap("Cách phát hành")
        self.tap("Nhận cọc giữ xe")
        collection("150000")
        self.tap("Nhận cọc giữ xe")
        self.tap("Nhận cọc giữ xe")
        self.wait("Kiểm tra lần xác nhận trước",timeout=60)
        committed=self.fixture_stats()["collectionsCount"]
        self.launch()
        self.wait("Mở Đội xe",timeout=180)
        open_record("HD-QA-3002","Xác nhận giao xe giữ chỗ")
        self.wait("Lần xác nhận trước đã thành công",timeout=60)
        self.screenshot("14-native-recovered-reservation")
        self.tap("Xem hợp đồng đã xác nhận")
        self.wait("Xác nhận giao xe giữ chỗ")
        assert self.fixture_stats()["collectionsCount"]==committed
        self.passed("A committed reservation with a failed response recovers its contract action receipt from SecureStore after process termination without collecting twice")
        self.tap("Xác nhận giao xe giữ chỗ")
        self.wait("Xác nhận giao xe")
        self.tap("Xác nhận giao xe")
        self.tap("Xác nhận giao xe")
        self.wait("Chi tiết hợp đồng",timeout=60)
        self.wait("HD-QA-3002")
        stats=self.fixture_stats()
        assert stats["contractStatuses"]["3002"]=="renting" and stats["collectionsCount"]==committed
        self.screenshot("15-native-handover")
        self.passed("Native handover changes the reservation to renting while preserving the already collected advance")
        self.back()
        open_record("NHAP-3005","Rà soát và phát hành")
        self.tap("Phát hành và giao xe")
        self.tap("Phát hành và giao xe")
        self.wait("Kiểm tra lần xác nhận trước",timeout=60)
        self.launch()
        self.wait("Mở Đội xe",timeout=180)
        self.tap("Tài khoản",bottom=True)
        self.scroll_to("Đối chiếu phát hành hợp đồng #3005")
        self.tap("Đối chiếu phát hành hợp đồng #3005")
        self.tap("Tiếp tục chỉnh sửa")
        assert self.fixture_stats()["resolutionCalls"]==0
        self.tap("Đối chiếu phát hành hợp đồng #3005")
        self.tap("Đối chiếu với máy chủ")
        self.wait("Không có thao tác chờ đối chiếu trong phạm vi này.")
        stats=self.fixture_stats()
        assert stats["tombstones"]==1 and stats["contractActions"]==before["contractActions"]+3
        self.screenshot("16-native-cancelled-request")
        self.passed("An uncommitted financial request survives process termination in SecureStore and is resolved from Account only after confirmation; no money or contract is written")
        open_record("NHAP-3006","Rà soát và phát hành")
        self.tap("Phát hành và giao xe")
        self.tap("Phát hành và giao xe")
        self.wait("Kiểm tra lần xác nhận trước",timeout=60)
        self.launch()
        self.wait("Mở Đội xe",timeout=180)
        self.tap("Tài khoản",bottom=True)
        self.scroll_to("Đối chiếu phát hành hợp đồng #3006")
        self.tap("Đối chiếu phát hành hợp đồng #3006")
        self.tap("Đối chiếu với máy chủ")
        self.scroll_to("Mở kết quả phát hành hợp đồng #3006")
        self.screenshot("17-native-resolved-commit")
        self.tap("Mở kết quả phát hành hợp đồng #3006")
        self.wait("Chi tiết hợp đồng",timeout=60)
        self.wait("HD-QA-3006")
        stats=self.fixture_stats()
        assert stats["contractActions"]==before["contractActions"]+4 and stats["collectionsCount"]==committed
        self.passed("Account resolution recovers the committed contract after process termination, opens its saved receipt and never creates a second collection")
        self.back()
        self.tap("Tổng quan",bottom=True)

    def finance_flow(self):
        before = self.fixture_stats()
        def choose(label, value):
            self.scroll_to(label); self.tap(label); self.tap(value)
        def enter(amount, purpose="Thu tiền thuê / công nợ", method="cash", note=None, dates=False):
            self.scroll_to("Ghi nhận thu/chi"); self.tap("Ghi nhận thu/chi")
            self.wait("Ghi nhận khoản thu/chi")
            choose("Nghiệp vụ thu/chi", purpose)
            self.text("Số tiền thực thu/chi (VND)", amount); self.back()
            choose("Hình thức thu/chi", {"cash":"Tiền mặt", "transfer":"CK tài khoản cá nhân", "company_transfer":"CK tài khoản công ty"}[method])
            choose("Tài khoản thực chi" if purpose in ("Trả cọc cho khách", "Hoàn tiền thuê trả sớm") else "Tài khoản thực nhận", {"cash":"Két tiền mặt QA", "transfer":"Ngân hàng cá nhân QA", "company_transfer":"Ngân hàng công ty QA"}[method])
            if dates:
                self.scroll_to("Ngày thực thu/chi"); self.tap("Ngày thực thu/chi"); self.confirm_system_picker()
                self.scroll_to("Giờ thực thu/chi"); self.tap("Giờ thực thu/chi")
                self.screenshot("21-native-finance-time-picker"); self.confirm_system_picker()
            if note:
                self.text("Nội dung thu/chi", note); self.back()
        def confirm():
            self.tap("Ghi nhận khoản thu/chi")
            self.scroll_to("Xác nhận đã thu/chi"); self.tap("Xác nhận đã thu/chi")
        def acknowledge(transaction):
            self.wait("Thu/chi đã được ghi nhận", timeout=60)
            self.wait(f"Phiếu #{transaction}")
            self.tap("Xem lịch sử thu/chi")
            self.wait("Thu/chi hợp đồng")
        self.tap("Hợp đồng", bottom=True)
        if self.matches(self.tree(), "Xóa tìm kiếm"): self.tap("Xóa tìm kiếm")
        self.text("Tìm hợp đồng", "HD-QA-4001"); self.back()
        self.tap("Xem HD-QA-4001, Khách hợp đồng QA"); self.tap("Thu/chi hợp đồng")
        self.wait("Giá trị hợp đồng")
        enter("100000", method="company_transfer", dates=True); confirm(); acknowledge(9001)
        assert self.fixture_stats()["financeWrites"] == before["financeWrites"]+1
        self.screenshot("18-native-finance-receipt")
        self.passed("Native financial review, date/time pickers, keyboard amount entry and company-bank selection return the exact recorded receipt")

        enter("10000", "Thu cọc còn thiếu", "cash"); confirm(); acknowledge(9002)
        enter("10000", "Trả cọc cho khách", "transfer"); confirm(); acknowledge(9003)
        enter("1000", "Hoàn tiền thuê trả sớm", "cash"); confirm(); acknowledge(9004)
        stats = self.fixture_stats()
        assert stats["financeWrites"] == before["financeWrites"]+4 and stats["financeBalances"]["4001"]["depositHeld"] == 100000 and stats["financeBalances"]["4001"]["rentalPaid"] == 199000
        self.passed("Native deposit collection and both refund purposes keep cash/personal-bank IDs and deposit/rental balances distinct")

        enter("400000"); confirm(); acknowledge(9005)
        stats = self.fixture_stats()
        assert stats["financeBalances"]["4001"]["totalAmount"] == 599000 and stats["financeBalances"]["4001"]["rentalPaid"] == 599000
        self.passed("Native over-collection follows the explicit confirmation and the shared total-increase rule")

        enter("1000", "Thu thêm khoản khác", note="Native-Finance-Lost"); confirm()
        self.scroll_to("Đối chiếu yêu cầu thu/chi")
        resolve_nodes = [node for node in self.matches(self.tree(), "Đối chiếu yêu cầu thu/chi") if node.get("clickable") == "true"]
        assert resolve_nodes and resolve_nodes[0].get("enabled") == "true" and resolve_nodes[0].get("content-desc") == "Đối chiếu yêu cầu thu/chi", "The settled financial action must expose its current accessible name, not a stale busy description"
        assert self.fixture_stats()["financeWrites"] == before["financeWrites"]+6
        self.launch(); self.wait("Mở Đội xe", timeout=180)
        self.tap("Tài khoản", bottom=True)
        self.scroll_to("Đối chiếu ghi thu/chi hợp đồng #4001"); self.tap("Đối chiếu ghi thu/chi hợp đồng #4001")
        self.tap("Đối chiếu với máy chủ")
        self.scroll_to("Mở kết quả ghi thu/chi hợp đồng #4001"); self.tap("Mở kết quả ghi thu/chi hợp đồng #4001")
        self.screenshot("19-native-recovered-finance")
        acknowledge(9006)
        assert self.fixture_stats()["financeWrites"] == before["financeWrites"]+6
        self.passed("A committed financial request survives process termination and recovers its exact receipt through Account without another collection")

        enter("1000", "Thu thêm khoản khác", note="Native-Finance-Unsent"); confirm()
        self.scroll_to("Đối chiếu yêu cầu thu/chi")
        self.launch(); self.wait("Mở Đội xe", timeout=180)
        self.tap("Tài khoản", bottom=True)
        self.scroll_to("Đối chiếu ghi thu/chi hợp đồng #4001"); self.tap("Đối chiếu ghi thu/chi hợp đồng #4001")
        self.tap("Đối chiếu với máy chủ")
        self.wait("Không có thao tác chờ đối chiếu trong phạm vi này.")
        stats = self.fixture_stats()
        assert stats["financeWrites"] == before["financeWrites"]+6 and stats["tombstones"] == before["tombstones"]+1
        self.screenshot("20-native-cancelled-finance")
        self.passed("An uncommitted financial request retains its key through process termination and is cancelled only by server-confirmed reconciliation")
        self.tap("Tổng quan", bottom=True)

    def scope_recovery_flow(self):
        before = self.fixture_stats()
        assert before["userAllStores"] is False, "Use a fresh branch-scoped fixture for scope acceptance"
        self.tap("Hợp đồng", bottom=True)
        if self.matches(self.tree(), "Xóa tìm kiếm"): self.tap("Xóa tìm kiếm")
        self.text("Tìm hợp đồng", "HD-QA-4002"); self.back()
        self.tap("Xem HD-QA-4002, Khách hợp đồng QA"); self.tap("Thu/chi hợp đồng")
        self.scroll_to("Ghi nhận thu/chi"); self.tap("Ghi nhận thu/chi")
        self.scroll_to("Nghiệp vụ thu/chi"); self.tap("Nghiệp vụ thu/chi"); self.tap("Thu thêm khoản khác")
        self.text("Số tiền thực thu/chi (VND)", "1000"); self.back()
        self.scroll_to("Hình thức thu/chi"); self.tap("Hình thức thu/chi"); self.tap("Tiền mặt")
        self.scroll_to("Tài khoản thực nhận"); self.tap("Tài khoản thực nhận"); self.tap("Két tiền mặt QA")
        self.text("Nội dung thu/chi", "Native-Finance-Lost"); self.back()
        self.tap("Ghi nhận khoản thu/chi"); self.scroll_to("Xác nhận đã thu/chi"); self.tap("Xác nhận đã thu/chi")
        self.scroll_to("Đối chiếu yêu cầu thu/chi")
        committed = self.fixture_stats()["financeWrites"]
        assert committed == before["financeWrites"]+1
        request = urllib.request.Request("http://127.0.0.1:8091/__fixture_scope", data=json.dumps({"allStores": True}).encode(), headers={"Content-Type":"application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=5) as response:
            assert json.load(response) == {"fixtureOnly": True, "allStores": True}
        self.launch(); self.wait("Mở Đội xe", timeout=180)
        self.tap("Hợp đồng", bottom=True)
        self.text("Tìm hợp đồng", "HD-QA-4002"); self.back()
        self.tap("Xem HD-QA-4002, Khách hợp đồng QA"); self.tap("Thu/chi hợp đồng")
        self.scroll_to("Ghi nhận thu/chi"); self.tap("Ghi nhận thu/chi")
        self.wait("Thu/chi đã được ghi nhận", timeout=60)
        self.wait("Phiếu #9001")
        self.screenshot("22-native-scope-recovered-payment")
        self.tap("Xem lịch sử thu/chi")
        stats = self.fixture_stats()
        assert stats["financeWrites"] == committed and stats["userAllStores"] is True
        self.passed("The same actor recovers the original financial UUID/receipt from SecureStore after a branch-to-all-stores grant change and process restart, without another payment")
        self.back(); self.wait("Chi tiết hợp đồng"); self.back()
        self.tap("Tổng quan", bottom=True)

    def bills_flow(self):
        def stats():
            with urllib.request.urlopen("http://127.0.0.1:8091/__fixture_bills",timeout=5) as response:
                return json.load(response)
        def mode(value):
            request=urllib.request.Request("http://127.0.0.1:8091/__fixture_bill_mode",data=json.dumps({"mode":value}).encode(),headers={"Content-Type":"application/json"},method="POST")
            with urllib.request.urlopen(request,timeout=5) as response:
                assert json.load(response)=={"fixtureOnly":True,"mode":value}
        def open_bill():
            self.scroll_to("Bill gia hạn");self.tap("Bill gia hạn");self.wait("Ảnh bill sẽ lưu")
        def pick():
            self.scroll_to("Chọn ảnh bill");self.tap("Chọn ảnh bill")
            deadline=time.monotonic()+60
            while time.monotonic()<deadline:
                root=self.tree()
                candidates=[node for node in root.iter("node") if node.get("package") not in (PACKAGE,"com.android.systemui") and
                    (re.search(r":id/(?:icon_thumbnail|thumbnail|doc_thumb)$",node.get("resource-id","")) or
                     "Photo taken on" in node.get("content-desc","") or "mobile-bill-qa" in (node.get("text","")+node.get("content-desc","")))]
                if candidates:
                    self.output.joinpath("bill-system-picker.xml").write_text(ET.tostring(root,encoding="unicode"),encoding="utf-8")
                    node=candidates[0];bounds=list(map(int,re.findall(r"\d+",node.get("bounds"))))
                    self.command("shell","input","tap",str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2));break
                time.sleep(.5)
            else:
                self.output.joinpath("bill-system-picker.xml").write_text(ET.tostring(root,encoding="unicode"),encoding="utf-8")
                self.screenshot("bill-system-picker");raise AssertionError("Cannot find the synthetic image in the system photo picker")
            self.scroll_to("Xem lớn Ảnh bill đang chọn")
            root=self.tree()
            text=" ".join(node.get("text","") for node in root.iter("node"))
            sizes=re.search(r"(\d+) × (\d+) · (\d+) KB",text)
            assert sizes and max(int(sizes[1]),int(sizes[2]))==2200 and int(sizes[3])<=2048,text[-1000:]
        def confirm():
            self.tap("Lưu ảnh bill");self.scroll_to("Xác nhận lưu bill");self.tap("Xác nhận lưu bill")
        def acknowledge():
            self.wait("Bill đã được lưu",timeout=60);self.tap("Xác nhận đã kiểm tra bill");self.wait("Chi tiết hợp đồng")
        before_money=self.fixture_stats()["financeWrites"]
        before_bills=stats()["writes"]
        if not self.bill_preview_only:assert before_bills==0,"Use a fresh bill fixture"
        subprocess.run(["node","scripts/generate-mobile-bill-fixture.cjs"],check=True,capture_output=True)
        self.command("push",".backups/mobile-bill-qa.png","/sdcard/Pictures/mobile-bill-qa.png")
        self.command("shell","am","broadcast","-a","android.intent.action.MEDIA_SCANNER_SCAN_FILE","-d","file:///sdcard/Pictures/mobile-bill-qa.png")
        self.tap("Hợp đồng",bottom=True)
        if self.matches(self.tree(),"Xóa tìm kiếm"):self.tap("Xóa tìm kiếm")
        self.text("Tìm hợp đồng","HD-QA-4001");self.back();self.tap("Xem HD-QA-4001, Khách hợp đồng QA");open_bill()
        if self.bill_preview_only:
            pick();self.scroll_to("Xem lớn Ảnh bill đang chọn");self.tap("Xem lớn Ảnh bill đang chọn");self.tap("Phóng to")
            self.wait("Đóng ảnh bill");self.wait("Thu nhỏ");self.screenshot("26-native-bill-toolbar")
            self.output.joinpath("viewer.xml").write_text(ET.tostring(self.tree(),encoding="unicode"),encoding="utf-8")
            self.back();self.wait("Lưu ảnh bill");self.back();self.tap("Rời bước bill");self.wait("Chi tiết hợp đồng");self.back();self.tap("Tổng quan",bottom=True)
            assert stats()["writes"]==before_bills and self.fixture_stats()["financeWrites"]==before_money
            self.passed("The corrected zoom viewport retains its close/zoom toolbar, supports Back/discard and performs no upload or financial action")
            return
        self.scroll_to("Chụp ảnh bill");self.tap("Chụp ảnh bill")
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            root=self.tree();denied=[node for node in root.iter("node") if node.get("resource-id","").endswith(":id/permission_deny_button")]
            if denied:
                bounds=list(map(int,re.findall(r"\d+",denied[0].get("bounds"))))
                self.command("shell","input","tap",str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2));break
            time.sleep(.5)
        else:raise AssertionError("Fresh APK must request camera permission before accessing the camera")
        self.wait("Chưa được cấp quyền camera. Có thể chọn ảnh đã có hoặc cấp quyền camera trong Cài đặt điện thoại.")
        self.scroll_to("Chọn ảnh bill");self.tap("Chọn ảnh bill")
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if any("providers.media" in node.get("package","") or "documentsui" in node.get("package","").lower() for node in self.tree().iter("node")):break
        else:raise AssertionError("System photo picker did not open")
        self.back();self.wait("Lưu ảnh bill")
        assert stats()["writes"]==0
        self.passed("Native camera permission denial and system photo-picker cancellation preserve the bill state and perform no upload")
        pick();self.scroll_to("Xem lớn Ảnh bill đang chọn");self.tap("Xem lớn Ảnh bill đang chọn");self.tap("Phóng to");self.screenshot("23-native-bill-preview");self.back()
        confirm();self.wait("Bill đã được lưu",timeout=60)
        saved=stats();assert saved["writes"]==1 and saved["images"][0]["bytes"]<=2097152
        image=saved["images"][0]
        request=urllib.request.Request(f"http://127.0.0.1:8091/api/mobile/v1/contracts/4001/renewals/2/bill?revision={image['photoRevision']}",headers={"Authorization":"Bearer hm1_"+"a"*43})
        with urllib.request.urlopen(request,timeout=10) as response:self.output.joinpath("native-prepared-bill.jpg").write_bytes(response.read())
        decoded=subprocess.run(["node","scripts/check-mobile-bill-image.cjs",str(self.output/"native-prepared-bill.jpg")],capture_output=True,text=True,check=True)
        self.output.joinpath("native-codec-results.json").write_text(decoded.stdout,encoding="utf-8")
        assert self.fixture_stats()["financeWrites"]==before_money
        self.screenshot("24-native-bill-receipt");acknowledge()
        self.passed("The system picker and native codec downsample a 3600x2400 synthetic bill to a decodable 2200px JPEG under 2 MiB; zoom/review and exact image receipt work without recording money")
        open_bill();pick();mode("lost");confirm();self.scroll_to("Đối chiếu yêu cầu lưu bill")
        assert stats()["writes"]==2
        self.launch();self.wait("Mở Đội xe",timeout=180);self.tap("Tài khoản",bottom=True)
        self.scroll_to("Đối chiếu lưu bill gia hạn hợp đồng #4001");self.tap("Đối chiếu lưu bill gia hạn hợp đồng #4001");self.tap("Đối chiếu với máy chủ")
        self.scroll_to("Mở kết quả lưu bill gia hạn hợp đồng #4001");self.tap("Mở kết quả lưu bill gia hạn hợp đồng #4001")
        self.wait("Bill đã được lưu",timeout=60);self.screenshot("25-native-recovered-bill");acknowledge();assert stats()["writes"]==2
        self.passed("An uploaded bill with a lost response survives process restart and is recovered through Account without replacing or uploading it twice")
        open_bill();pick();mode("drop");confirm();self.scroll_to("Đối chiếu yêu cầu lưu bill")
        self.launch();self.wait("Mở Đội xe",timeout=180);self.tap("Tài khoản",bottom=True)
        self.scroll_to("Đối chiếu lưu bill gia hạn hợp đồng #4001");self.tap("Đối chiếu lưu bill gia hạn hợp đồng #4001");self.tap("Đối chiếu với máy chủ")
        self.wait("Không có thao tác chờ đối chiếu trong phạm vi này.")
        assert stats()["writes"]==2 and self.fixture_stats()["financeWrites"]==before_money
        self.passed("A bill request dropped before commit retains its UUID across process loss and is cancelled by server confirmation without changing the existing image or any money")
        self.tap("Tổng quan",bottom=True)

    def launch(self):
        self.command("shell", "am", "force-stop", PACKAGE)
        self.command("shell", f"am start -W -a android.intent.action.VIEW -d '{self.launch_url}' -p {PACKAGE}")

    def passed(self, message):
        self.checks.append(message)
        print(message, flush=True)

    def verify_device_network(self):
        # boot_completed does not guarantee the emulator network is usable yet.
        # Probe both loopback-only services from the device before launching the
        # development client. This never retries an app write or UI action.
        for port, path, marker in [(8081, "/status", b"packager-status:running"),
                                   (8091, "/health", b'"fixtureOnly": true')]:
            deadline = time.monotonic() + 60
            while True:
                # Generate CRLF on-device: Windows adb's shell stdin may alter
                # line endings, which Node correctly rejects as malformed HTTP.
                request=f"printf 'GET {path} HTTP/1.0\\r\\n\\r\\n'"
                # Samsung Android 9 netcat closes before reading a response
                # when its pipe reaches EOF. Keep only the read-only probe's
                # input open briefly; never retry an application write.
                if self.physical:
                    request=f"({request}; sleep 2)"
                probe = f"{request} | toybox nc -w 5 {self.device_host} {port}"
                result = subprocess.run(self.adb + ["shell", probe], capture_output=True, timeout=10)
                if result.returncode == 0 and marker in result.stdout:
                    break
                if time.monotonic() >= deadline:
                    raise AssertionError(f"QA device cannot reach the verified fixture service on {port}")
                time.sleep(2)
        print("QA device can reach Metro and the synthetic API", flush=True)

    def run(self):
        print("Checking fixture configuration and preparing the Android development bundle", flush=True)
        with urllib.request.urlopen("http://127.0.0.1:8091/health", timeout=5) as response:
            assert json.load(response) == {"fixtureOnly": True}
        # Check the actual transformed client configuration before entering any
        # credentials. A fixture server running nearby does not prove that Metro
        # points at it. Refuse production/misconfigured bundles.
        bundle_url = ("http://127.0.0.1:8081/src/providers/session.bundle?platform=android"
                      "&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0")
        with urllib.request.urlopen(bundle_url, timeout=180) as response:
            bundle = response.read().decode("utf-8")
        inline_origin = re.search(r"apiOrigin[\s\S]{0,150}['\"]"+re.escape(self.api_origin)+r"['\"]", bundle)
        hmr_origin = re.search(r"['\"]EXPO_PUBLIC_API_URL['\"]:\s*\{[^}]{0,100}value:\s*['\"]"+re.escape(self.api_origin)+r"['\"]", bundle)
        if not (inline_origin or hmr_origin):
            raise AssertionError("Metro must compile the local fixture API origin for native QA.")
        # Prepare the full Hermes development entry before UI timing begins.
        # On the 8-GB Windows host its first cold compilation exceeded 5 minutes.
        entry_url = ("http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android"
                     "&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1"
                     "&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable")
        with urllib.request.urlopen(entry_url, timeout=600) as response:
            entry_sha = hashlib.sha256()
            while chunk := response.read(65536):
                entry_sha.update(chunk)
        print("Android development bundle ready", flush=True)
        assert self.command("get-state").strip() == "device"
        assert "package:" in self.command("shell", "pm", "path", PACKAGE)
        self.command("reverse", "tcp:8081", "tcp:8081")
        if self.physical:
            self.command("reverse","tcp:8091","tcp:8091")
        self.verify_device_network()
        self.source_files = capture(self, entry_sha.hexdigest())
        self.started_epoch = int(self.command("shell", "date", "+%s").strip())
        self.launch()
        if self.writes_only:
            # Iterative write acceptance reuses only the synthetic QA session.
            # Full sign-in/catalogue regression remains the default mode.
            if self.scope_recovery or self.bills or self.renewals or self.collections:
                current = self.wait_any(["Mở Đội xe", "Đăng nhập"], timeout=180)
                if self.matches(current, "Đăng nhập"):
                    self.text("Tài khoản", "qa")
                    self.command("shell", "input", "keyevent", "66")
                    self.text("Mật khẩu", "fixture-password"); self.hide_keyboard()
                    self.tap("Đăng nhập")
            self.wait("Mở Đội xe", timeout=180)
            self.wait("QA Quản lý")
            if self.customers:
                self.customer_flow()
            if self.drafts:
                self.draft_flow()
            if self.contracts:
                self.contract_flow()
            if self.finance:
                self.finance_flow()
            if self.scope_recovery:
                self.scope_recovery_flow()
            if self.bills:
                self.bills_flow()
            if self.renewals:
                run_renewals(self)
            if self.collections:
                run_collections(self,recovery_only=self.collection_recovery)
            return self.finish()
        initial = self.wait_any(["Đăng nhập", "Mở Đội xe"], timeout=180)
        if self.matches(initial, "Mở Đội xe"):
            # A previous interrupted run may leave a fixture login. End that QA
            # session through the UI without wiping any device data.
            self.wait("QA Quản lý")
            self.tap("Tài khoản", bottom=True)
            self.scroll_to("Đăng xuất")
            self.tap("Đăng xuất")
            self.wait("Đăng nhập")
        self.screenshot("01-login")
        self.passed("The installed native APK opens the protected login screen")

        self.tap("Đăng nhập")
        self.wait("Nhập tài khoản và mật khẩu để tiếp tục.")
        self.passed("Empty credentials show an actionable validation message")
        self.text("Tài khoản", "qa")
        self.command("shell", "input", "keyevent", "66")  # Native keyboard Next focuses the password.
        self.text("Mật khẩu", "fixture-password")
        self.hide_keyboard()
        self.tap("Đăng nhập")
        self.wait("Mở Đội xe")
        self.wait("QA Quản lý")
        self.screenshot("02-overview")
        self.passed("Native keyboard entry and fixture sign-in reach the scoped overview")

        self.tap("Mở Đội xe")
        self.wait("Xem QA-001, Xe QA 1")
        self.screenshot("03-vehicles")
        self.text("Tìm đội xe", "no-match")
        self.hide_keyboard()
        self.wait("Không có kết quả")
        self.tap("Xóa tìm kiếm")
        self.tap("Xem QA-001, Xe QA 1")
        self.wait("Xe QA 1")
        self.screenshot("04-vehicle-detail")
        self.back()
        self.wait("Xem QA-001, Xe QA 1")
        self.passed("Native search, empty state, record detail and hardware Back work")

        self.tap("Bộ lọc")
        self.tap("Bảo dưỡng")
        self.tap("Đóng")
        self.wait("Xem QA-001, Xe QA 1")
        self.tap("Bộ lọc")
        self.tap("Bảo dưỡng")
        self.tap("Áp dụng")
        self.wait("Không có kết quả")
        self.tap("Tất cả")
        self.wait("Xem QA-001, Xe QA 1")
        self.passed("The native filter modal supports cancel and explicit Apply")

        if self.customers:
            self.customer_flow()
        if self.drafts:
            self.draft_flow()
        if self.contracts:
            self.contract_flow()
        if self.finance:
            self.finance_flow()
        if self.scope_recovery:
            self.scope_recovery_flow()
        if self.bills:
            self.bills_flow()
        if self.renewals:
            run_renewals(self)
        if self.collections:
            run_collections(self)

        self.finish()

    def finish(self):
        self.launch()
        self.wait("Mở Đội xe", timeout=180)
        self.wait("QA Quản lý")
        self.screenshot("05-restored-session")
        self.passed("Keystore-backed session survives process termination and is revalidated")

        self.tap("Tài khoản", bottom=True)
        self.wait("Phiên làm việc đến")
        self.scroll_to("Đăng xuất")
        self.tap("Đăng xuất")
        self.wait("Đăng nhập")
        self.launch()
        self.wait("Đăng nhập", timeout=180)
        self.screenshot("06-logged-out")
        self.passed("Server logout clears protected UI and persisted credentials across relaunch")

        diagnostics = collect_diagnostics(self, PACKAGE)
        assert not diagnostics["errors"] and diagnostics["startedEpoch"] is not None, "Runtime diagnostics unavailable; acceptance cannot be certified"
        assert diagnostics["newAppCrashes"] == 0, "Native app crashed during acceptance; see crash-buffer.log"
        assert diagnostics["newAppAnrs"] == 0, "Native app ANR during acceptance; see anr-buffer.log"
        assert self.source_files == source_snapshot(), "Mobile/shared source changed during native QA; this run cannot certify the new source"

        result = {"status": "passed", "passed": len(self.checks), "checks": self.checks, "platform": "Android physical device" if self.physical else "Android emulator",
                  "mode": "writes-only-recovery" if self.collection_recovery else "writes-only" if self.writes_only else "full",
                  "fixtureOnly": True, "operationalWrites": 0, "physicalDeviceTested": self.physical, "physicalDeviceCertified": False,
                  "newAppCrashes": diagnostics["newAppCrashes"],
                  "newAppAnrs": diagnostics["newAppAnrs"],
                  "newSystemUiAnrs": diagnostics["newSystemUiAnrs"],
                  "provenance": "source-provenance.json",
                  "startedEpoch": self.started_epoch,
                  "completedAt": datetime.now(timezone.utc).isoformat()}
        self.output.joinpath("results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--adb", type=Path, default=Path("E:/Android/Sdk/platform-tools/adb.exe"))
    parser.add_argument("--serial", default="emulator-5554")
    parser.add_argument("--physical",action="store_true",help="Explicitly target an authorized USB phone with the loopback QA API; never wipes app/device data")
    parser.add_argument("--output", type=Path, default=Path(".backups/mobile-native-20261031"))
    parser.add_argument("--customers", action="store_true")
    parser.add_argument("--drafts", action="store_true")
    parser.add_argument("--contracts", action="store_true")
    parser.add_argument("--finance", action="store_true")
    parser.add_argument("--scope-recovery", action="store_true")
    parser.add_argument("--bills", action="store_true")
    parser.add_argument("--bill-preview-only", action="store_true")
    parser.add_argument("--renewals", action="store_true")
    parser.add_argument("--collections", action="store_true")
    parser.add_argument('--collections-recovery',action='store_true',help='Continue remaining recovery cases after exactly one acknowledged QA partial receipt; earlier cases stay separate evidence')
    parser.add_argument("--writes-only", action="store_true", help="Reuse an existing fixture login for focused write acceptance")
    args = parser.parse_args()
    suite = NativeQA(args.adb, args.serial, args.output, args.customers, args.drafts, args.writes_only, args.contracts, args.finance, args.scope_recovery, args.bills, args.bill_preview_only, args.renewals, args.collections,args.physical,args.collections_recovery)
    try:
        suite.run()
    except Exception as failure:
        result = {"status": "failed", "completedGroups": len(suite.checks), "checks": suite.checks,
                  "error": str(failure), "platform": "Android physical device" if args.physical else "Android emulator", "fixtureOnly": True,
                  "mode": "writes-only-recovery" if args.collections_recovery else "writes-only" if args.writes_only else "full",
                  "operationalWrites": 0, "physicalDeviceTested":args.physical,"physicalDeviceCertified": False,
                  "startedEpoch": suite.started_epoch,
                  "completedAt": datetime.now(timezone.utc).isoformat()}
        try:
            result["diagnostics"] = collect_diagnostics(suite, PACKAGE)
        except Exception as diagnostics_error:
            result["diagnosticsError"] = type(diagnostics_error).__name__
        args.output.joinpath("results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            suite.screenshot("failure")
        except Exception:
            pass
        raise
