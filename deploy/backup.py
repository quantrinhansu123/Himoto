#!/usr/bin/python3
"""Back up the new app's Supabase schema without modifying source data."""
import datetime,hashlib,json,os,pathlib,re,shutil,subprocess,tempfile,urllib.parse

BASE=pathlib.Path('/var/backups/himoto-web')
TOOLS=pathlib.Path('/usr/lib/postgresql/18/bin')
SETTINGS=pathlib.Path('/etc/himoto-web')

def database_environment():
    url=urllib.parse.urlsplit(os.environ.get('DATABASE_URL') or os.environ.get('SUPABASE_DATABASE_URL') or '')
    if url.scheme not in ('postgres','postgresql') or not url.hostname or not url.username:
        raise RuntimeError('Missing backup database configuration')
    return {**os.environ,'PGHOST':url.hostname,'PGPORT':str(url.port or 5432),
        'PGDATABASE':urllib.parse.unquote(url.path.lstrip('/')),'PGUSER':urllib.parse.unquote(url.username),
        'PGPASSWORD':urllib.parse.unquote(url.password or ''),'PGSSLMODE':'verify-full',
        'PGSSLROOTCERT':str(SETTINGS/'database-ca.pem'),'PGCONNECT_TIMEOUT':'15',
        'PGOPTIONS':'-c default_transaction_read_only=on','PGAPPNAME':'himoto-readonly-backup'}

def run(args,env=None):
    # Command lines and errors must never contain database URLs or passwords.
    result=subprocess.run([str(arg) for arg in args],env=env,capture_output=True,timeout=480)
    if result.returncode:
        (BASE/'last-error.log').write_bytes(result.stderr)
        (BASE/'last-error.log').chmod(0o600)
        raise RuntimeError('Backup tool failed: '+pathlib.Path(args[0]).name+'; see private backup log')
    return result

def digest(path):
    value=hashlib.sha256()
    with path.open('rb') as source:
        while chunk:=source.read(1024*1024):value.update(chunk)
    return value.hexdigest()

def main():
    if os.geteuid()!=0:raise RuntimeError('Root backup service required')
    os.umask(0o077);BASE.mkdir(mode=0o700,parents=True,exist_ok=True)
    name=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    staging=pathlib.Path(tempfile.mkdtemp(prefix='.incomplete-',dir=BASE))
    try:
        archive=staging/'himoto.dump'
        run([TOOLS/'pg_dump','--format=custom','--schema=himoto','--no-owner','--no-privileges',
            '--lock-wait-timeout=5s','--file',archive],database_environment())
        # Read/decompress the complete archive, not only its table of contents.
        run([TOOLS/'pg_restore','--file=/dev/null',archive])
        shutil.copyfile(SETTINGS/'runtime.env',staging/'runtime.env')
        metadata={'completed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'schema':'himoto','archive_bytes':archive.stat().st_size,'sha256':digest(archive),
            'archive_fully_readable':True,'source_business_writes':0,
            'release':json.loads((SETTINGS/'active.json').read_text())['sha']}
        (staging/'manifest.json').write_text(json.dumps(metadata,indent=2))
        destination=BASE/name;staging.rename(destination)
        pointer=BASE/'latest.new';pointer.write_text(name+'\n');os.replace(pointer,BASE/'latest')
        # Retention applies only to validated snapshot names in this backup root.
        snapshots=sorted(p for p in BASE.iterdir() if p.is_dir() and re.fullmatch(r'\d{8}T\d{6}Z',p.name) and (p/'manifest.json').is_file())
        for old in snapshots[:-14]:
            if old.resolve().parent==BASE.resolve() and not old.is_symlink():shutil.rmtree(old)
        print(json.dumps({'backup_complete':True,**metadata}))
    finally:
        if staging.exists() and staging.resolve().parent==BASE.resolve():shutil.rmtree(staging)

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'backup_complete':False,'error':str(error)}));raise SystemExit(1)
