"""Prepare an isolated native recording app; production files are read-only.

The training package has separate Android storage and a loopback-only demo API.
UI and domain files are copied without edits. Only the transport configuration,
display identity and native recording configuration differ.
"""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / ".backups/training-delivery-1.0.6/source"


def main():
    if DEST.exists():
        raise RuntimeError("Preserve the existing prepared recording app")
    if not str(DEST.resolve()).startswith(str((ROOT / ".backups").resolve()) + "\\"):
        raise RuntimeError("Recording source must stay within this project's .backups")
    files = subprocess.check_output(["git", "ls-files", "mobile", "shared"], cwd=ROOT, text=True).splitlines()
    hashes = {}
    for relative in files:
        source = ROOT / relative
        if not source.is_file() or relative.startswith(("mobile/android/", "mobile/ios/")):
            continue
        target = DEST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        hashes[relative] = hashlib.sha256(source.read_bytes()).hexdigest()
    cfg_path = DEST / "mobile/app.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["expo"]["name"] = "Himoto Dao tao"
    cfg["expo"]["slug"] = "himoto-training"
    cfg["expo"]["scheme"] = "himoto-training"
    cfg["expo"]["android"]["package"] = "vn.himoto.training"
    cfg["expo"]["android"].pop("googleServicesFile", None)
    cfg["expo"]["plugins"] = [p for p in cfg["expo"]["plugins"] if p != "./plugins/with-android-release-signing.cjs"]
    cfg["expo"]["plugins"].append("./plugins/with-training-loopback.cjs")
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    # A config plugin owns the generated Android manifest, never a manual edit.
    (DEST / "mobile/plugins/with-training-loopback.cjs").write_text(
        "const {withAndroidManifest}=require('expo/config-plugins');\n"
        "module.exports=config=>withAndroidManifest(config,config=>{\n"
        "if(config.android.package!=='vn.himoto.training')throw Error('Training package only');\n"
        "config.modResults.manifest.application[0].$['android:usesCleartextTraffic']='true';\n"
        "return config;});\n", encoding="utf-8")
    (DEST / "mobile/app.config.cjs").write_text("module.exports=({config})=>({...config,extra:{...config.extra,androidPushConfigured:false}});\n", encoding="utf-8")
    transport = DEST / "mobile/src/providers/session.tsx"
    text = transport.read_text(encoding="utf-8")
    old = "apiOrigin(process.env.EXPO_PUBLIC_API_URL, __DEV__)"
    if text.count(old) != 1:
        raise RuntimeError("Review the transport configuration before creating the recording app")
    text = text.replace(old, "apiOrigin('http://127.0.0.1:8156', true)")
    transport.write_text(text, encoding="utf-8")
    for link, target in ((DEST / "mobile/node_modules", ROOT / "mobile/node_modules"), (DEST / "node_modules", ROOT / "node_modules")):
        command = f"New-Item -ItemType Junction -Path '{link}' -Target '{target}' | Out-Null"
        subprocess.run(["powershell.exe", "-NoProfile", "-Command", command], check=True)
    deviations = {"mobile/app.json", "mobile/app.config.cjs", "mobile/src/providers/session.tsx"}
    for relative, digest in hashes.items():
        if relative not in deviations:
            assert hashlib.sha256((DEST / relative).read_bytes()).hexdigest() == digest
        assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == digest
    (DEST.parent / "source-provenance.json").write_text(json.dumps({
        "version": cfg["expo"]["version"], "package": "vn.himoto.training", "api": "http://127.0.0.1:8156",
        "productionFilesUnchanged": True, "originalHashes": hashes,
        "recordingOnlyChanges": sorted(deviations) + ["mobile/plugins/with-training-loopback.cjs"],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"prepared": str(DEST), "originalFiles": len(hashes), "productionFilesUnchanged": True}))


if __name__ == "__main__":
    main()
