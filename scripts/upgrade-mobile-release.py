"""Same-certificate upgrade of a production APK; no run-as, uninstall or data clearing."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from lib.mobile_release_evidence import verify_artifact

parser = argparse.ArgumentParser()
parser.add_argument('--apk', type=Path, required=True)
parser.add_argument('--previous-apk', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--serial', default='282a05859f3f7ece')
args = parser.parse_args()
assert args.serial == '282a05859f3f7ece'
assert not args.output.exists()
args.output.mkdir(parents=True)
proof = verify_artifact(args.apk)
adb = ['E:/Android/Sdk/platform-tools/adb.exe', '-s', args.serial]

def command(*values, timeout=90):
    result = subprocess.run(adb + list(values), capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Android upgrade command failed: ' + result.stderr.decode(errors='replace')[:200])
    return result.stdout.decode().strip()

def installed():
    remote = command('shell', 'pm', 'path', 'vn.himoto.staff')
    assert remote.startswith('package:/data/app/') and remote.endswith('/base.apk') and '\n' not in remote
    digest = command('shell', 'sha256sum', remote.removeprefix('package:')).split()[0]
    info = command('shell', 'dumpsys', 'package', 'vn.himoto.staff')
    uid = re.search(r'\buserId=(\d+)', info).group(1)
    version = re.search(r'\bversionName=(\S+)', info).group(1)
    return digest, uid, version

before_sha, before_uid, before_version = installed()
assert hashlib.sha256(args.previous_apk.read_bytes()).hexdigest() == before_sha, 'Installed APK must match the known previous artifact before upgrade'
certificate = subprocess.run(['E:/Android/Sdk/build-tools/37.0.0/apksigner.bat', 'verify', '--print-certs', str(args.previous_apk)], capture_output=True, text=True, timeout=60)
assert certificate.returncode == 0 and 'certificate SHA-256 digest: ' + proof['certificateSha256'] in certificate.stdout
command('install', '-r', '--no-streaming', str(args.apk.resolve()), timeout=180)
after_sha, after_uid, after_version = installed()
assert after_sha == proof['sha256'] and before_uid == after_uid and after_version == proof['version']
result = dict(ok=True, previousVersion=before_version, version=after_version, previousSha256=before_sha,
              apkSha256=after_sha, sameCertificate=True, sameAppUid=True, uninstallOrClear=False,
              method='adb install -r --no-streaming', authenticatedSessionCheck='performed separately by release read acceptance')
args.output.joinpath('results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
