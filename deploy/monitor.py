#!/usr/bin/python3
"""Check the new application's origin and retain existing server/marketing checks."""
import datetime,json,pathlib,subprocess,urllib.request
from html.parser import HTMLParser
SETTINGS=pathlib.Path('/etc/himoto-web')
OUTPUT=pathlib.Path('/var/lib/himoto-monitor')

class Form(HTMLParser):
    def __init__(self):super().__init__();self.controls={}
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='input' and attrs.get('id') in ('login-email','login-password'):self.controls[attrs['id']]='disabled' not in attrs
        if tag=='button' and 'hm-login-submit' in attrs.get('class','').split():self.controls['submit']='disabled' not in attrs

def backup_issue(root,label,now):
    try:
        name=(root/'latest').read_text().strip()
        target=(root/name).resolve() if not pathlib.Path(name).is_absolute() else pathlib.Path(name).resolve()
        if target.parent!=root.resolve():return {label:'invalid backup pointer'}
        manifest=target/'manifest.json'
        if now.timestamp()-manifest.stat().st_mtime>36*3600:return {label:'backup older than 36 hours'}
        if label=='new_app_backup' and (not json.loads(manifest.read_text()).get('archive_fully_readable') or not (target/'himoto.dump').is_file() or not (target/'runtime.env').is_file()):return {label:'verified archive or runtime configuration unavailable'}
    except (OSError,ValueError):return {label:'verified backup unavailable'}
    return None

def main():
    now=datetime.datetime.now(datetime.timezone.utc);report={'utc':now.isoformat(),'issues':[]}
    for service in ['nginx','php7.4-fpm','fail2ban']:
        if subprocess.run(['systemctl','is-active','--quiet',service],capture_output=True).returncode:report['issues'].append({'service_not_active':service})
    try:
        active=json.loads((SETTINGS/'active.json').read_text())
        if active['port'] not in (3100,3101):raise ValueError('Invalid app port')
        if subprocess.run(['systemctl','is-active','--quiet','himoto-web@'+str(active['port'])],capture_output=True).returncode:raise RuntimeError('App process inactive')
        # Check Nginx's selected origin, rather than the intentionally redirecting /.
        result=subprocess.run(['curl','-ksS','--fail','--max-time','15','--resolve','app.himoto.vn:443:127.0.0.1','https://app.himoto.vn/api/health'],capture_output=True,text=True,timeout=20)
        health=json.loads(result.stdout)
        if result.returncode or health.get('release')!=active['sha'] or health.get('status')!='ok':raise RuntimeError('Wrong or unavailable release')
        with urllib.request.urlopen('http://127.0.0.1:'+str(active['port'])+'/login',timeout=10) as response:
            form=Form();form.feed(response.read().decode('utf-8'))
            if not all(form.controls.get(name) for name in ('login-email','login-password','submit')):raise RuntimeError('Login unavailable')
            if 'no-store' not in response.headers.get('Cache-Control',''):raise RuntimeError('Login is cached')
        report['app_release']=active['sha']
    except Exception:report['issues'].append({'app_origin_or_login_unhealthy':True})
    marketing=subprocess.run(['curl','-ksS','--max-time','15','--resolve','himoto.vn:443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://himoto.vn/'],capture_output=True,text=True,timeout=20)
    if marketing.returncode or marketing.stdout.strip()!='200':report['issues'].append({'marketing_origin_unhealthy':True})
    firewall=subprocess.run(['ufw','status'],capture_output=True,text=True,timeout=20)
    if 'Status: active' not in firewall.stdout:report['issues'].append({'firewall_not_active':True})
    for root,label in [(pathlib.Path('/var/backups/himoto'),'marketing_and_legacy_backup'),(pathlib.Path('/var/backups/himoto-web'),'new_app_backup')]:
        issue=backup_issue(root,label,now)
        if issue:report['issues'].append(issue)
    for name in ['/tmp/wp-template.php','/tmp/1.txt','/var/www/app.himoto.vn/public/wp-template.php']:
        if pathlib.Path(name).exists():report['issues'].append({'known_malware_path_present':name})
    folder=OUTPUT;folder.mkdir(mode=0o700,parents=True,exist_ok=True)
    output=folder/'health-latest.json';output.write_text(json.dumps(report));output.chmod(0o600)
    print(json.dumps(report));return 1 if report['issues'] else 0

if __name__=='__main__':raise SystemExit(main())
