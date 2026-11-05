"""Verify durable QA receipts/restart without contacting an operational service."""
import json
import uuid
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model

path = Path(".backups") / ("mobile-contract-flow-journal-" + uuid.uuid4().hex) / "state.json"
key = str(uuid.uuid4())
state = model.seed_state()
journal = FixtureJournal(path, model=model)
try:
    status, session, _ = journal.transact("/api/mobile/v1/session", "POST", {"email": "qa", "password": "fixture-password"}, {})
    assert status == 201
    headers = {"Authorization": "Bearer " + session["token"], "Idempotency-Key": key}
    body = {"name": "Synthetic QA", "phone": "", "address": "", "status": "draft", "store_id": 23, "relatives": []}
    journal.control(lambda state: state.update(mode="lost"))
    status, receipt, lost = journal.transact("/api/mobile/v1/customers", "POST", body, headers)
    assert status == 201 and lost and journal.summary()["customerCreates"] == 1
    original = journal.summary()
finally:
    journal.close()
journal = FixtureJournal(path, model=model)
try:
    assert journal.summary() == original
    status, replay, lost = journal.transact("/api/mobile/v1/customers", "POST", body, headers)
    assert status == 200 and replay == {**receipt, "replayed": True} and not lost
    status, result, _ = journal.transact("/api/mobile/v1/drafts/customer-lookup", "POST", {"id": receipt["id"]}, headers)
    assert status == 200 and result["rows"][0]["details"]["name"] == body["name"] and len(result["rows"][0]["relatives"]) == 2
    cancel_key = str(uuid.uuid4())
    status, resolved, _ = journal.transact(f"/api/mobile/v1/write-requests/{cancel_key}/resolve", "POST", {"operation": "customer.create"}, headers)
    assert status == 200 and resolved["status"] == "cancelled"
    status, _, _ = journal.transact("/api/mobile/v1/customers", "POST", body, {**headers, "Idempotency-Key": cancel_key})
    assert status == 409 and journal.summary()["customerCreates"] == 1
    assert original["customerReceipts"][key] == journal.summary()["customerReceipts"][key]
    final = journal.summary()
finally:
    journal.close()
journal = FixtureJournal(path, model=model)
try:
    assert journal.summary() == final
finally:
    journal.close()
print(json.dumps({"passed": 4, "fixtureOnly": True, "checks": ["lost commit persists across restart", "same UUID replays one original customer", "contract lookup uses exact saved customer with padded relatives", "cancelled UUID remains blocked with original proof intact"], "operationalWrites": 0, "checkpoint": str(path)}))
