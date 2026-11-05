const assert = require('node:assert/strict');
const path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const table = load(path.join(root, 'lib/server/management-table'));
const catalogue = load(path.join(root, 'lib/server/mobile-catalogue'));
const domain = load(path.join(root, 'lib/management/management-table'));
const { EMPTY_QUERY } = load(path.join(root, 'lib/management/table-utils'));
const { isRecord, isPage } = load(path.resolve('mobile/src/lib/response-validation'));
const workspaces = load(path.resolve('shared/mobile-contract-workspaces'));
async function main() {
  const checks = [];
  for (const { key } of workspaces.CONTRACT_WORKSPACES) {
    const query = catalogue.mobileTableParams(new URLSearchParams({ scope: key, store: '23', from: '2026-11-01', to: '2026-11-03', store_basis: 'warehouse' }), 'contracts');
    assert.equal(table.parseManagementTable('contracts', query).scope, key);
    assert.equal(query.get('store_basis'), 'warehouse');
  }
  for (const query of ['scope=due&scope=vat', 'scope=unknown', 'scope=due&from=2026-02-30', 'from=2026-11-03&to=2026-11-01', 'all=1', 'filter_id=1', 'store_basis=other']) {
    assert.throws(() => table.parseManagementTable('contracts', catalogue.mobileTableParams(new URLSearchParams(query), 'contracts')));
  }
  assert.throws(() => catalogue.mobileTableParams(new URLSearchParams('scope=due'), 'customers'));
  checks.push('All implemented workspaces pass only bounded web scopes/date/warehouse filters; invalid, duplicate and unbounded filters are rejected');
  const now = Date.parse('2026-11-03T05:00:00Z');
  const raw = { id: 11, code: 'QA-011', name: 'QA', customer_name: 'QA Customer', status: 'overdue', store_id: 23, rental_type: 'ownership', billing_due_amount: 150000, billing_next_due_at: '2026-11-02T08:00:00+07:00', company_paid_amount: 0, total_amount: 500000, paid_amount: 100000, end_date: '2026-11-01T08:00:00+07:00', draft_payload: { private: true }, customer_id_card: 'PRIVATE', bank_secret: 'PRIVATE' };
  const projected = catalogue.mobileRecord('contracts', raw);
  assert(isRecord(projected)); assert.equal(projected.monitoring.dueAmount, 150000);
  assert.equal(projected.monitoring.lateFeeEstimate, null); assert.equal(projected.monitoring.companyPaidAmount, 0);
  assert(!JSON.stringify(projected).includes('PRIVATE'));
  assert(!isRecord({ ...projected, monitoring: { ...projected.monitoring, dueAmount: '150000' } }));
  const base = { kind: 'contracts', query: EMPTY_QUERY, store: 'all', scope: '', page: 1, size: 20, sort: 'code', direction: 'desc' };
  const source = [raw, { ...raw, id: 12, status: 'renting', rental_type: 'daily', end_date: '2026-11-06T08:00:00+07:00', company_payment_count: 1 }, { ...raw, id: 13, status: 'draft', rental_type: 'daily' }, { ...raw, id: 14, status: 'completed', rental_type: 'daily' }];
  assert.deepEqual(domain.projectManagementTable(source, { ...base, scope: 'drafts' }, false, now).rows.map(r => r.id), [13]);
  assert.deepEqual(domain.projectManagementTable(source, { ...base, scope: 'vat' }, false, now).rows.map(r => r.id), [12]);
  assert.deepEqual(domain.projectManagementTable(source, { ...base, scope: 'ownership' }, false, now).rows.map(r => r.id), [11]);
  assert.deepEqual(domain.projectManagementTable(source, { ...base, scope: 'active' }, false, now).rows.map(r => r.id).sort(),[11,12]);
  checks.push('Contract cards preserve nullable web amounts and omit private payloads; drafts/VAT/ownership membership uses the shared web domain');
  // Actual SQL reader: exclude a still-renting future contract before total/page.
  const candidate = [
    { id: 21, status: 'renting', contract_number: 'QA-FUTURE', rent_at: '2026-11-01T01:00:00Z', end_date: '2099-01-01T01:00:00Z', return_at: '2099-01-01T01:00:00Z' },
    { id: 22, status: 'overdue', contract_number: 'QA-LATE', rent_at: '2026-10-01T01:00:00Z', end_date: '2026-10-02T01:00:00Z', return_at: '2026-10-02T01:00:00Z' },
    { id: 23, status: 'bad_debt', contract_number: 'QA-DEBT', rent_at: '2026-10-01T01:00:00Z', end_date: '2026-10-02T01:00:00Z', return_at: '2026-10-02T01:00:00Z' },
  ];
  const result = await table.readManagementTable({ async query(sql, values = []) {
    if (/\bLIMIT \$1\b/.test(sql)) { assert.equal(values[0], 250); return { rows: candidate }; }
    if (sql.includes('ANY($1')) return { rows: candidate.map(row => ({ ...row, vehicles: [], total: 500000 })) };
    throw Error('Unexpected SQL: ' + sql.slice(0, 80));
  } }, 'contracts', new URLSearchParams('scope=overdue&size=1&sort=code&direction=desc'));
  assert.equal(result.total, 2); assert.equal(result.pages, 2); assert.equal(result.rows.length, 1); assert.notEqual(result.rows[0].id, 21);
  checks.push('Real paged web reader filters the overdue scope before counting/paging, retaining bad debt and excluding future rentals');
  assert(isPage({ rows: [projected], total: 1, page: 1, pages: 1, statusCounts: [], updatedAt: new Date().toISOString(), scope: 'due' }));
  console.log(JSON.stringify({ passed: checks.length, checks, operationalWrites: 0, deepAcceptance: false }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
