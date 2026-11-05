"""Recovery journal durability/actor acceptance with synthetic local state only."""
import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from lib.mobile_fixture_journal import FixtureJournal, ROOT
from lib import mobile_bad_debt_recovery_model as model

output = ROOT/".backups"/("recovery-journal-test-"+str(uuid4()))
output.mkdir(parents=True); checkpoint = output/"state.json"; checks = []
journal = FixtureJournal(checkpoint, model=model)

def call(path, method="GET", body=None, headers=None):
    return journal.transact(path, method, body or {}, headers or auth)

def login(name="qa"):
    status, session, _ = journal.transact("/api/mobile/v1/session", "POST", {"email": name, "password": "fixture-password"}, {})
    assert status == 200
    return {"Authorization": "Bearer "+session["token"]}

def prepare(index, page=1):
    status, result, _ = call(f"/api/mobile/v1/contracts/{index}/recoveries?page={page}")
    assert status == 200
    return result

def body(index, page=1):
    order = prepare(index, page); item = next(r for r in order["items"]["rows"] if r["available"])
    result = {"revision": order["revision"], "item_id": item["id"], "item_revision": item["revision"], "recovered_at": "2026-10-31T09:30", "note": "QA recovery"}
    status, preview, _ = call(f"/api/mobile/v1/contracts/{index}/recoveries/preview", "POST", result)
    assert status == 200
    return {**result, "review_snapshot": preview["snapshot"]}

auth = login()
assert prepare(8101, 2)["items"]["rows"][0]["license"] == "QA-RECOVER-26"
assert "finance.write" not in model.user(journal.state, 7)["permissions"]
first = body(8101); assert body(8101) == first and journal.summary()["writes"] == 0
checks.append("Paginated recovery preparation and stable readonly preview require no financial grant, UUID or physical write")
first_key = str(uuid4()); money = deepcopy(journal.state["bad_debt_recovery_profiles"][8101]["amounts"])
status, proof, _ = call("/api/mobile/v1/contracts/8101/recoveries", "POST", first, {**auth, "Idempotency-Key": first_key})
assert status == 200 and proof["review"]["before"] == money and journal.summary()["writes"] == 1
assert journal.state["bad_debt_recovery_profiles"][8101]["amounts"] == money
assert call("/api/mobile/v1/contracts/8101/recoveries", "POST", first, {**auth, "Idempotency-Key": first_key})[1]["replayed"]
assert journal.summary()["writes"] == 1
checks.append("Confirmed recovery/replay persist one original actor/date/event proof and preserve the exact frozen debt/deposit")
receiver = login("qa-receiver")
assert call(f"/api/mobile/v1/recoveries/requests/{first_key}", headers=receiver)[1]["receipt"] is None
assert call(f"/api/mobile/v1/write-requests/{first_key}/resolve", "POST", {"operation": "return.recover:8101"}, receiver)[1]["status"] == "cancelled"
assert call(f"/api/mobile/v1/recoveries/requests/{first_key}")[1]["receipt"]["requestId"] == first_key
checks.append("A different authenticated actor cannot read or resolve another actor proof; its same UUID tombstone does not alter the original receipt")
dropped = body(8105); dropped_key = str(uuid4()); journal.control(lambda s: s.update(mode="drop"))
assert call("/api/mobile/v1/contracts/8105/recoveries", "POST", dropped, {**auth, "Idempotency-Key": dropped_key})[0] == 503
assert call(f"/api/mobile/v1/write-requests/{dropped_key}/resolve", "POST", {"operation": "return.recover:8105"})[1]["status"] == "cancelled"
before = journal.summary(); journal.close(); journal = FixtureJournal(checkpoint, model=model)
assert journal.summary() == before
late = journal.state["bad_debt_recovery_delayed"]
assert journal.transact(**late)[0] == 409 and journal.summary()["writes"] == 1
checks.append("A dropped intent is tombstoned durably; exact restart retains sessions/proof and delayed delivery still fails after restart")
lost = body(8104); lost_key = str(uuid4()); journal.control(lambda s: s.update(mode="lose_response"))
status, lost_proof, lost_response = call("/api/mobile/v1/contracts/8104/recoveries", "POST", lost, {**auth, "Idempotency-Key": lost_key})
assert status == 200 and lost_response and journal.summary()["writes"] == 2
before = journal.summary(); journal.close(); journal = FixtureJournal(checkpoint, model=model)
assert journal.summary() == before
assert call(f"/api/mobile/v1/write-requests/{lost_key}/resolve", "POST", {"operation": "return.recover:8104"})[1]["status"] == "committed"
journal.control(lambda s: s.update(bad_debt_recovery_corrections=["historyCurrent", "moneyCurrent"]))
current = call(f"/api/mobile/v1/recoveries/requests/{lost_key}")[1]["receipt"]
assert not current["historyCurrent"] and not current["moneyCurrent"] and current["event"] == lost_proof["event"]
assert journal.state["bad_debt_recovery_receipts"][f"7:{lost_key}"]["receipt"] == lost_proof
checks.append("Lost response after persisted commit is resolved after restart; later history/money warnings never rewrite the original proof")
journal.control(lambda s: s["scopes"].update({"7": {"storeId": 24, "allStores": False}}))
assert call(f"/api/mobile/v1/recoveries/requests/{lost_key}")[0] == 403
journal.control(lambda s: s["scopes"].update({"7": {"storeId": None, "allStores": True}}))
assert call(f"/api/mobile/v1/recoveries/requests/{lost_key}")[1]["receipt"]["requestId"] == lost_key
kept = deepcopy(journal.summary()['receipts'])
journal.control(lambda s: model.seed_dataset(s, 8200))
assert journal.summary()['receipts'] == kept and prepare(8201, 2)['items']['rows'][0]['license'] == 'QA-RECOVER-26'
unchanged = journal.summary()
try:
    journal.control(lambda s: model.seed_dataset(s, 8200))
    raise AssertionError('A dataset must never be reset')
