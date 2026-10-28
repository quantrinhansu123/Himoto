"""Exercise warm-up release identity and Nginx rollback without server mutations."""
import importlib.util,json,pathlib,tempfile,unittest,sys,types
from unittest.mock import patch
sys.dont_write_bytecode=True
if sys.platform=='win32':
    sys.modules.setdefault('fcntl',types.SimpleNamespace())
    sys.modules.setdefault('pwd',types.SimpleNamespace())
spec=importlib.util.spec_from_file_location('release',pathlib.Path(__file__).resolve().parents[1]/'deploy/release.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class ReleaseTests(unittest.TestCase):
    def test_health_requires_exact_commit(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return b'{"status":"ok","release":"wrong"}'
        with patch.object(release.urllib.request,'urlopen',return_value=Response()),patch.object(release.time,'sleep'):
            with self.assertRaisesRegex(RuntimeError,'health'):release.ready(3100,'a'*40)

    def test_nginx_failure_restores_both_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);site=root/'site';upstream=root/'upstream';settings=root/'settings';settings.mkdir()
            site.write_text('old site');upstream.write_text('old upstream');(settings/'nginx-app.template').write_text('new site')
            calls=[]
            def run(args):
                calls.append(args)
                if len(calls)==1:raise RuntimeError('nginx validation failed')
            with patch.multiple(release,SITE=site,UPSTREAM=upstream,SETTINGS=settings),patch.object(release,'run',side_effect=run):
                with self.assertRaisesRegex(RuntimeError,'validation'):release.activate(3101,'b'*40)
            self.assertEqual(site.read_text(),'old site');self.assertEqual(upstream.read_text(),'old upstream')
            self.assertEqual(calls[-1],['systemctl','reload','nginx'])

    def test_success_selects_new_release_and_retires_old_port(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);site=root/'site';upstream=root/'upstream';settings=root/'settings';settings.mkdir()
            site.write_text('old site');upstream.write_text('old upstream');(settings/'nginx-app.template').write_text('new site')
            with patch.multiple(release,SITE=site,UPSTREAM=upstream,SETTINGS=settings,BASE=root),patch.object(release,'run') as run,patch.object(release.subprocess,'run') as stop,patch.object(release.time,'sleep'),patch.object(release,'link') as link:
                release.activate(3101,'c'*40)
            self.assertIn('3101',upstream.read_text());self.assertEqual(site.read_text(),'new site')
            self.assertEqual(json.loads((settings/'active.json').read_text())['sha'],'c'*40)
            link.assert_called_once_with(root/'current',root/'releases'/('c'*40))
            run.assert_any_call(['systemctl','enable','himoto-web@3101.service'])
            stop.assert_any_call(['systemctl','stop','himoto-web@3100.service'],capture_output=True)

if __name__=='__main__':unittest.main()
