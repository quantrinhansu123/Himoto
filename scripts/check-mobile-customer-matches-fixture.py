"""Durable duplicate-customer QA model; never connects to operational services."""
import json
import uuid
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_customer_matches_fixture import seed_duplicates

path = Path('.backups') / ('mobile-duplicates-journal-' + uuid.uuid4().hex) / 'state.json'
journal = FixtureJournal(path, model=model)
checks = []
try:
    journal.control(seed_duplicates)
    _, session, _ = journal.transact('/api/mobile/v1/session', 'POST', {'email': 'qa', 'password': 'fixture-password'}, {})
    headers = {'Authorization': 'Bearer ' + session['token']}
    def call(path, method='POST', body=None, key=None):
        return journal.transact('/api/mobile/v1/' + path, method, body or {}, {**headers, **({'Idempotency-Key': key} if key else {})})
    identity = {'id_card': ' 001234567890 ', 'phone': '0901.111.111'}
    status, result, _ = call('customers/matches', body=identity)
    assert status == 200 and [row['canEdit'] for row in result['rows']] == [True, False]
    assert call('customers/matches', body={'id': 502})[1]['rows'] == []
    assert call('customers/502', 'GET')[0] == 404
    checks.append('Exact global matches are bounded snapshots; foreign ID/edit stays scoped')
    key = str(uuid.uuid4())
    body = {**journal.summary()['duplicateProfiles'][0], 'name': 'SyntheticDuplicateQA'}
    body.pop('id'); body.pop('revision')
    assert call('customers', body=body, key=key)[0] == 409
    assert journal.summary()['customerCreates'] == 0
    assert call(f'write-requests/{key}/resolve', body={'operation': 'customer.create'})[1]['status'] == 'cancelled'
    assert call('customers', body={**body, 'id_card': 'DIFFERENT'}, key=key)[1]['code'] == 'REQUEST_CANCELLED'
    checks.append('Choosing existing durably cancels original UUID and blocks a delayed changed create')
    edit_key = str(uuid.uuid4())
    journal.control(lambda state: state.update(mode='update-lost'))
    status, receipt, lost = call('customers/501', 'PATCH', {**body, 'name': 'UpdatedQA', 'revision': '100'}, edit_key)
    assert status == 200 and lost and journal.summary()['customerUpdates'] == 1
    assert call(f'write-requests/{edit_key}/resolve', body={'operation': 'customer.update:501'})[1]['status'] == 'committed'
    assert call('customers/501', 'PATCH', {**body, 'revision': '99'}, str(uuid.uuid4()))[1]['code'] == 'CUSTOMER_CONFLICT'
    checks.append('Lost edit commit retains its scoped receipt; stale updates do not overwrite')
    original = journal.summary()
finally:
    journal.close()
journal = FixtureJournal(path, model=model)
try:
    assert journal.summary() == original
    assert journal.summary()['customerReceipts'][edit_key]['receipt'] == receipt
    assert journal.summary()['tombstones'][key] == 'customer.create'
finally:
    journal.close()
checks.append('Restart preserves exact seeded profiles, updated revision, tombstone and receipt')
print(json.dumps({'passed': len(checks), 'checks': checks, 'fixtureOnly': True, 'operationalWrites': 0, 'checkpoint': str(path)}))