except AssertionError as error:
    assert str(error) != 'A dataset must never be reset'
assert journal.summary() == unchanged
http_body = body(8201)
checks.append('Appending a fresh dataset preserves every prior receipt; repeating a dataset seed fails without replacing rows, keys or checkpoint generation')
before = journal.summary(); disk = checkpoint.read_bytes()
try:
    FixtureJournal(checkpoint, model=model)
    raise AssertionError("Second process must not own the checkpoint")
except RuntimeError: pass
try:
    with patch("lib.mobile_fixture_journal.os.replace", side_effect=OSError("QA atomic replacement failure")):
        journal.control(lambda s: s.update(mode="conflict"))
    raise AssertionError("Failed replace must not acknowledge")
except OSError: pass
assert journal.summary() == before and checkpoint.read_bytes() == disk
journal.close()
corrupt = output/"corrupt.json"; payload = json.loads(disk); payload["digest"] = "0"*64
corrupt.write_text(json.dumps(payload), encoding="utf-8")
try:
    FixtureJournal(corrupt, model=model)
    raise AssertionError("Corruption must fail closed")
except AssertionError as error:
    assert str(error) != "Corruption must fail closed"
assert corrupt.read_text(encoding="utf-8") == json.dumps(payload)
checks.append("Scope changes quarantine original proof; checkpoint locks, failed atomic replacement and corrupt digests fail closed without blank reseeding or lost state")

with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0)); port = probe.getsockname()[1]
assert port not in (8081, 8091, 8093, 8094, 8097)
def start_server():
    process = subprocess.Popen([sys.executable, str(ROOT/"scripts/mobile-recovery-fixture-server.py"), "--port", str(port), "--state-file", str(checkpoint)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for _ in range(100):
        if process.poll() is not None: raise AssertionError(process.stderr.read().decode())
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=.5) as response: assert json.load(response)["fixtureOnly"]
            return process
        except urllib.error.URLError: time.sleep(.05)
    process.terminate(); process.wait(timeout=10); raise AssertionError("Fixture HTTP startup timeout")
def http(path, body=None, headers=None):
    request = urllib.request.Request(f"http://127.0.0.1:{port}"+path, data=json.dumps(body).encode() if body is not None else None, headers={**auth, 'Content-Type':'application/json', **(headers or {})})
    with urllib.request.urlopen(request, timeout=4) as response: return json.load(response)
process = start_server()
try:
    before = http("/__fixture_state")
    assert http(f"/api/mobile/v1/recoveries/requests/{lost_key}")["receipt"]["requestId"] == lost_key
    http('/__fixture_mode', {'mode':'lose_response'}); http_key = str(uuid4())
    try:
        http('/api/mobile/v1/contracts/8201/recoveries', http_body, {'Idempotency-Key':http_key})
        raise AssertionError('The original commit response must fail explicitly')
    except urllib.error.HTTPError as error:
        assert error.code == 503
    saved = http(f'/api/mobile/v1/recoveries/requests/{http_key}')['receipt']
    assert saved['requestId'] == http_key and http('/__fixture_state')['writes'] == before['writes']+1
    replay = http('/api/mobile/v1/contracts/8201/recoveries', http_body, {'Idempotency-Key':http_key})
    assert replay['replayed'] and replay['event'] == saved['event'] and http('/__fixture_state')['writes'] == before['writes']+1
    before = http('/__fixture_state')
    checks.append('An actual post-commit HTTP503 preserves one original receipt; explicit replay returns that proof without another physical write or reliance on socket retry behavior')
finally:
    process.terminate(); process.wait(timeout=10)
process = start_server()
try:
    assert http("/__fixture_state") == before
    assert http(f"/api/mobile/v1/recoveries/requests/{lost_key}")["receipt"]["event"] == lost_proof["event"]
finally:
    process.terminate(); process.wait(timeout=10)
checks.append("Real loopback server stop/start restores exact full checkpoint, bearer session and original recovery proof")
result = {"passed": len(checks), "checks": checks, "fixtureOnly": True, "operationalWrites": 0, "checkpointDirectory": str(output)}
(ROOT/".backups/mobile-recovery-journal-results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
