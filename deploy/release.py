#!/usr/bin/python3
"""Receive a standalone artifact over stdin, warm the spare port, and switch Nginx.

The first release stays private until /etc/himoto-web/cutover-enabled exists.
Run this root-owned file only through the restricted SSH deployment command.
"""
import fcntl,json,os,pathlib,pwd,re,shutil,subprocess,sys,tarfile,tempfile,time,urllib.request

BASE=pathlib.Path('/srv/himoto-web')
SETTINGS=pathlib.Path('/etc/himoto-web')
SITE=pathlib.Path('/etc/nginx/sites-available/app.himoto.vn')
UPSTREAM=pathlib.Path('/etc/nginx/snippets/himoto-next-upstream.conf')
def run(args):
    return subprocess.run(args,check=True,capture_output=True,text=True)
def atomic(path,data,mode=0o644):
    temporary=path.with_name(path.name+'.new')
    temporary.write_text(data);temporary.chmod(mode);os.replace(temporary,path)
def link(path,target):
    temporary=path.with_name(path.name+'.new')
    if temporary.is_symlink():temporary.unlink()
    temporary.symlink_to(target,target_is_directory=True);os.replace(temporary,path)
def ready(port,sha):
    for _ in range(60):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=3) as response:
                body=json.load(response)
            if body.get('status')=='ok' and body.get('release')==sha:return
        except Exception:pass
        time.sleep(1)
    raise RuntimeError('New release failed health verification')
def activate(port,sha):
    previous_site=SITE.read_text();previous_upstream=UPSTREAM.read_text() if UPSTREAM.exists() else None
    try:
        atomic(UPSTREAM,f'proxy_pass http://127.0.0.1:{port};\n')
        atomic(SITE,(SETTINGS/'nginx-app.template').read_text())
        run(['nginx','-t']);run(['systemctl','reload','nginx'])
    except Exception:
        atomic(SITE,previous_site)
        if previous_upstream is None:
            if UPSTREAM.exists():UPSTREAM.unlink()
        else:atomic(UPSTREAM,previous_upstream)
        run(['nginx','-t']);run(['systemctl','reload','nginx']);raise
    link(BASE/'current',BASE/'releases'/sha)
    atomic(SETTINGS/'active.json',json.dumps({'port':port,'sha':sha}))
    other=3101 if port==3100 else 3100
    run(['systemctl','enable',f'himoto-web@{port}.service'])
    # The existing after-response delivery budget is 240s. Let already-started
    # work drain before stopping the old process, including queued media sends.
    if subprocess.run(['systemctl','is-active','--quiet',f'himoto-web@{other}.service'],capture_output=True).returncode==0:
        time.sleep(250)
    subprocess.run(['systemctl','disable',f'himoto-web@{other}.service'],capture_output=True)
    subprocess.run(['systemctl','stop',f'himoto-web@{other}.service'],capture_output=True)

def main():
    if os.geteuid()!=0:raise RuntimeError('Root deployment wrapper required')
    if len(sys.argv)!=2 or not re.fullmatch('[a-f0-9]{40}',sys.argv[1]):raise RuntimeError('Invalid release identifier')
    sha=sys.argv[1]
    with pathlib.Path('/run/lock/himoto-web-deploy.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        active=json.loads((SETTINGS/'active.json').read_text()) if (SETTINGS/'active.json').exists() else None
        if active and active['sha']==sha:
            print(json.dumps({'release':sha,'already_active':True}));return
        release=BASE/'releases'/sha
        with tempfile.TemporaryFile(dir=BASE/'releases') as incoming:
            total=0
            while chunk:=sys.stdin.buffer.read(1024*1024):
                total+=len(chunk)
                if total>768*1024*1024:raise RuntimeError('Artifact exceeds size limit')
                incoming.write(chunk)
            incoming.seek(0)
            with tarfile.open(fileobj=incoming,mode='r:gz') as archive:
                members=archive.getmembers()
                if sum(m.size for m in members)>2*1024*1024*1024:raise RuntimeError('Expanded artifact exceeds size limit')
                for member in members:
                    name=pathlib.PurePosixPath(member.name)
                    if name.is_absolute() or '..' in name.parts or any(p.startswith('.env') for p in name.parts):raise RuntimeError('Unsafe artifact path')
                if not release.exists():
                    release.mkdir(mode=0o755)
                    archive.extractall(release,filter='data')
        metadata=json.loads((release/'RELEASE.json').read_text())
        if metadata.get('sha')!=sha or not (release/'server.js').is_file():raise RuntimeError('Artifact identity mismatch')
        account=pwd.getpwnam('himoto-next')
        for root,dirs,files in os.walk(release):
            os.chown(root,0,account.pw_gid);os.chmod(root,0o755)
            for name in files:
                item=pathlib.Path(root)/name
                if not item.is_symlink():
                    executable=item.stat().st_mode&0o111
                    os.chown(item,0,account.pw_gid);os.chmod(item,0o755 if executable else 0o644)
        cache=release/'.next/cache'
        if cache.exists() and not cache.is_symlink():
            if cache.resolve().is_relative_to(release.resolve()):shutil.rmtree(cache)
            else:raise RuntimeError('Unsafe cache path')
        if not cache.exists():cache.symlink_to('/var/cache/himoto-web',target_is_directory=True)
        port=3101 if active and active['port']==3100 else 3100
        run(['systemctl','stop',f'himoto-web@{port}.service'])
        link(BASE/'instances'/str(port),release)
        atomic(SETTINGS/f'release-{port}.env',f'HIMOTO_RELEASE={sha}\n')
        try:
            run(['systemctl','start',f'himoto-web@{port}.service']);ready(port,sha)
        except Exception:
            subprocess.run(['systemctl','stop',f'himoto-web@{port}.service'],capture_output=True)
            raise
        atomic(SETTINGS/'staged.json',json.dumps({'port':port,'sha':sha}))
        enabled=(SETTINGS/'cutover-enabled').exists()
        if enabled:activate(port,sha)
        print(json.dumps({'release':sha,'port':port,'healthy':True,'activated':enabled}))
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'deployed':False,'error':str(error)}),file=sys.stderr);sys.exit(1)
