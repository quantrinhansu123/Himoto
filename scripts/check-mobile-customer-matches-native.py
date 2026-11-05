"""Focused Samsung duplicate-customer acceptance. Synthetic API, no real writes."""
import argparse
import hashlib
import importlib.util
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_diagnostics import collect
from lib.mobile_native_provenance import capture, source_snapshot

parser = argparse.ArgumentParser()
parser.add_argument("--serial", required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--fixture-port", type=int, default=8102)
args = parser.parse_args()
if not 8100 <= args.fixture_port <= 8199: raise ValueError("Use the separate contract-flow QA fixture")
spec = importlib.util.spec_from_file_location("nativeqa", Path(__file__).with_name("check-mobile-native.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
qa = module.NativeQA(Path("E:/Android/Sdk/platform-tools/adb.exe"), args.serial, args.output, physical=True)


def request(path, body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{args.fixture_port}" + path,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json"} if body else {})
    with urllib.request.urlopen(req, timeout=10) as reply: result = json.load(reply)
    assert result["fixtureOnly"] is True
    return result


def stats(): return request("/__fixture_state")
def mode(value): return request("/__fixture_mode", {"mode": value})
def reveal(label): qa.scroll_to(label)


def routes():
    result = {}
    for line in qa.command("reverse", "--list").splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[1] in ("tcp:8081", "tcp:8091"): result[parts[1]] = parts[2]
    return result


def preserved():
    return {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [
        Path(".backups/mobile-contract-flow-fixture-20261102/state.json"),
        Path(".backups/mobile-transfer-fixture-20261102/state.json"),
        Path(".backups/mobile-recovery-fixture-20261102/state.json"),
        Path(".backups/mobile-media-fixture-20261102/state.json")] if path.is_file()}


def incomplete():
    reveal("Trạng thái hồ sơ")
    qa.tap("Trạng thái hồ sơ")
    qa.tap("Chưa hoàn tất")


def return_tabs():
    for _ in range(5):
        root = qa.tree()
        if qa.matches(root, "Tổng quan"):
            qa.tap("Tổng quan", bottom=True)
            return
        qa.back()
    raise AssertionError("Could not return to tabs")


def open_duplicate():
    qa.tap("Bước 2: Khách hàng")
    qa.wait("2. Khách hàng")
    qa.tap("Thêm khách trong hợp đồng")
    qa.text("Họ và tên", "NativeDupQA")
    qa.text("Số điện thoại", "0901111111")
    qa.hide_keyboard()
    incomplete()
    qa.text("Số CCCD/CMND", "001234567890")
    qa.hide_keyboard()
    qa.tap("Lưu khách hàng")
    qa.wait("Khách hàng đã tồn tại")


def prepare_contract(number):
    qa.text("Số hợp đồng giấy", number)
    qa.hide_keyboard()
    qa.tap("Bước 3: Phương tiện")
    qa.wait("3. Phương tiện")
    reveal("Thêm xe vào bản nháp")
    qa.tap("Thêm xe vào bản nháp")
    qa.tap("Chọn xe QA-003")
    qa.tap("Bước 4: Chi phí")
    qa.wait("4. Chi phí")
    qa.text("Tổng giá trị hợp đồng (VND)", "1250000")
    qa.hide_keyboard()


previous_routes = None
before_preserved = preserved()
try:
    initial = stats()
    assert initial["schema"] == "himoto.qa.contract-flow.v1"
    assert initial["customerCreates"] == 0 and initial["draftCreates"] == 0, "Use an unused QA checkpoint; do not reset written fixtures"
    assert len(initial["duplicateProfiles"]) == 2 and initial["customerUpdates"] == 0
    print("Preparing verified Metro source before reading native UI.", flush=True)
    with urllib.request.urlopen("http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0", timeout=180) as reply:
        config = reply.read().decode()
    assert "http://127.0.0.1:8091" in config and "mobile-api.example.invalid" not in config
    with urllib.request.urlopen("http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable", timeout=600) as reply:
        entry = hashlib.file_digest(reply, "sha256").hexdigest()
    previous_routes = routes()
    qa.output.joinpath("usb-route.json").write_text(json.dumps({"before": previous_routes, "hostApiPort": args.fixture_port, "restored": False}), encoding="utf-8")
    qa.command("reverse", "tcp:8081", "tcp:8081")
    qa.command("reverse", "tcp:8091", f"tcp:{args.fixture_port}")
    qa.verify_device_network()
    qa.source_files = capture(qa, entry)
    qa.started_epoch = int(qa.command("shell", "date", "+%s").strip())
    qa.launch()
    root = qa.wait_any(["Đăng nhập", "Mở Đội xe"], timeout=180)
    if qa.matches(root, "Đăng nhập"):
        qa.text("Tài khoản", "qa")
        qa.command("shell", "input", "keyevent", "66")
        qa.text("Mật khẩu", "fixture-password")
        qa.hide_keyboard()
        qa.tap("Đăng nhập")
    qa.wait("Mở Đội xe", timeout=120)
    qa.tap("Tài khoản", bottom=True)
    reveal("Tải lại danh sách đối chiếu")
    qa.tap("Tải lại danh sách đối chiếu")
    qa.wait("Không có thao tác chờ đối chiếu trong phạm vi này.")
    qa.tap("Hợp đồng", bottom=True)
    qa.tap("Thêm bản nháp")
    qa.wait("1. Hợp đồng & pháp lý")
    prepare_contract("92011")
    open_duplicate()
    reveal("Đi tới khách hàng #502")
    qa.tap("Đi tới khách hàng #502")
    qa.wait("Khách hàng #502")
    assert not qa.matches(qa.tree(), "Sửa hồ sơ khách này")
    qa.screenshot("01-foreign-readonly")
    qa.tap("Quay lại biểu mẫu")
    reveal("Họ và tên")
    qa.wait("NativeDupQA")
    assert stats()["customerCreates"] == 0
    qa.passed("Duplicate creation opens scoped match choices; foreign details are read-only and returning preserves the native form")
    reveal("Dùng khách hàng #502")
    mode("resolve-failure")
    qa.tap("Dùng khách hàng #502")
    qa.wait("QA chưa đối chiếu được mã tạo cũ.")
    assert not stats()["tombstones"]
    mode("matches-failure")
    reveal("Dùng khách hàng #502")
    qa.tap("Dùng khách hàng #502")
    qa.wait("QA chưa tra cứu được hồ sơ trùng.")
    assert len(stats()["tombstones"]) == 1
    reveal("Dùng khách hàng #502")
    qa.tap("Dùng khách hàng #502")
    qa.wait("OtherQA")
    qa.tap("Bước 1: Hợp đồng & pháp lý")
    reveal("Số hợp đồng giấy")
    qa.wait("92011")
    qa.tap("Bước 4: Chi phí")
    reveal("Tổng giá trị hợp đồng (VND)")
    qa.wait("1250000")
    qa.tap("Lưu nháp")
    qa.wait("Tiếp tục soạn hợp đồng", timeout=90)
    saved = stats()["drafts"][0]["input"]["draft"]
    assert saved["customer_id"] == 502 and saved["vehicles"][0]["id"] == "303"
    assert saved["contract_number"] == "92011" and saved["total_amount"] == "1250000"
    assert stats()["customerCreates"] == 0
    qa.screenshot("02-existing-bound-to-draft")
    qa.passed("Native resolver/fresh-lookup failures preserve intent; durable cancellation precedes exact existing-customer selection and one unchanged draft")
    return_tabs()
    qa.tap("Hợp đồng", bottom=True)
    qa.tap("Thêm bản nháp")
    qa.wait("1. Hợp đồng & pháp lý")
    prepare_contract("92012")
    open_duplicate()
    reveal("Đi tới khách hàng #501")
    qa.tap("Đi tới khách hàng #501")
    reveal("Sửa hồ sơ khách này")
    qa.tap("Sửa hồ sơ khách này")
    qa.wait("Sửa hồ sơ khách đã có")
    qa.text("Họ và tên", "CancelledEditQA", replace=True)
    qa.hide_keyboard()
    qa.tap("Quay lại hồ sơ trùng")
    qa.tap("Tiếp tục chỉnh sửa")
    qa.wait("CancelledEditQA")
    qa.tap("Quay lại hồ sơ trùng")
    qa.tap("Rời biểu mẫu")
    reveal("Sửa hồ sơ khách này")
    assert stats()["customerUpdates"] == 0
    qa.tap("Sửa hồ sơ khách này")
    qa.wait("Sửa hồ sơ khách đã có")
    qa.text("Họ và tên", "LocalEditedQA", replace=True)
    qa.hide_keyboard()
    mode("update-lost")
    qa.tap("Lưu thay đổi")
    qa.wait("Kiểm tra lần lưu trước")
    assert stats()["customerUpdates"] == 1
    qa.tap("Kiểm tra lần lưu trước")
    reveal("Xem hồ sơ đã lưu")
    qa.tap("Xem hồ sơ đã lưu")
    qa.wait("LocalEditedQA")
    qa.tap("Bước 4: Chi phí")
    qa.wait("4. Chi phí")
    qa.tap("Lưu nháp")
    qa.wait("Tiếp tục soạn hợp đồng", timeout=90)
    final = stats()
    saved = final["drafts"][1]["input"]["draft"]
    assert saved["customer_id"] == 501 and saved["customer"]["name"] == "LocalEditedQA"
    assert saved["contract_number"] == "92012" and saved["vehicles"][0]["id"] == "303" and saved["total_amount"] == "1250000"
    assert final["customerCreates"] == 0 and final["customerUpdates"] == 1 and final["draftCreates"] == 2
    qa.screenshot("03-edited-existing-bound-to-draft")
    qa.passed("Scoped nested native edit supports guarded cancel and one lost commit; exact updated customer returns without losing contract fields")
    return_tabs()
    qa.tap("Tài khoản", bottom=True)
    reveal("Tải lại danh sách đối chiếu")
    qa.tap("Tải lại danh sách đối chiếu")
    qa.wait("Không có thao tác chờ đối chiếu trong phạm vi này.")
    reveal("Đăng xuất")
    qa.tap("Đăng xuất")
    qa.wait("Đăng nhập")
    diagnostics = collect(qa, module.PACKAGE)
    assert not diagnostics["errors"] and diagnostics["newAppCrashes"] == diagnostics["newAppAnrs"] == diagnostics["newSystemUiAnrs"] == 0
    assert source_snapshot() == qa.source_files, "Source changed during native run"
    assert preserved() == before_preserved
    qa.output.joinpath("fixture-final.json").write_text(json.dumps(stats(), ensure_ascii=False, indent=2), encoding="utf-8")
    result = {"status": "passed", "passed": len(qa.checks), "checks": qa.checks, "fixtureOnly": True, "mode": "focused-customer-duplicates",
              "newAppCrashes": 0, "newAppAnrs": 0, "newSystemUiAnrs": 0, "operationalWrites": 0, "physicalDeviceTested": True,
              "fullAppCertified": False, "sourceFilesVerified": len(qa.source_files), "completedAt": datetime.now(timezone.utc).isoformat()}
    qa.output.joinpath("results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
except Exception as failure:
    result = {"status": "failed", "checks": qa.checks, "error": str(failure), "fixtureOnly": True, "completedAt": datetime.now(timezone.utc).isoformat()}
    qa.output.joinpath("results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        qa.screenshot("failure")
        qa.output.joinpath("fixture-failed.json").write_text(json.dumps(stats(), ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception: pass
    raise
finally:
    if previous_routes is not None:
        for port in ("tcp:8081", "tcp:8091"):
            if port in previous_routes: qa.command("reverse", port, previous_routes[port])
            else: qa.command("reverse", "--remove", port)
        restored = routes()
        qa.output.joinpath("usb-route.json").write_text(json.dumps({"before": previous_routes, "after": restored, "restored": restored == previous_routes}), encoding="utf-8")
        assert restored == previous_routes
