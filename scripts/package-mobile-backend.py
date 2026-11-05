"""Package reviewable backend source without env, credentials or operational workbooks."""
import argparse
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--build-result',type=Path,required=True);args=parser.parse_args()
output=args.output.resolve();assert output.is_relative_to(ROOT/'.backups')and not output.exists()
build=json.loads(args.build_result.read_text(encoding='utf-8'));assert build['ok']and build['sourceUnchanged']and build['environmentFilesCopied']==0
build_manifest=json.loads((args.build_result.parent/'manifest.json').read_text(encoding='utf-8'))
digest=lambda data:hashlib.sha256(data).hexdigest()
for entry in build_manifest['files']:assert digest((ROOT/entry['path']).read_bytes())==entry['sha256'],'Source changed after verified build: '+entry['path']
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip();assert head==build['head']
names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0')
configs={'package.json','package-lock.json','tsconfig.json','next.config.js','postcss.config.js','eslint.config.mjs','next-env.d.ts','README.md'}
files=sorted({name for name in names if name and (name.startswith(('src/','shared/','public/','docs/sql/','scripts/'))or name in configs)and not name.endswith('.pyc')})
files+=['docs/mobile-web-dev-request-2026-11-05.md']
assert all(not any(part.startswith('.env')for part in Path(name).parts)and'..'not in Path(name).parts for name in files)
output.mkdir(parents=True)
manifest=[]
archive=output/'himoto-backend-source.zip'
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,compresslevel=6)as bundle:
 for name in files:
  file=ROOT/name;assert file.is_file()and not file.is_symlink()
  data=file.read_bytes();bundle.writestr(name,data);manifest.append({'path':name,'sha256':digest(data),'bytes':len(data)})
with zipfile.ZipFile(archive)as bundle:
 assert len(bundle.infolist())==len(manifest)
 for entry in manifest:assert digest(bundle.read(entry['path']))==entry['sha256']
summary={'baseHead':head,'dirtyWorktreeIncluded':True,'environmentFilesCopied':0,'operationalDataIncluded':False,'sourceFiles':len(files),'archive':archive.name,'archiveSha256':digest(archive.read_bytes()),'build':build,'files':manifest,'createdAt':datetime.now(timezone.utc).isoformat()}
(output/'manifest.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(output/'HANDOFF.md').write_bytes((ROOT/'docs/mobile-web-dev-request-2026-11-05.md').read_bytes())
(output/'SHA256SUMS.txt').write_text(summary['archiveSha256']+'  '+archive.name+'\n',encoding='ascii')
print(json.dumps({k:summary[k]for k in ['baseHead','sourceFiles','environmentFilesCopied','archive','archiveSha256']},indent=2))
