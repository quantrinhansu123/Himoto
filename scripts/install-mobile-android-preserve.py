"""Verified same-signature Android upgrade; never uninstall/clear or read app secrets."""
import argparse
import hashlib
import json
import re
import shlex
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'vn.himoto.staff'
parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('--apk', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--expected-installed-sha256', required=True)
args = parser.parse_args()
apk, output = args.apk.resolve(), args.output.resolve()
assert apk.is_relative_to(ROOT / '.backups') and output.is_relative_to(ROOT / '.backups') and not output.exists()
assert re.fullmatch(r'[0-9a-f]{64}', args.expected_installed_sha256)
output.mkdir(parents=True)
adb = ['E:/Android/Sdk/platform-tools/adb.exe', '-s', args.serial]
def command(*values, timeout=45):
    result = subprocess.run(adb + list(values), capture_output=True, timeout=timeout)
    assert result.returncode == 0, (values[:2], result.stderr.decode(errors='replace')[:500])
    return result.stdout.decode('utf-8', errors='strict').strip()
def sha(file):
    with file.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()
def certificate(file):
    tool = ['E:/Android/Sdk/build-tools/37.0.0/apksigner.bat', 'verify', '--print-certs', str(file)]
    result = subprocess.run(tool, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0
    digest = re.search(r'^(?:Signer #1:?|V2 Signer:) certificate SHA-256 digest:\s*([0-9a-f]{64})$', result.stdout, re.M)
    assert digest
    return digest.group(1)
def data_hashes():
    script = "find . -type f ! -path './cache/*' ! -path './code_cache/*' -exec sha256sum {} \\;"
    raw = command('shell', 'run-as', PACKAGE, 'sh', '-c', shlex.quote(script), timeout=90)
    rows = {}
    for line in raw.splitlines():
        digest, name = line.split('  ', 1)
        assert re.fullmatch(r'[0-9a-f]{64}', digest) and name.startswith('./') and name not in rows
        rows[name] = digest
    assert rows, 'Refusing to upgrade without app data preservation evidence'
    return rows
try:
    assert command('get-state') == 'device'
    assert command('shell', 'getprop', 'ro.product.model') == 'SM-N960N'
    installed = command('shell', 'pm', 'path', PACKAGE)
    assert installed.startswith('package:/data/app/') and installed.endswith('/base.apk') and '\n' not in installed
    remote = installed.removeprefix('package:')
    before_sha = command('shell', 'sha256sum', remote).split()[0]
    assert before_sha == args.expected_installed_sha256, 'Installed APK changed; retain it for review'
    previous = output / 'previous-installed.apk'
    command('pull', remote, str(previous), timeout=120)
    assert sha(previous) == before_sha
    old_cert, new_cert = certificate(previous), certificate(apk)
    assert new_cert == old_cert
    with zipfile.ZipFile(apk) as archive:
        assert {name.split('/')[1] for name in archive.namelist() if name.startswith('lib/') and name.endswith('.so')} == {'arm64-v8a'}
        assert any(b'expo/modules/clipboard/ClipboardModule' in archive.read(name) for name in archive.namelist() if re.fullmatch(r'classes\d*\.dex', name)), 'APK must include the new native clipboard module'
    command('shell', 'am', 'force-stop', PACKAGE)
    before = data_hashes()
    (output / 'before-data-sha256.json').write_text(json.dumps(before, indent=2), encoding='utf-8')
    response = command('install', '-r', '--no-streaming', str(apk), timeout=240)
    assert 'Success' in response
    after = data_hashes()
    (output / 'after-data-sha256.json').write_text(json.dumps(after, indent=2), encoding='utf-8')
    assert before == after, 'App data changed after upgrade; app remains stopped for review'
    new_path = command('shell', 'pm', 'path', PACKAGE).removeprefix('package:')
    new_sha = sha(apk)
    assert command('shell', 'sha256sum', new_path).split()[0] == new_sha
    result = {'ok': True, 'installed': True, 'serial': args.serial, 'method': 'adb install -r --no-streaming', 'sameLiveCertificate': True, 'certificateSha256': new_cert, 'previousSha256': before_sha, 'newSha256': new_sha, 'preservedFiles': len(before), 'dataFilesIdentical': True, 'clipboardNativeModulePresent': True, 'uninstallOrClear': False, 'launchedAfterInstall': False, 'installedAt': datetime.now(timezone.utc).isoformat()}
    (output / 'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))
except Exception as error:
    (output / 'failure.json').write_text(json.dumps({'ok': False, 'errorType': type(error).__name__, 'message': str(error)[:1000], 'noUninstallOrClear': True}), encoding='utf-8')
    raise
