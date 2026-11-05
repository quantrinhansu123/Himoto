"""Verify the concrete signed artifact/current source before physical QA."""
import hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
CERT='0c0c26eb9e8bf3495e9cc547059a52392a51b52ec7d2034e997658944f6c40a2'
def verify_artifact(apk):
    from lib.mobile_release_bundle import verify_bundle
    apk=apk.resolve();assert apk.is_relative_to(ROOT/'.backups')
    result=json.loads((apk.parent/'results.json').read_text(encoding='utf-8-sig'))
    assert result['ok'] and result['sourceUnchanged'] and not result['debuggable'] and result['apiOrigin']=='https://himoto.vercel.app'
    assert result['certificateSha256']==CERT and Path(result['apk']).resolve()==apk
    digest=hashlib.sha256(apk.read_bytes()).hexdigest();assert digest==result['sha256']
    assert verify_bundle(apk)['apkSha256']==digest
    manifest=json.loads((apk.parent/'source-manifest.json').read_text(encoding='utf8'))
    for item in manifest['files']:
        source=(ROOT/item['path']).resolve();assert source.is_relative_to(ROOT) and not any(p.startswith('.env') for p in source.relative_to(ROOT).parts)
        assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256'],'Source changed after the verified build'
    certificate=subprocess.run(['E:/Android/Sdk/build-tools/37.0.0/apksigner.bat','verify','--print-certs',str(apk)],capture_output=True,text=True,timeout=60)
    assert certificate.returncode==0 and re.search(r'certificate SHA-256 digest: '+CERT,certificate.stdout)
    return result
def verify_installed(qa,result):
    remote=qa.command('shell','pm','path','vn.himoto.staff').strip()
    assert remote.startswith('package:/data/app/') and remote.endswith('/base.apk') and '\n' not in remote
    assert qa.command('shell','sha256sum',remote.removeprefix('package:')).split()[0]==result['sha256'],'Installed APK does not match the verified release'
