const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
module.exports=async function({pg,raw,load,root,user,admin}){
  const stores=load(path.join(root,'lib/server/mobile-stores')),org=load(path.join(root,'lib/server/mobile-staff-organization'));
  const storeShape=load(path.resolve('shared/mobile-store-contracts')),orgShape=load(path.resolve('shared/mobile-staff-organization'));
  const helper=load(path.resolve('shared/staff-organization'));
  const checks=[],actor={...user,permissions:['contracts.read','hr.read']},manager={...admin,permissions:['contracts.read','hr.read']};
  await pg.exec(`ALTER TABLE himoto.staff_profiles ADD COLUMN staff_code text,ADD COLUMN phone text,ADD COLUMN email text,ADD COLUMN position text,ADD COLUMN status text;
    INSERT INTO himoto.staff_profiles(id,store_id,full_name,staff_code,position,status) VALUES
    (101,23,'Hà Nội QA','NV101','NVKD','active'),(102,24,'TLS Kiêm nhiệm QA','NV102','TLS / NVKD / PKD 2','active'),
    (103,23,'Đã nghỉ QA','NV103','KT','leave'),(104,NULL,'Trụ sở QA','NV104','HCNS','inactive'),(105,NULL,'Tự nhập QA','NV105','Chức vụ riêng','active');
    ALTER TABLE himoto.staff_profiles ENABLE ROW LEVEL SECURITY;CREATE POLICY scoped_staff ON himoto.staff_profiles TO himoto_scoped USING(himoto.access_store(store_id));
    ALTER TABLE himoto.stores ENABLE ROW LEVEL SECURITY;CREATE POLICY scoped_stores ON himoto.stores TO himoto_scoped USING(himoto.access_store(id));
    GRANT SELECT ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;`);
  const protectedState=async()=>JSON.stringify((await pg.query(`SELECT (SELECT jsonb_agg(o ORDER BY id) FROM himoto.orders o) AS orders,
    (SELECT jsonb_agg(v ORDER BY id) FROM himoto.vehicles v) AS vehicles,(SELECT jsonb_agg(t ORDER BY id) FROM himoto.transactions t) AS transactions,
    (SELECT jsonb_agg(r ORDER BY id) FROM himoto.staff_profiles r) AS staff,(SELECT jsonb_agg(r ORDER BY id) FROM himoto.stores r) AS stores`)).rows);
  const before=await protectedState();
  const all=await stores.readMobileStoreContracts(actor,'23',new URLSearchParams());assert(storeShape.isMobileStoreContracts(all));
  assert.equal(all.summary.count,4);assert(!all.rows.some(r=>[9302,9304].includes(r.id)));assert(all.rows.some(r=>r.id===9303),'Ended contracts remain in store detail');
  const narrow=await stores.readMobileStoreContracts(actor,'23',new URLSearchParams('search=EDIT9301&page=999'));
  assert.equal(narrow.total,1);assert.equal(narrow.page,1);assert.deepEqual(narrow.summary,all.summary);
  assert.equal(narrow.rows[0].total,200000);assert.equal(narrow.rows[0].paid,50000,'Deposit is not rental paid');
  await assert.rejects(()=>stores.readMobileStoreContracts(actor,'24',new URLSearchParams()),e=>e.status===404);
  await assert.rejects(()=>stores.readMobileStoreContracts({...actor,permissions:['hr.read']},'23',new URLSearchParams()),e=>e.status===403);
  checks.push('Actual scoped web contract source excludes drafts, retains completed history, keeps rental/deposit totals separate and store summary unchanged by local search; foreign branch/permission denied');
  // More than one page: stable exact IDs, no hidden/draft contracts in either page.
  // Use explicit columns so fixture schema extensions cannot alter insert order.
  await pg.exec(`INSERT INTO himoto.orders(id,store_id,customer_id,order_status,order_type,contract_number,total,total_rental_fees,pid,rent_at,return_at,draft_payload)
    SELECT n,23,1,'completed','daily','DIR'||n,1000,1000,0,'2026-10-01T08:00+07','2026-10-03T08:00+07','{}'::jsonb FROM generate_series(9400,9425)n`);
  const page1=await stores.readMobileStoreContracts(actor,'23',new URLSearchParams('page=1')),page2=await stores.readMobileStoreContracts(actor,'23',new URLSearchParams('page=2'));
  assert.equal(page1.rows.length,25);assert.equal(page2.rows.length,5);assert.equal(new Set([...page1.rows,...page2.rows].map(r=>r.id)).size,30);
  await pg.exec('DELETE FROM himoto.orders WHERE id BETWEEN 9400 AND 9425');checks.push('Store contract pagination clamps out-of-range pages and traverses all 30 visible contracts without duplicate or skipped IDs');
  const company=await org.readMobileStaffOrganization(manager,new URLSearchParams('store=23'));
  assert(orgShape.isMobileStaffOrganization(company));assert.equal(company.total,2);assert(company.sections.some(s=>s.key==='department:TLS'&&s.people.some(p=>p.id===102)));
  const scoped=await org.readMobileStaffOrganization(actor,new URLSearchParams('store=23'));assert.equal(scoped.total,1);assert(!JSON.stringify(scoped).includes('TLS Kiêm nhiệm'),'Company TLS rule cannot expose rows hidden by database RLS');
  const departed=await org.readMobileStaffOrganization(actor,new URLSearchParams('store=23&search=da%20nghi'));assert.equal(departed.total,1);assert.equal(departed.sections.find(s=>s.kind==='store').people[0].id,103);
  const whole=await org.readMobileStaffOrganization(manager,new URLSearchParams('departed=1'));assert.equal(whole.total,5);assert.equal(whole.working,3);assert(whole.sections.some(s=>s.kind==='unassigned'&&s.people.some(p=>p.id===105)));
  const dual=whole.sections.filter(s=>s.people.some(p=>p.id===102));assert.equal(dual.length,2,'TLS / NVKD belongs in TLS and branch; count is unique');
  const rawPeople=(await raw.query('SELECT id,full_name AS name,staff_code AS code,position,status,store_id FROM himoto.staff_profiles ORDER BY id DESC')).rows;
  const pure=helper.buildStaffOrganization(rawPeople,[{id:23,name:'Cơ sở QA'},{id:24,name:'Kho QA khác'}],'all',true,'');assert.equal(pure.shown.length,whole.total);
  await assert.rejects(()=>org.readMobileStaffOrganization({...actor,permissions:['contracts.read']},new URLSearchParams()),e=>e.status===403);
  await assert.rejects(()=>org.readMobileStaffOrganization(actor,new URLSearchParams('store=24')),e=>e.status===404);
  await assert.rejects(()=>org.readMobileStaffOrganization(actor,new URLSearchParams('departed=yes')),e=>e.status===400);
  checks.push('Shared web chart semantics retain company TLS within visible rows, duplicate role placement with unique totals, departed search, custom/unassigned roles, and strict current RLS/permission/filter scope');
  assert.equal(await protectedState(),before);
  const out=process.argv.indexOf('--directory-fixture-output');if(out>=0){const file=path.resolve(process.argv[out+1]);assert(file.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(file));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({fixtureOnly:true,storeContracts:all,storeSearch:narrow,organization:whole,organizationStore:company,organizationSearch:departed},null,2));}
  console.log(JSON.stringify({passed:checks.length,checks,operationalWrites:0,database:'isolated PGlite; actual scoped queries; no staging/native acceptance'},null,2));
  return {passed:checks.length};
};
