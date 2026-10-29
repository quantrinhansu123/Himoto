const assert = require('node:assert/strict');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, {info(){}, error(){}});
const {load, root} = require('./lib/load-typescript.cjs');
const {ownerDatabase} = load(path.join(root, 'lib/server/himoto-database'));
const {updateRenewalPayment} = load(path.join(root, 'lib/server/renewal-payment-corrections'));
const {readContractTelegram} = load(path.join(root, 'lib/server/contract-telegram'));

async function main() {
  console.log('Testing renewal payment and period corrections...');
  const orderId = 53213; // VPS-19881
  const actorId = 153;
  const user = { id: actorId, name: 'Tester', permissions: ['contracts.renew', 'contracts.telegram', 'finance.write'] };

  // 1. Kiểm tra đọc Telegram trước khi sửa
  const beforeTelegram = await readContractTelegram(ownerDatabase, orderId, actorId, user);
  const v3Event = beforeTelegram.state.events.find(e => e.key === 'renewal:53213:3');
  console.log('V3 Event before:', {
    key: v3Event?.key,
    label: v3Event?.label,
    textPreview: v3Event?.text?.split('\n').slice(0, 5)
  });

  // 2. Lấy receipt v3 (Tx #172946)
  const receipt = (await ownerDatabase.query(`
    SELECT t.id, t.xmin::text as revision, p.renewal_payload
    FROM himoto.transactions t
    JOIN himoto.management_contract_payments p ON p.transaction_id = t.id
    WHERE t.id = 172946 AND t.order_id = $1
  `, [orderId])).rows[0];

  assert(receipt, 'Receipt 172946 must exist');
  console.log('Current renewal_payload:', receipt.renewal_payload);

  // 3. Test sửa thời gian gia hạn từ 3 ngày (20/10 -> 23/10) thành 4 ngày (20/10/2026 15:04 -> 24/10/2026 15:04)
  const requestId = require('node:crypto').randomUUID();
  const newReturnAt = '2026-10-24T08:04:00.000Z'; // 24/10 15:04 GMT+7
  const newBeforeReturnAt = '2026-10-20T08:04:00.000Z'; // 20/10 15:04 GMT+7

  console.log('Updating renewal period to 4 days (20/10 - 24/10)...');
  await ownerDatabase.query('BEGIN');
  try {
    const updatedContext = await updateRenewalPayment(ownerDatabase, orderId, actorId, {
      request_id: requestId,
      transaction_id: receipt.id,
      revision: receipt.revision,
      reason: 'Sửa ngày hẹn trả thành 4 ngày theo hợp đồng',
      before_return_at: newBeforeReturnAt,
      return_at: newReturnAt,
    });
    console.log('Update successful, context returned.');

    // 4. Kiểm tra renewal_payload trong DB
    const updatedPayment = (await ownerDatabase.query(`
      SELECT renewal_payload FROM himoto.management_contract_payments WHERE transaction_id = 172946
    `)).rows[0];
    console.log('Updated renewal_payload in DB:', updatedPayment.renewal_payload);
    assert.equal(updatedPayment.renewal_payload.return_at, newReturnAt);
    assert.equal(updatedPayment.renewal_payload.before_return_at, newBeforeReturnAt);

    // 5. Kiểm tra readContractTelegram sinh nội dung mới
    const afterTelegram = await readContractTelegram(ownerDatabase, orderId, actorId, user);
    const updatedV3Event = afterTelegram.state.events.find(e => e.key === 'renewal:53213:3');
    console.log('\nV3 Event text after update:\n' + updatedV3Event?.text);
    assert(updatedV3Event?.text.includes('24/10/2026 15:04 (4 ngày)'), 'Telegram preview must show 4 ngày and 24/10/2026');

    await ownerDatabase.query('COMMIT');
    console.log('\nAll checks passed and committed successfully!');
  } catch (err) {
    await ownerDatabase.query('ROLLBACK');
    throw err;
  }
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exitCode = 1;
}).finally(() => process.exit());
