"""Capture short, verified read-only transitions from the installed release.

No app install, login, operational write, API override or phone setting change.
The raw captures stay private under .backups; only reviewed renders are delivered.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
import struct
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("nativeqa", ROOT / "scripts/check-mobile-native.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def node_for(qa, root, label, *, bottom=False):
    matches = qa.matches(root, label)
    matches = [node for node in matches if node.get("enabled") == "true"]
    clickable = [node for node in matches if node.get("clickable") == "true"]
    matches = clickable or matches
    if not matches:
        raise RuntimeError(f"Verified control missing: {label}")
    node = matches[-1] if bottom else matches[0]
    return list(map(int, re.findall(r"\d+", node.get("bounds"))))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--serial", default="282a05859f3f7ece")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if args.output.exists() and not args.resume:
        raise RuntimeError("Use a new output directory; previous captures are preserved")
    qa = native.NativeQA(Path("E:/Android/Sdk/platform-tools/adb.exe"), args.serial, args.output, physical=True)
    manifest = json.loads(Path(__file__).with_name("pilot.json").read_text(encoding="utf-8"))
    apk = ROOT / ".backups/mobile-release-1.0.6-clean-20261108/Himoto-1.0.6-android-release.apk"
    package_path = qa.command("shell", "pm", "path", native.PACKAGE).strip().removeprefix("package:")
    if not package_path.startswith("/data/app/") or not package_path.endswith("/base.apk") or "\n" in package_path:
        raise RuntimeError("Unexpected installed package path")
    installed_hash = qa.command("shell", "sha256sum", package_path).split()[0]
    if installed_hash != hashlib.sha256(apk.read_bytes()).hexdigest():
        raise RuntimeError("Installed app differs from the known 1.0.6 release")
    root = qa.tree()
    if not any(node.get("package") == native.PACKAGE for node in root.iter("node")):
        raise RuntimeError("Himoto must be visible before recording")
    if args.resume:
        previous = json.loads((args.output / "capture.json").read_text(encoding="utf-8"))
        if previous["apkSha256"] != installed_hash:
            raise RuntimeError("Cannot resume captures from a different APK")
        rows = previous["scenes"]
    else:
        qa.hide_keyboard()
        qa.tap("Tổng quan", bottom=True)
        qa.wait("Mở Đội xe")
        rows = []
    plate = None
    try:
        for scene in manifest["scenes"]:
            if any(row["id"] == scene["id"] for row in rows):
                continue
            folder = args.output / scene["id"]
            attempt = 1
            while folder.exists():
                folder = args.output / f"{scene['id']}-retry-{attempt:02d}"
                attempt += 1
            folder.mkdir()
            root = qa.tree()
            if not any(node.get("package") == native.PACKAGE for node in root.iter("node")):
                raise RuntimeError("Phone changed applications; capture stopped")
            action = scene["action"]
            labels = {"vehicles": "Đội xe", "focus": "Tìm đội xe", "clear": "Xóa tìm kiếm",
                      "ready": "Lưu kho", "filters": "Bộ lọc", "apply": "Áp dụng", "reset": "Xóa bộ lọc và tìm kiếm"}
            bounds = node_for(qa, root, labels[action], bottom=action == "vehicles") if action in labels else None
            if action == "type":
                field = [node for node in qa.matches(root, "Tìm đội xe") if node.get("focused") == "true"]
                # Android exposes the placeholder through text for an empty input.
                if len(field) != 1 or field[0].get("text", "") not in ("", "Tìm biển số, tên xe, nhãn hiệu"):
                    raise RuntimeError("Expected an empty, focused search field")
                if not plate or not re.fullmatch(r"[A-Za-z0-9.-]{3,30}", plate):
                    raise RuntimeError("Search term is not a verified vehicle plate")
                bounds = list(map(int, re.findall(r"\d+", field[0].get("bounds"))))
            if action == "keyboard" and not qa.keyboard_visible():
                raise RuntimeError("Keyboard is already hidden")
            before = qa.command("exec-out", "screencap", "-p", binary=True)
            (folder / "before.png").write_bytes(before)
            if action == "still":
                rows.append({**scene, "capture": "still", "image": str(folder / "before.png")})
                save(args.output / "capture.json", {"status": "recording", "apkSha256": installed_hash, "scenes": rows})
                continue
            remote = f"/data/local/tmp/himoto-training-{scene['id']}.mp4"
            screen_width, screen_height = struct.unpack(">II", before[16:24])
            command = (f"echo $$; exec screenrecord --size {screen_width}x{screen_height} "
                       f"--bit-rate 12000000 --time-limit 30 {remote}")
            proc = subprocess.Popen(qa.adb + ["shell", command], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            pid_raw = proc.stdout.readline().decode().strip()
            if not pid_raw.isdigit():
                proc.terminate()
                raise RuntimeError("Screen recorder did not identify its process")
            started = time.monotonic()
            try:
                time.sleep(0.75)
                pressed = time.monotonic()
                if action == "type":
                    qa.command("shell", "input", "text", plate)
                elif action == "keyboard":
                    qa.command("shell", "input", "keyevent", "KEYCODE_BACK")
                else:
                    x1, y1, x2, y2 = bounds
                    qa.command("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
                if action == "vehicles":
                    result = qa.wait("Tìm đội xe")
                    candidates = [node.get("content-desc", "") for node in result.iter("node")
                                  if node.get("content-desc", "").startswith("Xem ")]
                    if not candidates:
                        raise RuntimeError("Vehicle list has no result to demonstrate")
                    plate = candidates[0].removeprefix("Xem ").split(",")[0].strip()
                elif action == "focus":
                    if not qa.keyboard_visible():
                        raise RuntimeError("Search did not open the keyboard")
                elif action == "type":
                    result = qa.tree()
                    if not any(node.get("text") == plate for node in qa.matches(result, "Tìm đội xe")):
                        raise RuntimeError("Search text did not match the demonstrated plate")
                elif action == "keyboard":
                    if qa.keyboard_visible():
                        raise RuntimeError("Keyboard did not close")
                    qa.wait("Xóa tìm kiếm")
                elif action == "filters":
                    qa.wait("Lọc danh sách")
                elif action in ("apply", "reset", "clear", "ready"):
                    qa.wait("Tìm đội xe")
                    result = qa.tree()
                    if action == "ready" and not any(n.get("selected") == "true" for n in qa.matches(result, "Lưu kho")):
                        raise RuntimeError("The ready status was not selected")
                    if action == "reset" and qa.matches(result, "Xóa bộ lọc và tìm kiếm"):
                        raise RuntimeError("Filters did not reset")
                time.sleep(0.7)
                (folder / "after.png").write_bytes(qa.command("exec-out", "screencap", "-p", binary=True))
            finally:
                # Only signal the exact remote process started for this scene.
                cmdline = qa.command("shell", "cat", f"/proc/{pid_raw}/cmdline")
                if "screenrecord" in cmdline and remote in cmdline:
                    qa.command("shell", "kill", "-2", pid_raw)
                proc.wait(timeout=10)
            local = folder / "raw.mp4"
            qa.command("pull", remote, str(local))
            qa.command("shell", "rm", "-f", remote)
            row = {**scene, "capture": "native", "video": str(local), "bounds": bounds,
                   "hostActionOffset": pressed-started, "transitionReviewed": False}
            rows.append(row)
            save(args.output / "capture.json", {"status": "recording", "apkSha256": installed_hash, "scenes": rows})
            print(json.dumps({"scene": scene["id"], "captured": True}), flush=True)
        save(args.output / "capture.json", {"status": "captured", "platform": "Samsung SM-N960N / Android",
             "version": manifest["version"], "apkSha256": installed_hash, "operationalWrites": 0,
             "appSettingsChanged": False, "scenes": rows})
    finally:
        # All demonstrated navigation is read-only. Leave the device in Himoto.
        print(json.dumps({"capturedScenes": len(rows), "output": str(args.output)}), flush=True)


if __name__ == "__main__":
    main()
