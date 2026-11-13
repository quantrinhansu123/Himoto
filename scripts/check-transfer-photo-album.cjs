require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load,root} = require('./lib/load-typescript.cjs');
const {readVehicleTransferTelegram} = load(path.join(root,'lib/server/vehicle-transfer-telegram'));
const dto = load(path.resolve(root,'../shared/mobile-record-media'));
(async()=>{
  const results=[];
  for(const received of [false,true]){
    const event=76,vehicle=901,kind=received?'receive':'transfer';
    const slots=Array.from({length:25},(_,i)=>`${kind}-${event}-1${i?'-extra-'+(i+1):''}`);
    assert(slots.every(slot=>dto.isMobileMediaSlot({entity:'vehicles',id:vehicle,kind,referenceId:event},slot)));
    const db={query:async(sql,args)=>{
      if(sql.includes('FROM himoto.vehicle_location_events e'))return{rows:[{id:event,event_type:received?'manual_transfer_receive':'manual_transfer',from_store_id:23,to_store_id:32,from_kind:'physical',to_kind:'physical',from_name:'QA A',to_name:'QA B',license:'QA-001',vehicle_name:'QA vehicle',actor:'QA',created_by:7,at:'2026-11-13T00:00:00Z',notes:'',ownership:false}]};
      if(sql.includes('FROM himoto.management_record_photos'))return{rows:slots.filter(slot=>new RegExp(args[1]).test(slot)).map(slot=>({slot,mime_type:'image/jpeg',bytes:'AA=='}))};
      if(sql.includes('FROM himoto.management_contract_notifications'))return{rows:[]};
      throw Error('Unexpected fixture query');
    }};
    const result=await readVehicleTransferTelegram(db,vehicle,event,{id:7,name:'QA',access_role:'admin',scope_all:true});
    const included=result.payload.photos.map(photo=>photo.slot),missing=slots.filter(slot=>!included.includes(slot));
    assert.equal(included.length,25);
    assert.equal(missing.length,0);
    results.push({kind,savedValidPhotos:25,includedInTelegram:included.length,missing});
  }
  const report={outcome:'PASSED',results,businessWrites:0,providerCalls:0};

  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
