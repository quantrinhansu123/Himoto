const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {readContractHistory}=load(path.join(root,'lib/server/contract-history'));
const checks=[];
async function main(){
  const order={id:901,created_at:'2026-10-01T00:00:00Z',actor:'QA',
    payment_corrections:[{request_id:'period',at:'2026-10-30T08:00:00Z',actor_id:143,transaction_id:51,
      reason:'QA đối chiếu kỳ thuê',affected_transaction_ids:[51,52],
      before:{method:'Tiền mặt',account:'Két QA',before_return_at:'2026-10-21T02:31:00Z',return_at:'2026-10-22T09:30:00Z',renewal_amount:900000},
      after:{method:'Tiền mặt',account:'Két QA',before_return_at:'2026-10-15T09:30:00Z',return_at:'2026-10-22T09:30:00Z',renewal_amount:1200000}},
      {request_id:'routing',at:'2026-10-29T08:00:00Z',actor_id:143,transaction_id:51,reason:'QA chọn lại tài khoản',
        before:{method:'Tiền mặt',account:'Két QA'},after:{method:'Chuyển khoản',account:'Ngân hàng QA'}}],
    historical_fee_corrections:[{request_id:'historical',at:'2026-10-30T09:00:00Z',actor_id:null,actor_kind:'technical_support',actor_name:'Hỗ trợ kỹ thuật',
      transaction_id:53,reason:'QA đã xác nhận chỉ sửa phí lịch sử',affects_contract_total:false,affects_receipts:false,
      before:{renewal_amount:900000},after:{renewal_amount:1200000}}]};
  const calls=[];
  const fake={query:async(sql,params)=>{
    calls.push(sql);assert.match(sql,/^SELECT/,'History projection must be read-only');
    if(sql.includes('AS payment_corrections'))return{rowCount:1,rows:[order]};
    return{rows:[]};
  }};
  const result=await readContractHistory(fake,901);
  const period=result.changes.find(row=>row.id==='payment-correction-period');
  assert.match(period.detail,/21\/10\/2026/);assert.match(period.detail,/15\/10\/2026/);
  assert.match(period.detail,/900.000/);assert.match(period.detail,/1.200.000/);
  assert.match(period.detail,/#51/);assert.match(period.detail,/#52/);
  assert.match(period.detail,/Giữ nguyên số tiền trên phiếu thu/);
  checks.push('Period and fee corrections expose old/new dates, old/new fees and every affected voucher without implying a new collection');
  const routing=result.changes.find(row=>row.id==='payment-correction-routing');
  assert.match(routing.detail,/Tiền mặt/);assert.match(routing.detail,/Chuyển khoản/);assert.match(routing.detail,/Ngân hàng QA/);
  assert(!routing.detail.includes('undefined'));assert(!routing.detail.includes('NaN'));
  checks.push('Earlier routing-only audit entries remain readable without fabricated period or fee amounts');
  const historical=result.changes.find(row=>row.id==='historical-fee-correction-historical');
  assert(historical);assert.equal(historical.actor,'Hỗ trợ kỹ thuật');assert.equal(historical.amount,null);
  assert.match(historical.detail,/900.000/);assert.match(historical.detail,/1.200.000/);
  assert.match(historical.detail,/Giữ nguyên tổng tiền hợp đồng/);assert.match(historical.detail,/Giữ nguyên số tiền trên phiếu thu/);
  assert(calls.some(sql=>sql.includes('AS historical_fee_corrections')));
  assert.equal(result.changes[0].id,historical.id);
  checks.push('Authorized historical fee adjustments appear separately, retain the real support actor and explicitly preserve receipts/contract totals');
  console.log(JSON.stringify({passed:checks.length,checks,permanentBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
