"""Preserve only Himoto's durable drafts in a verified encrypted local archive."""
import argparse,hashlib,io,json,subprocess,tarfile
from datetime import datetime,timezone
from pathlib import Path,PurePosixPath
from urllib.parse import urlparse
from lib.windows_dpapi import protect,unprotect

root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);args=p.parse_args()
out=args.output.resolve();assert out.is_relative_to(root/'.backups') and not out.exists()
adb=['E:/Android/Sdk/platform-tools/adb.exe','-s','282a05859f3f7ece'];owned='files/himoto-contract-work-v1'
def command(*values):
    r=subprocess.run(adb+list(values),capture_output=True,timeout=120)
    if r.returncode:raise RuntimeError('DRAFT_BACKUP_DEVICE_COMMAND_FAILED')
    return r.stdout
assert command('shell','getprop','ro.product.model').strip()==b'SM-N960N'
raw=command('exec-out','run-as','vn.himoto.staff','tar','-cf','-',owned)
assert 512<=len(raw)<=64*1024*1024
count=0;state_count=0;origins={};unknown=0
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as archive:
    names=set()
    for item in archive.getmembers():
        name=PurePosixPath(item.name)
        assert not name.is_absolute() and '..' not in name.parts
        assert item.name==owned or item.name.startswith(owned+'/')
        assert item.isdir() or item.isfile();assert item.name not in names;names.add(item.name)
        if not item.isfile():continue
        count+=1
        if name.name=='state.json':
            state_count+=1
            try:
                value=json.loads(archive.extractfile(item).read());origin=value['work']['scope']['origin']
                host=urlparse(origin).hostname
                label='loopback-qa' if host in ('127.0.0.1','10.0.2.2','localhost','::1') else 'production' if origin=='https://himoto.vercel.app' else 'other'
                origins[label]=origins.get(label,0)+1
            except (KeyError,TypeError,ValueError):unknown+=1
assert count>0
purpose=b'Himoto-Samsung-local-drafts-backup-v1'
encrypted=protect(raw,purpose)
assert unprotect(encrypted,purpose)==raw
out.mkdir(parents=True);backup=out/'samsung-local-drafts.himoto-drafts.dpapi'
backup.write_bytes(encrypted);assert unprotect(backup.read_bytes(),purpose)==raw
result={'ok':True,'serial':'282a05859f3f7ece','files':count,'stateGenerations':state_count,'stateOriginClasses':origins,'unclassifiedStates':unknown,'encryptedArchive':backup.name,'archiveBytes':len(encrypted),'encryptedSha256':hashlib.sha256(encrypted).hexdigest(),'plainArchiveSha256':hashlib.sha256(raw).hexdigest(),'encryption':'Windows DPAPI CurrentUser','roundTripVerified':True,'restoreRequiresSameWindowsUser':True,'plaintextFilesWritten':0,'credentialsCopied':False,'uninstalledOrCleared':False,'createdAt':datetime.now(timezone.utc).isoformat()}
(out/'results.json').write_text(json.dumps(result,indent=2),encoding='utf8');raw=None;print(json.dumps(result))
