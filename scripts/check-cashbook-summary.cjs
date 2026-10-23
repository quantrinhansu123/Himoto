const assert = require('node:assert/strict'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { load, root } = require('./lib/load-typescript.cjs');
const { listCashbook } = load(path.join(root, 'lib/server/cashbook-list'));
const { loadCashbookPage, DEFAULT_CASHBOOK_PAGINATION } = load(path.join(root, 'lib/management/cashbook-repository'));
const { CASHBOOK_BREAKDOWN_KEYS, EMPTY_CASHBOOK_FILTERS, cashbookRentalTotals } = load(path.join(root, 'lib/management/cashbook'));
const expected = { deposit_income:46, rental_income:63, renewal_income:169, late_fee_income:40, repair_income:41, extra_income:42, other_income:0, deposit_refund_expense:153, rental_refund_expense:0, other_expense:53 };

async function main() {
  const checks = [], originalFetch = global.fetch;
  assert.deepEqual(cashbookRentalTotals({...expected,rental_refund_expense:20}),{revenue:252,income:318,expense:173});
  checks.push('Requested rental revenue/actual income/actual expense formulas include late fees and early refunds, while repair and other amounts stay separate');
  const envelope = breakdown => ({ status:'success', data:{total:19, income:{rows:[],total:15,amount:401,page:1,pageSize:5},expense:{rows:[],total:4,amount:206,page:1,pageSize:5},actors:[],breakdown} });
  try {
    global.fetch = async () => Response.json(envelope(expected));
    const result = await loadCashbookPage(EMPTY_CASHBOOK_FILTERS,'all',DEFAULT_CASHBOOK_PAGINATION,DEFAULT_CASHBOOK_PAGINATION);
    assert.deepEqual(result.breakdown,expected); assert.equal(result.income.amount-result.breakdown.deposit_income,355);
    checks.push('Summary preserves full server totals without summing the visible rows; outside-deposit income is income minus deposit, with no expense deduction');
    for (const breakdown of [{...expected,deposit_income:null},{...expected,rental_income:NaN},{...expected,deposit_refund_expense:0},{...expected,rental_income:64},{}]) {
      global.fetch = async () => Response.json(envelope(breakdown));
      await assert.rejects(() => loadCashbookPage(EMPTY_CASHBOOK_FILTERS,'all',DEFAULT_CASHBOOK_PAGINATION,DEFAULT_CASHBOOK_PAGINATION));
    }
    global.fetch = async () => Response.json(envelope(undefined));
    assert.equal((await loadCashbookPage(EMPTY_CASHBOOK_FILTERS,'all',DEFAULT_CASHBOOK_PAGINATION,DEFAULT_CASHBOOK_PAGINATION)).breakdown,undefined);
    checks.push('Malformed/non-finite and non-reconciling breakdowns fail explicitly; older responses leave detail unavailable instead of inventing zero deposits');
  } finally { global.fetch=originalFetch; }
  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
    const { ownerDatabase } = load(path.join(root,'lib/server/himoto-database'));
    const c=await ownerDatabase.connect();
    const tables=['transactions','users','cash','orders','battery_contracts','stores','banks','management_contract_payments'];
    const db={query(sql,values){const rewritten=sql.replaceAll('himoto.','pg_temp.');assert(!rewritten.includes('himoto.'));return c.query(rewritten,values);}};
    try {
      await c.query('BEGIN');
      for(const table of tables)await c.query(`CREATE TEMP TABLE ${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
      await c.query("INSERT INTO pg_temp.users(id,name) VALUES(7,'Summary QA'); INSERT INTO pg_temp.stores(id,store_name) VALUES(1,'CS QA'),(2,'Other QA'); INSERT INTO pg_temp.orders(id,contract_number) VALUES(42,'QA-SUMMARY')");
      const fixtures=[
        ['in','order:deposit',10],['addon','order:deposit:123',11],['in','order:additional_deposit',12],['in','battery:deposit',13],
        ['in','order:rental_fees',20],['in','order:payment',21],['in','battery:rental',22],
        ['in','order:renewal',30],['in','battery:renewal',31],['in','order:rental_fees',32,'only-linked'],['in','order:payment',33,'only-linked'],
        ['in','order:return_late',40],['in','order:return_repair',41],['in','order:extra',42],['addon','addon',43],
        ['out','order:deposit_refund',50],['out','order:complete:123',51],['out','battery:deposit_refund',52],['out','Other expense QA',53],
      ];
      for(let i=0;i<fixtures.length;i++) {
        const [type,name,value,note]=fixtures[i];
        await c.query("INSERT INTO pg_temp.transactions(id,type,name,value,note,user_id,store_id,order_id,status,created_at) VALUES($1,$2,$3,$4,$5,7,1,42,'approved','2026-10-21T10:00:00+07:00')",[i+1,type,name,value,note||'Summary QA']);
        if(note==='only-linked')await c.query("INSERT INTO pg_temp.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload) VALUES($1,42,$2,7,$3,$4)",[randomUUID(),i+1,'a'.repeat(64),JSON.stringify({version:2,amount:value})]);
      }
      await c.query(`INSERT INTO pg_temp.transactions(id,type,name,value,user_id,store_id,order_id,status,created_at) VALUES
        (100,'in','order:deposit',999999,7,1,42,'cancelled','2026-10-21T10:00:00+07:00'),
        (101,'in','order:renewal',999999,7,1,42,'pending','2026-10-21T10:00:00+07:00'),
        (102,'in','order:deposit',1000,7,2,42,'approved','2026-10-21T10:00:00+07:00'),
        (103,'in','order:deposit',2000,7,1,42,'approved','2026-10-20T23:59:59+07:00'),
        (104,'out','order:deposit_refund',3000,7,1,42,'approved','2026-10-22T00:00:00+07:00')`);
      const query=new URLSearchParams('store_id=1&from=2026-10-21&to=2026-10-21');
      const report=await listCashbook(query,db);
      assert.deepEqual(report.breakdown,expected); assert.equal(report.income.amount,401);assert.equal(report.expense.amount,206);
      assert.equal(report.income.total,15);assert.equal(report.expense.total,4);
      assert.equal(report.income.amount-report.breakdown.deposit_income,355);
      checks.push('TEMP PostgreSQL: all deposit formats, rental, explicit/linked renewals, fees, unknown receipts and deposit refunds reconcile; other branches/dates/unapproved vouchers are excluded');
      const second=await listCashbook(new URLSearchParams(query.toString()+'&income_page=2&income_limit=5&expense_limit=1'),db);
      assert.deepEqual(second.breakdown,expected);assert.equal(second.income.rows.length,5);assert.equal(second.expense.rows.length,1);
      const exported=await listCashbook(new URLSearchParams(query.toString()+'&mode=all'),db);
      assert.equal(exported.filter(row=>row.type!=='out').reduce((total,row)=>total+Number(row.amount),0),401);
      assert.equal(exported.filter(row=>row.type==='out').reduce((total,row)=>total+Number(row.amount),0),206);
      checks.push('Summary spans every filtered page and agrees with full export while the two tables paginate independently');
      const linked=await listCashbook(new URLSearchParams(query.toString()+'&search=only-linked'),db);
      assert.equal(linked.breakdown.renewal_income,65);assert.equal(linked.breakdown.rental_income,0);assert.equal(linked.breakdown.deposit_income,0);
      assert.equal(linked.income.amount,65);
      const empty=await listCashbook(new URLSearchParams(query.toString()+'&search=not-found'),db);
      assert.deepEqual(empty.breakdown,Object.fromEntries(CASHBOOK_BREAKDOWN_KEYS.map(key=>[key,0])));
      assert.equal(empty.income.amount,0);assert.equal(empty.expense.amount,0);
      checks.push('Keyword filters also constrain breakdown; linked renewal receipts count once and an empty result produces genuine zeros');
    } finally {await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
  }
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0},null,2));
}
main().catch(error=>{console.error(error.name,error.code||'',error.message);process.exitCode=1;});
