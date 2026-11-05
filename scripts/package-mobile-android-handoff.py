"""Build a credential-free review bundle. Acceptance remains explicit/incomplete."""
import argparse
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--build-result',type=Path,required=True);parser.add_argument('--backend-evidence',type=Path);args=parser.parse_args()
out=args.output.resolve();assert out.is_relative_to(root/'.backups')and not out.exists()
build_path=args.build_result.resolve();assert build_path.is_relative_to(root/'.backups')
build=json.loads(build_path.read_text(encoding='utf-8-sig'))
assert build['ok']and build['sourceUnchanged']and not build['debuggable']and build['apiOrigin']=='https://himoto.vercel.app'
source=json.loads((build_path.parent/'source-manifest.json').read_text(encoding='utf-8'))
sha=lambda b:hashlib.sha256(b).hexdigest()
for entry in source['files']:assert sha((root/entry['path']).read_bytes())==entry['sha256'],'Product source changed after release build: '+entry['path']
apk=Path(build['apk']);assert sha(apk.read_bytes())==build['sha256']
from lib.mobile_release_bundle import verify_bundle
bundle=verify_bundle(apk)
backend=None
if args.backend_evidence:
    evidence=args.backend_evidence.resolve();assert evidence.is_relative_to(root/'.backups')
    backend=json.loads(evidence.read_text(encoding='utf8'));assert backend['ok']and backend['origin']==build['apiOrigin']
out.mkdir(parents=True)
(out/apk.name).write_bytes(apk.read_bytes())
allowed_scripts=['scripts/build-mobile-android-release.ps1','scripts/initialize-mobile-android-signing.ps1','scripts/export-mobile-signing-backup.ps1','scripts/mobile-signing-backup.cjs','scripts/mobile-release-provenance.cjs','scripts/verify-mobile-release-bundle.py','scripts/lib/mobile_release_bundle.py']
sourcezip=out/'himoto-mobile-source-1.0.0.zip'
with zipfile.ZipFile(sourcezip,'x',zipfile.ZIP_DEFLATED)as archive:
    for entry in source['files']:
        name=entry['path'];assert not any(part.startswith('.env')for part in Path(name).parts)
        assert not name.endswith(('.p12','.jks','.keystore','.key'))
        archive.writestr(name,(root/name).read_bytes())
    for name in allowed_scripts:archive.writestr(name,(root/name).read_bytes())
guides=['docs/mobile-android-operator-guide-2026-11-05.md','docs/qa/2026-11-05-mobile-live-rollout-and-release.md','docs/qa/2026-11-05-mobile-notifications-and-login.md']
for name in guides:(out/Path(name).name).write_bytes((root/name).read_bytes())
manifest={'version':build['version'],'versionCode':build['versionCode'],'package':build['package'],'apiOrigin':build['apiOrigin'],'apk':apk.name,'apkSha256':build['sha256'],'certificateSha256':build['certificateSha256'],'debuggable':False,'sourceFiles':len(source['files']),'sourceVerifiedAgainstBuild':True,'mobileSourceSha256':sha(sourcezip.read_bytes()),'nativePushModulePresent':bundle['nativePushModulePresent'],'firebaseProjectId':bundle['firebaseProjectId'],'abis':bundle['abis'],'backendDeploymentId':backend['deploymentId']if backend else None,'backendVerifiedAt':backend['completedAt']if backend else None,'releaseAcceptanceComplete':False,'unresolvedReleaseAnr':True,'containsCredentials':False,'containsSigningPrivateKey':False,'createdAt':datetime.now(timezone.utc).isoformat()}
(out/'release-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(out/'SHA256SUMS.txt').write_text(''.join(sha(file.read_bytes())+'  '+file.name+'\n'for file in sorted(out.iterdir())if file.is_file()),encoding='ascii')
print(json.dumps({'ok':True,'output':str(out.relative_to(root)),'apkSha256':manifest['apkSha256'],'sourceFiles':manifest['sourceFiles'],'releaseAcceptanceComplete':False,'containsCredentials':False},indent=2))
