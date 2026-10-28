"""Installed by the local release runner over pinned SSH. Payload contains reviewed files."""
import base64,json,pathlib,hashlib,subprocess,os,grp,datetime
payload=json.loads(base64.b64decode('__BASE64_PAYLOAD__'))
root=pathlib.Path('/var/www/app.himoto.vn').resolve()
if str(root)!='/var/www/app.himoto.vn':raise RuntimeError('Unexpected application root')
release=payload['release']
if not __import__('re').fullmatch('[a-zA-Z0-9-]{1,80}',release):raise RuntimeError('Invalid release')
backup=pathlib.Path('/var/backups/himoto-rental-integrity-20261029')/release
backup.mkdir(parents=True,exist_ok=True)
allowed={'RentalIntegrityService.php':'app/Http/Services/RentalIntegrityService.php','VehicleRentalIntegrityController.php':'app/Http/Controllers/Vehicle/VehicleRentalIntegrityController.php','rental_integrity.php':'config/rental_integrity.php','rental-integrity.js':'public/js/rental-integrity.js','rental-integrity.css':'public/css/rental-integrity.css','check.php':None}
qa=backup/'qa';qa.mkdir(exist_ok=True)
for name,text in payload['files'].items():
 if name not in allowed:raise RuntimeError('Unexpected file')
 (qa/name).write_text(text)
for name in ['RentalIntegrityService.php','VehicleRentalIntegrityController.php','rental_integrity.php','check.php']:
 r=subprocess.run(['php','-l',str(qa/name)],text=True,capture_output=True)
 if r.returncode:raise RuntimeError('PHP syntax failed for '+name)
r=subprocess.run(['php',str(qa/'check.php')],text=True,capture_output=True,timeout=30,cwd=root)
if r.returncode:raise RuntimeError('Legacy QA failed: '+r.stderr[-1400:]+r.stdout[-400:])
try:qa_result=json.loads(r.stdout.strip().splitlines()[-1])
except:raise RuntimeError('Legacy QA did not return a report')
if not payload.get('apply'):
 print(json.dumps({'qa':qa_result,'installed':False,'backup':str(backup)}));raise SystemExit(0)
routes=root/'routes/api.php';blade=root/'resources/views/app.blade.php'
for name,p in [('routes',routes),('blade',blade)]:
 if hashlib.sha256(p.read_text().encode()).hexdigest()!=payload['expected'][name]:raise RuntimeError('Source changed since review: '+name)
changes={allowed[name]:text for name,text in payload['files'].items() if allowed[name]}
marker='// HIMOTO rental integrity: authenticated read-only report'
if marker in routes.read_text():raise RuntimeError('Integrity route already installed; use a versioned upgrade')
changes['routes/api.php']=routes.read_text()+"\n"+marker+"\nRoute::get('/auth/vehicle/rental-integrity', [\\App\\Http\\Controllers\\Vehicle\\VehicleRentalIntegrityController::class, 'index'])->middleware(['auth.jwt','check.status']);\n"
css_hash=hashlib.sha256(payload['files']['rental-integrity.css'].encode()).hexdigest()[:12]
js_hash=hashlib.sha256(payload['files']['rental-integrity.js'].encode()).hexdigest()[:12]
if 'rental-integrity.js' in blade.read_text():raise RuntimeError('Integrity asset already installed')
changes['resources/views/app.blade.php']=blade.read_text().replace('</head>','<link rel="stylesheet" href="/css/rental-integrity.css?v='+css_hash+'">\n</head>').replace('</body>','<script defer src="/js/rental-integrity.js?v='+js_hash+'"></script>\n</body>')
manifest=[]
for relative,text in changes.items():
 target=(root/relative).resolve()
 if os.path.commonpath([root,target])!=str(root):raise RuntimeError('Target outside app')
 before=target.read_bytes() if target.exists() else None
 saved=backup/'before'/relative;saved.parent.mkdir(parents=True,exist_ok=True)
 if before is not None:
  if saved.exists():raise RuntimeError('Backup already exists: '+relative)
  saved.write_bytes(before)
 manifest.append({'path':relative,'existed':before is not None,'before_sha256':hashlib.sha256(before).hexdigest() if before is not None else None,'after_sha256':hashlib.sha256(text.encode()).hexdigest()})
(backup/'prepared.json').write_text(json.dumps({'release':release,'files':manifest,'qa':qa_result},indent=2))
key_dir=pathlib.Path('/etc/himoto');key_dir.mkdir(mode=0o750,exist_ok=True);www=grp.getgrnam('www-data').gr_gid;os.chown(key_dir,0,www)
key=key_dir/'rental-integrity.key'
if key.exists() and key.read_text()!=payload['private_key']:raise RuntimeError('An existing bridge key differs')
if not key.exists():key.write_text(payload['private_key'])
os.chown(key,0,www);os.chmod(key,0o640)
applied=[]
try:
 for relative,text in changes.items():
  target=root/relative;target.parent.mkdir(parents=True,exist_ok=True)
  temporary=target.with_name(target.name+'.integrity-release-tmp');temporary.write_text(text);os.chmod(temporary,0o644);os.chown(temporary,0,www);temporary.replace(target);applied.append(relative)
 if list((root/'bootstrap/cache').glob('*route*')):
  cleared=subprocess.run(['php','artisan','route:clear'],cwd=root,text=True,capture_output=True,timeout=20)
  if cleared.returncode:raise RuntimeError('Could not clear route cache')
 for name in ['routes/api.php','resources/views/app.blade.php','app/Http/Services/RentalIntegrityService.php','app/Http/Controllers/Vehicle/VehicleRentalIntegrityController.php']:
  checked=subprocess.run(['php','-l',str(root/name)],text=True,capture_output=True)
  if checked.returncode:raise RuntimeError('Installed PHP syntax failed')
except:
 for relative in reversed(applied):
  original=backup/'before'/relative
  if original.exists():(root/relative).write_bytes(original.read_bytes())
  else:(root/relative).unlink()
 raise
result={'release':release,'installed':True,'files':manifest,'qa':qa_result,'backup':str(backup),'businessDataWrites':0,'telegramRequests':0,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(backup/'installed.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
