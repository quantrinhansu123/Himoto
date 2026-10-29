const assert = require('node:assert/strict');
const path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const { contractNotificationText } = load(path.join(root, 'lib/server/contract-notification-content'));
const { CONTRACT_TELEGRAM_ROUTE_SQL } = load(path.join(root, 'lib/server/contract-telegram-routing'));
const { requestPermission } = load(path.join(root, 'lib/server/access-request'));
const checks = [];

const text = contractNotificationText('battery_return', {
  code: 'PIN-VPS-27847', customer: 'Hoàng Tiến Hải', phone: '', store: 'CS Thuê sở hữu', actor: 'Nguyễn Như Hoài Linh',
  vehicles: '', vehicle_names: 'Pin xe điện', total: '0', at: '2026-10-29T06:08:00.000Z', photos: [], deposit: 0,
  return_details: { note: '', returned_at: ['2026-10-29T13:08:00+07:00'] },
});
assert.match(text, /Khách trả pin \/ sạc: Hoàng Tiến Hải/);
assert.match(text, /Pin \/ sạc: Pin xe điện/);
assert.match(text, /Mã HĐ: PIN-VPS-27847/);
assert.match(text, /Cơ sở: CS Thuê sở hữu/);
assert.match(text, /Nhận lại lúc:/);
assert.match(text, /Nhân viên xuất tin Telegram: Nguyễn Như Hoài Linh/);
assert.match(text, /Thời gian:/);
assert.match(CONTRACT_TELEGRAM_ROUTE_SQL, /battery_return/);
assert.match(CONTRACT_TELEGRAM_ROUTE_SQL, /lease_to_own/);
assert.equal(requestPermission('/api/auth/battery-contracts/9/telegram', 'GET'), 'contracts.read');
assert.equal(requestPermission('/api/auth/battery-contracts/9/telegram', 'POST'), 'contracts.read');
checks.push('Battery return Telegram text, ownership routing and API permission are wired');
console.log(JSON.stringify({ passed: checks.length, checks, realBusinessWrites: 0 }, null, 2));
