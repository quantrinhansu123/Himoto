const assert=require('node:assert/strict'),path=require('path');
const {load,root}=require('./lib/load-typescript.cjs');
const {failureReason,failureStatus,publicFailure}=load(path.join(root,'lib/server/public-failure'));

const pg=(code,message,extra={})=>Object.assign(new Error(message),{code,...extra});
assert.match(publicFailure('Không lưu chính thức được hợp đồng.',pg('23505','duplicate key value violates unique constraint "orders_pkey"',{detail:'Key (id)=(1) already exists.',constraint:'orders_pkey',table:'orders'})),
  /Nguyên nhân:.*trùng/);
assert.equal(failureStatus(pg('23505','duplicate key')),409);
assert.match(publicFailure('Không lưu chính thức được hợp đồng.',pg('42501','new row violates row-level security policy for table "orders"')),
  /phạm vi cơ sở/);
assert.match(publicFailure('Chưa ghi nhận được lần trả xe.',pg('42501','rental line unavailable')),
  /Dòng thuê xe không còn mở/);
assert.equal(failureStatus(pg('57014','canceling statement due to statement timeout')),504);
assert.match(publicFailure('Không lưu được bản nháp.',Object.assign(new Error('Bản nháp đã thay đổi. Tải lại trước khi lưu.'),{status:409})),
  /Bản nháp đã thay đổi/);
assert.doesNotMatch(publicFailure('Không lưu được.',new Error('private database error')),/private database error/);
assert.doesNotMatch(publicFailure('Không lưu được.',pg('23505','duplicate key',{detail:'private row value',hint:'internal SQL',constraint:'private_constraint',table:'private_table'})),/private|internal SQL/);
assert.doesNotMatch(publicFailure('Không xóa được.',pg('23503','violates foreign key constraint',{detail:'password=supersecret postgres://user:'+'pass@host/db'})),
  /supersecret|postgres:\/\//);
assert.match(failureReason({}),/Vui lòng thử lại/);
assert.match(publicFailure('Không lưu chính thức được hợp đồng.',{code:'42883',message:'function himoto.vehicle_window_conflicts(bigint[],bigint,timestamp with time zone,timestamp with time zone) does not exist'}),
  /Thiếu hàm trên database/);
console.log(JSON.stringify({passed:true,sample:publicFailure('Không lưu chính thức được hợp đồng.',pg('42501','new row violates row-level security policy for table "orders"'))}));
