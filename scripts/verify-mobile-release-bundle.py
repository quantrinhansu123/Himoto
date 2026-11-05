import argparse,json
from pathlib import Path
from lib.mobile_release_bundle import verify_bundle
p=argparse.ArgumentParser();p.add_argument('--apk',type=Path,required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[1];apk=args.apk.resolve();assert apk.is_relative_to(root/'.backups')
result=verify_bundle(apk);proof=apk.parent/'bundle-verification.json'
if proof.exists():assert json.loads(proof.read_text(encoding='utf8'))==result
else:proof.write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
