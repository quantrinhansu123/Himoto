"""Read-only Samsung transition inventory; never decrypt/copy app credentials."""
import argparse,hashlib,json,os,re,shlex,subprocess,xml.etree.ElementTree as ET
from datetime import datetime,timezone
from pathlib import Path

root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);args=p.parse_args()
out=args.output.resolve();assert out.is_relative_to(root/'.backups') and not out.exists()
adb=['E:/Android/Sdk/platform-tools/adb.exe','-s','282a05859f3f7ece'];package='vn.himoto.staff'
def command(*values,timeout=60):
    result=subprocess.run(adb+list(values),capture_output=True,timeout=timeout)
    if result.returncode:raise RuntimeError('TRANSITION_INSPECTION_COMMAND_FAILED')
    return result.stdout

assert command('get-state').strip()==b'device'
assert command('shell','getprop','ro.product.model').strip()==b'SM-N960N'
remote=command('shell','pm','path',package).decode().strip().removeprefix('package:')
assert re.fullmatch(r'/data/app/[^\s]+/base\.apk',remote)
out.mkdir(parents=True);previous=out/'previous-installed.apk'
command('pull',remote,str(previous),timeout=150)
digest=hashlib.sha256(previous.read_bytes()).hexdigest()
assert command('shell','sha256sum',remote).decode().split()[0]==digest
cert=subprocess.run(['E:/Android/Sdk/build-tools/37.0.0/apksigner.bat','verify','--print-certs',str(previous)],capture_output=True,text=True,timeout=60,env={**os.environ,'JAVA_HOME':'E:/Java/temurin-21/jdk-21.0.12.1+1'})
assert cert.returncode==0
certificate=re.search(r'certificate SHA-256 digest: ([0-9a-f]{64})',cert.stdout);assert certificate
# XML values stay encrypted and only in memory. Retain counts/booleans, no key names,
# UUIDs, cipher text, session tokens, photos or form contents in the report.
prefs=ET.fromstring(command('shell','run-as',package,'sh','-c',shlex.quote("if [ -f shared_prefs/SecureStore.xml ]; then cat shared_prefs/SecureStore.xml; else echo '<map />'; fi")))
keys=[item.get('name','') for item in prefs];prefs=None
entries=sum('himoto.mobile.pending-writes.v2.' in key for key in keys)
legacy=any(key.endswith('himoto.mobile.pending-writes.v1') for key in keys)
session=any(key.endswith('himoto.mobile.session.v1') for key in keys)
durable=command('shell','run-as',package,'sh','-c',shlex.quote('if [ -d files/himoto-contract-work-v1 ]; then find files/himoto-contract-work-v1 -type f; fi')).decode().splitlines()
assert all(name.startswith('files/himoto-contract-work-v1/') for name in durable)
result={'ok':True,'serial':'282a05859f3f7ece','installedApkSha256':digest,'installedCertificateSha256':certificate.group(1),'releaseCertificateDiffers':certificate.group(1)!='0c0c26eb9e8bf3495e9cc547059a52392a51b52ec7d2034e997658944f6c40a2','pendingEntryKeys':entries,'legacyPendingPresent':legacy,'encryptedSessionPresent':session,'durableDraftFiles':len(durable),'encryptedKeyMetadataOnly':True,'credentialsDecrypted':0,'appDataCopied':False,'uninstalledOrCleared':False,'reviewRequired':bool(entries or legacy or durable),'checkedAt':datetime.now(timezone.utc).isoformat()}
(out/'results.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
