"""Check backup atomicity and the new application's monitor without external calls."""
import contextlib,datetime,hashlib,importlib.util,io,json,os,pathlib,tempfile,types,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'deploy'/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
backup,monitor=load('backup'),load('monitor')

class OpsTests(unittest.TestCase):
    def test_backup_credentials_are_in_environment_with_verified_tls_and_readonly_source(self):
        with patch.dict(os.environ,{'DATABASE_URL':'postgresql://qa:p%40ss@db.example.invalid:6543/app'},clear=True):env=backup.database_environment()
        self.assertEqual(env['PGPASSWORD'],'p@ss');self.assertEqual(env['PGHOST'],'db.example.invalid')
        self.assertEqual(env['PGSSLMODE'],'verify-full');self.assertIn('default_transaction_read_only=on',env['PGOPTIONS'])

    def test_failed_dump_or_validation_keeps_previous_verified_snapshot(self):
        for fail_at in (1,2):
            with self.subTest(fail_at=fail_at),tempfile.TemporaryDirectory() as folder:
                base=pathlib.Path(folder);(base/'latest').write_text('previous\n');calls=[]
                def run(args,env=None):
                    calls.append(args)
                    if len(calls)==fail_at:raise RuntimeError('fixture failure')
                    pathlib.Path(args[-1]).write_bytes(b'fixture dump')
                with patch.object(backup,'BASE',base),patch.object(backup.os,'geteuid',return_value=0,create=True),patch.object(backup,'database_environment',return_value={}),patch.object(backup,'run',side_effect=run):
                    with self.assertRaisesRegex(RuntimeError,'fixture'):backup.main()
                self.assertEqual((base/'latest').read_text(),'previous\n');self.assertEqual(list(base.glob('.incomplete-*')),[])

    def test_success_validates_full_archive_before_updating_pointer_and_keeps_private_config(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);base=root/'backups';settings=root/'settings';settings.mkdir()
            (settings/'runtime.env').write_text('QA_CONFIG=fixture\n');(settings/'active.json').write_text(json.dumps({'sha':'a'*40}))
            calls=[]
            def run(args,env=None):
                calls.append([str(a) for a in args])
                self.assertFalse((base/'latest').exists())
                if len(calls)==1:pathlib.Path(args[-1]).write_bytes(b'complete fixture archive')
            previous_umask=os.umask(0o077)
            try:
                with patch.multiple(backup,BASE=base,SETTINGS=settings),patch.object(backup.os,'geteuid',return_value=0,create=True),patch.object(backup,'database_environment',return_value={}),patch.object(backup,'run',side_effect=run),contextlib.redirect_stdout(io.StringIO()):backup.main()
            finally:os.umask(previous_umask)
            snapshot=base/(base/'latest').read_text().strip();metadata=json.loads((snapshot/'manifest.json').read_text())
            self.assertIn('--file=/dev/null',calls[1]);self.assertTrue(metadata['archive_fully_readable'])
            self.assertEqual(metadata['sha256'],hashlib.sha256((snapshot/'himoto.dump').read_bytes()).hexdigest())
            self.assertEqual((snapshot/'runtime.env').read_text(),'QA_CONFIG=fixture\n')
            if os.name!='nt':self.assertEqual((snapshot/'runtime.env').stat().st_mode&0o077,0)

    def test_missing_or_escaping_backup_pointer_is_unhealthy(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);now=datetime.datetime.now(datetime.timezone.utc)
            self.assertIsNotNone(monitor.backup_issue(root,'new_app_backup',now))
            (root/'latest').write_text('../outside');self.assertIsNotNone(monitor.backup_issue(root,'new_app_backup',now))

    def test_monitor_uses_health_endpoint_and_detects_a_disabled_login(self):
        enabled='<input id="login-email"><input id="login-password"><button class="hm-login-submit">Login</button>'
        for disabled in (False,True):
            with self.subTest(disabled=disabled),tempfile.TemporaryDirectory() as folder:
                root=pathlib.Path(folder);(root/'active.json').write_text(json.dumps({'port':3100,'sha':'b'*40}));commands=[]
                def run(args,**kwargs):
                    commands.append(args);body=''
                    if '/api/health' in args[-1]:body=json.dumps({'status':'ok','release':'b'*40})
                    elif args[0]=='curl':body='200'
                    elif args[0]=='ufw':body='Status: active'
                    return types.SimpleNamespace(returncode=0,stdout=body)
                class Response:
                    headers={'Cache-Control':'private, no-store'}
                    def __enter__(self):return self
                    def __exit__(self,*args):pass
                    def read(self):return (enabled.replace('id="login-email"','id="login-email" disabled') if disabled else enabled).encode()
                with patch.multiple(monitor,SETTINGS=root,OUTPUT=root/'out'),patch.object(monitor.subprocess,'run',side_effect=run),patch.object(monitor,'backup_issue',return_value=None),patch.object(monitor.urllib.request,'urlopen',return_value=Response()),contextlib.redirect_stdout(io.StringIO()):status=monitor.main()
                self.assertEqual(status,1 if disabled else 0)
                self.assertTrue(any(command[-1]=='https://app.himoto.vn/api/health' for command in commands))

if __name__=='__main__':unittest.main()
