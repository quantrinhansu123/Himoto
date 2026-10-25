const assert=require('node:assert/strict'),path=require('node:path');
const{load,root}=require('./lib/load-typescript.cjs');
const{createContractDraft}=load(path.join(root,'lib/management/contract-document'));
const{parseDraftEdits}=load(path.join(root,'lib/server/contract-drafts'));
const dataset={stores:[],staff:[],customers:[],contracts:[],vehicles:[]},checks=[];
const original=createContractDraft(dataset,'all');original.contract_number='005807';
const edits=draft=>({draft,status:'draft',rental_type:'daily',notes:''});
for(const omitted of [['sales_staff_name'],['sales_staff_id','sales_staff_name']]){
  const draft=structuredClone(original);for(const key of omitted)delete draft[key];
  const parsed=parseDraftEdits(edits(draft));assert.equal(parsed.draft.contract_number,'005807');assert.deepEqual(parsed.draft,draft);
}
checks.push('Previously saved drafts and already-open forms may omit the optional sales name or both sales fields, retaining leading-zero paper numbers');
const named={...original,sales_staff_name:'NVKD QA',sales_staff_id:''};assert.deepEqual(parseDraftEdits(edits(named)).draft,named);
for(const patch of [{sales_staff_name:null},{sales_staff_name:17},{sales_staff_name:'x'.repeat(192)},{sales_staff_id:7},{sales_staff_id:'bad-id'}])assert.throws(()=>parseDraftEdits(edits({...original,...patch})));
checks.push('Explicit optional sales fields retain their names and keep strict type, ID and length validation');
for(const key of ['store_id','staff_name','start_date','end_date','total_amount']){
  const draft=structuredClone(original);delete draft[key];assert.throws(()=>parseDraftEdits(edits(draft)));
}
assert.throws(()=>parseDraftEdits({...edits(original),status:'renting'}));
checks.push('Required contract fields and draft-only workflow validation remain enforced');
console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
