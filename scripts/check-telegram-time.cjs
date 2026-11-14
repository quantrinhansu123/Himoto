const assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {load,root}=require('./lib/load-typescript.cjs');
const time=load(path.join(root,'lib/server/telegram-time'));
const content=load(path.join(root,'lib/server/contract-notification-content'));
const checks=[];
const expected='2026-07-21T11:45:58.123Z';
for(const input of ['2026-07-21T18:45:58.123','2026-07-21 18:45:58.123456','2026-07-21T18:45:58.123+07:00','2026-07-21T18:45:58.123+0700',expected,new Date(expected)])assert.equal(time.telegramTimestamp(input),expected);
assert.equal(time.telegramTimestamp('2026-11-07T18:45'),'2026-11-07T11:45:00.000Z');
assert.equal(time.telegramTimestamp('2026-11-07'),'2026-11-06T17:00:00.000Z');
assert.equal(time.telegramTimestamp('2026-11-07T06:45:00-05:00'),'2026-11-07T11:45:00.000Z');
checks.push('Minute, second, fractional, UTC, explicit offsets, Date and date-only inputs preserve their intended instant');
for(const input of [null,undefined,'','bad','2026-02-29T12:00','2026-02-31','2026-13-01','2026-11-07T24:01','2026-11-07T12:60','2026-11-07T12:00:60','2026-11-07T12:00+24:00','2026-11-07T12:00+07:60','2026-07-21T18:45:58:00+07:00',new Date(NaN)]){
 assert.equal(time.telegramTimestamp(input),null);assert.throws(()=>time.requireTelegramTimestamp(input),time.TelegramPreparationError);
}
assert.equal(time.telegramTimestamp('2024-02-29T12:00'),'2024-02-29T05:00:00.000Z');
checks.push('Invalid calendars, clocks, offsets and duplicated seconds fail with a controlled preparation error');
const code=`const{load,root}=require('./scripts/lib/load-typescript.cjs');process.stdout.write(load(require('node:path').join(root,'lib/server/telegram-time')).telegramTimestamp('2026-07-21T18:45:58.123'));`;
for(const zone of ['UTC','Asia/Ho_Chi_Minh','America/New_York']){
 const run=spawnSync(process.execPath,['-e',code],{cwd:path.resolve(__dirname,'..'),env:{...process.env,TZ:zone},encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,expected);
}
checks.push('Local business time has the same instant on UTC, Vietnam and New York servers');
const renewal={version:12,amount:400000,before_return_at:'2026-11-07T18:45:00',return_at:'2026-11-09T18:45:00',license:'QA-101',vehicle_name:'Vision'};
assert(content.sameRenewalPeriod(renewal,{...renewal,before_return_at:'2026-11-07T11:45:00Z',return_at:'2026-11-09T18:45:00+07:00'}));
assert(!content.sameRenewalPeriod(renewal,{...renewal,return_at:'2026-11-10T18:45:00+07:00'}));
assert(!content.sameRenewalPeriod(renewal,{...renewal,return_at:'2026-02-31T18:45:00'}));
assert(!content.sameRenewalPeriod({created_at:'2026-11-07T18:45'},{created_at:'2026-11-07T18:45+07:00'}));
checks.push('Receipt matching recognises equivalent instants and still rejects another or an undefined renewal period');
const fixture={code:'QA-TIME',customer:'Fixture',phone:'',store:'Fixture',actor:'Fixture',vehicles:'QA-101',vehicle_names:'Vision',total:'400000',at:'2026-11-13T18:45:58',photos:[],
 renewal,deposit:100000,refunded:100000,rental_fee:400000,days:2,grand_total:500000,
 rental_correction:{request_id:'fixture',start_at:'2026-07-21T18:45:58',end_at:'2026-11-09T18:45:00'},
 return_details:{note:'',returned_at:['2026-11-09T18:45:58']},battery_details:{starts_at:'2026-11-07T18:45:00',ends_at:'2026-11-09T18:45:00',package_name:'Fixture',amount:400000,collected:400000,remaining:0,note:''},
 battery_swap:{percentage:10,fee:10000,collected:10000,license:'QA-101',vehicle_name:'Vision'},vehicle_swap:{from_license:'QA-101',from_name:'Vision',to_license:'QA-102',to_name:'Wave'},transfer:{from:'A',to:'B',note:'',received:false,ownership:false}};
const before=JSON.stringify(fixture),hash=content.notificationHash('renewal',fixture);
for(const kind of ['rental','reservation','handover','renewal','return','battery_swap','vehicle_swap','vehicle_transfer','vehicle_receive','battery_rental','battery_renewal','battery_return']){
 const text=content.contractNotificationText(kind,fixture);assert(!/Invalid Date|NaN/.test(text),kind);assert(text.endsWith(`Thời gian: ${new Date('2026-11-13T11:45:58Z').toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`),kind);
}
assert(content.contractNotificationText('renewal',fixture).includes('07/11/2026 18:45 - 09/11/2026 18:45 (2 ngày)'));
assert.equal(JSON.stringify(fixture),before);assert.equal(content.notificationHash('renewal',fixture),hash);
checks.push('All twelve contract, vehicle and battery templates use Vietnam clocks without mutating stored snapshots or hashes');
for(const changed of [{at:'bad'},{renewal:{...renewal,return_at:'2026-02-31'}},{renewal:{...renewal,amount:null}}])assert.throws(()=>content.contractNotificationText('renewal',{...fixture,...changed}),time.TelegramPreparationError);
assert.throws(()=>content.notificationPaymentAmounts([{method:'Cash',value:'invalid'}]),time.TelegramPreparationError);
checks.push('Invalid dates or money block preparation instead of emitting invalid text or silently changing amounts');
console.log(JSON.stringify({passed:checks.length,checks,realTelegramRequests:0,operationalWrites:0},null,2));
