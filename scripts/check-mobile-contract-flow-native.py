"""Focused Samsung contract/customer acceptance. Synthetic API, no real writes."""
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
parser.add_argument("--fixture-port", type=int, default=8101)
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


previous_routes = None
before_preserved = preserved()
try:
    initial = stats()
    assert initial["schema"] == "himoto.qa.contract-flow.v1"
    assert initial["customerCreates"] == 0 and initial["draftCreates"] == 0, "Use an unused QA checkpoint; do not reset written fixtures"
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
    qa.text("Số hợp đồng giấy", "91011")
    qa.hide_keyboard()
    for label in ("Bước 2: Khách hàng", "Bước 3: Phương tiện", "Bước 4: Chi phí", "Bước 5: Ký kết & ghi chú"):
        qa.tap(label)
        number, title = label.removeprefix("Bước ").split(": ", 1)
        qa.wait(f"{number}. {title}")
        qa.wait("Lưu nháp")
    qa.tap("Bước 3: Phương tiện")
    qa.wait("3. Phương tiện")
    reveal("Thêm xe vào bản nháp")
    qa.tap("Thêm xe vào bản nháp")
    qa.tap("Chọn xe QA-003")
    qa.tap("Bước 4: Chi phí")
    qa.text("Tổng giá trị hợp đồng (VND)", "1250000")
    qa.hide_keyboard()
    qa.tap("Bước 2: Khách hàng")
    qa.wait("2. Khách hàng")
    qa.screenshot("01-five-sections")
    qa.passed("Five web sections, native navigation, vehicle selection and money entry open with an empty QA ledger")

    qa.tap("Thêm khách trong hợp đồng")
    qa.text("Họ và tên", "NativeCancelQA")
    qa.hide_keyboard()
    qa.tap("Quay lại hợp đồng")
    qa.tap("Tiếp tục chỉnh sửa")
    qa.wait("NativeCancelQA")
    qa.tap("Quay lại hợp đồng")
    qa.tap("Rời biểu mẫu")
    qa.wait("Thêm khách trong hợp đồng")
    assert stats()["customerCreates"] == 0
    qa.passed("Inline native modal cancellation can continue editing or return to the unchanged contract without a write")

    qa.tap("Thêm khách trong hợp đồng")
    qa.text("Họ và tên", "NativeInlineQA")
    qa.hide_keyboard()
    qa.tap("Lưu khách hàng")
    qa.wait("Kiểm tra các mục được đánh dấu bên dưới. Thông tin đang nhập vẫn được giữ lại.")
    assert stats()["customerCreates"] == 0
    incomplete()
    mode("lost")
    qa.tap("Lưu khách hàng")
    qa.wait("Kiểm tra lần lưu trước")
    assert stats()["customerCreates"] == 1
    qa.tap("Kiểm tra lần lưu trước")
    qa.wait("Dùng khách hàng đã lưu")
    mode("selection-failure")
    qa.tap("Dùng khách hàng đã lưu")
    qa.wait("QA chưa tải được hồ sơ đã lưu.")
    assert stats()["customerCreates"] == 1
    qa.tap("Dùng khách hàng đã lưu")
    qa.wait("NativeInlineQA")
    qa.screenshot("02-inline-customer-returned")
    qa.passed("Active defaults validate before writing; explicit incomplete customer recovers lost commit and failed selection without creating twice")

    qa.tap("Bước 1: Hợp đồng & pháp lý")
    reveal("Số hợp đồng giấy")
    qa.wait("91011")
    qa.tap("Bước 4: Chi phí")
    reveal("Tổng giá trị hợp đồng (VND)")
    qa.wait("1250000")
    qa.tap("Lưu nháp")
    qa.wait("Tiếp tục soạn hợp đồng", timeout=90)
    final = stats()
    saved = final["drafts"][0]["input"]["draft"]
    assert saved["contract_number"] == "91011" and saved["total_amount"] == "1250000"
    assert saved["customer_id"] == final["customers"][0]["id"] and saved["vehicles"][0]["id"] == "303"
    assert final["customerCreates"] == 1 and final["draftCreates"] == 1 and len(set(final["customerKeys"])) == 1
    qa.screenshot("03-saved-draft")
    qa.passed("Native save binds the exact created customer, selected vehicle, contract number and money to one draft")
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
    result = {"status": "passed", "passed": len(qa.checks), "checks": qa.checks, "fixtureOnly": True, "mode": "focused-contract-entry",
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
