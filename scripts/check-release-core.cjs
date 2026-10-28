const path=require('node:path'),{spawnSync}=require('node:child_process');
const cases=[
 'management-login','account-management-api','account-password-api','global-vehicle-access',
 'contract-autofill','contract-billing','contract-summary','contract-receipt-summary','contract-finalize','contract-payments','renewal-payment-corrections',
 'contract-overdue','contract-dates','contract-warehouses','legacy-ownership-overdue','contract-branch-flows','contract-lifecycle-api','contract-edit-api','contract-followups-api','ownership-approval','ownership-stock','ownership-terms',
 'contract-clone','contract-documents','contract-feedback','contract-photo-delete','draft-optional-sales',
 'customer-order-excel','management-data','management-loading','management-table-timeouts','contract-tabs',
 'shift-audits','vehicle-import','vehicle-documents','vehicle-registration-ocr','vehicle-rental-sources','public-failure',
 'load-performance','refund-qr','telegram-delivery','telegram-retraction-api','vehicle-transfer-telegram-api',
];
for(const name of cases){
 const result=spawnSync(process.execPath,['--require',path.join(__dirname,'lib/offline-tests.cjs'),path.join(__dirname,'check-'+name+'.cjs')],{encoding:'utf8',timeout:60000,windowsHide:true});
 if(result.status!==0){process.stderr.write(result.stdout||'');process.stderr.write(result.stderr||'');throw Error('Core release check failed: '+name);}
 console.log('PASS '+name);
}
console.log(JSON.stringify({passed_suites:cases.length,external_network_allowed:false}));
